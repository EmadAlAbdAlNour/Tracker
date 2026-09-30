# TRACKER — FEATURE PARITY MATRIX

## 1. PARITY GOVERNING PRINCIPLE

**ONE PRODUCT, MULTIPLE CLIENTS.**
Web and Mobile clients differ only in ergonomic form-factor and technical host capabilities. Business capabilities, permissions, operational definitions, and API endpoints are unified.

---

## 2. CROSS-CLIENT FEATURE PARITY MATRIX

| Feature Category | Feature Description | Roles Allowed | Web Support | Mobile Support | API Endpoint | Permission Source | Technical Justification / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Authentication** | Login with Email / Phone & Password | ADMIN, CALL_CENTER, DRIVER | Supported | Supported | `POST /api/auth/login` | Backend auth | Dual-identifier login |
| | Token Refresh (Silent) | All | Supported | Supported | `POST /api/auth/refresh` | Backend auth | Durable refresh token rotation |
| | Logout | All | Supported | Supported | `POST /api/auth/logout` | Backend auth | Revokes active refresh token |
| | Current User Session (`/me`) | All | Supported | Supported | `GET /api/auth/me` | Backend auth | Self-identity retrieval |
| **Device Binding** | Device Registration / Handshake | DRIVER | N/A (Driver is Mobile) | Supported | `POST /api/drivers/me/device/register` | `requireRole('DRIVER')` | Native device identifier binding |
| | View Bound Device | DRIVER | N/A | Supported | `GET /api/drivers/me/device` | `requireRole('DRIVER')` | Driver mobile settings view |
| | Device List & Status | ADMIN | Supported | Supported | `GET /api/devices` | `requireRole('ADMIN')` | Management of all registered devices |
| | Device Reset / Unauthorize | ADMIN | Supported | Supported | `POST /api/drivers/:id/device/reset` | `requireRole('ADMIN')` | Forces re-registration; revokes tokens |
| | Device Assign / Rebind | ADMIN | Supported | Supported | `POST /api/drivers/:id/device/assign` | `requireRole('ADMIN')` | Manual device pairing |
| **Shift Management** | Start Shift (Geofence-aware) | DRIVER | N/A | Supported | `POST /api/drivers/me/shifts/start` | `requireRole('DRIVER')` | Mobile foreground service initialization |
| | Normal Shift End | DRIVER | N/A | Supported | `POST /api/drivers/me/shifts/end` | `requireRole('DRIVER')` | Flushes queue, stops foreground service |
| | Admin Force-End Shift | ADMIN | Supported | Supported | `POST /api/drivers/:id/shifts/force-end` | `requireRole('ADMIN')` | Immediate server-side shift termination |
| | Active Shift Status | All | Supported | Supported | `GET /api/drivers/:id/tracking-status` | Backend auth | Unified status check |
| **Telemetry Ingestion**| Foreground Location Service | DRIVER | N/A (Native Android) | Supported | Native `FusedLocationProviderClient` | Android OS | Dedicated single-pipeline GPS intake |
| | SQLite Telemetry Queue | DRIVER | N/A (Native Android) | Supported | Native SQLite helper | Android OS | Durable offline persistence & retry |
| | Telemetry Batch Ingestion | DRIVER | N/A | Supported | `POST /api/drivers/me/location/batch` | `requireAuthOrTelemetry` | Up to 20 points per batch |
| | Periodic Heartbeat | DRIVER | N/A | Supported | `POST /api/drivers/me/heartbeat` | `requireAuthOrTelemetry` | 60s independent keep-alive runner |
| **Live Fleet** | Live Fleet Map | ADMIN, CALL_CENTER | Supported (Leaflet) | Supported (RealGeographicMapView) | `GET /api/fleet/live` | `requireRole('ADMIN', 'CALL_CENTER')` | Real-time map with restaurant radius |
| | Live Fleet Metric Summary | ADMIN, CALL_CENTER | Supported | Supported | `GET /api/fleet/live` | `requireRole('ADMIN', 'CALL_CENTER')` | Online, moving, stopped, low battery |
| | Driver Filter by Operational State | ADMIN, CALL_CENTER | Supported | Supported | Client filter on live data | Role-checked API | All, Moving, Stopped, Restaurant, Offline |
| **Historical Data** | Location History (Breadcrumb trail) | ADMIN, CALL_CENTER | Supported | Supported | `GET /api/drivers/:id/locations` | Backend auth | Filter by shift, from, to, with pagination |
| | Shift History | ADMIN, CALL_CENTER, DRIVER | Supported | Supported | `GET /api/drivers/:id/shifts` | Backend auth | Duration, start, end, status |
| | Driver Activity Timeline | ADMIN, CALL_CENTER | Supported | Supported | `GET /api/drivers/:id/activity` | Backend auth | Deterministic state transitions |
| **Alert Center** | Active & Historical Alerts View | ADMIN, CALL_CENTER | Supported | Supported | `GET /api/notifications` | `requireRole('ADMIN', 'CALL_CENTER')` | Filter by severity, type, driver |
| | Mark Alert as Read | ADMIN, CALL_CENTER | Supported | Supported | `PATCH /api/notifications/:id/read` | Backend auth | Per-user read tracking |
| | Mark All Alerts as Read | ADMIN, CALL_CENTER | Supported | Supported | `POST /api/notifications/read-all` | Backend auth | Clears user unread count |
| | Focus Driver from Alert | ADMIN, CALL_CENTER | Supported | Supported | Client navigation | Role-checked API | Centers map on target driver |
| **Reports & Analytics**| Operational Performance Summary | ADMIN, CALL_CENTER | Supported | Supported | `GET /api/reports/summary` | `requireRole('ADMIN', 'CALL_CENTER')` | Date range filtering (`from`, `to`) |
| | Driver Mileage & Time Breakdown | ADMIN, CALL_CENTER | Supported | Supported | `GET /api/reports/summary` | `requireRole('ADMIN', 'CALL_CENTER')` | Moving vs stopped vs restaurant time |
| **User Management** | List Users | ADMIN | Supported | Supported | `GET /api/users` | `requireRole('ADMIN')` | Search, role filter, pagination |
| | Create User | ADMIN | Supported | Supported | `POST /api/users` | `requireRole('ADMIN')` | Full validation with password hash |
| | Update User Profile / Password | ADMIN | Supported | Supported | `PATCH /api/users/:id` | `requireRole('ADMIN')` | Role, active state, password |
| | Deactivate / Activate User | ADMIN | Supported | Supported | `PATCH /api/users/:id` | `requireRole('ADMIN')` | Cascades to driver, shifts, tokens |
| | Permanent Deletion (Hard Delete) | ADMIN | Supported | Supported | `DELETE /api/users/:id/permanent` | `requireRole('ADMIN')` | Atomic purge of all telemetry & shifts |
| **Driver Management**| List Drivers | ADMIN, CALL_CENTER | Supported | Supported | `GET /api/drivers` | `requireRole('ADMIN', 'CALL_CENTER')` | Employee ID, user binding |
| | Create Driver Record | ADMIN | Supported | Supported | `POST /api/drivers` | `requireRole('ADMIN')` | Creates user + driver atomically |
| | Update Driver Record | ADMIN | Supported | Supported | `PATCH /api/drivers/:id` | `requireRole('ADMIN')` | Phone, name, active flag |
| **Settings** | Restaurant Geofence Settings | ADMIN | Supported | Supported | `GET/PUT /api/settings/restaurant` | `requireRole('ADMIN')` | Coordinates, radius, name, enabled |
| | System Alert Thresholds | ADMIN | Supported | Supported | `GET/PUT /api/settings/alerts` | `requireRole('ADMIN')` | Stop grace, offline grace, battery |
| **Centralized Audit** | Audit Log Viewer | ADMIN | Supported | Supported | `GET /api/audit-logs` | `requireRole('ADMIN')` | Queryable administrative audit trail |
| **Diagnostics & UX** | Connection State Indicator | All | Supported | Supported | Client Telemetry Resolver | Shared Domain Logic | 4-state: ONLINE, OFFLINE, STALE, SYNC |
| | Speed Semantics Presentation | All | Supported | Supported | Client Telemetry Resolver | Shared Domain Logic | Current vs Historical speed rules |
| | RTL / Cairo Typography | All | Supported | Supported | Design System / i18n | Shared Design Specs | Western numerals, Arabic primary |

---

## 3. JUSTIFIED PLATFORM EXCEPTIONS

1. **Android Native Telemetry Service**:
   - Host platform requirement: Background GPS collection, FusedLocationProvider, and foreground persistent notification are inherently Android native capabilities. Drivers execute their shifts strictly on Android mobile devices.
2. **Web Map vs Mobile Map**:
   - Web leverages `react-leaflet` with vector tile layers suited for desktop wide-screen operations rooms.
   - Mobile leverages `RealGeographicMapView` optimized for touch interaction, mobile GPU rendering, and pinch-to-zoom gestures.
   - *Semantic Parity*: Both map implementations render the exact same restaurant perimeter and use identical color tokens for driver status markers.
