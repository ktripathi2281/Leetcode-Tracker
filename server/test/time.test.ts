import { describe, expect, it } from 'vitest';
import { isValidTimeZone, startOfNextLocalDay } from '../src/lib/time.js';

describe('startOfNextLocalDay', () => {
  it('is the next UTC midnight in UTC', () => {
    expect(startOfNextLocalDay(new Date('2026-09-26T10:00:00Z'), 'UTC').toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('follows the local calendar ahead of UTC (India, +5:30)', () => {
    // 20:00 UTC is already 01:30 on the 27th in India, so the next day starts at midnight on the 28th.
    expect(startOfNextLocalDay(new Date('2026-09-26T20:00:00Z'), 'Asia/Kolkata').toISOString()).toBe(
      '2026-09-27T18:30:00.000Z',
    );
  });

  it('follows the local calendar behind UTC (New York, -4 in summer)', () => {
    // 02:00 UTC on the 26th is still 22:00 on the 25th in New York.
    expect(startOfNextLocalDay(new Date('2026-09-26T02:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-09-26T04:00:00.000Z',
    );
  });

  it('handles the end of a month and year', () => {
    expect(startOfNextLocalDay(new Date('2026-12-31T12:00:00Z'), 'UTC').toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
