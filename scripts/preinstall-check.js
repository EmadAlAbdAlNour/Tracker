// Cross-platform preinstall check for workspace
// - removes package-lock.json and yarn.lock if present
// - ensures pnpm is the package manager (if npm_config_user_agent is present)
const fs = require('fs');
try {
  try { fs.unlinkSync('package-lock.json'); } catch (e) {}
  try { fs.unlinkSync('yarn.lock'); } catch (e) {}
  const ua = process.env.npm_config_user_agent || '';
  if (ua && !ua.startsWith('pnpm/')) {
    console.error('Use pnpm instead');
    process.exit(1);
  }
} catch (err) {
  console.error('preinstall check failed:', err);
  process.exit(1);
}
