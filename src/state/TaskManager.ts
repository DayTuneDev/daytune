import { supabase } from '../supabaseClient';
import { scheduleTasks, handleTaskOverrun, Task as SchedulerTask, ScheduleResult } from '../services/scheduler';
import { Task } from '../types/shared';
import { getUserPreferences, UserPreferences } from '../services/userPreferences';

interface ScheduledTask extends Task {
  scheduled_start: string;
  scheduled_end: string;
}

interface ImpossibleTask extends Task {
  reason: string;
}

interface ScheduleSummary {
  totalTasks: number;
  scheduledTasks: number;
  impossibleTasks: number;
  totalDuration: number;
  scheduledDuration: number;
  impossibleDuration: number;
}

interface TaskState {
  tasks: Task[];
  scheduledTasks: ScheduledTask[];
  impossibleTasks: ImpossibleTask[];
  summary: ScheduleSummary | null;
}

interface TaskStateUpdate extends TaskState {
  type: 'TASK_STATE_UPDATED';
}

type TaskUpdateCallback = (update: TaskStateUpdate) => void;

interface TaskOperationResult<T = null> {
  data: T | null;
  error: Error | null;
}

class TaskManager {
  private subscribers: Set<TaskUpdateCallback>;
  private tasks: Task[];
  private scheduledTasks: ScheduledTask[];
  private impossibleTasks: ImpossibleTask[];
  private scheduleSummary: ScheduleSummary | null;
  private userId: string | null;
  private userPreferences: UserPreferences | null;

  constructor() {
    this.subscribers = new Set();
    this.tasks = [];
    this.scheduledTasks = [];
    this.impossibleTasks = [];
    this.scheduleSummary = null;
    this.userId = null;
    this.userPreferences = null;
  }

  async setUserId(userId: string): Promise<void> {
    this.userId = userId;
    this.userPreferences = await getUserPreferences(userId);
    if (!this.userPreferences) {
      console.warn('No user preferences found for user:', userId);
    }
  }

  // Subscribe to task updates
  subscribe(callback: TaskUpdateCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Notify all subscribers of changes
  private notifySubscribers(update: TaskStateUpdate): void {
    this.subscribers.forEach((callback) => callback(update));
  }

  // Update task state
  private async updateTaskState(
    tasks: Task[],
    scheduledTasks: ScheduledTask[],
    impossibleTasks: ImpossibleTask[],
    summary: ScheduleSummary | null
  ): Promise<void> {
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
  async fetchTasks(): Promise<TaskOperationResult<Task[]>> {
    if (!this.userId) {
      return { data: null, error: new Error('No user ID set') };
    }

    if (!this.userPreferences) {
      return { data: null, error: new Error('No user preferences found') };
    }

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', this.userId)
        .order('start_datetime', { ascending: true });

      if (error) throw error;

      const { scheduledTasks, impossibleTasks } = scheduleTasks(data || [], this.userPreferences);
      
      // Calculate summary
      const summary: ScheduleSummary = {
        totalTasks: (data || []).length,
        scheduledTasks: scheduledTasks.length,
        impossibleTasks: impossibleTasks.length,
        totalDuration: (data || []).reduce((sum, task) => sum + task.duration_minutes, 0),
        scheduledDuration: scheduledTasks.reduce((sum, task) => sum + task.duration_minutes, 0),
        impossibleDuration: impossibleTasks.reduce((sum, task) => sum + task.duration_minutes, 0),
      };

      await this.updateTaskState(
        data || [], 
        scheduledTasks as ScheduledTask[], 
        impossibleTasks as ImpossibleTask[],
        summary
      );

      return { data: data || [], error: null };
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Unknown error fetching tasks') 
      };
    }
  }

  // Add a new task
  async addTask(taskData: Omit<Task, 'id' | 'user_id'>): Promise<TaskOperationResult<Task>> {
    if (!this.userId) {
      return { data: null, error: new Error('No user ID set') };
    }

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
      return { data: data?.[0] || null, error: null };
    } catch (error) {
      console.error('Error adding task:', error);
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Unknown error adding task') 
      };
    }
  }

  // Update an existing task
  async updateTask(
    taskId: string, 
    updates: Partial<Omit<Task, 'id' | 'user_id'>>
  ): Promise<TaskOperationResult<Task>> {
    if (!this.userId) {
      return { data: null, error: new Error('No user ID set') };
    }

    try {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .eq('user_id', this.userId)
        .select();

      if (error) throw error;

      await this.fetchTasks(); // Refresh all tasks
      return { data: data?.[0] || null, error: null };
    } catch (error) {
      console.error('Error updating task:', error);
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Unknown error updating task') 
      };
    }
  }

  // Delete a task
  async deleteTask(taskId: string): Promise<TaskOperationResult> {
    if (!this.userId) {
      return { data: null, error: new Error('No user ID set') };
    }

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', this.userId);

      if (error) throw error;

      await this.fetchTasks(); // Refresh all tasks
      return { data: null, error: null };
    } catch (error) {
      console.error('Error deleting task:', error);
      return { 
        data: null, 
        error: error instanceof Error ? error : new Error('Unknown error deleting task') 
      };
    }
  }

  // Handle task overrun
  async handleTaskOverrun(task: Task, overrunMinutes: number): Promise<void> {
    if (!this.userPreferences) {
      throw new Error('No user preferences found');
    }

    const { scheduledTasks: newScheduledTasks, impossibleTasks: newImpossibleTasks } = 
      handleTaskOverrun(task, overrunMinutes, this.scheduledTasks as SchedulerTask[]);

    // Calculate new summary
    const summary: ScheduleSummary = {
      totalTasks: this.tasks.length,
      scheduledTasks: newScheduledTasks.length,
      impossibleTasks: newImpossibleTasks.length,
      totalDuration: this.tasks.reduce((sum, task) => sum + task.duration_minutes, 0),
      scheduledDuration: newScheduledTasks.reduce((sum, task) => sum + task.duration_minutes, 0),
      impossibleDuration: newImpossibleTasks.reduce((sum, task) => sum + task.duration_minutes, 0),
    };

    await this.updateTaskState(
      this.tasks,
      newScheduledTasks as ScheduledTask[],
      newImpossibleTasks as ImpossibleTask[],
      summary
    );
  }
}

export default TaskManager; 