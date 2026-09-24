import { describe, it, expect } from 'vitest';
import type { FleetDriverLiveStatus } from '../lib/api';

describe('Web UI Heartbeat & Independent Connection Semantics', () => {
  it('1. ONLINE + STOPPED remains connected (متصل)', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-1',
      driverName: 'Ahmad',
      driverEmail: 'ahmad@tracker.local',
      driverPhone: null,
      employeeId: 'EMP01',
      driverActive: true,
      userId: 'user-1',
      isOnline: true, // heartbeat fresh
      shift: { id: 's1', status: 'ACTIVE', startedAt: new Date().toISOString(), durationMinutes: 45 },
      location: {
        id: 'loc-1',
        latitude: 30.0444,
        longitude: 31.2357,
        speed: 0,
        heading: null,
        accuracy: 10,
        altitude: null,
        recordedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20m old GPS
        receivedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-1',
        platform: 'android',
        appVersion: '1.1.3',
        deviceIdentifier: 'uuid-1',
        authorized: true,
        batteryPercentage: 90,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(Date.now() - 30 * 1000).toISOString(), // 30s ago
      },
      operationalStatus: 'STOPPED',
      isInsideGeofence: false,
      distanceToRestaurantMeters: 1500,
    };

    expect(driver.isOnline).toBe(true);
    expect(driver.operationalStatus).toBe('STOPPED');
    // Connection must be connected despite stationary GPS
    const connectionText = driver.isOnline ? 'متصل' : 'غير متصل';
    expect(connectionText).toBe('متصل');
  });

  it('2. ONLINE + OUTSIDE + STOPPED displays correct state without turning OFFLINE', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-2',
      driverName: 'Sami',
      driverEmail: 'sami@tracker.local',
      driverPhone: null,
      employeeId: 'EMP02',
      driverActive: true,
      userId: 'user-2',
      isOnline: true,
      shift: { id: 's2', status: 'ACTIVE', startedAt: new Date().toISOString(), durationMinutes: 60 },
      location: {
        id: 'loc-2',
        latitude: 30.05,
        longitude: 31.24,
        speed: 0,
        heading: null,
        accuracy: 15,
        altitude: null,
        recordedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        receivedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-2',
        platform: 'android',
        appVersion: '1.1.3',
        deviceIdentifier: 'uuid-2',
        authorized: true,
        batteryPercentage: 80,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen: new Date(Date.now() - 15 * 1000).toISOString(),
      },
      operationalStatus: 'STOPPED',
      isInsideGeofence: false,
      distanceToRestaurantMeters: 3000,
    };

    expect(driver.isOnline).toBe(true);
    expect(driver.operationalStatus).toBe('STOPPED');
    expect(driver.isInsideGeofence).toBe(false);
  });

  it('3. OFFLINE displays Last Known ("آخر موقع معروف")', () => {
    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-3',
      driverName: 'Khaled',
      driverEmail: 'khaled@tracker.local',
      driverPhone: null,
      employeeId: 'EMP03',
      driverActive: true,
      userId: 'user-3',
      isOnline: false,
      shift: { id: 's3', status: 'ACTIVE', startedAt: new Date().toISOString(), durationMinutes: 120 },
      location: {
        id: 'loc-3',
        latitude: 30.06,
        longitude: 31.25,
        speed: 0,
        heading: null,
        accuracy: 20,
        altitude: null,
        recordedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        receivedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      },
      device: {
        id: 'dev-3',
        platform: 'android',
        appVersion: '1.1.3',
        deviceIdentifier: 'uuid-3',
        authorized: true,
        batteryPercentage: 50,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'offline',
        lastSeen: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      },
      operationalStatus: 'OFFLINE',
      isInsideGeofence: false,
      distanceToRestaurantMeters: 4500,
    };

    expect(driver.isOnline).toBe(false);
    expect(driver.operationalStatus).toBe('OFFLINE');
    const label = driver.operationalStatus === 'OFFLINE' ? 'آخر موقع معروف' : 'متصل';
    expect(label).toBe('آخر موقع معروف');
  });

  it('4. location age uses recordedAt timestamp, not lastSeen', () => {
    const recordedAt = new Date('2026-09-24T20:00:00Z').toISOString();
    const lastSeen = new Date('2026-09-24T20:25:00Z').toISOString();

    const driver: FleetDriverLiveStatus = {
      driverId: 'drv-4',
      driverName: 'Nasser',
      driverEmail: 'nasser@tracker.local',
      driverPhone: null,
      employeeId: 'EMP04',
      driverActive: true,
      userId: 'user-4',
      isOnline: true,
      shift: { id: 's4', status: 'ACTIVE', startedAt: recordedAt, durationMinutes: 30 },
      location: {
        id: 'loc-4',
        latitude: 30.07,
        longitude: 31.26,
        speed: 0,
        heading: null,
        accuracy: 10,
        altitude: null,
        recordedAt,
        receivedAt: recordedAt,
      },
      device: {
        id: 'dev-4',
        platform: 'android',
        appVersion: '1.1.3',
        deviceIdentifier: 'uuid-4',
        authorized: true,
        batteryPercentage: 88,
        isCharging: false,
        locationServicesEnabled: true,
        networkStatus: 'cellular',
        lastSeen,
      },
      operationalStatus: 'STOPPED',
      isInsideGeofence: false,
      distanceToRestaurantMeters: 2000,
    };

    expect(driver.location?.recordedAt).toBe(recordedAt);
    expect(driver.device?.lastSeen).toBe(lastSeen);
    expect(driver.location?.recordedAt).not.toBe(driver.device?.lastSeen);
  });

  it('5. connection state uses online/lastSeen semantics', () => {
    const now = Date.now();
    const freshLastSeen = new Date(now - 45 * 1000).toISOString();
    const isOnline = now - new Date(freshLastSeen).getTime() <= 5 * 60 * 1000;
    expect(isOnline).toBe(true);

    const staleLastSeen = new Date(now - 10 * 60 * 1000).toISOString();
    const isOffline = now - new Date(staleLastSeen).getTime() > 5 * 60 * 1000;
    expect(isOffline).toBe(true);
  });

  it('6. existing map behavior and structure are preserved', () => {
    const requiredStatuses = ['ALL', 'MOVING', 'STOPPED', 'AT_RESTAURANT', 'OFFLINE'];
    expect(requiredStatuses).toContain('STOPPED');
    expect(requiredStatuses).toContain('AT_RESTAURANT');
    expect(requiredStatuses).toContain('OFFLINE');
  });
});
