import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as authService from './services/authService';
import * as dbModule from '@workspace/db';
import { shiftsTable } from '@workspace/db';
import { computeOperationalStatus } from './services/fleetService';

function makeUser(id: string) {
  return { id, role: 'DRIVER', active: true } as any;
}

function makeDriver(userId: string, driverId: string) {
  return { id: driverId, userId, employeeId: 'E1', active: true } as any;
}

function makeShift(id: string, driverId: string) {
  return { id, driverId, status: 'ACTIVE', startedAt: new Date() } as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Location batch service', () => {
  it('accepts valid batch and returns accepted count', async () => {
    const user = makeUser('u1');
    const driver = makeDriver(user.id, 'd1');
    const shift = makeShift('s1', driver.id);

    // mock getDriverByUserId to return driver
    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);

    // mock db.select for active shift and driver lookup - flexible chain
    dbModule.db.select = () => ({
      from: (table: any) => {
        return {
          limit: async () => [],
          // where used by driver and shift queries -> return object with orderBy and limit
          where: () => ({
            orderBy: () => ({ limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }),
            limit: async () => (table?.name === 'shifts' ? [shift] : [driver]),
          }),
          // orderBy used by shifts query: return object with limit
          orderBy: () => ({ limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }),
          // innerJoin chain for other queries
          innerJoin: () => ({ where: () => ({ limit: async () => (table === (dbModule as any).shiftsTable ? [shift] : [driver]) }) }),
        } as any;
      },
    }) as any;

    // mock pool.query to simulate two inserted rows (client_location_id returned)
    const pool = (dbModule as any).pool;
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ client_location_id: 'c1' }, { client_location_id: 'c2' }] } as any);

    const now = new Date().toISOString();
    const inputs = [
      { clientLocationId: 'c1', latitude: 10, longitude: 10, recordedAt: now },
      { clientLocationId: 'c2', latitude: 11, longitude: 11, recordedAt: now },
    ];

    const res = await authService.submitDriverLocationBatch(user.id, inputs as any);
    expect(res.accepted).toBe(2);
    expect(res.duplicates).toBe(0);
    expect(res.acceptedClientIds).toEqual(['c1', 'c2']);
    expect(res.insertedClientIds).toEqual(['c1', 'c2']);
    expect(res.duplicateClientIds).toEqual([]);
  });

  it('handles duplicate points idempotently without failing client', async () => {
    const user = makeUser('u1-dup');
    const driver = makeDriver(user.id, 'd1-dup');
    const shift = makeShift('s1-dup', driver.id);

    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);

    dbModule.db.select = () => ({
      from: (table: any) => ({
        limit: async () => [],
        where: () => ({
          orderBy: () => ({ limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }),
          limit: async () => (table?.name === 'shifts' ? [shift] : [driver]),
        }),
        orderBy: () => ({ limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }),
        innerJoin: () => ({ where: () => ({ limit: async () => (table === (dbModule as any).shiftsTable ? [shift] : [driver]) }) }),
      } as any),
    }) as any;

    // Simulate ON CONFLICT DO NOTHING: point c1 already exists, so 0 rows returned
    const pool = (dbModule as any).pool;
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

    const now = new Date().toISOString();
    const inputs = [{ clientLocationId: 'c1', latitude: 10, longitude: 10, recordedAt: now }];

    const res = await authService.submitDriverLocationBatch(user.id, inputs as any);
    expect(res.accepted).toBe(0);
    expect(res.duplicates).toBe(1);
    expect(res.acceptedClientIds).toEqual(['c1']); // c1 was duplicate, so still reported as accepted
    expect(res.insertedClientIds).toEqual([]);
    expect(res.duplicateClientIds).toEqual(['c1']);
  });

  it('handles mixed new and duplicate batch correctly', async () => {
    const user = makeUser('u1-mix');
    const driver = makeDriver(user.id, 'd1-mix');
    const shift = makeShift('s1-mix', driver.id);

    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);

    dbModule.db.select = () => ({
      from: (table: any) => ({
        limit: async () => [],
        where: () => ({
          orderBy: () => ({ limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }),
          limit: async () => (table?.name === 'shifts' ? [shift] : [driver]),
        }),
        orderBy: () => ({ limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }),
        innerJoin: () => ({ where: () => ({ limit: async () => (table === (dbModule as any).shiftsTable ? [shift] : [driver]) }) }),
      } as any),
    }) as any;

    // Simulate mixed: c1 newly inserted, c2 was duplicate (ON CONFLICT DO NOTHING)
    const pool = (dbModule as any).pool;
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ client_location_id: 'c1' }] } as any);

    const now = new Date().toISOString();
    const inputs = [
      { clientLocationId: 'c1', latitude: 10, longitude: 10, recordedAt: now },
      { clientLocationId: 'c2', latitude: 11, longitude: 11, recordedAt: now },
    ];

    const res = await authService.submitDriverLocationBatch(user.id, inputs as any);
    expect(res.accepted).toBe(1);
    expect(res.duplicates).toBe(1);
    expect(res.acceptedClientIds).toEqual(['c1', 'c2']);
    expect(res.insertedClientIds).toEqual(['c1']);
    expect(res.duplicateClientIds).toEqual(['c2']);
  });

  it('rejects batches larger than 20', async () => {
    const user = makeUser('u2');
    const inputs: any[] = [];
    const now = new Date().toISOString();
    for (let i = 0; i < 21; i++) {
      inputs.push({ clientLocationId: `c${i}`, latitude: 10, longitude: 10, recordedAt: now });
    }

    await expect(authService.submitDriverLocationBatch(user.id, inputs)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when driver device is unauthorized or revoked', async () => {
    const user = makeUser('u-unauth');
    const driver = makeDriver(user.id, 'd-unauth');
    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);

    // Mock db.select where devicesTable returns [] (no authorized device)
    dbModule.db.select = () => ({
      from: (table: any) => {
        const isDevices = table === (dbModule as any).devicesTable;
        return {
          limit: async () => [],
          where: () => ({
            orderBy: () => ({ limit: async () => (isDevices ? [] : [driver]) }),
            limit: async () => (isDevices ? [] : [driver]),
          }),
          orderBy: () => ({ limit: async () => [] }),
        } as any;
      },
    }) as any;

    const now = new Date().toISOString();
    const inputs = [{ clientLocationId: 'c1', latitude: 10, longitude: 10, recordedAt: now }];

    await expect(authService.submitDriverLocationBatch(user.id, inputs as any)).rejects.toMatchObject({
      statusCode: 403,
      code: 'DEVICE_UNAUTHORIZED',
    });
  });

  it('rejects when no active shift', async () => {
    const user = makeUser('u3');
    const driver = makeDriver(user.id, 'd3');
    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);

    // mock db.select to return empty shifts (for shiftsTable path) and ensure driver and device lookups work
    dbModule.db.select = () => ({
      from: (table: any) => {
        // Check if this is the shiftsTable by comparing table reference
        const isShiftsTable = table === shiftsTable;
        return {
          limit: async () => [],
          // where used by driver and shift queries -> return object with orderBy and limit
          where: () => ({ orderBy: () => ({ limit: async () => (isShiftsTable ? [] : [driver]) }), limit: async () => (isShiftsTable ? [] : [driver]) }),
          // orderBy used by shifts query: return object with limit
          orderBy: () => ({ limit: async () => (isShiftsTable ? [] : [driver]) }),
          // innerJoin chain for other queries
          innerJoin: () => ({ where: () => ({ limit: async () => (isShiftsTable ? [] : [driver]) }) }),
        } as any;
      },
    }) as any;

    const now = new Date().toISOString();
    const inputs = [{ clientLocationId: 'c1', latitude: 10, longitude: 10, recordedAt: now }];

    await expect(authService.submitDriverLocationBatch(user.id, inputs as any)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('Operational status & delayed telemetry evaluation', () => {
  it('evaluates speed >= 1.0 m/s as MOVING when online and fresh', () => {
    const now = Date.now();
    const status = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: 1.5,
      },
      now,
    });
    expect(status).toBe('MOVING');

    const statusExact = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: 1.0,
      },
      now,
    });
    expect(statusExact).toBe('MOVING');
  });

  it('evaluates speed < 1.0 m/s as STOPPED when outside geofence', () => {
    const now = Date.now();
    const status = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: 0.8,
      },
      now,
    });
    expect(status).toBe('STOPPED');

    const statusZero = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: 0,
      },
      now,
    });
    expect(statusZero).toBe('STOPPED');

    const statusNullSpeed = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: null,
      },
      now,
    });
    expect(statusNullSpeed).toBe('STOPPED');
  });

  it('evaluates point recorded > 5 minutes ago as STOPPED even with high speed (stale fallback)', () => {
    const now = Date.now();
    // 6 minutes ago = 360,000 ms
    const sixMinutesAgo = new Date(now - 6 * 60 * 1000).toISOString();
    const status = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: {
        recorded_at: sixMinutesAgo,
        speed: 10.0, // 36 km/h, but stale!
      },
      now,
    });
    expect(status).toBe('STOPPED');
  });

  it('evaluates driver without active shift or offline as OFFLINE', () => {
    const now = Date.now();
    const statusNoShift = computeOperationalStatus({
      hasActiveShift: false,
      isOnline: true,
      isInsideGeofence: false,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: 5.0,
      },
      now,
    });
    expect(statusNoShift).toBe('OFFLINE');

    const statusOffline = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: false,
      isInsideGeofence: false,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: 5.0,
      },
      now,
    });
    expect(statusOffline).toBe('OFFLINE');
  });

  it('evaluates driver inside geofence as AT_RESTAURANT', () => {
    const now = Date.now();
    const status = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: true,
      location: {
        recorded_at: new Date(now - 2000).toISOString(),
        speed: 5.0,
      },
      now,
    });
    expect(status).toBe('AT_RESTAURANT');
  });

  it('ensures older recorded_at point does not displace newer point when chronological ordering is applied', () => {
    const now = Date.now();
    const newerPoint = {
      clientLocationId: 'p-new',
      recorded_at: new Date(now - 5000).toISOString(),
      speed: 0.2, // STOPPED
      latitude: 30.1,
      longitude: 31.1,
    };
    const olderDelayedPoint = {
      clientLocationId: 'p-old-delayed',
      recorded_at: new Date(now - 60000).toISOString(),
      speed: 8.5, // MOVING
      latitude: 30.0,
      longitude: 31.0,
    };

    // Even if out-of-order points arrive or are sorted, ORDER BY recorded_at DESC selects the newest point
    const points = [olderDelayedPoint, newerPoint];
    const sorted = [...points].sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );

    expect(sorted[0].clientLocationId).toBe('p-new');

    const status = computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: sorted[0],
      now,
    });
    expect(status).toBe('STOPPED');
  });
});
