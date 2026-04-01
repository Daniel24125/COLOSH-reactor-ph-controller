import asyncio
import logging
import time
from typing import Dict, Any, Callable, Awaitable

logger = logging.getLogger(__name__)

class DosingManager:
    """
    Handles proportional pH threshold dosing and manual pump overrides
    with background task management.
    """
    DEFAULT_DOSE_STEPS = 500
    DEFAULT_MAX_PUMP_SEC = 30
    DEFAULT_COOLDOWN_SEC = 10

    def __init__(
        self,
        hw: Any,
        state: Any,
        pump_config_manager: Any,
        ph_ctrl: Any,
        log_event_callback: Callable[[str, str, int], Awaitable[None]],
        mqtt_client: Any
    ):
        self.hw = hw
        self.state = state
        self.pump_config_manager = pump_config_manager
        self.ph_ctrl = ph_ctrl
        self.log_event = log_event_callback
        self.mqtt = mqtt_client

    async def evaluate_and_dose(self, sensor_data: Dict[int, Dict[str, Any]]):
        """Run auto-dosing logic for every compartment based on the latest pH readings."""
        for compartment_id, reading in sensor_data.items():
            ph_val = reading.get("ph")
            if ph_val is not None:
                await self._dose_if_needed(compartment_id, ph_val)

    async def _dose_if_needed(self, compartment_id: int, current_ph: float):
        if not self.state.active_experiment:
            return

        target_min = self.state.active_experiment.get(f"c{compartment_id}_min_ph")
        if target_min is None:
            return

        cooldown = self.state.active_experiment.get("mixing_cooldown_sec", self.DEFAULT_COOLDOWN_SEC)
        if time.time() - self.state.last_dose_time[compartment_id] < cooldown:
            return  # Still within cooldown window

        if self.state.manual_override[compartment_id]:
            return  # Manual dose in progress — skip auto-dose

        if current_ph >= target_min:
            return  # pH is within range — no dose required

        pump_id = compartment_id  # 1:1 mapping: compartment ↔ pump
        if pump_id not in self.hw.pumps:
            logger.warning(f"Auto dosing: no pump found for compartment {compartment_id}")
            return

        pump = self.hw.pumps[pump_id]
        max_time = self.state.active_experiment.get("max_pump_time_sec", self.DEFAULT_MAX_PUMP_SEC)

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
        active_task = self.state.active_dosing_tasks.get(compartment_id)
        if active_task and not active_task.done():
            return

        logger.info(
            f"Auto dosing: compartment {compartment_id} pH ({current_ph}) < {target_min} "
            f"[error={ph_error:.3f}]. Dosing {steps} steps (~{volume_ml} mL)."
        )
        
        # Dispatch the blocking dose to a background task
        self.state.active_dosing_tasks[compartment_id] = asyncio.create_task(
            self._execute_dose(pump, compartment_id, "forward", steps, max_time, current_ph, target_min, ph_error, volume_ml)
        )

    async def _execute_dose(self, pump, compartment_id, direction, steps, max_time, current_ph, target_min, ph_error, volume_ml):
        if self.log_event:
            await self.log_event(
                "INFO",
                f"Auto dosing: pH {current_ph} < {target_min} (Δ{ph_error:.2f}). "
                f"Pump activated: {steps} steps ≈ {volume_ml} mL.",
                compartment_id
            )
        try:
            await asyncio.to_thread(pump.dose, direction, steps, max_time)
            # Record dose time only after a confirmed successful dose
            self.state.last_dose_time[compartment_id] = time.time()
        except Exception as exc:
            logger.error(f"Auto dose failed: {exc}")
            if self.log_event:
                await self.log_event("ERROR", f"Auto pump safety cutoff triggered: {exc}", compartment_id)

    async def execute_manual_dose_override(self, pump_id: int, direction: str, steps: int, max_time: int):
        """Execute block manual dose override (legacy)."""
        if pump_id not in self.hw.pumps:
            logger.warning(f"Manual control: pump_id {pump_id!r} not found in hardware — ignoring.")
            return

        pump = self.hw.pumps[pump_id]
        logger.info(f"Manual override: dosing pump {pump_id} — {steps} steps {direction}")
        if self.log_event:
            await self.log_event("INFO", f"Manual override: pump {pump_id} activated for {steps} steps ({direction})", pump_id)
        try:
            await asyncio.to_thread(pump.dose, direction, steps, max_time)
        except Exception as exc:
            logger.error(f"Manual dose failed: {exc}")
            if self.log_event:
                await self.log_event("ERROR", f"Manual pump safety cutoff triggered: {exc}", pump_id)

    def dispatch_time_based_manual_dose(self, compartment_id: int, duration: float):
        """Cancel existing and start a non-blocking manual dose task for a given duration."""
        # Cancel any existing manual task for this compartment
        existing_task = self.state.active_manual_dose_tasks[compartment_id]
        if existing_task:
            existing_task.cancel()

        if duration > 0:
            logger.info(f"Dispatching manual dose task for compartment {compartment_id}: {duration:.2f}s")
            self.state.active_manual_dose_tasks[compartment_id] = asyncio.create_task(
                self._run_time_based_manual_dose(compartment_id, duration)
            )

    def stop_manual_dose(self, compartment_id: int):
        """Immediately stop an active manual dose task."""
        existing_task = self.state.active_manual_dose_tasks[compartment_id]
        if existing_task:
            existing_task.cancel()
            self.state.active_manual_dose_tasks[compartment_id] = None

    async def _run_time_based_manual_dose(self, compartment_id: int, duration: float):
        """Non-blocking manual dose task using asyncio.sleep."""
        if compartment_id not in self.hw.pumps:
            return

        pump = self.hw.pumps[compartment_id]
        location = f"location_{compartment_id}"
        
        self.state.manual_override[compartment_id] = True
        self.mqtt.publish_pump_active_status(location, True)
        if self.log_event:
            await self.log_event("INFO", f"Manual dose started: {duration:.2f}s", compartment_id)

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
            self.state.manual_override[compartment_id] = False
            self.mqtt.publish_pump_active_status(location, False)
            self.state.active_manual_dose_tasks[compartment_id] = None
            if self.log_event:
                await self.log_event("INFO", f"Manual dose ended.", compartment_id)

    def compute_volume_duration(self, compartment_id: int, volume_ml: float) -> float:
        """Convert a volume in mL to dosing duration in seconds based on calibration."""
        try:
            config = self.pump_config_manager.get_pump_config(f"location_{compartment_id}")
            spm = float(config.get("steps_per_ml", 1000.0))
            # Pulse frequency is 1 step per 2ms = 500 steps/sec
            steps = volume_ml * spm
            return steps * self.ph_ctrl.SEC_PER_STEP
        except Exception as e:
            logger.error(f"Failed to calculate duration from volume: {e}")
            return 0.0
