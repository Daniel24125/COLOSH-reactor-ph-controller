import os
import logging
from config.pump_helpers import PumpConfigManager

logger = logging.getLogger(__name__)

class HardwareAbstractions:
    def __init__(self, adc, pumps, PeristalticPump, GPIO_AVAILABLE):
        self.adc = adc
        self.pumps = pumps
        self.PeristalticPump = PeristalticPump
        self.GPIO_AVAILABLE = GPIO_AVAILABLE

def get_hardware() -> HardwareAbstractions:
    """Factory to get the correct hardware implementation based on OS."""
    
    # Load configuration
    config_mgr = PumpConfigManager()
    p1 = config_mgr.get_pump_config("location_1")
    p2 = config_mgr.get_pump_config("location_2")
    p3 = config_mgr.get_pump_config("location_3")
    
    if os.name == 'nt':
        logger.info("Windows detected. Loading mock hardware.")
        from .mock_hardware import MockADC, PeristalticPump as MockPump
        adc = MockADC()
        # High-level pump interface for both dosing and calibration
        pumps = {
            1: MockPump(dir_pin=p1["dir_pin"], step_pin=p1["step_pin"], en_pin=p1["en_pin"], steps_per_ml=p1.get("steps_per_ml", 1000.0)),
            2: MockPump(dir_pin=p2["dir_pin"], step_pin=p2["step_pin"], en_pin=p2["en_pin"], steps_per_ml=p2.get("steps_per_ml", 1000.0)),
            3: MockPump(dir_pin=p3["dir_pin"], step_pin=p3["step_pin"], en_pin=p3["en_pin"], steps_per_ml=p3.get("steps_per_ml", 1000.0))
        }
        PeristalticPump = MockPump
        GPIO_AVAILABLE = False
    else:
        logger.info("POSIX detected. Loading real hardware via lgpio/I2C.")
        from .real_hardware import RealADC, RealPeristalticPump
        adc = RealADC()
        # Use RealPeristalticPump for all pump operations (Dosing + Calibration)
        pumps = {
            1: RealPeristalticPump(dir_pin=p1["dir_pin"], step_pin=p1["step_pin"], en_pin=p1["en_pin"], steps_per_ml=p1.get("steps_per_ml", 1000.0)),
            2: RealPeristalticPump(dir_pin=p2["dir_pin"], step_pin=p2["step_pin"], en_pin=p2["en_pin"], steps_per_ml=p2.get("steps_per_ml", 1000.0)),
            3: RealPeristalticPump(dir_pin=p3["dir_pin"], step_pin=p3["step_pin"], en_pin=p3["en_pin"], steps_per_ml=p3.get("steps_per_ml", 1000.0))
        }
        PeristalticPump = RealPeristalticPump
        GPIO_AVAILABLE = True
    
    return HardwareAbstractions(adc, pumps, PeristalticPump, GPIO_AVAILABLE)
