import logging

logger = logging.getLogger(__name__)


class PhController:
    """
    Converts raw ADC voltage to a calibrated pH value using the
    temperature-compensated Nernst equation at 37°C (standard reactor temp).

    Formula:
        live_slope = calibrated_slope * (TEMP_K / REF_TEMP_K)
        pH = 7.0 + (intercept - voltage) / live_slope
    """

    TEMP_K = 310.15     # Operating temperature: 37°C in Kelvin
    REF_TEMP_K = 298.15 # Reference temperature: 25°C in Kelvin

    # Ideal Nernstian defaults — used when no calibration exists for a compartment
    DEFAULT_SLOPE = -0.05916    # V/pH at 25°C
    DEFAULT_INTERCEPT = 0.0     # V at pH 7 (no offset)

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
