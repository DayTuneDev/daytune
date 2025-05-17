import React from 'react';
import { render, screen } from '@testing-library/react';
import TaskList from '../TaskList';
import { Task } from '../../types/shared';

describe('TaskList', () => {
  test('renders a list of tasks', () => {
    const tasks: Task[] = [
      {
        id: '1',
        title: 'Task One',
        start_datetime: '2023-01-01T09:00:00Z',
        duration_minutes: 60,
        scheduling_type: 'fixed',
        importance: 3,
        difficulty: 2,
      },
      {
        id: '2',
        title: 'Task Two',
        start_datetime: '2023-01-01T10:00:00Z',
        duration_minutes: 30,
        scheduling_type: 'flexible',
        importance: 2,
        difficulty: 1,
      },
    ];
    render(
      <TaskList tasks={tasks} onTaskUpdated={jest.fn()} onTaskDeleted={jest.fn()} userId="test-user" />
    );
    expect(screen.getByText(/Task One/i)).toBeInTheDocument();
    expect(screen.getByText(/Task Two/i)).toBeInTheDocument();
  });
});
