class Scheduler {
    constructor(taskManager) {
        this.taskManager = taskManager;
        this.strategies = {
            breakManager: null, // Will be implemented later
            energyOptimizer: null, // Will be implemented later
            taskPrioritizer: null, // Will be implemented later
            conflictResolver: null // Will be implemented later
        };
    }

    // Register a scheduling strategy
    registerStrategy(name, strategy) {
        if (this.strategies.hasOwnProperty(name)) {
            this.strategies[name] = strategy;
        } else {
            console.warn(`Strategy ${name} not found in available strategies`);
        }
    }

    // Get the current scheduling context
    async getSchedulingContext() {
        // This will be expanded to include:
        // - Current energy levels
        // - User preferences
        // - Time of day
        // - Break settings
        // - etc.
        return {
            currentTime: new Date(),
            // Add more context as needed
        };
    }

    // Main scheduling function
    async retuneSchedule(tasks, context = null) {
        if (!context) {
            context = await this.getSchedulingContext();
        }

        // Start with the original tasks
        let currentSchedule = [...tasks];
        
        // Apply each strategy in sequence
        for (const [name, strategy] of Object.entries(this.strategies)) {
            if (strategy) {
                try {
                    currentSchedule = await strategy.optimize(currentSchedule, context);
                } catch (error) {
                    console.error(`Error in ${name} strategy:`, error);
                    // Continue with other strategies even if one fails
                }
            }
        }

        return currentSchedule;
    }

    // Handle task overrun
    async handleTaskOverrun(task, overrunMinutes) {
        return this.taskManager.handleTaskOverrun(task, overrunMinutes);
    }
}

export default Scheduler; 