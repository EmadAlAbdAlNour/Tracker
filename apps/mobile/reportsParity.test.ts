import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false },
  Platform: { OS: 'android', Version: 34 },
  StyleSheet: { create: (s: any) => s },
}));

import { formatReportDuration, formatReportDistance } from './i18n';

describe('Reports Formatting & Semantic Parity', () => {
  describe('formatReportDuration (Arabic)', () => {
    it('formats 0 or falsy duration as 0 دقيقة instead of 0س', () => {
      expect(formatReportDuration(0, true)).toBe('0 دقيقة');
      expect(formatReportDuration(null, true)).toBe('0 دقيقة');
      expect(formatReportDuration(undefined, true)).toBe('0 دقيقة');
      expect(formatReportDuration(NaN, true)).toBe('0 دقيقة');
    });

    it('formats durations under 60 minutes as minutes without truncation', () => {
      expect(formatReportDuration(13, true)).toBe('13 دقيقة');
      expect(formatReportDuration(45, true)).toBe('45 دقيقة');
      expect(formatReportDuration(1, true)).toBe('1 دقيقة');
    });

    it('formats exact hour counts as hours', () => {
      expect(formatReportDuration(60, true)).toBe('1 ساعة');
      expect(formatReportDuration(120, true)).toBe('2 ساعة');
      expect(formatReportDuration(372 * 60, true)).toBe('372 ساعة');
    });

    it('formats hours and minutes accurately', () => {
      expect(formatReportDuration(85, true)).toBe('1س 25د');
      expect(formatReportDuration(150, true)).toBe('2س 30د');
    });
  });

  describe('formatReportDuration (English)', () => {
    it('formats 0 or falsy duration as 0m', () => {
      expect(formatReportDuration(0, false)).toBe('0m');
      expect(formatReportDuration(null, false)).toBe('0m');
      expect(formatReportDuration(undefined, false)).toBe('0m');
      expect(formatReportDuration(NaN, false)).toBe('0m');
    });

    it('formats durations under 60 minutes as minutes', () => {
      expect(formatReportDuration(13, false)).toBe('13m');
      expect(formatReportDuration(45, false)).toBe('45m');
    });

    it('formats exact hour counts as hours', () => {
      expect(formatReportDuration(60, false)).toBe('1h');
      expect(formatReportDuration(372 * 60, false)).toBe('372h');
    });

    it('formats hours and minutes accurately', () => {
      expect(formatReportDuration(85, false)).toBe('1h 25m');
    });
  });

  describe('formatReportDistance', () => {
    it('formats 0 meters as 0.0 with proper localized unit', () => {
      expect(formatReportDistance(0, true)).toBe('0.0 كم');
      expect(formatReportDistance(null, true)).toBe('0.0 كم');
      expect(formatReportDistance(undefined, true)).toBe('0.0 كم');
      expect(formatReportDistance(0, false)).toBe('0.0 km');
    });

    it('converts meters to kilometers with 1 decimal place', () => {
      expect(formatReportDistance(7600, true)).toBe('7.6 كم');
      expect(formatReportDistance(7600, false)).toBe('7.6 km');
      expect(formatReportDistance(1234, true)).toBe('1.2 كم');
    });
  });

  describe('Canonical Reports Contract Fields', () => {
    it('validates canonical summary and driver payload contract', () => {
      const mockSummary = {
        from: '2026-10-02T00:00:00.000Z',
        to: '2026-10-02T23:59:59.999Z',
        totalShifts: 1,
        totalDistanceMeters: 7600,
        totalDurationMinutes: 85,
        movingDurationMinutes: 30,
        restaurantDurationMinutes: 45,
        stoppedDurationMinutes: 10,
        alertCount: 2,
      };

      const mockDriver = {
        driverId: 'drv-1',
        driverName: 'Emad',
        employeeId: 'EMP-001',
        shiftCount: 1,
        totalDistanceMeters: 7600,
        totalDurationMinutes: 85,
        movingDurationMinutes: 30,
        restaurantDurationMinutes: 45,
        stoppedDurationMinutes: 10,
        alertCount: 2,
      };

      // Summary checks
      expect(mockSummary.totalShifts).toBe(1);
      expect(formatReportDistance(mockSummary.totalDistanceMeters, true)).toBe('7.6 كم');
      expect(formatReportDuration(mockSummary.totalDurationMinutes, true)).toBe('1س 25د');
      expect(formatReportDuration(mockSummary.movingDurationMinutes, true)).toBe('30 دقيقة');
      expect(formatReportDuration(mockSummary.restaurantDurationMinutes, true)).toBe('45 دقيقة');
      expect(mockSummary.alertCount).toBe(2);

      // Driver breakdown checks
      expect(mockDriver.driverName).toBe('Emad');
      expect(mockDriver.shiftCount).toBe(1);
      expect(formatReportDistance(mockDriver.totalDistanceMeters, false)).toBe('7.6 km');
      expect(formatReportDuration(mockDriver.totalDurationMinutes, false)).toBe('1h 25m');
      expect(formatReportDuration(mockDriver.restaurantDurationMinutes, false)).toBe('45m');
    });
  });
});
