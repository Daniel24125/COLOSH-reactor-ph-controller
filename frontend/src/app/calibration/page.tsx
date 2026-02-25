"use client";

import { useMqtt } from "@/hooks/useMqtt";
import { useUser } from "@/context/UserContext";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveCalibration, getCalibrationHistory, CalibrationRecord } from "@/actions/calibrationActions";
import { getActiveExperiment } from "@/actions/dbActions";
import { toast } from "sonner";
import { Beaker, Save, Lock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import mqtt from "mqtt";

export default function CalibrationWizard() {
    const router = useRouter();
    const { publishCommand } = useMqtt();
    const { user } = useUser();

    const [activeCompartment, setActiveCompartment] = useState<number>(1);
    const [rawVoltage, setRawVoltage] = useState<number | null>(null);
    const [isCheckingActive, setIsCheckingActive] = useState(true);

    const [ph1, setPh1] = useState<number>(7.0);
    const [v1, setV1] = useState<number | null>(null);

    const [ph2, setPh2] = useState<number>(4.0);
    const [v2, setV2] = useState<number | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<CalibrationRecord[]>([]);

    const fetchHistory = async () => {
        const records = await getCalibrationHistory();
        setHistory(records);
    };

    // Reference to an isolated MQTT client specifically for the raw voltage subscription
    const mqttClientRef = useRef<mqtt.MqttClient | null>(null);

    useEffect(() => {
        // Only check DB — don't add status.active_experiment as a dep
        // (it changes on every MQTT tick and would re-run this guard repeatedly)
        getActiveExperiment().then(exp => {
            if (exp) {
                toast.error("Cannot calibrate while an experiment is active.");
                router.push("/dashboard");
            } else {
                setIsCheckingActive(false);
                fetchHistory();
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    // Isolated MQTT connection for raw voltage to avoid polluting the main hook context
    // and easily managing the start/stop lifecycle.
    useEffect(() => {
        if (isCheckingActive) return;

        const BROKER_URL = process.env.NEXT_PUBLIC_MQTT_URL || "ws://localhost:9001";
        const client = mqtt.connect(BROKER_URL);
        mqttClientRef.current = client;

        client.on("connect", () => {
            client.subscribe("reactor/calibration/raw");
            // Start publishing raw voltage for the current compartment
            client.publish("reactor/control/calibration", JSON.stringify({
                command: "start",
                compartment: activeCompartment
            }));
        });

        client.on("message", (topic, message) => {
            if (topic === "reactor/calibration/raw") {
                try {
                    const payload = JSON.parse(message.toString());
                    if (payload.raw_voltage !== undefined) {
                        setRawVoltage(payload.raw_voltage);
                    }
                } catch (err) {
                    console.error("Failed to parse raw voltage", err);
                }
            }
        });

        return () => {
            // Cleanup: send stop command
            client.publish("reactor/control/calibration", JSON.stringify({ command: "stop" }));
            client.end();
        };
    }, [activeCompartment, isCheckingActive]);

    const handleLockFirst = () => {
        if (rawVoltage !== null) {
            setV1(rawVoltage);
            toast.success(`Locked Buffer 1 voltage at ${rawVoltage.toFixed(4)}V`);
        }
    };

    const handleLockSecond = () => {
        if (rawVoltage !== null) {
            setV2(rawVoltage);
            toast.success(`Locked Buffer 2 voltage at ${rawVoltage.toFixed(4)}V`);
        }
    };

    const handleSaveCalibration = async () => {
        if (v1 === null || v2 === null) {
            toast.error("Both buffer voltages must be locked before saving.");
            return;
        }
        if (ph1 === ph2) {
            toast.error("Buffer pH values must be different.");
            return;
        }

        const slope = (v2 - v1) / (ph2 - ph1);
        const intercept = v1 - (slope * (ph1 - 7.0));

        setIsSaving(true);
        const success = await saveCalibration(
            activeCompartment,
            slope,
            intercept,
            user?.name || "Unknown"
        );
        setIsSaving(false);

        if (success) {
            toast.success(`Compartment ${activeCompartment} calibrated successfully.`);
            // Notify the Python backend to reload calibrations via the shared MQTT context
            publishCommand("reactor/control/calibration", { action: "reload_calibration" });
            setV1(null);
            setV2(null);
            setPh1(7.0);
            setPh2(4.0);
            fetchHistory();
        } else {
            toast.error("Failed to save calibration data.");
        }
    };

    if (isCheckingActive) {
        return <div className="p-8 text-neutral-400">Verifying reactor status...</div>;
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-8 font-sans">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard" className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-medium tracking-tight text-neutral-100">pH 2-Point Calibration</h1>
                    <p className="text-sm text-neutral-500">Compensated for 37ºC standard reactor temperature.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Left Column: Compartment Selection & Status */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                        <label className="block text-sm font-medium text-neutral-400 mb-3">Select Compartment</label>
                        <div className="space-y-2">
                            {[1, 2, 3].map(cp => (
                                <button
                                    key={`cp-${cp}`}
                                    onClick={() => {
                                        setActiveCompartment(cp);
                                        setV1(null);
                                        setV2(null);
                                    }}
                                    className={`w-full flex items-center justify-center py-3 rounded-lg border transition-all text-sm font-medium ${activeCompartment === cp
                                        ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20"
                                        : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-900"
                                        }`}
                                >
                                    Compartment {cp}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center">
                        <span className="block text-sm font-medium text-neutral-400 mb-2">Live Sensor Reading</span>
                        <div className="text-4xl font-light tracking-tight text-indigo-400 mb-1">
                            {rawVoltage !== null ? rawVoltage.toFixed(4) : "---"} <span className="text-xl text-neutral-500">V</span>
                        </div>
                        <div className="text-xs text-neutral-500 flex items-center justify-center gap-1">
                            {rawVoltage !== null ? (
                                <><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></span> Streaming at ~2Hz</>
                            ) : (
                                "Connecting..."
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Buffer Wizard */}
                <div className="md:col-span-2 space-y-6">
                    {/* Buffer 1 */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium text-neutral-200 flex items-center gap-2">
                                <span className="bg-neutral-800 text-neutral-300 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold">1</span>
                                Buffer Solution 1
                            </h3>
                            {v1 !== null && <Lock className="w-4 h-4 text-emerald-500" />}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-1">Buffer pH Value</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={ph1}
                                    onChange={(e) => setPh1(parseFloat(e.target.value))}
                                    disabled={v1 !== null}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-1">Locked Voltage</label>
                                <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 font-mono">
                                    {v1 !== null ? `${v1.toFixed(4)} V` : "--- V"}
                                </div>
                            </div>
                        </div>

                        {v1 === null ? (
                            <button
                                onClick={handleLockFirst}
                                disabled={rawVoltage === null}
                                className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors border border-neutral-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Lock className="w-4 h-4" /> Lock Stabilization Voltage
                            </button>
                        ) : (
                            <button
                                onClick={() => setV1(null)}
                                className="w-full py-2 bg-neutral-950 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 rounded-lg transition-colors border border-neutral-800 text-sm font-medium"
                            >
                                Unlock & Retake
                            </button>
                        )}
                    </div>

                    {/* Buffer 2 */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium text-neutral-200 flex items-center gap-2">
                                <span className="bg-neutral-800 text-neutral-300 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold">2</span>
                                Buffer Solution 2
                            </h3>
                            {v2 !== null && <Lock className="w-4 h-4 text-emerald-500" />}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-1">Buffer pH Value</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={ph2}
                                    onChange={(e) => setPh2(parseFloat(e.target.value))}
                                    disabled={v2 !== null}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-500 mb-1">Locked Voltage</label>
                                <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 font-mono">
                                    {v2 !== null ? `${v2.toFixed(4)} V` : "--- V"}
                                </div>
                            </div>
                        </div>

                        {v2 === null ? (
                            <button
                                onClick={handleLockSecond}
                                disabled={rawVoltage === null || v1 === null} // Block until buf 1 is ready
                                className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors border border-neutral-700 disabled:opacity-50 text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Lock className="w-4 h-4" /> Lock Stabilization Voltage
                            </button>
                        ) : (
                            <button
                                onClick={() => setV2(null)}
                                className="w-full py-2 bg-neutral-950 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 rounded-lg transition-colors border border-neutral-800 text-sm font-medium"
                            >
                                Unlock & Retake
                            </button>
                        )}
                    </div>

                    {/* Summary & Save */}
                    {v1 !== null && v2 !== null && ph1 !== ph2 && (
                        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h4 className="text-indigo-400 font-medium text-sm">Calibration Computed</h4>
                                    <p className="text-neutral-400 text-xs mt-1">
                                        Slope: {((v2 - v1) / (ph2 - ph1)).toFixed(4)} V/pH <br />
                                        Intercept (pH 7): {(v1 - (((v2 - v1) / (ph2 - ph1)) * (ph1 - 7.0))).toFixed(4)} V
                                    </p>
                                </div>
                                <Beaker className="w-8 h-8 text-indigo-500/50" />
                            </div>

                            <button
                                onClick={handleSaveCalibration}
                                disabled={isSaving}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <Save className="w-5 h-5" />
                                {isSaving ? "Saving..." : `Apply Calibration to Compartment ${activeCompartment}`}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Calibration History Table */}
            <div className="mt-12 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-neutral-800">
                    <h3 className="text-lg font-medium text-neutral-200">Calibration History</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-neutral-400">
                        <thead className="bg-neutral-950/50 text-xs uppercase text-neutral-500 border-b border-neutral-800">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Compartment</th>
                                <th className="px-6 py-3">Slope (V/pH)</th>
                                <th className="px-6 py-3">Intercept (V)</th>
                                <th className="px-6 py-3">Researcher</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                                        No calibration records found.
                                    </td>
                                </tr>
                            ) : (
                                history.map((record) => (
                                    <tr key={record.id} className="hover:bg-neutral-800/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-neutral-300">
                                            {new Date(record.calibrated_at).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-800 text-xs font-bold text-neutral-300">
                                                {record.compartment}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono">{record.slope.toFixed(4)}</td>
                                        <td className="px-6 py-4 font-mono">{record.intercept.toFixed(4)}</td>
                                        <td className="px-6 py-4">{record.researcher || "Unknown"}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
