import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the Tuệ Nhi product identity', () => {
    render(<App />);

    expect(screen.getByText('Tuệ Nhi')).toBeInTheDocument();
  });
});
