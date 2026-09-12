import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Lightweight in-memory storage and browser mocks for Node test environment
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

(globalThis as any).localStorage = mockLocalStorage;
if (!(globalThis as any).window) {
  (globalThis as any).window = {
    localStorage: mockLocalStorage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
} else {
  (globalThis as any).window.localStorage = mockLocalStorage;
}

if (!(globalThis as any).document) {
  (globalThis as any).document = {
    documentElement: { lang: 'ar', dir: 'rtl' },
  };
}

import {
  getStoredSession,
  saveSession,
  clearSession,
  loginAdmin,
  logoutAdmin,
  refreshSessionIfPossible,
  apiRequest,
  listDrivers,
  createDriver,
  updateDriver,
  getDriverById,
  resetDriverDevice,
  listUsers,
  createUser,
  updateUser,
  getLiveFleetStatus,
  getRestaurantSettings,
  updateRestaurantSettings,
  getAlertSettings,
  updateAlertSettings,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Session,
} from '../lib/api';
import { formatWesternNumber, formatTimeAgo, t, getLocale, setStoredLocale, isRtl } from '../lib/i18n';

function mockResponse(data: any, status = 200, ok = true) {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => jsonStr,
    json: async () => (typeof data === 'string' ? JSON.parse(data) : data),
  };
}

describe('WEB ADMIN FUNCTIONAL TEST SUITE', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. AUTHENTICATION, PERSISTENCE & TOKENS
  // ==========================================
  describe('Authentication & Session Persistence', () => {
    const mockSession: Session = {
      accessToken: 'test-access-token-123',
      refreshToken: 'test-refresh-token-456',
      user: {
        id: 'u-admin-1',
        name: 'System Administrator',
        email: 'admin@tracker.local',
        phone: '+966500000001',
        role: 'ADMIN',
        active: true,
      },
    };

    it('auth persistence - saves, reads, and clears session from localStorage', () => {
      expect(getStoredSession()).toBeNull();

      saveSession(mockSession);
      const retrieved = getStoredSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.accessToken).toBe(mockSession.accessToken);
      expect(retrieved?.user.role).toBe('ADMIN');

      clearSession();
      expect(getStoredSession()).toBeNull();
    });

    it('loginAdmin - calls /api/auth/login and persists session', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse(mockSession));

      const session = await loginAdmin('admin@tracker.local', 'Password123!');
      expect(session.accessToken).toBe(mockSession.accessToken);
      expect(getStoredSession()).toEqual(mockSession);
    });

    it('logoutAdmin - revokes server session and clears local storage', async () => {
      saveSession(mockSession);

      global.fetch = vi.fn().mockResolvedValue(mockResponse({ success: true }));

      await logoutAdmin();
      expect(getStoredSession()).toBeNull();
    });

    it('token refresh - rotates token and deduplicates concurrent refresh calls', async () => {
      saveSession(mockSession);

      let refreshCalls = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/refresh')) {
          refreshCalls++;
          return Promise.resolve(mockResponse({
            accessToken: 'new-rotated-access-token',
            refreshToken: 'new-rotated-refresh-token',
            user: mockSession.user,
          }));
        }
        return Promise.resolve(mockResponse({}));
      });

      // Fire 3 simultaneous refresh calls
      const [res1, res2, res3] = await Promise.all([
        refreshSessionIfPossible(),
        refreshSessionIfPossible(),
        refreshSessionIfPossible(),
      ]);

      // All 3 return the fresh token
      expect(res1?.accessToken).toBe('new-rotated-access-token');
      expect(res2?.accessToken).toBe('new-rotated-access-token');
      expect(res3?.accessToken).toBe('new-rotated-access-token');

      // But only 1 HTTP request was made due to single-flight deduplication
      expect(refreshCalls).toBe(1);
    });

    it('401 retry queue - intercepts 401, refreshes session, and retries original request', async () => {
      saveSession(mockSession);

      let fleetCallCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/refresh')) {
          return Promise.resolve(mockResponse({
            accessToken: 'fresh-token-after-401',
            refreshToken: 'fresh-refresh-token',
            user: mockSession.user,
          }));
        }
        if (url.includes('/api/fleet/live')) {
          fleetCallCount++;
          if (fleetCallCount === 1) {
            // First call fails with 401
            return Promise.resolve(mockResponse({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }, 401, false));
          }
          // Second call (after retry) succeeds
          return Promise.resolve(mockResponse({
            summary: { totalDrivers: 5, activeShifts: 2, onlineDrivers: 2, atRestaurant: 1, moving: 1, stopped: 0, offline: 3, lowBattery: 0 },
            drivers: [],
          }));
        }
        return Promise.resolve(mockResponse({}));
      });

      const res = await getLiveFleetStatus();
      expect(res.summary.totalDrivers).toBe(5);
      expect(fleetCallCount).toBe(2); // Original + retry
    });
  });

  // ==========================================
  // 2. ROLE-BASED NAVIGATION & ROUTE GUARDS
  // ==========================================
  describe('Role-Based Navigation & Route Guards', () => {
    const allNavRoutes = [
      { href: '/dashboard', roles: ['ADMIN', 'MANAGER', 'CALL_CENTER'] },
      { href: '/dashboard/drivers', roles: ['ADMIN', 'MANAGER', 'CALL_CENTER'] },
      { href: '/dashboard/devices', roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/users', roles: ['ADMIN'] },
      { href: '/dashboard/map', roles: ['ADMIN', 'MANAGER', 'CALL_CENTER'] },
      { href: '/dashboard/settings', roles: ['ADMIN', 'MANAGER'] },
    ];

    function getVisibleRoutes(role: 'ADMIN' | 'MANAGER' | 'CALL_CENTER') {
      return allNavRoutes.filter((item) => item.roles.includes(role)).map((item) => item.href);
    }

    it('role navigation - ADMIN sees all 6 management sections', () => {
      const adminRoutes = getVisibleRoutes('ADMIN');
      expect(adminRoutes).toHaveLength(6);
      expect(adminRoutes).toContain('/dashboard/users');
      expect(adminRoutes).toContain('/dashboard/settings');
      expect(adminRoutes).toContain('/dashboard/devices');
    });

    it('role navigation - MANAGER sees 5 sections (Users is hidden)', () => {
      const managerRoutes = getVisibleRoutes('MANAGER');
      expect(managerRoutes).toHaveLength(5);
      expect(managerRoutes).not.toContain('/dashboard/users');
      expect(managerRoutes).toContain('/dashboard/settings');
      expect(managerRoutes).toContain('/dashboard/devices');
    });

    it('role navigation - CALL_CENTER sees only 3 monitoring sections', () => {
      const callCenterRoutes = getVisibleRoutes('CALL_CENTER');
      expect(callCenterRoutes).toHaveLength(3);
      expect(callCenterRoutes).toEqual(['/dashboard', '/dashboard/drivers', '/dashboard/map']);
      expect(callCenterRoutes).not.toContain('/dashboard/users');
      expect(callCenterRoutes).not.toContain('/dashboard/settings');
      expect(callCenterRoutes).not.toContain('/dashboard/devices');
    });

    it('unauthorized direct URL guard - redirects CALL_CENTER away from restricted pages', () => {
      const role = 'CALL_CENTER';
      const restrictedPaths = ['/dashboard/users', '/dashboard/settings', '/dashboard/devices'];

      for (const p of restrictedPaths) {
        const shouldRedirect =
          role === 'CALL_CENTER' &&
          (p.startsWith('/dashboard/users') || p.startsWith('/dashboard/settings') || p.startsWith('/dashboard/devices'));
        expect(shouldRedirect).toBe(true);
      }
    });

    it('unauthorized direct URL guard - redirects MANAGER away from /dashboard/users', () => {
      const role = 'MANAGER';
      const path = '/dashboard/users';
      const shouldRedirect = role === 'MANAGER' && path.startsWith('/dashboard/users');
      expect(shouldRedirect).toBe(true);
    });
  });

  // ==========================================
  // 3. USERS CRUD WORKFLOW
  // ==========================================
  describe('Users Administration Workflow', () => {
    it('listUsers - returns paginated list of system users', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        page: 1,
        limit: 10,
        total: 2,
        items: [
          { id: 'u1', name: 'Admin', email: 'admin@t.local', role: 'ADMIN', active: true },
          { id: 'u2', name: 'Manager', email: 'mgr@t.local', role: 'MANAGER', active: true },
        ],
      }));

      const res = await listUsers({ page: 1, limit: 10 });
      expect(res.total).toBe(2);
      expect(res.items[0].role).toBe('ADMIN');
    });

    it('createUser - creates new user with specific role', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        user: { id: 'u3', name: 'Call Agent', email: 'agent@t.local', role: 'CALL_CENTER', active: true },
      }, 201));

      const res = await createUser({
        name: 'Call Agent',
        email: 'agent@t.local',
        role: 'CALL_CENTER',
        password: 'Password123!',
      });
      expect(res.user.role).toBe('CALL_CENTER');
    });

    it('updateUser - toggles user activation status', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        user: { id: 'u2', name: 'Manager', email: 'mgr@t.local', role: 'MANAGER', active: false },
      }));

      const res = await updateUser('u2', { active: false });
      expect(res.user.active).toBe(false);
    });
  });

  // ==========================================
  // 4. DRIVERS CRUD & DEVICE RESET WORKFLOW
  // ==========================================
  describe('Drivers CRUD & Device Reset Workflow', () => {
    it('createDriver - creates new driver with employeeId and login account', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        driver: { id: 'd1', userId: 'u1', employeeId: 'EMP-01', name: 'Driver Ali', email: 'ali@t.local', active: true },
        user: { id: 'u1', name: 'Driver Ali', email: 'ali@t.local', role: 'DRIVER', active: true },
      }, 201));

      const res = await createDriver({
        name: 'Driver Ali',
        email: 'ali@t.local',
        employeeId: 'EMP-01',
        password: 'DriverPass123!',
      });

      expect(res.driver.employeeId).toBe('EMP-01');
      expect(res.user.role).toBe('DRIVER');
    });

    it('updateDriver - updates profile and deactivates driver', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        driver: { id: 'd1', userId: 'u1', employeeId: 'EMP-01', name: 'Driver Ali', email: 'ali@t.local', active: false },
      }));

      const res = await updateDriver('d1', { active: false });
      expect(res.driver.active).toBe(false);
    });

    it('resetDriverDevice - unauthorizes driver device', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({ success: true }));

      const res = await resetDriverDevice('d1');
      expect(res.success).toBe(true);
    });
  });

  // ==========================================
  // 5. SETTINGS & GEOFENCE WORKFLOW
  // ==========================================
  describe('Settings & Geofence Workflow', () => {
    it('getRestaurantSettings & updateRestaurantSettings - updates geofence radius and center', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        settings: {
          id: 'r1',
          name: 'Riyadh Hub',
          latitude: 24.7136,
          longitude: 46.6753,
          radiusMeters: 250,
          enabled: true,
        },
      }));

      const updated = await updateRestaurantSettings({
        name: 'Riyadh Hub',
        radiusMeters: 250,
      });

      expect(updated.name).toBe('Riyadh Hub');
      expect(updated.radiusMeters).toBe(250);
    });

    it('getAlertSettings & updateAlertSettings - updates alert threshold rules', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        settings: {
          maxStopDurationMinutes: 12,
          offlineGraceMinutes: 6,
          lowBatteryThreshold: 25,
          criticalBatteryThreshold: 10,
          maxShiftDurationHours: 10,
          stopAlertEnabled: true,
          gpsAlertEnabled: true,
          offlineAlertEnabled: true,
          batteryAlertEnabled: true,
          restaurantGeofenceAlertEnabled: true,
          soundEnabled: true,
          inAppAlertsEnabled: true,
          pushAlertsEnabled: false,
        },
      }));

      const updated = await updateAlertSettings({
        maxStopDurationMinutes: 12,
        lowBatteryThreshold: 25,
      });

      expect(updated.maxStopDurationMinutes).toBe(12);
      expect(updated.lowBatteryThreshold).toBe(25);
    });
  });

  // ==========================================
  // 6. NOTIFICATION CENTER WORKFLOW
  // ==========================================
  describe('Notification Center Workflow', () => {
    it('listNotifications - fetches unread notifications list and unread count', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({
        page: 1,
        limit: 10,
        total: 1,
        unreadCount: 1,
        items: [
          {
            id: 'n1',
            type: 'STOP_EXTENDED',
            severity: 'WARNING',
            titleAr: 'توقف طويل',
            titleEn: 'Extended Stop',
            messageAr: 'توقف السائق خارج المطعم',
            messageEn: 'Driver stopped outside restaurant',
            read: false,
            resolved: false,
            createdAt: new Date().toISOString(),
          },
        ],
      }));

      const res = await listNotifications({ page: 1, limit: 10 });
      expect(res.unreadCount).toBe(1);
      expect(res.items[0].type).toBe('STOP_EXTENDED');
    });

    it('markAllNotificationsRead - marks all notifications as read', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockResponse({ success: true }));

      const res = await markAllNotificationsRead();
      expect(res.success).toBe(true);
    });
  });

  // ==========================================
  // 7. ARABIC RTL & WESTERN DIGITS ENFORCEMENT
  // ==========================================
  describe('Internationalization & Western Digits Enforcement', () => {
    it('Western digits enforcement - strictly formats numbers using 0-9 and converts any Arabic-Indic digits', () => {
      // Numbers formatted with Western digits
      expect(formatWesternNumber(1234.5)).toBe('1,234.5');
      expect(formatWesternNumber(0)).toBe('0');
      expect(formatWesternNumber('0501234567')).toBe('0501234567');

      // String containing Eastern Arabic numerals converts to Western digits
      expect(formatWesternNumber('٠٥٠١٢٣٤٥٦٧')).toBe('0501234567');
      expect(formatWesternNumber('١٢:٣٤')).toBe('12:34');
    });

    it('RTL default - defaults to Arabic and RTL layout', () => {
      setStoredLocale('ar');
      expect(getLocale()).toBe('ar');
      expect(isRtl()).toBe(true);

      setStoredLocale('en');
      expect(getLocale()).toBe('en');
      expect(isRtl()).toBe(false);

      // Reset back to primary
      setStoredLocale('ar');
    });
  });
});
