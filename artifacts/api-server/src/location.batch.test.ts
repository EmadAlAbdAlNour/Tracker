import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as authService from './services/authService';
import * as dbModule from '@workspace/db';
import { shiftsTable } from '@workspace/db';

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
          // where used by driver and shift queries -> return object with orderBy and limit
          where: () => ({ orderBy: () => ({ limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }), limit: async () => (table?.name === 'shifts' ? [shift] : [driver]) }),
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
    expect(Array.isArray(res.acceptedClientIds)).toBe(true);
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

  it('rejects when no active shift', async () => {
    const user = makeUser('u3');
    const driver = makeDriver(user.id, 'd3');
    vi.spyOn(authService as any, 'getDriverByUserId').mockResolvedValue(driver as any);

    // mock db.select to return empty shifts (for shiftsTable path) and ensure driver lookup works
    dbModule.db.select = () => ({
      from: (table: any) => {
        // Check if this is the shiftsTable by comparing table reference
        const isShiftsTable = table === shiftsTable;
        return {
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
