export type Role = 'ADMIN' | 'MANAGER' | 'DRIVER';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};

export type DriverSummary = {
  id: string;
  userId: string;
  employeeId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
};

export type DriverDetailResponse = {
  driver: DriverSummary & {
    currentShiftStatus: 'ACTIVE' | 'COMPLETED' | null;
    currentShiftStartedAt: string | null;
    device: DeviceRecord | null;
  };
};

export type DeviceRecord = {
  id: string;
  driverId: string;
  platform: string;
  deviceIdentifier: string | null;
  appVersion: string | null;
  lastSeen: string | null;
  lastLocationAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DriverTrackingStatus = {
  driverId: string;
  activeShift: {
    id: string;
    driverId: string;
    startedAt: string;
    endedAt: string | null;
    status: 'ACTIVE' | 'COMPLETED';
    createdAt: string;
    updatedAt: string;
  } | null;
  trackingActive: boolean;
  latestLocation: LocationPoint | null;
  lastSeen: string | null;
  lastLocationAt: string | null;
};

export type LocationPoint = {
  id: string;
  driverId: string;
  shiftId: string | null;
  clientLocationId: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
  receivedAt: string;
  source: string;
  createdAt: string;
};

export type ShiftRecord = {
  id: string;
  driverId: string;
  startedAt: string;
  endedAt: string | null;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
};

export type ApiListResponse<T> = {
  page: number;
  limit: number;
  total: number;
  items: T[];
};

export type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

const STORAGE_KEY = 'tracker-admin-session';

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
}

export function getStoredSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function refreshSessionIfPossible(): Promise<Session | null> {
  const existing = getStoredSession();
  if (!existing?.refreshToken) return null;

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: existing.refreshToken }),
    });

    if (!response.ok) {
      clearSession();
      return null;
    }

    const payload = (await parseJson<{ accessToken: string; refreshToken: string; user: SessionUser }>(response)) as {
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
    };
    const next = { accessToken: payload.accessToken, refreshToken: payload.refreshToken, user: payload.user };
    saveSession(next);
    return next;
  } catch {
    clearSession();
    return null;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, requireAuth = true): Promise<T> {
  const base = getApiBaseUrl();
  const session = getStoredSession();
  const headers = new Headers(init.headers ?? {});

  if (requireAuth && session?.accessToken) {
    headers.set('Authorization', 'Bearer ' + session.accessToken);
  }

  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${base}${path}`, { ...init, headers });

  if (response.status === 401 && requireAuth) {
    const refreshed = await refreshSessionIfPossible();
    if (refreshed) {
      const retryHeaders = new Headers(init.headers ?? {});
      retryHeaders.set('Authorization', 'Bearer ' + refreshed.accessToken);
      if (!retryHeaders.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
        retryHeaders.set('Content-Type', 'application/json');
      }
      response = await fetch(`${base}${path}`, { ...init, headers: retryHeaders });
    }
  }

  if (!response.ok) {
    const payload = (await parseJson<ErrorPayload>(response)) as ErrorPayload;
    throw new Error(payload?.error?.message ?? 'Request failed');
  }

  return parseJson<T>(response);
}

export async function loginAdmin(emailOrPhone: string, password: string): Promise<Session> {
  const payload = await apiRequest<{ accessToken: string; refreshToken: string; user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrPhone, password }),
  }, false);

  const session = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  };
  saveSession(session);
  return session;
}

export async function logoutAdmin(): Promise<void> {
  const session = getStoredSession();
  if (!session) {
    clearSession();
    return;
  }

  try {
    await apiRequest('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    }, true);
  } catch {
    // ignore logout failures and clear local state
  }

  clearSession();
}

export async function getCurrentUser(): Promise<SessionUser> {
  const payload = await apiRequest<{ user: SessionUser }>('/api/auth/me');
  return payload.user;
}

export async function listDrivers(): Promise<DriverSummary[]> {
  const payload = await apiRequest<ApiListResponse<DriverSummary>>('/api/drivers?page=1&limit=100');
  return payload.items;
}

export async function getDriverById(id: string): Promise<DriverSummary & { currentShiftStatus: 'ACTIVE' | 'COMPLETED' | null; currentShiftStartedAt: string | null; device: DeviceRecord | null }> {
  const payload = await apiRequest<{ driver: DriverSummary & { currentShiftStatus: 'ACTIVE' | 'COMPLETED' | null; currentShiftStartedAt: string | null; device: DeviceRecord | null } }>(`/api/drivers/${id}`);
  return payload.driver;
}

export async function getDriverTrackingStatus(id: string): Promise<DriverTrackingStatus> {
  return apiRequest<DriverTrackingStatus>(`/api/drivers/${id}/tracking-status`);
}

export async function getDriverHistory(id: string, page = 1, limit = 10): Promise<ApiListResponse<ShiftRecord>> {
  return apiRequest<ApiListResponse<ShiftRecord>>(`/api/drivers/${id}/shifts?page=${page}&limit=${limit}`);
}

export async function getDriverLatestLocation(id: string): Promise<{ location: LocationPoint | null }> {
  return apiRequest<{ location: LocationPoint | null }>(`/api/drivers/${id}/location/latest`);
}

export const apiClient = {
  login: loginAdmin,
  logout: logoutAdmin,
  getCurrentUser,
  listDrivers,
  getDriverById,
  getDriverTrackingStatus,
  getDriverHistory,
  getDriverLatestLocation,
};







