// Helper function to check if a time slot is available
function isTimeSlotAvailable(startTime, duration, fixedTasks) {
  const endTime = new Date(startTime.getTime() + duration * 60000);
  
  return !fixedTasks.some(task => {
    const taskStart = new Date(task.start_datetime);
    const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
    
    return (
      (startTime >= taskStart && startTime < taskEnd) ||
      (endTime > taskStart && endTime <= taskEnd) ||
      (startTime <= taskStart && endTime >= taskEnd)
    );
  });
}

// Helper function to find the next available time slot
function findNextAvailableSlot(startTime, duration, fixedTasks) {
  let currentTime = new Date(startTime);
  
  while (!isTimeSlotAvailable(currentTime, duration, fixedTasks)) {
    currentTime = new Date(currentTime.getTime() + 15 * 60000); // Try next 15-minute slot
  }
  
  return currentTime;
}

// Main scheduling function
export function scheduleTasks(tasks) {
  // Separate fixed and flexible tasks
  const fixedTasks = tasks.filter(task => task.is_fixed);
  const flexibleTasks = tasks.filter(task => !task.is_fixed);
  
  // Sort flexible tasks by importance (descending) and then by deadline
  flexibleTasks.sort((a, b) => {
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
  
  // Schedule fixed tasks first
  const scheduledTasks = [...fixedTasks];
  
  // Try to schedule flexible tasks
  const impossibleTasks = [];
  let currentTime = new Date();
  
  for (const task of flexibleTasks) {
    const taskStart = findNextAvailableSlot(currentTime, task.duration_minutes, scheduledTasks);
    const taskEnd = new Date(taskStart.getTime() + task.duration_minutes * 60000);
    
    // Check if task can be completed before its deadline
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
    
    // Schedule the task
    scheduledTasks.push({
      ...task,
      start_datetime: taskStart.toISOString()
    });
    
    // Update current time for next task
    currentTime = taskEnd;
  }
  
  // Sort scheduled tasks by start time
  scheduledTasks.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
  
  return {
    scheduledTasks,
    impossibleTasks,
    summary: generateScheduleSummary(scheduledTasks, impossibleTasks)
  };
}

// Generate a summary of the schedule
function generateScheduleSummary(scheduledTasks, impossibleTasks) {
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

// Function to handle task overruns
export function handleTaskOverrun(task, overrunMinutes, scheduledTasks) {
  const taskIndex = scheduledTasks.findIndex(t => t.id === task.id);
  if (taskIndex === -1) return scheduledTasks;
  
  const updatedTasks = [...scheduledTasks];
  const currentTask = updatedTasks[taskIndex];
  
  // Update the current task's duration
  currentTask.duration_minutes += overrunMinutes;
  
  // Adjust all subsequent tasks
  for (let i = taskIndex + 1; i < updatedTasks.length; i++) {
    const task = updatedTasks[i];
    if (task.is_fixed) {
      // If we hit a fixed task, we need to mark subsequent tasks as impossible
      const impossibleTasks = updatedTasks.slice(i).filter(t => !t.is_fixed);
      return {
        scheduledTasks: updatedTasks.slice(0, i),
        impossibleTasks,
        summary: generateScheduleSummary(updatedTasks.slice(0, i), impossibleTasks)
      };
    }
    
    // Move the task's start time
    const newStartTime = new Date(updatedTasks[i - 1].start_datetime);
    newStartTime.setMinutes(newStartTime.getMinutes() + updatedTasks[i - 1].duration_minutes);
    task.start_datetime = newStartTime.toISOString();
  }
  
  return {
    scheduledTasks: updatedTasks,
    impossibleTasks: [],
    summary: generateScheduleSummary(updatedTasks, [])
  };
} 