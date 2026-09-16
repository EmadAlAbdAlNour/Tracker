# TRACKER — PRODUCT ACCEPTANCE DEFECT & BUG HUNT LEDGER
**Date:** September 17, 2026  
**Repository:** `C:\Users\Emad\Desktop\Tracker\Tracker`  
**Target Environment:** Remote Production (Vercel + Neon Serverless PostgreSQL) & Physical Hardware (Samsung Galaxy S25 Ultra, Android 16)  
**Status:** ALL DEFECTS RESOLVED & VERIFIED (0 OPEN DEFECTS)

---

## Executive Summary

During adversarial testing, stress testing, and real-world product validation across mobile, web, and backend services, 9 defects were surfaced and systematically remediated. Each issue was confirmed with failing tests or real-device UI observation, patched with defensive engineering, and verified through both automated regression tests and physical hardware execution.

| Bug ID | Component | Severity | Description | Status |
|---|---|---|---|---|
| `ADV-BUG-001` | Mobile Auth | High | Concurrent 401 token refresh race condition causing auth lockouts | **VERIFIED FIXED** |
| `ADV-BUG-002` | API Server | Critical | Revoked driver device authorization bypass via stale JWT | **VERIFIED FIXED** |
| `ADV-BUG-003` | API Server | High | Geofence jitter oscillation & alert flood without boundary hysteresis | **VERIFIED FIXED** |
| `ADV-BUG-004` | Mobile Flush | High | Offline queue permanent retry storm upon HTTP 403 device revocation | **VERIFIED FIXED** |
| `ADV-BUG-005` | Mobile Fleet | Medium | Missing error recovery UI on fleet poller failure | **VERIFIED FIXED** |
| `ADV-BUG-006` | Mobile Map | Medium | Map canvas unpannable without native touch gestures | **VERIFIED FIXED** |
| `ADV-BUG-007` | Mobile Admin | Medium | Missing client-side boundary validation on system settings inputs | **VERIFIED FIXED** |
| `ADV-BUG-008` | Mobile UI | Low | Silent failure & lack of confirmation on driver device reset action | **VERIFIED FIXED** |
| `PROD-BUG-009` | Mobile / Web | Medium | Missing translation dictionary keys (`driverDetail.telemetry`, `map.viewDetails`, `settings.restaurant`) | **VERIFIED FIXED** |

---

## Detailed Defect Records

### ADV-BUG-001: Concurrent Auth Refresh Storm & Race Condition
- **Severity:** High
- **Component:** `apps/mobile/App.tsx`
- **Root Cause:** When multiple background requests (e.g. location flushing, shift status, fleet polling) received an HTTP 401 simultaneously, multiple parallel calls to `/api/auth/refresh` were triggered using the same refresh token. Because the backend rotates refresh tokens upon use, the second request failed with `Invalid refresh token`, immediately logging the user out in the field.
- **Remediation:** Implemented an in-flight Promise mutex (`refreshPromise`) in `App.tsx`. All concurrent 401 handlers await the single active refresh request, returning the freshly minted bearer token to all queued callers without token collision.
- **Files Modified:** `apps/mobile/App.tsx`
- **Verification:** Tested with simulated concurrent API calls on physical device; verified seamless session recovery without logout.

---

### ADV-BUG-002: Revoked Device Telemetry & Shift Bypass
- **Severity:** Critical
- **Component:** `artifacts/api-server/src/services/authService.ts`, `services/driverService.ts`
- **Root Cause:** If an administrator revoked or reset a driver's device via `/api/devices/:id/reset`, the driver's short-lived JWT remained valid for up to 15 minutes. The location ingestion endpoint only validated JWT expiration and failed to verify that the active device was still `isAuthorized = true`.
- **Remediation:** Added active device validation (`checkDeviceAuthorization`) to both the driver authentication middleware and location batch ingestion service. Any telemetry submission from a revoked device immediately responds with HTTP 403 `DEVICE_UNAUTHORIZED`.
- **Files Modified:** `artifacts/api-server/src/services/authService.ts`, `artifacts/api-server/src/routes/drivers.ts`
- **Verification:** Verified via E2E Step 21 & Step 22: device reset revoked authorization; subsequent telemetry upload was rejected with HTTP 403.

---

### ADV-BUG-003: Geofence Boundary Jitter & Alert Flood
- **Severity:** High
- **Component:** `artifacts/api-server/src/services/alertService.ts`
- **Root Cause:** When a driver hovered near the restaurant geofence perimeter (e.g. 500m radius), normal GPS accuracy fluctuations (±10m) caused the driver's status to flip rapidly between `INSIDE_GEOFENCE` and `OUTSIDE_GEOFENCE`, generating dozens of duplicate alerts within minutes.
- **Remediation:** Introduced a 30-meter hysteresis buffer and a 60-second transition debounce. Crossing the boundary requires exiting by `radius + 30m` or entering by `radius - 30m`, suppressing GPS jitter noise.
- **Files Modified:** `artifacts/api-server/src/services/alertService.ts`
- **Verification:** Verified in `alert.scheduler.test.ts` and remote production alert simulation.

---

### ADV-BUG-004: Offline Queue Retry Storm Upon Device Revocation
- **Severity:** High
- **Component:** `apps/mobile/flushManager.ts`, `screens/DriverHomeScreen.tsx`
- **Root Cause:** When a device was revoked by the admin, the mobile location flush manager received HTTP 403. Instead of clearing the unauthorized backlog, it repeatedly retried flushing the obsolete points indefinitely on every timer tick, exhausting battery and network.
- **Remediation:** Handled HTTP 403 explicitly in `flushManager.ts` by clearing the local pending queue, transitioning the driver state machine to `DEVICE_UNAUTHORIZED`, and instructing the driver to re-authenticate with the server.
- **Files Modified:** `apps/mobile/flushManager.ts`, `apps/mobile/screens/DriverHomeScreen.tsx`
- **Verification:** Unit tests in `flushManager.test.ts` passing; verified on physical device.

---

### ADV-BUG-005: Missing Error Recovery UI on Fleet Polling Failure
- **Severity:** Medium
- **Component:** `apps/mobile/screens/AdminHomeScreen.tsx`, `CallCenterHomeScreen.tsx`
- **Root Cause:** Temporary cellular disconnects in Admin or Call Center mode caused the background fleet polling to fail silently, leaving operators unaware of stale data and offering no manual retry action.
- **Remediation:** Added a high-visibility dismissible `fleetError` banner with an immediate interactive "Retry / إعادة المحاولة" action in both Admin and Call Center consoles.
- **Files Modified:** `apps/mobile/screens/AdminHomeScreen.tsx`, `apps/mobile/screens/CallCenterHomeScreen.tsx`
- **Verification:** Verified error banner rendering on network drop simulation; manual retry successfully clears error when connection restores.

---

### ADV-BUG-006: Mobile Map Canvas Panning Accessibility
- **Severity:** Medium
- **Component:** `apps/mobile/components/MobileMapView.tsx`
- **Root Cause:** Without native touch gesture recognizers on SVG radar canvasses, operators could not pan across large geographical regions to inspect drivers situated outside the initial view radius.
- **Remediation:** Added directional pan navigation controls (`▲`, `▼`, `◀`, `▶`), recenter button (`🎯`), and direct driver focus selection on the map canvas.
- **Files Modified:** `apps/mobile/components/MobileMapView.tsx`
- **Verification:** Observed on Samsung Galaxy S25 Ultra hardware screen captures; tapping directional controls correctly shifts map center.

---

### ADV-BUG-007: Missing Client-Side Boundary Validation on Settings
- **Severity:** Medium
- **Component:** `apps/mobile/screens/AdminHomeScreen.tsx`
- **Root Cause:** While the backend enforced zod schema validation, the mobile Admin settings screen permitted entering out-of-bounds numbers (e.g. negative radius, 0-minute timeouts), leading to generic server 400 errors without helpful field-level validation feedback.
- **Remediation:** Added strict client-side numeric validation:
  - Geofence radius: 50m – 50,000m
  - Max stop duration: 1 – 240 minutes
  - Low battery threshold: 5% – 50%
  - Offline grace: 1 – 120 minutes
- **Files Modified:** `apps/mobile/screens/AdminHomeScreen.tsx`
- **Verification:** Verified client blocks invalid input and displays localized Arabic error message before making HTTP calls.

---

### ADV-BUG-008: Missing Confirmation on Device Reset Action
- **Severity:** Low
- **Component:** `apps/mobile/components/DriverDetailModal.tsx`
- **Root Cause:** Tapping "Reset Device" in the driver details modal immediately revoked authorization without an explicit confirmation dialog or error boundary.
- **Remediation:** Wrapped the reset trigger in an `Alert.alert` confirmation prompt (`t('admin.confirmResetTitle')`), guarded with `try / catch`, and displayed a success/failure toast upon completion.
- **Files Modified:** `apps/mobile/components/DriverDetailModal.tsx`
- **Verification:** Verified confirmation dialog appears before calling reset API; cancel safely aborts action.

---

### PROD-BUG-009: Missing Translation Dictionary Keys (Mobile & Web)
- **Severity:** Medium
- **Component:** `apps/mobile/i18n.ts`, `apps/web/locales/ar/common.json`, `apps/web/locales/en/common.json`
- **Root Cause:** Forensic static analysis revealed that `t('driverDetail.telemetry')` and `t('map.viewDetails')` in mobile and `t('settings.restaurant')` in web were missing from the i18n dictionaries, resulting in raw translation keys being rendered on screen (e.g. `map.viewDetails →`).
- **Remediation:**
  - Added `driverDetail.telemetry` and `map.viewDetails` in both Arabic (`بيانات التتبع اللحظية`, `عرض التفاصيل`) and English (`Live Telemetry`, `View Details`) in `apps/mobile/i18n.ts`.
  - Added `settings.restaurant` in `apps/web/locales/ar/common.json` (`المطعم`) and `en/common.json` (`Restaurant`).
  - Created automated diagnostic validator `scripts/src/check-i18n.ts` confirming **0 missing translation keys** across all mobile and web screens.
- **Files Modified:** `apps/mobile/i18n.ts`, `apps/web/locales/ar/common.json`, `apps/web/locales/en/common.json`
- **Verification:** Verified via `scripts/src/check-i18n.ts` output:
  `Missing in AR (Mobile): []`
  `Missing in EN (Mobile): []`
  `Missing in AR (Web): []`
  `Missing in EN (Web): []`

