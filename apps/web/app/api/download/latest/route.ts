import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

function getCanonicalVersion(): { version: string; versionCode: number } {
  try {
    const candidates = [
      path.resolve(process.cwd(), 'version.json'),
      path.resolve(process.cwd(), '../../version.json'),
      path.resolve(process.cwd(), '../version.json'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        const content = JSON.parse(fs.readFileSync(cand, 'utf-8'));
        return {
          version: content.version || '1.0.0',
          versionCode: Number(content.versionCode || 1),
        };
      }
    }
  } catch {
    // fallback
  }
  return { version: '1.0.0', versionCode: 1 };
}

export async function GET() {
  const { version } = getCanonicalVersion();

  // 1. If explicit CDN / Blob URL is configured in environment
  const cdnUrl = process.env.TRACKER_APK_DOWNLOAD_URL || process.env.TRACKER_BLOB_APK_URL;
  if (cdnUrl) {
    return NextResponse.redirect(cdnUrl, 302);
  }

  // 2. If Vercel Blob integration is active, find latest release in Blob store
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    try {
      const { blobs } = await list({
        prefix: 'releases/android/',
        limit: 20,
      });

      const apkBlobs = blobs.filter((b) => b.pathname.endsWith('.apk'));
      if (apkBlobs.length > 0) {
        apkBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        const newestApk = apkBlobs[0];
        const targetUrl = newestApk.downloadUrl || newestApk.url;
        return NextResponse.redirect(targetUrl, 302);
      }
    } catch (err) {
      console.warn('Vercel Blob list error in download route:', err);
    }
  }

  return NextResponse.json(
    {
      error: 'Release not found',
      message: 'Direct APK download requires active cloud storage.',
    },
    { status: 404 }
  );
}
