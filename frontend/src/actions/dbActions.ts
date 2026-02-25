"use server";

import { getDb } from "@/lib/db";

export type Project = {
    id: string;
    name: string;
    researcher_name: string;
    created_at: string;
};

export type Experiment = {
    id: string;
    project_id: string;
    name: string;
    measurement_interval_mins: number;
    c1_min_ph: number;
    c1_max_ph: number;
    c2_min_ph: number;
    c2_max_ph: number;
    c3_min_ph: number;
    c3_max_ph: number;
    max_pump_time_sec: number;
    mixing_cooldown_sec: number;
    manual_dose_steps: number;
    status: string;
    created_at: string;
};

export type Telemetry = {
    id: string;
    experiment_id: string;
    timestamp: string;
    compartment_1_ph: number;
    compartment_2_ph: number;
    compartment_3_ph: number;
};

export type ExperimentLog = {
    id: string;
    experiment_id: string;
    timestamp: string;
    level: string;
    message: string;
    compartment: number | null;
};

export async function getProjects(): Promise<Project[]> {
    try {
        const db = await getDb();
        const projects = await db.all<Project[]>(
            "SELECT * FROM projects ORDER BY created_at DESC"
        );
        return projects;
    } catch (error) {
        console.error("Failed to fetch projects:", error);
        return [];
    }
}

export async function getActiveExperiment(): Promise<Experiment | null> {
    try {
        const db = await getDb();
        const experiment = await db.get<Experiment>(
            "SELECT * FROM experiments WHERE status = 'active' ORDER BY id DESC LIMIT 1"
        );
        return experiment || null;
    } catch (error) {
        console.error("Failed to fetch active experiment:", error);
        return null;
    }
}

export async function getProjectById(id: string): Promise<Project | null> {
    try {
        const db = await getDb();
        const project = await db.get<Project>(
            "SELECT * FROM projects WHERE id = ?",
            [id]
        );
        return project || null;
    } catch (error) {
        console.error("Failed to fetch project:", error);
        return null;
    }
}

export async function createProject(name: string, researcher_name: string): Promise<Project | null> {
    try {
        const db = await getDb();
        const id = crypto.randomUUID();
        await db.run(
            "INSERT INTO projects (id, name, researcher_name) VALUES (?, ?, ?)",
            [id, name, researcher_name]
        );

        return await getProjectById(id);
    } catch (error) {
        console.error("Failed to create project:", error);
        return null;
    }
}

export async function getExperimentsByProject(projectId: string): Promise<Experiment[]> {
    try {
        const db = await getDb();
        const experiments = await db.all<Experiment[]>(
            "SELECT * FROM experiments WHERE project_id = ? ORDER BY created_at DESC",
            [projectId]
        );
        return experiments;
    } catch (error) {
        console.error("Failed to fetch experiments:", error);
        return [];
    }
}

export async function getTelemetry(experimentId: string): Promise<Telemetry[]> {
    try {
        const db = await getDb();
        const telemetry = await db.all<Telemetry[]>(
            "SELECT * FROM telemetry WHERE experiment_id = ? ORDER BY timestamp ASC",
            [experimentId]
        );
        return telemetry;
    } catch (error) {
        console.error("Failed to fetch telemetry:", error);
        return [];
    }
}

export async function getExperimentLogs(experimentId: string): Promise<ExperimentLog[]> {
    try {
        const db = await getDb();
        const logs = await db.all<ExperimentLog[]>(
            "SELECT * FROM experiment_logs WHERE experiment_id = ? ORDER BY timestamp ASC",
            [experimentId]
        );
        return logs;
    } catch (error) {
        console.error("Failed to fetch experiment logs:", error);
        return [];
    }
}

export async function stopExperiment(experimentId: string): Promise<boolean> {
    try {
        const db = await getDb();
        await db.run(
            "UPDATE experiments SET status = 'completed' WHERE id = ?",
            [experimentId]
        );
        return true;
    } catch (error) {
        console.error("Failed to stop experiment:", error);
        return false;
    }
}

export async function updateProject(id: string, data: Partial<Project>): Promise<boolean> {
    try {
        const db = await getDb();
        // Construct SET clause dynamically
        const entries = Object.entries(data);
        if (entries.length === 0) return false;

        const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
        const values = entries.map(([, val]) => val);

        await db.run(`UPDATE projects SET ${setClause} WHERE id = ?`, [...values, id]);
        return true;
    } catch (error) {
        console.error("Failed to update project:", error);
        return false;
    }
}

export async function deleteExperiment(id: string): Promise<boolean> {
    try {
        const db = await getDb();

        // Manual Cascade (Since FK constraints might not have ON DELETE CASCADE set historically)
        await db.run("DELETE FROM telemetry WHERE experiment_id = ?", [id]);
        await db.run("DELETE FROM experiment_logs WHERE experiment_id = ?", [id]);
        await db.run("DELETE FROM experiments WHERE id = ?", [id]);

        return true;
    } catch (error) {
        console.error("Failed to delete experiment:", error);
        return false;
    }
}

export async function deleteProject(id: string): Promise<boolean> {
    try {
        const db = await getDb();

        // Manual Cascade
        const experiments = await db.all<{ id: string }[]>("SELECT id FROM experiments WHERE project_id = ?", [id]);

        for (const exp of experiments) {
            await deleteExperiment(exp.id);
        }

        await db.run("DELETE FROM projects WHERE id = ?", [id]);

        return true;
    } catch (error) {
        console.error("Failed to delete project:", error);
        return false;
    }
}
