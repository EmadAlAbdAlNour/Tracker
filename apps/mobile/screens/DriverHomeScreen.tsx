import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { formatWesternNumber, getLocale, isRtl, setStoredLocale, t, type Locale } from '../i18n';
import {
  collectDriverTelemetry,
  getQueuedLocationCount,
  registerBackgroundLocationTask,
  startBackgroundTracking,
  stopBackgroundTracking,
  type DriverTelemetryState,
} from '../location';
import { flushQueuedLocationsGuarded } from '../flushManager';
import { type Session } from '../session';

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

export function DriverHomeScreen({
  session,
  apiUrl,
  apiRequest,
  onLogout,
}: DriverHomeScreenProps): React.JSX.Element {
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

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  // Compute Granular Driver State
  const computeDriverState = (): DriverOperationalState => {
    if (syncing) return 'SYNCING';
    if (!activeShift) {
      if (queuedCount > 0) return 'SYNC_PENDING';
      return 'OFF_DUTY';
    }
    // Shift is active
    if (telemetry.locationServicesEnabled === false) return 'GPS_DISABLED';
    if (telemetry.networkStatus === 'offline') return 'NETWORK_OFFLINE';
    if (trackingActive) {
      if (queuedCount > 0) return 'SYNC_PENDING';
      return 'TRACKING_ACTIVE';
    }
    return 'SHIFT_ACTIVE';
  };

  const driverState = computeDriverState();

  const refreshState = useCallback(async () => {
    try {
      // 1. Telemetry
      const telem = await collectDriverTelemetry();
      setTelemetry(telem);

      // 2. Queue count
      const count = await getQueuedLocationCount();
      setQueuedCount(count);

      // 3. Driver Profile
      const prof = await apiRequest<{ driver: any }>('/api/drivers/me').catch(() => null);
      if (prof?.driver) setProfile(prof.driver);

      // 4. Active Shift
      const shifts = await apiRequest<{ items: any[] }>('/api/drivers/me/shifts?status=ACTIVE').catch(
        () => ({ items: [] })
      );
      const current = (shifts.items ?? [])[0] ?? null;
      setActiveShift(current);
      setTrackingActive(Boolean(current));
    } catch {
      // ignore
    }
  }, [apiRequest]);

  useEffect(() => {
    registerBackgroundLocationTask();
    refreshState();
    flushQueuedLocationsGuarded(apiUrl).then(() => getQueuedLocationCount().then(setQueuedCount));

    // Telemetry and queue polling every 10s
    const interval = setInterval(async () => {
      const telem = await collectDriverTelemetry();
      setTelemetry(telem);
      const count = await getQueuedLocationCount();
      setQueuedCount(count);
    }, 10000);

    return () => clearInterval(interval);
  }, [apiUrl, refreshState]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshState();
    await flushQueuedLocationsGuarded(apiUrl);
    const count = await getQueuedLocationCount();
    setQueuedCount(count);
    setRefreshing(false);
  };

  const handleStartShift = async () => {
    setLoading(true);
    try {
      const resp = await apiRequest<{ shift: any }>('/api/drivers/me/shifts/start', {
        method: 'POST',
      });
      if (resp?.shift) {
        setActiveShift(resp.shift);
        const started = await startBackgroundTracking();
        setTrackingActive(Boolean(started));
        await flushQueuedLocationsGuarded(apiUrl);
        await refreshState();
        if (started) {
          Alert.alert(t('shift.started'), t('shift.activeTrackingNotice'));
        } else {
          Alert.alert(
            t('shift.bgPermissionRequiredTitle'),
            t('shift.bgPermissionRequiredMessage')
          );
        }
      }
    } catch (err: any) {
      Alert.alert(t('app.error'), err?.message || 'Unable to start shift');
    } finally {
      setLoading(false);
    }
  };

  const handleEndShift = async () => {
    setLoading(true);
    try {
      await stopBackgroundTracking();
      setTrackingActive(false);
      await flushQueuedLocationsGuarded(apiUrl).catch(() => {});
      await apiRequest('/api/drivers/me/shifts/end', { method: 'POST' });
      setActiveShift(null);
      await refreshState();
      Alert.alert(t('shift.ended'), t('shift.offDuty'));
    } catch (err: any) {
      Alert.alert(t('app.error'), err?.message || 'Unable to end shift');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await flushQueuedLocationsGuarded(apiUrl);
      const count = await getQueuedLocationCount();
      setQueuedCount(count);
      Alert.alert(t('app.notice'), t('app.synced'));
    } catch {
      Alert.alert(t('app.notice'), t('app.syncError'));
    } finally {
      setSyncing(false);
    }
  };

  const handleLogoutPress = () => {
    if (activeShift || trackingActive) {
      Alert.alert(t('app.warning'), t('shift.endShiftFirst'));
      return;
    }
    onLogout();
  };

  const rtl = isRtl();

  // State visuals mapping
  const getStateVisuals = (state: DriverOperationalState) => {
    switch (state) {
      case 'TRACKING_ACTIVE':
        return {
          color: '#059669',
          bg: '#d1fae5',
          border: '#a7f3d0',
          label: t('driverStates.TRACKING_ACTIVE'),
          instructions: t('driverStates.instructionsActive'),
        };
      case 'SHIFT_ACTIVE':
        return {
          color: '#0284c7',
          bg: '#e0f2fe',
          border: '#bae6fd',
          label: t('driverStates.SHIFT_ACTIVE'),
          instructions: t('driverStates.instructionsActive'),
        };
      case 'GPS_DISABLED':
        return {
          color: '#dc2626',
          bg: '#fee2e2',
          border: '#fecaca',
          label: t('driverStates.GPS_DISABLED'),
          instructions: t('driverStates.instructionsGpsOff'),
        };
      case 'NETWORK_OFFLINE':
        return {
          color: '#d97706',
          bg: '#fef3c7',
          border: '#fde68a',
          label: t('driverStates.NETWORK_OFFLINE'),
          instructions: t('driverStates.instructionsOffline'),
        };
      case 'SYNC_PENDING':
        return {
          color: '#b45309',
          bg: '#ffedd5',
          border: '#fed7aa',
          label: t('driverStates.SYNC_PENDING'),
          instructions: t('driverStates.instructionsActive'),
        };
      case 'SYNCING':
        return {
          color: '#2563eb',
          bg: '#dbeafe',
          border: '#bfdbfe',
          label: t('driverStates.SYNCING'),
          instructions: t('driverStates.instructionsActive'),
        };
      case 'DEVICE_UNAUTHORIZED':
        return {
          color: '#dc2626',
          bg: '#fee2e2',
          border: '#fecaca',
          label: t('driverStates.DEVICE_UNAUTHORIZED'),
          instructions: t('login.invalidSession'),
        };
      case 'OFF_DUTY':
      default:
        return {
          color: '#64748b',
          bg: '#f1f5f9',
          border: '#e2e8f0',
          label: t('driverStates.OFF_DUTY'),
          instructions: t('driverStates.instructionsOffDuty'),
        };
    }
  };

  const visuals = getStateVisuals(driverState);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
            <Text style={styles.langButtonText}>{locale === 'ar' ? 'English' : 'العربية'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutSmallButton} onPress={handleLogoutPress}>
            <Text style={styles.logoutSmallText}>{t('app.logout')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topBarUser}>
          <Text style={styles.topBarName}>{session.user.name}</Text>
          <Text style={styles.topBarRole}>
            {profile?.employeeId
              ? `${t('diagnostics.employeeId')} ${formatWesternNumber(profile.employeeId)}`
              : t('diagnostics.driver')}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Prominent State Machine Card */}
        <View style={[styles.stateCard, { borderColor: visuals.border, backgroundColor: visuals.bg }]}>
          <View style={styles.stateBadgeRow}>
            <View style={[styles.stateBadge, { backgroundColor: visuals.color }]}>
              <Text style={styles.stateBadgeText}>{visuals.label}</Text>
            </View>
            <View style={styles.pulseDot}>
              <View
                style={[
                  styles.innerPulseDot,
                  { backgroundColor: trackingActive ? '#059669' : '#94a3b8' },
                ]}
              />
            </View>
          </View>

          <Text style={[styles.stateInstructions, { color: visuals.color, textAlign: rtl ? 'right' : 'left' }]}>
            {visuals.instructions}
          </Text>
        </View>

        {/* Operational Shift Control Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('shift.title')}</Text>
            <View
              style={[
                styles.statusBadge,
                activeShift ? styles.statusBadgeActive : styles.statusBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  activeShift ? styles.statusTextActive : styles.statusTextInactive,
                ]}
              >
                {activeShift ? t('shift.onDuty') : t('shift.offDuty')}
              </Text>
            </View>
          </View>

          {activeShift && (
            <View style={styles.shiftInfoRow}>
              <Text style={styles.shiftStartedLabel}>
                {t('driverDetail.shiftDuration')}:{' '}
                {formatWesternNumber(
                  Math.round(
                    (Date.now() - new Date(activeShift.startedAt).getTime()) / (1000 * 60)
                  )
                )}{' '}
                دقيقة / min
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.actionButton,
              activeShift ? styles.endShiftButton : styles.startShiftButton,
              loading && styles.disabledButton,
            ]}
            onPress={activeShift ? handleEndShift : handleStartShift}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>
                {activeShift ? t('shift.endShift') : t('shift.startShift')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Real-time Hardware & Telemetry Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
            📱 {t('driverDetail.deviceInfo')}
          </Text>

          {/* Battery */}
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>🔋 {t('driverDetail.battery')}:</Text>
            <Text
              style={[
                styles.diagValue,
                telemetry.batteryPercentage != null && telemetry.batteryPercentage <= 20
                  ? styles.textRed
                  : styles.textGreen,
              ]}
            >
              {telemetry.batteryPercentage != null
                ? `${formatWesternNumber(telemetry.batteryPercentage)}% ${
                    telemetry.isCharging ? '⚡ (متصل بالشاحن)' : ''
                  }`
                : '—'}
            </Text>
          </View>

          {/* Network Type */}
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>📶 {t('driverDetail.network')}:</Text>
            <Text style={styles.diagValue}>{telemetry.networkStatus?.toUpperCase() ?? 'UNKNOWN'}</Text>
          </View>

          {/* GPS Services */}
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>📍 {t('driverDetail.status')}:</Text>
            <Text
              style={[
                styles.diagValue,
                telemetry.locationServicesEnabled ? styles.textGreen : styles.textRed,
              ]}
            >
              {telemetry.locationServicesEnabled ? 'GPS مفعّل' : 'GPS معطّل'}
            </Text>
          </View>

          {/* Queued Points */}
          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>📦 {t('diagnostics.queuedLocations')}</Text>
            <Text
              style={[
                styles.diagValue,
                queuedCount > 0 ? styles.textOrange : styles.textGray,
              ]}
            >
              {formatWesternNumber(queuedCount)}
            </Text>
          </View>

          {/* Manual Sync Button */}
          <TouchableOpacity
            style={[styles.outlineButton, syncing && styles.disabledButton]}
            onPress={handleManualSync}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <Text style={styles.outlineButtonText}>🔄 {t('app.sync')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Background Tracking Educational Note */}
        <View style={styles.infoBox}>
          <Text style={[styles.infoBoxText, { textAlign: rtl ? 'right' : 'left' }]}>
            🛡️ {t('shift.bgPermissionRequiredMessage')}
          </Text>
        </View>
      </ScrollView>
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
  topBarRole: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  stateCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
  },
  stateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stateBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stateBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pulseDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  innerPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stateInstructions: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeActive: {
    backgroundColor: '#d1fae5',
  },
  statusBadgeInactive: {
    backgroundColor: '#f1f5f9',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusTextActive: {
    color: '#065f46',
  },
  statusTextInactive: {
    color: '#64748b',
  },
  shiftInfoRow: {
    marginBottom: 12,
  },
  shiftStartedLabel: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startShiftButton: {
    backgroundColor: '#059669',
  },
  endShiftButton: {
    backgroundColor: '#dc2626',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  diagLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  diagValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  textGreen: {
    color: '#059669',
  },
  textOrange: {
    color: '#d97706',
  },
  textRed: {
    color: '#dc2626',
  },
  textGray: {
    color: '#94a3b8',
  },
  outlineButton: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  outlineButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  infoBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 12,
  },
  infoBoxText: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 18,
  },
  disabledButton: {
    opacity: 0.6,
  },
});

