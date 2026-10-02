# Local Development Guide

> Practical Single Source of Truth for Developer Onboarding, Toolchains, and Local Workflows.  
> Verified against production scripts, package manifests, and monorepo configs (`v1.2.0`).

---

## 1. System Requirements & Toolchain

Ensure your development machine satisfies these verified versions before building:

| Requirement | Supported Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v18.x` or `v20.x` LTS | `node -v` | Active LTS recommended. |
| **pnpm** | `v11.22.0` | `pnpm -v` | Specified in root `package.json`. |
| **Java JDK** | `JDK 17` (Zulu or Temurin) | `java -version` | Gradle 8.13 and Android Gradle Plugin 8.x require Java 17. |
| **Android SDK** | API Level `35` | `sdkmanager --list` | Android SDK Platform 35, Build-Tools 35.0.0, NDK 27.1. |
| **Operating System**| Windows 11 / macOS / Linux | | Windows users should use PowerShell 7+ or Git Bash. |

---

## 2. Initial Setup & Dependencies

```bash
# 1. Clone repository
git clone https://github.com/EmadAlAbdAlNour/Tracker.git
cd Tracker/Tracker

# 2. Install workspace dependencies
pnpm install
```

> [!NOTE]  
> The install step automatically triggers:
> - `preinstall-check.js` (validates pnpm supply-chain defenses).
> - `patch-expo-modules-core.cjs` (patches React Native 0.79 build compatibility).

---

## 3. Environment Configuration

Copy the template environment file:

```bash
cp .env.example .env
```

Configure local development values in `.env` (never commit this file):

```ini
# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tracker_dev

# JWT Cryptographic Secrets (generate random strings for local use)
JWT_SECRET=local-dev-jwt-secret-replace-in-production
JWT_REFRESH_SECRET=local-dev-refresh-secret-replace-in-production

# Local API URL
API_URL=http://localhost:3000
PORT=3000

# Allowed CORS Browser Origins
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Mobile App Target URL:
# For Android Emulator: use 10.0.2.2 (routes to host machine localhost)
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
# For Physical Android Phone over Wi-Fi: use host LAN IP
# EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
```

---

## 4. Running the Development Stack

### 4.1 Run Backend API Server
```bash
pnpm --filter @workspace/api-server dev
```
- Listens on `http://localhost:3000`.
- Health check available at `http://localhost:3000/healthz`.

### 4.2 Run Web Administrative Dashboard
```bash
pnpm --filter @workspace/admin-web dev
```
- Available at `http://localhost:3000` (or `http://localhost:3001` if port 3000 is occupied).

### 4.3 Run Mobile Application (Expo / Android)
```bash
pnpm --filter tracker-mobile start
```
- Press `a` in the terminal to launch on connected Android emulator or device.

---

## 5. Building Android Releases Locally

To compile a signed or unsigned release APK on your local workstation:

```powershell
# Navigate to Android native root
cd apps/mobile/android

# Windows PowerShell:
.\gradlew.bat assembleRelease

# macOS / Linux:
./gradlew assembleRelease
```

The compiled release artifact will be generated at:
```text
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

To verify the APK's embedded package name and version code:
```bash
node artifacts/api-server/scripts/verify-apk.mjs
```

---

## 6. Monorepo Quality Commands

```bash
# Run all unit, integration, and regression tests (352 passing tests)
pnpm test

# Run strict TypeScript compiler verification across all packages
pnpm run typecheck

# Build Web Admin production bundle
pnpm --filter @workspace/admin-web build
```
