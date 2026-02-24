"use server";

import { getDb } from "@/lib/db";

export type Project = {
    id: number;
    name: string;
    researcher_name: string;
    created_at: string;
};

export type Experiment = {
    id: number;
    project_id: number;
    name: string;
    target_ph_min: number;
    target_ph_max: number;
    status: string;
    created_at: string;
};

export type Telemetry = {
    id: number;
    experiment_id: number;
    timestamp: string;
    compartment_1_ph: number;
    compartment_2_ph: number;
    compartment_3_ph: number;
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
        const result = await db.run(
            "INSERT INTO projects (name, researcher_name) VALUES (?, ?)",
            [name, researcher_name]
        );

        if (result.lastID) {
            return await getProjectById(result.lastID.toString());
        }
        return null;
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

export async function stopExperiment(experimentId: number | string): Promise<boolean> {
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

export async function updateProject(id: number, data: Partial<Project>): Promise<boolean> {
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

export async function deleteExperiment(id: number | string): Promise<boolean> {
    try {
        const db = await getDb();

        // Manual Cascade (Since FK constraints might not have ON DELETE CASCADE set historically)
        await db.run("DELETE FROM telemetry WHERE experiment_id = ?", [id]);
        await db.run("DELETE FROM experiments WHERE id = ?", [id]);

        return true;
    } catch (error) {
        console.error("Failed to delete experiment:", error);
        return false;
    }
}

export async function deleteProject(id: number | string): Promise<boolean> {
    try {
        const db = await getDb();

        // Manual Cascade
        const experiments = await db.all<{ id: number }[]>("SELECT id FROM experiments WHERE project_id = ?", [id]);

        for (const exp of experiments) {
            await db.run("DELETE FROM telemetry WHERE experiment_id = ?", [exp.id]);
            await db.run("DELETE FROM experiments WHERE id = ?", [exp.id]);
        }

        await db.run("DELETE FROM projects WHERE id = ?", [id]);

        return true;
    } catch (error) {
        console.error("Failed to delete project:", error);
        return false;
    }
}
