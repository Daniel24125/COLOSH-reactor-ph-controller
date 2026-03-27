"use client";

import { Droplet, AlertCircle } from "lucide-react";
import type { PhData } from "@/types";
import { cn } from "@/lib/utils";

interface TelemetryGridProps {
    phData: PhData;
}

export function TelemetryGrid({ phData }: TelemetryGridProps) {
    return (
        <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-4">Live Telemetry</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((id) => {
                    const reading = phData[id as keyof typeof phData];
                    const isOffline = reading !== undefined && reading.ph === null;
                    const isMissing = reading === undefined;

                    return (
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
                                <Droplet className={cn(
                                    "w-5 h-5 transition-colors",
                                    isOffline ? "text-red-500/50" : "text-neutral-600 group-hover:text-indigo-500/50"
                                )} />
                            </div>

                            <div className="flex flex-col gap-1">
                                {/* Primary: pH value */}
                                <div className="flex items-baseline gap-2">
                                    <span className={cn(
                                        "text-5xl font-light tracking-tight",
                                        isOffline || isMissing ? "text-neutral-600" : "text-neutral-100"
                                    )}>
                                        {!isMissing && !isOffline ? reading!.ph?.toFixed(2) : "--"}
                                    </span>
                                    {!isMissing && !isOffline && (
                                        <span className="text-neutral-500 text-lg">pH</span>
                                    )}
                                </div>

                                {/* Secondary: raw ADC integer, faded */}
                                {!isMissing && !isOffline && reading!.raw !== null && (
                                    <span className="text-sm font-mono text-neutral-600 mt-0.5">
                                        {reading!.raw.toLocaleString()}{" "}
                                        <span className="text-neutral-700">raw</span>
                                    </span>
                                )}

                                {/* Offline badge */}
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
}
