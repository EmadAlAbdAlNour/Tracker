# Tracker — Production Legacy Role Remediation Report

## 1. Executive Summary

During the final production runtime audit, the endpoint `GET /api/users` against `https://tracker-alpha-puce.vercel.app` failed with:
```json
401 {
  "error": {
    "code": "AUTH_INVALID_ROLE",
    "message": "Unsupported user role: MANAGER"
  }
}
```

Forensic database inspection revealed that the production PostgreSQL database (`neondb`) contained exactly one historical record with `role = 'MANAGER'`. This user had been created on 2026-09-11 during earlier test seed executions before the system role model was formally restricted to `['ADMIN', 'CALL_CENTER', 'DRIVER']`.

A transaction-safe, idempotent remediation script was executed to convert this record to `'CALL_CENTER'`, restoring `GET /api/users` to full operational status (`200 OK`).

---

## 2. Pre-Remediation Read-Only Inspection

### Query Executed:
```sql
SELECT id, email, role, created_at
FROM users
ORDER BY created_at ASC;
```

### Result:
- **Total users in database**: 5
  - `admin.integration@tracker.local` -> `ADMIN`
  - `manager.integration@tracker.local` -> `MANAGER` (id: `d5409049-c675-4aef-9109-09d140c44c23`)
  - `tariq.driver@tracker.local` -> `DRIVER`
  - `admin@tracker.local` -> `ADMIN`
  - `emad@tracker.local` -> `DRIVER`
- **Legacy `MANAGER` records**: Exactly 1 (`manager.integration@tracker.local`).

---

## 3. Justification for `CALL_CENTER` Mapping

1. **Role Model Alignment**:
   In Tracker's architecture, there are exactly three authorized roles: `ADMIN`, `CALL_CENTER`, and `DRIVER`.
2. **Context & Identity**:
   `manager.integration@tracker.local` was seeded as the monitoring operator test user alongside `admin.integration@tracker.local` and `tariq.driver@tracker.local`. In modern tests (`database.integration.test.ts`), this exact operator desk account was migrated to `CALL_CENTER`.
3. **Safety**:
   The user does not represent an Admin, nor does it possess a vehicle or driver profile. Mapping it to `CALL_CENTER` restores monitoring desk privileges without granting administrative mutation authority.

---

## 4. Transaction-Safe Mutation Executed

Executed via `scripts/src/remediate-legacy-manager.ts`:

```sql
BEGIN;

-- 1. Pre-condition assertion: verify exactly 1 row with role = 'MANAGER'
SELECT id, email, role, created_at
FROM users
WHERE role = 'MANAGER';

-- 2. Execute targeted update
UPDATE users
SET role = 'CALL_CENTER', updated_at = NOW()
WHERE role = 'MANAGER' AND id = 'd5409049-c675-4aef-9109-09d140c44c23'
RETURNING id, email, role, updated_at;

-- 3. Post-condition assertion: verify 0 rows remain with role = 'MANAGER'
SELECT id, email, role, created_at
FROM users
WHERE role = 'MANAGER';

COMMIT;
```

### Rollback Statement (If Ever Needed):
```sql
UPDATE users
SET role = 'MANAGER', updated_at = NOW()
WHERE id = 'd5409049-c675-4aef-9109-09d140c44c23';
```

---

## 5. Post-Remediation Verification Evidence

### 1. PostgreSQL Role Distribution:
```sql
SELECT role, COUNT(*)::int as count
FROM users
GROUP BY role
ORDER BY role;
```

| Role | Count |
|---|---|
| `ADMIN` | 2 |
| `CALL_CENTER` | 1 |
| `DRIVER` | 2 |
| `MANAGER` | 0 |

### 2. Production API Smoke Verification (`prod-verification.ts`):
- `GET /api/healthz` => **200 OK**
- `POST /api/auth/login` (admin) => **200 OK**
- `POST /api/auth/login` (call center: `manager.integration@tracker.local` with `ManagerSecret123!`) => **200 OK** (Role: `CALL_CENTER`)
- `GET /api/users` => **200 OK** (previously failed with 401)
- `GET /api/fleet/live` => **200 OK**
- `GET /api/notifications` => **200 OK**
- `GET /api/settings/restaurant` => **200 OK**
- `GET /api/settings/alerts` => **200 OK**
- `POST /api/auth/refresh` => **200 OK**
- `Replay revoked refreshToken` => **401 OK**

---

## 6. Final Status

- **Status**: **VERIFIED**
- **MANAGER Users in Production**: `0`
..
