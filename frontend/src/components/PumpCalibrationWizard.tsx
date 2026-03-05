"use client";

import React, { useState, useEffect } from "react";
import { useMqtt } from "@/hooks/useMqtt";
import { CheckCircle2, RotateCcw } from "lucide-react";

interface PumpCalibrationWizardProps {
    location?: string; // e.g., "location_1"
}

export function PumpCalibrationWizard({ location = "location_1" }: PumpCalibrationWizardProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [measuredMl, setMeasuredMl] = useState<string>("");
    const [isSuccess, setIsSuccess] = useState<boolean>(false);
    const [calculatedStepsPerMl, setCalculatedStepsPerMl] = useState<number | null>(null);

    const testSteps = 10000;

    const { client, publishCommand } = useMqtt();

    useEffect(() => {
        if (!client) return;

        client.subscribe("pump/status/active");

        const handleStatusMessage = (topic: string, message: Buffer) => {
            if (topic === "pump/status/active") {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.location === location) {
                        setIsRunning(data.is_running);
                        if (step === 2 && !data.is_running) {
                            setStep(3);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse pump status payload", e);
                }
            }
        };

        client.on("message", handleStatusMessage);

        return () => {
            client.unsubscribe("pump/status/active");
            client.off("message", handleStatusMessage);
        };
    }, [client, location, step]);

    const handlePrimeDown = () => publishCommand("pump/control/prime", { location, state: "ON" });
    const handlePrimeUp = () => publishCommand("pump/control/prime", { location, state: "OFF" });
    const handleRunCalibration = () => publishCommand("pump/control/calibrate_run", { location, steps: testSteps });

    const handleSaveCalibration = () => {
        const ml = parseFloat(measuredMl);
        if (!isNaN(ml) && ml > 0) {
            const stepsPerMl = testSteps / ml;
            setCalculatedStepsPerMl(stepsPerMl);
            publishCommand("pump/config/save_calibration", {
                location,
                measured_ml: ml,
                test_steps: testSteps,
            });
            setIsSuccess(true);
        }
    };

    const steps = [
        { label: "Prime", num: 1 },
        { label: "Run", num: 2 },
        { label: "Measure", num: 3 },
    ];

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-200 font-medium mb-2">Prime the Tube</h3>
                            <p className="text-sm text-neutral-500 mb-6">
                                Hold the button to run the pump continuously. Fill the silicone tube with
                                fluid until it reaches the nozzle tip with no air gaps.
                            </p>
                            <button
                                onMouseDown={handlePrimeDown}
                                onMouseUp={handlePrimeUp}
                                onMouseLeave={handlePrimeUp}
                                onTouchStart={handlePrimeDown}
                                onTouchEnd={handlePrimeUp}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl transition-colors font-medium text-sm select-none"
                            >
                                Hold to Prime
                            </button>
                        </div>
                        <button
                            onClick={() => setStep(2)}
                            className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-indigo-400 rounded-xl transition-colors border border-neutral-800 text-sm font-medium"
                        >
                            Tube is primed — Next Step →
                        </button>
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-200 font-medium mb-2">Controlled Run</h3>
                            <p className="text-sm text-neutral-500 mb-6">
                                Place a graduated cylinder or scale under the nozzle. Press the button to
                                dispense exactly{" "}
                                <span className="font-mono text-indigo-400">{testSteps.toLocaleString()}</span>{" "}
                                steps. The pump stops automatically.
                            </p>
                            <button
                                onClick={handleRunCalibration}
                                disabled={isRunning}
                                className={`w-full py-4 rounded-xl transition-colors font-medium text-sm ${isRunning
                                        ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700"
                                        : "bg-indigo-600 hover:bg-indigo-500 text-white"
                                    }`}
                            >
                                {isRunning ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse inline-block" />
                                        Running {testSteps.toLocaleString()} steps…
                                    </span>
                                ) : (
                                    `Run ${testSteps.toLocaleString()} Steps`
                                )}
                            </button>
                        </div>
                        {!isRunning && (
                            <button
                                onClick={() => setStep(3)}
                                className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-indigo-400 rounded-xl transition-colors border border-neutral-800 text-sm"
                            >
                                Run complete — Skip to Measure →
                            </button>
                        )}
                    </div>
                );

            case 3:
                if (isSuccess) {
                    return (
                        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-10 flex flex-col items-center text-center gap-4">
                            <CheckCircle2 className="w-12 h-12 text-indigo-400" />
                            <div>
                                <h3 className="text-indigo-300 font-medium text-lg mb-1">
                                    Pump Calibrated Successfully
                                </h3>
                                <p className="text-neutral-400 text-sm">
                                    Saved{" "}
                                    <span className="font-mono text-neutral-200">
                                        {calculatedStepsPerMl?.toFixed(2)}
                                    </span>{" "}
                                    steps / mL for{" "}
                                    <span className="font-mono text-neutral-300">{location}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setStep(1);
                                    setIsSuccess(false);
                                    setMeasuredMl("");
                                    setCalculatedStepsPerMl(null);
                                }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-xl border border-neutral-800 transition-colors text-sm font-medium"
                            >
                                <RotateCcw className="w-4 h-4" /> Recalibrate
                            </button>
                        </div>
                    );
                }

                return (
                    <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                            <h3 className="text-neutral-200 font-medium mb-2">Enter Measured Volume</h3>
                            <p className="text-sm text-neutral-500 mb-6">
                                Measure the fluid dispensed into the cylinder and enter the volume below.
                            </p>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={measuredMl}
                                    onChange={(e) => setMeasuredMl(e.target.value)}
                                    placeholder="e.g. 8.5"
                                    step="0.01"
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-200 text-lg font-mono focus:outline-none focus:border-indigo-500 transition-colors pr-14"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-sm font-medium pointer-events-none">
                                    mL
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={handleSaveCalibration}
                            disabled={!measuredMl || parseFloat(measuredMl) <= 0}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors font-medium text-sm"
                        >
                            Save Calibration
                        </button>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="space-y-8">
            {/* Stepper */}
            <div className="flex items-center">
                {steps.map((s, i) => (
                    <React.Fragment key={s.num}>
                        <div className="flex flex-col items-center gap-1.5">
                            <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step === s.num
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
                                        : step > s.num
                                            ? "bg-indigo-900/50 text-indigo-400 border border-indigo-700/50"
                                            : "bg-neutral-800 text-neutral-500 border border-neutral-700"
                                    }`}
                            >
                                {step > s.num ? "✓" : s.num}
                            </div>
                            <span
                                className={`text-xs font-medium transition-colors ${step === s.num
                                        ? "text-indigo-400"
                                        : step > s.num
                                            ? "text-neutral-500"
                                            : "text-neutral-600"
                                    }`}
                            >
                                {s.label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div
                                className={`flex-1 h-px mx-3 mb-4 transition-colors ${step > s.num ? "bg-indigo-700/50" : "bg-neutral-800"
                                    }`}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Active Step Content */}
            {renderStepContent()}
        </div>
    );
}
