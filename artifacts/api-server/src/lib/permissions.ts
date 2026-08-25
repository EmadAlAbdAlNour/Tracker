import { type RequestHandler } from "express";
import { createError } from "./errors";
import { type SafeUser } from "./auth";

export const Permissions = {
  DRIVERS_VIEW: "drivers.view",
  DRIVERS_DETAILS_VIEW: "drivers.details.view",
  DRIVERS_LOCATION_VIEW: "drivers.location.view",
  DRIVERS_MANAGE: "drivers.manage",
  DEVICES_VIEW: "devices.view",
  DEVICES_RESET: "devices.reset",
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

export const rolePermissions: Record<SafeUser["role"], PermissionKey[]> = {
  ADMIN: Object.values(Permissions) as PermissionKey[],
  MANAGER: [
    Permissions.DRIVERS_VIEW,
    Permissions.DRIVERS_DETAILS_VIEW,
    Permissions.DRIVERS_LOCATION_VIEW,
    Permissions.DRIVERS_MANAGE,
    Permissions.DEVICES_VIEW,
    Permissions.USERS_VIEW,
  ],
  CALL_CENTER: [
    Permissions.DRIVERS_VIEW,
    Permissions.DRIVERS_DETAILS_VIEW,
    Permissions.DRIVERS_LOCATION_VIEW,
    Permissions.DEVICES_VIEW,
  ],
  DRIVER: [
    // drivers may only operate on their own resources via route-level checks
    Permissions.DRIVERS_DETAILS_VIEW,
    Permissions.DRIVERS_LOCATION_VIEW,
  ],
};

export function hasPermission(user: SafeUser | undefined, permission: PermissionKey) {
  if (!user) return false;
  const perms = rolePermissions[user.role as SafeUser["role"]] ?? [];
  return perms.includes(permission);
}

export function requirePermission(permission: PermissionKey): RequestHandler {
  return (req, _res, next) => {
    const user = (req as any).user as SafeUser | undefined;
    if (!user) {
      next(createError(401, "AUTH_REQUIRED", "Authentication required"));
      return;
    }
    if (!hasPermission(user, permission)) {
      next(createError(403, "AUTH_FORBIDDEN", "Access denied"));
      return;
    }
    next();
  };
}
