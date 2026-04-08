import sqlite3
import logging
import os
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)

class SQLiteClient:
    def __init__(self, db_path=None):
        self.db_path = db_path or os.getenv("SQLITE_DB_PATH", "reactor.db")
        self._init_db()

    def _init_db(self):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA journal_mode=WAL;')
                cursor = conn.cursor()
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        researcher_name TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                cursor.execute('''
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
                        ph_moving_avg_window INTEGER DEFAULT 10,
                        status TEXT DEFAULT 'active',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (project_id) REFERENCES projects(id)
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS telemetry (
                        id TEXT PRIMARY KEY,
                        experiment_id TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        compartment_1_ph REAL,
                        compartment_2_ph REAL,
                        compartment_3_ph REAL,
                        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS experiment_logs (
                        id TEXT PRIMARY KEY,
                        experiment_id TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        level TEXT NOT NULL,
                        message TEXT NOT NULL,
                        compartment INTEGER,
                        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS calibrations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        compartment INTEGER,
                        point1_ph REAL,
                        point1_raw INTEGER,
                        point2_ph REAL,
                        point2_raw INTEGER,
                        point3_ph REAL,
                        point3_raw INTEGER,
                        researcher TEXT,
                        calibrated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_telemetry_experiment_time ON telemetry(experiment_id, timestamp);')

                # ── Schema migrations (safe: no-op if column already exists) ──
                migration_cols = [
                    'ALTER TABLE calibrations ADD COLUMN researcher TEXT',
                    'ALTER TABLE calibrations ADD COLUMN point1_ph REAL',
                    'ALTER TABLE calibrations ADD COLUMN point1_raw INTEGER',
                    'ALTER TABLE calibrations ADD COLUMN point2_ph REAL',
                    'ALTER TABLE calibrations ADD COLUMN point2_raw INTEGER',
                    'ALTER TABLE calibrations ADD COLUMN point3_ph REAL',
                    'ALTER TABLE calibrations ADD COLUMN point3_raw INTEGER',
                    'ALTER TABLE experiments ADD COLUMN ph_moving_avg_window INTEGER DEFAULT 10',
                ]
                for stmt in migration_cols:
                    try:
                        cursor.execute(stmt)
                    except sqlite3.OperationalError:
                        pass  # Column already exists — skip
                    
                conn.commit()
                logger.info("SQLite Database initialized with WAL and telemetry tracking.")
        except Exception as e:
            logger.error(f"Error initializing SQLite DB: {e}")

    def get_latest_calibrations(self):
        """
        Return the most recent two-point raw calibration for each compartment.

        Returns:
            {
                compartment_id: {
                    "point1_ph": float, "point1_raw": int,
                    "point2_ph": float, "point2_raw": int
                }
            }
        Only compartments with a complete calibration record are included.
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA journal_mode=WAL;')
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                calibrations = {}
                for comp in [1, 2, 3]:
                    cursor.execute('''
                        SELECT point1_ph, point1_raw, point2_ph, point2_raw, point3_ph, point3_raw
                        FROM calibrations
                        WHERE compartment = ?
                          AND point1_ph IS NOT NULL
                          AND point1_raw IS NOT NULL
                          AND point2_ph IS NOT NULL
                          AND point2_raw IS NOT NULL
                        ORDER BY calibrated_at DESC
                        LIMIT 1
                    ''', (comp,))
                    row = cursor.fetchone()
                    if row:
                        calibrations[comp] = dict(row)
                return calibrations
        except Exception as e:
            logger.error(f"Error getting latest calibrations: {e}")
            return {}

    def get_active_experiment(self):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA journal_mode=WAL;')
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM experiments WHERE status = 'active' ORDER BY id DESC LIMIT 1
                ''')
                row = cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error getting active experiment: {e}")
            return None

    def create_project(self, name: str, researcher_name: str = None):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA journal_mode=WAL;')
                cursor = conn.cursor()
                project_id = str(uuid.uuid4())
                cursor.execute('INSERT INTO projects (id, name, researcher_name) VALUES (?, ?, ?)', (project_id, name, researcher_name))
                conn.commit()
                return project_id
        except Exception as e:
            logger.error(f"Error creating project: {e}")
            return None

    def create_experiment(self, project_id: str, name: str, config: dict):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA journal_mode=WAL;')
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE experiments SET status = 'completed' WHERE status = 'active'
                ''')
                experiment_id = str(uuid.uuid4())
                cursor.execute('''
                    INSERT INTO experiments (
                        id, project_id, name, measurement_interval_mins, c1_min_ph, c1_max_ph, 
                        c2_min_ph, c2_max_ph, c3_min_ph, c3_max_ph, max_pump_time_sec, 
                        mixing_cooldown_sec, ph_moving_avg_window, manual_dose_steps, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
                ''', (
                    experiment_id, project_id, name, config.get('measurement_interval_mins', 1),
                    config.get('c1_min_ph'), config.get('c1_max_ph'),
                    config.get('c2_min_ph'), config.get('c2_max_ph'),
                    config.get('c3_min_ph'), config.get('c3_max_ph'),
                    config.get('max_pump_time_sec'), config.get('mixing_cooldown_sec'), 
                    config.get('ph_moving_avg_window', 10), 0  # manual_dose_steps deprecated, sentinel 0
                ))
                conn.commit()
                return experiment_id
        except Exception as e:
            logger.error(f"Error creating experiment: {e}")
            return None

    def log_telemetry(self, experiment_id: str, ph_data: dict):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA journal_mode=WAL;')
                cursor = conn.cursor()
                log_id = str(uuid.uuid4())
                cursor.execute('''
                    INSERT INTO telemetry (id, experiment_id, compartment_1_ph, compartment_2_ph, compartment_3_ph)
                    VALUES (?, ?, ?, ?, ?)
                ''', (log_id, experiment_id, ph_data.get(1), ph_data.get(2), ph_data.get(3)))
                conn.commit()
        except Exception as e:
            logger.error(f"Error logging telemetry: {e}")

    def log_event(self, experiment_id: str, level: str, message: str, compartment: int = None):
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('PRAGMA journal_mode=WAL;')
                cursor = conn.cursor()
                log_id = str(uuid.uuid4())
                cursor.execute('''
                    INSERT INTO experiment_logs (id, experiment_id, level, message, compartment)
                    VALUES (?, ?, ?, ?, ?)
                ''', (log_id, experiment_id, level, message, compartment))
                conn.commit()
        except Exception as e:
            logger.error(f"Error logging event: {e}")

