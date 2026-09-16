# TRACKER — ADVERSARIAL QA & REAL PRODUCT BUG HUNT PLAN

**Repository**: `C:\Users\Emad\Desktop\Tracker\Tracker`  
**Execution Mode**: Adversarial Product Verification & Deep Logic Audit  
**Date**: 2026-09-17  

---

## 1. Objectives & Testing Philosophy

The purpose of this adversarial pass is **not** to confirm that tests pass, but to **break the product logic**, expose hidden UX/state contradictions, and uncover production risks.

We operate under three foundational principles:
1. **Passing tests do NOT equal correct behavior.**
2. **A rendering screen does NOT equal a complete feature.**
3. **A 200 OK from the API does NOT equal valid business semantics.**

---

## 2. Complete User Journeys Under Test

### Journey 1: Real ADMIN Mobile Experience
- **Step 1: Auth & Routing** — Log in with real Admin credentials; verify routing to `AdminHome`.
- **Step 2: Dashboard KPIs** — Audit KPI counters (`activeShifts`, `online`, `atRestaurant`, `moving`, `stopped`, `offline`, `lowBattery`). Verify that API errors render an error state rather than false zeros.
- **Step 3: Live Radar Map** — Test multi-driver tracking, directional panning, zoom scaling, driver marker tap, stale coordinate indicators, and status filtering.
- **Step 4: Driver Directory & Telemetry** — Inspect driver card details (speed, heading, GPS accuracy, distance to restaurant, battery %, charging state, network type).
- **Step 5: Device Administration & Reset** — View authorized devices, execute confirmation-guarded device reset, verify status updates, and verify that the revoked device is blocked from sending telemetry.
- **Step 6: System Configuration & Bounds** — View and update restaurant geofence coordinates, radius, and alert thresholds. Test edge cases: negative numbers, decimal precision, extreme values, and double submits.
- **Step 7: User Management** — Inspect system user list; verify canonical roles (`ADMIN`, `CALL_CENTER`, `DRIVER`) and ensure `MANAGER` rejection.
- **Step 8: Notification Center** — Verify user-scoped unread count, individual read actions, and mark-all-read.
- **Step 9: Safe Session & Logout** — Verify token refresh rotation, concurrent request handling, and clean logout.

### Journey 2: Real CALL CENTER Mobile Experience
- **Step 1: Auth & Role Enforcement** — Log in with Call Center credentials; verify routing to `CallCenterHome`.
- **Step 2: Read-Only Verification** — Confirm that device reset actions, settings modification forms, and user administration tabs are completely inaccessible.
- **Step 3: Operational Monitoring** — Test fleet dashboard, live map, driver details inspection, and notification tracking.
- **Step 4: API Penetration Attempt** — Attempt direct API calls to Admin endpoints (`/api/devices`, `/api/users`, `PUT /api/settings/*`, `POST /api/drivers/:id/device/reset`) using the Call Center token to verify strict 403 enforcement.

### Journey 3: Real DRIVER Mobile Experience
- **Step 1: State 1 — OFF_DUTY** — App open; verify off-duty visual indicators and instructions.
- **Step 2: Shift Initiation** — Start shift via `POST /api/drivers/me/shifts/start`; verify transition to `SHIFT_ACTIVE` and `TRACKING_ACTIVE`.
- **Step 3: Live Telemetry & Battery Sensor** — Test real hardware battery readings (`expo-battery`), charging state (`⚡`), network type, and GPS provider status.
- **Step 4: State Contradiction Audit** — Ensure that having items in the local queue does NOT mask the primary `TRACKING_ACTIVE` state.
- **Step 5: GPS Edge Case — Location Disabled** — Turn off GPS provider; verify immediate transition to `GPS_DISABLED` state.
- **Step 6: Network Edge Case — Offline Queueing** — Turn off WiFi/Cellular; verify transition to `NETWORK_OFFLINE`, local queueing of points, and retry backoff.
- **Step 7: Background & Screen Lock** — Lock device screen, move hardware, unlock; verify background task continued execution without TaskManager errors.
- **Step 8: Reconnection & Manual Sync** — Restore network; verify automatic and manual queue flushing without duplicate points or data loss.
- **Step 9: Shift Termination & Safe Logout** — End shift via `POST /api/drivers/me/shifts/end`; verify return to `OFF_DUTY`; verify logout block while shift is active.

---

## 3. Discovered Vulnerabilities & Bugs Under Investigation

| Bug ID | Severity | Phase | Area | Description |
|---|---|---|---|---|
| **ADV-BUG-001** | **P0** | Phase 14 / Auth | Concurrent Token Refresh Race Condition | In `apps/mobile/App.tsx`, concurrent 401s send the same refresh token in parallel. Because the backend enforces single-use refresh rotation with replay detection, the second request fails with `401 AUTH_INVALID_TOKEN`, unexpectedly logging the user out. |
| **ADV-BUG-002** | **P0** | Phase 15 / Security | Device Revocation Telemetry Bypass | When an Admin resets a driver's device, `submitDriverLocationBatch` and `startDriverShift` in `artifacts/api-server/src/services/authService.ts` did NOT check whether the device is authorized. The driver's unexpired JWT access token could continue uploading telemetry. |
| **ADV-BUG-003** | **P1** | Phase 10 / Geofence | Geofence Boundary Jitter & Alert Storm | In `alertService.ts`, geofence transitions had no hysteresis band and no transition debounce. A driver fluctuating around the perimeter generated an alert storm of alternating `GEOFENCE_ENTER` and `GEOFENCE_EXIT` notifications. |
| **ADV-BUG-004** | **P1** | Phase 4 / State Machine | Driver State Contradiction (Queue Masking Tracking) | In `DriverHomeScreen.tsx`, `computeDriverState()` returned `SYNC_PENDING` whenever `queuedCount > 0`, abruptly masking the green `TRACKING_ACTIVE` state during normal driving. |
| **ADV-BUG-005** | **P1** | Phase 2 / Error UX | Silent Error Masking on Mobile API Failure | In `AdminHomeScreen.tsx` and `CallCenterHomeScreen.tsx`, network or API failures in `loadFleet()` were caught silently (`catch { // ignore }`), leaving the user with an empty screen and no error banner or retry button. |
| **ADV-BUG-006** | **P1** | Phase 2 / Navigation | Map Directional Navigation Deficit | In `MobileMapView.tsx`, the map only supported zoom in/out and center reset, but lacked directional pan controls or "Focus on Driver" capability to navigate towards drivers outside the restaurant zone. |
| **ADV-BUG-007** | **P2** | Phase 2 / Validation | Settings Mutation Client-Side Validation Gaps | In `AdminHomeScreen.tsx`, settings inputs lacked client validation for NaN, negative radius, or empty names before submitting to the API. |
| **ADV-BUG-008** | **P2** | Phase 2 / Security UX | Device Reset Unhandled Promise & Missing Feedback | In `AdminHomeScreen.tsx`, the reset button in the Devices tab was not wrapped in an error handler, causing unhandled rejections on failure and lacking explicit success feedback. |

---

## 4. Execution & Verification Steps

1. **Fix ADV-BUG-001**: Implement shared refresh promise mutex in `apps/mobile/App.tsx`.
2. **Fix ADV-BUG-002**: Enforce device authorization checks in `submitDriverLocation`, `submitDriverLocationBatch`, and `startDriverShift`.
3. **Fix ADV-BUG-003**: Implement 30m hysteresis buffer and 60s debounce on geofence transitions in `alertService.ts`.
4. **Fix ADV-BUG-004**: Fix driver state hierarchy so `TRACKING_ACTIVE` remains primary while displaying queued points as a diagnostic sub-status; handle `DEVICE_UNAUTHORIZED`.
5. **Fix ADV-BUG-005**: Add explicit error states, error banners, and "Retry" buttons across Admin and Call Center screens.
6. **Fix ADV-BUG-006**: Add directional pan buttons (`▲`, `▼`, `◀`, `▶`) and focus-on-driver in `MobileMapView.tsx`.
7. **Fix ADV-BUG-007**: Add client-side validation on settings form inputs.
8. **Fix ADV-BUG-008**: Wrap device reset in try/catch with success and error alerts.
9. **Regression Tests**: Add automated tests covering all fixes; run typecheck and test suite.
10. **Hardware APK Rebuild & Verification**: Recompile release APK, install on Samsung Galaxy S25 Ultra, and verify.

