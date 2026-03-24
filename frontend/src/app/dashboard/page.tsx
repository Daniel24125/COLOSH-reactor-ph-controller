"use client";

import { useMqtt } from "@/hooks/useMqtt";
import { useState, useEffect, useCallback } from "react";
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
    const { isConnected, phData, loggedTelemetry, status, setStatus, eventLogs, dosePump, publishCommand } = useMqtt();
    const [showSetup, setShowSetup] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Project Selection State
    const [projects, setProjects] = useState<Project[]>([]);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");

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
                compartment_1_ph: loggedTelemetry[1] || 0,
                compartment_2_ph: loggedTelemetry[2] || 0,
                compartment_3_ph: loggedTelemetry[3] || 0,
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
            measurementIntervalMins: parseInt(formData.get("measurementIntervalMins") as string),
            c1MinPh: parseFloat(formData.get("c1MinPh") as string),
            c1MaxPh: parseFloat(formData.get("c1MaxPh") as string),
            c2MinPh: parseFloat(formData.get("c2MinPh") as string),
            c2MaxPh: parseFloat(formData.get("c2MaxPh") as string),
            c3MinPh: parseFloat(formData.get("c3MinPh") as string),
            c3MaxPh: parseFloat(formData.get("c3MaxPh") as string),
            maxPumpTimeSec: parseInt(formData.get("maxPumpTimeSec") as string),
            mixingCooldownSec: parseInt(formData.get("mixingCooldownSec") as string),
            manualDoseSteps: parseInt(formData.get("manualDoseSteps") as string),
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
                    manual_dose_steps: data.manualDoseSteps
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
                        isConnected={isConnected}
                        onManualDose={handleManualDose}
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

