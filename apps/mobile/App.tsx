import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_LOCATION_DISTANCE_METERS,
  DEFAULT_LOCATION_INTERVAL_MS,
  ensureTrackingPermissions,
  flushQueuedLocations,
  getQueuedLocationCount,
  registerBackgroundLocationTask,
  startBackgroundTracking,
  stopBackgroundTracking,
} from './location';

const STACK = createNativeStackNavigator<any>();
const SESSION_KEY = 'tracker_driver_session';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: 'ADMIN' | 'MANAGER' | 'DRIVER';
    active: boolean;
  };
};

async function saveSession(session: Session): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn('Failed to persist secure session', error);
    throw error;
  }
}

async function readSession(): Promise<Session | null> {
  try {
    const value = await Promise.race([
      SecureStore.getItemAsync(SESSION_KEY),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session restore timed out')), 1500);
      }),
    ]);

    if (!value) return null;

    try {
      return JSON.parse(value) as Session;
    } catch {
      await clearSession().catch(() => undefined);
      return null;
    }
  } catch (error) {
    console.warn('Failed to restore secure session; clearing it', error);
    await clearSession().catch(() => undefined);
    return null;
  }
}

async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch (error) {
    console.warn('Failed to clear secure session', error);
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}, sessionOverride?: Session | null): Promise<T> {
  const session = sessionOverride ?? (await readSession());
  const headers = new Headers(options.headers ?? {});
  headers.set('Content-Type', 'application/json');

  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && session?.refreshToken) {
    const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    if (refreshResponse.ok) {
      const refreshed = (await refreshResponse.json()) as { accessToken: string; refreshToken: string; user: Session['user'] };
      const nextSession: Session = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        user: refreshed.user,
      };
      await saveSession(nextSession);

      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });
    } else {
      await clearSession();
      throw new Error('Your session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message ?? 'Request failed';
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function LoginScreen({ navigation }: any): React.JSX.Element {
  const [emailOrPhone, setEmailOrPhone] = useState('driver1@tracker.local');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone, password }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Login failed');
      }

      const session: Session = {
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        user: payload.user,
      };

      if (session.user.role !== 'DRIVER') {
        throw new Error('This app is for drivers only.');
      }

      await saveSession(session);
      navigation.replace('DriverHome');
    } catch (error) {
      Alert.alert('Login failed', error instanceof Error ? error.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>مرحباً</Text>
      <Text style={styles.subtitle}>تسجيل الدخول للسائق</Text>
      <TextInput
        value={emailOrPhone}
        onChangeText={setEmailOrPhone}
        placeholder="البريد أو الهاتف"
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="كلمة المرور"
        secureTextEntry
        style={styles.input}
      />
      <Button title={loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'} onPress={handleLogin} disabled={loading} />
    </View>
  );
}

function DriverHomeScreen({ navigation }: any): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const activeSession = await readSession();
      if (!activeSession) {
        navigation.replace('Login');
        return;
      }

      setSession(activeSession);
      try {
        registerBackgroundLocationTask();
        const flushed = await flushQueuedLocations(API_URL, activeSession.accessToken);
        if (flushed > 0) {
          console.log('Flushed queued location samples', flushed);
        }

        const profileResponse = await apiRequest<{ driver: any }>('/api/drivers/me', {}, activeSession);
        setProfile(profileResponse.driver);

        const shiftsResponse = await apiRequest<{ items: any[] }>('/api/drivers/me/shifts?page=1&limit=5', {}, activeSession);
        setShifts(shiftsResponse.items ?? []);

        const queued = await getQueuedLocationCount();
        setQueuedCount(queued);

        await apiRequest('/api/devices/register', {
          method: 'POST',
          body: JSON.stringify({
            platform: 'android',
            deviceIdentifier: 'driver-mobile-device',
            appVersion: '1.0.0',
          }),
        }, activeSession);
      } catch (error) {
        Alert.alert('Error', error instanceof Error ? error.message : 'Unable to fetch driver data');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [navigation]);

  const currentShiftStatus = profile?.currentShiftStatus ?? 'OFF_DUTY';

  useEffect(() => {
    if (currentShiftStatus !== 'ACTIVE' || !session) {
      return;
    }

    void (async () => {
      const started = await startBackgroundTracking();
      setTrackingEnabled(started);
      if (!started) {
        Alert.alert('تتبع الموقع', 'تتبع الموقع غير متاح حالياً. تحقق من الأذونات.');
      }
    })();
  }, [currentShiftStatus, session]);

  const startShift = async () => {
    const activeSession = await readSession();
    if (!activeSession) return;

    try {
      const permissionResult = await ensureTrackingPermissions();
      if (!permissionResult.foreground || !permissionResult.background) {
        Alert.alert('مطلوب الموقع', 'يرجى تفعيل إذن الموقع في الخلفية لتتبع الحركة.');
        return;
      }

      const shift = await apiRequest<{ shift: any }>('/api/drivers/me/shifts/start', { method: 'POST' }, activeSession);
      setProfile((prev: any) => ({ ...prev, currentShiftStatus: shift.shift.status, currentShiftStartedAt: shift.shift.startedAt }));

      const trackingStarted = await startBackgroundTracking();
      setTrackingEnabled(trackingStarted);
      if (!trackingStarted) {
        Alert.alert('تنبيه', 'تم بدء الدوام، لكن تتبع الموقع لم يبدأ.');
      }
      Alert.alert('تم', 'تم بدء الدوام بنجاح');
    } catch (error) {
      Alert.alert('خطأ', error instanceof Error ? error.message : 'فشل بدء الدوام');
    }
  };

  const endShift = async () => {
    const activeSession = await readSession();
    if (!activeSession) return;
    try {
      const shift = await apiRequest<{ shift: any }>('/api/drivers/me/shifts/end', { method: 'POST' }, activeSession);
      setProfile((prev: any) => ({ ...prev, currentShiftStatus: shift.shift.status, currentShiftStartedAt: null }));
      await stopBackgroundTracking();
      setTrackingEnabled(false);
      Alert.alert('تم', 'تم إنهاء الدوام بنجاح');
    } catch (error) {
      Alert.alert('خطأ', error instanceof Error ? error.message : 'فشل إنهاء الدوام');
    }
  };

  const logout = async () => {
    await clearSession();
    navigation.replace('Login');
  };

  if (loading) {
    return <View style={styles.screen}><Text style={styles.title}>جاري التحميل...</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>مرحباً، {profile?.name ?? session?.user.name ?? 'سائق'}</Text>
      <Text style={styles.statusLabel}>حالة الدوام</Text>
      <Text style={styles.statusValue}>{currentShiftStatus === 'ACTIVE' ? 'على رأس العمل' : 'خارج الدوام'}</Text>
      <Text style={styles.meta}>{trackingEnabled ? 'التتبع: يعمل' : 'التتبع: متوقف'}</Text>
      <Text style={styles.meta}>GPS: {trackingEnabled ? 'مفعّل' : 'غير مفعّل'}</Text>
      <Text style={styles.meta}>الإنترنت: {queuedCount > 0 ? 'غير متصل' : 'متصل'}</Text>
      <Text style={styles.meta}>آخر تحديث: منذ {DEFAULT_LOCATION_INTERVAL_MS / 1000} ثوانٍ</Text>
      <Text style={styles.meta}>الفاصل: {DEFAULT_LOCATION_DISTANCE_METERS} م</Text>
      {profile?.currentShiftStartedAt ? <Text style={styles.meta}>بدأ: {new Date(profile.currentShiftStartedAt).toLocaleTimeString('ar-SA')}</Text> : null}
      <View style={styles.buttonRow}>
        {currentShiftStatus === 'ACTIVE' ? (
          <Button title="إنهاء الدوام" onPress={endShift} />
        ) : (
          <Button title="بدء الدوام" onPress={startShift} />
        )}
      </View>

      <View style={styles.smallActions}>
        <Button title="السجل" onPress={() => navigation.navigate('ShiftHistory')} />
        <Button title="الملف الشخصي" onPress={() => navigation.navigate('Profile')} />
        <Button title="تسجيل الخروج" onPress={logout} color="#d33" />
      </View>

      <View style={styles.historyBox}>
        <Text style={styles.sectionTitle}>آخر الدوامات</Text>
        {shifts.length === 0 ? <Text>لا توجد دفعات سابقة.</Text> : shifts.map((shift: any) => (
          <View key={shift.id} style={styles.shiftRow}>
            <Text>{shift.status}</Text>
            <Text>{new Date(shift.startedAt).toLocaleString('ar-SA')}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ShiftHistoryScreen({ navigation }: any): React.JSX.Element {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const session = await readSession();
      if (!session) {
        navigation.replace('Login');
        return;
      }
      try {
        const response = await apiRequest<{ items: any[] }>('/api/drivers/me/shifts?page=1&limit=10', {}, session);
        setItems(response.items ?? []);
      } catch (error) {
        Alert.alert('خطأ', error instanceof Error ? error.message : 'فشل تحميل السجل');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>سجل الدوام</Text>
      {loading ? <Text>جارٍ التحميل...</Text> : items.length === 0 ? <Text>لا توجد سجل</Text> : items.map((item) => (
        <View key={item.id} style={styles.shiftRow}>
          <Text>{item.status}</Text>
          <Text>{new Date(item.startedAt).toLocaleString('ar-SA')}</Text>
          {item.endedAt ? <Text>{new Date(item.endedAt).toLocaleString('ar-SA')}</Text> : <Text>نشط</Text>}
        </View>
      ))}
    </View>
  );
}

function ProfileScreen({ navigation }: any): React.JSX.Element {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const session = await readSession();
      if (!session) {
        navigation.replace('Login');
        return;
      }
      const response = await apiRequest<{ driver: any }>('/api/drivers/me', {}, session);
      setProfile(response.driver);
    };

    void load();
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>الملف الشخصي</Text>
      {profile ? (
        <View>
          <Text>الاسم: {profile.name}</Text>
          <Text>البريد: {profile.email}</Text>
          <Text>الهاتف: {profile.phone ?? 'غير متوفر'}</Text>
          <Text>رقم الموظف: {profile.employeeId}</Text>
          <Text>الحالة: {profile.active ? 'نشط' : 'غير نشط'}</Text>
        </View>
      ) : <Text>جارٍ التحميل...</Text>}
    </View>
  );
}

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    registerBackgroundLocationTask();

    void (async () => {
      try {
        const restoredSession = await readSession();
        if (!active) return;
        setSession(restoredSession);
      } catch (error) {
        console.warn('Session bootstrap failed', error);
        if (active) {
          setSession(null);
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const initialRoute = useMemo(() => (session ? 'DriverHome' : 'Login'), [session]);

  if (!ready) {
    return <View style={styles.screen}><Text>جاري التهيئة...</Text></View>;
  }

  return (
    <NavigationContainer>
      <STACK.Navigator initialRouteName={initialRoute} screenOptions={{ headerTitleAlign: 'center' }}>
        <STACK.Screen name="Login" component={LoginScreen} options={{ title: 'تسجيل الدخول' }} />
        <STACK.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: 'الرئيسية' }} />
        <STACK.Screen name="ShiftHistory" component={ShiftHistoryScreen} options={{ title: 'سجل الدوام' }} />
        <STACK.Screen name="Profile" component={ProfileScreen} options={{ title: 'الملف الشخصي' }} />
      </STACK.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f5f7fb',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 18,
    textAlign: 'center',
  },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#d5d9e0',
    borderRadius: 10,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 22,
    marginBottom: 8,
    fontWeight: '700',
  },
  meta: {
    fontSize: 16,
    marginBottom: 6,
  },
  buttonRow: {
    marginVertical: 16,
  },
  smallActions: {
    marginTop: 12,
    gap: 8,
  },
  historyBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  shiftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eceff4',
  },
});
