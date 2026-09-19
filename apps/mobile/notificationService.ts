import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { TrackerNotificationModule } = NativeModules;

export interface NotificationPayload {
  id?: number;
  channelId?: 'tracker_alerts_channel' | 'tracker_system_channel' | 'tracker_tracking_channel' | string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface NotificationActionData {
  action: string;
  notificationId?: string;
}

const eventEmitter = Platform.OS === 'android' && TrackerNotificationModule
  ? new NativeEventEmitter(TrackerNotificationModule)
  : null;

export const NotificationService = {
  /**
   * Check if POST_NOTIFICATIONS permission is granted (Android 13+)
   */
  async checkPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !TrackerNotificationModule) {
      return true;
    }
    try {
      return await TrackerNotificationModule.checkPermission();
    } catch (e) {
      console.warn('[NotificationService] checkPermission error:', e);
      return false;
    }
  },

  /**
   * Request POST_NOTIFICATIONS runtime permission on Android
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !TrackerNotificationModule) {
      return true;
    }
    try {
      return await TrackerNotificationModule.requestPermission();
    } catch (e) {
      console.warn('[NotificationService] requestPermission error:', e);
      return false;
    }
  },

  /**
   * Show an Android system notification in the notification shade
   */
  async showNotification(payload: NotificationPayload): Promise<boolean> {
    if (Platform.OS !== 'android' || !TrackerNotificationModule) {
      return false;
    }
    try {
      const id = payload.id ?? Math.floor(Math.random() * 100000);
      const channelId = payload.channelId || 'tracker_alerts_channel';
      return await TrackerNotificationModule.showNotification(
        id,
        channelId,
        payload.title,
        payload.body,
        payload.data || null
      );
    } catch (e) {
      console.warn('[NotificationService] showNotification error:', e);
      return false;
    }
  },

  /**
   * Retrieve initial notification if app was opened/resumed via notification tap
   */
  async getInitialNotification(): Promise<NotificationActionData | null> {
    if (Platform.OS !== 'android' || !TrackerNotificationModule) {
      return null;
    }
    try {
      return await TrackerNotificationModule.getInitialNotification();
    } catch (e) {
      console.warn('[NotificationService] getInitialNotification error:', e);
      return null;
    }
  },

  /**
   * Subscribe to notification tap events while app is running
   */
  onNotificationTap(callback: (data: NotificationActionData) => void): () => void {
    if (!eventEmitter) {
      return () => {};
    }
    const subscription = eventEmitter.addListener('onNotificationTap', callback);
    return () => {
      subscription.remove();
    };
  },
};

