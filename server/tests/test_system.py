import os
import sys
import time
import asyncio
import RPi.GPIO as GPIO

# Ensure we can import from the server directory when running from tests/
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
from hardware import get_hardware
from ph_controller import PhController
from database import SQLiteClient
from config.pump_helpers import PumpConfigManager

# Pump Configurations based on pp_config.json
PUMP_PINS = {
    1: {"dir": 22, "step": 27, "en": 17},
    2: {"dir": 25, "step": 24, "en": 23},
    3: {"dir": 21, "step": 20, "en": 16}
}

async def test_sensors(hw, ph_ctrl):
    print("\n=== Testing Sensors ===")
    for compartment in [1, 2, 3]:
        try:
            voltage = await asyncio.to_thread(hw.adc.read_voltage, compartment)
            ph = ph_ctrl.voltage_to_ph(compartment, voltage)
            print(f"Compartment {compartment}: Voltage = {voltage:.4f} V, pH = {ph}")
        except Exception as e:
            print(f"Failed to read sensor from compartment {compartment}: {e}")

def test_pumps(hw):
    print("\n=== Testing Pumps (Direct GPIO) ===")
    
    # FREE lgpio RESOURCES FIRST before RPi.GPIO claims them
    try:
        import lgpio
        if hasattr(hw, "h_gpio") and hw.h_gpio is not None:
             for pump_id, pump in hw.pumps.items():
                  # Free the pins if the object supports it
                  try: lgpio.gpio_free(hw.h_gpio, pump.en_pin)
                  except: pass
                  try: lgpio.gpio_free(hw.h_gpio, pump.dir_pin)
                  except: pass
                  try: lgpio.gpio_free(hw.h_gpio, pump.step_pin)
                  except: pass
             lgpio.gpiochip_close(hw.h_gpio)
             hw.h_gpio = None
        else:
            # Fallback for how RealPeristalticPump is implemented
            if hasattr(hw, "pumps"):
                for pump in hw.pumps.values():
                    if hasattr(pump, "h_gpio") and pump.h_gpio is not None:
                        try: lgpio.gpio_free(pump.h_gpio, pump.en_pin)
                        except: pass
                        try: lgpio.gpio_free(pump.h_gpio, pump.dir_pin)
                        except: pass
                        try: lgpio.gpio_free(pump.h_gpio, pump.step_pin)
                        except: pass
                # Attempt to close the shared chip handle if possible
                try:
                    from hardware.real_hardware import _CHIP_HANDLE
                    if _CHIP_HANDLE is not None:
                       lgpio.gpiochip_close(_CHIP_HANDLE)
                       import hardware.real_hardware
                       hardware.real_hardware._CHIP_HANDLE = None
                except Exception as e:
                    print(f"Warning freeing chip handle: {e}")
    except Exception as e:
        print(f"Warning freeing lgpio: {e}")
        
    # Setup GPIO
    GPIO.setmode(GPIO.BCM)
    for pump_id, pins in PUMP_PINS.items():
        GPIO.setup(pins["en"], GPIO.OUT)
        GPIO.setup(pins["step"], GPIO.OUT)
        GPIO.setup(pins["dir"], GPIO.OUT)
        
        # Disable all motors initially (Active LOW)
        GPIO.output(pins["en"], GPIO.HIGH)
        GPIO.output(pins["step"], GPIO.LOW)
        GPIO.output(pins["dir"], GPIO.LOW)
    
    steps = 4000 # Enough steps to easily see/hear the pump moving
    delay = 0.001
    
    try:
        for pump_id, pins in PUMP_PINS.items():
            print(f"\n--- Motor Test: Pump {pump_id} ---")
            print(f"Enabling motor driver (EN = LOW)...")
            GPIO.output(pins["en"], GPIO.LOW)
            time.sleep(0.1)
            
            print(f"Moving Counter-Clockwise for {steps} steps...")
            GPIO.output(pins["dir"], GPIO.LOW)
            for _ in range(steps):
                GPIO.output(pins["step"], GPIO.HIGH)
                time.sleep(delay)
                GPIO.output(pins["step"], GPIO.LOW)
                time.sleep(delay)
                
            # Disable motor again
            GPIO.output(pins["en"], GPIO.HIGH)
            time.sleep(1) # Pause between pumps
    finally:
        print("Cleaning up GPIO...")
        GPIO.cleanup()

async def test_system():
    print("=== System Test Initialization ===")
    hw = get_hardware()
    
    try:
        db_path = os.getenv("SQLITE_DB_PATH", "reactor.db")
        sqlite = SQLiteClient(db_path=db_path)
        calibrations = sqlite.get_latest_calibrations()
        print("Loaded calibrations from the database.")
    except Exception as e:
        print(f"Failed to load DB calibrations, using defaults: {e}")
        calibrations = {}

    ph_ctrl = PhController(calibrations)
    
    await test_sensors(hw, ph_ctrl)
    
    # Run the direct RPi.GPIO pump test
    test_pumps(hw)

    print("\n=== System Test Complete ===")


if __name__ == "__main__":
    load_dotenv()
    try:
        asyncio.run(test_system())
    except KeyboardInterrupt:
        print("\nTest interrupted by user. Exiting safely.")
        try:
            GPIO.cleanup()
        except:
            pass
