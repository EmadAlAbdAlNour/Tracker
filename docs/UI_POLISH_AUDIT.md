# TRACKER — UI/UX POLISH AUDIT & INVENTORY

**Audit Date:** October 2026  
**Scope:** `apps/mobile` (React Native/Expo) & `apps/web` (Next.js)  
**Mode:** STRICT NO-REGRESSION — Arabic-First Production Polish

---

## 1. Mobile UI Inventory (`apps/mobile`)

### 1.1 Screens & Routes
| Screen / Route | File | Key Elements & Sub-views |
| :--- | :--- | :--- |
| **Login** | `apps/mobile/App.tsx` (`LoginScreen`) | Logo, Title, Subtitle, Language Switcher, Email/Phone input, Password input + show/hide toggle, Sign In button, Developer attribution footer, Connection timeout / error dialogs, Checking session loader. |
| **Admin Home** | `apps/mobile/screens/AdminHomeScreen.tsx` | AppHeader (Role badge, Sync, Language, Logout), BottomTabBar (4 tabs). |
| ↳ *Dashboard Tab* | `AdminHomeScreen.tsx` | Real-time Fleet KPIs (Total, Active, Moving, Stopped, At Restaurant, Offline, Low Battery), Live mini-map preview with driver dots, Alert summary pill, Active drivers list cards. |
| ↳ *Map Tab* | `AdminHomeScreen.tsx` | Filter pill bar (`ALL`, `MOVING`, `STOPPED`, `AT_RESTAURANT`, `OFFLINE`), `RealGeographicMapView`, Restaurant pin & geofence circle, Driver markers, Selected driver popup card, Map controls (Zoom, Center restaurant). |
| ↳ *Drivers Tab* | `AdminHomeScreen.tsx` | Driver search input, Driver card list (Name, Employee ID `الرقم الوظيفي`, Shift state, Connection state, Speed, Battery %, GPS signal age, Distance to restaurant), Pull-to-refresh. |
| ↳ *More Menu* | `AdminHomeScreen.tsx` | Grid navigation to: Devices, Users, Settings, Alerts/Notifications, Reports, Audit Logs. |
| ↳ *Devices Section* | `AdminHomeScreen.tsx` | Device cards (Driver name, Model, Platform, App Version, Device ID / UUID, Authorization badge, Reset Device action button). |
| ↳ *Users Section* | `AdminHomeScreen.tsx` | User list (Name, Email/Phone, Role pill, Status pill, Edit/Deactivate action buttons), Add User FAB / header button, User Edit Modal. |
| ↳ *Settings Section* | `AdminHomeScreen.tsx` | Restaurant name, Geofence radius (meters), Latitude, Longitude, Alert thresholds (Max stop duration, Offline grace, Low battery %), Save button. |
| ↳ *Notifications / Alerts* | `AdminHomeScreen.tsx` | Alert cards (Driver name, Severity badge, Alert type, Timestamp, Mark as Read button, Mark all as read). |
| ↳ *Reports Section* | `AdminHomeScreen.tsx` | Date range selector (Today, Yesterday, 7 Days, 30 Days), Shift summary metrics, Total distance, Active hours, Driver breakdown. |
| ↳ *Audit Section* | `AdminHomeScreen.tsx` | Audit log list (Actor, Action type, Target entity, Timestamp, Details payload). |
| **Call Center Home** | `apps/mobile/screens/CallCenterHomeScreen.tsx` | Read-only operations console with 4 tabs: Dashboard, Map, Drivers, Notifications. Strict read-only enforcement (no device reset, no user edit, no settings change). |
| **Driver Home** | `apps/mobile/screens/DriverHomeScreen.tsx` | 4 tabs: Cockpit, Shift, Diagnostics, Profile. |
| ↳ *Cockpit Tab* | `DriverHomeScreen.tsx` | Operational state banner (Off Duty, Shift Active, Tracking Active, GPS Disabled, Offline), 5-question status cards, Big Start/End Shift action button. |
| ↳ *Shift Tab* | `DriverHomeScreen.tsx` | Active shift timer, Restaurant geofence proximity check, Shift start/end confirmation, Background location requirement notice. |
| ↳ *Diagnostics Tab* | `DriverHomeScreen.tsx` | Tracking status (Active/Inactive), Queued locations count, Manual sync button, Battery % & charging state, Network type, GPS accuracy. |
| ↳ *Profile Tab* | `DriverHomeScreen.tsx` | Driver name, Employee ID, Phone, Device ID, App version, Language switcher (العربية / English), Logout button. |

### 1.2 Modals, Sheets & Overlays
| Component | File | Description |
| :--- | :--- | :--- |
| **DriverDetailModal** | `apps/mobile/components/DriverDetailModal.tsx` | Bottom sheet / full modal for Driver Profile: Operational status, Current Speed vs Last Speed, Last GPS Location vs Last Connection, Battery %, GPS signal age, Geofence status, Shift timer, Device details, Reset Device action, Force End Shift action. |
| **TrackerDialog** | `apps/mobile/components/TrackerDialog.tsx` | Reusable modal dialog for alerts, errors, confirmations, and warnings. Supports Title, Message, Primary/Secondary buttons, Alert icon. |
| **TrackerUpdateModal** | `apps/mobile/components/TrackerUpdateModal.tsx` | Soft update modal showing Current version, New version, Release notes, Download progress bar, Retry button. |
| **User Edit Modal** | `AdminHomeScreen.tsx` | Form modal for creating or editing users (Name, Email, Phone, Password, Role, Active). |
| **Confirmation Modals** | `AdminHomeScreen.tsx`, `CallCenterHomeScreen.tsx`, `DriverHomeScreen.tsx` | Reset device confirmation, Force end shift confirmation, Logout confirmation. |

### 1.3 Shared UI Components
| Component | File | Responsibilities |
| :--- | :--- | :--- |
| **AppHeader** | `apps/mobile/components/AppHeader.tsx` | Header with Logo, Screen Title, Role badge, Language switch, Sync status, Logout button. |
| **BottomTabBar** | `apps/mobile/components/BottomTabBar.tsx` | 4 bottom tabs with active color, label, icon, badge counter. |
| **CompactHeader** | `apps/mobile/components/CompactHeader.tsx` | Sub-screen back header with Title, Back arrow. |
| **AppIcon** | `apps/mobile/components/AppIcon.tsx` | Feather-inspired vector icon set matching Tracker brand. |
| **RealGeographicMapView**| `apps/mobile/components/RealGeographicMapView.tsx` | WebView / Leaflet based native interactive map. |
| **TrackerLogo** | `apps/mobile/components/TrackerLogo.tsx` | Vector SVG app icon and brand emblem. |

---

## 2. Web UI Inventory (`apps/web`)

### 2.1 Pages & Routes
| Page / Route | File | Key UI Elements |
| :--- | :--- | :--- |
| `/login` | `apps/web/app/login/page.tsx` | Branding, Email/Phone input, Password input, Sign In button, Language toggle, Error messages. |
| `/dashboard` | `apps/web/app/dashboard/page.tsx` | Fleet summary KPI cards, Active drivers preview table, Live mini-map preview, Connection status counters. |
| `/dashboard/drivers` | `apps/web/app/dashboard/drivers/page.tsx` | Driver search bar, Status filter tabs, Data table (Driver name, Employee ID, Status, Shift, Speed, Battery, Last Seen, Actions). |
| `/dashboard/drivers/[id]` | `apps/web/app/dashboard/drivers/[id]/page.tsx` | Driver deep profile: Live status, Current speed, GPS freshness vs Connection freshness, Device metadata, Location history table/map, Shift history, Admin actions (Force End Shift, Reset Device). |
| `/dashboard/map` | `apps/web/app/dashboard/map/page.tsx` | Fullscreen Leaflet map, Status filter pills, Driver markers with status color rings, Restaurant marker + geofence circle, Driver telemetry drawer / popup. |
| `/dashboard/alerts` | `apps/web/app/dashboard/alerts/page.tsx` | Alert Center: Filter by severity (Critical, Warning, Info) and state (Active, Resolved), Driver links, Mark as read / resolve buttons. |
| `/dashboard/reports` | `apps/web/app/dashboard/reports/page.tsx` | Operational reports: Date range picker (Presets + custom), Fleet summary metrics, Driver performance table, CSV export. |
| `/dashboard/audit` | `apps/web/app/dashboard/audit/page.tsx` | Audit trail: Actor search, Action filter, Target entity, Timestamp, Expanded metadata viewer. |
| `/dashboard/devices` | `apps/web/app/dashboard/devices/page.tsx` | Authorized devices table: Driver name, Device ID, Model, OS, App version, Authorization status pill, Reset device action modal. |
| `/dashboard/users` | `apps/web/app/dashboard/users/page.tsx` | User management table: Name, Email, Phone, Role badge (Admin, Call Center, Driver), Status (Active/Inactive), Create user modal, Edit user modal. |
| `/dashboard/settings` | `apps/web/app/dashboard/settings/page.tsx` | Restaurant name, Geofence radius, Coordinates (Lat/Lng), Stop threshold, Offline grace period, Battery threshold, Save button. |
| `/download` | `apps/web/app/download/page.tsx` | Public APK download page: Version tag, Release date, Release notes, Download APK button, QR code. |

### 2.2 Reusable Web Components
| Component | File | Responsibilities |
| :--- | :--- | :--- |
| `DashboardShell` | `apps/web/components/dashboard-shell.tsx` | Layout container with responsive sidebar, top navbar, breadcrumbs, language switch (عربي / EN), current user role pill, logout. |
| `AuthProvider` | `apps/web/components/auth-provider.tsx` | Authentication session context and token refresh management. |

---

## 3. UI Defect & Polish Categories

1. **RTL Directional Inversion Foundation**:
   - Verify `getRowDirection()` and layout containers across all 4 Android/Tracker language permutations:
     - Android EN + App AR -> RTL
     - Android AR + App AR -> RTL (No double-inversion!)
     - Android EN + App EN -> LTR
     - Android AR + App EN -> LTR
   - Ensure chevron icons, back buttons, and horizontal card rows orient logically.

2. **Arabic Text Clipping & Layout Hardening**:
   - `الرقم الوظيفي` and employee IDs must never clip or wrap into illegible fragments.
   - Status badges and metadata pills must use `flexShrink: 0` while adjacent text has `flexShrink: 1` and `flex: 1`.
   - Prevent fixed-width containers that choke Arabic text.
   - Line-heights for Cairo typography must be verified to prevent clipping diacritics and glyph descenders.

3. **Mixed Direction Content**:
   - Ensure numbers, UUIDs, model identifiers (e.g. `Realme RMX3834 · OS 15`), speeds (`42 كم/س`), percentages (`93%`), and versions (`v1.1.8`) maintain correct visual ordering in RTL.
   - Avoid unintentional reversing of technical IDs.

4. **Information Hierarchy & Visual Polish**:
   - Dashboard: Crisp KPI card hierarchy, clear operational states.
   - Driver List: Clean distinction between connection status and shift status.
   - Driver Detail: High contrast, explicit separation of "Last Connection" vs "Last GPS Location", "Current Speed" vs "Last Recorded Speed".
   - Devices: Monospaced/clean formatting of Device IDs without breaking card boundaries.
   - Alerts: High clarity severity pills and actionable resolution buttons.
   - Dialogs: Professional padding, centered/aligned text, clear destructive vs safe button order.
