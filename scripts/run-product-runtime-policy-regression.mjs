import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDir = await mkdtemp(path.join(tmpdir(), 'product-runtime-policy-regression-'));
const outfile = path.join(tempDir, 'product-runtime-policy-regression.mjs');

try {
  await build({
    entryPoints: ['src/audio/product/runtime/ProductRuntimePolicyRegression.test.ts'],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    define: {
      'import.meta.env': JSON.stringify({
        DEV: false,
        PROD: false,
        MODE: 'test',
        VITE_KESSHO_ENABLE_GRAPH_CAPTURE: 'false',
      }),
    },
    logLevel: 'silent',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
