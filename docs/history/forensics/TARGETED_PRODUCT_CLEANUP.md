# TARGETED TRACKER — GEOFENCE STATUS + MOBILE ADMIN UI + NOTIFICATIONS CONSOLIDATION
**Targeted Product Cleanup & Forensic Verification Report**  
**Date:** October 2, 2026  
**Repository:** Tracker Production Core (`main`)  
**Package:** `com.tracker.driver` (Version `1.1.9`, VersionCode `34`)

---

## 1. Geofence & Operational Status Bug

### Root Cause
When a driver starts a shift while physically inside the restaurant geofence (e.g., at 46m within a 150m radius):
1. `alertService.evaluateTelemetryAlerts` checks immediate distance (`dist <= radiusMeters`) on shift start and generates the arrival notification ("وصل إلى محيط المطعم").
2. The geographic map renders the driver marker inside the restaurant circle based on current latitude/longitude coordinates.
3. However, `fleetService.evaluateOperationalHistory` defaulted `initialRestaurantState` to `"OUTSIDE_RESTAURANT"`. Because transitioning from `"OUTSIDE_RESTAURANT"` to `"AT_RESTAURANT"` required `CONSECUTIVE_ARRIVAL_SAMPLES = 2`, a single reliable location point at shift start left `currentRestaurantState` in `"OUTSIDE_RESTAURANT"`.
4. As a result, `historyResult.isInsideGeofence` evaluated to `false`, and `historyResult.operationalStatus` fell back to `"STOPPED"`.
5. Driver Detail Modal reads `driver.isInsideGeofence` (and `operationalStatus`) from the live fleet response, which caused it to simultaneously display:
   - `متوقف` (Stopped)
   - `نطاق المطعم: خارج نطاق المطعم` (Outside restaurant range)
   even while the map marker was visually inside and an arrival notification had just been generated.

### Exact Files Changed
- `artifacts/api-server/src/services/fleetService.ts`:
  - In `evaluateOperationalHistory`: When `params.initialRestaurantState` is undefined (such as on fresh shift start or uninitialized history window), the evaluator inspects the first reliable point in the history window. If `dist <= restaurantSettings.radiusMeters`, the initial state resolves canonically to `"AT_RESTAURANT"`.
  - In `getLiveFleetStatus`: `isInsideGeofence` now reflects the canonical `historyResult.isInsideGeofence` directly rather than depending on strict string equality with `operationalStatus === "AT_RESTAURANT"`.
- `artifacts/api-server/src/gps.hardening.test.ts`: Added regression proofs (Proofs 13, 14, 15, and 16) covering shift start inside geofence, outside geofence, null location points, and degraded GPS noise rejection.

### Canonical Semantic Source
The canonical evaluation of geofence state is centralized in `evaluateOperationalHistory` in `fleetService.ts`, respecting:
- `radiusMeters` for arrival (150m default)
- `radiusMeters + GEOFENCE_EXIT_BUFFER_METERS (30m)` for departure hysteresis
- `DEFAULT_RELIABLE_ACCURACY_METERS (35m)` accuracy threshold
- Shift isolation and chronological sample ordering.

### Before vs After Behavior
- **Before:** Driver starts shift inside restaurant -> Arrival notification generated -> Map marker inside -> Fleet operational status = `STOPPED` -> Driver Detail displays `متوقف` and `خارج نطاق المطعم`.
- **After:** Driver starts shift inside restaurant -> Arrival notification generated -> Map marker inside -> Fleet operational status = `AT_RESTAURANT` -> Driver Detail displays `بالمطعم` and `داخل نطاق المطعم`.

---

## 2. Arabic RTL Alignment Fixes

### Affected Screens & Components
- `apps/mobile/screens/AdminHomeScreen.tsx` (Notifications subview, Devices list, Header rows)
- `apps/mobile/screens/CallCenterHomeScreen.tsx` (Notifications tab cards, Header rows, Metrics)
- `apps/mobile/components/DriverDetailModal.tsx` (Telemetry 2-column grid, `cardSectionTitle`, Activity timeline title & descriptions)

### Root Cause
React Native on Android defaults `<Text>` alignment to `left` when no explicit `textAlign` is declared on block-level text containers stretching across a row (`flex: 1` or flex basis). When `cardSectionTitle` stretched across the card or `gridCell` rendered Arabic text, Android's layout engine pushed the Arabic text toward the physical left instead of the logical start (right in RTL). In addition, `grid2Col` had a hardcoded `flexDirection: 'row'`.

### Fix
1. Applied logical `rowDir` (`getRowDirection()`) to `grid2Col` and container rows.
2. Added explicit `textAlign: rtl ? 'right' : 'left'` and `writingDirection: rtl ? 'rtl' : 'ltr'` to:
   - `cardSectionTitle` across all modal sections
   - `gridCellLabel`, `gridCellValue`, `gridCellSublabel` in telemetry cells
   - `notificationTitle`, `notificationMessage`, and `notificationTime` in both Admin and Call Center screens
   - `activityTitle` and `activityDesc` in activity timeline items.
3. Preserved English LTR alignment and technical identifier formatting (`fontFamily: 'monospace'`, `writingDirection: 'ltr'` for UUIDs and device IDs).

### Arabic & English Verification
- Arabic: All headings, status labels, descriptions, and notification cards align to the right, flow naturally right-to-left, and avoid mixed-string BiDi punctuation flip.
- English: All text aligns to the left with standard LTR layout.

---

## 3. Devices Management Redesign & Parity

### Old Mobile Behavior
Mobile Admin showed device cards with:
- Top badge reading `غير معتمد` for all devices, even when authorized
- Truncated UUID with ellipsis (`ed769a8e-8776...`)
- Missing action button for authorized devices because `dev.isAuthorized` was checked instead of the API contract.

### Root Cause of Authorization Inconsistency
The database schema (`devicesTable.authorized`) and backend route `GET /api/devices` return `{ authorized: boolean }`.
Web Admin checked `device.authorized`, which correctly evaluated to `true`.
Mobile Admin checked `dev.isAuthorized`, which evaluated to `undefined` (falsy) for every device, causing every card to display `غير معتمد` and hiding the reset button.

### New Mobile Structure & Layout Parity
Mobile Admin device cards now match the Web Admin semantic model and layout:
```text
┌─────────────────────────────────────────────┐
│                                             │
│  Driver Name                    [معتمد]      │
│  UUID (full, selectable monospace)          │
│  Device Name & Version                      │
│                                             │
│  [إلغاء الترخيص]                             │
│                                             │
└─────────────────────────────────────────────┘
```
1. **Row 1:** Driver name (`dev.driverName`) on the start side, authorization badge (`[معتمد]` / `[غير معتمد]`) on the end side.
2. **Row 2:** Full device UUID (`dev.deviceIdentifier || dev.id`), monospace, selectable, unclipped.
3. **Row 3:** Platform & version (`${dev.platform || 'Android'} • v${dev.appVersion || '1.0.0'}`) + last seen timestamp.
4. **Row 4:** Action button `[إلغاء الترخيص]` (`Revoke Authorization`) for authorized devices with confirmation dialog (`admin.confirmResetTitle` / `admin.confirmResetMessage`), triggering `POST /api/drivers/:id/device/reset`.

### Parity Status
- Web Admin `authorized: true` <-> Mobile Admin displays `معتمد`
- Web Admin `authorized: false` <-> Mobile Admin displays `غير معتمد`
- Reset / Revoke triggers the identical authoritative endpoint (`/api/drivers/:id/device/reset`).

---

## 4. Notifications Consolidation & Obsolete Feature Removal

### Test Send Removed
- Removed backend development route `POST /api/notifications/test` from `artifacts/api-server/src/routes/notifications.ts`.
- Removed `handleSendTestNotification` and the "إرسال تجريبي" button from `AdminHomeScreen.tsx`.
- Removed obsolete test translations and unused imports.

### Alert Center Removed Completely
- Deleted Web Alert Center page directory: `apps/web/app/dashboard/alerts/page.tsx`.
- Removed `/dashboard/alerts` route entry from `dashboard-shell.tsx` navigation.
- In Mobile Admin (`AdminHomeScreen.tsx`):
  - Removed Section 2: "Active Critical Alerts" card list.
  - Replaced "Active Alerts" KPI card with "Unread Notifications" (`t('admin.unreadNotifications')`).
- In Mobile Call Center (`CallCenterHomeScreen.tsx`):
  - Consolidated Tab 4 label to `t('notifications.title')` (`الإشعارات` in Arabic, `Notifications` in English).
  - Consolidated screen header title to `t('notifications.title')`.
  - Replaced "Alerts" KPI card with "Unread Notifications" (`metrics.unreadNotifications`).

### Single Notifications Architecture
Underlying telemetry incident detection (`evaluateTelemetryAlerts` in `alertService.ts`, speed thresholds, offline grace period, battery threshold, geofence exit/entry) is fully preserved. These domain events write directly to `notificationsTable`, which feeds the single unified Notifications experience across Web and Mobile.

---

## 5. Verification Results

### Test Suite (`pnpm test`)
- **Total Test Files:** 37
- **Total Tests Passed:** 341
- **Failures:** 0
- Package Breakdown:
  - `apps/web`: 4 files, 60 passed
  - `apps/mobile`: 11 files, 119 passed
  - `artifacts/api-server`: 22 files, 162 passed

### Typecheck (`pnpm typecheck`)
- `tsc --build`: Succeeded
- `artifacts/api-server`: Clean (no errors)
- `apps/mobile`: Clean (no errors)
- `apps/web`: Clean (no errors)
- `scripts`: Clean (no errors)

### Web Admin Build (`pnpm --filter @workspace/admin-web build`)
- Next.js 14.2.15 production build compiled successfully.
- 16 static routes generated cleanly.

### Android Production Release Build
- Command: `cmd /c "cd apps\mobile\android && gradlew.bat assembleRelease"`
- Result: `BUILD SUCCESSFUL in 2m 38s` (444 actionable tasks)
- APK Path: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- APK Size: 70,177,982 bytes
- APK SHA-256: `1D17535A8F6E8E726FAEB6491798E94A1772385D335B61AC1E7D859A8D886573`
- Package: `com.tracker.driver`
- `versionName`: `1.1.9`
- `versionCode`: `34`

### Parity & Regression Verification
- **Geofence:** Shift start inside restaurant immediately evaluates to `AT_RESTAURANT` / `isInsideGeofence: true` across fleet API, Driver Detail modal, and map rendering.
- **Devices Parity:** Both Web Admin and Mobile Admin map the canonical `authorized` boolean, displaying `معتمد` and offering the `إلغاء الترخيص` action.
- **Notifications Consolidation:** "إرسال تجريبي" and separate Alert Center UI removed; domain events route to single Notifications experience.
- **RTL:** Headings, telemetry grid cells, and notification cards adhere to logical RTL flow without text drifting to the left.

---

## 6. Architecture Safety Confirmation

The following systems and architectures were **strictly preserved and NOT modified**:
- Native Android telemetry architecture (`TrackerLocationService`)
- SQLite telemetry queue architecture
- Native uploader
- Heartbeat architecture
- GPS collection interval and filtering
- Shift/device authentication and JWT/device binding
- Database schema
- Location upload and batch APIs
- Telemetry token architecture
- Foreground Service (FGS), WorkManager, JobScheduler, and WakeLock implementations
- Background location architecture
- No Samsung-specific workarounds or device-specific hardcoded dimensions.
