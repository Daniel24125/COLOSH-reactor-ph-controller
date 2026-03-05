import RPi.GPIO as GPIO
import time

class PeristalticPump:
    def __init__(self, dir_pin: int, step_pin: int, en_pin: int, steps_per_ml: float = 1000.0):
        self.dir_pin = dir_pin
        self.step_pin = step_pin
        self.en_pin = en_pin
        self.steps_per_ml = steps_per_ml
        
        # Initialize GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(self.dir_pin, GPIO.OUT)
        GPIO.setup(self.step_pin, GPIO.OUT)
        GPIO.setup(self.en_pin, GPIO.OUT)
        
        # Disable motor by default (EN = HIGH for TMC2209)
        GPIO.output(self.en_pin, GPIO.HIGH)
        # Set default states
        GPIO.output(self.step_pin, GPIO.LOW)
        GPIO.output(self.dir_pin, GPIO.LOW)

    def run_calibration(self, total_steps: int = 10000, safe_delay: float = 0.002):
        print("Running calibration... Weigh the output and divide total_steps by measured mL.")
        try:
            # Enable motor
            GPIO.output(self.en_pin, GPIO.LOW)
            time.sleep(0.1) # Brief pause to let driver settle
            
            for _ in range(total_steps):
                GPIO.output(self.step_pin, GPIO.HIGH)
                time.sleep(safe_delay)
                GPIO.output(self.step_pin, GPIO.LOW)
                time.sleep(safe_delay)
        finally:
            # Disable motor
            GPIO.output(self.en_pin, GPIO.HIGH)

    def inject(self, volume_ml: float, flow_rate_ml_min: float):
        # Math calculations
        total_steps = int(volume_ml * self.steps_per_ml)
        steps_per_sec = (flow_rate_ml_min * self.steps_per_ml) / 60.0
        
        if steps_per_sec > 0:
            delay = 1.0 / (steps_per_sec * 2.0)
        else:
            delay = 0

        # Output calculated parameters
        print(f"Calculated Total Steps: {total_steps}")
        print(f"Calculated Delay: {delay:.6f} seconds")
        
        try:
            # Enable motor
            GPIO.output(self.en_pin, GPIO.LOW)
            # Set Direction
            GPIO.output(self.dir_pin, GPIO.LOW)
            time.sleep(0.1) # Brief pause to let driver settle
            
            for _ in range(total_steps):
                GPIO.output(self.step_pin, GPIO.HIGH)
                time.sleep(delay)
                GPIO.output(self.step_pin, GPIO.LOW)
                time.sleep(delay)
        finally:
            # Disable motor for hardware safety
            GPIO.output(self.en_pin, GPIO.HIGH)

if __name__ == "__main__":
    # Example BCM Pins
    DIR_PIN = 17
    STEP_PIN = 27
    EN_PIN = 22

    try:
        # Instantiate the class
        print("Initializing PeristalticPump...")
        pump = PeristalticPump(dir_pin=DIR_PIN, step_pin=STEP_PIN, en_pin=EN_PIN, steps_per_ml=8351.13)
        
        # Demonstrating a calibration sequence
        #print("\n--- Starting Calibration ---")
        #pump.run_calibration(total_steps=10000, safe_delay=0.002)
        
        # Pause before the injection test
        #print("\nWaiting 2 seconds before injection test...")
        #time.sleep(2)
        
        # Demonstrating a dynamic injection 
        # (5 mL at 20 mL/min)
        print("\n--- Starting Injection ---")
        print("Target: 5.0 mL at 20.0 mL/min")
        pump.inject(volume_ml=2.0, flow_rate_ml_min=20.0)
        
        print("\nTest sequence complete!")
        
    except KeyboardInterrupt:
        print("\nProcess interrupted by user.")
    finally:
        print("Cleaning up GPIO...")
        GPIO.cleanup()
        print("Cleanup done.")
