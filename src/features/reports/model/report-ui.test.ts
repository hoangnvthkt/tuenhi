import { describe, expect, it } from 'vitest';
import { formatReportNumber } from './report-ui';

describe('formatReportNumber', () => {
  it('keeps all digits for an 18-digit report quantity', () => {
    expect(formatReportNumber('999999999999999999')).toBe(
      '999.999.999.999.999.999',
    );
  });
});
