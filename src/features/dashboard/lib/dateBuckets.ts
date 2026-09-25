import type { DashboardDay } from "../../../shared/types/domain";

export function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function getTodayCalendar(now: Date): { startInclusive: Date; endExclusive: Date } {
  const startInclusive = startOfLocalDay(now);
  const endExclusive = new Date(startInclusive);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { startInclusive, endExclusive };
}

/** Local calendar day N days before `now` (0 = hoy, 1 = ayer, 3 = hace 3 días). */
export function getDayCalendarDaysAgo(
  daysAgo: number,
  now: Date,
): { startInclusive: Date; endExclusive: Date; dateKey: string } {
  const safeDaysAgo = Number.isFinite(daysAgo) ? Math.max(0, Math.floor(daysAgo)) : 0;
  const startInclusive = startOfLocalDay(now);
  startInclusive.setDate(startInclusive.getDate() - safeDaysAgo);
  const endExclusive = new Date(startInclusive);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { startInclusive, endExclusive, dateKey: localDateKey(startInclusive) };
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMonthCalendar(now: Date): { startInclusive: Date; endExclusive: Date } {
  const startInclusive = startOfLocalDay(now);
  startInclusive.setDate(1);
  const endExclusive = new Date(startInclusive);
  endExclusive.setMonth(endExclusive.getMonth() + 1);
  return { startInclusive, endExclusive };
}

export function getDashboardCalendar(now: Date): { days: DashboardDay[]; startInclusive: Date; endExclusive: Date } {
  const today = startOfLocalDay(now);
  const startInclusive = new Date(today);
  startInclusive.setDate(startInclusive.getDate() - 6);
  const endExclusive = new Date(today);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const labels = ["D", "L", "M", "M", "J", "V", "S"];
  const days: DashboardDay[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(startInclusive);
    date.setDate(startInclusive.getDate() + offset);
    days.push({ date: localDateKey(date), label: labels[date.getDay()], total: 0, count: 0 });
  }
  return { days, startInclusive, endExclusive };
}

export function bucketSalesByLocalDay(days: DashboardDay[], sales: Array<{ fecha: string; total: number }>): DashboardDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const sale of sales) {
    const date = new Date(sale.fecha);
    if (Number.isNaN(date.getTime())) continue;
    const day = byDate.get(localDateKey(date));
    if (!day) continue;
    day.total += Number(sale.total);
    day.count += 1;
  }
  return days;
}
