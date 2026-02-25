import json
import logging
import asyncio
import os
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)

class MQTTClient:
    def __init__(self, broker_url=None, port=None, client_id="reactor_core"):
        self.broker_url = broker_url or os.getenv("MQTT_BROKER_URL", "localhost")
        self.port = port or int(os.getenv("MQTT_PORT", "1883"))
        self.client_id = client_id
        
        # We'll set these up from main.py
        self.on_manual_control = None
        self.on_auto_update = None
        self.on_experiment_config = None
        
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self.client_id)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

    def connect(self):
        try:
            self.client.connect(self.broker_url, self.port, 60)
            self.client.loop_start()
            logger.info(f"Started MQTT loop, connecting to {self.broker_url}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            logger.info("Connected to MQTT Broker!")
            client.subscribe("reactor/control/pump/manual")
            client.subscribe("reactor/control/pump/auto")
            client.subscribe("reactor/control/experiment")
        else:
            logger.error(f"Failed to connect, return code {reason_code}")

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        payload = msg.payload.decode("utf-8")
        logger.debug(f"Received message on {topic}: {payload}")
        
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON received on {topic}: {payload}")
            return

        if topic == "reactor/control/pump/manual" and self.on_manual_control:
            # Expected payload: {"pump_id": 1, "direction": "forward", "steps": 100}
            asyncio.run_coroutine_threadsafe(
                self.on_manual_control(data),
                asyncio.get_running_loop()
            )
        elif topic == "reactor/control/pump/auto" and self.on_auto_update:
            # Expected payload: {"experiment_id": 1, "ph_min": 6.8, "ph_max": 7.2}
            asyncio.run_coroutine_threadsafe(
                self.on_auto_update(data),
                asyncio.get_running_loop()
            )
        elif topic == "reactor/control/experiment" and self.on_experiment_config:
            asyncio.run_coroutine_threadsafe(
                self.on_experiment_config(data),
                asyncio.get_running_loop()
            )

    def publish_telemetry(self, ph_data: dict):
        """Publish real-time pH telemetry. ph_data: {1: 7.0, 2: 7.1, 3: 6.9}"""
        try:
            self.client.publish("reactor/telemetry/ph", json.dumps(ph_data))
        except Exception as e:
            logger.error(f"Failed to publish real-time telemetry: {e}")

    def publish_logged_telemetry(self, ph_data: dict):
        """Publish pH telemetry aligned with DB logging interval."""
        try:
            self.client.publish("reactor/telemetry/logged", json.dumps(ph_data))
        except Exception as e:
            logger.error(f"Failed to publish logged telemetry: {e}")

    def publish_status(self, status_data: dict):
        """Publish system status."""
        try:
            self.client.publish("reactor/status", json.dumps(status_data))
        except Exception as e:
            logger.error(f"Failed to publish status: {e}")

    def publish_event(self, level: str, message: str, compartment: int = None):
        """Publish event logs."""
        from datetime import datetime
        try:
            payload = {
                "level": level,
                "message": message,
                "compartment": compartment,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
            self.client.publish("reactor/events", json.dumps(payload))
        except Exception as e:
            logger.error(f"Failed to publish event: {e}")

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()
