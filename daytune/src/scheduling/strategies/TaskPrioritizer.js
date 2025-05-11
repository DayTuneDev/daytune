import BaseStrategy from './BaseStrategy';

class TaskPrioritizer extends BaseStrategy {
    constructor() {
        super();
    }

    async optimize(schedule, context) {
        // Separate tasks by scheduling_type
        const fixedTasks = schedule.filter(task => task.scheduling_type === 'fixed');
        const preferredTasks = schedule.filter(task => task.scheduling_type === 'preferred');
        const flexibleTasks = schedule.filter(task => task.scheduling_type === 'flexible');
        
        // Sort preferred and flexible tasks by priority
        const sortedPreferredTasks = this.sortTasksByPriority(preferredTasks);
        const sortedFlexibleTasks = this.sortTasksByPriority(flexibleTasks);
        
        // Start with fixed tasks
        const scheduledTasks = [...fixedTasks];
        const impossibleTasks = [];
        let currentTime = context.currentTime || new Date();
        
        // Try to schedule preferred tasks at their preferred time if possible, else move
        for (const task of sortedPreferredTasks) {
            try {
                this.validateTask(task);
                let taskStart = null;
                if (task.start_date && task.start_time) {
                    taskStart = new Date(`${task.start_date}T${task.start_time}`);
                    if (!this.isTimeSlotAvailable(taskStart, task.duration_minutes, scheduledTasks)) {
                        taskStart = this.findNextAvailableSlot(currentTime, task.duration_minutes, scheduledTasks);
                    }
                } else {
                    taskStart = this.findNextAvailableSlot(currentTime, task.duration_minutes, scheduledTasks);
                }
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
                currentTime = taskEnd;
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
                const taskStart = this.findNextAvailableSlot(currentTime, task.duration_minutes, scheduledTasks);
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
                currentTime = taskEnd;
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