# Emulator Baseline Specification: Medium_Phone_API_36.1

**Audit Date:** October 1, 2026  
**Auditor:** Antigravity Forensic Engine  
**Device Identifier:** `emulator-5554`  
**Classification:** Reference Testing Baseline (Virtual Android Device)

---

## 1. Hardware & System Configuration

| Parameter | Value | Verification Source |
| :--- | :--- | :--- |
| **Device Model** | `sdk_gphone64_x86_64` (Medium Phone API 36.1) | `getprop ro.product.model` |
| **Android Version** | Android 16 | `getprop ro.build.version.release` |
| **API Level** | API 36 (SDK 36) | `getprop ro.build.version.sdk` |
| **Build ID** | `SE1A.240808.001` | `getprop ro.build.id` |
| **Physical Display Resolution** | `1080 x 2400` pixels | `wm size` |
| **Display Density** | `420` dpi (multiplier: `2.625x`) | `wm density` |
| **Viewport Dimensions (dp)** | `411.4 x 914.3` dp | Calculated (`1080 / 2.625`, `2400 / 2.625`) |
| **System Font Scale** | **`1.0`** (100% standard unscaled) | `settings get system font_scale` |
| **Display Size Setting** | Standard (unmodified) | `wm density` override absent |
| **System Language / Region** | `en-US` (English / United States) | `getprop persist.sys.locale` |
| **System RTL State** | Inactive (`LayoutDirection = LTR`) | AOSP Framework default |
| **Default System Font Family** | `Roboto` (Latin), `Noto Sans Arabic` (Arabic) | `/system/etc/fonts.xml` |

---

## 2. Application Runtime & Artifact Identity

| Parameter | Value | Verification Source |
| :--- | :--- | :--- |
| **Package Name** | `com.tracker.driver` | `pm list packages` |
| **Application Version (`versionName`)** | `1.1.8` | `dumpsys package com.tracker.driver` |
| **Version Code (`versionCode`)** | `29` | `dumpsys package com.tracker.driver` |
| **APK File Path on Device** | `/data/app/~~3GU4Ch79NQrC5wPeutRwGg==/com.tracker.driver-cxeDCeP_2nGpewPGszaCHg==/base.apk` | `pm path com.tracker.driver` |
| **APK SHA-256 Checksum** | `0d3fd8638ae62fe6c9652b85a3571e73fd3509e77e17024d08caab85c64ddf19` | Local filesystem / PowerShell SHA-256 |
| **DEX Embedded Git Commit SHA** | `012900ba465f0aba1e83ca98a615d6aa32e6e790` | Binary pattern scan on `classes.dex` |
| **Active App Language** | `ar` (Arabic) | In-app user preference state |
| **Active App Locale** | `ar` | `i18n.locale` runtime state |
| **`I18nManager.isRTL`** | `false` | Android Native React Native Bridge |
| **React Native Direction Abstraction**| Synthetic Flex Direction Flip (`rowDir: 'row-reverse'`) | Directional abstraction `getRowDirection()` |
| **Native Android Layout Direction** | `LTR` (System default) | ViewRootImpl `layoutDirection=0` |

---

## 3. UI Observation & Visual Artifacts

- **Arabic Text Rendering:** Fully legible. The system font `Noto Sans Arabic` has compact glyph advances and slender metrics. At `font_scale = 1.0`, compound labels such as `حالة الوردية:`, `مستوى البطارية:`, and `معرف الجهاز المعتمد:` render horizontally within their parent containers without wrapping onto a second line.
- **Card Badge Behavior:** `غير متصل` renders without premature truncation in the driver cards because the glyph widths stay within the unconstrained boundaries of the column layout.
- **Layout Direction:** Correct visual RTL achieved via React Native flex direction reversals (`rowDir = 'row-reverse'`).
- **Screenshots:**
  - Dashboard: `docs/device-parity/screenshots/emulator_en-system_ar-app_dashboard.png`
  - Drivers Directory: `docs/device-parity/screenshots/emulator_en-system_ar-app_drivers.png`
  - Driver Detail Modal: `docs/device-parity/screenshots/emulator_en-system_ar-app_driver_modal.png`
  - Unclipped Baseline Crop: `docs/device-parity/screenshots/emulator_unclipped_baseline_crop.png`
