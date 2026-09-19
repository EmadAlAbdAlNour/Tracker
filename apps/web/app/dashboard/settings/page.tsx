'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Globe,
  MapPin,
  RefreshCw,
  Save,
  Sliders,
  Store,
} from 'lucide-react';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  getAlertSettings,
  updateAlertSettings,
  type RestaurantSettings,
  type AlertSettings,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard-shell';
import { useAuth } from '@/components/auth-provider';
import { t, getLocale, setStoredLocale, formatWesternNumber, isRtl } from '@/lib/i18n';

export default function SettingsPage() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'restaurant' | 'alerts'>('restaurant');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Restaurant State
  const [restaurant, setRestaurant] = useState<RestaurantSettings>({
    name: 'Main Branch',
    latitude: 24.7136,
    longitude: 46.6753,
    radiusMeters: 150,
    enabled: true,
  });

  // Alerts State
  const [alerts, setAlerts] = useState<AlertSettings>({
    maxStopDurationMinutes: 10,
    offlineGraceMinutes: 5,
    lowBatteryThreshold: 20,
    criticalBatteryThreshold: 10,
    maxShiftDurationHours: 12,
    stopAlertEnabled: true,
    gpsAlertEnabled: true,
    offlineAlertEnabled: true,
    batteryAlertEnabled: true,
    restaurantGeofenceAlertEnabled: true,
    soundEnabled: true,
    inAppAlertsEnabled: true,
    pushAlertsEnabled: false,
  });

  const [currentLocale, setCurrentLocale] = useState(getLocale());

  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    async function load() {
      setLoading(true);
      try {
        const [rSettings, aSettings] = await Promise.all([
          getRestaurantSettings(),
          getAlertSettings(),
        ]);
        if (isMounted) {
          setRestaurant(rSettings);
          setAlerts(aSettings);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load settings');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const handleLanguageChange = (loc: 'ar' | 'en') => {
    setStoredLocale(loc);
    setCurrentLocale(loc);
  };

  const handleSaveRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const updated = await updateRestaurantSettings({
        name: restaurant.name.trim(),
        latitude: Number(restaurant.latitude),
        longitude: Number(restaurant.longitude),
        radiusMeters: Number(restaurant.radiusMeters),
        enabled: Boolean(restaurant.enabled),
      });
      setRestaurant(updated);
      setSuccessMessage(t('settings.savedSuccess'));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const updated = await updateAlertSettings({
        maxStopDurationMinutes: Number(alerts.maxStopDurationMinutes),
        offlineGraceMinutes: Number(alerts.offlineGraceMinutes),
        lowBatteryThreshold: Number(alerts.lowBatteryThreshold),
        criticalBatteryThreshold: Number(alerts.criticalBatteryThreshold),
        maxShiftDurationHours: Number(alerts.maxShiftDurationHours),
        stopAlertEnabled: Boolean(alerts.stopAlertEnabled),
        gpsAlertEnabled: Boolean(alerts.gpsAlertEnabled),
        offlineAlertEnabled: Boolean(alerts.offlineAlertEnabled),
        batteryAlertEnabled: Boolean(alerts.batteryAlertEnabled),
        restaurantGeofenceAlertEnabled: Boolean(alerts.restaurantGeofenceAlertEnabled),
        soundEnabled: Boolean(alerts.soundEnabled),
        inAppAlertsEnabled: Boolean(alerts.inAppAlertsEnabled),
      });
      setAlerts(updated);
      setSuccessMessage(t('settings.savedSuccess'));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('restaurant');
            setSuccessMessage(null);
          }}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition ${
            activeTab === 'restaurant'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Store className="h-4 w-4" />
          <span>{t('settings.tabs.restaurant')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('alerts');
            setSuccessMessage(null);
          }}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition ${
            activeTab === 'alerts'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>{t('settings.tabs.alerts')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('general');
            setSuccessMessage(null);
          }}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition ${
            activeTab === 'general'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Globe className="h-4 w-4" />
          <span>{t('settings.tabs.general')}</span>
        </button>
      </div>

      {successMessage && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
          <span>{errorMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600 mb-2" />
          <p className="text-sm font-medium">{t('common.loading')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm max-w-3xl">
          {/* Tab 1: Restaurant Geofence */}
          {activeTab === 'restaurant' && (
            <form onSubmit={handleSaveRestaurant} className="space-y-6">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('settings.restaurantName')}
                </label>
                <input
                  type="text"
                  value={restaurant.name}
                  onChange={(e) => setRestaurant({ ...restaurant, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('settings.latitude')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={restaurant.latitude}
                    onChange={(e) => setRestaurant({ ...restaurant, latitude: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('settings.longitude')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={restaurant.longitude}
                    onChange={(e) => setRestaurant({ ...restaurant, longitude: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('settings.radius')}
                </label>
                <input
                  type="number"
                  min="10"
                  max="50000"
                  value={restaurant.radiusMeters}
                  onChange={(e) => setRestaurant({ ...restaurant, radiusMeters: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  السائقون المتواجدون داخل هذا النطاق يُصنفون تلقائياً كـ (داخل المطعم).
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="geofenceEnabled"
                  checked={restaurant.enabled}
                  onChange={(e) => setRestaurant({ ...restaurant, enabled: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="geofenceEnabled" className="text-xs font-semibold text-slate-700">
                  {t('settings.geofenceEnabled')}
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? t('common.loading') : t('settings.save')}</span>
                </button>
              </div>
            </form>
          )}

          {/* Tab 2: Alerts & Tracking */}
          {activeTab === 'alerts' && (
            <form onSubmit={handleSaveAlerts} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('settings.maxStopDuration')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={alerts.maxStopDurationMinutes}
                    onChange={(e) => setAlerts({ ...alerts, maxStopDurationMinutes: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('settings.offlineGrace')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={alerts.offlineGraceMinutes}
                    onChange={(e) => setAlerts({ ...alerts, offlineGraceMinutes: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('settings.lowBattery')}
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={alerts.lowBatteryThreshold}
                    onChange={(e) => setAlerts({ ...alerts, lowBatteryThreshold: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    {t('settings.criticalBattery')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={alerts.criticalBatteryThreshold}
                    onChange={(e) => setAlerts({ ...alerts, criticalBatteryThreshold: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {t('settings.maxShiftDuration')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={alerts.maxShiftDurationHours}
                  onChange={(e) => setAlerts({ ...alerts, maxShiftDurationHours: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="stopAlertToggle"
                    checked={alerts.stopAlertEnabled}
                    onChange={(e) => setAlerts({ ...alerts, stopAlertEnabled: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="stopAlertToggle" className="text-xs font-semibold text-slate-700">
                    {t('settings.stopAlert')}
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="batteryAlertToggle"
                    checked={alerts.batteryAlertEnabled}
                    onChange={(e) => setAlerts({ ...alerts, batteryAlertEnabled: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="batteryAlertToggle" className="text-xs font-semibold text-slate-700">
                    {t('settings.batteryAlert')}
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="gpsAlertToggle"
                    checked={alerts.gpsAlertEnabled}
                    onChange={(e) => setAlerts({ ...alerts, gpsAlertEnabled: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="gpsAlertToggle" className="text-xs font-semibold text-slate-700">
                    {t('settings.gpsAlert')}
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? t('common.loading') : t('settings.save')}</span>
                </button>
              </div>
            </form>
          )}

          {/* Tab 3: General & Language */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  {t('app.language')}
                </label>
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('ar')}
                    className={`rounded-xl border p-3 text-center text-xs font-bold transition ${
                      currentLocale === 'ar'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    العربية (RTL)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('en')}
                    className={`rounded-xl border p-3 text-center text-xs font-bold transition ${
                      currentLocale === 'en'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    English (LTR)
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  الأرقام الغربية الموحدة (Western Digits)
                </label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  النظام مهيأ لاستخدام الأرقام الغربية القياسية (0 1 2 3 4 5 6 7 8 9) في كافة الواجهات والتقارير والعدادات والإحداثيات لضمان أقصى درجات الدقة والوضوح العملياتي.
                </p>
                <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3 font-mono text-xs text-slate-800">
                  مثال الأرقام: {formatWesternNumber(1234567.89)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
