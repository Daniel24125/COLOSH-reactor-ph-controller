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
    compartment_1_ph: number | null;
    compartment_2_ph: number | null;
    compartment_3_ph: number | null;
};

export type ExperimentLog = {
    id: string;
    experiment_id: string;
    timestamp: string;
    level: string;
    message: string;
    compartment: number | null;
};
