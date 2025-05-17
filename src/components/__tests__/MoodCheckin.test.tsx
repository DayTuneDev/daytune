import React from 'react';
import { render, screen } from '@testing-library/react';
import MoodCheckin from '../../MoodCheckin';

describe('MoodCheckin', () => {
  test('renders mood check-in options', () => {
    render(
      <MoodCheckin userId="test-user" availableBuckets={['morning']} />
    );
    expect(screen.getByText(/How are you feeling/i)).toBeInTheDocument();
  });
});

// Add more tests as needed for mood selection and submission
