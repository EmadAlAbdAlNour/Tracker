process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/tracker_test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB queries for notification reads and notifications
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@workspace/db', () => {
  return {
    db: {
      select: () => mockSelect(),
      insert: () => mockInsert(),
      update: () => mockUpdate(),
    },
    notificationsTable: {
      id: 'id',
      type: 'type',
      read: 'read',
      createdAt: 'created_at',
      driverId: 'driver_id',
    },
    notificationReadsTable: {
      id: 'id',
      notificationId: 'notification_id',
      userId: 'user_id',
      readAt: 'read_at',
    },
  };
});

import { listNotifications, markNotificationAsRead, markAllNotificationsAsRead, resolveNotification } from './services/notificationService';

describe('User-Scoped Notifications Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
  });

  it('lists notifications scoped to a user and reflects read status per user', async () => {
    const userA = 'user-uuid-1111';
    const fakeRows = [
      {
        notification: {
          id: 'notif-1',
          type: 'BATTERY_LOW',
          titleAr: 'بطارية منخفضة',
          titleEn: 'Low Battery',
          messageAr: 'تنبيه',
          messageEn: 'Alert',
          read: false,
        },
        userReadAt: new Date(),
      },
      {
        notification: {
          id: 'notif-2',
          type: 'STOP_EXTENDED',
          titleAr: 'توقف طويل',
          titleEn: 'Extended Stop',
          messageAr: 'تنبيه',
          messageEn: 'Alert',
          read: false,
        },
        userReadAt: null,
      },
    ];

    // Mock chaining for items, total count, unread count
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(fakeRows),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      });

    const res = await listNotifications({ page: 1, limit: 10 }, userA);

    expect(res.total).toBe(2);
    expect(res.unreadCount).toBe(1);
    expect(res.items.length).toBe(2);
    expect(res.items[0].read).toBe(true);
    expect(res.items[1].read).toBe(false);
  });

  it('marks a notification as read for a specific user without affecting legacy table error handling', async () => {
    const userA = 'user-uuid-1111';
    const notifId = 'notif-1';

    const mockOnConflict = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflict,
      }),
    });

    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: notifId, read: true }]),
        }),
      }),
    });

    const updated = await markNotificationAsRead(notifId, userA);
    expect(updated).toBeDefined();
    expect(updated?.id).toBe(notifId);
  });

  it('marks all notifications as read for a user by inserting missing read records', async () => {
    const userB = 'user-uuid-2222';

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: 'notif-2' }, { id: 'notif-3' }]),
    });

    const mockOnConflict = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflict,
      }),
    });

    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const success = await markAllNotificationsAsRead(userB);
    expect(success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
  });

  it('guarantees per-user notification read isolation between users', async () => {
    const userA = 'user-uuid-1111';
    const userB = 'user-uuid-2222';
    const notifId = 'notif-shared-999';

    // Mock User B querying notifications where User A marked it read, but User B has not
    const userBRows = [
      {
        notification: {
          id: notifId,
          type: 'BATTERY_LOW',
          titleAr: 'بطارية منخفضة',
          titleEn: 'Low Battery',
          messageAr: 'تنبيه',
          messageEn: 'Alert',
          read: true, // Legacy global field might be true because User A marked it read
        },
        userReadAt: null, // But User B's join with notificationReadsTable has NO readAt
      },
    ];

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(userBRows),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      });

    const resB = await listNotifications({ page: 1, limit: 10 }, userB);

    // User B's read status MUST be false despite legacy global field being true
    expect(resB.items[0].read).toBe(false);
    expect(resB.unreadCount).toBe(1);
  });

  it('scopes notifications by driverId to ensure driver isolation', async () => {
    const driverId = 'driver-uuid-4444';
    const userId = 'user-uuid-3333';

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });

    const res = await listNotifications({ page: 1, limit: 10, driverId }, userId);
    expect(res.items.length).toBe(0);
    expect(res.total).toBe(0);
  });

  it('resolves an active notification and updates resolved status and timestamps', async () => {
    const notifId = 'notif-alert-123';
    const fakeNotif = {
      id: notifId,
      driverId: 'driver-1',
      type: 'STOP_EXTENDED',
      resolved: false,
      resolvedAt: null,
      read: false,
      readAt: null,
      titleAr: 'توقف مطول',
      messageAr: 'تجاوز الحد',
    };

    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([fakeNotif]),
    });

    const updateChain: any = {};
    updateChain.set = vi.fn().mockReturnValue(updateChain);
    updateChain.where = vi.fn().mockReturnValue(updateChain);
    updateChain.returning = vi.fn().mockResolvedValue([{
      ...fakeNotif,
      resolved: true,
      resolvedAt: new Date(),
      read: true,
      readAt: new Date(),
    }]);
    mockUpdate.mockReturnValueOnce(updateChain);

    const res = await resolveNotification(notifId, 'user-admin-1');
    expect(res).not.toBeNull();
    expect(res?.resolved).toBe(true);
    expect(res?.read).toBe(true);
    expect(res?.title).toBe('توقف مطول');
  });

  it('returns null when attempting to resolve a non-existent notification', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    const res = await resolveNotification('non-existent-id');
    expect(res).toBeNull();
  });
});

