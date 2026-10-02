# TRACKER — POST-IMPLEMENTATION FORENSIC AUDIT REPORT
**Target Commit**: `9d354db41b65ddee97063820593234d152d3f8d7`  
**Commit Message**: `feat: complete master product pass (telemetry hardening, historical data, reports, alerts, audit log, mobile admin parity)`  
**Audit Mode**: Read-Only Forensic Audit  
**Date**: September 30, 2026  

---

## 1. EXECUTIVE SUMMARY & VERDICT

### Overall Verdict: **CONDITIONAL PASS — PRODUCTION READINESS BLOCKED BY API CONTRACT DRIFT**

The architectural foundation implemented in commit `9d354db` is exceptionally robust and adheres strictly to Tracker's non-negotiable architectural mandates:
- The native Android telemetry pipeline remains a **single source of truth** (Foreground Location Service, `FusedLocationProviderClient`, dedicated `HandlerThread`, SQLite durable queue, monotonic ordering via `elapsedRealtimeNanos`, and speed accuracy auditing via `hasSpeedAccuracy()`).
- There are **zero competing telemetry mechanisms** (no WorkManager, JobScheduler, BackgroundFetch, Expo Location background tasks, FCM telemetry, or permanent WakeLocks).
- **Heartbeat (`lastSeen`) and GPS freshness (`recordedAt`) are logically and authoritatively decoupled** across backend services, mobile clients, and web dashboards.
- The role model strictly enforces `ADMIN`, `CALL_CENTER`, and `DRIVER`, with **zero active `MANAGER` roles**.
- All 293 automated tests pass, workspace TypeScript typecheck passes with 0 errors, Next.js production build compiles 17 static and dynamic routes cleanly, and native Android Kotlin compilation (`:app:compileDebugKotlin`) builds with 0 errors.

### Critical Deficiencies Discovered
Despite the strong architectural foundation and passing test suite, a deep forensic inspection of the codebase revealed **critical API contract divergences and missing route handlers** that cause newly added features to fail or display blank data in production:

1. **Missing Alert Resolution Endpoint (`PATCH /api/notifications/:id/resolve`) [CRITICAL]**:
   - Both Web (`apps/web/app/dashboard/alerts/page.tsx`) and Mobile (`apps/mobile/screens/AdminHomeScreen.tsx`) have UI buttons calling `PATCH /api/notifications/${id}/resolve`.
   - `docs/CHANGELOG.md` explicitly claimed: *"Alert Resolution: Verified PATCH /api/notifications/:id/resolve for resolving alerts."*
   - In reality, `artifacts/api-server/src/routes/notifications.ts` **does not implement this route**. Calling it returns `404 Not Found`. Users cannot manually resolve alerts from either client.
2. **Web Force End Shift Route Mismatch (`POST /api/drivers/:id/shift/force-end` vs `/shifts/force-end`) [HIGH]**:
   - Backend `artifacts/api-server/src/routes/drivers.ts` mounts `POST /:id/shifts/force-end` (plural).
   - Mobile `AdminHomeScreen.tsx` calls `/api/drivers/${driverId}/shifts/force-end` (plural, works).
   - Web `apps/web/lib/api.ts` line 535 calls `/api/drivers/${driverId}/shift/force-end` (singular).
   - Clicking "Force End Shift" on the Web Driver Details page fails with `404 Not Found`.
3. **Reports API Contract Divergence (Web & Mobile Display Broken / Empty) [CRITICAL]**:
   - Backend `reportService.ts` and `DATA_AND_API_CONTRACT.md` return:
     `{ summary: { movingDurationMinutes, stoppedDurationMinutes, restaurantDurationMinutes, alertCount, ... }, drivers: [...] }`.
   - Both Web (`apps/web/lib/api.ts` -> `reports/page.tsx`) and Mobile (`AdminHomeScreen.tsx`) expect:
     `{ summary: { totalMovingMinutes, totalStoppedMinutes, totalRestaurantMinutes, totalAlerts, ... }, driverBreakdown: [...] }`.
   - Result: Driver breakdown list is **completely empty (0 rows)** on both Web and Mobile. Summary cards for Moving Time, Restaurant Time, and Alerts display `NaNm` on Web and `0` on Mobile.
4. **Activity Timeline Missing Titles and Descriptions [HIGH]**:
   - Backend `historyService.ts` emits `ActivityEvent` with fields: `{ id, driverId, shiftId, type, timestamp, latitude, longitude, metadata }`. It does **not** include `title` or `description`.
   - Both Web (`apps/web/app/dashboard/drivers/[id]/page.tsx`) and Mobile (`DriverDetailModal.tsx`) render `{event.title}` and `{event.description}` directly without a fallback mapping from `type`.
   - Result: Every activity event on the timeline renders with a **blank title and blank description** on both Web and Mobile.
5. **Audit Log Actor Attribution Divergence [MEDIUM]**:
   - Backend `auditService.ts` and schema return `actorEmail` and `actorRole` (and `actorId`).
   - Frontend `apps/web/lib/api.ts` and `AdminHomeScreen.tsx` expect `userName` and `userRole`.
   - Result: Every audit log event in the Web table and Mobile card list displays the actor as **"System"** and role as **"—"**, masking the actual admin user who performed the mutation.
6. **Reporting Service N+1 Database Query Pattern [HIGH PERFORMANCE RISK]**:
   - `reportService.ts` loops through every shift in the requested date range and executes an individual `SELECT` query against `location_points`. For a fleet over a 30-day window (e.g. 500 shifts), this fires 500 sequential network queries to Neon/PostgreSQL.
   - Missing index on `shifts(started_at)` causes a full table scan on `shifts` for every report query.

---

## 2. REPOSITORY SNAPSHOT & COMMIT VERIFICATION

### Git Status & Commit Metadata
- **Current Branch**: `main`
- **Current HEAD**: `9d354db41b65ddee97063820593234d152d3f8d7`
- **Parent Commit**: `ec0a6af7efcba14dbeba4d251d102e3b2e564db7` (`chore: bump version to 1.1.6 and versionCode to 27`)
- **Working Tree**: Clean prior to this audit report creation.
- **Commit Diff Stat**: 39 files changed, 5011 insertions(+), 223 deletions(-).

### Monorepo Structure
```
Tracker/
├── apps/
│   ├── mobile/            # React Native 0.79.6 / Expo SDK 53 / Android Kotlin
│   └── web/               # Next.js 14.2.15 App Router / Tailwind CSS / Leaflet
├── artifacts/
│   └── api-server/        # Express 5 / Node.js / Drizzle ORM
├── lib/
│   └── db/                # Drizzle schema, migrations, connection pool
├── docs/                  # Architectural specs and reports
└── scripts/               # Preinstall and patch scripts
```

### Build & Test Verifications
- **Backend Tests (`vitest run` in `artifacts/api-server`)**: 21 test files, 144 tests passed (Duration: 11.8s).
- **Mobile Tests (`vitest run` in `apps/mobile`)**: 9 test files, 89 tests passed (Duration: 2.0s).
- **Web Tests (`vitest run` in `apps/web`)**: 4 test files, 60 tests passed (Duration: 1.9s).
- **Total Test Count**: 34 files, 293 tests passing (0 failures, 0 flaky tests).
- **Workspace Typecheck (`pnpm run typecheck`)**: 0 TypeScript compilation errors across `lib/db`, `api-server`, `mobile`, `web`, and `scripts`.
- **Web Production Build (`next build` in `apps/web`)**: 17 static and dynamic pages generated with 0 errors.
- **Native Android Build (`./gradlew :app:compileDebugKotlin`)**: Succeeded in 1m 15s (165 tasks executed/up-to-date).

---

## 3. DOCUMENTATION VS. IMPLEMENTATION RECONCILIATION

| Document Claim | Actual Implementation Status | Conformance Finding |
| :--- | :--- | :--- |
| **`docs/MASTER_SPEC.md` §3.1**: Single native Android telemetry pipeline; no secondary mechanisms | Preserved strictly in `TrackerLocationService.kt` and `TrackerLocationModule.kt` | **CONFORMANT** |
| **`docs/MASTER_SPEC.md` §3.2**: `lastSeen` separated from `recordedAt` | Maintained in `fleetService.ts`, `telemetry.ts` (Web & Mobile) | **CONFORMANT** |
| **`docs/MASTER_SPEC.md` §3.6**: Speed accuracy check (`<= 25m/s`) and monotonicity via `elapsedRealtimeNanos` | Implemented in `TrackerLocationService.kt` lines 426-452 | **CONFORMANT** |
| **`docs/MASTER_SPEC.md` §3.4**: STOPPED → MOVING (2 reliable points, speed >= 1.5 m/s, displacement >= 10m) | Enforced in `fleetService.ts` and `historyService.ts` activity timeline | **CONFORMANT** |
| **`docs/CHANGELOG.md` §6**: "Alert Resolution: Verified `PATCH /api/notifications/:id/resolve`" | **DOES NOT EXIST** in `artifacts/api-server/src/routes/notifications.ts` | **DEFECT (Claim False)** |
| **`docs/DATA_AND_API_CONTRACT.md` §3.2**: Reports returns `movingDurationMinutes`, `drivers` array | Backend implements this schema, but Web & Mobile clients use different property names | **CONTRACT DIVERGENCE** |
| **`docs/DATA_AND_API_CONTRACT.md` §2.6**: Audit logs schema has `actorEmail`, `actorRole` | Backend schema implements this, but Web & Mobile expect `userName`, `userRole` | **CONTRACT DIVERGENCE** |
| **`docs/DATA_AND_API_CONTRACT.md` §3.1**: Force-end shift at `POST /api/drivers/:id/shifts/force-end` | Backend has `/shifts/force-end`, Web calls `/shift/force-end` (singular) | **ROUTE MISMATCH** |

---

## 4. ARCHITECTURE AUDIT

### 4.1 Client-Server Role & Pipeline Purity
The architecture strictly respects the boundary rules established for Tracker:
```
Driver Android UI 
  ↓ (startTracking via TrackerLocationModule)
TrackerLocationService (Foreground Service, Priority.PRIORITY_HIGH_ACCURACY)
  ↓ (dedicated HandlerThread)
FusedLocationProviderClient
  ↓ (LocationCallback)
TrackerLocationStore (SQLite durable queue, shift isolation)
  ↓ (auto-triggered batching up to 20 points)
TrackerLocationUploader (HttpURLConnection, exponential backoff)
  ↓ (POST /api/drivers/me/location/batch)
PostgreSQL / Neon (location_points table)
```

### 4.2 Prohibited Architectural Elements Check
- **WorkManager**: None.
- **JobScheduler**: None.
- **BackgroundFetch**: None.
- **Expo Location Background Task**: None.
- **FCM as Telemetry Transport**: None.
- **Permanent WakeLock**: None.
- **Headless JS Uploader**: None.

The primary native pipeline is clean, durable, and free of competing background GPS abstractions.

---

## 5. HEARTBEAT & CONNECTION UX AUDIT

### 5.1 Freshness Contracts
1. **`lastSeen` (Device Freshness)**:
   - Updated on every authenticated HTTP request, batch location upload, and dedicated heartbeat:
     `POST /api/drivers/me/heartbeat`.
   - Native Android service runs an independent 60s timer (`startHeartbeat` in `TrackerLocationService.kt` lines 268-299) that fires independently of movement.
2. **`lastLocationAt` / `recordedAt` (GPS Fix Freshness)**:
   - Hardware timestamp from GPS satellite/fused fix.
   - Updated in `devicesTable.lastLocationAt` when a location batch is processed.

### 5.2 Offline Inference Verification
In `fleetService.ts` lines 420-428:
```ts
let isOnline = false;
let lastSeenDate: Date | null = null;
if (device?.lastSeen) {
  lastSeenDate = new Date(device.lastSeen);
  isOnline = now - lastSeenDate.getTime() <= offlineThresholdMs;
} else if (location?.recorded_at) {
  lastSeenDate = new Date(location.recorded_at);
  isOnline = now - lastSeenDate.getTime() <= offlineThresholdMs;
}
```
- **Finding**: When `device.lastSeen` exists, `isOnline` is determined **strictly by heartbeat freshness** (`offlineGraceMinutes`, default 5m). Stale GPS fixes (`recorded_at` > 5m ago) do NOT cause `isOnline` to become `false`.
- A stationary driver who does not move for 4 hours continues sending 60s heartbeats and remains `ONLINE` with operational state `STOPPED`.

### 5.3 4-State Diagnostic Model in Clients
Both `apps/web/lib/telemetry.ts` and `apps/mobile/telemetry.ts` implement `resolveTelemetryDiagnostics`:
1. `OFFLINE`: Heartbeat age > offlineGraceMinutes (`isOnline === false`).
2. `SYNCING`: Online, but `pendingQueueCount > 0` or `isSyncing === true`.
3. `GPS_STALE`: Online, but GPS age > 5 minutes.
4. `GPS_DEGRADED`: Online, but GPS accuracy > 35 meters.
5. `ONLINE`: Online with fresh, reliable GPS.

Neither Web nor Mobile collapses degraded GPS into an offline state. Both clients share identical status tokens, badge colors, and Arabic/English labels.

---

## 6. GPS & SPEED SEMANTICS AUDIT

### 6.1 Native Intake Quality Gate (`TrackerLocationService.kt`)
- **Severe Accuracy Discard**:
  Fixes with missing accuracy, negative accuracy, or `accuracy > 150m` are discarded at native intake before SQLite queueing (line 420).
- **Monotonic Realtime Ordering**:
  Using `location.elapsedRealtimeNanos` (API 17+), any sample where `curNanos < lastElapsedRealtimeNanos` is rejected, preventing clock jitter from replaying out-of-order samples into the state machine (line 427).
- **Speed Accuracy Hardening**:
  On Android O+ (API 26+), `location.hasSpeedAccuracy()` is checked. If `speedAccuracyMetersPerSecond > 25.0f`, speed is nullified (line 447).

### 6.2 Speed Suppression & Standstill Jitter
In `fleetService.ts` lines 503-518:
- Operational speed is displayed in the live fleet view **only when**:
  1. `operationalStatus === "MOVING"`
  2. Location fix is fresh (`<= 5 minutes`)
  3. Location accuracy is reliable (`<= 25m`)
  4. Speed value is present and non-null
- In all other cases (`STOPPED`, `AT_RESTAURANT`, or degraded GPS), live speed is clamped to **`0 km/h`**.
- This eliminates speed jumping or GPS multipath jitter while motorcycles are parked or idling.

---

## 7. MOVEMENT & GEOFENCE AUDIT

### 7.1 Movement Confirmation State Machine
Enforced in `fleetService.ts` (`evaluateOperationalHistory`) and `historyService.ts` (`getDriverActivityTimeline`):
- **STOPPED → MOVING**:
  Requires **2 consecutive reliable samples** (`accuracy <= 35m`) with **speed >= 1.5 m/s** (5.4 km/h) AND **displacement >= 10 meters**.
- **MOVING → STOPPED**:
  Requires **3 consecutive reliable samples** (`accuracy <= 35m`) with **speed < 1.0 m/s** (3.6 km/h).
- Degraded samples (`35m < accuracy <= 150m`) maintain the current confirmed operational state and cannot trigger a state change.

### 7.2 Geofence Hysteresis & Deadband
- **Restaurant Arrival**: 2 consecutive reliable samples inside configured radius (`distance <= radius`).
- **Restaurant Departure**: 2 consecutive reliable samples outside configured radius plus a **30m buffer** (`distance > radius + 30m`).
- **Deadband Buffer `[radius, radius + 30m]`**: Holds previous confirmed restaurant state to prevent rapid boundary toggling.
- Movement state and restaurant state are evaluated independently: a driver can be `AT_RESTAURANT + MOVING` or `OUTSIDE_RESTAURANT + STOPPED`.

---

## 8. HISTORICAL DATA LAYER & ACTIVITY AUDIT

### 8.1 Location History (`GET /api/drivers/:id/locations`)
- Implemented in `historyService.ts` (`listDriverLocationHistory`).
- Supports `shiftId`, `from`, `to`, `order`, with strict pagination (`limit` max 500).
- Calculates per-point operational status (`AT_RESTAURANT`, `MOVING`, `STOPPED`), distance to restaurant, and geofence containment.
- Web renders coordinates, accuracy, speed in km/h, and geofence tags in a paginated table.
- Mobile renders coordinates, accuracy, and operational pills in the "Locations" tab of `DriverDetailModal`.

### 8.2 Driver Activity Timeline (`GET /api/drivers/:id/activity`)
- Implemented in `historyService.ts` (`getDriverActivityTimeline`).
- Chronologically reconstructs shift events: `SHIFT_STARTED`, `ARRIVED_AT_RESTAURANT`, `LEFT_RESTAURANT`, `MOVING`, `STOPPED`, `STOP_EXTENDED`, `GPS_DISABLED`, `BATTERY_CRITICAL`, `SHIFT_ENDED`.
- **CRITICAL DEFECT DETECTED**:
  - The backend returns `{ id, driverId, shiftId, type, timestamp, latitude, longitude, metadata }`.
  - Both Web (`drivers/[id]/page.tsx` line 512) and Mobile (`DriverDetailModal.tsx` line 514) render `{event.title}` and `{event.description}`.
  - Because `title` and `description` are undefined on the wire and no client-side enum translation exists, all activity timeline items display **blank titles and blank descriptions**.

---

## 9. REPORTING & ANALYTICS AUDIT

### 9.1 API & Aggregation Semantics
Backend `reportService.ts` aggregates metrics for customizable date ranges:
- `totalShifts`: Total shifts active or completed in range.
- `totalDurationMinutes`: Sum of shift durations.
- `totalDistanceMeters`: Cumulative distance calculated strictly from consecutive reliable points with speed <= 150 km/h.
- `movingDurationMinutes`, `stoppedDurationMinutes`, `restaurantDurationMinutes`.
- `alertCount`: Operational notifications in period.
- `drivers`: Array of per-driver metric records.

### 9.2 CRITICAL DEFECT: Complete Web & Mobile Contract Divergence
```ts
// BACKEND SCHEMA (reportService.ts & DATA_AND_API_CONTRACT.md):
{
  summary: {
    totalShifts, totalDurationMinutes, totalDistanceMeters,
    movingDurationMinutes, stoppedDurationMinutes, restaurantDurationMinutes,
    alertCount
  },
  drivers: [
    { driverId, driverName, employeeId, shiftCount, totalDurationMinutes, ... }
  ]
}

// FRONTEND EXPECTATIONS (apps/web/lib/api.ts & apps/mobile/screens/AdminHomeScreen.tsx):
{
  summary: {
    totalShifts, totalDurationMinutes, totalDistanceMeters,
    totalMovingMinutes,       // <-- MISMATCH (Backend: movingDurationMinutes)
    totalStoppedMinutes,      // <-- MISMATCH (Backend: stoppedDurationMinutes)
    totalRestaurantMinutes,   // <-- MISMATCH (Backend: restaurantDurationMinutes)
    totalAlerts               // <-- MISMATCH (Backend: alertCount)
  },
  driverBreakdown: [          // <-- MISMATCH (Backend: drivers)
    { driverId, driverName, employeeId, shiftCount, durationMinutes, ... }
  ]
}
```
**Impact in Production**:
1. On Web (`/dashboard/reports`):
   - Moving Time displays `NaNm`.
   - Restaurant Time displays `NaNm`.
   - Alerts displays blank.
   - Driver Performance Breakdown table displays **0 drivers**.
2. On Mobile (`More -> Reports`):
   - Moving Time displays `0h`.
   - Stopped Time displays `0h`.
   - Alerts displays `0`.
   - Driver breakdown list displays **0 drivers**.

### 9.3 Performance Vulnerability: N+1 Database Queries
In `reportService.ts` lines 107-130:
```ts
for (const shift of shiftList) {
  const points = await db
    .select(...)
    .from(locationPointsTable)
    .where(eq(locationPointsTable.shiftId, shift.id))
    .orderBy(asc(locationPointsTable.recordedAt));
  ...
}
```
For 200 shifts, this issues 200 sequential queries to PostgreSQL over the database connection pool. This will cause request timeouts under high shift volumes.

---

## 10. ALERT CENTER AUDIT

### 10.1 Capabilities
- Notification table contains `severity` (`INFO`, `WARNING`, `CRITICAL`), `type`, `resolved`, `resolvedAt`, and user read tracking via `notification_reads`.
- Web Alert Center (`/dashboard/alerts`): Severity filters, active vs resolved filter, mark read, mark all read.
- Mobile Alert Center (`AdminHomeScreen` Notifications view): Notification cards with severity badges, timestamps, unread indicators.

### 10.2 CRITICAL DEFECT: Missing Resolve Endpoint
- Both Web (`alerts/page.tsx` line 71) and Mobile (`AdminHomeScreen.tsx` line 310) provide a "Resolve" button that calls `PATCH /api/notifications/:id/resolve`.
- **Finding**: In `artifacts/api-server/src/routes/notifications.ts`, the `/:id/resolve` route was **never implemented**.
- When an operator clicks "Resolve", the request fails with `HTTP 404 NOT FOUND`.
- Automatic resolution in `alertService.ts` (`resolveAlertState`) marks `alertStateTable.resolvedAt`, but does not mark `notificationsTable.resolved = true`. Therefore, all notifications remain permanently in the "Active" tab and never appear in the "Resolved" tab.

---

## 11. CENTRALIZED AUDIT LOG AUDIT

### 11.1 Security & Redaction Purity
- `auditService.ts` implements `sanitizeAuditDetails`, which recursively redacts `password`, `passwordhash`, `token`, `refreshtoken`, `accesstoken`, `telemetrytoken`, `secret`, `authorization`, and `cookie` with `"[REDACTED]"`.
- Unit tests in `audit.service.test.ts` verify that nested passwords, tokens, and authorization headers are never persisted.
- Audit table has no update or delete routes (tamper-resistant).
- Foreign key `actorId` uses `onDelete: "set null"` while persisting `actorEmail` and `actorRole` snapshots.

### 11.2 UI Property Mismatch
- Backend returns `{ id, actorId, actorEmail, actorRole, action, entityType, entityId, details, ipAddress, createdAt }`.
- Web (`apps/web/app/dashboard/audit/page.tsx` line 187) and Mobile (`AdminHomeScreen.tsx` line 1891) read `log.userName || 'System'` and `log.userRole || '—'`.
- Because `userName` and `userRole` do not exist in the response, all audit log entries on both Web and Mobile attribute mutations to **"System"** rather than the actual Admin user email.

---

## 12. ROLE & PERMISSIONS CONFORMANCE AUDIT

- **Allowed Roles**: `ADMIN`, `CALL_CENTER`, `DRIVER`.
- **Manager Role Check**: 100% eliminated. PostgreSQL enum `user_role` only contains `['ADMIN', 'CALL_CENTER', 'DRIVER']`. Tests explicitly assert `isAllowedRole('MANAGER') === false`.
- **Authorization Enforcement**:
  - `requireRole('ADMIN')` protects user management, device reset/assign, permanent deletion, system settings, and audit logs.
  - `requireRole('ADMIN', 'CALL_CENTER')` protects live fleet monitoring and reports.
  - Driver endpoints restrict access strictly to `req.user.id`.

---

## 13. WEB VS. MOBILE FEATURE PARITY AUDIT

| Feature | Web Dashboard | Mobile Admin | Mobile Call Center | Parity Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Live Fleet Map** | Leaflet tiles | `RealGeographicMapView` | `RealGeographicMapView` | **PARITY** | Same status color tokens and restaurant perimeter |
| **Fleet Summary Metrics** | Full cards | Overview cards | Overview cards | **PARITY** | Western digits, identical count resolvers |
| **Driver Details Overview** | Dedicated page | `DriverDetailModal` (Overview) | Read-only modal | **PARITY** | Connection status, device hardware, active shift |
| **Driver Location History** | Table view | Modal (Locations tab) | Read-only modal | **PARITY** | Coordinates, status pills, speed, accuracy |
| **Driver Activity Timeline** | Timeline card | Modal (Activity tab) | Read-only modal | **PARITY (Defect)** | Both render blank titles due to API contract mismatch |
| **Force End Shift** | PageHeader button | Modal action button | N/A (Admin only) | **DEFECT on Web** | Web calls `/shift/force-end` (404); Mobile calls `/shifts/force-end` (200) |
| **Reset Driver Device** | Profile button | Modal action button | N/A (Admin only) | **PARITY** | Dialog confirmation and token revocation on both |
| **Alert Center** | Dedicated page | Subview under More | Notifications tab | **DEFECT (Resolve)** | Both clients call missing `PATCH /notifications/:id/resolve` (404) |
| **Reports & Analytics** | Dedicated page | Subview under More | N/A | **DEFECT (Data)** | Contract divergence causes 0 driver rows and NaN/0 metrics on both |
| **Centralized Audit Log** | Dedicated page | Subview under More | N/A | **PARITY (Attribution)** | Actor names display as "System" on both due to property name divergence |
| **Restaurant Settings** | Settings page | Subview under More | N/A | **PARITY** | Geofence coordinates and radius mutation |
| **Alert Threshold Settings** | Settings page | Subview under More | N/A | **PARITY** | Grace minutes and battery thresholds mutation |
| **User CRUD** | Users page | Subview under More | N/A | **PARITY** | Create, edit, deactivate, permanent delete |

---

## 14. DATABASE SCHEMA, MIGRATIONS & INDEXES AUDIT

- **Migration `0009_audit_logs.sql`**: Valid idempotent SQL (`CREATE TABLE IF NOT EXISTS "audit_logs" ...`) registered in `_journal.json`.
- **Indexes Present**:
  - `location_points`: `driverIdx`, `shiftIdx`, `recordedIdx`, `driverRecordedIdx` (`driverId, recordedAt desc`).
  - `audit_logs`: `actorIdx`, `actionIdx`, `entityIdx`, `createdIdx`.
  - `shifts`: `driverIdx`, `statusIdx`, partial unique on `driverId` where `status = 'ACTIVE'`.
- **Missing Indexes Identified**:
  - `shifts(started_at)`: Missing. Required for date-range filtering in reports.
  - `notifications(resolved)`: Missing. Frequently queried by the Alert Center.

---

## 15. ERROR HANDLING, RESILIENCE & PERFORMANCE AUDIT

1. **Mobile Telemetry Resilience**:
   - SQLite queue handles device reboots and offline periods cleanly.
   - Bounded drain timeout (8s) during shift termination flushes pending points before service shutdown.
   - Idempotent backend ingestion (`ON CONFLICT (driver_id, client_location_id) DO NOTHING`) prevents duplicate insertions on network retry.
2. **Performance Bottlenecks**:
   - `reportService.ts`: Sequential N+1 query loop across shifts.
   - `historyService.ts` (`getDriverActivityTimeline`): Loads up to 2000 location records into server memory to evaluate consecutive sample transitions.

---

## 16. ANSWERS TO THE 18 CORE FORENSIC AUDIT QUESTIONS

### Q1: Is the native telemetry pipeline truly single-pipeline, or are there residual dual mechanisms?
**Answer**: Truly single-pipeline. There are zero residual or competing telemetry paths. Background tracking runs exclusively through `TrackerLocationService` using `FusedLocationProviderClient` on a dedicated `HandlerThread`, persisting to a native SQLite queue and uploading via `TrackerLocationUploader` to `POST /api/drivers/me/location/batch`. No WorkManager, JobScheduler, BackgroundFetch, Expo background tasks, or headless JS uploaders exist.

### Q2: Does `lastSeen` vs `lastLocationAt` work correctly across all backend, web, and mobile layers?
**Answer**: Yes, logically and authoritatively decoupled. `device.lastSeen` reflects HTTP and heartbeat freshness, while `location.recordedAt` reflects GPS satellite fix freshness. Drivers with an active shift and running service maintain regular 60s heartbeats, keeping them `ONLINE` even when stationary or when GPS is degraded. The shared 4-state diagnostics model correctly reports `GPS_STALE` or `GPS_DEGRADED` without marking the driver offline.

### Q3: How is speed handled across the entire pipeline from Android sensor to UI presentation?
**Answer**: Hardware-reported `Location.speed` is filtered on Android API 26+ via `hasSpeedAccuracy()` (must be `<= 25.0f m/s`). Ingestion accepts speed in m/s. In `fleetService.ts`, live speed is suppressed to `0 km/h` unless the driver is confirmed `MOVING`, fix age is `<= 5m`, and accuracy is `<= 25m`. On clients, `resolveSpeedSemantics` strictly distinguishes current speed (only during confirmed movement) from historical speed, preventing standstill jitter.

### Q4: Are movement confirmation rules strictly enforced everywhere, or only in some places?
**Answer**: Enforced strictly in operational state machines (`fleetService.ts` and `historyService.ts getDriverActivityTimeline`). STOPPED → MOVING requires 2 consecutive reliable points with speed >= 1.5 m/s and displacement >= 10m. MOVING → STOPPED requires 3 consecutive reliable points with speed < 1.0 m/s. In paginated location history points (`listDriverLocationHistory`), points are tagged independently based on instantaneous speed and geofence status.

### Q5: How is geofence hysteresis implemented and enforced?
**Answer**: Arrival requires 2 consecutive reliable points with `distance <= radius`. Departure requires 2 consecutive reliable points with `distance > radius + 30m`. The 30m buffer acts as a deadband where existing geofence state is retained. Alert notifications enforce a 60s cooldown to eliminate boundary ping-ponging.

### Q6: Does `historyService.ts` provide a sound, unified historical foundation or does `reportService.ts` duplicate / drift from it?
**Answer**: `historyService.ts` is sound, but `reportService.ts` **duplicates logic and drifts**. Instead of consuming canonical activity or history evaluations, `reportService.ts` implements an independent inline loop that uses single-point speed thresholds and lacks the 30m departure hysteresis.

### Q7: How does the shift lifecycle isolate telemetry, queue, and queries?
**Answer**: Mobile starting a shift tags points with `shiftId` and calls `purgeStaleShiftRecords` to clear uncommitted points from previous shifts. Backend verifies `it.shiftId === activeShift.id` and rejects mismatched points with `409 SHIFT_MISMATCH`. Points older than 24 hours or more than 60s in the future are rejected.

### Q8: Are breadcrumbs and location history correctly bounded, ordered, and typed?
**Answer**: Yes. Bounded to a maximum limit of 500 in `listDriverLocationHistory` and 2000 in `getDriverActivityTimeline`. Ordered chronologically or reverse-chronologically with strict pagination metadata.

### Q9: Is the reporting service scalable, or will large volumes of location points degrade performance?
**Answer**: **Not scalable in its current implementation**. It suffers from an N+1 query loop fetching points for each shift sequentially. Over long date ranges or large fleets, this will cause high database latency and memory bloat.

### Q10: Is the alert center complete, and how does alert resolution work?
**Answer**: **Incomplete due to missing backend route**. The route `PATCH /api/notifications/:id/resolve` does not exist in `routes/notifications.ts`, causing the "Resolve" button on both Web and Mobile to fail with 404. Automatic resolution resolves `alertStateTable` but does not update `notificationsTable.resolved`.

### Q11: Are audit logs truly tamper-resistant, comprehensive, and privacy-preserving?
**Answer**: Highly tamper-resistant and privacy-preserving. Sensitive credentials (passwords, tokens) are recursively redacted with `"[REDACTED]"`. Deleting an admin sets `actorId` to null while retaining `actorEmail` and `actorRole` snapshot strings. However, client property name divergence causes actor names to display as "System".

### Q12: Is the role model completely free of MANAGER references?
**Answer**: Yes. The role model contains exclusively `ADMIN`, `CALL_CENTER`, and `DRIVER`.

### Q13: Is Web vs Mobile feature parity genuine, or are there superficial stubs?
**Answer**: Structurally genuine, but compromised by API contract mismatches. Both clients implement all required views and screens, but contract drift breaks the Reports breakdown, Activity event titles, and Force End Shift on Web.

### Q14: Are database schema, migrations, and indexes optimized and intact?
**Answer**: Intact and functional. Missing indexes on `shifts(started_at)` and `notifications(resolved)` should be added to maintain performance as data grows.

### Q15: How resilient is offline caching and network recovery on mobile?
**Answer**: Highly resilient. SQLite queue stores telemetry locally with shift isolation, draining on shutdown or uploading in 20-point batches upon reconnection. Deduplication on PostgreSQL ensures zero data corruption on network retries.

### Q16: Are there N+1 database queries or performance bottlenecks in historical queries or reports?
**Answer**: Yes. `reportService.ts` contains an N+1 query loop across shifts.

### Q17: Are TypeScript types, interfaces, and contracts aligned across web, mobile, and api-server?
**Answer**: Aligned for telemetry diagnostics and core models, but **severely misaligned** for `ReportSummaryResponse`, `ActivityEvent`, and `AuditLogRecord`.

### Q18: What is the overall verdict: is Tracker production-ready after commit `9d354db`?
**Answer**: **CONDITIONAL PASS — BLOCKED FOR PRODUCTION**. The architectural foundation and telemetry core are solid and production-grade, but the 5 discovered API contract and routing defects must be remediated before production rollout.

---

## 17. FORENSIC FINDINGS TABLE

| ID | Severity | Category | Affected Component(s) | Description | Root Cause | Recommended Remediation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | **CRITICAL** | Route Missing | `api-server/routes/notifications.ts`, Web Alert Center, Mobile Admin | `PATCH /api/notifications/:id/resolve` returns 404 when clicking "Resolve" on Web or Mobile | Route was omitted from `notifications.ts` despite being claimed in CHANGELOG and called by both frontends | Mount `PATCH /:id/resolve` in `notifications.ts` to update `resolved: true, resolvedAt: now()` on `notificationsTable` and resolve `alertStateTable` |
| **F-02** | **HIGH** | Route Mismatch | `apps/web/lib/api.ts`, Web Driver Details | Web "Force End Shift" fails with 404 | `api.ts` line 535 calls `/api/drivers/${id}/shift/force-end` (singular) instead of `/shifts/force-end` (plural) | Fix endpoint path in `apps/web/lib/api.ts` to `/api/drivers/${id}/shifts/force-end` |
| **F-03** | **CRITICAL** | Contract Drift | `reportService.ts`, `web/lib/api.ts`, `reports/page.tsx`, `AdminHomeScreen.tsx` | Reports breakdown is completely empty (0 rows) on Web and Mobile; summary metric cards show `NaNm` or `0` | Property name mismatch: backend returns `drivers` and `movingDurationMinutes`, while clients expect `driverBreakdown` and `totalMovingMinutes` | Align `reportService.ts` to return both canonical and client-expected field aliases, or update frontend API types |
| **F-04** | **HIGH** | Contract Drift | `historyService.ts`, `web/drivers/[id]/page.tsx`, `DriverDetailModal.tsx` | Activity timeline items render with blank title and blank description on Web and Mobile | Backend `ActivityEvent` sends `{ type, timestamp, metadata }` without `title` or `description`; clients render `{event.title}` directly | Add localized `title` and `description` to `ActivityEvent` in `historyService.ts`, or add client-side title/description resolvers from `type` |
| **F-05** | **MEDIUM** | Contract Drift | `auditService.ts`, `web/dashboard/audit/page.tsx`, `AdminHomeScreen.tsx` | All audit log entries attribute actor to "System" and role to "—" | Backend returns `actorEmail` and `actorRole`; clients expect `userName` and `userRole` | Update frontend table to read `log.actorEmail` and `log.actorRole` (or alias in backend `listAuditLogs`) |
| **F-06** | **HIGH** | Performance | `api-server/services/reportService.ts` | Severe N+1 query pattern in reports generation | Iterating over shifts and executing a separate query to `location_points` for each shift | Batch load all points in one query: `where inArray(locationPointsTable.shiftId, shiftIds)` grouped by `shiftId` |
| **F-07** | **MEDIUM** | Performance | `lib/db/src/schema/index.ts` | Sequential table scan on `shifts` during date range queries | Missing index on `shifts.started_at` | Add `index("shifts_started_at_idx").on(table.startedAt)` in Drizzle schema and migration |

---

## 18. FINAL ACCEPTANCE CHECKLIST & REMEDIATION ROADMAP

### Immediate Remediation Plan (Required Before Production Release)

- [ ] **Step 1: Implement `PATCH /api/notifications/:id/resolve`** in `artifacts/api-server/src/routes/notifications.ts`:
  - Verify auth (`requireAuth`, `requireRole('ADMIN', 'CALL_CENTER')`).
  - Update `notificationsTable.resolved = true, resolvedAt = new Date()`.
  - Also resolve corresponding record in `alertStateTable`.
- [ ] **Step 2: Correct Web Force End Shift URL** in `apps/web/lib/api.ts`:
  - Change `/api/drivers/${driverId}/shift/force-end` to `/api/drivers/${driverId}/shifts/force-end`.
- [ ] **Step 3: Align Reports API Response Contract** in `artifacts/api-server/src/services/reportService.ts`:
  - In `summary`, supply both field sets:
    `totalMovingMinutes: movingDurationMinutes`,
    `totalStoppedMinutes: stoppedDurationMinutes`,
    `totalRestaurantMinutes: restaurantDurationMinutes`,
    `totalAlerts: alertCount`.
  - In response root, return `drivers` AND alias `driverBreakdown: drivers.map(...)` with `durationMinutes`, `distanceMeters`, `movingMinutes`, `stoppedMinutes`, `restaurantMinutes`.
- [ ] **Step 4: Provide Localized Activity Titles & Descriptions** in `artifacts/api-server/src/services/historyService.ts` or clients:
  - Add `title` and `description` to each `ActivityEvent` (e.g. "بدء الوردية" / "Shift Started", "مغادرة المطعم" / "Left Restaurant").
- [ ] **Step 5: Align Audit Log Actor Fields**:
  - In `auditService.ts`, provide `userName: item.actorEmail` and `userRole: item.actorRole` for backwards and cross-client compatibility.
- [ ] **Step 6: Eliminate Reports N+1 Query**:
  - Replace per-shift query with a single batched query using `inArray(locationPointsTable.shiftId, shiftIds)`.
- [ ] **Step 7: Add Missing Indexes**:
  - Add `index("shifts_started_at_idx").on(table.startedAt)`.
  - Add `index("notifications_resolved_idx").on(table.resolved)`.

---
*Report generated strictly via static forensic inspection, contract tracing, and test suite execution. No production code, schema, migrations, or tests were altered during this audit.*
