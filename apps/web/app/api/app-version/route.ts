import { NextResponse } from 'next/server';
import { list, get } from '@vercel/blob';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const explicitUrl = process.env.TRACKER_APK_DOWNLOAD_URL || process.env.TRACKER_BLOB_APK_URL;
  if (explicitUrl) {
    return NextResponse.json({
      version: 'UNKNOWN',
      downloadUrl: explicitUrl,
      storageProvider: 'vercel-blob',
    });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return NextResponse.json({ error: 'Blob storage not configured' }, { status: 500 });
  }

  try {
    const { blobs } = await list({
      prefix: 'releases/android/',
      limit: 50,
    });

    const apkBlobs = blobs.filter((b) => b.pathname.endsWith('.apk'));
    apkBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // 1. Prefer latest.json metadata if published
    const metadataBlob = blobs.find((b) => b.pathname.endsWith('latest.json'));
    if (metadataBlob) {
      // 1a. Try authenticated get() first (avoids blocked public CDN edge)
      try {
        const getRes = await get(metadataBlob.pathname, { access: 'public' });
        if (getRes?.stream) {
          const text = await new Response(getRes.stream).text();
          const data = JSON.parse(text);
          if (data && data.version && data.downloadUrl) {
            return NextResponse.json({
              ...data,
              storageProvider: 'vercel-blob',
            });
          }
        }
      } catch (getErr) {
        console.warn('Authenticated Blob get() failed, falling back to fetch:', getErr);
      }

      // 1b. Fallback to direct fetch
      try {
        const fetchUrl = metadataBlob.downloadUrl || metadataBlob.url;
        const res = await fetch(fetchUrl, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.version && data.downloadUrl) {
            return NextResponse.json({
              ...data,
              storageProvider: 'vercel-blob',
            });
          }
        }
      } catch (fetchErr) {
        console.warn('Failed to fetch latest.json from Blob:', fetchErr);
      }
    }

    // 2. Fallback to newest APK blob metadata if latest.json could not be fetched
    if (apkBlobs.length > 0) {
      const latestApk = apkBlobs[0];
      const filename = path.basename(latestApk.pathname);
      const match = filename.match(/Tracker-([0-9.]+)(?:-(\d+))?\.apk/i);
      const version = match?.[1] || '1.1.5';
      const versionCode = match?.[2] ? parseInt(match[2], 10) : 1;
      const sizeMb = (latestApk.size / (1024 * 1024)).toFixed(1) + ' MB';

      return NextResponse.json({
        version,
        versionCode,
        minSupportedVersion: '1.0.0',
        downloadUrl: latestApk.downloadUrl || latestApk.url,
        fileSize: sizeMb,
        sizeBytes: latestApk.size,
        sha256: 'd1e4410b0c65a517a75723240419a23579a581ba2f363b3e8b91c275266252af',
        packageName: 'com.tracker.driver',
        filename,
        mandatory: false,
        releaseNotes: {
          ar: `تحديث رسمي (الإصدار ${version})`,
          en: `Official release (v${version})`,
        },
        publishedAt: latestApk.uploadedAt.toISOString(),
        storageProvider: 'vercel-blob',
      });
    }

    return NextResponse.json({ error: 'No release metadata found in Blob storage' }, { status: 404 });
  } catch (err) {
    console.warn('Vercel Blob query failed in /api/app-version:', err);
    return NextResponse.json({ error: 'Failed to query Blob storage' }, { status: 500 });
  }
}


