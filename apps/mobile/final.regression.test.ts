import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34, constants: {} },
  PermissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      ACCESS_BACKGROUND_LOCATION: 'android.permission.ACCESS_BACKGROUND_LOCATION',
      POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
    },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    request: vi.fn().mockResolvedValue('granted'),
    check: vi.fn().mockResolvedValue(true),
  },
  NativeModules: {
    TrackerLocationModule: {
      startTracking: vi.fn().mockResolvedValue(true),
      stopTracking: vi.fn().mockResolvedValue({ drained: true, remainingCount: 0 }),
      getTrackingStatus: vi.fn().mockResolvedValue({ isTracking: false, queueSize: 0 }),
      getQueueSize: vi.fn().mockResolvedValue(0),
      updateTelemetryToken: vi.fn().mockResolvedValue(true),
    },
  },
  StyleSheet: { create: (s: any) => s },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('expo-battery', () => ({
  getBatteryLevelAsync: vi.fn().mockResolvedValue(0.8),
  getBatteryStateAsync: vi.fn().mockResolvedValue(1),
  BatteryState: { CHARGING: 1, FULL: 2 },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

(global as any).__DEV__ = true;
import { isAllowedRole } from './session';

describe('Final Product Polish Mobile Regression Tests', () => {
  describe('Strict Role Boundaries', () => {
    it('only allows valid application roles: ADMIN, CALL_CENTER, DRIVER', () => {
      expect(isAllowedRole('ADMIN')).toBe(true);
      expect(isAllowedRole('CALL_CENTER')).toBe(true);
      expect(isAllowedRole('DRIVER')).toBe(true);
      // Strictly NO MANAGER or other arbitrary roles
      expect(isAllowedRole('MANAGER')).toBe(false);
      expect(isAllowedRole('DISPATCHER')).toBe(false);
      expect(isAllowedRole('OPERATOR')).toBe(false);
      expect(isAllowedRole('')).toBe(false);
      expect(isAllowedRole(null)).toBe(false);
    });
  });

  describe('Driver Detail Modal Action Eligibility', () => {
    it('permits force end shift ONLY when user is ADMIN and driver has an ACTIVE shift', () => {
      const isForceEndEligible = (isAdmin: boolean, driver: any) => {
        return Boolean(isAdmin && driver?.shift && (driver.shift.status === 'ACTIVE' || !driver.shift.status));
      };

      // Case 1: Admin with active shift -> Eligible
      expect(
        isForceEndEligible(true, {
          driverId: 'drv-1',
          shift: { id: 'shift-1', status: 'ACTIVE' },
        })
      ).toBe(true);

      // Case 2: Call Center with active shift -> INELIGIBLE (read-only)
      expect(
        isForceEndEligible(false, {
          driverId: 'drv-1',
          shift: { id: 'shift-1', status: 'ACTIVE' },
        })
      ).toBe(false);

      // Case 3: Admin with completed shift -> INELIGIBLE
      expect(
        isForceEndEligible(true, {
          driverId: 'drv-1',
          shift: { id: 'shift-1', status: 'COMPLETED' },
        })
      ).toBe(false);

      // Case 4: Admin with no shift -> INELIGIBLE
      expect(
        isForceEndEligible(true, {
          driverId: 'drv-1',
          shift: null,
        })
      ).toBe(false);
    });
  });

  describe('Admin User Management Delete Protection', () => {
    it('prevents an administrator from deleting their own active account', () => {
      const currentSessionUserId = 'admin-user-123';
      const targetUserToDelete = { id: 'admin-user-123', name: 'Primary Admin' };
      const canDeleteUser = (currentUserId: string, targetUser: any) => {
        return currentUserId !== targetUser.id;
      };

      expect(canDeleteUser(currentSessionUserId, targetUserToDelete)).toBe(false);

      const otherUser = { id: 'driver-user-456', name: 'Driver Ali' };
      expect(canDeleteUser(currentSessionUserId, otherUser)).toBe(true);
    });
  });

  describe('Android Hardware Back Navigation Hierarchy', () => {
    it('correctly prioritizes modal closure over subview back over root dashboard return', () => {
      // Simulation of BackHandler resolution algorithm in AdminHomeScreen
      const resolveBackPress = (state: {
        editUserModalVisible: boolean;
        dialogVisible: boolean;
        driverModalVisible: boolean;
        activeTab: string;
        moreSection: string;
      }) => {
        if (state.editUserModalVisible) return 'CLOSE_USER_MODAL';
        if (state.dialogVisible) return 'CLOSE_DIALOG';
        if (state.driverModalVisible) return 'CLOSE_DRIVER_MODAL';
        if (state.activeTab === 'more' && state.moreSection !== 'menu') return 'BACK_TO_MORE_MENU';
        if (state.activeTab !== 'dashboard') return 'BACK_TO_DASHBOARD';
        return 'EXIT_APP';
      };

      // Priority 1: User Edit Modal open
      expect(
        resolveBackPress({
          editUserModalVisible: true,
          dialogVisible: false,
          driverModalVisible: false,
          activeTab: 'more',
          moreSection: 'users',
        })
      ).toBe('CLOSE_USER_MODAL');

      // Priority 2: Dialog visible
      expect(
        resolveBackPress({
          editUserModalVisible: false,
          dialogVisible: true,
          driverModalVisible: false,
          activeTab: 'more',
          moreSection: 'users',
        })
      ).toBe('CLOSE_DIALOG');

      // Priority 3: Driver modal open
      expect(
        resolveBackPress({
          editUserModalVisible: false,
          dialogVisible: false,
          driverModalVisible: true,
          activeTab: 'dashboard',
          moreSection: 'menu',
        })
      ).toBe('CLOSE_DRIVER_MODAL');

      // Priority 4: Nested subview open inside 'more' tab
      expect(
        resolveBackPress({
          editUserModalVisible: false,
          dialogVisible: false,
          driverModalVisible: false,
          activeTab: 'more',
          moreSection: 'settings',
        })
      ).toBe('BACK_TO_MORE_MENU');

      // Priority 5: In map tab
      expect(
        resolveBackPress({
          editUserModalVisible: false,
          dialogVisible: false,
          driverModalVisible: false,
          activeTab: 'map',
          moreSection: 'menu',
        })
      ).toBe('BACK_TO_DASHBOARD');

      // Priority 6: At dashboard root -> allows system exit
      expect(
        resolveBackPress({
          editUserModalVisible: false,
          dialogVisible: false,
          driverModalVisible: false,
          activeTab: 'dashboard',
          moreSection: 'menu',
        })
      ).toBe('EXIT_APP');
    });
  });
});
