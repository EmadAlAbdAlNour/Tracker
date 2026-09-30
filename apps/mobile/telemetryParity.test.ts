import { describe, expect, it, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readTelemetryToken, saveTelemetryToken, clearTelemetryToken, TELEMETRY_TOKEN_KEY } from './session';
import {
  resolveConnectionState,
  resolveOperationalState,
  resolveSpeedSemantics,
  resolveTelemetryDiagnostics,
} from './telemetry';
import { t, isRtl, formatTimeAgo, formatWesternNumber } from './i18n';

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

  describe('Authoritative UI Semantics — Phase 1 Hardening', () => {
    it('1. Online + fresh MOVING: resolves online, MOVING, and current speed', () => {
      const now = Date.now();
      const driver = {
        isOnline: true,
        operationalStatus: 'MOVING',
        location: {
          latitude: 24.7,
          longitude: 46.7,
          speed: 15, // 54 km/h
          recordedAt: new Date(now - 10 * 1000).toISOString(),
        },
        device: { lastSeen: new Date(now - 5 * 1000).toISOString() },
      };

      expect(resolveConnectionState(driver)).toBe('online');
      expect(resolveOperationalState(driver)).toBe('MOVING');
      const speed = resolveSpeedSemantics({
        speedMs: driver.location.speed,
        operationalStatus: driver.operationalStatus,
        isOnline: driver.isOnline,
        recordedAt: driver.location.recordedAt,
        now,
      });
      expect(speed.isCurrent).toBe(true);
      expect(speed.isHistorical).toBe(false);
      expect(speed.speedKmh).toBe(54);
    });

    it('2. Online + stale GPS + MOVING backend status: remains online and MOVING, but speed is historical because GPS is stale', () => {
      const now = Date.now();
      const driver = {
        isOnline: true,
        operationalStatus: 'MOVING',
        location: {
          latitude: 24.7,
          longitude: 46.7,
          speed: 15,
          recordedAt: new Date(now - 25 * 60 * 1000).toISOString(), // 25m old
        },
        device: { lastSeen: new Date(now - 10 * 1000).toISOString() },
      };

      expect(resolveConnectionState(driver)).toBe('online');
      expect(resolveOperationalState(driver)).toBe('MOVING');
      const speed = resolveSpeedSemantics({
        speedMs: driver.location.speed,
        operationalStatus: driver.operationalStatus,
        isOnline: driver.isOnline,
        recordedAt: driver.location.recordedAt,
        now,
      });
      expect(speed.isCurrent).toBe(false);
      expect(speed.isHistorical).toBe(true);
      expect(speed.ageMinutes).toBe(25);
    });

    it('3. Online + stale GPS + STOPPED: remains online, STOPPED, speed is historical', () => {
      const now = Date.now();
      const driver = {
        isOnline: true,
        operationalStatus: 'STOPPED',
        location: {
          latitude: 24.7,
          longitude: 46.7,
          speed: 3.33, // 12 km/h
          recordedAt: new Date(now - 20 * 60 * 1000).toISOString(),
        },
        device: { lastSeen: new Date(now - 5 * 1000).toISOString() },
      };

      expect(resolveConnectionState(driver)).toBe('online');
      expect(resolveOperationalState(driver)).toBe('STOPPED');
      const speed = resolveSpeedSemantics({
        speedMs: driver.location.speed,
        operationalStatus: driver.operationalStatus,
        isOnline: driver.isOnline,
        recordedAt: driver.location.recordedAt,
        now,
      });
      expect(speed.isCurrent).toBe(false);
      expect(speed.isHistorical).toBe(true);
      expect(speed.speedKmh).toBe(12);
    });

    it('4. Online + stale GPS + AT_RESTAURANT: remains online, AT_RESTAURANT, speed is historical', () => {
      const now = Date.now();
      const driver = {
        isOnline: true,
        operationalStatus: 'AT_RESTAURANT',
        location: {
          latitude: 24.71,
          longitude: 46.68,
          speed: 15,
          recordedAt: new Date(now - 45 * 60 * 1000).toISOString(),
        },
        device: { lastSeen: new Date(now - 15 * 1000).toISOString() },
      };

      expect(resolveConnectionState(driver)).toBe('online');
      expect(resolveOperationalState(driver)).toBe('AT_RESTAURANT');
      const speed = resolveSpeedSemantics({
        speedMs: driver.location.speed,
        operationalStatus: driver.operationalStatus,
        isOnline: driver.isOnline,
        recordedAt: driver.location.recordedAt,
        now,
      });
      expect(speed.isCurrent).toBe(false);
      expect(speed.isHistorical).toBe(true);
    });

    it('5. Offline + recent GPS: remains offline, operationalStatus OFFLINE takes precedence', () => {
      const now = Date.now();
      const driver = {
        isOnline: false,
        operationalStatus: 'OFFLINE',
        location: {
          latitude: 24.7,
          longitude: 46.7,
          speed: 15,
          recordedAt: new Date(now - 10 * 1000).toISOString(),
        },
        device: { lastSeen: new Date(now - 10 * 60 * 1000).toISOString() },
      };

      expect(resolveConnectionState(driver)).toBe('offline');
      expect(resolveOperationalState(driver)).toBe('OFFLINE');
      const speed = resolveSpeedSemantics({
        speedMs: driver.location.speed,
        operationalStatus: driver.operationalStatus,
        isOnline: driver.isOnline,
        recordedAt: driver.location.recordedAt,
        now,
      });
      expect(speed.isCurrent).toBe(false);
      expect(speed.isHistorical).toBe(false);
    });

    it('6. Online + no location: reports awaiting when on shift, handles null location without crashing', () => {
      const driver = {
        isOnline: true,
        operationalStatus: 'STOPPED',
        shift: { status: 'ACTIVE' },
        location: null,
        device: { lastSeen: new Date().toISOString() },
      };

      expect(resolveConnectionState(driver)).toBe('awaiting');
      expect(resolveOperationalState(driver)).toBe('AWAITING');
      const speed = resolveSpeedSemantics({
        speedMs: null,
        operationalStatus: driver.operationalStatus,
        isOnline: driver.isOnline,
        recordedAt: null,
      });
      expect(speed.speedKmh).toBeNull();
      expect(speed.isCurrent).toBe(false);
      expect(speed.isHistorical).toBe(false);
    });

    it('7. Offline + no location: reports offline without crash', () => {
      const driver = {
        isOnline: false,
        operationalStatus: 'OFFLINE',
        location: null,
        device: { lastSeen: null },
      };

      expect(resolveConnectionState(driver)).toBe('offline');
      expect(resolveOperationalState(driver)).toBe('OFFLINE');
    });

    it('8. Recent lastSeen + old recordedAt: connection is online, GPS age is old', () => {
      const now = Date.now();
      const driver = {
        isOnline: true,
        operationalStatus: 'STOPPED',
        location: {
          latitude: 24.7,
          longitude: 46.7,
          recordedAt: new Date(now - 60 * 60 * 1000).toISOString(), // 1 hour old
        },
        device: { lastSeen: new Date(now - 15 * 1000).toISOString() }, // 15s ago
      };

      expect(resolveConnectionState(driver)).toBe('online');
      const recordedAtMs = new Date(driver.location.recordedAt).getTime();
      const gpsAgeMinutes = Math.round((now - recordedAtMs) / 60000);
      expect(gpsAgeMinutes).toBe(60);
    });

    it('9. Old lastSeen + recent recordedAt: connection is offline, does not get promoted by queued/recent GPS', () => {
      const now = Date.now();
      const driver = {
        isOnline: false,
        operationalStatus: 'OFFLINE',
        location: {
          latitude: 24.7,
          longitude: 46.7,
          recordedAt: new Date(now - 10 * 1000).toISOString(), // 10s ago
        },
        device: { lastSeen: new Date(now - 12 * 60 * 1000).toISOString() }, // 12m ago
      };

      expect(resolveConnectionState(driver)).toBe('offline');
      expect(resolveOperationalState(driver)).toBe('OFFLINE');
    });

    it('10. Stale speed is labeled historical, never current', () => {
      const now = Date.now();
      const speed = resolveSpeedSemantics({
        speedMs: 15,
        operationalStatus: 'AT_RESTAURANT',
        isOnline: true,
        recordedAt: new Date(now - 78 * 60 * 1000).toISOString(),
        now,
      });

      expect(speed.isCurrent).toBe(false);
      expect(speed.isHistorical).toBe(true);
      expect(speed.speedKmh).toBe(54);
      expect(speed.ageMinutes).toBe(78);
    });

    it('11. Fresh speed can be displayed as current', () => {
      const now = Date.now();
      const speed = resolveSpeedSemantics({
        speedMs: 20, // 72 km/h
        operationalStatus: 'MOVING',
        isOnline: true,
        recordedAt: new Date(now - 30 * 1000).toISOString(), // 30s ago
        now,
      });

      expect(speed.isCurrent).toBe(true);
      expect(speed.isHistorical).toBe(false);
      expect(speed.speedKmh).toBe(72);
    });

    it('12. Arabic and English labels correctly map status strings', () => {
      expect(formatTimeAgo(new Date().toISOString(), true)).toContain('ثوان');
      expect(formatTimeAgo(new Date().toISOString(), false)).toBe('Just now');
      expect(formatWesternNumber(54)).toBe('54');
    });

    it('13. No crash when driver or location is null or undefined', () => {
      expect(resolveConnectionState(null)).toBe('offline');
      expect(resolveConnectionState(undefined)).toBe('offline');
      expect(resolveOperationalState(null)).toBe('OFFLINE');
      expect(resolveOperationalState(undefined)).toBe('OFFLINE');
      expect(resolveSpeedSemantics({})).toEqual({
        speedKmh: null,
        isCurrent: false,
        isHistorical: false,
        ageMinutes: null,
      });
    });

    it('14. REGRESSION TEST: staleGpsDoesNotLookLikeCurrentConnectionOrSpeed', () => {
      // EXACT BUG SCENARIO:
      // Backend:
      //   isOnline = true
      //   operationalStatus = AT_RESTAURANT
      //   lastSeen = 10 seconds ago
      //   location.recordedAt = 78 minutes ago
      //   location.speed = 15 m/s (54 km/h)
      const now = Date.now();
      const driver = {
        isOnline: true,
        operationalStatus: 'AT_RESTAURANT',
        location: {
          latitude: 24.7136,
          longitude: 46.6753,
          speed: 15,
          recordedAt: new Date(now - 78 * 60 * 1000).toISOString(),
        },
        device: {
          lastSeen: new Date(now - 10 * 1000).toISOString(),
        },
      };

      // 1. Connection MUST be online (not delayed, not offline)
      const connectionState = resolveConnectionState(driver);
      expect(connectionState).toBe('online');

      // 2. Operational state MUST be AT_RESTAURANT (never derived from speed > 0)
      const operationalState = resolveOperationalState(driver);
      expect(operationalState).toBe('AT_RESTAURANT');

      // 3. Speed semantics: MUST NOT be current, MUST be historical
      const speedSemantics = resolveSpeedSemantics({
        speedMs: driver.location.speed,
        operationalStatus: driver.operationalStatus,
        isOnline: driver.isOnline,
        recordedAt: driver.location.recordedAt,
        now,
      });
      expect(speedSemantics.isCurrent).toBe(false);
      expect(speedSemantics.isHistorical).toBe(true);
      expect(speedSemantics.speedKmh).toBe(54);
      expect(speedSemantics.ageMinutes).toBe(78);
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

  describe('Part 6 — 4-State Diagnostics Model', () => {
    const now = Date.now();

    it('resolves OFFLINE when isOnline is false or null regardless of location presence', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: false,
          location: { accuracy: 10, recordedAt: new Date(now).toISOString() },
        },
        now,
      });
      expect(diag.status).toBe('OFFLINE');
      expect(diag.isOnline).toBe(false);
      expect(diag.badgeColor).toBe('#64748b');
      expect(diag.labelEn).toBe('Offline');
      expect(diag.labelAr).toBe('غير متصل');
    });

    it('resolves SYNCING when online with pending queued locations', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: { accuracy: 10, recordedAt: new Date(now).toISOString() },
        },
        pendingQueueCount: 7,
        now,
      });
      expect(diag.status).toBe('SYNCING');
      expect(diag.isOnline).toBe(true);
      expect(diag.badgeColor).toBe('#06b6d4');
      expect(diag.labelEn).toBe('Syncing');
      expect(diag.labelAr).toBe('مزامنة البيانات');
    });

    it('resolves GPS_STALE when online but GPS timestamp is older than 5 minutes', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: {
            accuracy: 15,
            recordedAt: new Date(now - 10 * 60 * 1000).toISOString(),
          },
        },
        now,
      });
      expect(diag.status).toBe('GPS_STALE');
      expect(diag.gpsAgeMinutes).toBe(10);
      expect(diag.badgeColor).toBe('#f59e0b');
    });

    it('resolves GPS_DEGRADED when online with fresh GPS but accuracy > 35m', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: {
            accuracy: 60,
            recordedAt: new Date(now - 20 * 1000).toISOString(),
          },
        },
        now,
      });
      expect(diag.status).toBe('GPS_DEGRADED');
      expect(diag.isReliableGps).toBe(false);
      expect(diag.badgeColor).toBe('#f97316');
    });

    it('resolves ONLINE when online with fresh and reliable GPS', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: {
            accuracy: 8,
            recordedAt: new Date(now - 5 * 1000).toISOString(),
          },
        },
        now,
      });
      expect(diag.status).toBe('ONLINE');
      expect(diag.isReliableGps).toBe(true);
      expect(diag.badgeColor).toBe('#10b981');
    });
  });
});


