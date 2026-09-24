import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import { normalizeNetworkStatus } from './telemetry';

export const LOCATION_TASK_NAME = 'tracker-driver-location-task';
export const DEFAULT_LOCATION_INTERVAL_MS = Number(process.env.EXPO_PUBLIC_LOCATION_INTERVAL_MS ?? '5000');
export const DEFAULT_LOCATION_DISTANCE_METERS = Number(process.env.EXPO_PUBLIC_LOCATION_DISTANCE_METERS ?? '10');

export type DriverTelemetryState = {
  batteryPercentage: number | null;
  isCharging: boolean | null;
  locationServicesEnabled: boolean | null;
  networkStatus: string | null;
};

export { normalizeNetworkStatus } from './telemetry';

const { TrackerLocationModule } = NativeModules;

export async function collectDriverTelemetry(): Promise<DriverTelemetryState> {
  let batteryPercentage: number | null = null;
  let isCharging: boolean | null = null;
  let locationServicesEnabled: boolean | null = null;
  let networkStatus: string | null = 'unknown';

  try {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    batteryPercentage = Math.round(Math.max(0, Math.min(100, batteryLevel * 100)));
  } catch {
    batteryPercentage = null;
  }

  try {
    const state = await Battery.getBatteryStateAsync();
    isCharging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  } catch {
    isCharging = null;
  }

  if (Platform.OS === 'android') {
    try {
      locationServicesEnabled = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
    } catch {
      locationServicesEnabled = null;
    }
  } else {
    locationServicesEnabled = true;
  }

  try {
    const NetInfo = await import('@react-native-community/netinfo');
    const state = await (NetInfo as any).default.fetch();
    networkStatus = normalizeNetworkStatus(state?.type ?? null, state?.isConnected ?? null);
  } catch {
    networkStatus = 'unknown';
  }

  return {
    batteryPercentage,
    isCharging,
    locationServicesEnabled,
    networkStatus,
  };
}

export async function ensureTrackingPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  if (Platform.OS !== 'android') {
    return { foreground: true, background: true };
  }

  try {
    const fineGranted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'إذن تحديد الموقع',
        message: 'يحتاج تطبيق Tracker إلى إذن الموقع الدقيق لتتبع موقع السائق أثناء الوردية',
        buttonPositive: 'موافق',
        buttonNegative: 'إلغاء',
      }
    );

    const foreground = fineGranted === PermissionsAndroid.RESULTS.GRANTED;
    let background = false;

    if (foreground && (Platform.Version as number) >= 29) {
      try {
        const bgGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          {
            title: 'إذن الموقع في الخلفية',
            message: 'يتطلب التطبيق الوصول إلى الموقع في الخلفية حتى يستمر التتبع عند إغلاق الشاشة أو مغادرة التطبيق',
            buttonPositive: 'السماح طوال الوقت',
            buttonNegative: 'إلغاء',
          }
        );
        background = bgGranted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        background = false;
      }
    } else {
      background = foreground;
    }

    if ((Platform.Version as number) >= 33) {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      } catch {
        // Notification permission optional or user denied
      }
    }

    return { foreground, background };
  } catch (error) {
    console.warn('ensureTrackingPermissions error:', error);
    return { foreground: false, background: false };
  }
}

export interface StartTrackingOptions {
  apiUrl?: string;
  telemetryToken?: string | null;
  shiftId?: string | null;
  deviceId?: string | null;
}

export async function startBackgroundTracking(options: StartTrackingOptions = {}): Promise<boolean> {
  if (!TrackerLocationModule) {
    console.warn('[TrackerLocation] TrackerLocationModule native module is not registered');
    return false;
  }

  const permissions = await ensureTrackingPermissions();
  if (!permissions.foreground) {
    console.warn('[TrackerLocation] Foreground location permission not granted');
    return false;
  }

  try {
    await TrackerLocationModule.startTracking({
      apiUrl: options.apiUrl || 'https://tracker-alpha-puce.vercel.app',
      telemetryToken: options.telemetryToken || null,
      shiftId: options.shiftId || null,
      deviceId: options.deviceId || null,
    });
    return true;
  } catch (error) {
    console.error('[TrackerLocation] Unable to start native tracking service:', error);
    return false;
  }
}

export interface StopTrackingResult {
  drained: boolean;
  remainingCount: number;
}

export async function stopBackgroundTracking(timeoutMs: number = 8000): Promise<StopTrackingResult> {
  if (!TrackerLocationModule) {
    return { drained: true, remainingCount: 0 };
  }

  try {
    return await TrackerLocationModule.stopTracking({ timeoutMs });
  } catch (error) {
    console.warn('[TrackerLocation] Error during stopBackgroundTracking:', error);
    return { drained: false, remainingCount: -1 };
  }
}

export async function getTrackingStatus(): Promise<{ isTracking: boolean; queueSize: number }> {
  if (!TrackerLocationModule) {
    return { isTracking: false, queueSize: 0 };
  }

  try {
    return await TrackerLocationModule.getTrackingStatus();
  } catch {
    return { isTracking: false, queueSize: 0 };
  }
}

export async function getQueuedLocationCount(): Promise<number> {
  if (!TrackerLocationModule) {
    return 0;
  }

  try {
    return await TrackerLocationModule.getQueueSize();
  } catch {
    return 0;
  }
}

export async function updateNativeTelemetryToken(token: string): Promise<boolean> {
  if (!TrackerLocationModule) {
    return false;
  }

  try {
    await TrackerLocationModule.updateTelemetryToken(token);
    return true;
  } catch {
    return false;
  }
}

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
  ageMs?: number;
  timestamp?: number;
}

export async function getCurrentDeviceLocation(timeoutMs = 10000): Promise<DeviceLocationResult | null> {
  if (Platform.OS !== 'android' || !TrackerLocationModule?.getCurrentLocation) {
    return null;
  }

  const permissions = await ensureTrackingPermissions();
  if (!permissions.foreground) {
    console.warn('[TrackerLocation] Permission not granted for getCurrentLocation');
    return null;
  }

  try {
    const loc = await TrackerLocationModule.getCurrentLocation({ timeoutMs });
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: typeof loc.accuracy === 'number' ? loc.accuracy : undefined,
        ageMs: typeof loc.ageMs === 'number' ? loc.ageMs : undefined,
        timestamp: typeof loc.timestamp === 'number' ? loc.timestamp : undefined,
      };
    }
    return null;
  } catch (error) {
    console.warn('[TrackerLocation] getCurrentLocation failed:', error);
    return null;
  }
}
