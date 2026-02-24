"use client";

import { useState, useEffect } from "react";
import mqtt from "mqtt";

// Ensure this runs only on the client side
const BROKER_URL = process.env.NEXT_PUBLIC_MQTT_URL || "ws://localhost:9001"; // Fallback to Mosquitto over WebSockets

export function useMqtt() {
    const [client, setClient] = useState<mqtt.MqttClient | null>(null);
    const [phData, setPhData] = useState<{ 1?: number; 2?: number; 3?: number }>({});
    const [status, setStatus] = useState<{ health?: string; active_experiment?: string | null; db_connected?: boolean }>({});
    const [eventLogs, setEventLogs] = useState<{ id: string; level: string; message: string; timestamp: string; compartment: number | null }[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        console.log("Connecting to MQTT broker at", BROKER_URL);
        const mqttClient = mqtt.connect(BROKER_URL);

        mqttClient.on("connect", () => {
            console.log("MQTT Connected");
            setIsConnected(true);
            mqttClient.subscribe("reactor/telemetry/ph");
            mqttClient.subscribe("reactor/status");
            mqttClient.subscribe("reactor/events");
        });

        mqttClient.on("message", (topic, message) => {
            try {
                const payload = JSON.parse(message.toString());
                if (topic === "reactor/telemetry/ph") {
                    setPhData(payload);
                } else if (topic === "reactor/status") {
                    setStatus(payload);
                } else if (topic === "reactor/events") {
                    setEventLogs((prev) => [...prev, { id: Math.random().toString(36).substring(7), ...payload }].slice(-100));
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

    const updateAutoThresholds = (experimentId: string, phMin: number, phMax: number) => {
        if (client && isConnected) {
            client.publish(
                "reactor/control/pump/auto",
                JSON.stringify({ experiment_id: experimentId, ph_min: phMin, ph_max: phMax })
            );
        } else {
            console.warn("Cannot update thresholds, MQTT not connected");
        }
    };

    const publishCommand = (topic: string, payload: object) => {
        if (client && isConnected) {
            client.publish(topic, JSON.stringify(payload));
        } else {
            console.warn("Cannot publish command, MQTT not connected");
        }
    };

    return { isConnected, phData, status, eventLogs, dosePump, updateAutoThresholds, publishCommand };
}
