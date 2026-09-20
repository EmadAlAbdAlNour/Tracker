import { NativeModules, Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import versionConfig from '../../version.json';

export interface RemoteReleaseInfo {
  version: string;
  versionCode?: number;
  minSupportedVersion?: string;
  downloadUrl: string;
  fileSize?: string;
  sizeBytes?: number;
  sha256?: string;
  filename?: string;
  packageName?: string;
  releaseNotes?: {
    ar?: string;
    en?: string;
  };
  publishedAt?: string;
}

export const CURRENT_VERSION_NAME = versionConfig.version;
export const CURRENT_VERSION_CODE = versionConfig.versionCode;

/**
 * Robust semantic version comparison.
 * Returns:
 *  1 if v1 > v2
 * -1 if v1 < v2
 *  0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = (v1 || '0').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const p2 = (v2 || '0').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);

  for (let i = 0; i < len; i++) {
    const n1 = p1[i] ?? 0;
    const n2 = p2[i] ?? 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

/**
 * Determines whether a remote release represents a newer update.
 * Checks versionCode first (monotonic integer), then semver fallback.
 */
export function isUpdateAvailable(
  installedVersion: string = CURRENT_VERSION_NAME,
  installedCode: number | null | undefined = CURRENT_VERSION_CODE,
  remoteVersion: string,
  remoteCode?: number | null
): boolean {
  if (
    typeof remoteCode === 'number' &&
    typeof installedCode === 'number' &&
    remoteCode > 0 &&
    installedCode > 0
  ) {
    return remoteCode > installedCode;
  }
  return compareSemver(remoteVersion, installedVersion) > 0;
}

/**
 * Checks server endpoint /api/app-version for release metadata.
 */
export async function fetchLatestRelease(apiUrl: string): Promise<RemoteReleaseInfo | null> {
  try {
    const cleanUrl = apiUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/app-version`);
    if (!res.ok) return null;
    const data = (await res.json()) as RemoteReleaseInfo;
    if (data && data.version && data.downloadUrl) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[updateManager] Failed to query latest app version:', err);
    return null;
  }
}

/**
 * Downloads the update APK and prompts the Android package installer.
 */
export async function downloadAndInstallUpdate(
  release: RemoteReleaseInfo,
  onProgress?: (percent: number) => void
): Promise<void> {
  const downloadUrl = release.downloadUrl;
  if (!downloadUrl) {
    throw new Error('MISSING_DOWNLOAD_URL');
  }

  // If on non-Android platform or native module missing, fall back to browser download
  if (Platform.OS !== 'android') {
    await Linking.openURL(downloadUrl);
    return;
  }

  const targetFilename = release.filename || `Tracker-${release.version}.apk`;
  const targetDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!targetDir) {
    await Linking.openURL(downloadUrl);
    return;
  }

  const localFileUri = `${targetDir}${targetFilename}`;

  // 1. Clean up old download if exists
  try {
    const existing = await FileSystem.getInfoAsync(localFileUri);
    if (existing.exists) {
      await FileSystem.deleteAsync(localFileUri, { idempotent: true });
    }
  } catch {
    // ignore
  }

  // 2. Download APK with progress tracking
  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    localFileUri,
    {},
    (downloadProgress: FileSystem.DownloadProgressData) => {
      if (downloadProgress.totalBytesExpectedToWrite > 0 && onProgress) {
        const percent = Math.min(
          1,
          Math.max(
            0,
            downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
          )
        );
        onProgress(percent);
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    throw new Error('DOWNLOAD_FAILED');
  }

  // 3. Verify SHA-256 hash if provided and native module available
  const TrackerNotificationModule = NativeModules.TrackerNotificationModule;
  if (release.sha256 && TrackerNotificationModule?.getFileSha256) {
    try {
      const calculatedHash = await TrackerNotificationModule.getFileSha256(result.uri);
      if (
        calculatedHash &&
        calculatedHash.toLowerCase() !== release.sha256.toLowerCase()
      ) {
        // Delete corrupt file
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
        throw new Error('CHECKSUM_FAILED');
      }
    } catch (hashErr: any) {
      if (hashErr.message === 'CHECKSUM_FAILED') throw hashErr;
      console.warn('[updateManager] SHA-256 calculation warning:', hashErr);
    }
  }

  // 4. Launch Android Package Installer
  if (TrackerNotificationModule?.installApk) {
    await TrackerNotificationModule.installApk(result.uri);
  } else {
    await Linking.openURL(downloadUrl);
  }
}

