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

    def _voltage_to_ph(self, raw_voltage: float) -> float:
        # Dummy calibration formula. In a real system, you'd have a 2-point or 3-point calibration.
        # Let's assume neutral pH 7 is 1.5V, and the slope is -3.0 pH/V
        # pH = 7.0 - (voltage - 1.5) * 3.0
        return 7.0 - (raw_voltage - 1.5) * 3.0

    def read_ph(self, compartment_id: int) -> float:
        try:
            chan = self.channels.get(compartment_id)
            if not chan:
                raise ValueError(f"Invalid compartment ID: {compartment_id}")
            # Get voltage
            voltage = chan.voltage
            ph = self._voltage_to_ph(voltage)
            return round(ph, 2)
        except Exception as e:
            logger.error(f"Error reading pH for compartment {compartment_id}: {e}")
            raise e


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

    def dose(self, direction: str, steps: int):
        """
        Dose by sending pulses to the Step pin and setting the Dir pin.
        direction: "forward" or "reverse"
        """
        if self.h_gpio is None:
            logger.error(f"Cannot dose pump {self.pump_id}: GPIO not initialized.")
            return

        try:
            dir_val = 1 if direction in (1, "forward") else 0
            lgpio.gpio_write(self.h_gpio, self.dir_pin, dir_val)
            
            logger.info(f"[REAL PUMP {self.pump_id}] Dosing {steps} steps in direction: {direction}")
            for _ in range(steps):
                lgpio.gpio_write(self.h_gpio, self.step_pin, 1)
                time.sleep(self.delay)
                lgpio.gpio_write(self.h_gpio, self.step_pin, 0)
                time.sleep(self.delay)
        except Exception as e:
            logger.error(f"Hardware error during dozing pump {self.pump_id}: {e}")

    def __del__(self):
        try:
            if self.h_gpio is not None:
                lgpio.gpio_free(self.h_gpio, self.step_pin)
                lgpio.gpio_free(self.h_gpio, self.dir_pin)
                lgpio.gpiochip_close(self.h_gpio)
        except Exception:
            pass
