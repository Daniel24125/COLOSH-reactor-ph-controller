import time
import math
import logging

logger = logging.getLogger(__name__)

class MockADC:
    # Default Nernst calibration constants — must match defaults used in main.py
    _DEFAULT_SLOPE = -0.05916       # V/pH at 25°C (ideal Nernstian)
    _DEFAULT_INTERCEPT = 0.0        # V at pH 7 (no offset)

    def __init__(self):
        self._start_time = time.time()
        # Configurable target pH per compartment (used to back-calculate a realistic voltage)
        self._target_ph = {1: 7.0, 2: 7.0, 3: 7.0}
        logger.debug("Initialized MockADC")

    def set_target_ph(self, compartment_id: int, ph: float):
        """Set the simulated target pH for a compartment."""
        self._target_ph[compartment_id] = ph
        logger.debug(f"MockADC: Compartment {compartment_id} target pH set to {ph}")

    def read_voltage(self, compartment_id: int) -> float:
        """
        Returns a simulated voltage using the inverse Nernst equation at 37°C.
        This mirrors how main.py converts voltage → pH, but in reverse:
            voltage = intercept - live_slope * (target_ph - 7.0)
        A small sine-wave noise (±0.003V) is added to simulate real electrode drift.
        """
        target_ph = self._target_ph.get(compartment_id, 7.0)
        # Temperature-compensated slope (37°C = 310.15 K, ref 25°C = 298.15 K)
        live_slope = self._DEFAULT_SLOPE * (310.15 / 298.15)
        # Inverse Nernst: voltage that a real electrode would output at target_ph
        base_voltage = self._DEFAULT_INTERCEPT - live_slope * (target_ph - 7.0)
        # Small drift noise (±0.003 V) to simulate electrode stabilisation
        elapsed = time.time() - self._start_time
        noise = math.sin(elapsed / 10.0 + compartment_id) * 0.003
        return round(base_voltage + noise, 4)


class MockStepper:
    def __init__(self, pump_id: int):
        self.pump_id = pump_id
        logger.debug(f"Initialized MockStepper for pump {pump_id}")

    def dose(self, direction: str, steps: int, max_time_sec: int = 30):
        """
        Mock doser prints to terminal instead of triggering GPIO.
        """
        # Assume 1ms delay per step (2 delays per cycle)
        expected_time = steps * 0.002
        if expected_time > max_time_sec:
            raise TimeoutError(f"Pump {self.pump_id} cutoff: Requested dose ({expected_time:.2f}s) exceeds maximum allowed time ({max_time_sec}s).")
            
        direction_str = "forward" if direction in (1, "forward") else "reverse"
        logger.info(f"[MOCK PUMP {self.pump_id}] Dosing {steps} steps in direction: {direction_str} (Estimated {expected_time:.2f}s)")
        # Simulate time taken
        time.sleep(expected_time)
