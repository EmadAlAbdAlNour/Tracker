import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as flushManager from './flushManager';
import type { QueuedLocationPoint } from './flushManager';

vi.mock('@react-native-async-storage/async-storage');
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
}));

function makePoint(overrides: Partial<QueuedLocationPoint> = {}): QueuedLocationPoint {
  return {
    localId: `test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    latitude: 10.5,
    longitude: 20.5,
    accuracy: 5,
    altitude: 100,
    speed: 0,
    heading: 0,
    recordedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    source: 'mobile',
    retryCount: 0,
    nextRetryAt: Date.now(),
    ...overrides,
  };
}

describe('flushManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AsyncStorage.getItem as any).mockResolvedValue(null);
    (AsyncStorage.setItem as any).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('batching', () => {
    it('batches up to 20 points in one request', async () => {
      const points = Array.from({ length: 20 }, () => makePoint());
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ acceptedClientIds: points.map((p) => p.localId) }),
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(20);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toHaveLength(20);
    });

    it('processes more than 20 queued points in multiple batches', async () => {
      const points = Array.from({ length: 45 }, () => makePoint());
      let callCount = 0;

      (AsyncStorage.getItem as any).mockImplementation(() => {
        // First call returns all 45 points; subsequent calls return only failed points
        if (callCount === 0) {
          return Promise.resolve(JSON.stringify(points));
        }
        return Promise.resolve(JSON.stringify([]));
      });

      (AsyncStorage.setItem as any).mockImplementation(() => {
        callCount++;
        return Promise.resolve(undefined);
      });

      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          json: async () => ({ acceptedClientIds: body.map((p: any) => p.clientLocationId) }),
        });
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(20); // Only one batch is sent per flush call
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toHaveLength(20);
    });
  });

  describe('success', () => {
    it('removes accepted points from queue', async () => {
      const point1 = makePoint();
      const point2 = makePoint();
      const points = [point1, point2];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ acceptedClientIds: [point1.localId] }),
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(1);
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].localId).toBe(point2.localId);
    });

    it('preserves unaccepted points when server accepts nothing', async () => {
      const point1 = makePoint();
      const point2 = makePoint();
      const points = [point1, point2];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ acceptedClientIds: [] }),
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(0);
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      expect(savedQueue).toHaveLength(2);
      expect(savedQueue[0].retryCount).toBe(1);
      expect(savedQueue[1].retryCount).toBe(1);
    });

    it('clears duplicate points from queue without retry penalty when returned in duplicateClientIds', async () => {
      const point1 = makePoint();
      const point2 = makePoint();
      const points = [point1, point2];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          acceptedClientIds: [],
          duplicateClientIds: [point1.localId],
        }),
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(1);
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      // point1 was a duplicate -> removed successfully
      // point2 was not in accepted or duplicate -> retained with retry increment
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].localId).toBe(point2.localId);
      expect(savedQueue[0].retryCount).toBe(1);
    });

    it('handles mixed batch of accepted, duplicate, and unaccepted points correctly', async () => {
      const point1 = makePoint();
      const point2 = makePoint();
      const point3 = makePoint();
      const points = [point1, point2, point3];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          acceptedClientIds: [point1.localId],
          duplicateClientIds: [point2.localId],
        }),
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(2);
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      // point1 (accepted) and point2 (duplicate) both drained
      // point3 (unaccepted) preserved
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].localId).toBe(point3.localId);
      expect(savedQueue[0].retryCount).toBe(1);
    });
  });

  describe('failure', () => {
    it('preserves queued points on HTTP failure', async () => {
      const point1 = makePoint();
      const points = [point1];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(0);
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].retryCount).toBe(1);
      expect(savedQueue[0].localId).toBe(point1.localId);
    });

    it('increments retryCount and preserves backoff on HTTP failure', async () => {
      const point1 = makePoint({ retryCount: 0 });
      const points = [point1];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await flushManager.flushQueuedLocations('http://api.local', 'token123');

      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      expect(savedQueue[0].retryCount).toBe(1);
      expect(savedQueue[0].nextRetryAt).toBeGreaterThan(Date.now());
    });

    it('preserves queued points on network error', async () => {
      const point1 = makePoint();
      const points = [point1];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(0);
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].retryCount).toBe(1);
    });

    it('discards queued points when server returns 409 (shift not active) to prevent queue jam', async () => {
      const point1 = makePoint();
      const points = [point1];

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(points));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(0);
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      // Should have discarded the point
      expect(savedQueue).toHaveLength(0);
    });
  });

  describe('auth refresh on 401', () => {
    it('automatically refreshes token on 401 and retries flush', async () => {
      const point = makePoint();
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify([point]));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      const SecureStore = await import('expo-secure-store');
      (SecureStore as any).getItemAsync = vi.fn().mockResolvedValue(
        JSON.stringify({ accessToken: 'expired-token', refreshToken: 'valid-refresh' }),
      );
      (SecureStore as any).setItemAsync = vi.fn().mockResolvedValue(undefined);

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('/api/auth/refresh')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
          });
        }
        if (callCount === 1) {
          // First flush call returns 401
          return Promise.resolve({ ok: false, status: 401 });
        }
        // Second flush call with new token succeeds
        return Promise.resolve({
          ok: true,
          json: async () => ({ acceptedClientIds: [point.localId] }),
        });
      });

      const result = await flushManager.flushQueuedLocationsGuarded('http://api.local');

      expect(result).toBe(1);
      expect((SecureStore as any).setItemAsync).toHaveBeenCalledWith(
        'tracker_driver_session',
        expect.stringContaining('new-access'),
      );
    });
  });

  describe('single-flight', () => {
    it('only one flush runs at a time when guarded flush is called concurrently', async () => {
      const point1 = makePoint();
      const points = [point1];

      let getItemCallCount = 0;
      (AsyncStorage.getItem as any).mockImplementation(() => {
        getItemCallCount++;
        return Promise.resolve(JSON.stringify(points));
      });

      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ acceptedClientIds: [point1.localId] }),
        });
      });

      // Mock SecureStore to return a valid session
      const SecureStore = await import('expo-secure-store');
      (SecureStore as any).getItemAsync = vi.fn().mockResolvedValue(JSON.stringify({ accessToken: 'token123' }));

      // Simulate two simultaneous calls to flushQueuedLocationsGuarded
      const promises = [
        flushManager.flushQueuedLocationsGuarded('http://api.local'),
        flushManager.flushQueuedLocationsGuarded('http://api.local'),
      ];

      const results = await Promise.all(promises);

      // Only one should actually flush (return 1), the other should return 0 due to guard
      expect(results[0] + results[1]).toBe(1);
      expect(fetchCallCount).toBe(1); // Only one network request
    });
  });

  describe('queue cap', () => {
    it('enforces MAX_QUEUE_SIZE and preserves newest points', async () => {
      const oldPoints = Array.from({ length: flushManager.MAX_QUEUE_SIZE }, (_, i) =>
        makePoint({
          localId: `old-${i}`,
          createdAt: new Date(Date.now() - 10000).toISOString(),
        }),
      );

      const newPoints = Array.from({ length: 50 }, (_, i) =>
        makePoint({
          localId: `new-${i}`,
          createdAt: new Date(Date.now()).toISOString(),
        }),
      );

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(oldPoints));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      await flushManager.pushQueuedPoints(newPoints);

      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);

      expect(savedQueue).toHaveLength(flushManager.MAX_QUEUE_SIZE);
      // Verify newest points are preserved by checking localIds
      const savedIds = new Set(savedQueue.map((p: any) => p.localId));
      // All new points should be included
      for (let i = 0; i < 50; i++) {
        expect(savedIds.has(`new-${i}`)).toBe(true);
      }
    });

    it('exactly preserves MAX_QUEUE_SIZE after cap enforcement', async () => {
      const points = Array.from({ length: 1500 }, () => makePoint());

      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify([]));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      await flushManager.pushQueuedPoints(points);

      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);

      expect(savedQueue).toHaveLength(flushManager.MAX_QUEUE_SIZE);
    });
  });

  describe('reconnect', () => {
    it('reconnect-triggered flush does not create concurrent flushes', async () => {
      const point1 = makePoint();
      const points = [point1];

      let asyncStorageCallCount = 0;
      (AsyncStorage.getItem as any).mockImplementation(() => {
        asyncStorageCallCount++;
        return Promise.resolve(JSON.stringify(points));
      });

      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ acceptedClientIds: [point1.localId] }),
        });
      });

      // Mock SecureStore
      const SecureStore = await import('expo-secure-store');
      (SecureStore as any).getItemAsync = vi.fn().mockResolvedValue(JSON.stringify({ accessToken: 'token123' }));

      // Simulate multiple reconnect events firing simultaneously
      const flushPromises = [
        flushManager.flushQueuedLocationsGuarded('http://api.local'),
        flushManager.flushQueuedLocationsGuarded('http://api.local'),
        flushManager.flushQueuedLocationsGuarded('http://api.local'),
      ];

      const results = await Promise.all(flushPromises);

      // Only one flush should succeed, others should return 0 (guarded)
      const successCount = results.filter((r) => r > 0).length;
      expect(successCount).toBe(1);
      expect(fetchCallCount).toBe(1); // Only one network request despite three simultaneous calls
    });
  });

  describe('concurrency & in-flight queue preservation', () => {
    let memoryStore: string | null = null;

    beforeEach(() => {
      memoryStore = null;
      (AsyncStorage.getItem as any).mockImplementation(() => Promise.resolve(memoryStore));
      (AsyncStorage.setItem as any).mockImplementation((_k: string, v: string) => {
        memoryStore = v;
        return Promise.resolve();
      });
    });

    it('Test 1: preserves Point B when enqueued while Point A request is in-flight', async () => {
      const pointA = makePoint({ localId: 'point-A' });
      const pointB = makePoint({ localId: 'point-B' });

      // Initial queue has Point A
      memoryStore = JSON.stringify([pointA]);

      // When fetch starts, simulate background GPS task pushing Point B into AsyncStorage
      global.fetch = vi.fn().mockImplementation(async () => {
        // Enqueue Point B while network request is in flight
        await flushManager.pushQueuedPoints([pointB]);
        return {
          ok: true,
          json: async () => ({ acceptedClientIds: ['point-A'] }),
        };
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(1);
      // Point B MUST still exist in queue!
      const remainingQueue = JSON.parse(memoryStore!);
      expect(remainingQueue).toHaveLength(1);
      expect(remainingQueue[0].localId).toBe('point-B');
    });

    it('Test 2: preserves multiple points (B, C) arriving during an in-flight request', async () => {
      const pointA = makePoint({ localId: 'point-A' });
      const pointB = makePoint({ localId: 'point-B' });
      const pointC = makePoint({ localId: 'point-C' });

      memoryStore = JSON.stringify([pointA]);

      global.fetch = vi.fn().mockImplementation(async () => {
        // Points B and C arrive while request is pending
        await flushManager.pushQueuedPoints([pointB]);
        await flushManager.pushQueuedPoints([pointC]);
        return {
          ok: true,
          json: async () => ({ acceptedClientIds: ['point-A'] }),
        };
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(1);
      const remainingQueue = JSON.parse(memoryStore!);
      expect(remainingQueue).toHaveLength(2);
      expect(remainingQueue.map((p: any) => p.localId)).toEqual(['point-B', 'point-C']);
    });

    it('Test 3: Point A succeeds as duplicate while Point B arrives during request', async () => {
      const pointA = makePoint({ localId: 'point-A' });
      const pointB = makePoint({ localId: 'point-B' });

      memoryStore = JSON.stringify([pointA]);

      global.fetch = vi.fn().mockImplementation(async () => {
        await flushManager.pushQueuedPoints([pointB]);
        return {
          ok: true,
          json: async () => ({
            acceptedClientIds: [],
            duplicateClientIds: ['point-A'],
          }),
        };
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(1);
      const remainingQueue = JSON.parse(memoryStore!);
      // Point A removed (acknowledged as duplicate), Point B preserved
      expect(remainingQueue).toHaveLength(1);
      expect(remainingQueue[0].localId).toBe('point-B');
    });

    it('Test 4: Network failure preserves both in-flight and existing points', async () => {
      const pointA = makePoint({ localId: 'point-A' });
      const pointB = makePoint({ localId: 'point-B' });

      memoryStore = JSON.stringify([pointA]);

      global.fetch = vi.fn().mockImplementation(async () => {
        await flushManager.pushQueuedPoints([pointB]);
        throw new Error('Network timeout or connection dropped');
      });

      const result = await flushManager.flushQueuedLocations('http://api.local', 'token123');

      expect(result).toBe(0);
      const remainingQueue = JSON.parse(memoryStore!);
      // Both points must be safely in the queue
      expect(remainingQueue).toHaveLength(2);
      const ids = remainingQueue.map((p: any) => p.localId);
      expect(ids).toContain('point-A');
      expect(ids).toContain('point-B');
      // Point A should have retryCount incremented
      const pointARef = remainingQueue.find((p: any) => p.localId === 'point-A');
      expect(pointARef.retryCount).toBe(1);
      // Point B (in-flight) should retain retryCount 0
      const pointBRef = remainingQueue.find((p: any) => p.localId === 'point-B');
      expect(pointBRef.retryCount).toBe(0);
    });

    it('Test 5: Concurrent push and flush operations do not lose points', async () => {
      const initialPoints = [makePoint({ localId: 'init-1' }), makePoint({ localId: 'init-2' })];
      memoryStore = JSON.stringify(initialPoints);

      global.fetch = vi.fn().mockImplementation(async () => {
        // Simulate network latency
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          ok: true,
          json: async () => ({ acceptedClientIds: ['init-1', 'init-2'] }),
        };
      });

      // Concurrently push 5 points while flush runs
      const pushPromises = Array.from({ length: 5 }, (_, i) =>
        flushManager.pushQueuedPoints([makePoint({ localId: `concurrent-${i}` })])
      );

      const [flushResult] = await Promise.all([
        flushManager.flushQueuedLocations('http://api.local', 'token123'),
        ...pushPromises,
      ]);

      expect(flushResult).toBe(2);
      const finalQueue = JSON.parse(memoryStore!);
      // All 5 concurrently pushed points must be intact!
      expect(finalQueue).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(finalQueue.some((p: any) => p.localId === `concurrent-${i}`)).toBe(true);
      }
    });
  });

  describe('network timeout & mutex safety', () => {
    it('handles AbortError timeout gracefully without losing points or locking mutex', async () => {
      const point1 = makePoint({ localId: 'point-timeout' });
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify([point1]));
      (AsyncStorage.setItem as any).mockResolvedValue(undefined);

      global.fetch = vi.fn().mockImplementation(() => {
        const err: any = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const SecureStore = await import('expo-secure-store');
      (SecureStore as any).getItemAsync = vi.fn().mockResolvedValue(JSON.stringify({ accessToken: 'token123' }));

      const result = await flushManager.flushQueuedLocationsGuarded('http://api.local');

      expect(result).toBe(0);
      expect(flushManager.isFlushing()).toBe(false); // Mutex released!
      const setCall = (AsyncStorage.setItem as any).mock.calls[0];
      const savedQueue = JSON.parse(setCall[1]);
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].retryCount).toBe(1);
    });

    it('always releases flushing mutex on 401, 500, network error, and unexpected exceptions', async () => {
      const SecureStore = await import('expo-secure-store');
      (SecureStore as any).getItemAsync = vi.fn().mockResolvedValue(JSON.stringify({ accessToken: 'token123' }));

      // Case 1: 500 server error
      (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify([makePoint()]));
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      await flushManager.flushQueuedLocationsGuarded('http://api.local');
      expect(flushManager.isFlushing()).toBe(false);

      // Case 2: Network exception
      global.fetch = vi.fn().mockRejectedValue(new Error('Fatal socket failure'));
      await flushManager.flushQueuedLocationsGuarded('http://api.local');
      expect(flushManager.isFlushing()).toBe(false);

      // Case 3: Successful request
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ acceptedClientIds: [] }),
      });
      await flushManager.flushQueuedLocationsGuarded('http://api.local');
      expect(flushManager.isFlushing()).toBe(false);
    });
  });
});
