import { db, notificationsTable, notificationReadsTable } from "@workspace/db";
import { eq, desc, and, sql, isNull, inArray } from "drizzle-orm";

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

export async function listNotifications(params: ListNotificationsParams = {}, userId?: string) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  // If userId is provided, attempt user-scoped query first
  if (userId) {
    try {
      const baseConditions = [];
      if (params.type) {
        baseConditions.push(eq(notificationsTable.type, params.type));
      }
      if (params.driverId) {
        baseConditions.push(eq(notificationsTable.driverId, params.driverId));
      }

      const itemsConditions = [...baseConditions];
      if (params.unreadOnly) {
        itemsConditions.push(isNull(notificationReadsTable.id));
      }

      const itemsWhere = itemsConditions.length > 0 ? and(...itemsConditions) : undefined;
      const unreadWhere = baseConditions.length > 0
        ? and(...baseConditions, isNull(notificationReadsTable.id))
        : isNull(notificationReadsTable.id);
      const totalWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;

      const [rows, countResult, unreadCountResult] = await Promise.all([
        db
          .select({
            notification: notificationsTable,
            userReadAt: notificationReadsTable.readAt,
          })
          .from(notificationsTable)
          .leftJoin(
            notificationReadsTable,
            and(
              eq(notificationReadsTable.notificationId, notificationsTable.id),
              eq(notificationReadsTable.userId, userId),
            ),
          )
          .where(itemsWhere)
          .orderBy(desc(notificationsTable.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(notificationsTable)
          .where(totalWhere),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(notificationsTable)
          .leftJoin(
            notificationReadsTable,
            and(
              eq(notificationReadsTable.notificationId, notificationsTable.id),
              eq(notificationReadsTable.userId, userId),
            ),
          )
          .where(unreadWhere),
      ]);

      const items = rows.map((r) => ({
        ...r.notification,
        read: Boolean(r.userReadAt),
        readAt: r.userReadAt ?? null,
      }));

      return {
        items,
        total: Number(countResult[0]?.count ?? 0),
        unreadCount: Number(unreadCountResult[0]?.count ?? 0),
        page,
        limit,
      };
    } catch (error) {
      // Fallback to legacy global table if table/column does not exist yet
      console.warn("User-scoped notification query falling back to legacy:", error);
    }
  }

  // Legacy / Fallback global notifications path
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

  return {
    items,
    total: Number(countResult[0]?.count ?? 0),
    unreadCount: Number(unreadCountResult[0]?.count ?? 0),
    page,
    limit,
  };
}

export async function markNotificationAsRead(id: string, userId?: string) {
  if (userId) {
    try {
      await db
        .insert(notificationReadsTable)
        .values({
          notificationId: id,
          userId,
          readAt: new Date(),
        })
        .onConflictDoNothing();
    } catch (e) {
      console.warn("User-scoped mark read failed, updating legacy table:", e);
    }
  }

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

export async function markAllNotificationsAsRead(userId?: string) {
  if (userId) {
    try {
      const unreadNotifications = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .leftJoin(
          notificationReadsTable,
          and(
            eq(notificationReadsTable.notificationId, notificationsTable.id),
            eq(notificationReadsTable.userId, userId),
          ),
        )
        .where(isNull(notificationReadsTable.id));

      if (unreadNotifications.length > 0) {
        const now = new Date();
        const records = unreadNotifications.map((n) => ({
          notificationId: n.id,
          userId,
          readAt: now,
        }));
        await db
          .insert(notificationReadsTable)
          .values(records)
          .onConflictDoNothing();
      }
      return true;
    } catch (e) {
      console.warn("User-scoped mark all read failed, updating legacy table:", e);
    }
  }

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
