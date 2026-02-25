import json
import logging
import asyncio
import os
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)

class MQTTClient:
    SERVER_STATUS_TOPIC = "reactor/server/status"

    def __init__(self, broker_url=None, port=None, client_id="reactor_core"):
        self.broker_url = broker_url or os.getenv("MQTT_BROKER_URL", "localhost")
        self.port = port or int(os.getenv("MQTT_PORT", "1883"))
        self.client_id = client_id

        # Callbacks set by main.py
        self.on_manual_control = None
        self.on_auto_update = None
        self.on_experiment_config = None
        self.on_calibration_control = None

        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self.client_id)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

        # Asyncio event loop reference — captured at connect() time from the main thread
        self._loop = None

        # Last Will and Testament — broker delivers this automatically on unexpected disconnect
        offline_payload = json.dumps({"status": "offline"})
        self.client.will_set(self.SERVER_STATUS_TOPIC, payload=offline_payload, qos=1, retain=True)

    def connect(self):
        try:
            # Capture the running asyncio loop here, while we are still in the asyncio thread.
            # _on_message runs in paho's background thread which has no event loop of its own.
            self._loop = asyncio.get_running_loop()
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
            client.subscribe("reactor/control/calibration")
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
            asyncio.run_coroutine_threadsafe(
                self.on_manual_control(data),
                self._loop
            )
        elif topic == "reactor/control/pump/auto" and self.on_auto_update:
            asyncio.run_coroutine_threadsafe(
                self.on_auto_update(data),
                self._loop
            )
        elif topic == "reactor/control/experiment" and self.on_experiment_config:
            asyncio.run_coroutine_threadsafe(
                self.on_experiment_config(data),
                self._loop
            )
        elif topic == "reactor/control/calibration" and self.on_calibration_control:
            asyncio.run_coroutine_threadsafe(
                self.on_calibration_control(data),
                self._loop
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

    def publish_raw_voltage(self, voltage_data: dict):
        """Publish raw voltage for calibration."""
        try:
            self.client.publish("reactor/calibration/raw", json.dumps(voltage_data))
        except Exception as e:
            logger.error(f"Failed to publish raw voltage: {e}")

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

    def publish_server_online(self):
        """Publish online status. Call this after the MQTT connection is confirmed."""
        try:
            self.client.publish(
                self.SERVER_STATUS_TOPIC,
                json.dumps({"status": "online"}),
                qos=1,
                retain=True,
            )
            logger.info("Published server status: online")
        except Exception as e:
            logger.error(f"Failed to publish online status: {e}")

    def publish_server_offline(self):
        """Explicitly publish offline status before a clean shutdown."""
        try:
            self.client.publish(
                self.SERVER_STATUS_TOPIC,
                json.dumps({"status": "offline"}),
                qos=1,
                retain=True,
            )
            logger.info("Published server status: offline")
        except Exception as e:
            logger.error(f"Failed to publish offline status: {e}")

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()
