import os
import logging

logger = logging.getLogger(__name__)

class HardwareAbstractions:
    def __init__(self, adc, pumps, PeristalticPump, GPIO_AVAILABLE):
        self.adc = adc
        self.pumps = pumps
        self.PeristalticPump = PeristalticPump
        self.GPIO_AVAILABLE = GPIO_AVAILABLE

def get_hardware() -> HardwareAbstractions:
    """Factory to get the correct hardware implementation based on OS."""
    if os.name == 'nt':
        logger.info("Windows detected. Loading mock hardware.")
        from .mock_hardware import MockADC, PeristalticPump as MockPump
        adc = MockADC()
        # High-level pump interface for both dosing and calibration
        pumps = {
            1: MockPump(dir_pin=17, step_pin=27, en_pin=22),
            2: MockPump(dir_pin=23, step_pin=24, en_pin=25),
            3: MockPump(dir_pin=16, step_pin=20, en_pin=21)
        }
        PeristalticPump = MockPump
        GPIO_AVAILABLE = False
    else:
        logger.info("POSIX detected. Loading real hardware via lgpio/I2C.")
        from .real_hardware import RealADC, RealPeristalticPump
        adc = RealADC()
        # Use RealPeristalticPump for all pump operations (Dosing + Calibration)
        pumps = {
            1: RealPeristalticPump(dir_pin=17, step_pin=27, en_pin=22),
            2: RealPeristalticPump(dir_pin=23, step_pin=24, en_pin=25),
            3: RealPeristalticPump(dir_pin=16, step_pin=20, en_pin=21)
        }
        PeristalticPump = RealPeristalticPump
        GPIO_AVAILABLE = True
    
    return HardwareAbstractions(adc, pumps, PeristalticPump, GPIO_AVAILABLE)
