export type Role = 'ADMIN' | 'DRIVER' | 'CALL_CENTER';

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
  authorized?: boolean;
  batteryPercentage?: number | null;
  isCharging?: boolean | null;
  locationServicesEnabled?: boolean | null;
  networkStatus?: string | null;
  lastSeen: string | null;
  lastLocationAt: string | null;
  createdAt: string;
  updatedAt?: string;
  driverName?: string;
  driverEmail?: string;
  driverPhone?: string | null;
  employeeId?: string;
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
  startTime?: string;
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

export type FleetDriverLiveStatus = {
  driverId: string;
  driverName: string;
  driverEmail: string;
  driverPhone: string | null;
  employeeId: string;
  driverActive: boolean;
  userId: string;
  shift: {
    id: string;
    status: 'ACTIVE' | 'COMPLETED';
    startedAt: string;
    startTime?: string;
    durationMinutes: number;
  } | null;
  location: {
    id: string;
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    accuracy: number | null;
    altitude: number | null;
    recordedAt: string;
    receivedAt: string;
  } | null;
  device: {
    id: string;
    platform: string;
    appVersion: string | null;
    deviceIdentifier: string | null;
    authorized: boolean;
    batteryPercentage: number | null;
    isCharging: boolean | null;
    locationServicesEnabled: boolean | null;
    networkStatus: string | null;
    lastSeen: string | null;
  } | null;
  operationalStatus: 'AT_RESTAURANT' | 'MOVING' | 'STOPPED' | 'OFFLINE';
  isInsideGeofence: boolean;
  distanceToRestaurantMeters: number | null;
};

export type LiveFleetResponse = {
  summary: {
    totalDrivers: number;
    activeShifts: number;
    onlineDrivers: number;
    atRestaurant: number;
    moving: number;
    stopped: number;
    offline: number;
    lowBatteryCount: number;
  };
  restaurant: {
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    enabled: boolean;
  };
  drivers: FleetDriverLiveStatus[];
};

export type RestaurantSettings = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled: boolean;
  updatedAt?: string;
};

export type AlertSettings = {
  id?: string;
  maxStopDurationMinutes: number;
  offlineGraceMinutes: number;
  lowBatteryThreshold: number;
  criticalBatteryThreshold: number;
  maxShiftDurationHours: number;
  stopAlertEnabled: boolean;
  gpsAlertEnabled: boolean;
  offlineAlertEnabled: boolean;
  batteryAlertEnabled: boolean;
  restaurantGeofenceAlertEnabled: boolean;
  soundEnabled: boolean;
  inAppAlertsEnabled: boolean;
  pushAlertsEnabled: boolean;
  updatedAt?: string;
};

export type NotificationItem = {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  driverId: string | null;
  shiftId: string | null;
  metadata: string | null;
  read: boolean;
  readAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
};

export type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

const STORAGE_KEY = 'tracker-admin-session';
export const SESSION_CHANGE_EVENT = 'tracker_session_change';

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
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: session }));
  }
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: null }));
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

let activeRefreshPromise: Promise<Session | null> | null = null;

export async function refreshSessionIfPossible(): Promise<Session | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
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
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
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

export async function listDrivers(page = 1, limit = 50): Promise<ApiListResponse<DriverSummary>> {
  return apiRequest<ApiListResponse<DriverSummary>>(`/api/drivers?page=${page}&limit=${limit}`);
}

export async function createDriver(data: {
  name: string;
  email: string;
  phone?: string;
  employeeId: string;
  password: string;
  active?: boolean;
}): Promise<{ driver: DriverSummary; user: SessionUser }> {
  return apiRequest<{ driver: DriverSummary; user: SessionUser }>('/api/drivers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDriver(id: string, data: {
  name?: string;
  email?: string;
  phone?: string;
  employeeId?: string;
  password?: string;
  active?: boolean;
}): Promise<{ driver: DriverSummary }> {
  return apiRequest<{ driver: DriverSummary }>(`/api/drivers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
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

export async function getDriverLocations(id: string, page = 1, limit = 20): Promise<ApiListResponse<LocationPoint>> {
  return apiRequest<ApiListResponse<LocationPoint>>(`/api/drivers/${id}/locations?page=${page}&limit=${limit}`);
}

export async function getDriverLatestLocation(id: string): Promise<{ location: LocationPoint | null }> {
  return apiRequest<{ location: LocationPoint | null }>(`/api/drivers/${id}/location/latest`);
}

export async function resetDriverDevice(driverId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/api/drivers/${driverId}/device/reset`, {
    method: 'POST',
  });
}

export async function getLiveFleetStatus(): Promise<LiveFleetResponse> {
  return apiRequest<LiveFleetResponse>('/api/fleet/live');
}

export async function getRestaurantSettings(): Promise<RestaurantSettings> {
  const payload = await apiRequest<{ settings: RestaurantSettings }>('/api/settings/restaurant');
  return payload.settings;
}

export async function updateRestaurantSettings(data: Partial<RestaurantSettings>): Promise<RestaurantSettings> {
  const payload = await apiRequest<{ settings: RestaurantSettings }>('/api/settings/restaurant', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return payload.settings;
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const payload = await apiRequest<{ settings: AlertSettings }>('/api/settings/alerts');
  return payload.settings;
}

export async function updateAlertSettings(data: Partial<AlertSettings>): Promise<AlertSettings> {
  const payload = await apiRequest<{ settings: AlertSettings }>('/api/settings/alerts', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return payload.settings;
}

export async function listNotifications(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<{ items: NotificationItem[]; total: number; unreadCount: number; page: number; limit: number }> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.unreadOnly) query.set('unreadOnly', 'true');
  return apiRequest<{ items: NotificationItem[]; total: number; unreadCount: number; page: number; limit: number }>(`/api/notifications?${query.toString()}`);
}

export async function markNotificationRead(id: string): Promise<{ notification: NotificationItem }> {
  return apiRequest<{ notification: NotificationItem }>(`/api/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>('/api/notifications/read-all', {
    method: 'POST',
  });
}

export async function listUsers(params?: { page?: number; limit?: number; role?: string; search?: string }): Promise<ApiListResponse<SessionUser>> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.role) query.set('role', params.role);
  if (params?.search) query.set('search', params.search);
  return apiRequest<ApiListResponse<SessionUser>>(`/api/users?${query.toString()}`);
}

export async function createUser(data: {
  name: string;
  email: string;
  phone?: string;
  role: Role;
  password: string;
  active?: boolean;
}): Promise<{ user: SessionUser }> {
  return apiRequest<{ user: SessionUser }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(id: string, data: {
  name?: string;
  email?: string;
  phone?: string;
  role?: Role;
  password?: string;
  active?: boolean;
}): Promise<{ user: SessionUser }> {
  return apiRequest<{ user: SessionUser }>(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deactivateUser(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/api/users/${id}`, {
    method: 'DELETE',
  });
}

export async function listDevices(page = 1, limit = 50): Promise<ApiListResponse<DeviceRecord>> {
  return apiRequest<ApiListResponse<DeviceRecord>>(`/api/devices?page=${page}&limit=${limit}`);
}

export const apiClient = {
  login: loginAdmin,
  logout: logoutAdmin,
  getCurrentUser,
  listDrivers,
  createDriver,
  updateDriver,
  getDriverById,
  getDriverTrackingStatus,
  getDriverHistory,
  getDriverLocations,
  getDriverLatestLocation,
  resetDriverDevice,
  getLiveFleetStatus,
  getRestaurantSettings,
  updateRestaurantSettings,
  getAlertSettings,
  updateAlertSettings,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  listDevices,
};
