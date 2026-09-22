import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { signTelemetryToken, TELEMETRY_TOKEN_TTL, TELEMETRY_TOKEN_EXPIRY_SECONDS } from "./lib/auth";
import { requireAuth, requireAuthOrTelemetry, type AuthenticatedRequest } from "./middleware/auth";
import * as authService from "./services/authService";
import * as dbModule from "@workspace/db";
import { getEnv } from "./config/env";

const env = getEnv();

describe("Dedicated Telemetry Token Authentication & 24h Shift Support", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1 & 2. signTelemetryToken issues token with 24h (86400s) TTL and type=telemetry", () => {
    expect(TELEMETRY_TOKEN_TTL).toBe("24h");
    expect(TELEMETRY_TOKEN_EXPIRY_SECONDS).toBe(86400);

    const token = signTelemetryToken("user-123", "DRIVER", "dev-456", "shift-789");
    const payload = jwt.verify(token, env.jwtSecret) as any;

    expect(payload.type).toBe("telemetry");
    expect(payload.exp - payload.iat).toBe(86400);
  });

  it("3 & 10. General API endpoints (requireAuth) reject telemetry tokens with 403 AUTH_FORBIDDEN", async () => {
    const token = signTelemetryToken("user-123", "DRIVER", "dev-456", "shift-789");
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as AuthenticatedRequest;
    const res = {} as any;

    let error: any = null;
    const next = (err?: any) => {
      error = err;
    };

    await requireAuth(req, res, next);
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("AUTH_FORBIDDEN");
  });

  it("4, 5 & 6. Telemetry token remains bound to driver ID, device ID, and shift ID", () => {
    const token = signTelemetryToken("driver-user-999", "DRIVER", "device-abc-123", "shift-xyz-789");
    const payload = jwt.verify(token, env.jwtSecret) as any;

    expect(payload.sub).toBe("driver-user-999");
    expect(payload.role).toBe("DRIVER");
    expect(payload.deviceId).toBe("device-abc-123");
    expect(payload.shiftId).toBe("shift-xyz-789");
  });

  it("7. Wrong device is rejected by submitDriverLocationBatch with 403 DEVICE_UNAUTHORIZED", async () => {
    const driver = { id: "d1", userId: "u1", active: true };
    const device = { id: "authorized-device-1", driverId: "d1", authorized: true };
    const activeShift = { id: "active-shift-1", driverId: "d1", status: "ACTIVE" };

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

    const inputs = [{ clientLocationId: "c1", latitude: 24, longitude: 46, recordedAt: new Date().toISOString() }];

    await expect(
      authService.submitDriverLocationBatch("u1", inputs, "unauthorized-different-device", "active-shift-1")
    ).rejects.toMatchObject({ statusCode: 403, code: "DEVICE_UNAUTHORIZED" });
  });

  it("8. Wrong shift is rejected by submitDriverLocationBatch with 409 SHIFT_NOT_ACTIVE", async () => {
    const driver = { id: "d1", userId: "u1", active: true };
    const device = { id: "dev1", driverId: "d1", authorized: true };
    const activeShift = { id: "active-shift-1", driverId: "d1", status: "ACTIVE" };

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

    const pool = (dbModule as any).pool;
    vi.spyOn(pool, "query").mockResolvedValue({ rows: [{ client_location_id: "c1" }] } as any);

    const inputs = [{ clientLocationId: "c1", latitude: 24, longitude: 46, recordedAt: new Date().toISOString() }];

    // Non-matching shift ID must reject with 409
    await expect(
      authService.submitDriverLocationBatch("u1", inputs, "dev1", "stale-old-shift-id")
    ).rejects.toMatchObject({ statusCode: 409, code: "SHIFT_NOT_ACTIVE" });

    // Matching shift ID succeeds
    const res = await authService.submitDriverLocationBatch("u1", inputs, "dev1", "active-shift-1");
    expect(res.accepted).toBe(1);
  });

  it("9. Non-driver role in telemetry token is rejected with 403 AUTH_FORBIDDEN", async () => {
    const adminTelemetryToken = jwt.sign(
      { sub: "user-admin", role: "ADMIN", type: "telemetry", deviceId: "dev-1", shiftId: "shift-1" },
      env.jwtSecret,
      { expiresIn: "24h" }
    );
    const req = {
      headers: { authorization: `Bearer ${adminTelemetryToken}` },
    } as unknown as AuthenticatedRequest;
    const res = {} as any;

    let error: any = null;
    const next = (err?: any) => {
      error = err;
    };

    await requireAuthOrTelemetry(req, res, next);
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("AUTH_FORBIDDEN");
  });

  it("11. Telemetry token remains valid near the 20-hour point of an extended shift", async () => {
    const baseTime = 1760000000000;
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);

    const mockUser = {
      id: "b4e8574a-251c-4b53-8419-f54e19574d71",
      name: "Long Shift Driver",
      email: "longshift@tracker.com",
      phone: null,
      role: "DRIVER",
      active: true,
    };

    dbModule.db.select = (() => ({
      from: () => ({
        where: () => ({
          limit: async () => [mockUser],
        }),
      }),
    })) as any;

    // Issue 24h token at baseTime
    const token = signTelemetryToken(mockUser.id, "DRIVER", "dev-long-shift", "shift-long-shift");

    // Advance 20 hours into the shift (20 hours = 72,000,000 ms)
    vi.setSystemTime(baseTime + 20 * 3600 * 1000);

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as AuthenticatedRequest;
    const res = {} as any;

    let error: any = null;
    const next = (err?: any) => {
      error = err;
    };

    await requireAuthOrTelemetry(req, res, next);
    expect(error).toBeFalsy();
    expect(req.user?.id).toBe(mockUser.id);
    expect(req.user?.isTelemetryToken).toBe(true);
    expect(req.user?.shiftId).toBe("shift-long-shift");
  });

  it("12. Telemetry token is rejected after its actual 24h expiration", async () => {
    const baseTime = 1760000000000;
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);

    const token = signTelemetryToken("user-123", "DRIVER", "dev-456", "shift-789");

    // Advance 24 hours + 1 minute (24h1m = 86,460,000 ms)
    vi.setSystemTime(baseTime + (24 * 3600 + 60) * 1000);

    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as AuthenticatedRequest;
    const res = {} as any;

    let error: any = null;
    const next = (err?: any) => {
      error = err;
    };

    await requireAuthOrTelemetry(req, res, next);
    expect(error).toBeDefined();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("AUTH_INVALID_TOKEN");
  });
});
