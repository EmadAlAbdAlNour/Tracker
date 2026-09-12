import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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

const DEVICE_ID_KEY = 'tracker_device_id';
const SESSION_KEY = 'tracker_driver_session';
const STACK = createNativeStackNavigator<any>();
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: 'ADMIN' | 'MANAGER' | 'DRIVER' | 'CALL_CENTER';
    active: boolean;
  };
};

// Western numerals formatter (0-9)
function formatNumber(value: number | string | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }
  const str = String(value).replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)] ?? d);
  const num = Number(str);
  if (!isNaN(num)) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  }
  return str;
}

async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

async function readSession(): Promise<Session | null> {
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as Session;
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
        const nextSession: Session = {
          accessToken: refreshedPayload.accessToken,
          refreshToken: refreshedPayload.refreshToken,
          user: refreshedPayload.user,
        };
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
  const [isArabic, setIsArabic] = useState(true);

  const handleLogin = async () => {
    if (!emailOrPhone.trim() || !password) {
      Alert.alert(
        isArabic ? 'تنبيه' : 'Notice',
        isArabic ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Please enter credentials'
      );
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
        const message = payload?.error?.message ?? payload?.message ?? 'Login failed';
        throw new Error(message);
      }

      const session: Session = {
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        user: payload.user,
      };

      if (session.user.role !== 'DRIVER') {
        Alert.alert(
          isArabic ? 'خطأ في الصلاحية' : 'Permission Error',
          isArabic ? 'هذا التطبيق مخصص للسائقين فقط.' : 'This app is for drivers only.'
        );
        return;
      }

      await saveSession(session);
      navigation.replace('DriverHome');
    } catch (error) {
      Alert.alert(
        isArabic ? 'فشل تسجيل الدخول' : 'Login Failed',
        error instanceof Error ? error.message : 'Unexpected error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <View style={styles.loginCard}>
        {/* Language switch */}
        <TouchableOpacity
          style={styles.langButton}
          onPress={() => setIsArabic(!isArabic)}
        >
          <Text style={styles.langButtonText}>{isArabic ? 'English' : 'العربية'}</Text>
        </TouchableOpacity>

        {/* Logo and header */}
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>T</Text>
        </View>

        <Text style={styles.appTitle}>
          {isArabic ? 'تطبيق السائق' : 'Driver Tracker'}
        </Text>
        <Text style={styles.appSubtitle}>
          {isArabic ? 'سجل الدخول لبدء وردية العمل' : 'Sign in to start your shift'}
        </Text>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {isArabic ? 'البريد الإلكتروني أو الهاتف' : 'Email or Phone'}
            </Text>
            <TextInput
              value={emailOrPhone}
              onChangeText={setEmailOrPhone}
              placeholder={isArabic ? 'driver@example.com' : 'driver@example.com'}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              style={[styles.input, { textAlign: isArabic ? 'right' : 'left' }]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {isArabic ? 'كلمة المرور' : 'Password'}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={[styles.input, { textAlign: isArabic ? 'right' : 'left' }]}
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
              <Text style={styles.primaryButtonText}>
                {isArabic ? 'تسجيل الدخول' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
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
  const [isArabic, setIsArabic] = useState(true);

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
      if (!activeSession) {
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
      Alert.alert(
        isArabic ? 'تمت المزامنة' : 'Synced',
        isArabic ? 'تم إرسال النقاط المسجلة بنجاح' : 'Queued locations sent successfully'
      );
    } catch {
      Alert.alert(
        isArabic ? 'تنبيه' : 'Notice',
        isArabic ? 'تعذر الاتصال بالخادم، سيتم المحاولة لاحقاً' : 'Could not connect, will retry'
      );
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
        Alert.alert(
          isArabic ? 'تم بدء الوردية' : 'Shift Started',
          isArabic ? 'تتبع الموقع يعمل الآن في الخلفية' : 'Location tracking is active'
        );
      }
    } catch (err) {
      Alert.alert(
        isArabic ? 'فشل بدء الوردية' : 'Start Shift Failed',
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
      // Flush any queued points collected during this active shift FIRST
      await flushQueuedLocationsGuarded(API_URL).catch(() => {});
      // Now end the shift on the server
      await apiRequest('/api/drivers/me/shifts/end', { method: 'POST' });
      await refreshState();
      Alert.alert(
        isArabic ? 'تم إنهاء الوردية' : 'Shift Ended',
        isArabic ? 'تم إيقاف تتبع الموقع وحفظ ساعات العمل' : 'Location tracking has been stopped'
      );
    } catch (err) {
      Alert.alert(
        isArabic ? 'فشل إنهاء الوردية' : 'End Shift Failed',
        err instanceof Error ? err.message : 'Unable to end shift'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (trackingEnabled) {
      Alert.alert(
        isArabic ? 'تنبيه' : 'Warning',
        isArabic
          ? 'يرجى إنهاء الوردية أولاً قبل تسجيل الخروج.'
          : 'Please end your active shift before logging out.'
      );
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.langSmallButton}
            onPress={() => setIsArabic(!isArabic)}
          >
            <Text style={styles.langSmallText}>{isArabic ? 'English' : 'العربية'}</Text>
          </TouchableOpacity>

          <View style={styles.topBarUser}>
            <Text style={styles.topBarName}>{session?.user.name}</Text>
            <Text style={styles.topBarRole}>
              {profile?.employeeId
                ? `${isArabic ? 'الرقم الوظيفي' : 'ID'}: ${formatNumber(profile.employeeId)}`
                : isArabic ? 'سائق' : 'Driver'}
            </Text>
          </View>
        </View>

        {/* Shift Control Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {isArabic ? 'حالة الوردية والتتبع' : 'Shift & Tracking'}
            </Text>
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
                {trackingEnabled
                  ? isArabic ? 'على رأس العمل' : 'ON DUTY'
                  : isArabic ? 'خارج الوردية' : 'OFF DUTY'}
              </Text>
            </View>
          </View>

          <Text style={styles.cardDescription}>
            {trackingEnabled
              ? isArabic
                ? 'نظام التتبع يرسل موقعك تلقائياً للوحة التحكم لضمان سلامة العمليات.'
                : 'Background GPS tracking is actively transmitting your location.'
              : isArabic
              ? 'اضغط أدناه لبدء الوردية وتفعيل تتبع الموقع الجغرافي.'
              : 'Press below to start your operational shift and GPS tracking.'}
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
                {trackingEnabled
                  ? isArabic ? 'إنهاء الوردية (إيقاف التتبع)' : 'End Shift (Stop Tracking)'
                  : isArabic ? 'بدء الوردية (تفعيل التتبع)' : 'Start Shift (Start Tracking)'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Telemetry / Queue Diagnostics Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isArabic ? 'بيانات الاتصال والمزامنة' : 'Sync & Diagnostics'}
          </Text>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>
              {isArabic ? 'حالة التتبع:' : 'Tracking Status:'}
            </Text>
            <Text
              style={[
                styles.diagValue,
                trackingEnabled ? styles.textGreen : styles.textGray,
              ]}
            >
              {trackingEnabled ? (isArabic ? 'نشط' : 'Active') : (isArabic ? 'معطل' : 'Inactive')}
            </Text>
          </View>

          <View style={styles.diagRow}>
            <Text style={styles.diagLabel}>
              {isArabic ? 'نقاط الموقع المخزنة بالهاتف:' : 'Queued Locations:'}
            </Text>
            <Text style={styles.diagValue}>{formatNumber(queuedCount)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.outlineButton, flushing && styles.disabledButton]}
            onPress={handleManualFlush}
            disabled={flushing}
          >
            {flushing ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <Text style={styles.outlineButtonText}>
                {isArabic ? 'مزامنة البيانات الآن' : 'Sync Now'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loading}
        >
          <Text style={styles.logoutButtonText}>
            {isArabic ? 'تسجيل الخروج' : 'Log Out'}
          </Text>
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
  // Home styles
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
});
