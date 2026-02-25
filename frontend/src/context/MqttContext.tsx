"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import mqtt from "mqtt";
import { toast } from "sonner";

const BROKER_URL = process.env.NEXT_PUBLIC_MQTT_URL || "ws://localhost:9001";

type PhData = { 1?: number; 2?: number; 3?: number };
type Status = { health?: string; active_experiment?: string | null; db_connected?: boolean };
type LogEvent = { id: string; level: string; message: string; timestamp: string; compartment: number | null };

interface MqttContextValue {
    client: mqtt.MqttClient | null;
    isConnected: boolean;
    isServerOnline: boolean | null;
    phData: PhData;
    loggedTelemetry: PhData;
    status: Status;
    setStatus: React.Dispatch<React.SetStateAction<Status>>;
    eventLogs: LogEvent[];
    dosePump: (pumpId: number, direction: "forward" | "reverse", steps: number) => void;
    updateAutoThresholds: (experimentId: string, phMin: number, phMax: number) => void;
    publishCommand: (topic: string, payload: object) => void;
}

const MqttContext = createContext<MqttContextValue | null>(null);

export function MqttProvider({ children }: { children: ReactNode }) {
    const [client, setClient] = useState<mqtt.MqttClient | null>(null);
    const [phData, setPhData] = useState<PhData>({});
    const [loggedTelemetry, setLoggedTelemetry] = useState<PhData>({});
    const [status, setStatus] = useState<Status>({});
    const [eventLogs, setEventLogs] = useState<LogEvent[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);

    useEffect(() => {
        console.log("MqttProvider: connecting to", BROKER_URL);
        const mqttClient = mqtt.connect(BROKER_URL);

        mqttClient.on("connect", () => {
            console.log("MQTT Connected");
            setIsConnected(true);
            mqttClient.subscribe("reactor/telemetry/ph");
            mqttClient.subscribe("reactor/telemetry/logged");
            mqttClient.subscribe("reactor/status");
            mqttClient.subscribe("reactor/events");
            mqttClient.subscribe("reactor/server/status");
        });

        mqttClient.on("message", (topic, message) => {
            try {
                const payload = JSON.parse(message.toString());
                if (topic === "reactor/telemetry/ph") {
                    setPhData(payload);
                } else if (topic === "reactor/telemetry/logged") {
                    setLoggedTelemetry(payload);
                } else if (topic === "reactor/status") {
                    setStatus(payload);
                } else if (topic === "reactor/events") {
                    setEventLogs((prev) => [...prev, { id: Math.random().toString(36).substring(7), ...payload }].slice(-100));
                } else if (topic === "reactor/server/status") {
                    const online = payload.status === "online";
                    setIsServerOnline((prev) => {
                        // Only toast on actual transitions from a KNOWN state.
                        // Skip null → true (initial retained-message delivery on connect).
                        if (prev === false && online) {
                            toast.success("Reactor server is back online.");
                        } else if (prev === true && !online) {
                            toast.error("Reactor server went offline.");
                        }
                        return online;
                    });
                }
            } catch (err) {
                console.error("MQTT parse error", err);
            }
        });

        mqttClient.on("error", (err) => {
            console.error("MQTT Error:", err);
            mqttClient.end();
        });

        mqttClient.on("offline", () => setIsConnected(false));
        mqttClient.on("close", () => setIsConnected(false));

        setClient(mqttClient);
        return () => {
            console.log("MqttProvider: disconnecting");
            mqttClient.end();
        };
    }, []);

    const dosePump = (pumpId: number, direction: "forward" | "reverse", steps: number) => {
        if (client && isConnected) {
            client.publish("reactor/control/pump/manual", JSON.stringify({ pump_id: pumpId, direction, steps }));
        }
    };

    const updateAutoThresholds = (experimentId: string, phMin: number, phMax: number) => {
        if (client && isConnected) {
            client.publish("reactor/control/pump/auto", JSON.stringify({ experiment_id: experimentId, ph_min: phMin, ph_max: phMax }));
        }
    };

    const publishCommand = (topic: string, payload: object) => {
        if (client && isConnected) {
            client.publish(topic, JSON.stringify(payload));
        }
    };

    return (
        <MqttContext.Provider value={{
            client, isConnected, isServerOnline,
            phData, loggedTelemetry, status, setStatus, eventLogs,
            dosePump, updateAutoThresholds, publishCommand,
        }}>
            {children}
        </MqttContext.Provider>
    );
}

export function useMqttContext(): MqttContextValue {
    const ctx = useContext(MqttContext);
    if (!ctx) throw new Error("useMqttContext must be used within MqttProvider");
    return ctx;
}
