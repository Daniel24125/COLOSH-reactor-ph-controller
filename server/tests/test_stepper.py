import RPi.GPIO as GPIO
import time

# Pin Configuration (BCM numbering)
EN_PIN = 22
STEP_PIN = 27
DIR_PIN = 17

# Constants
STEPS_PER_REV = 20000
# Adjust this delay to change the motor speed (smaller = faster, larger = slower)
STEP_DELAY = 0.001  
PAUSE_SEC = 1.0

def setup():
    print("Setting up GPIO pins...")
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(EN_PIN, GPIO.OUT)
    GPIO.setup(STEP_PIN, GPIO.OUT)
    GPIO.setup(DIR_PIN, GPIO.OUT)
    
    # Disable motor by default (assuming LOW is active, HIGH is disabled)
    GPIO.output(EN_PIN, GPIO.HIGH)
    GPIO.output(STEP_PIN, GPIO.LOW)
    GPIO.output(DIR_PIN, GPIO.LOW)

def motor_step(steps, direction, delay):
    print(f"Moving {'Clockwise' if direction == GPIO.HIGH else 'Counter-Clockwise'} for {steps} steps...")
    GPIO.output(DIR_PIN, direction)
    
    for _ in range(steps):
        GPIO.output(STEP_PIN, GPIO.HIGH)
        time.sleep(delay)
        GPIO.output(STEP_PIN, GPIO.LOW)
        time.sleep(delay)

def main():
    try:
        setup()
        
        print("Initializing test sequence...")
        
        # Enable the motor driver (Active LOW)
        print("Enabling motor driver (EN = LOW)...")
        GPIO.output(EN_PIN, GPIO.LOW)
        time.sleep(0.1) # Brief pause after enabling to let driver settle
        
        # Move Clockwise
        #print("Setting DIR to HIGH (Clockwise)...")
        #motor_step(STEPS_PER_REV, GPIO.HIGH, STEP_DELAY)
        
        # Pause
        #print(f"Pausing for {PAUSE_SEC} second(s)...")
        #time.sleep(PAUSE_SEC)
        
        # Move Counter-Clockwise
        print("Setting DIR to LOW (Counter-Clockwise)...")
        motor_step(STEPS_PER_REV, GPIO.LOW, STEP_DELAY)
        
        print("Test sequence complete.")

    except KeyboardInterrupt:
        print("\nTest interrupted by user.")
    finally:
        print("Cleaning up GPIO...")
        GPIO.cleanup()
        print("Cleanup done. Exiting.")

if __name__ == "__main__":
    main()
