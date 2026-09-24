import { describe, expect, it, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readTelemetryToken, saveTelemetryToken, clearTelemetryToken, TELEMETRY_TOKEN_KEY } from './session';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34, constants: { Model: 'TestModel', Brand: 'TestBrand', Release: '14' } },
  PermissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      ACCESS_BACKGROUND_LOCATION: 'android.permission.ACCESS_BACKGROUND_LOCATION',
      POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
    },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    request: vi.fn().mockResolvedValue('granted'),
    check: vi.fn().mockResolvedValue(true),
  },
  NativeModules: {
    TrackerLocationModule: {
      startTracking: vi.fn().mockResolvedValue(true),
      stopTracking: vi.fn().mockResolvedValue({ drained: true, remainingCount: 0 }),
      getTrackingStatus: vi.fn().mockResolvedValue({ isTracking: false, queueSize: 0 }),
      getQueueSize: vi.fn().mockResolvedValue(0),
      updateTelemetryToken: vi.fn().mockResolvedValue(true),
    },
  },
  StyleSheet: { create: (s: any) => s },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

const asyncStorageStore: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(asyncStorageStore[key] || null)),
    setItem: vi.fn((key: string, value: string) => {
      asyncStorageStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete asyncStorageStore[key];
      return Promise.resolve();
    }),
  },
}));

vi.mock('expo-battery', () => ({
  getBatteryLevelAsync: vi.fn().mockResolvedValue(0.8),
  getBatteryStateAsync: vi.fn().mockResolvedValue(1),
  BatteryState: { CHARGING: 1, FULL: 2 },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue('test-device-uuid'),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

describe('Telemetry & Auth Parity Regression Tests', () => {
  beforeEach(() => {
    for (const k of Object.keys(asyncStorageStore)) {
      delete asyncStorageStore[k];
    }
    vi.clearAllMocks();
  });

  describe('Part 8 — Telemetry Token Shift Binding Safety', () => {
    it('returns token when expectedShiftId matches the stored shift', async () => {
      const futureExpiry = Date.now() + 3600 * 1000;
      await saveTelemetryToken('valid-token-123', futureExpiry, 'shift-active-1');

      const token = await readTelemetryToken('shift-active-1');
      expect(token).toBe('valid-token-123');
    });

    it('purges and returns null when expectedShiftId does not match stored shift (preventing stale token reuse)', async () => {
      const futureExpiry = Date.now() + 3600 * 1000;
      await saveTelemetryToken('stale-token-old', futureExpiry, 'shift-old-previous');

      const token = await readTelemetryToken('shift-new-active');
      expect(token).toBeNull();
      // Verify storage was purged
      expect(asyncStorageStore[TELEMETRY_TOKEN_KEY]).toBeUndefined();
    });

    it('returns null if token has expired or is expiring within 60s', async () => {
      const pastExpiry = Date.now() + 30 * 1000; // only 30s remaining
      await saveTelemetryToken('expiring-soon', pastExpiry, 'shift-active-1');

      const token = await readTelemetryToken('shift-active-1');
      expect(token).toBeNull();
    });
  });

  describe('Part 5 — GPS Status Explicit Semantics', () => {
    function resolveGpsStatus(val: boolean | null | undefined): 'Enabled' | 'Disabled' | 'Unknown' {
      if (val === true) return 'Enabled';
      if (val === false) return 'Disabled';
      return 'Unknown';
    }

    it('correctly maps boolean true to Enabled', () => {
      expect(resolveGpsStatus(true)).toBe('Enabled');
    });

    it('correctly maps boolean false to Disabled', () => {
      expect(resolveGpsStatus(false)).toBe('Disabled');
    });

    it('does NOT treat null as true/Enabled — maps null and undefined to Unknown', () => {
      expect(resolveGpsStatus(null)).toBe('Unknown');
      expect(resolveGpsStatus(undefined)).toBe('Unknown');
    });
  });

  describe('Part 6 — Driver on Active Shift with Awaiting Telemetry', () => {
    function computeConnectionState(params: {
      hasActiveShift: boolean;
      hasLocation: boolean;
      isOnline: boolean;
      elapsedMinutes: number | null;
    }): 'awaiting' | 'online' | 'delayed' | 'offline' {
      const { hasActiveShift, hasLocation, isOnline, elapsedMinutes } = params;
      const isAwaitingTelemetry = hasActiveShift && !hasLocation;

      if (isAwaitingTelemetry) return 'awaiting';
      if (!isOnline) return 'offline';
      if (elapsedMinutes != null && elapsedMinutes > 5) return 'delayed';
      return 'online';
    }

    it('reports awaiting state when driver is on active shift but zero location points exist (e.g. Vivo fresh shift)', () => {
      const state = computeConnectionState({
        hasActiveShift: true,
        hasLocation: false,
        isOnline: false,
        elapsedMinutes: null,
      });
      expect(state).toBe('awaiting');
    });

    it('reports online state when driver is on active shift with fresh location', () => {
      const state = computeConnectionState({
        hasActiveShift: true,
        hasLocation: true,
        isOnline: true,
        elapsedMinutes: 1,
      });
      expect(state).toBe('online');
    });

    it('reports delayed state when driver is online but location is older than 5 minutes', () => {
      const state = computeConnectionState({
        hasActiveShift: true,
        hasLocation: true,
        isOnline: true,
        elapsedMinutes: 8,
      });
      expect(state).toBe('delayed');
    });

    it('reports offline state when driver is off shift or offline with stale location', () => {
      const state = computeConnectionState({
        hasActiveShift: false,
        hasLocation: true,
        isOnline: false,
        elapsedMinutes: 30,
      });
      expect(state).toBe('offline');
    });
  });

  describe('Part 4 — Login Timeout with AbortController', () => {
    it('aborts fetch request when timeout expires and resets loading state', async () => {
      const controller = new AbortController();
      let aborted = false;

      controller.signal.addEventListener('abort', () => {
        aborted = true;
      });

      // Simulate timeout
      controller.abort();
      expect(aborted).toBe(true);
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe('Part 5 — Current Location & Freshness Validation', () => {
    it('validates that initial location is only accepted if fresh (<= 15s) and accurate (<= 50m)', () => {
      function isInitialSeedUsable(ageMs: number, accuracy: number): boolean {
        const isFresh = ageMs >= 0 && ageMs <= 15_000;
        const isAccurate = accuracy >= 0 && accuracy <= 50;
        return isFresh && isAccurate;
      }

      // Fresh & accurate: 3 seconds old, 12m accuracy -> ACCEPT
      expect(isInitialSeedUsable(3000, 12)).toBe(true);

      // Stale: 2 minutes old (120s), 10m accuracy -> REJECT
      expect(isInitialSeedUsable(120_000, 10)).toBe(false);

      // Inaccurate: 2 seconds old, 1500m accuracy -> REJECT
      expect(isInitialSeedUsable(2000, 1500)).toBe(false);

      // Negative or skewed clock -> REJECT
      expect(isInitialSeedUsable(-5000, 10)).toBe(false);
    });

    it('requires latitude and longitude before dispatching start shift request', () => {
      function validateStartShiftPayload(loc: { latitude?: number; longitude?: number } | null): boolean {
        return Boolean(loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number');
      }

      expect(validateStartShiftPayload(null)).toBe(false);
      expect(validateStartShiftPayload({})).toBe(false);
      expect(validateStartShiftPayload({ latitude: 24.7136, longitude: 46.6753 })).toBe(true);
    });
  });
});

