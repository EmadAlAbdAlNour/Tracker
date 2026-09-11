'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import {
  BatteryCharging,
  BatteryWarning,
  Car,
  Layers,
  MapPin,
  PauseCircle,
  Radio,
  RefreshCw,
  Store,
} from 'lucide-react';
import { getLiveFleetStatus, type LiveFleetResponse, type FleetDriverLiveStatus } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { t, formatWesternNumber, formatTimeAgo, isRtl } from '@/lib/i18n';

const LeafletMap = dynamic(
  async () => {
    const { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } = await import('react-leaflet');

    // Component to auto-fit or center on restaurant/drivers
    function MapRecenter({ center }: { center: [number, number] }) {
      const map = useMap();
      useEffect(() => {
        map.setView(center, 14);
      }, [center, map]);
      return null;
    }

    return function MapInner({
      fleet,
      statusFilter,
    }: {
      fleet: LiveFleetResponse;
      statusFilter: string;
    }) {
      const restaurantCenter: [number, number] = [
        fleet.restaurant.latitude,
        fleet.restaurant.longitude,
      ];

      const filteredDrivers = fleet.drivers.filter((d) => {
        if (!d.location?.latitude || !d.location?.longitude) return false;
        if (statusFilter === 'ALL') return true;
        return d.operationalStatus === statusFilter;
      });

      const getMarkerColor = (status: FleetDriverLiveStatus['operationalStatus']) => {
        switch (status) {
          case 'MOVING':
            return '#10b981'; // emerald
          case 'STOPPED':
            return '#f59e0b'; // amber
          case 'AT_RESTAURANT':
            return '#0284c7'; // sky
          case 'OFFLINE':
          default:
            return '#94a3b8'; // slate
        }
      };

      return (
        <MapContainer
          center={restaurantCenter}
          zoom={14}
          scrollWheelZoom
          className="h-[620px] w-full rounded-2xl z-0"
        >
          <MapRecenter center={restaurantCenter} />
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
                radius={9}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#059669',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="p-1 space-y-1 text-xs">
                    <div className="font-bold text-slate-900 text-sm">
                      {fleet.restaurant.name}
                    </div>
                    <div className="text-slate-600">
                      {t('settings.radius')}: {formatWesternNumber(fleet.restaurant.radiusMeters)} {t('map.meters')}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </>
          )}

          {/* Drivers Markers */}
          {filteredDrivers.map((driver) => {
            const lat = driver.location!.latitude;
            const lng = driver.location!.longitude;
            const color = getMarkerColor(driver.operationalStatus);

            return (
              <CircleMarker
                key={driver.driverId}
                center={[lat, lng]}
                radius={driver.operationalStatus === 'MOVING' ? 9 : 8}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: color,
                  fillOpacity: 0.95,
                  weight: 2.5,
                }}
              >
                <Popup>
                  <div className="p-1.5 space-y-2 text-xs min-w-[180px]">
                    <div className="border-b border-slate-100 pb-1.5">
                      <div className="font-bold text-slate-900 text-sm">{driver.driverName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {t('drivers.employeeId')}: {formatWesternNumber(driver.employeeId)}
                      </div>
                    </div>

                    <div className="space-y-1 text-slate-600">
                      <div className="flex justify-between">
                        <span>{t('drivers.shiftStatus')}:</span>
                        <span className="font-bold" style={{ color }}>
                          {driver.operationalStatus === 'MOVING'
                            ? t('overview.moving')
                            : driver.operationalStatus === 'STOPPED'
                            ? t('overview.stopped')
                            : driver.operationalStatus === 'AT_RESTAURANT'
                            ? t('overview.atRestaurant')
                            : t('overview.offline')}
                        </span>
                      </div>

                      {driver.location?.speed != null && (
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

                      <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                        <span>{t('map.lastUpdate')}:</span>
                        <span>{formatTimeAgo(driver.location?.recordedAt)}</span>
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
          })}
        </MapContainer>
      );
    };
  },
  { ssr: false },
);

export default function MapPage() {
  const [fleet, setFleet] = useState<LiveFleetResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData(showLoading = false) {
    if (showLoading) setLoading(true);
    setRefreshing(true);
    try {
      const data = await getLiveFleetStatus();
      setFleet(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet map');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => loadData(false), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <PageHeader
        title={t('map.title')}
        subtitle={t('map.subtitle')}
        action={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {t('overview.refreshing')}
            </span>
            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
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
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm overflow-hidden">
          <LeafletMap fleet={fleet} statusFilter={statusFilter} />
        </div>
      )}
    </div>
  );
}
