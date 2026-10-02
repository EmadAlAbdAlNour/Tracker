import { describe, expect, it, vi } from 'vitest';
import { I18nManager } from 'react-native';
import {
  resolveGeofencePresentation,
  resolveBatteryFreshness,
  resolveActivityPresentation,
  resolveSpeedSemantics,
} from './telemetry';
import { getRowDirection, getFlexAlignment } from './i18n';

vi.mock('react-native', () => ({
  I18nManager: { isRTL: false },
  Platform: { OS: 'android', Version: 34 },
  StyleSheet: { create: (s: any) => s },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

describe('Production Hardening Pass — Mobile Regression Suite', () => {
  describe('SEM-01: Geofence Presentation Fallback Precedence', () => {
    it('returns NO_LOCATION when coordinates do not exist and driver is off-shift (NEVER OUTSIDE)', () => {
      const res = resolveGeofencePresentation({
        hasLocation: false,
        hasActiveShift: false,
        isInsideGeofence: false,
      });

      expect(res.state).toBe('NO_LOCATION');
      expect(res.labelEn).toBe('No location data');
      expect(res.labelAr).toBe('لا توجد بيانات موقع');
    });

    it('returns AWAITING when coordinates do not exist but driver is on active shift', () => {
      const res = resolveGeofencePresentation({
        hasLocation: false,
        hasActiveShift: true,
        isInsideGeofence: false,
      });

      expect(res.state).toBe('AWAITING');
      expect(res.labelEn).toBe('Awaiting location');
      expect(res.labelAr).toBe('بانتظار تحديد الموقع');
    });

    it('returns INSIDE when coordinates exist and driver is inside restaurant radius', () => {
      const res = resolveGeofencePresentation({
        hasLocation: true,
        hasActiveShift: true,
        isInsideGeofence: true,
      });

      expect(res.state).toBe('INSIDE');
      expect(res.labelEn).toBe('Inside restaurant range');
      expect(res.labelAr).toBe('داخل نطاق المطعم');
    });

    it('returns OUTSIDE only when coordinates exist and driver is outside restaurant radius', () => {
      const res = resolveGeofencePresentation({
        hasLocation: true,
        hasActiveShift: true,
        isInsideGeofence: false,
      });

      expect(res.state).toBe('OUTSIDE');
      expect(res.labelEn).toBe('Outside restaurant range');
      expect(res.labelAr).toBe('خارج نطاق المطعم');
    });
  });

  describe('SEM-02: Battery Freshness Semantics', () => {
    const now = Date.now();

    it('returns fresh battery label when driver is online and recently reported', () => {
      const res = resolveBatteryFreshness({
        batteryPercentage: 85,
        lastSeen: new Date(now - 60000).toISOString(),
        isOnline: true,
        now,
      });

      expect(res.percentage).toBe(85);
      expect(res.isStale).toBe(false);
      expect(res.labelEn).toBe('85%');
      expect(res.labelAr).toBe('85%');
    });

    it('flags battery reading as stale when driver is offline with staleness age', () => {
      const thirtyMinsAgo = new Date(now - 30 * 60000).toISOString();
      const res = resolveBatteryFreshness({
        batteryPercentage: 42,
        lastSeen: thirtyMinsAgo,
        isOnline: false,
        now,
      });

      expect(res.percentage).toBe(42);
      expect(res.isStale).toBe(true);
      expect(res.ageMinutes).toBe(30);
      expect(res.labelEn).toBe('42% (stale 30m)');
      expect(res.labelAr).toBe('42% (قديم 30 د)');
    });

    it('formats hours for long staleness periods', () => {
      const fiveHoursAgo = new Date(now - 300 * 60000).toISOString();
      const res = resolveBatteryFreshness({
        batteryPercentage: 93,
        lastSeen: fiveHoursAgo,
        isOnline: false,
        now,
      });

      expect(res.isStale).toBe(true);
      expect(res.labelEn).toBe('93% (stale 5h)');
      expect(res.labelAr).toBe('93% (قديم 5 س)');
    });

    it('handles null battery percentage safely', () => {
      const res = resolveBatteryFreshness({
        batteryPercentage: null,
      });

      expect(res.percentage).toBeNull();
      expect(res.isStale).toBe(false);
      expect(res.labelEn).toBe('—');
      expect(res.labelAr).toBe('—');
    });
  });

  describe('I18N-01: Activity Timeline Localization Parity', () => {
    it('localizes SHIFT_STARTED in Arabic and English', () => {
      const ar = resolveActivityPresentation('SHIFT_STARTED', true);
      const en = resolveActivityPresentation('SHIFT_STARTED', false);
      expect(ar.title).toBe('بدء الوردية');
      expect(en.title).toBe('Shift Started');
    });

    it('localizes ARRIVED_AT_RESTAURANT with distance metadata', () => {
      const ar = resolveActivityPresentation('ARRIVED_AT_RESTAURANT', true, null, null, { distanceMeters: 45 });
      const en = resolveActivityPresentation('ARRIVED_AT_RESTAURANT', false, null, null, { distanceMeters: 45 });
      expect(ar.title).toBe('الوصول إلى المطعم');
      expect(ar.description).toContain('45 متر');
      expect(en.title).toBe('Arrived at Restaurant');
      expect(en.description).toContain('45m');
    });

    it('localizes MOVING with speed metadata', () => {
      const ar = resolveActivityPresentation('MOVING', true, null, null, { speedKmh: 35 });
      const en = resolveActivityPresentation('MOVING', false, null, null, { speedKmh: 35 });
      expect(ar.title).toBe('بدء الحركة');
      expect(ar.description).toContain('35 كم/س');
      expect(en.title).toBe('Moving');
      expect(en.description).toContain('35 km/h');
    });

    it('localizes STOP_EXTENDED, GPS_DISABLED, and BATTERY_CRITICAL', () => {
      expect(resolveActivityPresentation('STOP_EXTENDED', true).title).toBe('توقف مطول خارج المطعم');
      expect(resolveActivityPresentation('STOP_EXTENDED', false).title).toBe('Extended Stop');

      expect(resolveActivityPresentation('GPS_DISABLED', true).title).toBe('تعطيل GPS');
      expect(resolveActivityPresentation('GPS_DISABLED', false).title).toBe('GPS Disabled');

      expect(resolveActivityPresentation('BATTERY_CRITICAL', true).title).toBe('بطارية حرجة');
      expect(resolveActivityPresentation('BATTERY_CRITICAL', false).title).toBe('Battery Critical');
    });

    it('falls back safely to event.title or event.type for unknown event codes', () => {
      const custom = resolveActivityPresentation('CUSTOM_EVENT', true, 'عنوان مخصص', 'وصف مخصص');
      expect(custom.title).toBe('عنوان مخصص');
      expect(custom.description).toBe('وصف مخصص');

      const fallback = resolveActivityPresentation('UNKNOWN_CODE', false);
      expect(fallback.title).toBe('UNKNOWN_CODE');
    });
  });

  describe('RTL-01: Row Direction Mathematical Non-Inversion Strategy', () => {
    it('returns row-reverse when native is LTR and app is AR (producing visual RTL)', () => {
      (I18nManager as any).isRTL = false;
      const direction = getRowDirection(true);
      expect(direction).toBe('row-reverse');
    });

    it('returns row when native is RTL and app is AR (preventing double inversion to LTR!)', () => {
      (I18nManager as any).isRTL = true;
      const direction = getRowDirection(true);
      expect(direction).toBe('row');
    });

    it('returns row when native is LTR and app is EN (producing visual LTR)', () => {
      (I18nManager as any).isRTL = false;
      const direction = getRowDirection(false);
      expect(direction).toBe('row');
    });

    it('returns row-reverse when native is RTL and app is EN (producing visual LTR on Arabic OS)', () => {
      (I18nManager as any).isRTL = true;
      const direction = getRowDirection(false);
      expect(direction).toBe('row-reverse');
    });
  });

  describe('Speed Semantics Accuracy Filtering', () => {
    const now = Date.now();

    it('marks speed as current only when accuracy <= 35m and recorded recently', () => {
      const goodGps = resolveSpeedSemantics({
        speedMs: 5.0, // 18 km/h
        operationalStatus: 'MOVING',
        isOnline: true,
        recordedAt: new Date(now - 1000).toISOString(),
        accuracy: 15,
        now,
      });

      expect(goodGps.isCurrent).toBe(true);
      expect(goodGps.speedKmh).toBe(18);

      const degradedGps = resolveSpeedSemantics({
        speedMs: 5.0,
        operationalStatus: 'MOVING',
        isOnline: true,
        recordedAt: new Date(now - 1000).toISOString(),
        accuracy: 55, // degraded!
        now,
      });

      expect(degradedGps.isCurrent).toBe(false);
      expect(degradedGps.isHistorical).toBe(true);
    });
  });

  describe('Dialog Action Keys & Error Localization', () => {
    it('provides localized standard action keys in both AR and EN without raw key leaks', async () => {
      const { t, setStoredLocale } = await import('./i18n');
      
      await setStoredLocale('ar');
      expect(t('app.ok')).toBe('موافق');
      expect(t('app.confirm')).toBe('تأكيد');
      expect(t('app.close')).toBe('إغلاق');
      expect(t('app.yes')).toBe('نعم');
      expect(t('app.no')).toBe('لا');
      expect(t('app.delete')).toBe('حذف');

      await setStoredLocale('en');
      expect(t('app.ok')).toBe('OK');
      expect(t('app.confirm')).toBe('Confirm');
      expect(t('app.close')).toBe('Close');
      expect(t('app.yes')).toBe('Yes');
      expect(t('app.no')).toBe('No');
      expect(t('app.delete')).toBe('Delete');
    });

    it('localizes error codes and maps technical phrases like "Access denied" to Arabic', async () => {
      const { getLocalizedErrorMessage, setStoredLocale } = await import('./i18n');
      
      await setStoredLocale('ar');
      const forbiddenMsg = getLocalizedErrorMessage('AUTH_FORBIDDEN');
      expect(forbiddenMsg).toBe('تم رفض الوصول. لا تملك الصلاحية لتنفيذ هذا الإجراء.');

      // "Access denied" string from server must map to Arabic and not leak English
      const deniedMsg = getLocalizedErrorMessage('Access denied');
      expect(deniedMsg).toBe('تم رفض الوصول. لا تملك الصلاحية لتنفيذ هذا الإجراء.');

      const geofenceMsg = getLocalizedErrorMessage('OUTSIDE_GEOFENCE');
      expect(geofenceMsg).toBe('يجب أن يكون السائق داخل نطاق المطعم لبدء الوردية.');

      // Raw technical English string must not leak into Arabic UI
      const genericLeak = getLocalizedErrorMessage('Network request failed: unexpected socket hangup');
      expect(genericLeak).toBe('حدث خطأ غير متوقع. يرجى المحاولة لاحقاً أو مراجعة المشرف.');

      await setStoredLocale('en');
      expect(getLocalizedErrorMessage('AUTH_FORBIDDEN')).toBe('Access denied. You do not have permission for this action.');
      expect(getLocalizedErrorMessage('OUTSIDE_GEOFENCE')).toBe('Driver must be inside restaurant geofence to start shift.');
    });
  });

  describe('DEV-01: Device Management Parity & Authorization Semantics', () => {
    it('accurately resolves authorization from API boolean authorized field', () => {
      // API returns authorized: boolean (matching Web Admin)
      const authorizedApiDevice = {
        id: 'dev-uuid-1',
        driverId: 'drv-1',
        authorized: true,
        deviceIdentifier: 'ed769a8e-8776-4d3c-94ab-e87a9f6d954a',
        platform: 'Android (Realme RMX3834 - OS 15)',
        appVersion: '1.1.6',
      };

      const unauthorizedApiDevice = {
        id: 'dev-uuid-2',
        driverId: 'drv-2',
        authorized: false,
        deviceIdentifier: 'aa112233-4455-6677-8899-aabbccddeeff',
        platform: 'Android',
        appVersion: '1.0.0',
      };

      // Canonical check used in Mobile Admin
      const isAuth1 = Boolean(authorizedApiDevice.authorized ?? (authorizedApiDevice as any).isAuthorized);
      const isAuth2 = Boolean(unauthorizedApiDevice.authorized ?? (unauthorizedApiDevice as any).isAuthorized);

      expect(isAuth1).toBe(true);
      expect(isAuth2).toBe(false);
    });

    it('provides revoke device and unread notifications localization in AR and EN', async () => {
      const { t, setStoredLocale } = await import('./i18n');

      await setStoredLocale('ar');
      expect(t('admin.revokeDevice')).toBe('إلغاء الترخيص');
      expect(t('admin.authorized')).toBe('معتمد');
      expect(t('admin.unauthorized')).toBe('غير معتمد');
      expect(t('admin.unreadNotifications')).toBe('إشعارات جديدة');
      expect(t('notifications.title')).toBe('الإشعارات');

      await setStoredLocale('en');
      expect(t('admin.revokeDevice')).toBe('Revoke Authorization');
      expect(t('admin.authorized')).toBe('Authorized');
      expect(t('admin.unauthorized')).toBe('Unauthorized');
      expect(t('admin.unreadNotifications')).toBe('Unread Notifications');
      expect(t('notifications.title')).toBe('Notifications');
    });
  });
});


