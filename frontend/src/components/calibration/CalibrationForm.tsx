"use client";

import { Lock, Beaker, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// --- CompartmentSelector ---
interface CompartmentSelectorProps {
    activeCompartment: number;
    onSelect: (compartment: number) => void;
}

export function CompartmentSelector({ activeCompartment, onSelect }: CompartmentSelectorProps) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <label className="block text-sm font-medium text-neutral-400 mb-3">Select Compartment</label>
            <div className="space-y-2">
                {[1, 2, 3].map(cp => (
                    <button
                        key={`cp-${cp}`}
                        onClick={() => onSelect(cp)}
                        className={`w-full flex items-center justify-center py-3 rounded-lg border transition-all text-sm font-medium ${activeCompartment === cp
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20"
                            : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-900"
                            }`}
                    >
                        Compartment {cp}
                    </button>
                ))}
            </div>
        </div>
    );
}

// --- StabilityBadge ---
interface StabilityBadgeProps {
    isStable: boolean;
}

function StabilityBadge({ isStable }: StabilityBadgeProps) {
    if (isStable) {
        return (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full w-fit">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Stable
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full w-fit">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Stabilizing…
        </div>
    );
}

// --- LiveSensorReading ---
interface LiveSensorReadingProps {
    rawValue: number | null;
    isStable: boolean;
    isOffline: boolean;
}

export function LiveSensorReading({ rawValue, isStable, isOffline }: LiveSensorReadingProps) {
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-center space-y-3">
            <span className="block text-sm font-medium text-neutral-400">Live Sensor Reading</span>
            <div className={cn(
                "text-4xl font-light tracking-tight transition-colors",
                isOffline ? "text-neutral-500" : "text-indigo-400"
            )}>
                {rawValue !== null ? rawValue.toLocaleString() : "---"}
                <span className="text-xl text-neutral-500 ml-2">raw</span>
            </div>
            <div className="flex items-center justify-center">
                {isOffline && rawValue !== null ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full w-fit">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Sensor Offline
                    </div>
                ) : rawValue !== null ? (
                    <StabilityBadge isStable={isStable} />
                ) : (
                    <span className="text-xs text-neutral-500">Connecting…</span>
                )}
            </div>
        </div>
    );
}

// --- BufferSolutionCard ---
interface BufferSolutionCardProps {
    bufferNumber: 1 | 2;
    phValue: number;
    lockedRaw: number | null;
    rawValue: number | null;
    isStable: boolean;
    isOffline: boolean;
    isFirstLocked?: boolean;
    isOperational: boolean;
    onPhChange: (value: number) => void;
    onLock: () => void;
    onUnlock: () => void;
}

export function BufferSolutionCard({
    bufferNumber,
    phValue,
    lockedRaw,
    rawValue,
    isStable,
    isOffline,
    isFirstLocked,
    isOperational,
    onPhChange,
    onLock,
    onUnlock,
}: BufferSolutionCardProps) {
    // For buffer 2: requires buffer 1 locked first AND a live reading
    // For buffer 1: requires a live reading
    const baseDisabled = !isOperational || rawValue === null || isOffline || (bufferNumber === 2 && !isFirstLocked);
    // Lock button also requires the reading to be stable
    const isLockDisabled = baseDisabled || !isStable;

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-neutral-200 flex items-center gap-2">
                    <span className="bg-neutral-800 text-neutral-300 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold">
                        {bufferNumber}
                    </span>
                    Buffer Solution {bufferNumber}
                </h3>
                {lockedRaw !== null && <Lock className="w-4 h-4 text-emerald-500" />}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Buffer pH Value</label>
                    <input
                        type="number"
                        step="0.01"
                        value={phValue}
                        onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        if (!isNaN(parsed)) onPhChange(parsed);
                    }}
                        disabled={lockedRaw !== null}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Locked Raw Value</label>
                    <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 font-mono">
                        {lockedRaw !== null ? lockedRaw.toLocaleString() : "---"}
                    </div>
                </div>
            </div>

            {/* Stability indicator when not yet locked */}
            {lockedRaw === null && rawValue !== null && (
                <div className="mb-3 flex items-center gap-2">
                    <StabilityBadge isStable={isStable} />
                    {!isStable && (
                        <span className="text-xs text-neutral-500">
                            Wait for reading to stabilise before locking.
                        </span>
                    )}
                </div>
            )}

            {lockedRaw === null ? (
                <button
                    onClick={onLock}
                    disabled={isLockDisabled}
                    title={!isOperational ? "System Offline" : !isStable ? "Wait for stable reading" : ""}
                    className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors border border-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2"
                >
                    <Lock className="w-4 h-4" /> Lock Reading
                </button>
            ) : (
                <button
                    onClick={onUnlock}
                    className="w-full py-2 bg-neutral-950 hover:bg-red-500/10 text-neutral-400 hover:text-red-400 rounded-lg transition-colors border border-neutral-800 text-sm font-medium"
                >
                    Unlock & Retake
                </button>
            )}
        </div>
    );
}

// --- CalibrationSummary ---
interface CalibrationSummaryProps {
    raw1: number;
    raw2: number;
    ph1: number;
    ph2: number;
    activeCompartment: number;
    isSaving: boolean;
    isOperational: boolean;
    onSave: () => void;
}

export function CalibrationSummary({ raw1, raw2, ph1, ph2, activeCompartment, isSaving, isOperational, onSave }: CalibrationSummaryProps) {
    // Empirical two-point linear model: pH = m·raw + b
    const m = (ph2 - ph1) / (raw2 - raw1);
    const b = ph1 - m * raw1;
    const isValid = isFinite(m) && isFinite(b);

    return (
        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h4 className="text-indigo-400 font-medium text-sm">Calibration Computed</h4>
                    {isValid ? (
                        <p className="text-neutral-400 text-xs mt-1 space-y-0.5">
                            <span className="block">Slope (m): {m.toExponential(4)} pH/step</span>
                            <span className="block">Intercept (b): {b.toFixed(4)} pH</span>
                            <span className="block text-neutral-500 mt-1">
                                pH = {m.toExponential(3)} &times; raw + {b.toFixed(3)}
                            </span>
                        </p>
                    ) : (
                        <p className="text-red-400 text-xs mt-1">
                            ⚠ Raw readings are identical — cannot compute slope. Please retake readings.
                        </p>
                    )}
                </div>
                <Beaker className="w-8 h-8 text-indigo-500/50" />
            </div>
            <button
                id="save-calibration-btn"
                onClick={onSave}
                disabled={isSaving || !isOperational || !isValid}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
            >
                <Save className="w-5 h-5" />
                {isSaving ? "Saving..." : !isOperational ? "System Offline" : !isValid ? "Invalid readings" : `Apply Calibration to Compartment ${activeCompartment}`}
            </button>
        </div>
    );
}
