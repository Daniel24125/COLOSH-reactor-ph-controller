import json
import os
from pathlib import Path

# Get the directory where this file is located to construct an absolute path to the config
CONFIG_DIR = Path(__file__).parent
DEFAULT_CONFIG_PATH = CONFIG_DIR / "pp_config.json"

class PumpConfigManager:
    """Helper class to manage the peristaltic pump configurations."""
    
    def __init__(self, config_file_path: str = str(DEFAULT_CONFIG_PATH)):
        self.config_filepath = config_file_path
        # Ensure the file exists (if not, you could optionally create a default here)
        if not os.path.exists(self.config_filepath):
            raise FileNotFoundError(f"Configuration file not found at: {self.config_filepath}")

    def _read_config(self) -> dict:
        """Reads and returns the JSON config data as a dictionary."""
        with open(self.config_filepath, 'r') as file:
            return json.load(file)

    def _write_config(self, config_data: dict):
        """Writes the provided dictionary back to the JSON config file."""
        with open(self.config_filepath, 'w') as file:
            json.dump(config_data, file, indent=2)

    def get_all_pumps(self) -> dict:
        """Retrieves all pump configurations."""
        return self._read_config()

    def get_pump_config(self, location: str) -> dict:
        """
        Retrieves the configuration for a specific pump location.
        Example location format: 'location_1', 'location_2', etc.
        """
        config = self._read_config()
        if location not in config:
            raise KeyError(f"Pump location '{location}' not found in configuration.")
        return config[location]

    def save_calibration(self, location: str, steps_per_ml: float):
        """
        Saves a new calibration value (steps_per_ml) for a specific pump location.
        """
        config = self._read_config()
        if location not in config:
            raise KeyError(f"Pump location '{location}' not found in configuration.")
        
        # Update the value
        config[location]["steps_per_ml"] = float(steps_per_ml)
        
        # Save back to file
        self._write_config(config)
        print(f"Successfully updated calibration for {location} to {steps_per_ml} steps/mL.")

    def update_pump_pins(self, location: str, dir_pin: int, step_pin: int, en_pin: int):
        """
        Updates the hardware GPIO pins for a specific pump location.
        """
        config = self._read_config()
        if location not in config:
            raise KeyError(f"Pump location '{location}' not found in configuration.")
        
        config[location]["dir_pin"] = int(dir_pin)
        config[location]["step_pin"] = int(step_pin)
        config[location]["en_pin"] = int(en_pin)
        
        self._write_config(config)
        print(f"Successfully updated GPIO pins for {location}.")

# Example usage/tester
if __name__ == "__main__":
    # Initialize the manager
    manager = PumpConfigManager()
    
    # Read info for location 1
    print("Fetching config for location_1...")
    loc1_config = manager.get_pump_config("location_1")
    print(loc1_config)
    
    # Save a calibration test
    print("\nUpdating calibration for location_2...")
    manager.save_calibration("location_2", 8400.5)
    
    # Confirm it was updated
    loc2_config = manager.get_pump_config("location_2")
    print(f"Updated config for location_2: {loc2_config}")
