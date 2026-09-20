import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payloadData: { secret?: string } = {};
        try {
          if (clientPayload) {
            payloadData = JSON.parse(clientPayload);
          }
        } catch {
          throw new Error('Unauthorized');
        }

        const expectedSecret = process.env.CI_UPLOAD_SECRET;
        if (!expectedSecret) {
          throw new Error('Unauthorized');
        }

        const providedSecret = payloadData.secret || '';
        
        // Constant-time comparison
        const expectedBuf = Buffer.from(expectedSecret);
        const providedBuf = Buffer.from(providedSecret);
        
        if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
          throw new Error('Unauthorized');
        }
        
        // Restrict allowed prefix
        if (!pathname.startsWith('releases/android/')) {
          throw new Error('Invalid pathname');
        }
        
        // Restrict allowed content types
        let allowedContentTypes = ['application/vnd.android.package-archive', 'application/json', 'application/octet-stream'];
        if (pathname.endsWith('.apk')) {
          allowedContentTypes = ['application/vnd.android.package-archive', 'application/octet-stream'];
        } else if (pathname.endsWith('.json')) {
          allowedContentTypes = ['application/json'];
        } else {
          throw new Error('Invalid file type');
        }

        return {
          allowedContentTypes,
          tokenPayload: JSON.stringify({ pathname }),
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB max
        };
      }
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: message || 'Upload initialization failed' }, { status: 400 });
  }
}
