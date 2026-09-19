import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
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
  const filename = `Tracker-${version}.apk`;

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

      // 2a. Check latest.json first for exact canonical download URL
      const latestMetadata = blobs.find((b) => b.pathname.endsWith('latest.json'));
      if (latestMetadata) {
        try {
          const fetchUrl = latestMetadata.downloadUrl || latestMetadata.url;
          const res = await fetch(fetchUrl, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data?.downloadUrl) {
              return NextResponse.redirect(data.downloadUrl, 302);
            }
          }
        } catch (fetchErr) {
          console.warn('Vercel Blob latest.json fetch warning:', fetchErr);
        }
      }

      // 2b. Fallback to newest .apk blob
      const apkBlobs = blobs.filter((b) => b.pathname.endsWith('.apk'));
      if (apkBlobs.length > 0) {
        apkBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        const targetUrl = apkBlobs[0].downloadUrl || apkBlobs[0].url;
        return NextResponse.redirect(targetUrl, 302);
      }
    } catch (err) {
      console.warn('Vercel Blob list error in download route:', err);
    }
  }

  return NextResponse.json(
    {
      error: 'Release not found',
      message: 'Direct APK streaming requires persistent cloud storage.',
    },
    { status: 404 }
  );
}

