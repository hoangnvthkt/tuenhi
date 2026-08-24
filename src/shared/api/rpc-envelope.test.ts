import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseRpcEnvelope } from './rpc-envelope';

const correlationId = '10000000-0000-4000-8000-000000000001';

describe('parseRpcEnvelope', () => {
  it('returns validated success data', () => {
    expect(
      parseRpcEnvelope(
        z.object({ value: z.string() }),
        {
          ok: true,
          data: { value: 'đúng' },
          error: null,
          correlationId,
        },
        {
          invalidMessage: 'Phản hồi không hợp lệ.',
          createBusinessError: () => new Error('business'),
        },
      ),
    ).toEqual({ value: 'đúng' });
  });

  it('creates a domain error with the server error fields', () => {
    expect(() =>
      parseRpcEnvelope(
        z.object({ value: z.string() }),
        {
          ok: false,
          data: null,
          error: {
            code: 'VERSION_CONFLICT',
            message: 'conflict',
            details: { version: 2 },
          },
          correlationId,
        },
        {
          invalidMessage: 'Phản hồi không hợp lệ.',
          createBusinessError: (error, id) =>
            new Error(`${error.code}:${id}:${String(error.details.version)}`),
        },
      ),
    ).toThrow(`VERSION_CONFLICT:${correlationId}:2`);
  });

  it('rejects malformed envelopes without leaking raw payloads', () => {
    expect(() =>
      parseRpcEnvelope(
        z.object({ value: z.string() }),
        { raw: 'sql' },
        {
          invalidMessage: 'Phản hồi không hợp lệ.',
          createBusinessError: () => new Error('business'),
        },
      ),
    ).toThrow('Phản hồi không hợp lệ.');
  });
});
