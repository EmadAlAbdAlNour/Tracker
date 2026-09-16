import React, { useEffect, useState, useCallback } from 'react';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_LOCATION_DISTANCE_METERS,
  DEFAULT_LOCATION_INTERVAL_MS,
  ensureTrackingPermissions,
  getQueuedLocationCount,
  registerBackgroundLocationTask,
  startBackgroundTracking,
  stopBackgroundTracking,
} from './location';
import { flushQueuedLocationsGuarded } from './flushManager';
import { resolveHomeRoute } from './roleRouting';
import { SESSION_ROLES, isAllowedRole, isValidSession, type Session } from './session';
import {
  formatWesternNumber,
  getLocale,
  initLocale,
  isRtl,
  setStoredLocale,
  t,
  type Locale,
} from './i18n';

const DEVICE_ID_KEY = 'tracker_device_id';
const SESSION_KEY = 'tracker_driver_session';
const STACK = createNativeStackNavigator<any>();
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://tracker-alpha-puce.vercel.app'
    : 'http://10.0.2.2:3000');

async function saveSession(session: Session): Promise<void> {
  if (!isValidSession(session)) {
    throw new Error('Invalid session payload');
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

async function readSession(): Promise<Session | null> {
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isValidSession(parsed)) {
      await clearSession().catch(() => undefined);
      return null;
    }
    return parsed;
  } catch {
    await clearSession().catch(() => undefined);
    return null;
  }
}

async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = uuidv4();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    return id;
  } catch {
    const fallback = uuidv4();
    try {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  sessionOverride?: Session | null
): Promise<T> {
  const session = sessionOverride ?? (await readSession());
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && session?.refreshToken) {
    try {
      const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (refreshResponse.ok) {
        const refreshedPayload = await refreshResponse.json();
        if (!isValidSession(refreshedPayload)) {
          await clearSession().catch(() => undefined);
          throw new Error('Invalid refresh session payload');
        }

        const nextSession: Session = refreshedPayload;
        await saveSession(nextSession);
        headers.set('Authorization', `Bearer ${nextSession.accessToken}`);
        response = await fetch(`${API_URL}${path}`, {
          ...options,
          headers,
        });
      }
    } catch {
      // refresh failure
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message ?? payload?.message ?? 'Request failed';
    throw new Error(message as string);
  }

  return (await response.json()) as T;
}

function LoginScreen({ navigation }: any): React.JSX.Element {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  useEffect(() => {
    initLocale().then(setLocaleState);
  }, []);

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  const handleLogin = async () => {
    if (!emailOrPhone.trim() || !password) {
      Alert.alert(t('app.notice'), t('login.enterCredentials'));
      return;
    }

    setLoading(true);
    try {
      const deviceIdentifier = await getOrCreateDeviceId();
      const device = {
        platform: Platform.OS,
        deviceIdentifier,
        appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0',
      };

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: emailOrPhone.trim(), password, device }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const message = payload?.error?.message ?? payload?.message ?? t('login.failed');
        throw new Error(message);
      }

      const sessionCandidate = payload as Partial<Session>;
      if (!isValidSession(sessionCandidate)) {
        Alert.alert(t('app.error'), t('login.invalidSession'));
        return;
      }

      if (!isAllowedRole(sessionCandidate.user.role)) {
        Alert.alert(t('app.error'), t('login.roleNotAllowed'));
        return;
      }

      await saveSession(sessionCandidate);
      navigation.replace(resolveHomeRoute(sessionCandidate.user.role));
    } catch (error) {
      Alert.alert(
        t('login.failed'),
        error instanceof Error ? error.message : 'Unexpected error'
      );
    } finally {
      setLoading(false);
    }
  };

  const rtl = isRtl();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <View style={styles.loginCard}>
        {/* Language switch */}
        <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
          <Text style={styles.langButtonText}>{locale === 'ar' ? 'English' : 'العربية'}</Text>
        </TouchableOpacity>

        {/* Logo and header */}
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>T</Text>
        </View>

        <Text style={styles.appTitle}>{t('app.title')}</Text>
        <Text style={styles.appSubtitle}>{t('app.subtitle')}</Text>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('login.emailOrPhone')}
            </Text>
            <TextInput
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              placeholder="driver@example.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('login.password')}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={[styles.input, { textAlign: rtl ? 'right' : 'left' }]}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('login.signIn')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

interface FleetDriverItem {
  driverId: string;
  driverName: string;
  employeeId: string;
  operationalStatus: string;
  isOnline: boolean;
  device?: {
    batteryPercentage: number | null;
    isCharging: boolean;
    networkStatus: string;
    lastSeen: string | null;
  } | null;
  location?: {
    recordedAt: string | null;
  } | null;
}

interface LiveFleetData {
  summary: {
    activeShifts: number;
    onlineDrivers: number;
    movingDrivers: number;
    stoppedDrivers: number;
    atRestaurantDrivers: number;
    offlineDrivers: number;
  };
  drivers: FleetDriverItem[];
}

function OperatorHomeScreen({ navigation }: any): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [fleet, setFleet] = useState<LiveFleetData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    initLocale().then(setLocaleState);
  }, []);

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  const loadFleet = useCallback(async (activeSession?: Session | null) => {
    const s = activeSession ?? session;
    if (!s) return;
    try {
      const data = await apiRequest<LiveFleetData>('/api/fleet/live', {}, s);
      setFleet(data);
    } catch {
      // ignore poll failure
    }
  }, [session]);

  useEffect(() => {
    (async () => {
      const current = await readSession();
      if (!current || !isValidSession(current) || !isAllowedRole(current.user.role)) {
        await clearSession().catch(() => undefined);
        navigation.replace('Login');
        return;
      }
      setSession(current);
      await loadFleet(current);
    })();
  }, [navigation, loadFleet]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFleet();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    const current = await readSession();
    if (current?.refreshToken) {
      fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      }).catch(() => undefined);
    }
    await clearSession();
    navigation.replace('Login');
  };

  const rtl = isRtl();

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'MOVING':
        return t('operator.moving');
      case 'STOPPED':
        return t('operator.stopped');
      case 'AT_RESTAURANT':
        return t('operator.atRestaurant');
      case 'OFFLINE':
      default:
        return t('operator.offline');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.langSmallButton} onPress={toggleLanguage}>
            <Text style={styles.langSmallText}>{locale === 'ar' ? 'English' : 'العربية'}</Text>
          </TouchableOpacity>
          <View style={styles.topBarUser}>
            <Text style={styles.topBarName}>{session?.user.name ?? 'Tracker'}</Text>
            <Text style={styles.topBarRole}>{session?.user.role ?? 'ADMIN'}</Text>
          </View>
        </View>

        {/* Fleet KPI Summary Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('app.operatorTitle')}
          </Text>
          <Text style={[styles.cardDescription, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('app.operatorSubtitle')}
          </Text>

          {fleet?.summary && (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiNumber}>{formatWesternNumber(fleet.summary.activeShifts)}</Text>
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
                  {formatWesternNumber(fleet.summary.atRestaurantDrivers)}
                </Text>
                <Text style={styles.kpiLabel}>{t('operator.atRestaurant')}</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={[styles.kpiNumber, { color: '#64748b' }]}>
                  {formatWesternNumber(fleet.summary.offlineDrivers)}
                </Text>
                <Text style={styles.kpiLabel}>{t('operator.offline')}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.outlineButton, refreshing && styles.disabledButton]}
            onPress={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <Text style={styles.outlineButtonText}>{t('operator.refresh')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Fleet Drivers List Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('diagnostics.driver')} ({formatWesternNumber(fleet?.drivers.length ?? 0)})
          </Text>

          {(!fleet?.drivers || fleet.drivers.length === 0) ? (
            <Text style={[styles.emptyText, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('operator.noDrivers')}
            </Text>
          ) : (
            fleet.drivers.map((driver) => {
              const statusColor = getStatusColor(driver.operationalStatus);
              const battery = driver.device?.batteryPercentage;
              return (
                <View key={driver.driverId} style={styles.driverCard}>
                  <View style={styles.driverHeader}>
                    <View style={[styles.driverBadge, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[styles.driverBadgeText, { color: statusColor }]}>
                        {getStatusLabel(driver.operationalStatus)}
                      </Text>
                    </View>
                    <View style={styles.driverTitleGroup}>
                      <Text style={styles.driverName}>{driver.driverName}</Text>
                      <Text style={styles.driverIdText}>
                        {t('diagnostics.employeeId')} {formatWesternNumber(driver.employeeId)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.driverMetaRow}>
                    {battery != null && (
                      <Text style={[styles.metaText, battery <= 20 ? styles.textRed : undefined]}>
                        {t('operator.battery')}: {formatWesternNumber(battery)}%
                        {driver.device?.isCharging ? ' ⚡' : ''}
                      </Text>
                    )}
                    {driver.device?.networkStatus && (
                      <Text style={styles.metaText}>
                        {driver.device.networkStatus.toUpperCase()}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>{t('app.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function DriverHomeScreen({ navigation }: any): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  useEffect(() => {
    initLocale().then(setLocaleState);
  }, []);

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  const refreshState = async (activeSession?: Session | null) => {
    const s = activeSession ?? session;
    if (!s) return;
    try {
      const shiftsResp = await apiRequest<{
        page: number;
        limit: number;
        total: number;
        items: any[];
      }>(`/api/drivers/me/shifts?status=ACTIVE`, {}, s).catch(() => ({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
      }));

      const hasActive = (shiftsResp.items ?? []).length > 0;
      setTrackingEnabled(hasActive);

      const profileResponse = await apiRequest<{ driver: any }>('/api/drivers/me', {}, s).catch(
        () => null
      );
      if (profileResponse?.driver) {
        setProfile(profileResponse.driver);
      }

      const count = await getQueuedLocationCount();
      setQueuedCount(count);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    (async () => {
      const activeSession = await readSession();
      if (!activeSession || !isValidSession(activeSession) || !isAllowedRole(activeSession.user.role)) {
        await clearSession().catch(() => undefined);
        navigation.replace('Login');
        return;
      }
      setSession(activeSession);
      try {
        registerBackgroundLocationTask();
        await refreshState(activeSession);
        await flushQueuedLocationsGuarded(API_URL);
      } finally {
        setLoading(false);
      }
    })();

    // Connectivity listener
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        // @ts-ignore
        const NetInfo = await import('@react-native-community/netinfo');
        const sub = (NetInfo as any).default.addEventListener((state: any) => {
          if (state.isConnected) {
            flushQueuedLocationsGuarded(API_URL)
              .then(() => getQueuedLocationCount().then(setQueuedCount))
              .catch(() => undefined);
          }
        });
        unsub = () => sub();
      } catch {}
    })();

    // Queue count poll
    const interval = setInterval(async () => {
      const count = await getQueuedLocationCount();
      setQueuedCount(count);
    }, 10000);

    return () => {
      if (unsub) unsub();
      clearInterval(interval);
    };
  }, [navigation]);

  const handleManualFlush = async () => {
    setFlushing(true);
    try {
      await flushQueuedLocationsGuarded(API_URL);
      const count = await getQueuedLocationCount();
      setQueuedCount(count);
      Alert.alert(t('app.notice'), t('app.synced'));
    } catch {
      Alert.alert(t('app.notice'), t('app.syncError'));
    } finally {
      setFlushing(false);
    }
  };

  const handleStartShift = async () => {
    setLoading(true);
    try {
      const resp = await apiRequest('/api/drivers/me/shifts/start', { method: 'POST' });
      if (resp && (resp as any).shift) {
        const started = await startBackgroundTracking();
        setTrackingEnabled(Boolean(started));
        await flushQueuedLocationsGuarded(API_URL);
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
    } catch (err) {
      Alert.alert(
        t('app.error'),
        err instanceof Error ? err.message : 'Unable to start shift'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEndShift = async () => {
    setLoading(true);
    try {
      await stopBackgroundTracking();
      setTrackingEnabled(false);
      await flushQueuedLocationsGuarded(API_URL).catch(() => {});
      await apiRequest('/api/drivers/me/shifts/end', { method: 'POST' });
      await refreshState();
      Alert.alert(t('shift.ended'), t('shift.offDuty'));
    } catch (err) {
      Alert.alert(
        t('app.error'),
        err instanceof Error ? err.message : 'Unable to end shift'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (trackingEnabled) {
      Alert.alert(t('app.warning'), t('shift.endShiftFirst'));
      return;
    }

    try {
      const current = await readSession();
      if (current?.refreshToken) {
        fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        }).catch(() => {});
      }
    } finally {
      await clearSession();
      navigation.replace('Login');
    }
  };

  const rtl = isRtl();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.langSmallButton} onPress={toggleLanguage}>
            <Text style={styles.langSmallText}>{locale === 'ar' ? 'English' : 'العربية'}</Text>
          </TouchableOpacity>

          <View style={styles.topBarUser}>
            <Text style={styles.topBarName}>{session?.user.name}</Text>
            <Text style={styles.topBarRole}>
              {profile?.employeeId
                ? `${t('diagnostics.employeeId')} ${formatWesternNumber(profile.employeeId)}`
                : t('diagnostics.driver')}
            </Text>
          </View>
        </View>

        {/* Shift Control Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('shift.title')}</Text>
            <View
              style={[
                styles.statusBadge,
                trackingEnabled ? styles.statusBadgeActive : styles.statusBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  trackingEnabled ? styles.statusTextActive : styles.statusTextInactive,
                ]}
              >
                {trackingEnabled ? t('shift.onDuty') : t('shift.offDuty')}
              </Text>
            </View>
          </View>

          <Text style={[styles.cardDescription, { textAlign: rtl ? 'right' : 'left' }]}>
            {trackingEnabled
              ? t('shift.activeTrackingNotice')
              : t('shift.inactiveNotice')}
          </Text>

          <TouchableOpacity
            style={[
              styles.actionButton,
              trackingEnabled ? styles.endShiftButton : styles.startShiftButton,
              loading && styles.disabledButton,
            ]}
            onPress={trackingEnabled ? handleEndShift : handleStartShift}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>
                {trackingEnabled ? t('shift.endShift') : t('shift.startShift')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Telemetry / Queue Diagnostics Card */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { textAlign: rtl ? 'right' : 'left' }]}>
            {t('diagnostics.title')}
          </Text>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>{t('diagnostics.trackingStatus')}</Text>
            <Text style={[styles.diagValue, trackingEnabled ? styles.textGreen : styles.textGray]}>
              {trackingEnabled ? t('diagnostics.active') : t('diagnostics.inactive')}
            </Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>{t('diagnostics.queuedLocations')}</Text>
            <Text style={styles.diagValue}>{formatWesternNumber(queuedCount)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.outlineButton, flushing && styles.disabledButton]}
            onPress={handleManualFlush}
            disabled={flushing}
          >
            {flushing ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <Text style={styles.outlineButtonText}>{t('app.sync')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loading}
        >
          <Text style={styles.logoutButtonText}>{t('app.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App(): React.JSX.Element {
  return (
    <NavigationContainer>
      <STACK.Navigator screenOptions={{ headerShown: false }}>
        <STACK.Screen name="Login" component={LoginScreen} />
        <STACK.Screen name="DriverHome" component={DriverHomeScreen} />
        <STACK.Screen name="OperatorHome" component={OperatorHomeScreen} />
      </STACK.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loginCard: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  langButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  langButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  appTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  primaryButton: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  topBarUser: {
    alignItems: 'flex-end',
  },
  topBarName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  topBarRole: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  langSmallButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  langSmallText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
  cardDescription: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  diagLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  diagValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  textGreen: {
    color: '#059669',
  },
  textGray: {
    color: '#94a3b8',
  },
  textRed: {
    color: '#e11d48',
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
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  logoutButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff1f2',
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#e11d48',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  kpiBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  kpiNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    paddingVertical: 16,
  },
  driverCard: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 12,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  driverTitleGroup: {
    alignItems: 'flex-end',
  },
  driverName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  driverIdText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  driverBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  driverBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  driverMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaText: {
    fontSize: 11,
    color: '#64748b',
  },
});
