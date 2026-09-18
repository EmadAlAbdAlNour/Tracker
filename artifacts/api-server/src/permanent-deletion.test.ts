import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB module for unit testing permanent hard deletion logic
vi.mock("@workspace/db", () => {
  let users = [
    {
      id: "admin-uuid-1",
      name: "Super Admin",
      email: "admin@tracker.com",
      phone: "+966500000001" as string | null,
      role: "ADMIN",
      passwordHash: "hash1",
      active: true,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  let drivers = [
    {
      id: "driver-uuid-2",
      userId: "driver-user-uuid-2",
      employeeId: "DRV-102",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  let shifts = [
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

  let devices = [
    {
      id: "device-uuid-1",
      driverId: "driver-uuid-2",
      platform: "Android (Samsung S25)",
      deviceIdentifier: "hw-uuid-1234" as string | null,
      authorized: true,
    },
  ];

  let refreshTokens = [
    {
      id: "token-1",
      userId: "driver-user-uuid-2",
      tokenHash: "token-hash-1",
    },
  ];

  let locationPoints = [
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

  let notifications = [
    {
      id: "notif-1",
      driverId: "driver-uuid-2",
      shiftId: "shift-uuid-active",
      titleAr: "تنبيه",
      titleEn: "Alert",
    },
  ];

  let notificationReads = [
    {
      id: "read-1",
      userId: "driver-user-uuid-2",
      notificationId: "notif-1",
    },
  ];

  let alertState = [
    {
      id: "alert-1",
      driverId: "driver-uuid-2",
      alertType: "SPEEDING",
    },
  ];

  const resetState = () => {
    users = [
      {
        id: "admin-uuid-1",
        name: "Super Admin",
        email: "admin@tracker.com",
        phone: "+966500000001",
        role: "ADMIN",
        passwordHash: "hash1",
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
        id: "token-1",
        userId: "driver-user-uuid-2",
        tokenHash: "hash-1",
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
    ];
    alertState = [
      {
        id: "alert-1",
        driverId: "driver-uuid-2",
        alertType: "SPEEDING",
      },
    ];
  };

  const mockDb = {
    select: (fields?: any) => ({
      from: (table: any) => ({
        where: (condition: any) => ({
          limit: () => {
            if (table === mockDbModule.usersTable) {
              return [users.find((u) => u.id === "driver-user-uuid-2") || users[0]].filter(Boolean);
            }
            if (table === mockDbModule.driversTable) {
              return drivers;
            }
            return [];
          },
          then: (resolve: any) => {
            if (fields && fields.count) {
              // Admin count query
              const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.active);
              return resolve([{ count: activeAdmins.length }]);
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
              limit: () => (tbl === mockDbModule.driversTable ? drivers : users),
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
              drivers.length = 0;
            }
            if (tbl === mockDbModule.refreshTokensTable) {
              refreshTokens.length = 0;
            }
            if (tbl === mockDbModule.notificationReadsTable) {
              notificationReads.length = 0;
            }
            if (tbl === mockDbModule.usersTable) {
              users = users.filter((u) => u.id !== "driver-user-uuid-2");
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

  it("permanentDeleteUser completely removes user, driver, telemetry, shifts, devices, tokens, and notifications", async () => {
    const { permanentDeleteUser } = await import("./services/userService");
    const dbModule = await import("@workspace/db");

    const result = await permanentDeleteUser("driver-user-uuid-2", "admin-uuid-1");

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(true);
    expect(result.userId).toBe("driver-user-uuid-2");
    expect(result.role).toBe("DRIVER");

    const state = (dbModule as any)._getState();

    // 1. User is completely purged (NO tombstone, NO anonymized account)
    expect(state.users.find((u: any) => u.id === "driver-user-uuid-2")).toBeUndefined();
    expect(state.users).toHaveLength(1); // Only admin remains

    // 2. Driver record completely purged
    expect(state.drivers).toHaveLength(0);

    // 3. Historical telemetry/location points completely purged (NO retained telemetry)
    expect(state.locationPoints).toHaveLength(0);

    // 4. Shifts completely purged
    expect(state.shifts).toHaveLength(0);

    // 5. Devices completely purged
    expect(state.devices).toHaveLength(0);

    // 6. Refresh tokens completely purged
    expect(state.refreshTokens).toHaveLength(0);

    // 7. Notifications and reads completely purged
    expect(state.notifications).toHaveLength(0);
    expect(state.notificationReads).toHaveLength(0);

    // 8. Alert state completely purged
    expect(state.alertState).toHaveLength(0);
  });

  it("prevents administrators from permanently deleting their own account", async () => {
    const { permanentDeleteUser } = await import("./services/userService");

    await expect(
      permanentDeleteUser("admin-uuid-1", "admin-uuid-1")
    ).rejects.toThrow("Administrators cannot permanently delete their own account");
  });
});
