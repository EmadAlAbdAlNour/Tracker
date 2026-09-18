import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "./app";

// Mock DB module for unit testing permanent deletion logic
vi.mock("@workspace/db", () => {
  const users = [
    {
      id: "admin-uuid-1",
      name: "Super Admin",
      email: "admin@tracker.com",
      phone: "+966500000001" as string | null,
      role: "ADMIN",
      passwordHash: "hash1",
      active: true,
      deletedAt: null as Date | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "driver-user-uuid-2",
      name: "Driver Ahmed",
      email: "ahmed@tracker.com",
      phone: "+966500000002" as string | null,
      role: "DRIVER",
      passwordHash: "hash2",
      active: true,
      deletedAt: null as Date | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const drivers = [
    {
      id: "driver-uuid-2",
      userId: "driver-user-uuid-2",
      employeeId: "DRV-102",
      active: true,
      deletedAt: null as Date | null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const shifts = [
    {
      id: "shift-uuid-active",
      driverId: "driver-uuid-2",
      status: "ACTIVE",
      startedAt: new Date(),
      endedAt: null as Date | null,
    },
    {
      id: "shift-uuid-past",
      driverId: "driver-uuid-2",
      status: "COMPLETED",
      startedAt: new Date(Date.now() - 3600000),
      endedAt: new Date(),
    },
  ];

  const devices = [
    {
      id: "device-uuid-1",
      driverId: "driver-uuid-2",
      platform: "Android (Samsung S25)",
      deviceIdentifier: "hw-uuid-1234" as string | null,
      authorized: true,
    },
  ];

  const refreshTokens = [
    {
      id: "token-1",
      userId: "driver-user-uuid-2",
      tokenHash: "token-hash-1",
    },
  ];

  const locationPoints = [
    {
      id: "loc-1",
      driverId: "driver-uuid-2",
      latitude: 24.7136,
      longitude: 46.6753,
    },
    {
      id: "loc-2",
      driverId: "driver-uuid-2",
      latitude: 24.7140,
      longitude: 46.6760,
    },
  ];

  const mockDb = {
    select: () => ({
      from: (table: any) => ({
        where: (condition: any) => ({
          limit: () => {
            if (table === mockDbModule.usersTable) {
              return [users[1]];
            }
            if (table === mockDbModule.driversTable) {
              return drivers;
            }
            return [];
          },
          orderBy: () => ({
            limit: () => ({
              offset: () => users,
            }),
          }),
        }),
      }),
    }),
    transaction: async (cb: any) => {
      const tx = {
        select: (table: any) => ({
          from: (tbl: any) => ({
            where: () => ({
              limit: () => (tbl === mockDbModule.driversTable ? drivers : users),
            }),
          }),
        }),
        update: (tbl: any) => ({
          set: (data: any) => ({
            where: () => {
              if (tbl === mockDbModule.shiftsTable) {
                // close shift
                shifts[0].status = "COMPLETED";
              }
              if (tbl === mockDbModule.devicesTable) {
                devices[0].authorized = false;
                devices[0].deviceIdentifier = null;
              }
              if (tbl === mockDbModule.driversTable) {
                drivers[0].employeeId = data.employeeId;
                drivers[0].active = false;
                drivers[0].deletedAt = data.deletedAt;
              }
              if (tbl === mockDbModule.usersTable) {
                users[1].name = data.name;
                users[1].email = data.email;
                users[1].phone = null;
                users[1].passwordHash = data.passwordHash;
                users[1].active = false;
                users[1].deletedAt = data.deletedAt;
              }
              return {
                returning: () => [users[1]],
              };
            },
          }),
        }),
        delete: (tbl: any) => ({
          where: () => {
            if (tbl === mockDbModule.refreshTokensTable) {
              refreshTokens.length = 0;
            }
          },
        }),
      };
      return cb(tx);
    },
  };

  const mockDbModule = {
    db: mockDb,
    usersTable: { id: "id", email: "email", role: "role", name: "name", phone: "phone" },
    driversTable: { id: "id", userId: "user_id", employeeId: "employee_id", active: "active" },
    devicesTable: { id: "id", driverId: "driver_id" },
    shiftsTable: { id: "id", driverId: "driver_id", status: "status" },
    refreshTokensTable: { id: "id", userId: "user_id" },
    locationPointsTable: { id: "id", driverId: "driver_id" },
    _testState: {
      users,
      drivers,
      shifts,
      devices,
      refreshTokens,
      locationPoints,
    },
  };

  return mockDbModule;
});

describe("Permanent User / Driver Deletion (Policy 1B)", () => {
  it("permanentDeleteAndAnonymizeUser scrubs PII, closes shifts, revokes tokens, and retains telemetry", async () => {
    const { permanentDeleteAndAnonymizeUser } = await import("./services/userService");
    const dbModule = await import("@workspace/db");
    const state = (dbModule as any)._testState;

    const result = await permanentDeleteAndAnonymizeUser("driver-user-uuid-2", "admin-uuid-1");

    expect(result.success).toBe(true);
    expect(result.anonymized).toBe(true);
    expect(result.telemetryRetained).toBe(true);

    // 1. User PII is anonymized
    expect(state.users[1].name).toBe("سائق محذوف");
    expect(state.users[1].email).toMatch(/^deleted_[a-z0-9]+@tracker\.local$/);
    expect(state.users[1].phone).toBeNull();
    expect(state.users[1].passwordHash).toBe("DELETED_ACCOUNT_CREDENTIAL_DISABLED");
    expect(state.users[1].active).toBe(false);
    expect(state.users[1].deletedAt).toBeInstanceOf(Date);

    // 2. Driver profile is anonymized
    expect(state.drivers[0].employeeId).toMatch(/^DEL-[a-z0-9]+$/);
    expect(state.drivers[0].active).toBe(false);

    // 3. Active shifts ended
    expect(state.shifts[0].status).toBe("COMPLETED");

    // 4. Devices unauthorized and scrubbed
    expect(state.devices[0].authorized).toBe(false);
    expect(state.devices[0].deviceIdentifier).toBeNull();

    // 5. Sessions deleted
    expect(state.refreshTokens).toHaveLength(0);

    // 6. Historical telemetry points are strictly PRESERVED
    expect(state.locationPoints).toHaveLength(2);
  });

  it("prevents administrators from permanently deleting their own account", async () => {
    const { permanentDeleteAndAnonymizeUser } = await import("./services/userService");

    await expect(
      permanentDeleteAndAnonymizeUser("admin-uuid-1", "admin-uuid-1")
    ).rejects.toThrow("Administrators cannot permanently delete their own account");
  });
});
