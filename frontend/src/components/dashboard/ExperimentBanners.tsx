"use client";

import { memo } from "react";
import { AlertCircle, PlayCircle, Square, Timer } from "lucide-react";
import { Experiment } from "@/types";

// --- CalibrationWarningBanner ---
interface CalibrationWarningBannerProps {
    message: string;
    onDismiss?: () => void;
}

export const CalibrationWarningBanner = memo(function CalibrationWarningBanner({ message, onDismiss }: CalibrationWarningBannerProps) {
    return (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-yellow-500 shadow-lg shadow-yellow-900/5">
            <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="font-medium text-sm">{message}</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
                {onDismiss && (
                    <button onClick={onDismiss} className="shrink-0 px-4 py-2 text-sm text-yellow-500 bg-transparent hover:bg-yellow-500/10 rounded-lg transition-colors border border-yellow-500/20 whitespace-nowrap font-medium">
                        Ignore
                    </button>
                )}
                <a href="/calibration" className="shrink-0 px-4 py-2 text-sm bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg transition-colors border border-yellow-500/20 whitespace-nowrap font-medium">
                    Recalibrate Sensors
                </a>
            </div>
        </div>
    );
});

// --- ActiveExperimentBanner ---
interface ActiveExperimentBannerProps {
    experiment: Experiment | null;
    elapsedTime: string | null;
    isSubmitting: boolean;
    onStopExperiment: () => void;
    onStartSetup: () => void;
    isCalibrationValid: boolean;
}

export const ActiveExperimentBanner = memo(function ActiveExperimentBanner({
    experiment,
    elapsedTime,
    isSubmitting,
    onStopExperiment,
    onStartSetup,
    isCalibrationValid,
}: ActiveExperimentBannerProps) {
    if (experiment) {
        return (
            <div className="bg-indigo-950/30 border border-indigo-800/50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/20 p-2 rounded-lg">
                        <PlayCircle className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-sm text-indigo-400/80 font-medium">Active Experiment</p>
                        <p className="text-neutral-200 font-medium">{experiment.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {elapsedTime && (
                        <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-neutral-900 text-neutral-300 rounded-full border border-neutral-700 font-mono tabular-nums">
                            <Timer className="w-3.5 h-3.5 text-indigo-400" />
                            {elapsedTime}
                        </div>
                    )}
                    <button
                        onClick={onStopExperiment}
                        disabled={isSubmitting}
                        className="px-4 py-2 flex items-center gap-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors border border-red-500/20 shadow-lg shadow-red-900/10 disabled:opacity-50"
                    >
                        <Square className="w-4 h-4" />
                        {isSubmitting ? "Stopping..." : "Stop Experiment"}
                    </button>
                    <div className="text-sm px-3 py-1 bg-indigo-900/50 text-indigo-300 rounded-full border border-indigo-700/50 flex shrink-0 items-center justify-center">
                        Logging active
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-neutral-400">
            <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <p>No active experiment. Telemetry is not being recorded to DB.</p>
            </div>
            <button
                onClick={onStartSetup}
                disabled={!isCalibrationValid}
                title={!isCalibrationValid ? "Probes must be calibrated before starting." : ""}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all font-medium flex shrink-0 items-center justify-center disabled:opacity-50 disabled:hover:bg-indigo-600"
            >
                Start Setup
            </button>
        </div>
    );
});
