"use client";

import { useMqtt } from "@/hooks/useMqtt";
import { useState, useEffect, useCallback, useRef } from "react";
import { getProjects, stopExperiment, getTelemetry, getActiveExperiment } from "@/actions/dbActions";
import { getCalibrationStatus } from "@/actions/calibrationActions";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { toast } from "sonner";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { EventLogWidget } from "@/components/EventLogWidget";
import { Experiment, Telemetry, Project } from "@/types";

import dynamic from "next/dynamic";
import { CalibrationWarningBanner, ActiveExperimentBanner } from "@/components/dashboard/ExperimentBanners";
import { ManualOverrideControl, RecentProjectsWidget } from "@/components/dashboard/DashboardControls";
import { TelemetryGrid, LiveTelemetryChart } from "@/components/dashboard/TelemetryWidgets";

// Lazy-load heavy/deferred components — not needed on initial paint
const SetupExperimentModal = dynamic(
    () => import("@/components/dashboard/DashboardControls").then(m => ({ default: m.SetupExperimentModal })),
    { ssr: false }
);

export default function Dashboard() {
    const { isConnected, isServerOnline, phData, loggedTelemetry, status, setStatus, eventLogs, dosePump, publishCommand, reactorData, setReactorData, client } = useMqtt();
    const isOperational = isConnected && isServerOnline === true;
    const [showSetup, setShowSetup] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Project Selection State
    const [projects, setProjects] = useState<Project[]>([]);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");

    // RPC State
    const [isLoading, setIsLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(false);
    const hasRequestedStatus = useRef(false);
    const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Telemetry Chart State
    const [chartData, setChartData] = useState<(Telemetry & { timeStr: string })[]>([]);

    // Calibration State
    const [calibrationWarning, setCalibrationWarning] = useState<string | null>(null);
    const [isCalibrationValid, setIsCalibrationValid] = useState(true);
    const [isCalibrationWarningDismissed, setIsCalibrationWarningDismissed] = useState(false);

    // Active experiment state - sourced from DB on mount for instant render
    const [activeExperiment, setActiveExperiment] = useState<Experiment | null>(null);
    const elapsedTime = useElapsedTime(activeExperiment?.created_at ?? null);

    // Fetch initial status from DB so we don't wait for periodic MQTT ping
    useEffect(() => {
        // RPC Loop
        if (isConnected && client) {
            if (hasRequestedStatus.current) return;
            hasRequestedStatus.current = true;

            const isLocal = typeof window !== 'undefined' && 
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            const timeoutMs = isLocal ? 2000 : 5000;
            
            publishCommand("colosh/request_status", { request: "full_state" });

            statusTimeoutRef.current = setTimeout(() => {
                setIsLoading((prev) => {
                    if (prev) setIsOnline(false);
                    return false;
                });
            }, timeoutMs);

            return () => {
                if (statusTimeoutRef.current) {
                    clearTimeout(statusTimeoutRef.current);
                }
            };
        }
    }, [isConnected, client]);

    useEffect(() => {
        if (reactorData) {
            if (statusTimeoutRef.current) {
                clearTimeout(statusTimeoutRef.current);
                statusTimeoutRef.current = null;
            }
            setIsOnline(true);
            setIsLoading(false);
            
            // Sync status with the fresh RPC payload
            if (reactorData.active_experiment) {
                 setStatus(prev => ({
                    ...prev,
                    active_experiment: reactorData.active_experiment,
                    db_connected: reactorData.db_connected
                 }));
                 setActiveExperiment(reactorData.experiment_config);
            }
        }
    }, [reactorData, setStatus]);

    useEffect(() => {
        // Fallback for direct DB lookup, though RPC payload should ideally handle this now
        getActiveExperiment().then(exp => {
            if (exp) {
                setActiveExperiment(exp);
                // Also prime the MQTT status so other parts of the dashboard react
                setStatus(prev => ({
                    ...prev,
                    active_experiment: exp.id,
                    db_connected: true
                }));
            }
        });

        // Check calibration status on mount
        getCalibrationStatus().then((res) => {
            if (res.requiresCalibration) {
                setCalibrationWarning(res.message);
                setIsCalibrationValid(false);
            } else {
                setCalibrationWarning(null);
                setIsCalibrationValid(true);
            }
        });
    }, [setStatus]);

    // Fetch baseline telemetry when an active experiment is detected
    useEffect(() => {
        if (status.active_experiment) {
            getTelemetry(status.active_experiment.toString()).then(data => {
                const formatted = data.map(row => ({
                    ...row,
                    timeStr: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }));
                // Only keep last 50 points to avoid browser lag
                setChartData(formatted.slice(-50));
            });
        } else {
            setChartData([]); // clear chart when no experiment
        }
    }, [status.active_experiment]);

    // Append new live MQTT points to chart (uses loggedTelemetry to respect interval)
    useEffect(() => {
        if (status.active_experiment && Object.keys(loggedTelemetry).length > 0) {
            const now = new Date();
            const newPoint = {
                id: now.getTime().toString(),
                experiment_id: status.active_experiment,
                timestamp: now.toISOString(),
                timeStr: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                compartment_1_ph: loggedTelemetry[1] ?? null,
                compartment_2_ph: loggedTelemetry[2] ?? null,
                compartment_3_ph: loggedTelemetry[3] ?? null,
            };

            setChartData(prev => {
                const updated = [...prev, newPoint];
                // Keep chart from growing infinitely, cap at 50 local points
                if (updated.length > 50) return updated.slice(-50);
                return updated;
            });
        }
    }, [loggedTelemetry, status.active_experiment]);

    // Fetch projects on mount for widget and modal
    const fetchProjectsList = useCallback(() => {
        getProjects().then(data => {
            setProjects(data);
            if (data.length > 0 && !selectedProjectId) {
                setSelectedProjectId(data[0].id.toString());
            } else if (data.length === 0) {
                setIsCreatingProject(true);
            }
        });
    }, [selectedProjectId]);

    useEffect(() => {
        fetchProjectsList();
    }, [fetchProjectsList]);

    const handleManualDose = useCallback((pumpId: number) => {
        dosePump(pumpId, "forward");
        toast.info(`Override: Activated Pump ${pumpId}`);
    }, [dosePump]);

    const handleStopExperiment = useCallback(async () => {
        if (!activeExperiment) return;

        setIsSubmitting(true);
        try {
            const success = await stopExperiment(activeExperiment.id);
            if (success) {
                publishCommand("reactor/control/pump/auto", { action: "stop" });
                toast.success(`Experiment "${activeExperiment.name}" stopped successfully`);
                setActiveExperiment(null);
                setStatus(prev => ({ ...prev, active_experiment: null }));
            } else {
                toast.error("Database failed to mark experiment as completed.");
            }
        } catch (err) {
            console.error(err);
            toast.error("An unexpected error occurred while stopping the experiment.");
        } finally {
            setIsSubmitting(false);
        }
    }, [activeExperiment, publishCommand, setStatus]);

    const handleSetupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);
        const data = {
            projectId: !isCreatingProject ? selectedProjectId : undefined,
            projectName: isCreatingProject ? formData.get("projectName") : undefined,
            researcherName: isCreatingProject ? formData.get("researcherName") : undefined,
            experimentName: formData.get("experimentName"),
            measurementIntervalMins: parseInt(formData.get("measurementIntervalMins") as string) || 1,
            c1MinPh: parseFloat(formData.get("c1MinPh") as string) || 0,
            c1MaxPh: parseFloat(formData.get("c1MaxPh") as string) || 14,
            c2MinPh: parseFloat(formData.get("c2MinPh") as string) || 0,
            c2MaxPh: parseFloat(formData.get("c2MaxPh") as string) || 14,
            c3MinPh: parseFloat(formData.get("c3MinPh") as string) || 0,
            c3MaxPh: parseFloat(formData.get("c3MaxPh") as string) || 14,
            maxPumpTimeSec: parseInt(formData.get("maxPumpTimeSec") as string) || 2,
            mixingCooldownSec: parseInt(formData.get("mixingCooldownSec") as string) || 30,
            phMovingAvgWindow: parseInt(formData.get("phMovingAvgWindow") as string) || 10,
        };

        try {
            const res = await fetch("/api/experiment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (res.ok) {
                const { experimentId } = await res.json();
                setShowSetup(false);
                toast.success("Experiment started and auto-thresholds deployed!");
                // Refresh active experiment from DB so the banner and timer appear immediately
                getActiveExperiment().then(exp => {
                    if (exp) setActiveExperiment(exp);
                });
                // Publish new configuration payload to MQTT so Python adapts instantly
                publishCommand("reactor/control/experiment", {
                    experiment_id: experimentId,
                    measurement_interval_mins: data.measurementIntervalMins,
                    c1_min_ph: data.c1MinPh, c1_max_ph: data.c1MaxPh,
                    c2_min_ph: data.c2MinPh, c2_max_ph: data.c2MaxPh,
                    c3_min_ph: data.c3MinPh, c3_max_ph: data.c3MaxPh,
                    max_pump_time_sec: data.maxPumpTimeSec,
                    mixing_cooldown_sec: data.mixingCooldownSec,
                    ph_moving_avg_window: data.phMovingAvgWindow
                });
            } else {
                toast.error("Failed to compile or start experiment on backend.");
            }
        } catch (err) {
            console.error("Error submitting experiment:", err);
            toast.error("Network or internal generic error occurred while pairing experiment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p>Connecting to Reactor Core...</p>
                </div>
            </div>
        );
    }

    if (!isOnline && !isServerOnline) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-900 to-neutral-950">
                <div className="max-w-md w-full border border-red-500/20 bg-red-500/5 rounded-xl p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <span className="text-3xl">🔌</span>
                    </div>
                    <h2 className="text-xl font-medium text-red-400">Reactor Offline</h2>
                    <p className="text-neutral-400">
                        The Next.js dashboard could not establish a connection to the Python backend core.
                    </p>
                    <div className="pt-6 space-y-2 text-sm text-neutral-500 text-left bg-neutral-900/50 p-4 rounded-lg">
                        <p className="font-medium text-neutral-400">Troubleshooting:</p>
                        <ul className="list-disc pl-4 space-y-1">
                            <li>Check if <code className="text-pink-400">main.py</code> is running on the Pi</li>
                            <li>Verify MQTT Broker (Mosquitto) is operational</li>
                            <li>Check network/Tailscale connectivity</li>
                        </ul>
                    </div>
                    <button 
                        onClick={() => window.location.reload()}
                        className="mt-6 w-full py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors"
                    >
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="text-neutral-100 font-sans selection:bg-indigo-500/30">
            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-medium tracking-tight text-neutral-100">Live Control Room</h1>
                    <div className="flex items-center gap-3">
                        <CreateProjectDialog onSuccess={fetchProjectsList} />
                    </div>
                </div>

                {calibrationWarning && !isCalibrationWarningDismissed && (
                    <CalibrationWarningBanner 
                        message={calibrationWarning} 
                        onDismiss={() => setIsCalibrationWarningDismissed(true)} 
                    />
                )}

                <ActiveExperimentBanner
                    experiment={activeExperiment}
                    elapsedTime={elapsedTime}
                    isSubmitting={isSubmitting}
                    onStopExperiment={handleStopExperiment}
                    onStartSetup={() => setShowSetup(true)}
                    isCalibrationValid={isCalibrationValid || isCalibrationWarningDismissed}
                    isOperational={isOperational}
                />

                {showSetup && (
                    <SetupExperimentModal
                        projects={projects}
                        isCreatingProject={isCreatingProject}
                        selectedProjectId={selectedProjectId}
                        isSubmitting={isSubmitting}
                        onClose={() => setShowSetup(false)}
                        onSubmit={handleSetupSubmit}
                        onToggleCreateProject={() => setIsCreatingProject(!isCreatingProject)}
                        onSelectProject={setSelectedProjectId}
                        isOperational={isOperational}
                    />
                )}

                <div>
                    <TelemetryGrid phData={phData} />

                    {status.active_experiment && chartData.length > 0 && (
                        <LiveTelemetryChart data={chartData} />
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <ManualOverrideControl
                        isOperational={isOperational}
                    />

                    <RecentProjectsWidget projects={projects} />
                </div>

                {status.active_experiment && (
                    <div className="pt-4">
                        <EventLogWidget logs={eventLogs} />
                    </div>
                )}

            </main>
        </div>
    );
}

