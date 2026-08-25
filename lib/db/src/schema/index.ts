import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MANAGER", "DRIVER", "CALL_CENTER"]);
export const shiftStatusEnum = pgEnum("shift_status", ["ACTIVE", "COMPLETED"]);

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    roleIdx: index("users_role_idx").on(table.role),
  }),
);

export const driversTable = pgTable(
  "drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique().references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    employeeId: text("employee_id").notNull().unique(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdIdx: uniqueIndex("drivers_employee_id_idx").on(table.employeeId),
  }),
);

export const devicesTable = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id").notNull().references(() => driversTable.id, {
      onDelete: "cascade",
    }),
    platform: text("platform").notNull(),
    deviceIdentifier: text("device_identifier"),
    appVersion: text("app_version"),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
    authorized: boolean("authorized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    driverIdx: index("devices_driver_idx").on(table.driverId),
    platformIdx: index("devices_platform_idx").on(table.platform),
    uniqueDriverDevice: uniqueIndex("devices_driver_platform_identifier_idx")
      .on(table.driverId, table.platform, table.deviceIdentifier)
      .where(sql`"device_identifier" IS NOT NULL`),
    authorizedUnique: uniqueIndex("devices_driver_one_authorized_idx").on(table.driverId).where(sql`"authorized" = true`),
  }),
);

export const shiftsTable = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id").notNull().references(() => driversTable.id, {
      onDelete: "cascade",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: shiftStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    driverIdx: index("shifts_driver_idx").on(table.driverId),
    statusIdx: index("shifts_status_idx").on(table.status),
    activeShiftPerDriver: uniqueIndex("shifts_driver_active_unique")
      .on(table.driverId)
      .where(sql`"status" = 'ACTIVE'`),
  }),
);

export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    deviceId: uuid("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("refresh_tokens_user_idx").on(table.userId),
    tokenHashIdx: uniqueIndex("refresh_tokens_hash_idx").on(table.tokenHash),
    expiresIdx: index("refresh_tokens_expires_idx").on(table.expiresAt),
    deviceIdx: index("refresh_tokens_device_idx").on(table.deviceId),
  }),
);

export const locationPointsTable = pgTable(
  "location_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id").notNull().references(() => driversTable.id, {
      onDelete: "cascade",
    }),
    shiftId: uuid("shift_id").references(() => shiftsTable.id, {
      onDelete: "set null",
    }),
    clientLocationId: text("client_location_id"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    accuracy: doublePrecision("accuracy"),
    altitude: doublePrecision("altitude"),
    speed: doublePrecision("speed"),
    heading: doublePrecision("heading"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("mobile"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    driverIdx: index("location_points_driver_idx").on(table.driverId),
    shiftIdx: index("location_points_shift_idx").on(table.shiftId),
    recordedIdx: index("location_points_recorded_at_idx").on(table.recordedAt),
    clientLocationIdIdx: uniqueIndex("location_points_driver_client_location_unique")
      .on(table.driverId, table.clientLocationId)
      .where(sql`"client_location_id" IS NOT NULL`),
  }),
);

export const userRelations = relations(usersTable, ({ many }) => ({
  drivers: many(driversTable),
  refreshTokens: many(refreshTokensTable),
}));

export const driverRelations = relations(driversTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [driversTable.userId],
    references: [usersTable.id],
  }),
  devices: many(devicesTable),
  shifts: many(shiftsTable),
}));

export const shiftRelations = relations(shiftsTable, ({ one, many }) => ({
  driver: one(driversTable, {
    fields: [shiftsTable.driverId],
    references: [driversTable.id],
  }),
  locationPoints: many(locationPointsTable),
}));

export const refreshTokenRelations = relations(refreshTokensTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [refreshTokensTable.userId],
    references: [usersTable.id],
  }),
}));

export const locationPointRelations = relations(locationPointsTable, ({ one }) => ({
  driver: one(driversTable, {
    fields: [locationPointsTable.driverId],
    references: [driversTable.id],
  }),
  shift: one(shiftsTable, {
    fields: [locationPointsTable.shiftId],
    references: [shiftsTable.id],
  }),
}));

export const insertUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  passwordHash: z.string().min(1),
  role: z.enum(["ADMIN", "MANAGER", "DRIVER", "CALL_CENTER"]),
  active: z.boolean().optional(),
});

export const insertDriverSchema = z.object({
  userId: z.string().uuid(),
  employeeId: z.string().min(1),
  active: z.boolean().optional(),
});

export const insertDeviceSchema = z.object({
  driverId: z.string().uuid(),
  platform: z.string().min(1),
  deviceIdentifier: z.string().nullable().optional(),
  appVersion: z.string().nullable().optional(),
  lastSeen: z.date().nullable().optional(),
  authorized: z.boolean().optional(),
});

export const insertRefreshTokenSchema = z.object({
  userId: z.string().uuid(),
  tokenHash: z.string().min(1),
  expiresAt: z.date(),
  revokedAt: z.date().nullable().optional(),
  deviceId: z.string().uuid().nullable().optional(),
});

export const insertShiftSchema = z.object({
  driverId: z.string().uuid(),
  startedAt: z.date().optional(),
  endedAt: z.date().nullable().optional(),
  status: z.enum(["ACTIVE", "COMPLETED"]),
});

export const insertLocationPointSchema = z.object({
  driverId: z.string().uuid(),
  shiftId: z.string().uuid().nullable().optional(),
  clientLocationId: z.string().trim().min(1).max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).nullable().optional(),
  altitude: z.number().nullable().optional(),
  speed: z.number().min(0).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  recordedAt: z.date(),
  source: z.string().min(1).max(50).default("mobile"),
});

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type User = typeof usersTable.$inferSelect;
export type Driver = typeof driversTable.$inferSelect;
export type Device = typeof devicesTable.$inferSelect;
export type ShiftStatus = (typeof shiftStatusEnum.enumValues)[number];
export type Shift = typeof shiftsTable.$inferSelect;
export type RefreshToken = typeof refreshTokensTable.$inferSelect;
export type LocationPoint = typeof locationPointsTable.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type InsertLocationPoint = z.infer<typeof insertLocationPointSchema>;
