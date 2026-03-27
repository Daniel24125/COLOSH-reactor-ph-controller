import time
import math
import logging
import threading

logger = logging.getLogger(__name__)


class MockADC:
    """
    Software mock of the ADS1115 ADC for use on non-Raspberry-Pi systems.

    Raw value model (empirical, not Nernst):
        pH 7  → raw ≈ 15000   (mid-scale)
        pH 4  → raw ≈ 18000   (higher raw = lower pH, inverse relationship)
        pH 10 → raw ≈ 12000

    The mapping is a simple linear interpolation anchored at two reference points:
        ANCHOR_PH  = 7.0   → ANCHOR_RAW  = 15000
        SLOPE_RAW_PER_PH   = -1000  (raw decreases as pH increases)

    This mirrors a real pH electrode where a more acidic solution produces a
    higher ADC count (assuming a typical differential input configuration).

    A small sine-wave noise (±30 raw steps) is added to simulate electrode drift.
    Tests may call set_target_ph() to simulate any desired pH environment.
    """

    # Reference anchor: pH 7 → raw 15 000
    _ANCHOR_PH: float = 7.0
    _ANCHOR_RAW: int = 15000

    # Raw steps per pH unit (negative = raw increases as pH decreases)
    _SLOPE_RAW_PER_PH: float = -1000.0

    # Peak-to-peak noise amplitude in raw ADC steps (simulates I2C / BNC noise)
    _NOISE_AMPLITUDE: int = 30

    def __init__(self):
        self._start_time = time.time()
        # Configurable target pH per compartment, used to back-calculate a raw int
        self._target_ph = {1: 7.0, 2: 7.0, 3: 7.0}
        logger.debug("Initialized MockADC")

    def set_target_ph(self, compartment_id: int, ph: float):
        """
        Set the simulated target pH for a compartment.

        Internally this maps the pH to a target raw integer so that
        automated tests can drive different pH environments without
        needing physical hardware.
        """
        self._target_ph[compartment_id] = ph
        logger.debug(f"MockADC: Compartment {compartment_id} target pH set to {ph}")

    def read_raw_value(self, compartment_id: int) -> int:
        """
        Return a simulated 16-bit raw ADC integer for the given compartment.

        The base raw value is derived from the target pH using the linear model:
            raw = ANCHOR_RAW + SLOPE_RAW_PER_PH * (target_ph - ANCHOR_PH)

        A small sine-wave noise (±NOISE_AMPLITUDE steps) is added to simulate
        real-world electrical drift and I2C noise, so the readings never appear
        perfectly flat (which would make stability detection trivially true).
        """
        target_ph = self._target_ph.get(compartment_id, 7.0)

        # Map pH → base raw integer
        base_raw = self._ANCHOR_RAW + self._SLOPE_RAW_PER_PH * (target_ph - self._ANCHOR_PH)

        # Sine-wave noise — phase offset per compartment to avoid identical traces
        elapsed = time.time() - self._start_time
        noise = math.sin(elapsed / 10.0 + compartment_id) * self._NOISE_AMPLITUDE

        return int(round(base_raw + noise))


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
        self._stop_dose_event = threading.Event()

    def set_enable(self, state: bool):
        logger.info(f"[MOCK PUMP] enable set to {state}")

    def run_calibration(self, total_steps: int = 10000, safe_delay: float = 0.002):
        logger.info(f"[MOCK PUMP] Running calibration for {total_steps} steps...")
        time.sleep(total_steps * safe_delay * 0.1)  # Accelerated sleep for mock
        logger.info("[MOCK PUMP] Calibration run complete.")

    def stop_dose(self):
        """Signals an ongoing mock dose operation to stop early."""
        self._stop_dose_event.set()

    def dose(self, direction: str, steps: int, max_time_sec: int = 30):
        expected_time = steps * 0.002
        if expected_time > max_time_sec:
            raise TimeoutError(f"Mock Pump cutoff: dose ({expected_time:.2f}s) > max ({max_time_sec}s).")

        logger.info(f"[MOCK PUMP] Dosing {steps} steps {direction}")
        self._stop_dose_event.clear()

        # Cap total mock sleep but chunk it so it can be interrupted
        total_sleep = min(expected_time, 0.5)
        chunk_size = 0.05
        elapsed = 0.0
        while elapsed < total_sleep:
            if self._stop_dose_event.is_set():
                logger.info("[MOCK PUMP] Dose stopped early.")
                break
            time.sleep(chunk_size)
            elapsed += chunk_size

    def start_prime(self, direction: str = "forward"):
        """Starts a continuous background loop of step pulses."""
        if self._prime_thread and self._prime_thread.is_alive():
            return  # Already running

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
                time.sleep(0.1)  # Prevent CPU pegging
        finally:
            logger.info(f"[MOCK PUMP] Stopped continuous prime.")
