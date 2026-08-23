'use client';

import { Activity, BriefcaseBusiness, Gauge, UserCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient, type DriverSummary, type SessionUser } from '@/lib/api';
import { PageHeader, StatCard } from '@/components/dashboard-shell';

export default function DashboardOverviewPage() {
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [driverList, currentUser] = await Promise.all([apiClient.listDrivers(), apiClient.getCurrentUser()]);
        setDrivers(driverList);
        setUser(currentUser);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-700">{error}</div>;
  }

  const activeDrivers = drivers.filter((driver) => driver.active).length;
  const onlineDrivers = drivers.filter((driver) => driver.active).length;

  return (
    <div>
      <PageHeader title="Overview" subtitle="Live fleet status from the existing Tracker API" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Drivers" value={String(drivers.length)} detail="Drivers in the tracker roster" icon={BriefcaseBusiness} />
        <StatCard label="Active Drivers" value={String(activeDrivers)} detail="Driver profiles currently enabled" icon={Activity} />
        <StatCard label="Online / Tracking" value={String(onlineDrivers)} detail="Drivers with active tracking status" icon={Gauge} />
        <StatCard label="Current User" value={user?.role ?? '—'} detail={user ? user.name : 'User profile'} icon={UserCircle2} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Recent driver activity</h2>
          <div className="space-y-3">
            {drivers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No drivers are currently available from the API.</div>
            ) : (
              drivers.slice(0, 5).map((driver) => (
                <div key={driver.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="font-medium text-slate-800">{driver.name}</div>
                    <div className="text-sm text-slate-500">{driver.email}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${driver.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {driver.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Account</h2>
          {user ? (
            <div className="space-y-3 text-sm text-slate-600">
              <div><span className="font-medium text-slate-900">Name:</span> {user.name}</div>
              <div><span className="font-medium text-slate-900">Email:</span> {user.email}</div>
              <div><span className="font-medium text-slate-900">Role:</span> {user.role}</div>
              <div><span className="font-medium text-slate-900">Status:</span> {user.active ? 'Active' : 'Inactive'}</div>
            </div>
          ) : (
            <div className="text-slate-500">No profile loaded.</div>
          )}
        </div>
      </div>
    </div>
  );
}
