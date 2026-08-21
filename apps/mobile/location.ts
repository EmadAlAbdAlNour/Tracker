import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

export const LOCATION_TASK_NAME = 'tracker-driver-location-task';
export const LOCATION_QUEUE_KEY = 'tracker_driver_location_queue';
export const DEFAULT_LOCATION_INTERVAL_MS = Number(process.env.EXPO_PUBLIC_LOCATION_INTERVAL_MS ?? '20000');
export const DEFAULT_LOCATION_DISTANCE_METERS = Number(process.env.EXPO_PUBLIC_LOCATION_DISTANCE_METERS ?? '25');

export type QueuedLocationPoint = {
  localId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
  createdAt: string;
  source: string;
  retryCount: number;
  nextRetryAt: number;
};

async function readQueue(): Promise<QueuedLocationPoint[]> {
  try {
    const value = await SecureStore.getItemAsync(LOCATION_QUEUE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as QueuedLocationPoint[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      retryCount: item.retryCount ?? 0,
      nextRetryAt: item.nextRetryAt ?? Date.now(),
    }));
  } catch (error) {
    console.warn('Unable to read queued location points', error);
    return [];
  }
}

async function writeQueue(items: QueuedLocationPoint[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(LOCATION_QUEUE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Unable to persist queued location points', error);
  }
}

export function getRetryDelayMs(retryCount: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, retryCount));
}

export async function enqueueLocationPoint(payload: Omit<QueuedLocationPoint, 'retryCount' | 'nextRetryAt' | 'localId' | 'createdAt'> & { localId?: string; createdAt?: string }): Promise<QueuedLocationPoint[]> {
  const queue = await readQueue();
  const item: QueuedLocationPoint = {
    localId: payload.localId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: payload.accuracy,
    altitude: payload.altitude,
    speed: payload.speed,
    heading: payload.heading,
    recordedAt: payload.recordedAt,
    createdAt: payload.createdAt ?? new Date().toISOString(),
    source: payload.source,
    retryCount: 0,
    nextRetryAt: Date.now(),
  };

  const nextQueue = [...queue, item];
  await writeQueue(nextQueue);
  return nextQueue;
}

export async function getQueuedLocationCount(): Promise<number> {
  return (await readQueue()).length;
}

export function registerBackgroundLocationTask(): void {
  if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
    return;
  }

  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    if (error) {
      console.warn('Location task error', error);
      return;
    }

    const items = Array.isArray(data?.locations) ? data.locations : [];
    if (!items.length) {
      return;
    }

    const queue = await readQueue();
    const nextQueue = [...queue];

    for (const item of items) {
      const timestamp = item?.timestamp ?? Date.now();
      nextQueue.push({
        localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        latitude: Number(item?.coords?.latitude ?? 0),
        longitude: Number(item?.coords?.longitude ?? 0),
        accuracy: item?.coords?.accuracy ?? null,
        altitude: item?.coords?.altitude ?? null,
        speed: item?.coords?.speed ?? null,
        heading: item?.coords?.heading ?? null,
        recordedAt: new Date(timestamp).toISOString(),
        createdAt: new Date().toISOString(),
        source: 'mobile',
        retryCount: 0,
        nextRetryAt: Date.now(),
      });
    }

    await writeQueue(nextQueue);
  });
}

export async function ensureTrackingPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  const background = await Location.requestBackgroundPermissionsAsync();
  return {
    foreground: foreground.status === 'granted',
    background: background.status === 'granted',
  };
}

export async function startBackgroundTracking(): Promise<boolean> {
  const serviceStatus = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (serviceStatus) return true;

  const permissionResult = await ensureTrackingPermissions();
  if (!permissionResult.foreground) {
    return false;
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: DEFAULT_LOCATION_INTERVAL_MS,
      distanceInterval: DEFAULT_LOCATION_DISTANCE_METERS,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Tracker Driver',
        notificationBody: 'تتبع الموقع نشط',
      },
    });
    return true;
  } catch (error) {
    console.warn('Unable to start background tracking', error);
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch (error) {
    console.warn('Unable to stop background tracking', error);
  }
}

export async function flushQueuedLocations(apiBaseUrl: string, accessToken: string): Promise<number> {
  const queue = await readQueue();
  const eligible = queue.filter((point) => point.nextRetryAt <= Date.now());
  if (!eligible.length) {
    return 0;
  }

  const remaining: QueuedLocationPoint[] = [];

  for (const point of eligible) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/drivers/me/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          clientLocationId: point.localId,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
          altitude: point.altitude,
          speed: point.speed,
          heading: point.heading,
          recordedAt: point.recordedAt,
          source: point.source,
        }),
      });

      if (!response.ok) {
        remaining.push({
          ...point,
          retryCount: point.retryCount + 1,
          nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1),
        });
      }
    } catch (error) {
      console.warn('Queued location upload failed', error);
      remaining.push({
        ...point,
        retryCount: point.retryCount + 1,
        nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1),
      });
    }
  }

  const remainingSet = new Set(remaining.map((point) => point.localId));
  const persisted = queue
    .filter((point) => !remainingSet.has(point.localId))
    .concat(remaining);

  await writeQueue(persisted);
  return eligible.length - remaining.length;
}
