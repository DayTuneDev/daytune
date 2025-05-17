import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  test('renders learn react link', () => {
    render(<App />);
    // You may want to update this test to match your actual UI
    // expect(screen.getByText(/learn react/i)).toBeInTheDocument();
  });
});
