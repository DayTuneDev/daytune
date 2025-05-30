// RetunePipeline.ts
// Main orchestrator for the retuning engine

import { getUserPreferences, UserPreferences } from '../services/userPreferences';
import { getLatestMoodLog, MoodLog } from '../services/mood';
import { getBlockedTimeBlocks } from '../services/scheduler';
import { supabase } from '../supabaseClient';
import { Task, BlockedTime } from '../types/shared';

// Utility methods from BaseStrategy
const isTimeSlotAvailable = (
  startTime: Date,
  duration: number,
  existingTasks: Task[]
): boolean => {
  const endTime = new Date(startTime.getTime() + duration * 60000);
  return !existingTasks.some((task) => {
    const taskStart = new Date(task.start_datetime!);
    const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
    return (
      (startTime >= taskStart && startTime < taskEnd) ||
      (endTime > taskStart && endTime <= taskEnd) ||
      (startTime <= taskStart && endTime >= taskEnd)
    );
  });
};

interface RetunePipelineState {
  tasks: Task[];
  scheduledTasks: Task[];
  unschedulableTasks: Task[];
  completedTasks: Task[];
  overextendedTasks: Task[];
  preferences: UserPreferences | null;
  mood: MoodLog | null;
  today: Date | null;
  blockedBlocks: BlockedTime[];
  openBlocks: { start: Date; end: Date }[];
}

export default class RetunePipeline {
  userId: string;
  state: RetunePipelineState;

  constructor({ userId }: { userId: string }) {
    this.userId = userId;
    this.state = {
      tasks: [],
      scheduledTasks: [],
      unschedulableTasks: [],
      completedTasks: [],
      overextendedTasks: [],
      preferences: null,
      mood: null,
      today: null,
      blockedBlocks: [],
      openBlocks: [],
    };
  }

  async retune(): Promise<void> {
    // 1. Load all state
    await this.loadState();
    console.log('[RetunePipeline] State after loadState:', this.state);

    // 2. Build open time blocks
    this.buildOpenBlocks();

    // 3. Shrink/slide sleep as needed
    this.optimizeSleepBlock();

    // 4. Sort and place tasks by priority, mood, and constraints
    this.placeTasks();

    // 5. Insert/remove breaks as needed
    this.manageBreaks();

    // 6. Snap-back Preferred tasks if possible
    this.snapBackPreferred();

    // 7. Validate for overlaps
    this.resolveOverlaps();

    // 8. Move unschedulable tasks to a special list
    this.handleUnschedulable();

    // 9. Commit the new schedule and update the UI
    this.commitSchedule();
  }

  async loadState(): Promise<void> {
    // Load user preferences and mood
    this.state.preferences = await getUserPreferences(this.userId);
    this.state.mood = await getLatestMoodLog(this.userId);

    // Fetch tasks and partition by status
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', this.userId)
      .order('start_datetime', { ascending: true });

    if (error) throw error;

    // Partition tasks by status
    this.state.tasks = (data || []).filter(
      (t: Task) => t.status === 'scheduled' || t.status === 'not_able_to_schedule'
    );
    this.state.completedTasks = this.state.tasks.filter(
      (t: Task) => t.status === 'done' || t.status === 'completed'
    );
    this.state.overextendedTasks = this.state.tasks.filter((t: Task) => t.status === 'overextended');
    this.state.unschedulableTasks = this.state.tasks.filter(
      (t: Task) => t.status === 'not_able_to_schedule'
    );
    this.state.tasks = this.state.tasks.filter((t: Task) => t.status !== 'set_aside');

    // Set up the current day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.state.today = today;
  }

  buildOpenBlocks(): void {
    // Use getBlockedTimeBlocks to get blocked blocks for today
    const { preferences, today } = this.state;
    if (!preferences || !today) {
      this.state.blockedBlocks = [];
      this.state.openBlocks = [];
      return;
    }
    // Get blocked blocks for today (sleep, work, etc.)
    const blockedBlocks = getBlockedTimeBlocks(today, preferences);
    this.state.blockedBlocks = blockedBlocks;

    // Calculate open/free blocks between blocked blocks for the day
    // Day starts at 00:00 and ends at 24:00
    const DAY_START = new Date(today);
    const DAY_END = new Date(today);
    DAY_END.setHours(24, 0, 0, 0);

    // Sort blocked blocks by start time
    const sortedBlocks = [...blockedBlocks].sort((a, b) => a.start.getTime() - b.start.getTime());
    const openBlocks: { start: Date; end: Date }[] = [];
    let lastEnd = DAY_START;
    for (const block of sortedBlocks) {
      if (block.start > lastEnd) {
        openBlocks.push({ start: new Date(lastEnd), end: new Date(block.start) });
      }
      lastEnd = block.end > lastEnd ? block.end : lastEnd;
    }
    // Add final open block if there's time after last blocked block
    if (lastEnd < DAY_END) {
      openBlocks.push({ start: new Date(lastEnd), end: new Date(DAY_END) });
    }
    this.state.openBlocks = openBlocks;
  }

  optimizeSleepBlock(): void {
    const { preferences, openBlocks, blockedBlocks, today } = this.state;
    if (!preferences || !openBlocks || !blockedBlocks || !today) return;

    const minSleepMinutes = 240; // 4 hours minimum
    const idealSleepMinutes = preferences.sleep_duration || 480; // default 8h
    const sleepStartPref = preferences.sleep_start || '00:00';
    const sleepEndPref = preferences.sleep_end || '08:00';

    // Convert preferred sleep times to minutes since midnight
    const [sleepStartHour, sleepStartMin] = sleepStartPref.split(':').map(Number);
    const [sleepEndHour, sleepEndMin] = sleepEndPref.split(':').map(Number);

    // Create ideal sleep block
    const idealSleepBlock = {
      start: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        sleepStartHour,
        sleepStartMin
      ),
      end: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        sleepEndHour,
        sleepEndMin
      ),
    };

    // If sleep crosses midnight, adjust end to next day
    if (sleepEndHour * 60 + sleepEndMin <= sleepStartHour * 60 + sleepStartMin) {
      idealSleepBlock.end.setDate(idealSleepBlock.end.getDate() + 1);
    }

    // Find best block for sleep
    let bestBlock: { start: Date; end: Date } | null = null;
    let bestLen = 0;
    for (const block of openBlocks) {
      const blockLen = (block.end.getTime() - block.start.getTime()) / 60000;
      if (blockLen >= minSleepMinutes && blockLen > bestLen) {
        bestBlock = block;
        bestLen = blockLen;
      }
    }

    // Place sleep block
    let sleepBlock: { start: Date; end: Date } | null = null;
    if (bestBlock) {
      const idealLen = (idealSleepBlock.end.getTime() - idealSleepBlock.start.getTime()) / 60000;
      if (
        bestBlock.start <= idealSleepBlock.start &&
        bestBlock.end >= idealSleepBlock.end &&
        idealLen >= minSleepMinutes
      ) {
        sleepBlock = { start: new Date(idealSleepBlock.start), end: new Date(idealSleepBlock.end) };
      } else {
        const blockLen = (bestBlock.end.getTime() - bestBlock.start.getTime()) / 60000;
        const sleepLen = Math.max(minSleepMinutes, Math.min(idealSleepMinutes, blockLen));
        sleepBlock = {
          start: new Date(bestBlock.end.getTime() - sleepLen * 60000),
          end: new Date(bestBlock.end),
        };
      }
    }

    // Update blocked blocks and recalculate open blocks
    if (sleepBlock) {
      const sleepBlockIdx = blockedBlocks.findIndex((b) => b.title === 'Sleep');
      if (sleepBlockIdx !== -1) {
        blockedBlocks[sleepBlockIdx] = { ...blockedBlocks[sleepBlockIdx], ...sleepBlock };
      } else {
        blockedBlocks.push({
          title: 'Sleep',
          start: sleepBlock.start,
          end: sleepBlock.end,
          is_blocked: true,
        });
      }
      this.state.blockedBlocks = blockedBlocks;
      this.buildOpenBlocks(); // Recalculate open blocks
    }
  }

  // Helper: Find the closest available slot to preferredTime (forward or backward, prefer forward if tie)
  findClosestAvailableSlot(
    preferredTime: Date,
    duration: number,
    openBlocks: { start: Date; end: Date }[],
    earliestStart: Date,
    dueDate: Date
  ): Date | null {
    let bestSlot: Date | null = null;
    let minDist = Infinity;
    let bestIsForward = false;
    for (const block of openBlocks) {
      // Try all possible start times in this block
      const blockStart = new Date(Math.max(block.start.getTime(), earliestStart.getTime()));
      const blockEnd = new Date(Math.min(block.end.getTime(), dueDate.getTime()));
      for (
        let t = blockStart.getTime();
        t + duration * 60000 <= blockEnd.getTime();
        t += 5 * 60000
      ) {
        const candidate = new Date(t);
        const dist = Math.abs(candidate.getTime() - preferredTime.getTime());
        const isForward = candidate >= preferredTime;
        if (dist < minDist || (dist === minDist && isForward && !bestIsForward)) {
          minDist = dist;
          bestSlot = candidate;
          bestIsForward = isForward;
        }
      }
    }
    return bestSlot;
  }

  placeTasks(): void {
    const { tasks, openBlocks, mood } = this.state;
    if (!tasks || !openBlocks) {
      this.state.scheduledTasks = [];
      this.state.unschedulableTasks = [];
      return;
    }
    // Validate tasks before processing
    tasks.forEach((task) => {
      if (!task.id || !task.title || !task.duration_minutes || !task.importance) {
        throw new Error(`Task ${task.id || 'unknown'} missing required fields`);
      }
    });
    // Mood-difficulty filtering (if mood is recent)
    const now = new Date();
    let filteredTasks = tasks;
    if (mood && mood.logged_at) {
      const moodTime = new Date(mood.logged_at);
      if ((now.getTime() - moodTime.getTime()) / 60000 <= 60) {
        const MOOD_DIFFICULTY_MAP: { [key: string]: number } = {
          happy: 5,
          motivated: 5,
          calm: 5,
          neutral: 4,
          tired: 3,
          sad: 3,
          anxious: 3,
          frustrated: 2,
          confused: 2,
        };
        const maxDifficulty = MOOD_DIFFICULTY_MAP[mood.mood] || 5;
        filteredTasks = tasks.filter((t) => t.difficulty <= maxDifficulty);
        if (filteredTasks.length === 0) filteredTasks = tasks;
      }
    }
    filteredTasks.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      if (a.duration_minutes !== b.duration_minutes) return a.duration_minutes - b.duration_minutes;
      const dateA = new Date(`${a.due_date}T${a.due_time || '23:59'}`);
      const dateB = new Date(`${b.due_date}T${b.due_time || '23:59'}`);
      if (dateA.getTime() - dateB.getTime() !== 0) return dateA.getTime() - dateB.getTime();
      return a.id.localeCompare(b.id);
    });
    const scheduledTasks: Task[] = [];
    const unschedulableTasks: Task[] = [];
    let openBlockIdx = 0;
    let blockCursor = openBlocks.length > 0 ? new Date(openBlocks[0].start) : null;
    for (const task of filteredTasks) {
      let placed = false;
      let start: Date | null = null;
      const conflicts = (startTime: Date, duration: number) => {
        return !isTimeSlotAvailable(startTime, duration, scheduledTasks);
      };
      const isPreferred =
        task.scheduling_type === 'preferred' ||
        (task.scheduling_type === 'flexible' && task.start_date && task.start_time);
      if (task.scheduling_type === 'fixed') {
        if (task.start_date && task.start_time) {
          start = new Date(`${task.start_date}T${task.start_time}`);
          if (!conflicts(start, task.duration_minutes)) {
            scheduledTasks.push({ ...task, start_datetime: start.toISOString() });
            placed = true;
          }
        }
      } else if (isPreferred) {
        if (task.start_date && task.start_time) {
          start = new Date(`${task.start_date}T${task.start_time}`);
          if (!conflicts(start, task.duration_minutes)) {
            scheduledTasks.push({ ...task, start_datetime: start.toISOString() });
            placed = true;
          } else {
            const earliestStart =
              task.earliest_start_date && task.earliest_start_time
                ? new Date(`${task.earliest_start_date}T${task.earliest_start_time}`)
                : start;
            const dueDate =
              task.due_date && task.due_time
                ? new Date(`${task.due_date}T${task.due_time}`)
                : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
            const slot = this.findClosestAvailableSlot(
              start,
              task.duration_minutes,
              openBlocks,
              earliestStart!,
              dueDate!
            );
            if (slot && !conflicts(slot, task.duration_minutes)) {
              scheduledTasks.push({ ...task, start_datetime: slot.toISOString() });
              placed = true;
            }
          }
        }
      } else {
        openBlockIdx = 0;
        blockCursor = openBlocks.length > 0 ? new Date(openBlocks[0].start) : null;
        while (openBlockIdx < openBlocks.length) {
          const block = openBlocks[openBlockIdx];
          const candidateStart = new Date(Math.max(blockCursor!.getTime(), block.start.getTime()));
          const candidateEnd = new Date(candidateStart.getTime() + task.duration_minutes * 60000);
          if (candidateEnd <= block.end && !conflicts(candidateStart, task.duration_minutes)) {
            scheduledTasks.push({ ...task, start_datetime: candidateStart.toISOString() });
            placed = true;
            blockCursor = new Date(candidateEnd);
            break;
          } else {
            openBlockIdx++;
            blockCursor =
              openBlockIdx < openBlocks.length ? new Date(openBlocks[openBlockIdx].start) : null;
          }
        }
      }
      if (!placed) {
        unschedulableTasks.push(task);
      }
    }
    this.state.scheduledTasks = scheduledTasks;
    this.state.unschedulableTasks = unschedulableTasks;
    this.resolveOverlaps();
  }

  manageBreaks(): void {
    const { scheduledTasks } = this.state;
    if (!scheduledTasks || scheduledTasks.length === 0) return;
    const BREAK_DURATION = 15;
    const BREAK_THRESHOLD_1 = 120;
    const BREAK_THRESHOLD_2 = 60;
    let workAccum = 0;
    let lastEnd: Date | null = null;
    let newSchedule: Task[] = [];
    for (let i = 0; i < scheduledTasks.length; i++) {
      const task = scheduledTasks[i];
      const isBreak = task.category === 'break' || (task as any).is_break;
      if (isBreak) continue;
      const taskStart = new Date(task.start_datetime!);
      const taskEnd = new Date(task.start_datetime!);
      taskEnd.setMinutes(taskStart.getMinutes() + task.duration_minutes);
      if (lastEnd && workAccum >= BREAK_THRESHOLD_1) {
        const breakStart = new Date(lastEnd);
        const breakEnd = new Date(breakStart.getTime() + BREAK_DURATION * 60000);
        if (breakEnd <= taskStart) {
          newSchedule.push({
            id: `break-${breakStart.toISOString()}`,
            title: 'Break',
            start_datetime: breakStart.toISOString(),
            duration_minutes: BREAK_DURATION,
            scheduling_type: 'fixed',
            category: 'break',
          } as Task);
          workAccum = 0;
          lastEnd = breakEnd;
        }
      } else if (lastEnd && workAccum >= BREAK_THRESHOLD_2 && task.difficulty >= 3) {
        const breakStart = new Date(lastEnd);
        const breakEnd = new Date(breakStart.getTime() + BREAK_DURATION * 60000);
        if (breakEnd <= taskStart) {
          newSchedule.push({
            id: `break-${breakStart.toISOString()}`,
            title: 'Break',
            start_datetime: breakStart.toISOString(),
            duration_minutes: BREAK_DURATION,
            scheduling_type: 'fixed',
            category: 'break',
          } as Task);
          workAccum = 0;
          lastEnd = breakEnd;
        }
      }
      newSchedule.push(task);
      workAccum += task.duration_minutes;
      lastEnd = taskEnd;
    }
    this.state.scheduledTasks = newSchedule;
  }

  snapBackPreferred(): void {
    const { scheduledTasks } = this.state;
    if (!scheduledTasks || scheduledTasks.length === 0) return;
    const SNAP_WINDOW_MIN = 30;
    const MAX_RIPPLE_MIN = 5;
    let updatedTasks = [...scheduledTasks];
    for (let i = 0; i < updatedTasks.length; i++) {
      const task = updatedTasks[i];
      if (task.scheduling_type !== 'preferred' || !task.start_datetime) continue;
      if (!task.start_date || !task.start_time) continue;
      const originalStart = new Date(`${task.start_date}T${task.start_time}`);
      const currentStart = new Date(task.start_datetime);
      const diffMin = Math.abs((currentStart.getTime() - originalStart.getTime()) / 60000);
      if (diffMin <= SNAP_WINDOW_MIN) continue;
      const snapStart = new Date(
        Math.max(originalStart.getTime() - SNAP_WINDOW_MIN * 60000, currentStart.getTime())
      );
      const snapEnd = new Date(snapStart.getTime() + task.duration_minutes * 60000);
      const prevTask = i > 0 ? updatedTasks[i - 1] : null;
      const nextTask = i < updatedTasks.length - 1 ? updatedTasks[i + 1] : null;
      let canSnap = true;
      if (prevTask && snapStart < new Date(prevTask.start_datetime!)) {
        const ripple = (new Date(prevTask.start_datetime!).getTime() - snapStart.getTime()) / 60000;
        if (ripple > MAX_RIPPLE_MIN) canSnap = false;
      }
      if (nextTask && snapEnd > new Date(nextTask.start_datetime!)) {
        const ripple = (snapEnd.getTime() - new Date(nextTask.start_datetime!).getTime()) / 60000;
        if (ripple > MAX_RIPPLE_MIN) canSnap = false;
      }
      if (canSnap) {
        updatedTasks[i] = { ...task, start_datetime: snapStart.toISOString() };
      }
    }
    this.state.scheduledTasks = updatedTasks;
  }

  resolveOverlaps(): void {
    let { scheduledTasks, unschedulableTasks } = this.state;
    if (!scheduledTasks || scheduledTasks.length === 0) return;
    scheduledTasks = [...scheduledTasks].sort(
      (a, b) => new Date(a.start_datetime!).getTime() - new Date(b.start_datetime!).getTime()
    );
    const nonOverlapping: Task[] = [];
    const newUnschedulable: Task[] = unschedulableTasks ? [...unschedulableTasks] : [];
    let lastEnd: Date | null = null;
    for (const task of scheduledTasks) {
      const start = new Date(task.start_datetime!);
      const end = new Date(task.start_datetime!);
      end.setMinutes(start.getMinutes() + task.duration_minutes);
      if (lastEnd && start < lastEnd) {
        newUnschedulable.push({ ...task, reason: 'overlap' });
      } else {
        nonOverlapping.push(task);
        lastEnd = end;
      }
    }
    this.state.scheduledTasks = nonOverlapping;
    this.state.unschedulableTasks = newUnschedulable;
  }

  handleUnschedulable(): void {
    let { scheduledTasks, unschedulableTasks } = this.state;
    if (!scheduledTasks) scheduledTasks = [];
    if (!unschedulableTasks) unschedulableTasks = [];
    const unschedulableIds = new Set(unschedulableTasks.map((t) => t.id));
    this.state.scheduledTasks = scheduledTasks.filter((t) => !unschedulableIds.has(t.id));
    this.state.unschedulableTasks = unschedulableTasks;
  }

  generateScheduleSummary(): { message: string; importanceBreakdown: any } {
    const { scheduledTasks, unschedulableTasks } = this.state;
    const importanceCounts: any = {
      5: { scheduled: 0, impossible: 0 },
      4: { scheduled: 0, impossible: 0 },
      3: { scheduled: 0, impossible: 0 },
      2: { scheduled: 0, impossible: 0 },
      1: { scheduled: 0, impossible: 0 },
    };
    scheduledTasks.forEach((task) => {
      importanceCounts[task.importance].scheduled++;
    });
    unschedulableTasks.forEach((task) => {
      importanceCounts[task.importance].impossible++;
    });
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

  commitSchedule(): Promise<any> {
    const summary = this.generateScheduleSummary();
    const updates = [
      ...this.state.scheduledTasks.map((task) => ({
        id: task.id,
        status: 'scheduled',
        start_datetime: task.start_datetime,
      })),
      ...this.state.unschedulableTasks.map((task) => ({
        id: task.id,
        status: 'not_able_to_schedule',
        reason: (task as any).reason || 'unschedulable',
      })),
      ...this.state.overextendedTasks.map((task) => ({
        id: task.id,
        status: 'overextended',
      })),
    ];
    return Promise.all(
      updates.map((update) => {
        console.log('RetunePipeline PATCH payload:', update);
        return supabase
          .from('tasks')
          .update(update)
          .eq('id', update.id)
          .then((result) => {
            console.log('RetunePipeline PATCH result:', result);
            return result;
          });
      })
    ).then(() => {
      console.log('Schedule Summary:', summary);
      return summary;
    });
  }
} 