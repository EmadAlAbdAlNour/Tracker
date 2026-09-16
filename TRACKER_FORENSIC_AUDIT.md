# TRACKER — Comprehensive Forensic Audit Report

**Date**: September 16, 2026  
**Auditor**: Antigravity Primary Engineering Agent  
**Repository**: `C:\Users\Emad\Desktop\Tracker\Tracker` (Canonical, branch `main`)

---

## 1. CURRENT ARCHITECTURE

The Tracker system is architected as a pnpm workspace monorepo with 4 principal tiers:
- **`apps/mobile`**: Expo SDK 53 / React Native 0.79.6 application for Android drivers (and operational monitoring for admin/call-center).
- **`apps/web`**: Next.js 14.2.15 dashboard with App Router, Tailwind CSS, Leaflet/React-Leaflet maps, and Arabic (RTL) / English internationalization.
- **`artifacts/api-server`**: Express 4 REST API with JWT access/refresh authentication, centralized RBAC, Zod schema validation, and PostgreSQL connection pooling.
- **`lib/db`**: PostgreSQL schema and query layer managed with Drizzle ORM and Neon serverless driver (`@neondb/serverless` / `pg`).
- **`scripts`**: Operational, forensic, verification, and migration reproducibility utilities.

### Architectural Classification
- **Driver tracking & fleet monitoring system**: The application exclusively models users, drivers, devices, shifts, location points, geofenced restaurant settings, alert configurations, alert states, and notifications.
- **Zero Orders Contract**: Confirmed. There are NO orders, deliveries, items, menus, POS, or dispatch entities anywhere in active schema, types, routes, or frontends.

---

## 2. CURRENT ROLE MODEL

The system enforces a strict three-role model:
1. `ADMIN`: Full operational and administrative control across web and mobile.
2. `CALL_CENTER`: Read-only monitoring access (drivers, status, fleet, live map, tracking, battery, network, notifications).
3. `DRIVER`: Mobile-first operational tracking for own shift, own device, own telemetry, and own profile.

### Role Audit Findings
- **Active `MANAGER` role**: **REMOVED** [IMPLEMENTED]. No active runtime types, routes, permissions, UI forms, or active schema definitions accept or produce `MANAGER`.
- **Historical Migration Snapshots**: `lib/db/drizzle/meta/0000_snapshot.json` and `0001_snapshot.json` retain historical records as allowed by specification.
- **Legacy Residual in Tests/Scripts**:
  - `artifacts/api-server/src/database.integration.test.ts`: Residual variable names `managerUser` / `managerAccessToken` (pointing to `createdCallCenter`) [PARTIALLY IMPLEMENTED - cleanup needed].
  - `scripts/src/db-forensics.ts`: Contains references to historical test credentials `manager1@tracker.local` [IMPLEMENTED / benign forensic script].

---

## 3. DATABASE STATE

- **Schema Engine**: Drizzle ORM (`lib/db/src/schema/index.ts`).
- **Tables Present**:
  - `users`: id, name, email (unique), phone, password_hash, role (`user_role`), active, created_at, updated_at.
  - `drivers`: id, user_id (unique, fk users.id cascade), employee_id (unique), active, created_at, updated_at.
  - `devices`: id, driver_id (fk drivers.id cascade), platform, device_identifier, app_version, last_seen, last_location_at, authorized, battery_percentage, is_charging, location_services_enabled, network_status.
  - `shifts`: id, driver_id (fk drivers.id cascade), started_at, ended_at, status (`shift_status`), unique active shift per driver.
  - `refresh_tokens`: id, user_id (fk users.id cascade), token_hash (unique), expires_at, revoked_at, device_id (fk devices.id set null).
  - `location_points`: id, driver_id (fk drivers.id cascade), shift_id, client_location_id, latitude, longitude, accuracy, altitude, speed, heading, recorded_at, received_at, source.
  - `restaurant_settings`: id, name, latitude, longitude, radius_meters, enabled, updated_at, updated_by.
  - `alert_settings`: id, thresholds, enabled flags for stop/gps/offline/battery/geofence, updated_at.
  - `alert_state`: id, driver_id, alert_type, triggered_at, resolved_at, last_notified_at, state_data (unique on driver_id + alert_type).
  - `notifications`: id, type, severity, title_ar, title_en, message_ar, message_en, driver_id, shift_id, metadata, read, read_at, resolved, resolved_at, created_at.
- **Database Status**: [IMPLEMENTED, with Gaps in Notifications Scoping].
  - **Gap**: `notifications` table has a single global `read` boolean. If Operator A marks a notification as read, it becomes read for Operator B as well. User-scoped notification tracking requires a dedicated `notification_reads` tracking mechanism.

---

## 4. AUTH STATE

- **Implementation**: Access token (JWT, 15m TTL), Refresh token (JWT + SHA-256 hash stored in DB, 30d TTL).
- **Concurrency & Race Conditions**: [IMPLEMENTED]. Single-flight promise sharing (`activeRefreshPromise` in web, mutex in mobile) prevents race conditions during concurrent token refresh.
- **Fail Closed Behavior**: [IMPLEMENTED]. Invalid, malformed, revoked, or unsupported role tokens fail closed with 401. Handled gracefully without 500 errors.
- **Session Validation**: Mobile session validates JSON structure and rejects malformed payloads (`apps/mobile/session.ts`).
- **Gaps**: None in core auth logic.

---

## 5. DEVICE AUTH STATE

- **Driver Single-Device Rule**: [IMPLEMENTED].
  - Driver login binds refresh token to authorized device ID.
  - Login attempt with a second/different device identifier returns 403 `AUTH_DEVICE_MISMATCH`.
  - Admin device reset (`POST /api/drivers/:id/device/reset`) sets `authorized: false` and revokes all refresh tokens for that device.
  - Upon reset, previous device is rejected and driver can pair a new device.
- **Admin/Call Center Concurrent Devices**: [IMPLEMENTED]. `user.role !== 'DRIVER'` skips single-device binding and allows multi-device sessions.

---

## 6. MOBILE STATE

- **Framework**: Expo SDK 53, React Native 0.79.6, New Architecture enabled.
- **Driver Experience**: [IMPLEMENTED]. Shift start/end, GPS status indicator, queued points counter, manual sync button, RTL layout.
- **Operator Experience on Mobile**: [PARTIALLY IMPLEMENTED].
  - `OperatorHomeScreen` in `App.tsx` currently contains a static informational card with a "Return to Login" button.
  - Missing real mobile monitoring UI (fleet summary counters: active/online/offline, driver list with battery/location indicators, pull-to-refresh).
- **Session Handling**: [IMPLEMENTED]. SecureStore persistence, fail-closed validation, automatic token refresh on 401.

---

## 7. TELEMETRY STATE

- **Pipeline**:
  1. GPS collected via `expo-location`.
  2. Battery/charging status collected via `expo-battery`.
  3. Network state collected via `@react-native-community/netinfo`.
  4. Bundled into `QueuedLocationPoint` with client UUID.
  5. Queued in `AsyncStorage`.
  6. Flushed in batches (up to 20 points) to `/api/drivers/me/location/batch`.
  7. Ingested into `location_points` table and updates `devices` table with latest battery, charging, locationServicesEnabled, and networkStatus.
  8. Propagated to `/api/fleet/live` and Web Map.
- **Status**: [IMPLEMENTED]. All required telemetry fields survive from Android hardware to the web dashboard.

---

## 8. BACKGROUND TRACKING STATE

- **Engine**: `expo-task-manager` and `expo-location` background task `tracker-driver-location-task`.
- **Status**: [PARTIALLY IMPLEMENTED].
  - `registerBackgroundLocationTask` is defined and registers successfully.
  - In `startBackgroundTracking()`, only `foreground` permission was checked before calling `startLocationUpdatesAsync`.
  - Android 10+ requires explicit background location permission (`ACCESS_BACKGROUND_LOCATION`).
  - If background permission is denied, background tracking will terminate when the app is minimized.
  - Fix needed: Must explicitly check and enforce background permission and alert driver if background permission is not granted.

---

## 9. GEOFENCE STATE

- **Calculation**: Haversine distance formula against restaurant center (`latitude`, `longitude`, `radiusMeters`).
- **Transitions**: [IMPLEMENTED]. Detects `GEOFENCE_ENTER` and `GEOFENCE_EXIT` and updates `alert_state` (`GEOFENCE_STATUS` = `INSIDE` / `OUTSIDE`).
- **Inactivity Suppression**: [IMPLEMENTED]. When driver is inside restaurant geofence, extended stop alerts (`STOP_EXTENDED`) are suppressed.

---

## 10. ALERT STATE

- **Categories Covered**:
  - `STOP_EXTENDED`: Triggered when driver stopped outside restaurant beyond `maxStopDurationMinutes`.
  - `BATTERY_LOW` / `BATTERY_CRITICAL`: Triggered when battery drops below thresholds (20% / 10%).
  - `GPS_DISABLED`: Triggered when location services are turned off.
  - `DRIVER_OFFLINE`: Triggered when driver has an active shift but sends no telemetry past `offlineGraceMinutes`.
- **Deduplication & Cooldown**: [IMPLEMENTED]. 15-minute cooldown (`NOTIFICATION_COOLDOWN_MS`) prevents alert spam.
- **Gaps**: [PARTIALLY IMPLEMENTED].
  - `evaluateDriverOfflineAlert` is currently only invoked during on-demand queries to `/api/fleet/live`.
  - If no operator opens the web dashboard, offline drivers are never evaluated proactively.
  - A background evaluation scheduler is required in `api-server` to periodically scan active shifts for offline and stopped drivers.
  - Some catch blocks in `authService.ts` and `fleetService.ts` use empty `.catch(() => {})`, hiding potential alert failures.

---

## 11. NOTIFICATION STATE

- **Backend**:
  - `GET /api/notifications`: Returns paginated notifications and total/unread counts.
  - `PATCH /api/notifications/:id/read`: Marks notification as read.
  - `POST /api/notifications/read-all`: Marks all notifications as read.
- **Web UI**: Slide-over notification panel with badge count, mark as read on click, and "mark all as read".
- **Gaps**: [PARTIALLY IMPLEMENTED].
  - Notifications are currently global. Marking a notification as read affects all users.
  - Needs a user-scoped read ledger (`notification_reads`) so each operator's read status is isolated.

---

## 12. WEB STATE

- **Pages**:
  - `/login`: Clean Arabic/English login screen with credentials validation.
  - `/dashboard`: High-level operations overview, KPI cards, fleet status table, quick actions.
  - `/dashboard/drivers`: Driver management list, add/edit driver dialogs, search/filter, shift status.
  - `/dashboard/drivers/[id]`: Detailed driver profile, device status, shift history, location breadcrumbs.
  - `/dashboard/devices`: Device authorization ledger, hardware details, admin device reset.
  - `/dashboard/users`: User management (Admin/Call Center), role selection, active toggle.
  - `/dashboard/map`: Fullscreen interactive Leaflet map with geofence, driver markers, and filters.
  - `/dashboard/settings`: Restaurant location/radius geofence configuration and alert threshold sliders.
- **Role Guards**: [IMPLEMENTED]. Call Center role is restricted from accessing `/dashboard/users`, `/dashboard/settings`, and `/dashboard/devices`.
- **Status**: [IMPLEMENTED]. Builds with 0 errors across all 11 routes.

---

## 13. MAP STATE

- **Technology**: React-Leaflet with OpenStreetMap tiles.
- **Viewport Stability**: [IMPLEMENTED].
  - Polling every 10 seconds updates driver coordinates and status without resetting the map viewport, center, or zoom.
  - Recentering occurs ONLY when the user clicks the "Recenter" button or selects a driver card to pan.
- **Markers & Overlays**:
  - Restaurant marker with dashed geofence radius circle.
  - Drivers with color-coded operational status (Green = Moving, Amber = Stopped, Blue = At Restaurant, Gray = Offline).
  - Popup displaying driver name, speed, battery %, last updated timestamp.

---

## 14. SECURITY STATE

- **Transport Security**:
  - API and Web run on HTTPS in production (`tracker-alpha-puce.vercel.app`, `tracker-web-psi.vercel.app`).
  - Mobile release config had `usesCleartextTraffic: true` in `apps/mobile/app.config.ts` [PARTIALLY IMPLEMENTED - fix needed for release].
- **CORS**: Enforces explicit allowed origins allowlist. Includes PUT, PATCH, POST, GET, DELETE, OPTIONS.
- **Hardcoded Secrets**:
  - `artifacts/api-server/src/config/env.ts` requires `DATABASE_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` in production.
  - `scripts/src/prod-verification.ts` had hardcoded admin credentials [PARTIALLY IMPLEMENTED - fix needed].
- **Token Security**:
  - Web currently stores access token and refresh token in `localStorage`. While standard for SPAs, moving toward httpOnly cookies or session storage where feasible is advised. Token expiry is 15 minutes.

---

## 15. TEST STATE

- **Current Test Count**: 86 passing tests.
  - `apps/mobile`: 17 tests (App role routing, session validation, queue flushing, cap enforcement, retry backoff).
  - `artifacts/api-server`: 49 tests (Auth, role enforcement, device lifecycle, location batching, CORS, refresh token rotation, phase0 baseline).
  - `apps/web`: 20 tests (Functional web flows, role guards, formatting, localization).
- **Gaps**: [PARTIALLY IMPLEMENTED].
  - Missing unit tests for user-scoped notifications.
  - Missing unit tests for proactive background alert evaluation.
  - Missing tests for mobile centralized i18n module.

---

## 16. ANDROID STATE

- **Gradle Build**: Gradle 8.13 wrapper, AGP 8.8.2, Kotlin 2.0.21, React Native 0.79.6.
- **Windows MAX_PATH**: Resolved via `scripts/patch-expo-modules-core.cjs` setting `CMAKE_OBJECT_PATH_MAX 260`.
- **Build Status**:
  - `assembleDebug`: EXIT 0 (149 MB APK verified).
  - `assembleRelease`: EXIT 0 (67.7 MB APK verified).
- **Metro Bundler**: Resolved. `unstable_serverRoot` removed; 924 modules bundle cleanly with 0 errors.

---

## 17. PRODUCTION STATE

- **Production API**: `https://tracker-alpha-puce.vercel.app` (Healthy, CORS PUT allowed).
- **Production Web**: `https://tracker-web-psi.vercel.app` (Healthy, authenticated).
- **Production Database**: Neon PostgreSQL (`neondb`).
- **Status**: [VERIFIED via production verification script].

---

## 18. EXACT GAPS

1. **Gap 1 (Notifications Scoping)**: `notifications` table and routes lack user-scoped read tracking. All operators share a single read status.
2. **Gap 2 (Alert Evaluation Scheduler)**: Offline alerts are evaluated only on on-demand `/api/fleet/live` queries. No proactive background evaluation exists when no operator is actively browsing the dashboard.
3. **Gap 3 (Mobile Operator Experience)**: `OperatorHomeScreen` in mobile is a static placeholder with a "Return to Login" button instead of a functional monitoring view.
4. **Gap 4 (Mobile Background Permission Check)**: `startBackgroundTracking()` checks only foreground location permission before starting the background task.
5. **Gap 5 (Mobile Centralized Localization & Persistence)**: Mobile strings use ternary `isArabic ? ... : ...` without centralized dictionary, and language choice is not persisted across app reboots.
6. **Gap 6 (Android Release Cleartext Traffic)**: `app.config.ts` sets `usesCleartextTraffic: true`, which should only be enabled for debug builds.
7. **Gap 7 (Empty Catches & Swallowed Errors)**: Silent `.catch(() => {})` in `authService.ts` and `fleetService.ts` suppress alert processing errors.
8. **Gap 8 (Residual Manager References in Tests)**: Legacy `managerUser` variable names remain in `database.integration.test.ts`.
9. **Gap 9 (Hardcoded Test Script Password)**: `scripts/src/prod-verification.ts` has a hardcoded password string.

---

## 19. DEPENDENCIES BETWEEN GAPS

- **Gap 1 (User-scoped Notifications)** requires:
  - Database schema addition (`notification_reads` table) in `lib/db`.
  - Migration script.
  - Updates to `notificationService.ts` and `routes/notifications.ts`.
  - Frontend updates in `apps/web` and `apps/mobile`.
- **Gap 2 (Alert Evaluation Scheduler)** depends on:
  - `alertService.ts` and `settingsService.ts`.
  - Integration with `artifacts/api-server/src/index.ts`.
- **Gap 3 (Mobile Operator Experience)** depends on:
  - Centralized mobile i18n (Gap 5).
  - `/api/fleet/live` endpoint.
- **Gap 4 (Mobile Background Permissions)** is independent and self-contained in `apps/mobile/location.ts`.

---

## 20. IMPLEMENTATION PRIORITY

1. **Priority 1 (Safety & Schema)**:
   - Implement `notification_reads` table in `lib/db` and generate/apply migration.
   - Update `notificationService.ts` to enforce user-scoped read tracking.
2. **Priority 2 (Alert Engine Correctness)**:
   - Implement proactive periodic alert evaluation scheduler in `api-server` (scanning active shifts for offline and stopped drivers).
   - Replace empty catches with observable logging.
3. **Priority 3 (Mobile Hardening & Operator UX)**:
   - Enforce background location permission in `startBackgroundTracking()`.
   - Build real `OperatorHomeScreen` with fleet monitoring counters, driver cards, and pull-to-refresh.
   - Centralize mobile localization in `apps/mobile/i18n.ts` with persistent language storage and Western digits.
   - Disable cleartext traffic in release configuration in `app.config.ts`.
4. **Priority 4 (Security & Cleanup)**:
   - Sanitize `prod-verification.ts` credentials to use environment variables.
   - Clean up residual `managerUser` variable names in `database.integration.test.ts`.
5. **Priority 5 (Testing & Verification)**:
   - Add unit tests for user-scoped notifications, alert scheduler, and mobile localization.
   - Run full test suite, typecheck, web build, and Android build verification.

