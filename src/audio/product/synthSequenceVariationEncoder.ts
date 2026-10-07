import { sequencerClockDivisionToNumericValue } from '../../audio/sequencerClockDivisions';
import { SCALES, scaleDegreeToSemitone, type PitchMode } from '../../audio/drumSeqTypes';
import { normalizeSequencerPitchBindingMode, sequencerPitchBindingModeToProductId } from '../../audio/sequencerPitchBinding';
import type { ProductArpConfig } from '../../audio/productArpeggiator';
import type {
  SynthSequenceVariation,
  SynthSequenceVariationBank,
  SynthSequenceVariationId,
  SynthSequenceVariationMode,
} from '../../ui/sequencer/synthSequenceVariations';
import { normalizeSynthSequenceVariationBank } from '../../ui/sequencer/synthSequenceVariations';
import { deserializeTriggerClip, resolveTriggerClip } from '../../ui/sequencer/triggerClip';
import type { SerializedStepOverrides, SerializedStepToggle, SerializedSubLaneState } from '../../ui/state';

export const SYNTH_SEQUENCE_VARIATION_COUNT = 4;
export const SYNTH_SEQUENCE_VARIATION_MAX_STEPS = 32;
export const SYNTH_SEQUENCE_VARIATION_MAX_CHAIN_ENTRIES = 4;
export const SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP = 32;
// Keep these offsets in lockstep with
// KesshoProductSequencerVariations.h.  The payload is copied directly into
// the C ABI struct by the WASM/native hosts, so an omitted field corrupts every
// following variation.
export const SYNTH_SEQUENCE_VARIATION_STEP_BYTES = 564;
export const SYNTH_SEQUENCE_VARIATION_SNAPSHOT_BYTES = 19736;
export const SYNTH_SEQUENCE_VARIATION_BANK_BYTES = 78984;

const SNAPSHOT_STEP_COUNT_OFFSET = 0;
const SNAPSHOT_CLOCK_DIVISION_OFFSET = 4;
const SNAPSHOT_SWING_OFFSET = 8;
const SNAPSHOT_TRIGGER_MASK_OFFSET = 12;
const SNAPSHOT_SUBLANE_ENABLED_MASK_OFFSET = 16;
const SNAPSHOT_SUBLANE_STEPS_OFFSET = 20;
const SNAPSHOT_SUBLANE_DIRECTIONS_OFFSET = 56;
const SNAPSHOT_SUBLANE_FOLLOW_TRIGGER_HITS_MASK_OFFSET = 92;
const SNAPSHOT_PITCH_ROOT_OFFSET = 96;
const SNAPSHOT_PITCH_MODE_OFFSET = 100;
const SNAPSHOT_PITCH_BINDING_MODE_OFFSET = 104;
const SNAPSHOT_PROBABILITY_MASK_OFFSET = 108;
const SNAPSHOT_RATCHET_MASK_OFFSET = 112;
const SNAPSHOT_TRIG_CONDITION_MASK_OFFSET = 116;
const SNAPSHOT_MIDI_NOTE_MASK_OFFSET = 120;
const SNAPSHOT_EXPRESSION_MASK_OFFSET = 124;
const SNAPSHOT_MORPH_MASK_OFFSET = 128;
const SNAPSHOT_DISTANCE_MASK_OFFSET = 132;
const SNAPSHOT_NUDGE_MASK_OFFSET = 136;
const SNAPSHOT_EXPRESSION_RANGE_MASK_OFFSET = 140;
const SNAPSHOT_MORPH_RANGE_MASK_OFFSET = 144;
const SNAPSHOT_DISTANCE_RANGE_MASK_OFFSET = 148;
const SNAPSHOT_PROBABILITY_OFFSET = 152;
const SNAPSHOT_RATCHET_OFFSET = 280;
const SNAPSHOT_TRIG_NUMERATOR_OFFSET = 408;
const SNAPSHOT_TRIG_DENOMINATOR_OFFSET = 536;
const SNAPSHOT_MIDI_NOTE_OFFSET = 664;
const SNAPSHOT_EXPRESSION_OFFSET = 792;
const SNAPSHOT_EXPRESSION_RANGE_OFFSET = 920;
const SNAPSHOT_MORPH_OFFSET = 1048;
const SNAPSHOT_MORPH_RANGE_OFFSET = 1176;
const SNAPSHOT_DISTANCE_OFFSET = 1304;
const SNAPSHOT_DISTANCE_RANGE_OFFSET = 1432;
const SNAPSHOT_NUDGE_OFFSET = 1560;
const SNAPSHOT_STEPS_OFFSET = 1688;
const STEP_MODE_OFFSET = 0;
const STEP_NOTE_COUNT_OFFSET = 4;
const STEP_GATE_BEATS_OFFSET = 8;
const STEP_ARP_SPAN_STEPS_OFFSET = 12;
const STEP_ARP_DIRECTION_OFFSET = 16;
const STEP_FOLLOW_HARMONY_OFFSET = 20;
const STEP_ARP_RATE_X2_OFFSET = 24;
const STEP_ARP_LENGTH_OFFSET = 28;
const STEP_ARP_PULSE_MASK_OFFSET = 32;
const STEP_ARP_FLOW_OFFSET = 36;
const STEP_ARP_CONTOUR_MODE_OFFSET = 40;
const STEP_ARP_BOUNDARY_MODE_OFFSET = 44;
const STEP_ARP_RESET_MASK_OFFSET = 48;
const STEP_ARP_CONTOUR_OFFSET = 52;
const STEP_ARP_SLOT_LANE_OFFSET = 116;
const STEP_NOTES_OFFSET = 180;
const STEP_NOTE_BYTES = 12;
const STEP_NOTE_MIDI_OFFSET = 0;
const STEP_NOTE_VELOCITY_OFFSET = 4;
const STEP_NOTE_GATE_BEATS_OFFSET = 8;
const BANK_VARIATIONS_OFFSET = 40;

type NumberArray = readonly number[] | null | undefined;
type RangeValue = { min: number; max: number } | null;
type RangeArray = readonly RangeValue[] | null | undefined;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function laneArray<T>(overrides: SerializedStepOverrides, field: keyof SerializedStepOverrides): T[] | null {
  const values = overrides[field];
  const lane = Array.isArray(values) ? values[0] : null;
  return Array.isArray(lane) ? lane as T[] : null;
}

function triggerMask(overrides: SerializedStepOverrides, steps: number): number {
  const serializedClip = overrides.triggerClips?.[0] ?? null;
  const clip = deserializeTriggerClip(serializedClip);
  if (clip) {
    return resolveTriggerClip(clip)
      .slice(0, steps)
      .reduce((mask, enabled, step) => enabled ? mask | (1 << step) : mask, 0) >>> 0;
  }
  let mask = 0;
  const toggles = Array.isArray(overrides.triggerToggles?.[0]) ? overrides.triggerToggles[0] : [];
  for (const toggle of toggles as SerializedStepToggle[]) {
    if (toggle && Number.isInteger(toggle.step) && toggle.step >= 0 && toggle.step < steps) {
      if (typeof toggle.value !== 'boolean') throw new RangeError(`Invalid trigger toggle at step ${toggle.step}`);
      if (toggle.value) mask |= 1 << toggle.step;
      else mask &= ~(1 << toggle.step);
    }
  }
  return mask >>> 0;
}

function direction(value: unknown): number {
  return value === 'reverse' ? 1 : value === 'pingpong' ? 2 : 0;
}

function requireRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be finite and in [${min}, ${max}]`);
  }
  return value;
}

function validateNumberArray(values: NumberArray, min: number, max: number, label: string, integer = false): void {
  if (values && values.length > SYNTH_SEQUENCE_VARIATION_MAX_STEPS) {
    throw new RangeError(`${label} exceeds ${SYNTH_SEQUENCE_VARIATION_MAX_STEPS} steps`);
  }
  for (const [index, value] of (values ?? []).entries()) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
      throw new RangeError(`${label}[${index}] is invalid`);
    }
    requireRange(value, min, max, `${label}[${index}]`);
  }
}

function rangeArray(overrides: SerializedStepOverrides, field: 'expressionRanges' | 'morphRanges' | 'distanceRanges'): RangeArray {
  const values = overrides[field];
  const lane = Array.isArray(values) ? values[0] : null;
  return Array.isArray(lane) ? lane as RangeValue[] : null;
}

function validateRangeArray(values: RangeArray, label: string): void {
  if (values && values.length > SYNTH_SEQUENCE_VARIATION_MAX_STEPS) {
    throw new RangeError(`${label} exceeds ${SYNTH_SEQUENCE_VARIATION_MAX_STEPS} steps`);
  }
  for (const [index, range] of (values ?? []).entries()) {
    if (range === null) continue;
    if (!range || typeof range !== 'object') throw new RangeError(`${label}[${index}] is invalid`);
    requireRange(range.min, 0, 1, `${label}[${index}].min`);
    requireRange(range.max, 0, 1, `${label}[${index}].max`);
  }
}

function writeFloatArray(view: DataView, offset: number, values: NumberArray, fallback: number): void {
  for (let step = 0; step < SYNTH_SEQUENCE_VARIATION_MAX_STEPS; step += 1) {
    const value = values?.[step] !== undefined ? values[step]! : fallback;
    view.setFloat32(offset + step * 4, value, true);
  }
}

function writeUintArray(view: DataView, offset: number, values: NumberArray, fallback: number): void {
  for (let step = 0; step < SYNTH_SEQUENCE_VARIATION_MAX_STEPS; step += 1) {
    const value = values?.[step] !== undefined ? values[step]! : fallback;
    view.setUint32(offset + step * 4, value >>> 0, true);
  }
}

function writeMask(view: DataView, offset: number, values: NumberArray): void {
  const length = Math.min(32, values?.length ?? 0);
  let mask = 0;
  for (let step = 0; step < length; step += 1) mask |= 1 << step;
  view.setUint32(offset, mask >>> 0, true);
}

function writeRangeMask(view: DataView, offset: number, values: RangeArray): void {
  let mask = 0;
  for (let step = 0; step < SYNTH_SEQUENCE_VARIATION_MAX_STEPS; step += 1) {
    if (values?.[step] !== undefined && values[step] !== null) mask |= 1 << step;
  }
  view.setUint32(offset, mask >>> 0, true);
}

function writeRangeMaxArray(view: DataView, offset: number, values: RangeArray, fallback: NumberArray): void {
  for (let step = 0; step < SYNTH_SEQUENCE_VARIATION_MAX_STEPS; step += 1) {
    const range = values?.[step] ?? null;
    const value = range ? range.max : finiteNumber(fallback?.[step], 1);
    view.setFloat32(offset + step * 4, value, true);
  }
}

function writeTrigConditions(view: DataView, baseOffset: number, overrides: SerializedStepOverrides): void {
  const values = laneArray<readonly [number, number]>(overrides, 'trigCondition');
  let mask = 0;
  for (let step = 0; step < SYNTH_SEQUENCE_VARIATION_MAX_STEPS; step += 1) {
    const pair = Array.isArray(values?.[step]) ? values?.[step] : null;
    let numerator = 1;
    let denominator = 1;
    if (pair) {
      if (pair.length !== 2 || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1])) {
        throw new RangeError(`Invalid trigCondition at step ${step}`);
      }
      numerator = requireRange(pair[0], 1, 0xffffffff, `trigCondition[${step}].numerator`);
      denominator = requireRange(pair[1], numerator, 0xffffffff, `trigCondition[${step}].denominator`);
      mask |= 1 << step;
    }
    view.setUint32(baseOffset + SNAPSHOT_TRIG_NUMERATOR_OFFSET + step * 4, numerator >>> 0, true);
    view.setUint32(baseOffset + SNAPSHOT_TRIG_DENOMINATOR_OFFSET + step * 4, denominator >>> 0, true);
  }
  view.setUint32(baseOffset + SNAPSHOT_TRIG_CONDITION_MASK_OFFSET, mask >>> 0, true);
}

function writeSubLaneConfig(view: DataView, baseOffset: number, variation: SynthSequenceVariation, steps: number): void {
  const subLanes = variation.lane.state.subLaneStates ?? {};
  const kinds = ['probability', 'ratchet', 'trigCondition', 'pitch', 'expression', 'morph', 'distance', 'nudge'] as const;
  let enabledMask = 0;
  let followTriggerHitsMask = 0;
  kinds.forEach((kind, kindIndex) => {
    const field = kindIndex + 1;
    const state: SerializedSubLaneState | undefined = kind === 'pitch' ? subLanes.pitch
      : kind === 'expression' ? subLanes.expression
        : kind === 'morph' ? subLanes.morph
          : kind === 'distance' ? subLanes.distance
            : kind === 'nudge' ? subLanes.nudge
              : undefined;
    const values: NumberArray | null = kind === 'probability' ? laneArray<number>(variation.lane.overrides, 'probability')
      : kind === 'ratchet' ? laneArray<number>(variation.lane.overrides, 'ratchet')
        : kind === 'trigCondition' ? laneArray<readonly [number, number]>(variation.lane.overrides, 'trigCondition') as unknown as NumberArray
          : kind === 'pitch' ? laneArray<number>(variation.lane.overrides, 'pitch')
            : kind === 'expression' ? laneArray<number>(variation.lane.overrides, 'expression')
              : kind === 'morph' ? laneArray<number>(variation.lane.overrides, 'morph')
                : kind === 'distance' ? laneArray<number>(variation.lane.overrides, 'distance')
                  : laneArray<number>(variation.lane.overrides, 'nudge');
    if (state?.enabled || (!state && values !== null)) enabledMask |= 1 << field;
    if (state?.followTriggerHits === true) followTriggerHitsMask |= 1 << field;
    const valueLength = values && values.length > 0 ? values.length : steps;
    const subLaneSteps = state?.steps ?? valueLength;
    if (!Number.isInteger(subLaneSteps) || subLaneSteps < 1 || subLaneSteps > 64) {
      throw new RangeError(`variation ${variation.id} ${kind} sub-lane steps must be an integer in [1, 64]`);
    }
    view.setUint32(baseOffset + SNAPSHOT_SUBLANE_STEPS_OFFSET + field * 4, subLaneSteps, true);
    view.setUint32(baseOffset + SNAPSHOT_SUBLANE_DIRECTIONS_OFFSET + field * 4, direction(state?.direction), true);
  });
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_ENABLED_MASK_OFFSET, enabledMask >>> 0, true);
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_FOLLOW_TRIGGER_HITS_MASK_OFFSET, followTriggerHitsMask >>> 0, true);
  // Field zero is the trigger lane and has no independent sub-lane state.
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_STEPS_OFFSET, steps, true);
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_DIRECTIONS_OFFSET, 0, true);
}

function pitchModeValue(mode: PitchMode): number {
  return mode === 'notes' ? 1 : mode === 'noteRange' ? 2 : 0;
}

function modeValue(mode: SynthSequenceVariationMode): number {
  return mode === 'chord' ? 2 : mode === 'arp' ? 3 : 1;
}

const ARP_FLOWS = ['up', 'down', 'upDown', 'downUp', 'randomLiveTone', 'diceHold'] as const;
const ARP_CONTOUR_MODES = ['pool', 'semitone'] as const;
const ARP_BOUNDARY_MODES = ['fold', 'wrap', 'clamp'] as const;

function arpEnum<T extends readonly string[]>(value: unknown, values: T, label: string): number {
  const index = values.indexOf(value as T[number]);
  if (index < 0) throw new RangeError(`${label} is invalid`);
  return index;
}

function writeArpConfig(view: DataView, offset: number, config: ProductArpConfig, label: string): void {
  if (!config || typeof config !== 'object') throw new RangeError(`${label} is missing`);
  const rate = requireRange(Number(config.rate) * 2, 1, 8, `${label}.rate x2`);
  if (!Number.isInteger(rate) || ![1, 2, 4, 8].includes(rate)) {
    throw new RangeError(`${label}.rate is unsupported`);
  }
  const length = requireRange(config.length, 1, 16, `${label}.length`);
  if (!Number.isInteger(length)) throw new RangeError(`${label}.length must be an integer`);
  const pulseMask = requireRange(config.pulseMask, 0, 0xffffffff, `${label}.pulseMask`);
  const resetMask = requireRange(config.resetMask, 0, 0xffffffff, `${label}.resetMask`);
  if (!Number.isInteger(pulseMask) || !Number.isInteger(resetMask)) {
    throw new RangeError(`${label} masks must be integers`);
  }
  if (!Array.isArray(config.contour) || config.contour.length > 16) {
    throw new RangeError(`${label}.contour must contain at most 16 values`);
  }
  if (!Array.isArray(config.slotLane) || config.slotLane.length > 16) {
    throw new RangeError(`${label}.slotLane must contain at most 16 values`);
  }
  const flow = arpEnum(config.flow, ARP_FLOWS, `${label}.flow`);
  const contourMode = arpEnum(config.contourMode, ARP_CONTOUR_MODES, `${label}.contourMode`);
  const boundaryMode = arpEnum(config.boundaryMode, ARP_BOUNDARY_MODES, `${label}.boundaryMode`);
  view.setUint32(offset + STEP_ARP_RATE_X2_OFFSET, rate, true);
  view.setUint32(offset + STEP_ARP_LENGTH_OFFSET, length, true);
  view.setUint32(offset + STEP_ARP_PULSE_MASK_OFFSET, pulseMask >>> 0, true);
  view.setUint32(offset + STEP_ARP_FLOW_OFFSET, flow, true);
  view.setUint32(offset + STEP_ARP_CONTOUR_MODE_OFFSET, contourMode, true);
  view.setUint32(offset + STEP_ARP_BOUNDARY_MODE_OFFSET, boundaryMode, true);
  view.setUint32(offset + STEP_ARP_RESET_MASK_OFFSET, resetMask >>> 0, true);
  for (let pulse = 0; pulse < 16; pulse += 1) {
    const contour = config.contour[pulse] ?? 0;
    const slot = config.slotLane[pulse] ?? -1;
    if (!Number.isInteger(contour)) throw new RangeError(`${label}.contour[${pulse}] must be an integer`);
    if (!Number.isInteger(slot)) throw new RangeError(`${label}.slotLane[${pulse}] must be an integer`);
    requireRange(contour, -12, 12, `${label}.contour[${pulse}]`);
    requireRange(slot, -1, 7, `${label}.slotLane[${pulse}]`);
    view.setInt32(offset + STEP_ARP_CONTOUR_OFFSET + pulse * 4, contour, true);
    view.setInt32(offset + STEP_ARP_SLOT_LANE_OFFSET + pulse * 4, slot, true);
  }
}

function writeStepMetadata(
  view: DataView,
  baseOffset: number,
  variation: SynthSequenceVariation,
  steps: number,
  clockDiv: number,
): void {
  const mask = triggerMask(variation.lane.overrides, steps);
  for (let step = 0; step < SYNTH_SEQUENCE_VARIATION_MAX_STEPS; step += 1) {
    const offset = baseOffset + SNAPSHOT_STEPS_OFFSET + step * SYNTH_SEQUENCE_VARIATION_STEP_BYTES;
    const metadata = variation.stepMetadata[String(step)];
    const active = (mask & (1 << step)) !== 0;
    const mode = metadata?.mode ? modeValue(metadata.mode) : active ? 1 : 0;
    const gateBeats = metadata?.gateBeats === undefined
      ? 0
      : requireRange(metadata.gateBeats, 0, 64, `stepMetadata[${step}].gateBeats`);
    view.setUint32(offset + STEP_MODE_OFFSET, mode, true);
    const intervals = (metadata?.mode === 'chord' || metadata?.mode === 'arp') && metadata.chord?.intervals?.length
      ? metadata.chord.intervals
      : [{ intervalSemitones: 0, velocity: 1 }];
    if (intervals.length > SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP) {
      throw new RangeError(`stepMetadata[${step}] exceeds ${SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP} notes`);
    }
    for (const [noteIndex, interval] of intervals.entries()) {
      requireRange(interval.intervalSemitones, -48, 48, `stepMetadata[${step}].chord.intervals[${noteIndex}].intervalSemitones`);
      requireRange(interval.velocity, 0, 1, `stepMetadata[${step}].chord.intervals[${noteIndex}].velocity`);
      if (interval.gateBeats !== undefined) {
        requireRange(interval.gateBeats, 0, 64, `stepMetadata[${step}].chord.intervals[${noteIndex}].gateBeats`);
      }
    }
    const notes = active ? intervals : [];
    view.setUint32(offset + STEP_NOTE_COUNT_OFFSET, notes.length, true);
    view.setFloat32(offset + STEP_GATE_BEATS_OFFSET, gateBeats, true);
    const followHarmony = metadata?.followHarmony ?? metadata?.chord?.followHarmony ?? false;
    view.setUint32(offset + STEP_FOLLOW_HARMONY_OFFSET, followHarmony ? 1 : 0, true);
    const arpSpanBeats = metadata?.arp?.spanBeats;
    const arpSpanSteps = arpSpanBeats === undefined
      ? 0
      : requireRange(arpSpanBeats / Math.max(1e-6, 4 / clockDiv), 0, SYNTH_SEQUENCE_VARIATION_MAX_STEPS, `stepMetadata[${step}].arp.spanBeats`);
    view.setFloat32(offset + STEP_ARP_SPAN_STEPS_OFFSET, arpSpanSteps, true);
    const arpFlow = metadata?.arp?.config?.flow;
    view.setUint32(offset + STEP_ARP_DIRECTION_OFFSET, arpFlow === 'down' || arpFlow === 'downUp' ? 1 : 0, true);
    if (metadata?.mode === 'arp') {
      const arpConfig = metadata.arp?.config;
      if (!arpConfig) throw new RangeError(`stepMetadata[${step}].arp.config is required for arp mode`);
      writeArpConfig(view, offset, arpConfig, `stepMetadata[${step}].arp.config`);
    } else {
      // The runtime ignores ARP fields for note/chord steps. Clear them so the
      // bytes remain deterministic if a caller reuses a backing buffer.
      view.setUint32(offset + STEP_ARP_RATE_X2_OFFSET, 0, true);
      view.setUint32(offset + STEP_ARP_LENGTH_OFFSET, 0, true);
      view.setUint32(offset + STEP_ARP_PULSE_MASK_OFFSET, 0, true);
      view.setUint32(offset + STEP_ARP_FLOW_OFFSET, 0, true);
      view.setUint32(offset + STEP_ARP_CONTOUR_MODE_OFFSET, 0, true);
      view.setUint32(offset + STEP_ARP_BOUNDARY_MODE_OFFSET, 0, true);
      view.setUint32(offset + STEP_ARP_RESET_MASK_OFFSET, 0, true);
      for (let pulse = 0; pulse < 16; pulse += 1) {
        view.setInt32(offset + STEP_ARP_CONTOUR_OFFSET + pulse * 4, 0, true);
        view.setInt32(offset + STEP_ARP_SLOT_LANE_OFFSET + pulse * 4, -1, true);
      }
    }
    for (let note = 0; note < SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP; note += 1) {
      const noteOffset = offset + STEP_NOTES_OFFSET + note * STEP_NOTE_BYTES;
      const interval = notes[note];
      view.setFloat32(noteOffset + STEP_NOTE_MIDI_OFFSET, interval ? interval.intervalSemitones : 0, true);
      view.setFloat32(noteOffset + STEP_NOTE_VELOCITY_OFFSET, interval ? interval.velocity : 0, true);
      view.setFloat32(noteOffset + STEP_NOTE_GATE_BEATS_OFFSET, interval?.gateBeats ?? 0, true);
    }
  }
}

function writeVariation(view: DataView, offset: number, variation: SynthSequenceVariation, bankClockDiv: number): void {
  if (!Number.isInteger(variation.steps) || variation.steps < 1 || variation.steps > SYNTH_SEQUENCE_VARIATION_MAX_STEPS) {
    throw new RangeError(`Variation ${variation.id} has an invalid step count`);
  }
  const steps = variation.steps;
  const overrides = variation.lane.overrides;
  const clockDiv = sequencerClockDivisionToNumericValue(variation.lane.state.clockDiv ?? bankClockDiv, bankClockDiv);
  const swing = variation.lane.state.swing === undefined ? 0 : requireRange(variation.lane.state.swing, 0, 1, `variation ${variation.id} swing`);
  view.setUint32(offset + SNAPSHOT_STEP_COUNT_OFFSET, steps, true);
  view.setUint32(offset + SNAPSHOT_CLOCK_DIVISION_OFFSET, clockDiv, true);
  view.setFloat32(offset + SNAPSHOT_SWING_OFFSET, swing, true);
  view.setUint32(offset + SNAPSHOT_TRIGGER_MASK_OFFSET, triggerMask(overrides, steps), true);
  writeSubLaneConfig(view, offset, variation, steps);

  const probability = laneArray<number>(overrides, 'probability');
  const ratchet = laneArray<number>(overrides, 'ratchet');
  const expression = laneArray<number>(overrides, 'expression');
  const morph = laneArray<number>(overrides, 'morph');
  const distance = laneArray<number>(overrides, 'distance');
  const nudge = laneArray<number>(overrides, 'nudge');
  validateNumberArray(probability, 0, 1, `variation ${variation.id} probability`);
  validateNumberArray(ratchet, 1, 8, `variation ${variation.id} ratchet`, true);
  validateNumberArray(expression, 0, 1, `variation ${variation.id} expression`);
  validateNumberArray(morph, 0, 1, `variation ${variation.id} morph`);
  validateNumberArray(distance, 0, 1, `variation ${variation.id} distance`);
  validateNumberArray(nudge, -1, 1, `variation ${variation.id} nudge`);
  const expressionRanges = rangeArray(overrides, 'expressionRanges');
  const morphRanges = rangeArray(overrides, 'morphRanges');
  const distanceRanges = rangeArray(overrides, 'distanceRanges');
  validateRangeArray(expressionRanges, `variation ${variation.id} expressionRanges`);
  validateRangeArray(morphRanges, `variation ${variation.id} morphRanges`);
  validateRangeArray(distanceRanges, `variation ${variation.id} distanceRanges`);
  writeMask(view, offset + SNAPSHOT_PROBABILITY_MASK_OFFSET, probability);
  writeMask(view, offset + SNAPSHOT_RATCHET_MASK_OFFSET, ratchet);
  writeTrigConditions(view, offset, overrides);
  writeMask(view, offset + SNAPSHOT_EXPRESSION_MASK_OFFSET, expression);
  writeMask(view, offset + SNAPSHOT_MORPH_MASK_OFFSET, morph);
  writeMask(view, offset + SNAPSHOT_DISTANCE_MASK_OFFSET, distance);
  writeMask(view, offset + SNAPSHOT_NUDGE_MASK_OFFSET, nudge);
  writeRangeMask(view, offset + SNAPSHOT_EXPRESSION_RANGE_MASK_OFFSET, expressionRanges);
  writeRangeMask(view, offset + SNAPSHOT_MORPH_RANGE_MASK_OFFSET, morphRanges);
  writeRangeMask(view, offset + SNAPSHOT_DISTANCE_RANGE_MASK_OFFSET, distanceRanges);
  writeFloatArray(view, offset + SNAPSHOT_PROBABILITY_OFFSET, probability, 1);
  writeUintArray(view, offset + SNAPSHOT_RATCHET_OFFSET, ratchet, 1);
  writeRangeMaxArray(view, offset + SNAPSHOT_EXPRESSION_RANGE_OFFSET, expressionRanges, expression);
  writeRangeMaxArray(view, offset + SNAPSHOT_MORPH_RANGE_OFFSET, morphRanges, morph);
  writeRangeMaxArray(view, offset + SNAPSHOT_DISTANCE_RANGE_OFFSET, distanceRanges, distance);
  // The serialized lane keeps the existing UI representation: semitone values
  // are root-relative semitones, notes values are scale degrees, and noteRange
  // values are root-relative range offsets. The wire payload stores the
  // resolved semitone offset plus the mode/root needed by the audio resolver.
  const pitch = laneArray<number>(overrides, 'pitch');
  const rootPitch = finiteNumber(variation.lane.state.pitchSettings?.root, 60);
  requireRange(rootPitch, 0, 127, `variation ${variation.id} pitch root`);
  const pitchMode = variation.lane.state.pitchSettings?.mode ?? 'semitones';
  const scaleName = variation.lane.state.pitchSettings?.scale ?? 'Major';
  const scale = SCALES[scaleName] ?? SCALES.Major;
  validateNumberArray(pitch, -48, 48, `variation ${variation.id} pitch`);
  const pitchOffsets = pitch?.map((value) => pitchMode === 'notes'
    ? scaleDegreeToSemitone(value, scale)
    : value) ?? null;
  validateNumberArray(pitchOffsets, -48, 48, `variation ${variation.id} pitch offsets`);
  view.setFloat32(offset + SNAPSHOT_PITCH_ROOT_OFFSET, rootPitch, true);
  view.setUint32(offset + SNAPSHOT_PITCH_MODE_OFFSET, pitchModeValue(pitchMode), true);
  view.setUint32(
    offset + SNAPSHOT_PITCH_BINDING_MODE_OFFSET,
    sequencerPitchBindingModeToProductId(normalizeSequencerPitchBindingMode(variation.lane.state.pitchBindingMode)),
    true,
  );
  writeMask(view, offset + SNAPSHOT_MIDI_NOTE_MASK_OFFSET, pitch);
  writeFloatArray(view, offset + SNAPSHOT_MIDI_NOTE_OFFSET, pitchOffsets, 0);
  writeFloatArray(view, offset + SNAPSHOT_EXPRESSION_OFFSET, expression, 1);
  writeFloatArray(view, offset + SNAPSHOT_MORPH_OFFSET, morph, 0);
  writeFloatArray(view, offset + SNAPSHOT_DISTANCE_OFFSET, distance, 0);
  writeFloatArray(view, offset + SNAPSHOT_NUDGE_OFFSET, nudge, 0);
  writeStepMetadata(view, offset, variation, steps, clockDiv);
}

export function encodeSynthSequenceVariationBank(bank: SynthSequenceVariationBank | null): ArrayBuffer {
  if (bank === null) {
    const bytes = new ArrayBuffer(SYNTH_SEQUENCE_VARIATION_BANK_BYTES);
    new DataView(bytes).setUint32(0, 1, true);
    return bytes;
  }
  const normalized = normalizeSynthSequenceVariationBank(bank);
  if (!normalized) throw new TypeError('A variation bank is required');
  const bytes = new ArrayBuffer(SYNTH_SEQUENCE_VARIATION_BANK_BYTES);
  const view = new DataView(bytes);
  const bankClockDiv = sequencerClockDivisionToNumericValue(normalized.clockDiv, 16);
  view.setUint32(0, normalized.schemaVersion, true);
  view.setUint32(4, 1, true);
  const playId = String.fromCharCode(65 + normalized.playVariation) as SynthSequenceVariationId;
  const chain = normalized.chainEnabled ? normalized.chainOrder : [playId];
  if (chain.length === 0 || chain.length > SYNTH_SEQUENCE_VARIATION_MAX_CHAIN_ENTRIES) {
    throw new RangeError('Variation chain is empty or too long');
  }
  view.setUint32(8, chain.length, true);
  chain.forEach((id, index) => view.setUint32(12 + index * 4, id.charCodeAt(0) - 65, true));
  view.setUint32(28, normalized.playVariation, true);
  view.setBigUint64(32, 0n, true);
  for (let index = 0; index < SYNTH_SEQUENCE_VARIATION_COUNT; index += 1) {
    const id = String.fromCharCode(65 + index) as SynthSequenceVariationId;
    const variation = normalized.variations[id];
    if (variation) writeVariation(view, BANK_VARIATIONS_OFFSET + index * SYNTH_SEQUENCE_VARIATION_SNAPSHOT_BYTES, variation, bankClockDiv);
  }
  return bytes;
}
