export default {
  expo: {
    name: 'Tracker',
    slug: 'tracker-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    extra: {
      apiUrl:
        process.env.EXPO_PUBLIC_API_URL ||
        (process.env.NODE_ENV === 'development'
          ? 'http://10.0.2.2:3000'
          : 'https://tracker-alpha-puce.vercel.app'),
      locationIntervalMs: Number(process.env.EXPO_PUBLIC_LOCATION_INTERVAL_MS ?? 20000),
      locationDistanceMeters: Number(process.env.EXPO_PUBLIC_LOCATION_DISTANCE_METERS ?? 25),
    },
    android: {
      package: 'com.tracker.driver',
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
      ],
      usesCleartextTraffic: process.env.NODE_ENV !== 'production',
    },
    ios: {
      bundleIdentifier: 'com.tracker.driver',
    },
  },
};
