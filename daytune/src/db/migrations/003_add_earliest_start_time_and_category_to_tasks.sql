-- Add earliest_start_time and category columns to tasks
ALTER TABLE tasks
ADD COLUMN earliest_start_time TIME,
ADD COLUMN category TEXT; 