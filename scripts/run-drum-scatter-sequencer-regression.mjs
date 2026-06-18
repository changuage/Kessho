import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const entryPoints = [
  'src/ui/sequencer/triggerClip.test.ts',
  'src/ui/sequencer/triggerClipLegacyBridge.test.ts',
  'src/ui/drums/scatter/scatterPresetHash.test.ts',
];

const tempDir = await mkdtemp(path.join(tmpdir(), 'drum-scatter-sequencer-regression-'));

try {
  for (const entryPoint of entryPoints) {
    const outfile = path.join(tempDir, `${path.basename(entryPoint, '.ts')}.mjs`);
    await build({
      entryPoints: [entryPoint],
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
