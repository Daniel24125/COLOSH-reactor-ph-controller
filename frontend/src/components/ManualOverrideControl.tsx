"use client";

import { Droplet } from "lucide-react";

interface ManualOverrideControlProps {
    isConnected: boolean;
    onManualDose: (pumpId: number) => void;
}

export function ManualOverrideControl({ isConnected, onManualDose }: ManualOverrideControlProps) {
    return (
        <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-4">Manual Override</h2>
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 h-[calc(100%-2rem)] flex flex-col justify-between">
                <div className="grid grid-cols-1 gap-4">
                    {[1, 2, 3].map((id) => (
                        <button
                            key={`pump-${id}`}
                            onClick={() => onManualDose(id)}
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
    );
}
