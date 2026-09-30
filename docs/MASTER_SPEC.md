# TRACKER — MASTER PRODUCT SPECIFICATION

## 1. PRODUCT SCOPE & ARCHITECTURAL FOUNDATION

Tracker is a dedicated, production-grade operational fleet-tracking platform for restaurant motorcycle drivers operating within a single metropolitan city.

The system is composed of:
1. **Mobile Application (React Native / Expo SDK 53 / Android Native Kotlin)**:
   - Dedicated driver client running an Android Foreground Location Service with `FusedLocationProviderClient`, a durable SQLite queue, and an autonomous batch uploader.
   - Dedicated administrative and call-center interface (Mobile Admin & Call Center) consuming the central REST API.
2. **Backend (Express 5 / Node.js / PostgreSQL / Drizzle ORM)**:
   - Central authority for authentication, device authorization/binding, telemetry ingestion, operational state machines, alerts, reporting, and audit logs.
3. **Web Dashboard (Next.js / TypeScript / Tailwind CSS / Leaflet)**:
   - Operations control room for live fleet monitoring, driver tracking, administrative management, alerting, reports, and audit trails.

### Core Architectural Principle
**ONE PRODUCT, MULTIPLE CLIENTS.**
Web and Mobile clients are peer presentations of a unified operational truth defined by the backend and domain layer. No business logic or state transitions are independently invented on clients.

---

## 2. ROLES & AUTHORIZATION

### Valid Roles
Only three canonical roles exist in the Tracker ecosystem:
1. `ADMIN`: Full operational and administrative authority. Manages users, drivers, devices, settings, shifts (including force-end), alerts, reports, and audit logs.
2. `CALL_CENTER`: Operational monitoring and dispatch authority. Can view live fleet, driver profiles, shift history, location history, alerts, and operational reports. Cannot create/delete users or mutate system settings/devices.
3. `DRIVER`: Mobile-only field role. Restricted to their own shift lifecycle, active telemetry submission, heartbeat keep-alive, and personal shift history.

*Explicit Rule*: There is NO active `MANAGER` role. Any legacy references are obsolete and forbidden. Backend authorization (`requireRole`, `requireAuth`) remains the sole source of truth.

---

## 3. TELEMETRY & GPS SEMANTIC CONTRACT

### 3.1 Primary Telemetry Path (Single Source of Ingestion)
```
Driver Mobile UI
      ↓
Native Android Module (TrackerLocationModule)
      ↓
Foreground Location Service (TrackerLocationService)
      ↓
FusedLocationProviderClient (High Accuracy, dedicated HandlerThread)
      ↓
SQLite Durable Queue (TrackerLocationStore)
      ↓
Native Batch Uploader (TrackerLocationUploader)
      ↓
REST Batch API (POST /api/drivers/me/location/batch)
      ↓
PostgreSQL (location_points table)
```
*Non-Negotiable Architecture*:
No secondary GPS pipelines, no WorkManager/JobScheduler telemetry, no Expo Location background task, no headless JS uploaders, no FCM telemetry transport, and no permanent WakeLocks.

### 3.2 Heartbeat vs. GPS Freshness
- `lastSeen`: Represents device/application network communication freshness. Updated on every HTTP request, batch upload, and lightweight heartbeat (`POST /api/drivers/me/heartbeat`).
- `lastLocationAt` / `recordedAt`: Represents GPS fix freshness recorded by device hardware.
- *Strict Rule*: Never use GPS timestamp as a substitute for connection freshness. A driver may be `ONLINE` while GPS is stale or degraded, and vice-versa.

### 3.3 GPS Quality Classification
Every GPS point is classified deterministically:
1. **Reliable** (`accuracy <= 35m`):
   - Only reliable points can trigger or alter operational states (movement, restaurant arrival/departure).
2. **Degraded** (`35m < accuracy <= 150m`):
   - Retained for historical and contextual map display.
   - Strictly prohibited from flipping operational state; holds the existing confirmed operational status.
3. **Severe** (`accuracy > 150m` or missing/negative accuracy):
   - Discarded at native intake in the Android service before entering the SQLite queue.

### 3.4 Movement State Confirmation
Prevents GPS noise, multipath, and stationary drift from causing false "MOVING" states:
- **STOPPED → MOVING**: Requires:
  1. 2 consecutive reliable samples (`accuracy <= 35m`)
  2. Reliable speed `>= 1.5 m/s` (5.4 km/h)
  3. Cumulative displacement between points `>= 10 meters`
- **MOVING → STOPPED**: Requires:
  1. 3 consecutive reliable samples (`accuracy <= 35m`)
  2. Reliable speed `< 1.0 m/s` (3.6 km/h)
- Degraded GPS points hold the previous confirmed movement state.
- Movement state is decoupled from geofence state. A driver may be `AT_RESTAURANT + MOVING`, `AT_RESTAURANT + STOPPED`, `OUTSIDE_RESTAURANT + MOVING`, or `OUTSIDE_RESTAURANT + STOPPED`.

### 3.5 Geofence & Restaurant Hysteresis
- **Arrival**: Requires 2 consecutive reliable points inside the configured restaurant radius (`distance <= radius`).
- **Departure**: Requires 2 consecutive reliable points outside the restaurant radius plus a 30m buffer (`distance > radius + 30m`).
- **Deadband / Buffer**: Points in `[radius, radius + 30m]` hold the previous confirmed restaurant state to prevent boundary jitter.
- Degraded points never flip geofence state.

### 3.6 Speed & Monotonicity Semantics
- Android `Location.speed` is never blindly trusted.
- On Android O (API 26+), speed accuracy is checked via `location.hasSpeedAccuracy()`. If `speedAccuracyMetersPerSecond > 25.0f`, speed is treated as unreliable.
- Temporal ordering and monotonicity on device are verified using `location.elapsedRealtimeNanos`. Out-of-order samples (`elapsedRealtimeNanos < lastSeenElapsedRealtimeNanos`) are rejected from advancing hardware state.
- Timestamps: Reject points with `recordedAt > now + 60s` (future clock skew) or `recordedAt < now - 24 hours` (expired telemetry).
- Shift Queue Isolation: Native SQLite queue tags all points with the active `shiftId`. Upon shift start, any orphan records from prior shifts are purged. Telemetry from Shift A is strictly prohibited from associating with Shift B.

---

## 4. SHIFT LIFECYCLE

1. **Shift Start**:
   - Initiated by authenticated driver via mobile UI (`POST /api/drivers/me/shifts/start`).
   - Requires authorized device binding.
   - Enforces geofence validation: driver must be physically within the restaurant perimeter (or explicitly verified).
   - Generates a short-lived `telemetryToken` bound to `(driverId, deviceId, shiftId)`.
2. **Shift Active**:
   - Continuous foreground tracking, SQLite enqueuing, and automatic batch upload.
   - Independent 60s heartbeat runner updating `lastSeen` and device vitals (battery, network, charging, GPS enabled).
3. **Shift End**:
   - Normal End: Driver initiates `POST /api/drivers/me/shifts/end`. Requires restaurant proximity check. Triggers bounded queue drain (up to 8s) before stopping native service.
   - Force End: Admin initiates `POST /api/drivers/:id/shifts/force-end`. Ends shift regardless of driver location or connectivity.

---

## 5. HISTORICAL DATA LAYER & DRIVER ACTIVITY

### 5.1 Unified Historical Foundation
`Location History`, `Shift History`, `Driver Activity`, and `Reports` share a single, coherent historical data layer backed by PostgreSQL tables: `shifts`, `location_points`, and `notifications`.

### 5.2 Location History
- Queryable by driver and shift, with date range filters (`from`, `to`) and deterministic pagination.
- Delivers point coordinates, recorded timestamp, accuracy, speed, heading, and computed operational state.
- Bounded result sets to protect client memory and map performance.

### 5.3 Shift History
- Provides historical shift records with start time, end time, total duration, status, and associated driver context.
- Computed identically on the backend for both Web and Mobile.

### 5.4 Driver Activity Semantics
Meaningful operational state transitions derived deterministically from shift events, confirmed reliable telemetry, and alerts:
- `SHIFT_STARTED`: Shift initialization timestamp.
- `ARRIVED_AT_RESTAURANT`: Confirmed geofence arrival.
- `LEFT_RESTAURANT`: Confirmed geofence departure.
- `MOVING`: Confirmed transition from STOPPED to MOVING.
- `STOPPED`: Confirmed transition from MOVING to STOPPED.
- `STOP_EXTENDED`: Confirmed stationary period exceeding configured threshold outside restaurant.
- `SHIFT_ENDED`: Shift completion timestamp.
*Zero redundant storage*: Activities are generated deterministically using the existing `evaluateOperationalHistory` engine, preventing data duplication or synchronization bugs.

---

## 6. REPORTS & ANALYTICS

Aggregates operational metrics across drivers and customizable date ranges (`from`, `to`):
- `totalShifts`: Total shifts completed or active in range.
- `totalDurationMinutes`: Sum of all shift durations.
- `totalDistanceMeters`: Cumulative distance traveled during shifts, computed strictly from displacements between consecutive reliable points (`accuracy <= 35m`).
- `movingDurationMinutes`: Total time spent in confirmed `MOVING` state.
- `stoppedDurationMinutes`: Total time spent in confirmed `STOPPED` state outside restaurant.
- `restaurantDurationMinutes`: Total time spent inside restaurant geofence.
- `alertCount`: Total operational alerts triggered during the period.
- Breakdown: Summary metrics plus per-driver breakdown table.
- Strict Rule: Degraded/severe points are excluded from distance aggregation to prevent false mileage inflation.

---

## 7. ALERT CENTER

Centralized operational monitoring and alert lifecycle management for Admin and Call Center:
- **Alert Types**:
  - `DRIVER_OFFLINE`: Triggered strictly when `lastSeen` exceeds `offlineGraceMinutes` during an active shift. Resolved immediately when heartbeat or fresh communication resumes.
  - `STOP_EXTENDED`: Triggered when driver is confirmed `STOPPED` outside restaurant for `>= maxStopDurationMinutes`. Resolved when driver resumes moving or enters restaurant.
  - `GEOFENCE_ENTER` / `GEOFENCE_EXIT`: Operational notifications for restaurant boundary crossings.
  - `BATTERY_LOW` / `BATTERY_CRITICAL`: Battery health warnings based on configured thresholds.
  - `GPS_DISABLED`: Device location provider disabled during active shift.
- **Alert Capabilities**:
  - Filter active vs. resolved alerts.
  - Filter by driver, severity (`INFO`, `WARNING`, `CRITICAL`), and alert type.
  - Read/unread tracking per user with unread counters.
  - Direct navigation / map focus on affected driver upon alert click.

---

## 8. CENTRALIZED AUDIT LOG

Centralized, tamper-resistant logging of administrative and authorized mutations:
- **Mandatory Fields**:
  - `actorId`: User ID of caller (or null for automated system actions).
  - `actorEmail`: Email snapshot of caller at the time of mutation.
  - `actorRole`: Role of caller (`ADMIN`, `CALL_CENTER`, `SYSTEM`).
  - `action`: Specific mutation name (`USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `DRIVER_CREATED`, `DRIVER_UPDATED`, `DEVICE_RESET`, `DEVICE_ASSIGNED`, `SHIFT_FORCE_ENDED`, `SETTINGS_UPDATED`).
  - `entityType`: Targeted domain entity (`USER`, `DRIVER`, `DEVICE`, `SHIFT`, `SETTINGS`).
  - `entityId`: Unique identifier of targeted record.
  - `details`: JSON payload of mutation metadata (e.g. before/after diff summary).
  - `ipAddress`: Client IP address.
  - `createdAt`: UTC timestamp.
- **Security & Privacy**: Passwords, hashes, JWTs, refresh tokens, OTPs, and telemetry tokens MUST NEVER be recorded in audit logs.
- Searchable and paginated endpoint accessible to `ADMIN`.

---

## 9. DRIVER OFFLINE & CONNECTION UX

The system enforces a 4-state connection & telemetry quality model across Web and Mobile:
1. **ONLINE**: Fresh heartbeat (`lastSeen <= offlineGraceMinutes`).
2. **OFFLINE**: Stale heartbeat (`lastSeen > offlineGraceMinutes`).
3. **GPS DEGRADED / STALE**: Device is ONLINE, but location fix is degraded (`accuracy > 35m`) or stale (`recordedAt > 5 min ago`).
4. **SYNCING**: Telemetry queue is currently uploading or pending retry on mobile.
- *Strict Rule*: Clients must never collapse GPS degradation or offline state into a single ambiguous indicator. Badges, colors, and labels must be visually and semantically identical across Web and Mobile.

---

## 10. MOBILE ADMIN SCOPE & PARITY

Mobile Admin provides full administrative feature parity with the Web Dashboard adapted to mobile UX:
- Fleet overview cards and live driver list.
- Real geographic interactive map with restaurant boundary and driver status markers.
- Driver management: profiles, shifts, location history trail, activity timeline, status toggling, and force-end shift.
- Device authorization and device reset.
- User management: create, edit, deactivate, and permanently delete users.
- Alert Center: live alerts, history, filters, and read state.
- Reports & Analytics: operational summary, driver performance metrics, date filters.
- System Settings: restaurant geofence coordinates/radius and alert thresholds.
- Audit Log: administrative event viewer.

---

## 11. UI & DESIGN SYSTEM CONSISTENCY

- **Typography**: Cairo font family across Web and Mobile.
- **Language & Direction**: Arabic as primary language with full RTL support; English secondary with LTR.
- **Numerals**: Western ASCII digits (`0-9`) consistently across both languages.
- **Color Tokens**:
  - Moving / Live / Success: Emerald (`#059669` / `#10b981`)
  - Stopped / Warning: Amber (`#d97706` / `#f59e0b`)
  - Restaurant / Info: Sky (`#0284c7` / `#38bdf8`)
  - Offline / Stale: Slate (`#64748b` / `#94a3b8`)
  - Critical / Error: Rose / Red (`#e11d48` / `#ef4444`)
  - Dark surfaces: Slate-900 / Slate-950

---

## 12. EXPLICIT NON-GOALS

- No secondary background location mechanisms or competing GPS services.
- No FCM/push-based telemetry delivery.
- No complex Kalman filtering or probabilistic map matching.
- No manager role or client-side authorization bypasses.
- No driver-facing in-app chat or customer order dispatching (Tracker is strictly a fleet telemetry platform).
