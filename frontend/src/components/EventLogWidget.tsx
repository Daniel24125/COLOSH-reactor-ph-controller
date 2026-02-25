"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Info, AlertTriangle } from "lucide-react";
import { formatDuration } from "@/hooks/useElapsedTime";

export type LogEvent = {
    id: string;
    timestamp: string;
    level: string;
    message: string;
    compartment: number | null;
};

export function EventLogWidget({ logs, startedAt }: { logs: LogEvent[]; startedAt?: string }) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
                top: scrollContainerRef.current.scrollHeight,
                behavior: "smooth"
            });
        }
    }, [logs]);

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col h-[400px]">
            <h3 className="text-neutral-200 font-medium mb-4">Event Logs</h3>
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent"
            >
                {logs.length === 0 ? (
                    <div className="text-neutral-500 text-sm text-center mt-10">No events recorded.</div>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="flex gap-3 text-sm p-3 rounded-lg bg-neutral-950 border border-neutral-800/50">
                            <div className="shrink-0 mt-0.5">
                                {log.level === 'ERROR' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                {log.level === 'WARNING' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                {log.level === 'INFO' && <Info className="w-4 h-4 text-indigo-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-1 gap-2">
                                    <span className="font-medium text-neutral-300 truncate">
                                        {log.level} {log.compartment ? `[C${log.compartment}]` : ""}
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0 text-xs text-neutral-500">
                                        {startedAt && (
                                            <span className="text-indigo-400/70 font-mono">
                                                +{formatDuration(startedAt, log.timestamp)}
                                            </span>
                                        )}
                                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                                <p className="text-neutral-400 leading-relaxed">{log.message}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

