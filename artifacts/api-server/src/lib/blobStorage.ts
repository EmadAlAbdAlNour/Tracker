import { put, list, head, del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { logger } from "./logger";
import path from "path";
import fs from "fs";

export interface ReleaseInfo {
  version: string;
  versionCode?: number;
  minSupportedVersion: string;
  downloadUrl: string;
  fileSize: string;
  sizeBytes?: number;
  sha256: string;
  packageName: string;
  filename?: string;
  mandatory?: boolean;
  releaseNotes: {
    ar: string;
    en: string;
  };
  publishedAt: string;
  storageProvider: "vercel-blob" | "local-disk" | "redirect";
}

export function getCanonicalFallbackRelease(): ReleaseInfo {
  let v = "1.0.0";
  let vCode = 1;
  let minV = "1.0.0";
  try {
    const candidates = [
      path.resolve(process.cwd(), "version.json"),
      path.resolve(process.cwd(), "../../version.json"),
      path.resolve(process.cwd(), "../version.json"),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        const content = JSON.parse(fs.readFileSync(cand, "utf-8"));
        if (content.version) v = content.version;
        if (content.versionCode) vCode = Number(content.versionCode);
        if (content.minSupportedVersion) minV = content.minSupportedVersion;
        break;
      }
    }
  } catch {
    // fallback
  }

  return {
    version: v,
    versionCode: vCode,
    minSupportedVersion: minV,
    downloadUrl: "/api/releases/latest/download",
    fileSize: "65.5 MB",
    sha256: "d1e4410b0c65a517a75723240419a23579a581ba2f363b3e8b91c275266252af",
    packageName: "com.tracker.driver",
    filename: `Tracker-${v}.apk`,
    mandatory: false,
    releaseNotes: {
      ar: `إطلاق رسمي v${v} لتطبيق تتبع السائقين والأسطول الميداني`,
      en: `Official v${v} release of Tracker Driver & Fleet application`,
    },
    publishedAt: new Date().toISOString(),
    storageProvider: "local-disk",
  };
}

/**
 * Checks if Vercel Blob store is configured via environment variable
 */
export function isBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/**
 * Retrieves the latest release information and download URL
 */
export async function getLatestRelease(): Promise<ReleaseInfo> {
  const fallback = getCanonicalFallbackRelease();

  // 1. If explicit CDN / Blob URL environment variable is supplied
  const explicitUrl = process.env.TRACKER_APK_DOWNLOAD_URL || process.env.TRACKER_BLOB_APK_URL;
  if (explicitUrl) {
    return {
      ...fallback,
      downloadUrl: explicitUrl,
      storageProvider: "vercel-blob",
    };
  }

  // 2. If Vercel Blob token is available, check for uploaded releases
  if (isBlobStorageConfigured()) {
    try {
      const { blobs } = await list({
        prefix: "releases/android/",
        limit: 20,
      });

      // 2a. Check if structured latest.json exists
      const latestMetadataBlob = blobs.find((b) => b.pathname.endsWith("latest.json"));
      if (latestMetadataBlob) {
        try {
          const fetchUrl = latestMetadataBlob.downloadUrl || latestMetadataBlob.url;
          const res = await fetch(fetchUrl, { cache: 'no-store' });
          if (res.ok) {
            const data = (await res.json()) as Partial<ReleaseInfo>;
            if (data && data.version && data.downloadUrl) {
              return {
                ...fallback,
                ...data,
                storageProvider: "vercel-blob",
              } as ReleaseInfo;
            }
          }
        } catch (fetchErr) {
          logger.warn({ fetchErr }, "Failed to fetch latest.json metadata from Blob, attempting APK blobs list");
        }
      }

      // 2b. Fallback to newest .apk blob
      const apkBlobs = blobs.filter((b) => b.pathname.endsWith(".apk"));
      if (apkBlobs.length > 0) {
        apkBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        const latestBlob = apkBlobs[0];
        const sizeMb = (latestBlob.size / (1024 * 1024)).toFixed(1) + " MB";

        return {
          ...fallback,
          downloadUrl: latestBlob.downloadUrl || latestBlob.url,
          fileSize: sizeMb,
          sizeBytes: latestBlob.size,
          publishedAt: latestBlob.uploadedAt.toISOString(),
          storageProvider: "vercel-blob",
        };
      }
    } catch (err) {
      logger.warn({ err }, "Failed to query Vercel Blob store, falling back to canonical release metadata");
    }
  }

  // 3. Fallback: canonical metadata
  return fallback;
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
    throw new Error("Vercel Blob storage is not configured (missing BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID)");
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
    throw new Error("Vercel Blob storage is not configured");
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

