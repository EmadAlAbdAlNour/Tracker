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

let flushing = false;

// guarded single-flight flush that reads auth session internally to ensure fresh token
export async function flushQueuedLocationsGuarded(apiBaseUrl: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    const SecureStore = await import('expo-secure-store');
    const SESSION_KEY = 'tracker_driver_session';
    const value = await (SecureStore as any).getItemAsync(SESSION_KEY);
    if (!value) return 0;
    const session = JSON.parse(value) as any;
    if (!session?.accessToken) return 0;
    return await flushQueuedLocations(apiBaseUrl, session.accessToken);
  } finally {
    flushing = false;
  }
}

// primitive batch flush: sends up to 20 points in a single request
export async function flushQueuedLocations(apiBaseUrl: string, accessToken: string): Promise<number> {
  const queue = await readQueue();
  const eligible = queue.filter((p) => p.nextRetryAt <= Date.now());
  if (!eligible.length) return 0;

  // take up to 20 points
  const batch = eligible.slice(0, 20);

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
  }));

  try {
    const response = await fetch(`${apiBaseUrl}/api/drivers/me/location/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // preserve batch with increased retry
      const failed = batch.map((point) => ({ ...point, retryCount: point.retryCount + 1, nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1) }));
      const batchIds = new Set(batch.map((p) => p.localId));
      const persisted = queue.filter((p) => !batchIds.has(p.localId)).concat(failed);
      await writeQueue(persisted);
      return 0;
    }

    const body = await response.json();
    const acceptedClientIds: string[] = Array.isArray(body.acceptedClientIds) ? body.acceptedClientIds : [];

    const failedPoints: QueuedLocationPoint[] = [];

    for (const point of batch) {
      if (!acceptedClientIds.includes(point.localId)) {
        // point not accepted -> keep with retry inc
        failedPoints.push({ ...point, retryCount: point.retryCount + 1, nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1) });
      }
    }

    const batchIds = new Set(batch.map((p) => p.localId));
    const persisted = queue.filter((p) => !batchIds.has(p.localId)).concat(failedPoints);
    await writeQueue(persisted);

    return acceptedClientIds.length;
  } catch (err) {
    // network error: keep batch with increased retry
    const failed = batch.map((point) => ({ ...point, retryCount: point.retryCount + 1, nextRetryAt: Date.now() + getRetryDelayMs(point.retryCount + 1) }));
    const batchIds = new Set(batch.map((p) => p.localId));
    const q = await readQueue();
    const persisted = q.filter((p) => !batchIds.has(p.localId)).concat(failed);
    await writeQueue(persisted);
    return 0;
  }
}

export async function readQueuedPoints(): Promise<QueuedLocationPoint[]> {
  return readQueue();
}

export async function pushQueuedPoints(points: QueuedLocationPoint[]): Promise<void> {
  const current = await readQueue();
  const next = [...current, ...points];
  // enforce queue cap by preserving newest points (drop oldest)
  if (next.length > MAX_QUEUE_SIZE) {
    const toKeep = next.slice(next.length - MAX_QUEUE_SIZE);
    await writeQueue(toKeep);
  } else {
    await writeQueue(next);
  }
}
