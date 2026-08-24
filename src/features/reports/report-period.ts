export type ReportPeriod = 'today' | 'week' | 'month' | 'custom';

export function inVietnamDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function addIsoDays(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function presetReportRange(
  period: Exclude<ReportPeriod, 'custom'>,
  today = inVietnamDate(),
) {
  if (period === 'today') return { from: today, to: today };
  if (period === 'week') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
    return { from: addIsoDays(today, 1 - weekday), to: today };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function isIsoDate(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
