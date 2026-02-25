import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/db";

// ── helpers ──────────────────────────────────────────────────────────────────

function styleHeader(row: ExcelJS.Row, bgColor = "1E3A5F") {
    row.eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bgColor}` } };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = {
            bottom: { style: "thin", color: { argb: "FF4C78A8" } }
        };
    });
    row.height = 22;
}

function styleDataRow(row: ExcelJS.Row, isEven: boolean) {
    const bg = isEven ? "F0F4FA" : "FFFFFF";
    row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${bg}` } };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    });
    row.height = 18;
}

function toUtcDate(ts: string): Date {
    if (ts.includes("T") || ts.includes("Z")) return new Date(ts);
    return new Date(ts.replace(" ", "T") + "Z");
}

function elapsed(startedAt: string, ts: string): string {
    const totalSec = Math.floor((toUtcDate(ts).getTime() - toUtcDate(startedAt).getTime()) / 1000);
    if (totalSec <= 0) return "0s";
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(" ");
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    try {
        const db = await getDb();

        // Fetch all data in parallel
        const [experiment, telemetry, logs] = await Promise.all([
            db.get<Record<string, unknown>>(
                `SELECT e.*, p.name AS project_name, p.researcher_name, p.created_at AS project_created_at
                 FROM experiments e
                 LEFT JOIN projects p ON e.project_id = p.id
                 WHERE e.id = ?`,
                [id]
            ),
            db.all<Record<string, unknown>[]>(
                "SELECT * FROM telemetry WHERE experiment_id = ? ORDER BY timestamp ASC",
                [id]
            ),
            db.all<Record<string, unknown>[]>(
                "SELECT * FROM experiment_logs WHERE experiment_id = ? ORDER BY timestamp ASC",
                [id]
            ),
        ]);

        if (!experiment) {
            return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
        }

        const expStart = experiment.created_at as string;

        // ── Workbook ──────────────────────────────────────────────────────────
        const wb = new ExcelJS.Workbook();
        wb.creator = "ReactorControl";
        wb.created = new Date();

        // ── Sheet 1: Project & Experiment Info ──────────────────────────────
        const infoSheet = wb.addWorksheet("Info", { properties: { tabColor: { argb: "FF2563EB" } } });
        infoSheet.columns = [
            { key: "field", width: 32 },
            { key: "value", width: 48 },
        ];

        const addInfoSection = (title: string, rows: [string, unknown][]) => {
            const titleRow = infoSheet.addRow([title]);
            titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
            titleRow.height = 26;
            infoSheet.addRow([]); // spacer

            rows.forEach(([field, value], i) => {
                const r = infoSheet.addRow([field, value ?? "—"]);
                styleDataRow(r, i % 2 === 0);
            });
            infoSheet.addRow([]); // spacer
        };

        addInfoSection("Project", [
            ["Project Name", experiment.project_name],
            ["Researcher", experiment.researcher_name],
            ["Project Created", experiment.project_created_at ? toUtcDate(experiment.project_created_at as string).toLocaleString() : "—"],
        ]);

        addInfoSection("Experiment", [
            ["Experiment ID", experiment.id],
            ["Experiment Name", experiment.name],
            ["Status", experiment.status],
            ["Started At", expStart ? toUtcDate(expStart).toLocaleString() : "—"],
            ["Measurement Interval", `${experiment.measurement_interval_mins} min`],
        ]);

        addInfoSection("pH Thresholds", [
            ["Compartment 1 Min pH", experiment.c1_min_ph],
            ["Compartment 1 Max pH", experiment.c1_max_ph],
            ["Compartment 2 Min pH", experiment.c2_min_ph],
            ["Compartment 2 Max pH", experiment.c2_max_ph],
            ["Compartment 3 Min pH", experiment.c3_min_ph],
            ["Compartment 3 Max pH", experiment.c3_max_ph],
        ]);

        addInfoSection("Pump Configuration", [
            ["Max Pump Time (sec)", experiment.max_pump_time_sec],
            ["Mixing Cooldown (sec)", experiment.mixing_cooldown_sec],
            ["Manual Dose Steps", experiment.manual_dose_steps],
        ]);

        addInfoSection("Export", [
            ["Total Measurements", telemetry.length],
            ["Total Log Entries", logs.length],
            ["Exported At", new Date().toLocaleString()],
        ]);

        // ── Sheet 2: Measurements ────────────────────────────────────────────
        const measSheet = wb.addWorksheet("Measurements", { properties: { tabColor: { argb: "FF10B981" } } });
        measSheet.columns = [
            { key: "timestamp", header: "Timestamp (UTC)", width: 22 },
            { key: "elapsed", header: "Elapsed", width: 14 },
            { key: "c1", header: "Compartment 1 pH", width: 18 },
            { key: "c2", header: "Compartment 2 pH", width: 18 },
            { key: "c3", header: "Compartment 3 pH", width: 18 },
        ];

        styleHeader(measSheet.getRow(1));

        telemetry.forEach((row, i) => {
            const ts = row.timestamp as string;
            const r = measSheet.addRow({
                timestamp: toUtcDate(ts).toLocaleString(),
                elapsed: elapsed(expStart, ts),
                c1: row.compartment_1_ph,
                c2: row.compartment_2_ph,
                c3: row.compartment_3_ph,
            });
            styleDataRow(r, i % 2 === 0);
        });

        // Auto-filter on header row
        measSheet.autoFilter = { from: "A1", to: "E1" };

        // ── Sheet 3: Event Logs ───────────────────────────────────────────────
        const logsSheet = wb.addWorksheet("Logs", { properties: { tabColor: { argb: "FFEF4444" } } });
        logsSheet.columns = [
            { key: "timestamp", header: "Timestamp (UTC)", width: 22 },
            { key: "elapsed", header: "Elapsed", width: 14 },
            { key: "level", header: "Level", width: 10 },
            { key: "compartment", header: "Compartment", width: 14 },
            { key: "message", header: "Message", width: 80 },
        ];

        styleHeader(logsSheet.getRow(1));

        logs.forEach((log, i) => {
            const ts = log.timestamp as string;
            const r = logsSheet.addRow({
                timestamp: toUtcDate(ts).toLocaleString(),
                elapsed: elapsed(expStart, ts),
                level: log.level,
                compartment: log.compartment ?? "—",
                message: log.message,
            });
            styleDataRow(r, i % 2 === 0);

            // Colour-code the level cell
            const levelCell = r.getCell("level");
            if (log.level === "ERROR") {
                levelCell.font = { bold: true, color: { argb: "FFEF4444" } };
            } else if (log.level === "WARNING") {
                levelCell.font = { bold: true, color: { argb: "FFF59E0B" } };
            } else {
                levelCell.font = { color: { argb: "FF6366F1" } };
            }
        });

        logsSheet.autoFilter = { from: "A1", to: "E1" };

        // ── Serialize & return ────────────────────────────────────────────────
        const buffer = await wb.xlsx.writeBuffer();
        const expName = (experiment.name as string).replace(/[^a-z0-9]/gi, "_");
        const filename = `ReactorExport_${expName}_${id.slice(0, 8)}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });

    } catch (error) {
        console.error("Export error:", error);
        return NextResponse.json({ error: "Failed to generate export" }, { status: 500 });
    }
}
