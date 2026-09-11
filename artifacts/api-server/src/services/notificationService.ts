import { db, notificationsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
  driverId?: string;
}

export interface CreateNotificationInput {
  type: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  driverId?: string | null;
  shiftId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function listNotifications(params: ListNotificationsParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (params.unreadOnly) {
    conditions.push(eq(notificationsTable.read, false));
  }
  if (params.type) {
    conditions.push(eq(notificationsTable.type, params.type));
  }
  if (params.driverId) {
    conditions.push(eq(notificationsTable.driverId, params.driverId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Run items query and count queries in parallel
  const [items, countResult, unreadCountResult] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(whereClause)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(whereClause),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(eq(notificationsTable.read, false)),
  ]);

  const total = Number(countResult[0]?.count ?? 0);
  const unreadCount = Number(unreadCountResult[0]?.count ?? 0);

  return {
    items,
    total,
    unreadCount,
    page,
    limit,
  };
}

export async function markNotificationAsRead(id: string) {
  const [updated] = await db
    .update(notificationsTable)
    .set({
      read: true,
      readAt: new Date(),
    })
    .where(eq(notificationsTable.id, id))
    .returning();

  return updated;
}

export async function markAllNotificationsAsRead() {
  await db
    .update(notificationsTable)
    .set({
      read: true,
      readAt: new Date(),
    })
    .where(eq(notificationsTable.read, false));

  return true;
}

export async function createNotification(input: CreateNotificationInput) {
  const [created] = await db
    .insert(notificationsTable)
    .values({
      type: input.type,
      severity: input.severity ?? "INFO",
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      messageAr: input.messageAr,
      messageEn: input.messageEn,
      driverId: input.driverId ?? null,
      shiftId: input.shiftId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    })
    .returning();

  return created;
}

