// Rebuilt Admin Experience for Tracker Mobile
// Bottom Tab Navigation, Compact Header, Real Geographic Map, Operational Density

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../designSystem';
import { AppIcon } from '../components/AppIcon';
import { AppHeader } from '../components/AppHeader';
import { BottomTabBar, type TabItem } from '../components/BottomTabBar';
import { RealGeographicMapView, type MapDriverPoint, type MapRestaurantPoint } from '../components/RealGeographicMapView';
import { DriverDetailModal } from '../components/DriverDetailModal';
import { TrackerDialog } from '../components/TrackerDialog';
import { formatWesternNumber, getLocale, getRowDirection, isRtl, setStoredLocale, t, type Locale } from '../i18n';
import { type Session } from '../session';
import { NotificationService } from '../notificationService';
import { resolveBatteryFreshness } from '../telemetry';

interface AdminHomeScreenProps {
  session: Session;
  apiUrl: string;
  apiRequest: <T>(path: string, options?: RequestInit, sessionOverride?: Session | null) => Promise<T>;
  onLogout: () => Promise<void>;
}

type MainTab = 'dashboard' | 'map' | 'drivers' | 'more';
type MoreSection = 'menu' | 'devices' | 'users' | 'settings' | 'notifications' | 'reports' | 'audit';

export function AdminHomeScreen({
  session,
  apiUrl,
  apiRequest,
  onLogout,
}: AdminHomeScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [moreSection, setMoreSection] = useState<MoreSection>('menu');
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [refreshing, setRefreshing] = useState(false);

  // Fleet & Telemetry Data
  const [fleet, setFleet] = useState<any | null>(null);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [driverFocusTrigger, setDriverFocusTrigger] = useState(0);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [mapFilter, setMapFilter] = useState<string>('ALL');

  // Devices Data
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // Settings Data
  const [settingsRestaurant, setSettingsRestaurant] = useState<any>({
    name: '',
    latitude: 30.0444,
    longitude: 31.2357,
    radiusMeters: 150,
  });
  const [settingsAlerts, setSettingsAlerts] = useState<any>({
    maxStopDurationMinutes: 10,
    offlineGraceMinutes: 5,
    lowBatteryThreshold: 20,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Ref to hold the latest settingsAlerts without re-creating callbacks on keystroke
  const settingsAlertsRef = useRef(settingsAlerts);
  settingsAlertsRef.current = settingsAlerts;
  useEffect(() => {
    settingsAlertsRef.current = settingsAlerts;
  }, [settingsAlerts]);

  // Users Data
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Reports Data
  const [reportData, setReportData] = useState<any | null>(null);
  const [reportPreset, setReportPreset] = useState<'today' | 'yesterday' | '7days' | '30days'>('today');
  const [reportLoading, setReportLoading] = useState(false);

  // Audit Logs Data
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditEntityFilter, setAuditEntityFilter] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'warning' | 'notice' | 'success';
    primaryButtonText?: string;
    onPrimaryPress?: () => void;
    secondaryButtonText?: string;
    onSecondaryPress?: () => void;
    isDestructive?: boolean;
    loading?: boolean;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const showDialog = (
    title: string,
    message: string,
    type: 'error' | 'warning' | 'notice' | 'success' = 'notice',
    primaryButtonText: string = t('app.ok'),
    onPrimaryPress?: () => void,
  ) => {
    setDialogConfig({
      visible: true,
      title,
      message,
      type,
      primaryButtonText,
      onPrimaryPress: onPrimaryPress || (() => setDialogConfig((prev) => ({ ...prev, visible: false }))),
    });
  };

  // User Management State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editUserModalVisible, setEditUserModalVisible] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserRole, setEditUserRole] = useState<'ADMIN' | 'CALL_CENTER' | 'DRIVER'>('DRIVER');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserEmployeeId, setEditUserEmployeeId] = useState('');
  const [editUserActive, setEditUserActive] = useState(true);
  const [savingUser, setSavingUser] = useState(false);

  // Notifications Data
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const rtl = isRtl();
  const rowDir = getRowDirection();

  const toggleLanguage = async () => {
    const next: Locale = locale === 'ar' ? 'en' : 'ar';
    await setStoredLocale(next);
    setLocaleState(next);
  };

  const fleetLoadingRef = useRef(false);

  // 1. Load Fleet Data
  const loadFleet = useCallback(async (silent?: boolean | unknown) => {
    const isSilent = silent === true;
    if (fleetLoadingRef.current) return;
    fleetLoadingRef.current = true;
    try {
      if (!isSilent) setFleetLoading(true);
      setFleetError(null);
      const data = await apiRequest<any>('/api/fleet/live');
      setFleet(data);
    } catch (err: any) {
      if (err?.status === 401 || err?.code === 'AUTH_SESSION_EXPIRED' || err?.code === 'AUTH_INVALID_TOKEN') {
        await onLogout();
        return;
      }
      if (!isSilent) {
        setFleetError(err?.message || 'Failed to connect to server');
      }
    } finally {
      fleetLoadingRef.current = false;
      if (!isSilent) setFleetLoading(false);
    }
  }, [apiRequest, onLogout]);

  // 2. Load Devices
  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const data = await apiRequest<any>('/api/devices?limit=50');
      setDevices(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setDevicesLoading(false);
    }
  }, [apiRequest]);

  // 3. Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const [restRes, alertRes] = await Promise.all([
        apiRequest<any>('/api/settings/restaurant'),
        apiRequest<any>('/api/settings/alerts'),
      ]);
      if (restRes?.settings) setSettingsRestaurant(restRes.settings);
      if (alertRes?.settings) setSettingsAlerts(alertRes.settings);
    } catch {
      // ignore
    }
  }, [apiRequest]);

  // 4. Load Users
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await apiRequest<any>('/api/users?limit=50');
      setUsers(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }, [apiRequest]);

  // 4b. Load Reports
  const loadReports = useCallback(async (preset: 'today' | 'yesterday' | '7days' | '30days') => {
    setReportLoading(true);
    try {
      const now = new Date();
      const end = new Date(now);
      const start = new Date(now);
      if (preset === 'today') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (preset === 'yesterday') {
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
      } else if (preset === '7days') {
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
      } else if (preset === '30days') {
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
      }
      const data = await apiRequest<any>(
        `/api/reports/summary?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`
      );
      setReportData(data);
    } catch {
      // ignore
    } finally {
      setReportLoading(false);
    }
  }, [apiRequest]);

  // 4c. Load Audit Logs
  const loadAuditLogs = useCallback(async (entityType?: string) => {
    setAuditLoading(true);
    try {
      const query = entityType ? `?entityType=${entityType}&limit=30` : '?limit=30';
      const data = await apiRequest<any>(`/api/audit-logs${query}`);
      setAuditLogs(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setAuditLoading(false);
    }
  }, [apiRequest]);

  // 5. Load Notifications
  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest<any>('/api/notifications?limit=30');
      const items = data.items ?? [];
      setNotifications(items);
      setUnreadCount(data.unreadCount ?? 0);

      const currentAlerts = settingsAlertsRef.current;
      // Post unread notifications to Android system notification shade with persisted deduplication
      if (currentAlerts?.inAppAlertsEnabled !== false) {
        for (const notif of items) {
          const shouldPost = await NotificationService.shouldPostSystemNotification(notif);
          if (shouldPost) {
            await NotificationService.recordNotificationPosted(notif.id);
            const itemTitle = rtl
              ? notif.titleAr || notif.title || notif.titleEn || 'تنبيه النظام'
              : notif.titleEn || notif.title || notif.titleAr || 'System Alert';
            const itemMessage = rtl
              ? notif.messageAr || notif.message || notif.messageEn || ''
              : notif.messageEn || notif.message || notif.messageAr || '';

            NotificationService.showNotification({
              channelId: currentAlerts?.soundEnabled ? 'tracker_alerts_channel' : 'tracker_system_channel',
              title: itemTitle,
              body: itemMessage,
              data: { notificationId: notif.id },
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }, [apiRequest, rtl]);

  const handleResolveNotification = useCallback(async (id: string) => {
    try {
      await apiRequest<any>(`/api/notifications/${id}/resolve`, { method: 'PATCH' });
      await loadNotifications();
    } catch (err: any) {
      showDialog(t('app.error'), err?.message || 'Failed to resolve alert', 'error');
    }
  }, [apiRequest, loadNotifications]);

  // Setup Notification permission check and tap routing on mount
  useEffect(() => {
    NotificationService.checkPermission().then((granted) => {
      if (!granted) {
        NotificationService.requestPermission();
      }
    });

    NotificationService.getInitialNotification().then((initial) => {
      if (initial && initial.action === 'OPEN_NOTIFICATIONS') {
        setActiveTab('more');
        setMoreSection('notifications');
        if (initial.notificationId) {
          handleMarkNotificationRead(initial.notificationId);
        }
      }
    });

    const unsubscribe = NotificationService.onNotificationTap((data) => {
      if (data.action === 'OPEN_NOTIFICATIONS') {
        setActiveTab('more');
        setMoreSection('notifications');
        if (data.notificationId) {
          handleMarkNotificationRead(data.notificationId);
        }
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Initial fetch
    loadFleet(false);
    loadNotifications();

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        if (activeTab === 'dashboard' || activeTab === 'map' || activeTab === 'drivers') {
          loadFleet(true);
        }
      }, 5000);
    };

    startPolling();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadFleet(true);
        loadNotifications();
        startPolling();
      } else {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    });

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      appStateSub.remove();
    };
  }, [loadFleet, loadNotifications, activeTab]);

  useEffect(() => {
    if (activeTab === 'more') {
      if (moreSection === 'devices') loadDevices();
      if (moreSection === 'settings') loadSettings();
      if (moreSection === 'users') loadUsers();
      if (moreSection === 'notifications') loadNotifications();
      if (moreSection === 'reports') loadReports(reportPreset);
      if (moreSection === 'audit') loadAuditLogs(auditEntityFilter);
    }
  }, [activeTab, moreSection, loadDevices, loadSettings, loadUsers, loadNotifications, loadReports, reportPreset, loadAuditLogs, auditEntityFilter]);

  // Android hardware back navigation
  useEffect(() => {
    const onBackPress = () => {
      if (editUserModalVisible) {
        setEditUserModalVisible(false);
        return true;
      }
      if (dialogConfig.visible) {
        setDialogConfig((prev) => ({ ...prev, visible: false }));
        return true;
      }
      if (driverModalVisible) {
        setDriverModalVisible(false);
        return true;
      }
      if (activeTab === 'more' && moreSection !== 'menu') {
        setMoreSection('menu');
        return true;
      }
      if (activeTab !== 'dashboard') {
        setActiveTab('dashboard');
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [editUserModalVisible, dialogConfig.visible, driverModalVisible, activeTab, moreSection]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadFleet(),
      loadNotifications(),
      moreSection === 'devices' ? loadDevices() : Promise.resolve(),
      moreSection === 'settings' ? loadSettings() : Promise.resolve(),
      moreSection === 'users' ? loadUsers() : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  // Device Reset
  const handleDeviceReset = async (driverId: string) => {
    try {
      await apiRequest(`/api/drivers/${driverId}/device/reset`, { method: 'POST' });
      showDialog(t('app.notice'), t('admin.resetSuccess'), 'success');
      await loadFleet();
      if (moreSection === 'devices') await loadDevices();
      if (selectedDriver && selectedDriver.driverId === driverId) {
        setSelectedDriver((prev: any) =>
          prev ? { ...prev, device: prev.device ? { ...prev.device, authorized: false } : null } : null
        );
      }
    } catch (err: any) {
      showDialog(t('app.error'), err?.message || t('admin.resetFailed'), 'error');
    }
  };

  // Force End Driver Shift
  const handleForceEndShift = async (driverId: string) => {
    await apiRequest(`/api/drivers/${driverId}/shifts/force-end`, { method: 'POST' });
    await loadFleet();
    if (selectedDriver && selectedDriver.driverId === driverId) {
      setSelectedDriver((prev: any) =>
        prev ? { ...prev, shift: null, operationalStatus: 'OFFLINE' } : null
      );
    }
  };

  // User Management Handlers
  const handleStartEditUser = (user: any) => {
    setEditingUser(user);
    setEditUserName(user.name || '');
    setEditUserEmail(user.email || '');
    setEditUserPhone(user.phone || '');
    setEditUserRole(user.role || 'DRIVER');
    setEditUserPassword('');
    setEditUserEmployeeId(user.employeeId || '');
    setEditUserActive(user.active !== false);
    setEditUserModalVisible(true);
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    const name = editUserName.trim();
    const email = editUserEmail.trim();
    if (!name) {
      showDialog(t('app.error'), rtl ? 'اسم المستخدم مطلوب' : 'User name is required', 'error');
      return;
    }
    if (!email) {
      showDialog(t('app.error'), rtl ? 'البريد الإلكتروني مطلوب' : 'Email is required', 'error');
      return;
    }

    setSavingUser(true);
    try {
      const payload: any = {
        name,
        email,
        phone: editUserPhone.trim(),
        role: editUserRole,
        active: editUserActive,
      };

      if (editUserRole === 'DRIVER') {
        const empId = editUserEmployeeId.trim();
        if (!empId) {
          showDialog(
            t('app.error'),
            rtl ? 'الرقم الوظيفي للسائق مطلوب' : 'Employee ID is required for drivers',
            'error'
          );
          setSavingUser(false);
          return;
        }
        payload.employeeId = empId;
      }

      if (editUserPassword.trim().length > 0) {
        if (editUserPassword.trim().length < 8) {
          showDialog(
            t('app.error'),
            rtl ? 'كلمة المرور يجب ألا تقل عن 8 أحرف' : 'Password must be at least 8 characters',
            'error'
          );
          setSavingUser(false);
          return;
        }
        payload.password = editUserPassword.trim();
      }

      await apiRequest(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setEditUserModalVisible(false);
      setEditingUser(null);
      await loadUsers();
      showDialog(t('app.notice'), rtl ? 'تم تحديث بيانات المستخدم بنجاح' : 'User updated successfully', 'success');
    } catch (err: any) {
      showDialog(t('app.error'), err?.message || (rtl ? 'فشل تحديث المستخدم' : 'Failed to update user'), 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = (user: any) => {
    if (user.id === session.user.id) {
      showDialog(
        t('app.warning'),
        rtl ? 'لا يمكنك حذف حسابك الحالي الذي تستخدمه لتسجيل الدخول' : 'You cannot delete your own active account',
        'warning'
      );
      return;
    }

    setDialogConfig({
      visible: true,
      title: rtl ? 'حذف المستخدم نهائياً' : 'Delete User Permanently',
      message: rtl
        ? `هل أنت متأكد من حذف المستخدم "${user.name}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`
        : `Are you sure you want to permanently delete user "${user.name}"? This action cannot be undone.`,
      type: 'warning',
      isDestructive: true,
      primaryButtonText: rtl ? 'حذف نهائي' : 'Delete Permanently',
      secondaryButtonText: t('app.cancel'),
      onSecondaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
      onPrimaryPress: async () => {
        setDialogConfig((prev) => ({ ...prev, loading: true }));
        try {
          await apiRequest(`/api/users/${user.id}/permanent`, { method: 'DELETE' });
          setDialogConfig({
            visible: true,
            title: t('app.notice'),
            message: rtl ? 'تم حذف المستخدم بنجاح' : 'User deleted successfully',
            type: 'success',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
          await loadUsers();
        } catch (err: any) {
          setDialogConfig({
            visible: true,
            title: t('app.error'),
            message: err?.message || (rtl ? 'تعذر حذف المستخدم' : 'Failed to delete user'),
            type: 'error',
            primaryButtonText: t('app.ok'),
            onPrimaryPress: () => setDialogConfig((prev) => ({ ...prev, visible: false })),
          });
        }
      },
    });
  };

  // Save Settings with strict numeric validation
  const handleSaveSettings = async () => {
    const restName = settingsRestaurant.name?.trim();
    if (!restName) {
      showDialog(t('app.error'), rtl ? 'اسم المطعم مطلوب' : 'Restaurant name is required', 'error');
      return;
    }

    const lat = Number(settingsRestaurant.latitude);
    const lng = Number(settingsRestaurant.longitude);
    const radiusM = Number(settingsRestaurant.radiusMeters);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      showDialog(t('app.error'), rtl ? 'خط العرض غير صالح (-90 إلى 90)' : 'Invalid latitude (-90 to 90)', 'error');
      return;
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      showDialog(t('app.error'), rtl ? 'خط الطول غير صالح (-180 إلى 180)' : 'Invalid longitude (-180 to 180)', 'error');
      return;
    }
    if (Number.isNaN(radiusM) || radiusM < 10 || radiusM > 50000) {
      showDialog(t('app.error'), rtl ? 'نصف القطر يجب أن يكون بين 10 و 50000 متر' : 'Radius must be 10-50,000m', 'error');
      return;
    }

    const maxStop = Number(settingsAlerts.maxStopDurationMinutes);
    const offlineGrace = Number(settingsAlerts.offlineGraceMinutes);
    const lowBatt = Number(settingsAlerts.lowBatteryThreshold);

    if (Number.isNaN(maxStop) || maxStop < 1 || maxStop > 240) {
      showDialog(t('app.error'), rtl ? 'مدة التوقف القصوى يجب أن تكون بين 1 و 240 دقيقة' : 'Max stop must be 1-240m', 'error');
      return;
    }
    if (Number.isNaN(offlineGrace) || offlineGrace < 1 || offlineGrace > 120) {
      showDialog(t('app.error'), rtl ? 'مهلة الانقطاع يجب أن تكون بين 1 و 120 دقيقة' : 'Offline grace must be 1-120m', 'error');
      return;
    }
    if (Number.isNaN(lowBatt) || lowBatt < 5 || lowBatt > 50) {
      showDialog(t('app.error'), rtl ? 'حد البطارية يجب أن يكون بين 5% و 50%' : 'Low battery must be 5-50%', 'error');
      return;
    }

    setSettingsSaving(true);
    try {
      await Promise.all([
        apiRequest('/api/settings/restaurant', {
          method: 'PUT',
          body: JSON.stringify({
            name: restName,
            latitude: lat,
            longitude: lng,
            radiusMeters: radiusM,
          }),
        }),
        apiRequest('/api/settings/alerts', {
          method: 'PUT',
          body: JSON.stringify({
            maxStopDurationMinutes: maxStop,
            offlineGraceMinutes: offlineGrace,
            lowBatteryThreshold: lowBatt,
            stopAlertEnabled: settingsAlerts.stopAlertEnabled ?? true,
            gpsAlertEnabled: settingsAlerts.gpsAlertEnabled ?? true,
            offlineAlertEnabled: settingsAlerts.offlineAlertEnabled ?? true,
            batteryAlertEnabled: settingsAlerts.batteryAlertEnabled ?? true,
            restaurantGeofenceAlertEnabled: settingsAlerts.restaurantGeofenceAlertEnabled ?? true,
            soundEnabled: settingsAlerts.soundEnabled ?? true,
            inAppAlertsEnabled: settingsAlerts.inAppAlertsEnabled ?? true,
          }),
        }),
      ]);
      showDialog(t('app.notice'), t('admin.saveSettingsSuccess'), 'success');
      await loadSettings();
      await loadFleet();
    } catch (err: any) {
      showDialog(t('app.error'), err?.message || t('admin.saveSettingsFailed'), 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    try {
      await apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleSendTestNotification = async () => {
    try {
      await NotificationService.requestPermission();
      const res = await apiRequest<any>('/api/notifications/test', { method: 'POST' });
      const notif = res?.notification;
      if (notif) {
        await NotificationService.recordNotificationPosted(notif.id);
        const itemTitle = rtl
          ? notif.titleAr || notif.title || 'إشعار اختباري للنظام'
          : notif.titleEn || notif.title || 'System Test Notification';
        const itemMessage = rtl
          ? notif.messageAr || notif.message || 'تم إرسال إشعار تجريبي لاختبار شريط الإشعارات'
          : notif.messageEn || notif.message || 'Test notification sent to shade';

        await NotificationService.showNotification({
          id: Math.floor(Math.random() * 90000) + 10000,
          channelId: settingsAlerts.soundEnabled ? 'tracker_alerts_channel' : 'tracker_system_channel',
          title: itemTitle,
          body: itemMessage,
          data: { notificationId: notif.id },
        });
      }
      await loadNotifications();
      showDialog(
        t('app.notice'),
        rtl ? 'تم إرسال الإشعار لشريط إشعارات أندرويد بنجاح' : 'Notification posted to Android shade',
        'success'
      );
    } catch (err: any) {
      showDialog(t('app.error'), err?.message || 'Failed to send test notification', 'error');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      await loadNotifications();
      showDialog(t('app.notice'), t('notifications.markReadSuccess'), 'success');
    } catch {
      // ignore
    }
  };

  // Map Restaurant Point
  const restaurantPoint: MapRestaurantPoint = useMemo(() => ({
    name: fleet?.restaurant?.name || settingsRestaurant.name || 'Branch Base',
    latitude: fleet?.restaurant?.latitude ?? settingsRestaurant.latitude ?? 30.0444,
    longitude: fleet?.restaurant?.longitude ?? settingsRestaurant.longitude ?? 31.2357,
    radiusMeters: fleet?.restaurant?.radiusMeters ?? settingsRestaurant.radiusMeters ?? 150,
  }), [
    fleet?.restaurant?.name,
    fleet?.restaurant?.latitude,
    fleet?.restaurant?.longitude,
    fleet?.restaurant?.radiusMeters,
    settingsRestaurant.name,
    settingsRestaurant.latitude,
    settingsRestaurant.longitude,
    settingsRestaurant.radiusMeters,
  ]);

  // Filtered drivers
  const filteredDrivers = useMemo(() => {
    return (fleet?.drivers ?? []).filter((d: any) => {
      // Search query
      if (driverSearch.trim()) {
        const q = driverSearch.toLowerCase().trim();
        const matchesName = d.driverName?.toLowerCase().includes(q);
        const matchesEmp = d.employeeId?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmp) return false;
      }
      // Status filter
      if (mapFilter === 'MOVING') return d.operationalStatus === 'MOVING';
      if (mapFilter === 'STOPPED') return d.operationalStatus === 'STOPPED';
      if (mapFilter === 'AT_RESTAURANT') return d.operationalStatus === 'AT_RESTAURANT';
      if (mapFilter === 'OFFLINE') return d.operationalStatus === 'OFFLINE';
      return true;
    });
  }, [fleet, driverSearch, mapFilter]);

  // Operational Driver metrics computed from real state
  const metrics = useMemo(() => {
    const driversList = fleet?.drivers ?? [];
    const total = driversList.length;
    const inShift = driversList.filter((d: any) => Boolean(d.shift)).length;
    const online = driversList.filter((d: any) => d.isOnline ?? (d.operationalStatus !== 'OFFLINE')).length;
    const tracking = driversList.filter((d: any) => (d.isOnline ?? (d.operationalStatus !== 'OFFLINE')) && d.location).length;
    const offline = total - online;
    const activeAlerts = (fleet?.alerts ?? []).length;

    return { total, inShift, tracking, online, offline, activeAlerts };
  }, [fleet]);

  // Bottom tabs definition
  const bottomTabs: TabItem[] = [
    { id: 'dashboard', label: rtl ? 'الرئيسية' : 'Dashboard', icon: 'dashboard' },
    { id: 'map', label: rtl ? 'الخريطة' : 'Map', icon: 'map' },
    { id: 'drivers', label: rtl ? 'السائقون' : 'Drivers', icon: 'driver', badgeCount: metrics.online > 0 ? metrics.online : undefined },
    { id: 'more', label: rtl ? 'المزيد' : 'More', icon: 'more', badgeCount: unreadCount > 0 ? unreadCount : undefined },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Sleek Unified AppHeader (52dp) */}
      <AppHeader
        title={
          activeTab === 'dashboard'
            ? rtl ? 'لوحة القيادة والمراقبة' : 'Fleet Console'
            : activeTab === 'map'
            ? rtl ? 'الخريطة الميدانية' : 'Live Fleet Map'
            : activeTab === 'drivers'
            ? rtl ? 'دليل السائقين' : 'Active Drivers'
            : moreSection === 'devices'
            ? t('admin.deviceManagement')
            : moreSection === 'users'
            ? t('admin.usersList')
            : moreSection === 'settings'
            ? t('admin.settings')
            : moreSection === 'notifications'
            ? t('notifications.title')
            : moreSection === 'reports'
            ? (rtl ? 'تقارير الأداء والعمليات' : 'Operational Reports')
            : moreSection === 'audit'
            ? (rtl ? 'سجل العمليات المركزي' : 'Centralized Audit Log')
            : rtl ? 'إدارة النظام والمزيد' : 'System & More'
        }
        role="ADMIN"
        userName={session.user.name}
        locale={locale}
        onBack={activeTab === 'more' && moreSection !== 'menu' ? () => setMoreSection('menu') : undefined}
        onToggleLanguage={toggleLanguage}
        onLogout={onLogout}
      />

      {/* Active Tab Screen Content */}
      <View style={styles.body}>
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          fleetLoading && !fleet ? (
            <View style={styles.stateCenterContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateLoadingText}>{t('app.loadingFleet')}</Text>
            </View>
          ) : !fleetLoading && !fleet && fleetError ? (
            <View style={styles.stateErrorContainer}>
              <AppIcon name="warning" size={36} color={colors.status.critical} />
              <Text style={styles.stateErrorTitle}>{t('app.fleetLoadFailed')}</Text>
              <Text style={styles.stateErrorMessage}>{fleetError}</Text>
              <TouchableOpacity style={styles.primaryRetryButton} onPress={loadFleet}>
                <Text style={styles.primaryRetryButtonText}>{t('app.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContainer}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
            {/* Error Banner with Retry */}
            {fleetError && (
              <View style={[styles.errorBanner, { flexDirection: rowDir }]}>
                <AppIcon name="warning" size={16} color="#b91c1c" />
                <Text style={styles.errorBannerText}>{fleetError}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={loadFleet}>
                  <Text style={styles.retryButtonText}>{rtl ? 'إعادة المحاولة' : 'Retry'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Section 1: Real-time Operational KPI Summary */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {rtl ? 'ملخص الأسطول في الوقت الفعلي' : 'Live Fleet Overview'}
              </Text>

              <View style={styles.kpiGrid}>
                {/* Total Drivers */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'إجمالي السائقين' : 'Total Drivers'}</Text>
                  <Text style={styles.kpiValue}>{formatWesternNumber(metrics.total)}</Text>
                </View>

                {/* In Shift */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'في وردية عمل' : 'On Shift'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.primary }]}>
                    {formatWesternNumber(metrics.inShift)}
                  </Text>
                </View>

                {/* Tracking Active */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'تتبع نشط الآن' : 'Tracking Now'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.status.online }]}>
                    {formatWesternNumber(metrics.tracking)}
                  </Text>
                </View>

                {/* Online */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'متصل' : 'Online'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.status.online }]}>
                    {formatWesternNumber(metrics.online)}
                  </Text>
                </View>

                {/* Offline */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'غير متصل' : 'Offline'}</Text>
                  <Text style={[styles.kpiValue, { color: colors.text.muted }]}>
                    {formatWesternNumber(metrics.offline)}
                  </Text>
                </View>

                {/* Active Alerts */}
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{rtl ? 'تنبيهات نشطة' : 'Active Alerts'}</Text>
                  <Text style={[styles.kpiValue, { color: metrics.activeAlerts > 0 ? colors.status.critical : colors.text.muted }]}>
                    {formatWesternNumber(metrics.activeAlerts)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Section 2: Active Critical Alerts (If any) */}
            {(fleet?.alerts ?? []).length > 0 && (
              <View style={styles.section}>
                <View style={[styles.sectionHeaderRow, { flexDirection: rowDir }]}>
                  <Text style={styles.sectionTitle}>{rtl ? 'التنبيهات الميدانية النشطة' : 'Active Alerts'}</Text>
                  <View style={styles.alertCountBadge}>
                    <Text style={styles.alertCountText}>{formatWesternNumber((fleet.alerts ?? []).length)}</Text>
                  </View>
                </View>

                {(fleet.alerts ?? []).slice(0, 3).map((al: any) => (
                  <View key={al.id} style={[styles.alertCard, { flexDirection: rowDir }]}>
                    <AppIcon name="warning" size={16} color={colors.status.critical} />
                    <View style={styles.alertBody}>
                      <Text style={[styles.alertTitle, { textAlign: rtl ? 'right' : 'left' }]}>{al.title || al.type}</Text>
                      <Text style={[styles.alertMessage, { textAlign: rtl ? 'right' : 'left' }]}>{al.message}</Text>
                    </View>
                    <Text style={styles.alertTime}>
                      {al.createdAt ? new Date(al.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Section 3: Live Map Preview Container */}
            <View style={styles.section}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rowDir }]}>
                <Text style={styles.sectionTitle}>{rtl ? 'معاينة الخريطة الميدانية' : 'Fleet Map Preview'}</Text>
                <TouchableOpacity onPress={() => setActiveTab('map')}>
                  <Text style={styles.sectionActionLink}>{rtl ? 'فتح الخريطة الكاملة ←' : 'Full Map →'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.mapPreviewFrame}>
                <RealGeographicMapView
                  restaurant={restaurantPoint}
                  drivers={fleet?.drivers ?? []}
                  height={190}
                  isCompactPreview
                />
              </View>
            </View>

            {/* Section 4: Live Drivers Quick Overview */}
            <View style={styles.section}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rowDir }]}>
                <Text style={styles.sectionTitle}>{rtl ? 'السائقون الميدانيون' : 'Active Fleet'}</Text>
                <TouchableOpacity onPress={() => setActiveTab('drivers')}>
                  <Text style={styles.sectionActionLink}>{rtl ? 'عرض الكل ←' : 'View All →'}</Text>
                </TouchableOpacity>
              </View>

              {(fleet?.drivers ?? []).slice(0, 4).map((d: any) => {
                const isDOnline = d.isOnline ?? (d.operationalStatus !== 'OFFLINE');
                const isMoving = d.operationalStatus === 'MOVING';
                const batteryFreshness = resolveBatteryFreshness({
                  batteryPercentage: d.device?.batteryPercentage,
                  lastSeen: d.device?.lastSeen,
                  isOnline: isDOnline,
                });
                const batteryText = rtl ? batteryFreshness.labelAr : batteryFreshness.labelEn;
                return (
                  <TouchableOpacity
                    key={d.driverId}
                    style={[styles.driverRow, { flexDirection: rowDir }]}
                    onPress={() => {
                      setSelectedDriver(d);
                      setDriverModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.driverStatusDot, { backgroundColor: isDOnline ? colors.status.online : colors.status.offline }]} />

                    <View style={[styles.driverInfo, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                      <Text style={styles.driverName}>{d.driverName}</Text>
                      <Text style={styles.driverMeta}>
                        {t('diagnostics.employeeId')} {formatWesternNumber(d.employeeId)}
                      </Text>
                    </View>

                    <View style={[styles.driverTelemetryCol, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
                      <Text style={styles.driverSpeedText}>
                        {isMoving && d.location?.speed != null
                          ? `${formatWesternNumber(Math.round(Number(d.location.speed) * 3.6))} ${t('driverDetail.speedUnit')}`
                          : d.operationalStatus === 'AT_RESTAURANT'
                          ? (rtl ? 'بالمطعم' : 'At Restaurant')
                          : isDOnline ? t('operator.stopped') : t('operator.offline')}
                      </Text>
                      <Text style={styles.driverBatteryText}>
                        {batteryText}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            </ScrollView>
          )
        )}

        {/* TAB 2: FULLSCREEN LIVE MAP */}
        {activeTab === 'map' && (
          fleetLoading && !fleet ? (
            <View style={styles.stateCenterContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateLoadingText}>{t('app.loadingFleet')}</Text>
            </View>
          ) : !fleetLoading && !fleet && fleetError ? (
            <View style={styles.stateErrorContainer}>
              <AppIcon name="warning" size={36} color={colors.status.critical} />
              <Text style={styles.stateErrorTitle}>{t('app.fleetLoadFailed')}</Text>
              <Text style={styles.stateErrorMessage}>{fleetError}</Text>
              <TouchableOpacity style={styles.primaryRetryButton} onPress={loadFleet}>
                <Text style={styles.primaryRetryButtonText}>{t('app.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mapScreenContainer}>
              {/* Status Filter Bar */}
              <View style={[styles.filterBar, { flexDirection: rowDir }]}>
                {['ALL', 'MOVING', 'AT_RESTAURANT', 'STOPPED', 'OFFLINE'].map((statusKey) => (
                  <TouchableOpacity
                    key={statusKey}
                    style={[styles.filterPill, mapFilter === statusKey && styles.filterPillActive]}
                    onPress={() => setMapFilter(statusKey)}
                  >
                    <Text style={[styles.filterPillText, mapFilter === statusKey && styles.filterPillTextActive]}>
                      {statusKey === 'ALL'
                        ? rtl ? 'الكل' : 'All'
                        : statusKey === 'MOVING'
                        ? rtl ? 'متحرك' : 'Moving'
                        : statusKey === 'AT_RESTAURANT'
                        ? rtl ? 'بالمطعم' : 'Base'
                        : statusKey === 'STOPPED'
                        ? rtl ? 'متوقف' : 'Stopped'
                        : rtl ? 'غير متصل' : 'Offline'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Real Geographic Map */}
              <RealGeographicMapView
                restaurant={restaurantPoint}
                drivers={filteredDrivers}
                selectedDriverId={selectedDriver?.driverId}
                driverFocusTrigger={driverFocusTrigger}
                onSelectDriver={(d) => setSelectedDriver(d)}
                onViewDriverDetail={(d) => {
                  setSelectedDriver(d);
                  setDriverModalVisible(true);
                }}
                height="100%"
              />
            </View>
          )
        )}

        {/* TAB 3: DRIVERS DIRECTORY */}
        {activeTab === 'drivers' && (
          fleetLoading && !fleet ? (
            <View style={styles.stateCenterContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateLoadingText}>{t('app.loadingFleet')}</Text>
            </View>
          ) : !fleetLoading && !fleet && fleetError ? (
            <View style={styles.stateErrorContainer}>
              <AppIcon name="warning" size={36} color={colors.status.critical} />
              <Text style={styles.stateErrorTitle}>{t('app.fleetLoadFailed')}</Text>
              <Text style={styles.stateErrorMessage}>{fleetError}</Text>
              <TouchableOpacity style={styles.primaryRetryButton} onPress={loadFleet}>
                <Text style={styles.primaryRetryButtonText}>{t('app.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.driversScreenContainer}>
            {/* Search Input */}
            <View style={[styles.searchBar, { flexDirection: rowDir }]}>
              <AppIcon name="search" size={16} color={colors.text.muted} />
              <TextInput
                value={driverSearch}
                onChangeText={setDriverSearch}
                placeholder={rtl ? 'بحث بالاسم أو الرقم الوظيفي...' : 'Search by name or ID...'}
                placeholderTextColor={colors.text.light}
                style={[styles.searchInput, { textAlign: rtl ? 'right' : 'left' }]}
              />
              {driverSearch.length > 0 && (
                <TouchableOpacity onPress={() => setDriverSearch('')}>
                  <AppIcon name="close" size={14} color={colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Drivers List */}
            <ScrollView
              contentContainerStyle={styles.driversListContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {filteredDrivers.length === 0 ? (
                <View style={styles.emptyState}>
                  <AppIcon name="driver" size={32} color={colors.text.light} />
                  <Text style={styles.emptyStateText}>{t('operator.noDrivers')}</Text>
                </View>
              ) : (
                filteredDrivers.map((d: any) => {
                  const isDOnline = d.isOnline ?? (d.operationalStatus !== 'OFFLINE');
                  const isMoving = d.operationalStatus === 'MOVING';
                  const speed = isMoving && d.location?.speed != null ? Math.round(Number(d.location.speed) * 3.6) : null;
                  const batteryFreshness = resolveBatteryFreshness({
                    batteryPercentage: d.device?.batteryPercentage,
                    lastSeen: d.device?.lastSeen,
                    isOnline: isDOnline,
                  });
                  const batteryText = rtl ? batteryFreshness.labelAr : batteryFreshness.labelEn;
                  return (
                    <TouchableOpacity
                      key={d.driverId}
                      style={[styles.operationalDriverCard, { flexDirection: rowDir }]}
                      onPress={() => {
                        setSelectedDriver(d);
                        setDriverModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      {/* Status Column */}
                      <View style={[styles.driverStatusCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                        <View
                          style={[
                            styles.statusBadgePill,
                            {
                              backgroundColor: isDOnline ? colors.status.onlineBg : colors.status.offlineBg,
                              borderColor: isDOnline ? colors.status.onlineBorder : colors.status.offlineBorder,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgePillText,
                              { color: isDOnline ? colors.status.online : colors.status.offline },
                            ]}
                          >
                            {isDOnline ? t('operator.online') : t('operator.offline')}
                          </Text>
                        </View>
                      </View>

                      {/* Main Driver Info */}
                      <View style={[styles.driverMainCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                        <Text style={styles.cardDriverName} numberOfLines={1}>{d.driverName}</Text>
                        <Text style={styles.employeeIdLabel} numberOfLines={1}>
                          {t('diagnostics.employeeId')} {d.employeeId ? formatWesternNumber(d.employeeId) : '—'}
                        </Text>
                        <Text style={styles.cardDriverFreshness} numberOfLines={1}>
                          {d.operationalStatus === 'MOVING'
                            ? (rtl ? 'في حركة' : 'Moving')
                            : d.operationalStatus === 'AT_RESTAURANT'
                            ? (rtl ? 'في المطعم' : 'At Restaurant')
                            : d.operationalStatus === 'STOPPED'
                            ? (rtl ? 'متوقف' : 'Stopped')
                            : (rtl ? 'غير متصل' : 'Offline')}
                        </Text>
                      </View>

                      {/* Right Telemetry Column */}
                      <View style={[styles.driverRightCol, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
                        <Text style={styles.driverCardSpeed}>
                          {speed != null ? `${formatWesternNumber(speed)} ${t('driverDetail.speedUnit')}` : '—'}
                        </Text>
                        <Text style={styles.driverCardBattery}>
                          {batteryText}
                        </Text>
                      </View>

                      {/* Chevron Arrow */}
                      <View style={styles.chevronCol}>
                        <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
          )
        )}

        {/* TAB 4: MORE HUB & SUBSCREENS */}
        {activeTab === 'more' && (
          <View style={styles.moreContainer}>
            {/* SUBVIEW: MENU HUB */}
            {moreSection === 'menu' && (
              <ScrollView contentContainerStyle={styles.scrollContainer}>
                {/* Administration Group */}
                <View style={styles.moreGroup}>
                  <Text style={[styles.moreGroupTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'الإدارة والرقابة' : 'Administration'}
                  </Text>

                  {/* Devices */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={() => setMoreSection('devices')}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="device" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('admin.deviceManagement')}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>

                  {/* Users */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={() => setMoreSection('users')}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="users" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('admin.usersList')}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>

                  {/* Notifications */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={() => setMoreSection('notifications')}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="bell" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('notifications.title')}</Text>
                    </View>
                    {unreadCount > 0 && (
                      <View style={styles.moreBadge}>
                        <Text style={styles.moreBadgeText}>{formatWesternNumber(unreadCount)}</Text>
                      </View>
                    )}
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>

                  {/* Reports */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={() => setMoreSection('reports')}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="dashboard" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{rtl ? 'تقارير الأداء والعمليات' : 'Operational Reports'}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>

                  {/* Audit Log */}
                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={() => setMoreSection('audit')}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="check" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{rtl ? 'سجل العمليات المركزي' : 'Centralized Audit Log'}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>
                </View>

                {/* System Settings Group */}
                <View style={styles.moreGroup}>
                  <Text style={[styles.moreGroupTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'تهيئة النظام' : 'System Configuration'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={() => setMoreSection('settings')}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="settings" size={18} color={colors.primary} />
                      <Text style={styles.moreRowText}>{t('admin.settings')}</Text>
                    </View>
                    <AppIcon name={rtl ? 'arrow-left' : 'arrow-right'} size={14} color={colors.text.light} />
                  </TouchableOpacity>
                </View>

                {/* Session Group */}
                <View style={styles.moreGroup}>
                  <Text style={[styles.moreGroupTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'الجلسة' : 'Session'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={toggleLanguage}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="sync" size={16} color={colors.primary} />
                      <Text style={styles.moreRowText}>
                        {rtl ? 'تغيير اللغة (English)' : 'Change Language (العربية)'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.moreRow, { flexDirection: rowDir }]}
                    onPress={onLogout}
                  >
                    <View style={[styles.moreRowLeft, { flexDirection: rowDir }]}>
                      <AppIcon name="logout" size={18} color="#dc2626" />
                      <Text style={[styles.moreRowText, { color: '#dc2626', fontWeight: '700' }]}>
                        {t('app.logout')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* SUBVIEW: DEVICES LIST */}
            {moreSection === 'devices' && (
              <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {devicesLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
                  ) : devices.length === 0 ? (
                    <Text style={styles.emptyText}>{rtl ? 'لا توجد أجهزة مسجلة' : 'No devices found'}</Text>
                  ) : (
                    devices.map((dev: any) => (
                      <View key={dev.id} style={styles.deviceCard}>
                        <View style={[styles.deviceCardHeader, { flexDirection: rowDir }]}>
                          <View>
                            <Text style={styles.deviceDriverName}>{dev.driverName || 'Driver'}</Text>
                            <Text style={styles.deviceIdText}>{dev.deviceIdentifier}</Text>
                          </View>
                          <View
                            style={[
                              styles.authBadge,
                              {
                                backgroundColor: dev.isAuthorized ? colors.status.onlineBg : colors.status.criticalBg,
                                borderColor: dev.isAuthorized ? colors.status.onlineBorder : colors.status.criticalBorder,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.authBadgeText,
                                { color: dev.isAuthorized ? colors.status.online : colors.status.critical },
                              ]}
                            >
                              {dev.isAuthorized ? t('admin.authorized') : t('admin.unauthorized')}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.deviceMetaRow, { flexDirection: rowDir }]}>
                          <Text style={styles.deviceMetaItem}>
                            {dev.platform || 'Android'} • v{dev.appVersion || '1.0.0'}
                          </Text>
                          <Text style={styles.deviceMetaItem}>
                            {dev.lastSeenAt
                              ? new Date(dev.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : t('admin.never')}
                          </Text>
                        </View>

                        {dev.isAuthorized && (
                          <TouchableOpacity
                            style={styles.deviceResetButton}
                            onPress={() => handleDeviceReset(dev.driverId)}
                          >
                            <Text style={styles.deviceResetButtonText}>{t('admin.resetDevice')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {/* SUBVIEW: USERS LIST */}
            {moreSection === 'users' && (
              <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {usersLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
                  ) : (
                    users.map((u: any) => (
                      <View key={u.id} style={[styles.userRow, { flexDirection: rowDir }]}>
                        <View style={[styles.userInfo, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                          <Text style={styles.userName}>{u.name}</Text>
                          <Text style={styles.userPhone}>{u.phone || u.email}</Text>
                        </View>
                        <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 8 }}>
                          <View
                            style={[
                              styles.userRoleBadge,
                              {
                                backgroundColor:
                                  u.role === 'ADMIN'
                                    ? colors.status.onlineBg
                                    : u.role === 'CALL_CENTER'
                                    ? colors.status.atRestaurantBg
                                    : colors.surfaceSubtle,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.userRoleBadgeText,
                                {
                                  color:
                                    u.role === 'ADMIN'
                                      ? colors.status.online
                                      : u.role === 'CALL_CENTER'
                                      ? colors.status.atRestaurant
                                      : colors.text.secondary,
                                },
                              ]}
                            >
                              {u.role === 'ADMIN'
                                ? (rtl ? 'مسؤول' : 'ADMIN')
                                : u.role === 'CALL_CENTER'
                                ? (rtl ? 'مركز الاتصال' : 'CALL CENTER')
                                : (rtl ? 'سائق' : 'DRIVER')}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleStartEditUser(u)}
                            style={styles.userActionEditButton}
                          >
                            <Text style={styles.userActionEditText}>{rtl ? 'تعديل' : 'Edit'}</Text>
                          </TouchableOpacity>
                          {u.id !== session.user.id && (
                            <TouchableOpacity
                              onPress={() => handleDeleteUser(u)}
                              style={styles.userActionDeleteButton}
                            >
                              <Text style={styles.userActionDeleteText}>{rtl ? 'حذف' : 'Delete'}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {/* SUBVIEW: SETTINGS FORM */}
            {moreSection === 'settings' && (
              <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {/* Restaurant Geofence Card */}
                  <View style={styles.settingsCard}>
                    <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AppIcon name="restaurant" size={18} color={colors.primary} />
                      <Text style={[styles.settingsCardTitle, { marginBottom: 0 }]}>
                        {t('admin.restaurantSettings')}
                      </Text>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.restaurantName')}
                      </Text>
                      <TextInput
                        value={settingsRestaurant.name}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, name: t }))}
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.geofenceRadius')}
                      </Text>
                      <TextInput
                        value={String(settingsRestaurant.radiusMeters ?? 150)}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, radiusMeters: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.latitude')}
                      </Text>
                      <TextInput
                        value={String(settingsRestaurant.latitude ?? 30.0444)}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, latitude: t }))}
                        keyboardType="decimal-pad"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.longitude')}
                      </Text>
                      <TextInput
                        value={String(settingsRestaurant.longitude ?? 31.2357)}
                        onChangeText={(t) => setSettingsRestaurant((prev: any) => ({ ...prev, longitude: t }))}
                        keyboardType="decimal-pad"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>
                  </View>

                  {/* Alert Thresholds Card */}
                  <View style={styles.settingsCard}>
                    <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AppIcon name="warning" size={18} color={colors.status.critical} />
                      <Text style={[styles.settingsCardTitle, { marginBottom: 0 }]}>
                        {t('admin.alertThresholds')}
                      </Text>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.maxStopDuration')}
                      </Text>
                      <TextInput
                        value={String(settingsAlerts.maxStopDurationMinutes ?? 10)}
                        onChangeText={(t) => setSettingsAlerts((prev: any) => ({ ...prev, maxStopDurationMinutes: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.offlineGraceMinutes')}
                      </Text>
                      <TextInput
                        value={String(settingsAlerts.offlineGraceMinutes ?? 5)}
                        onChangeText={(t) => setSettingsAlerts((prev: any) => ({ ...prev, offlineGraceMinutes: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                        {t('admin.lowBatteryThreshold')}
                      </Text>
                      <TextInput
                        value={String(settingsAlerts.lowBatteryThreshold ?? 20)}
                        onChangeText={(t) => setSettingsAlerts((prev: any) => ({ ...prev, lowBatteryThreshold: t }))}
                        keyboardType="numeric"
                        style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                      />
                    </View>
                  </View>

                  {/* Alert Channels & Triggers Card */}
                  <View style={styles.settingsCard}>
                    <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <AppIcon name="bell" size={18} color={colors.primary} />
                      <Text style={[styles.settingsCardTitle, { marginBottom: 0 }]}>
                        {rtl ? 'تفعيل وتنبيهات الإشعارات' : 'Alert Triggers & Channels'}
                      </Text>
                    </View>

                    {[
                      { key: 'stopAlertEnabled', label: rtl ? 'تنبيه التوقف المفرط' : 'Excessive Stop Alert', desc: rtl ? 'إشعار عند تجاوز السائق مدة التوقف المسموحة' : 'Notify when driver stops beyond limit' },
                      { key: 'gpsAlertEnabled', label: rtl ? 'تنبيه فقدان إشارة GPS' : 'GPS Loss Alert', desc: rtl ? 'إشعار عند تعطل أو إيقاف خدمات الموقع' : 'Notify when location services are disabled' },
                      { key: 'offlineAlertEnabled', label: rtl ? 'تنبيه انقطاع الاتصال' : 'Device Offline Alert', desc: rtl ? 'إشعار عند انقطاع جهاز السائق عن الشبكة' : 'Notify when driver device goes offline' },
                      { key: 'batteryAlertEnabled', label: rtl ? 'تنبيه انخفاض البطارية' : 'Low Battery Alert', desc: rtl ? 'إشعار عند وصول بطارية السائق للحد الحرج' : 'Notify when device battery drops below threshold' },
                      { key: 'restaurantGeofenceAlertEnabled', label: rtl ? 'تنبيه السياج الجغرافي للمطعم' : 'Geofence Alert', desc: rtl ? 'إشعار عند دخول أو مغادرة محيط المطعم' : 'Notify on entering/exiting restaurant zone' },
                      { key: 'soundEnabled', label: rtl ? 'نغمات التنبيه الصوتية' : 'Sound Alerts', desc: rtl ? 'تشغيل صوت عند ورود تنبيه حرج' : 'Play sound upon critical incident alerts' },
                      { key: 'inAppAlertsEnabled', label: rtl ? 'إشعارات داخل التطبيق' : 'In-App Alert Banners', desc: rtl ? 'إظهار شريط التنبيه في اللوحة المباشرة' : 'Display alert banners in operational console' },
                    ].map((item) => {
                      const enabled = settingsAlerts[item.key] ?? true;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[
                            {
                              flexDirection: rowDir,
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 10,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.border,
                            },
                          ]}
                          onPress={() =>
                            setSettingsAlerts((prev: any) => ({
                              ...prev,
                              [item.key]: !enabled,
                            }))
                          }
                        >
                          <View style={{ flex: 1, alignItems: rtl ? 'flex-end' : 'flex-start', marginHorizontal: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>
                              {item.label}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                              {item.desc}
                            </Text>
                          </View>
                          <View
                            style={{
                              width: 44,
                              height: 24,
                              borderRadius: 12,
                              backgroundColor: enabled ? colors.primary : '#cbd5e1',
                              justifyContent: 'center',
                              paddingHorizontal: 2,
                            }}
                          >
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: '#ffffff',
                                alignSelf: enabled ? 'flex-end' : 'flex-start',
                              }}
                            />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={[styles.primarySaveButton, settingsSaving && styles.disabledButton]}
                    onPress={handleSaveSettings}
                    disabled={settingsSaving}
                  >
                    {settingsSaving ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.primarySaveButtonText}>{t('app.save')}</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}

            {/* SUBVIEW: NOTIFICATIONS */}
            {moreSection === 'notifications' && (
              <View style={{ flex: 1 }}>
                <View style={[styles.notificationsToolbar, { flexDirection: rowDir }]}>
                  <TouchableOpacity onPress={handleSendTestNotification} style={[styles.markAllReadButton, { backgroundColor: '#e0f2fe' }]}>
                    <Text style={[styles.markAllReadText, { color: colors.accent }]}>
                      {rtl ? 'إرسال تجريبي' : 'Send Test'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleMarkAllNotificationsRead} style={styles.markAllReadButton}>
                    <Text style={styles.markAllReadText}>{t('notifications.markAllRead')}</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.subviewScroll}>
                  {notifications.length === 0 ? (
                    <View style={styles.emptyState}>
                      <AppIcon name="bell" size={32} color={colors.text.light} />
                      <Text style={styles.emptyStateText}>{t('notifications.noNotifications')}</Text>
                    </View>
                  ) : (
                    notifications.map((n: any) => {
                      const itemTitle = rtl
                        ? n.titleAr || n.title || n.titleEn || 'تنبيه النظام'
                        : n.titleEn || n.title || n.titleAr || 'System Alert';
                      const itemMessage = rtl
                        ? n.messageAr || n.message || n.messageEn || ''
                        : n.messageEn || n.message || n.messageAr || '';
                        const isCritical = n.severity === 'CRITICAL';
                        const isWarning = n.severity === 'WARNING';
                        return (
                          <TouchableOpacity
                            key={n.id}
                            activeOpacity={0.7}
                            onPress={() => handleMarkNotificationRead(n.id)}
                            style={[styles.notificationCard, !n.read && styles.unreadNotification]}
                          >
                            <View style={[styles.notificationHeaderRow, { flexDirection: rowDir }]}>
                              <Text style={styles.notificationTitle}>{itemTitle}</Text>
                              <View style={{ flexDirection: rowDir, gap: 4, alignItems: 'center' }}>
                                <View
                                  style={[
                                    styles.severityBadge,
                                    {
                                      backgroundColor: isCritical
                                        ? colors.status.criticalBg
                                        : isWarning
                                        ? colors.status.warningBg
                                        : '#eff6ff',
                                      borderColor: isCritical
                                        ? colors.status.criticalBorder
                                        : isWarning
                                        ? colors.status.warningBorder
                                        : '#bfdbfe',
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.severityBadgeText,
                                      {
                                        color: isCritical
                                          ? colors.status.critical
                                          : isWarning
                                          ? colors.status.warning
                                          : '#2563eb',
                                      },
                                    ]}
                                  >
                                    {n.severity === 'CRITICAL'
                                      ? (rtl ? 'حرج' : 'CRITICAL')
                                      : n.severity === 'WARNING'
                                      ? (rtl ? 'تحذير' : 'WARNING')
                                      : (rtl ? 'معلومة' : 'INFO')}
                                  </Text>
                                </View>
                                {!n.read && (
                                  <View style={styles.unreadPill}>
                                    <Text style={styles.unreadPillText}>{t('notifications.unread')}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            <Text style={[styles.notificationMessage, { textAlign: rtl ? 'right' : 'left' }]}>
                              {itemMessage}
                            </Text>
                            <View style={[styles.rowBetween, { flexDirection: rowDir, marginTop: 8 }]}>
                              <Text style={styles.notificationTime}>
                                {n.createdAt ? formatWesternNumber(new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : ''}
                              </Text>
                              {!n.resolved ? (
                                <TouchableOpacity
                                  style={styles.resolveAlertButton}
                                  onPress={() => handleResolveNotification(n.id)}
                                >
                                  <Text style={styles.resolveAlertButtonText}>
                                    {rtl ? 'حل التنبيه' : 'Resolve'}
                                  </Text>
                                </TouchableOpacity>
                              ) : (
                                <Text style={styles.resolvedBadgeText}>
                                  {rtl ? 'تم الحل' : 'Resolved'}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              {/* SUBVIEW: OPERATIONAL REPORTS */}
              {moreSection === 'reports' && (
                <View style={{ flex: 1 }}>
                  {/* Preset Selector */}
                  <View style={[styles.presetSelectorRow, { flexDirection: rowDir }]}>
                    {(['today', 'yesterday', '7days', '30days'] as const).map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.presetChip, reportPreset === p && styles.presetChipActive]}
                        onPress={() => {
                          setReportPreset(p);
                          loadReports(p);
                        }}
                      >
                        <Text style={[styles.presetChipText, reportPreset === p && styles.presetChipTextActive]}>
                          {p === 'today'
                            ? rtl ? 'اليوم' : 'Today'
                            : p === 'yesterday'
                            ? rtl ? 'الأمس' : 'Yesterday'
                            : p === '7days'
                            ? rtl ? '7 أيام' : '7 Days'
                            : rtl ? '30 يوماً' : '30 Days'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <ScrollView contentContainerStyle={styles.subviewScroll}>
                    {reportLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
                    ) : !reportData ? (
                      <Text style={styles.emptyText}>{rtl ? 'لا توجد بيانات متاحة' : 'No report data'}</Text>
                    ) : (
                      <>
                        {/* Summary Metrics Grid */}
                        <View style={styles.metricsGrid}>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricLabel}>{rtl ? 'إجمالي الورديات' : 'Shifts'}</Text>
                            <Text style={styles.metricVal}>{formatWesternNumber(reportData.summary?.totalShifts ?? 0)}</Text>
                          </View>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricLabel}>{rtl ? 'المسافة' : 'Distance'}</Text>
                            <Text style={[styles.metricVal, { color: colors.primary }]}>
                              {formatWesternNumber(((reportData.summary?.totalDistanceMeters ?? 0) / 1000).toFixed(1))} {rtl ? 'كم' : 'km'}
                            </Text>
                          </View>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricLabel}>{rtl ? 'ساعات العمل' : 'Duration'}</Text>
                            <Text style={styles.metricVal}>
                              {formatWesternNumber(Math.round((reportData.summary?.totalDurationMinutes ?? 0) / 60))}{rtl ? 'س' : 'h'}
                            </Text>
                          </View>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricLabel}>{rtl ? 'وقت الحركة' : 'Moving'}</Text>
                            <Text style={[styles.metricVal, { color: colors.status.online }]}>
                              {formatWesternNumber(Math.round(((reportData.summary?.movingDurationMinutes ?? reportData.summary?.totalMovingMinutes ?? 0)) / 60))}{rtl ? 'س' : 'h'}
                            </Text>
                          </View>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricLabel}>{rtl ? 'وقت التوقف' : 'Stopped'}</Text>
                            <Text style={[styles.metricVal, { color: colors.status.warning }]}>
                              {formatWesternNumber(Math.round(((reportData.summary?.stoppedDurationMinutes ?? reportData.summary?.totalStoppedMinutes ?? 0)) / 60))}{rtl ? 'س' : 'h'}
                            </Text>
                          </View>
                          <View style={styles.metricCard}>
                            <Text style={styles.metricLabel}>{rtl ? 'التنبيهات' : 'Alerts'}</Text>
                            <Text style={[styles.metricVal, { color: colors.status.critical }]}>
                              {formatWesternNumber(reportData.summary?.alertCount ?? reportData.summary?.totalAlerts ?? 0)}
                            </Text>
                          </View>
                        </View>

                        {/* Driver Breakdown Header */}
                        <Text style={[styles.moreGroupTitle, { textAlign: rtl ? 'right' : 'left', marginTop: 16 }]}>
                          {rtl ? 'تفاصيل أداء السائقين' : 'Driver Breakdown'}
                        </Text>

                        {((reportData.drivers ?? reportData.driverBreakdown ?? [])).map((drv: any) => (
                          <View key={drv.driverId} style={styles.deviceCard}>
                            <View style={[styles.rowBetween, { flexDirection: rowDir }]}>
                              <Text style={styles.deviceDriverName}>{drv.driverName}</Text>
                              <Text style={styles.deviceIdText}>{formatWesternNumber(drv.employeeId)}</Text>
                            </View>
                            <View style={[styles.deviceMetaRow, { flexDirection: rowDir, marginTop: 6 }]}>
                              <Text style={styles.deviceMetaItem}>
                                {rtl ? 'الورديات:' : 'Shifts:'} {formatWesternNumber(drv.shiftCount)}
                              </Text>
                              <Text style={[styles.deviceMetaItem, { color: colors.primary, fontWeight: '700' }]}>
                                {formatWesternNumber((((drv.totalDistanceMeters ?? drv.distanceMeters ?? 0)) / 1000).toFixed(1))} {rtl ? 'كم' : 'km'}
                              </Text>
                              <Text style={styles.deviceMetaItem}>
                                {rtl ? 'المدة:' : 'Duration:'} {formatWesternNumber(Math.round(((drv.totalDurationMinutes ?? drv.durationMinutes ?? 0)) / 60))}{rtl ? 'س' : 'h'}
                              </Text>
                              <Text style={[styles.deviceMetaItem, { color: colors.status.critical }]}>
                                {rtl ? 'التنبيهات:' : 'Alerts:'} {formatWesternNumber(drv.alertCount ?? drv.alerts ?? 0)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </>
                    )}
                  </ScrollView>
                </View>
              )}

              {/* SUBVIEW: AUDIT LOG */}
              {moreSection === 'audit' && (
                <View style={{ flex: 1 }}>
                  {/* Entity Filter Selector */}
                  <View style={[styles.presetSelectorRow, { flexDirection: rowDir }]}>
                    {['', 'USER', 'DRIVER', 'DEVICE', 'SETTINGS'].map((ent) => (
                      <TouchableOpacity
                        key={ent}
                        style={[styles.presetChip, auditEntityFilter === ent && styles.presetChipActive]}
                        onPress={() => {
                          setAuditEntityFilter(ent);
                          loadAuditLogs(ent || undefined);
                        }}
                      >
                        <Text style={[styles.presetChipText, auditEntityFilter === ent && styles.presetChipTextActive]}>
                          {ent === ''
                            ? (rtl ? 'الكل' : 'All')
                            : ent === 'USER'
                            ? (rtl ? 'المستخدمين' : 'Users')
                            : ent === 'DRIVER'
                            ? (rtl ? 'السائقين' : 'Drivers')
                            : ent === 'DEVICE'
                            ? (rtl ? 'الأجهزة' : 'Devices')
                            : ent === 'SETTINGS'
                            ? (rtl ? 'الإعدادات' : 'Settings')
                            : ent}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <ScrollView contentContainerStyle={styles.subviewScroll}>
                    {auditLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
                    ) : auditLogs.length === 0 ? (
                      <Text style={styles.emptyText}>{rtl ? 'لا توجد سجلات عمليات' : 'No audit logs found'}</Text>
                    ) : (
                      auditLogs.map((log: any) => {
                        const isDestructive =
                          log.action.includes('DELETE') ||
                          log.action.includes('PERMANENT') ||
                          log.action.includes('FORCE_END');
                        return (
                          <View key={log.id} style={styles.deviceCard}>
                            <View style={[styles.rowBetween, { flexDirection: rowDir }]}>
                              <View
                                style={[
                                  styles.severityBadge,
                                  {
                                    backgroundColor: isDestructive ? colors.status.criticalBg : colors.status.onlineBg,
                                    borderColor: isDestructive ? colors.status.criticalBorder : colors.status.onlineBorder,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.severityBadgeText,
                                    { color: isDestructive ? colors.status.critical : colors.status.online },
                                  ]}
                                >
                                  {log.action}
                                </Text>
                              </View>
                              <Text style={styles.deviceMetaItem}>
                                {log.createdAt
                                  ? formatWesternNumber(new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
                                  : ''}
                              </Text>
                            </View>
                            <View style={[styles.deviceMetaRow, { flexDirection: rowDir, marginTop: 4 }]}>
                              <Text style={styles.deviceDriverName}>{log.actorEmail || log.userName || 'System'}</Text>
                              <Text style={styles.deviceIdText}>
                                {log.actorRole || log.userRole ? `${log.entityType} (${log.actorRole || log.userRole})` : log.entityType}
                              </Text>
                            </View>
                            {log.details && (
                              <Text style={[styles.notificationMessage, { marginTop: 4, fontFamily: 'monospace', fontSize: 10 }]}>
                                {JSON.stringify(log.details)}
                              </Text>
                            )}
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>

      {/* Screen-Fitted Bottom Tab Bar */}
      <BottomTabBar
        tabs={bottomTabs}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setActiveTab(tabId as MainTab);
          if (tabId === 'more') setMoreSection('menu');
        }}
      />

      {/* Driver Detail Modal with explicit freshness */}
      <DriverDetailModal
        visible={driverModalVisible}
        driver={selectedDriver}
        isAdmin={true}
        onClose={() => setDriverModalVisible(false)}
        onDeviceReset={handleDeviceReset}
        onForceEndShift={handleForceEndShift}
        apiRequest={apiRequest}
      />

      {/* Edit User Modal */}
      <Modal
        visible={editUserModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditUserModalVisible(false)}
      >
        <SafeAreaView style={styles.editModalContainer}>
          <View style={styles.editModalContent}>
            <View style={[styles.editModalHeader, { flexDirection: rowDir }]}>
              <Text style={styles.editModalTitle}>
                {rtl ? 'تعديل بيانات المستخدم' : 'Edit User'}
              </Text>
              <TouchableOpacity onPress={() => setEditUserModalVisible(false)} style={styles.closeButton}>
                <AppIcon name="close" size={16} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.editModalBody}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {rtl ? 'اسم المستخدم *' : 'User Name *'}
                </Text>
                <TextInput
                  value={editUserName}
                  onChangeText={setEditUserName}
                  style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {rtl ? 'البريد الإلكتروني *' : 'Email *'}
                </Text>
                <TextInput
                  value={editUserEmail}
                  onChangeText={setEditUserEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {rtl ? 'رقم الهاتف' : 'Phone'}
                </Text>
                <TextInput
                  value={editUserPhone}
                  onChangeText={setEditUserPhone}
                  keyboardType="phone-pad"
                  style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {rtl ? 'الدور الوظيفي' : 'Role'}
                </Text>
                <View style={{ flexDirection: rowDir, gap: 8 }}>
                  {(['DRIVER', 'CALL_CENTER', 'ADMIN'] as const).map((r) => {
                    const isSelected = editUserRole === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setEditUserRole(r)}
                        style={[
                          styles.roleSelectChip,
                          isSelected && styles.roleSelectChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleSelectChipText,
                            isSelected && styles.roleSelectChipTextActive,
                          ]}
                        >
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {editUserRole === 'DRIVER' && (
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                    {rtl ? 'الرقم الوظيفي *' : 'Employee ID *'}
                  </Text>
                  <TextInput
                    value={editUserEmployeeId}
                    onChangeText={setEditUserEmployeeId}
                    placeholder="e.g. 101"
                    placeholderTextColor={colors.text.muted}
                    style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { textAlign: rtl ? 'right' : 'left' }]}>
                  {rtl ? 'تغيير كلمة المرور (اختياري - 8 أحرف على الأقل)' : 'New Password (Optional - min 8 chars)'}
                </Text>
                <TextInput
                  value={editUserPassword}
                  onChangeText={setEditUserPassword}
                  secureTextEntry
                  placeholder={rtl ? 'اتركه فارغاً للاحتفاظ بالقديمة' : 'Leave blank to keep unchanged'}
                  placeholderTextColor={colors.text.muted}
                  style={[styles.textInput, { textAlign: rtl ? 'right' : 'left' }]}
                />
              </View>

              <View style={styles.inputGroup}>
                <TouchableOpacity
                  onPress={() => setEditUserActive(!editUserActive)}
                  style={[
                    styles.activeToggleRow,
                    { flexDirection: rowDir },
                  ]}
                >
                  <Text style={styles.inputLabel}>
                    {rtl ? 'حساب نشط' : 'Active Account'}
                  </Text>
                  <View
                    style={[
                      styles.toggleTrack,
                      { backgroundColor: editUserActive ? colors.primary : '#cbd5e1' },
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        { alignSelf: editUserActive ? 'flex-end' : 'flex-start' },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: rowDir, gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  onPress={() => setEditUserModalVisible(false)}
                  style={styles.cancelEditBtn}
                >
                  <Text style={styles.cancelEditBtnText}>{t('app.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveEditUser}
                  disabled={savingUser}
                  style={[styles.saveEditBtn, savingUser && styles.disabledButton]}
                >
                  {savingUser ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.saveEditBtnText}>{t('app.save')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Unified TrackerDialog */}
      <TrackerDialog
        visible={dialogConfig.visible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        primaryButtonText={dialogConfig.primaryButtonText}
        secondaryButtonText={dialogConfig.secondaryButtonText}
        onPrimaryPress={dialogConfig.onPrimaryPress}
        onSecondaryPress={dialogConfig.onSecondaryPress}
        isDestructive={dialogConfig.isDestructive}
        loading={dialogConfig.loading}
        onClose={() => setDialogConfig((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  scrollContainer: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionActionLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCard: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    ...shadows.card,
  },
  kpiLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#ffedd5',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  alertCountBadge: {
    backgroundColor: colors.status.critical,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  alertCountText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  alertBody: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
  },
  alertMessage: {
    fontSize: 11,
    color: '#c2410c',
  },
  alertTime: {
    fontSize: 10,
    color: '#ea580c',
  },
  mapPreviewFrame: {
    height: 190,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  driverRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  driverStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverMeta: {
    fontSize: 10,
    color: colors.text.muted,
  },
  driverTelemetryCol: {
    minWidth: 70,
  },
  driverSpeedText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverBatteryText: {
    fontSize: 10,
    color: colors.text.muted,
  },
  mapScreenContainer: {
    flex: 1,
  },
  filterBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  driversScreenContainer: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    paddingVertical: 4,
  },
  driversListContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  operationalDriverCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    ...shadows.card,
  },
  driverStatusCol: {
    minWidth: 68,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
    alignItems: 'center',
  },
  statusBadgePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  employeeIdLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
    marginTop: 1,
  },
  driverMainCol: {
    flex: 1,
    justifyContent: 'center',
  },
  cardDriverName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardDriverFreshness: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 1,
  },
  driverRightCol: {
    minWidth: 60,
  },
  driverCardSpeed: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  driverCardBattery: {
    fontSize: 10,
    color: colors.text.muted,
  },
  chevronCol: {
    paddingHorizontal: 2,
  },
  moreContainer: {
    flex: 1,
  },
  moreGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  moreGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  moreRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moreRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  moreRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  moreBadge: {
    backgroundColor: colors.status.critical,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  moreBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  subviewHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  subviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  markAllReadButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markAllReadText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  subviewScroll: {
    padding: spacing.md,
    gap: spacing.md,
  },
  deviceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    ...shadows.card,
  },
  deviceCardHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceDriverName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  deviceIdText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.text.muted,
  },
  authBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  authBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  deviceMetaRow: {
    justifyContent: 'space-between',
    marginTop: 4,
  },
  deviceMetaItem: {
    fontSize: 10,
    color: colors.text.muted,
  },
  deviceResetButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.xs,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 6,
  },
  deviceResetButtonText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
  },
  userRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.card,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  userPhone: {
    fontSize: 11,
    color: colors.text.muted,
  },
  userRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  userRoleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.card,
  },
  settingsCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  textInput: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text.primary,
  },
  primarySaveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.card,
  },
  primarySaveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  notificationCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
    ...shadows.card,
  },
  unreadNotification: {
    borderColor: colors.primary,
    backgroundColor: '#f0fdfa',
  },
  notificationHeaderRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  unreadPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  unreadPillText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  notificationMessage: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  notificationTime: {
    fontSize: 10,
    color: colors.text.muted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: spacing.sm,
  },
  emptyStateText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.text.muted,
    marginVertical: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  stateCenterContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: '#f8fafc',
  },
  stateLoadingText: {
    marginTop: spacing.md,
    fontSize: typography.body.fontSize,
    color: colors.text.muted,
    fontWeight: '500',
  },
  stateErrorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: '#f8fafc',
  },
  stateErrorTitle: {
    marginTop: spacing.md,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
    color: colors.text.primary,
    textAlign: 'center',
  },
  stateErrorMessage: {
    marginTop: spacing.xs,
    fontSize: typography.meta.fontSize,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
  },
  primaryRetryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryRetryButtonText: {
    color: '#ffffff',
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  notificationsToolbar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  userActionEditButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userActionEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  userActionDeleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userActionDeleteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  editModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  editModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  editModalHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  editModalBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  roleSelectChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleSelectChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleSelectChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  roleSelectChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  activeToggleRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  cancelEditBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  saveEditBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveEditBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  severityBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  resolveAlertButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  resolveAlertButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  resolvedBadgeText: {
    color: colors.status.online,
    fontSize: 10,
    fontWeight: '700',
  },
  presetSelectorRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipActive: {
    backgroundColor: colors.primary,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
  },
  presetChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  metricCard: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.text.muted,
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
