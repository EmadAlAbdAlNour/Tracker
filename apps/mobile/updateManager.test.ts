import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34, constants: {} },
  Linking: { openURL: vi.fn() },
  NativeModules: {
    TrackerNotificationModule: {},
  },
}));

vi.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  getInfoAsync: vi.fn(),
  deleteAsync: vi.fn(),
  createDownloadResumable: vi.fn(),
}));

import { isUpdateAvailable, compareSemver } from './updateManager';

describe('updateManager - Version comparison and update detection', () => {
  it('Case 1: installedCode=25, remoteCode=26, installedVersion=1.1.4, remoteVersion=1.1.5 -> true (higher versionCode)', () => {
    const result = isUpdateAvailable('1.1.4', 25, '1.1.5', 26);
    expect(result).toBe(true);
  });

  it('Case 2: installedCode=26, remoteCode=25 -> false (lower versionCode)', () => {
    const result = isUpdateAvailable('1.1.5', 26, '1.1.4', 25);
    expect(result).toBe(false);
  });

  it('Case 3: installedCode=26, remoteCode=26, installedVersion=1.1.4, remoteVersion=1.1.5 -> true (codes equal, newer semver)', () => {
    const result = isUpdateAvailable('1.1.4', 26, '1.1.5', 26);
    expect(result).toBe(true);
  });

  it('Case 4: installedCode=null, remoteCode=26, installedVersion=1.1.4, remoteVersion=1.1.5 -> true (null installedCode, semver fallback)', () => {
    const result = isUpdateAvailable('1.1.4', null, '1.1.5', 26);
    expect(result).toBe(true);
  });

  it('Case 5: installedCode=26, remoteCode=null, installedVersion=1.1.5, remoteVersion=1.1.5 -> false (null remoteCode, equal semver)', () => {
    const result = isUpdateAvailable('1.1.5', 26, '1.1.5', null);
    expect(result).toBe(false);
  });

  it('Case 6: installedCode=26, remoteCode=26, installedVersion=1.1.5, remoteVersion=1.1.5 -> false (codes equal, equal semver)', () => {
    const result = isUpdateAvailable('1.1.5', 26, '1.1.5', 26);
    expect(result).toBe(false);
  });

  it('compareSemver tests', () => {
    expect(compareSemver('1.1.5', '1.1.4')).toBe(1);
    expect(compareSemver('1.1.4', '1.1.5')).toBe(-1);
    expect(compareSemver('1.1.5', '1.1.5')).toBe(0);
    expect(compareSemver('v1.2.0', '1.1.9')).toBe(1);
  });
});
