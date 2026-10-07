import type { SharedHarmonyChord } from '../../audio/harmony/harmonyTypes';
import type { ProductArpConfig } from '../../audio/productArpeggiator';
import { SCALES, semitoneToScaleDegree, type ClockDivision } from '../../audio/drumSeqTypes';
import { sequencerClockDivisionToNumericValue } from '../../audio/sequencerClockDivisions';
import type { SerializedStepOverrides } from '../state';
import type { SerializedSequenceLanePresetState } from './sequencePresetLane';
import { computeGridRelativeNudge } from './nudgeTiming';
import { createBitmapTriggerClip, deserializeTriggerClip, resolveTriggerClip, rotateTriggerClip, serializeTriggerClip } from './triggerClip';

export const SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION = 1 as const;
export const SYNTH_SEQUENCE_VARIATION_IDS = ['A', 'B', 'C', 'D'] as const;
export type SynthSequenceVariationId = typeof SYNTH_SEQUENCE_VARIATION_IDS[number];
export type SynthSequenceVariationIndex = 0 | 1 | 2 | 3;
export type SynthSequenceVariationMode = 'note' | 'chord' | 'arp';

const ROTATABLE_VARIATION_OVERRIDE_KEYS = [
  'probability', 'ratchet', 'trigCondition', 'expression', 'pitch', 'morph', 'distance', 'nudge', 'slice', 'reverse',
] as const;

function rotateArray<T>(values: readonly T[], delta: number): T[] {
  if (values.length <= 1) return [...values];
  const shift = positiveModulo(delta, values.length);
  return values.map((_, index) => values[positiveModulo(index - shift, values.length)]!);
}

function rotateHitArray<T>(values: readonly T[], pattern: readonly boolean[], delta: number): T[] | null {
  const oldHits = pattern.map((enabled, step) => enabled ? step : -1).filter((step) => step >= 0);
  if (values.length !== oldHits.length || oldHits.length === 0) return null;
  const nextPattern = rotateArray(pattern, delta);
  const nextHits = nextPattern.map((enabled, step) => enabled ? step : -1).filter((step) => step >= 0);
  const next = Array.from({ length: values.length }, () => values[0]!);
  oldHits.forEach((oldStep, oldIndex) => {
    const nextStep = positiveModulo(oldStep + delta, pattern.length);
    const nextIndex = nextHits.indexOf(nextStep);
    if (nextIndex >= 0) next[nextIndex] = values[oldIndex]!;
  });
  return next;
}

/** Rotate a printed variation while preserving each value's trigger ownership. */
export function rotateSynthSequenceVariation(
  variation: SynthSequenceVariation,
  delta: number,
): SynthSequenceVariation {
  const steps = Math.max(1, Math.round(variation.steps));
  const safeDelta = positiveModulo(delta, steps);
  if (steps <= 1 || safeDelta === 0) return variation;
  const serializedClip = variation.lane.overrides.triggerClips?.[0];
  const clip = deserializeTriggerClip(serializedClip);
  const pattern = clip ? resolveTriggerClip(clip).slice(0, steps) : Object.keys(variation.stepMetadata).map(Number).reduce((bits, step) => {
    if (step >= 0 && step < steps) bits[step] = true;
    return bits;
  }, Array.from({ length: steps }, () => false));
  const overrides: SerializedStepOverrides = { ...variation.lane.overrides };
  const sourceRecord = variation.lane.overrides as unknown as Record<string, unknown>;
  const overrideRecord = overrides as unknown as Record<string, unknown>;
  for (const key of ROTATABLE_VARIATION_OVERRIDE_KEYS) {
    const sourceLanes = sourceRecord[key];
    const values = Array.isArray(sourceLanes) && Array.isArray(sourceLanes[0]) ? sourceLanes[0] as unknown[] : null;
    if (!values) continue;
    const hitBound = key === 'expression' || key === 'nudge'
      ? variation.lane.state.subLaneStates?.[key]?.followTriggerHits === true
      : key === 'pitch'
        ? variation.lane.state.pitchBindingMode !== 'sequence'
        : false;
    const rotated = hitBound
      ? rotateHitArray(values, pattern, safeDelta)
      : values.length === steps ? rotateArray(values, safeDelta) : null;
    if (rotated) {
      const lanes = Array.isArray(overrideRecord[key]) ? [...overrideRecord[key] as unknown[]] : [];
      lanes[0] = rotated;
      overrideRecord[key] = lanes;
    }
  }
  const nextClip = clip ? rotateTriggerClip(clip, safeDelta) : null;
  if (nextClip) {
    overrides.triggerClips = [serializeTriggerClip(nextClip)];
    overrides.triggerToggles = [[]];
  }
  const stepMetadata = Object.fromEntries(Object.entries(variation.stepMetadata).map(([step, metadata]) => [
    String(positiveModulo(Number(step) + safeDelta, steps)),
    metadata,
  ]));
  return {
    ...variation,
    lane: { ...variation.lane, overrides },
    stepMetadata,
  };
}

/** The bank is persisted; its selection is deliberately UI-owned and transient. */
export interface SynthSequenceVariationPlaybackSelection {
  laneIndex: number;
  /** UI-only edit/play selection; never serialized into the bank. */
  selectedVariation: SynthSequenceVariationIndex;
}

export type SynthSequenceVariationSelection = SynthSequenceVariationPlaybackSelection;

export function selectSynthSequenceVariationInBank(
  bank: SynthSequenceVariationBank,
  variationId: SynthSequenceVariationId,
): SynthSequenceVariationBank {
  if (bank.chainEnabled) return bank;
  const index = SYNTH_SEQUENCE_VARIATION_IDS.indexOf(variationId);
  if (index < 0 || bank.playVariation === index) return bank;
  return { ...bank, playVariation: index as SynthSequenceVariationIndex };
}

export interface SynthVariationLane {
  /** A serialized lane copied through sequencePresetLane helpers (source lane 0). */
  overrides: SerializedStepOverrides;
  state: SerializedSequenceLanePresetState;
}

export type SynthVariationLaneInput = Omit<SynthVariationLane, 'overrides'> & {
  overrides?: SerializedStepOverrides;
};

export interface SynthLocalChordInterval {
  intervalSemitones: number;
  velocity: number;
  gateBeats?: number;
}

export interface SynthLocalChordPayload {
  /** Intervals are rooted at the step's pitch; this local list is playback authority. */
  intervals: SynthLocalChordInterval[];
  followHarmony?: boolean;
  /** Optional semantic context for display/adoption, never required for playback. */
  sharedChord?: SharedHarmonyChord;
}

export interface SynthVariationArpPayload {
  config: ProductArpConfig;
  spanBeats?: number;
}

export interface SynthVariationStepMetadata {
  mode: SynthSequenceVariationMode;
  gateBeats: number;
  followHarmony?: boolean;
  chord?: SynthLocalChordPayload;
  arp?: SynthVariationArpPayload;
}

export function synthVariationStepLengthMax(metadata: SynthVariationStepMetadata): number {
  const longestVoice = Math.max(metadata.gateBeats, ...(metadata.chord?.intervals.map((interval) => interval.gateBeats ?? metadata.gateBeats) ?? []));
  return metadata.gateBeats > 0 && longestVoice > metadata.gateBeats
    ? 64 * metadata.gateBeats / longestVoice
    : 64;
}

/** Keep captured chord voices proportional when editing the shared note length. */
export function withSynthVariationStepLength(metadata: SynthVariationStepMetadata, length: number): SynthVariationStepMetadata {
  const gateBeats = Number.isFinite(length) ? Math.max(0, Math.min(synthVariationStepLengthMax(metadata), length)) : metadata.gateBeats;
  return {
    ...metadata,
    gateBeats,
    ...(metadata.chord ? { chord: {
      ...metadata.chord,
      intervals: metadata.chord.intervals.map((interval) => ({
        ...interval,
        gateBeats: metadata.gateBeats > 0
          ? (interval.gateBeats ?? metadata.gateBeats) * gateBeats / metadata.gateBeats
          : gateBeats,
      })),
    } } : {}),
  };
}

export interface SynthSequenceVariation {
  id: SynthSequenceVariationId;
  steps: number;
  spanBeats: number;
  lane: SynthVariationLane;
  /** Keys are local trigger step indices. Pitch/velocity/nudge remain in lane overrides. */
  stepMetadata: Record<string, SynthVariationStepMetadata>;
}

export interface SynthSequenceVariationBank {
  schemaVersion: typeof SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION;
  phraseBeats: number;
  clockDiv: ClockDivision;
  chainEnabled: boolean;
  /** Index of the variation used when chain playback is disabled. */
  playVariation: SynthSequenceVariationIndex;
  chainOrder: SynthSequenceVariationId[];
  variations: Partial<Record<SynthSequenceVariationId, SynthSequenceVariation>>;
}

export type SynthSequenceVariationBanks = Array<SynthSequenceVariationBank | null>;

export interface SynthVariationCaptureNote {
  id?: string;
  /** Phrase phase, or an unwrapped offset from the capture origin for audio batches. */
  onsetBeats: number;
  durationBeats: number;
  pitch: number;
  velocity: number;
  sourceId?: number;
  chordGroupId?: string;
  mode?: SynthSequenceVariationMode;
  chord?: SynthLocalChordPayload;
  arp?: SynthVariationArpPayload;
  /** A held input is included in a print snapshot until its noteoff arrives. */
  held?: boolean;
}

export interface SynthVariationPrintInput {
  phraseBeats: number;
  /** Existing lane state is copied for every printed variation. */
  baseLane: SynthVariationLaneInput;
  notes: readonly SynthVariationCaptureNote[];
  /** Optional preferred resolution. Candidates are still restricted to supported clocks. */
  clockDiv?: ClockDivision;
}

export type SynthVariationPrintFailure =
  | 'invalid-phrase'
  | 'invalid-note'
  | 'unsupported-resolution'
  | 'capacity'
  | 'collision';

export interface SynthVariationPrintResult {
  accepted: boolean;
  bank: SynthSequenceVariationBank | null;
  failure?: SynthVariationPrintFailure;
  message?: string;
}

export class SynthSequenceVariationValidationError extends Error {
  readonly code = 'invalid-synth-sequence-variation-bank';

  constructor(message: string) {
    super(message);
    this.name = 'SynthSequenceVariationValidationError';
  }
}

interface CaptureGroup {
  onsetBeats: number;
  notes: SynthVariationCaptureNote[];
  order: number;
}

interface PrintedGroup extends CaptureGroup {
  globalStep: number;
  nudge: number;
  variationIndex: number;
  localStep: number;
}

const SUPPORTED_CLOCK_DIVISIONS: readonly ClockDivision[] = [
  '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T', '1/32', '1/32T', '1/64',
];
const NUDGE_TOLERANCE = 1e-6;
const NOTE_EPSILON = 1e-5;
const MIN_VARIATION_STEPS = 2;
const MAX_VARIATION_STEPS = 32;
const MAX_VARIATIONS = 4;
const MAX_PRINT_STEPS = MAX_VARIATION_STEPS * MAX_VARIATIONS;
export const SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES = 1024;

/** Apply an async print receipt only while its lane capture identity is current. */
export function isCurrentSynthVariationCommit(
  currentSerial: number,
  requestSerial: number,
  currentCapture: object | null,
  requestCapture: object,
): boolean {
  return currentSerial === requestSerial && currentCapture === requestCapture;
}

export function settleSynthVariationCommit(
  currentSerial: number,
  requestSerial: number,
  currentCapture: object | null,
  requestCapture: object,
): { accepted: boolean; clearPending: boolean; clearCapture: boolean } {
  const accepted = isCurrentSynthVariationCommit(currentSerial, requestSerial, currentCapture, requestCapture);
  return { accepted, clearPending: accepted, clearCapture: accepted };
}

/** Preserve independent lane indices when a printed trigger cell changes. */
export function variationLaneValuesAfterTriggerToggle(
  previousValues: readonly number[] | undefined,
  oldPattern: readonly boolean[],
  nextPattern: readonly boolean[],
  compactToHits: boolean,
  fallback: number,
): number[] {
  if (!compactToHits) return Array.isArray(previousValues) ? [...previousValues] : [];
  const oldHitSteps = oldPattern.flatMap((hit, index) => hit ? [index] : []);
  const nextHitSteps = nextPattern.flatMap((hit, index) => hit ? [index] : []);
  return nextHitSteps.map((hitStep) => {
    const oldIndex = oldHitSteps.indexOf(hitStep);
    return oldIndex >= 0
      ? previousValues?.[oldIndex] ?? fallback
      : fallback;
  });
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function invalid(message: string): never {
  throw new SynthSequenceVariationValidationError(message);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function isVariationId(value: unknown): value is SynthSequenceVariationId {
  return typeof value === 'string' && (SYNTH_SEQUENCE_VARIATION_IDS as readonly string[]).includes(value);
}

function cloneLane(lane: SynthVariationLaneInput): SynthVariationLane {
  return {
    overrides: cloneJson(lane.overrides ?? {}),
    state: cloneJson(lane.state),
  };
}

function copyLaneField(
  overrides: SerializedStepOverrides,
  field: keyof SerializedStepOverrides,
  values: unknown,
): void {
  const record = overrides as unknown as Record<string, unknown>;
  const existing = record[field as string];
  const lanes = Array.isArray(existing) ? [...existing] : [];
  lanes[0] = values;
  record[field as string] = lanes;
}

function configurePrintedLane(
  lane: SynthVariationLane,
  variationSteps: number,
  hitCount: number,
  clockDiv: ClockDivision,
  firstPitch: number | undefined,
): void {
  const hitSteps = Math.max(1, hitCount);
  const subLaneStates = {
    pitch: {
      enabled: hitCount > 0,
      steps: Math.max(1, variationSteps),
      direction: 'forward' as const,
      scaleQuantize: false,
      valueMode: 'sequence' as const,
    },
    expression: {
      enabled: hitCount > 0,
      steps: hitSteps,
      direction: 'forward' as const,
      valueMode: 'sequence' as const,
      followTriggerHits: true,
    },
    nudge: {
      enabled: hitCount > 0,
      steps: hitSteps,
      direction: 'forward' as const,
      valueMode: 'sequence' as const,
      followTriggerHits: true,
    },
    morph: {
      enabled: false,
      steps: 1,
      direction: 'forward' as const,
      valueMode: 'sequence' as const,
    },
    distance: {
      enabled: false,
      steps: 1,
      direction: 'forward' as const,
      valueMode: 'sequence' as const,
    },
    slice: {
      enabled: false,
      steps: 1,
      direction: 'forward' as const,
    },
    reverse: {
      enabled: false,
      steps: 1,
      direction: 'forward' as const,
    },
  };
  /*
   * A printed pitch is fixed to the phrase root. The serialized `notes` lane
   * keeps the existing scale-degree representation; the encoder resolves it
   * against this stored root, so later Harmony changes cannot retune it.
   * Sequence binding makes sparse trigger cells use the owning step instead
   * of compacting them by hit ordinal. Expression and nudge remain hit-bound.
   */
  const state = { ...lane.state };
  delete state.evolveConfig;
  delete state.playConfig;
  delete state.arpConfig;
  lane.state = {
    ...state,
    clockDiv,
    swing: 0,
    linked: false,
    pitchBindingMode: 'sequence',
    subLaneStates,
    pitchSettings: {
      mode: 'notes',
      root: Math.max(0, Math.min(127, Math.round(firstPitch ?? 60))),
      scale: 'Chromatic',
    },
  };
}

function partitionSteps(totalSteps: number): number[] | null {
  if (totalSteps < MIN_VARIATION_STEPS || totalSteps > MAX_PRINT_STEPS) return null;
  const variationCount = Math.ceil(totalSteps / MAX_VARIATION_STEPS);
  if (variationCount < 1 || variationCount > MAX_VARIATIONS || totalSteps < variationCount * MIN_VARIATION_STEPS) return null;
  const result: number[] = [];
  let remaining = totalSteps;
  for (let index = 0; index < variationCount; index += 1) {
    const remainingVariations = variationCount - index - 1;
    const steps = Math.min(MAX_VARIATION_STEPS, remaining - remainingVariations * MIN_VARIATION_STEPS);
    if (steps < MIN_VARIATION_STEPS) return null;
    result.push(steps);
    remaining -= steps;
  }
  return remaining === 0 ? result : null;
}

function validChordPayload(payload: SynthLocalChordPayload | undefined): boolean {
  if (!payload) return true;
  if (!Array.isArray(payload.intervals) || payload.intervals.length === 0) return false;
  if (payload.followHarmony !== undefined && typeof payload.followHarmony !== 'boolean') return false;
  return payload.intervals.every((interval) => (
    finite(interval.intervalSemitones)
    && interval.intervalSemitones >= -48
    && interval.intervalSemitones <= 48
    && finite(interval.velocity)
    && interval.velocity >= 0
    && interval.velocity <= 1
    && (interval.gateBeats === undefined
      || (finite(interval.gateBeats) && interval.gateBeats >= 0))
  ));
}

function validCaptureNote(note: SynthVariationCaptureNote, phraseBeats: number): boolean {
  if (!finite(note.onsetBeats) || !finite(note.durationBeats) || note.durationBeats < 0) return false;
  if (!finite(note.pitch) || note.pitch < 0 || note.pitch > 127) return false;
  if (!finite(note.velocity) || note.velocity < 0 || note.velocity > 1) return false;
  if (note.chordGroupId !== undefined && typeof note.chordGroupId !== 'string') return false;
  if (note.sourceId !== undefined && (!Number.isInteger(note.sourceId) || note.sourceId < 0 || note.sourceId > 255)) return false;
  if (note.mode !== undefined && note.mode !== 'note' && note.mode !== 'chord' && note.mode !== 'arp') return false;
  if (!validChordPayload(note.chord)) return false;
  if (note.arp !== undefined && (!note.arp || typeof note.arp !== 'object' || !note.arp.config)) return false;
  if (note.arp?.spanBeats !== undefined && (!finite(note.arp.spanBeats) || note.arp.spanBeats <= 0 || note.arp.spanBeats > phraseBeats)) return false;
  return true;
}

function groupCaptureNotes(notes: readonly SynthVariationCaptureNote[], phraseBeats: number): CaptureGroup[] | null {
  const groups: CaptureGroup[] = [];
  notes.forEach((note, order) => {
    if (!validCaptureNote(note, phraseBeats)) return;
    const normalizedOnset = positiveModulo(note.onsetBeats, phraseBeats);
    const normalized: SynthVariationCaptureNote = {
      ...note,
      onsetBeats: normalizedOnset,
    };
    // A capture group ID is the source's explicit musical attack identity.
    // Its member onsets may differ slightly because keyboard delivery is not
    // sample simultaneous; the first member remains the group anchor.
    const existing = note.chordGroupId
      ? groups.find((group) => group.notes[0]?.chordGroupId === note.chordGroupId)
      : undefined;
    if (existing) existing.notes.push(normalized);
    else groups.push({ onsetBeats: normalizedOnset, notes: [normalized], order });
  });
  if (groups.length !== notes.length && !notes.some((note) => note.chordGroupId)) {
    return null;
  }
  for (const note of notes) if (!validCaptureNote(note, phraseBeats)) return null;
  for (const group of groups) {
    const rootPitch = group.notes[0]?.pitch ?? 0;
    if (group.notes.some((note) => note.pitch - rootPitch < -48 || note.pitch - rootPitch > 48)) return null;
  }
  groups.sort((left, right) => left.onsetBeats - right.onsetBeats || left.order - right.order);
  return groups;
}

function variationIndexForStep(step: number, variationSteps: readonly number[]): { variationIndex: number; localStep: number } {
  let offset = 0;
  for (let index = 0; index < variationSteps.length; index += 1) {
    const count = variationSteps[index] ?? 0;
    if (step < offset + count) return { variationIndex: index, localStep: step - offset };
    offset += count;
  }
  const last = Math.max(0, variationSteps.length - 1);
  return { variationIndex: last, localStep: Math.max(0, (variationSteps[last] ?? 1) - 1) };
}

function makeStepMetadata(group: CaptureGroup): SynthVariationStepMetadata {
  const root = group.notes[0]!;
  const requestedMode = root.mode ?? (group.notes.length > 1 ? 'chord' : 'note');
  const mode: SynthSequenceVariationMode = requestedMode === 'chord' || group.notes.length > 1
    ? 'chord'
    : requestedMode;
  // A hold may cross the phrase boundary; retain that gate explicitly so the
  // runtime can release it at noteoff instead of retriggering on the next pass.
  const gateBeats = Math.max(0, root.durationBeats);
  const result: SynthVariationStepMetadata = {
    mode,
    gateBeats,
    ...(root.chord?.followHarmony !== undefined ? { followHarmony: root.chord.followHarmony } : {}),
  };
  if (mode === 'chord') {
    const chord = root.chord ?? {
      intervals: group.notes.map((note) => ({
        intervalSemitones: note.pitch - root.pitch,
        velocity: note.velocity,
        gateBeats: Math.max(0, note.durationBeats),
      })),
    };
    result.chord = {
      intervals: chord.intervals.map((interval) => ({
        intervalSemitones: interval.intervalSemitones,
        velocity: interval.velocity,
        ...(finite(interval.gateBeats) ? { gateBeats: interval.gateBeats } : {}),
      })),
      ...(chord.followHarmony !== undefined ? { followHarmony: chord.followHarmony } : {}),
      ...(chord.sharedChord ? { sharedChord: cloneJson(chord.sharedChord) } : {}),
    };
  }
  if (mode === 'arp' || root.arp) result.arp = root.arp ? cloneJson(root.arp) : undefined;
  return result;
}

interface GridAnchorCandidate {
  step: number;
  nudge: number;
  cost: number;
}

function gridAnchorCandidates(targetStepFloat: number, totalSteps: number, stepBeats: number): GridAnchorCandidate[] {
  const floor = Math.floor(targetStepFloat);
  const anchors = new Set([floor, floor + 1]);
  return [...anchors]
    .map((anchor) => {
      const step = positiveModulo(anchor, totalSteps);
      const delta = computeGridRelativeNudge(targetStepFloat * stepBeats, anchor * stepBeats, stepBeats);
      return { step, nudge: delta, cost: Math.abs(delta) };
    })
    .filter((candidate) => candidate.cost <= 1 + NUDGE_TOLERANCE)
    .sort((left, right) => left.cost - right.cost || left.step - right.step);
}

function assignGridAnchors(
  groups: readonly CaptureGroup[],
  stepBeats: number,
  totalSteps: number,
): GridAnchorCandidate[] | null {
  const candidates = groups.map((group) => gridAnchorCandidates(group.onsetBeats / stepBeats, totalSteps, stepBeats));
  if (candidates.some((items) => items.length === 0)) return null;
  const assigned: Array<GridAnchorCandidate | undefined> = Array.from({ length: groups.length }, () => undefined);
  const ownerByStep = new Map<number, number>();
  const augment = (groupIndex: number, visitedSteps: Set<number>): boolean => {
    const place = (candidate: GridAnchorCandidate, displacedGroup?: number): boolean => {
      if (displacedGroup !== undefined && !augment(displacedGroup, visitedSteps)) return false;
      const previous = assigned[groupIndex];
      if (previous && ownerByStep.get(previous.step) === groupIndex) ownerByStep.delete(previous.step);
      ownerByStep.set(candidate.step, groupIndex);
      assigned[groupIndex] = candidate;
      return true;
    };
    for (const candidate of candidates[groupIndex]!) {
      if (visitedSteps.has(candidate.step)) continue;
      const displacedGroup = ownerByStep.get(candidate.step);
      if (displacedGroup === undefined) {
        visitedSteps.add(candidate.step);
        if (place(candidate)) return true;
      }
    }
    for (const candidate of candidates[groupIndex]!) {
      if (visitedSteps.has(candidate.step)) continue;
      visitedSteps.add(candidate.step);
      const displacedGroup = ownerByStep.get(candidate.step);
      if (displacedGroup !== undefined && place(candidate, displacedGroup)) return true;
    }
    return false;
  };
  for (let index = 0; index < groups.length; index += 1) {
    if (!augment(index, new Set())) return null;
  }
  return assigned as GridAnchorCandidate[];
}

function printCandidate(
  input: SynthVariationPrintInput,
  groups: readonly CaptureGroup[],
  clockDiv: ClockDivision,
): SynthSequenceVariationBank | null {
  const numericClock = sequencerClockDivisionToNumericValue(clockDiv, 0);
  const stepBeats = 4 / numericClock;
  const exactSteps = input.phraseBeats / stepBeats;
  const totalSteps = Math.round(exactSteps);
  if (!Number.isFinite(exactSteps) || Math.abs(exactSteps - totalSteps) > NUDGE_TOLERANCE) return null;
  const variationSteps = partitionSteps(totalSteps);
  if (!variationSteps) return null;

  const assignments = assignGridAnchors(groups, stepBeats, totalSteps);
  if (!assignments) return null;
  const printedGroups: PrintedGroup[] = groups.map((group, index) => {
    const assignment = assignments[index]!;
    const location = variationIndexForStep(assignment.step, variationSteps);
    return { ...group, globalStep: assignment.step, nudge: assignment.nudge, ...location };
  });
  printedGroups.sort((left, right) => left.globalStep - right.globalStep || left.order - right.order);

  const variations: Partial<Record<SynthSequenceVariationId, SynthSequenceVariation>> = {};
  let stepOffset = 0;
  variationSteps.forEach((steps, variationIndex) => {
    const id = SYNTH_SEQUENCE_VARIATION_IDS[variationIndex]!;
    const lane = cloneLane(input.baseLane);
    const overrides = lane.overrides ?? {};
    lane.overrides = overrides;
    const bits = Array.from({ length: steps }, () => false);
    const toggles: { step: number; value: boolean }[] = [];
    const groupsInVariation = printedGroups.filter((group) => group.variationIndex === variationIndex);
    configurePrintedLane(lane, steps, groupsInVariation.length, clockDiv, groupsInVariation[0]?.notes[0]?.pitch);
    groupsInVariation.forEach((group) => {
      bits[group.localStep] = true;
      toggles.push({ step: group.localStep, value: true });
    });
    const serializedClip = serializeTriggerClip(createBitmapTriggerClip({
      steps,
      bits,
      origin: 'recorded',
      label: 'Synth variation',
    }));
    copyLaneField(overrides, 'triggerClips', serializedClip);
    copyLaneField(overrides, 'triggerToggles', toggles);
    for (const field of [
      'ratchet', 'morph', 'distance', 'slice', 'reverse',
      'expressionDirection', 'morphDirection', 'distanceDirection', 'nudgeDirection',
      'pitchDirection', 'sliceDirection', 'reverseDirection',
      'expressionRanges', 'morphRanges', 'distanceRanges',
    ] as const) copyLaneField(overrides, field, null);

    const pitchByStep = new Map(groupsInVariation.map((group) => (
      [group.localStep, group.notes[0]?.pitch ?? 60] as const
    )));
    const pitchSettings = lane.state.pitchSettings ?? { mode: 'notes' as const, root: 60, scale: 'Chromatic' as const };
    const pitchValues = groupsInVariation.length
      ? Array.from({ length: steps }, (_, step) => {
        const midi = pitchByStep.get(step) ?? groupsInVariation[0]?.notes[0]?.pitch ?? pitchSettings.root;
        const offset = midi - pitchSettings.root;
        if (pitchSettings.mode === 'notes') return semitoneToScaleDegree(offset, SCALES[pitchSettings.scale] ?? SCALES.Chromatic);
        return offset;
      })
      : [];
    const velocityValues = groupsInVariation.map((group) => group.notes[0]?.velocity ?? 1);
    const nudgeValues = groupsInVariation.map((group) => group.nudge);
    copyLaneField(overrides, 'probability', Array.from({ length: steps }, () => 1));
    copyLaneField(overrides, 'trigCondition', Array.from({ length: steps }, () => [1, 1] as [number, number]));
    copyLaneField(overrides, 'pitch', groupsInVariation.length ? pitchValues : []);
    copyLaneField(overrides, 'expression', groupsInVariation.length ? velocityValues : []);
    copyLaneField(overrides, 'nudge', groupsInVariation.length ? nudgeValues : []);

    const stepMetadata: Record<string, SynthVariationStepMetadata> = {};
    groupsInVariation.forEach((group) => {
      stepMetadata[String(group.localStep)] = makeStepMetadata(group);
    });
    variations[id] = {
      id,
      steps,
      spanBeats: steps * stepBeats,
      lane,
      stepMetadata,
    };
    stepOffset += steps;
  });

  if (stepOffset !== totalSteps) return null;
  const chainOrder = variationSteps.map((_, index) => SYNTH_SEQUENCE_VARIATION_IDS[index]!);
  return {
    schemaVersion: SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION,
    phraseBeats: input.phraseBeats,
    clockDiv,
    chainEnabled: chainOrder.length > 1,
    playVariation: 0,
    chainOrder,
    variations,
  };
}

/** Pick the coarsest supported grid that can represent every ordered attack. */
export function autoPrintSynthSequenceVariation(input: SynthVariationPrintInput): SynthVariationPrintResult {
  if (!finite(input.phraseBeats) || input.phraseBeats <= 0) {
    return { accepted: false, bank: null, failure: 'invalid-phrase', message: 'phraseBeats must be positive' };
  }
  if (input.notes.some((note) => !finite(note.onsetBeats) || !finite(note.durationBeats) || !finite(note.pitch) || !finite(note.velocity))) {
    return { accepted: false, bank: null, failure: 'invalid-note', message: 'capture notes must be finite' };
  }
  const groups = groupCaptureNotes(input.notes, input.phraseBeats);
  if (!groups) return { accepted: false, bank: null, failure: 'invalid-note' };
  const candidates = [...SUPPORTED_CLOCK_DIVISIONS];
  let sawCapacity = false;
  let sawCollision = false;
  for (const clockDiv of candidates) {
    const totalSteps = input.phraseBeats * sequencerClockDivisionToNumericValue(clockDiv, 0) / 4;
    if (totalSteps > MAX_PRINT_STEPS) {
      sawCapacity = true;
      continue;
    }
    const candidate = printCandidate(input, groups, clockDiv);
    if (candidate) return { accepted: true, bank: candidate };
    const rounded = Math.round(totalSteps);
    if (Number.isFinite(totalSteps) && rounded === totalSteps && groups.length <= Math.max(0, rounded)) sawCollision = true;
  }
  return {
    accepted: false,
    bank: null,
    failure: sawCollision ? 'collision' : sawCapacity ? 'capacity' : 'unsupported-resolution',
    message: sawCollision ? 'two independent attacks share a grid step' : 'capture cannot fit supported variation grids',
  };
}

function normalizeStepMetadata(value: unknown, steps: number): Record<string, SynthVariationStepMetadata> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('stepMetadata must be an object');
  const result: Record<string, SynthVariationStepMetadata> = {};
  for (const [key, raw] of Object.entries(value)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= steps || !raw || typeof raw !== 'object') {
      invalid(`stepMetadata index ${key} is outside variation steps`);
    }
    const source = raw as Partial<SynthVariationStepMetadata>;
    if (source.mode !== 'note' && source.mode !== 'chord' && source.mode !== 'arp') invalid(`stepMetadata ${key} has an invalid mode`);
    if (!finite(source.gateBeats) || source.gateBeats < 0) {
      invalid(`stepMetadata ${key} has an invalid gateBeats`);
    }
    if (source.followHarmony !== undefined && typeof source.followHarmony !== 'boolean') {
      invalid(`stepMetadata ${key} has an invalid followHarmony flag`);
    }
    const mode = source.mode;
    const gateBeats = source.gateBeats;
    const metadata: SynthVariationStepMetadata = {
      mode,
      gateBeats,
      ...(source.followHarmony === undefined ? {} : { followHarmony: source.followHarmony }),
    };
    if (source.chord !== undefined) {
      if (!source.chord || typeof source.chord !== 'object' || !validChordPayload(source.chord)) {
        invalid(`stepMetadata ${key} has an invalid chord payload`);
      }
      metadata.chord = {
        intervals: source.chord.intervals.map((interval) => ({
          intervalSemitones: interval.intervalSemitones,
          velocity: interval.velocity,
          ...(interval.gateBeats === undefined ? {} : { gateBeats: interval.gateBeats }),
        })),
        ...(source.chord.followHarmony === undefined ? {} : { followHarmony: source.chord.followHarmony }),
        ...(source.chord.sharedChord ? { sharedChord: cloneJson(source.chord.sharedChord) } : {}),
      };
    }
    if (source.arp !== undefined) {
      if (!source.arp || typeof source.arp !== 'object' || !source.arp.config) invalid(`stepMetadata ${key} has an invalid arp payload`);
      if (source.arp.spanBeats !== undefined && (!finite(source.arp.spanBeats) || source.arp.spanBeats <= 0)) {
        invalid(`stepMetadata ${key} has an invalid arp spanBeats`);
      }
      metadata.arp = {
        config: cloneJson(source.arp.config),
        ...(source.arp.spanBeats === undefined ? {} : { spanBeats: source.arp.spanBeats }),
      };
    }
    result[String(index)] = metadata;
  }
  return result;
}

function normalizeVariation(
  value: unknown,
  id: SynthSequenceVariationId,
  clockDiv: ClockDivision,
): SynthSequenceVariation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`variation ${id} must be an object`);
  const source = value as Partial<SynthSequenceVariation>;
  const steps = finite(source.steps) && Number.isInteger(source.steps) ? source.steps : 0;
  const spanBeats = finite(source.spanBeats) ? source.spanBeats : 0;
  const expectedSpanBeats = steps * 4 / sequencerClockDivisionToNumericValue(clockDiv, 0);
  if (steps < MIN_VARIATION_STEPS || steps > MAX_VARIATION_STEPS || spanBeats <= 0 || Math.abs(spanBeats - expectedSpanBeats) > NUDGE_TOLERANCE) {
    invalid(`variation ${id} has inconsistent steps/spanBeats`);
  }
  if (!source.lane || typeof source.lane !== 'object' || !source.lane.state) invalid(`variation ${id} is missing serialized lane data`);
  const lane = source.lane as SynthVariationLane;
  if (Array.isArray(lane.state) || typeof lane.state !== 'object') invalid(`variation ${id} has invalid lane state`);
  if (lane.overrides !== undefined && (Array.isArray(lane.overrides) || typeof lane.overrides !== 'object')) {
    invalid(`variation ${id} has invalid serialized overrides`);
  }
  if (lane.state.clockDiv !== undefined && lane.state.clockDiv !== clockDiv) {
    invalid(`variation ${id} lane clockDiv does not match the bank`);
  }
  if (lane.state.pitchBindingMode !== undefined
    && lane.state.pitchBindingMode !== 'polyrhythmic'
    && lane.state.pitchBindingMode !== 'linked'
    && lane.state.pitchBindingMode !== 'sequence') {
    invalid(`variation ${id} has an invalid pitchBindingMode`);
  }
  return {
    id,
    steps,
    spanBeats,
    lane: { overrides: cloneJson(lane.overrides ?? {}), state: cloneJson(lane.state) },
    stepMetadata: normalizeStepMetadata(source.stepMetadata, steps),
  };
}

export function normalizeSynthSequenceVariationBank(value: unknown): SynthSequenceVariationBank | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('variation bank must be an object');
  const source = value as Partial<SynthSequenceVariationBank>;
  if (source.schemaVersion !== SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION) invalid('unsupported variation bank schemaVersion');
  if (!finite(source.phraseBeats) || source.phraseBeats <= 0) invalid('variation bank phraseBeats must be positive');
  if (!SUPPORTED_CLOCK_DIVISIONS.includes(source.clockDiv as ClockDivision)) invalid('variation bank clockDiv is unsupported');
  const clockDiv = source.clockDiv as ClockDivision;
  if (!Array.isArray(source.chainOrder) || source.chainOrder.length > MAX_VARIATIONS) invalid('variation bank chainOrder is invalid');
  const chainOrder: SynthSequenceVariationId[] = [];
  for (const id of source.chainOrder) {
    if (!isVariationId(id) || chainOrder.includes(id)) invalid('variation bank chainOrder contains an invalid or duplicate id');
    chainOrder.push(id);
  }
  if (typeof source.chainEnabled !== 'boolean') invalid('variation bank chainEnabled is required');
  if (!finite(source.playVariation) || !Number.isInteger(source.playVariation) || source.playVariation < 0 || source.playVariation > 3) invalid('variation bank playVariation is invalid');
  const variations: Partial<Record<SynthSequenceVariationId, SynthSequenceVariation>> = {};
  if (!source.variations || typeof source.variations !== 'object' || Array.isArray(source.variations)) invalid('variation bank variations is required');
  for (const key of Object.keys(source.variations)) {
    if (!isVariationId(key) || !chainOrder.includes(key)) invalid(`variation ${key} is not in chainOrder`);
    variations[key] = normalizeVariation(source.variations[key], key, clockDiv);
  }
  if (chainOrder.some((id) => variations[id] === undefined)) invalid('variation bank chainOrder references a missing variation');
  if (source.chainEnabled && chainOrder.length === 0) invalid('enabled variation chain is empty');
  const spanSum = chainOrder.reduce((sum, id) => sum + (variations[id]?.spanBeats ?? 0), 0);
  if (chainOrder.length > 0 && Math.abs(spanSum - source.phraseBeats) > NUDGE_TOLERANCE) invalid('variation spans do not cover phraseBeats');
  const playVariation = source.playVariation as SynthSequenceVariationIndex;
  const playVariationId = SYNTH_SEQUENCE_VARIATION_IDS[playVariation];
  if (chainOrder.length > 0 && !playVariationId) invalid('playVariation is outside the variation bank');
  if (playVariationId && !variations[playVariationId]) invalid('playVariation is not populated');
  return {
    schemaVersion: SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION,
    phraseBeats: source.phraseBeats,
    clockDiv,
    chainEnabled: source.chainEnabled,
    playVariation,
    chainOrder,
    variations,
  };
}

export function serializeSynthSequenceVariationBank(
  bank: SynthSequenceVariationBank | null | undefined,
): SynthSequenceVariationBank | null {
  const normalized = normalizeSynthSequenceVariationBank(bank);
  return normalized ? cloneJson(normalized) : null;
}

export function normalizeSynthSequenceVariationBanks(value: unknown, laneCount = 4): SynthSequenceVariationBanks {
  if (value === undefined || value === null) return createDefaultSynthSequenceVariationBanks(laneCount);
  if (!Array.isArray(value)) invalid('variation banks must be an array');
  const values = value;
  return Array.from({ length: Math.max(0, laneCount) }, (_, laneIndex) => (
    normalizeSynthSequenceVariationBank(values[laneIndex])
  ));
}

export function serializeSynthSequenceVariationBanks(
  banks: readonly (SynthSequenceVariationBank | null)[] | undefined,
  laneCount = 4,
): SynthSequenceVariationBanks {
  return Array.from({ length: Math.max(0, laneCount) }, (_, laneIndex) => (
    serializeSynthSequenceVariationBank(banks?.[laneIndex])
  ));
}

export function createDefaultSynthSequenceVariationBanks(laneCount = 4): SynthSequenceVariationBanks {
  return Array.from({ length: Math.max(0, laneCount) }, () => null);
}

interface OpenCaptureNote {
  inputId: string;
  note: SynthVariationCaptureNote;
  absoluteOnsetBeats: number;
}

interface StoredCaptureNote {
  note: SynthVariationCaptureNote;
  insertedAtBeat: number;
}

export interface SynthSequenceCaptureScratchSnapshot {
  phraseBeats: number;
  recording: boolean;
  stopped: boolean;
  clockBeat: number;
  notes: SynthVariationCaptureNote[];
  heldInputIds: string[];
  overflowed: boolean;
}

/**
 * Beat-relative looping capture. Closed attacks are swept by onset phase; open
 * input IDs stay alive across wraps and are never retriggered by the sweep.
 */
export class SynthSequenceCaptureScratch {
  readonly phraseBeats: number;
  private readonly closedNotes: StoredCaptureNote[] = [];
  private readonly openNotes = new Map<string, OpenCaptureNote[]>();
  private originBeat = 0;
  private sweptThroughBeat = 0;
  private clockBeat = 0;
  private recording = false;
  private stopped = false;
  private nextId = 1;
  private overflowed = false;

  constructor(phraseBeats: number) {
    if (!finite(phraseBeats) || phraseBeats <= 0) throw new RangeError('phraseBeats must be positive');
    this.phraseBeats = phraseBeats;
  }

  start(originBeat: number, previousNotes: readonly SynthVariationCaptureNote[] = []): void {
    if (!finite(originBeat)) throw new RangeError('originBeat must be finite');
    if (previousNotes.length > SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES) throw new RangeError('previous capture exceeds scratch capacity');
    this.closedNotes.length = 0;
    this.closedNotes.push(...cloneJson(previousNotes).map((note) => ({
      note,
      insertedAtBeat: originBeat - this.phraseBeats,
    })));
    this.openNotes.clear();
    this.originBeat = originBeat;
    this.sweptThroughBeat = originBeat;
    this.clockBeat = originBeat;
    this.recording = true;
    this.stopped = false;
    this.overflowed = false;
  }

  private activeNoteCount(): number {
    let count = 0;
    for (const notes of this.openNotes.values()) count += notes.length;
    return count;
  }

  private sweep(fromBeat: number, toBeat: number): void {
    if (toBeat <= fromBeat) return;
    const distance = toBeat - fromBeat;
    if (distance >= this.phraseBeats) {
      this.closedNotes.length = 0;
      return;
    }
    const start = positiveModulo(fromBeat - this.originBeat, this.phraseBeats);
    const end = positiveModulo(toBeat - this.originBeat, this.phraseBeats);
    const wraps = end <= start;
    for (let index = this.closedNotes.length - 1; index >= 0; index -= 1) {
      const entry = this.closedNotes[index]!;
      if (entry.insertedAtBeat >= fromBeat) continue;
      const onset = positiveModulo(entry.note.onsetBeats, this.phraseBeats);
      const inside = wraps ? onset >= start || onset < end : onset >= start && onset < end;
      if (inside) this.closedNotes.splice(index, 1);
    }
  }

  advance(clockBeat: number): void {
    if (!finite(clockBeat) || !this.recording || clockBeat < this.sweptThroughBeat) return;
    this.sweep(this.sweptThroughBeat, clockBeat);
    this.sweptThroughBeat = clockBeat;
    this.clockBeat = clockBeat;
  }

  /** Rebase an audio origin before the first local phrase has advanced. */
  setOriginBeat(originBeat: number): boolean {
    if (!finite(originBeat) || this.closedNotes.length > 0 || this.activeNoteCount() > 0) return false;
    const delta = originBeat - this.originBeat;
    if (!finite(delta)) return false;
    this.originBeat = originBeat;
    this.sweptThroughBeat += delta;
    this.clockBeat += delta;
    return true;
  }

  noteOn(inputId: string, note: Omit<SynthVariationCaptureNote, 'onsetBeats' | 'durationBeats'>, clockBeat: number): string {
    if (!this.recording || !inputId || !finite(clockBeat)) return '';
    this.advance(clockBeat);
    if (this.closedNotes.length + this.activeNoteCount() >= SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES) {
      this.overflowed = true;
      return '';
    }
    const id = note.id ?? `${inputId}:${this.nextId++}`;
    const open: OpenCaptureNote = {
      inputId,
      absoluteOnsetBeats: clockBeat,
      note: { ...cloneJson(note), id, onsetBeats: positiveModulo(clockBeat - this.originBeat, this.phraseBeats), durationBeats: 0, held: true },
    };
    const notes = this.openNotes.get(inputId) ?? [];
    notes.push(open);
    this.openNotes.set(inputId, notes);
    return id;
  }

  noteOff(inputId: string, clockBeat: number): boolean {
    if (!finite(clockBeat)) return false;
    const notes = this.openNotes.get(inputId);
    const open = notes?.pop();
    if (!open) return false;
    this.advance(clockBeat);
    const durationBeats = Math.max(0, clockBeat - open.absoluteOnsetBeats);
    this.closedNotes.push({
      note: { ...open.note, durationBeats, held: false },
      insertedAtBeat: clockBeat,
    });
    if (notes && notes.length > 0) this.openNotes.set(inputId, notes);
    else this.openNotes.delete(inputId);
    return true;
  }

  private appendPhaseNotes(notes: readonly SynthVariationCaptureNote[], insertedAtBeat: number): number {
    const available = SYNTH_SEQUENCE_CAPTURE_SCRATCH_MAX_NOTES
      - this.closedNotes.length
      - this.activeNoteCount();
    if (notes.length > available) {
      this.overflowed = true;
      return 0;
    }
    for (const note of notes) {
      this.closedNotes.push({
        note: {
          ...cloneJson(note),
          onsetBeats: positiveModulo(note.onsetBeats, this.phraseBeats),
          held: false,
        },
        insertedAtBeat,
      });
    }
    return notes.length;
  }

  /** Add a generated event with a phrase-relative onset at the current watermark. */
  ingest(note: SynthVariationCaptureNote): boolean {
    if (!this.recording || !validCaptureNote(note, this.phraseBeats)) return false;
    return this.appendPhaseNotes([note], this.sweptThroughBeat) === 1;
  }

  /**
   * Add an audio batch whose onsetBeats values are unwrapped offsets from the
   * capture origin. The clock boundary sweeps first, then only the last phrase
   * window is retained; insertion never advances into a future pass.
   */
  ingestBatch(notes: readonly SynthVariationCaptureNote[], clockBeat: number): number {
    if (!this.recording || !finite(clockBeat) || clockBeat < this.sweptThroughBeat) return 0;
    if (clockBeat > this.sweptThroughBeat) this.advance(clockBeat);
    if (notes.some((note) => !validCaptureNote(note, this.phraseBeats))) return 0;
    const elapsedBeat = this.sweptThroughBeat - this.originBeat;
    const oldestAcceptedBeat = elapsedBeat - this.phraseBeats;
    const batchNotes = notes.filter((note) => (
      note.onsetBeats >= Math.max(0, oldestAcceptedBeat) - NOTE_EPSILON
      && note.onsetBeats <= elapsedBeat + NOTE_EPSILON
    ));
    return this.appendPhaseNotes(batchNotes, this.sweptThroughBeat);
  }

  private closeOpenNotes(clockBeat: number): void {
    for (const [inputId, notes] of this.openNotes) {
      for (const open of notes) {
        this.closedNotes.push({
          note: {
            ...open.note,
            durationBeats: Math.max(0, clockBeat - open.absoluteOnsetBeats),
            held: false,
          },
          insertedAtBeat: clockBeat,
        });
      }
      this.openNotes.delete(inputId);
    }
  }

  stop(clockBeat: number): void {
    if (!finite(clockBeat)) return;
    this.advance(clockBeat);
    this.closeOpenNotes(clockBeat);
    this.recording = false;
    this.stopped = true;
    this.clockBeat = clockBeat;
  }

  cancel(): void {
    this.closedNotes.length = 0;
    this.openNotes.clear();
    this.recording = false;
    this.stopped = false;
    this.overflowed = false;
  }

  /** Cheap live counters for the recorder UI; avoids cloning the 1024-note snapshot. */
  noteCount(): number {
    return this.closedNotes.length + this.activeNoteCount();
  }

  heldInputCount(): number {
    return this.openNotes.size;
  }

  isOverflowed(): boolean {
    return this.overflowed;
  }

  snapshot(): SynthSequenceCaptureScratchSnapshot {
    const heldNotes = [...this.openNotes.values()].flatMap((notes) => notes.map((open) => ({
      ...open.note,
      durationBeats: Math.max(0, this.clockBeat - open.absoluteOnsetBeats),
      held: true,
    })));
    return {
      phraseBeats: this.phraseBeats,
      recording: this.recording,
      stopped: this.stopped,
      clockBeat: this.clockBeat,
      notes: [...cloneJson(this.closedNotes.map((entry) => entry.note)), ...heldNotes],
      heldInputIds: [...this.openNotes.keys()],
      overflowed: this.overflowed,
    };
  }
}
