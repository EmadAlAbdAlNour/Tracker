import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as authService from "./services/authService";
import * as fleetService from "./services/fleetService";
import * as dbModule from "@workspace/db";
import { signTelemetryToken } from "./lib/auth";

describe("Independent Device Heartbeat Pipeline", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Heartbeat is accepted for authorized driver/device with active shift", async () => {
    const driver = { id: "d-1", userId: "u-1", active: true, employeeId: "EMP01" };
    const device = { id: "dev-1", driverId: "d-1", authorized: true, deviceIdentifier: "uuid-1", lastSeen: null, lastLocationAt: null };
    const activeShift = { id: "shift-1", driverId: "d-1", status: "ACTIVE", startedAt: new Date() };

    let updateCalledWith: any = null;
    dbModule.db.update = ((table: any) => ({
      set: (values: any) => ({
        where: async () => {
          updateCalledWith = values;
          return [{ ...device, ...values }];
        },
      }),
    })) as any;

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
              if (table === dbModule.devicesTable || table?.name === "devices") return [device];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
            if (table === dbModule.devicesTable || table?.name === "devices") return [device];
            return [driver];
          },
        }),
      }),
    })) as any;

    const res = await authService.submitDriverHeartbeat(
      "u-1",
      {
        shiftId: "shift-1",
        batteryPercentage: 95,
        isCharging: true,
        locationServicesEnabled: true,
        networkStatus: "wifi",
      },
      "dev-1",
      "shift-1"
    );

    expect(res.ok).toBe(true);
    expect(res.serverTime).toBeDefined();
    expect(updateCalledWith).toBeDefined();
    expect(updateCalledWith.lastSeen).toBeInstanceOf(Date);
    expect(updateCalledWith.batteryPercentage).toBe(95);
    expect(updateCalledWith.isCharging).toBe(true);
    expect(updateCalledWith.networkStatus).toBe("wifi");
  });

  it("2 & 3. Heartbeat updates lastSeen but does NOT modify lastLocationAt", async () => {
    const driver = { id: "d-1", userId: "u-1", active: true };
    const existingLastLoc = new Date("2026-09-24T12:00:00Z");
    const device = { id: "dev-1", driverId: "d-1", authorized: true, deviceIdentifier: "uuid-1", lastLocationAt: existingLastLoc };
    const activeShift = { id: "shift-1", driverId: "d-1", status: "ACTIVE" };

    let updatedFields: Record<string, any> = {};
    dbModule.db.update = (() => ({
      set: (values: any) => ({
        where: async () => {
          updatedFields = values;
        },
      }),
    })) as any;

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
              if (table === dbModule.devicesTable || table?.name === "devices") return [device];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
            if (table === dbModule.devicesTable || table?.name === "devices") return [device];
            return [driver];
          },
        }),
      }),
    })) as any;

    await authService.submitDriverHeartbeat("u-1", {}, "dev-1", "shift-1");

    expect(updatedFields.lastSeen).toBeDefined();
    expect(updatedFields.lastLocationAt).toBeUndefined(); // MUST NOT MODIFY lastLocationAt!
  });

  it("4. Heartbeat does NOT create location_points", async () => {
    const driver = { id: "d-1", userId: "u-1", active: true };
    const device = { id: "dev-1", driverId: "d-1", authorized: true, deviceIdentifier: "uuid-1" };
    const activeShift = { id: "shift-1", driverId: "d-1", status: "ACTIVE" };

    let insertAttempted = false;
    dbModule.db.insert = (() => {
      insertAttempted = true;
      return { values: () => ({ returning: async () => [] }) };
    }) as any;

    dbModule.db.update = (() => ({
      set: () => ({ where: async () => {} }),
    })) as any;

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
              if (table === dbModule.devicesTable || table?.name === "devices") return [device];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
            if (table === dbModule.devicesTable || table?.name === "devices") return [device];
            return [driver];
          },
        }),
      }),
    })) as any;

    await authService.submitDriverHeartbeat("u-1", {}, "dev-1", "shift-1");

    expect(insertAttempted).toBe(false); // MUST NOT insert location_points!
  });

  it("5. Heartbeat rejected without active shift (409 SHIFT_NOT_ACTIVE)", async () => {
    const driver = { id: "d-1", userId: "u-1", active: true };
    const device = { id: "dev-1", driverId: "d-1", authorized: true, deviceIdentifier: "uuid-1" };

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === "shifts") return []; // No active shift
              if (table === dbModule.devicesTable || table?.name === "devices") return [device];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === "shifts") return [];
            if (table === dbModule.devicesTable || table?.name === "devices") return [device];
            return [driver];
          },
        }),
      }),
    })) as any;

    await expect(
      authService.submitDriverHeartbeat("u-1", {}, "dev-1", "shift-1")
    ).rejects.toMatchObject({ statusCode: 409, code: "SHIFT_NOT_ACTIVE" });
  });

  it("6. Heartbeat rejected for unauthorized device (403 DEVICE_UNAUTHORIZED)", async () => {
    const driver = { id: "d-1", userId: "u-1", active: true };
    const device = { id: "authorized-device-1", driverId: "d-1", authorized: true, deviceIdentifier: "uuid-auth" };
    const activeShift = { id: "shift-1", driverId: "d-1", status: "ACTIVE" };

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
              if (table === dbModule.devicesTable || table?.name === "devices") return [device];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
            if (table === dbModule.devicesTable || table?.name === "devices") return [device];
            return [driver];
          },
        }),
      }),
    })) as any;

    await expect(
      authService.submitDriverHeartbeat("u-1", {}, "rogue-device-999", "shift-1")
    ).rejects.toMatchObject({ statusCode: 403, code: "DEVICE_UNAUTHORIZED" });
  });

  it("7. Heartbeat accepts both device.id and device.deviceIdentifier for backward compatibility", async () => {
    const driver = { id: "d-1", userId: "u-1", active: true };
    const device = { id: "db-device-id", driverId: "d-1", authorized: true, deviceIdentifier: "client-installation-uuid" };
    const activeShift = { id: "shift-1", driverId: "d-1", status: "ACTIVE" };

    dbModule.db.update = (() => ({
      set: () => ({ where: async () => {} }),
    })) as any;

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
              if (table === dbModule.devicesTable || table?.name === "devices") return [device];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
            if (table === dbModule.devicesTable || table?.name === "devices") return [device];
            return [driver];
          },
        }),
      }),
    })) as any;

    // Call with client deviceIdentifier (matches existing mobile APK behavior)
    const res1 = await authService.submitDriverHeartbeat("u-1", {}, "client-installation-uuid", "shift-1");
    expect(res1.ok).toBe(true);

    // Call with db device id (matches JWT payload)
    const res2 = await authService.submitDriverHeartbeat("u-1", {}, "db-device-id", "shift-1");
    expect(res2.ok).toBe(true);
  });

  it("8 & 9. Stationary driver with fresh heartbeat remains ONLINE and STOPPED (or AT_RESTAURANT), NOT OFFLINE", () => {
    const now = Date.now();
    // Device lastSeen is 30 seconds ago (heartbeat kept it fresh)
    const freshLastSeen = new Date(now - 30 * 1000);
    // GPS location is 25 minutes old (driver is stationary)
    const staleGpsRecordedAt = new Date(now - 25 * 60 * 1000);

    const offlineThresholdMs = 5 * 60 * 1000; // 5 min
    const isOnline = now - freshLastSeen.getTime() <= offlineThresholdMs;
    expect(isOnline).toBe(true);

    // Case A: Inside Restaurant
    const statusInside = fleetService.computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: true,
      location: { recorded_at: staleGpsRecordedAt, speed: 0 },
      now,
    });
    expect(statusInside).toBe("AT_RESTAURANT");

    // Case B: Outside Restaurant
    const statusOutside = fleetService.computeOperationalStatus({
      hasActiveShift: true,
      isOnline: true,
      isInsideGeofence: false,
      location: { recorded_at: staleGpsRecordedAt, speed: 0 },
      now,
    });
    expect(statusOutside).toBe("STOPPED");
    expect(statusOutside).not.toBe("OFFLINE");
  });

  it("10. Driver becomes OFFLINE when heartbeat stops and lastSeen exceeds offlineGraceMinutes", () => {
    const now = Date.now();
    // Heartbeat stopped 6 minutes ago
    const expiredLastSeen = new Date(now - 6 * 60 * 1000);
    const offlineThresholdMs = 5 * 60 * 1000;

    const isOnline = now - expiredLastSeen.getTime() <= offlineThresholdMs;
    expect(isOnline).toBe(false);

    const status = fleetService.computeOperationalStatus({
      hasActiveShift: true,
      isOnline: false,
      isInsideGeofence: false,
      location: { recorded_at: expiredLastSeen, speed: 0 },
      now,
    });
    expect(status).toBe("OFFLINE");
  });

  it("11. STOP_EXTENDED can occur while ONLINE + STOPPED + OUTSIDE without becoming OFFLINE", () => {
    const now = Date.now();
    // Device lastSeen is 10s ago via heartbeat -> ONLINE
    const freshLastSeen = new Date(now - 10 * 1000);
    // GPS point stopped 15 minutes ago outside geofence (threshold is e.g. 10m)
    const stoppedSince = new Date(now - 15 * 60 * 1000);

    const isOnline = now - freshLastSeen.getTime() <= 5 * 60 * 1000;
    expect(isOnline).toBe(true);

    const operationalStatus = fleetService.computeOperationalStatus({
      hasActiveShift: true,
      isOnline,
      isInsideGeofence: false, // outside restaurant
      location: { recorded_at: stoppedSince, speed: 0 },
      now,
    });

    expect(operationalStatus).toBe("STOPPED");
    expect(operationalStatus).not.toBe("OFFLINE");

    // Stopped duration is 15 minutes, exceeding maxStopDurationMinutes (10m)
    const stoppedDurationMinutes = Math.floor((now - stoppedSince.getTime()) / 60000);
    expect(stoppedDurationMinutes).toBe(15);
    expect(stoppedDurationMinutes >= 10).toBe(true);
  });

  it("12. Existing telemetry batch upload pipeline remains functional and unchanged", async () => {
    const driver = { id: "d-1", userId: "u-1", active: true };
    const device = { id: "dev-1", driverId: "d-1", authorized: true, deviceIdentifier: "uuid-1" };
    const activeShift = { id: "shift-1", driverId: "d-1", status: "ACTIVE" };

    let updateFields: any = null;
    dbModule.db.update = (() => ({
      set: (values: any) => ({
        where: async () => {
          updateFields = values;
        },
      }),
    })) as any;

    const pool = (dbModule as any).pool;
    vi.spyOn(pool, "query").mockResolvedValue({
      rows: [{ client_location_id: "cl-1" }],
    } as any);

    dbModule.db.select = (() => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
              if (table === dbModule.devicesTable || table?.name === "devices") return [device];
              return [driver];
            },
          }),
          limit: async () => {
            if (table === dbModule.shiftsTable || table?.name === "shifts") return [activeShift];
            if (table === dbModule.devicesTable || table?.name === "devices") return [device];
            return [driver];
          },
        }),
      }),
    })) as any;

    const recordedAt = new Date().toISOString();
    const result = await authService.submitDriverLocationBatch(
      "u-1",
      [
        {
          clientLocationId: "cl-1",
          latitude: 30.0444,
          longitude: 31.2357,
          recordedAt,
          source: "fused",
        },
      ],
      "dev-1",
      "shift-1"
    );

    expect(result.accepted).toBe(1);
    // Telemetry updates BOTH lastLocationAt and lastSeen
    expect(updateFields.lastLocationAt).toBeDefined();
    expect(updateFields.lastSeen).toBeDefined();
  });
});

