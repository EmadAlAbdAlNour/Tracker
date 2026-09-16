# Tracker — Product Bug Ledger

## Active Bug Matrix

| Bug ID | Severity | Role | Area | Description | Status | Verification Evidence |
|---|---|---|---|---|---|---|
| **BUG-001** | **P0** | ADMIN | Mobile Architecture | `roleRouting.ts` collapsed both ADMIN and CALL_CENTER into minimal `OperatorHome`. | **VERIFIED FIXED** | `roleRouting.ts` routes ADMIN -> AdminHome, CALL_CENTER -> CallCenterHome, DRIVER -> DriverHome. Tested in `App.test.ts` (exit 0). |
| **BUG-002** | **P1** | ADMIN / CALL_CENTER | Mobile Screens | No Driver Detail screen on mobile to view driver coordinates, telemetry history, shift status, and device metadata. | **VERIFIED FIXED** | `DriverDetailModal.tsx` implemented with complete telemetry, shift duration, battery, device info, and geofence distance. |
| **BUG-003** | **P1** | ADMIN | Mobile Security / Hardware | Admin could not view authorized device list or trigger driver device resets from mobile. | **VERIFIED FIXED** | `AdminHomeScreen` implements Devices tab with authorized status and reset actions calling `POST /api/drivers/:id/device/reset`. |
| **BUG-004** | **P1** | ADMIN / CALL_CENTER | Mobile Map | No live interactive map on mobile to visualize restaurant geofence perimeter and real-time driver positions. | **VERIFIED FIXED** | `MobileMapView.tsx` implemented with coordinate-projected radar map, geofence circle, driver status pins, zoom/center controls. Zero crash risks on Android 16. |
| **BUG-005** | **P1** | ADMIN | Mobile Settings | Admin could not view or configure restaurant geofence radius or alert thresholds from mobile. | **VERIFIED FIXED** | `AdminHomeScreen` implements Settings tab with live API mutation (`PUT /api/settings/restaurant`, `PUT /api/settings/alerts`). |
| **BUG-006** | **P1** | ADMIN | Mobile Users | Admin could not view registered system users or their roles from mobile. | **VERIFIED FIXED** | `AdminHomeScreen` implements Users tab fetching `GET /api/users` with role and active badges. |
| **BUG-007** | **P1** | ALL ROLES | Mobile Notifications | In-app user-scoped notifications were not exposed in mobile app; only accessible on web dashboard. | **VERIFIED FIXED** | Notifications tab with user-scoped isolation, unread counter, single read, and mark-all-read buttons. |
| **BUG-008** | **P1** | DRIVER | Mobile UX / State Machine | Driver screen collapsed status to binary on/off duty, masking GPS disabled, offline queue status, and battery percentage. | **VERIFIED FIXED** | `DriverHomeScreen` features 8-state machine, live `expo-battery` sensor display, network type, and manual sync button. |
| **BUG-009** | **P2** | ALL ROLES | Localization | Missing Arabic and English dictionaries in `i18n.ts` for new screens, granular driver states, and settings fields. | **VERIFIED FIXED** | `i18n.ts` expanded with comprehensive Arabic & English dictionaries, RTL support, and Western ASCII digits (`0-9`) formatting. Tested in `App.test.ts`. |

---

## Verification Summary
- **Typecheck**: 9/9 workspace projects passed (`pnpm run typecheck`, Exit 0).
- **Test Suite**: 94/94 tests passed (`pnpm test`, Exit 0: mobile 19/19, web 20/20, api-server 55/55).
- **Web Build**: Next.js production build succeeded (`apps/web build`, Exit 0).
- **Gradle Release Build**: `.\gradlew.bat assembleRelease` succeeded with Exit Code 0 (`app-release.apk`, 67.8 MB).
- **Gradle Debug Build**: `.\gradlew.bat assembleDebug` succeeded with Exit Code 0.
- **Physical Device**: Streamed installation via `adb -s R5CY731FGHA install -r` succeeded on Samsung Galaxy S25 Ultra (Android 16), booted clean with 0 errors in logcat.
- **Production API Health**: `GET https://tracker-alpha-puce.vercel.app/api/healthz` returned 200 OK (`{"status":"ok","database":"reachable"}`).

