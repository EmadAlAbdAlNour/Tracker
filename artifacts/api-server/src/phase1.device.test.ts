// Phase 1 device & role tests - service-level with DB boundary mocks
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the modules under test
import * as authService from './services/authService';
import * as libAuth from './lib/auth';
import * as dbModule from '@workspace/db';

// Helpers to build test data
function makeUser(id: string, role: string, email = 'u@t.local') {
  return { id, name: 'Test', email, phone: null, role, active: true } as any;
}

function makeDriver(userId: string, driverId: string) {
  return { id: driverId, userId, employeeId: 'E1', active: true } as any;
}

function makeDevice(id: string, driverId: string, authorized = false, deviceIdentifier = 'dev1') {
  return { id, driverId, platform: 'android', deviceIdentifier, appVersion: '1.0', lastSeen: null, lastLocationAt: null, authorized } as any;
}

function makeRefreshTokenRow(id: string, userId: string, deviceId: string | null = null) {
  return { id, userId, tokenHash: 'hash', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), revokedAt: null, deviceId, createdAt: new Date() } as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // default to accepting password checks in unit tests
  vi.spyOn(libAuth, 'verifyPassword').mockResolvedValue(true as any);
  vi.spyOn(libAuth, 'revokeRefreshTokenByHash').mockResolvedValue(undefined as any);
});

describe('Phase1 service-level device & role tests (mocks at DB boundary)', () => {
  it('ADMIN can have concurrent devices and refresh independently (logic exercised)', async () => {
    // Arrange: user lookup returns ADMIN
    const admin = makeUser('u-admin', 'ADMIN', 'admin@t.local');
    vi.spyOn(libAuth, 'getUserByEmailOrPhone').mockResolvedValue(admin as any);

    // skip actual password verification
    vi.spyOn(libAuth, 'verifyPassword').mockResolvedValue(true as any);

    // storeRefreshToken will be observed but not write to DB
    const storeSpy = vi.spyOn(libAuth, 'storeRefreshToken').mockResolvedValue(undefined as any);
    // findValidRefreshToken should return rows when asked during refresh
    vi.spyOn(libAuth, 'findValidRefreshToken').mockImplementation(async (raw, userId) => makeRefreshTokenRow('rt-1', userId, null) as any);

    // Act: login twice (device metadata is optional for ADMIN)
    const res1 = await authService.loginUser(admin.email, 'Password!', { platform: 'web', deviceIdentifier: 'a', appVersion: '1' });
    const res2 = await authService.loginUser(admin.email, 'Password!', { platform: 'web', deviceIdentifier: 'b', appVersion: '1' });

    // Assert
    expect(res1.accessToken).toBeDefined();
    expect(res2.accessToken).toBeDefined();
    // storeRefreshToken called twice (one per login)
    expect(storeSpy).toHaveBeenCalledTimes(2);

    // Ensure getUserById resolves to avoid real DB calls during refresh
    vi.spyOn(libAuth, 'getUserById').mockResolvedValue(admin as any);

    // Act: refresh both using actual returned refresh tokens
    const r1 = await authService.refreshSession(res1.refreshToken);
    const r2 = await authService.refreshSession(res2.refreshToken);
    expect(r1.accessToken).toBeDefined();
    expect(r2.accessToken).toBeDefined();
  });

  it('DRIVER single-device lifecycle: first login binds, same device allowed, different device rejected, refresh bound to device', async () => {
    // Arrange: user and driver
    const user = makeUser('u-driver', 'DRIVER', 'drv@t.local');
    const driver = makeDriver(user.id, 'd1');
    vi.spyOn(libAuth, 'getUserByEmailOrPhone').mockResolvedValue(user as any);
    // getDriverByUserId is implemented in authService; mock the service-local function to return our driver
    vi.spyOn(authService, 'getDriverByUserId').mockResolvedValue(driver as any);
    // Ensure getUserById resolves during refresh flows to avoid touching the real DB
    vi.spyOn(libAuth, 'getUserById').mockResolvedValue(user as any);

    // Mock db.select for authorized device lookup and driver lookup
    dbModule.db.select = () => ({
      from: (table: any) => ({
        where: () => ({
          limit: async () => {
            // if querying drivers table, return the driver
            if (table === (dbModule as any).driversTable) {
              return [driver];
            }
            // otherwise (devices etc) return empty list (no authorized device)
            return [];
          },
        }),
      }),
    }) as any;

    // Mock registerDriverDevice to return a created device id (registerDriverDevice uses db.insert internally; mock db.insert to avoid touching real DB)
    const createdDevice = makeDevice('dev-A', driver.id, false, 'device-A');
    dbModule.db.insert = () => ({
      values: (vals: any) => ({
        returning: async () => {
          // return created device matching the deviceIdentifier provided
          if (vals && vals.deviceIdentifier === 'device-B') {
            return [makeDevice('dev-B', driver.id, false, 'device-B')];
          }
          return [createdDevice];
        },
      }),
    }) as any;

    // spy on db.update for setting authorized true (called when binding)
    dbModule.db.update = () => ({ set: () => ({ where: () => ({ returning: async () => [{ ...createdDevice, authorized: true }] }) }) }) as any;
    dbModule.db.delete = () => ({ where: async () => [] }) as any;

    // storeRefreshToken should be observed and receive device id
    const storeSpy = vi.spyOn(libAuth, 'storeRefreshToken').mockResolvedValue(undefined as any);

    // Act: first device login
    const first = await authService.loginUser(user.email, 'Password!', { platform: 'android', deviceIdentifier: 'device-A', appVersion: '1.0' });
    expect(first.refreshToken).toBeDefined();
    // when binding, storeRefreshToken should be called with device id
    expect(storeSpy).toHaveBeenCalledWith(user.id, expect.any(String), createdDevice.id);

    // Simulate that authorized device exists and matches registered device for same-device login
    dbModule.db.select = () => ({ from: () => ({ where: () => ({ limit: async () => [ { ...createdDevice, authorized: true } ] }) }) }) as any;

    // Act: same device login
    const sameLogin = await authService.loginUser(user.email, 'Password!', { platform: 'android', deviceIdentifier: 'device-A', appVersion: '1.0' });
    expect(sameLogin.refreshToken).toBeDefined();

    // Act: different device attempt -> override internal registerDriverDevice to return different id for this test
    authService.__setTestRegisterDriverDeviceOverride(async (_userId: string, _input: any) => makeDevice('dev-B', driver.id, false, 'device-B'));
    // authorized still returns device A
    dbModule.db.select = () => ({ from: () => ({ where: () => ({ limit: async () => [ { ...createdDevice, authorized: true } ] }) }) }) as any;

    await expect(authService.loginUser(user.email, 'Password!', { platform: 'android', deviceIdentifier: 'device-B', appVersion: '1.0' })).rejects.toMatchObject({ statusCode: 403 });
    // clear override
    (authService as any).__testRegisterDriverDeviceOverride = null;

    // Now test refresh binding: findValidRefreshToken should return a token row with deviceId = createdDevice.id
    vi.spyOn(libAuth, 'findValidRefreshToken').mockResolvedValue(makeRefreshTokenRow('rt1', user.id, createdDevice.id) as any);

    // Ensure getUserById resolves to avoid real DB calls during refresh
    vi.spyOn(libAuth, 'getUserById').mockResolvedValue(user as any);

    // Mock db.select for device existence to return authorized true
    dbModule.db.select = () => ({ from: () => ({ where: () => ({ limit: async () => [ { ...createdDevice, authorized: true } ] }) }) }) as any;

    const refreshed = await authService.refreshSession(first.refreshToken);
    expect(refreshed.refreshToken).toBeDefined();

    // If device unauthorized, refresh should fail
    vi.spyOn(libAuth, 'findValidRefreshToken').mockResolvedValue(makeRefreshTokenRow('rt1', user.id, createdDevice.id) as any);
    // return device row with authorized=false
    dbModule.db.select = () => ({ from: () => ({ where: () => ({ limit: async () => [ { ...createdDevice, authorized: false } ] }) }) }) as any;

    await expect(authService.refreshSession(first.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('ADMIN device reset revokes tokens bound to that device and allows new device after reset', async () => {
    const user = makeUser('u-driver2', 'DRIVER', 'drv2@t.local');
    const driver = makeDriver(user.id, 'd2');
    // Mock service-local getDriverByUserId to return our driver
    vi.spyOn(authService, 'getDriverByUserId').mockResolvedValue(driver as any);

    // Simulate an authorized device existing
    const authDev = makeDevice('dev-old', driver.id, true, 'old-device');
    dbModule.db.select = () => ({ from: () => ({ where: () => ({ limit: async () => [ authDev ] }) }) }) as any;

    // spy on db.update marking authorized false
    dbModule.db.update = () => ({ set: () => ({ where: () => Promise.resolve([{ ...authDev, authorized: false }]) }) }) as any;
    dbModule.db.delete = () => ({ where: async () => [] }) as any;

    // spy on revokeRefreshTokensByDevice
    const revokeSpy = vi.spyOn(libAuth, 'revokeRefreshTokensByDevice').mockResolvedValue(undefined as any);

    const res = await authService.resetDriverDeviceByDriverId(driver.id);
    expect(res).toBe(true);
    expect(revokeSpy).toHaveBeenCalledWith(authDev.id);

    // After reset, new device registration should be allowed: mock registerDriverDevice to return new device
    vi.spyOn(authService, 'registerDriverDevice').mockResolvedValue(makeDevice('dev-new', driver.id, false, 'new-dev') as any);
    // When checking authorized device, return none — but ensure driver lookup still returns the driver
    dbModule.db.select = () => ({
      from: (table: any) => ({
        where: () => ({
          limit: async () => {
            if (table === (dbModule as any).driversTable) return [driver];
            return [];
          },
        }),
      }),
    }) as any;

    // Ensure getUserByEmailOrPhone resolves for login
    vi.spyOn(libAuth, 'getUserByEmailOrPhone').mockResolvedValue(user as any);
    const login = await authService.loginUser(user.email, 'Password!', { platform: 'android', deviceIdentifier: 'new-dev', appVersion: '1.0' });
    expect(login.refreshToken).toBeDefined();
  });

  it('assignDriverDevice atomically revokes old device, revokes tokens, authorizes new device, and blocks old device from telemetry and login', async () => {
    const user = makeUser('u-driver-replace', 'DRIVER', 'replace@t.local');
    const driver = makeDriver(user.id, 'd-replace');
    vi.spyOn(libAuth, 'getUserById').mockResolvedValue(user as any);
    vi.spyOn(authService, 'getDriverById').mockResolvedValue(driver as any);
    vi.spyOn(authService, 'getDriverByUserId').mockResolvedValue(driver as any);

    const oldDevice = makeDevice('dev-A', driver.id, true, 'device-ident-A');
    const newDevice = makeDevice('dev-B', driver.id, false, 'device-ident-B');

    // Mock db.select for driver lookup and authorized device lookup
    dbModule.db.select = () => ({
      from: (table: any) => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [driver],
          }),
        }),
        where: () => ({
          limit: async () => [newDevice],
        }),
      }),
    }) as any;

    // Mock transaction to track updates
    const updatedDevices: any[] = [];
    const revokedTokens: any[] = [];

    const mockTx = {
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            limit: async () => {
              if (table === (dbModule as any).devicesTable) {
                return [newDevice];
              }
              return [];
            },
            then: (resolve: any) => resolve([oldDevice]),
          }),
        }),
      }),
      update: (table: any) => ({
        set: (vals: any) => ({
          where: (clause: any) => {
            if (table === (dbModule as any).devicesTable) {
              updatedDevices.push(vals);
              return {
                returning: async () => [{ ...newDevice, ...vals, authorized: true }],
              };
            }
            if (table === (dbModule as any).refreshTokensTable) {
              revokedTokens.push(vals);
              return Promise.resolve();
            }
            return Promise.resolve();
          },
        }),
      }),
      insert: () => ({
        values: (vals: any) => ({
          returning: async () => [newDevice],
        }),
      }),
    };

    vi.spyOn(dbModule.db, 'transaction').mockImplementation(async (cb: any) => {
      return cb(mockTx);
    });

    const assigned = await authService.assignDriverDevice(driver.id, {
      deviceIdentifier: 'device-ident-B',
      platform: 'ANDROID',
    });

    expect(assigned).toBeDefined();
    expect(assigned.authorized).toBe(true);
    // Verified that an unauthorization update occurred
    expect(updatedDevices.some((d) => d.authorized === false)).toBe(true);
    // Verified that token revocation occurred
    expect(revokedTokens.length).toBeGreaterThan(0);

    // Now verify that old device A attempting telemetry submission is rejected with 403
    // Simulate that the active authorized device in DB is dev-B
    dbModule.db.select = () => ({
      from: (table: any) => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [driver],
          }),
        }),
        where: () => ({
          limit: async () => {
            if (table === (dbModule as any).driversTable) return [driver];
            return [{ ...newDevice, authorized: true }];
          },
        }),
      }),
    }) as any;

    // Caller device dev-A does NOT match authorized dev-B -> expect 403
    await expect(
      authService.submitDriverLocation(
        user.id,
        { latitude: 24.7136, longitude: 46.6753, recordedAt: new Date().toISOString() },
        'dev-A',
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'DEVICE_UNAUTHORIZED' });

    // Old device A attempting startDriverShift is rejected with 403
    await expect(
      authService.startDriverShift(user.id, 'dev-A'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'DEVICE_UNAUTHORIZED' });
  });
});

