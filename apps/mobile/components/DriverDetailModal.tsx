// Rebuilt Driver Operational Profile Modal
// Explicit Freshness Semantics, Connection vs Movement Separation, Zero-Emoji

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, fonts, radius, spacing, typography, shadows } from '../designSystem';
import { AppIcon } from './AppIcon';
import { TrackerDialog } from './TrackerDialog';
import { formatWesternNumber, getRowDirection, isRtl, t } from '../i18n';
import {
  resolveActivityPresentation,
  resolveBatteryFreshness,
  resolveConnectionState,
  resolveGeofencePresentation,
  resolveOperationalState,
  resolveSpeedSemantics,
} from '../telemetry';

interface DriverDetailModalProps {
  visible: boolean;
  driver: any | null;
  isAdmin: boolean;
  onClose: () => void;
  onDeviceReset?: (driverId: string) => Promise<void>;
  onForceEndShift?: (driverId: string) => Promise<void>;
  apiRequest?: <T>(path: string, options?: RequestInit) => Promise<T>;
}

export function DriverDetailModal({
  visible,
  driver,
  isAdmin,
  onClose,
  onDeviceReset,
  onForceEndShift,
  apiRequest,
}: DriverDetailModalProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'locations'>('overview');
  const [activities, setActivities] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [resetting, setResetting] = useState(false);
  const [forceEnding, setForceEnding] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'warning' | 'notice' | 'success';
    primaryButtonText?: string;
    onPrimaryPress?: () => void;
    secondaryButtonText?: string;
    onSecondaryPress?: () => void;
    isDestructive?: boolean;
    loading?: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  React.useEffect(() => {
    let isMounted = true;
    if (visible && driver?.driverId && apiRequest) {
      setLoadingHistory(true);
      Promise.all([
        apiRequest<any>(`/api/drivers/${driver.driverId}/activity`).catch(() => ({ items: [] })),
        apiRequest<any>(`/api/drivers/${driver.driverId}/locations?limit=15`).catch(() => ({ items: [] })),
      ])
        .then(([actData, locData]) => {
          if (isMounted) {
            setActivities(actData?.items || []);
            setLocations(locData?.items || []);
            setLoadingHistory(false);
          }
        })
        .catch(() => {
          if (isMounted) setLoadingHistory(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [visible, driver?.driverId, apiRequest]);

  if (!driver) return <></>;

  const rtl = isRtl();

  // Freshness & Connection vs Movement Logic
  const hasActiveShift = Boolean(driver.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status));
  const hasLocation = Boolean(driver.location && (driver.location.latitude != null || driver.location.longitude != null));
  const isAwaitingTelemetry = hasActiveShift && !hasLocation;

  // Authoritative Connection State strictly from devices.lastSeen
  const connectionState = resolveConnectionState(driver);
  const isOnline = connectionState === 'online';

  // Last Connection Time (from devices.lastSeen)
  const lastSeenMs = driver.device?.lastSeen ? new Date(driver.device.lastSeen).getTime() : 0;
  const lastSeenMinutes = lastSeenMs > 0 ? Math.max(0, Math.round((Date.now() - lastSeenMs) / 60000)) : null;

  // Last GPS Location Time (from location.recordedAt)
  const recordedAtMs = driver.location?.recordedAt ? new Date(driver.location.recordedAt).getTime() : 0;
  const locationAgeMinutes = recordedAtMs > 0 ? Math.max(0, Math.round((Date.now() - recordedAtMs) / 60000)) : null;

  // Authoritative Movement / Operational State from backend
  const opStatus = resolveOperationalState(driver);

  // Authoritative Speed Semantics
  const speedSemantics = resolveSpeedSemantics({
    speedMs: driver.location?.speed,
    operationalStatus: driver.operationalStatus,
    isOnline: driver.isOnline,
    recordedAt: driver.location?.recordedAt,
    accuracy: driver.location?.accuracy,
  });

  // Authoritative Geofence Presentation (No-Location Precedence)
  const geofencePresentation = resolveGeofencePresentation({
    hasLocation,
    hasActiveShift,
    isInsideGeofence: driver.isInsideGeofence,
  });
  const geofenceLabel = rtl ? geofencePresentation.labelAr : geofencePresentation.labelEn;
  const geofenceColor =
    geofencePresentation.state === 'INSIDE'
      ? colors.status.online
      : geofencePresentation.state === 'OUTSIDE'
      ? colors.status.warning
      : colors.text.muted;

  // Authoritative Battery Freshness
  const batteryFreshness = resolveBatteryFreshness({
    batteryPercentage: driver.device?.batteryPercentage,
    lastSeen: driver.device?.lastSeen,
    isOnline: driver.isOnline,
  });
  const batteryLabel = rtl ? batteryFreshness.labelAr : batteryFreshness.labelEn;

  const rowDir = getRowDirection();

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'awaiting':
        return {
          label: rtl ? 'في الوردية — بانتظار بيانات الموقع' : 'On shift — awaiting location data',
          bg: colors.status.warningBg,
          text: colors.status.warning,
          border: colors.status.warningBorder,
        };
      case 'online':
        return { label: rtl ? 'متصل الآن' : 'ONLINE', bg: colors.status.onlineBg, text: colors.status.online, border: colors.status.onlineBorder };
      case 'offline':
      default:
        return { label: rtl ? 'غير متصل' : 'OFFLINE', bg: colors.status.offlineBg, text: colors.status.offline, border: colors.status.offlineBorder };
    }
  };

  const getMovementBadge = () => {
    switch (opStatus) {
      case 'MOVING':
        return { label: rtl ? 'في حركة' : 'MOVING', color: colors.status.moving };
      case 'AT_RESTAURANT':
        return { label: rtl ? 'في المطعم' : 'AT RESTAURANT', color: colors.status.online };
      case 'STOPPED':
        return { label: rtl ? 'متوقف' : 'STOPPED', color: colors.status.stopped };
      case 'OFFLINE':
      default:
        return { label: rtl ? 'غير متصل' : 'OFFLINE', color: colors.text.muted };
    }
  };

  const connBadge = getConnectionBadge();
  const movBadge = getMovementBadge();

  const handleResetPress = () => {
    setDialogConfig({
      visible: true,
      title: t('admin.confirmResetTitle'),
      message: t('admin.confirmResetMessage'),
      type: 'warning',
      isDestructive: true,
      primaryButtonText: t('admin.resetDevice'),
      secondaryButtonText: t('app.cancel'),
      onSecondaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
      onPrimaryPress: async () => {
        if (!onDeviceReset) return;
        setResetting(true);
        setDialogConfig((prev) => ({ ...prev, loading: true }));
        try {
          await onDeviceReset(driver.driverId);
          setDialogConfig({
            visible: true,
            title: t('app.notice'),
            message: t('admin.resetSuccess'),
            type: 'success',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
        } catch (err: any) {
          setDialogConfig({
            visible: true,
            title: t('app.error'),
            message: err?.message || t('admin.resetFailed'),
            type: 'error',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
        } finally {
          setResetting(false);
        }
      },
    });
  };

  const handleForceEndPress = () => {
    setDialogConfig({
      visible: true,
      title: rtl ? 'إنهاء وردية السائق إجبارياً' : 'Force End Driver Shift',
      message: rtl
        ? 'هل أنت متأكد من إنهاء وردية هذا السائق قسراً؟ سيتم إيقاف تتبع الوردية وحل كافة التنبيهات المرتبطة به.'
        : "Are you sure you want to force end this driver's shift? Active tracking will stop and any ongoing alerts will be resolved.",
      type: 'warning',
      isDestructive: true,
      primaryButtonText: rtl ? 'إنهاء الوردية' : 'Force End Shift',
      secondaryButtonText: t('app.cancel'),
      onSecondaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
      onPrimaryPress: async () => {
        if (!onForceEndShift) return;
        setForceEnding(true);
        setDialogConfig((prev) => ({ ...prev, loading: true }));
        try {
          await onForceEndShift(driver.driverId);
          setDialogConfig({
            visible: true,
            title: t('app.notice'),
            message: rtl ? 'تم إنهاء وردية السائق بنجاح' : 'Driver shift ended successfully',
            type: 'success',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => {
              setDialogConfig((prev) => ({ ...prev, visible: false }));
              onClose();
            },
          });
        } catch (err: any) {
          setDialogConfig({
            visible: true,
            title: t('app.error'),
            message: err?.message || (rtl ? 'تعذر إنهاء الوردية' : 'Failed to end shift'),
            type: 'error',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
        } finally {
          setForceEnding(false);
        }
      },
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        {/* Header */}
        <View style={[styles.header, { flexDirection: rowDir }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
            <AppIcon name="close" size={16} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={[styles.headerTitleGroup, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
            <Text style={styles.headerTitle}>{driver.driverName}</Text>
            <Text style={styles.headerSub}>
              {t('diagnostics.employeeId')} {formatWesternNumber(driver.employeeId)}
            </Text>
          </View>
        </View>

        {/* Tab Selector Bar */}
        <View style={[styles.tabBar, { flexDirection: rowDir }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'overview' && styles.tabButtonActive]}
            onPress={() => setActiveTab('overview')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'overview' && styles.tabButtonTextActive]}>
              {rtl ? 'نظرة عامة' : 'Overview'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'activity' && styles.tabButtonActive]}
            onPress={() => setActiveTab('activity')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'activity' && styles.tabButtonTextActive]}>
              {rtl ? 'النشاط' : 'Activity'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'locations' && styles.tabButtonActive]}
            onPress={() => setActiveTab('locations')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'locations' && styles.tabButtonTextActive]}>
              {rtl ? 'المواقع' : 'Locations'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {activeTab === 'overview' && (
            <>
              {/* Status & Freshness Header Card */}
              <View style={styles.card}>
                <View style={[styles.rowBetween, { flexDirection: rowDir }]}>
                  <Text style={[styles.cardSectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'الحالة والاتصال الميداني' : 'Connection & Status'}
                  </Text>
                  <View style={[styles.badgePill, { backgroundColor: connBadge.bg, borderColor: connBadge.border }]}>
                    <Text style={[styles.badgePillText, { color: connBadge.text }]}>{connBadge.label}</Text>
                  </View>
                </View>

                {/* Connection Freshness (lastSeen) */}
                <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                  <Text style={styles.metaLabel}>{rtl ? 'آخر اتصال مسجل:' : 'Last Connection:'}</Text>
                  <Text style={[styles.metaValue, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                    {isAwaitingTelemetry
                      ? (rtl ? 'بانتظار بدء الإرسال' : 'Awaiting signal')
                      : lastSeenMinutes != null
                      ? lastSeenMinutes === 0
                        ? (rtl ? 'منذ ثوانٍ' : 'seconds ago')
                        : (rtl ? `منذ ${formatWesternNumber(lastSeenMinutes)} دقيقة` : `${formatWesternNumber(lastSeenMinutes)}m ago`)
                      : (rtl ? 'غير متوفر' : 'Unavailable')}
                  </Text>
                </View>

                {/* GPS Location Freshness (recordedAt) */}
                <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                  <Text style={styles.metaLabel}>{rtl ? 'آخر موقع مسجل:' : 'Last GPS Location:'}</Text>
                  <Text style={[styles.metaValue, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                    {isAwaitingTelemetry || !hasLocation
                      ? (rtl ? 'لا توجد بيانات موقع' : 'No GPS coordinates')
                      : locationAgeMinutes != null
                      ? locationAgeMinutes === 0
                        ? (rtl ? 'منذ ثوانٍ' : 'seconds ago')
                        : (rtl ? `منذ ${formatWesternNumber(locationAgeMinutes)} دقيقة` : `${formatWesternNumber(locationAgeMinutes)}m ago`)
                      : '—'}
                  </Text>
                </View>

                {/* Operational Status */}
                <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                  <Text style={styles.metaLabel}>{rtl ? 'الحالة التشغيلية:' : 'Operational Status:'}</Text>
                  <Text style={[styles.metaValue, { color: movBadge.color, fontWeight: '700', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                    {movBadge.label}
                  </Text>
                </View>
              </View>

              {/* Telemetry Card (Explicit Stale vs Live Semantics) */}
              <View style={styles.card}>
                <View style={[styles.telemetryHeaderRow, { flexDirection: rowDir }]}>
                  <Text style={[styles.cardSectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {isAwaitingTelemetry
                      ? (rtl ? 'في انتظار أول إشارة موقع' : 'Awaiting Initial Location Signal')
                      : isOnline
                      ? (rtl ? 'بيانات التتبع المباشرة' : 'Live Telemetry')
                      : (rtl ? 'آخر بيانات معروفة (تاريخية)' : 'Last Known Telemetry')}
                  </Text>
                  {isAwaitingTelemetry ? (
                    <View style={styles.staleNoticePill}>
                      <Text style={styles.staleNoticeText} numberOfLines={1}>{rtl ? 'قيد الانتظار' : 'Pending'}</Text>
                    </View>
                  ) : !isOnline ? (
                    <View style={styles.staleNoticePill}>
                      <Text style={styles.staleNoticeText} numberOfLines={1}>{rtl ? 'بيانات سابقة' : 'Stale'}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={[styles.grid2Col, { flexDirection: rowDir }]}>
                  {/* Speed */}
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridCellLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                      {speedSemantics.isCurrent
                        ? (rtl ? 'السرعة الحالية' : 'Current Speed')
                        : speedSemantics.isHistorical
                        ? (rtl ? 'آخر سرعة مسجلة' : 'Last Recorded Speed')
                        : (rtl ? 'السرعة' : 'Speed')}
                    </Text>
                    <Text style={[styles.gridCellValue, { textAlign: rtl ? 'right' : 'left' }]}>
                      {speedSemantics.speedKmh != null
                        ? `${formatWesternNumber(speedSemantics.speedKmh)} ${t('driverDetail.speedUnit')}`
                        : '—'}
                    </Text>
                    {speedSemantics.isHistorical && speedSemantics.ageMinutes != null ? (
                      <Text style={[styles.gridCellSublabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {rtl ? `منذ ${formatWesternNumber(speedSemantics.ageMinutes)} دقيقة` : `${formatWesternNumber(speedSemantics.ageMinutes)}m ago`}
                      </Text>
                    ) : null}
                  </View>

                  {/* Heading */}
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridCellLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                      {isOnline ? rtl ? 'الاتجاه' : 'Heading' : rtl ? 'الاتجاه وقت آخر تحديث' : 'Heading at last update'}
                    </Text>
                    <Text style={[styles.gridCellValue, { textAlign: rtl ? 'right' : 'left' }]}>
                      {driver.location?.heading != null ? `${formatWesternNumber(Math.round(driver.location.heading))}°` : '—'}
                    </Text>
                  </View>

                  {/* Geofence */}
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridCellLabel, { textAlign: rtl ? 'right' : 'left' }]}>{rtl ? 'نطاق المطعم' : 'Geofence'}</Text>
                    <Text
                      style={[
                        styles.gridCellValue,
                        { color: geofenceColor, textAlign: rtl ? 'right' : 'left' },
                      ]}
                    >
                      {geofenceLabel}
                    </Text>
                  </View>

                  {/* Distance & GPS Accuracy */}
                  <View style={styles.gridCell}>
                    <Text style={[styles.gridCellLabel, { textAlign: rtl ? 'right' : 'left' }]}>{rtl ? 'المسافة عن المطعم' : 'Distance'}</Text>
                    <Text style={[styles.gridCellValue, { textAlign: rtl ? 'right' : 'left' }]}>
                      {driver.distanceToRestaurantMeters != null
                        ? `~${formatWesternNumber(Math.round(driver.distanceToRestaurantMeters))} ${t('driverDetail.meters')}`
                        : '—'}
                    </Text>
                    {driver.location?.accuracy != null && (
                      <Text style={[styles.gridCellSublabel, { textAlign: rtl ? 'right' : 'left' }, Number(driver.location.accuracy) > 35 && { color: colors.status.warning }]}>
                        {rtl
                          ? `دقة GPS: ±${formatWesternNumber(Math.round(Number(driver.location.accuracy)))}م${Number(driver.location.accuracy) > 35 ? ' (منخفضة)' : ''}`
                          : `GPS ±${formatWesternNumber(Math.round(Number(driver.location.accuracy)))}m${Number(driver.location.accuracy) > 35 ? ' (Degraded)' : ''}`}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Shift & Device Hardware */}
              <View style={styles.card}>
                <Text style={[styles.cardSectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                  {rtl ? 'بيانات الوردية والجهاز المعتمد' : 'Shift & Authorized Device'}
                </Text>

                <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                  <Text style={styles.metaLabel}>{rtl ? 'حالة الوردية:' : 'Shift:'}</Text>
                  <Text style={[styles.metaValue, { color: driver.shift ? colors.status.online : colors.text.muted, fontWeight: '700' }]}>
                    {driver.shift ? t('shift.onDuty') : t('shift.offDuty')}
                  </Text>
                </View>

                <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                  <Text style={styles.metaLabel}>{rtl ? 'مستوى البطارية:' : 'Battery:'}</Text>
                  <Text
                    style={[
                      styles.metaValue,
                      batteryFreshness.isStale && { color: colors.status.warning },
                      { writingDirection: rtl ? 'rtl' : 'ltr' },
                    ]}
                  >
                    {batteryLabel}
                  </Text>
                </View>

                <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                  <Text style={styles.metaLabel}>{rtl ? 'معرف الجهاز المعتمد:' : 'Device ID:'}</Text>
                  <Text style={[styles.metaValue, { fontSize: 10, fontFamily: 'monospace', writingDirection: 'ltr' }]}>
                    {driver.device?.deviceIdentifier ? `${driver.device.deviceIdentifier.slice(0, 12)}...` : '—'}
                  </Text>
                </View>

                {/* Admin Destructive Action: Force End Active Shift */}
                {isAdmin && driver.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status) && (
                  <TouchableOpacity
                    style={[styles.destructiveForceEndButton, (forceEnding || resetting) && styles.disabledButton]}
                    onPress={handleForceEndPress}
                    disabled={forceEnding || resetting}
                  >
                    {forceEnding ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.destructiveForceEndText}>
                        {rtl ? 'إنهاء وردية السائق إجبارياً' : 'Force End Driver Shift'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Admin Destructive Action: Reset Device */}
                {isAdmin && (
                  <TouchableOpacity
                    style={[styles.destructiveResetButton, (resetting || forceEnding) && styles.disabledButton]}
                    onPress={handleResetPress}
                    disabled={resetting || forceEnding}
                  >
                    {resetting ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.destructiveResetText}>{t('admin.resetDevice')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* TAB 2: ACTIVITY TIMELINE */}
          {activeTab === 'activity' && (
            <View style={styles.card}>
              <Text style={[styles.cardSectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'الجدول الزمني للنشاط الميداني' : 'Field Activity Timeline'}
              </Text>
              {loadingHistory ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
              ) : activities.length === 0 ? (
                <Text style={styles.emptyTabMessage}>
                  {rtl ? 'لا توجد أحداث نشاط مسجلة لهذا السائق' : 'No recorded activity events'}
                </Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {activities.map((act) => {
                    const isAlert = act.type === 'ALERT';
                    const isStart = act.type === 'SHIFT_STARTED';
                    const isEnd = act.type === 'SHIFT_ENDED';
                    const dotColor = isAlert ? colors.status.critical : isStart ? colors.status.online : isEnd ? colors.text.muted : colors.primary;

                    const presentation = resolveActivityPresentation(
                      act.type,
                      rtl,
                      act.title,
                      act.description,
                      act.metadata
                    );

                    return (
                      <View key={act.id} style={[styles.activityItem, { flexDirection: rowDir }]}>
                        <View style={[styles.activityDot, { backgroundColor: dotColor }]} />
                        <View style={{ flex: 1, marginHorizontal: 8, alignItems: rtl ? 'flex-end' : 'flex-start' }}>
                          <Text style={[styles.activityTitle, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                            {presentation.title}
                          </Text>
                          {presentation.description ? (
                            <Text style={[styles.activityDesc, { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                              {presentation.description}
                            </Text>
                          ) : null}
                          <Text style={[styles.activityTime, { textAlign: rtl ? 'right' : 'left' }]}>
                            {formatWesternNumber(new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* TAB 3: RECENT LOCATION POINTS */}
          {activeTab === 'locations' && (
            <View style={styles.card}>
              <Text style={[styles.cardSectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'سجل المواقع الحديثة (GPS)' : 'Recent Location Trail'}
              </Text>
              {loadingHistory ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
              ) : locations.length === 0 ? (
                <Text style={styles.emptyTabMessage}>
                  {rtl ? 'لا توجد إحداثيات مسجلة' : 'No recorded location points'}
                </Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {locations.map((loc) => (
                    <View key={loc.id} style={styles.locationItemCard}>
                      <View style={[styles.rowBetween, { flexDirection: rowDir }]}>
                        <Text style={styles.locationCoords}>
                          {formatWesternNumber(Number(loc.latitude).toFixed(4))}, {formatWesternNumber(Number(loc.longitude).toFixed(4))}
                        </Text>
                        <View
                          style={[
                            styles.locationStatusPill,
                            {
                              backgroundColor: loc.operationalStatus === 'MOVING' ? colors.status.onlineBg : colors.status.offlineBg,
                              borderColor: loc.operationalStatus === 'MOVING' ? colors.status.onlineBorder : colors.status.offlineBorder,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.locationStatusPillText,
                              {
                                color: loc.operationalStatus === 'MOVING' ? colors.status.online : colors.text.muted,
                              },
                            ]}
                          >
                            {loc.operationalStatus === 'MOVING'
                              ? (rtl ? 'في حركة' : 'Moving')
                              : loc.operationalStatus === 'AT_RESTAURANT'
                              ? (rtl ? 'بالمطعم' : 'At Restaurant')
                              : (rtl ? 'متوقف' : 'Stopped')}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.metaRow, { flexDirection: rowDir, marginTop: 4 }]}>
                        <Text style={styles.metaLabel}>{rtl ? 'السرعة والدقة:' : 'Speed & Accuracy:'}</Text>
                        <Text style={styles.metaValue}>
                          {loc.speed != null ? `${formatWesternNumber(Math.round(Number(loc.speed) * 3.6))} ${t('driverDetail.speedUnit')}` : `0 ${t('driverDetail.speedUnit')}`} • ±{formatWesternNumber(Math.round(Number(loc.accuracy || 0)))}{t('driverDetail.meters')}
                        </Text>
                      </View>
                      <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                        <Text style={styles.metaLabel}>{rtl ? 'الوقت المسجل:' : 'Recorded At:'}</Text>
                        <Text style={styles.metaValue}>
                          {formatWesternNumber(new Date(loc.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        <TrackerDialog
          visible={dialogConfig.visible}
          title={dialogConfig.title}
          message={dialogConfig.message}
          type={dialogConfig.type}
          primaryButtonText={dialogConfig.primaryButtonText}
          secondaryButtonText={dialogConfig.secondaryButtonText}
          onPrimaryPress={dialogConfig.onPrimaryPress}
          onSecondaryPress={dialogConfig.onSecondaryPress}
          isDestructive={dialogConfig.isDestructive}
          loading={dialogConfig.loading}
          onClose={() => setDialogConfig((prev) => ({ ...prev, visible: false }))}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    gap: spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerSub: {
    fontSize: 11,
    color: colors.text.muted,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  cardSectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
    flexShrink: 1,
  },
  rowBetween: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  badgePillText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 26,
    paddingVertical: 3,
  },
  metaLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.muted,
    flexShrink: 0,
  },
  metaValue: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.text.primary,
    flexShrink: 1,
  },
  telemetryHeaderRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  staleNoticePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexShrink: 0,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  staleNoticeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
  },
  grid2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4,
  },
  gridCell: {
    flexBasis: '48%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridCellLabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.text.muted,
    marginBottom: 2,
  },
  gridCellValue: {
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  gridCellSublabel: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
  },
  destructiveForceEndButton: {
    backgroundColor: '#d97706',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  destructiveForceEndText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  destructiveResetButton: {
    backgroundColor: '#dc2626',
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  destructiveResetText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  tabBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  tabButtonTextActive: {
    fontFamily: fonts.bold,
    color: '#ffffff',
    fontWeight: '700',
  },
  emptyTabMessage: {
    textAlign: 'center',
    color: colors.text.muted,
    fontSize: 12,
    marginVertical: 20,
  },
  activityItem: {
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  activityDesc: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  activityTime: {
    fontSize: 10,
    color: colors.text.light,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  locationItemCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationCoords: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  locationStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  locationStatusPillText: {
    fontSize: 9,
    fontWeight: '700',
  },
});

