"use client";

import { useState, useEffect } from "react";
import mqtt from "mqtt";

// Ensure this runs only on the client side
const BROKER_URL = "ws://localhost:9001"; // Mosquitto over WebSockets

export function useMqtt() {
    const [client, setClient] = useState<mqtt.MqttClient | null>(null);
    const [phData, setPhData] = useState<{ 1?: number; 2?: number; 3?: number }>({});
    const [status, setStatus] = useState<{ health?: string; active_experiment?: number | null; db_connected?: boolean }>({});
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        console.log("Connecting to MQTT broker at", BROKER_URL);
        const mqttClient = mqtt.connect(BROKER_URL);

        mqttClient.on("connect", () => {
            console.log("MQTT Connected");
            setIsConnected(true);
            mqttClient.subscribe("reactor/telemetry/ph");
            mqttClient.subscribe("reactor/status");
        });

        mqttClient.on("message", (topic, message) => {
            try {
                const payload = JSON.parse(message.toString());
                if (topic === "reactor/telemetry/ph") {
                    setPhData(payload);
                } else if (topic === "reactor/status") {
                    setStatus(payload);
                }
            } catch (err) {
                console.error("Error parsing MQTT message", err);
            }
        });

        mqttClient.on("error", (err) => {
            console.error("MQTT Error:", err);
            mqttClient.end();
        });

        mqttClient.on("offline", () => {
            console.log("MQTT Offline");
            setIsConnected(false);
        });

        mqttClient.on("close", () => {
            console.log("MQTT Closed");
            setIsConnected(false);
        });

        setClient(mqttClient);

        return () => {
            console.log("Disconnecting from MQTT broker");
            mqttClient.end();
        };
    }, []);

    const dosePump = (pumpId: number, direction: "forward" | "reverse", steps: number) => {
        if (client && isConnected) {
            client.publish(
                "reactor/control/pump/manual",
                JSON.stringify({ pump_id: pumpId, direction, steps })
            );
        } else {
            console.warn("Cannot dose, MQTT not connected");
        }
    };

    const updateAutoThresholds = (experimentId: number, phMin: number, phMax: number) => {
        if (client && isConnected) {
            client.publish(
                "reactor/control/pump/auto",
                JSON.stringify({ experiment_id: experimentId, ph_min: phMin, ph_max: phMax })
            );
        } else {
            console.warn("Cannot update thresholds, MQTT not connected");
        }
    };

    return { isConnected, phData, status, dosePump, updateAutoThresholds };
}
