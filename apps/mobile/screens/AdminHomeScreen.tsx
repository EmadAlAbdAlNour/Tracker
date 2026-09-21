// Rebuilt Admin Experience for Tracker Mobile
// Bottom Tab Navigation, Compact Header, Real Geographic Map, Operational Density

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { colors, radius, shadows, spacing, typography } from '../designSystem';
import { AppIcon } from '../components/AppIcon';
import { AppHeader } from '../components/AppHeader';
import { BottomTabBar, type TabItem } from '../components/BottomTabBar';
import { RealGeographicMapView, type MapDriverPoint, type MapRestaurantPoint } from '../components/RealGeographicMapView';
import { DriverDetailModal } from '../components/DriverDetailModal';
import { formatWesternNumber, getLocale, isRtl, setStoredLocale, t, type Locale } from '../i18n';
import { type Session } from '../session';
import { NotificationService } from '../notificationService';

interface AdminHomeScreenProps {
  session: Session;
  apiUrl: string;
  apiRequest: <T>(path: string, options?: RequestInit, sessionOverride?: Session | null) => Promise<T>;
  onLogout: () => Promise<void>;
}

type MainTab = 'dashboard' | 'map' | 'drivers' | 'more';
type MoreSection = 'menu' | 'devices' | 'users' | 'settings' | 'notifications';

export function AdminHomeScreen({
  session,
  apiUrl,
  apiRequest,
  onLogout,
}: AdminHomeScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [moreSection, setMoreSection] = useState<MoreSection>('menu');
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [refreshing, setRefreshing] = useState(false);

  // Fleet & Telemetry Data
  const [fleet, setFleet] = useState<any | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [mapFilter, setMapFilter] = useState<string>('ALL');

  // Devices Data
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // Settings Data
  const [settingsRestaurant, setSettingsRestaurant] = useState<any>({
    name: '',
    latitude: 30.0444,
    longitude: 31.2357,
    radiusMeters: 1500,
  });
  const [settingsAlerts, setSettingsAlerts] = useState<any>({
    maxStopDurationMinutes: 15,
    offlineGraceMinutes: 10,
    lowBatteryThreshold: 20,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Users Data
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Notifications Data
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const rtl = isRtl();

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  // 1. Load Fleet Data
  const loadFleet = useCallback(async () => {
    try {
      setFleetLoading(true);
      setFleetError(null);
      const data = await apiRequest<any>('/api/fleet/live');
      setFleet(data);
    } catch (err: any) {
      if (err?.status === 401 || err?.code === 'AUTH_SESSION_EXPIRED' || err?.code === 'AUTH_INVALID_TOKEN') {
        await onLogout();
        return;
      }
      setFleetError(err?.message || 'Failed to connect to server');
    } finally {
      setFleetLoading(false);
    }
  }, [apiRequest, onLogout]);

  // 2. Load Devices
  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const data = await apiRequest<any>('/api/devices?limit=50');
      setDevices(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setDevicesLoading(false);
    }
  }, [apiRequest]);

  // 3. Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const [restRes, alertRes] = await Promise.all([
        apiRequest<any>('/api/settings/restaurant'),
        apiRequest<any>('/api/settings/alerts'),
      ]);
      if (restRes?.settings) setSettingsRestaurant(restRes.settings);
      if (alertRes?.settings) setSettingsAlerts(alertRes.settings);
    } catch {
      // ignore
    }
  }, [apiRequest]);

  // 4. Load Users
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await apiRequest<any>('/api/users?limit=50');
      setUsers(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }, [apiRequest]);

  // 5. Load Notifications
  const postedNotificationIdsRef = useRef<Set<string>>(new Set());

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest<any>('/api/notifications?limit=30');
      const items = data.items ?? [];
      setNotifications(items);
      setUnreadCount(data.unreadCount ?? 0);

      // Post unread notifications to Android system notification shade
      if (settingsAlerts.inAppAlertsEnabled !== false) {
        for (const notif of items) {
          if (!notif.isRead && !postedNotificationIdsRef.current.has(notif.id)) {
            postedNotificationIdsRef.current.add(notif.id);
            const itemTitle = rtl
              ? notif.titleAr || notif.title || notif.titleEn || 'تنبيه النظام'
              : notif.titleEn || notif.title || notif.titleAr || 'System Alert';
            const itemMessage = rtl
              ? notif.messageAr || notif.message || notif.messageEn || ''
              : notif.messageEn || notif.message || notif.messageAr || '';

            NotificationService.showNotification({
              channelId: settingsAlerts.soundEnabled ? 'tracker_alerts_channel' : 'tracker_system_channel',
              title: itemTitle,
              body: itemMessage,
              data: { notificationId: notif.id },
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }, [apiRequest, rtl, settingsAlerts]);

  // Setup Notification permission check and tap routing on mount
  useEffect(() => {
    NotificationService.checkPermission().then((granted) => {
      if (!granted) {
        NotificationService.requestPermission();
      }
    });

    NotificationService.getInitialNotification().then((initial) => {
      if (initial && initial.action === 'OPEN_NOTIFICATIONS') {
        setActiveTab('more');
        setMoreSection('notifications');
        if (initial.notificationId) {
          handleMarkNotificationRead(initial.notificationId);
        }
      }
    });

    const unsubscribe = NotificationService.onNotificationTap((data) => {
      if (data.action === 'OPEN_NOTIFICATIONS') {
        setActiveTab('more');
        setMoreSection('notifications');
        if (data.notificationId) {
          handleMarkNotificationRead(data.notificationId);
        }
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    loadFleet();
    loadNotifications();
  }, [loadFleet, loadNotifications]);

  useEffect(() => {
    if (activeTab === 'more') {
      if (moreSection === 'devices') loadDevices();
      if (moreSection === 'settings') loadSettings();
      if (moreSection === 'users') loadUsers();
      if (moreSection === 'notifications') loadNotifications();
    }
  }, [activeTab, moreSection, loadDevices, loadSettings, loadUsers, loadNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadFleet(),
      loadNotifications(),
      moreSection === 'devices' ? loadDevices() : Promise.resolve(),
      moreSection === 'settings' ? loadSettings() : Promise.resolve(),
      moreSection === 'users' ? loadUsers() : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  // Device Reset
  const handleDeviceReset = async (driverId: string) => {
    try {
      await apiRequest(`/api/drivers/${driverId}/device/reset`, { method: 'POST' });
      Alert.alert(t('app.notice'), t('admin.resetSuccess'));
      await loadFleet();
      if (moreSection === 'devices') await loadDevices();
      if (selectedDriver && selectedDriver.driverId === driverId) {
        setSelectedDriver((prev: any) =>
          prev ? { ...prev, device: prev.device ? { ...prev.device, authorized: false } : null } : null
        );
      }
    } catch (err: any) {
      Alert.alert(t('app.error'), err?.message || t('admin.resetFailed'));
    }
  };

  // Save Settings with strict numeric validation
  const handleSaveSettings = async () => {
    const restName = settingsRestaurant.name?.trim();
    if (!restName) {
      Alert.alert(t('app.error'), rtl ? 'اسم المطعم مطلوب' : 'Restaurant name is required');
      return;
    }

    const lat = Number(settingsRestaurant.latitude);
    const lng = Number(settingsRestaurant.longitude);
    const radiusM = Number(settingsRestaurant.radiusMeters);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      Alert.alert(t('app.error'), rtl ? 'خط العرض غير صالح (-90 إلى 90)' : 'Invalid latitude (-90 to 90)');
      return;
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      Alert.alert(t('app.error'), rtl ? 'خط الطول غير صالح (-180 إلى 180)' : 'Invalid longitude (-180 to 180)');
      return;
    }
    if (Number.isNaN(radiusM) || radiusM < 10 || radiusM > 50000) {
      Alert.alert(t('app.error'), rtl ? 'نصف القطر يجب أن يكون بين 10 و 50000 متر' : 'Radius must be 10-50,000m');
      return;
    }

    const maxStop = Number(settingsAlerts.maxStopDurationMinutes);
    const offlineGrace = Number(settingsAlerts.offlineGraceMinutes);
    const lowBatt = Number(settingsAlerts.lowBatteryThreshold);

    if (Number.isNaN(maxStop) || maxStop < 1 || maxStop > 240) {
      Alert.alert(t('app.error'), rtl ? 'مدة التوقف القصوى يجب أن تكون بين 1 و 240 دقيقة' : 'Max stop must be 1-240m');
      return;
    }
    if (Number.isNaN(offlineGrace) || offlineGrace < 1 || offlineGrace > 120) {
      Alert.alert(t('app.error'), rtl ? 'مهلة الانقطاع يجب أن تكون بين 1 و 120 دقيقة' : 'Offline grace must be 1-120m');
      return;
    }
    if (Number.isNaN(lowBatt) || lowBatt < 5 || lowBatt > 50) {
      Alert.alert(t('app.error'), rtl ? 'حد البطارية يجب أن يكون بين 5% و 50%' : 'Low battery must be 5-50%');
      return;
    }

    setSettingsSaving(true);
    try {
      await Promise.all([
        apiRequest('/api/settings/restaurant', {
          method: 'PUT',
          body: JSON.stringify({
            name: restName,
            latitude: lat,
            longitude: lng,
            radiusMeters: radiusM,
          }),
        }),
        apiRequest('/api/settings/alerts', {
          method: 'PUT',
          body: JSON.stringify({
            maxStopDurationMinutes: maxStop,
            offlineGraceMinutes: offlineGrace,
            lowBatteryThreshold: lowBatt,
            stopAlertEnabled: settingsAlerts.stopAlertEnabled ?? true,
            gpsAlertEnabled: settingsAlerts.gpsAlertEnabled ?? true,
            offlineAlertEnabled: settingsAlerts.offlineAlertEnabled ?? true,
            batteryAlertEnabled: settingsAlerts.batteryAlertEnabled ?? true,
            restaurantGeofenceAlertEnabled: settingsAlerts.restaurantGeofenceAlertEnabled ?? true,
            soundEnabled: settingsAlerts.soundEnabled ?? true,
            inAppAlertsEnabled: settingsAlerts.inAppAlertsEnabled ?? true,
          }),
        }),
      ]);
      Alert.alert(t('app.notice'), t('admin.saveSettingsSuccess'));
      await loadSettings();
      await loadFleet();
    } catch (err: any) {
      Alert.alert(t('app.error'), err?.message || t('admin.saveSettingsFailed'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    try {
      await apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleSendTestNotification = async () => {
    try {
      await NotificationService.requestPermission();
      const res = await apiRequest<any>('/api/notifications/test', { method: 'POST' });
      const notif = res?.notification;
      if (notif) {
        postedNotificationIdsRef.current.add(notif.id);
        const itemTitle = rtl
          ? notif.titleAr || notif.title || 'إشعار اختباري للنظام'
          : notif.titleEn || notif.title || 'System Test Notification';
        const itemMessage = rtl
          ? notif.messageAr || notif.message || 'تم إرسال إشعار تجريبي لاختبار شريط الإشعارات'
          : notif.messageEn || notif.message || 'Test notification sent to shade';

        await NotificationService.showNotification({
          id: Math.floor(Math.random() * 90000) + 10000,
          channelId: settingsAlerts.soundEnabled ? 'tracker_alerts_channel' : 'tracker_system_channel',
          title: itemTitle,
          body: itemMessage,
          data: { notificationId: notif.id },
        });
      }
      await loadNotifications();
      Alert.alert(t('app.notice'), rtl ? 'تم إرسال الإشعار لشريط إشعارات أندرويد بنجاح' : 'Notification posted to Android shade');
    } catch (err: any) {
      Alert.alert(t('app.error'), err?.message || 'Failed to send test notification');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      await loadNotifications();
      Alert.alert(t('app.notice'), t('notifications.markReadSuccess'));
    } catch {
      // ignore
    }
  };

  // Map Restaurant Point
  const restaurantPoint: MapRestaurantPoint = useMemo(() => ({
    name: fleet?.restaurant?.name || settingsRestaurant.name || 'Branch Base',
    latitude: fleet?.restaurant?.latitude ?? settingsRestaurant.latitude ?? 30.0444,
    longitude: fleet?.restaurant?.longitude ?? settingsRestaurant.longitude ?? 31.2357,
    radiusMeters: fleet?.restaurant?.radiusMeters ?? settingsRestaurant.radiusMeters ?? 1500,
  }), [fleet, settingsRestaurant]);

  // Filtered drivers
  const filteredDrivers = useMemo(() => {
    return (fleet?.drivers ?? []).filter((d: any) => {
      // Search query
      if (driverSearch.trim()) {
        const q = driverSearch.toLowerCase().trim();
        const matchesName = d.driverName?.toLowerCase().includes(q);
        const matchesEmp = d.employeeId?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmp) return false;
      }
      // Status filter
      if (mapFilter === 'MOVING') return d.operationalStatus === 'MOVING';
      if (mapFilter === 'STOPPED') return d.operationalStatus === 'STOPPED';
      if (mapFilter === 'AT_RESTAURANT') return d.operationalStatus === 'AT_RESTAURANT';
      if (mapFilter === 'OFFLINE') return d.operationalStatus === 'OFFLINE';
      return true;
    });
  }, [fleet, driverSearch, mapFilter]);

  // Operational Driver metrics computed from real state
  const metrics = useMemo(() => {
    const driversList = fleet?.drivers ?? [];
    const total = driversList.length;
    const inShift = driversList.filter((d: any) => Boolean(d.shift)).length;
    const tracking = driversList.filter((d: any) => d.operationalStatus !== 'OFFLINE' && d.location).length;
    const online = driversList.filter((d: any) => d.operationalStatus !== 'OFFLINE').length;
    const offline = total - online;
    const activeAlerts = (fleet?.alerts ?? []).length;

    return { total, inShift, tracking, online, offline, activeAlerts };
  }, [fleet]);

  // Bottom tabs definition
  const bottomTabs: TabItem[] = [
    { id: 'dashboard', label: rtl ? 'الرئيسية' : 'Dashboard', icon: 'dashboard' },
    { id: 'map', label: rtl ? 'الخريطة' : 'Map', icon: 'map' },
    { id: 'drivers', label: rtl ? 'السائقون' : 'Drivers', icon: 'driver', badgeCount: metrics.online > 0 ? metrics.online : undefined },
    { id: 'more', label: rtl ? 'المزيد' : 'More', icon: 'more', badgeCount: unreadCount > 0 ? unreadCount : undefined },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Sleek Unified AppHeader (52dp) */}
      <AppHeader
        title={
          activeTab === 'dashboard'
            ? rtl ? 'لوحة القيادة والمراقبة' : 'Fleet Console'
            : activeTab === 'map'
            ? rtl ? 'الخريطة الميدانية' : 'Live Fleet Map'
            : activeTab === 'drivers'
            ? rtl ? 'دليل السائقين' : 'Active Drivers'
            : moreSection === 'devices'
            ? t('admin.deviceManagement')
            : moreSection === 'users'
            ? t('admin.usersList')
            : moreSection === 'settings'
            ? t('admin.settings')
            : moreSection === 'notifications'
            ? t('notifications.title')
            : rtl ? 'إدارة النظام والمزيد' : 'System & More'
        }
        role="ADMIN"
        userName={session.user.name}
        locale={locale}
        onBack={activeTab === 'more' && moreSection !== 'menu' ? () => setMoreSection('menu') : undefined}
        onToggleLanguage={toggleLanguage}
        onLogout={onLogout}
      />

      {/* Active Tab Screen Content */}
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
            {/* Error Banner with Retry */}
            {fleetError && (
              <View style={styles.errorBanner}>
                <AppIcon name="warning" size={16} color="#b91c1c" />
                <Text style={styles.errorBannerText}>{fleetError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadFleet}>
                  <Text style={styles.retryButtonText}>{rtl ? 'إعادة المحاولة' : 'Retry'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Section 1: Real-time Operational KPI Summary */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'ملخص الأسطول في الوقت الفعلي' : 'Live Fleet Overview'}
              </Text>

              <View style={styles.kpiGrid}>
                {/* Total Drivers */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'إجمالي السائقين' : 'Total Drivers'}</Text>
                  <Text style={styles.kpiValue}>{formatWesternNumber(metrics.total)}</Text>
                </View>

                {/* In Shift */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'في وردية عمل' : 'On Shift'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.primary }]}>
                    {formatWesternNumber(metrics.inShift)}
                  </Text>
                </View>

                {/* Tracking Active */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'تتبع نشط الآن' : 'Tracking Now'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.status.online }]}>
                    {formatWesternNumber(metrics.tracking)}
                  </Text>
                </View>

                {/* Online */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'متصل' : 'Online'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.status.online }]}>
                    {formatWesternNumber(metrics.online)}
                  </Text>
                </View>

                {/* Offline */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'غير متصل' : 'Offline'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.text.muted }]}>
                    {formatWesternNumber(metrics.offline)}
                  </Text>
                </View>

                {/* Active Alerts */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'تنبيهات نشطة' : 'Active Alerts'}</Text>
                  <Text style={[styles.kpiValue, { color: metrics.activeAlerts > 0 ? colors.status.critical : colors.text.muted }]}>
                    {formatWesternNumber(metrics.activeAlerts)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Section 2: Active Critical Alerts (If any) */}
            {(fleet?.alerts ?? []).length > 0 && (
              <View style={styles.section}>
                <View style={[styles.sectionHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Text style={styles.sectionTitle}>{rtl ? 'التنبيهات الميدانية النشطة' : 'Active Alerts'}</Text>
                  <View style={styles.alertCountBadge}>
                    <Text style={styles.alertCountText}>{formatWesternNumber((fleet.alerts ?? []).length)}</Text>
                  </View>
                </View>

                {(fleet.alerts ?? []).slice(0, 3).map((al: any) => (
                  <View key={al.id} style={styles.alertCard}>
                    <AppIcon name="warning" size={16} color={colors.status.critical} />
                    <View style={styles.alertBody}>
                      <Text style={styles.alertTitle}>{al.title || al.type}</Text>
                      <Text style={styles.alertMessage}>{al.message}</Text>
                    </View>
                    <Text style={styles.alertTime}>
                      {al.createdAt ? new Date(al.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Section 3: Live Map Preview Container */}
            <View style={styles.section}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Text style={styles.sectionTitle}>{rtl ? 'معاينة الخريطة الميدانية' : 'Fleet Map Preview'}</Text>
                <TouchableOpacity onPress={() => setActiveTab('map')}>
                  <Text style={styles.sectionActionLink}>{rtl ? 'فتح الخريطة الكاملة ←' : 'Full Map →'}</Text>
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

            {/* Section 4: Live Drivers Quick Overview */}
            <View style={styles.section}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Text style={styles.sectionTitle}>{rtl ? 'السائقون الميدانيون' : 'Active Fleet'}</Text>
                <TouchableOpacity onPress={() => setActiveTab('drivers')}>
                  <Text style={styles.sectionActionLink}>{rtl ? 'عرض الكل ←' : 'View All →'}</Text>
                </TouchableOpacity>
              </View>

              {(fleet?.drivers ?? []).slice(0, 4).map((d: any) => {
                const isDOnline = d.operationalStatus !== 'OFFLINE';
                return (
                  <TouchableOpacity
                    key={d.driverId}
                    style={[styles.driverRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => {
                      setSelectedDriver(d);
                      setDriverModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.driverStatusDot, { backgroundColor: isDOnline ? colors.status.online : colors.status.offline }]} />

                    <View style={[styles.driverInfo, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                      <Text style={styles.driverName}>{d.driverName}</Text>
                      <Text style={styles.driverMeta}>
                        {t('diagnostics.employeeId')} {formatWesternNumber(d.employeeId)}
                      </Text>
                    </View>

                    <View style={[styles.driverTelemetryCol, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
                      <Text style={styles.driverSpeedText}>
                        {d.location?.speed != null && isDOnline
                          ? `${formatWesternNumber(Math.round(Number(d.location.speed) * 3.6))} ${t('driverDetail.speedUnit')}`
                          : isDOnline ? t('operator.stopped') : t('operator.offline')}
                      </Text>
                      <Text style={styles.driverBatteryText}>
                        {d.device?.batteryPercentage != null ? `${formatWesternNumber(d.device.batteryPercentage)}%` : '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            </ScrollView>
          )
        )}

        {/* TAB 2: FULLSCREEN LIVE MAP */}
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
              {/* Status Filter Bar */}
              <View style={[styles.filterBar, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
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

              {/* Real Geographic Map */}
              <RealGeographicMapView
                restaurant={restaurantPoint}
                drivers={filteredDrivers}
                selectedDriverId={selectedDriver?.driverId}
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
            {/* Search Input */}
            <View style={styles.searchBar}>
              <AppIcon name="search" size={16} color={colors.text.muted} />
              <TextInput
                value={driverSearch}
                onChangeText={setDriverSearch}
                placeholder={rtl ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search by name or ID...'}
                placeholderTextColor={colors.text.light}
                style={[styles.searchInput, { textAlign: rtl ? 'right' : 'left' }]}
              />
              {driverSearch.length > 0 && (
                <TouchableOpacity onPress={() => setDriverSearch('')}>
                  <AppIcon name="close" size={14} color={colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Drivers List */}
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
                  const isDOnline = d.operationalStatus !== 'OFFLINE';
                  const speed = d.location?.speed != null ? Math.round(Number(d.location.speed) * 3.6) : null;
                  return (
                    <TouchableOpacity
                      key={d.driverId}
                      style={[styles.operationalDriverCard, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                      onPress={() => {
                        setSelectedDriver(d);
                        setDriverModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      {/* Status Column */}
                      <View style={[styles.driverStatusCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
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
                        <Text style={styles.employeeIdLabel}>
                          {t('diagnostics.employeeId')} {formatWesternNumber(d.employeeId)}
                        </Text>
                      </View>

                      {/* Main Driver Info */}
                      <View style={[styles.driverMainCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                        <Text style={styles.cardDriverName}>{d.driverName}</Text>
                        <Text style={styles.cardDriverFreshness}>
                          {isDOnline
                            ? rtl ? 'متصل الآن' : 'Live'
                            : rtl ? 'آخر بيانات معروفة' : 'Last known state'}
                        </Text>
                      </View>

                      {/* Right Telemetry Column */}
                      <View style={[styles.driverRightCol, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
                        <Text style={styles.driverCardSpeed}>
                          {speed != null ? `${formatWesternNumber(speed)} ${t('driverDetail.speedUnit')}` : '—'}
                        </Text>
                        <Text style={styles.driverCardBattery}>
                          {d.device?.batteryPercentage != null ? `${formatWesternNumber(d.device.batteryPercentage)}%` : '—'}
                        </Text>
                      </View>

                      {/* Chevron Arrow */}
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

        {/* TAB 4: MORE HUB & SUBSCREENS */}
        {activeTab === 'more' && (
          <View style={styles.moreContainer}>
            {/* SUBVIEW: MENU HUB */}
            {moreSection === 'menu' && (
              <ScrollView contentContainerStyle={styles.scrollContainer}>
                {/* Administration Group */}
                <View style={styles.moreGroup}>
                  <Text style={[styles.moreGroupTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'الإدارة والرقابة' : 'Administration'}
                  </Text>

                  {/* Devices */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => setMoreSection('devices')}
                  >
                    <View style={styles.moreRowLeft}>
                      <AppIcon name="device" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('admin.deviceManagement')}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>

                  {/* Users */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => setMoreSection('users')}
                  >
                    <View style={styles.moreRowLeft}>
                      <AppIcon name="users" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('admin.usersList')}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>

                  {/* Notifications */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => setMoreSection('notifications')}
                  >
                    <View style={styles.moreRowLeft}>
                      <AppIcon name="bell" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('notifications.title')}</Text>
                    </View>
                    {unreadCount > 0 && (
                      <View style={styles.moreBadge}>
                        <Text style={styles.moreBadgeText}>{formatWesternNumber(unreadCount)}</Text>
                      </View>
                    )}
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>
                </View>

                {/* System Settings Group */}
                <View style={styles.moreGroup}>
                  <Text style={[styles.moreGroupTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'تهيئة النظام' : 'System Configuration'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => setMoreSection('settings')}
                  >
                    <View style={styles.moreRowLeft}>
                      <AppIcon name="settings" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('admin.settings')}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>
                </View>

                {/* Session Group */}
                <View style={styles.moreGroup}>
                  <Text style={[styles.moreGroupTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'الجلسة' : 'Session'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={toggleLanguage}
                  >
                    <View style={styles.moreRowLeft}>
                      <AppIcon name="sync" size={16} color={colors.primary} />
                      <Text style={styles.moreRowText}>
                        {rtl ? 'تغيير اللغة (English)' : 'Change Language (العربية)'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={onLogout}
                  >
                    <View style={styles.moreRowLeft}>
                      <AppIcon name="logout" size={18} color="#dc2626" />
                      <Text style={[styles.moreRowText, { color: '#dc2626', fontWeight: '700' }]}>
                        {t('app.logout')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* SUBVIEW: DEVICES LIST */}
            {moreSection === 'devices' && (
              <View style={{ flex: 1 }}>
                <View style={[styles.subviewHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity onPress={() => setMoreSection('menu')} style={styles.backButton}>
                    <AppIcon name={rtl ? 'arrow-right' : 'arrow-left'} size={16} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text style={styles.subviewTitle}>{t('admin.deviceManagement')}</Text>
                </View>

                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {devicesLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
                  ) : devices.length === 0 ? (
                    <Text style={styles.emptyText}>{rtl ? 'لا توجد أجهزة مسجلة' : 'No devices found'}</Text>
                  ) : (
                    devices.map((dev: any) => (
                      <View key={dev.id} style={styles.deviceCard}>
                        <View style={[styles.deviceCardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                          <View>
                            <Text style={styles.deviceDriverName}>{dev.driverName || 'Driver'}</Text>
                            <Text style={styles.deviceIdText}>{dev.deviceIdentifier}</Text>
                          </View>
                          <View
                            style={[
                              styles.authBadge,
                              {
                                backgroundColor: dev.isAuthorized ? colors.status.onlineBg : colors.status.criticalBg,
                                borderColor: dev.isAuthorized ? colors.status.onlineBorder : colors.status.criticalBorder,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.authBadgeText,
                                { color: dev.isAuthorized ? colors.status.online : colors.status.critical },
                              ]}
                            >
                              {dev.isAuthorized ? t('admin.authorized') : t('admin.unauthorized')}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.deviceMetaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                          <Text style={styles.deviceMetaItem}>
                            {dev.platform || 'Android'} • v{dev.appVersion || '1.0.0'}
                          </Text>
                          <Text style={styles.deviceMetaItem}>
                            {dev.lastSeenAt
                              ? new Date(dev.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : t('admin.never')}
                          </Text>
                        </View>

                        {dev.isAuthorized && (
                          <TouchableOpacity
                            style={styles.deviceResetButton}
                            onPress={() => handleDeviceReset(dev.driverId)}
                          >
                            <Text style={styles.deviceResetButtonText}>{t('admin.resetDevice')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {/* SUBVIEW: USERS LIST */}
            {moreSection === 'users' && (
              <View style={{ flex: 1 }}>
                <View style={[styles.subviewHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity onPress={() => setMoreSection('menu')} style={styles.backButton}>
                    <AppIcon name={rtl ? 'arrow-right' : 'arrow-left'} size={16} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text style={styles.subviewTitle}>{t('admin.usersList')}</Text>
                </View>

                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {usersLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
                  ) : (
                    users.map((u: any) => (
                      <View key={u.id} style={[styles.userRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                        <View style={[styles.userInfo, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                          <Text style={styles.userName}>{u.name}</Text>
                          <Text style={styles.userPhone}>{u.phone || u.email}</Text>
                        </View>
                        <View
                          style={[
                            styles.userRoleBadge,
                            {
                              backgroundColor:
                                u.role === 'ADMIN'
                                  ? colors.status.onlineBg
                                  : u.role === 'CALL_CENTER'
                                  ? colors.status.atRestaurantBg
                                  : colors.surfaceSubtle,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.userRoleBadgeText,
                              {
                                color:
                                  u.role === 'ADMIN'
                                    ? colors.status.online
                                    : u.role === 'CALL_CENTER'
                                    ? colors.status.atRestaurant
                                    : colors.text.secondary,
                              },
                            ]}
                          >
                            {u.role}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {/* SUBVIEW: SETTINGS FORM */}
            {moreSection === 'settings' && (
              <View style={{ flex: 1 }}>
                <View style={[styles.subviewHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity onPress={() => setMoreSection('menu')} style={styles.backButton}>
                    <AppIcon name={rtl ? 'arrow-right' : 'arrow-left'} size={16} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text style={styles.subviewTitle}>{t('admin.settings')}</Text>
                </View>

                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {/* Restaurant Geofence Card */}
                  <View style={styles.settingsCard}>
                    <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AppIcon name="restaurant" size={18} color={colors.primary} />
                      <Text style={[styles.settingsCardTitle, { marginBottom: 0 }]}>
                        {t('admin.restaurantSettings')}
                      </Text>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.restaurantName')}
                      </Text>
                      <TextInput
                        value={settingsRestaurant.name}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, name: t }))}
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.geofenceRadius')}
                      </Text>
                      <TextInput
                        value={String(settingsRestaurant.radiusMeters ?? 1500)}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, radiusMeters: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.latitude')}
                      </Text>
                      <TextInput
                        value={String(settingsRestaurant.latitude ?? 30.0444)}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, latitude: t }))}
                        keyboardType="decimal-pad"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.longitude')}
                      </Text>
                      <TextInput
                        value={String(settingsRestaurant.longitude ?? 31.2357)}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, longitude: t }))}
                        keyboardType="decimal-pad"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>
                  </View>

                  {/* Alert Thresholds Card */}
                  <View style={styles.settingsCard}>
                    <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AppIcon name="warning" size={18} color={colors.status.critical} />
                      <Text style={[styles.settingsCardTitle, { marginBottom: 0 }]}>
                        {t('admin.alertThresholds')}
                      </Text>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.maxStopDuration')}
                      </Text>
                      <TextInput
                        value={String(settingsAlerts.maxStopDurationMinutes ?? 15)}
                        onChangeText={(t) => setSettingsAlerts((prev: any) => ({ ...prev, maxStopDurationMinutes: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.offlineGraceMinutes')}
                      </Text>
                      <TextInput
                        value={String(settingsAlerts.offlineGraceMinutes ?? 10)}
                        onChangeText={(t) => setSettingsAlerts((prev: any) => ({ ...prev, offlineGraceMinutes: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.lowBatteryThreshold')}
                      </Text>
                      <TextInput
                        value={String(settingsAlerts.lowBatteryThreshold ?? 20)}
                        onChangeText={(t) => setSettingsAlerts((prev: any) => ({ ...prev, lowBatteryThreshold: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>
                  </View>

                  {/* Alert Channels & Triggers Card */}
                  <View style={styles.settingsCard}>
                    <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AppIcon name="bell" size={18} color={colors.primary} />
                      <Text style={[styles.settingsCardTitle, { marginBottom: 0 }]}>
                        {rtl ? 'تفعيل وتنبيهات الإشعارات' : 'Alert Triggers & Channels'}
                      </Text>
                    </View>

                    {[
                      { key: 'stopAlertEnabled', label: rtl ? 'تنبيه التوقف المفرط' : 'Excessive Stop Alert', desc: rtl ? 'إشعار عند تجاوز السائق مدة التوقف المسموحة' : 'Notify when driver stops beyond limit' },
                      { key: 'gpsAlertEnabled', label: rtl ? 'تنبيه فقدان إشارة GPS' : 'GPS Loss Alert', desc: rtl ? 'إشعار عند تعطل أو إيقاف خدمات الموقع' : 'Notify when location services are disabled' },
                      { key: 'offlineAlertEnabled', label: rtl ? 'تنبيه انقطاع الاتصال' : 'Device Offline Alert', desc: rtl ? 'إشعار عند انقطاع جهاز السائق عن الشبكة' : 'Notify when driver device goes offline' },
                      { key: 'batteryAlertEnabled', label: rtl ? 'تنبيه انخفاض البطارية' : 'Low Battery Alert', desc: rtl ? 'إشعار عند وصول بطارية السائق للحد الحرج' : 'Notify when device battery drops below threshold' },
                      { key: 'restaurantGeofenceAlertEnabled', label: rtl ? 'تنبيه السياج الجغرافي للمطعم' : 'Geofence Alert', desc: rtl ? 'إشعار عند دخول أو مغادرة محيط المطعم' : 'Notify on entering/exiting restaurant zone' },
                      { key: 'soundEnabled', label: rtl ? 'نغمات التنبيه الصوتية' : 'Sound Alerts', desc: rtl ? 'تشغيل صوت عند ورود تنبيه حرج' : 'Play sound upon critical incident alerts' },
                      { key: 'inAppAlertsEnabled', label: rtl ? 'إشعارات داخل التطبيق' : 'In-App Alert Banners', desc: rtl ? 'إظهار شريط التنبيه في اللوحة المباشرة' : 'Display alert banners in operational console' },
                    ].map((item) => {
                      const enabled = settingsAlerts[item.key] ?? true;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[
                            {
                              flexDirection: rtl ? 'row-reverse' : 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 10,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.border,
                            },
                          ]}
                          onPress={() =>
                            setSettingsAlerts((prev: any) => ({
                              ...prev,
                              [item.key]: !enabled,
                            }))
                          }
                        >
                          <View style={{ flex: 1, alignItems: rtl ? 'flex-end' : 'flex-start', marginHorizontal: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>
                              {item.label}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                              {item.desc}
                            </Text>
                          </View>
                          <View
                            style={{
                              width: 44,
                              height: 24,
                              borderRadius: 12,
                              backgroundColor: enabled ? colors.primary : '#cbd5e1',
                              justifyContent: 'center',
                              paddingHorizontal: 2,
                            }}
                          >
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: '#ffffff',
                                alignSelf: enabled ? 'flex-end' : 'flex-start',
                              }}
                            />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={[styles.primarySaveButton, settingsSaving && styles.disabledButton]}
                    onPress={handleSaveSettings}
                    disabled={settingsSaving}
                  >
                    {settingsSaving ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.primarySaveButtonText}>{t('app.save')}</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}

            {/* SUBVIEW: NOTIFICATIONS */}
            {moreSection === 'notifications' && (
              <View style={{ flex: 1 }}>
                <View style={[styles.subviewHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity onPress={() => setMoreSection('menu')} style={styles.backButton}>
                    <AppIcon name={rtl ? 'arrow-right' : 'arrow-left'} size={16} color={colors.text.primary} />
                  </TouchableOpacity>
                  <Text style={styles.subviewTitle}>{t('notifications.title')}</Text>
                  <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity onPress={handleSendTestNotification} style={[styles.markAllReadButton, { backgroundColor: '#e0f2fe' }]}>
                      <Text style={[styles.markAllReadText, { color: colors.accent }]}>
                        {rtl ? 'إرسال تجريبي' : 'Send Test'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleMarkAllNotificationsRead} style={styles.markAllReadButton}>
                      <Text style={styles.markAllReadText}>{t('notifications.markAllRead')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {notifications.length === 0 ? (
                    <View style={styles.emptyState}>
                      <AppIcon name="bell" size={32} color={colors.text.light} />
                      <Text style={styles.emptyStateText}>{t('notifications.noNotifications')}</Text>
                    </View>
                  ) : (
                    notifications.map((n: any) => {
                      const itemTitle = rtl
                        ? n.titleAr || n.title || n.titleEn || 'تنبيه النظام'
                        : n.titleEn || n.title || n.titleAr || 'System Alert';
                      const itemMessage = rtl
                        ? n.messageAr || n.message || n.messageEn || ''
                        : n.messageEn || n.message || n.messageAr || '';
                      return (
                        <TouchableOpacity
                          key={n.id}
                          activeOpacity={0.7}
                          onPress={() => handleMarkNotificationRead(n.id)}
                          style={[styles.notificationCard, !n.isRead && styles.unreadNotification]}
                        >
                          <View style={[styles.notificationHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                            <Text style={styles.notificationTitle}>{itemTitle}</Text>
                            {!n.isRead && (
                              <View style={styles.unreadPill}>
                                <Text style={styles.unreadPillText}>{t('notifications.unread')}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.notificationMessage, { textAlign: rtl ? 'right' : 'left' }]}>
                            {itemMessage}
                          </Text>
                          <Text style={[styles.notificationTime, { textAlign: rtl ? 'right' : 'left' }]}>
                            {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Screen-Fitted Bottom Tab Bar */}
      <BottomTabBar
        tabs={bottomTabs}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setActiveTab(tabId as MainTab);
          if (tabId === 'more') setMoreSection('menu');
        }}
      />

      {/* Driver Detail Modal with explicit freshness */}
      <DriverDetailModal
        visible={driverModalVisible}
        driver={selectedDriver}
        isAdmin={true}
        onClose={() => setDriverModalVisible(false)}
        onDeviceReset={handleDeviceReset}
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
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#ffedd5',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  alertCountBadge: {
    backgroundColor: colors.status.critical,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  alertCountText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  alertBody: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
  },
  alertMessage: {
    fontSize: 11,
    color: '#c2410c',
  },
  alertTime: {
    fontSize: 10,
    color: '#ea580c',
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
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverMeta: {
    fontSize: 10,
    color: colors.text.muted,
  },
  driverTelemetryCol: {
    minWidth: 70,
  },
  driverSpeedText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverBatteryText: {
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
    gap: 2,
  },
  statusBadgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  statusBadgePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  employeeIdLabel: {
    fontSize: 9,
    color: colors.text.muted,
  },
  driverMainCol: {
    flex: 1,
  },
  cardDriverName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardDriverFreshness: {
    fontSize: 10,
    color: colors.text.muted,
  },
  driverRightCol: {
    minWidth: 60,
  },
  driverCardSpeed: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverCardBattery: {
    fontSize: 10,
    color: colors.text.muted,
  },
  chevronCol: {
    paddingHorizontal: 2,
  },
  moreContainer: {
    flex: 1,
  },
  moreGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  moreGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moreRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moreRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  moreRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  moreBadge: {
    backgroundColor: colors.status.critical,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  moreBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  subviewHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  subviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  markAllReadButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markAllReadText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  subviewScroll: {
    padding: spacing.md,
    gap: spacing.md,
  },
  deviceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.card,
  },
  deviceCardHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceDriverName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  deviceIdText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.text.muted,
  },
  authBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  authBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  deviceMetaRow: {
    justifyContent: 'space-between',
    marginTop: 4,
  },
  deviceMetaItem: {
    fontSize: 10,
    color: colors.text.muted,
  },
  deviceResetButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.xs,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 6,
  },
  deviceResetButtonText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
  },
  userRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.card,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  userPhone: {
    fontSize: 11,
    color: colors.text.muted,
  },
  userRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  userRoleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.card,
  },
  settingsCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  textInput: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text.primary,
  },
  primarySaveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.card,
  },
  primarySaveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
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
  emptyText: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.text.muted,
    marginVertical: 20,
  },
  disabledButton: {
    opacity: 0.6,
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
