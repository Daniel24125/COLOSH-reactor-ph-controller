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


class PeristalticPump:
    """Mock implementation of the high-level PeristalticPump class for non-Pi systems."""
    def __init__(self, dir_pin: int, step_pin: int, en_pin: int, steps_per_ml: float = 1000.0):
        self.dir_pin = dir_pin
        self.step_pin = step_pin
        self.en_pin = en_pin
        self.steps_per_ml = steps_per_ml
        logger.info(f"[MOCK PUMP] Initialized with pins DIR:{dir_pin}, STEP:{step_pin}, EN:{en_pin}")
        
        self._prime_thread = None
        self._stop_prime_event = threading.Event()

    def set_enable(self, state: bool):
        logger.info(f"[MOCK PUMP] enable set to {state}")

    def run_calibration(self, total_steps: int = 10000, safe_delay: float = 0.002):
        logger.info(f"[MOCK PUMP] Running calibration for {total_steps} steps...")
        time.sleep(total_steps * safe_delay * 0.1) # Accelerated sleep for mock
        logger.info("[MOCK PUMP] Calibration run complete.")

    def dose(self, direction: str, steps: int, max_time_sec: int = 30):
        expected_time = steps * 0.002
        if expected_time > max_time_sec:
            raise TimeoutError(f"Mock Pump cutoff: dose ({expected_time:.2f}s) > max ({max_time_sec}s).")
        
        logger.info(f"[MOCK PUMP] Dosing {steps} steps {direction}")
        time.sleep(min(expected_time, 0.5)) # Cap sleep for UX in mock

    def start_prime(self, direction: str = "forward"):
        """Starts a continuous background loop of step pulses."""
        if self._prime_thread and self._prime_thread.is_alive():
            return # Already running

        self._stop_prime_event.clear()
        self._prime_thread = threading.Thread(target=self._prime_loop, args=(direction,), daemon=True)
        self._prime_thread.start()

    def stop_prime(self):
        """Signals the background loop to stop and disable the motor."""
        self._stop_prime_event.set()
        if self._prime_thread:
            self._prime_thread.join(timeout=1.0)

    def _prime_loop(self, direction: str):
        """Mock background loop logic."""
        logger.info(f"[MOCK PUMP] Starting continuous prime: {direction}")
        try:
            while not self._stop_prime_event.is_set():
                time.sleep(0.1) # Prevent CPU pegging
        finally:
            logger.info(f"[MOCK PUMP] Stopped continuous prime.")
