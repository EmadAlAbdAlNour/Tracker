'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BatteryCharging,
  BatteryWarning,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { listDevices, resetDriverDevice, type DeviceRecord } from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, formatTimeAgo } from '@/lib/i18n';

export default function DevicesPage() {
  const { isAuthenticated } = useAuth();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset device dialog
  const [targetDevice, setTargetDevice] = useState<DeviceRecord | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  async function loadData(isMounted = true) {
    setLoading(true);
    try {
      const res = await listDevices(1, 100);
      if (isMounted) {
        setDevices(res.items);
        setError(null);
      }
    } catch (err) {
      if (isMounted) {
        setError(err instanceof Error ? err.message : 'Failed to load devices');
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

  const handleReset = async () => {
    if (!targetDevice) return;
    setResetLoading(true);
    try {
      await resetDriverDevice(targetDevice.driverId);
      setFeedbackMessage(t('drivers.deviceResetSuccess'));
      setTargetDevice(null);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset device');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('devices.title')}
        subtitle={t('devices.subtitle')}
        action={
          <button
            type="button"
            onClick={() => loadData()}
            title={t('common.refresh')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </button>
        }
      />

      {feedbackMessage && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 flex items-center justify-between">
          <span>{feedbackMessage}</span>
          <button type="button" onClick={() => setFeedbackMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            ×
          </button>
        </div>
      )}

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
        <div className="space-y-4">
          {devices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              <p className="text-sm font-medium">{t('devices.noDevices')}</p>
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-200 transition"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/drivers/${device.driverId}`}
                          className="text-base font-bold text-slate-900 hover:text-emerald-600 transition"
                        >
                          {device.driverName || 'Driver'}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            device.authorized
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {device.authorized ? t('devices.authorized') : t('devices.unauthorized')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {t('drivers.employeeId')}: <strong className="font-mono text-slate-600">{formatWesternNumber(device.employeeId)}</strong> • {device.driverEmail}
                      </div>
                    </div>
                  </div>

                  {device.authorized && (
                    <button
                      type="button"
                      onClick={() => setTargetDevice(device)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{t('devices.reset')}</span>
                    </button>
                  )}
                </div>

                {/* Telemetry row */}
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-slate-400 block">{t('devices.platform')}</span>
                    <span className="font-semibold text-slate-800 uppercase mt-0.5 block">
                      {device.platform} {device.appVersion ? `v${device.appVersion}` : ''}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block">{t('drivers.battery')}</span>
                    <div className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                      {device.batteryPercentage != null ? (
                        <>
                          {device.isCharging ? (
                            <BatteryCharging className="h-3.5 w-3.5 text-emerald-600" />
                          ) : device.batteryPercentage <= 20 ? (
                            <BatteryWarning className="h-3.5 w-3.5 text-rose-600" />
                          ) : null}
                          <span className={device.batteryPercentage <= 20 ? 'text-rose-600 font-bold' : ''}>
                            {formatWesternNumber(device.batteryPercentage)}%
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block">{t('devices.gps')}</span>
                    <span
                      className={`inline-block mt-0.5 text-[11px] font-semibold ${
                        device.locationServicesEnabled !== false
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {device.locationServicesEnabled !== false ? t('devices.gpsEnabled') : t('devices.gpsDisabled')}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block">{t('drivers.lastSeen')}</span>
                    <span className="text-slate-600 font-mono mt-0.5 block">
                      {formatTimeAgo(device.lastSeen)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      {targetDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="rounded-full bg-rose-100 p-2">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">{t('drivers.resetDevice')}</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              {t('drivers.resetDeviceConfirm')} ({targetDevice.driverName})
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTargetDevice(null)}
                disabled={resetLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetLoading}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {resetLoading ? t('common.loading') : t('drivers.resetDevice')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
