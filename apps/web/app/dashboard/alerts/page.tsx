'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  RefreshCw,
  Filter,
  CheckCheck,
  ExternalLink,
} from 'lucide-react';
import {
  listNotifications,
  markNotificationRead,
  resolveNotification,
  markAllNotificationsRead,
  type NotificationItem,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, formatTimeAgo, isRtl, getLocale } from '@/lib/i18n';

export default function AlertsCenterPage() {
  const { isAuthenticated } = useAuth();
  const rtl = isRtl();
  const locale = getLocale();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('UNRESOLVED');
  const [page, setPage] = useState(1);
  const limit = 20;

  async function loadAlerts() {
    setLoading(true);
    try {
      const res = await listNotifications({
        page,
        limit,
        severity: severityFilter === 'ALL' ? undefined : severityFilter,
        resolved: statusFilter === 'ALL' ? undefined : statusFilter === 'RESOLVED',
      });
      setNotifications(res.items);
      setTotal(res.total);
      setUnreadCount(res.unreadCount);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadAlerts();
    }
  }, [isAuthenticated, severityFilter, statusFilter, page]);

  const handleResolve = async (id: string) => {
    try {
      await resolveNotification(id);
      await loadAlerts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resolve alert');
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      await loadAlerts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to mark read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      await loadAlerts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to mark all read');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={rtl ? 'مركز التنبيهات' : 'Alert Center'}
        subtitle={
          rtl
            ? 'متابعة وإدارة التنبيهات التشغيلية، الإشارات المفقودة، وانخفاض البطارية'
            : 'Monitor and triage operational alerts, stale GPS, and critical battery warnings'
        }
        action={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              <span>{rtl ? 'تحديد الكل كمقروء' : 'Mark All Read'}</span>
            </button>
            <button
              type="button"
              onClick={() => loadAlerts()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{rtl ? 'تحديث' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Filter className="h-4 w-4 text-slate-400" />
            <span>{rtl ? 'مستوى الخطورة:' : 'Severity:'}</span>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
            {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => {
                  setSeverityFilter(sev);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1 transition ${
                  severityFilter === sev
                    ? 'bg-white font-bold text-slate-900 shadow-sm'
                    : 'hover:text-slate-900'
                }`}
              >
                {sev === 'ALL'
                  ? rtl
                    ? 'الكل'
                    : 'All'
                  : sev === 'CRITICAL'
                  ? rtl
                    ? 'حرج'
                    : 'Critical'
                  : sev === 'WARNING'
                  ? rtl
                    ? 'تحذير'
                    : 'Warning'
                  : rtl
                  ? 'معلومات'
                  : 'Info'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 ms-4">
            <span>{rtl ? 'الحالة:' : 'Status:'}</span>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
            {(['UNRESOLVED', 'RESOLVED', 'ALL'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1 transition ${
                  statusFilter === st
                    ? 'bg-white font-bold text-slate-900 shadow-sm'
                    : 'hover:text-slate-900'
                }`}
              >
                {st === 'UNRESOLVED'
                  ? rtl
                    ? 'قيد المعالجة'
                    : 'Unresolved'
                  : st === 'RESOLVED'
                  ? rtl
                    ? 'تم الحل'
                    : 'Resolved'
                  : rtl
                  ? 'الكل'
                  : 'All'}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          {rtl ? 'الإجمالي:' : 'Total:'} <span className="font-bold text-slate-800">{formatWesternNumber(total)}</span>
        </div>
      </div>

      {/* Alerts List */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading && (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
            <p className="text-sm font-medium">{t('common.loading')}</p>
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="p-12 text-center text-slate-400">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              {rtl ? 'لا توجد تنبيهات مطابقة للشروط' : 'No alerts match the selected criteria'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {rtl ? 'جميع السائقين والعمليات تعمل بشكل طبيعي' : 'All drivers and operations are running normally'}
            </p>
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <div className="divide-y divide-slate-100">
            {notifications.map((item) => {
              const isCritical = item.severity === 'CRITICAL';
              const isWarning = item.severity === 'WARNING';

              const Icon = isCritical ? AlertTriangle : isWarning ? AlertCircle : Info;
              const iconColor = isCritical
                ? 'text-rose-600 bg-rose-50 border-rose-200'
                : isWarning
                ? 'text-amber-600 bg-amber-50 border-amber-200'
                : 'text-blue-600 bg-blue-50 border-blue-200';

              const title = locale === 'ar' ? item.titleAr : item.titleEn;
              const message = locale === 'ar' ? item.messageAr : item.messageEn;

              return (
                <div
                  key={item.id}
                  className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
                    !item.read ? 'bg-amber-50/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`rounded-xl border p-2.5 shrink-0 ${iconColor}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{title}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isCritical
                              ? 'bg-rose-100 text-rose-800'
                              : isWarning
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {item.severity}
                        </span>
                        {item.resolved ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            {rtl ? 'تم الحل' : 'Resolved'}
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                            {rtl ? 'نشط' : 'Active'}
                          </span>
                        )}
                        {!item.read && (
                          <span className="h-2 w-2 rounded-full bg-amber-500" title="Unread" />
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-2xl">{message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                        <span>{formatTimeAgo(item.createdAt)}</span>
                        {item.driverId && (
                          <Link
                            href={`/dashboard/drivers/${item.driverId}`}
                            className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline"
                          >
                            <span>{rtl ? 'عرض السائق' : 'View Driver'}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {!item.read && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(item.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        {rtl ? 'كمقروء' : 'Mark Read'}
                      </button>
                    )}
                    {!item.resolved && (
                      <button
                        type="button"
                        onClick={() => handleResolve(item.id)}
                        className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                      >
                        {rtl ? 'حل التنبيه' : 'Resolve'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
