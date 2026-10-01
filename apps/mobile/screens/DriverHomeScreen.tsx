// Rebuilt Driver Cockpit for Tracker Mobile
// Single-Glance 5-Question Answers, State Machine Clarity, Bottom Tabs, Zero-Emoji

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, fonts, radius, shadows, spacing, typography } from '../designSystem';
import { AppIcon } from '../components/AppIcon';
import { AppHeader } from '../components/AppHeader';
import { BottomTabBar, type TabItem } from '../components/BottomTabBar';
import {
  collectDriverTelemetry,
  getCurrentDeviceLocation,
  getQueuedLocationCount,
  getTrackingStatus,
  startBackgroundTracking,
  stopBackgroundTracking,
  type DriverTelemetryState,
} from '../location';
import { formatWesternNumber, getLocale, getRowDirection, isRtl, setStoredLocale, t, type Locale, getLocalizedErrorMessage } from '../i18n';
import { type Session, saveTelemetryToken, clearTelemetryToken, readTelemetryToken, getStoredDeviceId } from '../session';
import { TrackerDialog } from '../components/TrackerDialog';

interface DriverHomeScreenProps {
  session: Session;
  apiUrl: string;
  apiRequest: <T>(path: string, options?: RequestInit, sessionOverride?: Session | null) => Promise<T>;
  onLogout: () => Promise<void>;
}

export type DriverOperationalState =
  | 'OFF_DUTY'
  | 'SHIFT_ACTIVE'
  | 'TRACKING_ACTIVE'
  | 'GPS_DISABLED'
  | 'NETWORK_OFFLINE'
  | 'SYNC_PENDING'
  | 'SYNCING'
  | 'DEVICE_UNAUTHORIZED';

type DriverTab = 'cockpit' | 'shift' | 'diagnostics' | 'profile';

export function DriverHomeScreen({
  session,
  apiUrl,
  apiRequest,
  onLogout,
}: DriverHomeScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<DriverTab>('cockpit');
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [profile, setProfile] = useState<any>(null);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [telemetry, setTelemetry] = useState<DriverTelemetryState>({
    batteryPercentage: null,
    isCharging: null,
    locationServicesEnabled: true,
    networkStatus: 'unknown',
  });
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const showDialog = (
    title: string,
    message: string,
    type: 'error' | 'warning' | 'notice' | 'success' = 'notice',
    primaryButtonText: string = t('app.ok'),
    onPrimaryPress?: () => void,
  ) => {
    setDialogConfig({
      visible: true,
      title,
      message,
      type,
      primaryButtonText,
      onPrimaryPress: onPrimaryPress || (() => setDialogConfig((prev) => ({ ...prev, visible: false }))),
    });
  };

  useEffect(() => {
    const onBackPress = () => {
      if (dialogConfig.visible) {
        setDialogConfig((prev) => ({ ...prev, visible: false }));
        return true;
      }
      if (activeTab !== 'cockpit') {
        setActiveTab('cockpit');
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [activeTab, dialogConfig.visible]);

  const rtl = isRtl();
  const rowDir = getRowDirection();

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  // Compute Granular Driver State
  const driverState: DriverOperationalState = useMemo(() => {
    if (syncing) return 'SYNCING';
    if (!activeShift) {
      if (queuedCount > 0) return 'SYNC_PENDING';
      return 'OFF_DUTY';
    }
    if (telemetry.locationServicesEnabled === false) return 'GPS_DISABLED';
    if (telemetry.networkStatus === 'offline') return 'NETWORK_OFFLINE';
    if (trackingActive) return 'TRACKING_ACTIVE';
    if (queuedCount > 0) return 'SYNC_PENDING';
    return 'SHIFT_ACTIVE';
  }, [syncing, activeShift, queuedCount, telemetry, trackingActive]);

  const refreshState = useCallback(async () => {
    try {
      const telem = await collectDriverTelemetry();
      setTelemetry(telem);

      const status = await getTrackingStatus();
      setTrackingActive(status.isTracking);
      setQueuedCount(status.queueSize);

      const prof = await apiRequest<{ driver: any }>('/api/drivers/me').catch(() => null);
      if (prof?.driver) setProfile(prof.driver);

      const shifts = await apiRequest<{ items: any[] }>('/api/drivers/me/shifts?status=ACTIVE').catch(
        () => ({ items: [] })
      );
      const current = (shifts.items ?? [])[0] ?? null;
      setActiveShift(current);
      if (current) {
        let tokenToUse: string | null = null;
        const cachedToken = await readTelemetryToken(current.id);
        if (!cachedToken) {
          try {
            const tok = await apiRequest<{ telemetryToken: string; expiresIn: number; shiftId: string }>(
              '/api/drivers/me/telemetry-token',
              { method: 'POST' }
            );
            if (tok?.telemetryToken) {
              const expiresAt = Date.now() + (tok.expiresIn ? tok.expiresIn * 1000 : 86400 * 1000);
              await saveTelemetryToken(tok.telemetryToken, expiresAt, tok.shiftId || current.id);
              tokenToUse = tok.telemetryToken;
            }
          } catch {}
        } else {
          tokenToUse = cachedToken;
        }

        if (!status.isTracking && tokenToUse) {
          const storedDeviceId = await getStoredDeviceId();
          const started = await startBackgroundTracking({
            apiUrl,
            telemetryToken: tokenToUse,
            shiftId: current.id,
            deviceId: session.user?.deviceId || storedDeviceId || null,
          });
          setTrackingActive(Boolean(started));
        }
      } else {
        if (status.isTracking) {
          await stopBackgroundTracking();
        }
        await clearTelemetryToken().catch(() => {});
        setTrackingActive(false);
      }
    } catch {
      // ignore
    }
  }, [apiUrl, apiRequest, session.user?.id]);

  useEffect(() => {
    refreshState();

    const interval = setInterval(async () => {
      const telem = await collectDriverTelemetry();
      setTelemetry(telem);
      const count = await getQueuedLocationCount();
      setQueuedCount(count);
      const status = await getTrackingStatus();
      setTrackingActive(status.isTracking);
    }, 5000);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshState();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [refreshState]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshState();
    setRefreshing(false);
  };

  const handleStartShift = async () => {
    setLoading(true);
    try {
      const loc = await getCurrentDeviceLocation();
      if (!loc || loc.latitude == null || loc.longitude == null) {
        setLoading(false);
        showDialog(
          t('app.error'),
          rtl
            ? 'تعذر تحديد موقعك الحالي بدقة عبر GPS. يرجى التأكد من تفعيل خدمة الموقع وإشارة الـ GPS ثم المحاولة مرة أخرى.'
            : 'Unable to acquire a fresh GPS fix. Please ensure location services are enabled and try again.',
          'error'
        );
        return;
      }

      const resp = await apiRequest<{ shift: any; telemetryToken?: string; expiresIn?: number }>(
        '/api/drivers/me/shifts/start',
        {
          method: 'POST',
          body: JSON.stringify({
            latitude: loc.latitude,
            longitude: loc.longitude,
          }),
        }
      );
      if (resp?.shift) {
        let tokenToPass: string | null = null;
        if (resp.telemetryToken) {
          const expiresAt = Date.now() + (resp.expiresIn ? resp.expiresIn * 1000 : 86400 * 1000);
          await saveTelemetryToken(resp.telemetryToken, expiresAt, resp.shift.id);
          tokenToPass = resp.telemetryToken;
        }
        setActiveShift(resp.shift);
        const storedDeviceId = await getStoredDeviceId();
        const started = await startBackgroundTracking({
          apiUrl,
          telemetryToken: tokenToPass,
          shiftId: resp.shift.id,
          deviceId: session.user?.deviceId || storedDeviceId || null,
        });
        setTrackingActive(Boolean(started));
        await refreshState();
        if (started) {
          showDialog(t('shift.started'), t('shift.activeTrackingNotice'), 'success');
        } else {
          showDialog(
            t('shift.bgPermissionRequiredTitle'),
            t('shift.bgPermissionRequiredMessage'),
            'warning'
          );
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('DEVICE_UNAUTHORIZED') || err?.code === 'DEVICE_UNAUTHORIZED') {
        showDialog(
          rtl ? 'الجهاز غير مصرح' : 'Device Unauthorized',
          rtl
            ? 'تمت إعادة تعيين الجهاز من قِبل الإدارة. يرجى تسجيل الدخول مجدداً أو مراجعة المشرف.'
            : 'Device authorization revoked. Please re-login.',
          'error'
        );
      } else {
        showDialog(t('app.error'), err?.message || 'Unable to start shift', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEndShift = async () => {
    setLoading(true);
    try {
      // Step 1-4: Stop accepting new GPS points and perform bounded queue drain
      const drainResult = await stopBackgroundTracking(8000);
      setTrackingActive(false);
      setQueuedCount(drainResult.remainingCount > 0 ? drainResult.remainingCount : 0);

      // Step 5: Complete shift-end API call while credentials are still intact
      await apiRequest('/api/drivers/me/shifts/end', { method: 'POST' });

      // Step 6: Clear telemetry credentials
      await clearTelemetryToken().catch(() => {});

      setActiveShift(null);
      await refreshState();
      showDialog(t('shift.ended'), t('shift.offDuty'), 'success');
    } catch (err: any) {
      showDialog(t('app.error'), err?.message || 'Unable to end shift', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const count = await getQueuedLocationCount();
      setQueuedCount(count);
      showDialog(t('app.notice'), t('app.synced'), 'success');
    } catch {
      showDialog(t('app.notice'), t('app.syncError'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleLogoutPress = () => {
    if (activeShift || trackingActive) {
      showDialog(t('app.warning'), t('shift.endShiftFirst'), 'warning');
      return;
    }
    onLogout();
  };

  // State visuals mapping
  const getStateVisuals = (state: DriverOperationalState) => {
    switch (state) {
      case 'TRACKING_ACTIVE':
        return {
          color: colors.status.online,
          bg: colors.status.onlineBg,
          border: colors.status.onlineBorder,
          title: rtl ? 'التتبع المباشر نشط' : 'Live Tracking Active',
          desc: rtl ? 'الموقع يتم إرساله تلقائياً للوحة التحكم في الخلفية' : 'Background GPS tracking is actively transmitting',
        };
      case 'SHIFT_ACTIVE':
        return {
          color: colors.accent,
          bg: colors.accentLight,
          border: '#bae6fd',
          title: rtl ? 'الوردية نشطة' : 'Shift Active',
          desc: rtl ? 'الوردية قيد التشغيل' : 'Operational shift is active',
        };
      case 'GPS_DISABLED':
        return {
          color: colors.status.critical,
          bg: colors.status.criticalBg,
          border: colors.status.criticalBorder,
          title: rtl ? 'خدمة الموقع (GPS) معطلة' : 'GPS Disabled',
          desc: rtl ? 'يرجى تفعيل خدمة تحديد الموقع لمواصلة التتبع' : 'Enable location services in system settings',
        };
      case 'NETWORK_OFFLINE':
        return {
          color: colors.status.stopped,
          bg: colors.status.stoppedBg,
          border: colors.status.stoppedBorder,
          title: rtl ? 'غير متصل بالإنترنت' : 'Network Offline',
          desc: rtl ? 'يتم حفظ النقاط محلياً في الهاتف حتى عودة الاتصال' : 'Points are buffered locally until connection restores',
        };
      case 'SYNC_PENDING':
        return {
          color: colors.status.stopped,
          bg: colors.status.stoppedBg,
          border: colors.status.stoppedBorder,
          title: rtl ? 'بيانات بانتظار المزامنة' : 'Sync Pending',
          desc: rtl ? `يوجد ${formatWesternNumber(queuedCount)} نقاط مخزنة محلياً` : `${formatWesternNumber(queuedCount)} points buffered`,
        };
      case 'SYNCING':
        return {
          color: '#2563eb',
          bg: '#dbeafe',
          border: '#bfdbfe',
          title: rtl ? 'جارٍ مزامنة المواقع...' : 'Syncing Locations...',
          desc: rtl ? 'يتم رفع النقاط المخزنة للخادم' : 'Uploading buffered points to server',
        };
      case 'DEVICE_UNAUTHORIZED':
        return {
          color: colors.status.critical,
          bg: colors.status.criticalBg,
          border: colors.status.criticalBorder,
          title: rtl ? 'الجهاز غير مصرح' : 'Device Unauthorized',
          desc: rtl ? 'تم إلغاء اعتماد هذا الجهاز، يرجى مراجعة الإدارة' : 'Device authorization revoked',
        };
      case 'OFF_DUTY':
      default:
        return {
          color: colors.text.muted,
          bg: colors.surfaceSubtle,
          border: colors.border,
          title: rtl ? 'خارج الوردية' : 'Off Duty',
          desc: rtl ? 'اضغط أدناه لبدء وردية العمل وتفعيل التتبع الميداني' : 'Press start shift to enable background tracking',
        };
    }
  };

  const visuals = getStateVisuals(driverState);

  const bottomTabs: TabItem[] = [
    { id: 'cockpit', label: rtl ? 'الرئيسية' : 'Cockpit', icon: 'dashboard' },
    { id: 'shift', label: rtl ? 'الوردية' : 'Shift', icon: 'driver' },
    { id: 'diagnostics', label: rtl ? 'التشخيص' : 'Diagnostics', icon: 'device', badgeCount: queuedCount > 0 ? queuedCount : undefined },
    { id: 'profile', label: rtl ? 'حسابي' : 'Profile', icon: 'users' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Sleek AppHeader */}
      <AppHeader
        title={rtl ? 'لوحة قيادة السائق' : 'Driver Cockpit'}
        role="DRIVER"
        userName={profile?.driverName || session.user.name}
        locale={locale}
        onToggleLanguage={toggleLanguage}
        onLogout={handleLogoutPress}
      />

      <View style={styles.body}>
        {/* TAB 1: COCKPIT (SINGLE-GLANCE 5-QUESTIONS ANSWER) */}
        {activeTab === 'cockpit' && (
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {/* 1. Primary Prominent State Status Card */}
            <View style={[styles.stateHeroCard, { backgroundColor: visuals.bg, borderColor: visuals.border }]}>
              <View style={[styles.stateHeroHeader, { flexDirection: rowDir }]}>
                <View style={[styles.stateDot, { backgroundColor: visuals.color }]} />
                <Text style={[styles.stateHeroTitle, { color: visuals.color }]}>{visuals.title}</Text>
              </View>
              <Text style={[styles.stateHeroDesc, { textAlign: rtl ? 'right' : 'left' }]}>
                {visuals.desc}
              </Text>
            </View>

            {/* 2. Primary Shift Action Button */}
            <TouchableOpacity
              style={[
                styles.primaryShiftButton,
                activeShift ? styles.endShiftBtn : styles.startShiftBtn,
                loading && styles.disabledButton,
              ]}
              onPress={activeShift ? handleEndShift : handleStartShift}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <View style={[styles.btnContentRow, { flexDirection: rowDir }]}>
                  <AppIcon name={activeShift ? 'pause' : 'play'} size={18} color="#ffffff" />
                  <Text style={styles.primaryShiftButtonText}>
                    {activeShift
                      ? rtl ? 'إنهاء الوردية (إيقاف التتبع)' : 'End Shift (Stop Tracking)'
                      : rtl ? 'بدء الوردية (تفعيل التتبع)' : 'Start Shift (Start Tracking)'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* 3. The 5 Core Operational Questions Checklist Grid */}
            <View style={styles.checklistCard}>
              <Text style={[styles.checklistCardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'فحص الجاهزية التشغيلية (5 مؤشرات)' : 'Operational Readiness (5 Checks)'}
              </Text>

              {/* Q1: Shift */}
              <View style={[styles.checkRow, { flexDirection: rowDir }]}>
                <View style={[styles.checkLeft, { flexDirection: rowDir }]}>
                  <AppIcon name="driver" size={16} color={activeShift ? colors.status.online : colors.text.muted} />
                  <Text style={styles.checkQuestionText}>{rtl ? 'حالة الوردية:' : 'Operational Shift:'}</Text>
                </View>
                <View style={[styles.checkPill, { backgroundColor: activeShift ? colors.status.onlineBg : colors.surfaceSubtle }]}>
                  <Text style={[styles.checkPillText, { color: activeShift ? colors.status.online : colors.text.muted }]}>
                    {activeShift ? t('shift.onDuty') : t('shift.offDuty')}
                  </Text>
                </View>
              </View>

              {/* Q2: Live Tracking */}
              <View style={[styles.checkRow, { flexDirection: rowDir }]}>
                <View style={[styles.checkLeft, { flexDirection: rowDir }]}>
                  <AppIcon name="gps" size={16} color={trackingActive ? colors.status.online : colors.text.muted} />
                  <Text style={styles.checkQuestionText}>{rtl ? 'التتبع المباشر:' : 'Live Tracking:'}</Text>
                </View>
                <View style={[styles.checkPill, { backgroundColor: trackingActive ? colors.status.onlineBg : colors.surfaceSubtle }]}>
                  <Text style={[styles.checkPillText, { color: trackingActive ? colors.status.online : colors.text.muted }]}>
                    {trackingActive ? (rtl ? 'يعمل في الخلفية' : 'Active') : (rtl ? 'متوقف' : 'Stopped')}
                  </Text>
                </View>
              </View>

              {/* Q3: GPS Service */}
              <View style={[styles.checkRow, { flexDirection: rowDir }]}>
                <View style={[styles.checkLeft, { flexDirection: rowDir }]}>
                  <AppIcon name="target" size={16} color={telemetry.locationServicesEnabled ? colors.status.online : colors.status.critical} />
                  <Text style={styles.checkQuestionText}>{rtl ? 'خدمة الموقع (GPS):' : 'Location Services (GPS):'}</Text>
                </View>
                <View style={[styles.checkPill, { backgroundColor: telemetry.locationServicesEnabled ? colors.status.onlineBg : colors.status.criticalBg }]}>
                  <Text style={[styles.checkPillText, { color: telemetry.locationServicesEnabled ? colors.status.online : colors.status.critical }]}>
                    {telemetry.locationServicesEnabled ? (rtl ? 'مفعّل' : 'Enabled') : (rtl ? 'معطّل' : 'Disabled')}
                  </Text>
                </View>
              </View>

              {/* Q4: Network Connection */}
              <View style={[styles.checkRow, { flexDirection: rowDir }]}>
                <View style={[styles.checkLeft, { flexDirection: rowDir }]}>
                  <AppIcon name="wifi" size={16} color={telemetry.networkStatus !== 'offline' ? colors.status.online : colors.status.stopped} />
                  <Text style={styles.checkQuestionText}>{rtl ? 'الاتصال بالإنترنت:' : 'Internet Connection:'}</Text>
                </View>
                <View style={[styles.checkPill, { backgroundColor: telemetry.networkStatus !== 'offline' ? colors.status.onlineBg : colors.status.stoppedBg }]}>
                  <Text style={[styles.checkPillText, { color: telemetry.networkStatus !== 'offline' ? colors.status.online : colors.status.stopped }]}>
                    {telemetry.networkStatus !== 'offline' ? (rtl ? 'متصل' : 'Connected') : (rtl ? 'غير متصل (تخزين محلي)' : 'Offline')}
                  </Text>
                </View>
              </View>

              {/* Q5: Synchronization / Queue */}
              <View style={[styles.checkRow, { flexDirection: rowDir }]}>
                <View style={[styles.checkLeft, { flexDirection: rowDir }]}>
                  <AppIcon name="sync" size={16} color={queuedCount === 0 ? colors.status.online : colors.status.stopped} />
                  <Text style={styles.checkQuestionText}>{rtl ? 'مزامنة المواقع:' : 'Data Synchronization:'}</Text>
                </View>
                <View style={[styles.checkPill, { backgroundColor: queuedCount === 0 ? colors.status.onlineBg : colors.status.stoppedBg }]}>
                  <Text style={[styles.checkPillText, { color: queuedCount === 0 ? colors.status.online : colors.status.stopped }]}>
                    {queuedCount === 0 ? (rtl ? 'متزامن بنجاح' : 'Up to date') : `${formatWesternNumber(queuedCount)} ${rtl ? 'نقاط بالانتظار' : 'pending'}`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Background Service Educational Notice */}
            <View style={[styles.infoNotice, { flexDirection: rowDir }]}>
              <AppIcon name="warning" size={14} color={colors.text.muted} />
              <Text style={[styles.infoNoticeText, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('shift.bgPermissionRequiredMessage')}
              </Text>
            </View>
          </ScrollView>
        )}

        {/* TAB 2: SHIFT DETAILS */}
        {activeTab === 'shift' && (
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'تفاصيل وردية العمل الحالية' : 'Active Shift Overview'}
              </Text>

              {activeShift ? (
                <>
                  <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                    <Text style={styles.detailLabel}>{rtl ? 'حالة الوردية:' : 'Status:'}</Text>
                    <Text style={[styles.detailValue, { color: colors.status.online, fontWeight: '700' }]}>
                      {t('shift.onDuty')}
                    </Text>
                  </View>

                  <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                    <Text style={styles.detailLabel}>{rtl ? 'وقت البدء:' : 'Started At:'}</Text>
                    <Text style={styles.detailValue}>
                      {new Date(activeShift.startedAt).toLocaleTimeString()}
                    </Text>
                  </View>

                  <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                    <Text style={styles.detailLabel}>{rtl ? 'المدة المنقضية:' : 'Duration:'}</Text>
                    <Text style={styles.detailValue}>
                      {formatWesternNumber(Math.round((Date.now() - new Date(activeShift.startedAt).getTime()) / 60000))} {rtl ? 'دقيقة' : 'minutes'}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.emptyNoticeText}>
                  {rtl ? 'لا توجد وردية نشطة حالياً. يرجى الضغط على زر بدء الوردية من الشاشة الرئيسية.' : 'No active shift currently.'}
                </Text>
              )}
            </View>
          </ScrollView>
        )}

        {/* TAB 3: DIAGNOSTICS & SYNC */}
        {activeTab === 'diagnostics' && (
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'تشخيص عتاد الهاتف والاتصال' : 'Hardware & Diagnostics'}
              </Text>

              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <Text style={styles.detailLabel}>{rtl ? 'مستوى البطارية:' : 'Battery Level:'}</Text>
                <Text style={[styles.detailValue, { writingDirection: rtl ? 'rtl' : 'ltr' }]}>
                  {telemetry.batteryPercentage != null
                    ? `${formatWesternNumber(telemetry.batteryPercentage)}% ${telemetry.isCharging ? '(متصل بالشاحن)' : ''}`
                    : '—'}
                </Text>
              </View>

              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <Text style={styles.detailLabel}>{rtl ? 'نوع الشبكة:' : 'Network Type:'}</Text>
                <Text style={styles.detailValue}>
                  {telemetry.networkStatus?.toUpperCase() ?? 'UNKNOWN'}
                </Text>
              </View>

              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <Text style={styles.detailLabel}>{rtl ? 'النقاط المخزنة محلياً:' : 'Queued Locations:'}</Text>
                <Text style={[styles.detailValue, { fontWeight: '700' }]}>
                  {formatWesternNumber(queuedCount)}
                </Text>
              </View>

              {/* Manual Sync Button */}
              <TouchableOpacity
                style={[styles.syncButton, syncing && styles.disabledButton]}
                onPress={handleManualSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator color="#0f766e" size="small" />
                ) : (
                  <View style={[styles.btnContentRow, { flexDirection: rowDir }]}>
                    <AppIcon name="sync" size={16} color={colors.primary} />
                    <Text style={styles.syncButtonText}>{t('app.sync')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* TAB 4: PROFILE */}
        {activeTab === 'profile' && (
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'الملف التعريفي للسائق' : 'Driver Profile'}
              </Text>

              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <Text style={styles.detailLabel}>{rtl ? 'الاسم:' : 'Name:'}</Text>
                <Text style={styles.detailValue}>{profile?.driverName || session.user.name}</Text>
              </View>

              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <Text style={styles.detailLabel}>{t('diagnostics.employeeId')}</Text>
                <Text style={styles.detailValue}>{formatWesternNumber(profile?.employeeId || '—')}</Text>
              </View>

              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <Text style={styles.detailLabel}>{rtl ? 'رقم الهاتف:' : 'Phone:'}</Text>
                <Text style={styles.detailValue}>{session.user.phone || '—'}</Text>
              </View>

              <View style={[styles.detailRow, { flexDirection: rowDir }]}>
                <Text style={styles.detailLabel}>{rtl ? 'نوع المركبة:' : 'Vehicle:'}</Text>
                <Text style={styles.detailValue}>{profile?.vehicleType || 'Motorcycle'}</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.logoutRowButton, { flexDirection: rowDir }]} onPress={handleLogoutPress}>
              <AppIcon name="logout" size={16} color="#dc2626" />
              <Text style={styles.logoutRowButtonText}>{t('app.logout')}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      <BottomTabBar
        tabs={bottomTabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as DriverTab)}
      />

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
    gap: spacing.md,
  },
  stateHeroCard: {
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    gap: spacing.xs,
    ...shadows.card,
  },
  stateHeroHeader: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stateHeroTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  stateHeroDesc: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  primaryShiftButton: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.float,
  },
  startShiftBtn: {
    backgroundColor: colors.status.online,
  },
  endShiftBtn: {
    backgroundColor: '#dc2626',
  },
  primaryShiftButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  btnContentRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  checklistCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  checklistCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  checkRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkQuestionText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  checkPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  checkPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  infoNotice: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
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
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  detailRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 26,
    paddingVertical: 4,
  },
  detailLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.muted,
    flexShrink: 0,
  },
  detailValue: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.text.primary,
    flexShrink: 1,
  },
  emptyNoticeText: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  syncButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  syncButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  logoutRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.md,
    paddingVertical: 12,
    gap: spacing.sm,
  },
  logoutRowButtonText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
