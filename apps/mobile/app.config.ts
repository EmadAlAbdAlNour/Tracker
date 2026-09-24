import versionConfig from '../../version.json';

export default {
  expo: {
    name: 'Tracker',
    slug: 'tracker-mobile',
    version: versionConfig.version,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    extra: {
      version: versionConfig.version,
      versionCode: versionConfig.versionCode,
      apiUrl:
        process.env.EXPO_PUBLIC_API_URL ||
        (process.env.NODE_ENV === 'development'
          ? 'http://10.0.2.2:3000'
          : 'https://tracker-alpha-puce.vercel.app'),
      locationIntervalMs: Number(process.env.EXPO_PUBLIC_LOCATION_INTERVAL_MS ?? 5000),
      locationDistanceMeters: Number(process.env.EXPO_PUBLIC_LOCATION_DISTANCE_METERS ?? 10),
    },
    android: {
      package: 'com.tracker.driver',
      versionCode: versionConfig.versionCode,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0f766e',
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'POST_NOTIFICATIONS',
        'REQUEST_INSTALL_PACKAGES',
      ],
      usesCleartextTraffic: process.env.NODE_ENV !== 'production',
    },
    ios: {
      bundleIdentifier: 'com.tracker.driver',
    },
  },
};
