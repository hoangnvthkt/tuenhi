import { useCallback } from 'react';
import {
  executeFinancialCommand,
  type FinancialCommandName,
} from '@/shared/api/financial-command';
import { createFinancialOutcomeApi } from '@/shared/api/financial-outcome-api';

export function useFinancialCommand(userId?: string) {
  return useCallback(
    async function run<T>({
      commandName,
      entityId,
      invoke,
      parseCachedResponse,
      resumeOnly,
      retryPending,
    }: {
      commandName: FinancialCommandName;
      entityId: string;
      invoke: (idempotencyKey: string) => Promise<T>;
      parseCachedResponse: (response: unknown) => T;
      resumeOnly?: boolean;
      retryPending?: boolean;
    }) {
      if (!userId) {
        throw new Error('Phiên đăng nhập không còn hợp lệ.');
      }
      const outcomeApi = createFinancialOutcomeApi();
      return executeFinancialCommand({
        userId,
        commandName,
        entityId,
        invoke,
        lookup: outcomeApi.lookup,
        parseCachedResponse,
        resumeOnly,
        retryPending,
      });
    },
    [userId],
  );
}
