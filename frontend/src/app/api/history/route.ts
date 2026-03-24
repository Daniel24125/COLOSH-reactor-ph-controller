import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const experimentId = searchParams.get('experiment_id');

        if (!experimentId) {
            return NextResponse.json({ error: 'Missing experiment_id query parameter' }, { status: 400 });
        }

        const db = await getDb();

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
