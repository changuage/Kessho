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

import { SYNTH_EUCLIDEAN_LANE_COUNT } from '../../audio/sequencerLaneCounts';
/** Slot type. A `random` slot keeps its settings in `synthEuclid<N>Random*` keys. */
export type SequencerMode = 'euclid' | 'anchorWalker' | 'orbit' | 'random';

export interface SequencerSlotModeState {
  mode: SequencerMode;
  /**
   * Stable slot identity: a non-zero uint32 created once and saved. A Random
   * slot seeds its stream from it, so moving or retyping other slots never
   * changes its output.
   */
  partId: number;
  anchorWalker: AnchorWalkerConfig;
  orbit: OrbitSequencerConfig;
}

/** Version 2 adds six slots, `partId` and the Random slot type (the M3 behaviour version). */
export const SYNTH_SEQUENCER_FACE_STATE_VERSION = 2;

export interface SynthSequencerFaceState {
  version: typeof SYNTH_SEQUENCER_FACE_STATE_VERSION;
  slots: SequencerSlotModeState[];
}

export const SYNTH_SEQUENCER_FACE_SLOT_COUNT = SYNTH_EUCLIDEAN_LANE_COUNT;

const SEQUENCER_MODES = ['euclid', 'anchorWalker', 'orbit', 'random'] as const;
const MAX_PART_ID = 0xffffffff;

function isPartId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PART_ID;
}

/** A fresh random non-zero uint32 for a newly created slot. */
export function createSequencerPartId(): number {
  const cryptoSource = (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto;
  if (cryptoSource?.getRandomValues) {
    const value = new Uint32Array(1);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      cryptoSource.getRandomValues(value);
      if (value[0]! >= 1) return value[0]!;
    }
  }
  return 1 + Math.floor(Math.random() * (MAX_PART_ID - 1));
}

/**
 * Deterministic id for slots that predate saved ids. Used only to fill ids
 * when a slot has none (older presets); the result is then saved with the
 * preset like any other id.
 */
export function migrationSequencerPartId(slotIndex: number): number {
  let hash = (0x9e3779b1 ^ Math.imul(slotIndex + 1, 0x85ebca6b)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash === 0 ? 1 : hash;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
}

export function createDefaultSequencerSlotModeState(slotIndex = 0): SequencerSlotModeState {
  return {
    mode: 'euclid',
    partId: createSequencerPartId(),
    anchorWalker: createDefaultAnchorWalkerConfig(slotIndex),
    orbit: createDefaultOrbitSequencerConfig(slotIndex),
  };
}

export function createDefaultSynthSequencerFaceState(): SynthSequencerFaceState {
  const slots = Array.from({ length: SYNTH_SEQUENCER_FACE_SLOT_COUNT }, (_, index) => createDefaultSequencerSlotModeState(index));
  return {
    version: SYNTH_SEQUENCER_FACE_STATE_VERSION,
    slots: uniquePartIds(slots),
  };
}

function uniquePartIds(slots: SequencerSlotModeState[]): SequencerSlotModeState[] {
  const seen = new Set<number>();
  return slots.map((slot, index) => {
    let partId = slot.partId;
    for (let attempt = 0; seen.has(partId); attempt += 1) partId = migrationSequencerPartId(index + 1000 * (attempt + 1));
    seen.add(partId);
    return partId === slot.partId ? slot : { ...slot, partId };
  });
}

export function normalizeSequencerSlotModeState(value: unknown, slotIndex = 0): SequencerSlotModeState {
  const record = typeof value === 'object' && value !== null ? value as Partial<SequencerSlotModeState> : {};
  return {
    mode: enumValue(record.mode, SEQUENCER_MODES, 'euclid'),
    partId: isPartId(record.partId) ? record.partId : migrationSequencerPartId(slotIndex),
    anchorWalker: normalizeAnchorWalkerConfig(record.anchorWalker, slotIndex),
    orbit: normalizeOrbitSequencerConfig(record.orbit, slotIndex),
  };
}

/** Always returns the current version; a missing or older version only affects migration. */
export function normalizeSynthSequencerFaceState(value: unknown): SynthSequencerFaceState {
  const record = typeof value === 'object' && value !== null ? value as Partial<SynthSequencerFaceState> : {};
  const slots = Array.isArray(record.slots) ? record.slots : [];
  return {
    version: SYNTH_SEQUENCER_FACE_STATE_VERSION,
    slots: uniquePartIds(Array.from({ length: SYNTH_SEQUENCER_FACE_SLOT_COUNT }, (_, index) => (
      normalizeSequencerSlotModeState(slots[index], index)
    ))),
  };
}

/** True when a saved faces value predates the M3 behaviour version. */
export function synthSequencerFacesNeedMigration(value: unknown): boolean {
  const version = typeof value === 'object' && value !== null ? (value as { version?: unknown }).version : undefined;
  return typeof version !== 'number' || version < SYNTH_SEQUENCER_FACE_STATE_VERSION;
}
