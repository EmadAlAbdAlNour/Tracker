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

---

## [Post-Audit Remediation Pass] — Forensic Audit Fixes (F-01 through F-07)

### Finding F-01: Alert Resolution Endpoint
- Mounted `PATCH /api/notifications/:id/resolve` in `artifacts/api-server/src/routes/notifications.ts`, guarded by `requireAuth` and `requireRole("ADMIN", "CALL_CENTER")`.
- Implemented `resolveNotification(id, userId)` in `notificationService.ts` to set `resolved = true`, `resolvedAt = now`, `read = true`, `readAt = now`, and synchronize `alert_state` table resolution via `resolveAlertState()`.

### Finding F-02: Web Force End Shift Route Mismatch
- Fixed `apps/web/lib/api.ts` `forceEndDriverShift` path from `/shift/force-end` to canonical plural `/shifts/force-end`.
- Aliased both `POST /:id/shifts/force-end` and `POST /:id/shift/force-end` in backend router `routes/drivers.ts` for total backward and forward compatibility.

### Finding F-03 & F-06: Reports API Contract & N+1 Database Query Elimination
- Replaced sequential per-shift location queries with a single batch `inArray(locationPointsTable.shiftId, shiftIds)` query in `reportService.ts`, grouping points in memory.
- Standardized canonical response schema (`movingDurationMinutes`, `stoppedDurationMinutes`, `restaurantDurationMinutes`, `alertCount`, `drivers`) while populating backwards-compatibility aliases (`totalMovingMinutes`, `driverBreakdown`, etc.).
- Updated `apps/web/lib/api.ts`, `apps/web/app/dashboard/reports/page.tsx`, and `apps/mobile/screens/AdminHomeScreen.tsx` to consume canonical schema with robust fallback.
- Added telemetry gap threshold (`timeDiffSec <= 300`) to prevent gap interpolation.

### Finding F-04: Driver Activity Timeline Event Titles and Descriptions
- Updated `historyService.ts` (`getDriverActivityTimeline`) to populate localized `title` and `description` on all generated operational events (`SHIFT_STARTED`, `LEFT_RESTAURANT`, `ARRIVED_AT_RESTAURANT`, `MOVING`, `STOPPED`, `STOP_EXTENDED`, `GPS_DISABLED`, `BATTERY_CRITICAL`, `SHIFT_ENDED`).
- Added client-side fallback title resolvers in `apps/web/app/dashboard/drivers/[id]/page.tsx` and `apps/mobile/components/DriverDetailModal.tsx`.

### Finding F-05: Audit Log Actor Attribution in Clients
- Updated `apps/web/lib/api.ts`, `apps/web/app/dashboard/audit/page.tsx`, and `apps/mobile/screens/AdminHomeScreen.tsx` to read `log.actorEmail` and `log.actorRole` (with fallback to `log.userName` and `log.userRole`).
- Updated `auditService.ts` to return both `actorEmail`/`actorRole` and `userName`/`userRole` compatibility fields.

### Finding F-07: Database Performance Indexes
- Added `shifts_started_at_idx` index on `shifts(started_at)` and `notifications_resolved_idx` on `notifications(resolved)` in `lib/db/src/schema/index.ts`.
- Generated Drizzle migration `0010_performance_indexes.sql` and registered entry in `_journal.json`.

---

## [UI/UX Polish & Visual QA Pass] — Arabic-First Production Standards (Phases 1–20)

### 1. Mobile Design System & RTL Layout Symmetry
- **Bottom Navigation**: Inverted tab order under RTL in `BottomTabBar.tsx`, centered icons and labels, applied Cairo font weights, and refined unread notification badge styling.
- **RTL Flex Alignment**: Enforced `flexDirection: rowDir` on search inputs, checklist rows, diagnostic status indicators, and logout actions across `AdminHomeScreen`, `CallCenterHomeScreen`, and `DriverHomeScreen`.
- **Text Wrap & Clipping Prevention**: Protected badges and pills (`statusBadgePill`, `staleNoticePill`) with `flexShrink: 0`, `numberOfLines={1}`, and minimum width constraints.

### 2. Localization & Terminology Parity
- **Status & Role Badges**: Fully localized operational states (`في حركة`, `متوقف`, `بالمطعم`), user roles (`سائق`, `مسؤول`, `مركز الاتصال`), and alert severities (`حرج`, `تحذير`, `معلومة`).
- **Audit & Analytics Filters**: Localized entity tabs (`الكل`, `المستخدمين`, `السائقين`, `الأجهزة`, `الإعدادات`) and metric units (`كم/س`, `متر`, `كم`, `س`).
- **Numeral Standardization**: Formatted timestamps, IDs, and measurements consistently with Western Arabic numerals (`formatWesternNumber`).

### 3. Visual Verification & Documentation
- **Visual Evidence**: Captured and cataloged 32 high-resolution screenshots across all user roles, dialogs, and states on Android Emulator (`Medium_Phone_API_36.1`).
- **Audit Artifacts**: Produced `docs/UI_POLISH_PLAN.md`, `docs/UI_POLISH_AUDIT.md`, `docs/UI_LOCALIZATION_AUDIT.md`, and `docs/UI_VISUAL_QA.md`.
- **Zero Regressions**: 100% test pass rate across 327 automated tests and clean Next.js 14 production builds.
