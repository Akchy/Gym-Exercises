import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isISODate, parseISODate, startOfWeek, toISODate, weekdayOf } from '../../src/core/dates';
import { formatWeight, fromDisplayWeight, kgToLb, lbToKg, round, toDisplayWeight } from '../../src/core/units';

describe('dates', () => {
  it('formats local dates', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('validates ISO dates strictly', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-2-3')).toBe(false);
    expect(isISODate(20260101)).toBe(false);
  });
  it('parses and rejects', () => {
    expect(parseISODate('2026-10-27').getDate()).toBe(27);
    expect(() => parseISODate('nope')).toThrow('Invalid date');
  });
  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('uses Monday-based weekdays', () => {
    expect(weekdayOf('2026-10-26')).toBe(0); // Monday
    expect(weekdayOf('2026-11-01')).toBe(6); // Sunday
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26');
    expect(startOfWeek('2026-10-26')).toBe('2026-10-26');
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-10-31', '2026-10-01')).toBe(-30);
  });
});

describe('units', () => {
  it('converts kg and lb', () => {
    expect(round(kgToLb(100), 2)).toBe(220.46);
    expect(round(lbToKg(220.462), 1)).toBe(100);
  });
  it('rounds', () => {
    expect(round(1.26)).toBe(1.3);
    expect(round(1.234, 2)).toBe(1.23);
  });
  it('converts for display', () => {
    expect(toDisplayWeight(50, 'kg')).toBe(50);
    expect(toDisplayWeight(50, 'lb')).toBe(110.2);
    expect(fromDisplayWeight(50, 'kg')).toBe(50);
    expect(round(fromDisplayWeight(110.23, 'lb'))).toBe(50);
    expect(formatWeight(20, 'kg')).toBe('20 kg');
    expect(formatWeight(20, 'lb')).toBe('44.1 lb');
  });
});
