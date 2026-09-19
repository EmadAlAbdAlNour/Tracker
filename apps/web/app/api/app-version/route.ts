import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

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
      limit: 20,
    });

    // 1. Prefer latest.json metadata if published
    const metadataBlob = blobs.find((b) => b.pathname.endsWith('latest.json'));
    if (metadataBlob) {
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

    return NextResponse.json({ error: 'No release metadata found in Blob storage' }, { status: 404 });
  } catch (err) {
    console.warn('Vercel Blob query failed in /api/app-version:', err);
    return NextResponse.json({ error: 'Failed to query Blob storage' }, { status: 500 });
  }
}

