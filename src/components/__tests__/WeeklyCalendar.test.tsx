import React from 'react';
import { render, screen } from '@testing-library/react';
import WeeklyCalendar from '../WeeklyCalendar';
import { Task, BlockedTime } from '../../types/shared';

describe('WeeklyCalendar', () => {
  test('renders tasks in the calendar', () => {
    const tasks: Task[] = [
      {
        id: '1',
        title: 'Test Task',
        start_datetime: '2023-01-01T09:00:00Z',
        duration_minutes: 60,
        scheduling_type: 'fixed',
        importance: 3,
        difficulty: 2,
      },
    ];
    const blockedTimes: BlockedTime[] = [];
    render(<WeeklyCalendar tasks={tasks} blockedTimes={blockedTimes} />);
    expect(screen.getByText(/Test Task/i)).toBeInTheDocument();
  });
});
