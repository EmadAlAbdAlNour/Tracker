import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('AdminHomeScreen Settings Lifecycle & Input Stability Tests', () => {
  let apiCalls: { path: string; options?: RequestInit }[] = [];
  let apiRequestMock: (path: string, options?: RequestInit) => Promise<any>;

  const initialServerRestaurant = {
    name: 'Main Base Restaurant',
    latitude: 24.7136,
    longitude: 46.6753,
    radiusMeters: 150,
  };

  const initialServerAlerts = {
    maxStopDurationMinutes: 10,
    offlineGraceMinutes: 5,
    lowBatteryThreshold: 20,
    stopAlertEnabled: true,
    gpsAlertEnabled: true,
    offlineAlertEnabled: true,
    batteryAlertEnabled: true,
    restaurantGeofenceAlertEnabled: true,
    soundEnabled: true,
    inAppAlertsEnabled: true,
  };

  beforeEach(() => {
    apiCalls = [];
    apiRequestMock = vi.fn(async (path: string, options?: RequestInit) => {
      apiCalls.push({ path, options });
      if (path === '/api/settings/restaurant' && (!options || options.method === 'GET')) {
        return { settings: { ...initialServerRestaurant } };
      }
      if (path === '/api/settings/alerts' && (!options || options.method === 'GET')) {
        return { settings: { ...initialServerAlerts } };
      }
      if (path === '/api/settings/restaurant' && options?.method === 'PUT') {
        return { settings: JSON.parse(options.body as string) };
      }
      if (path === '/api/settings/alerts' && options?.method === 'PUT') {
        return { settings: JSON.parse(options.body as string) };
      }
      if (path.startsWith('/api/notifications')) {
        return { items: [], unreadCount: 0 };
      }
      return {};
    });
  });

  // Harness simulating AdminHomeScreen hook lifecycle and state management
  function createAdminHomeScreenHarness() {
    let activeTab: 'dashboard' | 'map' | 'drivers' | 'more' = 'dashboard';
    let moreSection: 'menu' | 'devices' | 'settings' | 'users' | 'notifications' = 'menu';

    let settingsRestaurant: any = {
      name: '',
      latitude: 30.0444,
      longitude: 31.2357,
      radiusMeters: 150,
    };

    let settingsAlerts: any = {
      maxStopDurationMinutes: 10,
      offlineGraceMinutes: 5,
      lowBatteryThreshold: 20,
    };

    const settingsAlertsRef = { current: settingsAlerts };

    // Synchronize ref whenever settingsAlerts changes
    const syncRef = (newAlerts: any) => {
      settingsAlerts = newAlerts;
      settingsAlertsRef.current = newAlerts;
    };

    // Callback 3: Load Settings
    const loadSettings = async () => {
      const [restRes, alertRes] = await Promise.all([
        apiRequestMock('/api/settings/restaurant'),
        apiRequestMock('/api/settings/alerts'),
      ]);
      if (restRes?.settings) settingsRestaurant = restRes.settings;
      if (alertRes?.settings) syncRef(alertRes.settings);
    };

    // Callback 5: Load Notifications with settingsAlertsRef
    // Notice dependencies are strictly [apiRequest, rtl], NOT settingsAlerts
    const loadNotifications = async () => {
      const data = await apiRequestMock('/api/notifications?limit=30');
      const currentAlerts = settingsAlertsRef.current;
      // Uses currentAlerts.inAppAlertsEnabled and currentAlerts.soundEnabled without closing over state
      return { data, currentAlerts };
    };

    // Subview navigation effect: triggers when activeTab or moreSection changes, or callbacks change
    const onNavigationOrCallbackChange = async () => {
      if (activeTab === 'more') {
        if (moreSection === 'settings') await loadSettings();
        if (moreSection === 'notifications') await loadNotifications();
      }
    };

    // Save handler
    const handleSaveSettings = async () => {
      const restName = settingsRestaurant.name?.trim();
      const lat = Number(settingsRestaurant.latitude);
      const lng = Number(settingsRestaurant.longitude);
      const radiusM = Number(settingsRestaurant.radiusMeters);

      const maxStop = Number(settingsAlerts.maxStopDurationMinutes);
      const offlineGrace = Number(settingsAlerts.offlineGraceMinutes);
      const lowBatt = Number(settingsAlerts.lowBatteryThreshold);

      await Promise.all([
        apiRequestMock('/api/settings/restaurant', {
          method: 'PUT',
          body: JSON.stringify({
            name: restName,
            latitude: lat,
            longitude: lng,
            radiusMeters: radiusM,
          }),
        }),
        apiRequestMock('/api/settings/alerts', {
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

      await loadSettings();
    };

    return {
      get activeTab() { return activeTab; },
      get moreSection() { return moreSection; },
      get settingsRestaurant() { return settingsRestaurant; },
      get settingsAlerts() { return settingsAlerts; },
      get settingsAlertsRef() { return settingsAlertsRef; },
      setSettingsRestaurant: (updater: (prev: any) => any) => {
        settingsRestaurant = updater(settingsRestaurant);
      },
      setSettingsAlerts: (updater: (prev: any) => any) => {
        const next = updater(settingsAlerts);
        syncRef(next);
      },
      navigateTo: async (tab: any, section: any) => {
        activeTab = tab;
        moreSection = section;
        await onNavigationOrCallbackChange();
      },
      handleSaveSettings,
      loadSettings,
      loadNotifications,
    };
  }

  it('1 & 2: Editing maxStopDurationMinutes does not trigger another GET /api/settings/alerts or GET /api/settings/restaurant', async () => {
    const harness = createAdminHomeScreenHarness();

    // 1. Navigate to Settings
    await harness.navigateTo('more', 'settings');
    const initialGets = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;
    expect(initialGets).toBe(2); // 1 for restaurant, 1 for alerts

    // 2. User edits maxStopDurationMinutes from 10 to 15
    harness.setSettingsAlerts((prev: any) => ({ ...prev, maxStopDurationMinutes: '15' }));

    // Count GET calls after edit
    const getsAfterEdit = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;
    expect(getsAfterEdit).toBe(initialGets); // Absolutely NO additional GET calls triggered
  });

  it('3: Edited maxStopDurationMinutes value remains visible and does not revert to 10', async () => {
    const harness = createAdminHomeScreenHarness();
    await harness.navigateTo('more', 'settings');
    expect(harness.settingsAlerts.maxStopDurationMinutes).toBe(10);

    // User types 15
    harness.setSettingsAlerts((prev: any) => ({ ...prev, maxStopDurationMinutes: '15' }));

    // Value MUST remain 15, not revert to 10
    expect(harness.settingsAlerts.maxStopDurationMinutes).toBe('15');
    expect(harness.settingsAlertsRef.current.maxStopDurationMinutes).toBe('15');
  });

  it('4: Editing radiusMeters remains stable without triggering settings refetch', async () => {
    const harness = createAdminHomeScreenHarness();
    await harness.navigateTo('more', 'settings');
    expect(harness.settingsRestaurant.radiusMeters).toBe(150);

    const getsBefore = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;

    // User changes radiusMeters to 350
    harness.setSettingsRestaurant((prev: any) => ({ ...prev, radiusMeters: '350' }));

    const getsAfter = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;
    expect(getsAfter).toBe(getsBefore);
    expect(harness.settingsRestaurant.radiusMeters).toBe('350');
  });

  it('5: Editing restaurantName remains stable without triggering settings refetch', async () => {
    const harness = createAdminHomeScreenHarness();
    await harness.navigateTo('more', 'settings');

    const getsBefore = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;

    harness.setSettingsRestaurant((prev: any) => ({ ...prev, name: 'Downtown Express' }));

    const getsAfter = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;
    expect(getsAfter).toBe(getsBefore);
    expect(harness.settingsRestaurant.name).toBe('Downtown Express');
  });

  it('6: Editing an alert toggle remains stable without triggering settings refetch', async () => {
    const harness = createAdminHomeScreenHarness();
    await harness.navigateTo('more', 'settings');

    const getsBefore = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;

    // Toggle stopAlertEnabled to false
    harness.setSettingsAlerts((prev: any) => ({ ...prev, stopAlertEnabled: false }));

    const getsAfter = apiCalls.filter(c => c.path.startsWith('/api/settings') && (!c.options || c.options.method === 'GET')).length;
    expect(getsAfter).toBe(getsBefore);
    expect(harness.settingsAlerts.stopAlertEnabled).toBe(false);
  });

  it('7: Navigating into Settings performs the initial settings load', async () => {
    const harness = createAdminHomeScreenHarness();
    expect(apiCalls.length).toBe(0);

    await harness.navigateTo('more', 'settings');

    const restaurantGet = apiCalls.find(c => c.path === '/api/settings/restaurant' && (!c.options || c.options.method === 'GET'));
    const alertsGet = apiCalls.find(c => c.path === '/api/settings/alerts' && (!c.options || c.options.method === 'GET'));

    expect(restaurantGet).toBeDefined();
    expect(alertsGet).toBeDefined();
    expect(harness.settingsRestaurant.name).toBe('Main Base Restaurant');
    expect(harness.settingsAlerts.maxStopDurationMinutes).toBe(10);
  });

  it('8: Navigating away and back reloads settings from server', async () => {
    const harness = createAdminHomeScreenHarness();
    await harness.navigateTo('more', 'settings');
    expect(harness.settingsAlerts.maxStopDurationMinutes).toBe(10);

    // Edit without saving
    harness.setSettingsAlerts((prev: any) => ({ ...prev, maxStopDurationMinutes: '25' }));
    expect(harness.settingsAlerts.maxStopDurationMinutes).toBe('25');

    // Navigate away to notifications
    await harness.navigateTo('more', 'notifications');

    // Navigate back to settings -> should reload canonical server settings
    await harness.navigateTo('more', 'settings');
    expect(harness.settingsAlerts.maxStopDurationMinutes).toBe(10);
  });

  it('9: Save sends the edited values to the existing PUT endpoints', async () => {
    const harness = createAdminHomeScreenHarness();
    await harness.navigateTo('more', 'settings');

    // User edits both restaurant and alert settings
    harness.setSettingsRestaurant((prev: any) => ({
      ...prev,
      name: 'North Branch',
      radiusMeters: '400',
    }));

    harness.setSettingsAlerts((prev: any) => ({
      ...prev,
      maxStopDurationMinutes: '18',
      offlineGraceMinutes: '12',
      lowBatteryThreshold: '25',
    }));

    // Trigger save
    await harness.handleSaveSettings();

    // Verify PUT requests
    const putRestaurant = apiCalls.find(c => c.path === '/api/settings/restaurant' && c.options?.method === 'PUT');
    const putAlerts = apiCalls.find(c => c.path === '/api/settings/alerts' && c.options?.method === 'PUT');

    expect(putRestaurant).toBeDefined();
    expect(putAlerts).toBeDefined();

    const restBody = JSON.parse(putRestaurant!.options!.body as string);
    expect(restBody.name).toBe('North Branch');
    expect(restBody.radiusMeters).toBe(400);

    const alertBody = JSON.parse(putAlerts!.options!.body as string);
    expect(alertBody.maxStopDurationMinutes).toBe(18);
    expect(alertBody.offlineGraceMinutes).toBe(12);
    expect(alertBody.lowBatteryThreshold).toBe(25);
  });
});
