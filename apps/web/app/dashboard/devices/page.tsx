'use client';

import { useEffect, useState } from 'react';
import { apiClient, type DriverDetailResponse } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';

export default function DevicesPage() {
  const [drivers, setDrivers] = useState<Array<DriverDetailResponse['driver']>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const list = await apiClient.listDrivers();
        const details = await Promise.all(list.map((driver) => apiClient.getDriverById(driver.id)));
        setDrivers(details.map((detail) => ({ ...detail, role: detail.role, active: detail.active, employeeId: detail.employeeId })));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load devices');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div>
      <PageHeader title="Devices" subtitle="Current device registrations associated with drivers" />
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Loading devices...</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-700">{error}</div> : null}
      {!loading && !error ? (
        <div className="space-y-3">
          {drivers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">No device registrations are currently available.</div>
          ) : (
            drivers.map((driver) => (
              <div key={driver.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{driver.name}</div>
                    <div className="text-sm text-slate-500">{driver.email}</div>
                  </div>
                  <div className="text-sm text-slate-600">{driver.device ? driver.device.platform : 'No device linked'}</div>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                  <div><span className="font-medium text-slate-900">Device ID:</span> {driver.device?.deviceIdentifier ?? '—'}</div>
                  <div><span className="font-medium text-slate-900">Last seen:</span> {driver.device?.lastSeen ? new Date(driver.device.lastSeen).toLocaleString() : '—'}</div>
                  <div><span className="font-medium text-slate-900">App version:</span> {driver.device?.appVersion ?? '—'}</div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
