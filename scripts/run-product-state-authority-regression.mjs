import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const entries = [
  'src/product-control/resolvePerformanceState.test.ts',
  'src/debug/productStateDebugHash.test.ts',
];

const tempDir = await mkdtemp(path.join(tmpdir(), 'product-state-authority-'));

try {
  for (const entry of entries) {
    const outfile = path.join(tempDir, `${path.basename(entry, '.ts')}.mjs`);
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      sourcemap: 'inline',
      logLevel: 'silent',
    });

    await import(pathToFileURL(outfile).href);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
