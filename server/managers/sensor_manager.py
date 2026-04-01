import asyncio
import logging
from typing import Dict, Any, Callable, Awaitable

logger = logging.getLogger(__name__)

class SensorManager:
    """
    Handles hardware ADC interfacing, signal filtering (sliding windows), 
    and pH computation.
    """

    # A reading is considered stable when the spread of the window
    # (max − min in raw ADC steps) is below this threshold.
    STABILITY_THRESHOLD = 250

    def __init__(
        self, 
        hw: Any, 
        state: Any, 
        ph_ctrl: Any,
        log_event_callback: Callable[[str, str, int], Awaitable[None]],
        mqtt_client: Any
    ):
        self.hw = hw
        self.state = state
        self.ph_ctrl = ph_ctrl
        self.log_event = log_event_callback
        self.mqtt = mqtt_client

    async def read_and_process(self) -> Dict[int, Dict[str, Any]]:
        """
        Read raw ADC values from all compartments, apply stability windowing,
        convert to pH, and return a composite telemetry dict.
        """
        sensor_data = {}
        
        for compartment_id in self.state.COMPARTMENTS:
            try:
                raw = await asyncio.to_thread(self.hw.adc.read_raw_value, compartment_id)

                if raw is not None:
                    # 1. Hardware Stability: spread of raw ADC integers
                    raw_window = self.state.raw_windows[compartment_id]
                    raw_window.append(raw)
                    is_stable = (
                        len(raw_window) >= 2
                        and (max(raw_window) - min(raw_window)) < self.STABILITY_THRESHOLD
                    )

                    # 2. Convert raw to instantaneous pH
                    inst_ph = self.ph_ctrl.raw_to_ph(compartment_id, raw)

                    # 3. Process Stability: Moving Average pH
                    ph_avg_window = self.state.ph_avg_windows[compartment_id]
                    ph_avg_window.append(inst_ph)
                    ma_ph = round(sum(ph_avg_window) / len(ph_avg_window), 2)

                    # 4. DAQ Bucketing: accumulate for logging
                    self.state.telemetry_buckets[compartment_id].append(inst_ph)

                    sensor_data[compartment_id] = {
                        "ph": ma_ph,       # Dashboard display & dosing use MA
                        "raw": raw,        # Raw used for calibration UI
                        "stable": is_stable,
                    }
                else:
                    # Sensor offline — clear windows and buckets
                    self.state.clear_sensor_windows(compartment_id)
                    sensor_data[compartment_id] = {"ph": None, "raw": None, "stable": False}

                # In calibration mode, stream the latest raw value to the frontend
                if self.state.calibration_mode_compartment == compartment_id:
                    self.mqtt.publish_raw_value({"raw_value": raw})

                # State recovery check
                if self.state.sensor_error_logged[compartment_id] and raw is not None:
                    logger.info(f"Sensor for compartment {compartment_id} recovered.")
                    if self.log_event:
                        await self.log_event("INFO", "Sensor recovered.", compartment_id)
                    self.state.sensor_error_logged[compartment_id] = False

            except Exception as exc:
                if not self.state.sensor_error_logged[compartment_id]:
                    logger.error(f"Error reading sensor for compartment {compartment_id}: {exc}")
                    if self.log_event:
                        await self.log_event("ERROR", f"Failed to read sensor: {exc}", compartment_id)
                    self.state.sensor_error_logged[compartment_id] = True
                sensor_data[compartment_id] = {"ph": None, "raw": None, "stable": False}

        return sensor_data
