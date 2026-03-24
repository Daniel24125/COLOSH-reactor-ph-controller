import RPi.GPIO as GPIO
import time
pumps = {
    "pump2":{
        "dir_pin": 25,
        "step_pin": 24,
        "en_pin": 23
    }
}
selected_pump = "pump2"
EN_PIN = pumps[selected_pump]["en_pin"]
STEP_PIN = pumps[selected_pump]["step_pin"]
DIR_PIN = pumps[selected_pump]["dir_pin"]

print(f"Testing Pump: EN={EN_PIN}, DIR={DIR_PIN}, STEP={STEP_PIN}")
GPIO.setmode(GPIO.BCM)
GPIO.setup([DIR_PIN, STEP_PIN, EN_PIN], GPIO.OUT)
GPIO.output(EN_PIN, GPIO.LOW)
GPIO.output(DIR_PIN, GPIO.HIGH)
for _ in range(500):
    GPIO.output(STEP_PIN, GPIO.HIGH)
    time.sleep(0.001)
    GPIO.output(STEP_PIN, GPIO.LOW)
    time.sleep(0.001)
GPIO.cleanup()
print("Done!")
