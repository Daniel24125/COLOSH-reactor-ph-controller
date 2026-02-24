import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Connect to the SQLite DB created by the Python backend
const dbPath = path.resolve('../server/reactor.db');

export async function POST(req: Request) {
    try {
        const { projectId, projectName, researcherName, experimentName, targetPhMin, targetPhMax } = await req.json();

        if (!experimentName || targetPhMin === undefined || targetPhMax === undefined) {
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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                researcher_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS experiments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                name TEXT NOT NULL,
                target_ph_min REAL NOT NULL,
                target_ph_max REAL NOT NULL,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                experiment_id INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                compartment_1_ph REAL,
                compartment_2_ph REAL,
                compartment_3_ph REAL,
                FOREIGN KEY (experiment_id) REFERENCES experiments(id)
            );
            CREATE INDEX IF NOT EXISTS idx_telemetry_experiment_time ON telemetry(experiment_id, timestamp);
        `);

        let activeProjectId = projectId;

        // 1. Create Project if no ID was provided (assuming user selected 'Create New')
        if (!activeProjectId) {
            const projectResult = await db.run('INSERT INTO projects (name, researcher_name) VALUES (?, ?)', [projectName, researcherName]);
            activeProjectId = projectResult.lastID;
        }

        // 2. Set existing active experiments to completed
        await db.run('UPDATE experiments SET status = ? WHERE status = ?', ['completed', 'active']);

        // 3. Create new Experiment
        const experimentResult = await db.run(
            'INSERT INTO experiments (project_id, name, target_ph_min, target_ph_max, status) VALUES (?, ?, ?, ?, ?)',
            [activeProjectId, experimentName, targetPhMin, targetPhMax, 'active']
        );

        await db.close();

        return NextResponse.json({
            success: true,
            projectId: activeProjectId,
            experimentId: experimentResult.lastID
        });

    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
