import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET() {
  // 1. If explicit CDN / Blob URL is configured in environment
  const cdnUrl = process.env.TRACKER_APK_DOWNLOAD_URL || process.env.TRACKER_BLOB_APK_URL;
  if (cdnUrl) {
    return NextResponse.redirect(cdnUrl, 302);
  }

  // 2. If Vercel Blob integration is active, find latest release in Blob store
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { blobs } = await list({
        prefix: 'releases/android/',
        limit: 10,
      });
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

  // Attempt to locate local release APK if running on self-hosted or local environment
  const possiblePaths = [
    path.resolve(process.cwd(), '../mobile/android/app/build/outputs/apk/release/app-release.apk'),
    path.resolve(process.cwd(), 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk'),
    path.resolve(process.cwd(), 'public/Tracker-1.0.0.apk'),
  ];

  for (const apkPath of possiblePaths) {
    if (fs.existsSync(apkPath)) {
      try {
        const fileBuffer = fs.readFileSync(apkPath);
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Disposition': 'attachment; filename="Tracker-1.0.0.apk"',
            'Content-Length': fileBuffer.length.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (err) {
        console.error('Error reading APK file:', err);
      }
    }
  }

  // Fallback response with metadata
  return NextResponse.json(
    {
      name: 'Tracker Android App',
      version: '1.0.0',
      status: 'AVAILABLE',
      package: 'com.tracker.driver',
      fileSize: '65.5 MB',
      sha256: 'd1e4410b0c65a517a75723240419a23579a581ba2f363b3e8b91c275266252af',
      message: 'Direct APK streaming requires persistent cloud storage or local disk build artifact.',
    },
    { status: 200 }
  );
}

