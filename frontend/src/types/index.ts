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

/**
 * A single compartment's real-time reading as published by the backend on
 * the reactor/telemetry/ph MQTT topic.
 *
 * - ph:     Calibrated pH value (null when the sensor is offline).
 * - raw:    Raw 16-bit ADS1115 integer (null when the sensor is offline).
 * - stable: True when the last STABILITY_WINDOW_SIZE raw readings spread
 *           is below STABILITY_THRESHOLD ADC steps.
 */
export type CompartmentReading = {
    ph: number | null;
    raw: number | null;
    stable: boolean;
};

/**
 * Full real-time telemetry payload shape — maps compartment ID (1, 2, 3)
 * to its latest reading.
 */
export type PhData = {
    1?: CompartmentReading;
    2?: CompartmentReading;
    3?: CompartmentReading;
};
