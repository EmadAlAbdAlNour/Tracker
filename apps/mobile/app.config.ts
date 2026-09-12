export default {
  expo: {
    name: 'Tracker Driver',
    slug: 'tracker-driver-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    extra: {
      apiUrl:
        process.env.EXPO_PUBLIC_API_URL ??
        (process.env.NODE_ENV === 'production'
          ? 'https://tracker-alpha-puce.vercel.app'
          : 'http://10.0.2.2:3000'),
      locationIntervalMs: Number(process.env.EXPO_PUBLIC_LOCATION_INTERVAL_MS ?? 20000),
      locationDistanceMeters: Number(process.env.EXPO_PUBLIC_LOCATION_DISTANCE_METERS ?? 25),
    },
    android: {
      package: 'com.tracker.driver',
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'POST_NOTIFICATIONS',
      ],
      usesCleartextTraffic: true,
    },
    ios: {
      bundleIdentifier: 'com.tracker.driver',
    },
  },
};
