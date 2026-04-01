import asyncio
import logging
import time
import os
from dotenv import load_dotenv

from hardware import get_hardware
from database import SQLiteClient
from mqtt.client import MQTTClient
from ph_controller import PhController
from config.pump_helpers import PumpConfigManager

from core.state_manager import ReactorState
from managers.sensor_manager import SensorManager
from managers.dosing_manager import DosingManager
from managers.mqtt_handler import MQTTCommandHandler

logger = logging.getLogger(__name__)

class ReactorController:
    # ── Timing constants ───────────────────────────────────────────────────
    CYCLE_INTERVAL_SEC = 1       # Main control-loop period
    RECOVERY_SLEEP_SEC = 5       # Sleep after an unhandled loop error

    def __init__(self):
        # 1. State Store
        self.state = ReactorState()

        # 2. Hardware Abstraction Layer
        self.hw = get_hardware()

        # 3. Database Layer
        db_path = os.getenv("SQLITE_DB_PATH", "reactor.db")
        self.sqlite = SQLiteClient(db_path=db_path)

        # 4. Independent Config/Math Planners
        self.pump_config_manager = PumpConfigManager()
        self.ph_ctrl = PhController(self.sqlite.get_latest_calibrations())

        # 5. Infrastructure (MQTT)
        mqtt_url = os.getenv("MQTT_BROKER_URL", "localhost")
        mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
        self.mqtt = MQTTClient(broker_url=mqtt_url, port=mqtt_port)

        # 6. Specific Business Logic Managers
        self.sensor_manager = SensorManager(
            hw=self.hw,
            state=self.state,
            ph_ctrl=self.ph_ctrl,
            log_event_callback=self._log_event,
            mqtt_client=self.mqtt
        )

        self.dosing_manager = DosingManager(
            hw=self.hw,
            state=self.state,
            pump_config_manager=self.pump_config_manager,
            ph_ctrl=self.ph_ctrl,
            log_event_callback=self._log_event,
            mqtt_client=self.mqtt
        )

        # 7. Hook up network boundary handlers
        self.mqtt_handler = MQTTCommandHandler(self)
        self.mqtt_handler.register_callbacks(self.mqtt)


    # ── Handlers for MQTT Subsystems ────────────────────────────────────────

    async def _log_event(self, level: str, message: str, compartment: int = None):
        """Broadcast an event via MQTT and persist it to the DB if an experiment is active."""
        self.mqtt.publish_event(level, message, compartment)
        if self.state.active_experiment:
            await asyncio.to_thread(
                self.sqlite.log_event,
                self.state.active_experiment["id"], level, message, compartment
            )

    def reload_calibrations(self):
        logger.info("Reloading calibrations from DB...")
        self.ph_ctrl.reload(self.sqlite.get_latest_calibrations())

    def reload_active_experiment(self):
        self.state.active_experiment = self.sqlite.get_active_experiment()

    def send_initial_state_to_frontend(self):
        """Respond to a colosh/request_status ping by compiling and publishing full state."""
        try:
            logger.info("Compiling full state response for colosh/request_status...")
            response = {
                "health": "ok",
                "active_experiment": self.state.active_experiment["id"] if self.state.active_experiment else None,
                "db_connected": self.sqlite is not None,
                "ph_data": self.state.latest_safe_ph,
                "experiment_config": self.state.active_experiment
            }
            self.mqtt.publish_compiled_status(response)
        except Exception as e:
            logger.error(f"Failed to handle status request: {e}")

    # ── System Telemetry Loggers ───────────────────────────────────────────

    async def _log_telemetry(self, sensor_data: dict):
        """Persist a telemetry snapshot to SQLite using the mean of the DAQ bucket."""
        if not self.state.active_experiment:
            return
        
        interval_mins = self.state.active_experiment.get("measurement_interval_mins", 1)
        if time.time() - self.state.last_measurement_time >= interval_mins * 60:
            # Calculate mean for each bucket
            ph_averages = {}
            for c in self.state.COMPARTMENTS:
                bucket = self.state.telemetry_buckets[c]
                if bucket:
                    avg_val = round(sum(bucket) / len(bucket), 2)
                    ph_averages[c] = avg_val
                    bucket.clear()
                else:
                    ph_averages[c] = None

            await asyncio.to_thread(
                self.sqlite.log_telemetry,
                self.state.active_experiment["id"],
                ph_averages
            )
            self.mqtt.publish_logged_telemetry(ph_averages)
            self.state.last_measurement_time = time.time()

    def _publish(self, sensor_data: dict):
        """Publish real-time telemetry and system validation signals via MQTT."""
        self.mqtt.publish_telemetry(sensor_data)
        self.mqtt.publish_status({
            "health": "ok",
            "active_experiment": self.state.active_experiment["id"] if self.state.active_experiment else None,
            "db_connected": True,
        })


    # ── Entry Point Main Orchestrator Loop ──────────────────────────────────

    async def run_loop(self):
        self.state.running = True
        self.mqtt.connect()
        await asyncio.sleep(1) # Paho TCP handshake latency
        self.mqtt.publish_server_online()
        logger.info("Starting orchestrated Reactor control loop...")

        loop_last_experiment_id = None

        while self.state.running:
            try:
                # Active configuration syncing
                current_exp = self.sqlite.get_active_experiment()
                self.state.active_experiment = current_exp
                current_exp_id = current_exp["id"] if current_exp else None

                if current_exp_id:
                    if loop_last_experiment_id != current_exp_id:
                        logger.info("New experiment started. Resetting telemetry clock.")
                        self.state.last_measurement_time = 0.0
                elif loop_last_experiment_id is not None:
                    logger.info("Experiment stopped. Halting all actively running doses and primes.")
                    for c in self.state.COMPARTMENTS:
                        self.dosing_manager.stop_manual_dose(c)

                    for p in self.hw.pumps.values():
                        if hasattr(p, "stop_dose"): p.stop_dose()
                        if hasattr(p, "stop_prime"): p.stop_prime()

                loop_last_experiment_id = current_exp_id

                # Component Pipeline Orchestration
                sensor_data = await self.sensor_manager.read_and_process()
                await self.dosing_manager.evaluate_and_dose(sensor_data)
                
                await self._log_telemetry(sensor_data)
                self._publish(sensor_data)

                await asyncio.sleep(self.CYCLE_INTERVAL_SEC)
            except Exception as exc:
                logger.error(f"Unhandled error in main loop: {exc}")
                await asyncio.sleep(self.RECOVERY_SLEEP_SEC)

    def stop(self):
        self.state.running = False
        logger.info("Shutting down. Halting all pumps...")
        for p in self.hw.pumps.values():
            if hasattr(p, "stop_dose"): p.stop_dose()
            if hasattr(p, "stop_prime"): p.stop_prime()
        self.mqtt.publish_server_offline()
        self.mqtt.disconnect()
        logger.info("Reactor controller stopped.")


def main_sync():
    # Helper scope to protect asyncio context
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    controller = ReactorController()
    try:
        asyncio.run(controller.run_loop())
    except KeyboardInterrupt:
        pass
    finally:
        controller.stop()

if __name__ == "__main__":
    main_sync()
