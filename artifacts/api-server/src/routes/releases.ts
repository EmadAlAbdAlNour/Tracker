import { Router, type Response } from "express";
import fs from "fs";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middleware/auth";
import {
  getLatestRelease,
  getLocalReleaseApkPath,
  handleDirectBlobUpload,
  isBlobStorageConfigured,
} from "../lib/blobStorage";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Public endpoint to query version and release metadata.
 * Called by:
 * - Mobile app on launch to verify if soft-update is available.
 * - Public /download web page to display latest APK version and SHA-256 hash.
 */
router.get("/app-version", async (req, res, next) => {
  try {
    const release = await getLatestRelease();
    res.status(200).json(release);
  } catch (error) {
    next(error);
  }
});

/**
 * Alias for app-version under releases namespace
 */
router.get("/latest", async (req, res, next) => {
  try {
    const release = await getLatestRelease();
    res.status(200).json(release);
  } catch (error) {
    next(error);
  }
});

/**
 * Direct APK download route.
 * Redirects directly to Vercel Blob storage (or CDN) when available,
 * avoiding serverless memory proxying of large binary files.
 */
router.get("/latest/download", async (req, res: Response, next) => {
  try {
    const release = await getLatestRelease();

    // 1. If Blob URL / external CDN is available, redirect directly (302)
    if (release.downloadUrl.startsWith("http://") || release.downloadUrl.startsWith("https://")) {
      res.redirect(302, release.downloadUrl);
      return;
    }

    // 2. Local disk fallback
    const localApk = getLocalReleaseApkPath();
    if (localApk && fs.existsSync(localApk)) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="Tracker-${release.version}.apk"`);
      const stream = fs.createReadStream(localApk);
      stream.pipe(res);
      return;
    }

    // 3. Fallback instructions
    res.status(200).json({
      status: "AVAILABLE",
      version: release.version,
      sha256: release.sha256,
      message: "Direct APK streaming requires persistent cloud storage or local disk build artifact.",
      downloadPage: "/download",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Admin-only direct upload handler for large binaries (Vercel Blob client upload flow)
 */
router.post("/upload", requireAuth, requireRole("ADMIN"), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!isBlobStorageConfigured()) {
      res.status(503).json({
        error: {
          code: "STORAGE_NOT_CONFIGURED",
          message: "BLOB_READ_WRITE_TOKEN is not configured on this environment",
        },
      });
      return;
    }

    const jsonResponse = await handleDirectBlobUpload(
      req as unknown as Request,
      req.body,
      { id: req.user!.id, role: req.user!.role }
    );

    res.status(200).json(jsonResponse);
  } catch (error) {
    logger.error({ error }, "Error handling direct blob upload");
    next(error);
  }
});

export default router;
