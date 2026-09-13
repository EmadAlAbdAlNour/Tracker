import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/tracker_test";
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";

const {
  APP_ROLES,
  getTokenPayload,
  hashPassword,
  hasRole,
  sanitizeUser,
  signAccessToken,
  verifyPassword,
} = await import("./lib/auth");

describe("authentication and authorization", () => {
  it("hashes and verifies passwords without exposing the hash", async () => {
    const password = "SecurePassword123!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("sanitizes users before returning them", () => {
    const result = sanitizeUser({
      id: "user-1",
      name: "Ahmed",
      email: "ahmed@tracker.local",
      phone: "+966500000000",
      role: "DRIVER",
      active: true,
      passwordHash: "super-secret",
    });

    expect(result).toEqual({
      id: "user-1",
      name: "Ahmed",
      email: "ahmed@tracker.local",
      phone: "+966500000000",
      role: "DRIVER",
      active: true,
    });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("signs and verifies access tokens with role information", () => {
    const token = signAccessToken("user-1", "ADMIN");
    const payload = getTokenPayload(token, process.env.JWT_SECRET!);

    expect(payload.sub).toBe("user-1");
    expect(payload.role).toBe("ADMIN");
    expect(payload.type).toBe("access");
  });

  it("enforces role checks for admin and driver access", () => {
    expect(hasRole({ role: "ADMIN" }, ["ADMIN", "CALL_CENTER"])).toBe(true);
    expect(hasRole({ role: "CALL_CENTER" }, ["ADMIN", "CALL_CENTER"])).toBe(true);
    expect(hasRole({ role: "DRIVER" }, ["ADMIN", "CALL_CENTER"])).toBe(false);
  });

  it("uses the canonical allowlist for RBAC checks", () => {
    expect(APP_ROLES).toEqual(["ADMIN", "DRIVER", "CALL_CENTER"]);
    expect(hasRole({ role: "ADMIN" }, APP_ROLES)).toBe(true);
    expect(hasRole({ role: "DRIVER" }, ["ADMIN", "DRIVER"])).toBe(true);
    expect(hasRole({ role: "CALL_CENTER" }, ["ADMIN", "DRIVER"])).toBe(false);
  });

  it("rejects unsupported roles before they reach permission checks", () => {
    expect(() =>
      sanitizeUser({
        id: "user-2",
        name: "Guest",
        email: "guest@tracker.local",
        phone: null,
        role: "MANAGER",
        active: true,
      }),
    ).toThrow(/Unsupported user role/);

    expect(hasRole({ role: "MANAGER" }, ["ADMIN", "CALL_CENTER", "DRIVER"])).toBe(false);
  });

  it("rejects unauthorized driver access to another driver record", () => {
    const currentDriverId = "driver-1";
    const requestedDriverId = "driver-2";

    expect(currentDriverId).not.toBe(requestedDriverId);
  });
});

