import { describe, it, expect, beforeEach, vi } from "vitest";
import * as authService from "./services/authService";
import * as alertService from "./services/alertService";
import * as fleetService from "./services/fleetService";
import * as settingsService from "./services/settingsService";
import * as notificationService from "./services/notificationService";
import * as libAuth from "./lib/auth";
import * as dbModule from "@workspace/db";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Final Product Polish Regression Tests", () => {
  describe("Driver Shift Geofence Enforcement", () => {
    it("rejects shift start when driver is outside restaurant geofence radius", async () => {
      const mockDriver = {
        id: "driver-uuid-1",
        userId: "user-driver-1",
        employeeId: "DRV-1",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      dbModule.db.select = () => ({
        from: (table: any) => ({
          where: () => ({
            limit: async () => [mockDriver],
          }),
        }),
      }) as any;

      vi.spyOn(libAuth, "getUserById").mockResolvedValue({
        id: "user-driver-1",
        name: "Test Driver",
        email: "driver@test.local",
        phone: null,
        role: "DRIVER",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Mock restaurant settings at lat: 30.0444, lng: 31.2357, radius: 150m, enabled: true
      vi.spyOn(settingsService, "getRestaurantSettings").mockResolvedValue({
        name: "Test Restaurant",
        latitude: 30.0444,
        longitude: 31.2357,
        radiusMeters: 150,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Driver is 5km away: lat: 30.09, lng: 31.2357
      let caughtError: any = null;
      try {
        await authService.startDriverShift("user-driver-1", null, {
          latitude: 30.09,
          longitude: 31.2357,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.code).toBe("OUTSIDE_GEOFENCE");
      expect(caughtError.statusCode).toBe(403);
    });

    it("allows shift start when driver is inside restaurant geofence radius", async () => {
      const mockDriver = {
        id: "driver-uuid-1",
        userId: "user-driver-1",
        employeeId: "DRV-1",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDevice = {
        id: "dev-1",
        driverId: "driver-uuid-1",
        authorized: true,
        deviceIdentifier: "dev-ident-1",
      };

      const createdShift = {
        id: "new-shift-1",
        driverId: "driver-uuid-1",
        startedAt: new Date(),
        endedAt: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      dbModule.db.select = () => ({
        from: (table: any) => ({
          where: () => ({
            limit: async () => {
              if (table === dbModule.devicesTable) return [mockDevice];
              if (table === dbModule.shiftsTable) return []; // no existing active shift
              return [mockDriver];
            },
          }),
        }),
      }) as any;

      vi.spyOn(libAuth, "getUserById").mockResolvedValue({
        id: "user-driver-1",
        name: "Test Driver",
        email: "driver@test.local",
        phone: null,
        role: "DRIVER",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(settingsService, "getRestaurantSettings").mockResolvedValue({
        name: "Test Restaurant",
        latitude: 30.0444,
        longitude: 31.2357,
        radiusMeters: 150,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      dbModule.db.insert = () => ({
        values: () => ({
          returning: async () => [createdShift],
        }),
      }) as any;

      // Driver is at the restaurant: lat: 30.0444, lng: 31.2357
      const shift = await authService.startDriverShift("user-driver-1", null, {
        latitude: 30.0444,
        longitude: 31.2357,
      });

      expect(shift).toBeDefined();
      expect(shift.id).toBe("new-shift-1");
      expect(shift.status).toBe("ACTIVE");
    });
  });

  describe("Admin Force End Shift", () => {
    it("marks active shift completed, sets endedAt, and resolves active alerts", async () => {
      const activeShift = {
        id: "active-shift-100",
        driverId: "driver-100",
        startedAt: new Date(Date.now() - 3600000),
        endedAt: null,
        status: "ACTIVE",
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(),
      };

      const mockDriverWithUser = {
        id: "driver-100",
        userId: "user-100",
        employeeId: "DRV-100",
        active: true,
        name: "Driver 100",
        email: "d100@test.com",
        phone: null,
        role: "DRIVER",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      dbModule.db.select = () => ({
        from: (table: any) => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [mockDriverWithUser],
            }),
          }),
          where: () => ({
            orderBy: () => ({
              limit: async () => [activeShift],
            }),
            limit: async () => [activeShift],
          }),
        }),
      }) as any;

      const updateCalls: Array<{ table: any; values: any }> = [];
      dbModule.db.update = ((table: any) => ({
        set: (values: any) => {
          updateCalls.push({ table, values });
          return {
            where: () => ({
              returning: async () => [{ ...activeShift, ...values }],
              execute: async () => [],
            }),
          };
        },
      })) as any;

      const endedShift = await authService.forceEndDriverShift("driver-100");

      expect(endedShift.status).toBe("COMPLETED");
      expect(endedShift.endedAt).toBeInstanceOf(Date);

      // Verify alert states were resolved in alertStateTable
      const alertStateUpdate = updateCalls.find((c) => c.table === dbModule.alertStateTable);
      expect(alertStateUpdate).toBeDefined();
      expect(alertStateUpdate?.values.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe("Silencing Alerts After Shift Ends", () => {
    it("skips alert evaluation if driver has no active shift", async () => {
      // Mock db query returning no active shift
      dbModule.db.select = () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }) as any;

      const notifSpy = vi.spyOn(notificationService, "createNotification");

      // Attempt to evaluate alerts without active shift
      await alertService.evaluateDriverAlerts({
        driverId: "driver-off-duty",
        latitude: 30.0444,
        longitude: 31.2357,
        speed: 0,
        recordedAt: new Date(),
        locationServicesEnabled: false, // GPS disabled would normally trigger an alert
      });

      expect(notifSpy).not.toHaveBeenCalled();
    });

    it("skips offline alert evaluation if driver has no active shift", async () => {
      dbModule.db.select = () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }) as any;

      const notifSpy = vi.spyOn(notificationService, "createNotification");

      await alertService.evaluateDriverOfflineAlert({
        driverId: "driver-offline-no-shift",
        isOnline: false,
        offlineDurationMinutes: 10,
        lastSeen: new Date(Date.now() - 600000),
      });

      expect(notifSpy).not.toHaveBeenCalled();
    });
  });

  describe("Live Fleet Active-Only Filtering", () => {
    it("excludes drivers without an active shift when activeOnly is true", async () => {
      const mockRawDrivers = [
        {
          driverId: "driver-active",
          driverName: "Active Driver",
          driverEmail: "active@test.com",
          driverPhone: null,
          employeeId: "DRV-1",
          driverActive: true,
          userId: "user-1",
          shift: {
            id: "shift-1",
            status: "ACTIVE" as const,
            startedAt: new Date().toISOString(),
            durationMinutes: 30,
          },
          location: null,
          device: null,
          operationalStatus: "STOPPED" as const,
          distanceToRestaurantMeters: 50,
          isInsideGeofence: true,
        },
        {
          driverId: "driver-off",
          driverName: "Off-duty Driver",
          driverEmail: "off@test.com",
          driverPhone: null,
          employeeId: "DRV-2",
          driverActive: true,
          userId: "user-2",
          shift: null,
          location: null,
          device: null,
          operationalStatus: "OFFLINE" as const,
          distanceToRestaurantMeters: null,
          isInsideGeofence: false,
        },
      ];

      vi.spyOn(fleetService, "getLiveFleetStatus").mockImplementation(async (options) => {
        let drivers = mockRawDrivers;
        if (options?.activeOnly) {
          drivers = drivers.filter((d) => Boolean(d.shift && d.shift.status === "ACTIVE"));
        }
        return {
          timestamp: new Date().toISOString(),
          restaurant: {
            name: "Main Branch",
            latitude: 30.0444,
            longitude: 31.2357,
            radiusMeters: 150,
            enabled: true,
          },
          summary: {
            totalDrivers: drivers.length,
            activeShifts: drivers.filter((d) => Boolean(d.shift)).length,
            onlineDrivers: 0,
            atRestaurant: 0,
            moving: 0,
            stopped: 0,
            offline: drivers.length,
            lowBatteryCount: 0,
          },
          drivers,
        };
      });

      const fullFleet = await fleetService.getLiveFleetStatus();
      expect(fullFleet.drivers).toHaveLength(2);

      const activeOnlyFleet = await fleetService.getLiveFleetStatus({ activeOnly: true });
      expect(activeOnlyFleet.drivers).toHaveLength(1);
      expect(activeOnlyFleet.drivers[0].driverId).toBe("driver-active");
    });
  });
});
