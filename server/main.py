import asyncio
import collections
import logging
import time
import os
import uvicorn
from dotenv import load_dotenv

from hardware import get_hardware
from database import SQLiteClient
from mqtt import MQTTClient
from ph_controller import PhController
from config.pump_helpers import PumpConfigManager

logger = logging.getLogger(__name__)


class ReactorController:
    # ── Compartment IDs ────────────────────────────────────────────────────
    COMPARTMENTS = [1, 2, 3]

    # ── Timing constants ───────────────────────────────────────────────────
    CYCLE_INTERVAL_SEC = 1       # Main control-loop period
    RECOVERY_SLEEP_SEC = 5       # Sleep after an unhandled loop error

    # ── Dosing defaults (used when experiment config is absent) ────────────
    DEFAULT_DOSE_STEPS = 500
    DEFAULT_MAX_PUMP_SEC = 30
    DEFAULT_COOLDOWN_SEC = 10

    # ── Reading Stability ──────────────────────────────────────────────────
    # Number of consecutive raw ADC readings held in the sliding window.
    STABILITY_WINDOW_SIZE = 10

    # A reading is considered stable when the spread of the window
    # (max − min in raw ADC steps) is below this threshold.
    # Tune this value based on your electrode / I2C noise floor.
    # At 16-bit full-scale (≈32 767 steps) a threshold of 50 corresponds
    # to roughly 0.15 mV of input noise on a ±2.048 V range.
    STABILITY_THRESHOLD = 250

    # ── Process Stability (Moving Average) ─────────────────────────────────
    # Number of calculated pH readings held in the sliding average window.
    # Used for dosing logic and dashboard display to prevent noise bouncing.
    PH_MOVING_AVG_WINDOW = 10

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
        self.mqtt.on_pump_prime = self.handle_pump_prime
        self.mqtt.on_pump_calibrate_run = self.handle_pump_calibrate_run
        self.mqtt.on_pump_save_calibration = self.handle_pump_save_calibration
        self.mqtt.on_pump_cmd = self.handle_pump_cmd

        # 4. System state
        self.running = False
        self.active_experiment = None
        self.pump_config_manager = PumpConfigManager()
        self.ph_ctrl = PhController(self.sqlite.get_latest_calibrations())
        self.calibration_mode_compartment = None
        self.last_dose_time = {c: 0.0 for c in self.COMPARTMENTS}
        self.last_measurement_time = 0.0
        self.sensor_error_logged = {c: False for c in self.COMPARTMENTS}
        self.active_dosing_tasks = {c: None for c in self.COMPARTMENTS}
        self.active_manual_dose_tasks = {c: None for c in self.COMPARTMENTS}
        self.manual_override = {c: False for c in self.COMPARTMENTS}

        # 5. Sliding windows — one per compartment
        # raw_windows track ADC values for hardware stability checks
        self.raw_windows: dict[int, collections.deque] = {
            c: collections.deque(maxlen=self.STABILITY_WINDOW_SIZE)
            for c in self.COMPARTMENTS
        }
        # ph_avg_windows track calculated pH for process smoothing (MA)
        self.ph_avg_windows: dict[int, collections.deque] = {
            c: collections.deque(maxlen=self.PH_MOVING_AVG_WINDOW)
            for c in self.COMPARTMENTS
        }

        # 6. DAQ Bucketing for telemetry logging (1Hz average)
        self.telemetry_buckets: dict[int, list] = {c: [] for c in self.COMPARTMENTS}

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

    async def handle_pump_cmd(self, compartment_id: int, payload: dict):
        """Handle new pattern MQTT manual pump commands (Jog, Dose, Start, Stop)."""
        action = payload.get("action")  # "jog", "dose", "start", "stop"
        
        # 1. Immediate stop / task cancellation
        if action == "stop":
            if self.active_manual_dose_tasks[compartment_id]:
                self.active_manual_dose_tasks[compartment_id].cancel()
                self.active_manual_dose_tasks[compartment_id] = None
            return

        # 2. Cancel any existing manual task for this compartment before starting a new one
        if self.active_manual_dose_tasks[compartment_id]:
            self.active_manual_dose_tasks[compartment_id].cancel()

        # 3. Calculate duration
        duration = 0.0
        if action == "jog":
            duration = 0.5
        elif action == "start":
            duration = 3.0  # Safety Max Timeout
        elif action == "dose":
            if "volume" in payload:
                # Calculate duration from volume using calibration
                try:
                    vol_ml = float(payload["volume"])
                    config = self.pump_config_manager.get_pump_config(f"location_{compartment_id}")
                    spm = float(config.get("steps_per_ml", 1000.0))
                    # Pulse frequency is 1 step per 2ms = 500 steps/sec
                    steps = vol_ml * spm
                    duration = steps * self.ph_ctrl.SEC_PER_STEP
                except Exception as e:
                    logger.error(f"Failed to calculate duration from volume: {e}")
                    return
            else:
                duration = float(payload.get("duration", 0.0))

        if duration <= 0:
            logger.warning(f"Invalid pump command duration for compartment {compartment_id}: {duration}")
            return

        logger.info(f"Manual pump command for compartment {compartment_id}: {action} for {duration:.2f}s")
        # 4. Dispatch the non-blocking manual dose task
        self.active_manual_dose_tasks[compartment_id] = asyncio.create_task(
            self._run_manual_dose_task(compartment_id, duration)
        )

    # ── Peristaltic Pump Calibration Handlers ──────────────────────────────

    def _get_calibration_pump(self, location: str):
        """Map location_X to a persistent PeristalticPump instance from the hardware layer."""
        try:
            pump_id = int(location.split("_")[-1])
            return self.hw.pumps.get(pump_id)
        except (ValueError, IndexError):
            logger.error(f"Invalid pump location format: {location}")
            return None

    async def handle_pump_prime(self, payload: dict):
        location = payload.get("location")
        state = payload.get("state")  # "ON" or "OFF"

        logger.info(f"Pump Prime {state}: {location}")
        pump = self._get_calibration_pump(location)
        if not pump: return

        if state == "ON":
            try:
                pump.start_prime()
                self.mqtt.publish_pump_active_status(location, True)
            except Exception as e:
                logger.error(f"Prime ON failed: {e}")
        elif state == "OFF":
            try:
                pump.stop_prime()
                self.mqtt.publish_pump_active_status(location, False)
            except Exception as e:
                logger.error(f"Prime OFF failed: {e}")

    async def handle_pump_calibrate_run(self, payload: dict):
        location = payload.get("location")

        # Accept either explicit steps (legacy) or target_volume which we convert
        # to steps using the current calibration so the dispense is volumetrically consistent.
        if "target_volume" in payload:
            try:
                config = self.pump_config_manager.get_pump_config(location)
                current_spm = float(config.get("steps_per_ml", 1000.0))
                target_vol = float(payload["target_volume"])
                steps = int(round(current_spm * target_vol))
            except Exception as e:
                logger.error(f"Failed to compute steps from target_volume: {e}")
                return
        else:
            steps = int(payload.get("steps", 10000))

        logger.info(f"Pump Calibrate Run: {location} for {steps} steps")
        pump = self._get_calibration_pump(location)
        if not pump: return

        self.mqtt.publish_pump_active_status(location, True)
        try:
            await asyncio.to_thread(pump.run_calibration, steps)
        except Exception as e:
            logger.error(f"Pump Calibrate Run Failed: {e}")
        finally:
            self.mqtt.publish_pump_active_status(location, False)

    async def handle_pump_save_calibration(self, payload: dict):
        location = payload.get("location")
        target_ml = payload.get("target_ml")
        actual_ml = payload.get("actual_ml")

        if not actual_ml or float(actual_ml) <= 0:
            logger.error("Invalid actual_ml received for calibration save.")
            return
        if not target_ml or float(target_ml) <= 0:
            logger.error("Invalid target_ml received for calibration save.")
            return

        try:
            config = self.pump_config_manager.get_pump_config(location)
            current_spm = float(config.get("steps_per_ml", 1000.0))
        except Exception as e:
            logger.error(f"Failed to read current calibration for {location}: {e}")
            return

        # New steps/mL = (current steps/mL × target_ml) / actual_ml
        new_spm = (current_spm * float(target_ml)) / float(actual_ml)
        logger.info(
            f"Saving calibration for {location}: {current_spm:.2f} → {new_spm:.2f} steps/mL "
            f"(target={target_ml} mL, actual={actual_ml} mL)"
        )

        try:
            self.pump_config_manager.save_calibration(location, new_spm)
        except Exception as e:
            logger.error(f"Failed to save calibration: {e}")

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

        if self.manual_override[compartment_id]:
            return  # Manual dose in progress — skip auto-dose

        if current_ph >= target_min:
            return  # pH is within range — no dose required

        pump_id = compartment_id  # 1:1 mapping: compartment ↔ pump
        if pump_id not in self.hw.pumps:
            logger.warning(f"Auto dosing: no pump found for compartment {compartment_id}")
            return

        pump = self.hw.pumps[pump_id]
        max_time = self.active_experiment.get("max_pump_time_sec", self.DEFAULT_MAX_PUMP_SEC)

        # Proportional dosing: steps scale with the magnitude of the pH error.
        ph_error = target_min - current_ph
        steps = self.ph_ctrl.calculate_steps(ph_error, max_time)

        # Load the dynamic calibration config for true volume calculation
        try:
            config = self.pump_config_manager.get_pump_config(f"location_{compartment_id}")
            spm = float(config.get("steps_per_ml", 1000.0))
        except Exception:
            spm = 1000.0

        if spm <= 0:
            spm = 1000.0

        volume_ml = round(steps / spm, 3)

        # Do not allow overlapping auto-doses for the same compartment
        active_task = self.active_dosing_tasks.get(compartment_id)
        if active_task and not active_task.done():
            return

        logger.info(
            f"Auto dosing: compartment {compartment_id} pH ({current_ph}) < {target_min} "
            f"[error={ph_error:.3f}]. Dosing {steps} steps (~{volume_ml} mL)."
        )
        # Dispatch the blocking dose to a background task
        self.active_dosing_tasks[compartment_id] = asyncio.create_task(
            self._execute_dose(pump, compartment_id, "forward", steps, max_time, current_ph, target_min, ph_error, volume_ml)
        )

    async def _execute_dose(self, pump, compartment_id, direction, steps, max_time, current_ph, target_min, ph_error, volume_ml):
        await self._log_event(
            "INFO",
            f"Auto dosing: pH {current_ph} < {target_min} (Δ{ph_error:.2f}). "
            f"Pump activated: {steps} steps ≈ {volume_ml} mL.",
            compartment_id
        )
        try:
            await asyncio.to_thread(pump.dose, direction, steps, max_time)
            # Record dose time only after a confirmed successful dose
            self.last_dose_time[compartment_id] = time.time()
        except Exception as exc:
            logger.error(f"Auto dose failed: {exc}")
            await self._log_event("ERROR", f"Auto pump safety cutoff triggered: {exc}", compartment_id)

    async def _run_manual_dose_task(self, compartment_id: int, duration: float):
        """Non-blocking manual dose task using asyncio.sleep."""
        if compartment_id not in self.hw.pumps:
            return

        pump = self.hw.pumps[compartment_id]
        location = f"location_{compartment_id}"
        
        self.manual_override[compartment_id] = True
        self.mqtt.publish_pump_active_status(location, True)
        await self._log_event("INFO", f"Manual dose started: {duration:.2f}s", compartment_id)

        try:
            # Start the hardware pulse loop in a thread (starts the motor)
            await asyncio.to_thread(pump.start_prime)
            # Non-blocking wait while sensor reads continue
            await asyncio.sleep(duration)
        except asyncio.CancelledError:
            logger.info(f"Manual dose for compartment {compartment_id} was cancelled/stopped.")
        except Exception as e:
            logger.error(f"Manual dose loop error for compartment {compartment_id}: {e}")
        finally:
            # STOP the loop (guaranteed shutoff even on cancellation)
            await asyncio.to_thread(pump.stop_prime)
            self.manual_override[compartment_id] = False
            self.mqtt.publish_pump_active_status(location, False)
            self.active_manual_dose_tasks[compartment_id] = None
            await self._log_event("INFO", f"Manual dose ended.", compartment_id)

    # ── Run-loop helpers ───────────────────────────────────────────────────

    async def _read_sensors(self) -> dict:
        """
        Read raw ADC values from all compartments, apply stability windowing,
        convert to pH, and return a composite telemetry dict.

        Returns:
            {
                compartment_id: {"ph": float | None, "raw": int | None, "stable": bool}
            }
        """
        sensor_data = {}
        for compartment_id in self.COMPARTMENTS:
            try:
                raw = await asyncio.to_thread(self.hw.adc.read_raw_value, compartment_id)

                if raw is not None:
                    # 1. Hardware Stability: spread of raw ADC integers
                    raw_window = self.raw_windows[compartment_id]
                    raw_window.append(raw)
                    is_stable = (
                        len(raw_window) >= 2
                        and (max(raw_window) - min(raw_window)) < self.STABILITY_THRESHOLD
                    )

                    # 2. Convert raw to instantaneous pH
                    inst_ph = self.ph_ctrl.raw_to_ph(compartment_id, raw)

                    # 3. Process Stability: Moving Average pH
                    ph_avg_window = self.ph_avg_windows[compartment_id]
                    ph_avg_window.append(inst_ph)
                    ma_ph = sum(ph_avg_window) / len(ph_avg_window)
                    ma_ph = round(ma_ph, 2)

                    # 4. DAQ Bucketing: accumulate for logging
                    self.telemetry_buckets[compartment_id].append(inst_ph)

                    sensor_data[compartment_id] = {
                        "ph": ma_ph,       # Dashboard display & dosing use MA
                        "raw": raw,        # Raw used for calibration UI
                        "stable": is_stable,
                    }
                else:
                    # Sensor offline — clear windows and buckets
                    self.raw_windows[compartment_id].clear()
                    self.ph_avg_windows[compartment_id].clear()
                    self.telemetry_buckets[compartment_id].clear()
                    sensor_data[compartment_id] = {"ph": None, "raw": None, "stable": False}

                # In calibration mode, stream the latest raw value to the frontend
                if self.calibration_mode_compartment == compartment_id:
                    self.mqtt.publish_raw_value({"raw_value": raw})

                if self.sensor_error_logged[compartment_id] and raw is not None:
                    logger.info(f"Sensor for compartment {compartment_id} recovered.")
                    await self._log_event("INFO", "Sensor recovered.", compartment_id)
                    self.sensor_error_logged[compartment_id] = False

            except Exception as exc:
                if not self.sensor_error_logged[compartment_id]:
                    logger.error(f"Error reading sensor for compartment {compartment_id}: {exc}")
                    await self._log_event("ERROR", f"Failed to read sensor: {exc}", compartment_id)
                    self.sensor_error_logged[compartment_id] = True
                sensor_data[compartment_id] = {"ph": None, "raw": None, "stable": False}

        return sensor_data

    async def _run_dosing(self, sensor_data: dict):
        """Run auto-dosing logic for every compartment based on the latest pH readings."""
        for compartment_id, reading in sensor_data.items():
            ph_val = reading.get("ph")
            if ph_val is not None:
                await self._dose_if_needed(compartment_id, ph_val)

    async def _log_telemetry(self, sensor_data: dict):
        """Persist a telemetry snapshot to SQLite using the mean of the DAQ bucket."""
        if not self.active_experiment:
            return
        
        interval_mins = self.active_experiment.get("measurement_interval_mins", 1)
        if time.time() - self.last_measurement_time >= interval_mins * 60:
            # Calculate mean for each bucket
            ph_averages = {}
            for c in self.COMPARTMENTS:
                bucket = self.telemetry_buckets[c]
                if bucket:
                    avg_val = round(sum(bucket) / len(bucket), 2)
                    ph_averages[c] = avg_val
                    bucket.clear()  # Clear after logging
                else:
                    ph_averages[c] = None

            await asyncio.to_thread(
                self.sqlite.log_telemetry,
                self.active_experiment["id"],
                ph_averages
            )
            self.mqtt.publish_logged_telemetry(ph_averages)
            self.last_measurement_time = time.time()

    def _publish(self, sensor_data: dict):
        """Publish real-time telemetry and system status via MQTT."""
        self.mqtt.publish_telemetry(sensor_data)
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

        loop_last_experiment_id = None

        while self.running:
            try:
                # Always fetch the authoritative DB state in the loop.
                # Don't rely on self.active_experiment which might be mutated by MQTT callbacks
                current_exp = self.sqlite.get_active_experiment()
                self.active_experiment = current_exp

                current_exp_id = current_exp["id"] if current_exp else None

                if current_exp_id:
                    if loop_last_experiment_id != current_exp_id:
                        logger.info("New experiment started. Resetting telemetry clock.")
                        self.last_measurement_time = 0.0
                elif loop_last_experiment_id is not None:
                    logger.info("Experiment stopped. Halting all actively running doses and primes.")
                    for p in self.hw.pumps.values():
                        if hasattr(p, "stop_dose"):
                            p.stop_dose()
                        if hasattr(p, "stop_prime"):
                            p.stop_prime()

                loop_last_experiment_id = current_exp_id

                sensor_data = await self._read_sensors()
                await self._run_dosing(sensor_data)
                await self._log_telemetry(sensor_data)
                self._publish(sensor_data)

                await asyncio.sleep(self.CYCLE_INTERVAL_SEC)
            except Exception as exc:
                logger.error(f"Unhandled error in main loop: {exc}")
                await asyncio.sleep(self.RECOVERY_SLEEP_SEC)

    def stop(self):
        self.running = False
        logger.info("Shutting down. Halting all pumps...")
        for p in self.hw.pumps.values():
            if hasattr(p, "stop_dose"):
                p.stop_dose()
            if hasattr(p, "stop_prime"):
                p.stop_prime()
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
