import { supabase } from '../supabaseClient';
import { scheduleTasks, handleTaskOverrun } from '../services/scheduler';

class TaskManager {
  constructor() {
    this.subscribers = new Set();
    this.tasks = [];
    this.scheduledTasks = [];
    this.impossibleTasks = [];
    this.scheduleSummary = null;
    this.userId = null;
  }

  setUserId(userId) {
    this.userId = userId;
  }

  // Subscribe to task updates
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Notify all subscribers of changes
  notifySubscribers(update) {
    this.subscribers.forEach((callback) => callback(update));
  }

  // Update task state
  async updateTaskState(tasks, scheduledTasks, impossibleTasks, summary) {
    this.tasks = tasks;
    this.scheduledTasks = scheduledTasks;
    this.impossibleTasks = impossibleTasks;
    this.scheduleSummary = summary;

    this.notifySubscribers({
      type: 'TASK_STATE_UPDATED',
      tasks: this.tasks,
      scheduledTasks: this.scheduledTasks,
      impossibleTasks: this.impossibleTasks,
      summary: this.scheduleSummary,
    });
  }

  // Fetch all tasks for the current user
  async fetchTasks() {
    if (!this.userId) return;

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', this.userId)
        .order('start_datetime', { ascending: true });

      if (error) throw error;

      const { scheduledTasks, impossibleTasks, summary } = scheduleTasks(data || []);
      await this.updateTaskState(data || [], scheduledTasks, impossibleTasks, summary);

      return { data, error: null };
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return { data: null, error };
    }
  }

  // Add a new task
  async addTask(taskData) {
    if (!this.userId) return { error: 'No user ID set' };

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([
          {
            ...taskData,
            user_id: this.userId,
          },
        ])
        .select();

      if (error) throw error;

      await this.fetchTasks(); // Refresh all tasks
      return { data, error: null };
    } catch (error) {
      console.error('Error adding task:', error);
      return { data: null, error };
    }
  }

  // Update an existing task
  async updateTask(taskId, updates) {
    if (!this.userId) return { error: 'No user ID set' };

    try {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .eq('user_id', this.userId)
        .select();

      if (error) throw error;

      await this.fetchTasks(); // Refresh all tasks
      return { data, error: null };
    } catch (error) {
      console.error('Error updating task:', error);
      return { data: null, error };
    }
  }

  // Delete a task
  async deleteTask(taskId) {
    if (!this.userId) return { error: 'No user ID set' };

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', this.userId);

      if (error) throw error;

      await this.fetchTasks(); // Refresh all tasks
      return { error: null };
    } catch (error) {
      console.error('Error deleting task:', error);
      return { error };
    }
  }

  // Handle task overrun
  async handleTaskOverrun(task, overrunMinutes) {
    const {
      scheduledTasks: newScheduledTasks,
      impossibleTasks: newImpossibleTasks,
      summary,
    } = handleTaskOverrun(task, overrunMinutes, this.scheduledTasks);

    await this.updateTaskState(this.tasks, newScheduledTasks, newImpossibleTasks, summary);
  }
}

export default TaskManager;
