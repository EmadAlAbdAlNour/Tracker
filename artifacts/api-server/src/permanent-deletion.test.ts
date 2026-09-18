import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB module for unit testing permanent hard deletion logic
vi.mock("@workspace/db", () => {
  let users: any[] = [];
  let drivers: any[] = [];
  let shifts: any[] = [];
  let devices: any[] = [];
  let refreshTokens: any[] = [];
  let locationPoints: any[] = [];
  let notifications: any[] = [];
  let notificationReads: any[] = [];
  let alertState: any[] = [];

  const resetState = () => {
    users = [
      {
        id: "primary-admin-uuid",
        name: "Primary Administrator",
        email: "admin@tracker.local",
        phone: "+966500000001",
        role: "ADMIN",
        passwordHash: "hash1",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "secondary-admin-uuid",
        name: "Secondary Admin",
        email: "secondary.admin@tracker.com",
        phone: "+966500000099",
        role: "ADMIN",
        passwordHash: "hash_sec",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "driver-user-uuid-2",
        name: "Driver Ahmed",
        email: "ahmed@tracker.com",
        phone: "+966500000002",
        role: "DRIVER",
        passwordHash: "hash2",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    drivers = [
      {
        id: "driver-uuid-2",
        userId: "driver-user-uuid-2",
        employeeId: "DRV-102",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    shifts = [
      {
        id: "shift-uuid-active",
        driverId: "driver-uuid-2",
        status: "ACTIVE",
        startedAt: new Date(),
        endedAt: null,
      },
    ];
    devices = [
      {
        id: "device-uuid-1",
        driverId: "driver-uuid-2",
        platform: "Android",
        deviceIdentifier: "hw-1",
        authorized: true,
      },
    ];
    refreshTokens = [
      {
        id: "token-driver",
        userId: "driver-user-uuid-2",
        tokenHash: "hash-driver",
      },
      {
        id: "token-sec-admin",
        userId: "secondary-admin-uuid",
        tokenHash: "hash-sec-admin",
      },
    ];
    locationPoints = [
      {
        id: "loc-1",
        driverId: "driver-uuid-2",
        latitude: 24.7136,
        longitude: 46.6753,
      },
    ];
    notifications = [
      {
        id: "notif-1",
        driverId: "driver-uuid-2",
        shiftId: "shift-uuid-active",
        titleAr: "تنبيه",
        titleEn: "Alert",
      },
    ];
    notificationReads = [
      {
        id: "read-1",
        userId: "driver-user-uuid-2",
        notificationId: "notif-1",
      },
      {
        id: "read-2",
        userId: "secondary-admin-uuid",
        notificationId: "notif-1",
      },
    ];
    alertState = [
      {
        id: "alert-1",
        driverId: "driver-uuid-2",
        alertType: "SPEEDING",
      },
    ];
  };

  resetState();

  let targetLookupId: string | null = null;

  const mockDb = {
    select: (fields?: any) => ({
      from: (table: any) => ({
        where: (condition: any) => ({
          limit: () => {
            if (table === mockDbModule.usersTable) {
              const found = users.find((u) => u.id === targetLookupId);
              return found ? [found] : [users[0]];
            }
            if (table === mockDbModule.driversTable) {
              const d = drivers.find((d) => d.userId === targetLookupId);
              return d ? [d] : [];
            }
            return [];
          },
          then: (resolve: any) => {
            if (fields && fields.count) {
              // Count remaining active admins
              const otherActiveAdmins = users.filter(
                (u) => u.role === "ADMIN" && u.active && u.id !== targetLookupId
              );
              return resolve([{ count: otherActiveAdmins.length }]);
            }
            return resolve([]);
          },
        }),
      }),
    }),
    transaction: async (cb: any) => {
      const tx = {
        select: (fields?: any) => ({
          from: (tbl: any) => ({
            where: () => ({
              limit: () => {
                if (tbl === mockDbModule.driversTable) {
                  const d = drivers.find((d) => d.userId === targetLookupId);
                  return d ? [d] : [];
                }
                return [];
              },
              then: (resolve: any) => {
                if (tbl === mockDbModule.shiftsTable) {
                  return resolve(shifts.map((s) => ({ id: s.id })));
                }
                return resolve([]);
              },
            }),
          }),
        }),
        delete: (tbl: any) => ({
          where: () => {
            if (tbl === mockDbModule.notificationsTable) {
              notifications.length = 0;
            }
            if (tbl === mockDbModule.locationPointsTable) {
              locationPoints.length = 0;
            }
            if (tbl === mockDbModule.shiftsTable) {
              shifts.length = 0;
            }
            if (tbl === mockDbModule.devicesTable) {
              devices.length = 0;
            }
            if (tbl === mockDbModule.alertStateTable) {
              alertState.length = 0;
            }
            if (tbl === mockDbModule.driversTable) {
              drivers = drivers.filter((d) => d.userId !== targetLookupId);
            }
            if (tbl === mockDbModule.refreshTokensTable) {
              refreshTokens = refreshTokens.filter((t) => t.userId !== targetLookupId);
            }
            if (tbl === mockDbModule.notificationReadsTable) {
              notificationReads = notificationReads.filter((nr) => nr.userId !== targetLookupId);
            }
            if (tbl === mockDbModule.usersTable) {
              users = users.filter((u) => u.id !== targetLookupId);
            }
          },
        }),
      };
      return cb(tx);
    },
  };

  const mockDbModule = {
    db: mockDb,
    usersTable: { id: "id", email: "email", role: "role", name: "name", phone: "phone", active: "active" },
    driversTable: { id: "id", userId: "user_id", employeeId: "employee_id", active: "active" },
    devicesTable: { id: "id", driverId: "driver_id" },
    shiftsTable: { id: "id", driverId: "driver_id", status: "status" },
    refreshTokensTable: { id: "id", userId: "user_id" },
    notificationReadsTable: { id: "id", userId: "user_id", notificationId: "notification_id" },
    notificationsTable: { id: "id", driverId: "driver_id", shiftId: "shift_id" },
    locationPointsTable: { id: "id", driverId: "driver_id" },
    alertStateTable: { id: "id", driverId: "driver_id" },
    _setTargetLookupId: (id: string | null) => {
      targetLookupId = id;
    },
    _getState: () => ({
      users,
      drivers,
      shifts,
      devices,
      refreshTokens,
      locationPoints,
      notifications,
      notificationReads,
      alertState,
    }),
    _resetState: resetState,
  };

  return mockDbModule;
});

describe("True Permanent Hard Deletion Policy", () => {
  beforeEach(async () => {
    const dbModule = await import("@workspace/db");
    (dbModule as any)._resetState();
  });

  it("ADMIN permanently deletes DRIVER, eradicating all telemetry, shifts, devices, and tokens", async () => {
    const { permanentDeleteUser } = await import("./services/userService");
    const dbModule = await import("@workspace/db");
    (dbModule as any)._setTargetLookupId("driver-user-uuid-2");

    const result = await permanentDeleteUser("driver-user-uuid-2", "primary-admin-uuid");

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.userId).toBe("driver-user-uuid-2");
    expect(result.role).toBe("DRIVER");

    const state = (dbModule as any)._getState();

    // 1. User is completely purged (NO tombstone, NO anonymized account)
    expect(state.users.find((u: any) => u.id === "driver-user-uuid-2")).toBeUndefined();
    expect(state.users).toHaveLength(2); // Only primary and secondary admins remain

    // 2. Driver record completely purged
    expect(state.drivers).toHaveLength(0);

    // 3. Historical telemetry/location points completely purged
    expect(state.locationPoints).toHaveLength(0);

    // 4. Shifts completely purged
    expect(state.shifts).toHaveLength(0);

    // 5. Devices completely purged
    expect(state.devices).toHaveLength(0);

    // 6. Refresh tokens for driver completely purged
    expect(state.refreshTokens.find((t: any) => t.userId === "driver-user-uuid-2")).toBeUndefined();

    // 7. Notifications and driver read states completely purged
    expect(state.notifications).toHaveLength(0);
    expect(state.notificationReads.find((nr: any) => nr.userId === "driver-user-uuid-2")).toBeUndefined();

    // 8. Alert state completely purged
    expect(state.alertState).toHaveLength(0);
  });

  it("ADMIN permanently deletes another ADMIN successfully", async () => {
    const { permanentDeleteUser } = await import("./services/userService");
    const dbModule = await import("@workspace/db");
    (dbModule as any)._setTargetLookupId("secondary-admin-uuid");

    const result = await permanentDeleteUser("secondary-admin-uuid", "primary-admin-uuid");

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.userId).toBe("secondary-admin-uuid");
    expect(result.role).toBe("ADMIN");

    const state = (dbModule as any)._getState();

    // Secondary admin is purged
    expect(state.users.find((u: any) => u.id === "secondary-admin-uuid")).toBeUndefined();
    // Primary admin remains intact
    expect(state.users.find((u: any) => u.id === "primary-admin-uuid")).toBeDefined();
    // Secondary admin's refresh tokens are purged
    expect(state.refreshTokens.find((t: any) => t.userId === "secondary-admin-uuid")).toBeUndefined();
    // Secondary admin's notification reads are purged
    expect(state.notificationReads.find((nr: any) => nr.userId === "secondary-admin-uuid")).toBeUndefined();
  });

  it("prevents deletion of the protected primary admin account (admin@tracker.local)", async () => {
    const { permanentDeleteUser } = await import("./services/userService");
    const dbModule = await import("@workspace/db");
    (dbModule as any)._setTargetLookupId("primary-admin-uuid");

    await expect(
      permanentDeleteUser("primary-admin-uuid", "secondary-admin-uuid")
    ).rejects.toThrow("The primary system administrator account cannot be permanently deleted");
  });

  it("prevents administrators from permanently deleting their own account", async () => {
    const { permanentDeleteUser } = await import("./services/userService");
    const dbModule = await import("@workspace/db");
    (dbModule as any)._setTargetLookupId("secondary-admin-uuid");

    await expect(
      permanentDeleteUser("secondary-admin-uuid", "secondary-admin-uuid")
    ).rejects.toThrow("Administrators cannot permanently delete their own account");
  });

  it("prevents deleting the last remaining active administrator", async () => {
    const { permanentDeleteUser } = await import("./services/userService");
    const dbModule = await import("@workspace/db");

    // Deactivate secondary admin so only primary admin remains active
    const state = (dbModule as any)._getState();
    state.users[1].active = false;
    // Set a non-primary email on the last remaining admin to test the count guard specifically
    state.users[0].email = "sole.admin@tracker.com";
    (dbModule as any)._setTargetLookupId("primary-admin-uuid");

    await expect(
      permanentDeleteUser("primary-admin-uuid", "other-caller-uuid")
    ).rejects.toThrow("Cannot delete the only remaining active administrator");
  });
});
