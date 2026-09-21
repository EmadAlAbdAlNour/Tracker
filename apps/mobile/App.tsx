import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
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
import {
  API_URL,
  SESSION_KEY,
  apiRequest,
  clearSession,
  isAllowedRole,
  isTokenExpiringSoon,
  isValidSession,
  readSession,
  refreshAuthSession,
  saveSession,
  type Session,
} from './session';
import { getLocale, initLocale, isRtl, setStoredLocale, t, type Locale, getLocalizedErrorMessage } from './i18n';
import { AdminHomeScreen } from './screens/AdminHomeScreen';
import { CallCenterHomeScreen } from './screens/CallCenterHomeScreen';
import { DriverHomeScreen } from './screens/DriverHomeScreen';
import { TrackerLogo } from './components/TrackerLogo';
import { AppIcon } from './components/AppIcon';
import { TrackerDialog } from './components/TrackerDialog';
import { TrackerUpdateModal } from './components/TrackerUpdateModal';
import {
  CURRENT_VERSION_NAME,
  CURRENT_VERSION_CODE,
  fetchLatestRelease,
  isUpdateAvailable,
  downloadAndInstallUpdate,
  type RemoteReleaseInfo,
} from './updateManager';

const DEVICE_ID_KEY = 'tracker_device_id';
const STACK = createNativeStackNavigator<any>();

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

function LoginScreen({ navigation }: any): React.JSX.Element {
  const [checkingPersistedSession, setCheckingPersistedSession] = useState(true);
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'warning' | 'notice' | 'success';
  }>({
    visible: false,
    title: '',
    message: '',
  });

  useEffect(() => {
    initLocale().then(setLocaleState);

    let isMounted = true;
    (async () => {
      try {
        const session = await readSession();
        if (!session || !isValidSession(session) || !isAllowedRole(session.user.role)) {
          if (isMounted) setCheckingPersistedSession(false);
          return;
        }

        if (isTokenExpiringSoon(session.accessToken)) {
          const refreshed = await refreshAuthSession();
          if (refreshed && isValidSession(refreshed) && isAllowedRole(refreshed.user.role)) {
            if (isMounted) navigation.replace(resolveHomeRoute(refreshed.user.role));
            return;
          }

          const current = await readSession();
          if (!current) {
            if (isMounted) setCheckingPersistedSession(false);
            return;
          }

          if (isMounted) navigation.replace(resolveHomeRoute(session.user.role));
          return;
        }

        if (isMounted) navigation.replace(resolveHomeRoute(session.user.role));
      } catch {
        if (isMounted) setCheckingPersistedSession(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [navigation]);

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  const handleLogin = async () => {
    if (!emailOrPhone.trim() || !password) {
      setDialog({
        visible: true,
        title: t('app.notice'),
        message: t('login.enterCredentials'),
        type: 'notice',
      });
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
        appVersion: CURRENT_VERSION_NAME,
      };

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: emailOrPhone.trim(), password, device }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const code = payload?.error?.code ?? payload?.code;
        const message = payload?.error?.message ?? payload?.message;
        const localized = getLocalizedErrorMessage(code || message, message || t('login.failed'));
        throw new Error(localized);
      }

      const sessionCandidate = payload as Partial<Session>;
      if (!isValidSession(sessionCandidate)) {
        setDialog({
          visible: true,
          title: t('app.error'),
          message: t('login.invalidSession'),
          type: 'error',
        });
        return;
      }

      if (!isAllowedRole(sessionCandidate.user.role)) {
        setDialog({
          visible: true,
          title: t('app.error'),
          message: t('login.roleNotAllowed'),
          type: 'error',
        });
        return;
      }

      await saveSession(sessionCandidate);
      navigation.replace(resolveHomeRoute(sessionCandidate.user.role));
    } catch (error) {
      const errorMsg = getLocalizedErrorMessage(error, error instanceof Error ? error.message : undefined);
      setDialog({
        visible: true,
        title: t('login.failed'),
        message: errorMsg,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const rtl = isRtl();

  if (checkingPersistedSession) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
        <ActivityIndicator size="large" color="#059669" />
        <Text style={[styles.loadingText, { marginTop: 16 }]}>
          {t('app.checkingSession')}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <TrackerDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
        onClose={() => setDialog((prev) => ({ ...prev, visible: false }))}
      />
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
              autoCorrect={false}
              keyboardType="email-address"
              style={[styles.input, { textAlign: 'left', writingDirection: 'ltr' }]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('login.password')}
            </Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.passwordInput, { textAlign: 'left', writingDirection: 'ltr' }]}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.passwordVisibilityToggle}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <AppIcon name={showPassword ? 'eye-off' : 'eye'} size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
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
    let isMounted = true;
    (async () => {
      let curr = await readSession();
      if (!curr || !isValidSession(curr) || curr.user.role !== 'ADMIN') {
        if (isMounted) navigation.replace('Login');
        return;
      }

      if (isTokenExpiringSoon(curr.accessToken)) {
        const refreshed = await refreshAuthSession();
        if (refreshed && isValidSession(refreshed) && refreshed.user.role === 'ADMIN') {
          curr = refreshed;
        } else {
          const stillThere = await readSession();
          if (!stillThere) {
            if (isMounted) navigation.replace('Login');
            return;
          }
        }
      }

      if (isMounted) setSession(curr);
    })();

    return () => {
      isMounted = false;
    };
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
        <Text style={[styles.loadingText, { marginTop: 16 }]}>
          {t('app.checkingSession')}
        </Text>
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
    let isMounted = true;
    (async () => {
      let curr = await readSession();
      if (!curr || !isValidSession(curr) || curr.user.role !== 'CALL_CENTER') {
        if (isMounted) navigation.replace('Login');
        return;
      }

      if (isTokenExpiringSoon(curr.accessToken)) {
        const refreshed = await refreshAuthSession();
        if (refreshed && isValidSession(refreshed) && refreshed.user.role === 'CALL_CENTER') {
          curr = refreshed;
        } else {
          const stillThere = await readSession();
          if (!stillThere) {
            if (isMounted) navigation.replace('Login');
            return;
          }
        }
      }

      if (isMounted) setSession(curr);
    })();

    return () => {
      isMounted = false;
    };
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
        <Text style={[styles.loadingText, { marginTop: 16 }]}>
          {t('app.checkingSession')}
        </Text>
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
    let isMounted = true;
    (async () => {
      let curr = await readSession();
      if (!curr || !isValidSession(curr) || curr.user.role !== 'DRIVER') {
        if (isMounted) navigation.replace('Login');
        return;
      }

      if (isTokenExpiringSoon(curr.accessToken)) {
        const refreshed = await refreshAuthSession();
        if (refreshed && isValidSession(refreshed) && refreshed.user.role === 'DRIVER') {
          curr = refreshed;
        } else {
          const stillThere = await readSession();
          if (!stillThere) {
            if (isMounted) navigation.replace('Login');
            return;
          }
        }
      }

      if (isMounted) setSession(curr);
    })();

    return () => {
      isMounted = false;
    };
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
        <Text style={[styles.loadingText, { marginTop: 16 }]}>
          {t('app.checkingSession')}
        </Text>
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

export default function App(): React.JSX.Element {
  const [updateInfo, setUpdateInfo] = useState<RemoteReleaseInfo | null>(null);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const lastCheckRef = useRef<number>(0);

  const checkVersion = async () => {
    try {
      const release = await fetchLatestRelease(API_URL);
      if (
        release &&
        isUpdateAvailable(
          CURRENT_VERSION_NAME,
          CURRENT_VERSION_CODE,
          release.version,
          release.versionCode
        )
      ) {
        setUpdateInfo(release);
        setUpdateModalVisible(true);
      }
    } catch (err) {
      console.warn('[App] Soft update check warning:', err);
    }
  };

  useEffect(() => {
    // 1. Cold launch check
    checkVersion();
    lastCheckRef.current = Date.now();

    // 2. Foreground return check (throttled to 15 minutes)
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const now = Date.now();
        if (now - lastCheckRef.current > 15 * 60 * 1000) {
          lastCheckRef.current = now;
          checkVersion();
        }
      }
    });

    return () => subscription.remove();
  }, []);

  const handleUpdateNow = async () => {
    if (!updateInfo) return;
    setDownloading(true);
    setUpdateError(null);
    setDownloadProgress(0);

    try {
      await downloadAndInstallUpdate(updateInfo, (progress) => {
        setDownloadProgress(progress);
      });
      // Android package installer will prompt the user to confirm installation
    } catch (err: any) {
      setUpdateError(getLocalizedErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {updateInfo && (
        <TrackerUpdateModal
          visible={updateModalVisible}
          currentVersion={CURRENT_VERSION_NAME}
          newVersion={updateInfo.version}
          releaseNotes={updateInfo.releaseNotes}
          onUpdatePress={handleUpdateNow}
          onLaterPress={() => setUpdateModalVisible(false)}
          downloadProgress={downloadProgress}
          downloading={downloading}
          errorMessage={updateError}
          onRetry={handleUpdateNow}
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
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
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
  passwordInputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingStart: 14,
    paddingEnd: 46,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  passwordVisibilityToggle: {
    position: 'absolute',
    right: 12,
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
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
