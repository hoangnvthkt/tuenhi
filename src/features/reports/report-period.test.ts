import { describe, expect, it } from 'vitest';
import { inVietnamDate, presetReportRange } from './report-period';

describe('report period helpers', () => {
  it('uses the Asia/Ho_Chi_Minh calendar date at a UTC day boundary', () => {
    expect(inVietnamDate(new Date('2026-08-23T18:30:00.000Z'))).toBe(
      '2026-08-24',
    );
  });

  it('starts a weekly report on Monday and ends it on the selected date', () => {
    expect(presetReportRange('week', '2026-08-23')).toEqual({
      from: '2026-08-17',
      to: '2026-08-23',
    });
  });

  it('starts a monthly report on the first day of its month', () => {
    expect(presetReportRange('month', '2026-08-23')).toEqual({
      from: '2026-08-01',
      to: '2026-08-23',
    });
  });
});
