-- 005_create_user_preferences.sql
CREATE TABLE IF NOT EXISTS user_preferences (
    id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    sleep_start time NOT NULL DEFAULT '00:00',
    sleep_end time NOT NULL DEFAULT '08:00',
    sleep_duration int NOT NULL DEFAULT 480, -- in minutes
    work_start time NOT NULL DEFAULT '09:00',
    work_end time NOT NULL DEFAULT '17:00',
    work_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5], -- 0=Sun, 6=Sat
    created_at timestamptz NOT NULL DEFAULT now()
); 