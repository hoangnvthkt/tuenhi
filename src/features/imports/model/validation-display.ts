export type ValidationDisplayError = {
  sourceColumn: string | null;
  targetField: string | null;
  code: string;
  message: string;
  rawValue: unknown;
};

export type ValidationDisplayRow = {
  rowNumber: number;
  status: 'VALID' | 'INVALID';
  values: Record<string, unknown>;
  errors: ValidationDisplayError[];
};
