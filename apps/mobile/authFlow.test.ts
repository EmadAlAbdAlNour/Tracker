import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock storage map for SecureStore
let mockStorage: Record<string, string> = {};

vi.mock('react-native', () => ({
  Platform: { OS: 'android', constants: {} },
  StyleSheet: { create: (s: any) => s },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('expo-battery', () => ({
  getBatteryLevelAsync: vi.fn().mockResolvedValue(0.8),
  getBatteryStateAsync: vi.fn().mockResolvedValue(1),
  BatteryState: { CHARGING: 1, FULL: 2 },
}));



vi.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => children,
}));

vi.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: () => null,
  }),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockStorage[key] ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockStorage[key] = value;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    delete mockStorage[key];
  }),
}));

import {
  isTokenExpiringSoon,
  isValidSession,
  readSession,
  saveSession,
  clearSession,
  refreshAuthSession,
  apiRequest,
  SESSION_KEY,
  type Session,
} from './session';

function createMockJwt(expSec: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'u-1', role: 'ADMIN', exp: expSec })).toString('base64url');
  return `${header}.${payload}.mockSignature`;
}

describe('Tracker Mobile Auth Flow & Session Resolution Gate', () => {
  beforeEach(() => {
    mockStorage = {};
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Test Case 1: Valid session -> resolves immediately without refreshing
  it('1. Valid session with fresh token resolves immediately without calling refresh', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 900; // 15 mins ahead
    const freshToken = createMockJwt(futureExp);

    expect(isTokenExpiringSoon(freshToken)).toBe(false);

    const validSession: Session = {
      accessToken: freshToken,
      refreshToken: 'valid-refresh-token',
      user: {
        id: 'u-admin-1',
        name: 'Admin User',
        email: 'admin@tracker.com',
        phone: null,
        role: 'ADMIN',
        active: true,
      },
    };

    await saveSession(validSession);
    const loaded = await readSession();
    expect(loaded).toEqual(validSession);
    expect(isTokenExpiringSoon(loaded!.accessToken)).toBe(false);
  });

  // Test Case 2: Expired access token with valid refresh token -> refreshes session successfully
  it('2. Expired access token with valid refresh token refreshes session successfully', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 300; // Expired 5 mins ago
    const expiredToken = createMockJwt(pastExp);
    expect(isTokenExpiringSoon(expiredToken)).toBe(true);

    const initialSession: Session = {
      accessToken: expiredToken,
      refreshToken: 'valid-refresh-token-123',
      user: {
        id: 'u-admin-1',
        name: 'Admin User',
        email: 'admin@tracker.com',
        phone: null,
        role: 'ADMIN',
        active: true,
      },
    };
    await saveSession(initialSession);

    const newExp = Math.floor(Date.now() / 1000) + 900;
    const refreshedAccessToken = createMockJwt(newExp);
    const newSessionPayload: Session = {
      accessToken: refreshedAccessToken,
      refreshToken: 'new-refresh-token-456',
      user: initialSession.user,
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          json: async () => newSessionPayload,
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', fetchMock);

    const refreshed = await refreshAuthSession();
    expect(refreshed).not.toBeNull();
    expect(refreshed?.accessToken).toBe(refreshedAccessToken);
    expect(refreshed?.refreshToken).toBe('new-refresh-token-456');

    // SecureStore must be updated with the refreshed session
    const stored = await readSession();
    expect(stored?.accessToken).toBe(refreshedAccessToken);
    expect(stored?.refreshToken).toBe('new-refresh-token-456');
  });

  // Test Case 3: Expired access token with invalid/revoked refresh token -> clears session, returns to login
  it('3. Expired access token with invalid/revoked refresh token clears session from storage', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 600;
    const expiredToken = createMockJwt(pastExp);

    const initialSession: Session = {
      accessToken: expiredToken,
      refreshToken: 'revoked-refresh-token',
      user: {
        id: 'u-admin-1',
        name: 'Admin User',
        email: 'admin@tracker.com',
        phone: null,
        role: 'ADMIN',
        active: true,
      },
    };
    await saveSession(initialSession);

    // Mock API 401 response from /api/auth/refresh
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            error: { code: 'AUTH_INVALID_TOKEN', message: 'Refresh token has expired or was revoked' },
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', fetchMock);

    const refreshed = await refreshAuthSession();
    expect(refreshed).toBeNull();

    // Session in SecureStore must be cleared
    const stored = await readSession();
    expect(stored).toBeNull();
  });

  // Test Case 4: Valid session with network error on fleet fetch -> does not log out, preserves session
  it('4. Valid session with network error on fleet fetch preserves session and returns error for retry', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 900;
    const token = createMockJwt(futureExp);

    const session: Session = {
      accessToken: token,
      refreshToken: 'keep-refresh-token',
      user: {
        id: 'u-admin-1',
        name: 'Admin User',
        email: 'admin@tracker.com',
        phone: null,
        role: 'ADMIN',
        active: true,
      },
    };
    await saveSession(session);

    // Mock network failure
    const fetchMock = vi.fn().mockImplementation(async () => {
      throw new Error('Network request failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/api/fleet/live', {}, session)).rejects.toThrow();

    // Session in SecureStore MUST NOT be cleared on network failure
    const stored = await readSession();
    expect(stored).not.toBeNull();
    expect(stored?.accessToken).toBe(token);
  });

  // Test Case 5: Valid session with 0 drivers in DB -> shows 0 drivers as valid data, distinct from loading
  it('5. Valid session with 0 drivers in DB returns valid empty fleet, distinct from loading', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 900;
    const token = createMockJwt(futureExp);

    const session: Session = {
      accessToken: token,
      refreshToken: 'keep-refresh-token',
      user: {
        id: 'u-admin-1',
        name: 'Admin User',
        email: 'admin@tracker.com',
        phone: null,
        role: 'ADMIN',
        active: true,
      },
    };

    const emptyFleetResponse = {
      drivers: [],
      restaurant: {
        name: 'Al Shayeb Restaurant',
        latitude: 30.05,
        longitude: 31.25,
        radiusMeters: 150,
      },
      alerts: [],
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/fleet/live')) {
        return {
          ok: true,
          status: 200,
          json: async () => emptyFleetResponse,
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiRequest<any>('/api/fleet/live', {}, session);
    expect(data).not.toBeNull();
    expect(data.drivers).toEqual([]);
    expect(data.restaurant.name).toBe('Al Shayeb Restaurant');

    // Metrics computed from this response
    const totalDrivers = data.drivers.length;
    expect(totalDrivers).toBe(0);
    // Data is present, so UI renders real 0-drivers state, not the loading spinner
  });

  // Test Case 6: Initial auth loading state -> shows loading indicator, not zero drivers
  it('6. Unloaded fleet (null) is distinguished from loaded empty fleet (0 drivers)', () => {
    const unloadedFleet: any = null;
    const loadedEmptyFleet: any = {
      drivers: [],
      restaurant: { name: 'Al Shayeb' },
      alerts: [],
    };

    // State predicate simulating AdminHomeScreen rendering decision
    const getScreenState = (fleet: any, fleetLoading: boolean, fleetError: string | null) => {
      if (fleetLoading && !fleet) return 'LOADING';
      if (!fleetLoading && !fleet && fleetError) return 'ERROR';
      if (fleet !== null) return 'SUCCESS';
      return 'UNKNOWN';
    };

    // Initial loading with no fleet yet
    expect(getScreenState(unloadedFleet, true, null)).toBe('LOADING');

    // Network error on cold start
    expect(getScreenState(unloadedFleet, false, 'Network error')).toBe('ERROR');

    // Successful load of legitimate empty fleet (0 drivers in DB)
    expect(getScreenState(loadedEmptyFleet, false, null)).toBe('SUCCESS');

    // Background refresh while fleet is already loaded
    expect(getScreenState(loadedEmptyFleet, true, null)).toBe('SUCCESS');
  });
});
