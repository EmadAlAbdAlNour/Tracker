import { pgTable, index, uniqueIndex, foreignKey, uuid, text, timestamp, unique, boolean, doublePrecision, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const shiftStatus = pgEnum("shift_status", ['ACTIVE', 'COMPLETED'])
export const userRole = pgEnum("user_role", ['ADMIN', 'MANAGER', 'DRIVER', 'CALL_CENTER'])


export const devices = pgTable("devices", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	driverId: uuid("driver_id").notNull(),
	platform: text().notNull(),
	deviceIdentifier: text("device_identifier"),
	appVersion: text("app_version"),
	lastSeen: timestamp("last_seen", { withTimezone: true, mode: 'string' }),
	authorized: boolean("authorized").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastLocationAt: timestamp("last_location_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("devices_driver_idx").using("btree", table.driverId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("devices_driver_platform_identifier_idx").using("btree", table.driverId.asc().nullsLast().op("text_ops"), table.platform.asc().nullsLast().op("text_ops"), table.deviceIdentifier.asc().nullsLast().op("uuid_ops")).where(sql`(device_identifier IS NOT NULL)`),
	index("devices_platform_idx").using("btree", table.platform.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "devices_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
	uniqueIndex("devices_driver_one_authorized_idx").using("btree", table.driverId.asc().nullsLast().op("uuid_ops")).where(sql`(authorized = true)`),
]);

export const drivers = pgTable("drivers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	employeeId: text("employee_id").notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("drivers_employee_id_idx").using("btree", table.employeeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "drivers_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("drivers_user_id_unique").on(table.userId),
	unique("drivers_employee_id_unique").on(table.employeeId),
]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	phone: text(),
	passwordHash: text("password_hash").notNull(),
	role: userRole().notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("users_role_idx").using("btree", table.role.asc().nullsLast().op("enum_ops")),
	unique("users_email_unique").on(table.email),
]);

export const refreshTokens = pgTable("refresh_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	deviceId: uuid("device_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("refresh_tokens_expires_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("refresh_tokens_hash_idx").using("btree", table.tokenHash.asc().nullsLast().op("text_ops")),
	index("refresh_tokens_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	index("refresh_tokens_device_idx").using("btree", table.deviceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "refresh_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.deviceId],
			foreignColumns: [devices.id],
			name: "refresh_tokens_device_id_devices_id_fk"
		}).onDelete("set null"),
]);

export const shifts = pgTable("shifts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	driverId: uuid("driver_id").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	status: shiftStatus().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("shifts_driver_active_unique").using("btree", table.driverId.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'ACTIVE'::shift_status)`),
	index("shifts_driver_idx").using("btree", table.driverId.asc().nullsLast().op("uuid_ops")),
	index("shifts_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "shifts_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
]);

export const locationPoints = pgTable("location_points", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	driverId: uuid("driver_id").notNull(),
	shiftId: uuid("shift_id"),
	clientLocationId: text("client_location_id"),
	latitude: doublePrecision().notNull(),
	longitude: doublePrecision().notNull(),
	accuracy: doublePrecision(),
	altitude: doublePrecision(),
	speed: doublePrecision(),
	heading: doublePrecision(),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).notNull(),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	source: text().default('mobile').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("location_points_driver_client_location_unique").using("btree", table.driverId.asc().nullsLast().op("text_ops"), table.clientLocationId.asc().nullsLast().op("uuid_ops")).where(sql`(client_location_id IS NOT NULL)`),
	index("location_points_driver_idx").using("btree", table.driverId.asc().nullsLast().op("uuid_ops")),
	index("location_points_recorded_at_idx").using("btree", table.recordedAt.asc().nullsLast().op("timestamptz_ops")),
	index("location_points_shift_idx").using("btree", table.shiftId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.driverId],
			foreignColumns: [drivers.id],
			name: "location_points_driver_id_drivers_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.shiftId],
			foreignColumns: [shifts.id],
			name: "location_points_shift_id_shifts_id_fk"
		}).onDelete("set null"),
]);
