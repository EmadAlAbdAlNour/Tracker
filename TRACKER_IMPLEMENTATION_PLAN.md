# TRACKER — Master Implementation Plan

**Based on**: Forensic Audit (`TRACKER_FORENSIC_AUDIT.md`)  
**Target State**: Production-Complete, Formally Hardened, End-to-End Verified

---

## Work Item 1: User-Scoped Notifications System

- **Objective**: Ensure notifications are user-scoped so that when an operator (Admin or Call Center) reads or marks notifications as read, other operators retain their own independent read/unread status.
- **Current State**: `notifications` table has a single global `read` column. `markNotificationAsRead` updates this single column, causing all operators to see it as read.
- **Required Change**:
  1. Add `notification_reads` table in `lib/db/src/schema/index.ts` with `notification_id` and `user_id`, unique index on `(user_id, notification_id)`.
  2. Create migration script `0005_user_scoped_notifications.sql`.
  3. Update `notificationService.ts`:
     - `listNotifications(userId, params)`: Join `notification_reads` on `user_id = userId` to determine `read` status per user.
     - `markNotificationAsRead(notificationId, userId)`: Insert into `notification_reads` for this user.
     - `markAllNotificationsAsRead(userId)`: Bulk insert into `notification_reads` for all unread notifications.
  4. Update `routes/notifications.ts` to pass `req.user.id` to service calls.
  5. Update web frontend notification handlers to maintain per-operator scoping.
- **Dependencies**: None.
- **Affected Files**:
  - `lib/db/src/schema/index.ts`
  - `lib/db/drizzle/0005_user_scoped_notifications.sql`
  - `artifacts/api-server/src/services/notificationService.ts`
  - `artifacts/api-server/src/routes/notifications.ts`
  - `apps/web/components/dashboard-shell.tsx`
- **Tests**: Add unit test `artifacts/api-server/src/notifications.scoped.test.ts` verifying independent read status between multiple users.
- **Verification Method**: Vitest unit & integration tests.
- **Risk**: Low. Fully backward-compatible fallback for global notifications.

---

## Work Item 2: Proactive Alert Evaluation Scheduler & Error Observability

- **Objective**: Automatically evaluate and trigger driver offline alerts and extended stop alerts on a scheduled interval without waiting for on-demand user polling or incoming telemetry.
- **Current State**: `evaluateDriverOfflineAlert` is only called inside `fleetService.ts` when an operator loads the live map. Inactivity alerts depend solely on incoming telemetry. Empty `.catch(() => {})` blocks silence alert errors.
- **Required Change**:
  1. Implement `evaluateAllActiveDriverAlerts()` in `alertService.ts`:
     - Query all drivers with an `ACTIVE` shift.
     - Check each driver's latest telemetry and lastSeen timestamp against `alertSettings.offlineGraceMinutes` and `alertSettings.maxStopDurationMinutes`.
     - Proactively trigger `DRIVER_OFFLINE` or `STOP_EXTENDED` alert if thresholds are exceeded.
  2. Implement background timer in `api-server` (`startAlertEvaluationScheduler()`) running every 30 seconds (skipped during unit tests).
  3. Replace empty catch blocks in `authService.ts` and `fleetService.ts` with observable error logging.
- **Dependencies**: Work Item 1 (for creating notifications).
- **Affected Files**:
  - `artifacts/api-server/src/services/alertService.ts`
  - `artifacts/api-server/src/services/authService.ts`
  - `artifacts/api-server/src/services/fleetService.ts`
  - `artifacts/api-server/src/index.ts`
- **Tests**: Unit test `artifacts/api-server/src/alert.scheduler.test.ts`.
- **Verification Method**: Test suite and simulated inactive driver evaluation.
- **Risk**: Low. Cooldown timers already prevent spamming.

---

## Work Item 3: Mobile Real Operator Experience (Admin / Call Center)

- **Objective**: Deliver a functional, informative monitoring experience on mobile for Admin and Call Center roles instead of a placeholder text and login redirect.
- **Current State**: `OperatorHomeScreen` in `apps/mobile/App.tsx` contains static text with a "Return to Login" button.
- **Required Change**:
  1. Build a real operational dashboard in `OperatorHomeScreen`:
     - Live KPI summary header (Active Drivers, Online, Stopped, Offline).
     - Filterable Driver status cards showing: Driver name, employee ID, operational status badge (Moving/Stopped/At Restaurant/Offline), battery percentage with warning indicator, and last updated time.
     - Pull-to-refresh control fetching `/api/fleet/live`.
     - Direct language toggle (Arabic/English) with RTL layout.
- **Dependencies**: Mobile i18n (Work Item 5).
- **Affected Files**:
  - `apps/mobile/App.tsx`
- **Tests**: Update `apps/mobile/App.test.ts` to test operator view rendering and state transitions.
- **Verification Method**: Metro bundling and unit tests.
- **Risk**: Low. Self-contained UI module.

---

## Work Item 4: Mobile Background Tracking & Permission Hardening

- **Objective**: Strictly verify both foreground and background location permissions on Android before starting the tracking task, and inform the driver if background permission is missing.
- **Current State**: `startBackgroundTracking()` checks only `foreground` permission.
- **Required Change**:
  1. Update `startBackgroundTracking()` in `apps/mobile/location.ts`:
     - Request and verify `background` permission as well as `foreground`.
     - If `background` permission is denied, do not claim success. Return a status indicating background permission is missing.
  2. In `App.tsx` `handleStartShift`:
     - If background permission is denied, show an informative alert instructing the user to select "Allow all the time" in Android location settings.
- **Dependencies**: None.
- **Affected Files**:
  - `apps/mobile/location.ts`
  - `apps/mobile/App.tsx`
- **Tests**: `apps/mobile/location.test.ts` or updated `App.test.ts`.
- **Verification Method**: Vitest and typecheck.
- **Risk**: Low. Essential for reliable background tracking on Android 10+.

---

## Work Item 5: Mobile Centralized Localization, RTL & Western Digits

- **Objective**: Replace scattered ternary language strings with a centralized i18n module, persist the user's language choice, ensure full RTL alignment, and enforce Western digits (0-9).
- **Current State**: `apps/mobile/App.tsx` uses inline `isArabic ? ... : ...` states that reset on app reload.
- **Required Change**:
  1. Create `apps/mobile/i18n.ts` with complete Arabic (primary) and English (secondary) dictionaries.
  2. Implement `getStoredLocale()` and `setStoredLocale()` using `AsyncStorage` / `SecureStore`.
  3. Export `t(key)` helper and `formatWesternNumber()` utility.
  4. Refactor `App.tsx` to use `t(...)` from `i18n.ts`.
- **Dependencies**: None.
- **Affected Files**:
  - `apps/mobile/i18n.ts` [NEW]
  - `apps/mobile/App.tsx`
  - `apps/mobile/App.test.ts`
- **Tests**: Unit test for mobile i18n translations and Western digit formatting.
- **Verification Method**: Vitest and mobile test pass.
- **Risk**: Very low.

---

## Work Item 6: Mobile Release HTTPS Security Hardening

- **Objective**: Prevent cleartext HTTP traffic in production release builds.
- **Current State**: `apps/mobile/app.config.ts` has `usesCleartextTraffic: true`.
- **Required Change**:
  - Conditionally set `usesCleartextTraffic` only in development (`process.env.NODE_ENV !== 'production'`), ensuring production release APK enforces HTTPS only.
- **Dependencies**: None.
- **Affected Files**:
  - `apps/mobile/app.config.ts`
- **Verification Method**: `assembleRelease` verification.
- **Risk**: Very low.

---

## Work Item 7: Codebase Hygiene & Credential Sanitization

- **Objective**: Clean up remaining historical manager variable names and sanitize test scripts.
- **Current State**: `database.integration.test.ts` has `managerUser` variable names; `scripts/src/prod-verification.ts` has a hardcoded password string.
- **Required Change**:
  - Rename residual test variables in `database.integration.test.ts` to `callCenterUser`.
  - Update `prod-verification.ts` to read credentials from environment variables (`PROD_ADMIN_PASSWORD ?? 'Password123!'`).
- **Dependencies**: None.
- **Affected Files**:
  - `artifacts/api-server/src/database.integration.test.ts`
  - `scripts/src/prod-verification.ts`
- **Verification Method**: Test run.
- **Risk**: None.

---

## Work Item 8: Comprehensive Verification & Build Gates

- **Objective**: Execute and verify the complete testing matrix across all packages.
- **Scope**:
  - Full Vitest suite across mobile, web, and API server.
  - Full TypeScript typecheck across all 4 packages.
  - Web production Next.js build.
  - Android APK build (Debug and Release).
- **Verification Method**: Terminal command exits with code 0.

