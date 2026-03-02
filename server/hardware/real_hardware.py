import logging
import time

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


class RealStepper:
    def __init__(self, pump_id: int, step_pin: int, dir_pin: int):
        self.pump_id = pump_id
        self.step_pin = step_pin
        self.dir_pin = dir_pin
        self.delay = 0.001  # Delay between step pulses (1ms)
        self.h_gpio = None
        try:
            # lgpio.gpiochip_open(0) might vary depending on RPi model/kernel
            self.h_gpio = lgpio.gpiochip_open(0)
            lgpio.gpio_claim_output(self.h_gpio, self.step_pin)
            lgpio.gpio_claim_output(self.h_gpio, self.dir_pin)
            logger.info(f"RealStepper initialized for pump {pump_id} (Step: {step_pin}, Dir: {dir_pin}).")
        except Exception as e:
            logger.error(f"Failed to initialize GPIO for RealStepper {pump_id}: {e}")

    def dose(self, direction: str, steps: int, max_time_sec: int = 30):
        """
        Dose by sending pulses to the Step pin and setting the Dir pin.
        direction: "forward" or "reverse"
        """
        if self.h_gpio is None:
            logger.error(f"Cannot dose pump {self.pump_id}: GPIO not initialized.")
            return

        expected_time = steps * (self.delay * 2)
        if expected_time > max_time_sec:
            raise TimeoutError(f"Pump {self.pump_id} cutoff: Requested dose ({expected_time:.2f}s) exceeds maximum allowed time ({max_time_sec}s).")

        try:
            dir_val = 1 if direction in (1, "forward") else 0
            lgpio.gpio_write(self.h_gpio, self.dir_pin, dir_val)
            
            logger.info(f"[REAL PUMP {self.pump_id}] Dosing {steps} steps in direction: {direction}")
            start_time = time.time()
            for i in range(steps):
                if time.time() - start_time > max_time_sec:
                     raise TimeoutError(f"Pump {self.pump_id} forcibly stopped. Exceeded max run time of {max_time_sec}s at step {i}/{steps}")
                
                lgpio.gpio_write(self.h_gpio, self.step_pin, 1)
                time.sleep(self.delay)
                lgpio.gpio_write(self.h_gpio, self.step_pin, 0)
                time.sleep(self.delay)
        except Exception as e:
            logger.error(f"Hardware error during dozing pump {self.pump_id}: {e}")
            raise e

    def __del__(self):
        try:
            if self.h_gpio is not None:
                lgpio.gpio_free(self.h_gpio, self.step_pin)
                lgpio.gpio_free(self.h_gpio, self.dir_pin)
                lgpio.gpiochip_close(self.h_gpio)
        except Exception:
            pass
