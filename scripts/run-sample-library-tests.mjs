import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tests = [
  'src/audio/sampleLibraries/sampleLibraryRegistry.test.ts',
  'src/audio/sampleLibraries/sampleResolver.test.ts',
  'src/audio/sampleLibraries/sampleAssetPredictor.test.ts',
  'src/audio/sampleLibraries/SampleDecodedAssetCache.test.ts',
];

const tempDir = await mkdtemp(path.join(tmpdir(), 'sample-library-tests-'));

try {
  for (const test of tests) {
    const outfile = path.join(tempDir, `${path.basename(test, '.ts')}.mjs`);
    await build({
      entryPoints: [test],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      sourcemap: 'inline',
      logLevel: 'silent',
    });
    await import(pathToFileURL(outfile).href);
    console.log(`passed ${test}`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
