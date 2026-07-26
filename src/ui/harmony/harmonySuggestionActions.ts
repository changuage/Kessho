import { HARMONY_PROGRESSION_CAPACITY, type HarmonyChordSlot, type HarmonyIntent, type HarmonySequenceStep } from '../../audio/CoreProductHarmonyControl';
import type { HarmonyProgression, HarmonyProgressionEvent } from '../../audio/harmony/harmonyTypes';
import type { HarmonySuggestion } from '../../audio/harmony/chordSuggestionEngine';

/** Small immutable state used by the suggestion action dock. Keeping this
 * separate from React makes failed multi-field actions trivially atomic. */
export interface HarmonySuggestionActionState {
  slots: readonly HarmonyChordSlot[];
  progression?: HarmonyProgression | null;
  sequence?: readonly HarmonySequenceStep[] | null;
  seqPlayConfigs?: readonly HarmonySeqPlayConfig[] | null;
}

export interface HarmonySuggestionActionContext {
  rootMidi?: number;
  rootMidiAnchor?: number;
  scaleId?: number;
}

/** Minimal Seq 1–4 ProductPlayConfig chord-choice shape. */
export interface HarmonySeqPlayConfig {
  chord?: {
    choiceLength?: number;
    steps: readonly { slotId?: number | null; locked?: boolean }[];
  };
}

export interface HarmonySuggestionActionResult {
  ok: boolean;
  state: HarmonySuggestionActionState;
  slotId: number | null;
  error?: string;
}

const cloneIntent = (intent: HarmonyIntent): HarmonyIntent => ({
  ...intent,
  extensions: [...intent.extensions],
  alterations: intent.alterations ? [...intent.alterations] : [],
  capturedMidiNotes: [...intent.capturedMidiNotes],
});

function semanticKey(intent: HarmonyIntent | null | undefined): string {
  if (!intent) return '';
  return [intent.rootMode, intent.degree, intent.rootNote, intent.quality, [...intent.extensions].sort().join(','), [...(intent.alterations ?? [])].sort().join(','), intent.inversion, intent.spread, intent.octave, intent.bassMode, intent.bassNote].join('|');
}

function exactKey(notes: readonly number[]): string {
  return [...notes].map((note) => Math.round(note)).join(',');
}

function sameSuggestion(slot: HarmonyChordSlot, suggestion: HarmonySuggestion): boolean {
  const chord = slot.chord;
  return Boolean(chord
    && semanticKey(chord.intent ?? slot.intent) === semanticKey(suggestion.intent)
    && exactKey(chord.exactMidiNotes) === exactKey(suggestion.exactMidiNotes)
    && chord.playbackBehavior === (suggestion.playbackBehavior ?? (suggestion.intent.preserveCapturedVoicing ? 'exact' : 'auto')));
}

function suggestionPlaybackBehavior(suggestion: HarmonySuggestion): 'auto' | 'relative' | 'exact' {
  return suggestion.playbackBehavior ?? (suggestion.intent.preserveCapturedVoicing ? 'exact' : 'auto');
}

function saveChord(suggestion: HarmonySuggestion, context: HarmonySuggestionActionContext = {}): NonNullable<HarmonyChordSlot['chord']> {
  const intent = cloneIntent(suggestion.intent);
  return {
    intent,
    intentSource: 'confirmed',
    exactMidiNotes: [...suggestion.exactMidiNotes],
    recognizedLabel: suggestion.label,
    playbackBehavior: suggestionPlaybackBehavior(suggestion),
    capturedContext: { rootMidi: context.rootMidi ?? 60, rootMidiAnchor: context.rootMidiAnchor ?? context.rootMidi ?? 60, scaleId: context.scaleId ?? 1 },
    recognitionCandidates: undefined,
    recognitionMismatch: false,
    requiresSemanticSelection: false,
  };
}

function failure(state: HarmonySuggestionActionState, error: string): HarmonySuggestionActionResult {
  return { ok: false, state, slotId: null, error };
}

/** Save to an existing exact semantic/playback duplicate, otherwise the first
 * genuinely empty and unlocked slot. Existing populated slots are never
 * overwritten. */
export function saveHarmonySuggestion(state: HarmonySuggestionActionState, suggestion: HarmonySuggestion, context: HarmonySuggestionActionContext = {}): HarmonySuggestionActionResult {
  const duplicate = state.slots.find((slot) => sameSuggestion(slot, suggestion));
  if (duplicate) return { ok: true, state, slotId: duplicate.id };
  const target = state.slots.find((slot) => !slot.locked && slot.chord == null);
  if (!target) return failure(state, 'No empty Harmony slot is available');
  const slots = state.slots.map((slot) => slot.id === target.id ? { ...slot, intent: cloneIntent(suggestion.intent), chord: saveChord(suggestion, context) } : slot);
  return { ok: true, state: { ...state, slots }, slotId: target.id };
}

function eventWithSource(event: HarmonyProgressionEvent, slotId: number): HarmonyProgressionEvent {
  return { ...event, source: { type: 'slot', slotId } };
}

function insertProgressionEvent(progression: HarmonyProgression, afterIndex: number, slotId: number): HarmonyProgression | null {
  if (progression.events.length >= HARMONY_PROGRESSION_CAPACITY || afterIndex < 0 || afterIndex >= progression.events.length) return null;
  const source = progression.events[afterIndex]!;
  const id = `${source.id}-suggestion`;
  let uniqueId = id;
  let suffix = 2;
  while (progression.events.some((event) => event.id === uniqueId)) uniqueId = `${id}-${suffix++}`;
  const inserted: HarmonyProgressionEvent = { id: uniqueId, source: { type: 'slot', slotId }, duration: { unit: 'phrase', value: 1 } };
  const events = progression.events.slice();
  events.splice(afterIndex + 1, 0, inserted);
  return { ...progression, events, currentEventIndex: progression.currentEventIndex > afterIndex ? progression.currentEventIndex + 1 : progression.currentEventIndex };
}

export function replaceHarmonySuggestion(state: HarmonySuggestionActionState, suggestion: HarmonySuggestion, eventIndex: number, context?: HarmonySuggestionActionContext): HarmonySuggestionActionResult {
  if (!state.progression || !state.progression.events[eventIndex]) return failure(state, 'Harmony event not found');
  const saved = saveHarmonySuggestion(state, suggestion, context);
  if (!saved.ok || saved.slotId == null) return saved;
  const progression = { ...saved.state.progression!, events: saved.state.progression!.events.map((event, index) => index === eventIndex ? eventWithSource(event, saved.slotId!) : event) };
  return { ok: true, state: { ...saved.state, progression }, slotId: saved.slotId };
}

export function insertHarmonySuggestion(state: HarmonySuggestionActionState, suggestion: HarmonySuggestion, afterIndex: number, context?: HarmonySuggestionActionContext): HarmonySuggestionActionResult {
  if (!state.progression) return failure(state, 'Harmony progression is unavailable');
  const saved = saveHarmonySuggestion(state, suggestion, context);
  if (!saved.ok || saved.slotId == null) return saved;
  const progression = insertProgressionEvent(saved.state.progression!, afterIndex, saved.slotId);
  if (!progression) return failure(state, 'Cannot insert another Harmony event');
  return { ok: true, state: { ...saved.state, progression }, slotId: saved.slotId };
}

export function assignHarmonySuggestionToStep(state: HarmonySuggestionActionState, suggestion: HarmonySuggestion, stepIndex: number, context?: HarmonySuggestionActionContext): HarmonySuggestionActionResult {
  const sequence = state.sequence;
  const step = sequence?.[stepIndex];
  if (!sequence || !step) return failure(state, 'Sequencer step not found');
  if (step.locked) return failure(state, 'Sequencer step is locked');
  const saved = saveHarmonySuggestion(state, suggestion, context);
  if (!saved.ok || saved.slotId == null) return saved;
  const intent = cloneIntent(suggestion.intent);
  intent.source = 'sequence';
  const nextStep: HarmonySequenceStep = { ...step, mode: 'slot', slotId: saved.slotId, intent: null, degree: intent.degree, quality: intent.quality };
  const nextSequence = sequence.map((entry, index) => index === stepIndex ? nextStep : entry);
  return { ok: true, state: { ...saved.state, sequence: nextSequence }, slotId: saved.slotId };
}

export function assignHarmonySuggestionToPlayConfig(state: HarmonySuggestionActionState, suggestion: HarmonySuggestion, configIndex: number, stepIndex: number, context?: HarmonySuggestionActionContext): HarmonySuggestionActionResult {
  const configs = state.seqPlayConfigs;
  const config = configs?.[configIndex];
  const step = config?.chord?.steps[stepIndex];
  if (!configs || !config?.chord || !step) return failure(state, 'Sequencer chord-choice step not found');
  if (step.locked) return failure(state, 'Sequencer chord-choice step is locked');
  const saved = saveHarmonySuggestion(state, suggestion, context);
  if (!saved.ok || saved.slotId == null) return saved;
  const steps = config.chord.steps.map((entry, index) => index === stepIndex ? { ...entry, slotId: saved.slotId } : entry);
  const nextConfig: HarmonySeqPlayConfig = { ...config, chord: { ...config.chord, steps } };
  const nextConfigs = configs.map((entry, index) => index === configIndex ? nextConfig : entry);
  return { ok: true, state: { ...saved.state, seqPlayConfigs: nextConfigs }, slotId: saved.slotId };
}
