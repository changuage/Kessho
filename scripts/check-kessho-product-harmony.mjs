import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireTokens(path, tokens) {
  const source = read(path);
  for (const token of tokens) {
    assert(source.includes(token), `${path} is missing harmony parity token: ${token}`);
  }
}

function rejectTokens(path, tokens) {
  const source = read(path);
  for (const token of tokens) {
    assert(!source.includes(token), `${path} still contains obsolete harmony parity token: ${token}`);
  }
}

requireTokens('cpp/KesshoCore/tests/ProductHarmonyTests.cpp', [
  'requireDirectMusicCoverage',
  'requireScaleIntervals',
  'direct.resolveHarmonyMidi(',
  'major root event mismatch',
  'minor third event mismatch',
  'root transpose mismatch',
  'lydian raised fourth event mismatch',
  'phrygian dominant flat second event mismatch',
  'explicit sequencer pitch override should bypass harmony voicing',
  'explicit sequencer pitch override should survive runtime harmony root changes',
  'explicit sequencer pitch override should survive runtime harmony scale changes',
  'runtime harmony root param did not transpose sequencer event',
  'runtime harmony scale param did not minorize sequencer event',
  'runtime harmony tension param should alter generated sequencer notes',
  'same seed harmony event mismatch',
  'high-tension harmony should be seed-sensitive',
  'journey state event should alter generated sequencer event values',
  'manual harmony intent should be ignored during morph',
  'manual harmony pool should feed sequencer voicing',
  'requireTypeScriptHarmonySequenceParity',
  '60-minute harmony event sequence diverged from deterministic TypeScript reference',
  'kHarmonyLiveEventLatencyBudgetMs',
  'live gesture dispatch exceeded 20 ms latency budget',
]);

requireTokens('cpp/KesshoCore/src/product/music/ScaleEngine.cpp', [
  'major_pentatonic',
  'octatonic_half_whole',
  'phrygian_dominant',
  'case 11:',
]);

requireTokens('cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp', [
  'const bool drum_lane = lane.target_source_id == KESSHO_PRODUCT_SOURCE_DRUM;',
  'resolveHarmonyMidi(lane, lane_index, step_id, event_sample)',
  'const float trigger_midi_note = drum_lane ? drum_midi_note : sequenced_midi_note;',
]);

requireTokens('src/audio/coreProductHarmonyScaleIds.ts', [
  'PRODUCT_HARMONY_SCALE_IDS',
]);

requireTokens('src/audio/coreProductReverbSnapshot.ts', [
  'resolveHarmonyScaleName',
  'selectScaleFamily(createRng',
]);

requireTokens('src/audio/coreProductSnapshot.ts', [
  'const rootMidi = rootMidiFromState(sliderState)',
  'const scaleId = scaleIdFromState(sliderState, tension)',
  'tension,',
  "voicingMode: numberFromState(sliderState, 'voicingMode', 1)",
  'resolveProductHarmonyState',
  'notePoolMidi: fixedHarmonyPool',
]);

requireTokens('src/audio/reference/CoreProductArrangementSchedulerReference.ts', [
  'updateHarmonyState(',
  'pickChordWeightedNote(this.rng, availableNotes',
  'createCoreProductManualNoteEvent',
]);

requireTokens('src/audio/CoreProductHostHarmonyState.ts', [
  'createCoreProductHostHarmonySnapshot',
  'telemetry?.harmonyScaleId',
  'telemetry?.harmonyRootMidi',
  'telemetry?.harmonyNotePoolMidi',
  'telemetry?.harmonyNextNotePoolMidi',
]);

requireTokens('src/audio/coreProductHarmonyParityRegression.test.ts', [
  'drumPitchUiValuesToEngineOffsets',
  'drum semitones mode should store scale-degree offsets from root and scale',
  'drum notes mode should store fixed MIDI notes independent of root and scale',
]);

rejectTokens('src/audio/drumSynth.ts', [
  'private quantizePitchToScale',
  'rawPitch = this.quantizePitchToScale(rawPitch)',
]);

execFileSync(process.execPath, ['scripts/run-kessho-product-harmony-parity-regression.mjs'], {
  cwd: root,
  stdio: 'inherit',
});

execFileSync(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', 'ProductHarmonyTests'], {
  cwd: root,
  stdio: 'inherit',
});
