# Known Issues & Audit Findings

This document records technical discrepancies, test warnings, and minor non-blocking items identified during the forensic repository audit of Tracker v1.2.0.

> [!NOTE]
> **No confirmed unresolved P0/P1 issues were found during the documentation audit.** All 38 test suites (352 tests) pass 100%, all TypeScript checks pass cleanly across all workspaces, the Web production bundle builds cleanly, and the Android release APK compiles and verifies successfully.

---

## Audit Finding Register

### ISSUE-AUDIT-001: Static Version Fallback in Web Version Route
- **ID**: `ISSUE-AUDIT-001`
- **Severity**: P3 (Low)
- **Area**: Web API / Version Discovery
- **Location**: [`apps/web/app/api/app-version/route.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/web/app/api/app-version/route.ts#L70-L88)
- **Description**: The `/api/app-version` route includes a hardcoded fallback version string (`'1.1.5'`) and a fallback SHA-256 hash if dynamic fetching from Vercel Blob fails or regex parsing on the filename fails.
- **Evidence**:
  ```typescript
  // apps/web/app/api/app-version/route.ts
  const version = match ? match[1] : '1.1.5';
  const sha256 = 'fa30a08fc112674e1d13f9f4a5690b2131b79f8e4e7e60b138676d655b3cf17c';
  ```
- **Impact**: Zero impact under standard production operation, because Vercel Blob hosts `releases/android/latest.json` which is read first and provides authoritative metadata. If Vercel Blob is unreachable, the API returns v1.1.5 instead of v1.2.0.
- **Workaround**: Ensure `releases/android/latest.json` remains published on Vercel Blob.
- **Recommended Action**: Import `version.json` directly from the monorepo root or inject the version via build-time environment variables in `route.ts`.

---

### ISSUE-AUDIT-002: Mock Database Alert State Query Warning in Unit Tests
- **ID**: `ISSUE-AUDIT-002`
- **Severity**: P3 (Low / Test Only)
- **Area**: Automated Test Suite
- **Location**: [`apps/web/app/api/notifications/notifications.scoped.test.ts`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/apps/web/app/api/notifications/notifications.scoped.test.ts)
- **Description**: During `pnpm test`, the scoped notifications test suite outputs a console warning: `[mockDb] unhandled alertStateTable query`.
- **Evidence**: The unit test stubs the database, but does not provide an explicit chained stub for the legacy `alertStateTable` helper, resulting in a handled fallback warning in the test log.
- **Impact**: Zero production impact. All tests in the suite pass successfully.
- **Workaround**: None required; tests succeed.
- **Recommended Action**: Add an explicit mock stub for `alertStateTable` queries in the test file to eliminate console noise during test runs.

---

### ISSUE-AUDIT-003: CI Workflow Node Runner Version
- **ID**: `ISSUE-AUDIT-003`
- **Severity**: P3 (Low / Maintenance)
- **Area**: CI/CD Automation
- **Location**: [`.github/workflows/android-release.yml`](file:///c:/Users/Emad/Desktop/Tracker/Tracker/.github/workflows/android-release.yml#L28)
- **Description**: The GitHub Actions Android release workflow configures `node-version: 18`.
- **Evidence**:
  ```yaml
  - name: Setup Node.js
    uses: actions/setup-node@v4
    with:
      node-version: 18
  ```
- **Impact**: Builds currently run and pass. However, Node 18 reaches end-of-life upstream.
- **Workaround**: None needed currently.
- **Recommended Action**: Upgrade CI runner to Node 20 LTS in `android-release.yml`.
