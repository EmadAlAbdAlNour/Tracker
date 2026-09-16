import { describe, expect, it } from 'vitest';
import { resolveHomeRoute } from './roleRouting';
import { normalizeNetworkStatus } from './telemetry';
import { isAllowedRole, isValidSession } from './session';

describe('mobile role routing', () => {
  it('routes drivers to the driver home screen', () => {
    expect(resolveHomeRoute('DRIVER')).toBe('DriverHome');
  });

  it('routes admin to AdminHome and call-center accounts to CallCenterHome', () => {
    expect(resolveHomeRoute('ADMIN')).toBe('AdminHome');
    expect(resolveHomeRoute('CALL_CENTER')).toBe('CallCenterHome');
  });
});

describe('mobile session hardening', () => {
  it('accepts only canonical session payloads', () => {
    expect(
      isValidSession({
        accessToken: 'abc',
        refreshToken: 'def',
        user: {
          id: 'u-1',
          name: 'Driver User',
          email: 'driver@example.com',
          phone: null,
          role: 'DRIVER',
          active: true,
        },
      })
    ).toBe(true);

    expect(isAllowedRole('MANAGER')).toBe(false);
    expect(
      isValidSession({
        accessToken: '',
        refreshToken: 'def',
        user: {
          id: 'u-1',
          name: 'Driver User',
          email: 'driver@example.com',
          phone: null,
          role: 'DRIVER',
          active: true,
        },
      })
    ).toBe(false);
  });

  it('normalizes network states for telemetry payloads', () => {
    expect(normalizeNetworkStatus('wifi', true)).toBe('wifi');
    expect(normalizeNetworkStatus('cellular', true)).toBe('cellular');
    expect(normalizeNetworkStatus(null, false)).toBe('offline');
    expect(normalizeNetworkStatus(undefined, true)).toBe('unknown');
  });
});

describe('mobile i18n & Western ASCII digits', () => {
  it('formats numbers with ASCII Western digits 0-9', async () => {
    const { formatWesternNumber, t } = await import('./i18n');
    expect(formatWesternNumber(1234.5)).toBe('1,234.5');
    expect(formatWesternNumber('١٢٣٤')).toBe('1,234');
    expect(formatWesternNumber(0)).toBe('0');
  });

  it('translates admin, callCenter, driver, and map keys properly', async () => {
    const { t } = await import('./i18n');
    expect(t('admin.dashboard')).toBeTruthy();
    expect(t('admin.map')).toBeTruthy();
    expect(t('admin.devices')).toBeTruthy();
    expect(t('admin.settings')).toBeTruthy();
    expect(t('admin.users')).toBeTruthy();
    expect(t('callCenter.readOnlyBadge')).toBeTruthy();
    expect(t('driverStates.TRACKING_ACTIVE')).toBeTruthy();
    expect(t('driverStates.OFF_DUTY')).toBeTruthy();
    expect(t('map.centerRestaurant')).toBeTruthy();
  });
});

