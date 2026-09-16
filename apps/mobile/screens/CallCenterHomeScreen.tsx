import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { formatWesternNumber, getLocale, isRtl, setStoredLocale, t, type Locale } from '../i18n';
import { MobileMapView, type MapRestaurantPoint } from '../components/MobileMapView';
import { DriverDetailModal } from '../components/DriverDetailModal';
import { type Session } from '../session';

interface CallCenterHomeScreenProps {
  session: Session;
  apiUrl: string;
  apiRequest: <T>(path: string, options?: RequestInit, sessionOverride?: Session | null) => Promise<T>;
  onLogout: () => Promise<void>;
}

type TabType = 'dashboard' | 'map' | 'drivers' | 'notifications';

export function CallCenterHomeScreen({
  session,
  apiUrl,
  apiRequest,
  onLogout,
}: CallCenterHomeScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [refreshing, setRefreshing] = useState(false);

  // Fleet Data
  const [fleet, setFleet] = useState<any | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');

  // Notifications Data
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  const loadFleet = useCallback(async () => {
    try {
      const data = await apiRequest<any>('/api/fleet/live');
      setFleet(data);
      setFleetError(null);
    } catch (err: any) {
      setFleetError(err?.message || 'Failed to connect to server');
    }
  }, [apiRequest]);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFleet(), loadNotifications()]);
    setRefreshing(false);
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
    name: fleet?.restaurant?.name || 'Restaurant Base',
    latitude: fleet?.restaurant?.latitude ?? 24.7136,
    longitude: fleet?.restaurant?.longitude ?? 46.6753,
    radiusMeters: fleet?.restaurant?.radiusMeters ?? 500,
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
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>CALL CENTER</Text>
            </View>
            <View style={styles.readOnlyBadge}>
              <Text style={styles.readOnlyBadgeText}>{t('callCenter.readOnlyBadge')}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tabs */}
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

      {/* Content */}
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

        {/* Notice */}
        <View style={styles.noticeCard}>
          <Text style={[styles.noticeText, { textAlign: rtl ? 'right' : 'left' }]}>
            ℹ️ {t('callCenter.readOnlyNotice')}
          </Text>
        </View>

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <View>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('app.callCenterTitle')}
              </Text>
              <Text style={[styles.cardDescription, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('app.callCenterSubtitle')}
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

            {/* Live Map Preview */}
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

        {/* TAB 4: NOTIFICATIONS */}
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

      {/* Driver Detail Modal (STRICTLY READ-ONLY for Call Center) */}
      <DriverDetailModal
        visible={driverModalVisible}
        driver={selectedDriver}
        isAdmin={false}
        onClose={() => setDriverModalVisible(false)}
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
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fef3c7',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#92400e',
  },
  readOnlyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#e0f2fe',
  },
  readOnlyBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0369a1',
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
    paddingHorizontal: 14,
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
  noticeCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 10,
  },
  noticeText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '500',
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

