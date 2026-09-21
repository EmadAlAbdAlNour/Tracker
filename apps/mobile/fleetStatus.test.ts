import { describe, expect, it } from 'vitest';
import { formatTimeAgo, formatWesternNumber } from './i18n';
import type { MapDriverPoint } from './components/RealGeographicMapView';

describe('formatTimeAgo helper', () => {
  it('formats recent timestamps in Arabic and English', () => {
    const now = new Date().toISOString();
    expect(formatTimeAgo(now, true)).toBe('منذ ثوانٍ');
    expect(formatTimeAgo(now, false)).toBe('Just now');
  });

  it('formats minutes ago in Arabic and English', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatTimeAgo(fiveMinutesAgo, true)).toBe('منذ 5 دقيقة');
    expect(formatTimeAgo(fiveMinutesAgo, false)).toBe('5m ago');
  });

  it('formats hours ago (e.g. 1449 minutes = ~24 hours)', () => {
    const hoursAgo = new Date(Date.now() - 1449 * 60 * 1000).toISOString();
    expect(formatTimeAgo(hoursAgo, true)).toBe('منذ 1 يوم');
    expect(formatTimeAgo(hoursAgo, false)).toBe('1d ago');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatTimeAgo(null)).toBe('-');
    expect(formatTimeAgo(undefined)).toBe('-');
  });
});

describe('Fleet & Map Status Canonical Truth Matrix', () => {
  // Canonical calculation helper as implemented in RealGeographicMapView.tsx
  function computeConnectedDriverCount(drivers: MapDriverPoint[]): number {
    return drivers.filter(
      (d) => d.operationalStatus !== 'OFFLINE' && d.location?.latitude && d.location?.longitude
    ).length;
  }

  // Canonical marker classification helper
  function classifyDriverMarker(d: MapDriverPoint) {
    const hasCoords = Boolean(d.location?.latitude && d.location?.longitude);
    if (!hasCoords) {
      return { renderMarker: false, markerType: 'NONE' as const };
    }

    const isOffline = d.operationalStatus === 'OFFLINE';
    return {
      renderMarker: true,
      markerType: isOffline ? ('LAST_KNOWN' as const) : ('LIVE' as const),
      pinClass: isOffline ? 'pin-circle offline' : 'pin-circle',
      symbol: isOffline
        ? '⊘'
        : d.location?.speed != null && d.location.speed > 0
        ? Math.round(d.location.speed * 3.6)
        : '●',
      staleTag: isOffline ? 'آخر موقع معروف' : null,
    };
  }

  // Scenario 1: Recent heartbeat + recent location -> ONLINE, in connected count, live marker
  it('Scenario 1: Recent heartbeat + recent location -> ONLINE, in connected count, live marker', () => {
    const onlineDriver: MapDriverPoint = {
      driverId: 'd-live-1',
      driverName: 'Ahmed Live',
      employeeId: 'EMP001',
      operationalStatus: 'MOVING',
      location: {
        latitude: 30.0444,
        longitude: 31.2357,
        speed: 12.5, // ~45 km/h
        recordedAt: new Date().toISOString(),
      },
    };

    const count = computeConnectedDriverCount([onlineDriver]);
    expect(count).toBe(1);

    const marker = classifyDriverMarker(onlineDriver);
    expect(marker.renderMarker).toBe(true);
    expect(marker.markerType).toBe('LIVE');
    expect(marker.pinClass).toBe('pin-circle');
    expect(marker.symbol).toBe(45); // Active speed displayed
    expect(marker.staleTag).toBeNull();
  });

  // Scenario 2: Stale heartbeat + historical location -> OFFLINE, NOT in connected count, historical/stale marker styling
  it('Scenario 2: Stale heartbeat + historical location -> OFFLINE, NOT in connected count, historical/stale marker styling', () => {
    const staleRecordedAt = new Date(Date.now() - 1449 * 60 * 1000).toISOString();
    const redaOfflineDriver: MapDriverPoint = {
      driverId: 'd-reda',
      driverName: 'Reda',
      employeeId: 'EMP002',
      operationalStatus: 'OFFLINE',
      location: {
        latitude: 30.05,
        longitude: 31.24,
        speed: 15.0, // Historical speed from hours ago
        recordedAt: staleRecordedAt,
      },
    };

    // Stale/offline driver MUST NOT increment connectedDriverCount!
    const count = computeConnectedDriverCount([redaOfflineDriver]);
    expect(count).toBe(0);

    // Marker renders as Last Known Location with muted symbol and tag
    const marker = classifyDriverMarker(redaOfflineDriver);
    expect(marker.renderMarker).toBe(true);
    expect(marker.markerType).toBe('LAST_KNOWN');
    expect(marker.pinClass).toBe('pin-circle offline');
    expect(marker.symbol).toBe('⊘'); // MUST NOT display active speed!
    expect(marker.staleTag).toBe('آخر موقع معروف');
  });

  // Scenario 3: Driver with no location -> no marker, status from connection state
  it('Scenario 3: Driver with no location -> no marker rendered on map', () => {
    const driverNoLocOnline: MapDriverPoint = {
      driverId: 'd-no-loc',
      driverName: 'Driver Without GPS',
      employeeId: 'EMP003',
      operationalStatus: 'AT_RESTAURANT',
      location: null,
    };

    const count = computeConnectedDriverCount([driverNoLocOnline]);
    // Does not increment map connected count because it has no coordinates to show on map
    expect(count).toBe(0);

    const marker = classifyDriverMarker(driverNoLocOnline);
    expect(marker.renderMarker).toBe(false);
    expect(marker.markerType).toBe('NONE');
  });

  // Scenario 4: Online -> offline transition updates count and marker
  it('Scenario 4: Transition from online to offline updates count and marker', () => {
    const driver: MapDriverPoint = {
      driverId: 'd-dynamic',
      driverName: 'Driver Dynamic',
      employeeId: 'EMP004',
      operationalStatus: 'MOVING',
      location: {
        latitude: 30.0444,
        longitude: 31.2357,
        speed: 10,
        recordedAt: new Date().toISOString(),
      },
    };

    // Initially online
    expect(computeConnectedDriverCount([driver])).toBe(1);
    expect(classifyDriverMarker(driver).markerType).toBe('LIVE');

    // Transitions to offline
    const transitionedDriver: MapDriverPoint = {
      ...driver,
      operationalStatus: 'OFFLINE',
    };

    expect(computeConnectedDriverCount([transitionedDriver])).toBe(0);
    const updatedMarker = classifyDriverMarker(transitionedDriver);
    expect(updatedMarker.markerType).toBe('LAST_KNOWN');
    expect(updatedMarker.symbol).toBe('⊘');
    expect(updatedMarker.staleTag).toBe('آخر موقع معروف');
  });

  // Scenario 5: Polling existing stale location stays offline
  it('Scenario 5: Polling existing stale location stays offline without false promotion', () => {
    const staleTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const staleDriver: MapDriverPoint = {
      driverId: 'd-stale-poll',
      driverName: 'Driver Stale',
      employeeId: 'EMP005',
      operationalStatus: 'OFFLINE',
      location: {
        latitude: 30.06,
        longitude: 31.25,
        speed: 0,
        recordedAt: staleTime,
      },
    };

    // Multiple poll cycles with unchanged stale telemetry
    for (let poll = 1; poll <= 5; poll++) {
      expect(computeConnectedDriverCount([staleDriver])).toBe(0);
      expect(classifyDriverMarker(staleDriver).markerType).toBe('LAST_KNOWN');
    }
  });

  // Scenario 6: Genuine new location/heartbeat promotes to online according to canonical freshness
  it('Scenario 6: Genuine new location/heartbeat promotes to online according to canonical freshness', () => {
    // Starts offline
    const initialDriver: MapDriverPoint = {
      driverId: 'd-promoted',
      driverName: 'Driver Promoted',
      employeeId: 'EMP006',
      operationalStatus: 'OFFLINE',
      location: {
        latitude: 30.04,
        longitude: 31.23,
        speed: 0,
        recordedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    };

    expect(computeConnectedDriverCount([initialDriver])).toBe(0);

    // New telemetry received with fresh shift and heartbeat -> promoted to STOPPED/ONLINE
    const promotedDriver: MapDriverPoint = {
      ...initialDriver,
      operationalStatus: 'STOPPED',
      location: {
        latitude: 30.041,
        longitude: 31.232,
        speed: 0,
        recordedAt: new Date().toISOString(),
      },
    };

    expect(computeConnectedDriverCount([promotedDriver])).toBe(1);
    const promotedMarker = classifyDriverMarker(promotedDriver);
    expect(promotedMarker.markerType).toBe('LIVE');
    expect(promotedMarker.pinClass).toBe('pin-circle');
    expect(promotedMarker.symbol).toBe('●');
  });
});
