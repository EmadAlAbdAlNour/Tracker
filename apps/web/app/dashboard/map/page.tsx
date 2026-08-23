'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { apiClient, type DriverSummary, type LocationPoint } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';

const LiveMap = dynamic(
  async () => {
    const { CircleMarker, MapContainer, Popup, TileLayer } = await import('react-leaflet');

    return function MapContent() {
      const [drivers, setDrivers] = useState<DriverSummary[]>([]);
      const [locations, setLocations] = useState<Record<string, LocationPoint | null>>({});
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      useEffect(() => {
        async function load() {
          try {
            const list = await apiClient.listDrivers();
            setDrivers(list);
            const locationMap: Record<string, LocationPoint | null> = {};
            for (const driver of list) {
              const result = await apiClient.getDriverLatestLocation(driver.id).catch(() => ({ location: null }));
              locationMap[driver.id] = result.location;
            }
            setLocations(locationMap);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load live map');
          } finally {
            setLoading(false);
          }
        }

        load();
      }, []);

      const markers = drivers.filter((driver) => {
        const point = locations[driver.id];
        return point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
      });

      return (
        <div>
          {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Loading live locations...</div> : null}
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-700">{error}</div> : null}
          {!loading && !error ? (
            markers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">No live driver locations are currently available.</div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-soft">
                <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom className="h-[500px] w-full">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                  {markers.map((driver) => {
                    const point = locations[driver.id]!;
                    return (
                      <CircleMarker key={driver.id} center={[point.latitude, point.longitude]} radius={10} color={driver.active ? '#10b981' : '#94a3b8'} fillColor={driver.active ? '#10b981' : '#94a3b8'} fillOpacity={0.9}>
                        <Popup>
                          <div className="space-y-1">
                            <div className="font-semibold">{driver.name}</div>
                            <div className="text-xs text-slate-600">{driver.email}</div>
                            <div className="text-xs text-slate-500">{point.recordedAt ? new Date(point.recordedAt).toLocaleString() : 'Unknown time'}</div>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
              </div>
            )
          ) : null}
        </div>
      );
    };
  },
  { ssr: false },
);

export default function MapPage() {
  return (
    <div>
      <PageHeader title="Live Map" subtitle="Current driver positions from the existing location API" />
      <LiveMap />
    </div>
  );
}
