'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { listDrivers, createDriver, type DriverSummary } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, isRtl } from '@/lib/i18n';

export default function DriversPage() {
  const { isAuthenticated, session } = useAuth();
  const [drivers, setDrivers] = useState<DriverSummary[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    employeeId: '',
    password: '',
    active: true,
  });

  async function loadData(isMounted = true) {
    setLoading(true);
    try {
      const res = await listDrivers(1, 100);
      if (isMounted) {
        setDrivers(res.items);
        setError(null);
      }
    } catch (err) {
      if (isMounted) {
        setError(err instanceof Error ? err.message : 'Failed to load drivers');
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;
    loadData(isMounted);
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      await createDriver({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        employeeId: formData.employeeId.trim(),
        password: formData.password,
        active: formData.active,
      });
      setModalOpen(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        employeeId: '',
        password: '',
        active: true,
      });
      await loadData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create driver');
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const matchesText =
        !query.trim() ||
        `${driver.name} ${driver.email} ${driver.employeeId} ${driver.phone ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && driver.active) ||
        (statusFilter === 'INACTIVE' && !driver.active);

      return matchesText && matchesStatus;
    });
  }, [drivers, query, statusFilter]);

  return (
    <div>
      <PageHeader
        title={t('drivers.title')}
        subtitle={t('drivers.subtitle')}
        action={
          session?.user?.role === 'ADMIN' ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                <UserPlus className="h-4 w-4" />
                <span>{t('drivers.addDriver')}</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Filter and Search Bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('drivers.search')}
            className="w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 py-2.5 text-xs text-slate-900 outline-none transition focus:border-emerald-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st === 'ALL'
                ? t('common.filter') + ': ' + (isRtl() ? 'الكل' : 'All')
                : st === 'ACTIVE'
                ? t('drivers.active')
                : t('drivers.inactive')}
            </button>
          ))}

          <button
            type="button"
            onClick={() => loadData()}
            title={t('common.refresh')}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
          <p className="text-sm font-medium">{t('common.loading')}</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="text-sm font-semibold">{t('common.error')}</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {filteredDrivers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              <p className="text-sm font-medium">{t('drivers.noDrivers')}</p>
            </div>
          ) : (
            filteredDrivers.map((driver) => (
              <div
                key={driver.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-200 transition"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 font-bold">
                      {driver.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">{driver.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            driver.active
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {driver.active ? t('drivers.active') : t('drivers.inactive')}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>{driver.email}</span>
                        {driver.phone && <span>• {formatWesternNumber(driver.phone)}</span>}
                        <span>• {t('drivers.employeeId')}: <strong className="font-mono text-slate-700">{formatWesternNumber(driver.employeeId)}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/drivers/${driver.id}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                    >
                      <span>{t('drivers.viewDetails')}</span>
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Driver Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">{t('drivers.addDriver')}</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDriver} className="mt-4 space-y-4">
              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {createError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('drivers.name')} *
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('drivers.email')} *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('drivers.phone')}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('drivers.employeeId')} *
                  </label>
                  <input
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('drivers.password')} *
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500"
                    placeholder="Min 8 characters"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="activeCheck" className="text-xs font-semibold text-slate-700">
                  {t('drivers.active')}
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {createLoading ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
