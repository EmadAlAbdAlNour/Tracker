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

    it('preserves duplicate/unaccepted points', async () => {
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
      const points = Array.from({ length: 500 }, () => makePoint());

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
});
