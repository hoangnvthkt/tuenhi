import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithQueryClient } from './render-with-query-client';

function Probe() {
  const query = useQuery({
    queryKey: ['probe'],
    queryFn: async () => 'sẵn sàng',
  });
  return <p>{query.data ?? 'đang tải'}</p>;
}

describe('renderWithQueryClient', () => {
  it('renders components with an isolated query client', async () => {
    renderWithQueryClient(<Probe />);
    expect(await screen.findByText('sẵn sàng')).toBeVisible();
  });
});
