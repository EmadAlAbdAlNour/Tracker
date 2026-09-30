'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  Clock,
  Compass,
  Download,
  ExternalLink,
  MapPin,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  BriefcaseBusiness,
} from 'lucide-react';
import { getReportsSummary, type ReportSummaryResponse } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, isRtl } from '@/lib/i18n';

export default function ReportsPage() {
  const { isAuthenticated } = useAuth();
  const rtl = isRtl();

  // Date filters
  const [preset, setPreset] = useState<'today' | 'yesterday' | '7days' | '30days'>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<ReportSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function computeDateRange(type: 'today' | 'yesterday' | '7days' | '30days') {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);

    if (type === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (type === 'yesterday') {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (type === '7days') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (type === '30days') {
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    }

    return {
      from: start.toISOString(),
      to: end.toISOString(),
    };
  }

  async function loadReport(fromStr?: string, toStr?: string) {
    setLoading(true);
    try {
      const dates = fromStr && toStr ? { from: fromStr, to: toStr } : computeDateRange(preset);
      const res = await getReportsSummary(dates);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadReport();
    }
  }, [isAuthenticated, preset]);

  const summary = data?.summary;
  const drivers = data?.drivers || data?.driverBreakdown || [];

  const formatHours = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs === 0) return `${formatWesternNumber(mins)}m`;
    return `${formatWesternNumber(hrs)}h ${formatWesternNumber(mins)}m`;
  };

  const formatKm = (meters: number) => {
    return `${formatWesternNumber((meters / 1000).toFixed(1))} km`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={rtl ? 'تقارير الأداء والعمليات' : 'Operational Reports & Analytics'}
        subtitle={
          rtl
            ? 'تحليل شامل لحركة السائقين، ساعات العمل، المسافات المقطوعة والتنبيهات المسجلة'
            : 'Comprehensive metrics on driver shifts, total distance, moving time, and alerts'
        }
        action={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => loadReport()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{rtl ? 'تحديث' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Date Range Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 me-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>{rtl ? 'الفترة الزمنية:' : 'Date Range:'}</span>
          </div>
          {(['today', 'yesterday', '7days', '30days'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                preset === p
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p === 'today'
                ? rtl
                  ? 'اليوم'
                  : 'Today'
                : p === 'yesterday'
                ? rtl
                  ? 'الأمس'
                  : 'Yesterday'
                : p === '7days'
                ? rtl
                  ? 'آخر 7 أيام'
                  : 'Last 7 Days'
                : rtl
                ? 'آخر 30 يوماً'
                : 'Last 30 Days'}
            </button>
          ))}
        </div>

        {summary && (
          <div className="text-xs text-slate-400 font-mono">
            {formatWesternNumber(new Date(summary.from).toLocaleDateString('en-US'))} —{' '}
            {formatWesternNumber(new Date(summary.to).toLocaleDateString('en-US'))}
          </div>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
          <p className="text-sm font-medium">{t('common.loading')}</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="font-semibold text-sm">{t('common.error')}</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Key Metrics Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold">{rtl ? 'إجمالي الورديات' : 'Total Shifts'}</span>
                <BriefcaseBusiness className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {formatWesternNumber(summary.totalShifts)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold">{rtl ? 'المسافة المقطوعة' : 'Distance'}</span>
                <Compass className="h-4 w-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {formatKm(summary.totalDistanceMeters)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold">{rtl ? 'إجمالي الساعات' : 'Total Hours'}</span>
                <Clock className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {formatHours(summary.totalDurationMinutes)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold">{rtl ? 'وقت الحركة' : 'Moving Time'}</span>
                <TrendingUp className="h-4 w-4 text-teal-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {formatHours(summary.movingDurationMinutes ?? summary.totalMovingMinutes ?? 0)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold">{rtl ? 'في المطعم' : 'At Restaurant'}</span>
                <MapPin className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {formatHours(summary.restaurantDurationMinutes ?? summary.totalRestaurantMinutes ?? 0)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold">{rtl ? 'التنبيهات' : 'Alerts'}</span>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {formatWesternNumber(summary.alertCount ?? summary.totalAlerts ?? 0)}
              </div>
            </div>
          </div>

          {/* Drivers Breakdown Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {rtl ? 'تفاصيل أداء السائقين' : 'Driver Performance Breakdown'}
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {formatWesternNumber(drivers.length)} {rtl ? 'سائق' : 'drivers'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3 text-start">{t('drivers.name')}</th>
                    <th className="px-5 py-3 text-start">{t('drivers.employeeId')}</th>
                    <th className="px-5 py-3 text-start">{rtl ? 'الورديات' : 'Shifts'}</th>
                    <th className="px-5 py-3 text-start">{rtl ? 'المسافة' : 'Distance'}</th>
                    <th className="px-5 py-3 text-start">{rtl ? 'إجمالي الساعات' : 'Duration'}</th>
                    <th className="px-5 py-3 text-start">{rtl ? 'وقت الحركة' : 'Moving'}</th>
                    <th className="px-5 py-3 text-start">{rtl ? 'وقت التوقف' : 'Stopped'}</th>
                    <th className="px-5 py-3 text-start">{rtl ? 'في المطعم' : 'Restaurant'}</th>
                    <th className="px-5 py-3 text-start">{rtl ? 'التنبيهات' : 'Alerts'}</th>
                    <th className="px-5 py-3 text-start"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {drivers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">
                        {rtl ? 'لا توجد بيانات مسجلة لهذه الفترة' : 'No records found for the selected period'}
                      </td>
                    </tr>
                  ) : (
                    drivers.map((drv) => (
                      <tr key={drv.driverId} className="hover:bg-slate-50/50 transition">
                        <td className="px-5 py-3 font-bold text-slate-900">{drv.driverName}</td>
                        <td className="px-5 py-3 font-mono text-slate-600">
                          {formatWesternNumber(drv.employeeId)}
                        </td>
                        <td className="px-5 py-3 font-mono">{formatWesternNumber(drv.shiftCount)}</td>
                        <td className="px-5 py-3 font-mono font-semibold text-blue-700">
                          {formatKm(drv.totalDistanceMeters ?? drv.distanceMeters ?? 0)}
                        </td>
                        <td className="px-5 py-3 font-mono">{formatHours(drv.totalDurationMinutes ?? drv.durationMinutes ?? 0)}</td>
                        <td className="px-5 py-3 font-mono text-emerald-700">
                          {formatHours(drv.movingDurationMinutes ?? drv.movingMinutes ?? 0)}
                        </td>
                        <td className="px-5 py-3 font-mono text-amber-700">
                          {formatHours(drv.stoppedDurationMinutes ?? drv.stoppedMinutes ?? 0)}
                        </td>
                        <td className="px-5 py-3 font-mono text-slate-600">
                          {formatHours(drv.restaurantDurationMinutes ?? drv.restaurantMinutes ?? 0)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              (drv.alertCount ?? drv.alerts ?? 0) > 0
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {formatWesternNumber(drv.alertCount ?? drv.alerts ?? 0)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-end">
                          <Link
                            href={`/dashboard/drivers/${drv.driverId}`}
                            className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline"
                          >
                            <span>{rtl ? 'التفاصيل' : 'Details'}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
