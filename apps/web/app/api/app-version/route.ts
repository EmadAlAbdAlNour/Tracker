import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET() {
  const defaultRelease = {
    version: '1.0.0',
    minSupportedVersion: '1.0.0',
    downloadUrl: '/api/download/latest',
    fileSize: '65.5 MB',
    sha256: 'd1e4410b0c65a517a75723240419a23579a581ba2f363b3e8b91c275266252af',
    packageName: 'com.tracker.driver',
    releaseNotes: {
      ar: 'إطلاق رسمي v1.0.0 مع تحديث الهوية البصرية وتحسين دقة التتبع الجغرافي',
      en: 'Official v1.0.0 release with updated branding and improved GPS accuracy',
    },
    publishedAt: '2026-09-18T20:00:00.000Z',
    storageProvider: 'local-disk',
  };

  const explicitUrl = process.env.TRACKER_APK_DOWNLOAD_URL || process.env.TRACKER_BLOB_APK_URL;
  if (explicitUrl) {
    return NextResponse.json({
      ...defaultRelease,
      downloadUrl: explicitUrl,
      storageProvider: 'vercel-blob',
    });
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { blobs } = await list({
        prefix: 'releases/android/',
        limit: 10,
      });
      const apkBlobs = blobs.filter((b) => b.pathname.endsWith('.apk'));
      if (apkBlobs.length > 0) {
        apkBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        const latestBlob = apkBlobs[0];
        const sizeMb = (latestBlob.size / (1024 * 1024)).toFixed(1) + ' MB';
        return NextResponse.json({
          ...defaultRelease,
          downloadUrl: latestBlob.downloadUrl || latestBlob.url,
          fileSize: sizeMb,
          publishedAt: latestBlob.uploadedAt.toISOString(),
          storageProvider: 'vercel-blob',
        });
      }
    } catch (err) {
      console.warn('Vercel Blob query failed in /api/app-version:', err);
    }
  }

  return NextResponse.json(defaultRelease);
}

