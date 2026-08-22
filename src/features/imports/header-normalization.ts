import type { ImportTarget } from './contracts';
import {
  SENSITIVE_CUSTOMER_HEADER_ALIASES,
  getTemplateContract,
} from './template-contracts';

export function normalizeImportHeader(raw: string) {
  return raw
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('vi-VN');
}

export function proposeHeaderMapping(
  raw: string,
  target: ImportTarget,
  version: number,
) {
  const normalized = normalizeImportHeader(raw);

  if (
    target === 'CUSTOMERS' &&
    SENSITIVE_CUSTOMER_HEADER_ALIASES.some(
      (alias) => normalizeImportHeader(alias) === normalized,
    )
  ) {
    return 'IGNORED_SENSITIVE';
  }

  const contract = getTemplateContract(target, version);
  for (const column of contract.columns) {
    const candidates = [column.header, ...(column.aliases ?? [])];
    if (
      candidates.some(
        (candidate) => normalizeImportHeader(candidate) === normalized,
      )
    ) {
      return column.field;
    }
  }

  return null;
}
