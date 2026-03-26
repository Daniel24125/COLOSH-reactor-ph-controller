"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMqtt } from "@/hooks/useMqtt";
import { CheckCircle2, RotateCcw, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type Location = "location_1" | "location_2" | "location_3";

const PUMP_LABELS: Record<Location, string> = {
    location_1: "Pump 1",
    location_2: "Pump 2",
    location_3: "Pump 3",
};

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, string> = {
    1: "Select",
    2: "Prime",
    3: "Dispense",
    4: "Measure",
};

// ── Component ──────────────────────────────────────────────────────────────

export function PumpCalibrationWizard() {
    const [step, setStep] = useState<WizardStep>(1);
    const [selectedLocation, setSelectedLocation] = useState<Location>("location_1");
    const [targetVolume, setTargetVolume] = useState<number>(10);
    const [actualVolume, setActualVolume] = useState<string>("");
    const [isDispensing, setIsDispensing] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // Track whether we're currently priming (pointer held down)
    const isPrimingRef = useRef(false);

    const { client, publishCommand, isConnected, isServerOnline } = useMqtt();
    const isOperational = isConnected && isServerOnline === true;
    const isOffline = !isOperational;

    useEffect(() => {
        if (!client || isOffline) return;

        client.subscribe("pump/status/active");

        const onMessage = (topic: string, message: Buffer) => {
            if (topic !== "pump/status/active") return;
            try {
                const data: { location: Location; is_running: boolean } = JSON.parse(message.toString());
                if (data.location === selectedLocation && !data.is_running) {
                    setIsDispensing(false);
                }
            } catch {
                // ignore malformed packets
            }
        };

        client.on("message", onMessage);
        return () => {
            client.unsubscribe("pump/status/active");
            client.off("message", onMessage);
        };
    }, [client, selectedLocation, isOffline]);

    // ── Handlers ────────────────────────────────────────────────────────────

    const startPrime = () => {
        if (isPrimingRef.current || isOffline) return;
        isPrimingRef.current = true;
        publishCommand("pump/control/prime", { location: selectedLocation, state: "ON" });
    };

    const stopPrime = () => {
        if (!isPrimingRef.current) return;
        isPrimingRef.current = false;
        publishCommand("pump/control/prime", { location: selectedLocation, state: "OFF" });
    };

    const handleDispense = () => {
        if (isOffline) return;
        setIsDispensing(true);
        publishCommand("pump/control/calibrate_run", {
            location: selectedLocation,
            target_volume: targetVolume,
        });
    };

    const handleSave = () => {
        if (isOffline) return;
        const ml = parseFloat(actualVolume);
        if (isNaN(ml) || ml <= 0) return;
        publishCommand("pump/config/save_calibration", {
            location: selectedLocation,
            target_ml: targetVolume,
            actual_ml: ml,
        });
        setIsSaved(true);
    };

    const handleReset = () => {
        setStep(1);
        setActualVolume("");
        setIsDispensing(false);
        setIsSaved(false);
    };

    const handleBack = () => {
        if (step > 1) {
            setStep((s) => (s - 1) as WizardStep);
            // If moving back from save, clear saved state
            if (step === 4) setIsSaved(false);
        }
    };

    // ── Shared UI atoms ──────────────────────────────────────────────────────

    const navigationButtons = (nextLabel: string, nextDisabled = false) => (
        <div className="flex gap-3">
            {step > 1 && !isSaved && (
                <button
                    onClick={handleBack}
                    disabled={isDispensing || isOffline}
                    className="flex-1 py-3 bg-neutral-950 hover:bg-neutral-900 text-neutral-500 hover:text-neutral-300 rounded-xl transition-colors border border-neutral-800 text-sm font-medium disabled:opacity-40"
                >
                    Back
                </button>
            )}
            <button
                onClick={() => setStep((s) => (s + 1) as WizardStep)}
                disabled={nextDisabled || isOffline}
                className="flex-[2] py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-indigo-400 rounded-xl transition-colors border border-neutral-800 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
                {nextLabel} <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );

    // ── Step content ─────────────────────────────────────────────────────────

    const renderStep = () => {
        if (isOffline) {
            return (
                <div className="bg-red-950/20 border border-red-500/30 rounded-2xl p-8 text-center space-y-3">
                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                        <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    </div>
                    <h3 className="text-red-400 font-medium">System Offline</h3>
                    <p className="text-sm text-neutral-500 max-w-xs mx-auto">
                        Calibration is disabled because the connection to the reactor server is lost.
                        Please check your network or reactor status.
                    </p>
                </div>
            );
        }

        switch (step) {
            // ── STEP 1: Select pump ────────────────────────────────────────────────
            case 1:
                return (
                    <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-200 font-medium mb-1">Select Pump</h3>
                            <p className="text-sm text-neutral-500 mb-5">
                                Choose the peristaltic pump you want to calibrate.
                            </p>

                            <div className="grid grid-cols-3 gap-3">
                                {(Object.keys(PUMP_LABELS) as Location[]).map((loc) => (
                                    <button
                                        key={loc}
                                        onClick={() => setSelectedLocation(loc)}
                                        className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${selectedLocation === loc
                                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/30"
                                            : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-indigo-500/50 hover:text-neutral-200"
                                            }`}
                                    >
                                        {PUMP_LABELS[loc]}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-5 pt-5 border-t border-neutral-800">
                                <label className="block text-sm font-medium text-neutral-400 mb-3">
                                    Target Dispense Volume
                                </label>
                                <div className="flex items-center gap-3">
                                    {[5, 10, 20].map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setTargetVolume(v)}
                                            className={`flex-1 py-2.5 rounded-xl border text-sm font-mono font-medium transition-all ${targetVolume === v
                                                ? "bg-indigo-600 border-indigo-500 text-white"
                                                : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-indigo-500/50"
                                                }`}
                                        >
                                            {v} mL
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {navigationButtons(`Prime ${PUMP_LABELS[selectedLocation]}`)}
                    </div>
                );

            // ── STEP 2: Prime ────────────────────────────────────────────────────
            case 2:
                return (
                    <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-200 font-medium mb-1">Prime the Tube</h3>
                            <p className="text-sm text-neutral-500 mb-6">
                                Hold the button below to run{" "}
                                <span className="text-neutral-300 font-medium">{PUMP_LABELS[selectedLocation]}</span>{" "}
                                continuously. Fill the silicone tube until fluid flows from the nozzle tip
                                with no air gaps.
                            </p>

                            {/* Pointer events with capture ensure pump stops even if cursor slips outside the button */}
                            <button
                                onPointerDown={(e) => {
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                    startPrime();
                                }}
                                onPointerUp={(e) => {
                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                    stopPrime();
                                }}
                                onPointerLeave={stopPrime}
                                onPointerCancel={stopPrime}
                                className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl transition-colors font-medium text-sm select-none touch-none cursor-pointer"
                            >
                                Hold to Prime
                            </button>
                        </div>

                        {navigationButtons("Tube is primed — Next Step")}
                    </div>
                );

            // ── STEP 3: Dispense ─────────────────────────────────────────────────
            case 3:
                return (
                    <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-200 font-medium mb-1">Controlled Dispense</h3>
                            <p className="text-sm text-neutral-500 mb-6">
                                Place a graduated cylinder under the nozzle. Press to dispense{" "}
                                <span className="font-mono text-indigo-400">{targetVolume} mL</span> at the
                                current calibration. The pump stops automatically.
                            </p>

                            <button
                                onClick={handleDispense}
                                disabled={isDispensing}
                                className={`w-full py-4 rounded-xl transition-colors font-medium text-sm ${isDispensing
                                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700"
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                                    }`}
                            >
                                {isDispensing ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse inline-block" />
                                        Dispensing {targetVolume} mL…
                                    </span>
                                ) : (
                                    `Dispense ${targetVolume} mL`
                                )}
                            </button>
                        </div>

                        {navigationButtons("Dispense complete — Measure", isDispensing)}
                    </div>
                );

            // ── STEP 4: Measure & Save ────────────────────────────────────────────
            case 4:
                if (isSaved) {
                    return (
                        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-10 flex flex-col items-center text-center gap-4">
                            <CheckCircle2 className="w-12 h-12 text-indigo-400" />
                            <div>
                                <h3 className="text-indigo-300 font-medium text-lg mb-1">
                                    Calibration Saved
                                </h3>
                                <p className="text-neutral-400 text-sm">
                                    <span className="font-mono text-neutral-200">{PUMP_LABELS[selectedLocation]}</span>{" "}
                                    — target{" "}
                                    <span className="font-mono text-neutral-200">{targetVolume} mL</span>,
                                    measured{" "}
                                    <span className="font-mono text-neutral-200">{actualVolume} mL</span>.
                                    The backend has recalculated{" "}
                                    <span className="text-neutral-300">steps / mL</span> and saved to config.
                                </p>
                            </div>
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-xl border border-neutral-800 transition-colors text-sm font-medium"
                            >
                                <RotateCcw className="w-4 h-4" /> Calibrate Another Pump
                            </button>
                        </div>
                    );
                }

                return (
                    <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-200 font-medium mb-1">Enter Measured Volume</h3>
                            <p className="text-sm text-neutral-500 mb-6">
                                Read the volume from your graduated cylinder and enter it below. The
                                backend will compute the new{" "}
                                <span className="text-neutral-300 font-mono">steps / mL</span> automatically.
                            </p>

                            <div className="relative">
                                <input
                                    type="number"
                                    value={actualVolume}
                                    onChange={(e) => setActualVolume(e.target.value)}
                                    placeholder={`Expected ~${targetVolume}`}
                                    step="0.01"
                                    min="0.01"
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-200 text-xl font-mono focus:outline-none focus:border-indigo-500 transition-colors pr-16"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 font-medium pointer-events-none">
                                    mL
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleBack}
                                className="flex-1 py-4 bg-neutral-950 hover:bg-neutral-900 text-neutral-500 hover:text-neutral-300 rounded-xl transition-colors border border-neutral-800 text-sm font-medium"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!actualVolume || parseFloat(actualVolume) <= 0}
                                className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium text-sm"
                            >
                                Save Calibration
                            </button>
                        </div>
                    </div>
                );
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────

    const steps = [1, 2, 3, 4] as WizardStep[];

    return (
        <div className="space-y-8">
            {/* Stepper */}
            <div className="flex items-center">
                {steps.map((s, i) => (
                    <React.Fragment key={s}>
                        <div className="flex flex-col items-center gap-1.5">
                            <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step === s
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
                                    : step > s
                                        ? "bg-indigo-900/50 text-indigo-400 border border-indigo-700/50"
                                        : "bg-neutral-800 text-neutral-500 border border-neutral-700"
                                    }`}
                            >
                                {step > s ? "✓" : s}
                            </div>
                            <span
                                className={`text-xs font-medium transition-colors ${step === s
                                    ? "text-indigo-400"
                                    : step > s
                                        ? "text-neutral-500"
                                        : "text-neutral-600"
                                    }`}
                            >
                                {STEP_LABELS[s]}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div
                                className={`flex-1 h-px mx-3 mb-4 transition-colors ${step > s ? "bg-indigo-700/50" : "bg-neutral-800"
                                    }`}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Active step */}
            {renderStep()}
        </div>
    );
}
