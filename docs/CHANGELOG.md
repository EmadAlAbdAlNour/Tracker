# Changelog — Tracker Master Product Completion Pass

All notable changes across the Tracker codebase during this final master pass are documented below.

---

## [Unreleased] — Master Hardening & Product Roadmap Completion

### 1. Native Android Telemetry (Phase 1)
- **Monotonic Ordering**: In `TrackerLocationService.kt`, enforced strict temporal monotonicity using `elapsedRealtimeNanos` (API 17+) to reject backward or out-of-order GPS samples from the OS location provider.
- **Speed Accuracy Hardening**: Audited and confirmed API 26+ `hasSpeedAccuracy()` checks, enforcing `speedAccuracyMetersPerSecond <= 25.0f` to prevent noisy speed values from contaminating movement transitions.
- **Durable Queue Integrity**: Retained native SQLite durable queue with active shift identity isolation.

### 2. Database Schema & Migration (Phase 5)
- **Audit Logs Table**: Created `audit_logs` schema in `lib/db/src/schema/index.ts` with indexed fields for `action`, `user_id`, `entity_type`, `entity_id`, and `created_at`.
- **Migration `0009_audit_logs.sql`**: Added migration script with idempotency (`CREATE TABLE IF NOT EXISTS`) and registered in `drizzle/meta/_journal.json`.

### 3. Centralized Audit Log Service & API (Phase 5)
- **Service Layer**: Created `artifacts/api-server/src/services/auditService.ts` supporting paginated querying and automatic secret redaction (`password`, `token`, `secret`, `hash`).
- **Endpoints**: Added `GET /api/audit-logs` (restricted to `ADMIN`).
- **Mutation Hooks**: Integrated audit recording into:
  - User lifecycle: `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `USER_DELETED_PERMANENTLY`.
  - Driver operations: `DRIVER_CREATED`, `DRIVER_UPDATED`, `DEVICE_RESET`, `DEVICE_ASSIGNED`, `SHIFT_FORCE_ENDED`.
  - Configuration: `RESTAURANT_SETTINGS_UPDATED`, `ALERT_SETTINGS_UPDATED`.

### 4. Historical Data Layer & Activity Timeline (Phase 2)
- **Service Layer**: Created `artifacts/api-server/src/services/historyService.ts`:
  - `listDriverLocationHistory`: Augments raw location points with computed operational status tags (`AT_RESTAURANT`, `MOVING`, `STOPPED`), geofence containment, distance to restaurant, and reliability flag.
  - `getDriverActivityTimeline`: Generates deterministic timeline events (`SHIFT_STARTED`, `ARRIVED_AT_RESTAURANT`, `LEFT_RESTAURANT`, `MOVING`, `STOPPED`, `STOP_EXTENDED`, `SHIFT_ENDED`, `ALERT`).
- **Endpoints**:
  - `GET /api/drivers/:id/locations`: Extended with `shiftId`, `from`, `to`, `order` filtering.
  - `GET /api/drivers/:id/activity`: Returns chronological operational timeline events.

### 5. Reports & Analytics (Phase 3)
- **Service Layer**: Created `artifacts/api-server/src/services/reportService.ts`:
  - Computes aggregated metrics: total shifts, duration, total distance (sum of consecutive reliable points), moving time, stopped time, time at restaurant, and alert count.
  - Produces per-driver performance breakdown.
- **Endpoints**: Mounted `GET /api/reports/summary`.

### 6. Alert Center Route & Filtering Hardening (Phase 4)
- **Notification Queries**: Extended `listNotifications` with filters for `severity`, `resolved`, `from`, and `to`.
- **Alert Resolution**: Verified `PATCH /api/notifications/:id/resolve` for resolving alerts.

### 7. Diagnostics & Offline UX Parity (Phase 6)
- **Telemetry Diagnostics**: Created unified `resolveTelemetryDiagnostics` in both Web (`apps/web/lib/telemetry.ts`) and Mobile (`apps/mobile/telemetry.ts`).
- **4-State Model**: Authoritatively separates `ONLINE`, `OFFLINE`, `GPS_STALE` / `GPS_DEGRADED`, and `SYNCING` without collapsing states.
- **Speed Semantics**: Preserved strict separation between current speed (fresh GPS + MOVING) and historical speed.

### 8. Web Dashboard Enhancements (Phase 2, 3, 4, 5)
- **API Client**: Added `getDriverActivity`, `getReportsSummary`, `listAuditLogs`, `resolveNotification`, and `forceEndDriverShift` to `apps/web/lib/api.ts`.
- **Navigation Shell**: Added navigation links and route protection for `/dashboard/alerts`, `/dashboard/reports`, and `/dashboard/audit` (Admin only).
- **Driver Details Page**: Integrated Activity Timeline card and upgraded Location History table with operational status, geofence, and accuracy tags. Added Force End Shift button.
- **Alert Center Page (`/dashboard/alerts`)**: Built full triage center with severity filtering, resolution actions, and driver links.
- **Reports Page (`/dashboard/reports`)**: Built operational analytics view with date range presets (Today, Yesterday, 7 Days, 30 Days), metric cards, and driver breakdown table.
- **Audit Log Page (`/dashboard/audit`)**: Built audit trail view with entity filter and JSON payload inspection modal.

### 9. Mobile Admin Parity (Phase 7)
- **Driver Detail Modal**: Added 3 segmented tabs:
  - `Overview`: Connection status, live/stale telemetry, shift & device hardware, Reset Device & Force End Shift buttons.
  - `Activity`: Field activity timeline with color-coded event dots and timestamps.
  - `Locations`: Recent location trail with coordinates, operational status pills, speed, and accuracy.
- **Admin Home Screen More Tab**:
  - Added **Reports** subview: Date presets, summary metric cards, and driver performance breakdown.
  - Added **Audit Log** subview: Action badges, actor info, entity tags, timestamps, and payload inspection.
  - Enhanced **Notifications** subview: Added "Resolve" button for alerts.
