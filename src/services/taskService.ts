import { supabase } from '../supabaseClient';
import { Task } from '../types/shared';
import { scheduleTasks, ScheduleResult } from './scheduler';
import { UserPreferences } from './userPreferences';

// Fetch all tasks for a user
export async function getTasks(userId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('start_datetime', { ascending: true });
  
  if (error) throw error;
  return data as Task[];
}

// Create a new task
export async function createTask(payload: Partial<Task>) {
  const { data, error } = await supabase
    .from('tasks')
    .insert([payload])
    .select();
  
  if (error) throw error;
  return data[0] as Task;
}

// Update an existing task
export async function updateTask(taskId: string, updates: Partial<Task>) {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select();
  
  if (error) throw error;
  return data[0] as Task;
}

// Delete a task
export async function deleteTask(taskId: string) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);
  
  if (error) throw error;
}

// Retune the schedule for a user
export async function retuneSchedule(userId: string, userPreferences: UserPreferences): Promise<ScheduleResult> {
  // 1. Fetch all tasks
  const tasks = await getTasks(userId);
  
  // 2. Run the scheduler
  const scheduleResult = scheduleTasks(tasks, userPreferences);
  
  // 3. Update task statuses in the database
  const updates = [
    ...scheduleResult.scheduledTasks.map(task => ({
      id: task.id,
      status: 'scheduled',
      start_datetime: task.start_datetime
    })),
    ...scheduleResult.impossibleTasks.map(task => ({
      id: task.id,
      status: 'not_able_to_schedule'
    }))
  ];
  
  // Batch update all tasks
  const { error } = await supabase
    .from('tasks')
    .upsert(updates, { onConflict: 'id' });
  
  if (error) throw error;
  
  return scheduleResult;
}

// Get tasks by status
export async function getTasksByStatus(userId: string, status: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', status)
    .order('start_datetime', { ascending: true });
  
  if (error) throw error;
  return data as Task[];
}

// Set task status
export async function setTaskStatus(taskId: string, status: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId)
    .select();
  
  if (error) throw error;
  return data[0] as Task;
}

// (Optional) Add more CRUD functions as needed, e.g. updateTask, getTasks, etc. 