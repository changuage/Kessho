// The M3 behaviour-version step.
//
// Before M3 Random Chords and Random Notes were two singleton producers whose
// settings lived in global arrangement keys. They are now Random slots: any of
// the six synth slots can be Random, with its own `synthEuclid<N>Random*`
// keys. A saved preset whose `synthSequencerFaces` predates version 2 gets the
// generators moved into slots 5 and 6 exactly once; the old keys (and their
// slider metadata) are then dropped and never saved again.

import {
  normalizeSynthSequencerFaceState,
  synthSequencerFacesNeedMigration,
} from '../ui/sequencer/sequencerModeTypes';
import { synthRandomKey, type SynthRandomParam } from '../ui/sequencer/synthRandomSlot';
import { RETIRED_ARRANGEMENT_STATE_KEYS, RETIRED_STATE_KEYS } from '../ui/state';

type JsonRecord = Record<string, unknown>;

export interface SynthRandomMigrationTarget {
  state: JsonRecord;
  dualRanges?: JsonRecord;
  sliderModes?: JsonRecord;
  dualSliderConfigs?: JsonRecord;
}

/** Slots 1-4 are the only slots an older preset could have authored. */
const FIRST_FREE_SLOT_INDEX = 4;
const LAST_SLOT_INDEX = 5;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Old presets stored wave spread in seconds; it has been a chord-slot fraction since. */
function legacyWaveSpread(state: JsonRecord): number {
  const stored = finite(state.waveSpread, 0.125);
  if (stored <= 1) return stored;
  return Math.min(1, stored / finite(state.chordRate, 32));
}

function chordSource(state: JsonRecord): { source: string; split: boolean } {
  const raw = String(state.synthChordGeneratorSource ?? 'sample1').trim().toLowerCase();
  if (raw === 'both') return { source: 'pad1', split: true };
  const allowed = ['pad1', 'pad2', 'lead1', 'lead2', 'sample1', 'sample2'];
  return { source: allowed.includes(raw) ? raw : 'sample1', split: false };
}

function notesSource(state: JsonRecord): string {
  const raw = String(state.leadRandomSource ?? 'lead1').trim().toLowerCase();
  if (raw === 'piano') return 'sample1';
  return ['pad1', 'pad2', 'lead1', 'lead2', 'sample1', 'sample2'].includes(raw) ? raw : 'lead1';
}

function moveMetadata(
  target: SynthRandomMigrationTarget,
  oldKey: string,
  newKey: string | null,
): void {
  for (const map of [target.dualRanges, target.sliderModes, target.dualSliderConfigs]) {
    if (!map || !(oldKey in map)) continue;
    if (newKey && !(newKey in map)) map[newKey] = map[oldKey];
    delete map[oldKey];
  }
}

/** Old `synthN` voice sources were resolved through the global Pad 2 assignment. */
function migrateVoiceSources(state: JsonRecord): void {
  const pad2Assign = Math.round(finite(state.pad2VoiceAssign, 0)) & 0xff;
  const pad2Enabled = state.pad2Enabled === true;
  for (let lane = 1; lane <= FIRST_FREE_SLOT_INDEX; lane += 1) {
    const sourceKey = `synthEuclid${lane}Source`;
    const source = String(state[sourceKey] ?? '').toLowerCase();
    const match = /^synth([1-8])$/.exec(source);
    if (!match) continue;
    const bit = 1 << (Number(match[1]) - 1);
    state[sourceKey] = pad2Enabled && (pad2Assign & bit) !== 0 ? 'pad2' : 'pad1';
    state[`synthEuclid${lane}VoiceMask`] = bit;
  }
}

function setRandomSettings(
  state: JsonRecord,
  laneNumber: number,
  source: string,
  settings: Partial<Record<SynthRandomParam, unknown>>,
): void {
  state[`synthEuclid${laneNumber}Enabled`] = true;
  state[`synthEuclid${laneNumber}Source`] = source;
  for (const [param, value] of Object.entries(settings)) {
    state[synthRandomKey(laneNumber, param as SynthRandomParam)] = value;
  }
}

/**
 * Applies the migration to one preset record in place. Returns true when the
 * generators moved into slots. Safe on current records: anything already at
 * the current faces version only has its retired keys dropped.
 */
export function migrateSynthRandomSlots(target: SynthRandomMigrationTarget): boolean {
  const { state } = target;
  let migrated = false;
  if (synthSequencerFacesNeedMigration(state.synthSequencerFaces)) {
    const wantsChords = state.synthChordGeneratorEnabled === true;
    const wantsNotes = state.leadRandomEnabled === true;
    const hasOldKeys = RETIRED_ARRANGEMENT_STATE_KEYS.some((key) => key in state);
    if (wantsChords || wantsNotes || hasOldKeys) {
      migrateVoiceSources(state);
      const faces = normalizeSynthSequencerFaceState(state.synthSequencerFaces);
      let freeIndex = FIRST_FREE_SLOT_INDEX;
      const claim = (): number | null => {
        if (freeIndex > LAST_SLOT_INDEX) return null;
        const index = freeIndex;
        freeIndex += 1;
        faces.slots[index] = { ...faces.slots[index]!, mode: 'random' };
        return index + 1;
      };
      if (wantsChords) {
        const lane = claim();
        if (lane !== null) {
          const { source, split } = chordSource(state);
          const fitKey = source === 'pad2' ? 'pad2FitEnvelopeToChord' : 'padFitEnvelopeToChord';
          setRandomSettings(state, lane, source, {
            Mode: 'chords',
            VoiceCount: clamp(Math.round(finite(state.synthChordGeneratorVoiceCount, 6)), 1, 8),
            WaveSpread: clamp(legacyWaveSpread(state), 0, 1),
            Octave: clamp(Math.round(finite(state.synthOctave, 0)), -4, 4),
            VoiceMask: clamp(Math.round(finite(state.synthVoiceMask, 63)), 0, 255),
            Pad2VoiceAssign: clamp(Math.round(finite(state.pad2VoiceAssign, 0)), 0, 255),
            PadSplit: split,
            FitEnvelope: state[fitKey] !== false,
          });
          moveMetadata(target, 'waveSpread', synthRandomKey(lane, 'WaveSpread'));
          moveMetadata(target, 'synthOctave', synthRandomKey(lane, 'Octave'));
        }
      }
      if (wantsNotes) {
        const lane = claim();
        if (lane !== null) {
          const tensionMode = state.leadTensionMode === 'locked' || state.leadTensionMode === 'bypass'
            ? state.leadTensionMode
            : 'follow';
          const clock = String(state.leadRandomClockSource ?? 'globalPhrase');
          setRandomSettings(state, lane, notesSource(state), {
            Mode: 'notes',
            PhraseSource: ['globalPhrase', 'localPhrase', 'globalBeat', 'localBeat'].includes(clock) ? clock : 'globalPhrase',
            Density: clamp(finite(state.lead1Density, 0.5), 0.1, 12),
            NotesOctave: clamp(Math.round(finite(state.lead1Octave, 1)), -4, 4),
            OctaveRange: clamp(Math.round(finite(state.lead1OctaveRange, 2)), 1, 4),
            TensionMode: tensionMode,
            TensionValue: clamp(finite(state.leadTensionValue, 0), -0.5, 0.5),
          });
          moveMetadata(target, 'lead1Density', synthRandomKey(lane, 'Density'));
          moveMetadata(target, 'lead1Octave', synthRandomKey(lane, 'NotesOctave'));
          moveMetadata(target, 'lead1OctaveRange', synthRandomKey(lane, 'OctaveRange'));
        }
      }
      state.synthSequencerFaces = faces;
      migrated = wantsChords || wantsNotes;
    }
  }
  stripRetiredStateKeys(target);
  return migrated;
}

/** Drops retired keys (and their slider metadata) from a preset record. */
export function stripRetiredStateKeys(target: SynthRandomMigrationTarget): void {
  for (const key of RETIRED_STATE_KEYS) {
    delete target.state[key];
    for (const map of [target.dualRanges, target.sliderModes, target.dualSliderConfigs]) {
      if (map) delete map[key];
    }
  }
}

/**
 * Migrates a whole preset-shaped record (`state` plus its slider metadata) and
 * returns a migrated copy, leaving the input untouched.
 */
export function migrateSynthRandomPresetRecord<T extends { state?: unknown }>(record: T): T {
  const source = record as Record<string, unknown>;
  const copyMap = (value: unknown): JsonRecord | undefined => (
    value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...(value as JsonRecord) } : undefined
  );
  const state = copyMap(source.state);
  if (!state) return record;
  const target: SynthRandomMigrationTarget = {
    state,
    dualRanges: copyMap(source.dualRanges),
    sliderModes: copyMap(source.sliderModes),
    dualSliderConfigs: copyMap(source.dualSliderConfigs),
  };
  migrateSynthRandomSlots(target);
  const next: Record<string, unknown> = { ...source, state: target.state };
  for (const field of ['dualRanges', 'sliderModes', 'dualSliderConfigs'] as const) {
    if (target[field]) next[field] = target[field];
  }
  return next as T;
}
