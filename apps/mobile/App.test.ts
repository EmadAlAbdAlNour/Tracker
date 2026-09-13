import { describe, expect, it } from 'vitest';
import { resolveHomeRoute } from './roleRouting';
import { normalizeNetworkStatus } from './telemetry';
import { isAllowedRole, isValidSession } from './session';

describe('mobile role routing', () => {
  it('routes drivers to the driver home screen', () => {
    expect(resolveHomeRoute('DRIVER')).toBe('DriverHome');
  });

  it('routes admin and call-center accounts to the operations home screen', () => {
    expect(resolveHomeRoute('ADMIN')).toBe('OperatorHome');
    expect(resolveHomeRoute('CALL_CENTER')).toBe('OperatorHome');
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
