// Builds a state patch for Random Chords / Random Notes after M3.
//
// Product engine: Random Chords and Random Notes are Random slots. A slot is
// `synthSequencerFaces.slots[i].mode === 'random'` plus the
// `synthEuclid<N>Random<Param>` keys (see src/ui/sequencer/synthRandomSlot.ts).
// Chords default to slot 5, Notes to slot 6, the slots the M3 migration uses;
// slots 1-4 stay free for Euclid sequencers.
//
// Web/TS reference engine: it still plays the retired singleton generators
// from `src/audio/reference/legacyArrangementState.ts` (`synthChordGenerator*`,
// `leadRandom*`, `lead1Density`, ...). It reads dozens of those keys across
// webTs/engine.ts, so the helper also emits them, marked below. The product
// engine ignores them. Pass `reference: false` to emit slot keys only.
//
// Usage:
//   randomSlotStatePatch({
//     chords: { source: 'sample2', voiceCount: 2, waveSpread: 0 },
//     notes: { source: 'lead1', density: 0.5, octave: 0, octaveRange: 2, clock: 'globalPhrase' },
//   })
// `enabled` (default true) is per generator; pass `{ chords: { enabled: true } }`
// in a later stateEvent to switch an already-configured slot on. Only the
// settings you pass are emitted, so partial patches never reset other values.

export const RANDOM_CHORDS_SLOT = 5;
export const RANDOM_NOTES_SLOT = 6;
const SLOT_COUNT = 6;

// Product slot param -> option name. Reference key in the second column.
const CHORD_SETTINGS = [
  ['VoiceCount', 'voiceCount', 'synthChordGeneratorVoiceCount'],
  ['WaveSpread', 'waveSpread', 'waveSpread'],
  ['Octave', 'octave', 'synthOctave'],
  ['VoiceMask', 'voiceMask', 'synthVoiceMask'],
  ['Pad2VoiceAssign', 'pad2VoiceAssign', 'pad2VoiceAssign'],
  ['PadSplit', 'padSplit', null],
  ['FitEnvelope', 'fitEnvelope', null],
];
const NOTE_SETTINGS = [
  ['PhraseSource', 'clock', 'leadRandomClockSource'],
  ['Density', 'density', 'lead1Density'],
  ['NotesOctave', 'octave', 'lead1Octave'],
  ['OctaveRange', 'octaveRange', 'lead1OctaveRange'],
  ['TensionMode', 'tensionMode', 'leadTensionMode'],
  ['TensionValue', 'tensionValue', 'leadTensionValue'],
];

function slotKey(slot, param) {
  return `synthEuclid${slot}Random${param}`;
}

function applyGenerator({ patch, legacy, slot, mode, options, settings }) {
  const { enabled = true, source } = options;
  patch[`synthEuclid${slot}Enabled`] = enabled;
  if (source !== undefined) patch[`synthEuclid${slot}Source`] = source;
  patch[slotKey(slot, 'Mode')] = mode;
  for (const [param, name, legacyKey] of settings) {
    if (options[name] === undefined) continue;
    patch[slotKey(slot, param)] = options[name];
    if (legacyKey) legacy[legacyKey] = options[name];
  }
}

/**
 * @param {{
 *   chords?: { enabled?: boolean, source?: string, voiceCount?: number, waveSpread?: number,
 *     octave?: number, voiceMask?: number, pad2VoiceAssign?: number, padSplit?: boolean,
 *     fitEnvelope?: boolean },
 *   notes?: { enabled?: boolean, source?: string, clock?: string, density?: number, octave?: number,
 *     octaveRange?: number, tensionMode?: string, tensionValue?: number,
 *     referenceSyncPolicy?: string, referenceClockDivision?: number },
 *   chordsSlot?: number, notesSlot?: number, reference?: boolean,
 * }} spec
 */
export function randomSlotStatePatch({
  chords,
  notes,
  chordsSlot = RANDOM_CHORDS_SLOT,
  notesSlot = RANDOM_NOTES_SLOT,
  reference = true,
} = {}) {
  const patch = {};
  const legacy = {};
  const slots = Array.from({ length: SLOT_COUNT }, () => null);
  if (chords) {
    slots[chordsSlot - 1] = { mode: 'random' };
    applyGenerator({ patch, legacy, slot: chordsSlot, mode: 'chords', options: chords, settings: CHORD_SETTINGS });
    legacy.synthChordGeneratorEnabled = chords.enabled ?? true;
    if (chords.source !== undefined) legacy.synthChordGeneratorSource = chords.source;
    if (chords.fitEnvelope !== undefined) {
      legacy.padFitEnvelopeToChord = chords.fitEnvelope;
      legacy.pad2FitEnvelopeToChord = chords.fitEnvelope;
    }
  }
  if (notes) {
    slots[notesSlot - 1] = { mode: 'random' };
    applyGenerator({ patch, legacy, slot: notesSlot, mode: 'notes', options: notes, settings: NOTE_SETTINGS });
    legacy.leadRandomEnabled = notes.enabled ?? true;
    if (notes.source !== undefined) legacy.leadRandomSource = notes.source;
    if (notes.referenceSyncPolicy !== undefined) legacy.leadRandomSyncPolicy = notes.referenceSyncPolicy;
    if (notes.referenceClockDivision !== undefined) legacy.leadRandomClockDivision = notes.referenceClockDivision;
  }
  if (chords || notes) {
    patch.synthSequencerFaces = { version: 2, slots };
  }
  // Reference-engine inputs only: retired keys read by legacyArrangementState.ts.
  return reference ? { ...patch, ...legacy } : patch;
}
