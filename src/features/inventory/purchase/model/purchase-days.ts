const vietnamDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** YYYY-MM-DD of an instant in Vietnam time. */
export function vietnamDay(instant: string) {
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? '' : vietnamDate.format(date);
}

/** Inclusive date range for a selected day, else month, else none. */
export function purchasePeriod(month: string, day: string) {
  if (DAY.test(day)) return { from: day, to: day };
  if (!MONTH.test(month)) return undefined;
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, '0')}`,
  };
}

/** dd/mm/yyyy for a YYYY-MM-DD day. */
export function formatDay(day: string) {
  const [year, month, date] = day.split('-');
  return day ? `${date}/${month}/${year}` : 'Không rõ ngày';
}

/** Groups items by Vietnam receive day, newest day first, keeping item order inside a day. */
export function groupByDay<T extends { receivedAt?: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = item.receivedAt ? vietnamDay(item.receivedAt) : '';
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, dayItems]) => ({ day, items: dayItems }));
}
