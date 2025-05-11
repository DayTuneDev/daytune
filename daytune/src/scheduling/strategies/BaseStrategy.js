class BaseStrategy {
    constructor() {
        if (this.constructor === BaseStrategy) {
            throw new Error('BaseStrategy is an abstract class and cannot be instantiated directly');
        }
    }

    // Main optimization method that all strategies must implement
    async optimize(schedule, context) {
        throw new Error('optimize() must be implemented by strategy subclass');
    }

    // Helper method to check if a time slot is available
    isTimeSlotAvailable(startTime, duration, existingTasks) {
        const endTime = new Date(startTime.getTime() + duration * 60000);
        
        return !existingTasks.some(task => {
            const taskStart = new Date(task.start_datetime);
            const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
            
            return (
                (startTime >= taskStart && startTime < taskEnd) ||
                (endTime > taskStart && endTime <= taskEnd) ||
                (startTime <= taskStart && endTime >= taskEnd)
            );
        });
    }

    // Helper method to find the next available time slot
    findNextAvailableSlot(startTime, duration, existingTasks) {
        let currentTime = new Date(startTime);
        
        while (!this.isTimeSlotAvailable(currentTime, duration, existingTasks)) {
            currentTime = new Date(currentTime.getTime() + 15 * 60000); // Try next 15-minute slot
        }
        
        return currentTime;
    }

    // Helper method to sort tasks by importance and deadline
    sortTasksByPriority(tasks) {
        return [...tasks].sort((a, b) => {
            if (b.importance !== a.importance) {
                return b.importance - a.importance;
            }
            
            if (a.due_date && b.due_date) {
                const dateA = new Date(`${a.due_date}T${a.due_time || '23:59'}`);
                const dateB = new Date(`${b.due_date}T${b.due_time || '23:59'}`);
                return dateA - dateB;
            }
            
            return 0;
        });
    }

    // Helper method to validate task data
    validateTask(task) {
        const requiredFields = ['id', 'title', 'duration_minutes', 'importance'];
        const missingFields = requiredFields.filter(field => !task[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Task missing required fields: ${missingFields.join(', ')}`);
        }
        
        return true;
    }

    // Helper method to create a task copy with updated times
    createTaskCopyWithNewTimes(task, startTime) {
        return {
            ...task,
            start_datetime: startTime.toISOString(),
            end_datetime: new Date(startTime.getTime() + task.duration_minutes * 60000).toISOString()
        };
    }
}

export default BaseStrategy; 