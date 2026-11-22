export function dateInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftDate(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
// Fetch one complete day per source per tick. Recent corrections take priority
// once daily, then historical days advance without re-querying the whole history.
export function nextSyncDay(input: {
  today: string;
  lagDays: number;
  backfillDays: number;
  refreshedThrough: string | null;
  backfillBefore: string | null;
}) {
  const end = shiftDate(input.today, -input.lagDays);
  const floor = shiftDate(input.today, -input.backfillDays);
  if (!input.refreshedThrough || input.refreshedThrough < end) {
    const start = input.refreshedThrough
      ? shiftDate(input.refreshedThrough, 1)
      : shiftDate(end, -6);
    return { date: start < floor ? floor : start, recent: true };
  }
  const historical = shiftDate(input.backfillBefore ?? shiftDate(end, -6), -1);
  return historical >= floor ? { date: historical, recent: false } : null;
}
