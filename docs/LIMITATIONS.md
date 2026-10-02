# System Boundaries & Known Limitations

To maintain architectural focus and operational reliability, Tracker operates within clear, documented physical and platform boundaries. This document outlines the technical limitations of the system.

---

## 1. Operating System & Hardware Boundaries

### Android OEM Battery Optimization (Doze Mode & Custom ROMs)
- **Reality**: While Tracker implements an Android Foreground Service (`LocationTrackingService.kt`) with `FOREGROUND_SERVICE_LOCATION` permissions, persistent notification, and partial wake locks, **no Android app can provide a 100% mathematical guarantee against OS termination**.
- **Impact**: Aggressive vendor task killers (notably Xiaomi MIUI/HyperOS, Huawei EMUI, and Samsung OneUI "Deep Sleeping Apps") may throttle or kill background services if the phone remains unattended, in extreme battery saver mode, or if the user has not exempted Tracker from battery optimization.
- **Mitigation**: Tracker provides in-app guidance for drivers to set battery management to "Unrestricted" and automatically requests `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.

### GPS Physical & Atmospheric Constraints
- **Multipath & Indoor Degradation**: GPS satellite signals cannot penetrate concrete basements, deep tunnels, or metal structures. When a driver is inside a building, GPS accuracy may degrade beyond the 35m reliable threshold or 150m severe cutoff.
- **Cold Start Latency**: When a device restarts or location services are freshly enabled, acquiring an initial high-accuracy satellite fix ("Time to First Fix" / TTFF) can take between 10 to 45 seconds depending on Assisted GPS (A-GPS) cellular availability.
- **Handling in Tracker**: The client-side filter rejects fixes worse than 150m accuracy to prevent synthetic map teleportation, and classifies fixes between 35m and 150m as degraded.

---

## 2. Network & Storage Boundaries

### Offline Queue Capacity
- **Capacity**: The native Android SQLite buffer holds up to **1,000 location records**.
- **Buffer Duration**: At the default sampling rate of 5 seconds during active movement, 1,000 records provide approximately **83 minutes of continuous offline tracking** during non-stop driving without cellular coverage.
- **Eviction Policy**: If an offline period exceeds 1,000 records, the queue applies **FIFO eviction** (oldest records dropped first) to protect mobile flash memory and prevent out-of-memory crashes.

### First-Time Authentication Requires Connectivity
- **Initial Login**: A driver cannot perform an initial login or authorize a new device while completely offline, because password hashing (Argon2id/bcrypt) and hardware device binding must be verified against the central PostgreSQL database.
- **Token Refresh**: Once authenticated, the 24-hour telemetry token allows continuous background telemetry collection even during intermittent cellular dropouts.

---

## 3. Data Retention & Operational Scope

### Raw Telemetry Retention (48-Hour Rolling Window)
- **Policy**: Raw GPS coordinates in the `location_points` table are retained for **48 hours**, after which an automated hourly cleanup job purges older records.
- **Rationale**: Storing raw second-by-second coordinates indefinitely for dozens of drivers creates massive database bloat that degrades live query performance.
- **Historical Reporting**: High-level shift metrics (start time, end time, work duration, distance traveled, moving vs stopped duration) are preserved indefinitely in the `shifts` table, but high-resolution second-by-second polyline replay is limited to the active retention window.

### Single Active Restaurant Geofence per Deployment
- **Current Operational Model**: The current production release is optimized for a dedicated restaurant delivery fleet centered around a primary dispatch restaurant hub (configured with coordinates and a 150m geofence).
- **Multi-Branch Multi-Tenant**: While the database schema supports a `restaurants` table with foreign keys, the mobile cockpit UI and shift start validation currently bind to the active primary branch configured in the deployment environment. Dynamic multi-branch dispatch routing is not part of this release.

---

## 4. Administrative & Client Scope

### Web Admin Map Real-Time Transport
- **Mechanism**: The Web Admin map updates via **HTTP polling** (default 10s on live fleet, 30s on overview).
- **Boundary**: WebSocket/SSE live streaming is not used for the administrative map. Polling was chosen to ensure maximum edge caching compatibility with serverless Vercel infrastructure, zero persistent connection drops behind corporate firewalls, and reliable reconnection.
- **Latency**: There is an inherent 5 to 10-second visualization latency between a driver's physical movement and the Web Admin map pin update.
