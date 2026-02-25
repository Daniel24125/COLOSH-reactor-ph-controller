"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Timer, FlaskConical } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Telemetry, getExperimentLogs, ExperimentLog, getExperimentById, Experiment } from "@/actions/dbActions";
import { EventLogWidget } from "@/components/EventLogWidget";
import { formatDuration } from "@/hooks/useElapsedTime";

export default function ExperimentHistory() {
    const { id } = useParams();
    const [experiment, setExperiment] = useState<Experiment | null>(null);
    const [data, setData] = useState<Telemetry[]>([]);
    const [logs, setLogs] = useState<ExperimentLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHistory() {
            try {
                const [telemRes, historicalLogs, experimentData] = await Promise.all([
                    fetch(`/api/history?experiment_id=${id}`),
                    getExperimentLogs(id as string),
                    getExperimentById(id as string),
                ]);

                const result = await telemRes.json();
                if (result.success) {
                    const formatted = result.data.map((row: Telemetry) => ({
                        ...row,
                        time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    }));
                    setData(formatted);
                }

                setLogs(historicalLogs);
                setExperiment(experimentData);
            } catch (err) {
                console.error("Failed to load telemetry or logs", err);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, [id]);

    // Compute total experiment duration
    // For active experiments, duration is "ongoing". For completed, use last telemetry/log timestamp.
    const endTimestamp = (() => {
        if (!experiment) return null;
        if (experiment.status === "active") return null; // Ongoing
        // Use the latest of last telemetry or last log
        const lastTelem = data.length > 0 ? data[data.length - 1].timestamp : null;
        const lastLog = logs.length > 0 ? logs[logs.length - 1].timestamp : null;
        if (lastTelem && lastLog) return lastTelem > lastLog ? lastTelem : lastLog;
        return lastTelem || lastLog;
    })();

    const totalDuration = experiment && endTimestamp
        ? formatDuration(experiment.created_at, endTimestamp)
        : experiment?.status === "active" ? "Ongoing" : null;

    return (
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            <div>
                <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-neutral-400 mb-6 hover:text-indigo-400 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Projects
                </Link>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-medium tracking-tight text-neutral-100">
                            {experiment?.name || "Historical Review"}
                        </h1>
                        <p className="text-neutral-400 mt-2 flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4" />
                            Started: {experiment ? new Date(experiment.created_at).toLocaleString() : id}
                        </p>
                    </div>

                    {/* Duration stat cards */}
                    {!loading && experiment && (
                        <div className="flex gap-3 shrink-0">
                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
                                <Timer className="w-4 h-4 text-indigo-400" />
                                <div>
                                    <p className="text-xs text-neutral-500 mb-0.5">Total Duration</p>
                                    <p className="text-neutral-200 font-mono font-medium">{totalDuration ?? "—"}</p>
                                </div>
                            </div>
                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
                                <FlaskConical className="w-4 h-4 text-indigo-400" />
                                <div>
                                    <p className="text-xs text-neutral-500 mb-0.5">Status</p>
                                    <p className={`font-medium text-sm ${experiment.status === "active" ? "text-emerald-400" : "text-neutral-400"}`}>
                                        {experiment.status === "active" ? "Active" : "Completed"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Card className="bg-neutral-900 border-neutral-800">
                <CardHeader>
                    <CardTitle className="text-neutral-200">pH Telemetry Data</CardTitle>
                    <CardDescription>Continuous reactor pH logs from SQLite Archive.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-neutral-500">
                            Loading baseline data...
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex items-center justify-center py-20 text-neutral-500">
                            No telemetry data recorded for this run.
                        </div>
                    ) : (
                        <div className="h-[400px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <Line type="monotone" dataKey="compartment_1_ph" stroke="#ef4444" strokeWidth={2} dot={false} name="Compartment 1" />
                                    <Line type="monotone" dataKey="compartment_2_ph" stroke="#3b82f6" strokeWidth={2} dot={false} name="Compartment 2" />
                                    <Line type="monotone" dataKey="compartment_3_ph" stroke="#10b981" strokeWidth={2} dot={false} name="Compartment 3" />
                                    <CartesianGrid stroke="#262626" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="time" stroke="#525252" tick={{ fill: '#737373' }} tickLine={false} />
                                    <YAxis domain={['auto', 'auto']} stroke="#525252" tick={{ fill: '#737373' }} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', color: '#e5e5e5' }}
                                        itemStyle={{ color: '#e5e5e5' }}
                                    />
                                    <Legend />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            {!loading && logs && (
                <div className="mt-8">
                    <EventLogWidget
                        logs={logs as any[]}
                        startedAt={experiment?.created_at}
                    />
                </div>
            )}
        </main>
    );
}
