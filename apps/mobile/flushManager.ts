import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_QUEUE_KEY = 'tracker_driver_location_queue';
export const MAX_QUEUE_SIZE = 1000; // Conservative cap: preserve newest points, prune oldest when exceeded

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
  batteryPercentage?: number | null;
  isCharging?: boolean | null;
  locationServicesEnabled?: boolean | null;
  networkStatus?: string | null;
};

function readQueue(): Promise<QueuedLocationPoint[]> {
  return AsyncStorage.getItem(LOCATION_QUEUE_KEY).then((v) => {
    if (!v) return [];
    try {
      const parsed = JSON.parse(v) as QueuedLocationPoint[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((it) => ({ ...it, retryCount: it.retryCount ?? 0, nextRetryAt: it.nextRetryAt ?? Date.now() }));
    } catch {
      return [];
    }
  });
}

function writeQueue(items: QueuedLocationPoint[]): Promise<void> {
  return AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(items));
}

function getRetryDelayMs(retryCount: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, retryCount));
}

let queueLock: Promise<any> = Promise.resolve();

// Shared async mutex for serializing read-modify-write queue operations
export function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueLock.then(fn, fn);
  queueLock = next.then(() => {}, () => {});
  return next;
}

let flushing = false;

export function isFlushing(): boolean {
  return flushing;
}

// guarded single-flight flush that reads auth session internally to ensure fresh token
export async function flushQueuedLocationsGuarded(apiBaseUrl?: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    let targetUrl: string = apiBaseUrl || '';
    if (!targetUrl) {
      try {
        const sessionModule = await import('./session');
        targetUrl = sessionModule.API_URL || 'https://tracker-alpha-puce.vercel.app';
      } catch {
        targetUrl = 'https://tracker-alpha-puce.vercel.app';
      }
    }

    const SecureStore = await import('expo-secure-store');
    const SESSION_KEY = 'tracker_driver_session';
    const value = await (SecureStore as any).getItemAsync(SESSION_KEY);
    if (!value) return 0;
    const session = JSON.parse(value) as any;
    if (!session?.accessToken) return 0;

    let flushed = await flushQueuedLocations(targetUrl, session.accessToken);
    // If response was 401 unauthorized (-1), attempt refresh and retry
    if (flushed === -1 && session.refreshToken) {
      try {
        const refreshResp = await fetch(`${targetUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (refreshResp.ok) {
          const newTokens = await refreshResp.json();
          const updatedSession = {
            ...session,
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
          };
          await (SecureStore as any).setItemAsync(SESSION_KEY, JSON.stringify(updatedSession));
          flushed = await flushQueuedLocations(targetUrl, updatedSession.accessToken);
        }
      } catch {
        // Refresh failed
      }
    }
    return Math.max(0, flushed);
  } finally {
    flushing = false;
  }
}

// primitive batch flush: sends up to 20 points in a single request with AbortController timeout and queue serialization
export async function flushQueuedLocations(apiBaseUrl: string, accessToken: string): Promise<number> {
  // Step 1: Select batch under queue lock (do NOT hold lock during network request!)
  const batch = await withQueueLock(async () => {
    const queue = await readQueue();
    const eligible = queue.filter((p) => p.nextRetryAt <= Date.now());
    if (!eligible.length) return [];
    return eligible.slice(0, 20);
  });

  if (!batch.length) return 0;

  const payload = batch.map((point) => ({
    clientLocationId: point.localId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy,
    altitude: point.altitude,
    speed: point.speed,
    heading: point.heading,
    recordedAt: point.recordedAt,
    source: point.source,
    batteryPercentage: point.batteryPercentage ?? null,
    isCharging: point.isCharging ?? null,
    locationServicesEnabled: point.locationServicesEnabled ?? null,
    networkStatus: point.networkStatus ?? null,
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10_000);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/drivers/me/location/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    // Network error or timeout (AbortError): acquire lock and update retry state on CURRENT queue
    await withQueueLock(async () => {
      const currentQueue = await readQueue();
      const batchIds = new Set(batch.map((p) => p.localId));

      const updatedQueue = currentQueue
        .map((point) => {
          if (!batchIds.has(point.localId)) {
            // Point added while fetch was in flight -> preserved!
            return point;
          }
          if (point.retryCount >= 8) {
            return null; // drop after 8 retries
          }
          return {
            ...point,
            retryCount: point.retryCount + 1,
            nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1),
          };
        })
        .filter((p): p is QueuedLocationPoint => p !== null);

      await writeQueue(updatedQueue);
    });
    return 0;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401) {
      return -1;
    }

    await withQueueLock(async () => {
      const currentQueue = await readQueue();
      const batchIds = new Set(batch.map((p) => p.localId));

      if (response.status === 409 || response.status === 403) {
        // Shift not active or device unauthorized: discard stale points to prevent eternal queue jamming
        const updatedQueue = currentQueue.filter((p) => !batchIds.has(p.localId));
        await writeQueue(updatedQueue);
        return;
      }

      // 500 or other HTTP errors: increment retry count on batch points only
      const updatedQueue = currentQueue
        .map((point) => {
          if (!batchIds.has(point.localId)) {
            return point; // points added while fetch was in flight are preserved!
          }
          if (point.retryCount >= 8) {
            return null;
          }
          return {
            ...point,
            retryCount: point.retryCount + 1,
            nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1),
          };
        })
        .filter((p): p is QueuedLocationPoint => p !== null);

      await writeQueue(updatedQueue);
    });
    return 0;
  }

  const body = await response.json().catch(() => ({}));
  const acceptedClientIds: string[] = Array.isArray(body.acceptedClientIds) ? body.acceptedClientIds : [];
  const duplicateClientIds: string[] = Array.isArray(body.duplicateClientIds) ? body.duplicateClientIds : [];
  const successClientIds = new Set([...acceptedClientIds, ...duplicateClientIds]);

  await withQueueLock(async () => {
    const currentQueue = await readQueue();
    const batchIds = new Set(batch.map((p) => p.localId));

    const updatedQueue = currentQueue
      .map((point) => {
        if (!batchIds.has(point.localId)) {
          // Point was added while request was in flight -> PRESERVE!
          return point;
        }
        if (successClientIds.has(point.localId)) {
          // Successfully accepted or duplicate in DB -> REMOVE!
          return null;
        }
        // In batch but not acknowledged by server -> keep with retry inc if under 8 retries
        if (point.retryCount < 8) {
          return {
            ...point,
            retryCount: point.retryCount + 1,
            nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1),
          };
        }
        return null;
      })
      .filter((p): p is QueuedLocationPoint => p !== null);

    await writeQueue(updatedQueue);
  });

  return successClientIds.size;
}

export async function readQueuedPoints(): Promise<QueuedLocationPoint[]> {
  return withQueueLock(() => readQueue());
}

export async function pushQueuedPoints(points: QueuedLocationPoint[]): Promise<void> {
  if (!points || !points.length) return;
  return withQueueLock(async () => {
    const current = await readQueue();
    const next = [...current, ...points];
    // enforce queue cap by preserving newest points (drop oldest)
    if (next.length > MAX_QUEUE_SIZE) {
      const toKeep = next.slice(next.length - MAX_QUEUE_SIZE);
      await writeQueue(toKeep);
    } else {
      await writeQueue(next);
    }
  });
}
