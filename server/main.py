import asyncio
import logging
import time
import json
import os
from dotenv import load_dotenv

from hardware import get_hardware
from database import SQLiteClient
from mqtt import MQTTClient

# Load the .env config overrides
load_dotenv()

# Setup basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("MAIN")

class ReactorController:
    def __init__(self):
        # 1. Initialize Hardware Abstraction Layer
        self.hw = get_hardware()
        
        # 2. Initialize DBs
        db_path = os.getenv("SQLITE_DB_PATH", "reactor.db")
        self.sqlite = SQLiteClient(db_path=db_path)
        
        # 3. Initialize MQTT
        mqtt_url = os.getenv("MQTT_BROKER_URL", "localhost")
        mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
        self.mqtt = MQTTClient(broker_url=mqtt_url, port=mqtt_port)
        self.mqtt.on_manual_control = self.handle_manual_control
        self.mqtt.on_auto_update = self.handle_auto_update
        self.mqtt.on_experiment_config = self.handle_experiment_config

        # System state
        self.running = False
        self.active_experiment = None
        self.last_dose_time = {1: 0, 2: 0, 3: 0}

    async def log_experiment_event(self, level: str, message: str, compartment: int = None):
        """Log event to DB and broadcast via MQTT."""
        self.mqtt.publish_event(level, message, compartment)
        if self.active_experiment:
            await asyncio.to_thread(self.sqlite.log_event, self.active_experiment['id'], level, message, compartment)

    async def handle_experiment_config(self, payload: dict):
        """Handle live configuration updates routed from MQTT."""
        logger.info("Experiment config update received via MQTT. Applying dynamically.")
        if not self.active_experiment or self.active_experiment['id'] == payload.get('experiment_id'):
            self.active_experiment = self.sqlite.get_active_experiment()

    async def handle_manual_control(self, payload: dict):
        """Handle manual pump commands from MQTT."""
        pump_id = payload.get("pump_id")
        direction = payload.get("direction", "forward")
        steps = payload.get("steps", self.active_experiment.get("manual_dose_steps", 50) if self.active_experiment else 50)
        
        if pump_id in self.hw.pumps:
            logger.info(f"Manual Override: Dosing pump {pump_id} {steps} steps {direction}")
            await self.log_experiment_event("INFO", f"Manual Override: Pump {pump_id} activated for {steps} steps ({direction})", pump_id)
            pump = self.hw.pumps[pump_id]
            max_time = self.active_experiment.get("max_pump_time_sec", 30) if self.active_experiment else 30
            # Offload blocking hardware call to thread
            try:
                await asyncio.to_thread(pump.dose, direction, steps, max_time)
            except Exception as e:
                logger.error(f"Manual dose failed: {e}")
                await self.log_experiment_event("ERROR", f"Manual pump safety cutoff triggered: {e}", pump_id)

    async def handle_auto_update(self, payload: dict):
        """Update active experiment thresholds based on frontend config."""
        # For simplicity, we just reload the active experiment from SQLite
        logger.info("Auto Update triggered from MQTT. Reloading active experiment.")
        self.active_experiment = self.sqlite.get_active_experiment()

    async def dosing_logic(self, compartment_id: int, current_ph: float):
        """Check pH and dose base if needed."""
        if not self.active_experiment:
            return

        target_min = self.active_experiment.get(f'c{compartment_id}_min_ph')
        if target_min is None:
            return

        cooldown = self.active_experiment.get('mixing_cooldown_sec', 10)
        
        # Check cooldown
        if time.time() - self.last_dose_time[compartment_id] < cooldown:
            return

        # Assuming pumps dispense BASE (which raises pH).
        # If pH drops below minimum threshold -> add base.
        if current_ph < target_min:
            pump_id = compartment_id  # 1:1 mapping between compartment and pump
            steps = 50  # We can standardise or calculate this. Using 50 for now.
            direction = "forward"
            
            if pump_id in self.hw.pumps:
                pump = self.hw.pumps[pump_id]
                logger.info(f"Auto Dosing: Compartment {compartment_id} pH ({current_ph}) < {target_min}. Dosing {steps} steps.")
                await self.log_experiment_event("INFO", f"Auto Dosing: pH {current_ph} < {target_min}. Pump activated.", compartment_id)
                self.last_dose_time[compartment_id] = time.time()
                max_time = self.active_experiment.get("max_pump_time_sec", 30)
                try:
                    await asyncio.to_thread(pump.dose, direction, steps, max_time)
                except Exception as e:
                    logger.error(f"Auto dose failed: {e}")
                    await self.log_experiment_event("ERROR", f"Auto pump safety cutoff triggered: {e}", pump_id)

    async def run_loop(self):
        self.running = True
        self.mqtt.connect()
        
        logger.info("Starting Main Reactor Control Loop...")
        
        while self.running:
            try:
                # 1. Update Active Experiment Ref
                self.active_experiment = self.sqlite.get_active_experiment()
                
                # 2. Read Sensors
                ph_data = {}
                for i in [1, 2, 3]:
                    try:
                        ph_val = await asyncio.to_thread(self.hw.adc.read_ph, i)
                        ph_data[i] = ph_val
                        
                        # 3. Check Auto Dosing
                        await self.dosing_logic(i, ph_val)
                    except Exception as e:
                        logger.error(f"Error reading pH for compartment {i}: {e}")
                        await self.log_experiment_event("ERROR", f"Failed to read pH sensor: {str(e)}", i)
                
                # Log telemetry to SQLite if experiment running
                if self.active_experiment:
                    await asyncio.to_thread(
                        self.sqlite.log_telemetry, 
                        self.active_experiment['id'], 
                        ph_data
                    )
                
                # 4. Publish Telemetry
                self.mqtt.publish_telemetry(ph_data)
                
                status_data = {
                    "health": "ok",
                    "active_experiment": self.active_experiment['id'] if self.active_experiment else None,
                    "db_connected": True
                }
                self.mqtt.publish_status(status_data)
                
                # Run cycle roughly according to config frequency
                sleep_duration = self.active_experiment.get('measurement_interval_sec', 1) if self.active_experiment else 2.0
                await asyncio.sleep(sleep_duration)
                
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(5)

    def stop(self):
        self.running = False
        self.mqtt.disconnect()
        logger.info("Reactor Controller Stopped.")

async def main():
    controller = ReactorController()
    try:
        await controller.run_loop()
    except KeyboardInterrupt:
        controller.stop()

if __name__ == "__main__":
    asyncio.run(main())
