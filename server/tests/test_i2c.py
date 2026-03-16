import sys
import time
import argparse

def test_i2c_busio():
    print("Testing I2C connection using board/busio...")
    try:
        import board
        import busio
    except ImportError as e:
        print(f"[-] Error importing board/busio: {e}")
        print("[-] Please ensure adafruit-blinka is installed.")
        return False
        
    try:
        print("[+] Initializing I2C bus...")
        # board.SCL and board.SDA typically map to I2C bus 1 on Raspberry Pi
        i2c = busio.I2C(board.SCL, board.SDA)
        print("[+] I2C bus initialized successfully.")
        
        print("[+] Scanning I2C bus...")
        # Need to lock the bus before scanning
        while not i2c.try_lock():
            time.sleep(0.01)
            
        try:
            devices = i2c.scan()
            if devices:
                print(f"[+] Found {len(devices)} I2C device(s) at addresses: {[hex(device) for device in devices]}")
            else:
                print("[-] No I2C devices found on the bus.")
        finally:
            i2c.unlock()
            
        return True
    except ValueError as e:
        print(f"[-] ValueError during I2C busio test: {e}")
        print("[-] This usually means the I2C interface is disabled in raspi-config.")
        return False
    except PermissionError as e:
        print(f"[-] PermissionError during I2C busio test: {e}")
        print("[-] Check if your user is in the 'i2c' group (e.g. `sudo usermod -aG i2c $USER`).")
        return False
    except Exception as e:
        print(f"[-] Error during I2C busio test: {type(e).__name__}: {e}")
        return False

def test_ads1115():
    print("\nTesting ADS1115 specific connection...")
    try:
        import board
        import busio
        import adafruit_ads1x15.ads1115 as ADS
        from adafruit_ads1x15.analog_in import AnalogIn
        from adafruit_ads1x15.ads1x15 import Pin
    except ImportError as e:
        print(f"[-] Error importing adafruit_ads1x15: {e}")
        return False
        
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        print("[+] Attempting to initialize ADS1115...")
        ads = ADS.ADS1115(i2c)
        print("[+] ADS1115 object created.")
        
        print("[+] Attempting to read voltage from Channel 0 (P0)...")
        chan = AnalogIn(ads, Pin.A0)
        voltage = chan.voltage
        print(f"[+] Successfully read voltage: {voltage:.4f}V")
        return True
    except Exception as e:
        print(f"[-] Error during ADS1115 test: {type(e).__name__}: {e}")
        print(f"[-] This typically happens when the ADS1115 is not properly connected to the I2C pins.")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test I2C connection and ADS1115.")
    parser.add_argument("--scan-only", action="store_true", help="Only scan the I2C bus, skip ADS1115 test")
    args = parser.parse_args()

    print("=" * 40)
    print("Started I2C Diagnostic Tests")
    print("=" * 40)
    
    busio_ok = test_i2c_busio()
    
    ads_ok = None
    if not args.scan_only:
        ads_ok = test_ads1115()
    
    print("\n" + "=" * 40)
    print("Test Summary:")
    print("-" * 40)
    print(f"I2C Bus Init & Scan: {'PASS' if busio_ok else 'FAIL'}")
    if not args.scan_only:
        print(f"ADS1115 Read Test:   {'PASS' if ads_ok else 'FAIL'}")
    print("=" * 40)
    
    if not busio_ok or (not args.scan_only and not ads_ok):
        sys.exit(1)
