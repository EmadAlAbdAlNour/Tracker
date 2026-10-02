// Rebuilt Call Center Experience for Tracker Mobile
// Dedicated Operations Monitoring Console, Strictly Read-Only, Real Geographic Map

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, fonts, radius, shadows, spacing, typography } from '../designSystem';
import { AppIcon } from '../components/AppIcon';
import { AppHeader } from '../components/AppHeader';
import { BottomTabBar, type TabItem } from '../components/BottomTabBar';
import { RealGeographicMapView, type MapRestaurantPoint } from '../components/RealGeographicMapView';
import { DriverDetailModal } from '../components/DriverDetailModal';
import { formatWesternNumber, getLocale, getRowDirection, isRtl, setStoredLocale, t, type Locale } from '../i18n';
import { resolveBatteryFreshness } from '../telemetry';
import { type Session } from '../session';
import { NotificationService } from '../notificationService';

interface CallCenterHomeScreenProps {
  session: Session;
  apiUrl: string;
  apiRequest: <T>(path: string, options?: RequestInit, sessionOverride?: Session | null) => Promise<T>;
  onLogout: () => Promise<void>;
}

type CallCenterTab = 'dashboard' | 'map' | 'drivers' | 'notifications';

export function CallCenterHomeScreen({
  session,
  apiUrl,
  apiRequest,
  onLogout,
}: CallCenterHomeScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<CallCenterTab>('dashboard');
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [refreshing, setRefreshing] = useState(false);

  // Fleet & Telemetry Data
  const [fleet, setFleet] = useState<any | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [driverFocusTrigger, setDriverFocusTrigger] = useState(0);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [mapFilter, setMapFilter] = useState<string>('ALL');

  // Notifications Data
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const rtl = isRtl();
  const rowDir = getRowDirection();

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  const fleetLoadingRef = useRef(false);

  const loadFleet = useCallback(async (silent?: boolean | unknown) => {
    const isSilent = silent === true;
    if (fleetLoadingRef.current) return;
    fleetLoadingRef.current = true;
    try {
      if (!isSilent) setFleetLoading(true);
      setFleetError(null);
      const data = await apiRequest<any>('/api/fleet/live');
      setFleet(data);
    } catch (err: any) {
      if (err?.status === 401 || err?.code === 'AUTH_SESSION_EXPIRED' || err?.code === 'AUTH_INVALID_TOKEN') {
        await onLogout();
        return;
      }
      if (!isSilent) {
        setFleetError(err?.message || 'Failed to connect to server');
      }
    } finally {
      fleetLoadingRef.current = false;
      if (!isSilent) setFleetLoading(false);
    }
  }, [apiRequest, onLogout]);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest<any>('/api/notifications?limit=30');
      setNotifications(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // ignore
    }
  }, [apiRequest]);

  const [markingAllRead, setMarkingAllRead] = useState(false);

  const handleMarkNotificationRead = useCallback(async (notificationId: string) => {
    try {
      await apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }, [apiRequest]);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    if (markingAllRead) return;
    setMarkingAllRead(true);
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setMarkingAllRead(false);
    }
  }, [apiRequest, markingAllRead]);

  const handleNotificationTap = useCallback(async (notif: any) => {
    // 1. Mark notification as read if unread
    if (!notif.read) {
      await handleMarkNotificationRead(notif.id);
    }

    // 2. If driverId is present, navigate to driver on map and show detail modal
    if (notif.driverId) {
      const driversList = fleet?.drivers ?? [];
      const foundDriver = driversList.find(
        (d: any) => d.driverId === notif.driverId || d.id === notif.driverId
      );

      if (foundDriver) {
        setSelectedDriver(foundDriver);
        setDriverFocusTrigger((prev) => prev + 1);
        setActiveTab('map');
        setDriverModalVisible(true);
      }
    }
  }, [fleet, handleMarkNotificationRead]);

  useEffect(() => {
    NotificationService.getInitialNotification().then((initial) => {
      if (initial && initial.action === 'OPEN_NOTIFICATIONS') {
        setActiveTab('notifications');
        if (initial.notificationId) {
          handleMarkNotificationRead(initial.notificationId);
        }
      }
    });

    const unsubscribe = NotificationService.onNotificationTap((data) => {
      if (data.action === 'OPEN_NOTIFICATIONS') {
        setActiveTab('notifications');
        if (data.notificationId) {
          handleMarkNotificationRead(data.notificationId);
        }
      }
    });
    return unsubscribe;
  }, [handleMarkNotificationRead]);

  useEffect(() => {
    // Initial load
    loadFleet(false);
    loadNotifications();

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        if (activeTab === 'dashboard' || activeTab === 'map' || activeTab === 'drivers') {
          loadFleet(true);
        }
      }, 5000);
    };

    startPolling();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadFleet(true);
        loadNotifications();
        startPolling();
      } else {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    });

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      appStateSub.remove();
    };
  }, [loadFleet, loadNotifications, activeTab]);

  // Android hardware back navigation
  useEffect(() => {
    const onBackPress = () => {
      if (driverModalVisible) {
        setDriverModalVisible(false);
        return true;
      }
      if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [driverModalVisible, activeTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFleet(), loadNotifications()]);
    setRefreshing(false);
  };

  const restaurantPoint: MapRestaurantPoint = useMemo(() => ({
    name: fleet?.restaurant?.name || 'Branch Base',
    latitude: fleet?.restaurant?.latitude ?? 30.0444,
    longitude: fleet?.restaurant?.longitude ?? 31.2357,
    radiusMeters: fleet?.restaurant?.radiusMeters ?? 150,
  }), [
    fleet?.restaurant?.name,
    fleet?.restaurant?.latitude,
    fleet?.restaurant?.longitude,
    fleet?.restaurant?.radiusMeters,
  ]);

  const filteredDrivers = useMemo(() => {
    return (fleet?.drivers ?? []).filter((d: any) => {
      if (driverSearch.trim()) {
        const q = driverSearch.toLowerCase().trim();
        const matchesName = d.driverName?.toLowerCase().includes(q);
        const matchesEmp = d.employeeId?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmp) return false;
      }
      if (mapFilter === 'MOVING') return d.operationalStatus === 'MOVING';
      if (mapFilter === 'STOPPED') return d.operationalStatus === 'STOPPED';
      if (mapFilter === 'AT_RESTAURANT') return d.operationalStatus === 'AT_RESTAURANT';
      if (mapFilter === 'OFFLINE') return d.operationalStatus === 'OFFLINE';
      return true;
    });
  }, [fleet, driverSearch, mapFilter]);

  const metrics = useMemo(() => {
    const driversList = fleet?.drivers ?? [];
    const total = driversList.length;
    const inShift = driversList.filter((d: any) => Boolean(d.shift)).length;
    const online = driversList.filter((d: any) => d.isOnline ?? (d.operationalStatus !== 'OFFLINE')).length;
    const tracking = driversList.filter((d: any) => (d.isOnline ?? (d.operationalStatus !== 'OFFLINE')) && d.location).length;
    const offline = total - online;

    return { total, inShift, tracking, online, offline, unreadNotifications: unreadCount };
  }, [fleet, unreadCount]);

  const bottomTabs: TabItem[] = [
    { id: 'dashboard', label: rtl ? 'الرئيسية' : 'Dashboard', icon: 'dashboard' },
    { id: 'map', label: rtl ? 'الخريطة' : 'Map', icon: 'map' },
    { id: 'drivers', label: rtl ? 'السائقون' : 'Drivers', icon: 'driver', badgeCount: metrics.online > 0 ? metrics.online : undefined },
    { id: 'notifications', label: t('notifications.title'), icon: 'bell', badgeCount: unreadCount > 0 ? unreadCount : undefined },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Sleek AppHeader */}
      <AppHeader
        title={
          activeTab === 'dashboard'
            ? rtl ? 'مركز مراقبة العمليات' : 'Dispatch Console'
            : activeTab === 'map'
            ? rtl ? 'الخريطة الميدانية' : 'Live Fleet Map'
            : activeTab === 'drivers'
            ? rtl ? 'السائقون الميدانيون' : 'Active Drivers'
            : t('notifications.title')
        }
        role="CALL_CENTER"
        userName={session.user.name}
        locale={locale}
        onToggleLanguage={toggleLanguage}
        onLogout={onLogout}
      />

      <View style={styles.body}>
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          fleetLoading && !fleet ? (
            <View style={styles.stateCenterContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateLoadingText}>{t('app.loadingFleet')}</Text>
            </View>
          ) : !fleetLoading && !fleet && fleetError ? (
            <View style={styles.stateErrorContainer}>
              <AppIcon name="warning" size={36} color={colors.status.critical} />
              <Text style={styles.stateErrorTitle}>{t('app.fleetLoadFailed')}</Text>
              <Text style={styles.stateErrorMessage}>{fleetError}</Text>
              <TouchableOpacity style={styles.primaryRetryButton} onPress={loadFleet}>
                <Text style={styles.primaryRetryButtonText}>{t('app.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContainer}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
            {/* Read-Only Notice Banner */}
            <View style={[styles.readOnlyBanner, { flexDirection: rowDir }]}>
              <AppIcon name="warning" size={14} color="#0284c7" />
              <Text style={styles.readOnlyBannerText}>{t('callCenter.readOnlyNotice')}</Text>
            </View>

            {fleetError && (
              <View style={styles.errorBanner}>
                <AppIcon name="warning" size={16} color="#b91c1c" />
                <Text style={styles.errorBannerText}>{fleetError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadFleet}>
                  <Text style={styles.retryButtonText}>{rtl ? 'إعادة المحاولة' : 'Retry'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Live KPI Grid */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'مؤشرات الأسطول الحية' : 'Live Fleet Indicators'}
              </Text>

              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'إجمالي السائقين' : 'Total Drivers'}</Text>
                  <Text style={styles.kpiValue}>{formatWesternNumber(metrics.total)}</Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'على رأس العمل' : 'On Duty'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.primary }]}>
                    {formatWesternNumber(metrics.inShift)}
                  </Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'تتبع نشط' : 'Tracking'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.status.online }]}>
                    {formatWesternNumber(metrics.tracking)}
                  </Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'متصل' : 'Online'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.status.online }]}>
                    {formatWesternNumber(metrics.online)}
                  </Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'غير متصل' : 'Offline'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.text.muted }]}>
                    {formatWesternNumber(metrics.offline)}
                  </Text>
                </View>

                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{t('admin.unreadNotifications')}</Text>
                  <Text style={[styles.kpiValue, { color: metrics.unreadNotifications > 0 ? colors.status.critical : colors.text.muted }]}>
                    {formatWesternNumber(metrics.unreadNotifications)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Map Preview */}
            <View style={styles.section}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rowDir }]}>
                <Text style={styles.sectionTitle}>{rtl ? 'خريطة التوزيع الميداني' : 'Fleet Radar Map'}</Text>
                <TouchableOpacity onPress={() => setActiveTab('map')}>
                  <Text style={styles.sectionActionLink}>{rtl ? 'عرض الخريطة الكاملة ←' : 'Full Map →'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.mapPreviewFrame}>
                <RealGeographicMapView
                  restaurant={restaurantPoint}
                  drivers={fleet?.drivers ?? []}
                  height={190}
                  isCompactPreview
                />
              </View>
            </View>

            {/* Active Drivers Overview */}
            <View style={styles.section}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rowDir }]}>
                <Text style={styles.sectionTitle}>{rtl ? 'السائقون النشطون' : 'Active Drivers'}</Text>
                <TouchableOpacity onPress={() => setActiveTab('drivers')}>
                  <Text style={styles.sectionActionLink}>{rtl ? 'عرض الكل ←' : 'View All →'}</Text>
                </TouchableOpacity>
              </View>

              {(fleet?.drivers ?? []).slice(0, 4).map((d: any) => {
                const isDOnline = d.isOnline ?? (d.operationalStatus !== 'OFFLINE');
                const isMoving = d.operationalStatus === 'MOVING';
                const batteryFreshness = resolveBatteryFreshness({
                  batteryPercentage: d.device?.batteryPercentage,
                  lastSeen: d.device?.lastSeen,
                  isOnline: isDOnline,
                });
                const batteryText = rtl ? batteryFreshness.labelAr : batteryFreshness.labelEn;
                return (
                  <TouchableOpacity
                    key={d.driverId}
                    style={[styles.driverRow, { flexDirection: rowDir }]}
                    onPress={() => {
                      setSelectedDriver(d);
                      setDriverModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.driverStatusDot, { backgroundColor: isDOnline ? colors.status.online : colors.status.offline }]} />

                    <View style={styles.driverInfo}>
                      <Text style={[styles.driverName, { textAlign: rtl ? 'right' : 'left' }]}>{d.driverName}</Text>
                      <Text style={[styles.driverMeta, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('diagnostics.employeeId')} {formatWesternNumber(d.employeeId)}
                      </Text>
                    </View>

                    <View style={[styles.driverTelemetryCol, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
                      <Text style={[styles.driverSpeedText, { textAlign: rtl ? 'left' : 'right', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                        {isMoving && d.location?.speed != null
                          ? `${formatWesternNumber(Math.round(Number(d.location.speed) * 3.6))} ${t('driverDetail.speedUnit')}`
                          : d.operationalStatus === 'AT_RESTAURANT'
                          ? (rtl ? 'بالمطعم' : 'At Restaurant')
                          : isDOnline ? t('operator.stopped') : t('operator.offline')}
                      </Text>
                      <Text style={[styles.driverBatteryText, { textAlign: rtl ? 'left' : 'right', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                        {batteryText}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            </ScrollView>
          )
        )}

        {/* TAB 2: LIVE MAP */}
        {activeTab === 'map' && (
          fleetLoading && !fleet ? (
            <View style={styles.stateCenterContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateLoadingText}>{t('app.loadingFleet')}</Text>
            </View>
          ) : !fleetLoading && !fleet && fleetError ? (
            <View style={styles.stateErrorContainer}>
              <AppIcon name="warning" size={36} color={colors.status.critical} />
              <Text style={styles.stateErrorTitle}>{t('app.fleetLoadFailed')}</Text>
              <Text style={styles.stateErrorMessage}>{fleetError}</Text>
              <TouchableOpacity style={styles.primaryRetryButton} onPress={loadFleet}>
                <Text style={styles.primaryRetryButtonText}>{t('app.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mapScreenContainer}>
              <View style={[styles.filterBar, { flexDirection: rowDir }]}>
                {['ALL', 'MOVING', 'AT_RESTAURANT', 'STOPPED', 'OFFLINE'].map((statusKey) => (
                  <TouchableOpacity
                    key={statusKey}
                    style={[styles.filterPill, mapFilter === statusKey && styles.filterPillActive]}
                    onPress={() => setMapFilter(statusKey)}
                  >
                    <Text style={[styles.filterPillText, mapFilter === statusKey && styles.filterPillTextActive]}>
                      {statusKey === 'ALL'
                        ? rtl ? 'الكل' : 'All'
                        : statusKey === 'MOVING'
                        ? rtl ? 'متحرك' : 'Moving'
                        : statusKey === 'AT_RESTAURANT'
                        ? rtl ? 'بالمطعم' : 'Base'
                        : statusKey === 'STOPPED'
                        ? rtl ? 'متوقف' : 'Stopped'
                        : rtl ? 'غير متصل' : 'Offline'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <RealGeographicMapView
                restaurant={restaurantPoint}
                drivers={filteredDrivers}
                selectedDriverId={selectedDriver?.driverId}
                driverFocusTrigger={driverFocusTrigger}
                onSelectDriver={(d) => setSelectedDriver(d)}
                onViewDriverDetail={(d) => {
                  setSelectedDriver(d);
                  setDriverModalVisible(true);
                }}
                height="100%"
              />
            </View>
          )
        )}

        {/* TAB 3: DRIVERS DIRECTORY */}
        {activeTab === 'drivers' && (
          fleetLoading && !fleet ? (
            <View style={styles.stateCenterContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateLoadingText}>{t('app.loadingFleet')}</Text>
            </View>
          ) : !fleetLoading && !fleet && fleetError ? (
            <View style={styles.stateErrorContainer}>
              <AppIcon name="warning" size={36} color={colors.status.critical} />
              <Text style={styles.stateErrorTitle}>{t('app.fleetLoadFailed')}</Text>
              <Text style={styles.stateErrorMessage}>{fleetError}</Text>
              <TouchableOpacity style={styles.primaryRetryButton} onPress={loadFleet}>
                <Text style={styles.primaryRetryButtonText}>{t('app.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.driversScreenContainer}>
              <View style={[styles.searchBar, { flexDirection: rowDir }]}>
                <AppIcon name="search" size={16} color={colors.text.muted} />
                <TextInput
                  value={driverSearch}
                  onChangeText={setDriverSearch}
                  placeholder={rtl ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search by name or ID...'}
                  placeholderTextColor={colors.text.light}
                  style={[styles.searchInput, { textAlign: rtl ? 'right' : 'left' }]}
                />
              </View>

              <ScrollView
                contentContainerStyle={styles.driversListContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              >
                {filteredDrivers.length === 0 ? (
                  <View style={styles.emptyState}>
                    <AppIcon name="driver" size={32} color={colors.text.light} />
                    <Text style={styles.emptyStateText}>{t('operator.noDrivers')}</Text>
                  </View>
                ) : (
                  filteredDrivers.map((d: any) => {
                const isDOnline = d.isOnline ?? (d.operationalStatus !== 'OFFLINE');
                const isMoving = d.operationalStatus === 'MOVING';
                const speed = isMoving && d.location?.speed != null ? Math.round(Number(d.location.speed) * 3.6) : null;
                const batteryFreshness = resolveBatteryFreshness({
                  batteryPercentage: d.device?.batteryPercentage,
                  lastSeen: d.device?.lastSeen,
                  isOnline: isDOnline,
                });
                const batteryText = rtl ? batteryFreshness.labelAr : batteryFreshness.labelEn;
                return (
                  <TouchableOpacity
                    key={d.driverId}
                    style={[styles.operationalDriverCard, { flexDirection: rowDir }]}
                    onPress={() => {
                      setSelectedDriver(d);
                      setDriverModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.driverStatusCol}>
                      <View
                        style={[
                          styles.statusBadgePill,
                          {
                            backgroundColor: isDOnline ? colors.status.onlineBg : colors.status.offlineBg,
                            borderColor: isDOnline ? colors.status.onlineBorder : colors.status.offlineBorder,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgePillText,
                            { color: isDOnline ? colors.status.online : colors.status.offline },
                          ]}
                        >
                          {isDOnline ? t('operator.online') : t('operator.offline')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.driverMainCol}>
                      <Text style={[styles.cardDriverName, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{d.driverName}</Text>
                      <Text style={[styles.employeeIdLabel, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                        {t('diagnostics.employeeId')} {d.employeeId ? formatWesternNumber(d.employeeId) : '—'}
                      </Text>
                      <Text style={[styles.cardDriverFreshness, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                        {d.operationalStatus === 'MOVING'
                          ? (rtl ? 'في حركة' : 'Moving')
                          : d.operationalStatus === 'AT_RESTAURANT'
                          ? (rtl ? 'في المطعم' : 'At Restaurant')
                          : d.operationalStatus === 'STOPPED'
                          ? (rtl ? 'متوقف' : 'Stopped')
                          : (rtl ? 'غير متصل' : 'Offline')}
                      </Text>
                    </View>

                    <View style={[styles.driverRightCol, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
                      <Text style={[styles.driverCardSpeed, { textAlign: rtl ? 'left' : 'right', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                        {speed != null ? `${formatWesternNumber(speed)} ${t('driverDetail.speedUnit')}` : '—'}
                      </Text>
                      <Text style={[styles.driverCardBattery, { textAlign: rtl ? 'left' : 'right', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                        {batteryText}
                      </Text>
                    </View>

                    <View style={styles.chevronCol}>
                      <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            </ScrollView>
          </View>
          )
        )}

        {/* TAB 4: NOTIFICATIONS & INCIDENTS */}
        {activeTab === 'notifications' && (
          <View style={{ flex: 1 }}>
            {notifications.length > 0 && unreadCount > 0 && (
              <View style={[styles.notificationsActionBar, { flexDirection: rowDir }]}>
                <TouchableOpacity
                  onPress={handleMarkAllNotificationsRead}
                  style={styles.markAllReadButton}
                  disabled={markingAllRead}
                  activeOpacity={0.7}
                >
                  {markingAllRead ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.markAllReadText}>{t('notifications.markAllRead')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <ScrollView
              contentContainerStyle={styles.notificationsScroll}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {notifications.length === 0 ? (
                <View style={styles.emptyState}>
                  <AppIcon name="bell" size={32} color={colors.text.light} />
                  <Text style={styles.emptyStateText}>{t('notifications.noNotifications')}</Text>
                </View>
              ) : (
                notifications.map((n: any) => {
                  const itemTitle = rtl
                    ? n.titleAr || n.title || n.titleEn || t('notifications.title') || 'تنبيه النظام'
                    : n.titleEn || n.title || n.titleAr || t('notifications.title') || 'Incident Report';
                  const itemMessage = rtl
                    ? n.messageAr || n.message || n.messageEn || ''
                    : n.messageEn || n.message || n.messageAr || '';
                  return (
                    <TouchableOpacity
                      key={n.id}
                      activeOpacity={0.7}
                      onPress={() => handleNotificationTap(n)}
                      style={[styles.notificationCard, !n.read && styles.unreadNotification]}
                    >
                      <View style={[styles.notificationHeaderRow, { flexDirection: rowDir }]}>
                        <Text style={[styles.notificationTitle, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                          {itemTitle}
                        </Text>
                        {!n.read && (
                          <View style={styles.unreadPill}>
                            <Text style={styles.unreadPillText}>{t('notifications.unread')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.notificationMessage, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                        {itemMessage}
                      </Text>
                      <View style={[styles.notificationMetaRow, { flexDirection: rowDir }]}>
                        <Text style={[styles.notificationTime, { textAlign: rtl ? 'right' : 'left' }]}>
                          {n.createdAt ? formatWesternNumber(new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : ''}
                        </Text>
                        {n.driverId && (
                          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 4 }}>
                            <AppIcon name="map" size={12} color={colors.primary} />
                            <Text style={styles.viewDriverHintText}>
                              {rtl ? 'عرض على الخريطة' : 'View on Map'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>

      <BottomTabBar
        tabs={bottomTabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as CallCenterTab)}
      />

      {/* Driver Detail Modal (Strictly Read-Only, isAdmin=false) */}
      <DriverDetailModal
        visible={driverModalVisible}
        driver={selectedDriver}
        isAdmin={false}
        onClose={() => setDriverModalVisible(false)}
        apiRequest={apiRequest}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  scrollContainer: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  readOnlyBanner: {
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  readOnlyBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionActionLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCard: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    ...shadows.card,
  },
  kpiLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  mapPreviewFrame: {
    height: 190,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  driverRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  driverStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverMeta: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.text.muted,
  },
  driverTelemetryCol: {
    minWidth: 70,
  },
  driverSpeedText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverBatteryText: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.text.muted,
  },
  mapScreenContainer: {
    flex: 1,
  },
  filterBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  driversScreenContainer: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    paddingVertical: 4,
  },
  driversListContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  operationalDriverCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    ...shadows.card,
  },
  driverStatusCol: {
    minWidth: 72,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgePillText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: '700',
  },
  employeeIdLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
    marginTop: 1,
  },
  driverMainCol: {
    flex: 1,
    justifyContent: 'center',
  },
  cardDriverName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardDriverFreshness: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 1,
  },
  driverRightCol: {
    minWidth: 64,
  },
  driverCardSpeed: {
    fontFamily: fonts.bold,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverCardBattery: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.text.muted,
  },
  chevronCol: {
    paddingHorizontal: 2,
  },
  notificationsScroll: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  notificationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
    ...shadows.card,
  },
  unreadNotification: {
    borderColor: colors.primary,
    backgroundColor: '#f0fdfa',
  },
  notificationHeaderRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  unreadPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  unreadPillText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  notificationMessage: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  notificationTime: {
    fontSize: 10,
    color: colors.text.muted,
  },
  notificationsActionBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  subviewHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  markAllReadButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: '#f1f5f9',
  },
  markAllReadText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  notificationMetaRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  viewDriverHintText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: spacing.sm,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  stateCenterContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: '#f8fafc',
  },
  stateLoadingText: {
    marginTop: spacing.md,
    fontSize: typography.body.fontSize,
    color: colors.text.muted,
    fontWeight: '500',
  },
  stateErrorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: '#f8fafc',
  },
  stateErrorTitle: {
    marginTop: spacing.md,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
    color: colors.text.primary,
    textAlign: 'center',
  },
  stateErrorMessage: {
    marginTop: spacing.xs,
    fontSize: typography.meta.fontSize,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
  },
  primaryRetryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryRetryButtonText: {
    color: '#ffffff',
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
});
