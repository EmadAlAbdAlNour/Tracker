import React, { useEffect, useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
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

async function apiRequest<T>(path: string, options: RequestInit = {}, sessionOverride?: Session | null): Promise<T> {
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
        const refreshed = (await refreshResponse.json()) as { accessToken: string; refreshToken: string; user: Session['user'] };
        const nextSession: Session = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          user: refreshed.user,
        };
        await saveSession(nextSession);

        const retryHeaders = new Headers(options.headers ?? {});
        if (!retryHeaders.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
          retryHeaders.set('Content-Type', 'application/json');
        }
        retryHeaders.set('Authorization', `Bearer ${nextSession.accessToken}`);

        response = await fetch(`${API_URL}${path}`, { ...options, headers: retryHeaders });
      } else {
        await clearSession();
        throw new Error('Your session expired. Please log in again.');
      }
    } catch (err) {
      await clearSession();
      throw new Error('Your session expired. Please log in again.');
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
  const [emailOrPhone, setEmailOrPhone] = useState('driver1@tracker.local');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const deviceIdentifier = await getOrCreateDeviceId();
      const device = { platform: Platform.OS, deviceIdentifier, appVersion: process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0' };

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone, password, device }),
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
        Alert.alert('Login failed', 'This app is for drivers only.');
        return;
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
      <TextInput value={emailOrPhone} onChangeText={setEmailOrPhone} placeholder="البريد أو الهاتف" autoCapitalize="none" style={styles.input} />
      <TextInput value={password} onChangeText={setPassword} placeholder="كلمة المرور" secureTextEntry style={styles.input} />
      <Button title={loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'} onPress={handleLogin} disabled={loading} />
    </View>
  );
}

function DriverHomeScreen({ navigation }: any): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);

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
        // restore shift/ tracking state: check active shifts
        try {
          const shiftsResp = await apiRequest<{ page: number; limit: number; total: number; items: any[] }>(`/api/drivers/me/shifts?status=ACTIVE`, {}, activeSession);
          const hasActive = (shiftsResp.items ?? []).length > 0;
          if (hasActive) {
            const started = await startBackgroundTracking();
            setTrackingEnabled(Boolean(started));
            // perform a guarded flush when we resume and have active shift
            await flushQueuedLocationsGuarded(API_URL);
          }
        } catch (err) {
          // ignore shift restore errors
        }

        const flushed = await flushQueuedLocationsGuarded(API_URL);
        if (flushed > 0) {
          // do not log tokens or secrets
        }

        const profileResponse = await apiRequest<{ driver: any }>('/api/drivers/me', {}, activeSession);
        setProfile(profileResponse.driver);

        const count = await getQueuedLocationCount();
        setQueuedCount(count);
      } catch (err) {
        // ignore and let UI continue
      } finally {
        setLoading(false);
      }
    })();

    // connectivity listener: trigger a single guarded flush on reconnection
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        // dynamic import to avoid hard dependency if not installed
        // @ts-ignore
        const NetInfo = await import('@react-native-community/netinfo');
        const sub = (NetInfo as any).default.addEventListener((state: any) => {
          if (state.isConnected) {
            // fire-and-forget guarded flush
            flushQueuedLocationsGuarded(API_URL).catch(() => undefined);
          }
        });
        unsub = () => sub();
      } catch (err) {
        // NetInfo not available - no reconnect handler
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [navigation]);

  const handleLogout = async () => {
    try {
      const current = await readSession();
      if (current?.refreshToken) {
        // Best-effort: notify server to revoke refresh token, ignore network errors
        try {
          await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: current.refreshToken }),
          });
        } catch {
          // ignore
        }
      }
    } finally {
      await clearSession();
      navigation.replace('Login');
    }
  };

  const handleStartShift = async () => {
    setLoading(true);
    try {
      const resp = await apiRequest('/api/drivers/me/shifts/start', { method: 'POST' });
      if (resp && (resp as any).shift) {
        const started = await startBackgroundTracking();
        setTrackingEnabled(Boolean(started));
        // guarded flush after shift started
        await flushQueuedLocationsGuarded(API_URL);
      }
    } catch (err) {
      Alert.alert('Start shift failed', err instanceof Error ? err.message : 'Unable to start shift');
    } finally {
      setLoading(false);
    }
  };

  const handleEndShift = async () => {
    setLoading(true);
    try {
      // stop tracking first
      await stopBackgroundTracking();
      setTrackingEnabled(false);

      const resp = await apiRequest('/api/drivers/me/shifts/end', { method: 'POST' });
      if (resp && (resp as any).shift) {
        // success
      }
    } catch (err) {
      Alert.alert('End shift failed', err instanceof Error ? err.message : 'Unable to end shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>أهلاً بك</Text>
      <Text>{profile ? profile.employeeId ?? profile.id : '...'}</Text>
      <Text>Queued locations: {queuedCount}</Text>
      <Text>Tracking: {trackingEnabled ? 'ON' : 'OFF'}</Text>
      <View style={{ height: 12 }} />
      <Button title={trackingEnabled ? 'End Shift (Stop Tracking)' : 'Start Shift (Start Tracking)'} onPress={trackingEnabled ? handleEndShift : handleStartShift} />
      <View style={{ height: 12 }} />
      <Button title="تسجيل الخروج" onPress={handleLogout} />
    </View>
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
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 28, marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 16 },
  input: { width: '100%', borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 12, borderRadius: 6 },
});

