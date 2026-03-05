"use client";

import { useMqtt } from "@/hooks/useMqtt";
import { useUser } from "@/context/UserContext";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveCalibration, getCalibrationHistory, CalibrationRecord } from "@/actions/calibrationActions";
import { getActiveExperiment } from "@/actions/dbActions";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import mqtt from "mqtt";

import dynamic from "next/dynamic";

// Static calibration form sub-components (needed on first paint for pH tab)
import { CompartmentSelector, LiveSensorReading, BufferSolutionCard, CalibrationSummary } from "@/components/calibration/CalibrationForm";

// Lazy-load tab-deferred components — not needed until user switches tabs or scrolls down
const CalibrationHistoryTable = dynamic(
    () => import("@/components/calibration/CalibrationHistoryTable").then(m => ({ default: m.CalibrationHistoryTable })),
    { ssr: false, loading: () => <div className="mt-12 p-6 text-neutral-500 text-sm">Loading history...</div> }
);
const PumpCalibrationWizard = dynamic(
    () => import("@/components/PumpCalibrationWizard").then(m => ({ default: m.PumpCalibrationWizard })),
    { ssr: false, loading: () => <div className="p-6 text-neutral-500 text-sm">Loading pump wizard...</div> }
);

type CalibrationTab = "ph" | "pump";

export default function CalibrationWizard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { publishCommand } = useMqtt();
    const { user } = useUser();

    // Tab state: driven by ?tab=ph|pump URL param for shareability
    const tabParam = searchParams.get("tab") as CalibrationTab | null;
    const [activeTab, setActiveTab] = useState<CalibrationTab>(tabParam === "pump" ? "pump" : "ph");

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

    const mqttClientRef = useRef<mqtt.MqttClient | null>(null);

    useEffect(() => {
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

    // Only connect MQTT for raw voltage if we are on the pH tab
    useEffect(() => {
        if (isCheckingActive || activeTab !== "ph") return;

        const BROKER_URL = process.env.NEXT_PUBLIC_MQTT_URL || "ws://localhost:9001";
        const client = mqtt.connect(BROKER_URL);
        mqttClientRef.current = client;

        client.on("connect", () => {
            client.subscribe("reactor/calibration/raw");
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
            client.publish("reactor/control/calibration", JSON.stringify({ command: "stop" }));
            client.end();
        };
    }, [activeCompartment, isCheckingActive, activeTab]);

    const handleCompartmentSelect = (cp: number) => {
        setActiveCompartment(cp);
        setV1(null);
        setV2(null);
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

    const handleTabChange = (tab: CalibrationTab) => {
        setActiveTab(tab);
        // Update URL for shareability without a page reload
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.pushState({}, "", url.toString());
    };

    if (isCheckingActive) {
        return <div className="p-8 text-neutral-400">Verifying reactor status...</div>;
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-8 font-sans">
            {/* Page Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link
                    href="/dashboard"
                    className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-medium tracking-tight text-neutral-100">Calibration</h1>
                    <p className="text-sm text-neutral-500">Compensated for 37ºC standard reactor temperature.</p>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 mb-8 w-fit">
                <button
                    onClick={() => handleTabChange("ph")}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "ph"
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                        }`}
                >
                    pH Calibration
                </button>
                <button
                    onClick={() => handleTabChange("pump")}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "pump"
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                        }`}
                >
                    Pump Calibration
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === "ph" && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Left Column: Compartment Selection & Status */}
                        <div className="md:col-span-1 space-y-6">
                            <CompartmentSelector
                                activeCompartment={activeCompartment}
                                onSelect={handleCompartmentSelect}
                            />
                            <LiveSensorReading rawVoltage={rawVoltage} />
                        </div>

                        {/* Right Column: Buffer Wizard */}
                        <div className="md:col-span-2 space-y-6">
                            <BufferSolutionCard
                                bufferNumber={1}
                                phValue={ph1}
                                lockedVoltage={v1}
                                rawVoltage={rawVoltage}
                                onPhChange={setPh1}
                                onLock={() => {
                                    if (rawVoltage !== null) {
                                        setV1(rawVoltage);
                                        toast.success(`Locked Buffer 1 voltage at ${rawVoltage.toFixed(4)}V`);
                                    }
                                }}
                                onUnlock={() => setV1(null)}
                            />

                            <BufferSolutionCard
                                bufferNumber={2}
                                phValue={ph2}
                                lockedVoltage={v2}
                                rawVoltage={rawVoltage}
                                isFirstLocked={v1 !== null}
                                onPhChange={setPh2}
                                onLock={() => {
                                    if (rawVoltage !== null) {
                                        setV2(rawVoltage);
                                        toast.success(`Locked Buffer 2 voltage at ${rawVoltage.toFixed(4)}V`);
                                    }
                                }}
                                onUnlock={() => setV2(null)}
                            />

                            {v1 !== null && v2 !== null && ph1 !== ph2 && (
                                <CalibrationSummary
                                    v1={v1}
                                    v2={v2}
                                    ph1={ph1}
                                    ph2={ph2}
                                    activeCompartment={activeCompartment}
                                    isSaving={isSaving}
                                    onSave={handleSaveCalibration}
                                />
                            )}
                        </div>
                    </div>

                    <CalibrationHistoryTable history={history} />
                </>
            )}

            {activeTab === "pump" && (
                <PumpCalibrationWizard />
            )}
        </div>
    );
}
