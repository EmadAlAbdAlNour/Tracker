// Rebuilt Call Center Experience for Tracker Mobile
// Dedicated Operations Monitoring Console, Strictly Read-Only, Real Geographic Map

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
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
import { RealGeographicMapView, type MapRestaurantPoint } from '../components/RealGeographicMapView';
import { DriverDetailModal } from '../components/DriverDetailModal';
import { formatWesternNumber, getLocale, isRtl, setStoredLocale, t, type Locale } from '../i18n';
import { type Session } from '../session';

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
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [mapFilter, setMapFilter] = useState<string>('ALL');

  // Notifications Data
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const rtl = isRtl();

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

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

  const restaurantPoint: MapRestaurantPoint = useMemo(() => ({
    name: fleet?.restaurant?.name || 'Branch Base',
    latitude: fleet?.restaurant?.latitude ?? 30.0444,
    longitude: fleet?.restaurant?.longitude ?? 31.2357,
    radiusMeters: fleet?.restaurant?.radiusMeters ?? 1500,
  }), [fleet]);

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
    const tracking = driversList.filter((d: any) => d.operationalStatus !== 'OFFLINE' && d.location).length;
    const online = driversList.filter((d: any) => d.operationalStatus !== 'OFFLINE').length;
    const offline = total - online;
    const activeAlerts = (fleet?.alerts ?? []).length;

    return { total, inShift, tracking, online, offline, activeAlerts };
  }, [fleet]);

  const bottomTabs: TabItem[] = [
    { id: 'dashboard', label: rtl ? 'الرئيسية' : 'Dashboard', icon: 'dashboard' },
    { id: 'map', label: rtl ? 'الخريطة' : 'Map', icon: 'map' },
    { id: 'drivers', label: rtl ? 'السائقون' : 'Drivers', icon: 'driver', badgeCount: metrics.online > 0 ? metrics.online : undefined },
    { id: 'notifications', label: rtl ? 'الإشعارات' : 'Alerts', icon: 'bell', badgeCount: unreadCount > 0 ? unreadCount : undefined },
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
            : rtl ? 'الإشعارات والتنبيهات' : 'Alerts & Incidents'
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
            <View style={[styles.readOnlyBanner, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
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
                  <Text style={styles.kpiLabel}>{rtl ? 'تنبيهات' : 'Alerts'}</Text>
                  <Text style={[styles.kpiValue, { color: metrics.activeAlerts > 0 ? colors.status.critical : colors.text.muted }]}>
                    {formatWesternNumber(metrics.activeAlerts)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Map Preview */}
            <View style={styles.section}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
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
              <View style={[styles.sectionHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Text style={styles.sectionTitle}>{rtl ? 'السائقون النشطون' : 'Active Drivers'}</Text>
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
              <View style={styles.searchBar}>
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

                    <View style={[styles.driverMainCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                      <Text style={styles.cardDriverName}>{d.driverName}</Text>
                      <Text style={styles.cardDriverFreshness}>
                        {isDOnline ? (rtl ? 'متصل الآن' : 'Live') : (rtl ? 'آخر بيانات معروفة' : 'Last known state')}
                      </Text>
                    </View>

                    <View style={[styles.driverRightCol, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
                      <Text style={styles.driverCardSpeed}>
                        {speed != null ? `${formatWesternNumber(speed)} ${t('driverDetail.speedUnit')}` : '—'}
                      </Text>
                      <Text style={styles.driverCardBattery}>
                        {d.device?.batteryPercentage != null ? `${formatWesternNumber(d.device.batteryPercentage)}%` : '—'}
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
                  ? n.titleAr || n.title || n.titleEn || 'تقرير بلاغ ميداني'
                  : n.titleEn || n.title || n.titleAr || 'Incident Report';
                const itemMessage = rtl
                  ? n.messageAr || n.message || n.messageEn || ''
                  : n.messageEn || n.message || n.messageAr || '';
                return (
                  <View key={n.id} style={[styles.notificationCard, !n.isRead && styles.unreadNotification]}>
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
                  </View>
                );
              })
            )}
          </ScrollView>
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
