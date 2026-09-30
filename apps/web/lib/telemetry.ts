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
    accuracy?: number | null;
    recordedAt?: string | null;
  } | null;
  device?: {
    lastSeen?: string | null;
  } | null;
  pendingQueueCount?: number | null;
  isSyncing?: boolean | null;
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

export type DiagnosticStatus = 'ONLINE' | 'OFFLINE' | 'GPS_STALE' | 'GPS_DEGRADED' | 'SYNCING';

export interface TelemetryDiagnostics {
  status: DiagnosticStatus;
  labelEn: string;
  labelAr: string;
  badgeClass: string;
  badgeColor: string;
  gpsAgeMinutes: number | null;
  lastSeenAgeSeconds: number | null;
  accuracy: number | null;
  isReliableGps: boolean;
  isOnline: boolean;
}

/**
 * Authoritatively computes a 4-state diagnostic breakdown:
 * ONLINE, OFFLINE, GPS STALE/DEGRADED, and SYNCING without collapsing them.
 */
export function resolveTelemetryDiagnostics(params: {
  driver?: WebDriverStateContext | null;
  pendingQueueCount?: number | null;
  isSyncing?: boolean | null;
  now?: number;
}): TelemetryDiagnostics {
  const { driver, now = Date.now() } = params;
  const pendingQueue = params.pendingQueueCount ?? driver?.pendingQueueCount ?? 0;
  const isSyncing = params.isSyncing ?? driver?.isSyncing ?? false;

  const isOnline = driver
    ? (driver.isOnline != null ? driver.isOnline : driver.operationalStatus !== 'OFFLINE')
    : false;

  const lastSeenMs = driver?.device?.lastSeen ? new Date(driver.device.lastSeen).getTime() : 0;
  const lastSeenAgeSeconds = lastSeenMs > 0 ? Math.max(0, Math.round((now - lastSeenMs) / 1000)) : null;

  const recordedAtMs = driver?.location?.recordedAt ? new Date(driver.location.recordedAt).getTime() : 0;
  const gpsAgeMinutes = recordedAtMs > 0 ? Math.max(0, Math.round((now - recordedAtMs) / 60000)) : null;
  const accuracy = driver?.location?.accuracy != null ? Number(driver.location.accuracy) : null;
  const isReliableGps = accuracy != null && accuracy <= 35;

  if (!isOnline) {
    return {
      status: 'OFFLINE',
      labelEn: 'Offline',
      labelAr: 'غير متصل',
      badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      badgeColor: '#64748b',
      gpsAgeMinutes,
      lastSeenAgeSeconds,
      accuracy,
      isReliableGps,
      isOnline: false,
    };
  }

  if (isSyncing || pendingQueue > 0) {
    return {
      status: 'SYNCING',
      labelEn: 'Syncing',
      labelAr: 'مزامنة البيانات',
      badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      badgeColor: '#06b6d4',
      gpsAgeMinutes,
      lastSeenAgeSeconds,
      accuracy,
      isReliableGps,
      isOnline: true,
    };
  }

  if (gpsAgeMinutes != null && gpsAgeMinutes > 5) {
    return {
      status: 'GPS_STALE',
      labelEn: 'GPS Stale',
      labelAr: 'إشارة قديمة',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      badgeColor: '#f59e0b',
      gpsAgeMinutes,
      lastSeenAgeSeconds,
      accuracy,
      isReliableGps,
      isOnline: true,
    };
  }

  if (accuracy != null && accuracy > 35) {
    return {
      status: 'GPS_DEGRADED',
      labelEn: 'GPS Degraded',
      labelAr: 'إشارة ضعيفة',
      badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
      badgeColor: '#f97316',
      gpsAgeMinutes,
      lastSeenAgeSeconds,
      accuracy,
      isReliableGps: false,
      isOnline: true,
    };
  }

  return {
    status: 'ONLINE',
    labelEn: 'Online',
    labelAr: 'متصل',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    badgeColor: '#10b981',
    gpsAgeMinutes,
    lastSeenAgeSeconds,
    accuracy,
    isReliableGps,
    isOnline: true,
  };
}
