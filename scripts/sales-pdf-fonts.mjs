// Copies the unmodified Roboto 3.014 (2025) Regular/Medium fonts distributed
// with the pinned pdfmake dependency. No glyph subsetting or network fetch.
// Copyright 2011 The Roboto Project Authors.
// Source: https://github.com/googlefonts/roboto-classic
// License: public/fonts/OFL.txt (SIL Open Font License 1.1).
// Run: node scripts/sales-pdf-fonts.mjs [--check]
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sourceRoot = dirname(require.resolve('pdfmake/package.json'));
const outputRoot = fileURLToPath(new URL('../public/fonts/', import.meta.url));
const check = process.argv.includes('--check');
if (!check) await mkdir(outputRoot, { recursive: true });
for (const name of ['Roboto-Regular.ttf', 'Roboto-Medium.ttf']) {
  const source = await readFile(join(sourceRoot, 'fonts/Roboto', name));
  const destination = join(outputRoot, name);
  if (check) {
    if (!source.equals(await readFile(destination))) {
      throw new Error(
        `Bundled PDF font differs from the installed pdfmake source: ${name}`,
      );
    }
  } else {
    await writeFile(destination, source);
  }
}
console.log(check ? 'Sales PDF fonts verified.' : 'Sales PDF fonts copied.');
