// RetunePipeline.js
// Main orchestrator for the retuning engine

import { getUserPreferences } from '../services/userPreferences';
import { getLatestMoodLog } from '../services/mood';
import { scheduleTasks, getBlockedTimeBlocks, isTimeSlotAvailable } from '../services/scheduler';
import { supabase } from '../supabaseClient';
// Import other helpers as needed

export default class RetunePipeline {
  constructor({ userId }) {
    this.userId = userId;
    this.state = {};
  }

  async retune() {
    // 1. Load all state
    await this.loadState();

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

  async loadState() {
    // Load tasks, mood, preferences, sleep, breaks
    this.state.preferences = await getUserPreferences(this.userId);
    this.state.mood = await getLatestMoodLog(this.userId);
    // Fetch tasks directly from Supabase
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', this.userId)
      .order('start_datetime', { ascending: true });
    if (error) throw error;
    this.state.tasks = data || [];
    // Set up the current day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.state.today = today;
    // TODO: Load sleep, breaks, etc.
  }

  buildOpenBlocks() {
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
    const sortedBlocks = [...blockedBlocks].sort((a, b) => a.start - b.start);
    const openBlocks = [];
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

  optimizeSleepBlock() {
    // Shrink/slide sleep block as needed
    const { preferences, openBlocks, blockedBlocks, scheduledTasks } = this.state;
    if (!preferences || !openBlocks || !blockedBlocks) return;
    const MIN_SLEEP = 4 * 60; // 4 hours in minutes
    const IDEAL_SLEEP = preferences.sleep_duration || 8 * 60; // in minutes
    // Find the sleep block in blockedBlocks
    let sleepBlockIdx = blockedBlocks.findIndex(b => b.title === 'Sleep');
    if (sleepBlockIdx === -1) return; // No sleep block found
    let sleepBlock = blockedBlocks[sleepBlockIdx];
    // Calculate total scheduled work time
    const totalTaskTime = (scheduledTasks || []).reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
    // Calculate total open time after tasks
    const DAY_MINUTES = 24 * 60;
    const usedMinutes = totalTaskTime + blockedBlocks.reduce((sum, b) => sum + ((b.end - b.start) / 60000), 0);
    let availableSleep = Math.max(DAY_MINUTES - usedMinutes, 0);
    let sleepDuration = Math.max(MIN_SLEEP, Math.min(IDEAL_SLEEP, availableSleep));
    // Slide sleep block later if it helps fit all tasks (try to place at latest possible time)
    // For now, just shrink sleep at its current position
    const sleepStart = new Date(sleepBlock.end.getTime() - sleepDuration * 60000);
    const sleepEnd = new Date(sleepBlock.end);
    // Update sleep block
    const newSleepBlock = { ...sleepBlock, start: sleepStart, end: sleepEnd };
    // Replace in blockedBlocks
    const newBlockedBlocks = [...blockedBlocks];
    newBlockedBlocks[sleepBlockIdx] = newSleepBlock;
    this.state.blockedBlocks = newBlockedBlocks;
    // Recalculate openBlocks
    const sortedBlocks = [...newBlockedBlocks].sort((a, b) => a.start - b.start);
    const newOpenBlocks = [];
    let lastEnd = new Date(this.state.today);
    for (const block of sortedBlocks) {
      if (block.start > lastEnd) {
        newOpenBlocks.push({ start: new Date(lastEnd), end: new Date(block.start) });
      }
      lastEnd = block.end > lastEnd ? block.end : lastEnd;
    }
    const DAY_END = new Date(this.state.today);
    DAY_END.setHours(24, 0, 0, 0);
    if (lastEnd < DAY_END) {
      newOpenBlocks.push({ start: new Date(lastEnd), end: new Date(DAY_END) });
    }
    this.state.openBlocks = newOpenBlocks;
  }

  // Helper: Find the closest available slot to preferredTime (forward or backward, prefer forward if tie)
  findClosestAvailableSlot(preferredTime, duration, openBlocks, earliestStart, dueDate) {
    let bestSlot = null;
    let minDist = Infinity;
    let bestIsForward = false;
    for (const block of openBlocks) {
      // Try all possible start times in this block
      const blockStart = new Date(Math.max(block.start, earliestStart));
      const blockEnd = new Date(Math.min(block.end, dueDate));
      for (let t = blockStart.getTime(); t + duration * 60000 <= blockEnd.getTime(); t += 5 * 60000) {
        const candidate = new Date(t);
        const dist = Math.abs(candidate - preferredTime);
        const isForward = candidate >= preferredTime;
        if (
          dist < minDist ||
          (dist === minDist && isForward && !bestIsForward)
        ) {
          minDist = dist;
          bestSlot = candidate;
          bestIsForward = isForward;
        }
      }
    }
    return bestSlot;
  }

  placeTasks() {
    const { tasks, openBlocks, mood } = this.state;
    if (!tasks || !openBlocks) {
      this.state.scheduledTasks = [];
      this.state.unschedulableTasks = [];
      return;
    }

    // Mood-difficulty filtering (if mood is recent)
    const now = new Date();
    let filteredTasks = tasks;
    if (mood && mood.logged_at) {
      const moodTime = new Date(mood.logged_at);
      if ((now - moodTime) / 60000 <= 60) {
        // Only allow tasks within difficulty range for this mood
        const MOOD_DIFFICULTY_MAP = {
          'happy': 5, 'motivated': 5, 'calm': 5,
          'neutral': 4,
          'tired': 3, 'sad': 3, 'anxious': 3,
          'frustrated': 2, 'confused': 2
        };
        const maxDifficulty = MOOD_DIFFICULTY_MAP[mood.mood] || 5;
        filteredTasks = tasks.filter(t => t.difficulty <= maxDifficulty);
        // Fallback: if all tasks filtered out, ignore mood
        if (filteredTasks.length === 0) filteredTasks = tasks;
      }
    }

    // Sort tasks by priority rules
    filteredTasks.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      if (a.duration_minutes !== b.duration_minutes) return a.duration_minutes - b.duration_minutes;
      const dateA = new Date(`${a.due_date}T${a.due_time || '23:59'}`);
      const dateB = new Date(`${b.due_date}T${b.due_time || '23:59'}`);
      if (dateA - dateB !== 0) return dateA - dateB;
      return a.id.localeCompare(b.id);
    });

    // Place tasks by type
    const scheduledTasks = [];
    const unschedulableTasks = [];
    let openBlockIdx = 0;
    let blockCursor = openBlocks.length > 0 ? new Date(openBlocks[0].start) : null;

    for (const task of filteredTasks) {
      let placed = false;
      let start = null;
      let end = null;
      // Helper to check for conflicts with already scheduled tasks
      const conflicts = (startTime, duration) => {
        return !isTimeSlotAvailable(startTime, duration, scheduledTasks, []);
      };
      // Treat flexible tasks with explicit start_date/start_time as preferred
      const isPreferred = (task.scheduling_type === 'preferred') ||
        (task.scheduling_type === 'flexible' && task.start_date && task.start_time);
      if (task.scheduling_type === 'fixed') {
        // Must be placed at start_date+start_time
        if (task.start_date && task.start_time) {
          start = new Date(`${task.start_date}T${task.start_time}`);
          end = new Date(start.getTime() + task.duration_minutes * 60000);
          // Check for conflicts
          if (!conflicts(start, task.duration_minutes)) {
            scheduledTasks.push({ ...task, start_datetime: start, end_datetime: end });
            placed = true;
          }
        }
      } else if (isPreferred) {
        // Try preferred time only
        if (task.start_date && task.start_time) {
          start = new Date(`${task.start_date}T${task.start_time}`);
          end = new Date(start.getTime() + task.duration_minutes * 60000);
          if (!conflicts(start, task.duration_minutes)) {
            scheduledTasks.push({ ...task, start_datetime: start, end_datetime: end });
            placed = true;
          } else {
            // Find closest available slot
            const earliestStart = task.earliest_start_date && task.earliest_start_time
              ? new Date(`${task.earliest_start_date}T${task.earliest_start_time}`)
              : start;
            const dueDate = task.due_date && task.due_time
              ? new Date(`${task.due_date}T${task.due_time}`)
              : new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
            const slot = this.findClosestAvailableSlot(start, task.duration_minutes, openBlocks, earliestStart, dueDate);
            if (slot && !conflicts(slot, task.duration_minutes)) {
              scheduledTasks.push({ ...task, start_datetime: slot, end_datetime: new Date(slot.getTime() + task.duration_minutes * 60000) });
              placed = true;
            }
          }
        }
        // If not placed, do NOT move to next available slot; mark as unschedulable
      } else {
        // Flexible: find any open slot
        openBlockIdx = 0;
        blockCursor = openBlocks.length > 0 ? new Date(openBlocks[0].start) : null;
        while (openBlockIdx < openBlocks.length) {
          const block = openBlocks[openBlockIdx];
          const candidateStart = new Date(Math.max(blockCursor, block.start));
          const candidateEnd = new Date(candidateStart.getTime() + task.duration_minutes * 60000);
          if (candidateEnd <= block.end && !conflicts(candidateStart, task.duration_minutes)) {
            scheduledTasks.push({ ...task, start_datetime: candidateStart, end_datetime: candidateEnd });
            placed = true;
            blockCursor = new Date(candidateEnd);
            break;
          } else {
            openBlockIdx++;
            blockCursor = openBlockIdx < openBlocks.length ? new Date(openBlocks[openBlockIdx].start) : null;
          }
        }
      }
      if (!placed) {
        unschedulableTasks.push(task);
      }
    }
    // Debug output before overlap resolution
    console.log('Scheduled Tasks before overlap resolution:', scheduledTasks);
    this.state.scheduledTasks = scheduledTasks;
    this.state.unschedulableTasks = unschedulableTasks;
    // Run overlap resolution
    this.resolveOverlaps();
    // Debug output after overlap resolution
    console.log('Scheduled Tasks after overlap resolution:', this.state.scheduledTasks);
    console.log('Unschedulable Tasks:', this.state.unschedulableTasks);
  }

  manageBreaks() {
    // Insert 15-min breaks after 2 hours of work, or after 1 hour if last task was difficulty 3+
    const { scheduledTasks } = this.state;
    if (!scheduledTasks || scheduledTasks.length === 0) return;
    const BREAK_DURATION = 15; // minutes
    const BREAK_THRESHOLD_1 = 120; // 2 hours
    const BREAK_THRESHOLD_2 = 60; // 1 hour if difficulty >= 3
    let workAccum = 0;
    let lastEnd = null;
    let newSchedule = [];
    for (let i = 0; i < scheduledTasks.length; i++) {
      const task = scheduledTasks[i];
      const isBreak = task.category === 'break' || task.is_break;
      if (isBreak) continue; // Skip existing breaks
      const taskStart = new Date(task.start_datetime);
      const taskEnd = new Date(task.end_datetime);
      // Insert a break if work block exceeded and not the first task
      if (lastEnd && workAccum >= BREAK_THRESHOLD_1) {
        // Insert break if there's a gap
        const breakStart = new Date(lastEnd);
        const breakEnd = new Date(breakStart.getTime() + BREAK_DURATION * 60000);
        // Only insert if break fits before next task
        if (breakEnd <= taskStart) {
          newSchedule.push({
            id: `break-${breakStart.toISOString()}`,
            title: 'Break',
            start_datetime: breakStart,
            end_datetime: breakEnd,
            duration_minutes: BREAK_DURATION,
            scheduling_type: 'fixed',
            is_break: true
          });
          workAccum = 0;
          lastEnd = breakEnd;
        }
      } else if (lastEnd && workAccum >= BREAK_THRESHOLD_2 && task.difficulty >= 3) {
        // Insert break for hard work
        const breakStart = new Date(lastEnd);
        const breakEnd = new Date(breakStart.getTime() + BREAK_DURATION * 60000);
        if (breakEnd <= taskStart) {
          newSchedule.push({
            id: `break-${breakStart.toISOString()}`,
            title: 'Break',
            start_datetime: breakStart,
            end_datetime: breakEnd,
            duration_minutes: BREAK_DURATION,
            scheduling_type: 'fixed',
            is_break: true
          });
          workAccum = 0;
          lastEnd = breakEnd;
        }
      }
      newSchedule.push(task);
      workAccum += task.duration_minutes;
      lastEnd = taskEnd;
    }
    // Remove breaks if not enough time for all required tasks (i.e., if any required task is unschedulable)
    // For now, just update scheduledTasks with breaks inserted
    this.state.scheduledTasks = newSchedule;
  }

  snapBackPreferred() {
    // Try to move Preferred tasks closer to their original slot (within ±30 min) if it causes < 5 min ripple
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
      const diffMin = Math.abs((currentStart - originalStart) / 60000);
      if (diffMin <= SNAP_WINDOW_MIN) continue; // Already close enough
      // Try to move closer to original slot within ±30 min
      const snapStart = new Date(Math.max(
        originalStart.getTime() - SNAP_WINDOW_MIN * 60000,
        currentStart.getTime()
      ));
      const snapEnd = new Date(snapStart.getTime() + task.duration_minutes * 60000);
      // Check if moving causes < 5 min ripple to next/prev tasks
      const prevTask = i > 0 ? updatedTasks[i - 1] : null;
      const nextTask = i < updatedTasks.length - 1 ? updatedTasks[i + 1] : null;
      let canSnap = true;
      if (prevTask && snapStart < new Date(prevTask.end_datetime)) {
        const ripple = (new Date(prevTask.end_datetime) - snapStart) / 60000;
        if (ripple > MAX_RIPPLE_MIN) canSnap = false;
      }
      if (nextTask && snapEnd > new Date(nextTask.start_datetime)) {
        const ripple = (snapEnd - new Date(nextTask.start_datetime)) / 60000;
        if (ripple > MAX_RIPPLE_MIN) canSnap = false;
      }
      if (canSnap) {
        updatedTasks[i] = { ...task, start_datetime: snapStart, end_datetime: snapEnd };
      }
    }
    this.state.scheduledTasks = updatedTasks;
  }

  resolveOverlaps() {
    // Ensure no scheduled tasks overlap; move conflicting ones to unschedulable
    let { scheduledTasks, unschedulableTasks } = this.state;
    if (!scheduledTasks || scheduledTasks.length === 0) return;
    // Sort by start_datetime
    scheduledTasks = [...scheduledTasks].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    const nonOverlapping = [];
    const newUnschedulable = unschedulableTasks ? [...unschedulableTasks] : [];
    let lastEnd = null;
    for (const task of scheduledTasks) {
      const start = new Date(task.start_datetime);
      const end = new Date(task.end_datetime);
      if (lastEnd && start < lastEnd) {
        // Overlap: mark as unschedulable
        newUnschedulable.push({ ...task, reason: 'overlap' });
      } else {
        nonOverlapping.push(task);
        lastEnd = end;
      }
    }
    this.state.scheduledTasks = nonOverlapping;
    this.state.unschedulableTasks = newUnschedulable;
  }

  handleUnschedulable() {
    // Ensure all unschedulable tasks are in a special list and not in scheduledTasks
    let { scheduledTasks, unschedulableTasks } = this.state;
    if (!scheduledTasks) scheduledTasks = [];
    if (!unschedulableTasks) unschedulableTasks = [];
    // Remove any task from scheduledTasks that is also in unschedulableTasks (by id)
    const unschedulableIds = new Set(unschedulableTasks.map(t => t.id));
    this.state.scheduledTasks = scheduledTasks.filter(t => !unschedulableIds.has(t.id));
    this.state.unschedulableTasks = unschedulableTasks;
  }

  commitSchedule() {
    // TODO: Update the UI/state/store with the new scheduledTasks and unschedulableTasks
    // This is a placeholder for integration with the rest of the app
    // Example: TaskManager.updateTaskState(...)
    // For now, just log the results
    console.log('Scheduled Tasks:', this.state.scheduledTasks);
    console.log('Unschedulable Tasks:', this.state.unschedulableTasks);
  }
} 