# Operational Reporting & Analytics

> Authoritative Single Source of Truth for Operational Metrics, Formulas, and Aggregation Rules.  
> Verified against production reporting services, database queries, and test assertions (`v1.2.0`).

---

## 1. Canonical Reporting Service

All operational metrics displayed across Web and Mobile are computed canonically by a single backend service:

```typescript
// artifacts/api-server/src/services/reportService.ts
export async function generateOperationalReport(params: {
  from: string;
  to: string;
  driverId?: string;
}): Promise<OperationalReportResponse>
```

Both the Next.js Web Console (`/dashboard/reports`) and the React Native Mobile App (`AdminHomeScreen -> More -> Reports`) consume the exact same endpoint:

```http
GET /api/reports/summary?from=2026-10-01T00:00:00Z&to=2026-10-02T23:59:59Z HTTP/1.1
Authorization: Bearer <accessToken>
```

---

## 2. Mathematical Formulas & Telemetry Filters

Metrics are not estimated with coarse heuristics. They are derived from verified shifts and consecutive GPS breadcrumbs using strict anomaly filters:

### 2.1 Work Duration (`totalDurationMinutes`)

$$
\text{Shift Duration} = \begin{cases} 
\lfloor \frac{\text{endedAt} - \text{startedAt}}{60,000} \rfloor & \text{if shift completed} \\
\min\left(\lfloor \frac{\min(\text{now}, \text{to}) - \text{startedAt}}{60,000} \rfloor, \text{maxShiftHours} \times 60\right) & \text{if shift active}
\end{cases}
$$

- Capped by `maxShiftDurationHours` (default 12 hours) for open shifts to prevent infinite durations if a driver leaves a shift running overnight.

### 2.2 Distance Calculation & Plausibility Filter (`totalDistanceMeters`)

For every consecutive pair of reliable location fixes ($P_{i-1}, P_i$) where $\text{accuracy} \le 35\text{m}$:

$$
\Delta d = \text{Haversine}(P_{i-1}, P_i), \quad \Delta t = \frac{\text{recordedAt}_i - \text{recordedAt}_{i-1}}{1000}
$$

- **Displacement Plausibility Guard**:
  $$
  \text{If } \Delta t > 0 \text{ and } \frac{\Delta d}{\Delta t} \le 42.0\text{ m/s } (151.2\text{ km/h}): \quad \text{Distance} \mathrel{+}= \Delta d
  $$
- Any pair implying velocity $> 151.2\text{ km/h}$ is discarded as a teleportation anomaly (e.g., GPS jumping between cell towers).

### 2.3 Time Partitioning: Restaurant vs. Moving vs. Stopped

Time allocation across operational zones is calculated across time intervals:

- **Telemetry Gap Guard**:
  If $\Delta t > 300\text{ seconds}$ (5 minutes), the interval is classified as a connection blackout. **No fake durations are interpolated across gaps $> 5\text{m}$**.
- **Inside Restaurant Time (`restaurantDurationMinutes`)**:
  If $P_i$ falls within restaurant geofence ($\text{distance} \le \text{radiusMeters}$), the delta $\Delta t / 60$ is added to restaurant time.
- **Moving Time (`movingDurationMinutes`)**:
  If $P_i$ is outside restaurant and $\text{speed} \ge 1.5\text{ m/s}$ ($5.4\text{ km/h}$), the delta $\Delta t / 60$ is added to moving time.
- **Stopped Time (`stoppedDurationMinutes`)**:
  If $P_i$ is outside restaurant and $\text{speed} < 1.5\text{ m/s}$, the delta $\Delta t / 60$ is added to stopped time.

### 2.4 Alert Count (`alertCount`)

- Aggregates the total number of notifications created for the driver where:
  $$
  \text{createdAt} \ge \text{fromDate} \quad \text{AND} \quad \text{createdAt} \le \text{toDate}
  $$

---

## 3. API Contract & Response Shape

```json
{
  "summary": {
    "from": "2026-10-01T00:00:00.000Z",
    "to": "2026-10-02T23:59:59.000Z",
    "totalDrivers": 8,
    "totalShifts": 14,
    "totalDurationMinutes": 4320,
    "totalDistanceMeters": 184500,
    "movingDurationMinutes": 2150,
    "stoppedDurationMinutes": 1120,
    "restaurantDurationMinutes": 1050,
    "alertCount": 5,
    "totalMovingMinutes": 2150,
    "totalStoppedMinutes": 1120,
    "totalRestaurantMinutes": 1050,
    "totalAlerts": 5
  },
  "drivers": [
    {
      "driverId": "b2f69904-4e78-4392-a160-c3ecb2daea8d",
      "driverName": "Ahmed Hassan",
      "employeeId": "DRV-101",
      "shiftCount": 2,
      "totalDurationMinutes": 720,
      "totalDistanceMeters": 34500,
      "movingDurationMinutes": 380,
      "stoppedDurationMinutes": 180,
      "restaurantDurationMinutes": 160,
      "alertCount": 1,
      "durationMinutes": 720,
      "distanceMeters": 34500,
      "movingMinutes": 380,
      "stoppedMinutes": 180,
      "restaurantMinutes": 160,
      "alerts": 1
    }
  ],
  "driverBreakdown": [ /* Exact mirror of drivers for backwards compatibility */ ]
}
```

---

## 4. Query Performance & Anti-N+1 Batch Loading

Early prototypes suffered performance bottlenecks when loading points individually for dozens of shifts. The production implementation uses a single batched query:

```typescript
// 1 query for all shifts within date range
const shifts = await db.select().from(shiftsTable).where(...);

// 1 bulk query for ALL location points across all selected shifts
const allPoints = await db
  .select(...)
  .from(locationPointsTable)
  .where(inArray(locationPointsTable.shiftId, shiftIds))
  .orderBy(asc(locationPointsTable.recordedAt));
```

This ensures reports over 30-day windows with thousands of GPS coordinates execute in sub-second time.
