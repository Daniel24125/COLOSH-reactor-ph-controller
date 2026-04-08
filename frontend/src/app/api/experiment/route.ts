import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const {
            projectId, projectName, researcherName, experimentName,
            measurementIntervalMins, c1MinPh, c1MaxPh, c2MinPh, c2MaxPh, c3MinPh, c3MaxPh,
            maxPumpTimeSec, mixingCooldownSec, phMovingAvgWindow
        } = await req.json();

        if (
            !experimentName ||
            measurementIntervalMins === undefined ||
            c1MinPh === undefined || c1MaxPh === undefined ||
            c2MinPh === undefined || c2MaxPh === undefined ||
            c3MinPh === undefined || c3MaxPh === undefined ||
            maxPumpTimeSec === undefined || mixingCooldownSec === undefined || phMovingAvgWindow === undefined
        ) {
            return NextResponse.json({ error: 'Missing required experiment fields' }, { status: 400 });
        }

        if (!projectId && !projectName) {
            return NextResponse.json({ error: 'Must provide either an existing projectId or a new projectName' }, { status: 400 });
        }

        const db = await getDb();

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
                max_pump_time_sec, mixing_cooldown_sec, ph_moving_avg_window, manual_dose_steps, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                experimentId, activeProjectId, experimentName, measurementIntervalMins || 1,
                c1MinPh, c1MaxPh, c2MinPh, c2MaxPh, c3MinPh, c3MaxPh,
                maxPumpTimeSec, mixingCooldownSec, phMovingAvgWindow, 0, 'active'
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
