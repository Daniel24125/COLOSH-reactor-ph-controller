"use client";

import { useState, useEffect } from "react";

/**
 * Returns a live-updating human-readable elapsed time string
 * (e.g. "2h 14m 07s") since a given ISO timestamp.
 * Returns null if startedAt is null/undefined.
 */
/**
 * SQLite stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" (no T, no Z).
 * JavaScript's Date constructor treats that as LOCAL time, not UTC.
 * This helper normalises the string to a proper ISO-8601 UTC timestamp.
 */
function toUtcDate(ts: string): Date {
    // If it already has a T or Z it's already ISO - don't double-convert
    if (ts.includes("T") || ts.includes("Z")) return new Date(ts);
    return new Date(ts.replace(" ", "T") + "Z");
}

export function useElapsedTime(startedAt: string | null | undefined): string | null {
    const [elapsed, setElapsed] = useState<string | null>(null);

    useEffect(() => {
        if (!startedAt) {
            setElapsed(null);
            return;
        }

        const startMs = toUtcDate(startedAt).getTime();

        const tick = () => {
            const totalSeconds = Math.floor((Date.now() - startMs) / 1000);
            if (totalSeconds < 0) { setElapsed("0s"); return; }

            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;

            if (h > 0) {
                setElapsed(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
            } else if (m > 0) {
                setElapsed(`${m}m ${String(s).padStart(2, "0")}s`);
            } else {
                setElapsed(`${s}s`);
            }
        };

        tick(); // Run immediately
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [startedAt]);

    return elapsed;
}

/**
 * Given two ISO timestamps, returns a static formatted duration string.
 * Useful for completed experiments where the time is fixed.
 */
export function formatDuration(startedAt: string, endedAt: string): string {
    const totalSeconds = Math.floor(
        (toUtcDate(endedAt).getTime() - toUtcDate(startedAt).getTime()) / 1000
    );
    if (totalSeconds <= 0) return "< 1s";

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(" ");
}
