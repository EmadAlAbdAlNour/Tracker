# Tracker — Final Product Reconstruction Forensic Audit

**Repository**: `C:\Users\Emad\Desktop\Tracker\Tracker`  
**Date**: 2026-09-18  
**Scope**: Complete Monorepo Forensic Audit (Mobile, Web, API Server, Database, Android Build, Configuration, Assets)

---

## 1. Executive Summary

This forensic audit evaluates the actual state of the Tracker monorepo against the master product reconstruction specification. It separates real working functionality from broken, partial, or inconsistent implementations without assumptions or trust in legacy reports.

---

## 2. Forensic Discovery Findings

### 2.1 Product Identity & Naming Audit
| Asset / Code Location | Current Value | Canonical Expected Value | Finding / Action Required |
|---|---|---|---|
| `apps/mobile/app.config.ts` | `name: 'Tracker Driver'` | `Tracker` | **MISMATCH**: Change to `Tracker`. |
| `apps/mobile/app.config.ts` | `slug: 'tracker-driver-mobile'` | `tracker-mobile` | **MISMATCH**: Change to `tracker-mobile`. |
| `apps/mobile/package.json` | `"name": "tracker-driver-mobile"` | `"tracker-mobile"` | **MISMATCH**: Remove driver-only naming. |
| `apps/mobile/android/settings.gradle` | `rootProject.name = 'Tracker Driver'` | `'Tracker'` | **MISMATCH**: Change to `'Tracker'`. |
| `apps/mobile/android/app/src/main/res/values/strings.xml` | `app_name = "Tracker Driver"` | `Tracker` | **MISMATCH**: Change to `Tracker`. |
| `apps/mobile/location.ts` | `notificationTitle: 'Tracker Driver'` | `Tracker` | **MISMATCH**: Change to `Tracker`. |
| `apps/mobile/i18n.ts` (ar.app.title) | `'تطبيق السائق'` | `'Tracker'` | **MISMATCH**: Change to canonical `Tracker`. |
| `apps/mobile/i18n.ts` (en.app.title) | `'Driver Tracker'` | `'Tracker'` | **MISMATCH**: Change to canonical `Tracker`. |
| `apps/web/app/layout.tsx` | `title: 'Tracker Admin'` | `Tracker` | **MISMATCH**: Update metadata title to canonical `Tracker`. |
| `apps/web/app/globals.css` | `font-family: Arial, Helvetica...` | Arabic font (Cairo/Tajawal) | **SUB-OPTIMAL**: Replace with Cairo Google font. |
| `apps/web/public` | Missing | `public/favicon.ico`, `logo.svg` | **MISSING**: Create public assets directory with favicon and vector logo. |

---

### 2.2 Roles & RBAC Audit
- **Active Canonical Roles**: Exactly 3 roles (`ADMIN`, `CALL_CENTER`, `DRIVER`) exist across:
  - `lib/db/src/schema/index.ts` (`userRoleEnum = pgEnum("user_role", ["ADMIN", "DRIVER", "CALL_CENTER"])`)
  - `artifacts/api-server/src/auth.ts` (`export type UserRole = "ADMIN" | "DRIVER" | "CALL_CENTER"`)
  - `apps/mobile/roleRouting.ts` (`export type AllowedRole = 'ADMIN' | 'CALL_CENTER' | 'DRIVER'`)
  - `apps/web/components/auth-provider.tsx` (`export type Role = 'ADMIN' | 'CALL_CENTER' | 'DRIVER'`)
- **Legacy `MANAGER` Role**:
  - Codebase search reveals `MANAGER` exists only in historical migration snapshots and negative assertion tests (`expect(isAllowedRole('MANAGER')).toBe(false)`).
  - Production Neon database contains **0** `MANAGER` records.
  - Zero active runtime references exist. Status: **COMPLIANT**.

---

### 2.3 UI Iconography & Emoji Audit
- UI emojis were previously used in:
  - `apps/mobile/components/MobileMapView.tsx`: Used `🏠`, `🎯`, `🚀`, `🔋`, `⚡`, `📍`. (Note: `MobileMapView.tsx` is an unused legacy coordinate canvas superseded by `RealGeographicMapView.tsx`).
  - `apps/mobile/screens/AdminHomeScreen.tsx:741`: Used `🌐` for language toggle row.
- Solution:
  - Remove all emoji glyphs from UI components and navigation.
  - Standardize on `AppIcon.tsx` vector glyphs on Mobile and `lucide-react` on Web.

---

### 2.4 Navigation & Layout Audit
- **Mobile Navigation**:
  - Previously used a horizontal scrolling tab bar (`ScrollView horizontal`) with 7 tabs that overflowed off-screen on typical mobile widths.
  - Current implementation has `BottomTabBar.tsx` fitting exactly 4 screen-fitted tabs per role:
    - **ADMIN**: الرئيسية, الخريطة, السائقون, المزيد
    - **CALL_CENTER**: الرئيسية, الخريطة, السائقون, الإشعارات
    - **DRIVER**: الرئيسية, الوردية, التشخيص, حسابي
- **Mobile Header**:
  - Previously oversized (110dp).
  - Current `CompactHeader.tsx` is 52dp with role badge, language switcher, and logout button.

---

### 2.5 Fleet Status & Telemetry Consistency Audit
- **Connection vs Movement vs Shift Status**:
  - Shift Status: `OFF_DUTY`, `ACTIVE`, `COMPLETED`
  - Connection Status: `CONNECTED` (fresh within 60s), `STALE` (60s to 5min), `OFFLINE` (> 5min)
  - Movement Status: `MOVING` (speed > 5 km/h), `STOPPED` (speed <= 5 km/h or stationary), `UNKNOWN`
  - GPS Status: `ENABLED`, `DISABLED`, `UNKNOWN`
  - Network Status: `ONLINE`, `OFFLINE`, `UNKNOWN`
- **Current vs Last-Known Telemetry**:
  - `DriverDetailModal.tsx` and driver cards must explicitly label historical speed, heading, and battery as `آخر بيانات معروفة` when the driver is offline, showing elapsed time (e.g. `منذ 15 دقيقة`), rather than displaying historical values as current real-time speed.

---

### 2.6 Device Metadata & Device Security Audit
- **Device Management**:
  - Current schema stores `platform`, `deviceIdentifier`, `appVersion`.
  - `devicesTable` lacks dedicated human-readable `deviceModel` / `osVersion` columns.
  - React Native provides `Platform.constants.Model`, `Platform.constants.Brand`, and `Platform.constants.Release` out of the box.
  - Mobile client will capture and pass `deviceModel` (`Brand + Model`, e.g. "Samsung SM-S938B") and `osVersion` (e.g. "Android 16") in device registration/login headers so Admin cards display actual hardware names instead of raw UUID strings.
  - Security model remains intact: 1 authorized mobile device per driver, HTTP 403 on second device, admin reset revokes tokens and unauthorizes device.

---

### 2.7 Permanent User / Driver Deletion Audit
- **Current Deletion Implementation**:
  - `DELETE /api/users/:id` currently calls `deactivateUser(id)` which only sets `active = false`.
  - Web users page (`apps/web/app/dashboard/users/page.tsx`) only has a "Deactivate" button.
- **Database Foreign Keys**:
  - `users(id)` -> `drivers(userId)` CASCADE
  - `drivers(id)` -> `devices(driverId)` CASCADE
  - `drivers(id)` -> `shifts(driverId)` CASCADE
  - `drivers(id)` -> `location_points(driverId)` CASCADE
  - `drivers(id)` -> `alert_state(driverId)` CASCADE
  - `users(id)` -> `refresh_tokens(userId)` CASCADE
  - `notifications(driverId)` -> SET NULL
- **Blocker / Policy Decision**:
  - Hard cascade deletion deletes all historical telemetry points. Retaining telemetry requires anonymizing or keeping under a tombstone driver. This cannot be guessed per Part 1 & Part 17 and requires explicit user input.

---

### 2.8 Application Distribution (/download) & APK Management Audit
- **Public Download Page**:
  - `apps/web/app/download/page.tsx` does not yet exist.
- **APK Storage**:
  - Vercel serverless has an ephemeral filesystem. Permanent APK file storage requires a cloud storage bucket or direct persistent file hosting.
  - Current standalone APK is compiled via Gradle to `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
  - Storing releases and hosting direct download links requires defined storage infrastructure. This cannot be guessed per Part 1.

---

### 2.9 Developer Attribution & Footers Audit
- Current state:
  - Attribution strings defined in requirements:
    - Arabic: `تم التطوير بواسطة عماد عبد النور ❤️`
    - English: `Developed by Emad Abd Alnour ❤️`
  - Mobile Login: Needs subtle footer placement below the login form.
  - Web Layout / Dashboard: Needs consistent footer placement in `dashboard-shell.tsx` and web login.

---

## 3. Scope Categorization

### 3.1 Fully Implemented & Verified (Preserve)
1. 3-role RBAC (`ADMIN`, `CALL_CENTER`, `DRIVER`) with 0 `MANAGER` accounts.
2. Background location tracking with Android 16 foreground service and TaskManager.
3. Mobile auth token storage, refresh rotation, and 401 recovery.
4. Device binding & 403 `DEVICE_UNAUTHORIZED` protection on unauthorized devices.
5. Android Gradle release/debug builds compiling without Hermes or CMake issues.
6. Pure React Native / WebView Leaflet map architecture on mobile.
7. Western ASCII digits (`0-9`) utility across UI components.

### 3.2 What Needs Immediate Implementation (Independent Phases)
1. **Branding & Naming**: Canonical "Tracker" everywhere across mobile config, Android strings, Gradle, i18n, and web metadata.
2. **Typography & Styling**: Cairo Arabic font on Web, unified design tokens on Mobile.
3. **Emoji Elimination**: Purge remaining emoji glyphs from `MobileMapView.tsx` (or delete legacy file) and `AdminHomeScreen.tsx`.
4. **Developer Attribution**: Add localized developer attribution footer to mobile login and web dashboard shell.
5. **Device Metadata**: Send `deviceModel` and `osVersion` from mobile `Platform.constants` to display real hardware model names in driver details.
6. **Explicit Freshness**: Ensure offline driver telemetry in driver cards and modals is labeled under `آخر بيانات معروفة` with elapsed time.
7. **Public Download Page**: Create `/download` route in Next.js showcasing Tracker Android v1.0.0, release notes, and download CTA.
8. **Web Favicon & Vector Logo**: Create SVG logo and favicon assets in `apps/web/public`.

### 3.3 What Requires User Input (Blocked by Policy)
1. **Permanent Deletion Data Retention Policy**: Hard cascade delete vs Anonymize telemetry vs Retain under tombstone record.
2. **Persistent Storage for Releases / Branding**: Choice of cloud object storage provider for APK uploads and custom logo branding.
3. **Production Domain for Download**: Preferred domain/hostname for canonical download URLs.
4. **Update Awareness Policy**: Advisory banner vs Mandatory hard block when client version is below minimum.

---

