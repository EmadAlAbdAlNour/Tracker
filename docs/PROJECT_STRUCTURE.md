# Repository & Directory Structure

Tracker is organized as a unified monorepo managed with **pnpm workspaces** and **Turborepo**. This document details the role, contents, and architecture of each directory.

---

## High-Level Monorepo Layout

```
Tracker/
├── .github/
│   └── workflows/                # GitHub Actions CI/CD workflows
├── apps/
│   ├── mobile/                   # React Native / Expo Android Driver & Mobile Admin App
│   └── web/                      # Next.js 14 Web Admin Dashboard & Download Portal
├── artifacts/
│   └── api-server/               # Express.js Backend API Server & Database Access
├── docs/                         # Authoritative Project Documentation & Historical Archive
│   ├── history/                  # Preserved Forensic, Parity, and QA Reports
│   └── *.md                      # Core Architecture & Operational Guides
├── scripts/                      # Database seed scripts and development tooling
├── package.json                  # Root monorepo configuration & workspace scripts
├── pnpm-workspace.yaml           # pnpm workspace package definitions
├── turbo.json                    # Turborepo task pipeline configuration
├── version.json                  # Single source of truth for release versioning
└── tsconfig.json                 # Monorepo base TypeScript configuration
```

---

## Detailed Directory Breakdown

### 1. `apps/mobile/` (Android Mobile Application)
The mobile application is built with **React Native (v0.79.5)** and **Expo (v53.0.0)**, featuring custom native Android Kotlin modules for resilient background tracking.

- **`android/`**: Native Android project.
  - `app/src/main/java/com/tracker/driver/telemetry/`:
    - `LocationTrackingService.kt`: Native Android Foreground Service (`FOREGROUND_SERVICE_LOCATION`).
    - `LocationModule.kt`: React Native bridge module exposing telemetry controls to JavaScript.
    - `DurableLocationQueue.kt`: SQLite persistent queue (`tracker_telemetry.db`) buffering up to 1,000 locations offline.
    - `TelemetryUploader.kt`: Resilient HTTP client batching stored records to the API.
  - `app/build.gradle`: Android build configuration, versioning hook, and signing configurations.
- **`screens/`**:
  - `DriverCockpitScreen.tsx`: Driver HUD displaying shift status, speed, restaurant distance, accuracy, and quick actions.
  - `AdminHomeScreen.tsx`: Mobile executive dashboard with fleet KPIs, active driver cards, and quick actions.
  - `AdminLiveMapScreen.tsx`: Mobile real-time fleet map rendered with react-native-maps.
  - `AdminDriversScreen.tsx`: Mobile driver list with shift indicators and device statuses.
  - `AdminReportsScreen.tsx`: Mobile operational shift reports with parity to web metrics.
  - `AdminNotificationsScreen.tsx`: Mobile unified notification center.
  - `LoginScreen.tsx`: Phone/password authentication with device binding detection.
- **`services/`**:
  - `apiClient.ts`: Axios client handling JWT tokens, refresh interceptor, and device headers.
  - `nativeTelemetryService.ts`: JavaScript wrapper interacting with the Kotlin native telemetry module.
  - `heartbeatService.ts`: Independent 60s background timer sending `/api/heartbeat`.
  - `updateService.ts`: Soft update checker querying `/api/app-version`.
- **`designSystem.ts`**: Unified mobile theme, spacing, typography, Cairo font integration, and RTL layout utilities.

---

### 2. `apps/web/` (Next.js 14 Web Admin Portal)
The administrative portal is built using **Next.js 14 App Router** and TailwindCSS/vanilla CSS tokens.

- **`app/`**:
  - `dashboard/`:
    - `page.tsx`: Executive dashboard overview with live fleet counter and summary metrics.
    - `map/page.tsx`: Full-screen real-time interactive Leaflet fleet map with auto-refresh and driver filtering.
    - `drivers/page.tsx`: Driver roster, shift history, and Force End Shift modal.
    - `devices/page.tsx`: Hardware device authorization, binding, and device reset management.
    - `notifications/page.tsx`: Administrative notifications feed with resolve actions.
    - `reports/page.tsx`: Shift performance reports, daily aggregations, and distance metrics.
    - `audit/page.tsx`: Administrative security and compliance audit log viewer.
    - `settings/page.tsx`: System parameters, restaurant coordinates, and geofence radius settings.
  - `download/page.tsx`: Public APK download portal with dynamic QR code, file size, and SHA-256 checksum.
  - `api/`:
    - `app-version/route.ts`: Release version discovery API querying Vercel Blob metadata.
    - `download/route.ts`: Streaming binary proxy to Vercel Blob storage.
    - `ci/upload/route.ts`: Authenticated Vercel Blob upload endpoint for GitHub Actions.
    - `notifications/`: Scoped notification reads and notification management endpoints.
- **`components/`**: Reusable UI components including `UnifiedSidebar`, `UnifiedNavbar`, `NotificationDrawer`, and `StatCard`.
- **`lib/`**:
  - `api.ts`: API client bridge to the Express backend.
  - `auth.ts`: Session management, cookie handling, and role verification.
  - `i18n.ts`: Localization system for Arabic (RTL) and English (LTR).

---

### 3. `artifacts/api-server/` (Backend Express Server)
The core backend service providing REST API endpoints, business logic, and PostgreSQL database persistence.

- **`src/`**:
  - `index.ts`: Server entrypoint, middleware configuration, and route mounting.
  - `routes/`:
    - `auth.routes.ts`: Login, token refresh, and user registration.
    - `shift.routes.ts`: Start shift (with geofence check), end shift, and admin force-end.
    - `telemetry.routes.ts`: Batch location upload endpoint with idempotency deduplication.
    - `heartbeat.routes.ts`: Lightweight connection ping updating `lastSeen`.
    - `fleet.routes.ts`: Real-time driver status, coordinates, and shift-scoped active fleet queries.
    - `device.routes.ts`: Device authorization, list, reset, and driver reassignment.
    - `report.routes.ts`: Shift performance reports using canonical `generateOperationalReport()`.
    - `audit.routes.ts`: Audit log querying with sensitive field redaction.
    - `restaurant.routes.ts`: Restaurant coordinates and geofence radius configuration.
    - `notification.routes.ts`: Unified notification creation, list, and resolution.
  - `services/`:
    - `telemetry.service.ts`: GPS validation, reliable accuracy checks, speed computation, and 48-hour purge worker.
    - `shift.service.ts`: Shift lifecycle, duration calculation, and geofence radius validation.
    - `report.service.ts`: Analytical formulas and physical distance plausibility filters ($\le 150$ km/h).
    - `audit.service.ts`: Masked audit logging for sensitive actions.
    - `jwt.service.ts`: Token signing, 15m access tokens, 7d refresh tokens, and 24h telemetry tokens.
  - `db/`: Database connection pool, schema definitions, and migration runner.
  - `migrations/`: Sequential SQL migration scripts creating all 12 PostgreSQL tables.
- **`scripts/`**:
  - `verify-apk.mjs`: `aapt dump badging` metadata verification script.
  - `publish-release.mjs`: Vercel Blob direct release uploader.

---

### 4. `scripts/` (Monorepo Tooling & Maintenance)
- **`src/seed.ts`**: Database seeding script creating default admin, call center, driver accounts, and primary restaurant coordinates.
- **`generate-icons.ps1`**: Asset generation script creating high-resolution Android launcher mipmap icons.
- **`patch-expo-modules-core.cjs`**: Patch script for Expo module compatibility.

---

### 5. `docs/` (Authoritative Documentation Hub)
- **`ARCHITECTURE.md`**: Complete system topology and Mermaid data flow diagrams.
- **`ROLES_AND_PERMISSIONS.md`**: Access control matrix for ADMIN, CALL_CENTER, and DRIVER.
- **`AUTHENTICATION.md`**: Token rotation and single-device hardware binding.
- **`SHIFT_LIFECYCLE.md`**: Start, active, end, and force-end shift workflows.
- **`TELEMETRY.md`**: Android Foreground Service, SQLite queue, and location filtering.
- **`HEARTBEAT.md`**: 60s heartbeat pipeline and `lastSeen` vs `lastLocationAt` distinction.
- **`GEOFENCE_AND_LOCATION_SEMANTICS.md`**: Authoritative 150m radius and multi-sample state machine.
- **`NOTIFICATIONS.md`**: Unified alerting architecture and auto-resolution rules.
- **`REPORTING.md`**: Mathematical formulas and distance plausibility filters.
- **`AUDIT_LOG.md`**: Audited actions and sensitive data redaction.
- **`DEVICE_MANAGEMENT.md`**: Hardware UUID binding and admin device reset.
- **`WEB_ADMIN.md`**: Next.js 14 web dashboard user guide.
- **`MOBILE_APP.md`**: Mobile React Native/Android user and architecture guide.
- **`LOCALIZATION.md`**: Arabic RTL design system and typography rules.
- **`API.md`**: REST API endpoints, parameters, and response schemas.
- **`DATA_MODEL.md`**: PostgreSQL tables, foreign keys, and indexes.
- **`DEPLOYMENT.md`**: Production Vercel and Neon PostgreSQL architecture.
- **`DEVELOPMENT.md`**: Local developer setup and run commands.
- **`TESTING.md`**: Test suite breakdown and verification commands.
- **`RELEASE.md`**: Versioning, signing, and APK distribution pipeline.
- **`TROUBLESHOOTING.md`**: Field diagnosis and resolution procedures.
- **`LIMITATIONS.md`**: Documented system boundaries and physical constraints.
- **`KNOWN_ISSUES.md`**: Audit findings and minor non-blocking register.
- **`HISTORY.md`**: Engineering evolution milestones and historical context.
- **`history/`**: Preserved forensic audits, device parity logs, and visual QA records.
