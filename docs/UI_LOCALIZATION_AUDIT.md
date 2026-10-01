# TRACKER — UI LOCALIZATION AUDIT & BIDIRECTIONAL POLISH

**Audit Date:** October 2026  
**Scope:** Mobile (`apps/mobile/i18n.ts`) & Web (`apps/web/locales/`)  
**Guiding Principle:** Arabic-First, Operational Clarity, No Leaking Technical Exceptions

---

## 1. Directional Language Matrix

Tracker operates under strict app-level localization authority:

| Android System Language | App Language Setting | Visual Direction | Layout Mode |
| :--- | :--- | :--- | :--- |
| English (`en_US`) | Arabic (`ar`) | **RTL** | Right-to-Left cards, right-aligned text, right start |
| Arabic (`ar_EG` / `ar_SA`) | Arabic (`ar`) | **RTL** | Native Yoga RTL preserved (No double-inversion!) |
| English (`en_US`) | English (`en`) | **LTR** | Standard Left-to-Right |
| Arabic (`ar_EG` / `ar_SA`) | English (`en`) | **LTR** | Correctly inverted back to visual LTR |

---

## 2. Terminology Parity Across Mobile & Web

| Concept | Arabic (Mobile & Web) | English | Semantic Definition |
| :--- | :--- | :--- | :--- |
| **Shift Active** | على رأس العمل | ON DUTY | Driver is logged in and active shift is running |
| **Shift Inactive** | خارج الوردية | OFF DUTY | Driver is not currently on duty |
| **Awaiting Telemetry** | في الوردية — بانتظار بيانات الموقع | Awaiting Location | Shift started, but first GPS batch not yet ingested |
| **Employee ID** | الرقم الوظيفي | Employee ID | Driver operational corporate ID (`101`, `EMP002`) |
| **Device ID** | معرف الجهاز | Device ID | Hardware UUID/unique installation identifier |
| **Authorized Device** | معتمد | Authorized | Device is paired and authorized to stream telemetry |
| **Unauthorized Device** | غير معتمد | Unauthorized | Device unlinked or reset by administrator |
| **Last Connection** | آخر اتصال مسجل | Last Connection | Timestamp of most recent HTTP/heartbeat ping |
| **Last GPS Location** | آخر موقع مسجل | Last GPS Location | Timestamp of most recent valid GPS coordinate |
| **Current Speed** | السرعة الحالية | Current Speed | Fresh live speed from moving vehicle (< 2 min old) |
| **Last Recorded Speed** | آخر سرعة مسجلة | Last Recorded Speed | Historical speed from stale/previous telemetry point |
| **At Restaurant** | بالمطعم / داخل المطعم | At Restaurant | Within restaurant geofence radius |
| **Outside Geofence** | خارج نطاق المطعم | Outside Restaurant | Beyond restaurant geofence radius |
| **Degraded GPS** | دقة منخفضة (±Xم) | Degraded GPS (±Xm) | Accuracy radius > 35m or GPS signal jitter |

---

## 3. Mixed-Direction & Technical Content Rules

1. **Numbers**:
   - Western Arabic digits (`0-9`) are standard across Arabic and English interfaces.
   - Formatted using `formatWesternNumber()`, replacing Eastern numerals (`٠-٩`) with standard operational digits.
2. **Technical Identifiers**:
   - Device UUIDs (`xxxxxxxx-xxxx-4xxx-yxxx-...`): Displayed with `writingDirection: 'ltr'` and monospaced font family to prevent character jumping in RTL.
   - Model strings (e.g. `Android (Realme RMX3834 · OS 15)`): Rendered with clean LTR enclosure.
   - Version strings (`v1.1.8`, `Build 29`): Displayed LTR.
3. **Speed & Distance Units**:
   - Arabic: `42 كم/س`, `150 متر`, `±12م`
   - English: `42 km/h`, `150 m`, `±12m`
4. **Time Formats**:
   - Arabic: `منذ ثوانٍ`, `منذ 5 دقيقة`, `منذ 2 ساعة`, `منذ يوم`
   - English: `Just now`, `5m ago`, `2h ago`, `1d ago`

---

## 4. Exception Localization & Error Mapping

Raw database, schema, or HTTP errors are intercepted by `getLocalizedErrorMessage()`:
- `AUTH_FORBIDDEN` / `ACCESS_DENIED` -> "تم رفض الوصول. لا تملك الصلاحية لتنفيذ هذا الإجراء."
- `AUTH_DEVICE_MISMATCH` -> "هذا الحساب مرتبط بجهاز آخر. يجب على المشرف إعادة تعيين الجهاز أولاً."
- `DEVICE_UNAUTHORIZED` -> "هذا الجهاز غير مصرح أو تم إلغاء اعتماده من قِبل الإدارة. يرجى تسجيل الدخول مجدداً أو مراجعة المشرف."
- `OUTSIDE_GEOFENCE` -> "يجب أن يكون السائق داخل نطاق المطعم لبدء الوردية."
- `NETWORK_ERROR` -> "تعذر الاتصال بخادم النظام. يرجى التحقق من اتصال الإنترنت والمحاولة لاحقاً."
- Pure English exception text is prevented from leaking into Arabic UI.
