import { calculateDriftedRoot } from '../harmony';
import {
  canonicalProgressionIndexAtPosition,
  resolveProductHarmonyState,
  type HarmonyChordSlot,
  type HarmonyDraftChord,
  type HarmonySequenceStep,
  type HarmonyProgression,
  type ResolvedHarmonyFrame,
} from '../CoreProductHarmonyControl';
import { productHarmonyScaleIdFromName } from '../coreProductHarmonyScaleIds';
import { createRng, getUtcBucket } from '../rng';
import { getScaleByName, selectScaleFamily } from '../scales';
import { createHarmonySuggestionEngine } from './chordSuggestionEngine';

const HARMONY_AUTO_SUGGESTION_ENGINE = createHarmonySuggestionEngine();

/** A bounded, read-only description of the material used while morphing endpoints. */
export interface MorphHarmonyPlan {
  endpointA: ResolvedHarmonyFrame;
  endpointB: ResolvedHarmonyFrame;
  commonToneVoicePairs: ReadonlyArray<readonly [number, number]>;
  /** Non-common voices are paired with minimum movement; these are not chromatic glides. */
  voiceLeadingPairs: ReadonlyArray<readonly [number, number]>;
  unmatchedA: readonly number[];
  unmatchedB: readonly number[];
  cofRootPath: readonly number[];
  scaleFamilyHandover: { from: number; to: number; at: number };
  owner: 'A' | 'B';
}

export interface HarmonyProgressionEvent {
  id: string;
  slotId: number | null;
  source: HarmonySequenceStep['mode'] | 'suggestion';
  durationBars: number;
  startBar: number;
  endBar: number;
}

export interface HarmonyLiveLayer {
  kind: 'draft-live' | 'harmony-takeover' | 'seq-live';
  scope?: unknown;
  target?: unknown;
  draft?: HarmonyDraftChord;
  frame?: ResolvedHarmonyFrame;
  seqId?: number;
  slotId?: number;
  latched?: boolean;
}

export interface HarmonyProjection {
  engine: {
    homeRootNote: number;
    effectiveRootNote: number;
    rootMidi: number;
    homeScaleName: string;
    homeScaleId: number;
    scaleId: number;
    scaleName: string;
    scaleMode: 'auto' | 'manual';
    morphLocked: boolean;
  };
  activeFrame: ResolvedHarmonyFrame;
  underlyingFrame: ResolvedHarmonyFrame;
  manualControl: ReturnType<typeof resolveProductHarmonyState>['manualControl'];
  chordSequence: HarmonySequenceStep[];
  chordSequenceEnabled: boolean;
  chordSequenceLength: number;
  chordSequenceStepIndex: number;
  tension: number;
  slots: HarmonyChordSlot[];
  progression: HarmonyProgressionEvent[];
  canonicalProgression: HarmonyProgression;
  position: {
    eventIndex: number;
    eventId: string | null;
    barInEvent: number;
    phraseIndex: number;
    /** Absolute transport bar used for canonical event-boundary consumers. */
    absoluteBarIndex: number | null;
  };
  liveLayer: HarmonyLiveLayer | null;
  activeLiveInputScope: unknown | null;
  morphPlan: MorphHarmonyPlan;
  /** Endpoint ownership is intentionally exposed separately from the bank. */
  bank: 'A' | 'B';
  isEndpoint: boolean;
}

export interface HarmonyProjectionRuntimeOverlay {
  harmonyState?: {
    effectiveRoot?: number;
    effectiveRootMidiAnchor?: number;
    scaleFamily?: { name?: string };
    currentDegree?: number;
    currentChord?: { midiNotes?: number[] };
    progression?: { step?: number } | null;
  } | null;
  rootMidi?: number;
  rootMidiAnchor?: number;
  morphPercent?: number;
  barIndex?: number;
  phraseIndex?: number;
  liveLayer?: HarmonyLiveLayer | null;
  liveLayers?: readonly HarmonyLiveLayer[];
  activeLiveInputScope?: unknown | null;
}

const MORPH_PLAN_CACHE = new Map<string, MorphHarmonyPlan>();
const MORPH_PLAN_CACHE_LIMIT = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function integerValue(value: unknown, fallback: number): number {
  return Math.round(numberValue(value, fallback));
}

function pitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function rootMidiWithPitchClass(baseMidi: number, rootPitchClass: number): number {
  const base = clamp(Math.round(baseMidi), 0, 127);
  const candidate = Math.floor(base / 12) * 12 + pitchClass(rootPitchClass);
  return clamp(candidate > 127 ? candidate - 12 : candidate, 0, 127);
}

function stateRecord(state: Record<string, unknown> | object | undefined): Record<string, unknown> {
  return (state ?? {}) as Record<string, unknown>;
}

function morphPercentFromState(state: Record<string, unknown>, overlay?: HarmonyProjectionRuntimeOverlay): number {
  const explicit = numberValue(overlay?.morphPercent, Number.NaN);
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 100);
  const stateExplicit = numberValue(state.harmonyMorphPercent, Number.NaN);
  if (Number.isFinite(stateExplicit)) return clamp(stateExplicit, 0, 100);
  const phase = numberValue(state.journeyMorphPhase, Number.NaN);
  if (Number.isFinite(phase)) return clamp(phase * 100, 0, 100);
  return 0;
}

function scaleNameFromState(state: Record<string, unknown>, overlay?: HarmonyProjectionRuntimeOverlay, scaleId = 1, tension = 0.35): string {
  const overlayName = overlay?.harmonyState?.scaleFamily?.name;
  if (typeof overlayName === 'string' && overlayName.length > 0) return overlayName;
  if (state.scaleMode === 'manual' && typeof state.manualScale === 'string' && getScaleByName(state.manualScale)) return state.manualScale;
  const seedWindow = state.seedWindow === 'day' ? 'day' : 'hour';
  if (state.scaleMode !== 'manual') return selectScaleFamily(createRng(`${getUtcBucket(seedWindow)}|E_ROOT`), tension).name;
  const names: Record<number, string> = { 1: 'Major (Ionian)', 2: 'Aeolian', 3: 'Major Pentatonic', 4: 'Octatonic Half-Whole', 5: 'Lydian', 6: 'Mixolydian', 7: 'Minor Pentatonic', 8: 'Dorian', 9: 'Harmonic Minor', 10: 'Melodic Minor', 11: 'Phrygian Dominant' };
  return names[scaleId] ?? 'Major (Ionian)';
}

function sanitizeSlots(value: unknown): HarmonyChordSlot[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8) as HarmonyChordSlot[];
}

function progressionFrom(progression: HarmonyProgression, state: Record<string, unknown>): HarmonyProgressionEvent[] {
  const events: HarmonyProgressionEvent[] = [];
  let startBar = 0;
  const barsPerPhrase = clamp(numberValue(state.transportBarsPerPhrase, 4), 1, 16);
  for (let index = 0; index < progression.events.length && index < 64; index += 1) {
    const event = progression.events[index]!;
    const durationBars = event.duration.unit === 'phrase' ? event.duration.value * barsPerPhrase : event.duration.value;
    const slotId = event.source.type === 'slot' ? event.source.slotId : null;
    events.push({ id: event.id, slotId, source: event.source.type === 'auto' ? 'suggestion' : 'slot', durationBars, startBar, endBar: startBar + durationBars });
    startBar += durationBars;
  }
  return events;
}

function pairVoices(a: readonly number[], b: readonly number[]): { common: Array<readonly [number, number]>; movement: Array<readonly [number, number]>; unmatchedA: number[]; unmatchedB: number[] } {
  const used = new Set<number>();
  const common: Array<readonly [number, number]> = [];
  const movement: Array<readonly [number, number]> = [];
  const remainingA: number[] = [];
  // Keep exact/pitch-class common tones stable before considering voice leading.
  for (const noteA of a.slice(0, 8)) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < b.length && index < 8; index += 1) {
      if (used.has(index)) continue;
      const distance = Math.abs(noteA - b[index]!);
      const samePitchClass = pitchClass(noteA) === pitchClass(b[index]!);
      if (!samePitchClass) continue;
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    if (bestIndex < 0) remainingA.push(noteA);
    else { used.add(bestIndex); common.push([noteA, b[bestIndex]!]); }
  }
  const remainingB = b.slice(0, 8).filter((_, index) => !used.has(index));
  const movementCount = Math.min(remainingA.length, remainingB.length);
  // Exact bounded assignment (at most 8! states) keeps total movement minimal off the audio hot path.
  const rowsAreA = remainingA.length <= remainingB.length;
  const rows = rowsAreA ? remainingA : remainingB;
  const cols = rowsAreA ? remainingB : remainingA;
  const memo = new Map<string, { cost: number; picks: number[] }>();
  const assign = (row: number, mask: number): { cost: number; picks: number[] } => {
    if (row >= rows.length || row >= movementCount) return { cost: 0, picks: [] };
    const key = `${row}:${mask}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let best = { cost: Number.POSITIVE_INFINITY, picks: [] as number[] };
    for (let col = 0; col < cols.length; col += 1) {
      if ((mask & (1 << col)) !== 0) continue;
      const next = assign(row + 1, mask | (1 << col));
      const cost = Math.abs(rows[row]! - cols[col]!) + next.cost;
      if (cost < best.cost) best = { cost, picks: [col, ...next.picks] };
    }
    memo.set(key, best);
    return best;
  };
  const picks = assign(0, 0).picks;
  for (let row = 0; row < picks.length; row += 1) {
    const col = picks[row]!;
    movement.push(rowsAreA ? [rows[row]!, cols[col]!] : [cols[col]!, rows[row]!]);
  }
  const usedA = new Set(movement.map(([note]) => note));
  const usedB = new Set(movement.map(([, note]) => note));
  return { common, movement, unmatchedA: remainingA.filter((note) => !usedA.has(note)), unmatchedB: remainingB.filter((note) => !usedB.has(note)) };
}

function cofPath(aMidi: number, bMidi: number): number[] {
  const from = pitchClass(aMidi);
  const target = pitchClass(bMidi);
  if (from === target) return [aMidi];
  const walk = (direction: 1 | -1): number[] => {
    const result = [aMidi];
    let current = from;
    for (let i = 0; i < 12 && current !== target; i += 1) {
      current = pitchClass(current + direction * 7);
      result.push(rootMidiWithPitchClass(aMidi, current));
    }
    return result;
  };
  const clockwise = walk(1);
  const counterClockwise = walk(-1);
  return clockwise.length <= counterClockwise.length ? clockwise : counterClockwise;
}

function morphPlanKey(a: ResolvedHarmonyFrame, b: ResolvedHarmonyFrame): string {
  return [a.rootMidi, a.scaleId, a.degree, a.quality, a.currentNotePool.join(','), b.rootMidi, b.scaleId, b.degree, b.quality, b.currentNotePool.join(',')].join('|');
}

/** Resolve a bounded morph plan from already-resolved endpoint frames. The cache
 * keeps snapshot/audio projections from repeating the assignment work. */
export function resolveCachedMorphHarmonyPlan(a: ResolvedHarmonyFrame, b: ResolvedHarmonyFrame, owner: 'A' | 'B'): MorphHarmonyPlan {
  const key = morphPlanKey(a, b);
  const cached = MORPH_PLAN_CACHE.get(key);
  if (cached && cached.owner === owner) return cached;
  const voices = pairVoices(a.currentNotePool, b.currentNotePool);
  const plan: MorphHarmonyPlan = {
    endpointA: a,
    endpointB: b,
    commonToneVoicePairs: voices.common,
    voiceLeadingPairs: voices.movement,
    unmatchedA: voices.unmatchedA,
    unmatchedB: voices.unmatchedB,
    cofRootPath: cofPath(a.rootMidi, b.rootMidi),
    scaleFamilyHandover: { from: a.scaleId, to: b.scaleId, at: 0.5 },
    owner,
  };
  MORPH_PLAN_CACHE.set(key, plan);
  if (MORPH_PLAN_CACHE.size > MORPH_PLAN_CACHE_LIMIT) MORPH_PLAN_CACHE.delete(MORPH_PLAN_CACHE.keys().next().value!);
  return plan;
}

/** Resolve the one read-only Harmony view shared by Harmony, Synth, and Seq surfaces. */
export function resolveHarmonyProjection(
  state: Record<string, unknown> | object | undefined,
  runtimeOverlay?: HarmonyProjectionRuntimeOverlay,
): HarmonyProjection {
  const record = stateRecord(state);
  const homeRootNote = pitchClass(numberValue(record.rootNote, 0));
  const driftStep = integerValue(record.cofCurrentStep, 0);
  const driftedRoot = calculateDriftedRoot(homeRootNote, driftStep);
  const effectiveRootNote = runtimeOverlay?.harmonyState?.effectiveRoot == null ? driftedRoot : pitchClass(runtimeOverlay.harmonyState.effectiveRoot);
  const provisionalScaleId = productHarmonyScaleIdFromName(typeof record.manualScale === 'string' ? record.manualScale : 'Major (Ionian)');
  const scaleName = scaleNameFromState(record, runtimeOverlay, provisionalScaleId, clamp(numberValue(record.tension, 0.35), 0, 1));
  const scaleId = productHarmonyScaleIdFromName(scaleName);
  const homeScaleName = typeof record.manualScale === 'string' && record.manualScale.length > 0 ? record.manualScale : 'Major (Ionian)';
  const homeScaleId = productHarmonyScaleIdFromName(homeScaleName);
  const baseRootMidi = numberValue(runtimeOverlay?.rootMidi, numberValue(record.rootMidi, 60 + homeRootNote));
  const rootMidi = rootMidiWithPitchClass(baseRootMidi, effectiveRootNote);
  const rootMidiAnchor = numberValue(runtimeOverlay?.rootMidiAnchor, numberValue(runtimeOverlay?.harmonyState?.effectiveRootMidiAnchor, rootMidi));
  const tension = clamp(numberValue(record.tension, 0.35), 0, 1);
  const morphPercent = morphPercentFromState(record, runtimeOverlay);
  const seed = 0;
  const hasPositionContext = runtimeOverlay?.barIndex !== undefined || runtimeOverlay?.phraseIndex !== undefined;
  const hostStep = !hasPositionContext ? numberValue(runtimeOverlay?.harmonyState?.progression?.step, Number.NaN) : Number.NaN;
  const positionedRecord = Number.isFinite(hostStep)
    ? {
      ...record,
      harmonyProgression: record.harmonyProgression && typeof record.harmonyProgression === 'object'
        ? { ...(record.harmonyProgression as Record<string, unknown>), currentEventIndex: hostStep }
        : record.harmonyProgression,
      harmonyProgressionA: record.harmonyProgressionA && typeof record.harmonyProgressionA === 'object'
        ? { ...(record.harmonyProgressionA as Record<string, unknown>), currentEventIndex: hostStep }
        : record.harmonyProgressionA,
      harmonyProgressionB: record.harmonyProgressionB && typeof record.harmonyProgressionB === 'object'
        ? { ...(record.harmonyProgressionB as Record<string, unknown>), currentEventIndex: hostStep }
        : record.harmonyProgressionB,
    }
    : record;
  const runtime = resolveProductHarmonyState({ state: positionedRecord, rootMidi, rootMidiAnchor, scaleId, tension, seed, barIndex: runtimeOverlay?.barIndex, phraseIndex: runtimeOverlay?.phraseIndex, morphPercent });
  const endpointA = resolveProductHarmonyState({ state: record, rootMidi, rootMidiAnchor, scaleId, tension, seed, morphPercent: 0 }).resolvedHarmonyFrame;
  const endpointB = resolveProductHarmonyState({ state: record, rootMidi, rootMidiAnchor, scaleId, tension, seed, morphPercent: 100 }).resolvedHarmonyFrame;
  const bank: 'A' | 'B' = morphPercent >= 50 ? 'B' : 'A';
  const progression = progressionFrom(runtime.progression, record);
  const eventIndex = progression.length === 0 ? -1 : hasPositionContext
    ? canonicalProgressionIndexAtPosition(runtime.progression, {
      absoluteBarIndex: runtimeOverlay?.barIndex,
      phraseIndex: runtimeOverlay?.phraseIndex,
      barsPerPhrase: numberValue(record.transportBarsPerPhrase, 4),
    })
    : runtime.progression.currentEventIndex % progression.length;
  const activeEvent = eventIndex >= 0 ? progression[eventIndex] : undefined;
  const barsPerPhrase = numberValue(record.transportBarsPerPhrase, 4);
  const absoluteBar = hasPositionContext
    ? (runtimeOverlay?.barIndex !== undefined ? numberValue(runtimeOverlay.barIndex, 0) : numberValue(runtimeOverlay?.phraseIndex, 0) * barsPerPhrase)
    : 0;
  const cycleBars = progression.length > 0 ? progression[progression.length - 1]!.endBar : 0;
  const cycleBar = cycleBars > 0 ? ((absoluteBar % cycleBars) + cycleBars) % cycleBars : 0;
  const slots = sanitizeSlots(runtime.chordSlots);
  const isEndpoint = morphPercent <= 0 || morphPercent >= 100;
  // Morph owns the top of the stack in the midpoint: performance layers are read-only and hidden.
  const liveLayer = isEndpoint ? selectLiveLayer(runtimeOverlay) : null;
  const autoSuggestion = activeEvent?.source === 'suggestion'
    ? HARMONY_AUTO_SUGGESTION_ENGINE.bank({
      rootMidi,
      scaleId,
      tension,
      phrasePosition: eventIndex === 0 ? 'opening' : eventIndex === progression.length - 1 ? 'ending' : 'middle',
    }).find((candidate) => candidate !== null)
    : null;
  const suggestionFrame = autoSuggestion ? {
    ...runtime.resolvedHarmonyFrame,
    degree: autoSuggestion.intent.degree,
    quality: autoSuggestion.intent.quality,
    currentNotePool: [...autoSuggestion.exactMidiNotes],
    nextNotePool: [...autoSuggestion.exactMidiNotes],
  } : runtime.resolvedHarmonyFrame;
  const activeFrame = liveLayer?.frame ?? suggestionFrame;
  return {
    engine: { homeRootNote, effectiveRootNote, rootMidi, homeScaleName, homeScaleId, scaleId, scaleName, scaleMode: record.scaleMode === 'manual' ? 'manual' : 'auto', morphLocked: !runtime.resolvedHarmonyFrame.manualControlAvailable },
    activeFrame,
    underlyingFrame: suggestionFrame,
    manualControl: runtime.manualControl,
    chordSequence: runtime.chordSequence,
    chordSequenceEnabled: runtime.chordSequenceEnabled,
    chordSequenceLength: runtime.chordSequenceLength,
    chordSequenceStepIndex: runtime.chordSequenceStepIndex,
    tension,
    slots,
    progression,
    canonicalProgression: runtime.progression,
    position: { eventIndex, eventId: activeEvent ? String(activeEvent.id) : null, barInEvent: activeEvent && hasPositionContext ? Math.max(0, cycleBar - activeEvent.startBar) : 0, phraseIndex: integerValue(runtimeOverlay?.phraseIndex, 0), absoluteBarIndex: hasPositionContext ? Math.max(0, absoluteBar) : null },
    liveLayer,
    activeLiveInputScope: isEndpoint ? runtimeOverlay?.activeLiveInputScope ?? null : null,
    morphPlan: resolveCachedMorphHarmonyPlan(endpointA, endpointB, bank),
    bank,
    isEndpoint,
  };
}

/** Priority is explicit so a stale draft can never mask a system takeover. Morph locking is an edit gate (not a live layer), and therefore wins independently through engine.morphLocked. */
function selectLiveLayer(overlay?: HarmonyProjectionRuntimeOverlay): HarmonyLiveLayer | null {
  const layers = overlay?.liveLayers ?? (overlay?.liveLayer ? [overlay.liveLayer] : []);
  let selected: HarmonyLiveLayer | null = null;
  let selectedPriority = -1;
  for (const layer of layers) {
    const priority = layer.kind === 'harmony-takeover' ? 3 : layer.kind === 'seq-live' ? 2 : 1;
    if (priority > selectedPriority) { selected = layer; selectedPriority = priority; }
  }
  return selected;
}

export function clearHarmonyProjectionMorphPlanCache(): void {
  MORPH_PLAN_CACHE.clear();
}
