# API Reference Manual

> Authoritative Single Source of Truth for all HTTP API Endpoints.  
> Verified against production route mounts in `artifacts/api-server` and `apps/web` (`v1.2.0`).

---

## 1. Global API Standards

- **Base URL**: Configured via `API_URL` or `EXPO_PUBLIC_API_URL` (e.g. `https://tracker-alpha-puce.vercel.app`).
- **Data Format**: `application/json` with UTF-8 encoding.
- **Authentication**: HTTP Header `Authorization: Bearer <token>`.
- **Rate Limits**:
  - Auth Endpoints (`/api/auth/*`): 20 requests / 15 minutes per IP.
  - Telemetry Endpoints (`/api/drivers/*`): 120 requests / 1 minute per IP.
- **Standard Error Envelope**:
  ```json
  {
    "error": {
      "code": "ERROR_CODE_STRING",
      "message": "Human-readable explanation of error",
      "details": {}
    }
  }
  ```

---

## 2. Authentication & Session Endpoints (`/api/auth`)

### 2.1 User Login
- **Method / Path**: `POST /api/auth/login`
- **Auth**: Public
- **Request Body**:
  ```json
  {
    "emailOrPhone": "ahmed@tracker.com",
    "password": "SecurePassword123",
    "device": {
      "platform": "ANDROID",
      "deviceIdentifier": "android-hw-uuid-1",
      "appVersion": "1.2.0"
    }
  }
  ```
  *(Note: `device` object is mandatory for users with `DRIVER` role).*
- **Response** (`200 OK`):
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "id": "b2f69904-4e78-4392-a160-c3ecb2daea8d",
      "name": "Ahmed Hassan",
      "email": "ahmed@tracker.com",
      "phone": "+966501234567",
      "role": "DRIVER",
      "active": true
    }
  }
  ```
- **Errors**: `400 VALIDATION_ERROR`, `401 AUTH_INVALID_CREDENTIALS`, `403 AUTH_INACTIVE`, `403 AUTH_DEVICE_MISMATCH`.

### 2.2 Refresh Session
- **Method / Path**: `POST /api/auth/refresh`
- **Auth**: Public
- **Request Body**: `{ "refreshToken": "eyJhbGciOi..." }`
- **Response** (`200 OK`): `{ "accessToken": "...", "refreshToken": "...", "user": { ... } }`
- **Errors**: `401 AUTH_INVALID_TOKEN`, `403 AUTH_INACTIVE`.

### 2.3 Logout
- **Method / Path**: `POST /api/auth/logout`
- **Auth**: Bearer Access Token
- **Request Body**: `{ "refreshToken": "..." }` (Optional)
- **Response** (`200 OK`): `{ "success": true }`

### 2.4 Get Current User Profile
- **Method / Path**: `GET /api/auth/me`
- **Auth**: Bearer Access Token
- **Response** (`200 OK`): `{ "user": { ... } }`

---

## 3. Driver Shift & Telemetry Endpoints (`/api/drivers`)

### 3.1 Start Shift
- **Method / Path**: `POST /api/drivers/me/shifts/start`
- **Auth**: Bearer Access Token (`DRIVER` only)
- **Request Body**:
  ```json
  {
    "latitude": 24.7136,
    "longitude": 46.6753
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "shift": {
      "id": "f7d383b1-8b77-4b7b-9f93-5eb7843818e6",
      "driverId": "b2f69904-4e78-4392-a160-c3ecb2daea8d",
      "status": "ACTIVE",
      "startedAt": "2026-10-02T18:00:00.000Z"
    },
    "telemetryToken": "eyJhbGciOi...",
    "expiresIn": 86400
  }
  ```
- **Errors**: `400 GEOFENCE_LOCATION_REQUIRED`, `403 OUTSIDE_GEOFENCE`, `409 SHIFT_ALREADY_ACTIVE`.

### 3.2 End Shift (Driver Own End)
- **Method / Path**: `POST /api/drivers/me/shifts/end`
- **Auth**: Bearer Access Token (`DRIVER` only)
- **Response** (`200 OK`): `{ "shift": { "id": "...", "status": "COMPLETED", "endedAt": "..." } }`
- **Errors**: `404 NO_ACTIVE_SHIFT`.

### 3.3 Force End Shift (Admin Only)
- **Method / Path**: `POST /api/drivers/:id/shifts/force-end` (Alias: `POST /:id/shifts/end`)
- **Auth**: Bearer Access Token (`ADMIN` only)
- **Response** (`200 OK`): `{ "success": true, "shift": { ... } }`
- **Errors**: `404 DRIVER_NOT_FOUND`, `404 NO_ACTIVE_SHIFT`.

### 3.4 Upload Location Batch (Primary Ingestion)
- **Method / Path**: `POST /api/drivers/me/location/batch`
- **Auth**: Bearer Access Token OR Telemetry Token (`DRIVER` only)
- **Headers**: `x-device-id: <deviceId>` (Optional if using Telemetry Token)
- **Request Body**: Array of up to 20 location objects:
  ```json
  [
    {
      "clientLocationId": "1727900000-8842abcd",
      "shiftId": "f7d383b1-8b77-4b7b-9f93-5eb7843818e6",
      "latitude": 24.7138,
      "longitude": 46.6755,
      "accuracy": 8.5,
      "speed": 6.2,
      "heading": 180.0,
      "altitude": 612.0,
      "recordedAt": "2026-10-02T18:05:00.000Z",
      "batteryPercentage": 82,
      "isCharging": false,
      "locationServicesEnabled": true,
      "networkStatus": "cellular",
      "source": "mobile"
    }
  ]
  ```
- **Response** (`201 Created`):
  ```json
  {
    "accepted": 1,
    "duplicates": 0,
    "acceptedClientIds": ["1727900000-8842abcd"],
    "duplicateClientIds": []
  }
  ```
- **Errors**: `400 BATCH_TOO_LARGE` (if > 20), `400 INVALID_TIMESTAMP`, `403 DEVICE_UNAUTHORIZED`, `409 SHIFT_NOT_ACTIVE`, `409 SHIFT_MISMATCH`.

### 3.5 Submit Device Heartbeat
- **Method / Path**: `POST /api/drivers/me/heartbeat`
- **Auth**: Bearer Access Token OR Telemetry Token (`DRIVER` only)
- **Request Body**:
  ```json
  {
    "shiftId": "f7d383b1-8b77-4b7b-9f93-5eb7843818e6",
    "batteryPercentage": 82,
    "isCharging": false,
    "locationServicesEnabled": true,
    "networkStatus": "cellular"
  }
  ```
- **Response** (`200 OK`): `{ "ok": true, "serverTime": "2026-10-02T18:05:05.000Z" }`
- **Errors**: `403 DEVICE_UNAUTHORIZED`, `409 SHIFT_NOT_ACTIVE`.

### 3.6 Refresh Telemetry Token
- **Method / Path**: `POST /api/drivers/me/telemetry-token`
- **Auth**: Bearer Access Token (`DRIVER` only)
- **Response** (`200 OK`): `{ "telemetryToken": "...", "expiresIn": 86400, "shiftId": "..." }`

---

## 4. Fleet Management & Monitoring (`/api/fleet`)

### 4.1 Live Fleet Status
- **Method / Path**: `GET /api/fleet/live?activeOnly=false`
- **Auth**: Bearer Access Token (`ADMIN`, `CALL_CENTER`)
- **Response** (`200 OK`):
  ```json
  {
    "summary": {
      "totalDrivers": 10,
      "activeShifts": 4,
      "onlineDrivers": 4,
      "atRestaurant": 1,
      "moving": 2,
      "stopped": 1,
      "offline": 6,
      "lowBatteryCount": 0
    },
    "restaurant": {
      "name": "Main Branch",
      "latitude": 24.7136,
      "longitude": 46.6753,
      "radiusMeters": 150,
      "enabled": true
    },
    "drivers": [
      {
        "driverId": "b2f69904-4e78-4392-a160-c3ecb2daea8d",
        "driverName": "Ahmed Hassan",
        "employeeId": "DRV-101",
        "driverActive": true,
        "isOnline": true,
        "shift": { "id": "...", "status": "ACTIVE", "startedAt": "...", "durationMinutes": 45 },
        "location": { "latitude": 24.715, "longitude": 46.678, "speed": 12.5, "accuracy": 12.0, "recordedAt": "..." },
        "device": { "batteryPercentage": 82, "networkStatus": "cellular", "lastSeen": "..." },
        "operationalStatus": "MOVING",
        "isInsideGeofence": false,
        "distanceToRestaurantMeters": 350
      }
    ]
  }
  ```

---

## 5. Reporting & Analytics (`/api/reports`)

### 5.1 Operational Summary Report
- **Method / Path**: `GET /api/reports/summary?from=...&to=...&driverId=...`
- **Auth**: Bearer Access Token (`ADMIN`, `CALL_CENTER`)
- **Query Parameters**:
  - `from` (ISO 8601 string, required)
  - `to` (ISO 8601 string, required)
  - `driverId` (UUID string, optional filter)
- **Response** (`200 OK`):
  ```json
  {
    "summary": {
      "from": "2026-10-01T00:00:00Z",
      "to": "2026-10-02T23:59:59Z",
      "totalDrivers": 8,
      "totalShifts": 14,
      "totalDurationMinutes": 4320,
      "totalDistanceMeters": 184500,
      "movingDurationMinutes": 2150,
      "stoppedDurationMinutes": 1120,
      "restaurantDurationMinutes": 1050,
      "alertCount": 5
    },
    "drivers": [ ... ]
  }
  ```

---

## 6. Notifications & Alerts (`/api/notifications`)

- `GET /api/notifications?page=1&limit=20&unreadOnly=false`: Query notifications stream.
- `POST /api/notifications/:id/read`: Mark notification as read (user-scoped).
- `POST /api/notifications/read-all`: Mark all notifications as read for calling user.
- `POST /api/notifications/:id/resolve`: Acknowledge and resolve operational alert.

---

## 7. Audit Logs (`/api/audit-logs`)

- `GET /api/audit-logs?page=1&limit=20&action=...&entityType=...`: Admin-only audit query.

---

## 8. Release & Version Distribution (`/api/app-version`, `/download`)

- `GET /api/app-version`: Query latest release metadata from Vercel Blob (`version`, `versionCode`, `downloadUrl`, `sha256`, `sizeBytes`).
- `GET /api/download/latest`: Redirects (302) to newest production APK.
- `POST /api/ci/upload`: Secured CI webhook for GitHub Actions upload.
