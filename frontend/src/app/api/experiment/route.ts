import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Connect to the SQLite DB created by the Python backend
const dbPath = path.resolve('../server/reactor.db');

export async function POST(req: Request) {
    try {
        const {
            projectId, projectName, researcherName, experimentName,
            measurementIntervalMins, c1MinPh, c1MaxPh, c2MinPh, c2MaxPh, c3MinPh, c3MaxPh,
            maxPumpTimeSec, mixingCooldownSec, manualDoseSteps
        } = await req.json();

        if (
            !experimentName ||
            measurementIntervalMins === undefined ||
            c1MinPh === undefined || c1MaxPh === undefined ||
            c2MinPh === undefined || c2MaxPh === undefined ||
            c3MinPh === undefined || c3MaxPh === undefined ||
            maxPumpTimeSec === undefined || mixingCooldownSec === undefined || manualDoseSteps === undefined
        ) {
            return NextResponse.json({ error: 'Missing required experiment fields' }, { status: 400 });
        }

        if (!projectId && !projectName) {
            return NextResponse.json({ error: 'Must provide either an existing projectId or a new projectName' }, { status: 400 });
        }

        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await db.exec('PRAGMA journal_mode=WAL;');

        // Ensure tables exist in case the DB was deleted and backend hasn't run
        await db.exec(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                researcher_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS experiments (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                name TEXT NOT NULL,
                measurement_interval_mins INTEGER DEFAULT 1,
                c1_min_ph REAL NOT NULL,
                c1_max_ph REAL NOT NULL,
                c2_min_ph REAL NOT NULL,
                c2_max_ph REAL NOT NULL,
                c3_min_ph REAL NOT NULL,
                c3_max_ph REAL NOT NULL,
                max_pump_time_sec INTEGER NOT NULL,
                mixing_cooldown_sec INTEGER NOT NULL,
                manual_dose_steps INTEGER NOT NULL,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS telemetry (
                id TEXT PRIMARY KEY,
                experiment_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                compartment_1_ph REAL,
                compartment_2_ph REAL,
                compartment_3_ph REAL,
                FOREIGN KEY (experiment_id) REFERENCES experiments(id)
            );
            CREATE TABLE IF NOT EXISTS experiment_logs (
                id TEXT PRIMARY KEY,
                experiment_id TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                compartment INTEGER,
                FOREIGN KEY (experiment_id) REFERENCES experiments(id)
            );
            CREATE INDEX IF NOT EXISTS idx_telemetry_experiment_time ON telemetry(experiment_id, timestamp);
        `);

        let activeProjectId = projectId;

        // 1. Create Project if no ID was provided (assuming user selected 'Create New')
        if (!activeProjectId) {
            activeProjectId = crypto.randomUUID();
            await db.run('INSERT INTO projects (id, name, researcher_name) VALUES (?, ?, ?)', [activeProjectId, projectName, researcherName]);
        }

        // 2. Set existing active experiments to completed
        await db.run('UPDATE experiments SET status = ? WHERE status = ?', ['completed', 'active']);

        // 3. Create new Experiment
        const experimentId = crypto.randomUUID();
        await db.run(
            `INSERT INTO experiments (
                id, project_id, name, measurement_interval_mins, c1_min_ph, c1_max_ph, c2_min_ph, c2_max_ph, c3_min_ph, c3_max_ph, 
                max_pump_time_sec, mixing_cooldown_sec, manual_dose_steps, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                experimentId, activeProjectId, experimentName, measurementIntervalMins || 1,
                c1MinPh, c1MaxPh, c2MinPh, c2MaxPh, c3MinPh, c3MaxPh,
                maxPumpTimeSec, mixingCooldownSec, manualDoseSteps, 'active'
            ]
        );

        await db.close();

        return NextResponse.json({
            success: true,
            projectId: activeProjectId,
            experimentId: experimentId
        });

    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
