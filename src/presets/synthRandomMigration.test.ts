import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_STATE,
  RETIRED_ARRANGEMENT_STATE_KEYS,
  decodeStateFromUrl,
  encodeStateToUrl,
  migratePreset,
  serializeState,
} from '../ui/state';
import {
  SYNTH_SEQUENCER_FACE_STATE_VERSION,
  migrationSequencerPartId,
  normalizeSynthSequencerFaceState,
} from '../ui/sequencer/sequencerModeTypes';
import { createCoreProductSnapshot } from '../audio/coreProductSnapshot';
import { completeCanonicalPresetState } from './presetStateCompatibility';
import { canonicalizeStoredPresetEntry } from './storedPresetCompatibility';
import { migrateSynthRandomPresetRecord, migrateSynthRandomSlots } from './synthRandomMigration';

// Asset URL resolution reads window.location; the snapshot builder runs under Node here.
(globalThis as { window?: unknown }).window ??= { location: { origin: 'http://localhost' } };

type Rec = Record<string, unknown>;

function stringWaves(): Rec {
  return JSON.parse(readFileSync('public/presets/StringWaves.json', 'utf8')) as Rec;
}

function noRetiredKeys(record: Rec): void {
  for (const key of RETIRED_ARRANGEMENT_STATE_KEYS) assert.equal(key in record, false, `${key} is dropped`);
}

test('String Waves loads as two Random slots with its original sources and settings', () => {
  const loaded = migratePreset(stringWaves());
  const state = loaded.state as unknown as Rec;
  noRetiredKeys(state);

  const faces = normalizeSynthSequencerFaceState(state.synthSequencerFaces);
  assert.equal(faces.version, SYNTH_SEQUENCER_FACE_STATE_VERSION);
  assert.equal(faces.slots.length, 6);
  assert.deepEqual(faces.slots.map((slot) => slot.mode), ['euclid', 'euclid', 'euclid', 'euclid', 'random', 'random']);

  // Random Chords: slot 5 keeps the generator's source, voices and wave spread.
  assert.equal(state.synthEuclid5Enabled, true);
  assert.equal(state.synthEuclid5Source, 'pad1');
  assert.equal(state.synthEuclid5RandomMode, 'chords');
  assert.equal(state.synthEuclid5RandomVoiceCount, 6);
  assert.equal(state.synthEuclid5RandomWaveSpread, 0.65);
  assert.equal(state.synthEuclid5RandomVoiceMask, 63);
  assert.equal(state.synthEuclid5RandomFitEnvelope, true);
  assert.equal(state.synthEuclid5RandomPadSplit, false);

  // Random Notes: slot 6 keeps the lead source, density, octave and clock.
  assert.equal(state.synthEuclid6Enabled, true);
  assert.equal(state.synthEuclid6Source, 'lead1');
  assert.equal(state.synthEuclid6RandomMode, 'notes');
  assert.equal(state.synthEuclid6RandomDensity, 0.5);
  assert.equal(state.synthEuclid6RandomNotesOctave, 0);
  assert.equal(state.synthEuclid6RandomOctaveRange, 2);
  assert.equal(state.synthEuclid6RandomPhraseSource, 'globalPhrase');
  assert.equal(state.synthEuclid6RandomTensionMode, 'follow');

  // Moving ranges and modes follow the values to the slot keys, and the old keys' metadata is gone.
  assert.deepEqual(loaded.dualRanges?.synthEuclid5RandomWaveSpread, { min: 0.48, max: 1 });
  assert.equal(loaded.sliderModes?.synthEuclid5RandomWaveSpread, 'walk');
  assert.deepEqual(loaded.dualRanges?.synthEuclid6RandomNotesOctave, { min: -1, max: 0 });
  assert.equal(loaded.sliderModes?.synthEuclid6RandomDensity, 'walk');
  assert.equal(loaded.dualRanges?.synthEuclid6RandomOctaveRange?.max, 2);
  for (const key of ['waveSpread', 'lead1Density', 'lead1Octave', 'lead1OctaveRange']) {
    assert.equal(key in (loaded.dualRanges ?? {}), false, `${key} range is dropped`);
    assert.equal(key in (loaded.sliderModes ?? {}), false, `${key} mode is dropped`);
  }
});

test('the bundled loader path and the state-only path migrate String Waves identically', () => {
  const raw = stringWaves();
  const viaRecord = migrateSynthRandomPresetRecord(raw as { state: Rec }) as Rec;
  const fromRecord = completeCanonicalPresetState(viaRecord.state as Rec) as unknown as Rec;
  const stateOnly = completeCanonicalPresetState(raw.state as Rec) as unknown as Rec;
  assert.deepEqual(
    normalizeSynthSequencerFaceState(fromRecord.synthSequencerFaces).slots.map((slot) => [slot.mode, slot.partId]),
    normalizeSynthSequencerFaceState(stateOnly.synthSequencerFaces).slots.map((slot) => [slot.mode, slot.partId]),
  );
  assert.equal(stateOnly.synthEuclid5RandomWaveSpread, 0.65);
  noRetiredKeys(stateOnly);
  assert.equal(
    (viaRecord.dualRanges as Rec).synthEuclid5RandomWaveSpread !== undefined,
    true,
    'the direct-file path moves the metadata as well',
  );

  const snapshot = createCoreProductSnapshot(stateOnly);
  assert.equal(snapshot.synthLanes[4]!.sequencerMode, 3);
  assert.equal(snapshot.synthLanes[4]!.random.mode, 0);
  assert.equal(snapshot.synthLanes[5]!.sequencerMode, 3);
  assert.equal(snapshot.synthLanes[5]!.random.mode, 1);
  const faces = normalizeSynthSequencerFaceState(stateOnly.synthSequencerFaces);
  assert.equal(snapshot.synthLanes[4]!.random.partId, faces.slots[4]!.partId);
  assert.equal(snapshot.synthLanes[5]!.random.partId, faces.slots[5]!.partId);
});

test('a stored state preset migrates through the canonical storage boundary', () => {
  const raw = stringWaves();
  const entry = canonicalizeStoredPresetEntry({
    id: 'preset-1',
    type: 'state',
    scope: 'global',
    source: 'global',
    name: 'Old',
    author: 'user',
    library: 'user',
    currentVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    versions: [{
      v: 1,
      note: '',
      timestamp: 1,
      data: raw.state,
      dualRanges: raw.dualRanges,
      sliderModes: raw.sliderModes,
    }],
  }) as { versions: Array<{ data: Rec; dualRanges: Rec; sliderModes: Rec }> };
  const version = entry.versions[0]!;
  noRetiredKeys(version.data);
  assert.equal(version.data.synthEuclid5RandomMode, 'chords');
  assert.deepEqual(version.dualRanges.synthEuclid5RandomWaveSpread, { min: 0.48, max: 1 });
  assert.equal('waveSpread' in version.dualRanges, false);
});

test('a chords-only preset becomes one Random Chords slot in the first free slot', () => {
  const state: Rec = {
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'both',
    synthChordGeneratorVoiceCount: 4,
    waveSpread: 0.3,
    synthOctave: -1,
    synthVoiceMask: 0b1111,
    pad2VoiceAssign: 0b1100,
    pad2FitEnvelopeToChord: false,
    padFitEnvelopeToChord: true,
    leadRandomEnabled: false,
    lead1Density: 3,
    synthSequencerFaces: { version: 1, slots: [] },
  };
  const target = { state, dualRanges: { lead1Density: { min: 1, max: 4 } } as Rec, sliderModes: {} as Rec };
  assert.equal(migrateSynthRandomSlots(target), true);
  const faces = normalizeSynthSequencerFaceState(state.synthSequencerFaces);
  assert.deepEqual(faces.slots.map((slot) => slot.mode), ['euclid', 'euclid', 'euclid', 'euclid', 'random', 'euclid']);
  assert.equal(state.synthEuclid5Source, 'pad1', '"both" plays on Pad 1 and splits across the pads');
  assert.equal(state.synthEuclid5RandomPadSplit, true);
  assert.equal(state.synthEuclid5RandomVoiceCount, 4);
  assert.equal(state.synthEuclid5RandomWaveSpread, 0.3);
  assert.equal(state.synthEuclid5RandomOctave, -1);
  assert.equal(state.synthEuclid5RandomVoiceMask, 0b1111);
  assert.equal(state.synthEuclid5RandomPad2VoiceAssign, 0b1100);
  assert.equal(state.synthEuclid5RandomFitEnvelope, true, 'a Pad 1 chord uses the Pad 1 fit flag');
  assert.equal('synthEuclid6RandomDensity' in state && state.synthEuclid6RandomDensity !== undefined, false, 'no Notes slot without Random Notes');
  assert.equal(state.synthEuclid6Enabled, undefined);
  noRetiredKeys(state);
  assert.equal('lead1Density' in target.dualRanges, false, 'metadata for a generator that was off is dropped');
});

test('Random Notes alone takes the first free slot, and both generators take 5 then 6', () => {
  const notesOnly: Rec = { leadRandomEnabled: true, leadRandomSource: 'piano', lead1Density: 2, leadTensionMode: 'locked', leadTensionValue: 0.4 };
  migrateSynthRandomSlots({ state: notesOnly });
  assert.equal(notesOnly.synthEuclid5RandomMode, 'notes');
  assert.equal(notesOnly.synthEuclid5Source, 'sample1', 'the Piano alias loads as Sample 1');
  assert.equal(notesOnly.synthEuclid5RandomTensionMode, 'locked');
  assert.equal(notesOnly.synthEuclid5RandomTensionValue, 0.4);

  const both: Rec = { synthChordGeneratorEnabled: true, leadRandomEnabled: true };
  migrateSynthRandomSlots({ state: both });
  assert.equal(both.synthEuclid5RandomMode, 'chords');
  assert.equal(both.synthEuclid6RandomMode, 'notes');
});

test('legacy voice sources load as Pad 1 or Pad 2 voices before the global assignment is dropped', () => {
  const state: Rec = {
    pad2Enabled: true,
    pad2VoiceAssign: 0b100,
    synthEuclid1Source: 'synth3',
    synthEuclid2Source: 'synth1',
    synthChordGeneratorEnabled: false,
  };
  migrateSynthRandomSlots({ state });
  assert.equal(state.synthEuclid1Source, 'pad2');
  assert.equal(state.synthEuclid1VoiceMask, 0b100);
  assert.equal(state.synthEuclid2Source, 'pad1');
  assert.equal(state.synthEuclid2VoiceMask, 0b1);
});

test('migrating twice, or migrating a current preset, changes nothing', () => {
  const once = migratePreset(stringWaves()).state as unknown as Rec;
  const snapshot = JSON.stringify(once);
  const twice = migratePreset({ name: 'again', timestamp: 'x', state: JSON.parse(snapshot) }).state as unknown as Rec;
  assert.deepEqual(
    normalizeSynthSequencerFaceState(twice.synthSequencerFaces),
    normalizeSynthSequencerFaceState(once.synthSequencerFaces),
  );
  assert.equal(twice.synthEuclid5RandomWaveSpread, 0.65);
  assert.equal(twice.synthEuclid6Source, 'lead1');
});

test('partId is created once, saved, and survives save and load', () => {
  const faces = normalizeSynthSequencerFaceState(DEFAULT_STATE.synthSequencerFaces);
  const ids = faces.slots.map((slot) => slot.partId);
  assert.equal(new Set(ids).size, 6, 'six distinct ids');
  for (const id of ids) assert.ok(Number.isInteger(id) && id >= 1 && id <= 0xffffffff, 'non-zero uint32');
  assert.deepEqual(
    DEFAULT_STATE.synthSequencerFaces.slots.map((slot) => slot.partId),
    ids,
    'normalising never rewrites a saved id',
  );

  const url = decodeStateFromUrl(`?${encodeStateToUrl(DEFAULT_STATE)}`);
  assert.deepEqual(url?.synthSequencerFaces.slots.map((slot) => slot.partId), ids, 'URL round trip');

  const reloaded = migratePreset(JSON.parse(JSON.stringify({ name: 'saved', timestamp: 'x', state: DEFAULT_STATE })));
  assert.deepEqual(reloaded.state.synthSequencerFaces.slots.map((slot) => slot.partId), ids, 'preset round trip');

  const stored = JSON.parse(serializeState(DEFAULT_STATE)) as Rec;
  assert.ok(stored.synthSequencerFaces, 'ids are part of the saved state');
});

test('slots without a saved id get a deterministic one from their position, once', () => {
  const filled = normalizeSynthSequencerFaceState({ version: 1, slots: [{ mode: 'euclid' }, { mode: 'orbit' }] });
  assert.equal(filled.slots[0]!.partId, migrationSequencerPartId(0));
  assert.equal(filled.slots[1]!.partId, migrationSequencerPartId(1));
  assert.deepEqual(
    normalizeSynthSequencerFaceState({ version: 1, slots: [] }).slots.map((slot) => slot.partId),
    normalizeSynthSequencerFaceState(undefined).slots.map((slot) => slot.partId),
    'the fill depends on the slot position only',
  );
  const duplicated = normalizeSynthSequencerFaceState({
    version: 2,
    slots: [{ mode: 'random', partId: 77 }, { mode: 'random', partId: 77 }],
  });
  assert.notEqual(duplicated.slots[0]!.partId, duplicated.slots[1]!.partId, 'two slots never share a stream');
});

test('retired generator keys are ignored on load and never saved', () => {
  const url = decodeStateFromUrl(`?${encodeStateToUrl(DEFAULT_STATE)}&waveSpread=0.9&leadRandomEnabled=true&leadRandomSource=lead2`);
  assert.ok(url);
  noRetiredKeys(url as unknown as Rec);
  const encoded = encodeStateToUrl(url!);
  for (const key of RETIRED_ARRANGEMENT_STATE_KEYS) assert.equal(encoded.includes(`${key}=`), false, `${key} is never saved`);
});
