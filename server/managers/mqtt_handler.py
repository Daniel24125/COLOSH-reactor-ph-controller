import logging
import asyncio

logger = logging.getLogger(__name__)

class MQTTCommandHandler:
    """
    Parses raw JSON dictionaries from the MQTT client and translates them
    into strongly-typed method calls against the orchestrator and sub-managers.
    """
    def __init__(self, orchestrator):
        self.ctx = orchestrator

    def register_callbacks(self, mqtt_client):
        mqtt_client.on_manual_control = self.handle_manual_control
        mqtt_client.on_auto_update = self.handle_auto_update
        mqtt_client.on_experiment_config = self.handle_experiment_config
        mqtt_client.on_calibration_control = self.handle_calibration_control
        mqtt_client.on_pump_prime = self.handle_pump_prime
        mqtt_client.on_pump_calibrate_run = self.handle_pump_calibrate_run
        mqtt_client.on_pump_save_calibration = self.handle_pump_save_calibration
        mqtt_client.on_pump_cmd = self.handle_pump_cmd
        mqtt_client.on_status_request = self.handle_status_request

    async def handle_status_request(self, payload: dict):
        """Respond to frontend synchronization ping."""
        logger.info("Received colosh/request_status ping inside handler.")
        self.ctx.send_initial_state_to_frontend()

    async def handle_calibration_control(self, payload: dict):
        """Toggle sensor calibration stream mode."""
        action = payload.get("action")
        command = payload.get("command")

        if action == "reload_calibration":
            self.ctx.reload_calibrations()

        if command == "start":
            compartment = payload.get("compartment")
            self.ctx.state.calibration_mode_compartment = compartment
            logger.info(f"Entered calibration mode for compartment {compartment}")
        elif command == "stop":
            self.ctx.state.calibration_mode_compartment = None
            logger.info("Exited calibration mode")

    async def handle_experiment_config(self, payload: dict):
        """Dynamically apply incoming limit/threshold changes."""
        logger.info("Experiment config update received via MQTT.")
        if self.ctx.state.active_experiment and self.ctx.state.active_experiment["id"] == payload.get("experiment_id"):
            self.ctx.reload_active_experiment()

    async def handle_auto_update(self, payload: dict):
        """Reload DB after standard limit threshold sets."""
        logger.info("Auto update triggered from MQTT.")
        self.ctx.reload_active_experiment()

    async def handle_manual_control(self, payload: dict):
        """Legacy direct dose steps override."""
        pump_id = payload.get("pump_id")
        direction = payload.get("direction", "forward")
        
        default_steps = self.ctx.state.active_experiment.get("manual_dose_steps") if self.ctx.state.active_experiment else None
        if not default_steps: default_steps = self.ctx.dosing_manager.DEFAULT_DOSE_STEPS
        
        steps = payload.get("steps", default_steps)
        max_time = self.ctx.state.active_experiment.get("max_pump_time_sec") if self.ctx.state.active_experiment else None
        if not max_time: max_time = self.ctx.dosing_manager.DEFAULT_MAX_PUMP_SEC

        asyncio.create_task(
            self.ctx.dosing_manager.execute_manual_dose_override(pump_id, direction, steps, max_time)
        )

    async def handle_pump_cmd(self, compartment_id: int, payload: dict):
        """New UI manual pump controls mapping to time durations."""
        action = payload.get("action")  # "jog", "dose", "start", "stop"
        
        if action == "stop":
            self.ctx.dosing_manager.stop_manual_dose(compartment_id)
            return

        duration = 0.0
        if action == "jog":
            duration = 0.5
        elif action == "start":
            duration = 3.0  # Safety Max Timeout
        elif action == "dose":
            if "volume" in payload:
                vol_ml = float(payload["volume"])
                duration = self.ctx.dosing_manager.compute_volume_duration(compartment_id, vol_ml)
            else:
                duration = float(payload.get("duration", 0.0))

        if duration > 0:
            logger.info(f"Manual pump command for {compartment_id}: {action} for {duration:.2f}s")
            self.ctx.dosing_manager.dispatch_time_based_manual_dose(compartment_id, duration)

    # ── Peristaltic Pump Callbacks ──

    def _get_hw_pump(self, location: str):
        try:
            pump_id = int(location.split("_")[-1])
            return self.ctx.hw.pumps.get(pump_id)
        except (ValueError, IndexError):
            return None

    async def handle_pump_prime(self, payload: dict):
        location = payload.get("location")
        state = payload.get("state")

        pump = self._get_hw_pump(location)
        if not pump: return

        if state == "ON":
            try:
                pump.start_prime()
                self.ctx.mqtt.publish_pump_active_status(location, True)
            except Exception as e:
                logger.error(f"Prime ON failed: {e}")
        elif state == "OFF":
            try:
                pump.stop_prime()
                self.ctx.mqtt.publish_pump_active_status(location, False)
            except Exception as e:
                logger.error(f"Prime OFF failed: {e}")

    async def handle_pump_calibrate_run(self, payload: dict):
        location = payload.get("location")

        if "target_volume" in payload:
            target_vol = float(payload["target_volume"])
            try:
                config = self.ctx.pump_config_manager.get_pump_config(location)
                current_spm = float(config.get("steps_per_ml", 1000.0))
                steps = int(round(current_spm * target_vol))
            except Exception as e:
                logger.error(f"Compute steps err from target_volume: {e}")
                return
        else:
            steps = int(payload.get("steps", 10000))

        pump = self._get_hw_pump(location)
        if not pump: return

        self.ctx.mqtt.publish_pump_active_status(location, True)
        try:
            await asyncio.to_thread(pump.run_calibration, steps)
        except Exception as e:
            logger.error(f"Pump Calibrate Run Failed: {e}")
        finally:
            self.ctx.mqtt.publish_pump_active_status(location, False)

    async def handle_pump_save_calibration(self, payload: dict):
        location = payload.get("location")
        target_ml = payload.get("target_ml")
        actual_ml = payload.get("actual_ml")

        if not actual_ml or float(actual_ml) <= 0: return
        if not target_ml or float(target_ml) <= 0: return

        try:
            config = self.ctx.pump_config_manager.get_pump_config(location)
            current_spm = float(config.get("steps_per_ml", 1000.0))
        except Exception as e:
            logger.error(f"Failed to read calibration for {location}: {e}")
            return

        new_spm = (current_spm * float(target_ml)) / float(actual_ml)

        try:
            self.ctx.pump_config_manager.save_calibration(location, new_spm)
        except Exception as e:
            logger.error(f"Failed to save calibration: {e}")
