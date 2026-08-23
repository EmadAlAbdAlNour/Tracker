'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, type DriverDetailResponse } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';

export default function DriverDetailsPage() {
  const params = useParams<{ id: string }>();
  const [driver, setDriver] = useState<DriverDetailResponse['driver'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const detail = await apiClient.getDriverById(params.id);
        setDriver(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load driver details');
      } finally {
        setLoading(false);
      }
    }

    if (params.id) {
      load();
    }
  }, [params.id]);

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Loading driver details...</div>;
  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-700">{error}</div>;
  if (!driver) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">No driver details found.</div>;

  return (
    <div>
      <PageHeader title={driver.name} subtitle={`Employee ID: ${driver.employeeId}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Profile</h2>
          <dl className="space-y-3 text-sm text-slate-600">
            <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Email</dt><dd>{driver.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Phone</dt><dd>{driver.phone ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Role</dt><dd>{driver.role}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Profile status</dt><dd>{driver.active ? 'Active' : 'Inactive'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Current shift</dt><dd>{driver.currentShiftStatus ?? 'None'}</dd></div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Device</h2>
          {driver.device ? (
            <dl className="space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Platform</dt><dd>{driver.device.platform}</dd></div>
              <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Device ID</dt><dd>{driver.device.deviceIdentifier ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">App version</dt><dd>{driver.device.appVersion ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="font-medium text-slate-900">Last seen</dt><dd>{driver.device.lastSeen ?? '—'}</dd></div>
            </dl>
          ) : (
            <div className="text-slate-500">No device is currently registered for this driver.</div>
          )}
        </div>
      </div>
    </div>
  );
}
