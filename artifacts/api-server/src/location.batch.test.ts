import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as authService from './services/authService';
import * as dbModule from '@workspace/db';
import { shiftsTable } from '@workspace/db';
import { computeOperationalStatus } from './services/fleetService';
import * as libAuth from './lib/auth';
import * as settingsService from './services/settingsService';

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

describe('Telemetry device-authorization fix regression suite', () => {
  const user = makeUser('u-telemetry');
  const driver = makeDriver(user.id, 'd-telemetry');
  const authorizedDevice = {
    id: '05a65299-277d-47d3-a7e9-3493fda3267d', // DB primary key (devices.id)
    driverId: driver.id,
    deviceIdentifier: 'a67b29cb-53c4-4913-bc0d-439bf22c70c4', // Client installation UUID (devices.deviceIdentifier)
    authorized: true,
  };
  const activeShift = makeShift('shift-telemetry-1', driver.id);

  function setupMocks(deviceRow: any = authorizedDevice) {
    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);
    vi.spyOn(libAuth, 'getUserById').mockResolvedValue(user as any);

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === 'shifts') return [activeShift];
              if (table === dbModule.devicesTable || table?.name === 'devices') return deviceRow ? [deviceRow] : [];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === 'shifts') return [activeShift];
            if (table === dbModule.devicesTable || table?.name === 'devices') return deviceRow ? [deviceRow] : [];
            return [driver];
          },
        }),
      }),
    })) as any;

    const pool = (dbModule as any).pool;
    vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ client_location_id: 'c-test-1' }] } as any);
  }

  const sampleInputs = [
    { clientLocationId: 'c-test-1', latitude: 30.418, longitude: 31.562, recordedAt: new Date().toISOString() },
  ];

  it('Case A: Existing production mobile compatibility - accepts client deviceIdentifier (from x-device-id)', async () => {
    setupMocks(authorizedDevice);

    // Mobile sends x-device-id = client installation UUID (authorizedDevice.deviceIdentifier)
    const clientInstallationId = authorizedDevice.deviceIdentifier;
    const res = await authService.submitDriverLocationBatch(
      user.id,
      sampleInputs as any,
      clientInstallationId,
      activeShift.id,
    );
    expect(res.accepted).toBe(1);
    expect(res.acceptedClientIds).toContain('c-test-1');
  });

  it('Case B: JWT authority - accepts verified devices.id from telemetry JWT even when x-device-id is absent', async () => {
    setupMocks(authorizedDevice);

    // Telemetry JWT contains authorizedDevice.id in payload.deviceId
    const jwtDeviceId = authorizedDevice.id;
    const res = await authService.submitDriverLocationBatch(
      user.id,
      sampleInputs as any,
      jwtDeviceId,
      activeShift.id,
    );
    expect(res.accepted).toBe(1);
    expect(res.acceptedClientIds).toContain('c-test-1');
  });

  it('Case C: Wrong device rejection - rejects device identifier matching neither id nor deviceIdentifier with 403 DEVICE_UNAUTHORIZED', async () => {
    setupMocks(authorizedDevice);

    await expect(
      authService.submitDriverLocationBatch(
        user.id,
        sampleInputs as any,
        'unrelated-different-device-uuid',
        activeShift.id,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'DEVICE_UNAUTHORIZED',
      message: 'Device authorization has been revoked or replaced',
    });
  });

  it('Case D: Header cannot override JWT - verified JWT deviceId retains precedence over x-device-id header', async () => {
    setupMocks(authorizedDevice);

    // Route resolution logic:
    // const callerDeviceId = req.user?.deviceId || (req.headers["x-device-id"] as string);
    const resolveCallerDeviceId = (req: { user?: { deviceId?: string }; headers: Record<string, string | undefined> }) =>
      req.user?.deviceId || (req.headers['x-device-id'] as string);

    // D1: Valid JWT deviceId with an unrelated x-device-id header -> callerDeviceId resolves to verified JWT deviceId
    const reqWithUnrelatedHeader = {
      user: { deviceId: authorizedDevice.id },
      headers: { 'x-device-id': 'unrelated-rogue-device' },
    };
    const resolvedId1 = resolveCallerDeviceId(reqWithUnrelatedHeader);
    expect(resolvedId1).toBe(authorizedDevice.id);
    expect(resolvedId1).not.toBe('unrelated-rogue-device');

    // Request succeeds because verified JWT deviceId is the authorized device
    const res1 = await authService.submitDriverLocationBatch(
      user.id,
      sampleInputs as any,
      resolvedId1,
      activeShift.id,
    );
    expect(res1.accepted).toBe(1);

    // D2: Invalid/rogue JWT deviceId with authorized x-device-id header -> header cannot override JWT
    const reqWithInvalidJwt = {
      user: { deviceId: 'unauthorized-jwt-device' },
      headers: { 'x-device-id': authorizedDevice.deviceIdentifier },
    };
    const resolvedId2 = resolveCallerDeviceId(reqWithInvalidJwt);
    expect(resolvedId2).toBe('unauthorized-jwt-device');

    // Request fails with 403 because untrusted header was not allowed to override the JWT
    await expect(
      authService.submitDriverLocationBatch(
        user.id,
        sampleInputs as any,
        resolvedId2,
        activeShift.id,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'DEVICE_UNAUTHORIZED',
    });
  });

  it('Case E: Existing authorization behavior - rejects when authorized device is revoked or missing', async () => {
    setupMocks(null); // No authorized device returned from DB

    await expect(
      authService.submitDriverLocationBatch(
        user.id,
        sampleInputs as any,
        authorizedDevice.deviceIdentifier,
        activeShift.id,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'DEVICE_UNAUTHORIZED',
      message: 'Driver device is not authorized or has been revoked',
    });
  });

  it('Consistency: startDriverShift accepts both device.id and device.deviceIdentifier, rejects foreign device', async () => {
    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);
    vi.spyOn(libAuth, 'getUserById').mockResolvedValue(user as any);
    vi.spyOn(settingsService, 'getRestaurantSettings').mockResolvedValue({ enabled: false } as any);

    // Mock DB select: for devices return authorizedDevice, for shifts return empty (no existing shift)
    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === 'shifts') return [];
              if (table === dbModule.devicesTable || table?.name === 'devices') return [authorizedDevice];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === 'shifts') return [];
            if (table === dbModule.devicesTable || table?.name === 'devices') return [authorizedDevice];
            return [driver];
          },
        }),
      }),
    })) as any;

    dbModule.db.insert = (() => ({
      values: () => ({
        returning: async () => [{ id: 'new-shift-test-1', driverId: driver.id, status: 'ACTIVE' }],
      }),
    })) as any;

    // Accepts client deviceIdentifier
    const shift1 = await authService.startDriverShift(user.id, authorizedDevice.deviceIdentifier);
    expect(shift1).toBeDefined();
    expect(shift1.id).toBe('new-shift-test-1');

    // Accepts device.id
    const shift2 = await authService.startDriverShift(user.id, authorizedDevice.id);
    expect(shift2).toBeDefined();
    expect(shift2.id).toBe('new-shift-test-1');

    // Rejects foreign device
    await expect(
      authService.startDriverShift(user.id, 'foreign-device-uuid'),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'DEVICE_UNAUTHORIZED',
    });
  });
});

