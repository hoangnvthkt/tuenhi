import { describe, expect, it } from 'vitest';
import { createQueryClient } from '@/shared/lib/query/create-query-client';

describe('application path alias', () => {
  it('resolves source modules through the @ alias', () => {
    expect(createQueryClient()).toBeDefined();
  });
});
