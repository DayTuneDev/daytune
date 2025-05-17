import React from 'react';
import { render, screen } from '@testing-library/react';
import WeeklyCalendar from '../WeeklyCalendar';

test('renders tasks in the calendar', () => {
  const tasks = [{ id: 1, title: 'Test Task', start_datetime: new Date(), duration_minutes: 60 }];
  render(<WeeklyCalendar tasks={tasks} />);
  expect(screen.getByText(/Test Task/i)).toBeInTheDocument();
});
