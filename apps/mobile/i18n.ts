import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCALE_STORAGE_KEY = 'tracker_mobile_locale';

export type Locale = 'ar' | 'en';

let currentLocale: Locale = 'ar';

export const translations = {
  ar: {
    app: {
      title: 'تطبيق السائق',
      subtitle: 'سجل الدخول لبدء وردية العمل',
      adminTitle: 'لوحة التحكم الإدارية',
      adminSubtitle: 'الإشراف الشامل على الأسطول والأجهزة والإعدادات',
      callCenterTitle: 'مركز مراقبة العمليات',
      callCenterSubtitle: 'المراقبة الحية لحركة السائقين والأسطول',
      operatorTitle: 'لوحة التشغيل والمراقبة',
      operatorSubtitle: 'مراقبة حالة السائقين والأسطول الميداني',
      logout: 'تسجيل الخروج',
      sync: 'مزامنة البيانات الآن',
      synced: 'تمت المزامنة بنجاح',
      syncError: 'تعذر الاتصال بالخادم، سيتم المحاولة لاحقاً',
      returnToLogin: 'العودة لتسجيل الدخول',
      notice: 'تنبيه',
      warning: 'تحذير',
      error: 'خطأ',
      save: 'حفظ التغييرات',
      cancel: 'إلغاء',
      close: 'إغلاق',
      loading: 'جاري التحميل...',
    },
    login: {
      emailOrPhone: 'البريد الإلكتروني أو الهاتف',
      password: 'كلمة المرور',
      signIn: 'تسجيل الدخول',
      signingIn: 'جاري تسجيل الدخول...',
      enterCredentials: 'يرجى إدخال اسم المستخدم وكلمة المرور',
      invalidSession: 'جلسة تسجيل الدخول غير صالحة.',
      roleNotAllowed: 'الدور غير مسموح به في هذا التطبيق.',
      failed: 'فشل تسجيل الدخول',
    },
    shift: {
      title: 'حالة الوردية والتتبع',
      onDuty: 'على رأس العمل',
      offDuty: 'خارج الوردية',
      startShift: 'بدء الوردية (تفعيل التتبع)',
      endShift: 'إنهاء الوردية (إيقاف التتبع)',
      started: 'تم بدء الوردية',
      ended: 'تم إنهاء الوردية',
      activeTrackingNotice: 'نظام التتبع يرسل موقعك تلقائياً للوحة التحكم لضمان سلامة العمليات.',
      inactiveNotice: 'اضغط أدناه لبدء الوردية وتفعيل تتبع الموقع الجغرافي.',
      endShiftFirst: 'يرجى إنهاء الوردية أولاً قبل تسجيل الخروج.',
      bgPermissionRequiredTitle: 'إذن الموقع في الخلفية مطلوب',
      bgPermissionRequiredMessage: 'يتطلب تتبع السائق السماح بالوصول للموقع الجغرافي "طوال الوقت" (Allow all the time) ليعمل أثناء استخدام تطبيقات أخرى أو قفل الشاشة.',
    },
    diagnostics: {
      title: 'بيانات الاتصال والمزامنة',
      trackingStatus: 'حالة التتبع:',
      queuedLocations: 'نقاط الموقع المخزنة بالهاتف:',
      active: 'نشط',
      inactive: 'معطل',
      employeeId: 'الرقم الوظيفي:',
      driver: 'سائق',
    },
    driverStates: {
      OFF_DUTY: 'خارج الوردية',
      SHIFT_ACTIVE: 'الوردية نشطة',
      TRACKING_ACTIVE: 'التتبع المباشر نشط',
      GPS_DISABLED: 'خدمة الموقع معطلة',
      NETWORK_OFFLINE: 'غير متصل بالشبكة (تخزين محلي)',
      SYNC_PENDING: 'بيانات بانتظار المزامنة',
      SYNCING: 'جاري مزامنة المواقع...',
      DEVICE_UNAUTHORIZED: 'الجهاز غير مصرح أو تم إعادة تعيينه',
      instructionsOffDuty: 'اضغط أدناه لبدء الوردية وتفعيل التتبع الميداني.',
      instructionsActive: 'التتبع المباشر نشط ويعمل في الخلفية أثناء القيادة.',
      instructionsOffline: 'تم فقد الاتصال بالإنترنت، يتم حفظ المواقع محلياً على الجهاز.',
      instructionsGpsOff: 'يرجى تفعيل خدمة تحديد الموقع (GPS) من إعدادات الهاتف لمواصلة التتبع.',
    },
    operator: {
      activeShifts: 'الورديات النشطة',
      online: 'متصل',
      moving: 'متحرك',
      stopped: 'متوقف',
      atRestaurant: 'بالمطعم',
      offline: 'غير متصل',
      battery: 'البطارية',
      lastSeen: 'آخر ظهور',
      refresh: 'تحديث البيانات',
      noDrivers: 'لا يوجد سائقون مسجلون حالياً',
      totalDrivers: 'إجمالي السائقين',
      lowBattery: 'بطارية منخفضة',
    },
    admin: {
      dashboard: 'الرئيسية',
      map: 'الخريطة',
      drivers: 'السائقين',
      devices: 'الأجهزة',
      settings: 'الإعدادات',
      users: 'المستخدمين',
      notifications: 'الإشعارات',
      alerts: 'التنبيهات',
      deviceManagement: 'إدارة الأجهزة المعتمدة',
      resetDevice: 'إعادة تعيين الجهاز',
      confirmResetTitle: 'تأكيد إعادة تعيين الجهاز',
      confirmResetMessage: 'هل أنت متأكد من رغبتك في إلغاء اعتماد هذا الجهاز؟ سيتعين على السائق تسجيل الدخول مجدداً.',
      resetSuccess: 'تمت إعادة تعيين الجهاز بنجاح',
      resetFailed: 'فشلت عملية إعادة تعيين الجهاز',
      platform: 'نظام التشغيل',
      appVersion: 'إصدار التطبيق',
      authorized: 'معتمد',
      unauthorized: 'غير معتمد',
      lastLocationAt: 'آخر موقع مسجل',
      never: 'أبداً',
      restaurantSettings: 'إعدادات المطعم والنطاق الجغرافي',
      restaurantName: 'اسم المطعم',
      geofenceRadius: 'نصف قطر النطاق (أمتار)',
      latitude: 'خط العرض (Latitude)',
      longitude: 'خط الطول (Longitude)',
      saveSettingsSuccess: 'تم حفظ الإعدادات بنجاح',
      saveSettingsFailed: 'فشل حفظ الإعدادات',
      alertThresholds: 'معايير التنبيهات الميدانية',
      maxStopDuration: 'أقصى مدة توقف مسموحة (دقائق)',
      offlineGraceMinutes: 'مهلة انقطاع الاتصال (دقائق)',
      lowBatteryThreshold: 'حد تحذير انخفاض البطارية (%)',
      usersList: 'قائمة مستخدمي النظام',
      role: 'الدور الوظيفي',
      activeStatus: 'الحالة',
      active: 'نشط',
      inactive: 'معطل',
    },
    callCenter: {
      readOnlyBadge: 'مراقبة فقط',
      readOnlyNotice: 'لوحة مركز الاتصال مخصصة للمراقبة والمتابعة الميدانية فقط.',
    },
    driverDetail: {
      title: 'تفاصيل السائق الميداني',
      status: 'الحالة التشغيلية',
      battery: 'مستوى البطارية',
      charging: 'متصل بالشاحن',
      notCharging: 'على البطارية',
      network: 'نوع الشبكة',
      speed: 'السرعة الحالية',
      speedUnit: 'كم/س',
      heading: 'الاتجاه',
      accuracy: 'دقة الـ GPS',
      distanceToRestaurant: 'المسافة إلى المطعم',
      meters: 'متر',
      insideGeofence: 'داخل نطاق المطعم',
      outsideGeofence: 'خارج نطاق المطعم',
      shiftDuration: 'مدة الوردية الحالية',
      noShift: 'لا توجد وردية نشطة حالياً',
      deviceInfo: 'معلومات الجهاز المسجل',
      deviceId: 'معرف الجهاز',
      resetDeviceAction: 'إلغاء تفويض الجهاز وإعادة التعيين',
    },
    map: {
      title: 'الخريطة الميدانية التفاعلية',
      centerRestaurant: 'المطعم',
      zoomIn: '+',
      zoomOut: '-',
      geofenceBoundary: 'نطاق المطعم الجغرافي',
      driverCountOnMap: 'السائقون على الخريطة:',
      selectDriverPrompt: 'اضغط على السائق في الخريطة لعرض تفاصيله',
      noDriversCoordinates: 'لا توجد إحداثيات موقع متاحة حالياً لأي سائق.',
    },
    notifications: {
      title: 'الإشعارات والتنبيهات',
      markAllRead: 'تحديد الكل كمقروء',
      markReadSuccess: 'تم تحديث حالة الإشعارات',
      noNotifications: 'لا توجد إشعارات جديدة حالياً',
      unread: 'جديد',
    },
  },
  en: {
    app: {
      title: 'Driver Tracker',
      subtitle: 'Sign in to start your shift',
      adminTitle: 'Admin Operations Console',
      adminSubtitle: 'Full fleet oversight, device control, and settings',
      callCenterTitle: 'Operations Dispatch Center',
      callCenterSubtitle: 'Real-time fleet monitoring and driver safety',
      operatorTitle: 'Operations & Fleet Console',
      operatorSubtitle: 'Real-time monitoring of active drivers and fleet',
      logout: 'Log Out',
      sync: 'Sync Now',
      synced: 'Queued locations sent successfully',
      syncError: 'Could not connect to server, will retry later',
      returnToLogin: 'Return to Login',
      notice: 'Notice',
      warning: 'Warning',
      error: 'Error',
      save: 'Save Changes',
      cancel: 'Cancel',
      close: 'Close',
      loading: 'Loading...',
    },
    login: {
      emailOrPhone: 'Email or Phone',
      password: 'Password',
      signIn: 'Sign In',
      signingIn: 'Signing in...',
      enterCredentials: 'Please enter credentials',
      invalidSession: 'Invalid login session payload.',
      roleNotAllowed: 'This role is not allowed in this app.',
      failed: 'Login Failed',
    },
    shift: {
      title: 'Shift & Tracking',
      onDuty: 'ON DUTY',
      offDuty: 'OFF DUTY',
      startShift: 'Start Shift (Start Tracking)',
      endShift: 'End Shift (Stop Tracking)',
      started: 'Shift Started',
      ended: 'Shift Ended',
      activeTrackingNotice: 'Background GPS tracking is actively transmitting your location.',
      inactiveNotice: 'Press below to start your operational shift and GPS tracking.',
      endShiftFirst: 'Please end your active shift before logging out.',
      bgPermissionRequiredTitle: 'Background Location Required',
      bgPermissionRequiredMessage: 'Driver tracking requires "Allow all the time" location access to keep recording when the app is minimized or screen is locked.',
    },
    diagnostics: {
      title: 'Sync & Diagnostics',
      trackingStatus: 'Tracking Status:',
      queuedLocations: 'Queued Locations:',
      active: 'Active',
      inactive: 'Inactive',
      employeeId: 'Employee ID:',
      driver: 'Driver',
    },
    driverStates: {
      OFF_DUTY: 'Off Duty',
      SHIFT_ACTIVE: 'Shift Active',
      TRACKING_ACTIVE: 'Live Tracking Active',
      GPS_DISABLED: 'GPS Disabled',
      NETWORK_OFFLINE: 'Network Offline (Queueing)',
      SYNC_PENDING: 'Sync Pending',
      SYNCING: 'Syncing Locations...',
      DEVICE_UNAUTHORIZED: 'Device Unauthorized',
      instructionsOffDuty: 'Press below to start your operational shift and begin tracking.',
      instructionsActive: 'GPS tracking is active and transmitting in the background.',
      instructionsOffline: 'No internet connection. Locations are stored locally and will sync when reconnected.',
      instructionsGpsOff: 'Please enable Location Services (GPS) in phone settings to continue tracking.',
    },
    operator: {
      activeShifts: 'Active Shifts',
      online: 'Online',
      moving: 'Moving',
      stopped: 'Stopped',
      atRestaurant: 'At Restaurant',
      offline: 'Offline',
      battery: 'Battery',
      lastSeen: 'Last Seen',
      refresh: 'Refresh',
      noDrivers: 'No drivers registered currently',
      totalDrivers: 'Total Drivers',
      lowBattery: 'Low Battery',
    },
    admin: {
      dashboard: 'Dashboard',
      map: 'Live Map',
      drivers: 'Drivers',
      devices: 'Devices',
      settings: 'Settings',
      users: 'Users',
      notifications: 'Notifications',
      alerts: 'Alerts',
      deviceManagement: 'Authorized Devices Management',
      resetDevice: 'Reset Device',
      confirmResetTitle: 'Confirm Device Reset',
      confirmResetMessage: 'Are you sure you want to de-authorize this device? The driver must sign in again.',
      resetSuccess: 'Device reset successfully',
      resetFailed: 'Failed to reset device',
      platform: 'Platform',
      appVersion: 'App Version',
      authorized: 'Authorized',
      unauthorized: 'Unauthorized',
      lastLocationAt: 'Last Location',
      never: 'Never',
      restaurantSettings: 'Restaurant & Geofence Settings',
      restaurantName: 'Restaurant Name',
      geofenceRadius: 'Geofence Radius (meters)',
      latitude: 'Latitude',
      longitude: 'Longitude',
      saveSettingsSuccess: 'Settings saved successfully',
      saveSettingsFailed: 'Failed to save settings',
      alertThresholds: 'Fleet Alert Thresholds',
      maxStopDuration: 'Max Stop Duration (minutes)',
      offlineGraceMinutes: 'Offline Grace (minutes)',
      lowBatteryThreshold: 'Low Battery Alert Threshold (%)',
      usersList: 'System Users',
      role: 'Role',
      activeStatus: 'Status',
      active: 'Active',
      inactive: 'Inactive',
    },
    callCenter: {
      readOnlyBadge: 'Read-Only Monitoring',
      readOnlyNotice: 'The Call Center console is strictly for operational monitoring and driver safety.',
    },
    driverDetail: {
      title: 'Driver Operational Profile',
      status: 'Operational Status',
      battery: 'Battery Level',
      charging: 'Charging',
      notCharging: 'On Battery',
      network: 'Network Type',
      speed: 'Current Speed',
      speedUnit: 'km/h',
      heading: 'Heading',
      accuracy: 'GPS Accuracy',
      distanceToRestaurant: 'Distance to Restaurant',
      meters: 'm',
      insideGeofence: 'Inside Restaurant Geofence',
      outsideGeofence: 'Outside Geofence',
      shiftDuration: 'Current Shift Duration',
      noShift: 'No active shift',
      deviceInfo: 'Registered Device',
      deviceId: 'Device ID',
      resetDeviceAction: 'Reset & Revoke Device Authorization',
    },
    map: {
      title: 'Live Radar Fleet Map',
      centerRestaurant: 'Restaurant',
      zoomIn: '+',
      zoomOut: '-',
      geofenceBoundary: 'Geofence Boundary',
      driverCountOnMap: 'Drivers on Map:',
      selectDriverPrompt: 'Tap a driver on the map to inspect telemetry',
      noDriversCoordinates: 'No location coordinates available currently for any driver.',
    },
    notifications: {
      title: 'Alerts & Notifications',
      markAllRead: 'Mark All Read',
      markReadSuccess: 'Notifications updated',
      noNotifications: 'No new notifications currently',
      unread: 'New',
    },
  },
};

export async function initLocale(): Promise<Locale> {
  try {
    const saved = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') {
      currentLocale = saved;
    } else {
      currentLocale = 'ar';
    }
  } catch {
    currentLocale = 'ar';
  }
  return currentLocale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export async function setStoredLocale(locale: Locale): Promise<void> {
  currentLocale = locale;
  try {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

export function isRtl(): boolean {
  return currentLocale === 'ar';
}

export function t(path: string): string {
  const parts = path.split('.');
  let current: any = translations[currentLocale] ?? translations.ar;

  for (const part of parts) {
    current = current?.[part];
    if (current == null) {
      // fallback to Arabic
      let fallback: any = translations.ar;
      for (const fPart of parts) {
        fallback = fallback?.[fPart];
      }
      return fallback != null ? String(fallback) : path;
    }
  }

  return String(current);
}

/**
 * Western Digits Formatter (0 1 2 3 4 5 6 7 8 9)
 * Replaces Eastern Arabic numerals (٠-٩) with ASCII Western digits
 */
export function formatWesternNumber(value: number | string | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }
  const str = String(value).replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)] ?? d);
  const num = Number(str);
  if (!isNaN(num)) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  }
  return str;
}
