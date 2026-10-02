# TRACKER — MASTER UI/UX POLISH IMPLEMENTATION PLAN
## Arabic-First Production Polish — STRICT NO-REGRESSION MODE

---

## 1. Plan Overview & Golden Rules
1. **Preserve Architecture**: No new state managers, no new telemetry, no changes to backend/DB APIs or core business logic.
2. **Arabic-First RTL Guarantee**: Tracker UI direction depends SOLELY on app language (`ar` -> RTL, `en` -> LTR), regardless of Android system language.
3. **No Clipped Text**: Arabic labels (including "الرقم الوظيفي") and numbers must never be cut off or hidden.
4. **Visual QA on Emulator**: Every meaningful batch is verified visually on the Android emulator with screenshots stored in `docs/ui-qa/`.
5. **Continuous Automated Verification**: All existing tests (327 tests), typecheck, and builds must remain 100% passing.

---

## 2. Execution Phases

### Phase 4: Global RTL & Direction Foundation
- Audit `apps/mobile/i18n.ts`:
  - Verify `getRowDirection(forceRtl?: boolean)`:
    - Target RTL visual layout: `targetRtl !== nativeRtl ? 'row-reverse' : 'row'`
    - Target LTR visual layout: `targetRtl !== nativeRtl ? 'row-reverse' : 'row'`
  - Verify `getFlexAlignment()`.
  - Check `textAlign` across screens: explicit alignment based on `isRtl()`.
  - Audit navigation back/forward chevron directions (Arabic back arrow must point right `chevron-right` or inverted icon).
  - Search globally in `apps/mobile` for hardcoded `row` or `row-reverse` that bypasses `getRowDirection()`.

### Phase 5: Arabic Clipping & Layout Resilience
- Audit `apps/mobile`:
  - Locate all occurrences of `الرقم الوظيفي`, `employeeId`, badges, driver cards, KPI cards, and modals.
  - Eliminate brittle fixed `width` properties on containers holding Arabic strings.
  - Apply `flexShrink: 1` to titles and text containers, and `flexShrink: 0` to badges, counters, and icons.
  - Review Cairo typography line heights in `designSystem.ts` to prevent vertical glyph cutoffs.
  - Ensure horizontal scrolling or proper wrapping for dense technical lists.

### Phase 6: Localization & Mixed-Direction Rendering
- Create `docs/UI_LOCALIZATION_AUDIT.md`.
- Search for untranslated strings, hardcoded English/Arabic text in `apps/mobile` and `apps/web`.
- Format mixed strings:
  - Technical strings (Device ID, UUIDs, Models, OS versions, IP/URLs) must render in LTR cleanly without scrambling.
  - Digits: Use Western Arabic numerals (`0-9`) consistently across Arabic and English UI.
  - Units: Speed (`كم/س` vs `km/h`), Distance (`متر` vs `m`), Percentage (`%`), Time (`د` vs `m`).
- Verify error mapping in `getLocalizedErrorMessage()` so no raw DB/API errors leak.

### Phase 7: Shared Components Polish
- `AppHeader.tsx`:
  - Consistent padding, alignment of title, subtitle, sync pill, language toggle, and logout button.
- `BottomTabBar.tsx`:
  - Proper label padding, Cairo font weight, tab indicator, badge counter positioning.
- `CompactHeader.tsx`:
  - Correct back chevron direction for RTL/LTR.
- `TrackerDialog.tsx`:
  - Polish layout, backdrop blur/opacity, button order (Cancel/Confirm), text alignment.
- `TrackerUpdateModal.tsx`:
  - Polished release notes rendering, progress bar aesthetics, retry states.

### Phase 8: Dashboard Polish (Mobile & Web)
- Mobile Admin & Call Center Dashboard:
  - Real-time fleet KPI cards: Enhance hierarchy, calm contrast, clear status indicators.
  - Mini-map preview: Polished frame, status legend.
  - Active drivers list: High scannability, clear shift indicator.
- Web Dashboard:
  - Parity with mobile KPIs, clean card spacing, no layout shifts.

### Phase 9: Drivers & Driver Detail Polish
- Driver List (`AdminHomeScreen`, `CallCenterHomeScreen`):
  - Card layout: Driver name, `الرقم الوظيفي: [ID]`, battery pill, speed pill, status pill.
  - Telemetry freshness indicator (e.g. `منذ دقيقة` vs `قديم`).
- `DriverDetailModal.tsx`:
  - Explicit distinction between:
    - LAST CONNECTION vs LAST GPS LOCATION
    - CURRENT SPEED vs LAST RECORDED SPEED
    - OUTSIDE RESTAURANT vs NO LOCATION
    - DEGRADED GPS vs VALID GPS
  - Polished action buttons (Reset Device, Force End Shift) with safe confirmation modals.

### Phase 10: Map UI Polish
- Mobile `RealGeographicMapView.tsx`:
  - Filter pills styling and active state.
  - Restaurant marker & geofence boundary display.
  - Driver marker icons and status color rings.
  - Driver popup card layout: Name, speed, battery, last update.
- Web `/dashboard/map`: Parity in filters, popups, and geofence presentation.

### Phase 11: Alert Center Polish
- Mobile & Web Alerts UI:
  - Severity styling: Critical (red), Warning (amber), Info (blue).
  - Driver attribution, clear timestamp.
  - Action buttons: Mark as Read, Resolve.
  - Clean empty state when no alerts are pending.

### Phase 12: Devices, Users, Settings, Reports & Audit
- Devices:
  - Monospace formatting for UUIDs / device identifiers, clean status badges.
- Users:
  - Polished user cards / tables, role badges (`ADMIN`, `CALL_CENTER`, `DRIVER`), create/edit user form modal.
- Settings:
  - Clean numeric input fields with step helpers or clear units (meters, minutes, %).
- Reports & Audit:
  - Date preset tabs, summary cards, audit table layout.

### Phase 13: Dialogs, Errors, Empty & Degraded States
- Verify all error states (offline, GPS disabled, device unauthorized, network error).
- Empty states for zero drivers, zero alerts, zero audit logs.
- Polished loading indicators with localized messages.

### Phase 14: Web Parity Review
- Review terminology, status colors, and localization between mobile and web.
- Ensure consistent Arabic translations across both platforms.

### Phase 15: Android Emulator Visual QA Pass
- Launch Android emulator (`Medium_Phone_API_36.1`).
- Run the 4-quadrant test matrix:
  - Permutation A: Android English + Tracker Arabic
  - Permutation B: Android Arabic + Tracker Arabic
  - Permutation C: Android English + Tracker English
  - Permutation D: Android Arabic + Tracker English
- Capture high-resolution screenshots to `docs/ui-qa/`.

### Phase 16: Visual Fix Iterations
- Review screenshots, identify any subtle visual flaws, and fix them immediately.

### Phase 17: Full Automated Regression Verification
- Run complete test suite (API, Mobile, Web).
- Run full typecheck.
- Run Web production build.
- Run Android compile (`compileDebugKotlin`).

### Phase 18 - 20: Forensic Review, Documentation & Git Commit
- Final forensic review of all git diffs.
- Update `docs/UI_VISUAL_QA.md` and `docs/CHANGELOG.md`.
- Create ONE clean git commit on `main`.
