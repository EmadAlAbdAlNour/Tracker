'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  BatteryCharging,
  BatteryWarning,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  User,
} from 'lucide-react';
import {
  getDriverById,
  getDriverHistory,
  getDriverLocations,
  resetDriverDevice,
  updateDriver,
  type DriverDetailResponse,
  type ShiftRecord,
  type LocationPoint,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, formatTimeAgo, isRtl } from '@/lib/i18n';

export default function DriverDetailsPage() {
  const { isAuthenticated, session } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const driverId = params.id;

  const [driver, setDriver] = useState<DriverDetailResponse['driver'] | null>(null);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [locations, setLocations] = useState<LocationPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset device dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function loadAll(isMounted = true) {
    setLoading(true);
    try {
      const [driverData, shiftData, locationData] = await Promise.all([
        getDriverById(driverId),
        getDriverHistory(driverId, 1, 10).catch(() => ({ items: [], total: 0, page: 1, limit: 10 })),
        getDriverLocations(driverId, 1, 10).catch(() => ({ items: [], total: 0, page: 1, limit: 10 })),
      ]);
      if (isMounted) {
        setDriver(driverData);
        setShifts(shiftData.items);
        setLocations(locationData.items);
        setError(null);
      }
    } catch (err) {
      if (isMounted) {
        setError(err instanceof Error ? err.message : 'Failed to load driver details');
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
    if (driverId) {
      loadAll(isMounted);
    }
    return () => {
      isMounted = false;
    };
  }, [driverId, isAuthenticated]);

  const [updating, setUpdating] = useState(false);

  const handleResetDevice = async () => {
    setResetLoading(true);
    try {
      await resetDriverDevice(driverId);
      setResetMessage(t('drivers.deviceResetSuccess'));
      setResetDialogOpen(false);
      await loadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset device');
    } finally {
      setResetLoading(false);
    }
  };

  const handleToggleActive = async () => {
    if (!driver) return;
    setUpdating(true);
    try {
      await updateDriver(driver.id, { active: !driver.active });
      await loadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update driver status');
    } finally {
      setUpdating(false);
    }
  };

  const BackIcon = isRtl() ? ArrowRight : ArrowLeft;

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
        <p className="text-sm font-medium">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !driver) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="font-semibold text-sm">{t('common.error')}</p>
        <p className="text-xs mt-1">{error || 'Driver not found'}</p>
        <Link
          href="/dashboard/drivers"
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 hover:underline"
        >
          <BackIcon className="h-3.5 w-3.5" />
          <span>{t('drivers.title')}</span>
        </Link>
      </div>
    );
  }

  const device = driver.device;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/dashboard/drivers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <BackIcon className="h-3.5 w-3.5" />
          <span>{t('drivers.title')}</span>
        </Link>
      </div>

      <PageHeader
        title={driver.name}
        subtitle={`${t('drivers.employeeId')}: ${formatWesternNumber(driver.employeeId)}`}
        action={
          <div className="flex items-center gap-3">
            {device && session?.user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => setResetDialogOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('drivers.resetDevice')}</span>
              </button>
            )}
          </div>
        }
      />

      {resetMessage && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 flex items-center justify-between">
          <span>{resetMessage}</span>
          <button type="button" onClick={() => setResetMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            ×
          </button>
        </div>
      )}

      {/* Grid: Driver Profile & Authorized Device */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">{t('drivers.viewDetails')}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  driver.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {driver.active ? t('drivers.active') : t('drivers.inactive')}
              </span>
              {(session?.user?.role === 'ADMIN' || session?.user?.role === 'MANAGER') && (
                <button
                  type="button"
                  onClick={handleToggleActive}
                  disabled={updating}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition disabled:opacity-50 ${
                    driver.active
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {updating ? t('common.loading') : driver.active ? t('users.deactivate') : t('users.activate')}
                </button>
              )}
            </div>
          </div>

          <dl className="space-y-3.5 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <dt className="font-medium text-slate-500">{t('drivers.name')}</dt>
              <dd className="font-semibold text-slate-900">{driver.name}</dd>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <dt className="font-medium text-slate-500">{t('drivers.email')}</dt>
              <dd className="font-mono text-slate-800">{driver.email}</dd>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <dt className="font-medium text-slate-500">{t('drivers.phone')}</dt>
              <dd className="font-mono text-slate-800">{driver.phone ? formatWesternNumber(driver.phone) : '—'}</dd>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <dt className="font-medium text-slate-500">{t('drivers.employeeId')}</dt>
              <dd className="font-mono font-bold text-slate-900">{formatWesternNumber(driver.employeeId)}</dd>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <dt className="font-medium text-slate-500">{t('drivers.shiftStatus')}</dt>
              <dd>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    driver.currentShiftStatus === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {driver.currentShiftStatus === 'ACTIVE' ? t('drivers.onShift') : t('drivers.offShift')}
                </span>
              </dd>
            </div>
            {driver.currentShiftStartedAt && (
              <div className="flex justify-between items-center py-1">
                <dt className="font-medium text-slate-500">{t('drivers.lastSeen')}</dt>
                <dd className="text-slate-600">{formatTimeAgo(driver.currentShiftStartedAt)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Device Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">{t('drivers.deviceStatus')}</h2>
            </div>
            {device && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {t('devices.authorized')}
              </span>
            )}
          </div>

          {!device ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
              {t('devices.noDevices')}
            </div>
          ) : (
            <dl className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <dt className="font-medium text-slate-500">{t('devices.platform')}</dt>
                <dd className="font-semibold text-slate-800 uppercase">{device.platform}</dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <dt className="font-medium text-slate-500">{t('devices.deviceIdentifier')}</dt>
                <dd className="font-mono text-slate-700 truncate max-w-[200px]" title={device.deviceIdentifier || ''}>
                  {device.deviceIdentifier || '—'}
                </dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <dt className="font-medium text-slate-500">{t('devices.appVersion')}</dt>
                <dd className="font-mono text-slate-800">{device.appVersion || '—'}</dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <dt className="font-medium text-slate-500">{t('drivers.battery')}</dt>
                <dd>
                  {device.batteryPercentage != null ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                      {device.isCharging ? (
                        <BatteryCharging className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                      {formatWesternNumber(device.batteryPercentage)}%
                    </span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <dt className="font-medium text-slate-500">{t('devices.gps')}</dt>
                <dd>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      device.locationServicesEnabled !== false
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {device.locationServicesEnabled !== false ? t('devices.gpsEnabled') : t('devices.gpsDisabled')}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between items-center py-1">
                <dt className="font-medium text-slate-500">{t('drivers.lastSeen')}</dt>
                <dd className="text-slate-600">{formatTimeAgo(device.lastSeen)}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {/* Shifts History Table */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">{t('drivers.shiftsHistory')}</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-start">{t('drivers.shiftStatus')}</th>
                <th className="px-5 py-3 text-start">البدء</th>
                <th className="px-5 py-3 text-start">الانتهاء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-slate-400">
                    لا توجد ورديات مسجلة
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          shift.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {shift.status === 'ACTIVE' ? t('drivers.onShift') : t('drivers.offShift')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-mono">
                      {formatWesternNumber(new Date(shift.startedAt || shift.startTime || Date.now()).toLocaleString('en-US'))}
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-mono">
                      {shift.endedAt
                        ? formatWesternNumber(new Date(shift.endedAt).toLocaleString('en-US'))
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Locations Table */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">{t('drivers.locationHistory')}</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-start">الإحداثيات</th>
                <th className="px-5 py-3 text-start">{t('map.speed')}</th>
                <th className="px-5 py-3 text-start">الدقة</th>
                <th className="px-5 py-3 text-start">الوقت المسجل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">
                    لا توجد نقاط موقع مسجلة حديثاً
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr key={loc.id}>
                    <td className="px-5 py-3 font-mono text-slate-800">
                      {formatWesternNumber(loc.latitude.toFixed(5))}, {formatWesternNumber(loc.longitude.toFixed(5))}
                    </td>
                    <td className="px-5 py-3">
                      {loc.speed != null ? `${formatWesternNumber(Math.round(loc.speed * 3.6))} ${t('map.kmh')}` : '0'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {loc.accuracy != null ? `±${formatWesternNumber(Math.round(loc.accuracy))} ${t('map.meters')}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-[11px]">
                      {formatTimeAgo(loc.recordedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Device Reset Confirmation Dialog */}
      {resetDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="rounded-full bg-rose-100 p-2">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">{t('drivers.resetDevice')}</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              {t('drivers.resetDeviceConfirm')}
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetDialogOpen(false)}
                disabled={resetLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleResetDevice}
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
