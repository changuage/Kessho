import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const read = (path) => readFileSync(path, 'utf8');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const activeSources = [];
const collectActiveSources = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const repoPath = relative('.', path);
    if (entry.isDirectory()) {
      if (repoPath === 'src/audio/reference') continue;
      collectActiveSources(path);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name)) || /\.(?:test|spec)\.[^.]+$/.test(entry.name)) continue;
    activeSources.push([repoPath, read(path)]);
  }
};
collectActiveSources('src');

const harmonyPanel = read('src/ui/harmony/HarmonyEnginePanel.tsx');
const harmonyWorkspace = read('src/ui/harmony/HarmonyWorkspace.tsx');
const synthPage = read('src/ui/synth/SynthPage.tsx');
const harmonyControl = read('src/audio/CoreProductHarmonyControl.ts');
const productEvents = read('cpp/KesshoCore/include/KesshoCore/KesshoProductEvents.h');
const app = read('src/App.tsx');
const overviewSurface = read('src/ui/harmony/HarmonyOverviewSurface.tsx');
const compactChordRow = read('src/ui/harmony/shared/HarmonyCompactChordRow.tsx');
const liveKeyboardGeometry = read('src/ui/harmony/live/liveKeyboardGeometry.ts');
const harmonyEngine = read('cpp/KesshoCore/src/product/music/HarmonyEngine.cpp');
const snapshotEncoder = read('src/audio/coreProductSnapshotEncoder.ts');
const deterministicMusicCheck = read('scripts/check-kessho-product-deterministic-music.mjs');
const hostHarmonyState = read('src/audio/CoreProductHostHarmonyState.ts');
const harmonyProjection = read('src/audio/harmony/harmonyProjection.ts');
const arrangementSnapshot = read('src/audio/coreProductArrangementSnapshot.ts');
const workspaceController = read('src/ui/harmony/useHarmonyWorkspaceController.ts');
const workspaceControllerTest = read('src/ui/harmony/useHarmonyWorkspaceController.test.ts');

for (const [path, source] of [
  ['src/ui/harmony/HarmonyEnginePanel.tsx', harmonyPanel],
  ['src/ui/harmony/HarmonyWorkspace.tsx', harmonyWorkspace],
  ['src/ui/synth/SynthPage.tsx', synthPage],
]) {
  assert(
    source.includes('harmonyProjection: HarmonyProjection;'),
    `${path} must require the canonical HarmonyProjection`,
  );
  assert(
    !source.includes('harmonyProjection?: HarmonyProjection;'),
    `${path} must not make HarmonyProjection optional`,
  );
}

assert(
  !harmonyPanel.includes('resolveHarmonyProjection('),
  'HarmonyEnginePanel must not reconstruct Harmony projection locally',
);
assert(
  !harmonyWorkspace.includes('resolveHarmonyProjection('),
  'HarmonyWorkspace must not reconstruct Harmony projection locally',
);
assert(
  !synthPage.includes('resolveHarmonyProjection('),
  'SynthPage must not reconstruct Harmony projection locally',
);

assert(
  /LIVE_CHORD_GESTURE|LIVE_CHORD/.test(productEvents),
  'Product Core must expose a bounded live-chord event kind',
);
const harmonyLiveProjection = read('src/ui/harmony/useHarmonyLiveProjection.ts');
assert(
  harmonyLiveProjection.includes('productEngine.enqueueEvents(')
    && harmonyLiveProjection.includes('createCoreProductHarmonyLiveChordGestureEvents(next'),
  'All UI Harmony live layers must enter the one Product-Core event executor',
);
for (const contract of [
  "scope: 'detail'",
  "target: 'detail'",
  "scope: 'overview'",
  "target: 'overview'",
]) {
  assert(harmonyPanel.includes(contract), `Harmony Detail/Overview must retain explicit Product-Core ${contract}`);
}
for (const [path, source] of activeSources) {
  assert(
    !source.includes('setCoreProductHarmonyLiveLayer'),
    `${path} must not retain mutable snapshot live-layer authority`,
  );
}

assert(
  arrangementSnapshot.includes('chordGeneratorEnabled: synthChordGeneratorSourceEnabled(arrangementState)')
    && arrangementSnapshot.includes('// Harmony owns the pitches; Arrangement owns only rendering/routing.'),
  'Chord Generator must remain a renderer of canonical Harmony rather than a second chord authority',
);
assert(
  synthPage.includes('harmonyProjection={props.harmonyProjection}')
    && synthPage.includes('synthChordGeneratorVoiceCount'),
  'Synth Simple mode must expose the Harmony-driven Chord Generator controls and projection',
);

for (const [path, source] of activeSources) {
  assert(
    !source.includes('slot.intent') && !/\bHarmonyChordSlot\b|\bSharedHarmonyChord\b|harmonyChordSlots/.test(source.replace(/RETIRED_CHORD_STATE_KEYS[\s\S]*?\] as const;/, '')),
    `${path} must not reference the retired chord bank`,
  );
}

assert(
  !synthPage.includes('const playNotes = playEnginePatterns.map'),
  'SynthPage must not produce final Product chord playNotes',
);
assert(
  !synthPage.includes('playNotes,'),
  'SynthPage must not send final Product chord playNotes',
);

assert(
  harmonyControl.includes('export function migrateHarmonyProgression(')
    && harmonyControl.includes("code: 'progression-capacity-exceeded'"),
  'Harmony progression migration must expose an explicit bounded-capacity diagnostic',
);
assert(
  overviewSurface.includes('HarmonyCompactChordRow')
    && compactChordRow.includes('RelativeChordDotMap'),
  'Overview must consume the shared compact chord-row architecture',
);
assert(
  app.includes('onLiveHarmonyNoteStart={productRuntimeManualTriggers.startSynthLiveNote}')
    && app.includes('onLiveHarmonyNoteStop={productRuntimeManualTriggers.stopSynthLiveNote}')
    && harmonyPanel.includes('detailLiveNoteInput.noteOn(`harmony-detail:${source}:${midi}`')
    && harmonyPanel.includes('detailLiveNoteInput.noteOff(`harmony-detail:${source}:${midi}`'),
  'Global Detail keyboard must own a paired Product live-note audition lifecycle',
);
assert(
  liveKeyboardGeometry.includes('const highMidi = lowMidi + 11')
    && liveKeyboardGeometry.includes('Array.from({ length: 12 }'),
  'Unified Harmony keyboard must remain one stable octave in every view',
);
assert(
  !overviewSurface.includes('harmony-overview-exact-matrix'),
  'Overview must not retain a bespoke exact-note matrix',
);
assert(
  harmonyEngine.includes('stageNextHarmonyPreview()')
    && harmonyEngine.includes('const HarmonyState saved_harmony = harmony;')
    && harmonyEngine.includes('harmony = saved_harmony;'),
  'Native Harmony must stage next telemetry without advancing authoritative RNG/state',
);
assert(
  deterministicMusicCheck.includes("snapshotConstNumber('HARMONY_BYTES')")
    && deterministicMusicCheck.includes("snapshotConstNumber('ARRANGEMENT_BYTES')")
    && snapshotEncoder.includes('offset - harmonyOffset !== HARMONY_BYTES')
    && snapshotEncoder.includes('offset - arrangementOffset !== ARRANGEMENT_BYTES'),
  'Deterministic WASM fixtures must derive guarded snapshot section sizes from the encoder',
);
assert(
  hostHarmonyState.includes('runtimeHarmonyReady: nativeNotePoolMidi !== null')
    && harmonyProjection.includes('? { currentNotePool: nativeCurrentNotePool ? [...nativeCurrentNotePool] : [], nextNotePool: nativeNextNotePool ? [...nativeNextNotePool] : [] }'),
  'Pre-telemetry Product Harmony must remain explicitly pending instead of exposing TS-generated pools',
);
assert(
  app.includes('const harmonyWorkspaceController = useHarmonyWorkspaceController(state, handleStateChange);')
    && app.includes('harmonyWorkspaceController={harmonyWorkspaceController}'),
  'App must own the one persistent Harmony history controller across Global unmounts',
);
assert(
  !harmonyWorkspace.includes('useHarmonyWorkspaceController(')
    && !workspaceController.includes('mountedHarmonyWorkspaceController')
    && !synthPage.includes('getHarmonyWorkspaceHistoryBridge'),
  'Harmony history must not fall back to a mounted-page singleton bridge',
);
assert(
  workspaceControllerTest.includes('App-owned commit survives Global unmount and is undoable after remount'),
  'Harmony history must regress an App-owned commit and Global undo across unmount',
);
if (failures.length > 0) {
  console.error(`Unified Harmony architecture check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log('Unified Harmony architecture check passed');
