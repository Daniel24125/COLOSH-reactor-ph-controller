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
                `SELECT calibrated_at FROM calibrations
                 WHERE compartment = ?
                   AND point1_ph IS NOT NULL AND point1_raw IS NOT NULL
                   AND point2_ph IS NOT NULL AND point2_raw IS NOT NULL
                 ORDER BY calibrated_at DESC LIMIT 1`,
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
        return { requiresCalibration: true, message: "Database error checking calibration.", details: [] };
    }
}

/**
 * Save a two-point empirical raw-ADC calibration for a compartment.
 *
 * @param compartment   Reactor compartment ID (1, 2, or 3)
 * @param point1_ph     Known pH of buffer solution 1
 * @param point1_raw    Locked raw ADC reading in buffer solution 1
 * @param point2_ph     Known pH of buffer solution 2
 * @param point2_raw    Locked raw ADC reading in buffer solution 2
 * @param researcher    Name of the researcher performing the calibration
 */
export async function saveCalibration(
    compartment: number,
    point1_ph: number,
    point1_raw: number,
    point2_ph: number,
    point2_raw: number,
    researcher: string,
    point3_ph?: number | null,
    point3_raw?: number | null
): Promise<boolean> {
    try {
        const db = await getDb();
        await db.run(
            `INSERT INTO calibrations
                (compartment, point1_ph, point1_raw, point2_ph, point2_raw, point3_ph, point3_raw, researcher)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [compartment, point1_ph, point1_raw, point2_ph, point2_raw, point3_ph ?? null, point3_raw ?? null, researcher]
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
    point1_ph: number;
    point1_raw: number;
    point2_ph: number;
    point2_raw: number,
    point3_ph: number | null,
    point3_raw: number | null,
    researcher: string,
    calibrated_at: string;
};

export async function getCalibrationHistory(): Promise<CalibrationRecord[]> {
    try {
        const db = await getDb();
        const records = await db.all<CalibrationRecord[]>(
            `SELECT id, compartment, point1_ph, point1_raw, point2_ph, point2_raw,
                    point3_ph, point3_raw, researcher, calibrated_at
             FROM calibrations
             WHERE point1_ph IS NOT NULL AND point1_raw IS NOT NULL
               AND point2_ph IS NOT NULL AND point2_raw IS NOT NULL
             ORDER BY calibrated_at DESC LIMIT 50`
        );
        return records;
    } catch (error) {
        console.error("Failed to fetch calibration history:", error);
        return [];
    }
}
