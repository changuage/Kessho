import {
  createDefaultAnchorWalkerConfig,
  normalizeAnchorWalkerConfig,
  type AnchorWalkerConfig,
} from './anchorWalkerTypes';
import {
  createDefaultOrbitSequencerConfig,
  normalizeOrbitSequencerConfig,
  type OrbitSequencerConfig,
} from './orbitSequencerTypes';

export type SequencerMode = 'euclid' | 'anchorWalker' | 'orbit';

export interface SequencerSlotModeState {
  mode: SequencerMode;
  anchorWalker: AnchorWalkerConfig;
  orbit: OrbitSequencerConfig;
}

export interface SynthSequencerFaceState {
  version: 1;
  slots: SequencerSlotModeState[];
}

export const SYNTH_SEQUENCER_FACE_SLOT_COUNT = 4;

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
}

export function createDefaultSequencerSlotModeState(slotIndex = 0): SequencerSlotModeState {
  return {
    mode: 'euclid',
    anchorWalker: createDefaultAnchorWalkerConfig(slotIndex),
    orbit: createDefaultOrbitSequencerConfig(slotIndex),
  };
}

export function createDefaultSynthSequencerFaceState(): SynthSequencerFaceState {
  return {
    version: 1,
    slots: Array.from({ length: SYNTH_SEQUENCER_FACE_SLOT_COUNT }, (_, index) => createDefaultSequencerSlotModeState(index)),
  };
}

export function normalizeSequencerSlotModeState(value: unknown, slotIndex = 0): SequencerSlotModeState {
  const fallback = createDefaultSequencerSlotModeState(slotIndex);
  const record = typeof value === 'object' && value !== null ? value as Partial<SequencerSlotModeState> : {};
  return {
    mode: enumValue(record.mode, ['euclid', 'anchorWalker', 'orbit'] as const, fallback.mode),
    anchorWalker: normalizeAnchorWalkerConfig(record.anchorWalker, slotIndex),
    orbit: normalizeOrbitSequencerConfig(record.orbit, slotIndex),
  };
}

export function normalizeSynthSequencerFaceState(value: unknown): SynthSequencerFaceState {
  const record = typeof value === 'object' && value !== null ? value as Partial<SynthSequencerFaceState> : {};
  const slots = Array.isArray(record.slots) ? record.slots : [];
  return {
    version: 1,
    slots: Array.from({ length: SYNTH_SEQUENCER_FACE_SLOT_COUNT }, (_, index) => (
      normalizeSequencerSlotModeState(slots[index], index)
    )),
  };
}
