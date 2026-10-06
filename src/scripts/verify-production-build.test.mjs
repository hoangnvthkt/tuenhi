// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { documentLibraryChunkName } from '../../scripts/document-library-chunks.mjs';
import { verifyProductionBuild } from '../../scripts/verify-production-build.mjs';

const temporaryDirectories = [];

async function fixture({
  script = 'console.log("safe")',
  css = 'body{}',
  preload = '',
  extraBytes = 0,
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tuenhi-build-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, 'assets'));
  await writeFile(
    join(directory, 'index.html'),
    `<script type="module" src="/assets/index.js"></script>${preload}<link rel="stylesheet" href="/assets/index.css">`,
  );
  await writeFile(join(directory, 'assets/index.js'), script);
  await writeFile(join(directory, 'assets/index.css'), css);
  await writeFile(join(directory, 'manifest.webmanifest'), '{}');
  await writeFile(
    join(directory, 'sw.js'),
    'self.addEventListener("fetch",()=>{})',
  );
  await writeFile(join(directory, 'pwa-192x192.png'), 'icon');
  await writeFile(join(directory, 'pwa-512x512.png'), 'icon');
  if (extraBytes > 0) {
    await writeFile(join(directory, 'large.bin'), Buffer.alloc(extraBytes));
  }
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('verifyProductionBuild', () => {
  it('assigns stable chunks to document libraries so eager imports are detectable', () => {
    expect(
      documentLibraryChunkName('/workspace/node_modules/xlsx/xlsx.mjs'),
    ).toBe('xlsx');
    expect(
      documentLibraryChunkName('/workspace/node_modules/exceljs/lib/index.js'),
    ).toBe('exceljs');
    expect(
      documentLibraryChunkName(
        '/workspace/node_modules/pdfmake/build/pdfmake.js',
      ),
    ).toBe('pdfmake');
    expect(
      documentLibraryChunkName('/workspace/src/features/reports/report.ts'),
    ).toBeUndefined();
  });

  it('accepts a complete build within all budgets', async () => {
    await expect(verifyProductionBuild(await fixture())).resolves.toMatchObject(
      {
        initialJavaScriptGzipBytes: expect.any(Number),
        initialCssGzipBytes: expect.any(Number),
        totalAssetBytes: expect.any(Number),
      },
    );
  });

  it('rejects secret material in deploy assets', async () => {
    const directory = await fixture({
      script: 'const key="sb_secret_example";',
    });
    await expect(verifyProductionBuild(directory)).rejects.toThrow(
      'secret material',
    );
  });

  it('rejects a service-role JWT in deploy assets', async () => {
    const jwt = [
      Buffer.from('{"alg":"HS256"}').toString('base64url'),
      Buffer.from('{"role":"service_role"}').toString('base64url'),
      'signature',
    ].join('.');
    await expect(
      verifyProductionBuild(await fixture({ script: `const token="${jwt}";` })),
    ).rejects.toThrow('secret material');
  });

  it('rejects lazy document libraries preloaded by the app shell', async () => {
    const directory = await fixture({
      preload: '<link rel="modulepreload" href="/assets/exceljs.min-lazy.js">',
    });
    await expect(verifyProductionBuild(directory)).rejects.toThrow(
      'lazy document library',
    );
  });

  it('rejects a deploy larger than four MiB plus the 32 KiB feature allowance', async () => {
    const directory = await fixture({
      extraBytes: 4 * 1024 * 1024 + 32 * 1024,
    });
    await expect(verifyProductionBuild(directory)).rejects.toThrow(
      /total deploy assets/i,
    );
  });

  it('enforces initial JavaScript and CSS gzip budgets', async () => {
    await expect(
      verifyProductionBuild(await fixture({ script: randomBytes(230 * 1024) })),
    ).rejects.toThrow('Initial JavaScript gzip');
    await expect(
      verifyProductionBuild(await fixture({ css: randomBytes(13 * 1024) })),
    ).rejects.toThrow('Initial CSS gzip');
  });
});
