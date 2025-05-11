-- Add scheduling_type column to tasks
ALTER TABLE tasks
ADD COLUMN scheduling_type TEXT CHECK (scheduling_type IN ('fixed', 'flexible', 'preferred')) DEFAULT 'flexible';

-- (Optional) Remove is_fixed and is_deadline columns if you want to fully migrate
-- ALTER TABLE tasks DROP COLUMN is_fixed;
-- ALTER TABLE tasks DROP COLUMN is_deadline;

-- If you want to keep them for backward compatibility, you can leave them for now.

-- Backfill existing data: set scheduling_type based on is_fixed
UPDATE tasks SET scheduling_type = 'fixed' WHERE is_fixed = true;
UPDATE tasks SET scheduling_type = 'flexible' WHERE is_fixed = false; 