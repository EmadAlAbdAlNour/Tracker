import { db, auditLogsTable, type AuditLog } from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export interface RecordAuditParams {
  actorId?: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
}

export interface ListAuditParams {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "telemetrytoken",
  "secret",
  "authorization",
  "cookie",
]);

export function sanitizeAuditDetails(details?: Record<string, any> | null): Record<string, any> | null {
  if (!details || typeof details !== "object") return null;

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = "[REDACTED]";
    } else if (val && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
      sanitized[key] = sanitizeAuditDetails(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export async function recordAuditEvent(params: RecordAuditParams): Promise<AuditLog | null> {
  try {
    const sanitizedDetails = sanitizeAuditDetails(params.details);
    const detailsJson = sanitizedDetails ? JSON.stringify(sanitizedDetails) : null;

    const [created] = await db
      .insert(auditLogsTable)
      .values({
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail,
        actorRole: params.actorRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: detailsJson,
        ipAddress: params.ipAddress ?? null,
      })
      .returning();

    return created ?? null;
  } catch (err) {
    // Non-blocking error handling for audit logging failure
    console.error("Failed to record audit event:", err);
    return null;
  }
}

export async function listAuditLogs(params: ListAuditParams = {}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (params.action) {
    conditions.push(eq(auditLogsTable.action, params.action));
  }
  if (params.entityType) {
    conditions.push(eq(auditLogsTable.entityType, params.entityType));
  }
  if (params.actorId) {
    conditions.push(eq(auditLogsTable.actorId, params.actorId));
  }
  if (params.from) {
    conditions.push(gte(auditLogsTable.createdAt, new Date(params.from)));
  }
  if (params.to) {
    conditions.push(lte(auditLogsTable.createdAt, new Date(params.to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, items] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogsTable)
      .where(whereClause),
    db
      .select()
      .from(auditLogsTable)
      .where(whereClause)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const parsedItems = items.map((item) => ({
    ...item,
    details: item.details ? (() => {
      try { return JSON.parse(item.details); } catch { return item.details; }
    })() : null,
  }));

  return {
    items: parsedItems,
    total: totalResult[0]?.count ?? 0,
    page,
    limit,
  };
}
