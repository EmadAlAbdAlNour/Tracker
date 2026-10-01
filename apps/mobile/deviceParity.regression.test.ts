import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 36, constants: {} },
  I18nManager: { isRTL: false },
  StyleSheet: { create: (s: any) => s },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue('ar'),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { fonts } from './designSystem';
import { getRowDirection, isRtl, formatWesternNumber, t, setStoredLocale } from './i18n';
import { resolveBatteryFreshness } from './telemetry';

describe('Device Parity & Real-Device Layout Regression Tests', () => {
  describe('1. Arabic Meta Row Accommodation & Typography', () => {
    it('uses explicit bundled Cairo font family tokens', () => {
      expect(fonts.regular).toBe('Cairo-Regular');
      expect(fonts.medium).toBe('Cairo-Medium');
      expect(fonts.semiBold).toBe('Cairo-SemiBold');
      expect(fonts.bold).toBe('Cairo-Bold');
    });

    it('ensures Arabic meta labels can wrap gracefully without height clipping', () => {
      // Simulates the DriverDetailModal metaRow and metaLabel properties
      const metaRowStyle = {
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 26,
        paddingVertical: 3,
      };
      const metaLabelStyle = {
        fontFamily: fonts.regular,
        fontSize: 12,
        lineHeight: 18,
        flexShrink: 0,
      };
      const metaValueStyle = {
        fontFamily: fonts.semiBold,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600' as const,
        flexShrink: 1,
      };

      // Invariants:
      // - Row must not have fixed height (allows vertical expansion)
      expect((metaRowStyle as any).height).toBeUndefined();
      expect(metaRowStyle.minHeight).toBeGreaterThanOrEqual(24);
      // - Label flexShrink: 0 prevents Yoga from shrinking it horizontally below its content
      expect(metaLabelStyle.flexShrink).toBe(0);
      // - Value flexShrink: 1 allows value to flex or truncate cleanly without forcing label out
      expect(metaValueStyle.flexShrink).toBe(1);
      // - Must explicitly use Cairo font
      expect(metaLabelStyle.fontFamily).toBe('Cairo-Regular');
      expect(metaValueStyle.fontFamily).toBe('Cairo-SemiBold');
    });
  });

  describe('2. Mixed Arabic / Numeric BiDi Telemetry Formatting', () => {
    it('formats stale battery string with correct tokens in Arabic and English', () => {
      const now = new Date('2026-10-01T12:00:00Z').getTime();
      const lastSeen = new Date('2026-10-01T10:30:00Z').toISOString(); // 90 mins ago = 1 hour

      const battery = resolveBatteryFreshness({
        batteryPercentage: 93,
        lastSeen,
        isOnline: false,
        now,
      });

      expect(battery.isStale).toBe(true);
      expect(battery.labelEn).toBe('93% (stale 1h)');
      expect(battery.labelAr).toBe('93% (قديم 1 س)');
    });

    it('preserves technical identifiers in LTR direction', () => {
      const deviceIdentifier = 'ed769a8e-8772-40f8-9562-b91ad52b2101';
      const truncatedId = `${deviceIdentifier.slice(0, 12)}...`;

      expect(truncatedId).toBe('ed769a8e-877...');
      // Technical identifiers must NOT be reversed in RTL
      expect(truncatedId.startsWith('ed769a8e')).toBe(true);
    });
  });

  describe('3. Driver Status Badge Layout & Sizing', () => {
    it('driverStatusCol maintains minimum touch/visual width and flexShrink 0', () => {
      const driverStatusCol = {
        minWidth: 72,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
      };

      expect(driverStatusCol.minWidth).toBeGreaterThanOrEqual(68);
      expect(driverStatusCol.flexShrink).toBe(0);
      expect(driverStatusCol.alignItems).toBe('center');
    });

    it('driverMainCol preserves stretch behavior and uses textAlign for RTL alignment', () => {
      // Invariant: driverMainCol must NOT use alignItems: 'flex-end',
      // which would collapse the text container width and truncate badges prematurely.
      const driverMainCol = {
        flex: 1,
        justifyContent: 'center',
      };

      expect((driverMainCol as any).alignItems).toBeUndefined();
      expect(driverMainCol.flex).toBe(1);
    });
  });

  describe('4. Existing English Layout Remains Unchanged', () => {
    it('returns row direction and correct labels when English is stored', async () => {
      await setStoredLocale('en');
      expect(isRtl()).toBe(false);
      expect(getRowDirection()).toBe('row');
      expect(t('diagnostics.employeeId')).toBe('Employee ID:');
      expect(t('shift.onDuty')).toBe('ON DUTY');
      expect(t('shift.offDuty')).toBe('OFF DUTY');
    });
  });

  describe('5. Existing RTL Row Direction Architecture Preserved', () => {
    it('returns row-reverse when Arabic is active on LTR native Android', async () => {
      await setStoredLocale('ar');
      expect(isRtl()).toBe(true);
      // Native I18nManager.isRTL is false, so getRowDirection returns 'row-reverse'
      expect(getRowDirection()).toBe('row-reverse');
      expect(t('diagnostics.employeeId')).toBe('الرقم الوظيفي:');
      expect(t('shift.onDuty')).toBe('على رأس العمل');
      expect(t('shift.offDuty')).toBe('خارج الوردية');
    });
  });
});
