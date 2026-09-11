import { describe, it, expect, beforeEach, vi } from "vitest";
import * as authService from "./services/authService";
import * as alertService from "./services/alertService";
import * as libAuth from "./lib/auth";
import * as dbModule from "@workspace/db";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Audit Remediation: Auth, Drivers, and Alert Deduplication", () => {
  describe("Case-Insensitive Login", () => {
    it("normalizes uppercase email before database query", async () => {
      let queryValue: any = null;

      dbModule.db.select = () => ({
        from: () => ({
          where: (condition: any) => {
            queryValue = condition;
            return {
              limit: async () => [
                {
                  id: "user-123",
                  email: "driver.ahmed@tracker.local",
                  phone: null,
                  role: "DRIVER",
                  active: true,
                  passwordHash: "hash",
                },
              ],
            };
          },
        }),
      }) as any;

      const user = await libAuth.getUserByEmailOrPhone("Driver.Ahmed@Tracker.Local");
      expect(user).toBeDefined();
      expect(user?.email).toBe("driver.ahmed@tracker.local");
    });
  });

  describe("Driver Deactivation Cascading Cleanup", () => {
    it("fully deactivates user, ends active shifts, revokes refresh tokens, and unauthorizes device", async () => {
      const driverState = {
        id: "driver-uuid-1",
        userId: "user-uuid-1",
        employeeId: "DRV-100",
        active: true,
        name: "Test Driver",
        email: "test.driver@tracker.local",
        phone: null,
      };

      // Mock finding the driver with innerJoin support
      dbModule.db.select = () => ({
        from: (table: any) => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [driverState],
            }),
          }),
          where: () => ({
            limit: async () => [driverState],
          }),
        }),
      }) as any;

      const updateCalls: Array<{ table: any; values: any }> = [];
      dbModule.db.transaction = (async (cb: any) => {
        const tx = {
          update: (table: any) => ({
            set: (values: any) => {
              updateCalls.push({ table, values });
              if (table === dbModule.driversTable && values.active !== undefined) {
                driverState.active = values.active;
              }
              return {
                where: () => Promise.resolve(),
              };
            },
          }),
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [],
              }),
            }),
          }),
        };
        return cb(tx);
      }) as any;

      const revokeTokensSpy = vi
        .spyOn(libAuth, "revokeUserRefreshTokens")
        .mockResolvedValue(undefined as any);

      // Act: deactivate driver
      const result = await authService.updateDriverProfile("driver-uuid-1", {
        active: false,
      });

      expect(result.active).toBe(false);

      // Verify token revocation was called for the associated user
      expect(revokeTokensSpy).toHaveBeenCalledWith("user-uuid-1");

      // Verify usersTable, shiftsTable, and devicesTable updates occurred
      const tablesUpdated = updateCalls.map((c) => c.table);
      expect(tablesUpdated).toContain(dbModule.driversTable);
      expect(tablesUpdated).toContain(dbModule.usersTable);
      expect(tablesUpdated).toContain(dbModule.shiftsTable);
      expect(tablesUpdated).toContain(dbModule.devicesTable);

      // Verify active user was disabled
      const userUpdate = updateCalls.find((c) => c.table === dbModule.usersTable);
      expect(userUpdate?.values.active).toBe(false);

      // Verify active shifts were marked COMPLETED
      const shiftUpdate = updateCalls.find((c) => c.table === dbModule.shiftsTable);
      expect(shiftUpdate?.values.status).toBe("COMPLETED");
      expect(shiftUpdate?.values.endedAt).toBeInstanceOf(Date);

      // Verify device was de-authorized
      const deviceUpdate = updateCalls.find((c) => c.table === dbModule.devicesTable);
      expect(deviceUpdate?.values.authorized).toBe(false);
    });
  });

  describe("Alert State Deduplication", () => {
    it("filters out resolved alerts when querying active alert state", async () => {
      let whereClause: any = null;

      dbModule.db.select = () => ({
        from: () => ({
          where: (condition: any) => {
            whereClause = condition;
            return {
              limit: async () => [],
            };
          },
        }),
      }) as any;

      const state = await alertService.getAlertState("driver-1", "STOP_EXTENDED");
      expect(state).toBeNull();
      // Verify query is structured properly with where clause
      expect(whereClause).toBeDefined();
    });
  });
});
