"use client";

import { Droplet } from "lucide-react";

interface TelemetryGridProps {
    phData: {
        1?: number;
        2?: number;
        3?: number;
    };
}

export function TelemetryGrid({ phData }: TelemetryGridProps) {
    return (
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
        </div>
    );
}
