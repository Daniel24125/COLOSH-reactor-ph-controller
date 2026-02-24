import time
import math
import logging

logger = logging.getLogger(__name__)

class MockADC:
    def __init__(self):
        self._start_time = time.time()
        logger.debug("Initialized MockADC")

    def read_ph(self, compartment_id: int) -> float:
        """
        Returns a fluctuating dummy pH value.
        Using a sine wave to simulate fluctuation between ~6.0 and ~8.0.
        Offset by compartment_id so they don't all show the exact same value.
        """
        elapsed = time.time() - self._start_time
        # base 7.0, amplitude 1.0, varying over 60 seconds
        val = 7.0 + math.sin(elapsed / 10.0 + compartment_id)
        return round(val, 2)


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
