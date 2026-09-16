import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

async function main() {
  const mobileI18nModule = await import(pathToFileURL(path.resolve(process.cwd(), '../apps/mobile/i18n.ts')).href);
  const translations = mobileI18nModule.translations;

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.expo') && !file.includes('android')) {
        results = results.concat(walk(full));
      }
    } else if ((file.endsWith('.ts') || file.endsWith('.tsx')) && !file.includes('.test.') && file !== 'i18n.ts') {
      results.push(full);
    }
  }
  return results;
}

function getNested(obj: any, keyPath: string): any {
  const parts = keyPath.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr == null || typeof curr !== 'object') return undefined;
    curr = curr[p];
  }
  return curr;
}

const files = walk(path.resolve(process.cwd(), '../apps/mobile'));
const tRegex = /t\((['"])([a-zA-Z0-9_.]+)\1\)/g;
const missingAr: string[] = [];
const missingEn: string[] = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match: RegExpExecArray | null;
  while ((match = tRegex.exec(content)) !== null) {
    const key = match[2];
    if (getNested(translations.ar, key) === undefined) {
      missingAr.push(`${key} in ${path.relative(process.cwd(), file)}`);
    }
    if (getNested(translations.en, key) === undefined) {
      missingEn.push(`${key} in ${path.relative(process.cwd(), file)}`);
    }
  }
}

console.log('Missing in AR (Mobile):', missingAr);
console.log('Missing in EN (Mobile):', missingEn);

// Now check web
const webAr = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../apps/web/locales/ar/common.json'), 'utf8'));
const webEn = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../apps/web/locales/en/common.json'), 'utf8'));

function walkWeb(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('dist')) {
        results = results.concat(walkWeb(full));
      }
    } else if ((file.endsWith('.ts') || file.endsWith('.tsx')) && !file.includes('.test.') && !file.endsWith('i18n.ts')) {
      results.push(full);
    }
  }
  return results;
}

const webFiles = walkWeb(path.resolve(process.cwd(), '../apps/web'));
const missingWebAr: string[] = [];
const missingWebEn: string[] = [];

for (const file of webFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match: RegExpExecArray | null;
  while ((match = tRegex.exec(content)) !== null) {
    const key = match[2];
    if (getNested(webAr, key) === undefined) {
      missingWebAr.push(`${key} in ${path.relative(process.cwd(), file)}`);
    }
    if (getNested(webEn, key) === undefined) {
      missingWebEn.push(`${key} in ${path.relative(process.cwd(), file)}`);
    }
  }
}

console.log('Missing in AR (Web):', missingWebAr);
console.log('Missing in EN (Web):', missingWebEn);
}

main().catch(console.error);
