import { sequencerClockDivisionToNumericValue } from '../../audio/sequencerClockDivisions';
import { SCALES, scaleDegreeToSemitone } from '../../audio/drumSeqTypes';
import { chordIntentFields, noteListFields } from '../../audio/harmony/chord';
import type { CoreProductChordIntent, CoreProductChordNote } from '../../audio/coreProductSnapshotTypes';
import { normalizeSequencerPitchBindingMode } from '../../audio/sequencerPitchBinding';
import { defaultProductArpConfig, type ProductArpConfig } from '../../audio/productArpeggiator';
import type {
  NotesCell,
  SynthSequenceVariation,
  SynthSequenceVariationBank,
  SynthSequenceVariationId,
} from '../../ui/sequencer/synthSequenceVariations';
import { normalizeSynthSequenceVariationBank, resolveNotesCellArticulation, variationTriggerMask } from '../../ui/sequencer/synthSequenceVariations';
import type { SerializedStepOverrides, SerializedSubLaneState } from '../../ui/state';

export const SYNTH_SEQUENCE_VARIATION_COUNT = 4;
export const SYNTH_SEQUENCE_VARIATION_MAX_STEPS = 32;
export const SYNTH_SEQUENCE_VARIATION_MAX_CHAIN_ENTRIES = 4;
export const SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP = 32;
// Keep these offsets in lockstep with
// KesshoProductSequencerVariations.h.  The payload is copied directly into
// the C ABI struct by the WASM/native hosts, so an omitted field corrupts every
// following variation.
export const SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION_WIRE = 2;
export const SYNTH_SEQUENCE_VARIATION_NOTES_SUBLANE = 9;
export const SYNTH_SEQUENCE_VARIATION_CELL_BYTES = 792;
export const SYNTH_SEQUENCE_VARIATION_SNAPSHOT_BYTES = 27028;
export const SYNTH_SEQUENCE_VARIATION_BANK_BYTES = 108152;

const SNAPSHOT_STEP_COUNT_OFFSET = 0;
const SNAPSHOT_CLOCK_DIVISION_OFFSET = 4;
const SNAPSHOT_SWING_OFFSET = 8;
const SNAPSHOT_TRIGGER_MASK_OFFSET = 12;
const SNAPSHOT_SUBLANE_ENABLED_MASK_OFFSET = 16;
const SNAPSHOT_SUBLANE_STEPS_OFFSET = 20;
const SNAPSHOT_SUBLANE_DIRECTIONS_OFFSET = 60;
const SNAPSHOT_SUBLANE_FOLLOW_TRIGGER_HITS_MASK_OFFSET = 100;
const SNAPSHOT_PROBABILITY_MASK_OFFSET = 104;
const SNAPSHOT_RATCHET_MASK_OFFSET = 108;
const SNAPSHOT_TRIG_CONDITION_MASK_OFFSET = 112;
const SNAPSHOT_MIDI_NOTE_MASK_OFFSET = 116;
const SNAPSHOT_EXPRESSION_MASK_OFFSET = 120;
const SNAPSHOT_MORPH_MASK_OFFSET = 124;
const SNAPSHOT_DISTANCE_MASK_OFFSET = 128;
const SNAPSHOT_NUDGE_MASK_OFFSET = 132;
const SNAPSHOT_EXPRESSION_RANGE_MASK_OFFSET = 136;
const SNAPSHOT_MORPH_RANGE_MASK_OFFSET = 140;
const SNAPSHOT_DISTANCE_RANGE_MASK_OFFSET = 144;
const SNAPSHOT_PROBABILITY_OFFSET = 148;
const SNAPSHOT_RATCHET_OFFSET = 276;
const SNAPSHOT_TRIG_NUMERATOR_OFFSET = 404;
const SNAPSHOT_TRIG_DENOMINATOR_OFFSET = 532;
const SNAPSHOT_MIDI_NOTE_OFFSET = 660;
const SNAPSHOT_EXPRESSION_OFFSET = 788;
const SNAPSHOT_EXPRESSION_RANGE_OFFSET = 916;
const SNAPSHOT_MORPH_OFFSET = 1044;
const SNAPSHOT_MORPH_RANGE_OFFSET = 1172;
const SNAPSHOT_DISTANCE_OFFSET = 1300;
const SNAPSHOT_DISTANCE_RANGE_OFFSET = 1428;
const SNAPSHOT_NUDGE_OFFSET = 1556;
const SNAPSHOT_CELLS_OFFSET = 1684;
const CELL_KIND_OFFSET = 0;
const CELL_ARTICULATION_OFFSET = 4;
const CELL_NOTE_COUNT_OFFSET = 8;
const CELL_GATE_BEATS_OFFSET = 12;
const CELL_ARP_SPAN_STEPS_OFFSET = 16;
const CELL_ARP_DIRECTION_OFFSET = 20;
const CELL_ARP_RATE_X2_OFFSET = 24;
const CELL_ARP_LENGTH_OFFSET = 28;
const CELL_ARP_PULSE_MASK_OFFSET = 32;
const CELL_ARP_FLOW_OFFSET = 36;
const CELL_ARP_CONTOUR_MODE_OFFSET = 40;
const CELL_ARP_BOUNDARY_MODE_OFFSET = 44;
const CELL_ARP_RESET_MASK_OFFSET = 48;
const CELL_ARP_CONTOUR_OFFSET = 52;
const CELL_INTENT_OFFSET = 116;
const CELL_INTENT_BYTES = 36;
const CELL_NOTES_OFFSET = 152;
const CELL_NOTE_BYTES = 20;
const CELL_NOTE_MIDI_OFFSET = 0;
const CELL_NOTE_VELOCITY_OFFSET = 4;
const CELL_NOTE_GATE_BEATS_OFFSET = 8;
const CELL_NOTE_OFFSET_BEATS_OFFSET = 12;
const CELL_NOTE_DESTINATION_OFFSET = 16;
const CELL_KIND_REST = 0;
const CELL_KIND_HARMONY = 1;
const CELL_KIND_FIXED = 2;
const CELL_KIND_FOLLOW = 3;
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
  try {
    return variationTriggerMask(overrides, steps);
  } catch (error) {
    throw new RangeError(error instanceof Error ? error.message : 'Invalid trigger lane');
  }
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
    // Pitch Advance comes from the lane's pitch binding: Hits for
    // polyrhythmic and linked, Steps for sequence.
    const followHits = kind === 'pitch'
      ? normalizeSequencerPitchBindingMode(variation.lane.state.pitchBindingMode) !== 'sequence'
      : state?.followTriggerHits === true;
    if (followHits) followTriggerHitsMask |= 1 << field;
    const valueLength = values && values.length > 0 ? values.length : steps;
    const subLaneSteps = state?.steps ?? valueLength;
    if (!Number.isInteger(subLaneSteps) || subLaneSteps < 1 || subLaneSteps > 64) {
      throw new RangeError(`variation ${variation.id} ${kind} sub-lane steps must be an integer in [1, 64]`);
    }
    view.setUint32(baseOffset + SNAPSHOT_SUBLANE_STEPS_OFFSET + field * 4, subLaneSteps, true);
    view.setUint32(baseOffset + SNAPSHOT_SUBLANE_DIRECTIONS_OFFSET + field * 4, direction(state?.direction), true);
  });
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_ENABLED_MASK_OFFSET, enabledMask >>> 0, true);
  // Field zero is the trigger lane and has no independent sub-lane state.
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_STEPS_OFFSET, steps, true);
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_DIRECTIONS_OFFSET, 0, true);
  // The Notes lane carries its own length, direction and Advance.
  const notesLane = variation.notesLane;
  if (!Number.isInteger(notesLane.length) || notesLane.length < 1 || notesLane.length > SYNTH_SEQUENCE_VARIATION_MAX_STEPS) {
    throw new RangeError(`variation ${variation.id} notes lane length must be an integer in [1, ${SYNTH_SEQUENCE_VARIATION_MAX_STEPS}]`);
  }
  view.setUint32(
    baseOffset + SNAPSHOT_SUBLANE_STEPS_OFFSET + SYNTH_SEQUENCE_VARIATION_NOTES_SUBLANE * 4, notesLane.length, true);
  view.setUint32(
    baseOffset + SNAPSHOT_SUBLANE_DIRECTIONS_OFFSET + SYNTH_SEQUENCE_VARIATION_NOTES_SUBLANE * 4, direction(notesLane.direction), true);
  if (notesLane.advance === 'hits') {
    followTriggerHitsMask |= 1 << SYNTH_SEQUENCE_VARIATION_NOTES_SUBLANE;
  }
  view.setUint32(baseOffset + SNAPSHOT_SUBLANE_FOLLOW_TRIGGER_HITS_MASK_OFFSET, followTriggerHitsMask >>> 0, true);
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
  const flow = arpEnum(config.flow, ARP_FLOWS, `${label}.flow`);
  const contourMode = arpEnum(config.contourMode, ARP_CONTOUR_MODES, `${label}.contourMode`);
  const boundaryMode = arpEnum(config.boundaryMode, ARP_BOUNDARY_MODES, `${label}.boundaryMode`);
  view.setUint32(offset + CELL_ARP_RATE_X2_OFFSET, rate, true);
  view.setUint32(offset + CELL_ARP_LENGTH_OFFSET, length, true);
  view.setUint32(offset + CELL_ARP_PULSE_MASK_OFFSET, pulseMask >>> 0, true);
  view.setUint32(offset + CELL_ARP_FLOW_OFFSET, flow, true);
  view.setUint32(offset + CELL_ARP_CONTOUR_MODE_OFFSET, contourMode, true);
  view.setUint32(offset + CELL_ARP_BOUNDARY_MODE_OFFSET, boundaryMode, true);
  view.setUint32(offset + CELL_ARP_RESET_MASK_OFFSET, resetMask >>> 0, true);
  for (let pulse = 0; pulse < 16; pulse += 1) {
    const contour = config.contour[pulse] ?? 0;
    if (!Number.isInteger(contour)) throw new RangeError(`${label}.contour[${pulse}] must be an integer`);
    requireRange(contour, -12, 12, `${label}.contour[${pulse}]`);
    view.setInt32(offset + CELL_ARP_CONTOUR_OFFSET + pulse * 4, contour, true);
  }
}

function writeNoteFields(view: DataView, offset: number, notes: readonly CoreProductChordNote[], label: string): void {
  if (notes.length > SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP) {
    throw new RangeError(`${label} exceeds ${SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP} notes`);
  }
  for (let note = 0; note < SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP; note += 1) {
    const noteOffset = offset + CELL_NOTES_OFFSET + note * CELL_NOTE_BYTES;
    const field = notes[note];
    if (field) {
      requireRange(field.velocity, 0, 1, `${label}.notes[${note}].velocity`);
      requireRange(field.gateBeats, 0, 64, `${label}.notes[${note}].gate`);
      requireRange(field.offsetBeats, 0, 64, `${label}.notes[${note}].offset`);
    }
    view.setFloat32(noteOffset + CELL_NOTE_MIDI_OFFSET, field?.midi ?? 0, true);
    view.setFloat32(noteOffset + CELL_NOTE_VELOCITY_OFFSET, field?.velocity ?? 0, true);
    view.setFloat32(noteOffset + CELL_NOTE_GATE_BEATS_OFFSET, field?.gateBeats ?? 0, true);
    view.setFloat32(noteOffset + CELL_NOTE_OFFSET_BEATS_OFFSET, field?.offsetBeats ?? 0, true);
    view.setUint32(noteOffset + CELL_NOTE_DESTINATION_OFFSET, (field?.destinationSourceId ?? 0) >>> 0, true);
  }
}

/** KesshoProductChordIntent: u32 behavior, i32 degree, u32 quality, u32 extensions, i32 inversion,
 * f32 spread, i32 register, u32 bass mode, u32 bass pitch class. All zero is a Follow tonic triad. */
function writeIntentFields(view: DataView, offset: number, intent: CoreProductChordIntent | null): void {
  const base = offset + CELL_INTENT_OFFSET;
  for (let byte = 0; byte < CELL_INTENT_BYTES; byte += 4) view.setUint32(base + byte, 0, true);
  if (!intent) return;
  view.setUint32(base, intent.behavior >>> 0, true);
  view.setInt32(base + 4, intent.degree, true);
  view.setUint32(base + 8, intent.quality >>> 0, true);
  view.setUint32(base + 12, intent.extensions >>> 0, true);
  view.setInt32(base + 16, intent.inversion, true);
  view.setFloat32(base + 20, intent.spread, true);
  view.setInt32(base + 24, intent.registerOctave, true);
  view.setUint32(base + 28, intent.bassMode >>> 0, true);
  view.setUint32(base + 32, intent.bassPitchClass >>> 0, true);
}

function cellNoteFields(cell: NotesCell, label: string): { kind: number; notes: CoreProductChordNote[]; intent: CoreProductChordIntent | null } {
  if (cell.kind === 'harmony') {
    const intervals = cell.intervals ?? [];
    for (const [index, note] of intervals.entries()) requireRange(note.midi, -48, 48, `${label}.intervals[${index}].interval`);
    return { kind: CELL_KIND_HARMONY, notes: noteListFields(intervals, SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP), intent: null };
  }
  if (cell.kind === 'chord' && cell.chord) {
    const chord = cell.chord;
    if (chord.behavior === 'fixed') {
      return { kind: CELL_KIND_FIXED, notes: noteListFields(chord.notes, SYNTH_SEQUENCE_VARIATION_MAX_NOTES_PER_STEP), intent: null };
    }
    // Follow cells send intent only; native resolves them and `notes` is a display cache.
    return { kind: CELL_KIND_FOLLOW, notes: [], intent: chordIntentFields(chord) };
  }
  return { kind: CELL_KIND_REST, notes: [], intent: null };
}

function writeCells(view: DataView, baseOffset: number, variation: SynthSequenceVariation, clockDiv: number): void {
  for (let step = 0; step < SYNTH_SEQUENCE_VARIATION_MAX_STEPS; step += 1) {
    const offset = baseOffset + SNAPSHOT_CELLS_OFFSET + step * SYNTH_SEQUENCE_VARIATION_CELL_BYTES;
    const cell = variation.cells[step];
    const label = `cells[${step}]`;
    if (!cell) throw new RangeError(`${label} is missing`);
    const gateBeats = requireRange(cell.gateBeats, 0, 64, `${label}.gateBeats`);
    const { kind, notes, intent } = cellNoteFields(cell, label);
    const arp = resolveNotesCellArticulation(cell, variation.notesLane) === 'arp';
    // A lane default of Arp reaches cells that carry no payload of their own.
    const arpPayload = cell.arp ?? (arp ? { config: defaultProductArpConfig() } : undefined);
    view.setUint32(offset + CELL_KIND_OFFSET, kind, true);
    view.setUint32(offset + CELL_ARTICULATION_OFFSET, arp ? 1 : 0, true);
    view.setUint32(offset + CELL_NOTE_COUNT_OFFSET, notes.length, true);
    view.setFloat32(offset + CELL_GATE_BEATS_OFFSET, gateBeats, true);
    const arpSpanBeats = arpPayload?.spanBeats;
    const arpSpanSteps = arpSpanBeats === undefined
      ? 0
      : requireRange(arpSpanBeats / Math.max(1e-6, 4 / clockDiv), 0, SYNTH_SEQUENCE_VARIATION_MAX_STEPS, `${label}.arp.spanBeats`);
    view.setFloat32(offset + CELL_ARP_SPAN_STEPS_OFFSET, arpSpanSteps, true);
    const arpFlow = arpPayload?.config?.flow;
    view.setUint32(offset + CELL_ARP_DIRECTION_OFFSET, arpFlow === 'down' || arpFlow === 'downUp' ? 1 : 0, true);
    if (arp) {
      if (!arpPayload?.config) throw new RangeError(`${label}.arp.config is required for arp articulation`);
      writeArpConfig(view, offset, arpPayload.config, `${label}.arp.config`);
    } else {
      // The runtime ignores ARP fields for chord cells. Clear them so the
      // bytes remain deterministic if a caller reuses a backing buffer.
      view.setUint32(offset + CELL_ARP_RATE_X2_OFFSET, 0, true);
      view.setUint32(offset + CELL_ARP_LENGTH_OFFSET, 0, true);
      view.setUint32(offset + CELL_ARP_PULSE_MASK_OFFSET, 0, true);
      view.setUint32(offset + CELL_ARP_FLOW_OFFSET, 0, true);
      view.setUint32(offset + CELL_ARP_CONTOUR_MODE_OFFSET, 0, true);
      view.setUint32(offset + CELL_ARP_BOUNDARY_MODE_OFFSET, 0, true);
      view.setUint32(offset + CELL_ARP_RESET_MASK_OFFSET, 0, true);
      for (let pulse = 0; pulse < 16; pulse += 1) {
        view.setInt32(offset + CELL_ARP_CONTOUR_OFFSET + pulse * 4, 0, true);
      }
    }
    writeIntentFields(view, offset, intent);
    writeNoteFields(view, offset, notes, label);
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
  // resolved semitone offset.
  const pitch = laneArray<number>(overrides, 'pitch');
  const pitchMode = variation.lane.state.pitchSettings?.mode ?? 'semitones';
  const scaleName = variation.lane.state.pitchSettings?.scale ?? 'Major';
  const scale = SCALES[scaleName] ?? SCALES.Major;
  validateNumberArray(pitch, -48, 48, `variation ${variation.id} pitch`);
  const pitchOffsets = pitch?.map((value) => pitchMode === 'notes'
    ? scaleDegreeToSemitone(value, scale)
    : value) ?? null;
  validateNumberArray(pitchOffsets, -48, 48, `variation ${variation.id} pitch offsets`);
  writeMask(view, offset + SNAPSHOT_MIDI_NOTE_MASK_OFFSET, pitch);
  writeFloatArray(view, offset + SNAPSHOT_MIDI_NOTE_OFFSET, pitchOffsets, 0);
  writeFloatArray(view, offset + SNAPSHOT_EXPRESSION_OFFSET, expression, 1);
  writeFloatArray(view, offset + SNAPSHOT_MORPH_OFFSET, morph, 0);
  writeFloatArray(view, offset + SNAPSHOT_DISTANCE_OFFSET, distance, 0);
  writeFloatArray(view, offset + SNAPSHOT_NUDGE_OFFSET, nudge, 0);
  writeCells(view, offset, variation, clockDiv);
}

export function encodeSynthSequenceVariationBank(bank: SynthSequenceVariationBank | null): ArrayBuffer {
  if (bank === null) {
    const bytes = new ArrayBuffer(SYNTH_SEQUENCE_VARIATION_BANK_BYTES);
    new DataView(bytes).setUint32(0, SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION_WIRE, true);
    return bytes;
  }
  const normalized = normalizeSynthSequenceVariationBank(bank);
  if (!normalized) throw new TypeError('A variation bank is required');
  const bytes = new ArrayBuffer(SYNTH_SEQUENCE_VARIATION_BANK_BYTES);
  const view = new DataView(bytes);
  const bankClockDiv = sequencerClockDivisionToNumericValue(normalized.clockDiv, 16);
  view.setUint32(0, SYNTH_SEQUENCE_VARIATION_SCHEMA_VERSION_WIRE, true);
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
