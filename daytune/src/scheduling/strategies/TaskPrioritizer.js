import BaseStrategy from './BaseStrategy';

class TaskPrioritizer extends BaseStrategy {
    constructor() {
        super();
    }

    async optimize(schedule, context) {
        // Separate tasks by scheduling_type
        let fixedTasks = schedule.filter(task => task.scheduling_type === 'fixed');
        const preferredTasks = schedule.filter(task => task.scheduling_type === 'preferred');
        const flexibleTasks = schedule.filter(task => task.scheduling_type === 'flexible');
        
        // Sort fixed tasks by start time
        fixedTasks = fixedTasks.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
        // Sort preferred and flexible tasks by priority
        const sortedPreferredTasks = this.sortTasksByPriority(preferredTasks);
        const sortedFlexibleTasks = this.sortTasksByPriority(flexibleTasks);
        
        // Start with fixed tasks
        const scheduledTasks = [...fixedTasks];
        const impossibleTasks = [];
        let now = context.currentTime || new Date();
        // Initialize lastEnd to the latest end time of all fixed tasks, or now if none
        let lastEnd = fixedTasks.length > 0 ? new Date(Math.max(...fixedTasks.map(t => new Date(t.start_datetime).getTime() + t.duration_minutes * 60000))) : now;
        
        // Helper to get earliest allowed start for a task
        function getEarliestAllowedStart(task) {
            let baseDate = task.start_date || now.toISOString().slice(0, 10);
            let earliest = null;
            if (task.earliest_start_time) {
                earliest = new Date(`${baseDate}T${task.earliest_start_time}`);
            } else if (task.start_time) {
                // Default: 12 hours before selected start time
                const start = new Date(`${baseDate}T${task.start_time}`);
                earliest = new Date(start.getTime() - 12 * 60 * 60000);
            } else {
                earliest = now;
            }
            // Never before now
            return earliest < now ? now : earliest;
        }
        
        // Helper to get the next available start time (no overlap)
        function getNextAvailableStart(earliestAllowed, lastEnd) {
            return earliestAllowed > lastEnd ? earliestAllowed : lastEnd;
        }
        
        // Try to schedule preferred tasks at their preferred time if possible, else move
        for (const task of sortedPreferredTasks) {
            try {
                this.validateTask(task);
                const earliestAllowed = getEarliestAllowedStart(task);
                let candidateStart = null;
                if (task.start_date && task.start_time) {
                    let preferred = new Date(`${task.start_date}T${task.start_time}`);
                    if (preferred < earliestAllowed) preferred = earliestAllowed;
                    candidateStart = getNextAvailableStart(preferred, lastEnd);
                } else {
                    candidateStart = getNextAvailableStart(earliestAllowed, lastEnd);
                }
                // Find the next available slot if candidateStart overlaps
                let taskStart = this.findNextAvailableSlot(candidateStart, task.duration_minutes, scheduledTasks);
                const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
                if (task.due_date) {
                    const deadline = new Date(`${task.due_date}T${task.due_time || '23:59'}`);
                    if (taskEnd > deadline) {
                        impossibleTasks.push({
                            ...task,
                            reason: 'would_exceed_deadline',
                            attempted_start: taskStart,
                            attempted_end: taskEnd
                        });
                        continue;
                    }
                }
                scheduledTasks.push(this.createTaskCopyWithNewTimes(task, taskStart));
                lastEnd = taskEnd;
                now = taskEnd;
            } catch (error) {
                console.error('Error scheduling preferred task:', error);
                impossibleTasks.push({
                    ...task,
                    reason: 'validation_error',
                    error: error.message
                });
            }
        }
        
        // Try to schedule flexible tasks
        for (const task of sortedFlexibleTasks) {
            try {
                this.validateTask(task);
                const earliestAllowed = getEarliestAllowedStart(task);
                let candidateStart = getNextAvailableStart(earliestAllowed, lastEnd);
                let taskStart = this.findNextAvailableSlot(candidateStart, task.duration_minutes, scheduledTasks);
                const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
                if (task.due_date) {
                    const deadline = new Date(`${task.due_date}T${task.due_time || '23:59'}`);
                    if (taskEnd > deadline) {
                        impossibleTasks.push({
                            ...task,
                            reason: 'would_exceed_deadline',
                            attempted_start: taskStart,
                            attempted_end: taskEnd
                        });
                        continue;
                    }
                }
                scheduledTasks.push(this.createTaskCopyWithNewTimes(task, taskStart));
                lastEnd = taskEnd;
                now = taskEnd;
            } catch (error) {
                console.error('Error scheduling flexible task:', error);
                impossibleTasks.push({
                    ...task,
                    reason: 'validation_error',
                    error: error.message
                });
            }
        }
        
        // Sort all tasks by start time
        scheduledTasks.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
        
        return {
            scheduledTasks,
            impossibleTasks,
            summary: this.generateScheduleSummary(scheduledTasks, impossibleTasks)
        };
    }

    generateScheduleSummary(scheduledTasks, impossibleTasks) {
        const importanceCounts = {
            5: { scheduled: 0, impossible: 0 },
            4: { scheduled: 0, impossible: 0 },
            3: { scheduled: 0, impossible: 0 },
            2: { scheduled: 0, impossible: 0 },
            1: { scheduled: 0, impossible: 0 }
        };
        
        // Count scheduled tasks by importance
        scheduledTasks.forEach(task => {
            importanceCounts[task.importance].scheduled++;
        });
        
        // Count impossible tasks by importance
        impossibleTasks.forEach(task => {
            importanceCounts[task.importance].impossible++;
        });
        
        // Generate messages for impossible tasks
        const messages = [];
        for (let i = 5; i >= 1; i--) {
            const { impossible } = importanceCounts[i];
            if (impossible > 0) {
                messages.push(`${impossible} level-${i} importance task(s) cannot be scheduled`);
            }
        }
        
        return {
            message: messages.join('. ') + '. Please review your schedule.',
            importanceBreakdown: importanceCounts
        };
    }
}

export default TaskPrioritizer; 