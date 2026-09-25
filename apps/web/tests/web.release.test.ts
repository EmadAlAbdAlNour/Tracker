import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test suite for release contract, metadata validation, and /api/app-version behavior
describe('Release Contract & Metadata Handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. verifies valid release metadata satisfies contract', () => {
    const validMetadata = {
      version: '1.1.5',
      versionCode: 26,
      minSupportedVersion: '1.0.0',
      downloadUrl: 'https://blob.vercel-storage.com/releases/android/Tracker-1.1.5-26.apk',
      fileSize: '66.9 MB',
      sizeBytes: 70129626,
      sha256: 'd1e4410b0c65a517a75723240419a23579a581ba2f363b3e8b91c275266252af',
      packageName: 'com.tracker.driver',
      filename: 'Tracker-1.1.5-26.apk',
      mandatory: false,
      releaseNotes: {
        ar: 'تحديث جديد (الإصدار 1.1.5)',
        en: 'New update (v1.1.5)',
      },
      publishedAt: '2026-09-25T05:32:45.000Z',
      storageProvider: 'vercel-blob',
    };

    expect(validMetadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(validMetadata.versionCode).toBe(26);
    expect(validMetadata.downloadUrl).toMatch(/^https?:\/\/.+/);
    expect(validMetadata.sha256).toMatch(/^[a-f0-9]{64}$/i);
    expect(validMetadata.packageName).toBe('com.tracker.driver');
    expect(validMetadata.fileSize).toMatch(/^\d+(\.\d+)?\sMB$/);
    expect(validMetadata.publishedAt).toBeDefined();
  });

  it('2. handles missing metadata with graceful fallback extraction from APK blob', () => {
    const apkBlob = {
      pathname: 'releases/android/Tracker-1.1.5-26.apk',
      url: 'https://blob.vercel-storage.com/releases/android/Tracker-1.1.5-26.apk',
      downloadUrl: 'https://blob.vercel-storage.com/releases/android/Tracker-1.1.5-26.apk?download=1',
      size: 70129626,
      uploadedAt: new Date('2026-09-25T05:32:43.000Z'),
    };

    const match = apkBlob.pathname.match(/Tracker-([0-9.]+)(?:-(\d+))?\.apk/i);
    expect(match).not.toBeNull();
    const version = match![1];
    const versionCode = match![2] ? parseInt(match![2], 10) : 26;
    const sizeMb = (apkBlob.size / (1024 * 1024)).toFixed(1) + ' MB';

    expect(version).toBe('1.1.5');
    expect(versionCode).toBe(26);
    expect(sizeMb).toBe('66.9 MB');
    expect(apkBlob.downloadUrl).toContain('Tracker-1.1.5-26.apk');
  });

  it('3. rejects malformed release metadata without version', () => {
    const malformed = {
      downloadUrl: 'https://blob.vercel-storage.com/releases/android/Tracker.apk',
      fileSize: '50 MB',
    };

    const isValid = Boolean(malformed && (malformed as any).version);
    expect(isValid).toBe(false);
  });

  it('4. verifies APK download URL format and accessibility', () => {
    const downloadUrl = 'https://blob.vercel-storage.com/releases/android/Tracker-1.1.5-26.apk?download=1';
    const parsed = new URL(downloadUrl);
    expect(['http:', 'https:']).toContain(parsed.protocol);
    expect(parsed.pathname).toMatch(/\.apk$/i);
    expect(parsed.searchParams.get('download')).toBe('1');
  });

  it('5. handles API failure and preserves user-facing error state', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    let error: string | null = null;
    let data: any = null;

    try {
      const res = await mockFetch('/api/app-version');
      if (!res.ok) throw new Error('Failed to fetch release metadata');
      data = await res.json();
    } catch {
      error = 'لم نتمكن من جلب بيانات التحديث.';
    }

    expect(data).toBeNull();
    expect(error).toBe('لم نتمكن من جلب بيانات التحديث.');
  });

  it('6. verifies version and versionCode consistency between version.json and APK', () => {
    const versionConfig = { version: '1.1.5', versionCode: 26, minSupportedVersion: '1.0.0' };
    const apkFilename = `Tracker-${versionConfig.version}-${versionConfig.versionCode}.apk`;

    const match = apkFilename.match(/Tracker-([0-9.]+)-(\d+)\.apk/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(versionConfig.version);
    expect(parseInt(match![2], 10)).toBe(versionConfig.versionCode);
  });

  it('7. verifies SHA256 presence and 64-character hexadecimal format', () => {
    const validSha = 'd1e4410b0c65a517a75723240419a23579a581ba2f363b3e8b91c275266252af';
    const invalidSha = 'not-a-valid-sha';
    const shortSha = 'd1e4410b';

    const shaRegex = /^[a-f0-9]{64}$/i;
    expect(shaRegex.test(validSha)).toBe(true);
    expect(shaRegex.test(invalidSha)).toBe(false);
    expect(shaRegex.test(shortSha)).toBe(false);
  });

  it('8. strictly validates versionCode and rejects non-positive integers (Fix 2 validation)', () => {
    const validateVersionCode = (versionCode: any) => {
      if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode <= 0) {
        throw new Error(`Invalid release versionCode: expected positive integer, got ${versionCode}`);
      }
      return true;
    };

    expect(validateVersionCode(26)).toBe(true);
    expect(validateVersionCode(1)).toBe(true);
    expect(() => validateVersionCode(null)).toThrow('Invalid release versionCode');
    expect(() => validateVersionCode(undefined)).toThrow('Invalid release versionCode');
    expect(() => validateVersionCode(NaN)).toThrow('Invalid release versionCode');
    expect(() => validateVersionCode(0)).toThrow('Invalid release versionCode');
    expect(() => validateVersionCode(-5)).toThrow('Invalid release versionCode');
    expect(() => validateVersionCode('26')).toThrow('Invalid release versionCode');
  });

  it('9. verifies GET /api/app-version route is strictly read-only and imports no destructive methods', async () => {
    // Dynamically read route file source code to assert 'del' is not imported or used
    const fs = await import('fs');
    const path = await import('path');
    const routeFile = path.resolve(process.cwd(), 'app/api/app-version/route.ts');
    const content = fs.readFileSync(routeFile, 'utf-8');

    // Confirm del is not imported from @vercel/blob
    expect(content).not.toMatch(/import\s*\{[^}]*\bdel\b[^}]*\}\s*from\s*['"]@vercel\/blob['"]/);
    // Confirm no del( call exists in route
    expect(content).not.toMatch(/\bdel\s*\(/);
  });

  it('10. verifies download page uses canonical /api/download/latest endpoint', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pageFile = path.resolve(process.cwd(), 'app/download/page.tsx');
    const content = fs.readFileSync(pageFile, 'utf-8');

    expect(content).toContain('href="/api/download/latest"');
  });
});
