# Operations & Field Troubleshooting Guide

This guide provides actionable diagnosis and resolution steps for operators, field supervisors, and engineers managing the Tracker platform.

---

## 1. Authentication & Device Authorization Issues

### Driver Login Rejected: "Device not authorized"
- **Likely Cause**: The driver is logging in from a phone whose hardware UUID is not bound to their account, or another device is already authorized.
- **How to Verify**:
  1. Open Web Admin -> **Devices** ([`/dashboard/devices`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/web/app/dashboard/devices/page.tsx)).
  2. Search for driver name or device identifier.
  3. Check device status (`PENDING` or `REVOKED`), or check if another device is marked `AUTHORIZED` for this driver.
- **Resolution**:
  1. Click **"Authorize"** or **"Reset Device"** on the admin portal.
  2. Instruct driver to retry login. The device will be authorized and bound to the driver.

### Driver Cannot Login: Invalid Credentials
- **Likely Cause**: Typo in phone number/email or inactive user account (`status = INACTIVE`).
- **How to Verify**:
  1. Check database or admin users list:
     ```sql
     SELECT id, name, phone, role, status FROM users WHERE phone = '+966500000001';
     ```
- **Resolution**:
  1. If status is `INACTIVE`, activate account.
  2. If password forgotten, admin updates password hash or resets account.

---

## 2. Shift Lifecycle Issues

### Driver Cannot Start Shift: "Must be at restaurant"
- **Likely Cause**: Driver is outside the 150-meter restaurant geofence radius, or GPS accuracy is degraded (>35m).
- **How to Verify**:
  1. Have driver check current GPS distance displayed on mobile cockpit screen.
  2. Verify driver GPS accuracy in the app cockpit (must be `< 35m` for reliable geofence evaluation).
  3. Verify restaurant coordinates in settings:
     ```sql
     SELECT id, name, latitude, longitude, radius_meters FROM restaurants WHERE is_active = true;
     ```
- **Resolution**:
  1. Instruct driver to physically approach within 150m of the restaurant dispatch center.
  2. If phone is inside restaurant but GPS is poor (e.g. metal roof), have driver step outside briefly to acquire reliable satellite fix (<35m).
  3. If restaurant coordinates were misconfigured in settings, admin updates restaurant latitude/longitude in Web Admin Settings.

### Shift Stuck / Cannot End Shift
- **Likely Cause**: Mobile app crashed, phone battery died, or network connectivity is completely severed during shift.
- **How to Verify**:
  1. Open Web Admin -> **Drivers** ([`/dashboard/drivers`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/web/app/dashboard/drivers/page.tsx)).
  2. Inspect driver card. Status shows `ACTIVE` shift, but connection is `OFFLINE` and `lastSeen` > 10 minutes ago.
- **Resolution**:
  1. Admin opens Driver Detail or Live Fleet map.
  2. Click **"Force End Shift"** button.
  3. Confirm reason. API executes `/api/shifts/:id/force-end`, setting `status = ENDED`, `ended_at = NOW()`, resolving active alerts, and recording an entry in the Audit Log.

---

## 3. GPS & Telemetry Issues

### Driver Connection Online, But Location is Stale
- **Likely Cause**: Telemetry distinction between **Heartbeat** and **GPS Telemetry**:
  - Heartbeat (`/api/heartbeat`) sends every 60s over network even if stationary, keeping `lastSeen` fresh.
  - GPS uploader (`/api/telemetry/locations/batch`) only uploads if new GPS fixes occur and phone has GPS reception.
  - Alternatively, driver has disabled Location Services, or phone OS killed the Foreground Service.
- **How to Verify**:
  1. Check Web Admin driver detail: Compare **"Last Seen"** against **"Last Location"**.
  2. If `lastSeen` is within 60s but `lastLocationAt` is > 10m ago, phone has internet but is not emitting GPS.
  3. Check mobile notifications shade on driver's phone: Is the permanent notification **"تتبع السائق نشط"** visible?
- **Resolution**:
  1. Ensure driver has not turned off "Location" in Android Quick Settings.
  2. Verify app location permission is set to **"Allow all the time"** (Background location permission).
  3. Open app to foreground to wake FusedLocationProvider if OEM killed background service.

### Driver Marked OFFLINE Even While on Active Shift
- **Likely Cause**: Driver entered an area with zero cellular data, phone ran out of battery, or phone entered aggressive OEM Deep Sleep.
- **How to Verify**:
  1. System marks driver `OFFLINE` when `NOW() - lastSeen > 120 seconds`.
  2. Check if driver phone is reachable via cellular phone call.
- **Resolution**:
  1. When driver returns to cellular coverage, the native SQLite queue (up to 1,000 pending records) will automatically upload stored points in batches of 20 with exact chronological timestamps. No data is lost.

### GPS Accuracy Shows "Degraded" or Red Warning
- **Likely Cause**: Phone is indoors, near tall buildings (multipath interference), or cellular location fallback is active.
- **How to Verify**:
  1. Mobile cockpit displays accuracy badge (e.g., `±45m` or `±80m`).
  2. Values between `35m` and `150m` are marked degraded.
  3. Values `> 150m` are rejected by the native telemetry filter to prevent map teleportation.
- **Resolution**:
  1. Mount phone on vehicle dashboard windshield mount with clear sky view.
  2. Avoid metal gloveboxes or pockets while driving.

---

## 4. Notifications & Alerts Issues

### Driver Extended Stop Alert Won't Clear
- **Likely Cause**: Alert triggers when driver remains stationary outside the restaurant for longer than threshold (default 10 minutes).
- **How to Verify**:
  1. Driver status shows `STOPPED` and position is outside the 150m restaurant geofence.
- **Resolution**:
  1. Alert auto-resolves automatically once driver resumes vehicle movement (`MOVING` state confirmed by 2 consecutive speed readings $> 1.5$ m/s).
  2. Alert also auto-resolves if driver returns to restaurant geofence (`AT_RESTAURANT`) or if shift ends.
  3. Operator can manually dismiss/resolve the notification in Web Admin Notifications drawer.

### Notifications Not Appearing on Mobile Admin
- **Likely Cause**: Notifications polling interval (default 30s) or filter state set to "Unread" while all notifications have been read.
- **How to Verify**:
  1. Pull to refresh on Mobile Admin Notifications screen.
  2. Check filter chips: Switch from "Unread" to "All".
- **Resolution**:
  1. Notifications are unified: Check that the backend notification worker is active and writing to the `notifications` table.

---

## 5. Android Native & Hardware Issues

### Notification Shade Bar Dismissed / Service Stops
- **Likely Cause**: Some heavily skinned Android OEMs (Xiaomi MIUI, Huawei EMUI, Samsung OneUI) apply non-standard battery optimization policies.
- **How to Verify**:
  1. Check if Tracker foreground service notification was cleared by OS.
- **Resolution**:
  1. In Android System Settings -> Apps -> Tracker:
     - **Battery**: Set to **"Unrestricted"** (Do not optimize).
     - **Autostart**: Enable (for Xiaomi/MIUI devices).
     - **Location Permission**: Set to **"Allow all the time"** with "Use precise location" toggled ON.

### App Update Fails: "App not installed" / Package Incompatible
- **Likely Cause**: `INSTALL_FAILED_UPDATE_INCOMPATIBLE` - the APK being installed was signed with a debug keystore or a different keystore than the version currently installed on the device.
- **How to Verify**:
  1. Check release cert fingerprint using `apksigner`:
     ```bash
     apksigner verify --print-certs app-release.apk
     ```
  2. Compare against production fingerprint `fa9d044e9c16e33b9d2e17243bd06def803407d85c79d87b739e24ec0db291d3`.
- **Resolution**:
  1. If upgrading from a developer/debug build, uninstall the debug app first before installing production signed APK.
  2. Only install APKs downloaded from the official `/download` portal.

---

## 6. Web & Deployment Issues

### Browser Shows Stale Version / Download Button Downloads Old APK
- **Likely Cause**: Cloudflare, browser cache, or Service Worker caching the previous `latest.json` or `/download` page.
- **How to Verify**:
  1. Hard refresh browser: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac).
  2. Verify API directly:
     ```bash
     curl -s https://tracker-web-psi.vercel.app/api/app-version
     ```
  3. Verify `versionCode` in response matches `version.json` (35).
- **Resolution**:
  1. `/api/app-version` and `/api/download` have `Cache-Control: no-cache, no-store, must-revalidate` headers configured.
  2. In case of aggressive CDN caching, purge Vercel edge deployment cache or re-deploy.

### Map Tiles Not Loading
- **Likely Cause**: Internet connectivity blocked or OpenStreetMap CDN rate-limited.
- **How to Verify**:
  1. Open browser developer console (F12) -> Network tab.
  2. Check if tile requests to `tile.openstreetmap.org` return 403 or net::ERR_CONNECTION_TIMED_OUT.
- **Resolution**:
  1. Check workstation proxy/firewall settings.
  2. Tiles load directly from standard OpenStreetMap servers without private API keys.
