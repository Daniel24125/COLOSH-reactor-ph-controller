"use client";

import { memo } from "react";
import { Droplet, Activity } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Telemetry } from "@/types";

// --- TelemetryGrid ---
interface TelemetryGridProps {
    phData: {
        1?: number;
        2?: number;
        3?: number;
    };
}

export const TelemetryGrid = memo(function TelemetryGrid({ phData }: TelemetryGridProps) {
    return (
        <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-4">Live Telemetry</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((id) => (
                    <div key={id} className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden group">
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
