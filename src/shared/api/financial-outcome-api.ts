import { z } from 'zod';
import { getBusinessErrorMessage } from './command-error';
import {
  type FinancialCommandName,
  type FinancialCommandOutcome,
  FinancialBusinessError,
  FinancialTransportError,
} from './financial-command';
import { parseRpcEnvelope, type RpcErrorPayload } from './rpc-envelope';
import { getSupabaseClient } from '@/shared/supabase/client';

const commandOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('RESOLVED'), response: z.unknown() }),
  z.object({ status: z.literal('NOT_FOUND'), response: z.null() }),
]);

export class FinancialOutcomeApiError extends FinancialBusinessError {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly details: Record<string, unknown>,
  ) {
    super(getBusinessErrorMessage(code));
    this.name = 'FinancialOutcomeApiError';
  }
}

function businessError(error: RpcErrorPayload, correlationId: string) {
  return new FinancialOutcomeApiError(error.code, correlationId, error.details);
}

export function createFinancialOutcomeApi() {
  const client = getSupabaseClient();

  return {
    async lookup(
      commandName: FinancialCommandName,
      idempotencyKey: string,
    ): Promise<FinancialCommandOutcome> {
      const { data, error } = await client.rpc('get_my_command_outcome', {
        p_command_name: commandName,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new FinancialTransportError();

      return parseRpcEnvelope(commandOutcomeSchema, data, {
        invalidMessage: 'Phản hồi đối soát giao dịch không hợp lệ.',
        createBusinessError: businessError,
      });
    },
  };
}

export type FinancialOutcomeApi = ReturnType<typeof createFinancialOutcomeApi>;
