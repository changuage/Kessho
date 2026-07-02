import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const entryPoints = [
  'src/ui/sequencer/triggerClip.test.ts',
  'src/ui/sequencer/triggerClipLegacyBridge.test.ts',
  'src/ui/drums/scatter/scatterPresetHash.test.ts',
  'src/ui/drums/scatter/scatterPhrasePrinter.test.ts',
];

const tempDir = await mkdtemp(path.join(tmpdir(), 'drum-scatter-sequencer-regression-'));

try {
  const [appSource, drumScatterRuntimeSource, drumPageSource, scatterPageSource] = await Promise.all([
    readFile('src/App.tsx', 'utf8'),
    readFile('src/app/useDrumScatterRuntimeState.ts', 'utf8'),
    readFile('src/ui/drums/DrumPage.tsx', 'utf8'),
    readFile('src/ui/drums/scatter/ScatterPage.tsx', 'utf8'),
  ]);
  const appScatterRuntimeIndex = appSource.indexOf('useScatterSequencerRuntime({');
  const appScatterRuntimeFacadeIndex = appSource.indexOf('useDrumScatterRuntimeState({');
  const appScatterPhrasePlayerIndex = appSource.indexOf('useScatterPhrasePlayer({');
  const appDrumPageRenderIndex = appSource.indexOf("{activeTab === 'drums'");
  const appScatterRuntimeMountIndex = appScatterRuntimeIndex >= 0 ? appScatterRuntimeIndex : appScatterRuntimeFacadeIndex;
  const appScatterPhrasePlayerMountIndex = appScatterPhrasePlayerIndex >= 0 ? appScatterPhrasePlayerIndex : appScatterRuntimeFacadeIndex;
  if (appScatterRuntimeMountIndex < 0) {
    throw new Error('Scatter runtime scheduler must be mounted above DrumPage so it survives main tab changes.');
  }
  if (appScatterPhrasePlayerMountIndex < 0) {
    throw new Error('App must own the headless scatter phrase player for background Scatter playback.');
  }
  if (!drumScatterRuntimeSource.includes('useScatterSequencerRuntime({')) {
    throw new Error('useDrumScatterRuntimeState must own the headless Scatter scheduler.');
  }
  if (!drumScatterRuntimeSource.includes('useScatterPhrasePlayer({')) {
    throw new Error('useDrumScatterRuntimeState must own the headless Scatter phrase player.');
  }
  if (
    appDrumPageRenderIndex >= 0 &&
    (appScatterRuntimeMountIndex > appDrumPageRenderIndex || appScatterPhrasePlayerMountIndex > appDrumPageRenderIndex)
  ) {
    throw new Error('App-owned Scatter playback hooks must run before the conditional DrumPage render branch.');
  }
  if (!scatterPageSource.includes('useScatterPhrasePlayer({')) {
    throw new Error('ScatterPage should keep the UI-local phrase player for manual Scatter phrase audition.');
  }
  if (drumPageSource.includes('useScatterPhrasePlayer({')) {
    throw new Error('DrumPage should not own Scatter phrase playback because main tab changes unmount it.');
  }
  if (drumPageSource.includes('useScatterSequencerRuntime({')) {
    throw new Error('DrumPage is unmounted by main tab changes and must not own the background Scatter scheduler.');
  }
  if (scatterPageSource.includes('useScatterSequencerRuntime')) {
    throw new Error('ScatterPage is conditionally rendered by view mode and must not own the background Scatter scheduler.');
  }

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
