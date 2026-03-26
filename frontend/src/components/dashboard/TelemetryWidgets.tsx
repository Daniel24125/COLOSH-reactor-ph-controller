"use client";

import { memo } from "react";
import { Droplet, Activity, AlertCircle } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Telemetry } from "@/types";
import { cn } from "@/lib/utils";

// --- TelemetryGrid ---
interface TelemetryGridProps {
    phData: {
        1?: number | null;
        2?: number | null;
        3?: number | null;
    };
}

export const TelemetryGrid = memo(function TelemetryGrid({ phData }: TelemetryGridProps) {
    return (
        <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-4">Live Telemetry</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((id) => {
                    const value = phData[id as keyof typeof phData];
                    const isOffline = value === null || (value === undefined && id in phData);
                    const isMissing = value === undefined && !(id in phData);

                    return (
                        <div key={id} className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 w-32 h-32 bg-indigo-500/5 blur-3xl group-hover:bg-indigo-500/10 transition-colors duration-500" />
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center font-mono text-sm text-neutral-400">
                                        C{id}
                                    </div>
                                    <span className="text-neutral-400 font-medium">Compartment {id}</span>
                                </div>
                                <Droplet className={cn("w-5 h-5 transition-colors", isOffline ? "text-red-500/50" : "text-neutral-600 group-hover:text-indigo-500/50")} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-baseline gap-2">
                                    <span className={cn("text-5xl font-light tracking-tight", isOffline ? "text-neutral-600" : "text-neutral-100")}>
                                        {!isMissing && !isOffline
                                            ? value?.toFixed(2)
                                            : "--"}
                                    </span>
                                    {!isMissing && !isOffline && <span className="text-neutral-500 text-lg">pH</span>}
                                </div>
                                {isOffline && (
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-red-500 mt-2 bg-red-500/5 border border-red-500/10 px-2 py-1 rounded-md w-fit">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        Sensor Offline
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

// --- LiveTelemetryChart ---
interface LiveTelemetryChartProps {
    data: (Telemetry & { timeStr: string })[];
}

export const LiveTelemetryChart = memo(function LiveTelemetryChart({ data }: LiveTelemetryChartProps) {
    if (data.length === 0) return null;

    return (
        <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="text-neutral-400 font-medium mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" /> Real-time Progression
            </h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
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
                        <Legend wrapperStyle={{ color: '#a3a3a3', fontSize: 12, paddingTop: 8 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});
