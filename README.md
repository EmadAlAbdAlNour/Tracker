# Tracker

> Enterprise driver monitoring, telemetry, and operational visibility platform for restaurant delivery fleets.

[![Build & Tests](https://img.shields.io/badge/tests-352%20passed-brightgreen.svg)]()
[![Typecheck](https://img.shields.io/badge/typescript-clean-blue.svg)]()
[![Version](https://img.shields.io/badge/version-1.2.0%20(code%2035)-purple.svg)]()
[![Android](https://img.shields.io/badge/android-SDK%2035-brightgreen.svg)]()
[![License](https://img.shields.io/badge/license-Proprietary-darkred.svg)]()

---

## 1. Overview

**Tracker** is an end-to-end, high-reliability fleet tracking and operational visibility platform purpose-built for restaurant delivery operations. It provides live fleet tracking, geofence-enforced shift management, native Android telemetry with offline durable queueing, unified administrative notifications, automated operational shift reports, and hardware-bound device authorization.

### Who Uses Tracker?
1. **Drivers (`DRIVER`)**: Mobile Android cockpit to start geofence-verified shifts, transmit resilient foreground GPS telemetry, track speed and restaurant distance, and end shifts.
2. **Call Center (`CALL_CENTER`)**: Real-time read-only fleet visibility, active driver map monitoring, and live status inspection to answer customer order location inquiries.
3. **Administrators (`ADMIN`)**: Full operational command—live interactive fleet maps, device authorization and resets, force-ending stranded shifts, notification management, comprehensive analytical reports, and immutable audit logs.

---

## 2. What Tracker Does

- **Geofence-Enforced Shift Lifecycle**: Drivers can only start shifts when physically within the restaurant's operational geofence (150m radius) with reliable GPS accuracy (<35m).
- **Zero-Data-Loss Native Telemetry**: Uses an Android Native Foreground Service (`LocationTrackingService.kt`) with FusedLocationProvider, durable local SQLite queue (1,000 points), and automatic batch uploading.
- **Decoupled Device Heartbeat**: 60-second periodic network heartbeat keeps device connection state (`lastSeen`) independent from physical vehicle movement (`lastLocationAt`).
- **Hardware-Locked Device Security**: Drivers are strictly bound to a single authorized mobile phone hardware UUID to eliminate ghost logins and unauthorized device sharing.
- **Unified Operational Notifications**: Real-time alerts for geofence entry/exit, extended vehicle stops outside the restaurant, low battery, and offline states with auto-resolution.
- **Audited Administrative Actions**: Complete, masked audit trail for force-ending shifts, authorizing/resetting devices, and modifying system parameters.
- **Arabic-First Design System**: Native RTL layout with Cairo typography, Western Arabic numerals, and LTR formatting for technical identifiers.

---

## 3. What Tracker Is NOT

Tracker is strictly focused on fleet telemetry and operational visibility. To preserve architectural stability, Tracker is **intentionally NOT**:
- ❌ **Not a Point of Sale (POS)**: Does not take orders, process payments, or print kitchen receipts.
- ❌ **Not an Online Ordering / Marketplace Platform**: Does not manage customer menus, online shopping carts, or end-consumer accounts.
- ❌ **Not a Kitchen Display System (KDS)**: Does not track food preparation stages or cook times.
- ❌ **Not a Consumer Turn-by-Turn GPS Navigator**: Does not calculate street-by-street routing algorithms or replace Google Maps/Waze.
- ❌ **Not a Social or Messaging Network**: Does not support peer-to-peer driver chat or social media integration.

---

## 4. Architecture at a Glance

```
                 ┌────────────────────────────────────────────────────────┐
                 │                 Mobile Driver Client                   │
                 │                 (React Native / Expo)                  │
                 └───────────────────────────┬────────────────────────────┘
                                             │
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │                Native Android Telemetry                │
                 │   Foreground Service + FusedLocation + SQLite Queue    │
                 │                 Durable Batch Uploader                 │
                 └───────────────────────────┬────────────────────────────┘
                                             │ HTTPS
                                             ▼
┌───────────────────────────┐    ┌────────────────────────────────────────┐
│     Web Admin Portal      │───▶│          Backend API Server            │
│   (Next.js 14 / React)    │    │          (Express.js / Node)           │
└───────────────────────────┘    └───────────────────┬────────────────────┘
                                                     │
                                                     ▼
                                 ┌────────────────────────────────────────┐
                                 │          PostgreSQL Database           │
                                 │       (12 Core Relational Tables)      │
                                 └────────────────────────────────────────┘
```

For full architecture diagrams and component interactions, see [**docs/ARCHITECTURE.md**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/ARCHITECTURE.md).

---

## 5. Applications in the Monorepo

| Application | Technology Stack | Primary Purpose | Key Routes / Entry |
| :--- | :--- | :--- | :--- |
| **Mobile App** (`apps/mobile`) | React Native 0.79, Expo 53, Native Kotlin | Driver Cockpit HUD, Background GPS Service, Mobile Admin | [`apps/mobile/App.tsx`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/mobile/App.tsx) |
| **Web Admin** (`apps/web`) | Next.js 14 App Router, Leaflet, TailwindCSS | Operational Dashboard, Live Fleet Map, Reports, Devices, Notifications | [`apps/web/app/dashboard/`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/web/app/dashboard/) |
| **API Server** (`artifacts/api-server`) | Node.js, Express.js, TypeScript, PostgreSQL | Core REST API, Telemetry Ingestion, Auth, Geofence Engine | [`artifacts/api-server/src/index.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/artifacts/api-server/src/index.ts) |

---

## 6. Roles & Access Matrix

| Capability | ADMIN | CALL_CENTER | DRIVER |
| :--- | :---: | :---: | :---: |
| **Login to Web Admin** | ✅ | ✅ | ❌ |
| **Login to Mobile App** | ✅ | ✅ | ✅ |
| **View Live Fleet Map & Driver Status** | ✅ | ✅ | ❌ |
| **Start / End Own Shift** | ❌ | ❌ | ✅ |
| **Force End Driver Shift** | ✅ | ❌ | ❌ |
| **Authorize / Reset Driver Devices** | ✅ | ❌ | ❌ |
| **View Operational Shift Reports** | ✅ | ❌ | ❌ |
| **View Security & Admin Audit Logs** | ✅ | ❌ | ❌ |
| **Resolve Notifications** | ✅ | ❌ | ❌ |

Detailed matrix available in [**docs/ROLES_AND_PERMISSIONS.md**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/ROLES_AND_PERMISSIONS.md).

---

## 7. Key Telemetry & Operational Parameters

All parameters represent the current, authoritative values enforced by production code:

| Metric / Parameter | Value | Reference File |
| :--- | :--- | :--- |
| **Restaurant Geofence Radius** | **150 meters** | [`telemetry.service.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/artifacts/api-server/src/services/telemetry.service.ts) |
| **Geofence Exit Buffer** | **30 meters** ($150 + 30 = 180\text{m}$) | [`telemetry.service.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/artifacts/api-server/src/services/telemetry.service.ts) |
| **Reliable GPS Accuracy Floor** | **35.0 meters** | [`telemetry.service.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/artifacts/api-server/src/services/telemetry.service.ts) |
| **Severe Accuracy Cutoff** | **150.0 meters** (fixes $> 150$m rejected) | [`LocationTrackingService.kt`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/mobile/android/app/src/main/java/com/tracker/driver/telemetry/LocationTrackingService.kt) |
| **Movement Speed Threshold** | **1.5 m/s** (~5.4 km/h) | [`telemetry.service.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/artifacts/api-server/src/services/telemetry.service.ts) |
| **Stop Speed Threshold** | **1.0 m/s** (~3.6 km/h) | [`telemetry.service.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/artifacts/api-server/src/services/telemetry.service.ts) |
| **Sampling Interval** | **5 seconds** | [`LocationTrackingService.kt`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/mobile/android/app/src/main/java/com/tracker/driver/telemetry/LocationTrackingService.kt) |
| **Heartbeat Cadence** | **60 seconds** | [`heartbeatService.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/mobile/services/heartbeatService.ts) |
| **Offline SQLite Buffer Capacity** | **1,000 location records** | [`DurableLocationQueue.kt`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/mobile/android/app/src/main/java/com/tracker/driver/telemetry/DurableLocationQueue.kt) |
| **Batch Upload Chunk Size** | **20 records** | [`TelemetryUploader.kt`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/mobile/android/app/src/main/java/com/tracker/driver/telemetry/TelemetryUploader.kt) |
| **Raw Telemetry DB Retention** | **48 hours** (hourly cleanup) | [`telemetry.service.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/artifacts/api-server/src/services/telemetry.service.ts) |

---

## 8. Quickstart & Local Development

### Prerequisites
- **Node.js**: v18.x or v20.x
- **pnpm**: v11.22.0 or higher
- **JDK**: Java 17 (Zulu distribution recommended)
- **Android SDK**: Build Tools 35.0.0, NDK 27.1.12297006

### Installation & Execution
```bash
# 1. Install all dependencies across the monorepo
pnpm install

# 2. Run automated test suite (352 tests)
pnpm test

# 3. Run typecheck across all workspaces
pnpm run typecheck

# 4. Start backend API dev server (Port 3000)
pnpm --filter @workspace/api-server run dev

# 5. Start Web Admin dev server (Port 3001)
pnpm --filter @workspace/admin-web run dev

# 6. Start Mobile Expo dev server
pnpm --filter @workspace/mobile run start
```

For complete environment variable configuration and seed steps, see [**docs/DEVELOPMENT.md**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/DEVELOPMENT.md).

---

## 9. Android Release Build

To compile and verify the signed Android release APK:

```powershell
cd apps/mobile/android
./gradlew.bat assembleRelease
```

- **Output Location**: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- **Package**: `com.tracker.driver`
- **Version**: `1.2.0` (Version Code `35`)
- **Verified SHA-256**: `915ea97b0d120b47bcb3376ba16432320dfaedfe883351b4567d5febe76fe21d`
- **Certificate Fingerprint**: `fa9d044e9c16e33b9d2e17243bd06def803407d85c79d87b739e24ec0db291d3`

See [**docs/RELEASE.md**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/RELEASE.md) for CI/CD automation and Vercel Blob publishing.

---

## 10. Complete Documentation Hub

For exhaustive technical references, consult the [**Documentation Hub (`docs/README.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/README.md):

- 📐 [**Architecture (`docs/ARCHITECTURE.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/ARCHITECTURE.md)
- 🔒 [**Authentication & Devices (`docs/AUTHENTICATION.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/AUTHENTICATION.md)
- ⏱️ [**Shift Lifecycle (`docs/SHIFT_LIFECYCLE.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/SHIFT_LIFECYCLE.md)
- 📡 [**Telemetry Pipeline (`docs/TELEMETRY.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/TELEMETRY.md)
- 📍 [**Geofence Semantics (`docs/GEOFENCE_AND_LOCATION_SEMANTICS.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/GEOFENCE_AND_LOCATION_SEMANTICS.md)
- 💓 [**Heartbeat Pipeline (`docs/HEARTBEAT.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/HEARTBEAT.md)
- 🔔 [**Unified Notifications (`docs/NOTIFICATIONS.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/NOTIFICATIONS.md)
- 📊 [**Reporting Formulas (`docs/REPORTING.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/REPORTING.md)
- 📱 [**Mobile App Architecture (`docs/MOBILE_APP.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/MOBILE_APP.md)
- 🌐 [**Web Admin Dashboard (`docs/WEB_ADMIN.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/WEB_ADMIN.md)
- 🌍 [**Localization & RTL (`docs/LOCALIZATION.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/LOCALIZATION.md)
- 🚀 [**Production Deployment (`docs/DEPLOYMENT.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/DEPLOYMENT.md)
- 🛠️ [**Troubleshooting Guide (`docs/TROUBLESHOOTING.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/TROUBLESHOOTING.md)
- ⚠️ [**System Limitations (`docs/LIMITATIONS.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/LIMITATIONS.md)
- 📋 [**Known Issues & Audit Register (`docs/KNOWN_ISSUES.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/KNOWN_ISSUES.md)
- 📜 [**Project History & Milestones (`docs/HISTORY.md`)**](file:///c:/Users/Emad/Desktop/Tracker/Tracker/docs/HISTORY.md)
