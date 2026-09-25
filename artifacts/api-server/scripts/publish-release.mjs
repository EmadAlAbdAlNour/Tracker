import fs from 'fs';
import path from 'path';
import { upload } from '@vercel/blob/client';

async function publishRelease() {
  const secret = process.env.CI_UPLOAD_SECRET;
  const productionUrl = process.env.PRODUCTION_URL;
  
  if (!secret || !productionUrl) {
    console.error('Missing CI_UPLOAD_SECRET or PRODUCTION_URL');
    process.exit(1);
  }

  const apkPath = process.env.APK_PATH;
  if (!apkPath || !fs.existsSync(apkPath)) {
    console.error(`APK not found at ${apkPath}`);
    process.exit(1);
  }

  const apkSha = process.env.APK_SHA;
  if (!apkSha) {
    console.error('Missing APK_SHA');
    process.exit(1);
  }

  const sizeBytes = parseInt(process.env.APK_SIZE || '0', 10);
  const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';

  // Read version config from the monorepo root
  const candidatePaths = [
    path.resolve(process.cwd(), 'version.json'),
    path.resolve(process.cwd(), '../../version.json'),
    path.resolve(process.cwd(), '../version.json'),
  ];
  const versionPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!versionPath) {
    throw new Error('Could not locate version.json in candidate locations');
  }
  const versionConfig = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
  
  const version = versionConfig.version;
  if (!version || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid release version: expected semver string, got ${version}`);
  }

  const versionCode = versionConfig.versionCode;
  if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`Invalid release versionCode: expected positive integer, got ${versionCode}`);
  }

  const minSupportedVersion = versionConfig.minSupportedVersion || '1.0.0';

  const filename = `Tracker-${version}-${versionCode}.apk`;
  const blobPath = `releases/android/${filename}`;

  const handleUploadUrl = new URL('/api/ci/upload', productionUrl).toString();

  console.log(`Uploading ${filename} directly to Vercel Blob via ${handleUploadUrl}...`);
  const apkBuffer = fs.readFileSync(apkPath);
  
  const apkBlob = await upload(blobPath, apkBuffer, {
    access: 'public',
    handleUploadUrl,
    clientPayload: JSON.stringify({ secret }),
    multipart: true,
  });

  console.log(`Uploaded APK successfully to ${apkBlob.url}`);

  const releaseMetadata = {
    version,
    versionCode,
    minSupportedVersion,
    downloadUrl: apkBlob.url, // Explicitly point to the Blob URL
    fileSize: sizeMb,
    sizeBytes,
    sha256: apkSha,
    packageName: 'com.tracker.driver',
    filename,
    mandatory: false,
    releaseNotes: {
      ar: `تحديث جديد (الإصدار ${version})`,
      en: `New update (v${version})`
    },
    publishedAt: new Date().toISOString()
  };

  console.log('Publishing latest.json metadata...');
  const metadataBuffer = Buffer.from(JSON.stringify(releaseMetadata, null, 2));
  
  const metadataBlob = await upload('releases/android/latest.json', metadataBuffer, {
    access: 'public',
    handleUploadUrl,
    clientPayload: JSON.stringify({ secret }),
  });

  console.log(`Published metadata successfully to ${metadataBlob.url}`);
}

publishRelease().catch(err => {
  console.error('Failed to publish release:', err.message || err);
  process.exit(1);
});
