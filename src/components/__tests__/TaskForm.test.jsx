import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskForm from '../TaskForm';

test('renders task form', () => {
  render(<TaskForm onSubmit={jest.fn()} />);
  expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
});

// Add more tests for form submission and validation 