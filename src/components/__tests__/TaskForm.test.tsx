import React from 'react';
import { render, screen } from '@testing-library/react';
import TaskForm from '../TaskForm';

describe('TaskForm', () => {
  test('renders task form', () => {
    render(<TaskForm onTaskAdded={jest.fn()} userId="test-user" />);
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();
  });
});

// Add more tests for form submission and validation
