process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/tracker_test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock('@workspace/db', () => {
  return {
    db: {
      select: () => mockSelect(),
      update: () => mockUpdate(),
      insert: () => mockInsert(),
    },
    shiftsTable: { id: 'id', driverId: 'driver_id', startedAt: 'started_at', status: 'status' },
    driversTable: { id: 'id', userId: 'user_id' },
    usersTable: { id: 'id', name: 'name' },
    devicesTable: { driverId: 'driver_id', lastSeen: 'last_seen', updatedAt: 'updated_at' },
    locationPointsTable: { driverId: 'driver_id', recordedAt: 'recorded_at' },
    alertStateTable: { id: 'id', driverId: 'driver_id', alertType: 'alert_type', resolvedAt: 'resolved_at' },
    notificationsTable: { id: 'id' },
  };
});

vi.mock('./services/settingsService', () => {
  return {
    getAlertSettings: vi.fn().mockResolvedValue({
      offlineAlertEnabled: true,
      stopAlertEnabled: true,
      offlineGraceMinutes: 5,
      maxStopDurationMinutes: 10,
    }),
    getRestaurantSettings: vi.fn().mockResolvedValue({
      enabled: true,
      latitude: 24.7136,
      longitude: 46.6753,
      radiusMeters: 150,
      name: 'Main Branch',
    }),
  };
});

const mockCreateNotification = vi.fn().mockResolvedValue({ id: 'notif-offline-1' });
vi.mock('./services/notificationService', () => {
  return {
    createNotification: (input: any) => mockCreateNotification(input),
  };
});

import { evaluateAllActiveDriverAlerts, startAlertEvaluationScheduler, stopAlertEvaluationScheduler } from './services/alertService';

describe('Proactive Alert Evaluation Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopAlertEvaluationScheduler();
  });

  it('completes gracefully when no active shifts exist', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    });

    await expect(evaluateAllActiveDriverAlerts()).resolves.toBeUndefined();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('proactively triggers offline alert for an active driver who stopped reporting', async () => {
    const driverId = 'driver-uuid-1';
    const shiftId = 'shift-uuid-1';

    // 1. Return 1 active shift
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        {
          shiftId,
          driverId,
          startedAt: new Date(Date.now() - 3600000),
          userName: 'أحمد السائق',
        },
      ]),
    });

    // 2. Return device with lastSeen 15 minutes ago (offline grace = 5 min)
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          lastSeen: new Date(Date.now() - 15 * 60 * 1000),
        },
      ]),
    });

    // 3. Return location with older recordedAt
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    // 4. getAlertState inside evaluateDriverOfflineAlert (no active alert yet)
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    // 5. updateAlertState -> check existing
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });

    // Insert alertState
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue([]),
    });

    await evaluateAllActiveDriverAlerts();

    expect(mockSelect).toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DRIVER_OFFLINE',
        driverId,
        shiftId,
      }),
    );
  });

  it('can start and stop scheduler without throwing', () => {
    expect(() => startAlertEvaluationScheduler(10000)).not.toThrow();
    expect(() => stopAlertEvaluationScheduler()).not.toThrow();
  });
});

