import asyncio
import logging
import time
import os
from dotenv import load_dotenv

from hardware import get_hardware
from database import SQLiteClient
from mqtt import MQTTClient
from ph_controller import PhController

logger = logging.getLogger(__name__)


class ReactorController:
    # ── Compartment IDs ────────────────────────────────────────────────────
    COMPARTMENTS = [1, 2, 3]

    # ── Timing constants ───────────────────────────────────────────────────
    CYCLE_INTERVAL_SEC = 1       # Main control-loop period
    RECOVERY_SLEEP_SEC = 5       # Sleep after an unhandled loop error

    # ── Dosing defaults (used when experiment config is absent) ────────────
    DEFAULT_DOSE_STEPS = 50
    DEFAULT_MAX_PUMP_SEC = 30
    DEFAULT_COOLDOWN_SEC = 10

    def __init__(self):
        # 1. Hardware Abstraction Layer
        self.hw = get_hardware()

        # 2. Database
        db_path = os.getenv("SQLITE_DB_PATH", "reactor.db")
        self.sqlite = SQLiteClient(db_path=db_path)

        # 3. MQTT
        mqtt_url = os.getenv("MQTT_BROKER_URL", "localhost")
        mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
        self.mqtt = MQTTClient(broker_url=mqtt_url, port=mqtt_port)
        self.mqtt.on_manual_control = self.handle_manual_control
        self.mqtt.on_auto_update = self.handle_auto_update
        self.mqtt.on_experiment_config = self.handle_experiment_config
        self.mqtt.on_calibration_control = self.handle_calibration_control

        # 4. System state
        self.running = False
        self.active_experiment = None
        self.ph_ctrl = PhController(self.sqlite.get_latest_calibrations())
        self.calibration_mode_compartment = None
        self.last_dose_time = {c: 0.0 for c in self.COMPARTMENTS}
        self.last_measurement_time = 0.0

    # ── Event helpers ──────────────────────────────────────────────────────

    async def _log_event(self, level: str, message: str, compartment: int = None):
        """Broadcast an event via MQTT and persist it to the DB if an experiment is active."""
        self.mqtt.publish_event(level, message, compartment)
        if self.active_experiment:
            await asyncio.to_thread(
                self.sqlite.log_event,
                self.active_experiment["id"], level, message, compartment
            )

    # ── MQTT command handlers ──────────────────────────────────────────────

    async def handle_calibration_control(self, payload: dict):
        """Handle calibration mode commands and post-save calibration reloads."""
        action = payload.get("action")
        command = payload.get("command")

        if action == "reload_calibration":
            logger.info("Reloading calibrations from DB...")
            self.ph_ctrl.reload(self.sqlite.get_latest_calibrations())

        if command == "start":
            self.calibration_mode_compartment = payload.get("compartment")
            logger.info(f"Entered calibration mode for compartment {self.calibration_mode_compartment}")
        elif command == "stop":
            self.calibration_mode_compartment = None
            logger.info("Exited calibration mode")

    async def handle_experiment_config(self, payload: dict):
        """Reload the active experiment when its config changes."""
        logger.info("Experiment config update received via MQTT. Applying dynamically.")
        # Only reload if the update targets the currently active experiment
        if self.active_experiment and self.active_experiment["id"] == payload.get("experiment_id"):
            self.active_experiment = self.sqlite.get_active_experiment()

    async def handle_manual_control(self, payload: dict):
        """Execute a manual pump dose requested from the frontend."""
        pump_id = payload.get("pump_id")
        direction = payload.get("direction", "forward")
        default_steps = (
            self.active_experiment.get("manual_dose_steps", self.DEFAULT_DOSE_STEPS)
            if self.active_experiment else self.DEFAULT_DOSE_STEPS
        )
        steps = payload.get("steps", default_steps)

        if pump_id not in self.hw.pumps:
            logger.warning(f"Manual control: pump_id {pump_id!r} not found in hardware — ignoring.")
            return

        pump = self.hw.pumps[pump_id]
        max_time = (
            self.active_experiment.get("max_pump_time_sec", self.DEFAULT_MAX_PUMP_SEC)
            if self.active_experiment else self.DEFAULT_MAX_PUMP_SEC
        )

        logger.info(f"Manual override: dosing pump {pump_id} — {steps} steps {direction}")
        await self._log_event("INFO", f"Manual override: pump {pump_id} activated for {steps} steps ({direction})", pump_id)
        try:
            await asyncio.to_thread(pump.dose, direction, steps, max_time)
        except Exception as exc:
            logger.error(f"Manual dose failed: {exc}")
            await self._log_event("ERROR", f"Manual pump safety cutoff triggered: {exc}", pump_id)

    async def handle_auto_update(self, payload: dict):
        """Reload the active experiment after an automated threshold update."""
        logger.info("Auto update triggered from MQTT. Reloading active experiment.")
        self.active_experiment = self.sqlite.get_active_experiment()

    # ── Dosing logic ───────────────────────────────────────────────────────

    async def _dose_if_needed(self, compartment_id: int, current_ph: float):
        """Dose base into a compartment if pH has dropped below the configured threshold."""
        if not self.active_experiment:
            return

        target_min = self.active_experiment.get(f"c{compartment_id}_min_ph")
        if target_min is None:
            return

        cooldown = self.active_experiment.get("mixing_cooldown_sec", self.DEFAULT_COOLDOWN_SEC)
        if time.time() - self.last_dose_time[compartment_id] < cooldown:
            return  # Still within cooldown window

        if current_ph >= target_min:
            return  # pH is within range — no dose required

        pump_id = compartment_id  # 1:1 mapping: compartment ↔ pump
        if pump_id not in self.hw.pumps:
            logger.warning(f"Auto dosing: no pump found for compartment {compartment_id}")
            return

        pump = self.hw.pumps[pump_id]
        steps = self.DEFAULT_DOSE_STEPS
        max_time = self.active_experiment.get("max_pump_time_sec", self.DEFAULT_MAX_PUMP_SEC)

        logger.info(f"Auto dosing: compartment {compartment_id} pH ({current_ph}) < {target_min}. Dosing {steps} steps.")
        await self._log_event("INFO", f"Auto dosing: pH {current_ph} < {target_min}. Pump activated.", compartment_id)
        try:
            await asyncio.to_thread(pump.dose, "forward", steps, max_time)
            # Record dose time only after a confirmed successful dose
            self.last_dose_time[compartment_id] = time.time()
        except Exception as exc:
            logger.error(f"Auto dose failed: {exc}")
            await self._log_event("ERROR", f"Auto pump safety cutoff triggered: {exc}", pump_id)

    # ── Run-loop helpers ───────────────────────────────────────────────────

    async def _read_sensors(self) -> dict:
        """Read voltage from all compartments, convert to pH, and stream calibration data."""
        ph_data = {}
        for compartment_id in self.COMPARTMENTS:
            try:
                voltage = await asyncio.to_thread(self.hw.adc.read_voltage, compartment_id)
                ph_data[compartment_id] = self.ph_ctrl.voltage_to_ph(compartment_id, voltage)

                if self.calibration_mode_compartment == compartment_id:
                    self.mqtt.publish_raw_voltage({"raw_voltage": voltage})
            except Exception as exc:
                logger.error(f"Error reading sensor for compartment {compartment_id}: {exc}")
                await self._log_event("ERROR", f"Failed to read sensor: {exc}", compartment_id)
        return ph_data

    async def _run_dosing(self, ph_data: dict):
        """Run auto-dosing logic for every compartment based on the latest pH readings."""
        for compartment_id, ph_val in ph_data.items():
            await self._dose_if_needed(compartment_id, ph_val)

    async def _log_telemetry(self, ph_data: dict):
        """Persist a telemetry snapshot to SQLite when the logging interval has elapsed."""
        if not self.active_experiment:
            return
        interval_mins = self.active_experiment.get("measurement_interval_mins", 1)
        if time.time() - self.last_measurement_time >= interval_mins * 60:
            await asyncio.to_thread(
                self.sqlite.log_telemetry,
                self.active_experiment["id"],
                ph_data
            )
            self.mqtt.publish_logged_telemetry(ph_data)
            self.last_measurement_time = time.time()

    def _publish(self, ph_data: dict):
        """Publish real-time telemetry and system status via MQTT."""
        self.mqtt.publish_telemetry(ph_data)
        self.mqtt.publish_status({
            "health": "ok",
            "active_experiment": self.active_experiment["id"] if self.active_experiment else None,
            "db_connected": True,
        })

    # ── Main control loop ──────────────────────────────────────────────────

    async def run_loop(self):
        self.running = True
        self.mqtt.connect()
        # Give the paho background thread time to complete the TCP handshake
        # before publishing retained status, which requires a live connection.
        await asyncio.sleep(1)
        self.mqtt.publish_server_online()
        logger.info("Starting main reactor control loop...")

        while self.running:
            try:
                self.active_experiment = self.sqlite.get_active_experiment()

                ph_data = await self._read_sensors()
                await self._run_dosing(ph_data)
                await self._log_telemetry(ph_data)
                self._publish(ph_data)

                await asyncio.sleep(self.CYCLE_INTERVAL_SEC)
            except Exception as exc:
                logger.error(f"Unhandled error in main loop: {exc}")
                await asyncio.sleep(self.RECOVERY_SLEEP_SEC)

    def stop(self):
        self.running = False
        self.mqtt.publish_server_offline()
        self.mqtt.disconnect()
        logger.info("Reactor controller stopped.")


# ── Entry point ────────────────────────────────────────────────────────────

async def main():
    # Configure logging and environment only when run as the entry point
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    controller = ReactorController()
    try:
        await controller.run_loop()
    finally:
        # Guaranteed cleanup on normal exit, KeyboardInterrupt, or any unhandled exception
        controller.stop()


if __name__ == "__main__":
    asyncio.run(main())
