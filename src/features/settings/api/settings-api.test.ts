import { describe, expect, it } from 'vitest';
import { parseSalesChannels, SettingsApiError } from './settings-api';

const correlationId = '10000000-0000-4000-8000-000000000001';

describe('settings API boundary', () => {
  it('parses sales channels without leaking extra fields', () => {
    expect(
      parseSalesChannels({
        ok: true,
        data: {
          items: [
            {
              id: '10000000-0000-4000-8000-000000000002',
              code: 'IN_STORE',
              name: 'Tại quầy',
              sortOrder: 10,
              isActive: true,
              version: 1,
            },
          ],
        },
        error: null,
        correlationId,
      }),
    ).toEqual([
      expect.objectContaining({ code: 'IN_STORE', name: 'Tại quầy' }),
    ]);
  });

  it('preserves safe domain error metadata', () => {
    expect(() =>
      parseSalesChannels({
        ok: false,
        data: null,
        error: {
          code: 'DUPLICATE_IN_DATABASE',
          message: 'raw detail',
          details: { field: 'code' },
        },
        correlationId,
      }),
    ).toThrow(SettingsApiError);
  });
});
