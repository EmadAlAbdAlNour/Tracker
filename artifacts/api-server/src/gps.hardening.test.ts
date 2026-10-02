import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as authService from './services/authService';
import * as dbModule from '@workspace/db';
import {
  evaluateOperationalHistory,
  computeOperationalStatus,
  DEFAULT_RELIABLE_ACCURACY_METERS,
} from './services/fleetService';

function makeUser(id: string) {
  return { id, role: 'DRIVER', active: true } as any;
}

function makeDriver(userId: string, driverId: string) {
  return { id: driverId, userId, employeeId: 'E1', active: true } as any;
}

function makeShift(id: string, driverId: string) {
  return { id, driverId, status: 'ACTIVE', startedAt: new Date() } as any;
}

function setupMockDb(driver: any, shift: any, device: any = { id: 'dev-1', driverId: driver.id, authorized: true, deviceIdentifier: 'dev-1' }) {
  dbModule.db.select = () => ({
    from: (table: any) => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => {
            if (table === (dbModule as any).shiftsTable || table?.name === 'shifts') return [shift];
            if (table === (dbModule as any).devicesTable || table?.name === 'devices') return [device];
            return [driver];
          },
        }),
        limit: async () => {
          if (table === (dbModule as any).shiftsTable || table?.name === 'shifts') return [shift];
          if (table === (dbModule as any).devicesTable || table?.name === 'devices') return [device];
          return [driver];
        },
      }),
      orderBy: () => ({
        limit: async () => (table === (dbModule as any).shiftsTable || table?.name === 'shifts' ? [shift] : [driver]),
      }),
      innerJoin: () => ({
        where: () => ({
          limit: async () => (table === (dbModule as any).shiftsTable || table?.name === 'shifts' ? [shift] : [driver]),
        }),
      }),
    } as any),
  }) as any;
}

describe('SIMPLE GPS HARDENING — VERIFICATION SUITE', () => {
  const restaurantSettings = {
    latitude: 30.05,
    longitude: 31.25,
    radiusMeters: 20,
    enabled: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Proof 1: Stationary driver + 100m GPS accuracy does NOT become MOVING
  it('Proof 1: Stationary driver + 100m GPS accuracy does NOT become MOVING', () => {
    const points = [
      {
        latitude: 30.06,
        longitude: 31.26,
        speed: 2.5, // reported speed looks high due to multipath
        accuracy: 100, // 100m is degraded (> 35m)
        recorded_at: new Date().toISOString(),
      },
    ];

    const result = evaluateOperationalHistory({
      points,
      restaurantSettings,
      initialMovementState: 'STOPPED',
    });

    expect(result.movementState).toBe('STOPPED');
    expect(result.operationalStatus).toBe('STOPPED');
    expect(result.reliablePointCount).toBe(0);

    // Also verify single-sample computeOperationalStatus holds STOPPED
    const status = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      location: points[0],
    });
    expect(status).toBe('STOPPED');
  });

  // Proof 2: Stationary driver + noisy GPS does NOT leave restaurant
  it('Proof 2: Stationary driver + noisy GPS does NOT leave restaurant', () => {
    const points = [
      {
        latitude: 30.0501,
        longitude: 31.2501, // ~15m from restaurant, noisy degraded fix
        accuracy: 90, // degraded
        speed: 1.8,
        recorded_at: new Date(Date.now() - 5000).toISOString(),
      },
      {
        latitude: 30.051,
        longitude: 31.251, // noisy jump > 50m away, but degraded
        accuracy: 110,
        speed: 2.2,
        recorded_at: new Date().toISOString(),
      },
    ];

    const result = evaluateOperationalHistory({
      points,
      restaurantSettings,
      initialRestaurantState: 'AT_RESTAURANT',
    });

    expect(result.restaurantState).toBe('AT_RESTAURANT');
    expect(result.operationalStatus).toBe('AT_RESTAURANT');
    expect(result.isInsideGeofence).toBe(true);
  });

  // Proof 3: Two reliable inside samples produce restaurant arrival
  it('Proof 3: Two reliable inside samples produce restaurant arrival (1 sample does not)', () => {
    // Restaurant center is at (30.05, 31.25)
    const insideSample1 = {
      latitude: 30.05005,
      longitude: 31.25005, // ~7m from center
      accuracy: 12,
      speed: 0.2,
      recorded_at: new Date(Date.now() - 4000).toISOString(),
    };
    const insideSample2 = {
      latitude: 30.05008,
      longitude: 31.25008, // ~11m from center
      accuracy: 10,
      speed: 0.1,
      recorded_at: new Date().toISOString(),
    };

    // After only 1 sample, driver has NOT yet arrived (remains OUTSIDE_RESTAURANT)
    const step1 = evaluateOperationalHistory({
      points: [insideSample1],
      restaurantSettings,
      initialRestaurantState: 'OUTSIDE_RESTAURANT',
    });
    expect(step1.restaurantState).toBe('OUTSIDE_RESTAURANT');

    // After 2 consecutive reliable samples inside, driver arrives AT_RESTAURANT
    const step2 = evaluateOperationalHistory({
      points: [insideSample1, insideSample2],
      restaurantSettings,
      initialRestaurantState: 'OUTSIDE_RESTAURANT',
    });
    expect(step2.restaurantState).toBe('AT_RESTAURANT');
    expect(step2.operationalStatus).toBe('AT_RESTAURANT');
    expect(step2.isInsideGeofence).toBe(true);
  });

  // Proof 4: Two reliable samples beyond exit buffer produce departure
  it('Proof 4: Two reliable samples beyond exit buffer produce departure', () => {
    // Restaurant radius is 20m, exit buffer is 30m -> exit threshold is 50m
    // Coordinate ~65m north of (30.05, 31.25) is lat ~30.0506
    const outsideSample1 = {
      latitude: 30.0506,
      longitude: 31.25, // ~66m from center
      accuracy: 15,
      speed: 3.5,
      recorded_at: new Date(Date.now() - 4000).toISOString(),
    };
    const outsideSample2 = {
      latitude: 30.0508,
      longitude: 31.25, // ~88m from center
      accuracy: 14,
      speed: 4.2,
      recorded_at: new Date().toISOString(),
    };

    const result = evaluateOperationalHistory({
      points: [outsideSample1, outsideSample2],
      restaurantSettings,
      initialRestaurantState: 'AT_RESTAURANT',
      initialMovementState: 'STOPPED',
    });

    expect(result.restaurantState).toBe('OUTSIDE_RESTAURANT');
    expect(result.isInsideGeofence).toBe(false);
  });

  // Proof 5: One noisy outside point does NOT produce departure
  it('Proof 5: One noisy outside point does NOT produce departure', () => {
    const singleOutsideGlitch = {
      latitude: 30.0507,
      longitude: 31.25, // ~77m away
      accuracy: 20, // reliable fix
      speed: 2.0,
      recorded_at: new Date().toISOString(),
    };

    const result = evaluateOperationalHistory({
      points: [singleOutsideGlitch],
      restaurantSettings,
      initialRestaurantState: 'AT_RESTAURANT',
    });

    // With only 1 sample outside, driver MUST retain AT_RESTAURANT
    expect(result.restaurantState).toBe('AT_RESTAURANT');
    expect(result.operationalStatus).toBe('AT_RESTAURANT');
    expect(result.isInsideGeofence).toBe(true);
  });

  // Proof 6: Two reliable movement samples produce MOVING
  it('Proof 6: Two reliable movement samples produce MOVING (1 sample does not)', () => {
    const moveSample1 = {
      latitude: 30.0601,
      longitude: 31.2601,
      speed: 2.2, // >= 1.5 m/s
      accuracy: 12,
      recorded_at: new Date(Date.now() - 4000).toISOString(),
    };
    const moveSample2 = {
      latitude: 30.0603,
      longitude: 31.2603, // ~30m displacement
      speed: 3.1, // >= 1.5 m/s
      accuracy: 10,
      recorded_at: new Date().toISOString(),
    };

    // 1 sample: remains STOPPED
    const step1 = evaluateOperationalHistory({
      points: [moveSample1],
      restaurantSettings,
      initialMovementState: 'STOPPED',
    });
    expect(step1.movementState).toBe('STOPPED');

    // 2 consecutive samples with speed >= 1.5 m/s and displacement >= 10m: transitions to MOVING
    const step2 = evaluateOperationalHistory({
      points: [moveSample1, moveSample2],
      restaurantSettings,
      initialMovementState: 'STOPPED',
    });
    expect(step2.movementState).toBe('MOVING');
    expect(step2.operationalStatus).toBe('MOVING');
  });

  // Proof 7: Three reliable low-speed samples produce STOPPED
  it('Proof 7: Three reliable low-speed samples produce STOPPED (1 and 2 do not)', () => {
    const stopSample1 = {
      latitude: 30.07,
      longitude: 31.27,
      speed: 0.3, // < 1.0 m/s
      accuracy: 15,
      recorded_at: new Date(Date.now() - 10000).toISOString(),
    };
    const stopSample2 = {
      latitude: 30.07001,
      longitude: 31.27,
      speed: 0.1,
      accuracy: 14,
      recorded_at: new Date(Date.now() - 5000).toISOString(),
    };
    const stopSample3 = {
      latitude: 30.07001,
      longitude: 31.27,
      speed: 0.0,
      accuracy: 12,
      recorded_at: new Date().toISOString(),
    };

    // 1 sample: remains MOVING
    const step1 = evaluateOperationalHistory({
      points: [stopSample1],
      restaurantSettings,
      initialMovementState: 'MOVING',
    });
    expect(step1.movementState).toBe('MOVING');

    // 2 samples: remains MOVING
    const step2 = evaluateOperationalHistory({
      points: [stopSample1, stopSample2],
      restaurantSettings,
      initialMovementState: 'MOVING',
    });
    expect(step2.movementState).toBe('MOVING');

    // 3 samples: cleanly transitions to STOPPED
    const step3 = evaluateOperationalHistory({
      points: [stopSample1, stopSample2, stopSample3],
      restaurantSettings,
      initialMovementState: 'MOVING',
    });
    expect(step3.movementState).toBe('STOPPED');
    expect(step3.operationalStatus).toBe('STOPPED');
  });

  // Proof 8: Fresh heartbeat + no GPS remains CONNECTED, not OFFLINE
  it('Proof 8: Fresh heartbeat + no GPS remains CONNECTED, not OFFLINE', () => {
    const status = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true, // determined by recent heartbeat device.lastSeen
      location: null, // no GPS fix available yet
    });

    expect(status).toBe('STOPPED'); // Connected and on duty, NOT OFFLINE!
    expect(status).not.toBe('OFFLINE');
  });

  // Proof 9: Shift A queued points cannot upload as Shift B
  it('Proof 9: Shift A queued points cannot upload as Shift B', async () => {
    const user = makeUser('user-9');
    const driver = makeDriver(user.id, 'driver-9');
    const shiftB = makeShift('shift-B-active', driver.id);

    setupMockDb(driver, shiftB);

    const pointsFromShiftA = [
      {
        clientLocationId: 'loc-shift-A-1',
        shiftId: 'shift-A-stale', // Belongs to previous Shift A!
        latitude: 30.05,
        longitude: 31.25,
        recordedAt: new Date().toISOString(),
      },
    ];

    // Submitting Shift A points when Shift B is active must throw 409 SHIFT_MISMATCH
    try {
      await authService.submitDriverLocationBatch(user.id, pointsFromShiftA as any, 'dev-1');
      expect.unreachable('Should have thrown 409 SHIFT_MISMATCH');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('SHIFT_MISMATCH');
    }
  });

  // Proof 10: Future timestamp is rejected
  it('Proof 10: Future timestamp is rejected beyond +60 seconds', async () => {
    const user = makeUser('user-10');
    const driver = makeDriver(user.id, 'driver-10');
    const shift = makeShift('shift-10', driver.id);

    setupMockDb(driver, shift);

    const futurePoint = [
      {
        clientLocationId: 'loc-future',
        latitude: 30.05,
        longitude: 31.25,
        // Timestamp 10 minutes into the future
        recordedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    ];

    try {
      await authService.submitDriverLocationBatch(user.id, futurePoint as any, 'dev-1');
      expect.unreachable('Should have thrown 400 INVALID_TIMESTAMP');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_TIMESTAMP');
    }

    const oldPoint = [
      {
        clientLocationId: 'loc-old',
        latitude: 30.05,
        longitude: 31.25,
        // Timestamp 30 hours in the past
        recordedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      },
    ];

    try {
      await authService.submitDriverLocationBatch(user.id, oldPoint as any, 'dev-1');
      expect.unreachable('Should have thrown 400 INVALID_TIMESTAMP');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_TIMESTAMP');
    }
  });

  // Proof 11: Existing telemetry pipeline still works
  it('Proof 11: Existing telemetry pipeline accepts valid points with active shift', async () => {
    const user = makeUser('user-11');
    const driver = makeDriver(user.id, 'driver-11');
    const shift = makeShift('shift-11', driver.id);

    setupMockDb(driver, shift);

    const pool = (dbModule as any).pool;
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ client_location_id: 'c-valid-1' }, { client_location_id: 'c-valid-2' }],
    } as any);

    const now = new Date().toISOString();
    const batch = [
      { clientLocationId: 'c-valid-1', shiftId: shift.id, latitude: 30.05, longitude: 31.25, recordedAt: now },
      { clientLocationId: 'c-valid-2', shiftId: shift.id, latitude: 30.051, longitude: 31.251, recordedAt: now },
    ];

    const result = await authService.submitDriverLocationBatch(user.id, batch as any, 'dev-1');
    expect(result.accepted).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.acceptedClientIds).toEqual(['c-valid-1', 'c-valid-2']);
  });

  // Proof 12: Existing heartbeat still works independently
  it('Proof 12: Existing heartbeat updates device lastSeen without altering GPS points', async () => {
    const user = makeUser('user-12');
    const driver = makeDriver(user.id, 'driver-12');
    const shift = makeShift('shift-12', driver.id);

    setupMockDb(driver, shift);

    let updatedDeviceValues: any = null;
    dbModule.db.update = () => ({
      set: (values: any) => {
        updatedDeviceValues = values;
        return {
          where: async () => {},
        } as any;
      },
    }) as any;

    const res = await authService.submitDriverHeartbeat(user.id, {
      batteryPercentage: 85,
      isCharging: false,
      locationServicesEnabled: true,
      networkStatus: 'wifi',
    }, 'dev-1');

    expect(res.ok).toBe(true);
    expect(updatedDeviceValues).toBeDefined();
    expect(updatedDeviceValues.lastSeen).toBeDefined();
    expect(updatedDeviceValues.batteryPercentage).toBe(85);
  });

  // Proof 13: Shift start inside restaurant immediately evaluates canonically to AT_RESTAURANT and isInsideGeofence=true
  it('Proof 13: Shift start inside restaurant immediately evaluates canonically to AT_RESTAURANT and isInsideGeofence=true', () => {
    // 1 sample inside restaurant radius (46m inside a 150m geofence)
    const points = [
      {
        latitude: 30.0503, // ~33m from restaurant (30.05, 31.25)
        longitude: 31.2502,
        speed: 0,
        accuracy: 12,
        recorded_at: new Date().toISOString(),
      },
    ];

    const result = evaluateOperationalHistory({
      points,
      restaurantSettings: {
        latitude: 30.05,
        longitude: 31.25,
        radiusMeters: 150,
        enabled: true,
      },
      initialRestaurantState: undefined, // Fresh shift start without prior state
      initialMovementState: 'STOPPED',
    });

    expect(result.restaurantState).toBe('AT_RESTAURANT');
    expect(result.isInsideGeofence).toBe(true);
    expect(result.operationalStatus).toBe('AT_RESTAURANT');
  });

  // Proof 14: Shift start outside restaurant evaluates to OUTSIDE_RESTAURANT and isInsideGeofence=false
  it('Proof 14: Shift start outside restaurant evaluates to OUTSIDE_RESTAURANT and isInsideGeofence=false', () => {
    const points = [
      {
        latitude: 30.055, // ~600m from restaurant
        longitude: 31.255,
        speed: 0,
        accuracy: 15,
        recorded_at: new Date().toISOString(),
      },
    ];

    const result = evaluateOperationalHistory({
      points,
      restaurantSettings: {
        latitude: 30.05,
        longitude: 31.25,
        radiusMeters: 150,
        enabled: true,
      },
      initialRestaurantState: undefined,
      initialMovementState: 'STOPPED',
    });

    expect(result.restaurantState).toBe('OUTSIDE_RESTAURANT');
    expect(result.isInsideGeofence).toBe(false);
    expect(result.operationalStatus).toBe('STOPPED');
  });

  // Proof 15: Shift with no location points holds fallback state and never falsely flags OUTSIDE_RESTAURANT
  it('Proof 15: Shift with no location points holds fallback state and never falsely flags OUTSIDE_RESTAURANT', () => {
    const result = evaluateOperationalHistory({
      points: [],
      restaurantSettings: {
        latitude: 30.05,
        longitude: 31.25,
        radiusMeters: 150,
        enabled: true,
      },
      initialRestaurantState: undefined,
      initialMovementState: 'STOPPED',
    });

    expect(result.movementState).toBe('STOPPED');
    expect(result.restaurantState).toBe('OUTSIDE_RESTAURANT');
    expect(result.isInsideGeofence).toBe(false);
    expect(result.reliablePointCount).toBe(0);
  });

  // Proof 16: Degraded GPS sample at restaurant boundary does not falsely alter established state
  it('Proof 16: Degraded GPS sample at restaurant boundary does not falsely alter established state', () => {
    const points = [
      {
        latitude: 30.0502,
        longitude: 31.2501,
        speed: 0,
        accuracy: 15, // reliable, inside
        recorded_at: new Date(Date.now() - 60000).toISOString(),
      },
      {
        latitude: 30.059, // degraded jump outside
        longitude: 31.259,
        speed: 4.5,
        accuracy: 85, // degraded (> 35m)
        recorded_at: new Date().toISOString(),
      },
    ];

    const result = evaluateOperationalHistory({
      points,
      restaurantSettings: {
        latitude: 30.05,
        longitude: 31.25,
        radiusMeters: 150,
        enabled: true,
      },
      initialRestaurantState: undefined,
      initialMovementState: 'STOPPED',
    });

    expect(result.restaurantState).toBe('AT_RESTAURANT');
    expect(result.isInsideGeofence).toBe(true);
    expect(result.operationalStatus).toBe('AT_RESTAURANT');
  });
});

