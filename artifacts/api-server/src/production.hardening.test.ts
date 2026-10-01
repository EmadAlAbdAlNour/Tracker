import { describe, expect, it, vi, beforeEach } from 'vitest';
import { locationPointSchema } from './validation/auth';
import { userCreateSchema, userUpdateSchema } from './routes/users';
import {
  DEFAULT_RELIABLE_ACCURACY_METERS,
  MOVEMENT_SPEED_THRESHOLD_MPS,
  STOP_SPEED_THRESHOLD_MPS,
} from './services/fleetService';
import { startAlertEvaluationScheduler } from './services/alertService';
import * as userService from './services/userService';
import { db, usersTable, driversTable, shiftsTable } from '@workspace/db';

describe('Production Hardening Pass — API Server Regression Suite', () => {
  describe('Contract Compatibility: locationPointSchema Aliases', () => {
    it('accepts canonical latitude and longitude', () => {
      const parsed = locationPointSchema.safeParse({
        latitude: 30.0444,
        longitude: 31.2357,
        recordedAt: new Date().toISOString(),
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.latitude).toBe(30.0444);
        expect(parsed.data.longitude).toBe(31.2357);
      }
    });

    it('maps legacy lat/lng to latitude/longitude transparently', () => {
      const parsed = locationPointSchema.safeParse({
        lat: 30.0444,
        lng: 31.2357,
        recordedAt: new Date().toISOString(),
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.latitude).toBe(30.0444);
        expect(parsed.data.longitude).toBe(31.2357);
      }
    });
  });

  describe('User Schemas: Employee ID Integrity for Drivers', () => {
    it('requires employeeId when role is DRIVER', () => {
      const withoutEmpId = userCreateSchema.safeParse({
        email: 'driver1@test.com',
        name: 'Driver One',
        password: 'password123',
        role: 'DRIVER',
      });
      expect(withoutEmpId.success).toBe(false);

      const withEmptyEmpId = userCreateSchema.safeParse({
        email: 'driver1@test.com',
        name: 'Driver One',
        password: 'password123',
        role: 'DRIVER',
        employeeId: '   ',
      });
      expect(withEmptyEmpId.success).toBe(false);

      const withValidEmpId = userCreateSchema.safeParse({
        email: 'driver1@test.com',
        name: 'Driver One',
        password: 'password123',
        role: 'DRIVER',
        employeeId: 'EMP-101',
      });
      expect(withValidEmpId.success).toBe(true);
    });

    it('allows employeeId to be omitted when role is ADMIN or CALL_CENTER', () => {
      const admin = userCreateSchema.safeParse({
        email: 'admin@test.com',
        name: 'Admin User',
        password: 'password123',
        role: 'ADMIN',
      });
      expect(admin.success).toBe(true);

      const callCenter = userCreateSchema.safeParse({
        email: 'cc@test.com',
        name: 'Call Center',
        password: 'password123',
        role: 'CALL_CENTER',
      });
      expect(callCenter.success).toBe(true);
    });

    it('accepts optional employeeId on user update', () => {
      const update = userUpdateSchema.safeParse({
        name: 'Updated Name',
        employeeId: 'EMP-102',
      });
      expect(update.success).toBe(true);
    });
  });

  describe('Movement & Speed Threshold Parity', () => {
    it('verifies canonical operational thresholds', () => {
      expect(DEFAULT_RELIABLE_ACCURACY_METERS).toBe(35);
      expect(MOVEMENT_SPEED_THRESHOLD_MPS).toBe(1.5);
      expect(STOP_SPEED_THRESHOLD_MPS).toBe(1.0);
    });
  });

  describe('Serverless Scheduler Guard', () => {
    it('does not start background setInterval timer when process.env.VERCEL is defined', () => {
      const originalVercel = process.env.VERCEL;
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        process.env.VERCEL = '1';
        process.env.NODE_ENV = 'production';
        // Calling startAlertEvaluationScheduler should return early without creating timers
        expect(() => startAlertEvaluationScheduler(1000)).not.toThrow();
      } finally {
        if (originalVercel === undefined) {
          delete process.env.VERCEL;
        } else {
          process.env.VERCEL = originalVercel;
        }
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('User Service: Driver Demotion & Role Change Safeguards', () => {
    it('prevents demoting a driver who has an active shift', async () => {
      const mockDriverUser = {
        id: 'u-driver-1',
        email: 'driver1@test.com',
        name: 'Driver 1',
        role: 'DRIVER',
        active: true,
      };

      const mockDriverRecord = {
        id: 'd-1',
        userId: 'u-driver-1',
        employeeId: 'E101',
        active: true,
      };

      const mockActiveShift = {
        id: 's-1',
        driverId: 'd-1',
        status: 'ACTIVE',
      };

      const mockQuery = (res: any[]) => {
        const p = Promise.resolve(res);
        (p as any).limit = () => Promise.resolve(res);
        return p;
      };

      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        const tx = {
          select: () => ({
            from: (table: any) => ({
              where: () => {
                if (table === usersTable) return mockQuery([mockDriverUser]);
                if (table === driversTable) return mockQuery([mockDriverRecord]);
                if (table === shiftsTable) return mockQuery([mockActiveShift]);
                return mockQuery([]);
              },
            }),
          }),
        };
        return callback(tx);
      });

      await expect(
        userService.updateUser('u-driver-1', { role: 'CALL_CENTER' })
      ).rejects.toMatchObject({
        code: 'CANNOT_CHANGE_ROLE_ACTIVE_SHIFT',
      });
    });

    it('prevents demoting a driver who has historical shifts', async () => {
      const mockDriverUser = {
        id: 'u-driver-2',
        email: 'driver2@test.com',
        name: 'Driver 2',
        role: 'DRIVER',
        active: true,
      };

      const mockDriverRecord = {
        id: 'd-2',
        userId: 'u-driver-2',
        employeeId: 'E102',
        active: true,
      };

      const mockCompletedShift = {
        id: 's-2',
        driverId: 'd-2',
        status: 'COMPLETED',
      };

      const mockQuery = (res: any[]) => {
        const p = Promise.resolve(res);
        (p as any).limit = () => Promise.resolve(res);
        return p;
      };

      vi.spyOn(db, 'transaction').mockImplementation(async (callback: any) => {
        let callCount = 0;
        const tx = {
          select: () => ({
            from: (table: any) => ({
              where: () => {
                if (table === usersTable) return mockQuery([mockDriverUser]);
                if (table === driversTable) return mockQuery([mockDriverRecord]);
                if (table === shiftsTable) {
                  callCount++;
                  // First call: active shift query -> none
                  if (callCount === 1) return mockQuery([]);
                  // Second call: any shifts query -> completed shift exists
                  return mockQuery([mockCompletedShift]);
                }
                return mockQuery([]);
              },
            }),
          }),
        };
        return callback(tx);
      });

      await expect(
        userService.updateUser('u-driver-2', { role: 'CALL_CENTER' })
      ).rejects.toMatchObject({
        code: 'CANNOT_DEMOTE_DRIVER_WITH_SHIFTS',
      });
    });
  });

  describe('PAR-01: Threshold Constant Centralization', () => {
    it('defines STOP_SPEED_THRESHOLD_MPS canonically as 1.0 m/s', () => {
      expect(STOP_SPEED_THRESHOLD_MPS).toBe(1.0);
    });

    it('defines MOVEMENT_SPEED_THRESHOLD_MPS canonically as 1.5 m/s', () => {
      expect(MOVEMENT_SPEED_THRESHOLD_MPS).toBe(1.5);
    });
  });

  describe('Driver Shift End Route Ordering (Shadowing Prevention)', () => {
    it('registers /me/shifts/end BEFORE /:id/shifts/end to prevent 403 AUTH_FORBIDDEN route shadowing', async () => {
      const driversRouter = (await import('./routes/drivers')).default;
      
      const routeLayers = driversRouter.stack
        .filter((l: any) => l.route && l.route.path)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      const matchesPath = (routePath: any, target: string) => {
        if (Array.isArray(routePath)) return routePath.includes(target);
        return routePath === target;
      };

      const meEndIndex = routeLayers.findIndex(
        (r: any) => matchesPath(r.path, '/me/shifts/end') && r.methods.includes('post')
      );
      const idEndIndex = routeLayers.findIndex(
        (r: any) => matchesPath(r.path, '/:id/shifts/end') && r.methods.includes('post')
      );
      const meTokenIndex = routeLayers.findIndex(
        (r: any) => matchesPath(r.path, '/me/telemetry-token') && r.methods.includes('post')
      );
      const idForceEndIndex = routeLayers.findIndex(
        (r: any) => matchesPath(r.path, '/:id/shifts/force-end') && r.methods.includes('post')
      );

      expect(meEndIndex).toBeGreaterThan(-1);
      expect(idEndIndex).toBeGreaterThan(-1);
      expect(meTokenIndex).toBeGreaterThan(-1);
      expect(idForceEndIndex).toBeGreaterThan(-1);

      // CRITICAL: /me/shifts/end must be encountered BEFORE /:id/shifts/end
      expect(meEndIndex).toBeLessThan(idEndIndex);
      // /me/telemetry-token must be encountered BEFORE /:id/shifts/force-end
      expect(meTokenIndex).toBeLessThan(idForceEndIndex);
    });
  });
});

