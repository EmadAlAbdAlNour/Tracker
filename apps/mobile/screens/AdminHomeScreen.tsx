import React, { useState, useEffect, useCallback } from 'react';
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
import { formatWesternNumber, getLocale, isRtl, setStoredLocale, t, type Locale } from '../i18n';
import { MobileMapView, type MapDriverPoint, type MapRestaurantPoint } from '../components/MobileMapView';
import { DriverDetailModal } from '../components/DriverDetailModal';
import { type Session } from '../session';

interface AdminHomeScreenProps {
  session: Session;
  apiUrl: string;
  apiRequest: <T>(path: string, options?: RequestInit, sessionOverride?: Session | null) => Promise<T>;
  onLogout: () => Promise<void>;
}

type TabType = 'dashboard' | 'map' | 'drivers' | 'devices' | 'settings' | 'users' | 'notifications';

export function AdminHomeScreen({
  session,
  apiUrl,
  apiRequest,
  onLogout,
}: AdminHomeScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [refreshing, setRefreshing] = useState(false);

  // Fleet Data
  const [fleet, setFleet] = useState<any | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');

  // Devices Data
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // Settings Data
  const [settingsRestaurant, setSettingsRestaurant] = useState<any>({
    name: '',
    latitude: 24.7136,
    longitude: 46.6753,
    radiusMeters: 500,
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

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  // Load Fleet Live
  const loadFleet = useCallback(async () => {
    try {
      const data = await apiRequest<any>('/api/fleet/live');
      setFleet(data);
      setFleetError(null);
    } catch (err: any) {
      setFleetError(err?.message || 'Failed to connect to server');
    }
  }, [apiRequest]);

  // Load Devices
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

  // Load Settings
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

  // Load Users
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

  // Load Notifications
  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest<any>('/api/notifications?limit=30');
      setNotifications(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // ignore
    }
  }, [apiRequest]);

  useEffect(() => {
    loadFleet();
    loadNotifications();
  }, [loadFleet, loadNotifications]);

  useEffect(() => {
    if (activeTab === 'devices') loadDevices();
    if (activeTab === 'settings') loadSettings();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'notifications') loadNotifications();
  }, [activeTab, loadDevices, loadSettings, loadUsers, loadNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadFleet(),
      activeTab === 'devices' ? loadDevices() : Promise.resolve(),
      activeTab === 'settings' ? loadSettings() : Promise.resolve(),
      activeTab === 'users' ? loadUsers() : Promise.resolve(),
      activeTab === 'notifications' ? loadNotifications() : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  const handleDeviceReset = async (driverId: string) => {
    try {
      await apiRequest(`/api/drivers/${driverId}/device/reset`, { method: 'POST' });
      Alert.alert(t('app.notice'), locale === 'ar' ? 'تمت إعادة تعيين الجهاز بنجاح' : 'Device reset successfully');
      await loadFleet();
      if (activeTab === 'devices') await loadDevices();
      if (selectedDriver && selectedDriver.driverId === driverId) {
        setSelectedDriver((prev: any) =>
          prev ? { ...prev, device: prev.device ? { ...prev.device, authorized: false } : null } : null
        );
      }
    } catch (err: any) {
      Alert.alert(t('app.error'), err?.message || 'Failed to reset device');
    }
  };

  const handleSaveSettings = async () => {
    const restName = settingsRestaurant.name?.trim();
    if (!restName) {
      Alert.alert(t('app.error'), locale === 'ar' ? 'اسم المطعم لا يمكن أن يكون فارغاً' : 'Restaurant name is required');
      return;
    }

    const lat = Number(settingsRestaurant.latitude);
    const lng = Number(settingsRestaurant.longitude);
    const radius = Number(settingsRestaurant.radiusMeters);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      Alert.alert(t('app.error'), locale === 'ar' ? 'إحداثيات خط العرض غير صالحة (-90 إلى 90)' : 'Invalid latitude (-90 to 90)');
      return;
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      Alert.alert(t('app.error'), locale === 'ar' ? 'إحداثيات خط الطول غير صالحة (-180 إلى 180)' : 'Invalid longitude (-180 to 180)');
      return;
    }
    if (Number.isNaN(radius) || radius <= 0 || radius > 50000) {
      Alert.alert(t('app.error'), locale === 'ar' ? 'نصف القطر يجب أن يكون بين 1 و 50000 متر' : 'Radius must be between 1 and 50,000 meters');
      return;
    }

    const maxStop = Number(settingsAlerts.maxStopDurationMinutes);
    const offlineGrace = Number(settingsAlerts.offlineGraceMinutes);
    const lowBatt = Number(settingsAlerts.lowBatteryThreshold);

    if (Number.isNaN(maxStop) || maxStop < 1 || maxStop > 120) {
      Alert.alert(t('app.error'), locale === 'ar' ? 'مدة التوقف القصوى يجب أن تكون بين 1 و 120 دقيقة' : 'Max stop duration must be between 1 and 120 minutes');
      return;
    }
    if (Number.isNaN(offlineGrace) || offlineGrace < 1 || offlineGrace > 60) {
      Alert.alert(t('app.error'), locale === 'ar' ? 'مهلة الانقطاع يجب أن تكون بين 1 و 60 دقيقة' : 'Offline grace must be between 1 and 60 minutes');
      return;
    }
    if (Number.isNaN(lowBatt) || lowBatt < 1 || lowBatt > 100) {
      Alert.alert(t('app.error'), locale === 'ar' ? 'حد انخفاض البطارية يجب أن يكون بين 1% و 100%' : 'Low battery threshold must be between 1% and 100%');
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
            radiusMeters: radius,
          }),
        }),
        apiRequest('/api/settings/alerts', {
          method: 'PUT',
          body: JSON.stringify({
            maxStopDurationMinutes: maxStop,
            offlineGraceMinutes: offlineGrace,
            lowBatteryThreshold: lowBatt,
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

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await loadNotifications();
    } catch {
      // ignore
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

  const rtl = isRtl();

  const restaurantPoint: MapRestaurantPoint = {
    name: fleet?.restaurant?.name || settingsRestaurant.name || 'Restaurant',
    latitude: fleet?.restaurant?.latitude ?? settingsRestaurant.latitude,
    longitude: fleet?.restaurant?.longitude ?? settingsRestaurant.longitude,
    radiusMeters: fleet?.restaurant?.radiusMeters ?? settingsRestaurant.radiusMeters,
  };

  const filteredDrivers = (fleet?.drivers ?? []).filter((d: any) => {
    if (!driverSearch.trim()) return true;
    const query = driverSearch.toLowerCase().trim();
    return (
      d.driverName.toLowerCase().includes(query) ||
      d.employeeId.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'MOVING':
        return '#059669';
      case 'STOPPED':
        return '#d97706';
      case 'AT_RESTAURANT':
        return '#0284c7';
      case 'OFFLINE':
      default:
        return '#64748b';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
            <Text style={styles.langButtonText}>{locale === 'ar' ? 'English' : 'العربية'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutSmallButton} onPress={onLogout}>
            <Text style={styles.logoutSmallText}>{t('app.logout')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topBarUser}>
          <Text style={styles.topBarName}>{session.user.name}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>ADMIN</Text>
          </View>
        </View>
      </View>

      {/* Segmented Tab Navigation */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
        >
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'dashboard' && styles.tabButtonActive]}
            onPress={() => setActiveTab('dashboard')}
          >
            <Text
              style={[styles.tabButtonText, activeTab === 'dashboard' && styles.tabButtonTextActive]}
            >
              📊 {t('admin.dashboard')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'map' && styles.tabButtonActive]}
            onPress={() => setActiveTab('map')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'map' && styles.tabButtonTextActive]}>
              🗺️ {t('admin.map')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'drivers' && styles.tabButtonActive]}
            onPress={() => setActiveTab('drivers')}
          >
            <Text
              style={[styles.tabButtonText, activeTab === 'drivers' && styles.tabButtonTextActive]}
            >
              🚗 {t('admin.drivers')} ({formatWesternNumber(fleet?.drivers?.length ?? 0)})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'devices' && styles.tabButtonActive]}
            onPress={() => setActiveTab('devices')}
          >
            <Text
              style={[styles.tabButtonText, activeTab === 'devices' && styles.tabButtonTextActive]}
            >
              📱 {t('admin.devices')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'settings' && styles.tabButtonActive]}
            onPress={() => setActiveTab('settings')}
          >
            <Text
              style={[styles.tabButtonText, activeTab === 'settings' && styles.tabButtonTextActive]}
            >
              ⚙️ {t('admin.settings')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'users' && styles.tabButtonActive]}
            onPress={() => setActiveTab('users')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'users' && styles.tabButtonTextActive]}>
              👥 {t('admin.users')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'notifications' && styles.tabButtonActive]}
            onPress={() => setActiveTab('notifications')}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'notifications' && styles.tabButtonTextActive,
              ]}
            >
              🔔 {t('admin.notifications')}
              {unreadCount > 0 ? ` (${formatWesternNumber(unreadCount)})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {fleetError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠️ {fleetError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadFleet}>
              <Text style={styles.retryButtonText}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <View>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('app.adminTitle')}
              </Text>
              <Text style={[styles.cardDescription, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('app.adminSubtitle')}
              </Text>

              {fleet?.summary && (
                <View style={styles.kpiGrid}>
                  <View style={styles.kpiBox}>
                    <Text style={styles.kpiNumber}>
                      {formatWesternNumber(fleet.summary.activeShifts)}
                    </Text>
                    <Text style={styles.kpiLabel}>{t('operator.activeShifts')}</Text>
                  </View>
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiNumber, { color: '#059669' }]}>
                      {formatWesternNumber(fleet.summary.onlineDrivers)}
                    </Text>
                    <Text style={styles.kpiLabel}>{t('operator.online')}</Text>
                  </View>
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiNumber, { color: '#0284c7' }]}>
                      {formatWesternNumber(fleet.summary.atRestaurant)}
                    </Text>
                    <Text style={styles.kpiLabel}>{t('operator.atRestaurant')}</Text>
                  </View>
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiNumber, { color: '#d97706' }]}>
                      {formatWesternNumber(fleet.summary.moving)}
                    </Text>
                    <Text style={styles.kpiLabel}>{t('operator.moving')}</Text>
                  </View>
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiNumber, { color: '#e11d48' }]}>
                      {formatWesternNumber(fleet.summary.lowBatteryCount)}
                    </Text>
                    <Text style={styles.kpiLabel}>{t('operator.lowBattery')}</Text>
                  </View>
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiNumber, { color: '#64748b' }]}>
                      {formatWesternNumber(fleet.summary.offline)}
                    </Text>
                    <Text style={styles.kpiLabel}>{t('operator.offline')}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Quick Map Preview */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('map.title')}</Text>
                <TouchableOpacity onPress={() => setActiveTab('map')}>
                  <Text style={styles.linkText}>{t('admin.map')} →</Text>
                </TouchableOpacity>
              </View>

              <MobileMapView
                restaurant={restaurantPoint}
                drivers={fleet?.drivers ?? []}
                selectedDriverId={selectedDriver?.driverId}
                onSelectDriver={(d) => {
                  const full = fleet?.drivers?.find((x: any) => x.driverId === d.driverId);
                  setSelectedDriver(full ?? d);
                }}
                onViewDriverDetail={(d) => {
                  const full = fleet?.drivers?.find((x: any) => x.driverId === d.driverId);
                  setSelectedDriver(full ?? d);
                  setDriverModalVisible(true);
                }}
              />
            </View>
          </View>
        )}

        {/* TAB 2: MAP */}
        {activeTab === 'map' && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('map.title')}
            </Text>
            <Text style={[styles.cardDescription, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('map.driverCountOnMap')} {formatWesternNumber(fleet?.drivers?.length ?? 0)}
            </Text>

            <MobileMapView
              restaurant={restaurantPoint}
              drivers={fleet?.drivers ?? []}
              selectedDriverId={selectedDriver?.driverId}
              onSelectDriver={(d) => {
                const full = fleet?.drivers?.find((x: any) => x.driverId === d.driverId);
                setSelectedDriver(full ?? d);
              }}
              onViewDriverDetail={(d) => {
                const full = fleet?.drivers?.find((x: any) => x.driverId === d.driverId);
                setSelectedDriver(full ?? d);
                setDriverModalVisible(true);
              }}
            />
          </View>
        )}

        {/* TAB 3: DRIVERS */}
        {activeTab === 'drivers' && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('admin.drivers')} ({formatWesternNumber(filteredDrivers.length)})
            </Text>

            <TextInput
              style={[styles.searchInput, { textAlign: rtl ? 'right' : 'left' }]}
              placeholder="بحث بالاسم أو الرقم الوظيفي..."
              placeholderTextColor="#94a3b8"
              value={driverSearch}
              onChangeText={setDriverSearch}
            />

            {filteredDrivers.length === 0 ? (
              <Text style={styles.emptyText}>{t('operator.noDrivers')}</Text>
            ) : (
              filteredDrivers.map((driver: any) => {
                const statusColor = getStatusColor(driver.operationalStatus);
                const battery = driver.device?.batteryPercentage;
                return (
                  <TouchableOpacity
                    key={driver.driverId}
                    style={styles.driverItem}
                    onPress={() => {
                      setSelectedDriver(driver);
                      setDriverModalVisible(true);
                    }}
                  >
                    <View style={styles.driverItemHeader}>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                          {t(`operator.${driver.operationalStatus.toLowerCase()}`) ||
                            driver.operationalStatus}
                        </Text>
                      </View>
                      <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
                        <Text style={styles.driverName}>{driver.driverName}</Text>
                        <Text style={styles.driverSub}>
                          {t('diagnostics.employeeId')} {formatWesternNumber(driver.employeeId)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.driverMetaRow}>
                      {battery != null && (
                        <Text style={[styles.metaText, battery <= 20 ? styles.textRed : undefined]}>
                          🔋 {formatWesternNumber(battery)}%
                          {driver.device?.isCharging ? ' ⚡' : ''}
                        </Text>
                      )}
                      {driver.location?.speed != null && (
                        <Text style={styles.metaText}>
                          🚀 {formatWesternNumber(Math.round(driver.location.speed * 3.6))}{' '}
                          {t('driverDetail.speedUnit')}
                        </Text>
                      )}
                      <Text style={styles.metaLinkText}>{t('map.viewDetails')} →</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* TAB 4: DEVICES */}
        {activeTab === 'devices' && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('admin.deviceManagement')} ({formatWesternNumber(devices.length)})
            </Text>

            {devicesLoading ? (
              <ActivityIndicator color="#0f172a" style={{ marginVertical: 20 }} />
            ) : devices.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد أجهزة مسجلة</Text>
            ) : (
              devices.map((dev) => (
                <View key={dev.id} style={styles.deviceCard}>
                  <View style={styles.deviceHeader}>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: dev.authorized ? '#d1fae5' : '#fee2e2' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: dev.authorized ? '#065f46' : '#991b1b' },
                        ]}
                      >
                        {dev.authorized ? t('admin.authorized') : t('admin.unauthorized')}
                      </Text>
                    </View>
                    <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
                      <Text style={styles.deviceName}>{dev.driverName}</Text>
                      <Text style={styles.deviceSub}>
                        {dev.platform?.toUpperCase()} • v{dev.appVersion ?? '1.0'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.deviceMetaRow}>
                    <Text style={styles.deviceMetaText}>
                      {t('operator.lastSeen')}:{' '}
                      {dev.lastSeen ? new Date(dev.lastSeen).toLocaleTimeString() : t('admin.never')}
                    </Text>
                  </View>

                  {dev.authorized && (
                    <TouchableOpacity
                      style={styles.resetSmallButton}
                      onPress={() => {
                        Alert.alert(
                          t('admin.confirmResetTitle'),
                          t('admin.confirmResetMessage'),
                          [
                            { text: t('app.cancel'), style: 'cancel' },
                            {
                              text: t('admin.resetDevice'),
                              style: 'destructive',
                              onPress: () => handleDeviceReset(dev.driverId),
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.resetSmallButtonText}>{t('admin.resetDevice')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 5: SETTINGS */}
        {activeTab === 'settings' && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('admin.restaurantSettings')}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('admin.restaurantName')}</Text>
              <TextInput
                style={styles.formInput}
                value={settingsRestaurant.name}
                onChangeText={(v) => setSettingsRestaurant((p: any) => ({ ...p, name: v }))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('admin.geofenceRadius')}</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                value={String(settingsRestaurant.radiusMeters)}
                onChangeText={(v) =>
                  setSettingsRestaurant((p: any) => ({ ...p, radiusMeters: Number(v) || 0 }))
                }
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>{t('admin.latitude')}</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={String(settingsRestaurant.latitude)}
                  onChangeText={(v) =>
                    setSettingsRestaurant((p: any) => ({ ...p, latitude: Number(v) || 0 }))
                  }
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>{t('admin.longitude')}</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={String(settingsRestaurant.longitude)}
                  onChangeText={(v) =>
                    setSettingsRestaurant((p: any) => ({ ...p, longitude: Number(v) || 0 }))
                  }
                />
              </View>
            </View>

            <Text style={[styles.cardTitle, { marginTop: 20, textAlign: rtl ? 'right' : 'left' }]}>
              {t('admin.alertThresholds')}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('admin.maxStopDuration')}</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                value={String(settingsAlerts.maxStopDurationMinutes)}
                onChangeText={(v) =>
                  setSettingsAlerts((p: any) => ({
                    ...p,
                    maxStopDurationMinutes: Number(v) || 0,
                  }))
                }
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('admin.offlineGraceMinutes')}</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                value={String(settingsAlerts.offlineGraceMinutes)}
                onChangeText={(v) =>
                  setSettingsAlerts((p: any) => ({
                    ...p,
                    offlineGraceMinutes: Number(v) || 0,
                  }))
                }
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('admin.lowBatteryThreshold')}</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                value={String(settingsAlerts.lowBatteryThreshold)}
                onChangeText={(v) =>
                  setSettingsAlerts((p: any) => ({
                    ...p,
                    lowBatteryThreshold: Number(v) || 0,
                  }))
                }
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, settingsSaving && styles.disabledButton]}
              onPress={handleSaveSettings}
              disabled={settingsSaving}
            >
              {settingsSaving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>{t('app.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 6: USERS */}
        {activeTab === 'users' && (
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('admin.usersList')} ({formatWesternNumber(users.length)})
            </Text>

            {usersLoading ? (
              <ActivityIndicator color="#0f172a" style={{ marginVertical: 20 }} />
            ) : (
              users.map((u) => (
                <View key={u.id} style={styles.userCard}>
                  <View style={styles.userHeader}>
                    <View
                      style={[
                        styles.roleBadge,
                        {
                          backgroundColor:
                            u.role === 'ADMIN'
                              ? '#dbeafe'
                              : u.role === 'CALL_CENTER'
                              ? '#fef3c7'
                              : '#d1fae5',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          {
                            color:
                              u.role === 'ADMIN'
                                ? '#1e40af'
                                : u.role === 'CALL_CENTER'
                                ? '#92400e'
                                : '#065f46',
                          },
                        ]}
                      >
                        {u.role}
                      </Text>
                    </View>
                    <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end' }}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.userSub}>{u.email}</Text>
                    </View>
                  </View>
                  <View style={styles.userMetaRow}>
                    <Text
                      style={[styles.userStatus, u.active ? styles.textGreen : styles.textRed]}
                    >
                      {u.active ? t('admin.active') : t('admin.inactive')}
                    </Text>
                    {u.phone ? <Text style={styles.userPhone}>{u.phone}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 7: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {t('notifications.title')} ({formatWesternNumber(notifications.length)})
              </Text>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={handleMarkAllNotificationsRead}>
                  <Text style={styles.linkText}>{t('notifications.markAllRead')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {notifications.length === 0 ? (
              <Text style={styles.emptyText}>{t('notifications.noNotifications')}</Text>
            ) : (
              notifications.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.notificationCard, !n.read && styles.notificationUnread]}
                  onPress={() => handleMarkNotificationRead(n.id)}
                >
                  <View style={styles.notifHeader}>
                    {!n.read && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{t('notifications.unread')}</Text>
                      </View>
                    )}
                    <Text style={styles.notifTime}>
                      {new Date(n.createdAt).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  <Text style={styles.notifMessage}>{n.message}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Driver Detail Modal */}
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
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  langButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  langButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  logoutSmallButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  logoutSmallText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },
  topBarUser: {
    alignItems: 'flex-end',
  },
  topBarName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#dbeafe',
    marginTop: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1d4ed8',
  },
  tabsContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabsScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  tabButtonActive: {
    backgroundColor: '#0f172a',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  cardDescription: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 12,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  kpiBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  kpiNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  linkText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#059669',
  },
  searchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 12,
    color: '#0f172a',
  },
  driverItem: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 12,
  },
  driverItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  driverName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  driverSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  driverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaText: {
    fontSize: 11,
    color: '#64748b',
  },
  metaLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284c7',
  },
  deviceCard: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 12,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  deviceSub: {
    fontSize: 11,
    color: '#64748b',
  },
  deviceMetaRow: {
    marginTop: 4,
  },
  deviceMetaText: {
    fontSize: 11,
    color: '#64748b',
  },
  resetSmallButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  resetSmallButtonText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  formGroup: {
    marginBottom: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  saveButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  userCard: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 10,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  userSub: {
    fontSize: 11,
    color: '#64748b',
  },
  userMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  userStatus: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  userPhone: {
    fontSize: 11,
    color: '#64748b',
  },
  notificationCard: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 10,
  },
  notificationUnread: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  unreadBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unreadBadgeText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  notifTime: {
    fontSize: 10,
    color: '#94a3b8',
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  notifMessage: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    paddingVertical: 16,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  textGreen: {
    color: '#059669',
  },
  textRed: {
    color: '#dc2626',
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBannerText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

