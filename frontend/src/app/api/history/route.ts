import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Connect to the SQLite DB created by the Python backend
const dbPath = path.resolve('../server/reactor.db');

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const experimentId = searchParams.get('experiment_id');

        if (!experimentId) {
            return NextResponse.json({ error: 'Missing experiment_id query parameter' }, { status: 400 });
        }

        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await db.exec('PRAGMA journal_mode=WAL;');

        const telemetry = await db.all(
            'SELECT * FROM telemetry WHERE experiment_id = ? ORDER BY timestamp ASC',
            [experimentId]
        );

        await db.close();

        return NextResponse.json({
            success: true,
            data: telemetry
        });

    } catch (error) {
        console.error('Database Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
