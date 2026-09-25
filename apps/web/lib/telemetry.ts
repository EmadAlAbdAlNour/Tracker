export interface WebDriverStateContext {
  isOnline?: boolean | null;
  operationalStatus?: string | null;
  shift?: {
    status?: string | null;
  } | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
    speed?: number | null;
    recordedAt?: string | null;
  } | null;
  device?: {
    lastSeen?: string | null;
  } | null;
}

/**
 * Authoritatively resolves connection state strictly from backend isOnline / devices.lastSeen.
 * Rule: GPS age or missing location does NOT determine connection state.
 */
export function resolveConnectionState(
  driver: WebDriverStateContext | null | undefined
): 'awaiting' | 'online' | 'offline' {
  if (!driver) return 'offline';
  const hasActiveShift = Boolean(driver.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status));
  const hasLocation = Boolean(driver.location && (driver.location.latitude != null || driver.location.longitude != null));
  const isAwaitingTelemetry = hasActiveShift && !hasLocation;

  if (isAwaitingTelemetry) return 'awaiting';

  const isOnline = driver.isOnline != null ? driver.isOnline : (driver.operationalStatus !== 'OFFLINE');
  return isOnline ? 'online' : 'offline';
}

/**
 * Authoritatively resolves movement / operational state strictly from backend operationalStatus.
 * Rule: Client must NEVER recompute movement from speed > 0 or coordinate deltas.
 */
export function resolveOperationalState(
  driver: WebDriverStateContext | null | undefined
): 'MOVING' | 'STOPPED' | 'AT_RESTAURANT' | 'OFFLINE' | 'AWAITING' {
  if (!driver) return 'OFFLINE';
  const hasActiveShift = Boolean(driver.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status));
  const hasLocation = Boolean(driver.location && (driver.location.latitude != null || driver.location.longitude != null));
  const isAwaitingTelemetry = hasActiveShift && !hasLocation;

  if (isAwaitingTelemetry) return 'AWAITING';

  const isOnline = driver.isOnline != null ? driver.isOnline : (driver.operationalStatus !== 'OFFLINE');
  if (!isOnline || driver.operationalStatus === 'OFFLINE') return 'OFFLINE';

  if (driver.operationalStatus === 'MOVING') return 'MOVING';
  if (driver.operationalStatus === 'AT_RESTAURANT') return 'AT_RESTAURANT';
  return 'STOPPED';
}

export interface WebSpeedSemantics {
  speedKmh: number | null;
  isCurrent: boolean;
  isHistorical: boolean;
  ageMinutes: number | null;
}

/**
 * Resolves speed presentation semantics.
 * Rule: Stale speed must NEVER be presented as current speed.
 * Speed is current ONLY when driver is actively MOVING and the location record is fresh (<= 5 min).
 */
export function resolveSpeedSemantics(params: {
  speedMs?: number | null;
  operationalStatus?: string | null;
  isOnline?: boolean | null;
  recordedAt?: string | null;
  now?: number;
}): WebSpeedSemantics {
  const { speedMs, operationalStatus, isOnline, recordedAt, now = Date.now() } = params;
  const speedKmh = speedMs != null && !isNaN(Number(speedMs)) ? Math.round(Number(speedMs) * 3.6) : null;
  const recordedAtMs = recordedAt ? new Date(recordedAt).getTime() : 0;
  const ageMinutes = recordedAtMs > 0 ? Math.max(0, Math.round((now - recordedAtMs) / 60000)) : null;
  const isLocationFresh = ageMinutes != null && ageMinutes <= 5;

  const effectiveOnline = isOnline != null ? isOnline : (operationalStatus !== 'OFFLINE');
  if (!effectiveOnline || operationalStatus === 'OFFLINE') {
    return {
      speedKmh,
      isCurrent: false,
      isHistorical: false,
      ageMinutes,
    };
  }

  // Speed is current ONLY when driver is actively MOVING and the GPS record is fresh
  const isCurrent = operationalStatus === 'MOVING' && isLocationFresh && speedKmh != null;
  // Speed is historical when speed was recorded in the past but driver is not currently moving (or GPS is stale)
  const isHistorical = !isCurrent && speedKmh != null;

  return {
    speedKmh,
    isCurrent,
    isHistorical,
    ageMinutes,
  };
}
