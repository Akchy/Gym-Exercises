import type { Weekday } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the user's clock). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

export function parseISODate(value: string): Date {
  if (!isISODate(value)) throw new Error(`Invalid date: ${value}`);
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(isoDate: string, days: number): string {
  const d = parseISODate(isoDate);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Monday-based weekday index. */
export function weekdayOf(isoDate: string): Weekday {
  return ((parseISODate(isoDate).getDay() + 6) % 7) as Weekday;
}

export function startOfWeek(isoDate: string): string {
  return addDays(isoDate, -weekdayOf(isoDate));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}
