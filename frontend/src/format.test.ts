import { describe, expect, it } from 'vitest';
import {
  axisDayLabel,
  formatDate,
  formatDateTime,
  formatLeadHours,
  formatMW,
  formatPct,
  formatSignedMW,
  formatTime,
  shortLabel,
} from './format';

describe('format.ts unit tests', () => {
  describe('formatMW', () => {
    it('formats positive integers with MW unit and thousands separators', () => {
      expect(formatMW(15228)).toBe('15,228 MW');
      expect(formatMW(0)).toBe('0 MW');
    });

    it('supports specified decimal places', () => {
      expect(formatMW(1906.57, 1)).toBe('1,906.6 MW');
      expect(formatMW(1906.57, 2)).toBe('1,906.57 MW');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatMW(null)).toBe('—');
      expect(formatMW(undefined)).toBe('—');
    });
  });

  describe('formatSignedMW', () => {
    it('prepends + for positive values and - for negative values', () => {
      expect(formatSignedMW(1692.47)).toBe('+1,692 MW');
      expect(formatSignedMW(-843.3)).toBe('-843 MW');
    });

    it('does not prepend + for zero', () => {
      expect(formatSignedMW(0)).toBe('0 MW');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatSignedMW(null)).toBe('—');
      expect(formatSignedMW(undefined)).toBe('—');
    });
  });

  describe('formatPct', () => {
    it('formats percentages to default 1 decimal place', () => {
      expect(formatPct(16.9)).toBe('16.9%');
      expect(formatPct(100)).toBe('100.0%');
    });

    it('supports custom decimal precision', () => {
      expect(formatPct(16.904, 2)).toBe('16.90%');
      expect(formatPct(16.904, 0)).toBe('17%');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatPct(null)).toBe('—');
      expect(formatPct(undefined)).toBe('—');
    });
  });

  describe('formatLeadHours', () => {
    it('formats lead time with 1 decimal place and h unit', () => {
      expect(formatLeadHours(12.5)).toBe('12.5 h');
      expect(formatLeadHours(4)).toBe('4.0 h');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatLeadHours(null)).toBe('—');
      expect(formatLeadHours(undefined)).toBe('—');
    });
  });

  describe('Date and time formatters (Europe/London timezone)', () => {
    const testISO = '2026-01-12T01:00:00Z';

    it('formatDateTime formats date and time in London timezone', () => {
      expect(formatDateTime(testISO)).toBe('12 Jan 2026, 01:00');
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
      expect(formatDateTime('')).toBe('—');
    });

    it('formatDate formats only date', () => {
      expect(formatDate(testISO)).toBe('12 Jan 2026');
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('')).toBe('—');
    });

    it('formatTime formats only 24h time', () => {
      expect(formatTime(testISO)).toBe('01:00');
      expect(formatTime(null)).toBe('—');
      expect(formatTime(undefined)).toBe('—');
      expect(formatTime('')).toBe('—');
    });

    it('shortLabel formats for chart hover/tooltips', () => {
      expect(shortLabel('2026-01-02T14:30:00Z')).toBe('02 Jan 14:30');
      expect(shortLabel('')).toBe('');
    });

    it('axisDayLabel formats for chart axis ticks', () => {
      expect(axisDayLabel('2026-01-02T14:30:00Z')).toBe('02 Jan');
      expect(axisDayLabel('')).toBe('');
    });
  });
});
