import { describe, expect, it, vi } from 'vitest';
import {
  createPaymentProofApi,
  type PaymentProofTransport,
} from './payment-proof-api';

const saleId = '10000000-0000-4000-8000-000000000001';

function transport(
  overrides: Partial<PaymentProofTransport> = {},
): PaymentProofTransport {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    removeObjects: vi.fn().mockResolvedValue(undefined),
    createSignedUrl: vi
      .fn()
      .mockResolvedValue('https://signed.example.invalid/payment-proof'),
    ...overrides,
  };
}

describe('payment proof API', () => {
  it('rejects an unsupported or oversized evidence file before storage', async () => {
    const current = transport();
    const api = createPaymentProofApi(current);

    await expect(
      api.upload({
        transaction: { kind: 'sale', id: saleId },
        file: new File(['not an image'], 'proof.gif', { type: 'image/gif' }),
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_PROOF_TYPE_INVALID',
    });
    await expect(
      api.upload({
        transaction: { kind: 'sale', id: saleId },
        file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'proof.jpg', {
          type: 'image/jpeg',
        }),
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_PROOF_SIZE_EXCEEDED',
    });
    expect(current.upload).not.toHaveBeenCalled();
  });

  it('writes a new immutable sale proof at its scoped storage path', async () => {
    const current = transport();
    const api = createPaymentProofApi(current);

    const result = await api.upload({
      transaction: { kind: 'sale', id: saleId },
      file: new File(['image'], 'proof.png', { type: 'image/png' }),
    });

    expect(result).toEqual({
      objectPath: expect.stringMatching(
        new RegExp(`^sales/${saleId}/[0-9a-f-]+\\.png$`),
      ),
    });
    expect(current.upload).toHaveBeenCalledWith(
      result.objectPath,
      expect.any(File),
      { contentType: 'image/png', upsert: false },
    );
  });

  it('returns a safe domain error if the upload fails', async () => {
    const api = createPaymentProofApi(
      transport({ upload: vi.fn().mockRejectedValue(new Error('storage')) }),
    );

    await expect(
      api.upload({
        transaction: { kind: 'return', id: saleId },
        file: new File(['image'], 'proof.webp', { type: 'image/webp' }),
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_PROOF_UPLOAD_FAILED',
    });
  });
});
