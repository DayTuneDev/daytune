import type { UserPreferences } from './userPreferences';

// Add or import types at the top
export interface Task {
  id: string;
  title: string;
  start_datetime?: string;
  earliest_start_datetime?: string;
  due_datetime?: string;
  scheduling_type: 'fixed' | 'flexible' | 'preferred';
  category?: string;
  duration_minutes: number;
  importance: number;
  difficulty: number;
  tag?: string;
  status?: string;
  [key: string]: any;
}

export interface BlockedTimeBlock {
  start: Date;
  end: Date;
  title: string;
  scheduling_type?: string;
  is_blocked?: boolean;
}

export interface ScheduleResult {
  scheduledTasks: Task[];
  impossibleTasks: Task[];
}

export interface ScheduleSummary {
  message: string;
  importanceBreakdown: any;
}

// Main scheduling function
export function scheduleTasks(tasks: Task[], userPreferences: UserPreferences): ScheduleResult {
  // Separate tasks by scheduling_type
  const fixedTasks = tasks.filter((task) => task.scheduling_type === 'fixed');
  const preferredTasks = tasks.filter((task) => task.scheduling_type === 'preferred');
  const flexibleTasks = tasks.filter((task) => task.scheduling_type === 'flexible');

  // Sort preferred and flexible tasks by importance (descending) and then by deadline
  const sortByPriority = (a: Task, b: Task) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    if (a.due_date && b.due_date) {
      const dateA = new Date(`${a.due_date}T${a.due_time || '23:59'}`);
      const dateB = new Date(`${b.due_date}T${b.due_time || '23:59'}`);
      return dateA.getTime() - dateB.getTime();
    }
    return 0;
  };
  preferredTasks.sort(sortByPriority);
  flexibleTasks.sort(sortByPriority);

  // Blocked time blocks for today (and tomorrow if needed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const blockedBlocks = [
    ...getBlockedTimeBlocks(today, userPreferences),
    ...getBlockedTimeBlocks(new Date(today.getTime() + 24 * 60 * 60 * 1000), userPreferences),
  ];

  // Schedule fixed tasks first
  const scheduledTasks = [...fixedTasks];
  const impossibleTasks: Task[] = [];
  let currentTime = new Date();

  // Try to schedule preferred tasks at their preferred time if possible, else move
  for (const task of preferredTasks) {
    let taskStart: Date;
    if (task.start_date && task.start_time) {
      taskStart = new Date(`${task.start_date}T${task.start_time}`);
      // If preferred time is available, use it; else, find next available slot
      if (!isTimeSlotAvailable(taskStart, task.duration_minutes, scheduledTasks, blockedBlocks)) {
        taskStart = findNextAvailableSlot(
          currentTime,
          task.duration_minutes,
          scheduledTasks,
          blockedBlocks
        );
      }
    } else {
      taskStart = findNextAvailableSlot(
        currentTime,
        task.duration_minutes,
        scheduledTasks,
        blockedBlocks
      );
    }
    const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
    if (task.due_date) {
      const deadline = new Date(`${task.due_date}T${task.due_time || '23:59'}`);
      if (taskEnd > deadline) {
        impossibleTasks.push({
          ...task,
          reason: 'would_exceed_deadline',
          attempted_start: taskStart,
          attempted_end: taskEnd,
        });
        continue;
      }
    }
    scheduledTasks.push({
      ...task,
      start_datetime: taskStart.toISOString(),
    });
    currentTime = taskEnd;
  }

  // Try to schedule flexible tasks
  for (const task of flexibleTasks) {
    let taskStart: Date;
    if (task.start_datetime) {
      taskStart = new Date(task.start_datetime);
    } else {
      taskStart = findNextAvailableSlot(
        currentTime,
        task.duration_minutes,
        scheduledTasks,
        blockedBlocks
      );
    }
    const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
    if (task.due_date) {
      const deadline = new Date(`${task.due_date}T${task.due_time || '23:59'}`);
      if (taskEnd > deadline) {
        impossibleTasks.push({
          ...task,
          attempted_start: taskStart,
          attempted_end: taskEnd,
        });
        continue;
      }
    }
    scheduledTasks.push({
      ...task,
      start_datetime: taskStart.toISOString(),
    });
    currentTime = taskEnd;
  }

  // Sort scheduled tasks by start time
  scheduledTasks.sort((a: Task, b: Task) => {
    const aDate = a.start_datetime ? new Date(a.start_datetime).getTime() : 0;
    const bDate = b.start_datetime ? new Date(b.start_datetime).getTime() : 0;
    return aDate - bDate;
  });

  return {
    scheduledTasks,
    impossibleTasks
  };
}

// Generate a summary of the schedule
function generateScheduleSummary(scheduledTasks: Task[], impossibleTasks: Task[]): ScheduleSummary {
  const importanceCounts: Record<number, { scheduled: number; impossible: number }> = {
    5: { scheduled: 0, impossible: 0 },
    4: { scheduled: 0, impossible: 0 },
    3: { scheduled: 0, impossible: 0 },
    2: { scheduled: 0, impossible: 0 },
    1: { scheduled: 0, impossible: 0 },
  };

  // Count scheduled tasks by importance
  scheduledTasks.forEach((task) => {
    importanceCounts[task.importance].scheduled++;
  });

  // Count impossible tasks by importance
  impossibleTasks.forEach((task) => {
    importanceCounts[task.importance].impossible++;
  });

  // Generate messages for impossible tasks
  const messages: string[] = [];
  for (let i = 5; i >= 1; i--) {
    const { impossible } = importanceCounts[i];
    if (impossible > 0) {
      messages.push(`${impossible} level-${i} importance task(s) cannot be scheduled`);
    }
  }

  return {
    message: messages.join('. ') + '. Please review your schedule.',
    importanceBreakdown: importanceCounts,
  };
}

// Function to handle task overruns
export function handleTaskOverrun(task: Task, overrunMinutes: number, scheduledTasks: Task[]): ScheduleResult {
  const taskIndex = scheduledTasks.findIndex((t) => t.id === task.id);
  if (taskIndex === -1) return { scheduledTasks, impossibleTasks: [] };

  const updatedTasks = [...scheduledTasks];
  const currentTask = updatedTasks[taskIndex];

  // Update the current task's duration
  currentTask.duration_minutes += overrunMinutes;

  // Adjust all subsequent tasks
  for (let i = taskIndex + 1; i < updatedTasks.length; i++) {
    const task = updatedTasks[i];
    if (task.scheduling_type === 'fixed') {
      // If we hit a fixed task, we need to mark subsequent tasks as impossible
      const impossibleTasks = updatedTasks.slice(i).filter((t) => t.scheduling_type !== 'fixed');
      return {
        scheduledTasks: updatedTasks.slice(0, i),
        impossibleTasks
      };
    }

    // Move the task's start time
    const newStartTime = new Date(updatedTasks[i - 1].start_datetime ?? 0);
    newStartTime.setMinutes(newStartTime.getMinutes() + updatedTasks[i - 1].duration_minutes);
    task.start_datetime = newStartTime.toISOString();
  }

  return {
    scheduledTasks: updatedTasks,
    impossibleTasks: []
  };
}

// Helper to parse time string (e.g., '08:00') into minutes since midnight
function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Helper to create a Date at a specific time on a given day
function dateAtTime(baseDate: Date, minutes: number): Date {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

// Helper to get blocked time blocks for a day
export function getBlockedTimeBlocks(date: Date, userPreferences: UserPreferences): BlockedTimeBlock[] {
  if (!userPreferences) return [];
  const blocks: BlockedTimeBlock[] = [];
  // Sleep block (may cross midnight)
  const sleepStart = parseTimeToMinutes(userPreferences.sleep_start || '00:00');
  const sleepEnd = parseTimeToMinutes(userPreferences.sleep_end || '08:00');
  if (sleepEnd > sleepStart) {
    // Same day
    blocks.push({
      start: dateAtTime(date, sleepStart),
      end: dateAtTime(date, sleepEnd),
      title: 'Sleep',
      scheduling_type: 'fixed',
      is_blocked: true,
    });
  } else {
    // Crosses midnight
    blocks.push({
      start: dateAtTime(date, sleepStart),
      end: dateAtTime(date, 24 * 60),
      title: 'Sleep',
      scheduling_type: 'fixed',
      is_blocked: true,
    });
    blocks.push({
      start: dateAtTime(new Date(date.getTime() + 24 * 60 * 60 * 1000), 0),
      end: dateAtTime(new Date(date.getTime() + 24 * 60 * 60 * 1000), sleepEnd),
      title: 'Sleep',
      scheduling_type: 'fixed',
      is_blocked: true,
    });
  }
  return blocks;
}

// Helper: check if a time slot overlaps with any blocked blocks
function isBlockedSlot(startTime: Date, duration: number, blockedBlocks: BlockedTimeBlock[]): boolean {
  const endTime = new Date(startTime.getTime() + duration * 60000);
  return blockedBlocks.some((block) => {
    return (
      (startTime >= block.start && startTime < block.end) ||
      (endTime > block.start && endTime <= block.end) ||
      (startTime <= block.start && endTime >= block.end)
    );
  });
}

// Helper function to check if a time slot is available
export function isTimeSlotAvailable(startTime: Date, duration: number, fixedTasks: Task[], blockedBlocks: BlockedTimeBlock[]): boolean {
  const endTime = new Date(startTime.getTime() + duration * 60000);
  // Check against fixed tasks
  const fixedConflict = fixedTasks.some((task) => {
    const taskStart = new Date(task.start_datetime ?? 0);
    const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
    return (
      (startTime >= taskStart && startTime < taskEnd) ||
      (endTime > taskStart && endTime <= taskEnd) ||
      (startTime <= taskStart && endTime >= taskEnd)
    );
  });
  if (fixedConflict) return false;
  // Check against blocked blocks
  if (isBlockedSlot(startTime, duration, blockedBlocks)) return false;
  return true;
}

// Helper function to find the next available time slot
function findNextAvailableSlot(startTime: Date, duration: number, fixedTasks: Task[], blockedBlocks: BlockedTimeBlock[]): Date {
  let currentTime = new Date(startTime);
  let attempts = 0;
  while (!isTimeSlotAvailable(currentTime, duration, fixedTasks, blockedBlocks)) {
    currentTime = new Date(currentTime.getTime() + 15 * 60000); // Try next 15-minute slot
    attempts++;
    if (attempts > 96) break; // Prevent infinite loop (24 hours)
  }
  return currentTime;
}
