import {
  normalizeSynthSequencerFaceState,
  type SequencerSlotModeState,
} from '../ui/sequencer/sequencerModeTypes';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import type { SampleSlotId } from './sampleLibraries/SampleLibraryTypes';

export type CoreProductSampleSequencerLaneRange = {
  source: SampleSlotId;
  minMidi: number;
  maxMidi: number;
};

export type CoreProductSequencerTargetDiscovery = {
  sourceIds: Set<number>;
  sampleRanges: CoreProductSampleSequencerLaneRange[];
};

const DEFAULT_SYNTH_EUCLID_NOTE_RANGES = [
  { min: 64, max: 76 },
  { min: 76, max: 88 },
  { min: 52, max: 64 },
  { min: 88, max: 96 },
] as const;

function booleanFromState(state: Record<string, unknown> | null | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function numberFromState(state: Record<string, unknown>, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampMidi(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.max(0, Math.min(127, Math.round(value)));
}

function orderedMidiRange(minMidi: number, maxMidi: number): { minMidi: number; maxMidi: number } {
  const min = clampMidi(minMidi);
  const max = clampMidi(maxMidi);
  return min <= max ? { minMidi: min, maxMidi: max } : { minMidi: max, maxMidi: min };
}

export function productSourceIdFromValue(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const source = String(value ?? '').trim().toLowerCase();
  if (source === 'pad' || source === 'pad1') return CORE_PRODUCT_SOURCE_IDS.pad1;
  if (source === 'pad2') return CORE_PRODUCT_SOURCE_IDS.pad2;
  if (source === 'lead' || source === 'lead1') return CORE_PRODUCT_SOURCE_IDS.lead1;
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'sample1') return CORE_PRODUCT_SOURCE_IDS.sample1;
  if (source === 'sample2') return CORE_PRODUCT_SOURCE_IDS.sample2;
  return fallback;
}

function sampleSlotForSourceId(sourceId: number): SampleSlotId | null {
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.sample1) return 'sample1';
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.sample2) return 'sample2';
  return null;
}

function resolvedTargetSourceId(value: unknown, fallbackSourceId: number): number {
  return value === 'follow' ? fallbackSourceId : productSourceIdFromValue(value, fallbackSourceId);
}

function addTarget(discovery: CoreProductSequencerTargetDiscovery, sourceId: number): void {
  if (sourceId >= CORE_PRODUCT_SOURCE_IDS.pad1 && sourceId <= CORE_PRODUCT_SOURCE_IDS.sample2) {
    discovery.sourceIds.add(sourceId);
  }
}

function addSampleRange(
  discovery: CoreProductSequencerTargetDiscovery,
  sourceId: number,
  minMidi: number,
  maxMidi: number,
): void {
  addTarget(discovery, sourceId);
  const slotId = sampleSlotForSourceId(sourceId);
  if (!slotId) return;
  const range = orderedMidiRange(minMidi, maxMidi);
  discovery.sampleRanges.push({ source: slotId, ...range });
}

function synthEuclidRange(state: Record<string, unknown>, laneNumber: number): { minMidi: number; maxMidi: number } {
  const defaults = DEFAULT_SYNTH_EUCLID_NOTE_RANGES[laneNumber - 1] ?? DEFAULT_SYNTH_EUCLID_NOTE_RANGES[0];
  return orderedMidiRange(
    numberFromState(state, `synthEuclid${laneNumber}NoteMin`, defaults.min),
    numberFromState(state, `synthEuclid${laneNumber}NoteMax`, defaults.max),
  );
}

function addChordGeneratorTarget(discovery: CoreProductSequencerTargetDiscovery, state: Record<string, unknown>): void {
  if (!booleanFromState(state, 'synthChordGeneratorEnabled', false)) return;
  const sourceId = productSourceIdFromValue(state.synthChordGeneratorSource, CORE_PRODUCT_SOURCE_IDS.sample1);
  const octaveShift = Math.max(-2, Math.min(2, Math.round(numberFromState(state, 'synthOctave', 0)))) * 12;
  addSampleRange(discovery, sourceId, 36 + octaveShift, 84 + octaveShift);
}

function addRandomTimingTarget(discovery: CoreProductSequencerTargetDiscovery, state: Record<string, unknown>): void {
  if (!booleanFromState(state, 'leadRandomEnabled', false)) return;
  const sourceId = productSourceIdFromValue(state.leadRandomSource, CORE_PRODUCT_SOURCE_IDS.lead1);
  const baseOctaveOffset = Math.max(-1, Math.min(2, Math.round(numberFromState(state, 'lead1Octave', 1))));
  const octaveRange = Math.max(1, Math.min(4, Math.round(numberFromState(state, 'lead1OctaveRange', 2))));
  const baseLow = 64 + baseOctaveOffset * 12;
  addSampleRange(discovery, sourceId, baseLow, baseLow + octaveRange * 12);
}

function addEuclidTarget(
  discovery: CoreProductSequencerTargetDiscovery,
  state: Record<string, unknown>,
  laneNumber: number,
  fallbackSourceId: number,
): void {
  const range = synthEuclidRange(state, laneNumber);
  addSampleRange(discovery, fallbackSourceId, range.minMidi, range.maxMidi);
}

function addAnchorWalkerTarget(
  discovery: CoreProductSequencerTargetDiscovery,
  slot: SequencerSlotModeState | undefined,
  fallbackSourceId: number,
): void {
  const walker = slot?.anchorWalker;
  if (!walker?.enabled) return;
  const walkerSourceId = fallbackSourceId;
  addTarget(discovery, walkerSourceId);
  const baseRange = orderedMidiRange(walker.outputRangeMin, walker.outputRangeMax);
  let emittedLayer = false;
  for (const layer of walker.layers) {
    if (!layer.enabled) continue;
    emittedLayer = true;
    const sourceId = resolvedTargetSourceId(layer.targetSourceId, walkerSourceId);
    const transpose = Number.isFinite(layer.transposeSemitones) ? Math.round(layer.transposeSemitones) : 0;
    addSampleRange(discovery, sourceId, baseRange.minMidi + transpose, baseRange.maxMidi + transpose);
  }
  if (!emittedLayer) {
    addSampleRange(discovery, walkerSourceId, baseRange.minMidi, baseRange.maxMidi);
  }
}

function addOrbitTarget(
  discovery: CoreProductSequencerTargetDiscovery,
  slot: SequencerSlotModeState | undefined,
  fallbackSourceId: number,
): void {
  const orbit = slot?.orbit;
  if (!orbit?.enabled) return;
  const orbitSourceId = fallbackSourceId;
  addTarget(discovery, orbitSourceId);
  const orbitRange = orderedMidiRange(orbit.pitchRangeMin, orbit.pitchRangeMax);
  for (const note of orbit.notes) {
    if (!note.enabled) continue;
    const sourceId = resolvedTargetSourceId(note.targetSourceId, orbitSourceId);
    const noteRange = orderedMidiRange(note.pitchRangeMin, note.pitchRangeMax);
    const minMidi = Math.max(orbitRange.minMidi, noteRange.minMidi);
    const maxMidi = Math.min(orbitRange.maxMidi, noteRange.maxMidi);
    if (note.pitchMode === 'fixedMidi') {
      const midi = Math.max(minMidi, Math.min(maxMidi, clampMidi(note.midiNote)));
      addSampleRange(discovery, sourceId, midi, midi);
    } else {
      addSampleRange(discovery, sourceId, minMidi, maxMidi);
    }
  }
}

function addNativeSynthSequencerTargets(discovery: CoreProductSequencerTargetDiscovery, state: Record<string, unknown>): void {
  if (!booleanFromState(state, 'synthEuclideanMasterEnabled', false)) return;
  const faceState = normalizeSynthSequencerFaceState(state.synthSequencerFaces);
  for (let laneNumber = 1; laneNumber <= 4; laneNumber += 1) {
    if (!booleanFromState(state, `synthEuclid${laneNumber}Enabled`, laneNumber === 1)) continue;
    const fallbackSourceId = productSourceIdFromValue(state[`synthEuclid${laneNumber}Source`], CORE_PRODUCT_SOURCE_IDS.lead1);
    const slot = faceState.slots[laneNumber - 1];
    const mode = slot?.mode ?? 'euclid';
    if (mode === 'anchorWalker') {
      addAnchorWalkerTarget(discovery, slot, fallbackSourceId);
    } else if (mode === 'orbit') {
      addOrbitTarget(discovery, slot, fallbackSourceId);
    } else {
      addEuclidTarget(discovery, state, laneNumber, fallbackSourceId);
    }
  }
}

export function discoverCoreProductSequencerTargets(
  state: Record<string, unknown> | null | undefined,
): CoreProductSequencerTargetDiscovery {
  const discovery: CoreProductSequencerTargetDiscovery = {
    sourceIds: new Set(),
    sampleRanges: [],
  };
  if (!state) return discovery;
  addChordGeneratorTarget(discovery, state);
  addRandomTimingTarget(discovery, state);
  addNativeSynthSequencerTargets(discovery, state);
  return discovery;
}

export function coreProductSequencerTargetsSource(
  state: Record<string, unknown> | null | undefined,
  sourceId: number,
): boolean {
  return discoverCoreProductSequencerTargets(state).sourceIds.has(sourceId);
}
