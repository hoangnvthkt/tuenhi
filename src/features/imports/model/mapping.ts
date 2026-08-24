import type { ImportTarget } from './contracts';
import {
  normalizeImportHeader,
  proposeHeaderMapping,
} from './header-normalization';
import { getTemplateContract } from './template-contracts';

export type MappingTarget = string | 'IGNORED' | 'IGNORED_SENSITIVE' | null;

export type ColumnMapping = {
  sourceIndex: number;
  sourceHeader: string;
  targetField: MappingTarget;
  ignoreConfirmed: boolean;
};

export type MappingIssue = {
  code:
    | 'HEADER_REQUIRED'
    | 'HEADER_DUPLICATE'
    | 'COLUMN_MAPPING_REQUIRED'
    | 'COLUMN_MAPPING_DUPLICATE';
  message: string;
  sourceHeader?: string;
  targetField?: string;
};

export function proposeMapping(
  headers: string[],
  target: ImportTarget,
  version: number,
): ColumnMapping[] {
  return headers.map((sourceHeader, sourceIndex) => {
    const proposal = proposeHeaderMapping(sourceHeader, target, version);
    return {
      sourceIndex,
      sourceHeader,
      targetField: proposal,
      ignoreConfirmed: proposal === 'IGNORED_SENSITIVE',
    };
  });
}

export function validateMapping(
  mapping: ColumnMapping[],
  target: ImportTarget,
  version: number,
): { ok: true } | { ok: false; issues: MappingIssue[] } {
  const issues: MappingIssue[] = [];
  const normalizedHeaders = new Map<string, number>();
  const mappedTargets = new Map<string, number>();

  for (const item of mapping) {
    const header = normalizeImportHeader(item.sourceHeader);
    if (!header) {
      issues.push({
        code: 'HEADER_REQUIRED',
        message: 'Tiêu đề cột không được để trống.',
        sourceHeader: item.sourceHeader,
      });
    } else {
      const seen = normalizedHeaders.get(header) ?? 0;
      normalizedHeaders.set(header, seen + 1);
      if (seen > 0) {
        issues.push({
          code: 'HEADER_DUPLICATE',
          message: 'Tiêu đề cột bị trùng.',
          sourceHeader: item.sourceHeader,
        });
      }
    }

    if (item.targetField === null) {
      issues.push({
        code: 'COLUMN_MAPPING_REQUIRED',
        message: 'Vui lòng ghép cột hoặc xác nhận bỏ qua.',
        sourceHeader: item.sourceHeader,
      });
    } else if (item.targetField === 'IGNORED' && !item.ignoreConfirmed) {
      issues.push({
        code: 'COLUMN_MAPPING_REQUIRED',
        message: 'Vui lòng xác nhận bỏ qua cột này.',
        sourceHeader: item.sourceHeader,
      });
    } else if (
      item.targetField !== 'IGNORED' &&
      item.targetField !== 'IGNORED_SENSITIVE'
    ) {
      const seen = mappedTargets.get(item.targetField) ?? 0;
      mappedTargets.set(item.targetField, seen + 1);
      if (seen > 0) {
        issues.push({
          code: 'COLUMN_MAPPING_DUPLICATE',
          message: 'Mỗi trường chỉ được ghép với một cột.',
          sourceHeader: item.sourceHeader,
          targetField: item.targetField,
        });
      }
    }
  }

  const contract = getTemplateContract(target, version);
  for (const column of contract.columns.filter((item) => item.required)) {
    if ((mappedTargets.get(column.field) ?? 0) === 0) {
      issues.push({
        code: 'COLUMN_MAPPING_REQUIRED',
        message: `Vui lòng ghép cột bắt buộc “${column.header}”.`,
        targetField: column.field,
      });
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function buildSanitizedRows(
  rows: Array<{ rowNumber: number; cells: unknown[] }>,
  mapping: ColumnMapping[],
  target: ImportTarget,
  version: number,
) {
  const result = validateMapping(mapping, target, version);
  if (!result.ok) throw new Error('Ghép cột chưa hợp lệ.');
  return rows.map((row) => {
    const values: Record<string, unknown> = {};
    for (const item of mapping) {
      if (
        item.targetField === null ||
        item.targetField === 'IGNORED' ||
        item.targetField === 'IGNORED_SENSITIVE'
      ) {
        continue;
      }
      values[item.targetField] = row.cells[item.sourceIndex] ?? null;
    }
    return { rowNumber: row.rowNumber, values };
  });
}

export function mappingForServer(mapping: ColumnMapping[]) {
  return Object.fromEntries(
    mapping.map((item) => [item.sourceHeader, item.targetField ?? 'IGNORED']),
  );
}
