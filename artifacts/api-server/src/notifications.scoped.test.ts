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

import { listNotifications, markNotificationAsRead, markAllNotificationsAsRead } from './services/notificationService';

describe('User-Scoped Notifications Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

