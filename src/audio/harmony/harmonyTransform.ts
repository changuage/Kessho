import { resolveHarmonyIntentToNotePool } from '../CoreProductHarmonyControl';
import { HARMONY_SCALE_INTERVALS, DEFAULT_HARMONY_SCALE_INTERVALS } from './harmonyScaleIntervals';
import type { TonalContextCandidate } from './tonalContextAnalysis';
import type {
  HarmonyIntent,
  SharedHarmonyChord,
} from './harmonyTypes';

export interface HarmonyTakeoverFrame {
  anchorPitchClass: number;
  sourceContext: TonalContextCandidate;
  effectiveContext: TonalContextCandidate;
  latched: boolean;
}

export interface HarmonyTransformInput {
  chord: SharedHarmonyChord;
  sourceContext: TonalContextCandidate;
  effectiveContext: TonalContextCandidate;
  underlyingNotes?: readonly number[];
  tension?: number;
  /** Auto retains its authored exact snapshot until its semantic selection is explicit. */
  autoUsesSemantic?: boolean;
  /** Explicit custom/captured voicing may use interval-shape fallback. */
  customFallback?: boolean;
  /** The host can mark a frame that has already passed through takeover. */
  alreadyTransformed?: boolean;
}

export interface HarmonyTransformResult {
  exactMidiNotes: number[];
  intent: HarmonyIntent | null;
  transformed: boolean;
  bypassed: boolean;
  reason: 'exact' | 'semantic' | 'chromatic-shape' | 'empty';
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pc = (value: number) => ((Math.round(value) % 12) + 12) % 12;
const intervalsFor = (scaleId: number) => HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;

function minimumMovement(from: readonly number[], target: readonly number[]): number[] {
  if (!from.length || !target.length) return [...target];
  const source = [...from].sort((a, b) => a - b);
  const desired = [...target].sort((a, b) => a - b);
  const result: number[] = [];
  for (let index = 0; index < desired.length; index += 1) {
    const note = desired[index]!;
    const candidates = [-24, -12, 0, 12, 24].map((shift) => clamp(note + shift, 0, 127));
    const sourceBass = source[0]!;
    let best = candidates[0]!;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const nearest = Math.min(...source.map((voice) => Math.abs(voice - candidate)));
      const commonBonus = source.some((voice) => pc(voice) === pc(candidate)) ? -7 : 0;
      const bassPenalty = index === 0 ? Math.abs(sourceBass - candidate) * 0.12 : 0;
      const score = nearest + commonBonus + bassPenalty;
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    result.push(best);
  }
  return result.sort((a, b) => a - b);
}

function remapIntent(intent: HarmonyIntent, source: TonalContextCandidate, target: TonalContextCandidate): HarmonyIntent {
  const sourceIntervals = intervalsFor(source.scaleId);
  const targetIntervals = intervalsFor(target.scaleId);
  const degree = ((Math.round(intent.degree) % targetIntervals.length) + targetIntervals.length) % targetIntervals.length;
  const sourceRoot = pc(source.rootPitchClass);
  const targetRoot = pc(target.rootPitchClass);
  // Degree semantics follow the target scale. Absolute semantics retain their
  // authored interval from the source tonic, rather than becoming a second mode.
  const rootNote = intent.rootMode === 'absolute'
    ? pc(targetRoot + pc(intent.rootNote) - sourceRoot)
    : pc(intent.rootNote);
  return {
    ...intent,
    degree,
    rootNote,
    // Captured notes belong to the old exact representation and must not leak
    // into a semantic takeover.
    capturedMidiNotes: [],
    preserveCapturedVoicing: false,
    rootMode: intent.rootMode === 'captured' ? 'degree' : intent.rootMode,
    octave: clamp(Math.round(intent.octave), 0, 9),
    inversion: clamp(Math.round(intent.inversion), -4, 4),
    // Keep a valid target scale degree even when the source scale had a
    // different cardinality. This is intentionally advisory, not a hard filter.
    ...(sourceIntervals.length === targetIntervals.length ? {} : { degree }),
  };
}

function chromaticShape(notes: readonly number[], source: TonalContextCandidate, target: TonalContextCandidate): number[] {
  const shift = ((target.rootPitchClass - source.rootPitchClass + 18) % 12) - 6;
  const moved = notes.map((note) => clamp(Math.round(note) + shift, 0, 127));
  // Prefer a stepwise bass where a one-octave equivalent is available.
  if (moved.length > 1 && moved[0]! > moved[1]!) moved.sort((a, b) => a - b);
  return moved;
}

/** One bounded transformation for every Relative/eligible Auto playback path. */
export function transformHarmonyChord(input: HarmonyTransformInput): HarmonyTransformResult {
  const { chord, sourceContext, effectiveContext } = input;
  const exact = [...(chord.exactMidiNotes ?? [])].map(Math.round);
  if (chord.playbackBehavior === 'exact') return { exactMidiNotes: exact, intent: chord.intent, transformed: false, bypassed: true, reason: 'exact' };
  if (input.alreadyTransformed) return { exactMidiNotes: exact, intent: chord.intent, transformed: false, bypassed: true, reason: 'chromatic-shape' };
  if (chord.playbackBehavior === 'auto' && !input.autoUsesSemantic) return { exactMidiNotes: exact, intent: chord.intent, transformed: false, bypassed: true, reason: 'exact' };
  if (!chord.intent) {
    if (!input.customFallback) return { exactMidiNotes: [], intent: null, transformed: false, bypassed: false, reason: 'empty' };
    const moved = exact.length ? chromaticShape(exact, sourceContext, effectiveContext) : [];
    return { exactMidiNotes: moved, intent: null, transformed: moved.length > 0, bypassed: false, reason: moved.length ? 'chromatic-shape' : 'empty' };
  }
  if (chord.intent.quality === 'custom' && exact.length && input.customFallback) {
    const moved = chromaticShape(exact, sourceContext, effectiveContext);
    return { exactMidiNotes: moved, intent: chord.intent, transformed: true, bypassed: false, reason: 'chromatic-shape' };
  }
  const semantic = remapIntent(chord.intent, sourceContext, effectiveContext);
  let notes = resolveHarmonyIntentToNotePool({
    intent: semantic,
    rootMidi: 60 + pc(effectiveContext.rootPitchClass),
    scaleId: effectiveContext.scaleId,
    tension: input.tension ?? 0.35,
  });
  if (!notes.length && exact.length) notes = chromaticShape(exact, sourceContext, effectiveContext);
  if (exact.length && notes.length) {
    // The generated semantic voicing is the primary result. A bounded common
    // tone pass keeps the register near the underlying frame and avoids double
    // transposition when a caller has already supplied transformed notes.
    if (input.underlyingNotes?.length) notes = minimumMovement(input.underlyingNotes, notes);
  }
  return { exactMidiNotes: notes, intent: semantic, transformed: true, bypassed: false, reason: notes.length ? 'semantic' : 'empty' };
}

export const applyHarmonyTakeover = transformHarmonyChord;

export interface HarmonyTakeoverRuntime {
  readonly snapshot: () => { underlying: HarmonyTakeoverFrame; active: HarmonyTakeoverFrame; held: boolean; latched: boolean };
  hold(frame: HarmonyTakeoverFrame, currentUnderlying?: HarmonyTakeoverFrame): void;
  updateUnderlying(frame: HarmonyTakeoverFrame): void;
  release(currentUnderlying: HarmonyTakeoverFrame): void;
  setLatch(latched: boolean): void;
  viewChanged(): void;
  stop(currentUnderlying: HarmonyTakeoverFrame): void;
}

/** Runtime state deliberately receives the then-current underlying frame on
 * release/stop; progression advancement therefore remains external. */
export function createHarmonyTakeoverRuntime(initial: HarmonyTakeoverFrame): HarmonyTakeoverRuntime {
  let underlying = initial;
  let active = initial;
  let held = false;
  let latched = Boolean(initial.latched);
  return {
    snapshot: () => ({ underlying, active, held, latched }),
    hold(frame, currentUnderlying) { if (currentUnderlying) underlying = currentUnderlying; active = { ...frame, latched }; held = true; },
    updateUnderlying(frame) { underlying = frame; if (!held && !latched) active = frame; },
    release(currentUnderlying) { underlying = currentUnderlying; if (!latched) active = currentUnderlying; held = false; },
    setLatch(value) { latched = Boolean(value); active = { ...active, latched }; },
    viewChanged() { /* latch is runtime state, never a view concern */ },
    stop(currentUnderlying) { underlying = currentUnderlying; latched = false; held = false; active = currentUnderlying; },
  };
}

export interface HarmonyPrintPatch<T> {
  readonly before: readonly T[];
  readonly after: readonly T[];
  apply(): T[];
  undo(): T[];
}

/** Print semantic and audible exact snapshots atomically without mutating slots. */
export function planHarmonyPrint<T extends { id: number; chord: SharedHarmonyChord | null }>(
  slots: readonly T[], sourceContext: TonalContextCandidate, effectiveContext: TonalContextCandidate, tensionOrOptions: number | { tension?: number; autoUsesSemantic?: boolean | ((chord: SharedHarmonyChord) => boolean) } = 0.35,
): HarmonyPrintPatch<T> {
  const tension = typeof tensionOrOptions === 'number' ? tensionOrOptions : tensionOrOptions.tension ?? 0.35;
  const autoUsesSemantic = typeof tensionOrOptions === 'number' ? undefined : tensionOrOptions.autoUsesSemantic;
  const before = slots.map((slot) => ({ ...slot, chord: slot.chord ? { ...slot.chord, intent: slot.chord.intent ? { ...slot.chord.intent } : null, exactMidiNotes: [...slot.chord.exactMidiNotes] } : null })) as T[];
  const after = before.map((slot) => {
    if (!slot.chord) return slot;
    const eligibleAuto = typeof autoUsesSemantic === 'function' ? autoUsesSemantic(slot.chord) : autoUsesSemantic ?? (slot.chord.playbackBehavior === 'auto' && slot.chord.intentSource === 'confirmed');
    const result = transformHarmonyChord({ chord: slot.chord, sourceContext, effectiveContext, tension, autoUsesSemantic: eligibleAuto, customFallback: true });
    if (result.bypassed) return slot;
    return { ...slot, chord: { ...slot.chord, intent: result.intent, exactMidiNotes: [...result.exactMidiNotes] } } as T;
  });
  return { before, after, apply: () => after.map((slot) => ({ ...slot, chord: slot.chord ? { ...slot.chord, exactMidiNotes: [...slot.chord.exactMidiNotes] } : null })), undo: () => before.map((slot) => ({ ...slot, chord: slot.chord ? { ...slot.chord, exactMidiNotes: [...slot.chord.exactMidiNotes] } : null })) };
}
