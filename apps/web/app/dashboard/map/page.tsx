'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState, useMemo, useCallback, useRef, memo } from 'react';
import {
  BatteryCharging,
  Car,
  Compass,
  MapPin,
  PauseCircle,
  Radio,
  RefreshCw,
  Search,
  Store,
  User,
} from 'lucide-react';
import { getLiveFleetStatus, type LiveFleetResponse, type FleetDriverLiveStatus } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, formatTimeAgo, isRtl } from '@/lib/i18n';

interface VisualInfo {
  color: string;
  fillColor: string;
  radius: number;
  weight: number;
  opacity: number;
  freshness: 'LIVE' | 'RECENT' | 'STALE';
  statusLabel: string;
}

function getDriverVisuals(driver: FleetDriverLiveStatus): VisualInfo {
  const recordedAt = driver.location?.recordedAt;
  const ageMs = recordedAt ? Date.now() - new Date(recordedAt).getTime() : Infinity;

  let freshness: 'LIVE' | 'RECENT' | 'STALE' = 'STALE';
  if (ageMs <= 2 * 60 * 1000) {
    freshness = 'LIVE';
  } else if (ageMs <= 5 * 60 * 1000) {
    freshness = 'RECENT';
  } else {
    freshness = 'STALE';
  }

  let color = '#94a3b8'; // slate
  let fillColor = '#cbd5e1';
  let statusLabel = t('overview.offline');

  switch (driver.operationalStatus) {
    case 'MOVING':
      color = '#059669'; // emerald-600
      fillColor = '#10b981'; // emerald-500
      statusLabel = t('overview.moving');
      break;
    case 'STOPPED':
      color = '#d97706'; // amber-600
      fillColor = '#f59e0b'; // amber-500
      statusLabel = t('overview.stopped');
      break;
    case 'AT_RESTAURANT':
      color = '#0284c7'; // sky-600
      fillColor = '#38bdf8'; // sky-400
      statusLabel = t('overview.atRestaurant');
      break;
    case 'OFFLINE':
    default:
      color = '#64748b'; // slate-500
      fillColor = '#94a3b8'; // slate-400
      statusLabel = t('overview.offline');
      break;
  }

  // Adjust marker size & stroke based on freshness
  const radius = driver.operationalStatus === 'MOVING' ? 10 : 8;
  const weight = freshness === 'LIVE' ? 3 : freshness === 'RECENT' ? 2 : 1;
  const opacity = freshness === 'LIVE' ? 1.0 : freshness === 'RECENT' ? 0.8 : 0.5;

  return {
    color,
    fillColor,
    radius,
    weight,
    opacity,
    freshness,
    statusLabel,
  };
}

const LeafletMap = dynamic(
  async () => {
    const { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } = await import('react-leaflet');

    // Controls map pan/zoom without resetting every poll interval
    function MapController({
      center,
      targetLocation,
      recenterTrigger,
      driverPanTrigger,
    }: {
      center: [number, number];
      targetLocation: [number, number] | null;
      recenterTrigger: number;
      driverPanTrigger: number;
    }) {
      const map = useMap();
      const initialMounted = useRef(false);
      const lastHandledDriverPanTriggerRef = useRef(0);
      const lastHandledRecenterTriggerRef = useRef(0);

      // Recenter only on initial mount
      useEffect(() => {
        if (!initialMounted.current) {
          map.setView(center, 14);
          initialMounted.current = true;
        }
      }, [center, map]);

      // Handle user-requested recenter to restaurant ONLY when trigger increments
      useEffect(() => {
        if (recenterTrigger > 0 && recenterTrigger > lastHandledRecenterTriggerRef.current) {
          lastHandledRecenterTriggerRef.current = recenterTrigger;
          map.setView(center, 14, { animate: true });
        }
      }, [recenterTrigger, center, map]);

      // Smoothly pan/zoom to selected driver ONLY when user explicitly triggers selection (trigger increments)
      useEffect(() => {
        if (driverPanTrigger > 0 && driverPanTrigger > lastHandledDriverPanTriggerRef.current && targetLocation) {
          lastHandledDriverPanTriggerRef.current = driverPanTrigger;
          map.setView(targetLocation, 16, { animate: true });
        }
      }, [driverPanTrigger, targetLocation, map]);

      return null;
    }

    const DriverMarkerItem = memo(function DriverMarkerItem({
      driver,
      isSelected,
      onSelectDriver,
    }: {
      driver: FleetDriverLiveStatus;
      isSelected: boolean;
      onSelectDriver: (driverId: string) => void;
    }) {
      const lat = driver.location!.latitude;
      const lng = driver.location!.longitude;
      const visuals = getDriverVisuals(driver);

      return (
        <CircleMarker
          center={[lat, lng]}
          radius={isSelected ? visuals.radius + 3 : visuals.radius}
          eventHandlers={{
            click: () => onSelectDriver(driver.driverId),
          }}
          pathOptions={{
            color: isSelected ? '#1e293b' : '#ffffff',
            fillColor: visuals.fillColor,
            fillOpacity: visuals.opacity,
            weight: isSelected ? 3.5 : visuals.weight,
          }}
        >
          <Popup>
            <div className="p-1.5 space-y-2 text-xs min-w-[200px]">
              <div className="border-b border-slate-100 pb-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{driver.driverName}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: `${visuals.fillColor}22`,
                      color: visuals.color,
                    }}
                  >
                    {driver.operationalStatus === 'OFFLINE'
                      ? (isRtl() ? 'آخر موقع معروف' : 'Last Known Location')
                      : visuals.statusLabel}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {t('drivers.employeeId')}: {formatWesternNumber(driver.employeeId)}
                </div>
              </div>

              <div className="space-y-1 text-slate-600">
                {driver.operationalStatus !== 'OFFLINE' && driver.location?.speed != null && (
                  <div className="flex justify-between">
                    <span>{t('map.speed')}:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {formatWesternNumber(Math.round(driver.location.speed * 3.6))} {t('map.kmh')}
                    </span>
                  </div>
                )}

                {driver.distanceToRestaurantMeters != null && (
                  <div className="flex justify-between">
                    <span>{t('map.distance')}:</span>
                    <span className="font-mono text-slate-800">
                      {formatWesternNumber(driver.distanceToRestaurantMeters)} {t('map.meters')}
                    </span>
                  </div>
                )}

                {driver.device?.batteryPercentage != null && (
                  <div className="flex justify-between items-center">
                    <span>{t('drivers.battery')}:</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      {driver.device.isCharging ? (
                        <BatteryCharging className="h-3 w-3 text-emerald-600" />
                      ) : null}
                      {formatWesternNumber(driver.device.batteryPercentage)}%
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                  <span>{t('map.lastUpdate')}:</span>
                  <span className="font-medium text-slate-600">
                    {formatTimeAgo(driver.location?.recordedAt)}
                  </span>
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-100 text-center">
                <Link
                  href={`/dashboard/drivers/${driver.driverId}`}
                  className="inline-block w-full rounded-lg bg-slate-900 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 text-center"
                >
                  {t('drivers.viewDetails')}
                </Link>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      );
    });

    return function MapInner({
      fleet,
      statusFilter,
      selectedDriverId,
      onSelectDriver,
      recenterTrigger,
      driverPanTrigger,
    }: {
      fleet: LiveFleetResponse;
      statusFilter: string;
      selectedDriverId: string | null;
      onSelectDriver: (driverId: string) => void;
      recenterTrigger: number;
      driverPanTrigger: number;
    }) {
      const restaurantCenter = useMemo<[number, number]>(
        () => [fleet.restaurant.latitude, fleet.restaurant.longitude],
        [fleet.restaurant.latitude, fleet.restaurant.longitude],
      );

      const filteredDrivers = useMemo(() => {
        return fleet.drivers.filter((d) => {
          if (!d.location?.latitude || !d.location?.longitude) return false;
          if (statusFilter === 'ALL') return true;
          return d.operationalStatus === statusFilter;
        });
      }, [fleet.drivers, statusFilter]);

      const targetLocation = useMemo<[number, number] | null>(() => {
        if (!selectedDriverId) return null;
        const driver = fleet.drivers.find((d) => d.driverId === selectedDriverId);
        if (driver?.location?.latitude && driver?.location?.longitude) {
          return [driver.location.latitude, driver.location.longitude];
        }
        return null;
      }, [selectedDriverId, fleet.drivers]);

      return (
        <MapContainer
          center={restaurantCenter}
          zoom={14}
          scrollWheelZoom
          className="h-[620px] w-full rounded-2xl z-0"
        >
          <MapController
            center={restaurantCenter}
            targetLocation={targetLocation}
            recenterTrigger={recenterTrigger}
            driverPanTrigger={driverPanTrigger}
          />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {/* Restaurant Geofence Circle & Marker */}
          {fleet.restaurant.enabled && (
            <>
              <Circle
                center={restaurantCenter}
                radius={fleet.restaurant.radiusMeters}
                pathOptions={{
                  color: '#059669',
                  fillColor: '#10b981',
                  fillOpacity: 0.15,
                  dashArray: '4, 6',
                }}
              />
              <CircleMarker
                center={restaurantCenter}
                radius={10}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#059669',
                  fillOpacity: 1,
                  weight: 2.5,
                }}
              >
                <Popup>
                  <div className="p-1.5 space-y-1 text-xs">
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Store className="h-4 w-4 text-emerald-600" />
                      <span>{fleet.restaurant.name}</span>
                    </div>
                    <div className="text-slate-600">
                      {t('settings.radius')}:{' '}
                      <strong className="font-mono text-slate-800">
                        {formatWesternNumber(fleet.restaurant.radiusMeters)}
                      </strong>{' '}
                      {t('map.meters')}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {formatWesternNumber(fleet.restaurant.latitude.toFixed(5))},{' '}
                      {formatWesternNumber(fleet.restaurant.longitude.toFixed(5))}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </>
          )}

          {/* Drivers Markers */}
          {filteredDrivers.map((driver) => (
            <DriverMarkerItem
              key={driver.driverId}
              driver={driver}
              isSelected={driver.driverId === selectedDriverId}
              onSelectDriver={onSelectDriver}
            />
          ))}
        </MapContainer>
      );
    };
  },
  { ssr: false },
);

export default function MapPage() {
  const { isAuthenticated } = useAuth();
  const [fleet, setFleet] = useState<LiveFleetResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [driverPanTrigger, setDriverPanTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const mountedRef = useRef(true);
  const latestRecordedAtRef = useRef<Map<string, number>>(new Map());
  const initialLoadDoneRef = useRef(false);

  const handleSelectDriver = useCallback((driverId: string) => {
    setSelectedDriverId(driverId);
    setDriverPanTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async (showLoading = false) => {
    if (!isAuthenticated) return;
    if (showLoading) setLoading(true);
    setRefreshing(true);
    try {
      const data = await getLiveFleetStatus();
      if (mountedRef.current) {
        setFleet((prevFleet) => {
          if (!prevFleet) {
            // Initialize tracking map on first load
            data.drivers.forEach((d) => {
              if (d.location?.recordedAt) {
                latestRecordedAtRef.current.set(d.driverId, new Date(d.location.recordedAt).getTime());
              }
            });
            return data;
          }

          // Out-of-order / stale location protection:
          // Tolerates small clock skews while discarding truly stale historical replayed batches
          const SKEW_TOLERANCE_MS = 15_000;
          const sanitizedDrivers = data.drivers.map((incoming) => {
            const incomingRecordedAt = incoming.location?.recordedAt;
            if (!incomingRecordedAt) return incoming;

            const incomingTime = new Date(incomingRecordedAt).getTime();
            const lastAccepted = latestRecordedAtRef.current.get(incoming.driverId) ?? 0;

            const isStaleReplay = lastAccepted > 0 && incomingTime < (lastAccepted - SKEW_TOLERANCE_MS);

            if (isStaleReplay) {
              // Stale/out-of-order point (e.g. from offline queue replay): preserve current newer location
              const existing = prevFleet.drivers.find((d) => d.driverId === incoming.driverId);
              if (existing?.location) {
                return {
                  ...incoming,
                  location: existing.location,
                  operationalStatus: existing.operationalStatus,
                  distanceToRestaurantMeters: existing.distanceToRestaurantMeters,
                  isInsideGeofence: existing.isInsideGeofence,
                };
              }
            } else {
              latestRecordedAtRef.current.set(incoming.driverId, Math.max(lastAccepted, incomingTime));
            }
            return incoming;
          });

          return {
            ...data,
            drivers: sanitizedDrivers,
          };
        });
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load fleet map');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isAuthenticated]);

  // Tab visibility listener: immediately fetch authoritative state on returning to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabVisible(visible);
      if (visible && isAuthenticated) {
        loadData(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, loadData]);

  // Adaptive polling interval: 5s while tab is visible and active shifts exist,
  // 15s if no active shifts, 30s when tab is hidden
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      loadData(true);
    } else {
      loadData(false);
    }

    const getPollingIntervalMs = () => {
      if (!isTabVisible) return 30000; // 30s when tab is backgrounded
      if (fleet && fleet.summary.activeShifts === 0) return 15000; // 15s when fleet is inactive
      return 5000; // 5s when actively viewed
    };

    const intervalId = setInterval(() => {
      loadData(false);
    }, getPollingIntervalMs());

    return () => clearInterval(intervalId);
  }, [isAuthenticated, isTabVisible, fleet?.summary?.activeShifts, loadData]);

  // Filter drivers for the drawer list
  const visibleDrivers = useMemo(() => {
    if (!fleet) return [];
    return fleet.drivers.filter((d) => {
      const matchesFilter =
        statusFilter === 'ALL' || d.operationalStatus === statusFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        d.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [fleet, statusFilter, searchQuery]);

  return (
    <div>
      <PageHeader
        title={t('map.title')}
        subtitle={t('map.subtitle')}
        action={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRecenterTrigger((prev) => prev + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              title={t('settings.restaurant')}
            >
              <Store className="h-3.5 w-3.5 text-emerald-600" />
              <span>{t('settings.restaurant')}</span>
            </button>

            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </button>
          </div>
        }
      />

      {/* Filter and Legend Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'ALL', label: t('map.filterAll') },
            { key: 'MOVING', label: t('map.filterMoving') },
            { key: 'STOPPED', label: t('map.filterStopped') },
            { key: 'AT_RESTAURANT', label: t('map.filterRestaurant') },
            { key: 'OFFLINE', label: t('map.filterOffline') },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600">{t('map.filterMoving')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600">{t('map.filterStopped')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-600" />
            <span className="text-slate-600">{t('map.filterRestaurant')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-600">{t('map.filterOffline')}</span>
          </div>
        </div>
      </div>

      {loading && !fleet && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
          <p className="text-sm font-medium">{t('common.loading')}</p>
        </div>
      )}

      {error && !fleet && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="text-sm font-semibold">{t('common.error')}</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {fleet && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Map View */}
          <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm overflow-hidden">
            <LeafletMap
              fleet={fleet}
              statusFilter={statusFilter}
              selectedDriverId={selectedDriverId}
              onSelectDriver={handleSelectDriver}
              recenterTrigger={recenterTrigger}
              driverPanTrigger={driverPanTrigger}
            />
          </div>

          {/* Live Drivers Side Panel */}
          <div className="lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col h-[636px]">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Car className="h-4 w-4 text-emerald-600" />
                  <span>{t('nav.drivers')}</span>
                </h3>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                  {formatWesternNumber(visibleDrivers.length)}
                </span>
              </div>

              {/* Driver search inside panel */}
              <div className="relative">
                <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full rounded-xl border border-slate-200 py-1.5 pe-3 ps-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Drivers scroll list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pe-1 space-y-2">
              {visibleDrivers.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  {t('drivers.noDrivers')}
                </div>
              ) : (
                visibleDrivers.map((driver) => {
                  const visuals = getDriverVisuals(driver);
                  const isSelected = driver.driverId === selectedDriverId;

                  return (
                    <div
                      key={driver.driverId}
                      onClick={() => handleSelectDriver(driver.driverId)}
                      className={`p-2.5 rounded-xl cursor-pointer transition border ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                          : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 text-xs truncate max-w-[120px]">
                          {driver.driverName}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                          style={{
                            backgroundColor: `${visuals.fillColor}25`,
                            color: visuals.color,
                          }}
                        >
                          {driver.operationalStatus === 'OFFLINE'
                            ? (isRtl() ? 'آخر موقع معروف' : 'Last Known')
                            : visuals.statusLabel}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-500 font-mono mb-2 flex items-center justify-between">
                        <span>{formatWesternNumber(driver.employeeId)}</span>
                        {driver.operationalStatus !== 'OFFLINE' && driver.location?.speed != null ? (
                          <span className="font-bold text-slate-700">
                            {formatWesternNumber(Math.round(driver.location.speed * 3.6))} {t('map.kmh')}
                          </span>
                        ) : driver.operationalStatus === 'OFFLINE' ? (
                          <span className="text-slate-400">
                            {t('overview.offline')}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        {driver.device?.batteryPercentage != null ? (
                          <span className="flex items-center gap-1 font-medium text-slate-600">
                            {driver.device.isCharging ? (
                              <BatteryCharging className="h-3 w-3 text-emerald-600" />
                            ) : null}
                            {formatWesternNumber(driver.device.batteryPercentage)}%
                          </span>
                        ) : (
                          <span />
                        )}

                        <span className="text-[9px] text-slate-400">
                          {formatTimeAgo(driver.location?.recordedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

