import os
import logging

logger = logging.getLogger(__name__)

class HardwareAbstractions:
    def __init__(self, adc, pumps):
        self.adc = adc
        self.pumps = pumps

def get_hardware() -> HardwareAbstractions:
    """Factory to get the correct hardware implementation based on OS."""
    if os.name == 'nt':
        logger.info("Windows detected. Loading mock hardware.")
        from .mock_hardware import MockADC, MockStepper
        adc = MockADC()
        pumps = {
            1: MockStepper(pump_id=1),
            2: MockStepper(pump_id=2),
            3: MockStepper(pump_id=3)
        }
    else:
        logger.info("POSIX detected. Loading real hardware via lgpio/I2C.")
        from .real_hardware import RealADC, RealStepper
        adc = RealADC()
        # Define pins: (step_pin, dir_pin)
        pumps = {
            1: RealStepper(pump_id=1, step_pin=17, dir_pin=27),
            2: RealStepper(pump_id=2, step_pin=22, dir_pin=23),
            3: RealStepper(pump_id=3, step_pin=24, dir_pin=25)
        }
    
    return HardwareAbstractions(adc, pumps)
