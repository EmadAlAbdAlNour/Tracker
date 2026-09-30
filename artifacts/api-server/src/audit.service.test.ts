import { describe, it, expect, beforeEach, vi } from "vitest";
import * as auditService from "./services/auditService";
import * as dbModule from "@workspace/db";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Centralized Audit Log Service", () => {
  it("sanitizes sensitive fields like passwords, hashes, and tokens from details", () => {
    const rawDetails = {
      name: "Ahmed Driver",
      email: "ahmed@tracker.local",
      password: "SuperSecretPassword123!",
      passwordHash: "$2b$10$abcdefgh...",
      refreshToken: "jwt-refresh-token",
      accessToken: "jwt-access-token",
      nested: {
        token: "nested-secret",
        role: "DRIVER",
      },
    };

    const sanitized = auditService.sanitizeAuditDetails(rawDetails);
    expect(sanitized).toBeDefined();
    expect(sanitized?.name).toBe("Ahmed Driver");
    expect(sanitized?.email).toBe("ahmed@tracker.local");
    expect(sanitized?.password).toBe("[REDACTED]");
    expect(sanitized?.passwordHash).toBe("[REDACTED]");
    expect(sanitized?.refreshToken).toBe("[REDACTED]");
    expect(sanitized?.accessToken).toBe("[REDACTED]");
    expect(sanitized?.nested?.token).toBe("[REDACTED]");
    expect(sanitized?.nested?.role).toBe("DRIVER");
  });

  it("records an audit event into audit_logs table", async () => {
    let insertedValues: any = null;
    dbModule.db.insert = (() => ({
      values: (val: any) => {
        insertedValues = val;
        return {
          returning: async () => [
            {
              id: "audit-123",
              ...val,
              createdAt: new Date(),
            },
          ],
        };
      },
    })) as any;

    const result = await auditService.recordAuditEvent({
      actorId: "admin-uuid-1",
      actorEmail: "admin@tracker.local",
      actorRole: "ADMIN",
      action: "DEVICE_RESET",
      entityType: "DEVICE",
      entityId: "driver-uuid-1",
      details: { driverId: "driver-uuid-1", reason: "Replaced phone" },
      ipAddress: "127.0.0.1",
    });

    expect(result).toBeDefined();
    expect(result?.id).toBe("audit-123");
    expect(insertedValues.action).toBe("DEVICE_RESET");
    expect(insertedValues.entityType).toBe("DEVICE");
    expect(insertedValues.actorEmail).toBe("admin@tracker.local");
    expect(insertedValues.details).toContain("driver-uuid-1");
  });

  it("lists audit logs with pagination and filters", async () => {
    const mockLogs = [
      {
        id: "log-1",
        actorId: "admin-1",
        actorEmail: "admin@tracker.local",
        actorRole: "ADMIN",
        action: "USER_CREATED",
        entityType: "USER",
        entityId: "user-2",
        details: JSON.stringify({ email: "new@tracker.local" }),
        ipAddress: "10.0.0.1",
        createdAt: new Date(),
      },
    ];

    dbModule.db.select = (() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: async () => mockLogs,
            }),
          }),
          limit: async () => [{ count: 1 }],
          count: 1,
        }),
      }),
    })) as any;

    const result = await auditService.listAuditLogs({ page: 1, limit: 10 });
    expect(result.items.length).toBe(1);
    expect(result.items[0].action).toBe("USER_CREATED");
    expect(result.items[0].actorEmail).toBe("admin@tracker.local");
    expect(result.items[0].actorRole).toBe("ADMIN");
    expect((result.items[0] as any).userName).toBe("admin@tracker.local");
    expect((result.items[0] as any).userRole).toBe("ADMIN");
    expect(result.items[0].details).toEqual({ email: "new@tracker.local" });
  });
});
