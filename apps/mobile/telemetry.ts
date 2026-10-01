export function normalizeNetworkStatus(type?: string | null, isConnected?: boolean | null): string {
  if (!isConnected) return 'offline';

  switch (type) {
    case 'wifi':
      return 'wifi';
    case 'cellular':
      return 'cellular';
    case 'ethernet':
      return 'ethernet';
    case 'bluetooth':
      return 'bluetooth';
    case 'vpn':
      return 'vpn';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
}

export interface DriverStateContext {
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
  driver: DriverStateContext | null | undefined
): 'awaiting' | 'online' | 'offline' {
  if (!driver) return 'offline';
  const hasActiveShift = Boolean(driver.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status));
  const hasLocation = Boolean(driver.location && (driver.location.latitude != null || driver.location.longitude != null));
  const isAwaitingTelemetry = hasActiveShift && !hasLocation;

  if (isAwaitingTelemetry) return 'awaiting';

  // Authoritative: isOnline is determined by backend based on devices.lastSeen <= offlineGraceMinutes
  const isOnline = driver.isOnline != null ? driver.isOnline : (driver.operationalStatus !== 'OFFLINE');
  return isOnline ? 'online' : 'offline';
}

/**
 * Authoritatively resolves movement / operational state strictly from backend operationalStatus.
 * Rule: Client must NEVER recompute movement from speed > 0 or coordinate deltas.
 */
export function resolveOperationalState(
  driver: DriverStateContext | null | undefined
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

export interface SpeedSemantics {
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
  accuracy?: number | null;
  now?: number;
}): SpeedSemantics {
  const { speedMs, operationalStatus, isOnline, recordedAt, accuracy, now = Date.now() } = params;
  const speedKmh = speedMs != null && !isNaN(Number(speedMs)) ? Math.round(Number(speedMs) * 3.6) : null;
  const recordedAtMs = recordedAt ? new Date(recordedAt).getTime() : 0;
  const ageMinutes = recordedAtMs > 0 ? Math.max(0, Math.round((now - recordedAtMs) / 60000)) : null;
  const isLocationFresh = ageMinutes != null && ageMinutes <= 5;
  const isAccuracyReliable = accuracy == null || accuracy <= 35;

  const effectiveOnline = isOnline != null ? isOnline : (operationalStatus !== 'OFFLINE');
  if (!effectiveOnline || operationalStatus === 'OFFLINE') {
    return {
      speedKmh,
      isCurrent: false,
      isHistorical: false,
      ageMinutes,
    };
  }

  // Speed is current ONLY when driver is actively MOVING, GPS record is fresh, and accuracy is reliable (<= 35m)
  const isCurrent = operationalStatus === 'MOVING' && isLocationFresh && isAccuracyReliable && speedKmh != null;
  // Speed is historical/degraded when speed was recorded in the past but driver is not currently moving, GPS is stale, or accuracy is degraded
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
  driver?: DriverStateContext | null;
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

export type GeofencePresentationState = 'INSIDE' | 'OUTSIDE' | 'AWAITING' | 'NO_LOCATION';

/**
 * Authoritatively resolves geofence presentation state.
 * INVARIANT: NO_LOCATION must NEVER become OUTSIDE_RESTAURANT.
 */
export function resolveGeofencePresentation(params: {
  hasLocation: boolean;
  hasActiveShift: boolean;
  isInsideGeofence?: boolean | null;
}): {
  state: GeofencePresentationState;
  labelEn: string;
  labelAr: string;
} {
  const { hasLocation, hasActiveShift, isInsideGeofence } = params;
  if (!hasLocation) {
    if (hasActiveShift) {
      return {
        state: 'AWAITING',
        labelEn: 'Awaiting location',
        labelAr: 'بانتظار تحديد الموقع',
      };
    }
    return {
      state: 'NO_LOCATION',
      labelEn: 'No location data',
      labelAr: 'لا توجد بيانات موقع',
    };
  }
  if (isInsideGeofence) {
    return {
      state: 'INSIDE',
      labelEn: 'Inside restaurant range',
      labelAr: 'داخل نطاق المطعم',
    };
  }
  return {
    state: 'OUTSIDE',
    labelEn: 'Outside restaurant range',
    labelAr: 'خارج نطاق المطعم',
  };
}

export interface BatteryFreshness {
  percentage: number | null;
  isStale: boolean;
  ageMinutes: number | null;
  labelEn: string;
  labelAr: string;
}

/**
 * Resolves battery freshness semantics.
 * Battery percentage is separated from freshness. A battery reading from an offline device
 * is flagged as stale.
 */
export function resolveBatteryFreshness(params: {
  batteryPercentage?: number | null;
  lastSeen?: string | null;
  isOnline?: boolean | null;
  now?: number;
}): BatteryFreshness {
  const { batteryPercentage, lastSeen, isOnline, now = Date.now() } = params;
  if (batteryPercentage == null) {
    return {
      percentage: null,
      isStale: false,
      ageMinutes: null,
      labelEn: '—',
      labelAr: '—',
    };
  }
  const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0;
  const ageMinutes = lastSeenMs > 0 ? Math.max(0, Math.round((now - lastSeenMs) / 60000)) : null;
  const isStale = (isOnline === false) || (ageMinutes != null && ageMinutes > 10);

  let labelEn = `${batteryPercentage}%`;
  let labelAr = `${batteryPercentage}%`;
  if (isStale && ageMinutes != null && ageMinutes >= 1) {
    if (ageMinutes < 60) {
      labelEn = `${batteryPercentage}% (stale ${ageMinutes}m)`;
      labelAr = `${batteryPercentage}% (قديم ${ageMinutes} د)`;
    } else {
      const hours = Math.floor(ageMinutes / 60);
      labelEn = `${batteryPercentage}% (stale ${hours}h)`;
      labelAr = `${batteryPercentage}% (قديم ${hours} س)`;
    }
  }

  return {
    percentage: batteryPercentage,
    isStale,
    ageMinutes,
    labelEn,
    labelAr,
  };
}

export interface LocalizedActivity {
  title: string;
  description: string;
}

/**
 * Resolves activity timeline event titles and descriptions localized to the client locale.
 * Fallbacks to event.title or event.type if unknown code arrives.
 */
export function resolveActivityPresentation(
  type: string,
  isRtl: boolean,
  fallbackTitle?: string | null,
  fallbackDesc?: string | null,
  metadata?: any
): LocalizedActivity {
  switch (type) {
    case 'SHIFT_STARTED':
      return {
        title: isRtl ? 'بدء الوردية' : 'Shift Started',
        description: isRtl ? 'بدء وردية العمل بنجاح' : 'Work shift started successfully',
      };
    case 'ARRIVED_AT_RESTAURANT': {
      const dist = metadata?.distanceMeters;
      return {
        title: isRtl ? 'الوصول إلى المطعم' : 'Arrived at Restaurant',
        description: dist != null
          ? (isRtl ? `وصل السائق إلى نطاق المطعم (${dist} متر)` : `Driver entered restaurant zone (${dist}m)`)
          : (isRtl ? 'وصل السائق إلى نطاق المطعم' : 'Driver entered restaurant zone'),
      };
    }
    case 'LEFT_RESTAURANT': {
      const dist = metadata?.distanceMeters;
      return {
        title: isRtl ? 'مغادرة المطعم' : 'Left Restaurant',
        description: dist != null
          ? (isRtl ? `خرج السائق من نطاق المطعم (${dist} متر)` : `Driver exited restaurant zone (${dist}m)`)
          : (isRtl ? 'خرج السائق من نطاق المطعم' : 'Driver exited restaurant zone'),
      };
    }
    case 'MOVING': {
      const speed = metadata?.speedKmh;
      return {
        title: isRtl ? 'بدء الحركة' : 'Moving',
        description: speed != null
          ? (isRtl ? `السرعة الحالية: ${speed} كم/س` : `Current speed: ${speed} km/h`)
          : (isRtl ? 'السائق في حركة' : 'Driver is moving'),
      };
    }
    case 'STOPPED': {
      const inside = metadata?.insideRestaurant;
      return {
        title: isRtl ? 'توقف عن الحركة' : 'Stopped',
        description: inside === true
          ? (isRtl ? 'متوقف داخل نطاق المطعم' : 'Stopped inside restaurant zone')
          : inside === false
          ? (isRtl ? 'متوقف خارج نطاق المطعم' : 'Stopped outside restaurant zone')
          : (isRtl ? 'توقف السائق عن الحركة' : 'Driver stopped moving'),
      };
    }
    case 'STOP_EXTENDED':
      return {
        title: isRtl ? 'توقف مطول خارج المطعم' : 'Extended Stop',
        description: isRtl
          ? 'تجاوز السائق الحد الأقصى المسموح به للتوقف'
          : 'Driver exceeded maximum allowed stationary time',
      };
    case 'GPS_DISABLED':
      return {
        title: isRtl ? 'تعطيل GPS' : 'GPS Disabled',
        description: isRtl
          ? 'تم تعطيل خدمة الموقع على جهاز السائق'
          : 'Location services disabled on driver device',
      };
    case 'BATTERY_CRITICAL':
      return {
        title: isRtl ? 'بطارية حرجة' : 'Battery Critical',
        description: isRtl
          ? 'مستوى شحن بطارية جهاز السائق أقل من الحد المسموح'
          : 'Driver device battery level is critical',
      };
    case 'SHIFT_ENDED': {
      const duration = metadata?.durationMinutes;
      return {
        title: isRtl ? 'انتهاء الوردية' : 'Shift Ended',
        description: duration != null
          ? (isRtl ? `اكتملت وردية العمل — المدة: ${duration} دقيقة` : `Shift completed — Duration: ${duration} mins`)
          : (isRtl ? 'تم إنهاء الوردية' : 'Shift ended'),
      };
    }
    case 'ALERT':
      return {
        title: fallbackTitle || (isRtl ? 'تنبيه تشغيلي' : 'Operational Alert'),
        description: fallbackDesc || '',
      };
    default:
      return {
        title: fallbackTitle || type,
        description: fallbackDesc || '',
      };
  }
}

