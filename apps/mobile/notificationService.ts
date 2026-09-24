import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { TrackerNotificationModule } = NativeModules;

export interface MobileNotificationItem {
  id: string;
  type: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  titleAr?: string;
  titleEn?: string;
  title?: string;
  messageAr?: string;
  messageEn?: string;
  message?: string;
  driverId?: string | null;
  shiftId?: string | null;
  metadata?: Record<string, any> | null;
  read: boolean;
  readAt?: string | null;
  createdAt?: string;
}

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

const POSTED_NOTIFICATION_IDS_STORAGE_KEY = 'tracker_posted_notification_ids';
const MAX_PERSISTED_POSTED_IDS = 500;
const MAX_HISTORICAL_AGE_MS = 15 * 60 * 1000; // 15 minutes

let postedNotificationIdsCache: Set<string> | null = null;

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

  /**
   * Load or return cached set of already-posted notification IDs from persistent storage
   */
  async getPostedNotificationIds(): Promise<Set<string>> {
    if (postedNotificationIdsCache !== null) {
      return postedNotificationIdsCache;
    }
    try {
      const raw = await AsyncStorage.getItem(POSTED_NOTIFICATION_IDS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          postedNotificationIdsCache = new Set(parsed);
          return postedNotificationIdsCache;
        }
      }
    } catch (e) {
      console.warn('[NotificationService] Failed to load posted notification IDs:', e);
    }
    postedNotificationIdsCache = new Set();
    return postedNotificationIdsCache;
  },

  /**
   * Check if a notification has already been posted to the Android notification shade
   */
  async isNotificationPosted(id: string): Promise<boolean> {
    const set = await this.getPostedNotificationIds();
    return set.has(id);
  },

  /**
   * Record that a notification has been posted to the Android notification shade and persist to AsyncStorage
   */
  async recordNotificationPosted(id: string): Promise<void> {
    const set = await this.getPostedNotificationIds();
    if (set.has(id)) return;
    set.add(id);

    try {
      const arr = Array.from(set);
      const trimmed = arr.length > MAX_PERSISTED_POSTED_IDS
        ? arr.slice(arr.length - MAX_PERSISTED_POSTED_IDS)
        : arr;
      if (trimmed.length !== arr.length) {
        postedNotificationIdsCache = new Set(trimmed);
      }
      await AsyncStorage.setItem(POSTED_NOTIFICATION_IDS_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[NotificationService] Failed to persist posted notification ID:', e);
    }
  },

  /**
   * Evaluate whether a notification should produce an Android system shade notification:
   * - Must not already be read
   * - Must not have already been posted
   * - Must not be a historical notification (>15 min old)
   */
  async shouldPostSystemNotification(notif: {
    id: string;
    read?: boolean;
    createdAt?: string;
  }): Promise<boolean> {
    // 1. If notification is already read, do not post
    if (notif.read === true) {
      return false;
    }

    // 2. If notification has already been posted, do not post
    const alreadyPosted = await this.isNotificationPosted(notif.id);
    if (alreadyPosted) {
      return false;
    }

    // 3. If notification is historical (>15 min old upon first discovery), mark as posted and skip
    if (notif.createdAt) {
      const createdTime = new Date(notif.createdAt).getTime();
      if (!Number.isNaN(createdTime) && Date.now() - createdTime > MAX_HISTORICAL_AGE_MS) {
        await this.recordNotificationPosted(notif.id);
        return false;
      }
    }

    return true;
  },

  /**
   * Reset in-memory cache for deterministic testing
   */
  clearPostedNotificationCacheForTesting(): void {
    postedNotificationIdsCache = null;
  },
};

