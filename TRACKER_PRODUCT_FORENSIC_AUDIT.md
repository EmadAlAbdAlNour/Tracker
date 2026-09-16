# Tracker — Deep Product Forensic Audit Report

**Date**: 2026-09-17  
**Scope**: Full Product Architecture, Mobile UX, Web Dashboard, API Server, RBAC, Telemetry, and State Machines  
**Verdict**: **PRODUCT AUDIT: CRITICAL PRODUCT & UX GAPS IDENTIFIED** (Automated test pass was not reflective of complete product-contract implementation).

---

## 1. Executive Summary

While repository automated tests pass (92/92), compilation succeeds, and database integrity is sound, this deep forensic product audit uncovered major product-level deficiencies:

1. **Mobile Role Architecture Defect**:
   `resolveHomeRoute()` in `apps/mobile/roleRouting.ts` collapsed both `ADMIN` and `CALL_CENTER` into a single, minimal `OperatorHome` screen. `ADMIN` was denied full operational functionality (no driver detail, no device management, no device reset, no live map, no alert management, no system settings, no user administration).
2. **Missing Mobile Navigation & Modularity**:
   `apps/mobile/App.tsx` was a monolithic file with only 3 screens (`Login`, `DriverHome`, `OperatorHome`). It lacked role-specific tab/stack navigators for `ADMIN` and `CALL_CENTER`.
3. **Mobile Live Map Missing**:
   Neither `ADMIN` nor `CALL_CENTER` had access to a live interactive fleet map on mobile to visualize restaurant geofence and driver breadcrumbs.
4. **Driver UX Incompleteness**:
   `DriverHomeScreen` collapsed complex operational states into binary "On Duty" / "Off Duty". It failed to expose real-time GPS provider status, network connection type (WiFi vs Cellular vs Offline), real device battery percentage, or user-scoped driver notifications.
5. **Role & Error Semantics**:
   Errors were occasionally swallowed into empty default states (e.g. empty driver list or off-duty fallback) rather than surfacing actionable diagnostics.

---

## 2. Subsystem Forensic Classification Matrix

| Subsystem | Status | Product Findings & Gaps |
|---|---|---|
| **1. Role Model & RBAC** | **IMPLEMENTED** | Strictly 3 roles: `ADMIN`, `CALL_CENTER`, `DRIVER`. Historical `MANAGER` cleanly eliminated from active runtime and database. |
| **2. Auth & Token Lifecycle** | **IMPLEMENTED** | Robust access/refresh rotation, replay prevention, and invalidation. Supported on Web and Mobile. |
| **3. Mobile Role Routing** | **INCORRECT** | `roleRouting.ts` returned `OperatorHome` for both `ADMIN` and `CALL_CENTER`. Did not provide separate role experiences. |
| **4. Admin Mobile Experience** | **MISSING** | Admin lacked Driver Detail, Device Management (with reset), Live Map, Alert Center, Settings, and User Management. |
| **5. Call Center Mobile Experience** | **PARTIALLY_IMPLEMENTED** | Only saw the basic KPI grid and driver list. Lacked dedicated monitoring tabs, Driver Detail, and Live Map. |
| **6. Driver Mobile Experience** | **PARTIALLY_IMPLEMENTED** | Functional shift start/end and background tracking, but lacked explicit multi-state machine indicators (`GPS_DISABLED`, `NETWORK_OFFLINE`, `SYNC_PENDING`, `SYNCING`), battery sensor display, and in-app driver notifications. |
| **7. Mobile Fleet Map** | **MISSING** | No map screen existed in `apps/mobile`. Operators could not see geographic positions or geofence perimeters on mobile. |
| **8. Driver Detail Screen** | **MISSING** | Clicking a driver in mobile fleet did not navigate to a detail screen with telemetry history and device status. |
| **9. Device Management Mobile** | **MISSING** | Admin could not view authorized device metadata or trigger device reset from mobile. |
| **10. Settings Management Mobile** | **MISSING** | Admin could not view or update restaurant geofence radius or alert thresholds from mobile. |
| **11. Notifications Mobile** | **MISSING** | In-app user-scoped notifications were only accessible on Web dashboard, not in Mobile. |
| **12. Web Dashboard RBAC** | **IMPLEMENTED** | Web dashboard correctly isolates `ADMIN` from `CALL_CENTER` (`DashboardShell` redirects away from `/users`, `/settings`, `/devices`). |
| **13. Web Live Map Viewport** | **IMPLEMENTED** | Leaflet `MapController` preserves manual pan/zoom through 10s poll cycles; zero map resets. |
| **14. Telemetry Pipeline** | **IMPLEMENTED** | Full path from GPS collector -> local queue -> batch upload -> PostgreSQL ON CONFLICT deduplication -> live fleet API verified. |
| **15. Battery Sensor Integration** | **IMPLEMENTED** | Real hardware battery percentage (`level: 49`) and charging state collected and forwarded through telemetry. |
| **16. Background Tracking Engine** | **IMPLEMENTED** | `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION` verified in Android release APK. |
| **17. Restaurant Geofence Suppression** | **IMPLEMENTED** | Haversine distance math verified; stationary alert (`STOP_EXTENDED`) strictly suppressed inside restaurant perimeter and auto-resolved upon arrival. |
| **18. Proactive Alert Scheduler** | **IMPLEMENTED** | Server-side background interval scheduler scans active shifts and triggers `DRIVER_OFFLINE` without incoming traffic. |
| **19. External Push Delivery** | **BLOCKED** | External FCM/APNs credentials not configured; in-app notification polling operates reliably. |
| **20. Localization & RTL** | **PARTIALLY_IMPLEMENTED** | Mobile had basic i18n, but lacked translation keys for Admin detail, settings, map, devices, and granular driver states. |

---

## 3. Product Contract & Authoritative Role Matrix

| Capability / Resource | ADMIN | CALL_CENTER | DRIVER |
|---|:---:|:---:|:---:|
| **Mobile Login & Session** | YES | YES | YES |
| **Start / End Own Shift** | NO | NO | YES |
| **Start / Stop Own Tracking** | NO | NO | YES |
| **View Own Telemetry & Queue** | NO | NO | YES |
| **Receive Driver Alerts / Notices** | NO | NO | YES (Own) |
| **Fleet KPI Overview** | YES | YES | NO |
| **Fleet Live Drivers List** | YES | YES | NO |
| **Driver Detail Telemetry & History** | YES | YES | NO |
| **Interactive Live Map & Geofence** | YES | YES | NO |
| **Alert History & Resolution** | YES | YES | NO |
| **User-Scoped Operator Notifications**| YES | YES | NO |
| **Device Authorization List** | YES | NO | NO |
| **Reset Driver Authorized Device** | YES | NO | NO |
| **View / Edit Restaurant Settings** | YES | NO | NO |
| **View / Edit Alert Settings** | YES | NO | NO |
| **User Administration** | YES | NO | NO |

---

## 4. Required Remediation Blueprint

1. **Mobile Modularization & Role Navigators**:
   - Split `apps/mobile/App.tsx` into modular screens and navigation stacks.
   - `AdminNavigator`: Dashboard, Fleet, DriverDetail, LiveMap, Devices, Alerts, Settings, Users.
   - `CallCenterNavigator`: Dashboard, Fleet, DriverDetail, LiveMap, Alerts, Notifications.
   - `DriverNavigator`: Enriched shift dashboard with granular states, battery/network/GPS monitors, queue sync, and notifications.
2. **Interactive Mobile Map (`MobileMapView`)**:
   - Zero-dependency, crash-proof React Native interactive coordinate radar map with Mercator/relative projection.
   - Displays restaurant center, geofence radius circle, driver markers with speed/status/freshness, driver selection, and stable viewport pan/zoom.
3. **Driver Operational UX**:
   - Clearly delineate `OFF_DUTY`, `SHIFT_ACTIVE`, `TRACKING_ACTIVE`, `GPS_DISABLED`, `NETWORK_OFFLINE`, `SYNC_PENDING`, `SYNCING`, `DEVICE_UNAUTHORIZED`.
   - Add real-time battery sensor display, GPS provider status, and connection type indicator.
4. **Localization Expansion**:
   - Add missing Arabic/English dictionaries in `apps/mobile/i18n.ts` for all new screens, settings, and diagnostics.

