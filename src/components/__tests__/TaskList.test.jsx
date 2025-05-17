import React from 'react';
import { render, screen } from '@testing-library/react';
import TaskList from '../TaskList';

test('renders a list of tasks', () => {
  const tasks = [
    { id: 1, title: 'Task One', start_datetime: new Date(), duration_minutes: 30 },
    { id: 2, title: 'Task Two', start_datetime: new Date(), duration_minutes: 45 }
  ];
  render(<TaskList tasks={tasks} />);
  expect(screen.getByText(/Task One/i)).toBeInTheDocument();
  expect(screen.getByText(/Task Two/i)).toBeInTheDocument();
}); 