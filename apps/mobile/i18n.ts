import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

export const LOCALE_STORAGE_KEY = 'tracker_mobile_locale';

export type Locale = 'ar' | 'en';

let currentLocale: Locale = 'ar';

export const translations = {
  ar: {
    app: {
      title: 'Tracker',
      subtitle: 'سجل الدخول لبدء وردية العمل',
      developerAttribution: 'تم التطوير بواسطة عماد عبد النور ❤️',
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
      ok: 'موافق',
      confirm: 'تأكيد',
      close: 'إغلاق',
      yes: 'نعم',
      no: 'لا',
      delete: 'حذف',
      loading: 'جاري التحميل...',
      loadingFleet: 'جاري تحميل بيانات الأسطول...',
      checkingSession: 'جاري التحقق من الجلسة...',
      fleetLoadFailed: 'تعذر تحميل بيانات الأسطول',
      retry: 'إعادة المحاولة',
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
      revokeDevice: 'إلغاء الترخيص',
      unreadNotifications: 'إشعارات جديدة',
      confirmResetTitle: 'تأكيد إلغاء ترخيص الجهاز',
      confirmResetMessage: 'هل أنت متأكد من رغبتك في إلغاء اعتماد هذا الجهاز؟ سيتعين على السائق تسجيل الدخول مجدداً.',
      resetSuccess: 'تم إلغاء ترخيص الجهاز بنجاح',
      resetFailed: 'فشلت عملية إلغاء ترخيص الجهاز',
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
      currentSpeed: 'السرعة الحالية',
      lastRecordedSpeed: 'آخر سرعة مسجلة',
      lastGpsLocation: 'آخر موقع مسجل',
      lastConnection: 'آخر اتصال مسجل',
      gpsSignalAge: 'عمر إشارة الموقع',
      atRestaurant: 'في المطعم',
      stopped: 'متوقف',
      moving: 'في حركة',
      offline: 'غير متصل',
      awaiting: 'في الوردية — بانتظار بيانات الموقع',
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
      telemetry: 'بيانات التتبع اللحظية',
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
      viewDetails: 'عرض التفاصيل',
      noDriversCoordinates: 'لا توجد إحداثيات موقع متاحة حالياً لأي سائق.',
    },
    notifications: {
      title: 'الإشعارات',
      markAllRead: 'تحديد الكل كمقروء',
      markReadSuccess: 'تم تحديث حالة الإشعارات',
      noNotifications: 'لا توجد إشعارات جديدة حالياً',
      unread: 'جديد',
    },
    errors: {
      AUTH_FORBIDDEN: 'تم رفض الوصول. لا تملك الصلاحية لتنفيذ هذا الإجراء.',
      ACCESS_DENIED: 'تم رفض الوصول. لا تملك الصلاحية لتنفيذ هذا الإجراء.',
      AUTH_DEVICE_MISMATCH: 'هذا الحساب مرتبط بجهاز آخر. يجب على المشرف إعادة تعيين الجهاز أولاً.',
      DEVICE_UNAUTHORIZED: 'هذا الجهاز غير مصرح أو تم إلغاء اعتماده من قِبل الإدارة. يرجى تسجيل الدخول مجدداً أو مراجعة المشرف.',
      DRIVER_INACTIVE: 'حساب السائق غير نشط حالياً. يرجى التواصل مع المشرف لتفعيل الحساب.',
      OUTSIDE_GEOFENCE: 'يجب أن يكون السائق داخل نطاق المطعم لبدء الوردية.',
      GEOFENCE_LOCATION_REQUIRED: 'إحداثيات الموقع الحالي مطلوبة لبدء وردية العمل.',
      INVALID_COORDINATES: 'إحداثيات الموقع غير صالحة.',
      SHIFT_START_FAILED: 'تعذر بدء الوردية، يرجى المحاولة مجدداً.',
      SHIFT_END_FAILED: 'تعذر إنهاء وردية العمل، يرجى المحاولة مجدداً.',
      SHIFT_ALREADY_ACTIVE: 'توجد وردية نشطة بالفعل لهذا السائق. يرجى إنهاء الوردية الحالية قبل بدء وردية جديدة.',
      SHIFT_NOT_ACTIVE: 'لا توجد وردية نشطة حالياً. يرجى بدء وردية العمل أولاً لتفعيل التتبع.',
      NO_ACTIVE_SHIFT: 'لا توجد وردية نشطة لإنهائها.',
      EMPLOYEE_ID_REQUIRED: 'الرقم الوظيفي مطلوب للسائق.',
      CANNOT_CHANGE_ROLE_ACTIVE_SHIFT: 'لا يمكن تغيير دور سائق لديه وردية نشطة. يجب إنهاء الوردية أولاً.',
      CANNOT_DEMOTE_DRIVER_WITH_SHIFTS: 'لا يمكن تغيير دور سائق لديه سجل وراديات سابقة.',
      PHONE_EXISTS: 'رقم الهاتف مسجل مسبقاً لمستخدم آخر في النظام.',
      EMAIL_EXISTS: 'البريد الإلكتروني مسجل مسبقاً لمستخدم آخر في النظام.',
      DRIVER_EMPLOYEE_ID_EXISTS: 'الرقم الوظيفي مسجل مسبقاً لسائق آخر.',
      VALIDATION_ERROR: 'البيانات المدخلة غير صالحة. يرجى التحقق من الحقول والمحاولة مجدداً.',
      CANNOT_DELETE_LAST_ADMIN: 'لا يمكن حذف أو تعطيل حساب المشرف الأخير المتبقي في النظام.',
      CANNOT_DELETE_PRIMARY_ADMIN: 'لا يمكن حذف حساب المشرف الرئيسي للنظام.',
      CANNOT_DELETE_SELF: 'لا يمكن للمشرف حذف حسابه الشخصي.',
      CANNOT_DEMOTE_PRIMARY_ADMIN: 'لا يمكن تعديل دور المشرف الرئيسي للنظام.',
      CANNOT_DEACTIVATE_PRIMARY_ADMIN: 'لا يمكن تعطيل حساب المشرف الرئيسي للنظام.',
      LAST_ADMIN_PROTECTED: 'لا يمكن تعطيل أو تغيير دور المشرف الأخير المتبقي.',
      AUTH_INVALID_CREDENTIALS: 'بيانات الاعتماد غير صحيحة. يرجى التأكد من البريد الإلكتروني أو الهاتف وكلمة المرور.',
      PASSWORD_REQUIRED: 'كلمة المرور مطلوبة لإنشاء الحساب.',
      DRIVER_NOT_FOUND: 'لم يتم العثور على ملف السائق المطلوب.',
      USER_NOT_FOUND: 'لم يتم العثور على المستخدم المطلوب.',
      DEVICE_NOT_FOUND: 'لم يتم العثور على جهاز معتمد لهذا السائق.',
      NETWORK_ERROR: 'تعذر الاتصال بخادم النظام. يرجى التحقق من اتصال الإنترنت والمحاولة لاحقاً.',
      STORAGE_NOT_CONFIGURED: 'خدمة التخزين السحابي غير مهيأة على هذا الخادم.',
      CHECKSUM_FAILED: 'فشل التحقق من صحة حزمة التحديث (عدم تطابق الرمز الرقمي).',
      INSTALL_ERROR: 'تعذر تشغيل مثبت التطبيقات في النظام. يرجى تفعيل إذن تثبيت التطبيقات.',
      UNKNOWN_ERROR: 'حدث خطأ غير متوقع. يرجى المحاولة لاحقاً أو مراجعة المشرف.',
    },
  },
  en: {
    app: {
      title: 'Tracker',
      subtitle: 'Sign in to start your shift',
      developerAttribution: 'Developed by Emad Abd Alnour ❤️',
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
      ok: 'OK',
      confirm: 'Confirm',
      close: 'Close',
      yes: 'Yes',
      no: 'No',
      delete: 'Delete',
      loading: 'Loading...',
      loadingFleet: 'Loading fleet data...',
      checkingSession: 'Checking session...',
      fleetLoadFailed: 'Failed to load fleet data',
      retry: 'Retry',
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
      revokeDevice: 'Revoke Authorization',
      unreadNotifications: 'Unread Notifications',
      confirmResetTitle: 'Confirm Device Revocation',
      confirmResetMessage: 'Are you sure you want to de-authorize this device? The driver must sign in again.',
      resetSuccess: 'Device authorization revoked successfully',
      resetFailed: 'Failed to revoke device authorization',
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
      currentSpeed: 'Current Speed',
      lastRecordedSpeed: 'Last Recorded Speed',
      lastGpsLocation: 'Last GPS Location',
      lastConnection: 'Last Connection',
      gpsSignalAge: 'GPS Signal Age',
      atRestaurant: 'At Restaurant',
      stopped: 'Stopped',
      moving: 'In Motion',
      offline: 'Offline',
      awaiting: 'On shift — awaiting location data',
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
      telemetry: 'Live Telemetry',
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
      viewDetails: 'View Details',
      noDriversCoordinates: 'No location coordinates available currently for any driver.',
    },
    notifications: {
      title: 'Notifications',
      markAllRead: 'Mark All Read',
      markReadSuccess: 'Notifications updated',
      noNotifications: 'No new notifications currently',
      unread: 'New',
    },
    errors: {
      AUTH_FORBIDDEN: 'Access denied. You do not have permission for this action.',
      ACCESS_DENIED: 'Access denied. You do not have permission for this action.',
      AUTH_DEVICE_MISMATCH: 'This account is linked to another device. An administrator must reset the device authorization.',
      DEVICE_UNAUTHORIZED: 'This device is unauthorized or its authorization has been revoked. Please sign in again or contact an administrator.',
      DRIVER_INACTIVE: 'Driver account is currently inactive. Please contact an administrator to activate your account.',
      OUTSIDE_GEOFENCE: 'Driver must be inside restaurant geofence to start shift.',
      GEOFENCE_LOCATION_REQUIRED: 'Current location coordinates are required to start shift.',
      INVALID_COORDINATES: 'Invalid location coordinates provided.',
      SHIFT_START_FAILED: 'Could not start shift. Please try again.',
      SHIFT_END_FAILED: 'Could not end shift. Please try again.',
      SHIFT_ALREADY_ACTIVE: 'An active shift is already in progress. Please end your current shift before starting a new one.',
      SHIFT_NOT_ACTIVE: 'No active shift in progress. Please start your shift first to begin tracking.',
      NO_ACTIVE_SHIFT: 'No active shift found to end.',
      EMPLOYEE_ID_REQUIRED: 'Employee ID is required for driver.',
      CANNOT_CHANGE_ROLE_ACTIVE_SHIFT: 'Cannot change role of a driver with an active shift. End the shift first.',
      CANNOT_DEMOTE_DRIVER_WITH_SHIFTS: 'Cannot change role of a driver with existing shift history.',
      PHONE_EXISTS: 'A user with this phone number already exists.',
      EMAIL_EXISTS: 'A user with this email address already exists.',
      DRIVER_EMPLOYEE_ID_EXISTS: 'A driver with this employee ID already exists.',
      VALIDATION_ERROR: 'Invalid input data. Please verify fields and try again.',
      CANNOT_DELETE_LAST_ADMIN: 'Cannot delete or deactivate the only remaining active administrator.',
      CANNOT_DELETE_PRIMARY_ADMIN: 'The primary system administrator account cannot be deleted.',
      CANNOT_DELETE_SELF: 'Administrators cannot delete their own account.',
      CANNOT_DEMOTE_PRIMARY_ADMIN: 'The primary system administrator role cannot be changed.',
      CANNOT_DEACTIVATE_PRIMARY_ADMIN: 'The primary system administrator account cannot be deactivated.',
      LAST_ADMIN_PROTECTED: 'Cannot deactivate or demote the last remaining active administrator.',
      AUTH_INVALID_CREDENTIALS: 'Invalid credentials. Please verify your email or phone and password.',
      PASSWORD_REQUIRED: 'A password is required to create a user account.',
      DRIVER_NOT_FOUND: 'Requested driver profile was not found.',
      USER_NOT_FOUND: 'Requested user was not found.',
      DEVICE_NOT_FOUND: 'No authorized device found for this driver.',
      NETWORK_ERROR: 'Could not connect to the system server. Please check your internet connection and try again.',
      STORAGE_NOT_CONFIGURED: 'Cloud storage service is not configured on this environment.',
      CHECKSUM_FAILED: 'Update package verification failed (checksum mismatch).',
      INSTALL_ERROR: 'Unable to launch system package installer. Please grant install permission.',
      UNKNOWN_ERROR: 'An unexpected error occurred. Please try again later or contact an administrator.',
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

/**
 * Returns the flex row direction ('row' or 'row-reverse') needed to achieve
 * the desired visual direction dictated by the application locale.
 * - On an Arabic Android system, Yoga natively inverts 'row' to RTL.
 *   Applying 'row-reverse' on top would double-invert it back to LTR!
 * - On an English Android system, Yoga treats 'row' as LTR.
 *   Applying 'row-reverse' produces RTL.
 *
 * Therefore:
 * Target RTL visual layout:
 *   If Yoga is natively RTL: 'row' (renders visual RTL)
 *   If Yoga is natively LTR: 'row-reverse' (renders visual RTL)
 * Target LTR visual layout:
 *   If Yoga is natively RTL: 'row-reverse' (renders visual LTR)
 *   If Yoga is natively LTR: 'row' (renders visual LTR)
 */
export function getRowDirection(forceRtl?: boolean): 'row' | 'row-reverse' {
  const targetRtl = forceRtl !== undefined ? forceRtl : isRtl();
  const nativeRtl = Boolean(I18nManager.isRTL);
  return targetRtl !== nativeRtl ? 'row-reverse' : 'row';
}

/**
 * Returns the alignItems cross-axis alignment ('flex-start' or 'flex-end')
 * corresponding to the visual start or end of the layout.
 * Visual start in RTL is right side; in LTR is left side.
 */
export function getFlexAlignment(visualStart: boolean = true): 'flex-start' | 'flex-end' {
  const targetRtl = isRtl();
  const nativeRtl = Boolean(I18nManager.isRTL);
  const isAlignedWithNative = targetRtl === nativeRtl;
  return visualStart
    ? (isAlignedWithNative ? 'flex-start' : 'flex-end')
    : (isAlignedWithNative ? 'flex-end' : 'flex-start');
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

/**
 * Resolves an error code or Error object into a user-friendly localized message.
 * Strictly prevents leaking raw database/internal exceptions to Arabic/English UI.
 */
export function getLocalizedErrorMessage(
  errorOrCode: unknown,
  fallbackMessage?: string
): string {
  const currentLang = currentLocale === 'en' ? 'en' : 'ar';
  const errorMap = translations[currentLang].errors as Record<string, string>;

  let code: string | null = null;
  let rawMessage: string | null = null;

  if (typeof errorOrCode === 'string') {
    code = errorOrCode.trim();
  } else if (errorOrCode && typeof errorOrCode === 'object') {
    const obj = errorOrCode as Record<string, any>;
    if (typeof obj.code === 'string') {
      code = obj.code;
    }
    if (typeof obj.message === 'string') {
      rawMessage = obj.message;
      if (!code && /^[A-Z0-9_]+$/.test(obj.message)) {
        code = obj.message;
      }
    }
  }

  // 1. Direct code translation
  if (code && errorMap[code]) {
    return errorMap[code];
  }

  // 2. Map known code / message aliases (e.g. "Access denied" -> AUTH_FORBIDDEN)
  const combinedText = `${code || ''} ${rawMessage || ''} ${fallbackMessage || ''}`.toLowerCase();
  if (combinedText.includes('access denied') || combinedText.includes('auth_forbidden') || combinedText.includes('forbidden')) {
    return errorMap.AUTH_FORBIDDEN;
  }
  if (combinedText.includes('outside_geofence') || combinedText.includes('outside restaurant geofence')) {
    return errorMap.OUTSIDE_GEOFENCE;
  }
  if (combinedText.includes('no_active_shift') || combinedText.includes('no active shift')) {
    return errorMap.NO_ACTIVE_SHIFT;
  }
  if (combinedText.includes('shift_not_active') || combinedText.includes('not on an active shift')) {
    return errorMap.SHIFT_NOT_ACTIVE;
  }
  if (combinedText.includes('shift_already_active') || combinedText.includes('already active')) {
    return errorMap.SHIFT_ALREADY_ACTIVE;
  }
  if (combinedText.includes('device_unauthorized') || combinedText.includes('not authorized or has been revoked')) {
    return errorMap.DEVICE_UNAUTHORIZED;
  }
  if (combinedText.includes('driver_inactive') || combinedText.includes('account is inactive')) {
    return errorMap.DRIVER_INACTIVE;
  }

  // 3. Check if rawMessage contains known code
  if (rawMessage) {
    for (const key of Object.keys(errorMap)) {
      if (rawMessage.includes(key)) {
        return errorMap[key];
      }
    }
  }

  // 4. Fallback message provided by caller
  if (fallbackMessage && fallbackMessage.trim().length > 0) {
    if (currentLang === 'ar') {
      // In Arabic mode, do not leak pure-English technical error strings
      const hasArabic = /[\u0600-\u06FF]/.test(fallbackMessage);
      if (hasArabic) {
        return fallbackMessage;
      }
    } else {
      return fallbackMessage;
    }
  }

  // 5. Default localized fallback
  return errorMap.UNKNOWN_ERROR;
}

/**
 * Formats a timestamp into a relative human-readable string (e.g. "منذ 5 دقائق" or "5m ago").
 */
export function formatTimeAgo(dateString: string | null | undefined, forceRtl?: boolean): string {
  if (!dateString) return '-';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  const rtl = forceRtl !== undefined ? forceRtl : isRtl();
  if (mins < 1) return rtl ? 'منذ ثوانٍ' : 'Just now';
  if (mins < 60) return rtl ? `منذ ${formatWesternNumber(mins)} دقيقة` : `${formatWesternNumber(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtl ? `منذ ${formatWesternNumber(hours)} ساعة` : `${formatWesternNumber(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return rtl ? `منذ ${formatWesternNumber(days)} يوم` : `${formatWesternNumber(days)}d ago`;
}

/**
 * Canonical reports duration formatter matching Web semantics.
 * Formats minutes into human-readable duration strings with explicit Arabic/English units.
 * Never silently rounds <30 min to 0h.
 * Example (AR): 0 دقيقة, 13 دقيقة, 1 ساعة, 1س 25د, 372 ساعة
 * Example (EN): 0m, 13m, 1h, 1h 25m, 372h
 */
export function formatReportDuration(minutes: number | null | undefined, forceRtl?: boolean): string {
  const rtl = forceRtl !== undefined ? forceRtl : isRtl();
  if (minutes == null || isNaN(minutes) || minutes <= 0) {
    return rtl ? '0 دقيقة' : '0m';
  }
  const totalMins = Math.round(minutes);
  if (totalMins === 0) {
    return rtl ? '0 دقيقة' : '0m';
  }
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (rtl) {
    if (hrs === 0) {
      return `${formatWesternNumber(mins)} دقيقة`;
    }
    if (mins === 0) {
      return `${formatWesternNumber(hrs)} ساعة`;
    }
    return `${formatWesternNumber(hrs)}س ${formatWesternNumber(mins)}د`;
  } else {
    if (hrs === 0) {
      return `${formatWesternNumber(mins)}m`;
    }
    if (mins === 0) {
      return `${formatWesternNumber(hrs)}h`;
    }
    return `${formatWesternNumber(hrs)}h ${formatWesternNumber(mins)}m`;
  }
}

/**
 * Canonical reports distance formatter matching Web semantics.
 * Converts meters to kilometers with 1 decimal place.
 * Example (AR): 0.0 كم, 7.6 كم
 * Example (EN): 0.0 km, 7.6 km
 */
export function formatReportDistance(meters: number | null | undefined, forceRtl?: boolean): string {
  const rtl = forceRtl !== undefined ? forceRtl : isRtl();
  const unit = rtl ? 'كم' : 'km';
  if (meters == null || isNaN(meters) || meters <= 0) {
    return `0.0 ${unit}`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km} ${unit}`;
}

