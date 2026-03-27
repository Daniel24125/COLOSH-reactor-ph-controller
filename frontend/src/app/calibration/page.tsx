"use client";

import { useMqtt } from "@/hooks/useMqtt";
import { useUser } from "@/context/UserContext";
import { useState, useEffect, useRef, Suspense } from "react";
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

function CalibrationWizardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { publishCommand, isConnected, isServerOnline, phData } = useMqtt();
    const isOperational = isConnected && isServerOnline === true;
    const { user } = useUser();

    // Tab state: driven by ?tab=ph|pump URL param for shareability
    const tabParam = searchParams.get("tab") as CalibrationTab | null;
    const [activeTab, setActiveTab] = useState<CalibrationTab>(tabParam === "pump" ? "pump" : "ph");

    const [activeCompartment, setActiveCompartment] = useState<number>(1);

    // Raw ADC integer streamed from the dedicated calibration MQTT topic
    const [rawValue, setRawValue] = useState<number | null>(null);

    const [isCheckingActive, setIsCheckingActive] = useState(true);

    // Two calibration points — stored as (pH, raw) pairs
    const [ph1, setPh1] = useState<number>(7.0);
    const [raw1, setRaw1] = useState<number | null>(null);

    const [ph2, setPh2] = useState<number>(4.0);
    const [raw2, setRaw2] = useState<number | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [history, setHistory] = useState<CalibrationRecord[]>([]);

    const mqttClientRef = useRef<mqtt.MqttClient | null>(null);

    // Derive stability and offline status from the global phData context.
    // The backend is the single source of truth for the status flags.
    const compartmentData = phData[activeCompartment as 1 | 2 | 3];
    const isStable = compartmentData?.stable ?? false;
    const isOffline = compartmentData?.isOffline ?? true;

    const fetchHistory = async () => {
        const records = await getCalibrationHistory();
        setHistory(records);
    };

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

    // Open a dedicated MQTT connection for the raw ADC stream when on the pH tab.
    // This is separate from the global context connection so the calibration topic
    // can be subscribed independently without polluting the main telemetry state.
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
                    // Backend now publishes { raw_value: <int> }
                    // Sticky logic: ignore null values so the display persists the last valid reading
                    if (payload.raw_value !== undefined && payload.raw_value !== null) {
                        setRawValue(payload.raw_value);
                    }
                } catch (err) {
                    console.error("Failed to parse raw ADC value", err);
                }
            }
        });

        return () => {
            if (client.connected) {
                client.publish("reactor/control/calibration", JSON.stringify({ command: "stop" }));
            }
            client.end();
        };
    }, [activeCompartment, isCheckingActive, activeTab]);

    const handleCompartmentSelect = (cp: number) => {
        setActiveCompartment(cp);
        setRaw1(null);
        setRaw2(null);
        setRawValue(null);
    };

    const handleSaveCalibration = async () => {
        if (raw1 === null || raw2 === null) {
            toast.error("Both buffer raw readings must be locked before saving.");
            return;
        }
        if (ph1 === ph2) {
            toast.error("Buffer pH values must be different.");
            return;
        }
        if (raw1 === raw2) {
            toast.error("Buffer raw readings must be different — check your electrode connection.");
            return;
        }

        setIsSaving(true);
        const success = await saveCalibration(
            activeCompartment,
            ph1, raw1,
            ph2, raw2,
            user?.name || "Unknown"
        );
        setIsSaving(false);

        if (success) {
            toast.success(`Compartment ${activeCompartment} calibrated successfully.`);
            publishCommand("reactor/control/calibration", { action: "reload_calibration" });
            setRaw1(null);
            setRaw2(null);
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
                    <p className="text-sm text-neutral-500">
                        Two-point empirical calibration using raw ADS1115 ADC readings.
                    </p>
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
                        {/* Left Column: Compartment Selection & Live Reading */}
                        <div className="md:col-span-1 space-y-6">
                            <CompartmentSelector
                                activeCompartment={activeCompartment}
                                onSelect={handleCompartmentSelect}
                            />
                            <LiveSensorReading
                                rawValue={rawValue}
                                isStable={isStable}
                                isOffline={isOffline}
                            />
                        </div>

                        {/* Right Column: Buffer Wizard */}
                        <div className="md:col-span-2 space-y-6">
                            <BufferSolutionCard
                                bufferNumber={1}
                                phValue={ph1}
                                lockedRaw={raw1}
                                rawValue={rawValue}
                                isStable={isStable}
                                isOffline={isOffline}
                                isOperational={isOperational}
                                onPhChange={setPh1}
                                onLock={() => {
                                    if (rawValue !== null) {
                                        setRaw1(rawValue);
                                        toast.success(`Locked Buffer 1 at raw ${rawValue.toLocaleString()}`);
                                    }
                                }}
                                onUnlock={() => setRaw1(null)}
                            />

                            <BufferSolutionCard
                                bufferNumber={2}
                                phValue={ph2}
                                lockedRaw={raw2}
                                rawValue={rawValue}
                                isStable={isStable}
                                isOffline={isOffline}
                                isFirstLocked={raw1 !== null}
                                isOperational={isOperational}
                                onPhChange={setPh2}
                                onLock={() => {
                                    if (rawValue !== null) {
                                        setRaw2(rawValue);
                                        toast.success(`Locked Buffer 2 at raw ${rawValue.toLocaleString()}`);
                                    }
                                }}
                                onUnlock={() => setRaw2(null)}
                            />

                            {raw1 !== null && raw2 !== null && ph1 !== ph2 && (
                                <CalibrationSummary
                                    raw1={raw1}
                                    raw2={raw2}
                                    ph1={ph1}
                                    ph2={ph2}
                                    activeCompartment={activeCompartment}
                                    isSaving={isSaving}
                                    isOperational={isOperational}
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

export default function CalibrationWizard() {
    return (
        <Suspense fallback={<div className="p-8 text-neutral-400">Loading calibration...</div>}>
            <CalibrationWizardContent />
        </Suspense>
    );
}
