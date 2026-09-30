import { describe, it, expect, beforeEach, vi } from "vitest";
import * as historyService from "./services/historyService";
import * as reportService from "./services/reportService";
import * as dbModule from "@workspace/db";
import * as settingsService from "./services/settingsService";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Historical Data Layer & Reporting", () => {
  const mockRestaurant = {
    id: "rest-1",
    name: "Main Branch",
    latitude: 24.7136,
    longitude: 46.6753,
    radiusMeters: 150,
    enabled: true,
    updatedAt: new Date(),
    updatedBy: null,
  };

  const mockAlertSettings = {
    id: "alert-1",
    maxStopDurationMinutes: 10,
    offlineGraceMinutes: 5,
    lowBatteryThreshold: 20,
    criticalBatteryThreshold: 10,
    maxShiftDurationHours: 12,
    stopAlertEnabled: true,
    gpsAlertEnabled: true,
    offlineAlertEnabled: true,
    batteryAlertEnabled: true,
    restaurantGeofenceAlertEnabled: true,
    soundEnabled: true,
    inAppAlertsEnabled: true,
    pushAlertsEnabled: false,
    updatedAt: new Date(),
  };

  it("lists historical location points with computed operational status tags", async () => {
    vi.spyOn(settingsService, "getRestaurantSettings").mockResolvedValue(mockRestaurant as any);

    const now = new Date();
    const mockPoints = [
      {
        id: "loc-1",
        driverId: "driver-1",
        shiftId: "shift-1",
        clientLocationId: "c-1",
        latitude: 24.7136,
        longitude: 46.6753, // exactly at restaurant
        accuracy: 10,
        altitude: 600,
        speed: 0,
        heading: 0,
        recordedAt: now,
        receivedAt: now,
        source: "mobile",
        createdAt: now,
      },
      {
        id: "loc-2",
        driverId: "driver-1",
        shiftId: "shift-1",
        clientLocationId: "c-2",
        latitude: 24.7200,
        longitude: 46.6800, // outside restaurant
        accuracy: 15,
        altitude: 600,
        speed: 8.5, // moving
        heading: 90,
        recordedAt: new Date(now.getTime() + 60000),
        receivedAt: new Date(now.getTime() + 60000),
        source: "mobile",
        createdAt: new Date(now.getTime() + 60000),
      },
    ];

    dbModule.db.select = (() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: async () => mockPoints,
            }),
          }),
        }),
      }),
    })) as any;

    const result = await historyService.listDriverLocationHistory("driver-1", { page: 1, limit: 10 });
    expect(result.items.length).toBe(2);
    expect(result.items[0].operationalStatus).toBe("AT_RESTAURANT");
    expect(result.items[0].isInsideGeofence).toBe(true);
    expect(result.items[1].operationalStatus).toBe("MOVING");
    expect(result.items[1].isInsideGeofence).toBe(false);
  });

  it("generates deterministic activity timeline from shift lifecycle and reliable points", async () => {
    vi.spyOn(settingsService, "getRestaurantSettings").mockResolvedValue(mockRestaurant as any);
    vi.spyOn(settingsService, "getAlertSettings").mockResolvedValue(mockAlertSettings as any);

    const startTime = new Date("2026-09-30T10:00:00Z");
    const mockShift = {
      id: "shift-1",
      driverId: "driver-1",
      startedAt: startTime,
      endedAt: new Date("2026-09-30T11:00:00Z"),
      status: "COMPLETED",
      createdAt: startTime,
      updatedAt: startTime,
    };

    // Sequential points: start inside restaurant, depart restaurant, move, stop
    const mockPoints = [
      {
        id: "p1",
        driverId: "driver-1",
        shiftId: "shift-1",
        latitude: 24.7136,
        longitude: 46.6753,
        accuracy: 10,
        speed: 0,
        recordedAt: new Date("2026-09-30T10:01:00Z"),
      },
      // 2 consecutive points outside radius + 30m: departure
      {
        id: "p2",
        driverId: "driver-1",
        shiftId: "shift-1",
        latitude: 24.7200,
        longitude: 46.6800,
        accuracy: 10,
        speed: 0,
        recordedAt: new Date("2026-09-30T10:05:00Z"),
      },
      {
        id: "p3",
        driverId: "driver-1",
        shiftId: "shift-1",
        latitude: 24.7210,
        longitude: 46.6810,
        accuracy: 10,
        speed: 0,
        recordedAt: new Date("2026-09-30T10:06:00Z"),
      },
      // 2 consecutive points moving
      {
        id: "p4",
        driverId: "driver-1",
        shiftId: "shift-1",
        latitude: 24.7250,
        longitude: 46.6850,
        accuracy: 10,
        speed: 5.0,
        recordedAt: new Date("2026-09-30T10:10:00Z"),
      },
      {
        id: "p5",
        driverId: "driver-1",
        shiftId: "shift-1",
        latitude: 24.7300,
        longitude: 46.6900,
        accuracy: 10,
        speed: 6.0,
        recordedAt: new Date("2026-09-30T10:11:00Z"),
      },
    ];

    dbModule.db.select = ((fields: any) => ({
      from: (table: any) => {
        return {
          where: () => ({
            orderBy: () => ({
              limit: async () => {
                if (table === dbModule.shiftsTable) return [mockShift];
                return mockPoints;
              },
            }),
            limit: async () => [mockShift],
          }),
        };
      },
    })) as any;

    const timeline = await historyService.getDriverActivityTimeline("driver-1", { shiftId: "shift-1" });
    const types = timeline.items.map((e) => e.type);

    expect(types).toContain("SHIFT_STARTED");
    expect(types).toContain("LEFT_RESTAURANT");
    expect(types).toContain("MOVING");
    expect(types).toContain("SHIFT_ENDED");
  });

  it("generates operational reports aggregating shift durations and valid displacements", async () => {
    vi.spyOn(settingsService, "getRestaurantSettings").mockResolvedValue(mockRestaurant as any);

    const shift = {
      id: "shift-100",
      driverId: "driver-100",
      startedAt: new Date("2026-09-30T08:00:00Z"),
      endedAt: new Date("2026-09-30T12:00:00Z"),
      status: "COMPLETED",
    };

    const driverRow = {
      driverId: "driver-100",
      employeeId: "DRV-100",
      name: "Tariq Driver",
      userId: "user-100",
    };

    const points = [
      {
        latitude: 24.7136,
        longitude: 46.6753,
        accuracy: 10,
        speed: 0,
        recordedAt: new Date("2026-09-30T08:00:00Z"),
      },
      {
        latitude: 24.7200,
        longitude: 46.6800,
        accuracy: 15,
        speed: 10,
        recordedAt: new Date("2026-09-30T08:05:00Z"),
      },
    ];

    dbModule.db.select = ((fields: any) => ({
      from: (table: any) => {
        const queryResult: any = Promise.resolve(
          table === dbModule.shiftsTable ? [shift] : [driverRow]
        );
        queryResult.where = (cond: any) => ({
          orderBy: async () => (table === dbModule.shiftsTable ? [shift] : points),
        });
        queryResult.innerJoin = () => Promise.resolve([driverRow]);
        return queryResult;
      },
    })) as any;

    // Run report generator
    const report = await reportService.generateOperationalReport({
      from: "2026-09-30T00:00:00Z",
      to: "2026-09-30T23:59:59Z",
    });

    expect(report).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(report.summary.from).toBe("2026-09-30T00:00:00Z");
  });
});
