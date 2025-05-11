import BaseStrategy from './BaseStrategy';

class BreakManager extends BaseStrategy {
    constructor(options = {}) {
        super();
        this.breakLength = options.breakLength || 10; // minutes
        this.workBlock = options.workBlock || 60; // minutes of work before a break
    }

    async optimize(schedule, context) {
        // Assume schedule is already sorted by start time
        const newSchedule = [];
        let workAccum = 0;
        let lastEnd = null;
        for (let i = 0; i < schedule.length; i++) {
            const task = schedule[i];
            const taskStart = new Date(task.start_datetime);
            const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);

            // Insert a break if work block exceeded and not the first task
            if (lastEnd && workAccum >= this.workBlock) {
                // Find next available slot for break
                let breakStart = new Date(lastEnd);
                // Ensure break does not overlap with fixed tasks
                while (!this.isTimeSlotAvailable(breakStart, this.breakLength, newSchedule)) {
                    breakStart = new Date(breakStart.getTime() + 15 * 60000);
                }
                const breakEnd = new Date(breakStart.getTime() + this.breakLength * 60000);
                newSchedule.push({
                    id: `break-${breakStart.toISOString()}`,
                    title: 'Break',
                    start_datetime: breakStart.toISOString(),
                    end_datetime: breakEnd.toISOString(),
                    duration_minutes: this.breakLength,
                    scheduling_type: 'fixed',
                    is_break: true
                });
                workAccum = 0;
                lastEnd = breakEnd;
            }

            newSchedule.push(task);
            workAccum += task.duration_minutes;
            lastEnd = taskEnd;
        }
        // Sort by start time
        newSchedule.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
        return newSchedule;
    }
}

export default BreakManager; 