'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Activity,
  BatteryCharging,
  BatteryWarning,
  BriefcaseBusiness,
  Car,
  CheckCircle2,
  Clock,
  Gauge,
  MapPin,
  PauseCircle,
  Radio,
  RefreshCw,
  Store,
} from 'lucide-react';
import { getLiveFleetStatus, type LiveFleetResponse, type FleetDriverLiveStatus } from '@/lib/api';
import { PageHeader, StatCard } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, formatWesternNumber, formatTimeAgo, isRtl } from '@/lib/i18n';

export default function DashboardOverviewPage() {
  const { isAuthenticated } = useAuth();
  const [fleet, setFleet] = useState<LiveFleetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async (showLoading = false) => {
    if (!isAuthenticated) return;
    if (showLoading) setLoading(true);
    setRefreshing(true);
    try {
      const data = await getLiveFleetStatus();
      if (mountedRef.current) {
        setFleet(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load fleet status');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isAuthenticated]);

  // Tab visibility listener: immediately fetch authoritative state on returning to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabVisible(visible);
      if (visible && isAuthenticated) {
        loadData(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, loadData]);

  // Adaptive polling interval: 5s while tab is visible and active shifts exist,
  // 15s if no active shifts, 30s when tab is hidden
  useEffect(() => {
    if (!isAuthenticated) return;
    loadData(true);

    const getPollingIntervalMs = () => {
      if (!isTabVisible) return 30000;
      if (fleet && fleet.summary.activeShifts === 0) return 15000;
      return 5000;
    };

    const intervalId = setInterval(() => {
      loadData(false);
    }, getPollingIntervalMs());

    return () => clearInterval(intervalId);
  }, [isAuthenticated, isTabVisible, fleet?.summary?.activeShifts, loadData]);

  if (loading && !fleet) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
        <p className="text-sm font-medium">{t('common.loading')}</p>
      </div>
    );
  }

  if (error && !fleet) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="font-semibold text-sm">{t('common.error')}</p>
        <p className="text-xs mt-1">{error}</p>
        <button
          type="button"
          onClick={() => loadData(true)}
          className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
        >
          {t('common.refresh')}
        </button>
      </div>
    );
  }

  const summary = fleet?.summary ?? {
    totalDrivers: 0,
    activeShifts: 0,
    onlineDrivers: 0,
    atRestaurant: 0,
    moving: 0,
    stopped: 0,
    offline: 0,
    lowBatteryCount: 0,
  };

  const getStatusBadge = (status: FleetDriverLiveStatus['operationalStatus']) => {
    switch (status) {
      case 'MOVING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
            {t('overview.moving')}
          </span>
        );
      case 'STOPPED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            <PauseCircle className="h-3 w-3 text-amber-600" />
            {t('overview.stopped')}
          </span>
        );
      case 'AT_RESTAURANT':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
            <Store className="h-3 w-3 text-sky-600" />
            {t('overview.atRestaurant')}
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            {t('overview.offline')}
          </span>
        );
    }
  };

  return (
    <div>
      <PageHeader
        title={t('overview.title')}
        subtitle={t('overview.subtitle')}
        action={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {t('overview.refreshing')}
            </span>
            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </button>
            <Link
              href="/dashboard/map"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>{t('nav.map')}</span>
            </Link>
          </div>
        }
      />

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('overview.totalDrivers')}
          value={summary.totalDrivers}
          detail={t('drivers.title')}
          icon={BriefcaseBusiness}
          variant="default"
        />
        <StatCard
          label={t('overview.activeShifts')}
          value={summary.activeShifts}
          detail={t('drivers.onShift')}
          icon={Activity}
          variant="success"
        />
        <StatCard
          label={t('overview.moving')}
          value={summary.moving}
          detail={`${t('overview.onlineDrivers')}: ${formatWesternNumber(summary.onlineDrivers)}`}
          icon={Car}
          variant="info"
        />
        <StatCard
          label={t('overview.atRestaurant')}
          value={summary.atRestaurant}
          detail={fleet?.restaurant.name ?? ''}
          icon={Store}
          variant="warning"
        />
      </div>

      {/* Secondary Status Row */}
      <div className="mt-4 grid gap-4 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{t('overview.stopped')}</span>
          <div className="text-xl font-bold text-amber-600 mt-1">
            {formatWesternNumber(summary.stopped)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{t('overview.offline')}</span>
          <div className="text-xl font-bold text-slate-500 mt-1">
            {formatWesternNumber(summary.offline)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{t('overview.lowBattery')}</span>
          <div className="text-xl font-bold text-rose-600 mt-1">
            {formatWesternNumber(summary.lowBatteryCount)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{t('overview.geofenceRadius')}</span>
          <div className="text-xl font-bold text-slate-800 mt-1">
            {formatWesternNumber(fleet?.restaurant.radiusMeters ?? 150)} {t('map.meters')}
          </div>
        </div>
      </div>

      {/* Live Fleet Table */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
            <h2 className="text-base font-bold text-slate-900">{t('overview.fleetStatus')}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {formatWesternNumber(fleet?.drivers.length ?? 0)}
            </span>
          </div>
          <Link
            href="/dashboard/drivers"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            {t('overview.viewAll')}
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-start">{t('drivers.name')}</th>
                <th className="px-5 py-3 text-start">{t('drivers.employeeId')}</th>
                <th className="px-5 py-3 text-start">{t('drivers.shiftStatus')}</th>
                <th className="px-5 py-3 text-start">{t('drivers.battery')}</th>
                <th className="px-5 py-3 text-start">{t('map.speed')}</th>
                <th className="px-5 py-3 text-start">{t('drivers.lastSeen')}</th>
                <th className="px-5 py-3 text-start">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {!fleet?.drivers || fleet.drivers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {t('drivers.noDrivers')}
                  </td>
                </tr>
              ) : (
                fleet.drivers.map((driver) => (
                  <tr key={driver.driverId} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{driver.driverName}</div>
                      <div className="text-[11px] text-slate-400">{driver.driverEmail}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">
                      {formatWesternNumber(driver.employeeId)}
                    </td>
                    <td className="px-5 py-3.5">
                      {getStatusBadge(driver.operationalStatus)}
                    </td>
                    <td className="px-5 py-3.5">
                      {driver.device?.batteryPercentage != null ? (
                        <div className="flex items-center gap-1.5">
                          {driver.device.isCharging ? (
                            <BatteryCharging className="h-4 w-4 text-emerald-600" />
                          ) : driver.device.batteryPercentage <= 20 ? (
                            <BatteryWarning className="h-4 w-4 text-rose-600" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          )}
                          <span
                            className={
                              driver.device.batteryPercentage <= 20
                                ? 'font-bold text-rose-600'
                                : 'text-slate-700'
                            }
                          >
                            {formatWesternNumber(driver.device.batteryPercentage)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {driver.location?.speed != null ? (
                        <span>
                          {formatWesternNumber(Math.round(driver.location.speed * 3.6))} {t('map.kmh')}
                        </span>
                      ) : (
                        <span className="text-slate-400">0 {t('map.kmh')}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                      {formatTimeAgo(driver.device?.lastSeen || driver.location?.recordedAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/drivers/${driver.driverId}`}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        {t('common.details')}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
