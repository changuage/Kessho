import type { HarmonyProgression, HarmonySequenceStep, SharedHarmonyChordSlot } from './harmonyTypes';
import { analyzeTonalContext, type TonalContextCandidate } from './tonalContextAnalysis';
import type { HarmonyEvidenceEvent } from './harmonyEvidence';

const SCALE_NAMES: Readonly<Record<number, string>> = Object.freeze({
  1: 'Ionian',
  2: 'Aeolian',
  3: 'Major Pentatonic',
  4: 'Octatonic Half-Whole',
  5: 'Lydian',
  6: 'Mixolydian',
  7: 'Minor Pentatonic',
  8: 'Dorian',
  9: 'Harmonic Minor',
  10: 'Melodic Minor',
  11: 'Phrygian Dominant',
});

export interface HarmonyBankAnalysis {
  sourceContext: TonalContextCandidate | null;
  usageBySlot: Readonly<Record<number, number>>;
  progressionReferences: readonly HarmonySlotReference[];
  sequenceReferences: readonly HarmonySlotReference[];
}

export interface HarmonySlotReference {
  slotId: number;
  kind: 'progression' | 'sequence';
  id: string | number;
  index: number;
  weight: number;
}

export interface HarmonyBankAnalysisInput {
  slots?: readonly SharedHarmonyChordSlot[];
  progression?: HarmonyProgression | null;
  /** Endpoint-aware canonical progressions. All endpoints are inspected. */
  progressions?: ReadonlyArray<{ endpoint: 'active' | 'A' | 'B'; progression: HarmonyProgression | null }>;
  sequence?: readonly HarmonySequenceStep[] | null;
  /** Persisted Seq Play chord-choice references (lanes 1–4); disabled steps still count. */
  seqPlayChoices?: ReadonlyArray<{ lane: number | string; steps: readonly { id?: number | string; slotId?: number | null; chordSlotId?: number | null }[] }>;
  sourceContext?: TonalContextCandidate | null;
  engineContext?: { rootPitchClass: number; scaleId: number };
}

/** Enumerate every authored slot reference once, preserving stable order. */
export function enumerateHarmonySlotReferences(input: HarmonyBankAnalysisInput): HarmonySlotReference[] {
  const refs: HarmonySlotReference[] = [];
  const progressions = input.progressions?.length ? input.progressions : [{ endpoint: 'active' as const, progression: input.progression ?? null }];
  for (const { endpoint, progression } of progressions) for (const [index, event] of (progression?.events ?? []).entries()) {
    if (event.source.type === 'slot') refs.push({ slotId: event.source.slotId, kind: 'progression', id: `${endpoint}:${event.id}`, index, weight: event.duration.unit === 'phrase' ? event.duration.value * 1.1 : event.duration.value });
  }
  for (const [index, step] of (input.sequence ?? []).entries()) {
    if (step.slotId !== null && step.slotId !== undefined) refs.push({ slotId: step.slotId, kind: 'sequence', id: step.id, index, weight: Math.max(0, step.probability) });
  }
  for (const lane of input.seqPlayChoices ?? []) {
    for (const [index, step] of lane.steps.entries()) {
      const slotId = step.slotId ?? step.chordSlotId ?? null;
      if (slotId !== null && slotId !== undefined) refs.push({ slotId, kind: 'sequence', id: `${lane.lane}:${step.id ?? index}`, index, weight: 1 });
    }
  }
  return refs;
}

export function analyzeHarmonyBank(input: HarmonyBankAnalysisInput = {}): HarmonyBankAnalysis {
  const refs = enumerateHarmonySlotReferences(input);
  const usage: Record<number, number> = {};
  for (const ref of refs) usage[ref.slotId] = (usage[ref.slotId] ?? 0) + ref.weight;
  let sourceContext = input.sourceContext ?? null;
  if (!sourceContext) {
    const slotById = new Map((input.slots ?? []).map((slot) => [slot.id, slot] as const));
    const events: HarmonyEvidenceEvent[] = [];
    let strongestFallback: { rootPitchClass: number; weight: number } | null = null;
    for (const ref of refs) {
      const chord = slotById.get(ref.slotId)?.chord;
      const notes = chord?.exactMidiNotes;
      if (!chord || !notes?.length) continue;
      events.push({ kind: ref.kind === 'progression' ? 'progression' : 'seqTrigger', notes, strength: ref.weight, audible: true, id: String(ref.id) });
      const semanticRoot = chord.intent
        ? chord.intent.rootMode === 'degree'
          ? input.engineContext?.rootPitchClass ?? notes[0]!
          : chord.intent.rootNote
        : notes[0]!;
      if (!strongestFallback || ref.weight > strongestFallback.weight) {
        strongestFallback = { rootPitchClass: ((Math.round(semanticRoot) % 12) + 12) % 12, weight: ref.weight };
      }
    }
    if (events.length) {
      const analysis = analyzeTonalContext({ engine: input.engineContext ?? { rootPitchClass: 0, scaleId: 1 }, evidence: events, mode: 'playing', maxAlternatives: 4 });
      sourceContext = analysis.top;
      if (!sourceContext) {
        // The analyzer intentionally rejects one-shot evidence; bank source
        // inference still needs a bounded deterministic anchor for a lone
        // referenced slot, so use its weighted bass/root proxy as a low-
        // confidence candidate rather than pretending certainty.
        const rootPitchClass = strongestFallback?.rootPitchClass ?? input.engineContext?.rootPitchClass ?? 0;
        const scaleId = input.engineContext?.scaleId ?? 1;
        sourceContext = { rootPitchClass, scaleId, scaleName: SCALE_NAMES[scaleId] ?? `Scale ${scaleId}`, score: 0.2, confidence: 0.2, noteCoverage: 0.2, diatonicChordFit: 0.2, rootBassEvidence: 0.2, cadenceEvidence: 0, orderEvidence: 0, confirmedRecognition: 0 };
      }
    }
  }
  return { sourceContext, usageBySlot: usage, progressionReferences: refs.filter((ref) => ref.kind === 'progression'), sequenceReferences: refs.filter((ref) => ref.kind === 'sequence') };
}

export interface HarmonyReferenceState {
  slots: readonly SharedHarmonyChordSlot[];
  progression?: HarmonyProgression | null;
  progressions?: ReadonlyArray<{ endpoint: 'active' | 'A' | 'B'; progression: HarmonyProgression | null }>;
  sequence?: readonly HarmonySequenceStep[] | null;
  seqPlayChoices?: ReadonlyArray<{ lane: number | string; steps: readonly { id?: number | string; slotId?: number | null; chordSlotId?: number | null }[] }>;
}

export interface HarmonyReferencePatch {
  ok: boolean;
  error?: 'source-empty' | 'source-unreferenced' | 'source-locked' | 'invalid-target' | 'target-empty' | 'same-slot' | 'referenced';
  before?: HarmonyReferenceState;
  after?: HarmonyReferenceState;
  apply?: () => HarmonyReferenceState;
  undo?: () => HarmonyReferenceState;
}

/** Plan an atomic Manage Pool replacement. Validation completes before any copy. */
export function planReplaceHarmonySlotReferences(state: HarmonyReferenceState, sourceId: number, targetId: number): HarmonyReferencePatch {
  const source = state.slots.find((slot) => slot.id === sourceId);
  const target = state.slots.find((slot) => slot.id === targetId);
  if (!source || !target || sourceId === targetId) return { ok: false, error: sourceId === targetId ? 'same-slot' : 'invalid-target' };
  if (source.locked) return { ok: false, error: 'source-locked' };
  if (!source.chord) return { ok: false, error: 'source-empty' };
  if (!target.chord) return { ok: false, error: 'target-empty' };
  const references = enumerateHarmonySlotReferences({ progression: state.progression, progressions: state.progressions, sequence: state.sequence, seqPlayChoices: state.seqPlayChoices });
  if (!references.some((ref) => ref.slotId === sourceId)) return { ok: false, error: 'source-unreferenced' };
  const cloneChord = (chord: SharedHarmonyChordSlot['chord']) => chord ? { ...chord, intent: chord.intent ? { ...chord.intent, extensions: [...chord.intent.extensions], capturedMidiNotes: [...chord.intent.capturedMidiNotes] } : null, exactMidiNotes: [...chord.exactMidiNotes], recognitionCandidates: chord.recognitionCandidates?.map((candidate) => ({ ...candidate, intent: { ...candidate.intent, extensions: [...candidate.intent.extensions], capturedMidiNotes: [...candidate.intent.capturedMidiNotes] }, extensions: [...candidate.extensions], voicing: { ...candidate.voicing, doubledPitchClasses: [...candidate.voicing.doubledPitchClasses], omittedChordTones: [...candidate.voicing.omittedChordTones] } })) } : null;
  const clone: HarmonyReferenceState = {
    slots: state.slots.map((slot) => slot.id === sourceId ? { ...slot, chord: null } : { ...slot, chord: cloneChord(slot.chord) }),
    progression: state.progression ? { ...state.progression, events: state.progression.events.map((event) => event.source.type === 'slot' && event.source.slotId === sourceId ? { ...event, source: { type: 'slot', slotId: targetId } } : { ...event, source: { ...event.source } }) } : state.progression,
    progressions: state.progressions?.map(({ endpoint, progression }) => ({ endpoint, progression: progression ? { ...progression, events: progression.events.map((event) => event.source.type === 'slot' && event.source.slotId === sourceId ? { ...event, source: { type: 'slot', slotId: targetId } } : { ...event, source: { ...event.source } }) } : progression })),
    sequence: state.sequence ? state.sequence.map((step) => step.slotId === sourceId ? { ...step, slotId: targetId } : { ...step }) : state.sequence,
    seqPlayChoices: state.seqPlayChoices?.map((lane) => ({ lane: lane.lane, steps: lane.steps.map((step) => ({ ...step, ...(step.slotId === sourceId ? { slotId: targetId } : {}), ...(step.chordSlotId === sourceId ? { chordSlotId: targetId } : {}) })) })),
  };
  const deepState = (value: HarmonyReferenceState): HarmonyReferenceState => ({ slots: value.slots.map((slot) => ({ ...slot, chord: cloneChord(slot.chord) })), progression: value.progression ? { ...value.progression, events: value.progression.events.map((event) => ({ ...event, source: { ...event.source }, duration: { ...event.duration } })) } : value.progression, progressions: value.progressions?.map(({ endpoint, progression }) => ({ endpoint, progression: progression ? { ...progression, events: progression.events.map((event) => ({ ...event, source: { ...event.source }, duration: { ...event.duration } })) } : progression })), sequence: value.sequence?.map((step) => ({ ...step, intent: step.intent ? { ...step.intent, extensions: [...step.intent.extensions], capturedMidiNotes: [...step.intent.capturedMidiNotes] } : null })), seqPlayChoices: value.seqPlayChoices?.map((lane) => ({ lane: lane.lane, steps: lane.steps.map((step) => ({ ...step })) })) });
  const before = deepState(state);
  const after = deepState(clone);
  return { ok: true, before, after, apply: () => deepState(after), undo: () => deepState(before) };
}

export const replaceHarmonySlotReferences = planReplaceHarmonySlotReferences;

export function planEmptyUnusedHarmonySlot(state: HarmonyReferenceState, slotId: number): HarmonyReferencePatch {
  const source = state.slots.find((slot) => slot.id === slotId);
  if (!source) return { ok: false, error: 'invalid-target' };
  if (source.locked) return { ok: false, error: 'source-locked' };
  if (!source.chord) return { ok: false, error: 'source-empty' };
  const refs = enumerateHarmonySlotReferences({ progression: state.progression, progressions: state.progressions, sequence: state.sequence, seqPlayChoices: state.seqPlayChoices });
  if (refs.some((ref) => ref.slotId === slotId)) return { ok: false, error: 'referenced' };
  const cloneChord = (chord: SharedHarmonyChordSlot['chord']) => chord ? { ...chord, intent: chord.intent ? { ...chord.intent, extensions: [...chord.intent.extensions], capturedMidiNotes: [...chord.intent.capturedMidiNotes] } : null, exactMidiNotes: [...chord.exactMidiNotes] } : null;
  const copy = (value: HarmonyReferenceState): HarmonyReferenceState => ({
    slots: value.slots.map((item) => ({ ...item, chord: cloneChord(item.chord) })),
    progression: value.progression ? { ...value.progression, events: value.progression.events.map((event) => ({ ...event, source: { ...event.source }, duration: { ...event.duration } })) } : value.progression,
    progressions: value.progressions?.map(({ endpoint, progression }) => ({ endpoint, progression: progression ? { ...progression, events: progression.events.map((event) => ({ ...event, source: { ...event.source }, duration: { ...event.duration } })) } : progression })),
    sequence: value.sequence?.map((step) => ({ ...step, intent: step.intent ? { ...step.intent, extensions: [...step.intent.extensions], capturedMidiNotes: [...step.intent.capturedMidiNotes] } : null })),
    seqPlayChoices: value.seqPlayChoices?.map((lane) => ({ lane: lane.lane, steps: lane.steps.map((step) => ({ ...step })) })),
  });
  const before = copy(state);
  const after = copy({ ...state, slots: state.slots.map((slot) => slot.id === slotId ? { ...slot, chord: null } : slot) });
  return { ok: true, before, after, apply: () => copy(after), undo: () => copy(before) };
}
