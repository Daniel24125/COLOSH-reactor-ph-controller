import logging

logger = logging.getLogger(__name__)


class PhController:
    """
    Converts raw ADC voltage to a calibrated pH value using the
    temperature-compensated Nernst equation at 37°C (standard reactor temp).

    Formula:
        live_slope = calibrated_slope * (TEMP_K / REF_TEMP_K)
        pH = 7.0 + (intercept - voltage) / live_slope

    Also provides proportional dosing calculations: the volume (and equivalent
    stepper steps) of base to inject grows proportionally with the pH error,
    so small deviations receive a gentle correction while large ones receive a
    stronger dose — up to the experiment's configured maximum.
    """

    TEMP_K = 310.15     # Operating temperature: 37°C in Kelvin
    REF_TEMP_K = 298.15 # Reference temperature: 25°C in Kelvin

    # Ideal Nernstian defaults — used when no calibration exists for a compartment
    DEFAULT_SLOPE = -0.05916    # V/pH at 25°C
    DEFAULT_INTERCEPT = 0.0     # V at pH 7 (no offset)

    # ── Proportional dosing constants ─────────────────────────────────────────
    #
    # STEPS_PER_ML: physical calibration constant.
    #   Measure this for your pump + tubing combination:
    #     1. Fill the tubing with liquid.
    #     2. Run the pump for a known number of steps.
    #     3. Collect the output in a graduated cylinder.
    #     4. STEPS_PER_ML = steps_run / volume_collected_ml
    #
    STEPS_PER_ML: float = 100.0   # ← TODO: replace with your measured value

    # GAIN: how many steps to add per 0.1 pH unit of error.
    #   Default: 50 steps / 1.0 pH unit = 5 steps per 0.1 pH.
    #   Increase this to respond more aggressively to small errors.
    GAIN_STEPS_PER_PH_UNIT: float = 50.0

    # Minimum steps per dose — ensures the pump always moves enough to
    # overcome tubing back-pressure even for tiny pH errors.
    MIN_DOSE_STEPS: int = 10

    # Step timing — must match the delay used in the pump hardware driver.
    #   MockStepper / RealStepper both use 2 ms per step (0.002 s/step).
    #   If you change the stepper delay in hardware/, update this constant too.
    SEC_PER_STEP: float = 0.002  # seconds per step

    def __init__(self, calibrations: dict = None):
        """
        Args:
            calibrations: {compartment_id: {"slope": float, "intercept": float}}
                          as returned by SQLiteClient.get_latest_calibrations()
        """
        self._calibrations = calibrations or {}
        logger.info(f"PhController initialized with calibrations for compartments: {list(self._calibrations.keys())}")

    def reload(self, calibrations: dict):
        """Reload calibration constants (e.g. after a new calibration is saved)."""
        self._calibrations = calibrations
        logger.info(f"PhController calibrations reloaded for compartments: {list(self._calibrations.keys())}")

    def voltage_to_ph(self, compartment_id: int, voltage: float) -> float:
        """
        Convert a raw voltage reading to a pH value.

        Args:
            compartment_id: The reactor compartment (1, 2, or 3).
            voltage:        Raw voltage from the ADC in Volts.

        Returns:
            Calibrated pH value rounded to 2 decimal places.
        """
        calib = self._calibrations.get(compartment_id, {})
        slope = calib.get("slope", self.DEFAULT_SLOPE)
        intercept = calib.get("intercept", self.DEFAULT_INTERCEPT)

        # Scale the 25°C slope to operating temperature (37°C)
        live_slope = slope * (self.TEMP_K / self.REF_TEMP_K)

        ph = 7.0 + ((intercept - voltage) / live_slope)
        return round(ph, 2)

    # ── Proportional dosing ───────────────────────────────────────────────────

    def calculate_steps(self, ph_error: float, max_time_sec: float) -> int:
        """
        Calculate the number of stepper-motor steps proportional to the pH error,
        capped so the resulting dose never exceeds max_time_sec.

        max_steps is derived from the pump's own timing constant (SEC_PER_STEP)
        so the calculated step count is always compatible with the TimeoutError
        guard inside pump.dose().

        Formula:
            max_steps = floor(max_time_sec / SEC_PER_STEP)
            raw_steps = GAIN_STEPS_PER_PH_UNIT * ph_error
            steps     = clamp(raw_steps, MIN_DOSE_STEPS, max_steps)

        Args:
            ph_error:     target_min_ph - current_ph (positive when pH is too low)
            max_time_sec: max_pump_time_sec from the experiment config

        Returns:
            Integer step count, always within [MIN_DOSE_STEPS, max_steps].
        """
        if ph_error <= 0:
            return 0

        max_steps = int(max_time_sec / self.SEC_PER_STEP)
        raw_steps = self.GAIN_STEPS_PER_PH_UNIT * ph_error
        steps = int(round(raw_steps))
        steps = max(self.MIN_DOSE_STEPS, min(steps, max_steps))
        logger.debug(
            f"calculate_steps: error={ph_error:.3f} pH → raw={raw_steps:.1f} → "
            f"clamped={steps} (min={self.MIN_DOSE_STEPS}, max={max_steps} "
            f"[{max_time_sec}s / {self.SEC_PER_STEP}s per step])"
        )
        return steps

    def calculate_volume_ml(self, steps: int) -> float:
        """
        Convert a step count to an estimated dispensed volume in millilitres.

        Requires STEPS_PER_ML to be calibrated for your specific pump and
        tubing combination (see the constant definition above).

        Args:
            steps: Number of stepper-motor steps.

        Returns:
            Estimated volume in mL, rounded to 3 decimal places.
        """
        if self.STEPS_PER_ML <= 0:
            raise ValueError("STEPS_PER_ML must be a positive number.")
        return round(steps / self.STEPS_PER_ML, 3)

