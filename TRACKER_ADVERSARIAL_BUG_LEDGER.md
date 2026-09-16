# TRACKER — ADVERSARIAL QA & DEFECT REMEDIATION LEDGER

**Date**: 2026-09-17  
**Repository**: `C:\Users\Emad\Desktop\Tracker\Tracker`  
**Test Suite**: 95/95 Passing (Vitest across `@workspace/api-server`, `@workspace/mobile`, `@workspace/web`)  
**Target Hardware**: Samsung Galaxy S25 Ultra (`SM-S938B`, Serial `R5CY731FGHA`, Android 16)  
**Database**: Neon PostgreSQL Production Instance  

---

## 1. Executive Summary

During the Adversarial QA and Real Product Bug Hunt across 25 targeted phases, 8 concrete defects were identified across authentication concurrency, device revocation authorization, geofence boundary hysteresis, driver operational state machines, mobile error resilience, map navigation ergonomics, settings validation, and administrator action feedback.

Every identified defect was analyzed for root cause, resolved in code, protected with automated test coverage or client-side guardrails, and verified against clean builds and typechecks.

---

## 2. Defect Remediation Register

| Bug ID | Severity | Phase | Component | Title | Status |
|---|---|---|---|---|---|
| **ADV-BUG-001** | **P0** | Phase 14 / 23 | Mobile Auth | Token Refresh Race Condition & Unintended Logout | **RESOLVED & VERIFIED** |
| **ADV-BUG-002** | **P0** | Phase 15 / 21 | API Auth & Shifts | Device Revocation Telemetry & Shift Bypass | **RESOLVED & VERIFIED** |
| **ADV-BUG-003** | **P1** | Phase 11 / 13 | API Alerts | Geofence Boundary Jitter & Notification Storm | **RESOLVED & VERIFIED** |
| **ADV-BUG-004** | **P1** | Phase 10 / 17 | Mobile Driver | Driver State Machine Inversion & Revocation Storm | **RESOLVED & VERIFIED** |
| **ADV-BUG-005** | **P1** | Phase 1 / 5 | Mobile UI | Silent API Error Masking & Missing Recovery Banners | **RESOLVED & VERIFIED** |
| **ADV-BUG-006** | **P2** | Phase 3 / 6 | Mobile Map | Directional Pan Deficit & Stale Driver Indication | **RESOLVED & VERIFIED** |
| **ADV-BUG-007** | **P1** | Phase 20 | Mobile Settings | Client-Side Settings Bounds Validation Deficit | **RESOLVED & VERIFIED** |
| **ADV-BUG-008** | **P2** | Phase 15 / 16 | Mobile Admin | Device Reset Unhandled Rejection & Missing Feedback | **RESOLVED & VERIFIED** |

---

## 3. Deep Forensic Root Cause & Remediation Details

### ADV-BUG-001: Single-Use Refresh Token Race Condition
- **Severity**: P0 (Blocker)
- **Files Modified**: `apps/mobile/App.tsx`
- **Root Cause**: When multiple concurrent network calls (e.g. `loadFleet` and `loadNotifications` on app start) received HTTP 401 Unauthorized responses, each independently invoked `fetch('/api/auth/refresh')` with the stored refresh token. Since backend refresh tokens are single-use and rotate on invocation, the second concurrent call failed with 401, triggering `clearSession()` and kicking the authenticated user back to the login screen.
- **Remediation**: Implemented `refreshAuthSession()` with a module-scoped singleton promise mutex (`activeRefreshPromise`). All concurrent 401 responses await the identical in-flight refresh promise, persist the newly issued token pair, and replay their original requests with the updated `Authorization: Bearer <token>`.
- **Verification**: Verified via concurrent API stress tests and mobile token refresh test suite.

---

### ADV-BUG-002: Device Revocation Telemetry & Shift Bypass
- **Severity**: P0 (Security / Integrity)
- **Files Modified**: `artifacts/api-server/src/services/authService.ts`, `artifacts/api-server/src/location.batch.test.ts`
- **Root Cause**: When an administrator reset a driver's device via `POST /api/drivers/:id/device/reset`, the server set `devicesTable.authorized = false` and revoked stored refresh tokens. However, `submitDriverLocation`, `submitDriverLocationBatch`, and `startDriverShift` only checked driver active status and shift status, never verifying whether the driver possessed an active, authorized device (`authorized === true`). As a consequence, a revoked device with an unexpired 15-minute JWT access token could continue uploading location breadcrumbs and initiating new shifts.
- **Remediation**: Added mandatory authorization checks to `submitDriverLocation`, `submitDriverLocationBatch`, and `startDriverShift`:
  ```typescript
  const authorizedDevice = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.driverId, driver.id), eq((devicesTable as any).authorized, true)))
    .limit(1);

  if (!authorizedDevice[0]) {
    throw createError(403, "DEVICE_UNAUTHORIZED", "Driver device is not authorized or has been revoked");
  }
  ```
- **Verification**: Added unit test `rejects when driver device is unauthorized or revoked` in `location.batch.test.ts`. Verified with Vitest (passes with HTTP 403 `DEVICE_UNAUTHORIZED`).

---

### ADV-BUG-003: Geofence Boundary Jitter & Notification Storm
- **Severity**: P1 (High)
- **Files Modified**: `artifacts/api-server/src/services/alertService.ts`
- **Root Cause**: Geofence entry and exit alerts evaluated solely against the knife-edge distance boundary `distance <= radiusMeters`. When a driver parked or moved along the perimeter of the 500m geofence with normal GPS accuracy variance (±3-5m), alternating points at 498m and 502m caused rapid, oscillating `GEOFENCE_ENTER` and `GEOFENCE_EXIT` notifications to flood dispatchers and admins.
- **Remediation**: Implemented a 30-meter hysteresis buffer (`GEOFENCE_HYSTERESIS_METERS = 30`) and a 60-second transition debounce (`GEOFENCE_TRANSITION_COOLDOWN_MS = 60 * 1000`). To trigger an exit, distance must exceed `radiusMeters + 30m`; to trigger entry, distance must be within `radiusMeters`. Intermediate points within the deadband preserve the previous state without firing alerts.
- **Verification**: Evaluated through unit testing and verified hysteresis calculation.

---

### ADV-BUG-004: Driver State Machine Priority Inversion & Revocation Retry Storm
- **Severity**: P1 (High)
- **Files Modified**: `apps/mobile/screens/DriverHomeScreen.tsx`, `apps/mobile/flushManager.ts`
- **Root Cause**: `computeDriverState()` prioritized `queuedCount > 0` over `trackingActive`. Because driver GPS points are buffered into local storage prior to scheduled batch flushes, the driver screen continually oscillated between green `TRACKING_ACTIVE` and orange `SYNC_PENDING`. Furthermore, if the server returned HTTP 403 `DEVICE_UNAUTHORIZED`, `flushManager` continued exponential backoff retries up to 8 times rather than purging invalid points.
- **Remediation**: 
  1. Reordered state evaluation: `TRACKING_ACTIVE` remains primary while tracking is actively running; queued points are reflected in a dedicated counter badge without degrading the primary state indicator.
  2. Handled `DEVICE_UNAUTHORIZED` gracefully in `handleStartShift` with clear localized user alerts.
  3. Updated `flushManager.ts` to discard points immediately upon receiving HTTP 403 or 409 to prevent retry storms.
- **Verification**: Tested state transitions in `DriverHomeScreen.tsx` and unit tested `flushManager.test.ts`.

---

### ADV-BUG-005: Silent API Error Masking & Missing Recovery Banners
- **Severity**: P1 (High)
- **Files Modified**: `apps/mobile/screens/AdminHomeScreen.tsx`, `apps/mobile/screens/CallCenterHomeScreen.tsx`
- **Root Cause**: Both `AdminHomeScreen` and `CallCenterHomeScreen` enclosed `loadFleet()` in an empty `catch` block with no state tracking. During network outages or server errors, users were presented with an empty or frozen UI with no visual indicator of network failure and no direct retry mechanism.
- **Remediation**: Introduced `fleetError` state to both screens, displaying a styled error banner with an interactive "Retry" / "إعادة المحاولة" button at the top of the scroll container.
- **Verification**: Verified in mobile UI and tested error boundary display.

---

### ADV-BUG-006: Mobile Map Directional Pan Deficit & Stale Driver Indication
- **Severity**: P2 (Medium)
- **Files Modified**: `apps/mobile/components/MobileMapView.tsx`
- **Root Cause**: The custom radar map only supported zoom in/out and restaurant recenter. Drivers situated outside the immediate viewport could not be inspected without zooming out to extreme spans. Furthermore, drivers whose status was `OFFLINE` were rendered with identical visual emphasis as active drivers.
- **Remediation**:
  1. Added four-direction panning controls (`▲`, `▼`, `◀`, `▶`) with degree offsets calculated dynamically from current viewport span.
  2. Added a "Focus Driver" / "تركيز الخريطة" button inside the selected driver drawer that re-centers the map directly on that driver's coordinates at 1000m span.
  3. Added `opacity: 0.65` and muted rendering for `OFFLINE` drivers.
- **Verification**: Component typechecked cleanly and verified in `MobileMapView.tsx`.

---

### ADV-BUG-007: Client-Side Settings Bounds Validation Deficit
- **Severity**: P1 (High)
- **Files Modified**: `apps/mobile/screens/AdminHomeScreen.tsx`
- **Root Cause**: `handleSaveSettings` forwarded text inputs directly through `Number()` without asserting geographic coordinate bounds, non-empty restaurant names, or realistic alert thresholds. Malformed inputs could trigger 400 Bad Request responses or corrupt settings state.
- **Remediation**: Enforced strict client-side validation rules prior to dispatching network requests:
  - Restaurant name: non-empty string.
  - Latitude: between -90 and +90.
  - Longitude: between -180 and +180.
  - Geofence radius: between 1m and 50,000m.
  - Max stop duration: between 1 and 120 minutes.
  - Offline grace: between 1 and 60 minutes.
  - Low battery threshold: between 1% and 100%.
- **Verification**: Tested with edge-case invalid inputs, confirming client validation alerts fire prior to API dispatch.

---

### ADV-BUG-008: Device Reset Unhandled Rejection & Missing Feedback
- **Severity**: P2 (Medium)
- **Files Modified**: `apps/mobile/screens/AdminHomeScreen.tsx`
- **Root Cause**: In the admin devices tab, the reset action lacked try/catch and success confirmations, leading to unhandled promise rejections on failure and no feedback on success.
- **Remediation**: Wrapped `handleDeviceReset` in a comprehensive try/catch block with localized success and error alerts, immediately updating the selected driver device state and re-fetching the device list.
- **Verification**: Verified code flow and alert presentation.

---

## 4. Verification Checklist

- [x] All 8 adversarial defects resolved in code.
- [x] Full workspace TypeScript typecheck: `pnpm run typecheck` exits with Code 0.
- [x] Full workspace test suite: 95/95 tests pass across all packages with Code 0.
- [x] Production Vercel API and Neon PostgreSQL database verified healthy (`/api/healthz` returns `status: ok`).
- [x] Physical device attached: Samsung Galaxy S25 Ultra (`R5CY731FGHA`, Android 16).

