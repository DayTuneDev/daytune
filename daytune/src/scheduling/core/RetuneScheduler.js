// RetuneScheduler: Modular, testable retuning engine for DayTune
// Each helper is pure (input→output, no DB side effects)

class RetuneScheduler {
  constructor({ tasks, moodLogs, userPreferences, now = new Date() }) {
    this.tasks = tasks; // Array of Task objects
    this.moodLogs = moodLogs; // Array of MoodLog objects
    this.userPreferences = userPreferences; // User preferences/settings
    this.now = now;
    this.openBlocks = [];
    this.scheduledEvents = [];
    this.overextendedTasks = [];
    this.notAbleToSchedule = [];
    this.completedTasks = [];
    this.sleepBlock = null;
    this.breaks = [];
    this.moodContext = null;
  }

  // Main entry point
  retune() {
    this.loadState();
    this.buildOpenBlocks();
    this.placeSleepBlock();
    this.placeTasks();
    this.enforceBreakPolicy();
    this.snapPreferredTasks();
    this.finalOverlapCheck();
    this.handleOverextendedTasks();
    return this.commit();
  }

  // Step 0: Load state, preprocess, set mood context
  loadState() {
    // Set moodContext from latest mood log (≤ 60 min old)
    const now = this.now;
    const MOOD_VALID_WINDOW_MIN = 60;
    this.moodContext = null;
    if (this.moodLogs && this.moodLogs.length > 0) {
      // Find the latest mood log
      const sortedMoods = [...this.moodLogs].sort((a, b) => new Date(b.logged_at || b.dt) - new Date(a.logged_at || a.dt));
      const latestMood = sortedMoods[0];
      const moodTime = new Date(latestMood.logged_at || latestMood.dt);
      const diffMin = (now - moodTime) / 60000;
      if (diffMin <= MOOD_VALID_WINDOW_MIN) {
        this.moodContext = latestMood;
      }
    }

    // Partition tasks
    this.pendingTasks = [];
    this.overextendedTasks = [];
    this.completedTasks = [];
    this.notAbleToSchedule = [];

    for (const task of this.tasks) {
      if (task.status === 'done' || task.status === 'completed') {
        this.completedTasks.push(task);
      } else if (task.status === 'overextended') {
        this.overextendedTasks.push(task);
      } else if (task.status === 'not_able_to_schedule') {
        this.notAbleToSchedule.push(task);
      } else {
        this.pendingTasks.push(task);
      }
    }
  }

  // Step 1: Build open blocks (gaps between fixed events, sleep, etc.)
  buildOpenBlocks() {
    // Define the start and end of the scheduling window (today)
    const startOfDay = new Date(this.now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(this.now);
    endOfDay.setHours(23, 59, 59, 999);

    // Gather all fixed events (fixed tasks, sleep block if already placed)
    let fixedEvents = (this.pendingTasks || []).filter(t => t.scheduling_type === 'fixed');
    if (this.sleepBlock) {
      fixedEvents = fixedEvents.concat([{
        start_datetime: this.sleepBlock.start,
        duration_minutes: (this.sleepBlock.end - this.sleepBlock.start) / 60000,
        title: 'Sleep',
        scheduling_type: 'fixed',
      }]);
    }

    // Convert all fixed events to {start, end}
    const fixedBlocks = fixedEvents.map(ev => {
      const start = new Date(ev.start_datetime);
      const end = new Date(start.getTime() + (ev.duration_minutes || 0) * 60000);
      return { start, end };
    });
    // Sort by start time
    fixedBlocks.sort((a, b) => a.start - b.start);

    // Find all open blocks between fixed events
    const openBlocks = [];
    let lastEnd = startOfDay;
    for (const block of fixedBlocks) {
      if (block.start > lastEnd) {
        openBlocks.push({ start: new Date(lastEnd), end: new Date(block.start) });
      }
      lastEnd = block.end > lastEnd ? block.end : lastEnd;
    }
    if (lastEnd < endOfDay) {
      openBlocks.push({ start: new Date(lastEnd), end: new Date(endOfDay) });
    }
    this.openBlocks = openBlocks;
  }

  // Step 2: Place (and possibly shrink/slide) sleep block
  placeSleepBlock() {
    // User preferences
    const minSleepMinutes = 240; // 4 hours minimum
    const idealSleepMinutes = this.userPreferences?.sleep_duration || 480; // default 8h
    const sleepStartPref = this.userPreferences?.sleep_start || '00:00';
    const sleepEndPref = this.userPreferences?.sleep_end || '08:00';

    // Convert preferred sleep times to minutes since midnight
    const [sleepStartHour, sleepStartMin] = sleepStartPref.split(':').map(Number);
    const [sleepEndHour, sleepEndMin] = sleepEndPref.split(':').map(Number);
    const sleepPrefStartMin = sleepStartHour * 60 + sleepStartMin;
    const sleepPrefEndMin = sleepEndHour * 60 + sleepEndMin;
    const idealSleepBlock = {
      start: new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate(), sleepStartHour, sleepStartMin),
      end: new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate(), sleepEndHour, sleepEndMin)
    };
    // If sleep crosses midnight, adjust end to next day
    if (sleepPrefEndMin <= sleepPrefStartMin) {
      idealSleepBlock.end.setDate(idealSleepBlock.end.getDate() + 1);
    }
    // Find all open blocks that could fit sleep (must be undisturbed)
    let bestBlock = null;
    let bestLen = 0;
    for (const block of this.openBlocks) {
      const blockLen = (block.end - block.start) / 60000;
      if (blockLen >= minSleepMinutes && blockLen > bestLen) {
        bestBlock = block;
        bestLen = blockLen;
      }
    }
    // Try to fit ideal sleep, else shrink to min
    let sleepBlock = null;
    if (bestBlock) {
      // Try to place ideal sleep at preferred time if possible
      const idealLen = (idealSleepBlock.end - idealSleepBlock.start) / 60000;
      if (
        bestBlock.start <= idealSleepBlock.start &&
        bestBlock.end >= idealSleepBlock.end &&
        idealLen >= minSleepMinutes
      ) {
        sleepBlock = { start: new Date(idealSleepBlock.start), end: new Date(idealSleepBlock.end) };
      } else {
        // Slide to latest possible position in block
        const blockLen = (bestBlock.end - bestBlock.start) / 60000;
        const sleepLen = Math.max(minSleepMinutes, Math.min(idealSleepMinutes, blockLen));
        sleepBlock = {
          start: new Date(bestBlock.end.getTime() - sleepLen * 60000),
          end: new Date(bestBlock.end)
        };
      }
    } else {
      // No open block big enough for min sleep; skip sleep (edge case)
      sleepBlock = null;
    }
    this.sleepBlock = sleepBlock;
    // Remove sleep block from openBlocks
    if (sleepBlock) {
      this.openBlocks = this.openBlocks.flatMap(block => {
        if (sleepBlock.end <= block.start || sleepBlock.start >= block.end) {
          return [block];
        }
        const blocks = [];
        if (block.start < sleepBlock.start) {
          blocks.push({ start: block.start, end: sleepBlock.start });
        }
        if (sleepBlock.end < block.end) {
          blocks.push({ start: sleepBlock.end, end: block.end });
        }
        return blocks;
      });
    }
  }

  // Step 3: Place tasks by priority, mood, constraints
  placeTasks() {
    // Mood-difficulty filter
    const mood = this.moodContext?.mood;
    const MOOD_DIFFICULTY_MAP = {
      happy: 5, motivated: 5, calm: 5,
      neutral: 4,
      tired: 3, sad: 3, anxious: 3,
      frustrated: 2, confused: 2
    };
    let maxDifficulty = 5;
    if (mood && MOOD_DIFFICULTY_MAP[mood] !== undefined) {
      maxDifficulty = MOOD_DIFFICULTY_MAP[mood];
    }
    // Filter tasks by mood if mood is valid
    let tasksToSchedule = this.pendingTasks.filter(task => {
      if (this.moodContext && task.difficulty > maxDifficulty) return false;
      return true;
    });
    // Priority cascade: importance DESC, difficulty ASC, duration ASC, due_dt ASC, uuid
    tasksToSchedule.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      if ((a.duration_minutes || 0) !== (b.duration_minutes || 0)) return (a.duration_minutes || 0) - (b.duration_minutes || 0);
      if (a.due_date && b.due_date) {
        const dateA = new Date(a.due_date + 'T' + (a.due_time || '23:59'));
        const dateB = new Date(b.due_date + 'T' + (b.due_time || '23:59'));
        if (dateA - dateB !== 0) return dateA - dateB;
      }
      if (a.id && b.id) return a.id.localeCompare(b.id);
      return 0;
    });
    // Place each task greedily in the first open block that fits
    const newOpenBlocks = [...this.openBlocks];
    for (const task of tasksToSchedule) {
      let bestBlockIdx = -1;
      let bestStart = null;
      let minPreferredDist = Infinity;
      for (let i = 0; i < newOpenBlocks.length; i++) {
        const block = newOpenBlocks[i];
        const blockLen = (block.end - block.start) / 60000;
        if (blockLen >= task.duration_minutes) {
          // For Preferred, try to minimize distance to original slot
          let dist = 0;
          if (task.scheduling_type === 'preferred' && task.start_datetime) {
            const origStart = new Date(task.start_datetime);
            dist = Math.abs(block.start - origStart);
          }
          if (task.scheduling_type !== 'preferred' || dist < minPreferredDist) {
            bestBlockIdx = i;
            bestStart = block.start;
            minPreferredDist = dist;
            if (task.scheduling_type !== 'preferred') break; // For Flexible, take first fit
          }
        }
      }
      if (bestBlockIdx !== -1) {
        // Schedule the task
        const start = bestStart;
        const end = new Date(start.getTime() + task.duration_minutes * 60000);
        this.scheduledEvents.push({ ...task, start_datetime: start, end_datetime: end });
        // Shrink or split the open block
        const block = newOpenBlocks[bestBlockIdx];
        const newBlocks = [];
        if (block.start < start) newBlocks.push({ start: block.start, end: start });
        if (end < block.end) newBlocks.push({ start: end, end: block.end });
        newOpenBlocks.splice(bestBlockIdx, 1, ...newBlocks);
      } else {
        // Could not schedule
        this.notAbleToSchedule.push({ ...task, reason: 'no_open_block' });
      }
    }
    this.openBlocks = newOpenBlocks;
  }

  // Step 4: Enforce break policy (insert/remove breaks)
  enforceBreakPolicy() {
    const BREAK_DURATION = 15; // minutes
    const BREAK_THRESHOLD_1 = 120; // 2 hours of any work
    const BREAK_THRESHOLD_2 = 60;  // 1 hour of work if difficulty ≥ 3
    let workAccum = 0;
    let lastBreakIdx = -1;
    let lastTaskDifficulty = 0;
    const newEvents = [];
    this.breaks = [];
    // Sort scheduled events by start time
    const events = [...this.scheduledEvents].sort((a, b) => a.start_datetime - b.start_datetime);
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.category === 'break' || event.is_break) {
        // Already a break, reset accumulator
        workAccum = 0;
        lastBreakIdx = i;
        newEvents.push(event);
        continue;
      }
      // Only count work, not sleep or breaks
      if (event.category === 'work' || !event.category || event.scheduling_type !== 'fixed') {
        workAccum += event.duration_minutes || 0;
        lastTaskDifficulty = event.difficulty || 0;
      }
      newEvents.push(event);
      // Check if break needed after this event
      const needBreak = (
        workAccum >= BREAK_THRESHOLD_1 ||
        (workAccum >= BREAK_THRESHOLD_2 && lastTaskDifficulty >= 3)
      );
      if (needBreak) {
        // Find next open slot for a break (after this event)
        const afterEnd = event.end_datetime;
        let nextEventStart = null;
        if (i + 1 < events.length) {
          nextEventStart = events[i + 1].start_datetime;
        }
        // If there is a gap of at least BREAK_DURATION, insert break
        if (!nextEventStart || (nextEventStart - afterEnd) / 60000 >= BREAK_DURATION) {
          const breakStart = new Date(afterEnd);
          const breakEnd = new Date(breakStart.getTime() + BREAK_DURATION * 60000);
          const breakEvent = {
            title: 'Break',
            category: 'break',
            is_break: true,
            start_datetime: breakStart,
            end_datetime: breakEnd,
            duration_minutes: BREAK_DURATION,
            scheduling_type: 'fixed',
          };
          newEvents.push(breakEvent);
          this.breaks.push(breakEvent);
          workAccum = 0;
          lastBreakIdx = newEvents.length - 1;
        }
      }
    }
    // Remove breaks if not enough time for all required tasks
    // (If any required task is unschedulable, drop breaks and try again)
    if (this.notAbleToSchedule.length > 0 && this.breaks.length > 0) {
      // Remove all breaks and re-run without breaks
      this.scheduledEvents = newEvents.filter(ev => !ev.is_break);
      this.breaks = [];
    } else {
      this.scheduledEvents = newEvents;
    }
  }

  // Step 5: Snap Preferred tasks closer to original slot if possible
  snapPreferredTasks() {
    const SNAP_WINDOW_MIN = 30;
    const MAX_RIPPLE_MIN = 5;
    // Only consider Preferred tasks with an original start time
    const events = [...this.scheduledEvents].sort((a, b) => a.start_datetime - b.start_datetime);
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.scheduling_type === 'preferred' && event.start_datetime && event.original_start_datetime) {
        const origStart = new Date(event.original_start_datetime);
        const currentStart = new Date(event.start_datetime);
        const diffMin = Math.abs((currentStart - origStart) / 60000);
        if (diffMin > SNAP_WINDOW_MIN) {
          // Try to move within ±30 min window
          const snapTargets = [
            new Date(origStart.getTime() - SNAP_WINDOW_MIN * 60000),
            origStart,
            new Date(origStart.getTime() + SNAP_WINDOW_MIN * 60000)
          ];
          for (const target of snapTargets) {
            // Check for overlap with other events
            const targetEnd = new Date(target.getTime() + event.duration_minutes * 60000);
            let overlap = false;
            let ripple = 0;
            for (let j = 0; j < events.length; j++) {
              if (j === i) continue;
              const other = events[j];
              const otherStart = new Date(other.start_datetime);
              const otherEnd = new Date(other.end_datetime);
              if (
                (target < otherEnd && targetEnd > otherStart)
              ) {
                overlap = true;
                // Calculate ripple (how much would need to move the other event)
                ripple = Math.min(
                  Math.abs((targetEnd - otherStart) / 60000),
                  Math.abs((otherEnd - target) / 60000)
                );
                break;
              }
            }
            if (!overlap || ripple < MAX_RIPPLE_MIN) {
              // Snap to this target
              events[i].start_datetime = new Date(target);
              events[i].end_datetime = new Date(targetEnd);
              break;
            }
          }
        }
      }
    }
    this.scheduledEvents = events;
  }

  // Step 6: Final overlap check and commit
  finalOverlapCheck() {
    // Sort events by start time
    let events = [...this.scheduledEvents].sort((a, b) => a.start_datetime - b.start_datetime);
    const toRemove = new Set();
    for (let i = 0; i < events.length - 1; i++) {
      const a = events[i];
      const b = events[i + 1];
      const aEnd = new Date(a.end_datetime);
      const bStart = new Date(b.start_datetime);
      if (aEnd > bStart) {
        // Overlap detected, remove lower-priority event
        const priority = (task) => [
          task.importance || 0,
          -(task.difficulty || 0),
          -(task.duration_minutes || 0),
          task.due_date ? -new Date(task.due_date + 'T' + (task.due_time || '23:59')).getTime() : 0,
          task.id || ''
        ];
        const cmp = (x, y) => {
          for (let i = 0; i < x.length; i++) {
            if (x[i] !== y[i]) return x[i] - y[i];
          }
          return 0;
        };
        const aPriority = priority(a);
        const bPriority = priority(b);
        if (cmp(aPriority, bPriority) < 0) {
          toRemove.add(i);
        } else {
          toRemove.add(i + 1);
        }
      }
    }
    // Remove overlapping events and move to notAbleToSchedule
    const newEvents = [];
    for (let i = 0; i < events.length; i++) {
      if (toRemove.has(i)) {
        this.notAbleToSchedule.push({ ...events[i], reason: 'overlap' });
      } else {
        newEvents.push(events[i]);
      }
    }
    this.scheduledEvents = newEvents;
  }

  // Step 7: Handle overextended tasks and rollup
  handleOverextendedTasks() {
    // Group overextended chunks by parent task id
    const chunkMap = {};
    for (const task of this.overextendedTasks) {
      const parentId = task.parent_id || task.id;
      if (!chunkMap[parentId]) chunkMap[parentId] = [];
      chunkMap[parentId].push(task);
    }
    // For each group, check if all chunks are completed
    for (const parentId in chunkMap) {
      const chunks = chunkMap[parentId];
      const allDone = chunks.every(chunk => chunk.status === 'done' || chunk.status === 'completed');
      if (allDone) {
        // Roll up into a single Completed entry
        const timeRanges = chunks.map(chunk => {
          const start = new Date(chunk.start_datetime);
          const end = new Date(chunk.end_datetime);
          return [start, end];
        });
        const totalTime = chunks.reduce((sum, chunk) => sum + (chunk.duration_minutes || 0), 0);
        const base = chunks[0];
        this.completedTasks.push({
          ...base,
          status: 'completed',
          time_ranges: timeRanges,
          total_time_minutes: totalTime,
          completed_chunks: chunks.map(chunk => chunk.id),
        });
        // Remove from overextendedTasks
        this.overextendedTasks = this.overextendedTasks.filter(t => t.parent_id !== parentId && t.id !== parentId);
      }
    }
    // Remove any overextended tasks that are now completed
    this.overextendedTasks = this.overextendedTasks.filter(task => task.status !== 'done' && task.status !== 'completed');
  }

  // Commit: Return final schedule, lists, and changes
  commit() {
    return {
      scheduledEvents: this.scheduledEvents,
      overextendedTasks: this.overextendedTasks,
      notAbleToSchedule: this.notAbleToSchedule,
      completedTasks: this.completedTasks,
      sleepBlock: this.sleepBlock,
      breaks: this.breaks,
      changes: [] // TODO: List of changes (moved, unschedulable, breaks inserted, sleep shifted)
    };
  }
}

export default RetuneScheduler; 