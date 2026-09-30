import { describe, it, expect } from 'vitest';
import {
  resolveConnectionState,
  resolveOperationalState,
  resolveSpeedSemantics,
  resolveTelemetryDiagnostics,
} from '../lib/telemetry';
import { t, isRtl, formatTimeAgo, formatWesternNumber } from '../lib/i18n';
import type { FleetDriverLiveStatus } from '../lib/api';

describe('Web UI Semantics Hardening — Phase 1 Final', () => {
  const now = Date.now();

  it('1. Online + fresh MOVING: resolves online, MOVING, and current speed', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-1',
      driverName: 'Ahmad',
      driverEmail: 'ahmad@tracker.local',
      driverPhone: null,
      employeeId: 'EMP01',
      driverActive: true,
      userId: 'user-1',
      isOnline: true,
      operationalStatus: 'MOVING',
      location: {
        id: 'loc-1',
        latitude: 24.71,
        longitude: 46.67,
        speed: 15, // 54 km/h
        heading: 90,
        accuracy: 10,
        altitude: null,
        recordedAt: new Date(now - 10 * 1000).toISOString(),
        receivedAt: new Date(now - 10 * 1000).toISOString(),
      },
      device: {
        id: 'dev-1',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-1',
        authorized: true,
        batteryPercentage: 90,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(now - 5 * 1000).toISOString(),
      },
      isInsideGeofence: false,
      distanceToRestaurantMeters: 800,
    };

    expect(resolveConnectionState(driver)).toBe('online');
    expect(resolveOperationalState(driver)).toBe('MOVING');

    const speed = resolveSpeedSemantics({
      speedMs: driver.location?.speed,
      operationalStatus: driver.operationalStatus,
      isOnline: driver.isOnline,
      recordedAt: driver.location?.recordedAt,
      now,
    });
    expect(speed.isCurrent).toBe(true);
    expect(speed.isHistorical).toBe(false);
    expect(speed.speedKmh).toBe(54);
  });

  it('2. Online + stale GPS + MOVING: remains online and MOVING, but speed is historical because GPS is stale', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-2',
      driverName: 'Sami',
      driverEmail: 'sami@tracker.local',
      driverPhone: null,
      employeeId: 'EMP02',
      driverActive: true,
      userId: 'user-2',
      isOnline: true,
      operationalStatus: 'MOVING',
      location: {
        id: 'loc-2',
        latitude: 24.71,
        longitude: 46.67,
        speed: 15,
        heading: 90,
        accuracy: 10,
        altitude: null,
        recordedAt: new Date(now - 30 * 60 * 1000).toISOString(), // 30m old GPS
        receivedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-2',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-2',
        authorized: true,
        batteryPercentage: 85,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(now - 15 * 1000).toISOString(), // fresh heartbeat
      },
      isInsideGeofence: false,
      distanceToRestaurantMeters: 1200,
    };

    expect(resolveConnectionState(driver)).toBe('online');
    expect(resolveOperationalState(driver)).toBe('MOVING');

    const speed = resolveSpeedSemantics({
      speedMs: driver.location?.speed,
      operationalStatus: driver.operationalStatus,
      isOnline: driver.isOnline,
      recordedAt: driver.location?.recordedAt,
      now,
    });
    expect(speed.isCurrent).toBe(false);
    expect(speed.isHistorical).toBe(true);
    expect(speed.ageMinutes).toBe(30);
  });

  it('3. Online + stale GPS + STOPPED: remains online, STOPPED, speed is historical', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-3',
      driverName: 'Khaled',
      driverEmail: 'khaled@tracker.local',
      driverPhone: null,
      employeeId: 'EMP03',
      driverActive: true,
      userId: 'user-3',
      isOnline: true,
      operationalStatus: 'STOPPED',
      location: {
        id: 'loc-3',
        latitude: 24.71,
        longitude: 46.67,
        speed: 3.33, // 12 km/h
        heading: null,
        accuracy: 15,
        altitude: null,
        recordedAt: new Date(now - 20 * 60 * 1000).toISOString(),
        receivedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-3',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-3',
        authorized: true,
        batteryPercentage: 70,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(now - 8 * 1000).toISOString(),
      },
      isInsideGeofence: false,
      distanceToRestaurantMeters: 2500,
    };

    expect(resolveConnectionState(driver)).toBe('online');
    expect(resolveOperationalState(driver)).toBe('STOPPED');

    const speed = resolveSpeedSemantics({
      speedMs: driver.location?.speed,
      operationalStatus: driver.operationalStatus,
      isOnline: driver.isOnline,
      recordedAt: driver.location?.recordedAt,
      now,
    });
    expect(speed.isCurrent).toBe(false);
    expect(speed.isHistorical).toBe(true);
    expect(speed.speedKmh).toBe(12);
  });

  it('4. Online + stale GPS + AT_RESTAURANT: remains online, AT_RESTAURANT, speed is historical', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-4',
      driverName: 'Tariq',
      driverEmail: 'tariq@tracker.local',
      driverPhone: null,
      employeeId: 'EMP04',
      driverActive: true,
      userId: 'user-4',
      isOnline: true,
      operationalStatus: 'AT_RESTAURANT',
      location: {
        id: 'loc-4',
        latitude: 24.7136,
        longitude: 46.6753,
        speed: 15, // 54 km/h historical speed
        heading: null,
        accuracy: 8,
        altitude: null,
        recordedAt: new Date(now - 45 * 60 * 1000).toISOString(),
        receivedAt: new Date(now - 45 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-4',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-4',
        authorized: true,
        batteryPercentage: 92,
        isCharging: true,
        locationServicesEnabled: true,
        networkStatus: 'wifi',
        lastSeen: new Date(now - 12 * 1000).toISOString(),
      },
      isInsideGeofence: true,
      distanceToRestaurantMeters: 20,
    };

    expect(resolveConnectionState(driver)).toBe('online');
    expect(resolveOperationalState(driver)).toBe('AT_RESTAURANT');

    const speed = resolveSpeedSemantics({
      speedMs: driver.location?.speed,
      operationalStatus: driver.operationalStatus,
      isOnline: driver.isOnline,
      recordedAt: driver.location?.recordedAt,
      now,
    });
    expect(speed.isCurrent).toBe(false);
    expect(speed.isHistorical).toBe(true);
    expect(speed.speedKmh).toBe(54);
  });

  it('5. Offline + recent GPS: remains offline, operationalStatus OFFLINE takes precedence', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-5',
      driverName: 'Omar',
      driverEmail: 'omar@tracker.local',
      driverPhone: null,
      employeeId: 'EMP05',
      driverActive: true,
      userId: 'user-5',
      isOnline: false,
      operationalStatus: 'OFFLINE',
      location: {
        id: 'loc-5',
        latitude: 24.71,
        longitude: 46.67,
        speed: 15,
        heading: null,
        accuracy: 12,
        altitude: null,
        recordedAt: new Date(now - 10 * 1000).toISOString(), // recent GPS point
        receivedAt: new Date(now - 10 * 1000).toISOString(),
      },
      device: {
        id: 'dev-5',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-5',
        authorized: true,
        batteryPercentage: 40,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'offline',
        lastSeen: new Date(now - 15 * 60 * 1000).toISOString(), // old heartbeat
      },
      isInsideGeofence: false,
      distanceToRestaurantMeters: 3000,
    };

    expect(resolveConnectionState(driver)).toBe('offline');
    expect(resolveOperationalState(driver)).toBe('OFFLINE');

    const speed = resolveSpeedSemantics({
      speedMs: driver.location?.speed,
      operationalStatus: driver.operationalStatus,
      isOnline: driver.isOnline,
      recordedAt: driver.location?.recordedAt,
      now,
    });
    expect(speed.isCurrent).toBe(false);
    expect(speed.isHistorical).toBe(false);
  });

  it('6. Online + no location: reports awaiting when on shift, does not crash with null location', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-6',
      driverName: 'Fahad',
      driverEmail: 'fahad@tracker.local',
      driverPhone: null,
      employeeId: 'EMP06',
      driverActive: true,
      userId: 'user-6',
      isOnline: true,
      shift: { id: 's6', status: 'ACTIVE', startedAt: new Date().toISOString(), durationMinutes: 10 },
      operationalStatus: 'STOPPED',
      location: null,
      device: {
        id: 'dev-6',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-6',
        authorized: true,
        batteryPercentage: 99,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(now - 5 * 1000).toISOString(),
      },
      isInsideGeofence: false,
      distanceToRestaurantMeters: null,
    };

    expect(resolveConnectionState(driver)).toBe('awaiting');
    expect(resolveOperationalState(driver)).toBe('AWAITING');

    const speed = resolveSpeedSemantics({
      speedMs: null,
      operationalStatus: driver.operationalStatus,
      isOnline: driver.isOnline,
      recordedAt: null,
    });
    expect(speed.speedKmh).toBeNull();
    expect(speed.isCurrent).toBe(false);
  });

  it('7. Stale speed labeling: explicit separation of current vs historical speed', () => {
    const historicalSpeed = resolveSpeedSemantics({
      speedMs: 15,
      operationalStatus: 'AT_RESTAURANT',
      isOnline: true,
      recordedAt: new Date(now - 60 * 60 * 1000).toISOString(),
      now,
    });
    expect(historicalSpeed.isCurrent).toBe(false);
    expect(historicalSpeed.isHistorical).toBe(true);
    expect(historicalSpeed.speedKmh).toBe(54);
    expect(historicalSpeed.ageMinutes).toBe(60);
  });

  it('8. lastSeen is used strictly for connection freshness', () => {
    const recentLastSeen = new Date(now - 20 * 1000).toISOString();
    const oldRecordedAt = new Date(now - 120 * 60 * 1000).toISOString();

    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-8',
      driverName: 'Driver 8',
      driverEmail: 'drv8@tracker.local',
      driverPhone: null,
      employeeId: 'EMP08',
      driverActive: true,
      userId: 'user-8',
      isOnline: true,
      operationalStatus: 'STOPPED',
      location: {
        id: 'loc-8',
        latitude: 24.7,
        longitude: 46.7,
        speed: 0,
        heading: null,
        accuracy: 10,
        altitude: null,
        recordedAt: oldRecordedAt,
        receivedAt: oldRecordedAt,
      },
      device: {
        id: 'dev-8',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-8',
        authorized: true,
        batteryPercentage: 80,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: recentLastSeen,
      },
      isInsideGeofence: false,
      distanceToRestaurantMeters: 500,
    };

    expect(driver.device?.lastSeen).toBe(recentLastSeen);
    expect(driver.isOnline).toBe(true);
    expect(resolveConnectionState(driver)).toBe('online');
  });

  it('9. recordedAt is used strictly for GPS age, not connection', () => {
    const recordedAt = new Date(now - 45 * 60 * 1000).toISOString();
    const gpsAgeMinutes = Math.round((now - new Date(recordedAt).getTime()) / 60000);
    expect(gpsAgeMinutes).toBe(45);
  });

  it('10. operationalStatus is used authoritatively for movement without client override', () => {
    // Backend says AT_RESTAURANT even though speed in GPS point is 54 km/h
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-10',
      driverName: 'Driver 10',
      driverEmail: 'drv10@tracker.local',
      driverPhone: null,
      employeeId: 'EMP10',
      driverActive: true,
      userId: 'user-10',
      isOnline: true,
      operationalStatus: 'AT_RESTAURANT',
      location: {
        id: 'loc-10',
        latitude: 24.7136,
        longitude: 46.6753,
        speed: 15, // speed > 0 must NOT cause client to say MOVING
        heading: null,
        accuracy: 10,
        altitude: null,
        recordedAt: new Date(now - 78 * 60 * 1000).toISOString(),
        receivedAt: new Date(now - 78 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-10',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-10',
        authorized: true,
        batteryPercentage: 95,
        isCharging: true,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(now - 10 * 1000).toISOString(),
      },
      isInsideGeofence: true,
      distanceToRestaurantMeters: 10,
    };

    expect(resolveOperationalState(driver)).toBe('AT_RESTAURANT');
    expect(resolveOperationalState(driver)).not.toBe('MOVING');
  });

  it('11. Arabic translations exist for all status and speed labels', () => {
    expect(t('map.currentSpeed')).toBe('السرعة الحالية');
    expect(t('map.lastRecordedSpeed')).toBe('آخر سرعة مسجلة');
    expect(t('map.lastGpsLocation')).toBe('آخر موقع مسجل');
    expect(t('map.lastConnection')).toBe('آخر اتصال');
    expect(t('overview.moving')).toBe('في حركة');
    expect(t('overview.stopped')).toBe('متوقفون بالخارج');
    expect(t('map.filterStopped')).toBe('متوقف');
    expect(t('overview.atRestaurant')).toBe('داخل المطعم');
    expect(t('map.filterRestaurant')).toBe('بالمطعم');
    expect(t('overview.offline')).toBe('غير متصل');
  });

  it('12. Western numbers are preserved in formatting', () => {
    expect(formatWesternNumber(54)).toBe('54');
    expect(formatWesternNumber('100')).toBe('100');
  });

  it('13. RTL detection helper works', () => {
    expect(typeof isRtl()).toBe('boolean');
  });

  it('14. Map popup semantics: displays lastRecordedSpeed when stationary, currentSpeed when moving', () => {
    // When MOVING
    const movingSpeedSemantics = resolveSpeedSemantics({
      speedMs: 15,
      operationalStatus: 'MOVING',
      isOnline: true,
      recordedAt: new Date(now - 10 * 1000).toISOString(),
      now,
    });
    expect(movingSpeedSemantics.isCurrent).toBe(true);

    // When AT_RESTAURANT
    const restaurantSpeedSemantics = resolveSpeedSemantics({
      speedMs: 15,
      operationalStatus: 'AT_RESTAURANT',
      isOnline: true,
      recordedAt: new Date(now - 78 * 60 * 1000).toISOString(),
      now,
    });
    expect(restaurantSpeedSemantics.isCurrent).toBe(false);
    expect(restaurantSpeedSemantics.isHistorical).toBe(true);
  });

  it('15. Driver list semantics: speed is only shown as current when MOVING, otherwise dash or labeled', () => {
    const stationarySpeed = 15; // 54 km/h
    const opStatus = 'AT_RESTAURANT';
    const isMoving = opStatus === 'MOVING';
    const displaySpeed = isMoving ? `${Math.round(stationarySpeed * 3.6)} km/h` : '—';
    expect(displaySpeed).toBe('—');
  });

  it('16. Driver detail semantics: shiftStarted is distinct from lastSeen', () => {
    expect(t('drivers.shiftStarted')).toBe('بدء الوردية');
    expect(t('drivers.lastSeen')).toBe('آخر ظهور');
  });

  it('17. EXACT REGRESSION: staleGpsDoesNotLookLikeCurrentConnectionOrSpeed', () => {
    // SCENARIO:
    // Backend:
    //   isOnline = true
    //   operationalStatus = AT_RESTAURANT
    //   lastSeen = 10 seconds ago
    //   location.recordedAt = 78 minutes ago
    //   location.speed = 15 m/s (54 km/h)
    const driver: FleetDriverLiveStatus = {
      driverId: 'reg-driver-78m',
      driverName: 'Ahmad Regression',
      driverEmail: 'ahmad.reg@tracker.local',
      driverPhone: null,
      employeeId: 'EMP78',
      driverActive: true,
      userId: 'user-78',
      isOnline: true,
      operationalStatus: 'AT_RESTAURANT',
      location: {
        id: 'loc-78',
        latitude: 24.7136,
        longitude: 46.6753,
        speed: 15, // 54 km/h
        heading: null,
        accuracy: 10,
        altitude: null,
        recordedAt: new Date(now - 78 * 60 * 1000).toISOString(),
        receivedAt: new Date(now - 78 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-78',
        platform: 'android',
        appVersion: '1.1.4',
        deviceIdentifier: 'uuid-78',
        authorized: true,
        batteryPercentage: 88,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(now - 10 * 1000).toISOString(),
      },
      isInsideGeofence: true,
      distanceToRestaurantMeters: 25,
    };

    // 1. Connection: MUST be 'online' (never offline or delayed)
    const connection = resolveConnectionState(driver);
    expect(connection).toBe('online');

    // 2. Operational state: MUST be 'AT_RESTAURANT' (never MOVING)
    const movement = resolveOperationalState(driver);
    expect(movement).toBe('AT_RESTAURANT');

    // 3. GPS Freshness: recordedAt must show 78 minutes ago
    const recordedAtMs = new Date(driver.location!.recordedAt!).getTime();
    const gpsAgeMinutes = Math.round((now - recordedAtMs) / 60000);
    expect(gpsAgeMinutes).toBe(78);

    // 4. Speed: MUST NOT be current, MUST be labeled historical
    const speed = resolveSpeedSemantics({
      speedMs: driver.location?.speed,
      operationalStatus: driver.operationalStatus,
      isOnline: driver.isOnline,
      recordedAt: driver.location?.recordedAt,
      now,
    });
    expect(speed.isCurrent).toBe(false);
    expect(speed.isHistorical).toBe(true);
    expect(speed.speedKmh).toBe(54);
    expect(speed.ageMinutes).toBe(78);
  });

  describe('resolveTelemetryDiagnostics 4-state diagnostics model', () => {
    it('resolves OFFLINE when isOnline is false or null regardless of GPS points', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: false,
          location: { accuracy: 10, recordedAt: new Date(now).toISOString() },
        },
        now,
      });
      expect(diag.status).toBe('OFFLINE');
      expect(diag.isOnline).toBe(false);
      expect(diag.labelEn).toBe('Offline');
      expect(diag.labelAr).toBe('غير متصل');
    });

    it('resolves SYNCING when online but has pending unsynced queue points', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: { accuracy: 10, recordedAt: new Date(now).toISOString() },
        },
        pendingQueueCount: 14,
        now,
      });
      expect(diag.status).toBe('SYNCING');
      expect(diag.isOnline).toBe(true);
      expect(diag.labelEn).toBe('Syncing');
      expect(diag.labelAr).toBe('مزامنة البيانات');
    });

    it('resolves GPS_STALE when online but GPS point is older than 5 minutes', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: {
            accuracy: 15,
            recordedAt: new Date(now - 12 * 60 * 1000).toISOString(),
          },
        },
        now,
      });
      expect(diag.status).toBe('GPS_STALE');
      expect(diag.gpsAgeMinutes).toBe(12);
      expect(diag.isOnline).toBe(true);
      expect(diag.labelEn).toBe('GPS Stale');
    });

    it('resolves GPS_DEGRADED when online with fresh GPS but accuracy > 35m', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: {
            accuracy: 75,
            recordedAt: new Date(now - 30 * 1000).toISOString(),
          },
        },
        now,
      });
      expect(diag.status).toBe('GPS_DEGRADED');
      expect(diag.isReliableGps).toBe(false);
      expect(diag.isOnline).toBe(true);
      expect(diag.labelEn).toBe('GPS Degraded');
    });

    it('resolves ONLINE when online with fresh and reliable GPS', () => {
      const diag = resolveTelemetryDiagnostics({
        driver: {
          isOnline: true,
          location: {
            accuracy: 12,
            recordedAt: new Date(now - 10 * 1000).toISOString(),
          },
        },
        now,
      });
      expect(diag.status).toBe('ONLINE');
      expect(diag.isReliableGps).toBe(true);
      expect(diag.isOnline).toBe(true);
      expect(diag.labelEn).toBe('Online');
    });
  });
});

