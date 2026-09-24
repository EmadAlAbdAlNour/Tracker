import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalizedErrorMessage } from './i18n';

export const SESSION_ROLES = ['ADMIN', 'DRIVER', 'CALL_CENTER'] as const;

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: (typeof SESSION_ROLES)[number];
    active: boolean;
    deviceId?: string | null;
  };
};

export const SESSION_KEY = 'tracker_driver_session';
export const DEVICE_ID_KEY = 'tracker_device_id';

export async function getStoredDeviceId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development'
    ? 'http://10.0.2.2:3000'
    : 'https://tracker-alpha-puce.vercel.app');

export function isAllowedRole(value: unknown): value is Session['user']['role'] {
  return typeof value === 'string' && SESSION_ROLES.includes(value as Session['user']['role']);
}

export function isValidSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, any>;
  if (
    typeof candidate.accessToken !== 'string' ||
    candidate.accessToken.trim().length === 0 ||
    typeof candidate.refreshToken !== 'string' ||
    candidate.refreshToken.trim().length === 0
  ) {
    return false;
  }
  if (!candidate.user || typeof candidate.user !== 'object') {
    return false;
  }

  const user = candidate.user as Record<string, any>;
  return (
    typeof user.id === 'string' &&
    user.id.trim().length > 0 &&
    typeof user.name === 'string' &&
    user.name.trim().length > 0 &&
    typeof user.email === 'string' &&
    user.email.trim().length > 0 &&
    (user.phone === null || typeof user.phone === 'string') &&
    isAllowedRole(user.role) &&
    typeof user.active === 'boolean'
  );
}

export function isTokenExpiringSoon(token: string, thresholdSeconds = 30): boolean {
  try {
    if (!token || typeof token !== 'string') return true;
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    let decodedJson = '';
    if (typeof atob === 'function') {
      decodedJson = atob(padded);
    } else if (typeof Buffer !== 'undefined') {
      decodedJson = Buffer.from(padded, 'base64').toString('utf8');
    } else {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let output = '';
      const clean = padded.replace(/=+$/, '');
      for (let bc = 0, bs = 0, buffer, idx = 0; (buffer = clean.charAt(idx++)); ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4) ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) : 0) {
        buffer = chars.indexOf(buffer);
      }
      decodedJson = output;
    }
    const payload = JSON.parse(decodedJson);
    if (!payload.exp || typeof payload.exp !== 'number') return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSec + thresholdSeconds;
  } catch {
    return true;
  }
}

export async function saveSession(session: Session): Promise<void> {
  if (!isValidSession(session)) {
    throw new Error('Invalid session payload');
  }
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function readSession(): Promise<Session | null> {
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

export const TELEMETRY_TOKEN_KEY = 'tracker_driver_telemetry_token';

export type TelemetryCredential = {
  token: string;
  expiresAt: number;
  shiftId: string;
};

export async function saveTelemetryToken(token: string, expiresAt: number, shiftId: string): Promise<void> {
  if (!token || typeof token !== 'string') return;
  const credential: TelemetryCredential = {
    token,
    expiresAt,
    shiftId,
  };
  await AsyncStorage.setItem(TELEMETRY_TOKEN_KEY, JSON.stringify(credential));
}

export async function readTelemetryToken(expectedShiftId?: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TelemetryCredential;
    if (!parsed?.token || typeof parsed.token !== 'string') {
      await clearTelemetryToken().catch(() => undefined);
      return null;
    }
    // Prevent accidental reuse of stale telemetry token from an old shift
    if (expectedShiftId && parsed.shiftId && parsed.shiftId !== expectedShiftId) {
      await clearTelemetryToken().catch(() => undefined);
      return null;
    }
    // Check if token has at least 60 seconds remaining
    if (parsed.expiresAt && parsed.expiresAt <= Date.now() + 60_000) {
      await clearTelemetryToken().catch(() => undefined);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export async function clearTelemetryToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TELEMETRY_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
  await clearTelemetryToken().catch(() => undefined);
}

let activeRefreshPromise: Promise<Session | null> | null = null;

export async function refreshAuthSession(): Promise<Session | null> {
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
        if (refreshResponse.status === 401 || refreshResponse.status === 403) {
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

export async function apiRequest<T>(
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
    const code = payload?.error?.code ?? payload?.code;
    const message = payload?.error?.message ?? payload?.message ?? 'Request failed';
    const localized = getLocalizedErrorMessage(code || message, message as string);
    const err = new Error(localized);
    (err as any).code = code;
    (err as any).status = response.status;
    throw err;
  }

  return (await response.json()) as T;
}
