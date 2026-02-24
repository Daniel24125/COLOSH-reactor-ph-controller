"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Telemetry } from "@/actions/dbActions";

export default function ExperimentHistory() {
    const { id } = useParams();
    const [data, setData] = useState<Telemetry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHistory() {
            try {
                const res = await fetch(`/api/history?experiment_id=${id}`);
                const result = await res.json();
                if (result.success) {
                    // Format timestamps for the chart
                    const formatted = result.data.map((row: Telemetry) => ({
                        ...row,
                        time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    }));
                    setData(formatted);
                }
            } catch (err) {
                console.error("Failed to load telemetry", err);
            } finally {
                setLoading(false);
            }
        }
        fetchHistory();
    }, [id]);

    return (
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            <div>
                <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-neutral-400 mb-6 hover:text-indigo-400 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Projects
                </Link>
                <h1 className="text-3xl font-medium tracking-tight text-neutral-100">Historical Review</h1>
                <p className="text-neutral-400 mt-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Experiment Snapshot ID: {id}
                </p>
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
        </main>
    );
}
