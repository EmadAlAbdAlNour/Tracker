# S25 Ultra Baseline Specification: Samsung Galaxy S25 Ultra (SM-S938B)

**Audit Date:** October 1, 2026  
**Auditor:** Antigravity Forensic Engine  
**Device Identifier:** `R5CY731FGHA`  
**Classification:** Target Physical Hardware (Production Deployment)

---

## 1. Hardware & System Configuration

| Parameter | Value | Verification Source |
| :--- | :--- | :--- |
| **Device Model** | `SM-S938B` (Samsung Galaxy S25 Ultra) | `getprop ro.product.model` |
| **Hardware Platform** | `qcom` (Snapdragon 8 Elite) | `getprop ro.hardware` |
| **Android Version** | Android 16 | `getprop ro.build.version.release` |
| **API Level** | API 36 (SDK 36) | `getprop ro.build.version.sdk` |
| **One UI Version** | **One UI 8.5** (`ro.build.version.oneui=80500`) | `getprop ro.build.version.oneui` |
| **Build ID** | `BP2A.250605.031.A1` | `getprop ro.build.id` |
| **Physical Display Resolution** | `1440 x 3120` pixels (Quad HD+) | `wm size` |
| **Display Density** | Physical: `600` dpi; Override: `560` dpi (`3.5x`) | `wm density` (`Override density: 560`) |
| **Viewport Dimensions (dp)** | `411.4 x 891.4` dp | Calculated (`1440 / 3.5`, `3120 / 3.5`) |
| **System Font Scale** | **`1.08`** (User enlarged by 8%) | `settings get system font_scale` |
| **System Language / Region** | `en-US` (Primary), `ar-EG` (Secondary) | `getprop persist.sys.locale` |
| **System RTL State** | Inactive (`LayoutDirection = LTR`) | One UI Framework default |
| **Default System Font Family** | `Samsung Sans`, `Samsung Sans Arabic` | Samsung OEM Font Engine (`/system/fonts/`) |

---

## 2. Application Runtime & Artifact Identity

| Parameter | Value | Verification Source |
| :--- | :--- | :--- |
| **Package Name** | `com.tracker.driver` | `pm list packages` |
| **Application Version (`versionName`)** | **`1.1.9`** | `dumpsys package com.tracker.driver` |
| **Version Code (`versionCode`)** | **`33`** | `dumpsys package com.tracker.driver` |
| **APK File Path on Device** | `/data/app/~~gDd9yTU26_Hvf_Os_nHcwg==/com.tracker.driver-peMAjSWYvImhCq1LJCty2w==/base.apk` | `pm path com.tracker.driver` |
| **APK SHA-256 Checksum** | `6fb4a6714e4591843c58fc53d7047793da623979fd48533a82d22a4fb9c4fbe9` | SHA-256 hash of pulled APK |
| **DEX Embedded Git Commit SHA** | `bd7ffb48b577c9c3075042315e3e79186d7b06b7` | Binary pattern scan on `classes.dex` |
| **Active App Language** | `ar` (Arabic) | In-app user preference state |
| **Active App Locale** | `ar` | `i18n.locale` runtime state |
| **`I18nManager.isRTL`** | `false` | Android Native React Native Bridge |
| **React Native Direction Abstraction**| Synthetic Flex Direction Flip (`rowDir: 'row-reverse'`) | Directional abstraction `getRowDirection()` |
| **Native Android Layout Direction** | `LTR` (System default) | ViewRootImpl `layoutDirection=0` |

---

## 3. UI Observation & Visual Defects

- **Severe Arabic Text Clipping in Modals:** Compound Arabic labels in `DriverDetailModal` (e.g., `حالة الوردية:`, `مستوى البطارية:`, `معرف الجهاز المعتمد:`) wrap prematurely to a second line due to Samsung Sans glyph width expansion combined with the `1.08` font scale. Because the row height is constrained to a single line height (`~22.3 dp` / `78 px`), **Line 2 is vertically pushed outside the clipping bounds**, causing the second word (`الوردية:`, `البطارية:`, `المعتمد:`) to disappear completely.
- **BiDi Scrambling in Status Badges & Metrics:** Metric labels containing mixed ASCII and Arabic strings (e.g. `93% (قديم 14 س)`) lack explicit `writingDirection: 'rtl'`, resulting in Android's BiDi engine positioning numbers and parentheses backwards as `14 93% (قديم`.
- **Card Truncation in Directory:** In `AdminHomeScreen`, `alignItems: 'flex-end'` collapses the flex child container width, causing status badges (`غير متصل`) to truncate prematurely (`غير مت...`).
- **Screenshots:**
  - Dashboard: `docs/device-parity/screenshots/s25_en-system_ar-app_dashboard.png`
  - Drivers Directory: `docs/device-parity/screenshots/s25_en-system_ar-app_drivers.png`
  - Driver Detail Modal: `docs/device-parity/screenshots/s25_en-system_ar-app_driver_modal.png`
  - Clipping Evidence Crop: `docs/device-parity/screenshots/s25_clipping_evidence_crop.png`
  - Value Alignment Crop: `docs/device-parity/screenshots/s25_driver_modal_values_crop.png`
