-- Update tasks table with new fields
ALTER TABLE tasks
ADD COLUMN importance INTEGER CHECK (importance BETWEEN 1 AND 5) DEFAULT 3,
ADD COLUMN due_date DATE,
ADD COLUMN due_time TIME,
ADD COLUMN is_deadline BOOLEAN DEFAULT false,
ADD COLUMN is_fixed BOOLEAN DEFAULT false,
ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 30;

-- Add indexes for better query performance
CREATE INDEX idx_tasks_importance ON tasks(importance);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_is_fixed ON tasks(is_fixed);

-- Add comment to explain the importance scale
COMMENT ON COLUMN tasks.importance IS 'Task importance scale: 1 (lowest) to 5 (highest)'; 