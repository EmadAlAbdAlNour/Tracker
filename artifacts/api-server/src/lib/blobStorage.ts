import { put, list, head, del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { logger } from "./logger";
import path from "path";
import fs from "fs";

export interface ReleaseInfo {
  version: string;
  minSupportedVersion: string;
  downloadUrl: string;
  fileSize: string;
  sha256: string;
  packageName: string;
  releaseNotes: {
    ar: string;
    en: string;
  };
  publishedAt: string;
  storageProvider: "vercel-blob" | "local-disk" | "redirect";
}

// Canonical default release metadata
const DEFAULT_RELEASE: ReleaseInfo = {
  version: "1.0.0",
  minSupportedVersion: "1.0.0",
  downloadUrl: "/api/releases/latest/download",
  fileSize: "65.5 MB",
  sha256: "d1e4410b0c65a517a75723240419a23579a581ba2f363b3e8b91c275266252af",
  packageName: "com.tracker.driver",
  releaseNotes: {
    ar: "إطلاق رسمي v1.0.0 مع تحديث الهوية البصرية وتحسين دقة التتبع الجغرافي ودعم أندرويد 16",
    en: "Official v1.0.0 release with modernized branding, enhanced GPS tracking, and Android 16 support",
  },
  publishedAt: "2026-09-18T20:00:00.000Z",
  storageProvider: "local-disk",
};

/**
 * Checks if Vercel Blob store is configured via environment variable
 */
export function isBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Retrieves the latest release information and download URL
 */
export async function getLatestRelease(): Promise<ReleaseInfo> {
  // 1. If explicit CDN / Blob URL environment variable is supplied
  const explicitUrl = process.env.TRACKER_APK_DOWNLOAD_URL || process.env.TRACKER_BLOB_APK_URL;
  if (explicitUrl) {
    return {
      ...DEFAULT_RELEASE,
      downloadUrl: explicitUrl,
      storageProvider: "vercel-blob",
    };
  }

  // 2. If Vercel Blob token is available, check for uploaded releases
  if (isBlobStorageConfigured()) {
    try {
      const { blobs } = await list({
        prefix: "releases/android/",
        limit: 10,
      });

      // Find highest version or newest blob
      const apkBlobs = blobs.filter((b) => b.pathname.endsWith(".apk"));
      if (apkBlobs.length > 0) {
        // Sort descending by uploadedAt
        apkBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        const latestBlob = apkBlobs[0];

        // Format size in MB
        const sizeMb = (latestBlob.size / (1024 * 1024)).toFixed(1) + " MB";

        return {
          ...DEFAULT_RELEASE,
          downloadUrl: latestBlob.downloadUrl || latestBlob.url,
          fileSize: sizeMb,
          publishedAt: latestBlob.uploadedAt.toISOString(),
          storageProvider: "vercel-blob",
        };
      }
    } catch (err) {
      logger.warn({ err }, "Failed to query Vercel Blob store, falling back to default release");
    }
  }

  // 3. Fallback: local disk or default endpoint
  return DEFAULT_RELEASE;
}

/**
 * Handles client direct-to-blob upload tokens for large APK files (>4.5MB).
 * This prevents hitting serverless function payload limits.
 */
export async function handleDirectBlobUpload(
  request: Request,
  body: HandleUploadBody,
  adminUser: { id: string; role: string }
) {
  if (!isBlobStorageConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured on this deployment");
  }

  return handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      if (adminUser.role !== "ADMIN") {
        throw new Error("Unauthorized: Only administrators can upload releases");
      }

      return {
        allowedContentTypes: [
          "application/vnd.android.package-archive",
          "image/svg+xml",
          "image/png",
          "image/jpeg",
        ],
        maximumSizeInBytes: 150 * 1024 * 1024, // 150MB limit for APK binaries
        tokenPayload: JSON.stringify({
          uploadedBy: adminUser.id,
          uploadedAt: new Date().toISOString(),
        }),
      };
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      logger.info({ blob, tokenPayload }, "Blob upload completed successfully");
    },
  });
}

/**
 * Uploads a file directly from server if buffer is available (e.g. CLI upload scripts or logos)
 */
export async function uploadAssetToBlob(
  pathname: string,
  data: Buffer | Blob,
  contentType?: string
): Promise<{ url: string; pathname: string }> {
  if (!isBlobStorageConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const result = await put(pathname, data, {
    access: "public",
    contentType,
  });

  return {
    url: result.url,
    pathname: result.pathname,
  };
}

/**
 * Resolves local file on disk if running self-hosted or in development
 */
export function getLocalReleaseApkPath(): string | null {
  const candidatePaths = [
    path.resolve(process.cwd(), "apps/mobile/android/app/build/outputs/apk/release/app-release.apk"),
    path.resolve(process.cwd(), "../apps/mobile/android/app/build/outputs/apk/release/app-release.apk"),
    path.resolve(process.cwd(), "apps/web/public/Tracker-1.0.0.apk"),
    path.resolve(process.cwd(), "../apps/web/public/Tracker-1.0.0.apk"),
    path.resolve(process.cwd(), "public/Tracker-1.0.0.apk"),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

