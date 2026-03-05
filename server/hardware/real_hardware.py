import logging
import time
import threading

logger = logging.getLogger(__name__)

# To prevent import errors on Windows, we catch ImportErrors when these files are parsed.
# Since we only import this file on non-Windows (or at least when real hardware is intended),
# these imports should normally succeed on the Raspberry Pi.
try:
    import lgpio
    import board
    import busio
    import adafruit_ads1x15.ads1115 as ADS
    from adafruit_ads1x15.analog_in import AnalogIn
except ImportError as e:
    logger.warning(f"Could not import hardware libraries: {e}. If on Windows, this is expected.")


# Shared GPIO chip handle to avoid "GPIO busy" errors
_CHIP_HANDLE = None

def get_gpio_chip():
    global _CHIP_HANDLE
    if _CHIP_HANDLE is None:
        try:
            # lgpio.gpiochip_open(0) might vary depending on RPi model/kernel
            _CHIP_HANDLE = lgpio.gpiochip_open(0)
        except Exception as e:
            logger.error(f"Fatal: Failed to open gpiochip 0: {e}")
            raise e
    return _CHIP_HANDLE


class RealADC:
    def __init__(self):
        self.channels = {}
        try:
            self.i2c = busio.I2C(board.SCL, board.SDA)
            self.ads = ADS.ADS1115(self.i2c)
            # Assuming compartment 1 -> A0, compartment 2 -> A1, compartment 3 -> A2
            self.channels = {
                1: AnalogIn(self.ads, ADS.P0),
                2: AnalogIn(self.ads, ADS.P1),
                3: AnalogIn(self.ads, ADS.P2)
            }
            logger.info("RealADC initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize RealADC: {e}")

    def read_voltage(self, compartment_id: int) -> float:
        chan = self.channels.get(compartment_id)
        if not chan:
            raise RuntimeError(f"ADC not initialized or invalid compartment ID: {compartment_id}")
        try:
            # Get raw voltage
            return round(chan.voltage, 4)
        except Exception as e:
            raise RuntimeError(f"Hardware error reading voltage: {e}")


class RealPeristalticPump:
    """High-level pump controller for calibration and precise dosing using lgpio."""
    def __init__(self, dir_pin: int, step_pin: int, en_pin: int, steps_per_ml: float = 1000.0):
        self.dir_pin = dir_pin
        self.step_pin = step_pin
        self.en_pin = en_pin
        self.steps_per_ml = steps_per_ml
        self.h_gpio = None
        
        # Threading support for continuous priming
        self._prime_thread = None
        self._stop_prime_event = threading.Event()
        
        try:
            self.h_gpio = get_gpio_chip()
            lgpio.gpio_claim_output(self.h_gpio, self.dir_pin)
            lgpio.gpio_claim_output(self.h_gpio, self.step_pin)
            lgpio.gpio_claim_output(self.h_gpio, self.en_pin)
            # Disable motor by default (EN = HIGH for TMC2209)
            lgpio.gpio_write(self.h_gpio, self.en_pin, 1)
            logger.info(f"RealPeristalticPump initialized (DIR:{dir_pin}, STEP:{step_pin}, EN:{en_pin}).")
        except Exception as e:
            logger.error(f"Failed to initialize RealPeristalticPump pins: {e}")

    def set_enable(self, state: bool):
        if self.h_gpio is None: return
        val = 0 if state else 1 # Low = Enabled
        lgpio.gpio_write(self.h_gpio, self.en_pin, val)

    def run_calibration(self, total_steps: int = 10000, safe_delay: float = 0.002):
        logger.info(f"Running real calibration for {total_steps} steps...")
        if self.h_gpio is None: return
        try:
            lgpio.gpio_write(self.h_gpio, self.en_pin, 0) # Enable
            time.sleep(0.1)
            for _ in range(total_steps):
                lgpio.gpio_write(self.h_gpio, self.step_pin, 1)
                time.sleep(safe_delay)
                lgpio.gpio_write(self.h_gpio, self.step_pin, 0)
                time.sleep(safe_delay)
        finally:
            lgpio.gpio_write(self.h_gpio, self.en_pin, 1) # Disable

    def dose(self, direction: str, steps: int, max_time_sec: int = 30):
        if self.h_gpio is None: return
        # Simple dose implementation for high-level handlers
        try:
            dir_val = 1 if direction in (1, "forward") else 0
            lgpio.gpio_write(self.h_gpio, self.dir_pin, dir_val)
            lgpio.gpio_write(self.h_gpio, self.en_pin, 0)
            time.sleep(0.05)
            
            delay = 0.001
            for _ in range(steps):
                lgpio.gpio_write(self.h_gpio, self.step_pin, 1)
                time.sleep(delay)
                lgpio.gpio_write(self.h_gpio, self.step_pin, 0)
                time.sleep(delay)
        finally:
            lgpio.gpio_write(self.h_gpio, self.en_pin, 1)

    def start_prime(self, direction: str = "forward"):
        """Starts a continuous background loop of step pulses."""
        if self._prime_thread and self._prime_thread.is_alive():
            return # Already running

        self._stop_prime_event.clear()
        # Daemon thread ensures it dies if the main program crashes
        self._prime_thread = threading.Thread(target=self._prime_loop, args=(direction,), daemon=True)
        self._prime_thread.start()

    def stop_prime(self):
        """Signals the background loop to stop and disable the motor."""
        self._stop_prime_event.set()
        if self._prime_thread:
            self._prime_thread.join(timeout=1.0)

    def _prime_loop(self, direction: str):
        """The actual continuous pulsing logic (runs in the background)."""
        if self.h_gpio is None: return
        
        dir_val = 1 if direction in (1, "forward") else 0
        lgpio.gpio_write(self.h_gpio, self.dir_pin, dir_val)
        lgpio.gpio_write(self.h_gpio, self.en_pin, 0) # Enable driver (Active LOW)
        
        delay = 0.001 # 1ms delay for safe speed
        try:
            while not self._stop_prime_event.is_set():
                lgpio.gpio_write(self.h_gpio, self.step_pin, 1)
                time.sleep(delay)
                lgpio.gpio_write(self.h_gpio, self.step_pin, 0)
                time.sleep(delay)
        finally:
            # Guarantee the motor goes back to sleep when stopped
            try:
                lgpio.gpio_write(self.h_gpio, self.en_pin, 1)
            except: pass

