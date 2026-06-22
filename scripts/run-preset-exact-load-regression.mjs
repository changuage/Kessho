import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDir = await mkdtemp(path.join(tmpdir(), 'preset-exact-load-regression-'));
const outfile = path.join(tempDir, 'preset-exact-load-regression.mjs');

try {
  await build({
    entryPoints: ['src/ui/presetUtilsExactLoadRegression.test.ts'],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'silent',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
