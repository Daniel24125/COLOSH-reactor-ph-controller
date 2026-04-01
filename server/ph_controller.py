import logging

logger = logging.getLogger(__name__)


class PhController:
    """
    Converts raw ADS1115 ADC integer readings to a calibrated pH value using
    an empirical two-point linear calibration.

    Formula:
        m = (point2_ph - point1_ph) / (point2_raw - point1_raw)
        b = point1_ph - m * point1_raw
        pH = m * raw_value + b

    The two calibration points (point1_ph / point1_raw, point2_ph / point2_raw)
    are stored in the database and loaded at startup via SQLiteClient.get_latest_calibrations().
    m and b are computed dynamically from those points — no constants are baked in.

    Also provides proportional dosing calculations: the volume (and equivalent
    stepper steps) of base to inject grows proportionally with the pH error,
    so small deviations receive a gentle correction while large ones receive a
    stronger dose — up to the experiment's configured maximum.
    """

    # ── Calibration fallback ───────────────────────────────────────────────────
    # Returned when no calibration record exists for a compartment.
    DEFAULT_FALLBACK_PH: float = 7.0

    # ── Proportional dosing constants ─────────────────────────────────────────
    #
    # GAIN: how many steps to add per 1.0 pH unit of error.
    #   Default: 50 steps / 1.0 pH unit.
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
            calibrations: {
                compartment_id: {
                    "point1_ph": float, "point1_raw": int,
                    "point2_ph": float, "point2_raw": int,
                    "point3_ph": float, "point3_raw": int
                }
            }
            as returned by SQLiteClient.get_latest_calibrations()
        """
        self._calibrations = calibrations or {}
        logger.info(f"PhController initialized with calibrations for compartments: {list(self._calibrations.keys())}")

    def reload(self, calibrations: dict):
        """Reload calibration constants (e.g. after a new calibration is saved)."""
        self._calibrations = calibrations
        logger.info(f"PhController calibrations reloaded for compartments: {list(self._calibrations.keys())}")

    def raw_to_ph(self, compartment_id: int, raw_value: int) -> float:
        """
        Convert a raw 16-bit ADC integer reading to a pH value using either
        a two-point linear or a three-point piecewise linear calibration.

        Args:
            compartment_id: The reactor compartment (1, 2, or 3).
            raw_value:      Raw 16-bit integer from the ADS1115 ADC (chan.value).

        Returns:
            Calibrated pH value rounded to 2 decimal places, or DEFAULT_FALLBACK_PH
            if no valid calibration exists for this compartment.
        """
        calib = self._calibrations.get(compartment_id)

        if not calib:
            logger.debug(
                f"No calibration for compartment {compartment_id}. "
                f"Returning fallback pH {self.DEFAULT_FALLBACK_PH}."
            )
            return self.DEFAULT_FALLBACK_PH

        p1_ph  = calib.get("point1_ph")
        p1_raw = calib.get("point1_raw")
        p2_ph  = calib.get("point2_ph")
        p2_raw = calib.get("point2_raw")
        p3_ph  = calib.get("point3_ph")
        p3_raw = calib.get("point3_raw")

        # Validate that at least the first two points are present
        if None in (p1_ph, p1_raw, p2_ph, p2_raw):
            logger.warning(
                f"Incomplete calibration data for compartment {compartment_id}. "
                f"Returning fallback pH {self.DEFAULT_FALLBACK_PH}."
            )
            return self.DEFAULT_FALLBACK_PH

        if p2_raw == p1_raw:
            logger.warning(
                f"Degenerate calibration for compartment {compartment_id}: "
                f"point1_raw == point2_raw ({p1_raw}). Returning fallback pH."
            )
            return self.DEFAULT_FALLBACK_PH

        # Piecewise selection logic
        use_p1p2 = True
        
        if p3_ph is not None and p3_raw is not None:
            # We have a 3rd point. Check which segment to use.
            # Assuming raw values are monotonic with pH (usually increasing or decreasing).
            # Case A: p1 < p2 < p3 (or vice-versa)
            midpoint = p2_raw
            if p1_raw < p3_raw: # Increasing raw ADC
                if raw_value > midpoint:
                    use_p1p2 = False
            else: # Decreasing raw ADC
                if raw_value < midpoint:
                    use_p1p2 = False

        if use_p1p2:
            # Segment 1: p1 to p2
            m = (p2_ph - p1_ph) / (p2_raw - p1_raw)
            b = p1_ph - m * p1_raw
        else:
            # Segment 2: p2 to p3
            if p3_raw == p2_raw:
                # Should not happen with valid calibration
                m = (p2_ph - p1_ph) / (p2_raw - p1_raw)
                b = p1_ph - m * p1_raw
            else:
                m = (p3_ph - p2_ph) / (p3_raw - p2_raw)
                b = p2_ph - m * p2_raw

        ph = m * raw_value + b
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
