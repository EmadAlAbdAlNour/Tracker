import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const apkPath = process.env.APK_PATH;
const aaptExe = process.platform === 'win32' ? 'aapt.exe' : 'aapt';
const aaptTool =
  process.env.AAPT_TOOL ||
  (process.env.ANDROID_HOME
    ? path.join(process.env.ANDROID_HOME, 'build-tools/35.0.0', aaptExe)
    : aaptExe);

if (!apkPath || !fs.existsSync(apkPath)) {
  console.error(`APK not found at ${apkPath}`);
  process.exit(1);
}

// Locate version.json dynamically
const candidatePaths = [
  path.resolve(process.cwd(), 'version.json'),
  path.resolve(process.cwd(), '../../version.json'),
  path.resolve(process.cwd(), '../version.json'),
];
const versionPath = candidatePaths.find((p) => fs.existsSync(p));
if (!versionPath) {
  console.error('Could not locate version.json in candidate locations:', candidatePaths);
  process.exit(1);
}

const versionConfig = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));

const expectedVersion = versionConfig.version;
const expectedVersionCode = versionConfig.versionCode;
const expectedPackage = 'com.tracker.driver';

if (
  typeof expectedVersionCode !== 'number' ||
  !Number.isInteger(expectedVersionCode) ||
  expectedVersionCode <= 0
) {
  console.error(
    `ERROR: version.json contains invalid versionCode: ${expectedVersionCode}. Must be a positive integer.`
  );
  process.exit(1);
}

console.log(
  `Verifying APK embedded metadata against version.json (${expectedVersion} code ${expectedVersionCode})...`
);

let dump = '';
try {
  dump = execSync(`"${aaptTool}" dump badging "${apkPath}"`, { encoding: 'utf-8' });
} catch (execErr) {
  console.error(`Failed to execute aapt dump badging on ${apkPath} using ${aaptTool}:`, execErr.message);
  process.exit(1);
}

const pkgMatch = dump.match(/package: name='([^']+)'/);
const vCodeMatch = dump.match(/versionCode='([^']+)'/);
const vNameMatch = dump.match(/versionName='([^']+)'/);

const embeddedPkg = pkgMatch ? pkgMatch[1] : null;
const embeddedVCode = vCodeMatch ? Number(vCodeMatch[1]) : null;
const embeddedVName = vNameMatch ? vNameMatch[1] : null;

console.log(
  `Embedded APK metadata: package=${embeddedPkg}, versionName=${embeddedVName}, versionCode=${embeddedVCode}`
);

if (embeddedPkg !== expectedPackage) {
  console.error(`ERROR: Package mismatch! Embedded: ${embeddedPkg}, Expected: ${expectedPackage}`);
  process.exit(1);
}

if (embeddedVName !== expectedVersion) {
  console.error(`ERROR: VersionName mismatch! Embedded: ${embeddedVName}, Expected: ${expectedVersion}`);
  process.exit(1);
}

if (embeddedVCode !== expectedVersionCode) {
  console.error(
    `ERROR: VersionCode mismatch! Embedded: ${embeddedVCode}, Expected: ${expectedVersionCode}`
  );
  process.exit(1);
}

const expectedFilename = `Tracker-${expectedVersion}-${expectedVersionCode}.apk`;
console.log(`Expected release filename: ${expectedFilename}`);
console.log('APK version integrity verified successfully.');
