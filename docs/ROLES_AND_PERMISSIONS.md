# Roles & Permissions Specification

> Practical Single Source of Truth for Role-Based Access Control (RBAC) in Tracker.  
> Verified against production routes, middleware, and screen controllers (`v1.2.0`).

---

## 1. Role Taxonomy

Tracker defines exactly three user roles within the database enum `user_role` (`lib/db/src/schema/index.ts`) and validation schemas:

```typescript
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "DRIVER", "CALL_CENTER"]);
```

Any historical mentions of `MANAGER` or `DISPATCHER` are deprecated and do not exist in the active schema or codebase.

---

## 2. Comprehensive Capability Matrix

| Capability / Operation | API Endpoint | ADMIN | CALL_CENTER | DRIVER |
| :--- | :--- | :---: | :---: | :---: |
| **Authentication & Profile** | | | | |
| Login with credentials | `POST /api/auth/login` | Yes | Yes | Yes (Device Required) |
| Multi-session concurrent login | N/A | Yes | Yes | No (Single Device Binding) |
| Refresh access token | `POST /api/auth/refresh` | Yes | Yes | Yes (Device Verified) |
| Logout session | `POST /api/auth/logout` | Yes | Yes | Yes |
| View own user profile | `GET /api/auth/me` | Yes | Yes | Yes |
| **Fleet Monitoring** | | | | |
| View live fleet dashboard | `GET /api/fleet/live` | Yes | Yes | No |
| View active drivers on map | Web `/dashboard/map`, Mobile Map | Yes | Yes | No |
| View driver dossier / activity | `GET /api/drivers/:id/activity` | Yes | Yes | Own data only |
| View driver location breadcrumbs | `GET /api/drivers/:id/locations` | Yes | Yes | Own data only |
| **Driver Shift Management** | | | | |
| Start own shift (Geofence check) | `POST /api/drivers/me/shifts/start` | No | No | Yes (Must be inside radius) |
| End own shift | `POST /api/drivers/me/shifts/end` | No | No | Yes |
| Force-end any driver shift | `POST /api/drivers/:id/shifts/force-end` | Yes | No | No |
| View own shift history | `GET /api/drivers/me/shifts` | No | No | Yes |
| View any driver shift history | `GET /api/drivers/:id/shifts` | Yes | Yes | Own data only |
| **Telemetry & Heartbeat** | | | | |
| Obtain scoped telemetry token | `POST /api/drivers/me/telemetry-token` | No | No | Yes (Active Shift Required) |
| Upload single location | `POST /api/drivers/me/location` | No | No | Yes |
| Upload batched locations (up to 20) | `POST /api/drivers/me/location/batch` | No | No | Yes |
| Send periodic device heartbeat | `POST /api/drivers/me/heartbeat` | No | No | Yes |
| **Device Authorization** | | | | |
| View all registered devices | `GET /api/devices` | Yes | No | No |
| View own assigned device | `GET /api/drivers/me/device` | No | No | Yes |
| Register current device | `POST /api/drivers/me/device/register` | No | No | Yes |
| Reset / Unbind driver device | `POST /api/drivers/:id/device/reset` | Yes | No | No |
| Force-assign device to driver | `POST /api/drivers/:id/device/assign` | Yes | No | No |
| **User & Driver Administration** | | | | |
| List system users | `GET /api/users` | Yes | No | No |
| Create new user | `POST /api/users` | Yes | No | No |
| Update user details | `PATCH /api/users/:id` | Yes | No | No |
| Deactivate user account | `DELETE /api/users/:id` | Yes | No | No |
| Permanently delete user | `DELETE /api/users/:id/permanent` | Yes | No | No |
| List drivers directory | `GET /api/drivers` | Yes | Yes | No |
| Create new driver record | `POST /api/drivers` | Yes | No | No |
| Update driver profile | `PATCH /api/drivers/:id` | Yes | No | No |
| **Notifications & Alerts** | | | | |
| List notifications | `GET /api/notifications` | Yes | Yes | No |
| Mark notification read | `POST /api/notifications/:id/read` | Yes | Yes | No |
| Mark all notifications read | `POST /api/notifications/read-all` | Yes | Yes | No |
| Resolve operational alert | `POST /api/notifications/:id/resolve` | Yes | Yes | No |
| **Reporting & Analytics** | | | | |
| Query operational summary report | `GET /api/reports/summary` | Yes | Yes | No |
| View driver performance breakdown | Web `/dashboard/reports` | Yes | Yes | No |
| **Audit Logs & Settings** | | | | |
| Query audit logs | `GET /api/audit-logs` | Yes | No | No |
| View restaurant geofence settings | `GET /api/settings/restaurant` | Yes | Yes | No |
| Update restaurant geofence | `PUT /api/settings/restaurant` | Yes | No | No |
| View alert threshold settings | `GET /api/settings/alerts` | Yes | Yes | No |
| Update alert threshold settings | `PUT /api/settings/alerts` | Yes | No | No |

---

## 3. Role Profiles & Operational Scopes

### 3.1 Role: `ADMIN`

- **Purpose**: System administrator and business owner possessing unrestricted authority across configuration, security, fleet governance, and auditing.
- **Allowed Interfaces**:
  - **Web Admin**: Full access to all 9 navigation tabs (`/dashboard`, `/dashboard/drivers`, `/dashboard/drivers/[id]`, `/dashboard/map`, `/dashboard/reports`, `/dashboard/devices`, `/dashboard/users`, `/dashboard/audit`, `/dashboard/settings`).
  - **Mobile Admin**: Full access to 4 bottom tabs (`dashboard`, `map`, `drivers`, `more` [devices, users, settings, notifications, reports, audit]).
- **Key Operations**:
  - Provision and edit user and driver accounts.
  - Reset driver device bindings when drivers change phones.
  - Override shifts via Force End if a driver forgets to clock out.
  - Tune restaurant geofence coordinates and alert thresholds.
  - Inspect tamper-evident audit logs with masked sensitive keys.

### 3.2 Role: `CALL_CENTER`

- **Purpose**: Operations dispatcher and customer support specialist responsible for real-time order tracking, delivery assistance, and customer inquiry resolution.
- **Allowed Interfaces**:
  - **Web Admin**: Scoped access restricted to operational monitoring (`/dashboard`, `/dashboard/drivers`, `/dashboard/drivers/[id]`, `/dashboard/map`, `/dashboard/reports`). Administrative pages (`/devices`, `/users`, `/audit`, `/settings`) redirect immediately to `/dashboard`.
  - **Mobile App**: Dedicated read-only console (`CallCenterHomeScreen`) with 4 bottom tabs (`dashboard`, `map`, `drivers`, `notifications`).
- **Permissions**:
  - Strictly read-only for system entities (cannot modify users, drivers, settings, or devices).
  - Can view and resolve real-time operational notifications (e.g., acknowledging extended stop alerts).
  - Can query historical reports to verify delivery timeliness.

### 3.3 Role: `DRIVER`

- **Purpose**: Delivery courier operating in the field with a physical Android device.
- **Allowed Interfaces**:
  - **Web Admin**: Completely denied access (HTTP 403 / redirect to login).
  - **Mobile App**: Dedicated `DriverHomeScreen` with 4 bottom tabs (`cockpit`, `shift`, `diagnostics`, `profile`).
- **Permissions & Constraints**:
  - Single-device hardware binding enforced at login.
  - Shift start requires physical presence inside the configured restaurant geofence.
  - Ingestion restricted strictly to own shift telemetry and heartbeats.
  - Forbidden from inspecting or modifying other drivers' records or locations.
