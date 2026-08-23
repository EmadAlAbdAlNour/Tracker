'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiClient, type DriverSummary } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiClient.listDrivers();
        setDrivers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load drivers');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filteredDrivers = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return drivers;
    return drivers.filter((driver) => `${driver.name} ${driver.email} ${driver.employeeId}`.toLowerCase().includes(text));
  }, [drivers, query]);

  return (
    <div>
      <PageHeader
        title="Drivers"
        subtitle="Operational driver roster from the existing API"
        action={
          <div className="flex items-center gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search drivers"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500"
            />
          </div>
        }
      />

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Loading drivers...</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-rose-700">{error}</div> : null}

      {!loading && !error ? (
        <div className="space-y-3">
          {filteredDrivers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-500">No drivers match your current search.</div>
          ) : (
            filteredDrivers.map((driver) => (
              <Link key={driver.id} href={`/dashboard/drivers/${driver.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-soft transition hover:border-emerald-200 hover:shadow-md">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{driver.name}</div>
                    <div className="text-sm text-slate-500">{driver.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">Employee ID: {driver.employeeId}</span>
                    <span className={`rounded-full px-2.5 py-1 ${driver.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {driver.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
