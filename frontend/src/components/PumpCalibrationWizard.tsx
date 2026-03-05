"use client";

import React, { useState, useEffect } from "react";
import { useMqtt } from "@/hooks/useMqtt";

interface PumpCalibrationWizardProps {
    location: string; // e.g., "location_1"
}

export function PumpCalibrationWizard({ location }: PumpCalibrationWizardProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [measuredMl, setMeasuredMl] = useState<string>("");
    const [isSuccess, setIsSuccess] = useState<boolean>(false);
    const [calculatedStepsPerMl, setCalculatedStepsPerMl] = useState<number | null>(null);

    const testSteps = 10000;

    // Hook into the central MQTT context
    const { client, publishCommand } = useMqtt();

    // Listen to the backend status topic to know when the hardware is running
    useEffect(() => {
        if (!client) return;

        // Need to explicitly subscribe to this topic since the global MqttContext might not subscribe to it by default
        client.subscribe("pump/status/active");

        const handleStatusMessage = (topic: string, message: Buffer) => {
            if (topic === "pump/status/active") {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.location === location) {
                        setIsRunning(data.is_running);
                        // If the pump finishes running the test, advance to input step automatically
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

    // Phase 1: Priming
    const handlePrimeDown = () => {
        publishCommand("pump/control/prime", { location, state: "ON" });
    };
    const handlePrimeUp = () => {
        publishCommand("pump/control/prime", { location, state: "OFF" });
    };

    // Phase 2: Running Calibration
    const handleRunCalibration = () => {
        publishCommand("pump/control/calibrate_run", { location, steps: testSteps });
    };

    // Phase 3: Saving Calibration
    const handleSaveCalibration = () => {
        const ml = parseFloat(measuredMl);
        if (!isNaN(ml) && ml > 0) {
            const stepsPerMl = testSteps / ml;
            setCalculatedStepsPerMl(stepsPerMl);

            publishCommand("pump/config/save_calibration", {
                location,
                measured_ml: ml,
                test_steps: testSteps
            });
            setIsSuccess(true);
        }
    };

    // Helper renderer
    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-center text-sm text-gray-600">
                            Hold the button below to turn on the pump and fill the tube with fluid up to the nozzle.
                        </p>
                        <button
                            onMouseDown={handlePrimeDown}
                            onMouseUp={handlePrimeUp}
                            onMouseLeave={handlePrimeUp}
                            onTouchStart={handlePrimeDown}
                            onTouchEnd={handlePrimeUp}
                            className="px-6 py-4 bg-blue-600 text-white rounded shadow-lg active:bg-blue-800 transition-colors w-full font-semibold"
                        >
                            Prime Tube (Hold)
                        </button>
                        <button
                            onClick={() => setStep(2)}
                            className="text-blue-500 hover:underline mt-4 text-sm"
                        >
                            Tube is primed. Next Step ➔
                        </button>
                    </div>
                );

            case 2:
                return (
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-center text-sm text-gray-600">
                            Place a scale or graduated cylinder under the nozzle. Press the button to execute a controlled run of {testSteps.toLocaleString()} steps.
                        </p>
                        <button
                            onClick={handleRunCalibration}
                            disabled={isRunning}
                            className={`px-6 py-4 rounded shadow-lg transition-colors w-full font-semibold ${isRunning ? "bg-gray-400 text-gray-200 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"
                                }`}
                        >
                            {isRunning ? "Running..." : `Run ${testSteps.toLocaleString()} Steps`}
                        </button>
                    </div>
                );

            case 3:
                if (isSuccess) {
                    return (
                        <div className="flex flex-col items-center gap-4 text-green-700 text-center p-4 bg-green-50 rounded-lg border border-green-200">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <div>
                                <h3 className="font-bold text-lg mb-1">Hardware Calibrated!</h3>
                                <p className="text-sm">Value saved: {calculatedStepsPerMl?.toFixed(2)} steps/mL</p>
                            </div>
                            <button
                                onClick={() => { setStep(1); setIsSuccess(false); setMeasuredMl(""); }}
                                className="mt-4 px-4 py-2 border rounded border-green-700 hover:bg-green-100 transition-colors"
                            >
                                Recalibrate
                            </button>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-center text-sm text-gray-600">
                            Measure the fluid that was just dispensed and enter the amount in milliliters (mL).
                        </p>
                        <div className="flex gap-2 w-full">
                            <input
                                type="number"
                                value={measuredMl}
                                onChange={(e) => setMeasuredMl(e.target.value)}
                                placeholder="Volume in mL (e.g., 8.5)"
                                className="flex-1 p-3 border rounded-lg active:border-blue-500 font-mono text-lg"
                                step="0.01"
                            />
                        </div>
                        <button
                            onClick={handleSaveCalibration}
                            disabled={!measuredMl || parseFloat(measuredMl) <= 0}
                            className="px-6 py-4 bg-purple-600 text-white rounded shadow-lg hover:bg-purple-700 disabled:bg-gray-400 w-full font-semibold"
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
        <div className="max-w-md w-full mx-auto bg-white rounded-xl shadow-md border p-6">
            <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2 tracking-tight">
                Peristaltic Pump Calibration
            </h2>

            {/* Stepper indicators */}
            <div className="flex justify-between items-center mb-8 px-4">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex flex-col items-center flex-1">
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-1 ${step === s ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                                : step > s ? "bg-green-500 text-white"
                                    : "bg-gray-200 text-gray-500"
                                }`}
                        >
                            {step > s ? "✓" : s}
                        </div>
                        <span className={`text-xs text-center ${step === s ? "font-semibold text-blue-800" : "text-gray-400"}`}>
                            {s === 1 ? "Prime" : s === 2 ? "Run" : "Input"}
                        </span>
                    </div>
                ))}
            </div>

            <div className="min-h-[220px]">
                {renderStepContent()}
            </div>
        </div>
    );
}
