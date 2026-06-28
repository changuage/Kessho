import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDir = await mkdtemp(path.join(tmpdir(), 'cloud-preset-edge-regression-'));
const outfile = path.join(tempDir, 'cloud-preset-edge-regression.mjs');

try {
  await build({
    entryPoints: ['src/cloud/cloudPresetEdgeCases.test.ts'],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'silent',
    define: {
      'import.meta.env': '{}',
    },
  });

  await import(pathToFileURL(outfile).href);
  console.log('Cloud preset edge regression passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
