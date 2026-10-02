# TRACKER — MASTER IMPLEMENTATION PLAN

## 1. CURRENT ARCHITECTURE & BASELINE RECONNAISSANCE

### 1.1 Architecture Baseline
- **Mobile**: Expo SDK 53 + React Native 0.79.6 + Android Native Kotlin telemetry (`TrackerLocationService`, `TrackerLocationStore`, `TrackerLocationUploader`). SQLite durable queue with shift isolation and bounded retry.
- **Backend**: Express 5 + PostgreSQL (Neon) with Drizzle ORM + JWT authentication + fine-grained permission middleware.
- **Web**: Next.js 14 App Router + Tailwind CSS + Leaflet maps + Cairo typography.
- **Existing Tests**: 277 passing tests across workspace (138 backend tests in Vitest, 84 mobile tests in Vitest, 55 web tests in Vitest). Full workspace typecheck currently passes cleanly.

### 1.2 Discovered Gaps
1. **Phase 1 (Telemetry/GPS Hardening)**:
   - Need speed accuracy check (`Location.hasSpeedAccuracy()`, `Location.getSpeedAccuracyMetersPerSecond() <= 25m/s` on Android O+) in `TrackerLocationService.kt`.
   - Need monotonic ordering verification via `elapsedRealtimeNanos` in `TrackerLocationService.kt` to prevent processing out-of-order samples.
2. **Phase 2 (Historical Data Layer: Location History + Shift History + Driver Activity)**:
   - Location history query endpoint currently lacks shift filtering, date range boundaries (`from`, `to`), and operational state tags per point.
   - No Driver Activity endpoint or service: need deterministic activity transition calculation (`SHIFT_STARTED`, `ARRIVED_AT_RESTAURANT`, `LEFT_RESTAURANT`, `MOVING`, `STOPPED`, `STOP_EXTENDED`, `SHIFT_ENDED`) reusing `evaluateOperationalHistory`.
3. **Phase 3 (Reports / Analytics)**:
   - No reporting service or API endpoint: need `/api/reports/summary` with metrics: total shifts, duration, distance, moving vs stopped vs restaurant time, alert counts, and per-driver breakdown.
   - Web lacks `/dashboard/reports` page.
   - Mobile Admin lacks Reports screen.
4. **Phase 4 (Alert Center)**:
   - Web has notification dropdown, but lacks a dedicated `/dashboard/alerts` Alert Center page to manage active vs resolved alerts, filter by driver/severity/type, and focus on affected drivers.
   - Mobile Admin has basic notifications list under More, but needs a full Alert Center view with active/resolved toggle and driver jump.
5. **Phase 5 (Centralized Audit Log)**:
   - Database schema lacks an `audit_logs` table.
   - Need centralized `auditService.ts` to log administrative and operational mutations without leaking sensitive data (passwords, tokens).
   - Need `/api/audit-logs` endpoint with filtering and pagination.
   - Web lacks `/dashboard/audit` page.
   - Mobile Admin lacks Audit Log view.
6. **Phase 6 (Driver Offline UX)**:
   - Need explicit 4-state connection & telemetry quality resolver (`ONLINE`, `OFFLINE`, `GPS STALE/DEGRADED`, `SYNCING`) with shared semantics and consistent UI badges/labels across Web and Mobile.
7. **Phase 7 (Mobile Admin Parity & UI Consistency)**:
   - Mobile Admin needs Reports view, Alert Center view, Audit Log view, and Driver History modal with Location Trail, Shift History, and Activity timeline.

---

## 2. DEPENDENCY GRAPH & SEQUENTIAL EXECUTION ORDER

```
Unit 1: Native Telemetry & GPS Hardening (Speed accuracy, monotonic ordering)
      ↓
Unit 2: Database Schema & Migration (audit_logs table, Drizzle migration 0009)
      ↓
Unit 3: Centralized Audit Service & Integration with Mutations
      ↓
Unit 4: Unified Historical Data Layer (Location History + Shift History + Driver Activity)
      ↓
Unit 5: Operational Reports & Analytics Service & API
      ↓
Unit 6: Centralized Alert Center Service & API Hardening
      ↓
Unit 7: Shared Connection & Offline UX Hardening (Web & Mobile Telemetry Resolvers)
      ↓
Unit 8: Web Dashboard Enhancements (Alert Center, Reports, Audit Log, Driver History/Activity)
      ↓
Unit 9: Mobile Admin Parity (Alert Center, Reports, Audit Log, Driver History/Activity Modal)
      ↓
Unit 10: Cross-Client Verification & Full Project Test Suite
```

---

## 3. DETAILED IMPLEMENTATION UNITS

### Unit 1: Native Telemetry & GPS Hardening
- **Target Files**:
  - `apps/mobile/android/app/src/main/java/com/tracker/driver/tracking/TrackerLocationService.kt`
- **Changes**:
  - In `handleNewLocation`: On API 26+, inspect `location.hasSpeedAccuracy()`. If `location.speedAccuracyMetersPerSecond > 25.0f`, invalidate speed (`null`).
  - Track `lastElapsedRealtimeNanos`. Reject out-of-order location fixes where `location.elapsedRealtimeNanos < lastElapsedRealtimeNanos`.
- **Verification**: Local Kotlin compilation via Gradle.

### Unit 2: Database Schema & Migration
- **Target Files**:
  - `lib/db/src/schema/index.ts`
  - `lib/db/drizzle/0009_audit_logs.sql`
  - `lib/db/drizzle/meta/_journal.json`
- **Changes**:
  - Add `auditLogsTable` with fields: `id`, `actorId`, `actorEmail`, `actorRole`, `action`, `entityType`, `entityId`, `details`, `ipAddress`, `createdAt`.
  - Indexes: `actorIdx`, `actionIdx`, `entityIdx`, `createdIdx`.
  - Export types: `AuditLog`, `InsertAuditLog`.
- **Verification**: `pnpm run typecheck:libs`.

### Unit 3: Centralized Audit Service & Middleware
- **Target Files**:
  - `artifacts/api-server/src/services/auditService.ts` (New)
  - `artifacts/api-server/src/routes/audit.ts` (New)
  - `artifacts/api-server/src/routes/index.ts`
  - Integrate audit logging in `userService.ts`, `authService.ts` (device reset, assign device, force-end shift), `settingsService.ts`.
- **Sanitization**: Strictly redact `password`, `token`, `hash`, `secret`, `refreshToken`.
- **Verification**: New unit test `audit.service.test.ts`.

### Unit 4: Unified Historical Data Layer (Locations + Shifts + Activity)
- **Target Files**:
  - `artifacts/api-server/src/services/historyService.ts` (New)
  - `artifacts/api-server/src/routes/drivers.ts`
  - Extend `GET /api/drivers/:id/locations` to support `shiftId`, `from`, `to`, `limit`, `page`.
  - Add `GET /api/drivers/:id/activity` returning deterministic state transitions (`SHIFT_STARTED`, `ARRIVED_AT_RESTAURANT`, `LEFT_RESTAURANT`, `MOVING`, `STOPPED`, `STOP_EXTENDED`, `SHIFT_ENDED`).
- **Verification**: New test `history.service.test.ts`.

### Unit 5: Reports & Analytics Service & API
- **Target Files**:
  - `artifacts/api-server/src/services/reportService.ts` (New)
  - `artifacts/api-server/src/routes/reports.ts` (New)
  - `artifacts/api-server/src/routes/index.ts`
  - `GET /api/reports/summary?from=...&to=...&driverId=...`
- **Verification**: New test `reports.service.test.ts`.

### Unit 6: Centralized Alert Center Service & API
- **Target Files**:
  - `artifacts/api-server/src/services/alertService.ts`
  - `artifacts/api-server/src/routes/notifications.ts`
  - Add support for querying active alert state, resolving alerts, filtering by severity and status.
- **Verification**: Tests in `alertService` and `notifications.ts`.

### Unit 7: Shared Connection & Offline UX Hardening
- **Target Files**:
  - `apps/web/lib/telemetry.ts`
  - `apps/mobile/telemetry.ts`
  - Enhance `resolveConnectionState` and `resolveOperationalState` to authoritatively produce 4-state diagnostics:
    - Connection: `ONLINE` vs `OFFLINE` (heartbeat-based)
    - GPS Quality: `FRESH` vs `STALE` vs `DEGRADED` vs `UNAVAILABLE`
    - Operational: `AT_RESTAURANT`, `MOVING`, `STOPPED`, `OFFLINE`, `AWAITING`
    - Syncing: `SYNCING` vs `SYNCED`
- **Verification**: Parity tests in both web and mobile test suites.

### Unit 8: Web Dashboard Enhancements
- **Target Files**:
  - `apps/web/lib/api.ts` (client functions for reports, audit, activity, location history)
  - `apps/web/components/dashboard-shell.tsx` (navigation items for Alerts, Reports, Audit)
  - `apps/web/app/dashboard/alerts/page.tsx` (New)
  - `apps/web/app/dashboard/reports/page.tsx` (New)
  - `apps/web/app/dashboard/audit/page.tsx` (New)
  - `apps/web/app/dashboard/drivers/[id]/page.tsx` (Add Activity timeline and Location history view)
- **Verification**: Web tests and `pnpm --filter web build`.

### Unit 9: Mobile Admin Parity
- **Target Files**:
  - `apps/mobile/screens/AdminHomeScreen.tsx`
  - `apps/mobile/components/DriverDetailModal.tsx`
  - Add navigation and views for:
    - Reports & Analytics
    - Centralized Alert Center
    - Audit Log
    - Driver History modal: Activity timeline, Shift History, Location breadcrumbs
- **Verification**: Mobile tests and typecheck.

### Unit 10: Full Final Verification
- Run backend tests, mobile tests, web tests, workspace typecheck, Android build, Web build.
- Review diff, generate `docs/VERIFICATION_REPORT.md` and `docs/CHANGELOG.md`.

---

## 4. ACCEPTANCE CRITERIA
- Zero test regressions across 277+ tests.
- Full typecheck passes with no errors.
- Native Android telemetry preserves single-pipeline architecture with hardened speed accuracy and monotonic ordering.
- Web and Mobile Admin consume identical REST API contracts with shared semantics and Cairo/RTL typography.
