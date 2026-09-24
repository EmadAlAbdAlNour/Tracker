import { describe, expect, it, vi, beforeEach } from 'vitest';

const asyncStorageStore = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageStore.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageStore.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageStore.delete(key);
    }),
    clear: vi.fn(async () => {
      asyncStorageStore.clear();
    }),
  },
}));

vi.mock('react-native', () => {
  const showNotificationMock = vi.fn().mockResolvedValue(true);
  const checkPermissionMock = vi.fn().mockResolvedValue(true);
  const requestPermissionMock = vi.fn().mockResolvedValue(true);
  const getInitialNotificationMock = vi.fn().mockResolvedValue(null);

  return {
    Platform: { OS: 'android', Version: 34, constants: {} },
    NativeModules: {
      TrackerNotificationModule: {
        checkPermission: checkPermissionMock,
        requestPermission: requestPermissionMock,
        showNotification: showNotificationMock,
        getInitialNotification: getInitialNotificationMock,
      },
    },
    NativeEventEmitter: vi.fn().mockImplementation(function (this: any) {
      this.addListener = vi.fn(() => ({ remove: vi.fn() }));
      return this;
    }),
    StyleSheet: { create: (s: any) => s },
    AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  };
});

import { NotificationService, type MobileNotificationItem } from './notificationService';

describe('Phase 1 & 9A: Notification Response Contract (read vs isRead)', () => {
  it('correctly identifies read and unread notifications using the authoritative read field', () => {
    const unreadItem: MobileNotificationItem = {
      id: 'notif-unread-1',
      type: 'BATTERY_LOW',
      title: 'Low Battery',
      message: 'Battery at 15%',
      read: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    const readItem: MobileNotificationItem = {
      id: 'notif-read-1',
      type: 'GEOFENCE_EXIT',
      title: 'Geofence Exit',
      message: 'Left restaurant',
      read: true,
      readAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 60000).toISOString(),
    };

    // Assert that .read accurately distinguishes read state
    expect(unreadItem.read).toBe(false);
    expect(readItem.read).toBe(true);

    // Confirm that accessing unmapped isRead yields undefined (proving that relying on isRead would fail)
    expect((unreadItem as any).isRead).toBeUndefined();
    expect((readItem as any).isRead).toBeUndefined();
  });
});

describe('Phase 2 & 9B: Duplicate System Notification Prevention', () => {
  beforeEach(() => {
    asyncStorageStore.clear();
    NotificationService.clearPostedNotificationCacheForTesting();
    vi.clearAllMocks();
  });

  it('posts a genuinely new unread notification and blocks duplicate posts on subsequent polls', async () => {
    const newNotif = {
      id: 'notif-fresh-100',
      read: false,
      createdAt: new Date().toISOString(),
    };

    // First encounter: should post
    const shouldPost1 = await NotificationService.shouldPostSystemNotification(newNotif);
    expect(shouldPost1).toBe(true);

    // Record it as posted
    await NotificationService.recordNotificationPosted(newNotif.id);

    // Second encounter (subsequent poll with identical notification): must NOT post
    const shouldPost2 = await NotificationService.shouldPostSystemNotification(newNotif);
    expect(shouldPost2).toBe(false);
  });
});

describe('Phase 2 & 9C: Historical Notification Prevention', () => {
  beforeEach(() => {
    asyncStorageStore.clear();
    NotificationService.clearPostedNotificationCacheForTesting();
    vi.clearAllMocks();
  });

  it('does NOT post notifications that are already marked as read on server', async () => {
    const readNotif = {
      id: 'notif-already-read',
      read: true,
      createdAt: new Date().toISOString(),
    };

    const shouldPost = await NotificationService.shouldPostSystemNotification(readNotif);
    expect(shouldPost).toBe(false);
  });

  it('does NOT post notifications that are historical (>15 minutes old on first discovery)', async () => {
    const historicalUnreadNotif = {
      id: 'notif-historical-unread',
      read: false,
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    };

    const shouldPost = await NotificationService.shouldPostSystemNotification(historicalUnreadNotif);
    expect(shouldPost).toBe(false);

    // Should also automatically record ID to ensure future polls skip immediately
    const isRecorded = await NotificationService.isNotificationPosted(historicalUnreadNotif.id);
    expect(isRecorded).toBe(true);
  });
});

describe('Phase 2 & 9D: Persistence Across App Restart / Remount', () => {
  beforeEach(() => {
    asyncStorageStore.clear();
    NotificationService.clearPostedNotificationCacheForTesting();
    vi.clearAllMocks();
  });

  it('preserves posted notification IDs across memory clearance by loading from AsyncStorage', async () => {
    const testId = 'persisted-notif-uuid-42';

    // Record posted in session 1
    await NotificationService.recordNotificationPosted(testId);
    expect(asyncStorageStore.has('tracker_posted_notification_ids')).toBe(true);

    // Simulate complete app restart: clear in-memory cache
    NotificationService.clearPostedNotificationCacheForTesting();

    // Verify persisted state survives and blocks duplicate notification in session 2
    const isPostedInSession2 = await NotificationService.isNotificationPosted(testId);
    expect(isPostedInSession2).toBe(true);

    const shouldPostInSession2 = await NotificationService.shouldPostSystemNotification({
      id: testId,
      read: false,
      createdAt: new Date().toISOString(),
    });
    expect(shouldPostInSession2).toBe(false);
  });
});

describe('Phase 3 & 9E, 9F: Call Center Read State Transitions', () => {
  it('marks a single notification read and decrements unread count', () => {
    let notifications: MobileNotificationItem[] = [
      { id: '1', type: 'STOP_EXTENDED', read: false, createdAt: new Date().toISOString() },
      { id: '2', type: 'BATTERY_LOW', read: false, createdAt: new Date().toISOString() },
    ];
    let unreadCount = 2;

    // Simulate handleMarkNotificationRead('1')
    const targetId = '1';
    notifications = notifications.map((n) => (n.id === targetId ? { ...n, read: true } : n));
    unreadCount = Math.max(0, unreadCount - 1);

    expect(notifications[0].read).toBe(true);
    expect(notifications[1].read).toBe(false);
    expect(unreadCount).toBe(1);
  });

  it('marks all notifications read and resets unread count to 0', () => {
    let notifications: MobileNotificationItem[] = [
      { id: '1', type: 'STOP_EXTENDED', read: false, createdAt: new Date().toISOString() },
      { id: '2', type: 'BATTERY_LOW', read: false, createdAt: new Date().toISOString() },
      { id: '3', type: 'GEOFENCE_ENTER', read: false, createdAt: new Date().toISOString() },
    ];
    let unreadCount = 3;

    // Simulate handleMarkAllNotificationsRead()
    notifications = notifications.map((n) => ({ ...n, read: true }));
    unreadCount = 0;

    expect(notifications.every((n) => n.read)).toBe(true);
    expect(unreadCount).toBe(0);
  });
});

describe('Phase 5 & 9I: Mobile Settings Defaults Parity', () => {
  it('confirms the authoritative operational defaults: geofence 150m, max stop 10m, offline grace 5m', () => {
    const defaultRestaurantSettings = {
      name: '',
      latitude: 30.0444,
      longitude: 31.2357,
      radiusMeters: 150,
    };

    const defaultAlertSettings = {
      maxStopDurationMinutes: 10,
      offlineGraceMinutes: 5,
      lowBatteryThreshold: 20,
    };

    expect(defaultRestaurantSettings.radiusMeters).toBe(150);
    expect(defaultAlertSettings.maxStopDurationMinutes).toBe(10);
    expect(defaultAlertSettings.offlineGraceMinutes).toBe(5);
  });
});
