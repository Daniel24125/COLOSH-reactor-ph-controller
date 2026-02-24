import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Connect to the SQLite DB created by the Python backend
const dbPath = path.resolve('../server/reactor.db');

export async function POST(req: Request) {
    try {
        const { projectName, researcherName, experimentName, targetPhMin, targetPhMax } = await req.json();

        if (!projectName || !experimentName || !targetPhMin || !targetPhMax) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // 1. Create Project (assuming a new project for every experiment for simplicity, or look it up)
        const projectResult = await db.run('INSERT INTO projects (name, researcher_name) VALUES (?, ?)', [projectName, researcherName]);
        const projectId = projectResult.lastID;

        // 2. Set existing active experiments to completed
        await db.run('UPDATE experiments SET status = ? WHERE status = ?', ['completed', 'active']);

        // 3. Create new Experiment
        const experimentResult = await db.run(
            'INSERT INTO experiments (project_id, name, target_ph_min, target_ph_max, status) VALUES (?, ?, ?, ?, ?)',
            [projectId, experimentName, targetPhMin, targetPhMax, 'active']
        );

        await db.close();

        return NextResponse.json({
            success: true,
            projectId,
            experimentId: experimentResult.lastID
        });

    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
