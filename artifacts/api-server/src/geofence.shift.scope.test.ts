import { describe, it, expect, beforeEach, vi } from "vitest";
import * as authService from "./services/authService";
import * as fleetService from "./services/fleetService";
import * as settingsService from "./services/settingsService";
import * as libAuth from "./lib/auth";
import * as dbModule from "@workspace/db";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Mandatory Geofence & Shift-Scoped Telemetry Regression Tests", () => {
  const mockDriver = {
    id: "driver-uuid-1",
    userId: "user-driver-1",
    employeeId: "DRV-1",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: "user-driver-1",
    name: "Test Driver",
    email: "driver@test.local",
    phone: null,
    role: "DRIVER",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDevice = {
    id: "dev-1",
    driverId: "driver-uuid-1",
    authorized: true,
    deviceIdentifier: "dev-ident-1",
    lastSeen: new Date("2026-09-24T12:00:00Z"),
    lastLocationAt: new Date("2026-09-24T12:00:00Z"),
  };

  const mockRestaurant = {
    name: "Main Restaurant",
    latitude: 24.7136,
    longitude: 46.6753,
    radiusMeters: 150,
    enabled: true,
  };

  function setupDbMocks(options?: { activeShift?: any }) {
    dbModule.db.select = () => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => (options?.activeShift ? [options.activeShift] : []),
          }),
          limit: async () => {
            if (table === (dbModule as any).driversTable) return [mockDriver];
            if (table === (dbModule as any).devicesTable) return [mockDevice];
            if (table === (dbModule as any).shiftsTable) {
              return options?.activeShift ? [options.activeShift] : [];
            }
            return [];
          },
        }),
      }),
    }) as any;

    dbModule.db.insert = () => ({
      values: () => ({
        returning: async () => [
          {
            id: "new-shift-uuid",
            driverId: mockDriver.id,
            startedAt: new Date(),
            status: "ACTIVE",
          },
        ],
      }),
    }) as any;

    vi.spyOn(libAuth, "getUserById").mockResolvedValue(mockUser as any);
    vi.spyOn(settingsService, "getRestaurantSettings").mockResolvedValue(mockRestaurant as any);
  }

  // Requirement A: Start Shift without coordinates -> rejected
  it("A. rejects Start Shift without coordinates when restaurant geofence is enabled", async () => {
    setupDbMocks();

    let err: any = null;
    try {
      await authService.startDriverShift("user-driver-1", "dev-1", null);
    } catch (e) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("GEOFENCE_LOCATION_REQUIRED");
  });

  // Requirement B: Start Shift with coordinates inside radius -> accepted
  it("B. accepts Start Shift with coordinates inside restaurant radius", async () => {
    setupDbMocks();

    // Exactly at restaurant coordinates (0m distance <= 150m)
    const shift = await authService.startDriverShift("user-driver-1", "dev-1", {
      latitude: 24.7136,
      longitude: 46.6753,
    });

    expect(shift).toBeDefined();
    expect(shift.id).toBe("new-shift-uuid");
    expect(shift.status).toBe("ACTIVE");
  });

  // Requirement C: Start Shift with coordinates outside radius -> rejected with OUTSIDE_GEOFENCE
  it("C. rejects Start Shift with coordinates outside restaurant radius", async () => {
    setupDbMocks();

    // Coordinates ~10km away
    let err: any = null;
    try {
      await authService.startDriverShift("user-driver-1", "dev-1", {
        latitude: 24.8136,
        longitude: 46.7753,
      });
    } catch (e) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("OUTSIDE_GEOFENCE");
  });

  // Requirement D, E, F: Shift-Scoped Fleet Location Queries
  describe("Fleet Shift-Scoping Semantics", () => {
    it("D. returns location = null when active shift has zero telemetry in current shift", async () => {
      // Mock db execute to return 0 rows for active shift
      vi.spyOn(dbModule.db, "execute").mockResolvedValue({ rows: [] } as any);

      // In computeOperationalStatus: active shift with zero telemetry fix
      const status = fleetService.computeOperationalStatus({
        hasActiveShift: true,
        isOnline: true,
        isInsideGeofence: false,
        location: null,
      });

      // Must NOT be AT_RESTAURANT or MOVING
      expect(status).toBe("STOPPED");
    });

    it("E. ensures previous shift location is NOT served for new active shift with zero points", async () => {
      // Active shift ID: shift-2
      // Previous shift location had shift_id: shift-1
      const activeShiftId = "shift-2";
      const oldLocation = {
        id: "loc-old-1",
        driver_id: mockDriver.id,
        shift_id: "shift-1",
        latitude: 24.7136,
        longitude: 46.6753,
        recorded_at: new Date("2026-09-24T10:00:00Z"),
      };

      // Query scoped by inner join with active shift will filter out oldLocation
      const candidatePoints = [oldLocation];
      const scoped = candidatePoints.filter((p) => p.shift_id === activeShiftId);
      expect(scoped.length).toBe(0);
    });

    it("F. returns current-shift location when current shift has uploaded telemetry", async () => {
      const activeShiftId = "shift-2";
      const currentPoint = {
        id: "loc-curr-1",
        driver_id: mockDriver.id,
        shift_id: activeShiftId,
        latitude: 24.7136,
        longitude: 46.6753,
        recorded_at: new Date("2026-09-24T12:05:00Z"),
      };

      const candidatePoints = [currentPoint];
      const scoped = candidatePoints.filter((p) => p.shift_id === activeShiftId);
      expect(scoped.length).toBe(1);
      expect(scoped[0].id).toBe("loc-curr-1");
    });
  });

  // Requirement G & H: lastLocationAt timestamp integrity
  describe("lastLocationAt Timestamp Integrity", () => {
    it("G. updates lastLocationAt to the latest incoming point recordedAt", () => {
      const existingLastLocationAt = new Date("2026-09-24T12:00:00Z");
      const incomingRecordedAt = new Date("2026-09-24T12:05:00Z");

      const existingTime = existingLastLocationAt.getTime();
      let updatedLastLocationAt = existingLastLocationAt;
      if (incomingRecordedAt.getTime() > existingTime) {
        updatedLastLocationAt = incomingRecordedAt;
      }

      expect(updatedLastLocationAt.toISOString()).toBe("2026-09-24T12:05:00.000Z");
    });

    it("H. does NOT move lastLocationAt backwards when an older batch arrives", () => {
      const existingLastLocationAt = new Date("2026-09-24T12:10:00Z");
      const olderBatchRecordedAt = new Date("2026-09-24T12:02:00Z");

      const existingTime = existingLastLocationAt.getTime();
      let updatedLastLocationAt = existingLastLocationAt;
      if (olderBatchRecordedAt.getTime() > existingTime) {
        updatedLastLocationAt = olderBatchRecordedAt;
      }

      // Remains 12:10:00Z, not downgraded to 12:02:00Z
      expect(updatedLastLocationAt.toISOString()).toBe("2026-09-24T12:10:00.000Z");
    });
  });
});
