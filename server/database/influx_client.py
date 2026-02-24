import logging
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

logger = logging.getLogger(__name__)

class InfluxClient:
    def __init__(self, url='http://localhost:8086', token='my-super-secret-auth-token', org='my-org', bucket='reactor'):
        self.url = url
        self.token = token
        self.org = org
        self.bucket = bucket
        try:
            self.client = InfluxDBClient(url=self.url, token=self.token, org=self.org)
            self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
            logger.info("InfluxDB client initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize InfluxDB client: {e}")

    def log_ph(self, experiment_id: str, compartment_id: int, ph_value: float):
        try:
            point = Point("ph_reading") \
                .tag("experiment_id", str(experiment_id)) \
                .tag("compartment_id", str(compartment_id)) \
                .field("ph", float(ph_value))
            self.write_api.write(bucket=self.bucket, record=point)
        except Exception as e:
            logger.error(f"Error logging pH to InfluxDB: {e}")

    def log_pump_action(self, experiment_id: str, pump_id: int, direction: str, steps: int):
        try:
            point = Point("pump_action") \
                .tag("experiment_id", str(experiment_id)) \
                .tag("pump_id", str(pump_id)) \
                .tag("direction", direction) \
                .field("steps", int(steps))
            self.write_api.write(bucket=self.bucket, record=point)
        except Exception as e:
            logger.error(f"Error logging pump action to InfluxDB: {e}")
            
    def close(self):
        try:
            self.client.close()
        except:
            pass
