import { relations } from "drizzle-orm/relations";
import { drivers, devices, users, refreshTokens, shifts, locationPoints } from "./schema";

export const devicesRelations = relations(devices, ({one}) => ({
	driver: one(drivers, {
		fields: [devices.driverId],
		references: [drivers.id]
	}),
}));

export const driversRelations = relations(drivers, ({one, many}) => ({
	devices: many(devices),
	user: one(users, {
		fields: [drivers.userId],
		references: [users.id]
	}),
	shifts: many(shifts),
	locationPoints: many(locationPoints),
}));

export const usersRelations = relations(users, ({many}) => ({
	drivers: many(drivers),
	refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({one}) => ({
	user: one(users, {
		fields: [refreshTokens.userId],
		references: [users.id]
	}),
}));

export const shiftsRelations = relations(shifts, ({one, many}) => ({
	driver: one(drivers, {
		fields: [shifts.driverId],
		references: [drivers.id]
	}),
	locationPoints: many(locationPoints),
}));

export const locationPointsRelations = relations(locationPoints, ({one}) => ({
	driver: one(drivers, {
		fields: [locationPoints.driverId],
		references: [drivers.id]
	}),
	shift: one(shifts, {
		fields: [locationPoints.shiftId],
		references: [shifts.id]
	}),
}));