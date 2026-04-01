import collections
import asyncio
from typing import Dict, Optional, Any

class ReactorState:
    """
    Encapsulates all transient process state, datastore caches, and
    orchestration signals for the Reactor.
    """

    COMPARTMENTS = [1, 2, 3]

    # Constants needed for initializing data structures
    STABILITY_WINDOW_SIZE = 10
    PH_MOVING_AVG_WINDOW = 10

    def __init__(self):
        # Operational limits & lifecycle
        self.running: bool = False
        self.active_experiment: Optional[Dict[str, Any]] = None
        
        # Calibration state
        self.calibration_mode_compartment: Optional[int] = None
        
        # Timing state
        self.last_measurement_time: float = 0.0
        self.last_dose_time: Dict[int, float] = {c: 0.0 for c in self.COMPARTMENTS}
        
        # Sensor status tracking
        self.sensor_error_logged: Dict[int, bool] = {c: False for c in self.COMPARTMENTS}
        
        # Actuation Locks and Overrides
        self.manual_override: Dict[int, bool] = {c: False for c in self.COMPARTMENTS}
        self.active_dosing_tasks: Dict[int, Optional[asyncio.Task]] = {c: None for c in self.COMPARTMENTS}
        self.active_manual_dose_tasks: Dict[int, Optional[asyncio.Task]] = {c: None for c in self.COMPARTMENTS}
        
        # Sensor Sliding Windows
        self.raw_windows: Dict[int, collections.deque] = {
            c: collections.deque(maxlen=self.STABILITY_WINDOW_SIZE) for c in self.COMPARTMENTS
        }
        self.ph_avg_windows: Dict[int, collections.deque] = {
            c: collections.deque(maxlen=self.PH_MOVING_AVG_WINDOW) for c in self.COMPARTMENTS
        }
        
        # Telemetry Data Logging Buckets (1Hz accumulations)
        self.telemetry_buckets: Dict[int, list] = {c: [] for c in self.COMPARTMENTS}

    def clear_sensor_windows(self, compartment_id: int) -> None:
        """Clear the sensor sliding windows and logging bucket for a given compartment."""
        self.raw_windows[compartment_id].clear()
        self.ph_avg_windows[compartment_id].clear()
        self.telemetry_buckets[compartment_id].clear()

    @property
    def latest_safe_ph(self) -> Dict[int, Optional[float]]:
        """Compute the instantaneous moving average pH for stable compartments."""
        latest_ph = {}
        for c in self.COMPARTMENTS:
            window = self.ph_avg_windows[c]
            ph_list = list(window)
            if ph_list:
                latest_ph[c] = round(sum(ph_list) / len(ph_list), 2)
            else:
                latest_ph[c] = None
        return latest_ph
