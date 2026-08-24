import { z } from 'zod';

export type RpcErrorPayload = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

type RpcEnvelopeOptions = {
  invalidMessage: string;
  createBusinessError: (error: RpcErrorPayload, correlationId: string) => Error;
};

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});

function envelope<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      data: dataSchema,
      error: z.null(),
      correlationId: z.uuid(),
    }),
    z.object({
      ok: z.literal(false),
      data: z.null(),
      error: errorSchema,
      correlationId: z.uuid(),
    }),
  ]);
}

export function parseRpcEnvelope<T>(
  dataSchema: z.ZodType<T>,
  value: unknown,
  options: RpcEnvelopeOptions,
): T {
  const result = envelope(dataSchema).safeParse(value);
  if (!result.success) throw new Error(options.invalidMessage);
  if (!result.data.ok) {
    throw options.createBusinessError(
      result.data.error,
      result.data.correlationId,
    );
  }
  return result.data.data;
}
