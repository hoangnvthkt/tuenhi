import { getSupabaseClient } from '@/shared/supabase/client';

const BUCKET = 'payment-proofs';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

const messages: Record<string, string> = {
  PAYMENT_PROOF_TYPE_INVALID: 'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.',
  PAYMENT_PROOF_SIZE_EXCEEDED: 'Ảnh chứng từ không được lớn hơn 5 MiB.',
  PAYMENT_PROOF_UPLOAD_FAILED: 'Không thể tải ảnh chứng từ. Vui lòng thử lại.',
  PAYMENT_PROOF_REMOVE_FAILED:
    'Không thể dọn ảnh chứng từ tạm thời. Vui lòng thử lại.',
  PAYMENT_PROOF_URL_FAILED: 'Không thể mở ảnh chứng từ. Vui lòng thử lại.',
};

export class PaymentProofApiError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = 'PaymentProofApiError';
  }
}

export type PaymentProofTransaction = {
  kind: 'sale' | 'return';
  id: string;
};

export interface PaymentProofTransport {
  upload(
    objectPath: string,
    file: File,
    options: { contentType: string; upsert: false },
  ): Promise<void>;
  removeObjects(objectPaths: string[]): Promise<void>;
  createSignedUrl(objectPath: string): Promise<string>;
}

export interface PaymentProofApi {
  upload(input: {
    transaction: PaymentProofTransaction;
    file: File;
  }): Promise<{ objectPath: string }>;
  remove(objectPath: string): Promise<void>;
  createSignedUrl(objectPath: string): Promise<string>;
}

function createSupabaseTransport(): PaymentProofTransport {
  const bucket = getSupabaseClient().storage.from(BUCKET);
  return {
    async upload(objectPath, file, options) {
      const { error } = await bucket.upload(objectPath, file, options);
      if (error) throw new Error('storage upload failed');
    },
    async removeObjects(objectPaths) {
      const { error } = await bucket.remove(objectPaths);
      if (error) throw new Error('storage removal failed');
    },
    async createSignedUrl(objectPath) {
      const { data, error } = await bucket.createSignedUrl(objectPath, 60 * 10);
      if (error || !data.signedUrl) throw new Error('signed URL failed');
      return data.signedUrl;
    },
  };
}

export function createPaymentProofApi(
  transportProp?: PaymentProofTransport,
): PaymentProofApi {
  let transport = transportProp;
  const getTransport = () => (transport ??= createSupabaseTransport());

  return {
    async upload({ transaction, file }) {
      const extension = extensions[file.type as keyof typeof extensions];
      if (!extension)
        throw new PaymentProofApiError('PAYMENT_PROOF_TYPE_INVALID');
      if (file.size > MAX_IMAGE_SIZE) {
        throw new PaymentProofApiError('PAYMENT_PROOF_SIZE_EXCEEDED');
      }
      const directory = transaction.kind === 'sale' ? 'sales' : 'returns';
      const objectPath = `${directory}/${transaction.id}/${crypto.randomUUID()}.${extension}`;
      try {
        await getTransport().upload(objectPath, file, {
          contentType: file.type,
          upsert: false,
        });
      } catch {
        throw new PaymentProofApiError('PAYMENT_PROOF_UPLOAD_FAILED');
      }
      return { objectPath };
    },

    async remove(objectPath) {
      try {
        await getTransport().removeObjects([objectPath]);
      } catch {
        throw new PaymentProofApiError('PAYMENT_PROOF_REMOVE_FAILED');
      }
    },

    async createSignedUrl(objectPath) {
      try {
        return await getTransport().createSignedUrl(objectPath);
      } catch {
        throw new PaymentProofApiError('PAYMENT_PROOF_URL_FAILED');
      }
    },
  };
}
