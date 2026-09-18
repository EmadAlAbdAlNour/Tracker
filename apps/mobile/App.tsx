import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
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
import { resolveHomeRoute } from './roleRouting';
import { isAllowedRole, isValidSession, type Session } from './session';
import { getLocale, initLocale, isRtl, setStoredLocale, t, type Locale } from './i18n';
import { AdminHomeScreen } from './screens/AdminHomeScreen';
import { CallCenterHomeScreen } from './screens/CallCenterHomeScreen';
import { DriverHomeScreen } from './screens/DriverHomeScreen';
import { TrackerLogo } from './components/TrackerLogo';

const DEVICE_ID_KEY = 'tracker_device_id';
const SESSION_KEY = 'tracker_driver_session';
const STACK = createNativeStackNavigator<any>();

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development'
    ? 'http://10.0.2.2:3000'
    : 'https://tracker-alpha-puce.vercel.app');

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

let activeRefreshPromise: Promise<Session | null> | null = null;

async function refreshAuthSession(): Promise<Session | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const currentSession = await readSession();
      if (!currentSession?.refreshToken) return null;

      const refreshResponse = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
      });

      if (!refreshResponse.ok) {
        if (refreshResponse.status === 401) {
          await clearSession().catch(() => undefined);
        }
        return null;
      }

      const refreshedPayload = await refreshResponse.json();
      if (!isValidSession(refreshedPayload)) {
        await clearSession().catch(() => undefined);
        return null;
      }

      await saveSession(refreshedPayload);
      return refreshedPayload;
    } catch {
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
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
    const nextSession = await refreshAuthSession();
    if (nextSession?.accessToken) {
      headers.set('Authorization', `Bearer ${nextSession.accessToken}`);
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });
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

    // Auto navigate if already logged in with valid session
    readSession().then((session) => {
      if (session && isValidSession(session) && isAllowedRole(session.user.role)) {
        navigation.replace(resolveHomeRoute(session.user.role));
      }
    });
  }, [navigation]);

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
      const rawModel = (Platform.constants as any)?.Model;
      const rawBrand = (Platform.constants as any)?.Brand;
      const rawRelease = (Platform.constants as any)?.Release;
      const modelName = [rawBrand, rawModel]
        .filter(Boolean)
        .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
      const platformDescription = modelName
        ? `${Platform.OS === 'android' ? 'Android' : 'iOS'} (${modelName}${rawRelease ? ` - OS ${rawRelease}` : ''})`
        : Platform.OS;

      const device = {
        platform: platformDescription,
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
        <View style={{ marginBottom: 16, alignItems: 'center' }}>
          <TrackerLogo size={64} />
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
              placeholder="user@example.com"
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

        {/* Subtle Developer Attribution Footer */}
        <View style={styles.attributionFooter}>
          <Text style={styles.attributionText}>
            {locale === 'ar' ? 'تم التطوير بواسطة عماد عبد النور ❤️' : 'Developed by Emad Abd Alnour ❤️'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Wrapper for AdminHome
function AdminHomeWrapper({ navigation }: any): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    readSession().then((curr) => {
      if (!curr || !isValidSession(curr) || curr.user.role !== 'ADMIN') {
        navigation.replace('Login');
        return;
      }
      setSession(curr);
    });
  }, [navigation]);

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

  if (!session) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </SafeAreaView>
    );
  }

  return (
    <AdminHomeScreen
      session={session}
      apiUrl={API_URL}
      apiRequest={apiRequest}
      onLogout={handleLogout}
    />
  );
}

// Wrapper for CallCenterHome
function CallCenterHomeWrapper({ navigation }: any): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    readSession().then((curr) => {
      if (!curr || !isValidSession(curr) || curr.user.role !== 'CALL_CENTER') {
        navigation.replace('Login');
        return;
      }
      setSession(curr);
    });
  }, [navigation]);

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

  if (!session) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0284c7" />
      </SafeAreaView>
    );
  }

  return (
    <CallCenterHomeScreen
      session={session}
      apiUrl={API_URL}
      apiRequest={apiRequest}
      onLogout={handleLogout}
    />
  );
}

// Wrapper for DriverHome
function DriverHomeWrapper({ navigation }: any): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    readSession().then((curr) => {
      if (!curr || !isValidSession(curr) || curr.user.role !== 'DRIVER') {
        navigation.replace('Login');
        return;
      }
      setSession(curr);
    });
  }, [navigation]);

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

  if (!session) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </SafeAreaView>
    );
  }

  return (
    <DriverHomeScreen
      session={session}
      apiUrl={API_URL}
      apiRequest={apiRequest}
      onLogout={handleLogout}
    />
  );
}

interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes?: { ar: string; en: string };
}

function isVersionNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const l = parse(latest);
  const c = parse(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lPart = l[i] ?? 0;
    const cPart = c[i] ?? 0;
    if (lPart > cPart) return true;
    if (lPart < cPart) return false;
  }
  return false;
}

function UpdateAdvisoryBanner({
  update,
  onDismiss,
}: {
  update: UpdateInfo;
  onDismiss: () => void;
}): React.JSX.Element {
  const rtl = isRtl();

  const handleOpenDownload = () => {
    const url = update.downloadUrl.startsWith('http')
      ? update.downloadUrl
      : `${API_URL}${update.downloadUrl.startsWith('/') ? '' : '/'}${update.downloadUrl}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`${API_URL}/download`).catch(() => undefined);
    });
  };

  return (
    <SafeAreaView style={styles.bannerSafeArea}>
      <View style={[styles.updateBanner, rtl ? styles.updateBannerRtl : null]}>
        <View style={[styles.updateContent, rtl ? styles.updateContentRtl : null]}>
          <Text style={styles.updateBadge}>NEW</Text>
          <Text style={styles.updateText} numberOfLines={1}>
            {rtl
              ? `تحديث جديد متوفر (v${update.version})`
              : `New update available (v${update.version})`}
          </Text>
        </View>
        <View style={styles.updateActions}>
          <TouchableOpacity style={styles.updateButton} onPress={handleOpenDownload}>
            <Text style={styles.updateButtonText}>{rtl ? 'تحديث' : 'Update'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App(): React.JSX.Element {
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkVersion = async () => {
      try {
        const res = await fetch(`${API_URL}/api/app-version`);
        if (!res.ok) return;
        const data = await res.json();
        const currentVersion = process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0';
        if (data?.version && isVersionNewer(data.version, currentVersion) && isMounted) {
          setAvailableUpdate({
            version: data.version,
            downloadUrl: data.downloadUrl || '/download',
            releaseNotes: data.releaseNotes,
          });
        }
      } catch {
        // Soft advisory check fails silently without blocking user
      }
    };
    checkVersion();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {availableUpdate && !updateDismissed && (
        <UpdateAdvisoryBanner
          update={availableUpdate}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
      <NavigationContainer>
        <STACK.Navigator screenOptions={{ headerShown: false }}>
          <STACK.Screen name="Login" component={LoginScreen} />
          <STACK.Screen name="DriverHome" component={DriverHomeWrapper} />
          <STACK.Screen name="AdminHome" component={AdminHomeWrapper} />
          <STACK.Screen name="CallCenterHome" component={CallCenterHomeWrapper} />
          {/* Backward compatibility alias */}
          <STACK.Screen name="OperatorHome" component={AdminHomeWrapper} />
        </STACK.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
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
  attributionFooter: {
    marginTop: 24,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    alignItems: 'center',
  },
  attributionText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94a3b8',
  },
  bannerSafeArea: {
    backgroundColor: '#0284c7',
  },
  updateBanner: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 9999,
  },
  updateBannerRtl: {
    flexDirection: 'row-reverse',
  },
  updateContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  updateContentRtl: {
    flexDirection: 'row-reverse',
    marginRight: 0,
    marginLeft: 8,
  },
  updateBadge: {
    backgroundColor: '#ffffff',
    color: '#0284c7',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  updateText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  updateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updateButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  updateButtonText: {
    color: '#0284c7',
    fontSize: 11,
    fontWeight: 'bold',
  },
  dismissButton: {
    padding: 4,
  },
  dismissButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
