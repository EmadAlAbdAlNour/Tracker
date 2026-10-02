# Testing Architecture & Verification Standards

> Authoritative Single Source of Truth for Test Suites, Regression Frameworks, and Physical Device Acceptance.  
> Verified against production Vitest suites and build pipelines (`v1.2.0`).

---

## 1. Test Architecture Overview

Tracker enforces a comprehensive multi-layered automated testing regime. The test suite contains **352 passing automated tests across 38 test suites**, verified with zero failures:

```
[pnpm test]
  ├── artifacts/api-server (22 suites, 162 tests) — Backend API, Auth, Telemetry, Rules, Retention
  ├── apps/mobile          (12 suites, 130 tests) — Mobile State Machine, Native Bridges, Parity
  └── apps/web             ( 4 suites,  60 tests) — Web Semantics, Heartbeat, Release, Functional
  ────────────────────────────────────────────────
  TOTAL:                   38 suites, 352 tests (100% Passing)
```

---

## 2. Test Suite Breakdown

### 2.1 Backend API Test Suites (`artifacts/api-server/src`)

| Test File | Tests | Key Invariants Verified |
| :--- | :---: | :--- |
| `auth.test.ts` | 7 | Password hashing (scrypt), salt randomness, credential verification, timing attack safety. |
| `refresh.test.ts` | 7 | Refresh token rotation, hash storage in DB, revocation of old tokens upon use. |
| `phase1.device.test.ts` | 4 | Driver single-device binding, unauthorized device rejection (HTTP 403), admin reset & assign. |
| `telemetry-token.test.ts` | 9 | Telemetry token issuance (24h TTL), shift-binding, rejection by general management APIs. |
| `location.batch.test.ts` | 18 | Batch ingestion (up to 20 points), idempotency with `clientLocationId`, ON CONFLICT DO NOTHING. |
| `heartbeat.test.ts` | 10 | Heartbeat updates `devices.lastSeen` without modifying `lastLocationAt` or `location_points`. |
| `geofence.shift.scope.test.ts`| 8 | Multi-sample hysteresis (2 arrival, 2 departure), deadband buffer ($R+30\text{m}$), zero fake locations. |
| `gps.hardening.test.ts` | 16 | Severe accuracy rejection ($> 150\text{m}$), degraded GPS suppression of `MOVING` state. |
| `history.and.reports.test.ts` | 3 | Work duration formulas, distance plausibility filter ($\le 150\text{ km/h}$), time partitioning. |
| `notifications.scoped.test.ts`| 7 | User-scoped read tracking (`notification_reads`), unread badge isolation, resolution. |
| `permanent-deletion.test.ts` | 6 | Administrative permanent purge of driver, cascading eradication of telemetry and tokens. |
| `retention.test.ts` | 6 | Automated 48-hour telemetry retention purge, non-blocking throttled scheduler. |
| `audit.service.test.ts` | 3 | Sensitive key masking (`[REDACTED]`), actor identity capture, tamper-evident logging. |
| `releases.test.ts` | 3 | Version metadata resolution, Blob storage fallbacks, download redirects. |

### 2.2 Mobile Application Test Suites (`apps/mobile`)

| Test File | Tests | Key Invariants Verified |
| :--- | :---: | :--- |
| `telemetryParity.test.ts` | 15 | Diagnostic 4-state resolution (`ONLINE`, `OFFLINE`, `GPS_STALE`, `GPS_DEGRADED`, `SYNCING`). |
| `fleetStatus.test.ts` | 18 | Speed presentation rules: speed current only when actively moving and GPS fix is fresh ($\le 5\text{m}$). |
| `heartbeat.test.ts` | 10 | Mobile keepalive coordination, stationary driver online presence. |
| `hardening.test.ts` | 14 | Monotonic timestamp verification, severe outlier drops at native intake. |
| `reportsParity.test.ts` | 12 | Exact mathematical and format parity with Web reporting calculations. |
| `updateManager.test.ts` | 7 | In-app soft update detection, semver comparison, mandatory update enforcement. |
| `deviceParity.regression.test.ts` | 8 | Zero text clipping under Arabic RTL on small screen viewports. |

### 2.3 Web Application Test Suites (`apps/web/tests`)

| Test File | Tests | Key Invariants Verified |
| :--- | :---: | :--- |
| `web.semantics.test.ts` | 22 | Semantic state badges, distance to restaurant display, geofence status logic. |
| `web.heartbeat.test.ts` | 6 | Web UI response to heartbeat keepalives, stationary driver status indicators. |
| `web.functional.test.ts` | 22 | Shell navigation filtering, role-based route guard redirects, notification drawer actions. |
| `web.release.test.ts` | 10 | `/download` portal rendering, `/api/app-version` query, `/api/download/latest` 302 redirect. |

---

## 3. Real-Device Acceptance vs. Mock Testing

A crucial distinction in Tracker's engineering standard is that **mock tests are insufficient for telemetry verification**:

1. **Unit / Integration Tests**:
   - Validate algorithmic correctness, SQL query logic, state machines, and schema contracts in milliseconds using simulated data.
2. **Physical Device Acceptance Testing**:
   - Conducted on physical hardware (e.g. Samsung Galaxy S25 Ultra, Android 15, and Android Studio Pixel emulators).
   - Validates real-world OS constraints:
     - Real GPS radio acquisition under open sky vs. indoor concrete.
     - Ongoing status bar notification persistence when app is swiped away from Recents.
     - Screen-off execution across 30+ minutes of continuous driving.
     - OEM battery killer survival with "Unrestricted" battery profile.
     - Real cellular dropouts and seamless SQLite queue backlog flushing upon reconnection.

---

## 4. Quality Gate Execution Guide

To validate the entire repository before committing or deploying:

```bash
# 1. Run all 352 unit & integration tests
pnpm test

# 2. Run TypeScript strict typecheck across all workspace packages
pnpm run typecheck

# 3. Compile Web production bundle
pnpm --filter @workspace/admin-web build

# 4. Verify native Android release build & metadata
cd apps/mobile/android
.\gradlew.bat assembleRelease
cd ../../..
node artifacts/api-server/scripts/verify-apk.mjs
```
