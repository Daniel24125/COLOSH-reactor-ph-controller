"use server";

import { getDb } from "@/lib/db";

export type CalibrationStatus = {
    requiresCalibration: boolean;
    message: string;
    details: { compartment: number, calibrated_at: string | null, expired: boolean }[];
};

export async function getCalibrationStatus(): Promise<CalibrationStatus> {
    try {
        const db = await getDb();
        const details = [];
        let requiresCalibration = false;

        const now = new Date();
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

        for (const compartment of [1, 2, 3]) {
            const row = await db.get<{ calibrated_at: string }>(
                "SELECT calibrated_at FROM calibrations WHERE compartment = ? ORDER BY calibrated_at DESC LIMIT 1",
                [compartment]
            );

            if (!row) {
                requiresCalibration = true;
                details.push({ compartment, calibrated_at: null, expired: true });
            } else {
                const calibratedTime = new Date(row.calibrated_at).getTime();
                const isExpired = now.getTime() - calibratedTime > FORTY_EIGHT_HOURS;
                if (isExpired) requiresCalibration = true;
                details.push({ compartment, calibrated_at: row.calibrated_at, expired: isExpired });
            }
        }

        return {
            requiresCalibration,
            message: requiresCalibration
                ? "⚠️ Calibration is missing or older than 48 hours. Please recalibrate probes."
                : "✅ All sensors calibrated and within 48h limit.",
            details
        };
    } catch (error) {
        console.error("Failed to fetch calibration status:", error);
        // Default to requiring calibration on error to be safe
        return { requiresCalibration: true, message: "Database error checking calibration.", details: [] };
    }
}

export async function saveCalibration(compartment: number, slope: number, intercept: number, researcher: string): Promise<boolean> {
    try {
        const db = await getDb();
        await db.run(
            "INSERT INTO calibrations (compartment, slope, intercept, researcher) VALUES (?, ?, ?, ?)",
            [compartment, slope, intercept, researcher]
        );
        // The client (calibration/page.tsx) is responsible for publishing
        // the reload_calibration command via the MQTT context after this returns.
        return true;
    } catch (error) {
        console.error("Failed to save calibration:", error);
        return false;
    }
}

export type CalibrationRecord = {
    id: number;
    compartment: number;
    slope: number;
    intercept: number;
    researcher: string;
    calibrated_at: string;
};

export async function getCalibrationHistory(): Promise<CalibrationRecord[]> {
    try {
        const db = await getDb();
        const records = await db.all<CalibrationRecord[]>(
            "SELECT * FROM calibrations ORDER BY calibrated_at DESC LIMIT 50"
        );
        return records;
    } catch (error) {
        console.error("Failed to fetch calibration history:", error);
        return [];
    }
}
