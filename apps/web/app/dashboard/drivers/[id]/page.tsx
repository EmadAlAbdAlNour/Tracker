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
  Trash2,
  User,
} from 'lucide-react';
import {
  getDriverById,
  getDriverHistory,
  getDriverLocations,
  getDriverActivity,
  forceEndDriverShift,
  resetDriverDevice,
  updateDriver,
  permanentDeleteUser,
  type DriverDetailResponse,
  type ShiftRecord,
  type LocationPoint,
  type ActivityEvent,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, formatTimeAgo, isRtl } from '@/lib/i18n';
import { resolveActivityPresentation } from '@/lib/telemetry';

export default function DriverDetailsPage() {
  const { isAuthenticated, session } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const driverId = params.id;
  const rtl = isRtl();

  const [driver, setDriver] = useState<DriverDetailResponse['driver'] | null>(null);
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Force end shift
  const [forceEndLoading, setForceEndLoading] = useState(false);

  // Reset device dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Permanent Delete Modal State
  const [permanentDeleteDialogOpen, setPermanentDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handlePermanentDeleteDriver = async () => {
    if (!driver) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await permanentDeleteUser(driver.userId);
      router.push('/dashboard/drivers');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to permanently delete driver');
      setDeleteLoading(false);
    }
  };

  const handleForceEndShift = async () => {
    if (!confirm(rtl ? 'هل أنت متأكد من إنهاء هذه الوردية إجبارياً؟' : 'Are you sure you want to force end this shift?')) return;
    setForceEndLoading(true);
    try {
      await forceEndDriverShift(driverId);
      await loadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to force end shift');
    } finally {
      setForceEndLoading(false);
    }
  };

  async function loadAll(isMounted = true) {
    setLoading(true);
    try {
      const [driverData, shiftData, locationData, activityData] = await Promise.all([
        getDriverById(driverId),
        getDriverHistory(driverId, 1, 10).catch(() => ({ items: [], total: 0, page: 1, limit: 10 })),
        getDriverLocations(driverId, { page: 1, limit: 20 }).catch(() => ({ items: [], total: 0, page: 1, limit: 20 })),
        getDriverActivity(driverId).catch(() => ({ driverId, items: [] })),
      ]);
      if (isMounted) {
        setDriver(driverData);
        setShifts(shiftData.items);
        setLocations(locationData.items);
        setActivities(activityData.items || []);
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
            {driver.currentShiftStatus === 'ACTIVE' && (
              <button
                type="button"
                onClick={handleForceEndShift}
                disabled={forceEndLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition disabled:opacity-50"
              >
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                <span>{forceEndLoading ? (rtl ? 'جاري الإنهاء...' : 'Ending...') : (rtl ? 'إنهاء الوردية إجبارياً' : 'Force End Shift')}</span>
              </button>
            )}
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
            {session?.user?.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => setPermanentDeleteDialogOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{rtl ? 'حذف السائق نهائياً' : 'Permanent Delete'}</span>
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
              {session?.user?.role === 'ADMIN' && (
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
                      ? locations.length === 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {driver.currentShiftStatus === 'ACTIVE'
                    ? locations.length === 0
                      ? t('drivers.awaitingTelemetry')
                      : t('drivers.onShift')
                    : t('drivers.offShift')}
                </span>
              </dd>
            </div>
            {driver.currentShiftStartedAt && (
              <div className="flex justify-between items-center py-1">
                <dt className="font-medium text-slate-500">{t('drivers.shiftStarted')}</dt>
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
                      device.locationServicesEnabled === true
                        ? 'bg-emerald-100 text-emerald-700'
                        : device.locationServicesEnabled === false
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {device.locationServicesEnabled === true
                      ? t('devices.gpsEnabled')
                      : device.locationServicesEnabled === false
                      ? t('devices.gpsDisabled')
                      : t('devices.gpsUnknown')}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <dt className="font-medium text-slate-500">{t('devices.lastConnection')}</dt>
                <dd className="text-slate-600">{formatTimeAgo(device.lastSeen)}</dd>
              </div>
              <div className="flex justify-between items-center py-1">
                <dt className="font-medium text-slate-500">{t('devices.lastLocation')}</dt>
                <dd className="text-slate-600">{device.lastLocationAt ? formatTimeAgo(device.lastLocationAt) : '—'}</dd>
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
                <th className="px-5 py-3 text-start">{t('drivers.start')}</th>
                <th className="px-5 py-3 text-start">{t('drivers.end')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-slate-400">
                    {t('drivers.noShifts')}
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

      {/* Driver Activity Timeline */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">{rtl ? 'الجدول الزمني للنشاط' : 'Activity Timeline'}</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {formatWesternNumber(activities.length)} {rtl ? 'حدث' : 'events'}
          </span>
        </div>

        <div className="p-6">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              {rtl ? 'لا توجد أنشطة مسجلة لهذه الفترة' : 'No recorded activity events for this period.'}
            </div>
          ) : (
            <div className="relative border-s-2 border-slate-100 ms-3 space-y-6">
              {activities.map((event) => {
                const isAlert = event.type === 'ALERT';
                const isStart = event.type === 'SHIFT_STARTED';
                const isEnd = event.type === 'SHIFT_ENDED';
                const isRestaurant = event.type === 'ARRIVED_AT_RESTAURANT' || event.type === 'LEFT_RESTAURANT';
                const isMoving = event.type === 'MOVING';

                const dotColor = isAlert
                  ? 'bg-rose-500 border-rose-100'
                  : isStart
                  ? 'bg-emerald-500 border-emerald-100'
                  : isEnd
                  ? 'bg-slate-500 border-slate-100'
                  : isRestaurant
                  ? 'bg-blue-500 border-blue-100'
                  : isMoving
                  ? 'bg-teal-500 border-teal-100'
                  : 'bg-amber-500 border-amber-100';

                const presentation = resolveActivityPresentation(
                  event.type,
                  rtl,
                  event.title,
                  event.description,
                  event.metadata
                );

                return (
                  <div key={event.id} className="relative ps-6">
                    <div className={`absolute -start-[9px] top-1 h-4 w-4 rounded-full border-2 ${dotColor}`} />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="text-xs font-bold text-slate-900">
                        {presentation.title}
                      </span>
                      <time className="text-[11px] font-mono text-slate-400">
                        {formatWesternNumber(new Date(event.timestamp).toLocaleTimeString('en-US'))} ({formatTimeAgo(event.timestamp)})
                      </time>
                    </div>
                    {presentation.description && (
                      <p className="mt-1 text-xs text-slate-600">{presentation.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Locations Table */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">{t('drivers.locationHistory')}</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {formatWesternNumber(locations.length)} {rtl ? 'نقطة مسجلة' : 'points'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-start">{t('drivers.coordinates')}</th>
                <th className="px-5 py-3 text-start">{rtl ? 'الحالة التشغيلية' : 'Status'}</th>
                <th className="px-5 py-3 text-start">{t('map.speed')}</th>
                <th className="px-5 py-3 text-start">{t('drivers.accuracy')}</th>
                <th className="px-5 py-3 text-start">{rtl ? 'نطاق المطعم' : 'Geofence'}</th>
                <th className="px-5 py-3 text-start">{t('drivers.recordedTime')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">
                    {t('drivers.noLocations')}
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr key={loc.id}>
                    <td className="px-5 py-3 font-mono text-slate-800">
                      {formatWesternNumber(Number(loc.latitude).toFixed(5))}, {formatWesternNumber(Number(loc.longitude).toFixed(5))}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        loc.operationalStatus === 'AT_RESTAURANT'
                          ? 'bg-blue-100 text-blue-800'
                          : loc.operationalStatus === 'MOVING'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {loc.operationalStatus || 'STOPPED'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {loc.speed != null ? `${formatWesternNumber(Math.round(Number(loc.speed) * 3.6))} ${t('map.kmh')}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      <span className={loc.accuracy != null && Number(loc.accuracy) <= 35 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-medium'}>
                        {loc.accuracy != null ? `±${formatWesternNumber(Math.round(Number(loc.accuracy)))} ${t('map.meters')}` : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        loc.isInsideGeofence ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500'
                      }`}>
                        {loc.isInsideGeofence ? (rtl ? 'داخل المطعم' : 'Inside') : (rtl ? 'خارج المطعم' : 'Outside')}
                        {loc.distanceToRestaurantMeters != null ? ` (${formatWesternNumber(Math.round(Number(loc.distanceToRestaurantMeters)))}m)` : ''}
                      </span>
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

      {/* Permanent Delete Confirmation Dialog */}
      {permanentDeleteDialogOpen && driver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 text-rose-600">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {rtl ? 'تأكيد الحذف النهائي لحساب السائق' : 'Confirm Permanent Driver Deletion'}
                </h3>
                <p className="text-xs text-rose-600 font-medium">
                  {rtl ? 'إجراء نهائي غير قابل للتراجع' : 'Permanent & Irreversible Action'}
                </p>
              </div>
            </div>

            <div className="py-4 text-xs text-slate-600 space-y-3">
              <p>
                {rtl ? (
                  <>
                    أنت على وشك حذف السائق <strong className="text-slate-900">{driver.name}</strong> (الرقم الوظيفي: {formatWesternNumber(driver.employeeId)}).
                  </>
                ) : (
                  <>
                    You are about to permanently delete driver <strong className="text-slate-900">{driver.name}</strong> (Employee ID: {formatWesternNumber(driver.employeeId)}).
                  </>
                )}
              </p>

              <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-3 text-xs font-semibold text-rose-800 leading-relaxed">
                {rtl
                  ? 'سيتم حذف الحساب وجميع بياناته نهائياً ولا يمكن التراجع عن هذا الإجراء.'
                  : 'This permanently deletes the account and all associated data. This action cannot be undone.'}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-[11px]">
                <div className="font-semibold text-slate-700">
                  {rtl ? 'تفاصيل الحذف الشامل:' : 'Deletion Breakdown:'}
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-500">
                  <li>{rtl ? 'حذف حساب المستخدم والسائق وبيانات الاعتماد وجلسات الدخول نهائياً.' : 'Completely remove driver and user account credentials, sessions, and data.'}</li>
                  <li>{rtl ? 'تحرير البريد الإلكتروني ورقم الهاتف والرقم الوظيفي لإعادة الاستخدام.' : 'Free email, phone number, and employee ID for future re-registration.'}</li>
                  <li>{rtl ? 'حذف كافة مسارات الموقع الجغرافي والورديات وسجلات الأجهزة والتنبيهات بالكامل.' : 'Permanently delete all GPS tracks, shifts, devices, and notification records.'}</li>
                </ul>
              </div>
              {deleteError && (
                <p className="rounded-lg bg-rose-50 p-2 text-rose-700 text-xs font-semibold">{deleteError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setPermanentDeleteDialogOpen(false);
                  setDeleteError(null);
                }}
                disabled={deleteLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handlePermanentDeleteDriver}
                disabled={deleteLoading}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {deleteLoading ? (
                  <span>{t('common.loading')}</span>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{rtl ? 'تأكيد الحذف النهائي' : 'Permanently Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
