'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  RefreshCw,
  Filter,
  Eye,
  X,
  FileCode,
  User,
  Clock,
  Layers,
} from 'lucide-react';
import { listAuditLogs, type AuditLogRecord } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, formatTimeAgo, isRtl } from '@/lib/i18n';

export default function AuditLogPage() {
  const { session, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const rtl = isRtl();

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector Modal State
  const [inspectLog, setInspectLog] = useState<AuditLogRecord | null>(null);

  useEffect(() => {
    if (!isLoading && session && session.user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [isLoading, session, router]);

  async function loadLogs() {
    setLoading(true);
    try {
      const res = await listAuditLogs({
        page,
        limit,
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
      });
      setLogs(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated && session?.user?.role === 'ADMIN') {
      loadLogs();
    }
  }, [isAuthenticated, session, page, actionFilter, entityFilter]);

  const getActionBadge = (action: string) => {
    if (action.includes('DELETE') || action.includes('PERMANENT') || action.includes('FORCE_END')) {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    if (action.includes('RESET')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (action.includes('SETTINGS')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (action.includes('CREATED')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={rtl ? 'سجل العمليات المركزي' : 'Centralized Audit Log'}
        subtitle={
          rtl
            ? 'سجل غير قابل للتعديل لكافة الإجراءات الإدارية، تعديلات المستخدمين والأجهزة والإعدادات'
            : 'Immutable trail of administrative mutations, driver/device management, and settings updates'
        }
        action={
          <button
            type="button"
            onClick={() => loadLogs()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{rtl ? 'تحديث' : 'Refresh'}</span>
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Filter className="h-4 w-4 text-slate-400" />
            <span>{rtl ? 'تصفية حسب الكيان:' : 'Entity Type:'}</span>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
            {['', 'USER', 'DRIVER', 'DEVICE', 'SETTINGS'].map((ent) => (
              <button
                key={ent}
                type="button"
                onClick={() => {
                  setEntityFilter(ent);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1 transition ${
                  entityFilter === ent
                    ? 'bg-white font-bold text-slate-900 shadow-sm'
                    : 'hover:text-slate-900'
                }`}
              >
                {ent === ''
                  ? rtl
                    ? 'الكل'
                    : 'All'
                  : ent}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          {rtl ? 'الإجمالي:' : 'Total:'} <span className="font-bold text-slate-800">{formatWesternNumber(total)}</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading && (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
            <p className="text-sm font-medium">{t('common.loading')}</p>
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="p-12 text-center text-slate-400">
            <ShieldCheck className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">
              {rtl ? 'لا توجد سجلات مطابقة' : 'No audit log entries found'}
            </p>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3 text-start">{rtl ? 'العملية' : 'Action'}</th>
                  <th className="px-5 py-3 text-start">{rtl ? 'المنفذ' : 'Actor'}</th>
                  <th className="px-5 py-3 text-start">{rtl ? 'الكيان' : 'Entity'}</th>
                  <th className="px-5 py-3 text-start">{rtl ? 'عنوان IP' : 'IP Address'}</th>
                  <th className="px-5 py-3 text-start">{rtl ? 'التاريخ والوقت' : 'Timestamp'}</th>
                  <th className="px-5 py-3 text-start"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadge(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-900">{log.userName || 'System'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{log.userRole || '—'}</div>
                    </td>
                    <td className="px-5 py-3 font-mono">
                      <span className="text-slate-500 font-semibold">{log.entityType}</span>
                      {log.entityId && (
                        <span className="ms-1 text-slate-400 text-[10px]">
                          ({log.entityId.slice(0, 8)}...)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-500 text-[11px]">
                      {log.ipAddress || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-[11px]">
                      <div>{formatWesternNumber(new Date(log.createdAt).toLocaleString('en-US'))}</div>
                      <div className="text-[10px] text-slate-400">{formatTimeAgo(log.createdAt)}</div>
                    </td>
                    <td className="px-5 py-3 text-end">
                      {log.details && (
                        <button
                          type="button"
                          onClick={() => setInspectLog(log)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>{rtl ? 'معاينة' : 'Inspect'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="border-t border-slate-100 p-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {rtl ? 'السابق' : 'Previous'}
            </button>
            <span className="text-xs font-medium text-slate-500">
              {rtl ? 'صفحة' : 'Page'} {formatWesternNumber(page)} / {formatWesternNumber(Math.ceil(total / limit))}
            </span>
            <button
              type="button"
              disabled={page * limit >= total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {rtl ? 'التالي' : 'Next'}
            </button>
          </div>
        )}
      </div>

      {/* Inspect Modal */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {rtl ? 'تفاصيل سجل العملية' : 'Audit Event Payload'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs mb-4">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">{rtl ? 'العملية:' : 'Action:'}</span>
                <span className="font-bold text-slate-900">{inspectLog.action}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">{rtl ? 'المنفذ:' : 'Actor:'}</span>
                <span className="font-medium text-slate-800">
                  {inspectLog.userName} ({inspectLog.userRole})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">{rtl ? 'التاريخ والوقت:' : 'Timestamp:'}</span>
                <span className="font-mono text-slate-600">
                  {formatWesternNumber(new Date(inspectLog.createdAt).toISOString())}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950 p-4 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-72">
              <pre>{JSON.stringify(inspectLog.details, null, 2)}</pre>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {rtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
