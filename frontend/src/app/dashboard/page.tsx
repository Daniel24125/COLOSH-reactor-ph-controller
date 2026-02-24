"use client";

import { useMqtt } from "@/hooks/useMqtt";
import { useState, useEffect } from "react";
import { Project, getProjects, stopExperiment, getTelemetry, Telemetry } from "@/actions/dbActions";
import { Droplet, Activity, Database, AlertCircle, PlayCircle, Square } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { EventLogWidget } from "@/components/EventLogWidget";
import Link from "next/link";

export default function Dashboard() {
    const { isConnected, phData, status, eventLogs, dosePump, publishCommand } = useMqtt();
    const [showSetup, setShowSetup] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Project Selection State
    // Project Selection State
    const [projects, setProjects] = useState<Project[]>([]);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");

    // Telemetry Chart State
    const [chartData, setChartData] = useState<(Telemetry & { timeStr: string })[]>([]);

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

    // Append new live MQTT points to chart
    useEffect(() => {
        if (status.active_experiment && Object.keys(phData).length > 0) {
            const now = new Date();
            const newPoint = {
                id: now.getTime().toString(),
                experiment_id: status.active_experiment,
                timestamp: now.toISOString(),
                timeStr: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                compartment_1_ph: phData[1] || 0,
                compartment_2_ph: phData[2] || 0,
                compartment_3_ph: phData[3] || 0,
            };

            setChartData(prev => {
                const updated = [...prev, newPoint];
                // Keep chart from growing infinitely, cap at 50 local points
                if (updated.length > 50) return updated.slice(-50);
                return updated;
            });
        }
    }, [phData, status.active_experiment]);

    // Fetch projects on mount for widget and modal
    const fetchProjectsList = () => {
        getProjects().then(data => {
            setProjects(data);
            if (data.length > 0 && !selectedProjectId) {
                setSelectedProjectId(data[0].id.toString());
            } else if (data.length === 0) {
                setIsCreatingProject(true); // Force create if no projects exist
            }
        });
    };

    useEffect(() => {
        fetchProjectsList();
    }, []);

    const handleManualDose = (pumpId: number) => {
        dosePump(pumpId, "forward", 50); // 50 steps default dose
        toast.info(`Override: Activated Pump ${pumpId} for 50 steps`);
    };

    const handleStopExperiment = async () => {
        if (!status.active_experiment) return;

        setIsSubmitting(true);
        try {
            const success = await stopExperiment(status.active_experiment);
            if (success) {
                // Publish the stop command so the Python backend loop shuts down logging
                publishCommand("reactor/control/pump/auto", { action: "stop" });
                toast.success(`Experiment #${status.active_experiment} stopped successfully`);
            } else {
                toast.error("Database failed to mark experiment as completed.");
            }
        } catch (err) {
            console.error(err);
            toast.error("An unexpected error occurred while stopping the experiment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSetupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);
        const data = {
            projectId: !isCreatingProject ? selectedProjectId : undefined,
            projectName: isCreatingProject ? formData.get("projectName") : undefined,
            researcherName: isCreatingProject ? formData.get("researcherName") : undefined,
            experimentName: formData.get("experimentName"),
            targetPhMin: parseFloat(formData.get("targetPhMin") as string),
            targetPhMax: parseFloat(formData.get("targetPhMax") as string),
        };

        try {
            const res = await fetch("/api/experiment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (res.ok) {
                setShowSetup(false);
                toast.success("Experiment started and auto-thresholds deployed!");
                // MQTT Auto-Thresholds will be updated by Python backend detecting DB change, 
                // or we could force a reload here if needed.
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
            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-medium tracking-tight text-neutral-100">Live Control Room</h1>
                    <div className="flex items-center gap-3">
                        <CreateProjectDialog onSuccess={fetchProjectsList} />
                    </div>
                </div>

                {/* Active Experiment Banner */}
                {status.active_experiment ? (
                    <div className="bg-indigo-950/30 border border-indigo-800/50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-500/20 p-2 rounded-lg">
                                <PlayCircle className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <p className="text-sm text-indigo-400/80 font-medium">Active Experiment</p>
                                <p className="text-neutral-200">ID: {status.active_experiment}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleStopExperiment}
                                disabled={isSubmitting}
                                className="px-4 py-2 flex items-center gap-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors border border-red-500/20 shadow-lg shadow-red-900/10 disabled:opacity-50"
                            >
                                <Square className="w-4 h-4" />
                                {isSubmitting ? "Stopping..." : "Stop Experiment"}
                            </button>
                            <div className="text-sm px-3 py-1 bg-indigo-900/50 text-indigo-300 rounded-full border border-indigo-700/50 flex shrink-0 items-center justify-center">
                                Logging active
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-neutral-400">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5" />
                            <p>No active experiment. Telemetry is not being recorded to DB.</p>
                        </div>
                        <button
                            onClick={() => setShowSetup(true)}
                            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all font-medium flex shrink-0 items-center justify-center"
                        >
                            Start Setup
                        </button>
                    </div>
                )}

                {/* Setup Modal */}
                {showSetup && (
                    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                            <h2 className="text-xl font-medium text-neutral-200 mb-4">New Experiment Validation</h2>
                            <form onSubmit={handleSetupSubmit} className="space-y-4">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-medium text-neutral-400">Project Assignment</label>
                                        {projects.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setIsCreatingProject(!isCreatingProject)}
                                                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                                            >
                                                {isCreatingProject ? "Select Existing" : "+ Create New"}
                                            </button>
                                        )}
                                    </div>

                                    {!isCreatingProject ? (
                                        <select
                                            value={selectedProjectId}
                                            onChange={(e) => setSelectedProjectId(e.target.value)}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors"
                                        >
                                            {projects.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.researcher_name})</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-neutral-500 mb-1">New Project Name</label>
                                                <input required={isCreatingProject} name="projectName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Bio-Reactor" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-neutral-500 mb-1">Researcher Name</label>
                                                <input required={isCreatingProject} name="researcherName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Dr. Smith" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Experiment Name</label>
                                    <input required name="experimentName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Test Run Alpha" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">Target pH (Min)</label>
                                        <input required name="targetPhMin" type="number" step="0.1" defaultValue="6.8" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">Target pH (Max)</label>
                                        <input required name="targetPhMax" type="number" step="0.1" defaultValue="7.2" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" />
                                    </div>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setShowSetup(false)} className="flex-1 px-4 py-2 text-neutral-400 bg-neutral-800 hover:bg-neutral-700/80 rounded-lg transition-colors border border-neutral-700/50">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all font-medium">
                                        {isSubmitting ? "Starting..." : "Start Validation"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Telemetry Grid */}
                <div>
                    <h2 className="text-lg font-medium text-neutral-200 mb-4">Live Telemetry</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map((id) => (
                            <div key={id} className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden group">
                                {/* Decorative background glow */}
                                <div className="absolute top-0 right-0 p-8 w-32 h-32 bg-indigo-500/5 blur-3xl group-hover:bg-indigo-500/10 transition-colors duration-500" />

                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center font-mono text-sm text-neutral-400">
                                            C{id}
                                        </div>
                                        <span className="text-neutral-400 font-medium">Compartment {id}</span>
                                    </div>
                                    <Droplet className="w-5 h-5 text-neutral-600 group-hover:text-indigo-500/50 transition-colors" />
                                </div>

                                <div className="flex items-baseline gap-2">
                                    <span className="text-5xl font-light tracking-tight text-neutral-100">
                                        {phData[id as keyof typeof phData] !== undefined
                                            ? phData[id as keyof typeof phData]?.toFixed(2)
                                            : "--"}
                                    </span>
                                    <span className="text-neutral-500 text-lg">pH</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Live Chart Canvas */}
                    {status.active_experiment && chartData.length > 0 && (
                        <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-400 font-medium mb-4 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-indigo-400" /> Real-time Progression
                            </h3>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                        <Line type="monotone" dataKey="compartment_1_ph" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} name="Compartment 1" />
                                        <Line type="monotone" dataKey="compartment_2_ph" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} name="Compartment 2" />
                                        <Line type="monotone" dataKey="compartment_3_ph" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} name="Compartment 3" />
                                        <CartesianGrid stroke="#262626" strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="timeStr" stroke="#525252" tick={{ fill: '#737373', fontSize: 12 }} tickLine={false} />
                                        <YAxis domain={['auto', 'auto']} stroke="#525252" tick={{ fill: '#737373' }} tickLine={false} width={40} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', color: '#e5e5e5' }}
                                            itemStyle={{ color: '#e5e5e5' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                {/* Manual Override & Recent Projects Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Manual Override Control */}
                    <div>
                        <h2 className="text-lg font-medium text-neutral-200 mb-4">Manual Override</h2>
                        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 h-[calc(100%-2rem)] flex flex-col justify-between">
                            <div className="grid grid-cols-1 gap-4">
                                {[1, 2, 3].map((id) => (
                                    <button
                                        key={`pump-${id}`}
                                        onClick={() => handleManualDose(id)}
                                        disabled={!isConnected}
                                        className="group relative overflow-hidden flex items-center justify-between p-4 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-neutral-800"
                                    >
                                        <div className="flex flex-col items-start gap-1">
                                            <span className="text-neutral-400 text-sm font-medium">Pump {id}</span>
                                            <span className="text-neutral-200">Dose Base</span>
                                        </div>
                                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500 group-hover:scale-110 transition-all">
                                            <Droplet className="w-4 h-4 text-indigo-400 group-hover:text-neutral-950 transition-colors" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-neutral-500 text-sm mt-4">
                                Clicking a pump immediately forces a 50-step dose. Overrides any active auto-loop.
                            </p>
                        </div>
                    </div>

                    {/* Recent Projects Widget */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-medium text-neutral-200">Recent Projects</h2>
                            <Link href="/projects" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                                View Archive &rarr;
                            </Link>
                        </div>
                        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 h-[calc(100%-2rem)]">
                            {projects.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-3 border border-neutral-800 border-dashed rounded-xl p-6">
                                    <Database className="w-8 h-8 opacity-50" />
                                    <p>No projects found. Create one to get started.</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {projects.slice(0, 5).map(project => (
                                        <li key={project.id}>
                                            <Link
                                                href={`/projects/${project.id}`}
                                                className="block p-4 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-indigo-500/50 transition-all group"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h3 className="text-neutral-200 font-medium group-hover:text-indigo-400 transition-colors">
                                                            {project.name}
                                                        </h3>
                                                        <p className="text-xs text-neutral-500 mt-1">
                                                            {project.researcher_name} &bull; {new Date(project.created_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <div className="text-neutral-600 group-hover:text-indigo-500 transition-colors">
                                                        &rarr;
                                                    </div>
                                                </div>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                {/* Event Logs Widget */}
                {status.active_experiment && (
                    <div className="pt-4">
                        <EventLogWidget logs={eventLogs} />
                    </div>
                )}

            </main>
        </div>
    );
}
