import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDir = await mkdtemp(path.join(tmpdir(), 'slider-system-regression-'));
const entryPoints = [
  'src/ui/sliderSystem/sliderSystem.test.ts',
  'src/ui/sliderSystem/sliderCapabilities.test.ts',
  'src/ui/morphPositionRaf.test.ts',
  'src/ui/drums/seqLaneRange.test.ts',
  'src/ui/drums/drumPresetDualState.test.ts',
  'src/audio/padPresetDualState.test.ts',
  'src/audio/sampleLibraries/sampleLibraryPresetBehavior.test.ts',
  'src/audio/leadPresetOwnedState.test.ts',
];

try {
  await build({
    entryPoints,
    outdir: tempDir,
    entryNames: '[name]',
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'silent',
  });
  for (const entryPoint of entryPoints) {
    const outfile = path.join(tempDir, `${path.basename(entryPoint, '.ts')}.js`);
    await import(pathToFileURL(outfile).href);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
