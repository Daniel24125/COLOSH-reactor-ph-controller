"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Telemetry } from "@/types";

interface LiveTelemetryChartProps {
    data: (Telemetry & { timeStr: string })[];
}

export function LiveTelemetryChart({ data }: LiveTelemetryChartProps) {
    const [visibleCompartments, setVisibleCompartments] = useState<Set<number>>(new Set([1, 2, 3]));

    if (data.length === 0) return null;

    const toggleCompartment = (id: number) => {
        setVisibleCompartments((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleLegendClick = (props: any) => {
        const { value } = props;
        const id = value === "Compartment 1" ? 1 : value === "Compartment 2" ? 2 : 3;
        toggleCompartment(id);
    };

    return (
        <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="text-neutral-400 font-medium mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" /> Real-time Progression
            </h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <Line
                            type="monotone"
                            dataKey="compartment_1_ph"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                            name="Compartment 1"
                            hide={!visibleCompartments.has(1)}
                            opacity={visibleCompartments.has(1) ? 1 : 0.15}
                        />
                        <Line
                            type="monotone"
                            dataKey="compartment_2_ph"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                            name="Compartment 2"
                            hide={!visibleCompartments.has(2)}
                            opacity={visibleCompartments.has(2) ? 1 : 0.15}
                        />
                        <Line
                            type="monotone"
                            dataKey="compartment_3_ph"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                            name="Compartment 3"
                            hide={!visibleCompartments.has(3)}
                            opacity={visibleCompartments.has(3) ? 1 : 0.15}
                        />
                        <CartesianGrid stroke="#262626" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="timeStr" stroke="#525252" tick={{ fill: '#737373', fontSize: 12 }} tickLine={false} />
                        <YAxis domain={['auto', 'auto']} stroke="#525252" tick={{ fill: '#737373' }} tickLine={false} width={40} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', color: '#e5e5e5' }}
                            itemStyle={{ color: '#e5e5e5' }}
                        />
                        <Legend
                            onClick={handleLegendClick}
                            wrapperStyle={{ color: '#a3a3a3', fontSize: 12, paddingTop: 8, cursor: 'pointer' }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
