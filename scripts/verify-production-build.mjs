import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const limits = {
  initialJavaScriptGzipBytes: 220 * 1024,
  initialCssGzipBytes: 12 * 1024,
  totalAssetBytes: 4 * 1024 * 1024,
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function assetReferences(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

function localAssetPath(directory, reference) {
  const pathname = reference.split(/[?#]/, 1)[0] ?? '';
  return join(directory, pathname.replace(/^\//, ''));
}

function jwtContainsServiceRole(value) {
  for (const match of value.matchAll(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      const payload = JSON.parse(
        Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'),
      );
      if (payload?.role === 'service_role') return true;
    } catch {
      // A JWT-shaped string that is not valid JSON is not a credential match.
    }
  }
  return false;
}

function assertNoSecretMaterial(path, contents) {
  const text = contents.toString('utf8');
  const forbidden = [
    /sb_secret_[A-Za-z0-9_-]+/i,
    /postgres(?:ql)?:\/\/[^\s"'`]+/i,
    /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SUPABASE_DB_PASSWORD|SUPABASE_ACCESS_TOKEN|DATABASE_URL|POSTGRES_URL)\b/,
  ];
  if (
    forbidden.some((pattern) => pattern.test(text)) ||
    jwtContainsServiceRole(text)
  ) {
    throw new Error(`Production build contains secret material in ${path}.`);
  }
}

async function summedGzipBytes(paths) {
  let total = 0;
  for (const path of new Set(paths)) {
    total += gzipSync(await readFile(path)).byteLength;
  }
  return total;
}

function enforceBudget(label, actual, maximum) {
  if (actual > maximum) {
    throw new Error(
      `${label} is ${actual} bytes; maximum is ${maximum} bytes.`,
    );
  }
}

export async function verifyProductionBuild(directory = 'dist') {
  const buildDirectory = resolve(directory);
  const indexPath = join(buildDirectory, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const scriptRefs = assetReferences(
    html,
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  );
  const preloadRefs = assetReferences(
    html,
    /<link\b(?=[^>]*\brel=["']modulepreload["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  );
  const cssRefs = assetReferences(
    html,
    /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  );

  const initialReferences = [...scriptRefs, ...preloadRefs];
  if (
    initialReferences.some((value) => /(?:xlsx|exceljs|pdfmake)/i.test(value))
  ) {
    throw new Error('The app shell preloads a lazy document library.');
  }

  for (const required of [
    'manifest.webmanifest',
    'sw.js',
    'pwa-192x192.png',
    'pwa-512x512.png',
  ]) {
    const metadata = await stat(join(buildDirectory, required)).catch(
      () => null,
    );
    if (!metadata?.isFile()) {
      throw new Error(
        `Production build is missing required PWA asset ${required}.`,
      );
    }
  }

  const files = await walk(buildDirectory);
  let totalAssetBytes = 0;
  for (const path of files) {
    const contents = await readFile(path);
    totalAssetBytes += contents.byteLength;
    assertNoSecretMaterial(relative(buildDirectory, path), contents);
  }

  const initialJavaScriptGzipBytes = await summedGzipBytes(
    initialReferences.map((value) => localAssetPath(buildDirectory, value)),
  );
  const initialCssGzipBytes = await summedGzipBytes(
    cssRefs.map((value) => localAssetPath(buildDirectory, value)),
  );

  enforceBudget(
    'Initial JavaScript gzip',
    initialJavaScriptGzipBytes,
    limits.initialJavaScriptGzipBytes,
  );
  enforceBudget(
    'Initial CSS gzip',
    initialCssGzipBytes,
    limits.initialCssGzipBytes,
  );
  enforceBudget('Total deploy assets', totalAssetBytes, limits.totalAssetBytes);

  return {
    initialJavaScriptGzipBytes,
    initialCssGzipBytes,
    totalAssetBytes,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const directory = process.argv[2] ?? join(dirname(currentFile), '..', 'dist');
  const result = await verifyProductionBuild(directory);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
