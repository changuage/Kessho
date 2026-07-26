import { defaultHarmonyIntent, formatHarmonyIntentChordLabel, resolveHarmonyIntentToNotePool } from '../CoreProductHarmonyControl';
import { HARMONY_SCALE_INTERVALS, DEFAULT_HARMONY_SCALE_INTERVALS } from './harmonyScaleIntervals';
import type { HarmonyChordExtension, HarmonyChordQuality, HarmonyIntent, HarmonyRootMode } from './harmonyTypes';
import { analyzeVoiceLeading } from './voiceLeadingScore';
import type { TonalContextAnalysis } from './tonalContextAnalysis';

export const HARMONY_SUGGESTION_TRIGGER_KEYS = Object.freeze(['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] as const);
export const HARMONY_SUGGESTION_POSITION_CATEGORIES = Object.freeze(['safe', 'safe', 'movement', 'movement', 'color', 'color', 'color', 'wildcard'] as const);
export type HarmonySuggestionTriggerKey = typeof HARMONY_SUGGESTION_TRIGGER_KEYS[number];
export type HarmonySuggestionCategory = 'safe' | 'movement' | 'color' | 'wildcard';

export interface HarmonySuggestion {
  id: string;
  category: HarmonySuggestionCategory;
  intent: HarmonyIntent;
  quality: HarmonyChordQuality;
  extensions: HarmonyChordExtension[];
  exactMidiNotes: number[];
  /** Playback policy is part of duplicate identity; suggestions default to Auto. */
  playbackBehavior?: 'auto' | 'relative' | 'exact';
  triggerKey: HarmonySuggestionTriggerKey;
  label: string;
  confidence: number;
  keyFit: number;
  voiceLeading: number;
  bassMotion: number;
  movement: number;
  color: number;
  commonToneCount: number;
  semitoneMotion: number;
  modeEffect: string | null;
  likelyTargets: string[];
  /** Filled by the phrase-aware pass when this is not the first event. */
  transitionScore?: number;
}

export type HarmonySuggestionBank = Array<HarmonySuggestion | null>;

export interface HarmonySuggestionInput {
  rootMidi?: number;
  scaleId?: number;
  tension?: number;
  currentDraft?: { intent?: HarmonyIntent | null; exactMidiNotes?: readonly number[]; recognizedLabel?: string } | null;
  previousChord?: readonly number[] | null;
  nextChord?: readonly number[] | null;
  recentChords?: readonly (readonly number[])[];
  recentTensions?: readonly number[];
  phrasePosition?: 'opening' | 'middle' | 'ending' | number;
  tonalContext?: TonalContextAnalysis | null;
  maxCandidates?: number;
  beamWidth?: number;
}

interface CandidateSeed { category: HarmonySuggestionCategory; degree: number; quality: HarmonyChordQuality; extensions?: HarmonyChordExtension[]; alterations?: HarmonyIntent['alterations']; modeEffect?: string | null; rootMode?: HarmonyRootMode; rootNote?: number; }

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const pc = (value: number) => ((Math.round(value) % 12) + 12) % 12;
const keyFitFor = (root: number, tonic: number, intervals: readonly number[]) => intervals.includes((pc(root) - pc(tonic) + 12) % 12) ? 1 : 0.42;

function rootForDegree(rootMidi: number, scaleId: number, degree: number): number {
  const intervals = HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  const safe = ((Math.round(degree) % intervals.length) + intervals.length) % intervals.length;
  return rootMidi + (intervals[safe] ?? 0);
}

function diatonicQuality(scaleId: number, degree: number, seventh = false): HarmonyChordQuality {
  const intervals = HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  // Pentatonic, octatonic, and other non-heptatonic scales do not have a
  // universally accepted tertian stack; keep them consonant and let color
  // suggestions carry the ambiguity explicitly.
  if (intervals.length !== 7) return seventh ? 'min7' : 'maj';
  const root = intervals[((degree % 7) + 7) % 7] ?? 0;
  const third = intervals[((degree + 2) % 7 + 7) % 7] ?? root;
  const fifth = intervals[((degree + 4) % 7 + 7) % 7] ?? root;
  const thirdDistance = (third - root + 12) % 12;
  const fifthDistance = (fifth - root + 12) % 12;
  if (thirdDistance === 3 && fifthDistance === 6) return 'dim';
  if (thirdDistance === 3 && fifthDistance === 7) {
    if (!seventh) return 'min';
    const seventhNote = intervals[((degree + 6) % 7 + 7) % 7] ?? root;
    return (seventhNote - root + 12) % 12 === 11 ? 'maj7' : 'min7';
  }
  if (thirdDistance === 4 && fifthDistance === 7) {
    if (!seventh) return 'maj';
    const seventhNote = intervals[((degree + 6) % 7 + 7) % 7] ?? root;
    return (seventhNote - root + 12) % 12 === 10 ? 'dom7' : 'maj7';
  }
  return 'sus';
}

function seedList(tension: number, scaleId: number, tonic: number): CandidateSeed[] {
  const safe: CandidateSeed[] = [
    { category: 'safe', degree: 0, quality: diatonicQuality(scaleId, 0) }, { category: 'safe', degree: 3, quality: diatonicQuality(scaleId, 3) },
    { category: 'safe', degree: 4, quality: diatonicQuality(scaleId, 4) }, { category: 'safe', degree: 5, quality: diatonicQuality(scaleId, 5, true) },
  ];
  const movement: CandidateSeed[] = [
    { category: 'movement', degree: 1, quality: diatonicQuality(scaleId, 1) }, { category: 'movement', degree: 2, quality: diatonicQuality(scaleId, 2, true) },
    { category: 'movement', degree: 4, quality: diatonicQuality(scaleId, 4, true) }, { category: 'movement', degree: 5, quality: diatonicQuality(scaleId, 5, true) },
  ];
  const color: CandidateSeed[] = tension >= 0.18 ? [
    { category: 'color', degree: 0, quality: 'maj7', extensions: ['9'] },
    { category: 'color', degree: 1, quality: 'min7', extensions: ['9'] },
    { category: 'color', degree: 2, quality: 'sus', extensions: ['9'], modeEffect: 'modal color' },
    { category: 'color', degree: 5, quality: 'dom7', extensions: ['11'], alterations: ['#11'], modeEffect: 'Lydian color' },
    ...(tension >= 0.4 ? [
      { category: 'color' as const, degree: 0, quality: 'maj' as const, rootMode: 'absolute' as const, rootNote: pc(tonic + 1), modeEffect: 'chromatic mediant' },
      { category: 'color' as const, degree: 0, quality: 'min' as const, rootMode: 'absolute' as const, rootNote: pc(tonic + 10), modeEffect: 'borrowed modal' },
    ] : []),
  ] : [];
  return [...safe, ...movement, ...color, { category: 'wildcard', degree: 4, quality: 'dom7', extensions: [], modeEffect: 'pivot / resolution' }];
}

function phrasePosition(value: HarmonySuggestionInput['phrasePosition']): 'opening' | 'middle' | 'ending' {
  if (value === 'opening' || value === 'ending' || value === 'middle') return value;
  if (typeof value === 'number') return value <= 0.25 ? 'opening' : value >= 0.75 ? 'ending' : 'middle';
  return 'middle';
}

function seedIntent(seed: CandidateSeed, current: HarmonyIntent | null): HarmonyIntent {
  const base = defaultHarmonyIntent('manualControl', seed.degree);
  return {
    ...base,
    source: 'audition', strength: 'bias', rootMode: seed.rootMode ?? 'degree', rootNote: seed.rootNote ?? 0,
    degree: seed.degree, quality: seed.quality, extensions: [...(seed.extensions ?? [])],
    alterations: [...(seed.alterations ?? [])], spread: current?.spread ?? 0.35, octave: current?.octave ?? 4,
    bassMode: 'root', bassNote: null, capturedMidiNotes: [], preserveCapturedVoicing: false,
  };
}

function metricFor(seed: CandidateSeed, intent: HarmonyIntent, notes: number[], input: Required<Pick<HarmonySuggestionInput, 'rootMidi' | 'scaleId' | 'tension'>>, currentNotes: readonly number[], tonic: number): HarmonySuggestion {
  const intervals = HARMONY_SCALE_INTERVALS[input.scaleId] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
  const root = seed.rootMode === 'absolute' ? seed.rootNote ?? 0 : rootForDegree(input.rootMidi, input.scaleId, seed.degree);
  const keyFit = keyFitFor(root, tonic, intervals);
  const leading = analyzeVoiceLeading(currentNotes, notes);
  const color = clamp((seed.category === 'color' ? 0.52 : seed.category === 'wildcard' ? 0.78 : seed.category === 'movement' ? 0.3 : 0.08) + (intent.extensions.length * 0.06));
  const movement = clamp((1 - leading.voiceLeading) * 0.7 + (seed.category === 'movement' ? 0.28 : seed.category === 'wildcard' ? 0.42 : 0.05));
  const confidence = clamp(keyFit * 0.42 + leading.score * 0.38 + (1 - color) * 0.1 + (1 - input.tension) * (seed.category === 'safe' ? 0.1 : 0));
  const label = formatHarmonyIntentChordLabel(intent, { rootMidi: input.rootMidi, scaleId: input.scaleId });
  const targets = seed.category === 'color' || seed.category === 'wildcard'
    ? [formatHarmonyIntentChordLabel({ ...defaultHarmonyIntent('audition', 0), quality: 'maj', bassMode: 'root' }, { rootMidi: input.rootMidi, scaleId: input.scaleId })]
    : [];
  return {
    id: `${seed.category}-${seed.degree}-${intent.quality}-${intent.extensions.join('.')}`, category: seed.category, intent, quality: intent.quality, extensions: intent.extensions as HarmonyChordExtension[], exactMidiNotes: notes, playbackBehavior: 'auto',
    triggerKey: 'Z', label, confidence, keyFit, voiceLeading: leading.voiceLeading, bassMotion: leading.bassMotion,
    movement, color, commonToneCount: leading.commonToneCount, semitoneMotion: leading.semitoneMotion,
    modeEffect: seed.modeEffect ?? null, likelyTargets: targets,
  };
}

export function rerankHarmonySuggestions(candidates: HarmonySuggestion[], input: HarmonySuggestionInput): HarmonySuggestion[] {
  const position = phrasePosition(input.phrasePosition);
  const previous = input.previousChord ?? input.currentDraft?.exactMidiNotes ?? [];
  const recent = input.recentChords ?? [];
  const tension = clamp(input.tension ?? 0.35);
  const priorColor = (input.recentTensions && input.recentTensions.length > 0 ? input.recentTensions[input.recentTensions.length - 1] : undefined) ?? (input.currentDraft?.intent ? clamp((input.currentDraft.intent.extensions.length * 0.12) + (['cluster', 'quartal', 'dom7'].includes(input.currentDraft.intent.quality) ? 0.28 : 0)) : 0);
  const recentHighTension = (input.recentTensions?.some((value) => value > 0.65) ?? false) || recent.some((chord) => chord.length >= 6 || analyzeVoiceLeading([], chord).dissonance > 0.15);
  const pairCache = new Map<string, number>();
  const pairKey = (from: readonly number[], to: readonly number[]) => `${from.join(',')}->${to.join(',')}`;
  const pairScore = (from: readonly number[], to: readonly number[]) => {
    const key = pairKey(from, to);
    const cached = pairCache.get(key);
    if (cached !== undefined) return cached;
    const score = analyzeVoiceLeading(from, to).score;
    pairCache.set(key, score);
    return score;
  };
  const scored = candidates.map((candidate) => {
    const repetition = recent.some((chord) => chord.length === candidate.exactMidiNotes.length && chord.every((note, index) => note === candidate.exactMidiNotes[index])) ? 0.2 : 0;
    const phrase = position === 'opening' ? (candidate.category === 'safe' ? 0.17 : -candidate.color * 0.1) : position === 'ending' ? (candidate.category === 'safe' || candidate.category === 'wildcard' ? 0.14 : -candidate.color * 0.08) : candidate.movement * 0.08;
    const tensionFit = 1 - Math.abs(tension - candidate.color) * 0.45;
    const consecutiveHighPenalty = recentHighTension && candidate.color > 0.62 ? 0.16 : 0;
    const contour = position === 'ending'
      ? (candidate.color < priorColor ? 0.16 : -0.08)
      : position === 'opening' && candidate.color <= priorColor + 0.1 ? 0.06 : 0;
    const transition = pairScore(previous, candidate.exactMidiNotes);
    const nextTransition = input.nextChord ? pairScore(candidate.exactMidiNotes, input.nextChord) : 0.5;
    const score = candidate.keyFit * 0.26 + transition * 0.28 + candidate.voiceLeading * 0.15 + candidate.bassMotion * 0.08 + (1 - candidate.color) * 0.08 + tensionFit * 0.08 + nextTransition * 0.04 + phrase + contour - repetition - consecutiveHighPenalty;
    return { candidate: { ...candidate, transitionScore: transition }, score };
  });
  scored.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  // Fixed-width second pass: explore only the best local beam and retain the
  // best continuation for each candidate. Pair scores are cached above, which
  // keeps the bounded search predictable as color candidates grow.
  const width = Math.max(1, Math.min(4, Math.round(input.beamWidth ?? 3)));
  const beam = scored.slice(0, width);
  const continuation = new Map<string, number>();
  for (const first of beam) {
    let best = 0;
    for (const second of scored.slice(0, width + 2)) {
      if (second.candidate.id === first.candidate.id) continue;
      const pair = pairScore(first.candidate.exactMidiNotes, second.candidate.exactMidiNotes);
      const highPenalty = first.candidate.color > 0.62 && second.candidate.color > 0.62 ? 0.2 : 0;
      const endingContour = position === 'ending' && second.candidate.color < first.candidate.color ? 0.14 : 0;
      best = Math.max(best, pair + endingContour - highPenalty);
    }
    continuation.set(first.candidate.id, best);
  }
  return scored
    .map(({ candidate, score }) => ({ candidate: { ...candidate }, score: score + (continuation.get(candidate.id) ?? 0) * (position === 'ending' ? 0.12 : 0.07) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .map(({ candidate }) => candidate);
}

const rerank = rerankHarmonySuggestions;

/** Generate a deterministic, bounded bank. This function does no I/O and is safe
 * to call from UI/controller code; audio scheduling should consume its result. */
export function generateHarmonySuggestionBank(input: HarmonySuggestionInput = {}): HarmonySuggestionBank {
  const rootMidi = Math.round(input.rootMidi ?? 60);
  const scaleId = Math.round(input.scaleId ?? 1);
  const tension = clamp(input.tension ?? 0.35);
  const current = input.currentDraft?.intent ?? null;
  const currentNotes = input.currentDraft?.exactMidiNotes ?? [];
  const tonic = input.tonalContext?.top?.rootPitchClass ?? pc(rootMidi);
  const args = { rootMidi, scaleId, tension } as const;
  const unique = new Map<string, HarmonySuggestion>();
  for (const seed of seedList(tension, scaleId, tonic)) {
    const intent = seedIntent(seed, current);
    const notes = resolveHarmonyIntentToNotePool({ intent, rootMidi, scaleId, tension });
    const suggestion = metricFor(seed, intent, notes, args, currentNotes, tonic);
    const key = `${suggestion.category}|${notes.join(',')}|${intent.quality}|${intent.degree}`;
    if (!unique.has(key)) unique.set(key, suggestion);
  }
  const ranked = rerank([...unique.values()], input);
  const bank: HarmonySuggestionBank = Array.from({ length: 8 }, () => null);
  const used = new Set<string>();
  const limit = Math.max(1, Math.min(8, input.maxCandidates ?? 8));
  for (let index = 0; index < limit && index < 8; index += 1) {
    const triggerKey = HARMONY_SUGGESTION_TRIGGER_KEYS[index]!;
    const category = HARMONY_SUGGESTION_POSITION_CATEGORIES[index]!;
    const candidate = ranked.find((item) => item.category === category && !used.has(item.id));
    if (!candidate) continue;
    used.add(candidate.id);
    bank[index] = { ...candidate, id: `harmony-suggestion-${triggerKey.toLowerCase()}`, triggerKey };
  }
  return bank;
}

export function generateHarmonySuggestions(input: HarmonySuggestionInput = {}): HarmonySuggestion[] {
  return generateHarmonySuggestionBank(input).filter((suggestion): suggestion is HarmonySuggestion => suggestion !== null);
}

export const suggestHarmonyChords = generateHarmonySuggestions;

/** Freeze a bank's physical mapping. Reordering or reranking later must not move
 * a held key to a different chord. Empty pads remain empty. */
export function freezeSuggestionBank(bank: readonly (HarmonySuggestion | null)[]): HarmonySuggestionBank {
  const frozen: HarmonySuggestionBank = Array.from({ length: 8 }, () => null);
  for (let index = 0; index < 8; index += 1) {
    const suggestion = bank[index];
    if (!suggestion) continue;
    frozen[index] = { ...suggestion, triggerKey: HARMONY_SUGGESTION_TRIGGER_KEYS[index]!, exactMidiNotes: [...suggestion.exactMidiNotes], likelyTargets: [...suggestion.likelyTargets], extensions: [...suggestion.extensions] };
  }
  return frozen;
}

export const freezeHarmonySuggestionBank = freezeSuggestionBank;

/** Hold-state controller for preview keys. A rerank may arrive while one or
 * more suggestions are sounding, but the physical map cannot change until all
 * held keys release. */
export function createSuggestionBankLatch(initial: readonly (HarmonySuggestion | null)[] = []) {
  let active = freezeSuggestionBank(initial);
  let pending: HarmonySuggestionBank | null = null;
  const held = new Set<HarmonySuggestionTriggerKey>();
  const snapshot = (): HarmonySuggestionBank => active.map((item) => item ? { ...item, exactMidiNotes: [...item.exactMidiNotes], likelyTargets: [...item.likelyTargets], extensions: [...item.extensions] } : null);
  return {
    update(next: readonly (HarmonySuggestion | null)[]): HarmonySuggestionBank {
      const frozen = freezeSuggestionBank(next);
      if (held.size > 0) pending = frozen;
      else active = frozen;
      return snapshot();
    },
    press(key: HarmonySuggestionTriggerKey): HarmonySuggestion | null {
      held.add(key);
      return active[HARMONY_SUGGESTION_TRIGGER_KEYS.indexOf(key)] ?? null;
    },
    release(key: HarmonySuggestionTriggerKey): HarmonySuggestionBank {
      held.delete(key);
      if (held.size === 0 && pending) { active = pending; pending = null; }
      return snapshot();
    },
    current(): HarmonySuggestionBank { return snapshot(); },
    heldKeys(): HarmonySuggestionTriggerKey[] { return [...held]; },
  };
}

export interface HarmonyPitchAxis { min: number; max: number; }

/** One comparable pitch axis for suggestions and nearby progression events. */
export function sharedHarmonyPitchAxis(banks: readonly (readonly (HarmonySuggestion | null)[])[], nearbyNotes: readonly (readonly number[])[] = []): HarmonyPitchAxis {
  const notes: number[] = [];
  for (const bank of banks) for (const suggestion of bank) for (const note of suggestion?.exactMidiNotes ?? []) if (Number.isFinite(note)) notes.push(Math.round(note));
  for (const chord of nearbyNotes) for (const note of chord) if (Number.isFinite(note)) notes.push(Math.round(note));
  if (notes.length === 0) return { min: 48, max: 84 };
  const min = Math.min(...notes);
  const max = Math.max(...notes);
  const span = Math.max(12, max - min);
  return { min: Math.floor(min / 12) * 12, max: Math.ceil((min + span) / 12) * 12 };
}

export const harmonySuggestionPitchAxis = sharedHarmonyPitchAxis;

function suggestionFingerprint(input: HarmonySuggestionInput): string {
  const draft = input.currentDraft;
  const intent = draft?.intent;
  const intentKey = intent ? [intent.rootMode, intent.degree, intent.rootNote, intent.quality, intent.extensions.join('.'), (intent.alterations ?? []).join('.'), intent.inversion, intent.spread].join(':') : '';
  const notes = (draft?.exactMidiNotes ?? []).join(',');
  const list = (input.recentChords ?? []).map((chord) => chord.join(',')).join(';');
  const tonal = input.tonalContext?.top ? `${input.tonalContext.top.rootPitchClass}:${input.tonalContext.top.scaleId}:${Math.round(input.tonalContext.top.confidence * 100)}` : '';
  return [Math.round(input.rootMidi ?? 60), Math.round(input.scaleId ?? 1), Math.round((input.tension ?? 0.35) * 100), input.phrasePosition ?? 'middle', input.maxCandidates ?? 8, input.beamWidth ?? 3, intentKey, notes, (input.previousChord ?? []).join(','), (input.nextChord ?? []).join(','), list, tonal].join('|');
}

/** Tiny bounded memoized engine wrapper. */
export function createHarmonySuggestionEngine() {
  const cache = new Map<string, HarmonySuggestionBank>();
  const calculate = (input: HarmonySuggestionInput): HarmonySuggestionBank => freezeSuggestionBank(generateHarmonySuggestionBank(input));
  const getBank = (input: HarmonySuggestionInput): HarmonySuggestionBank => {
    const key = suggestionFingerprint(input);
    const cached = cache.get(key);
    if (cached) return cached;
    const bank = calculate(input);
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    cache.set(key, bank);
    return bank;
  };
  return {
    suggest(input: HarmonySuggestionInput = {}): HarmonySuggestion[] {
      return getBank(input).filter((item): item is HarmonySuggestion => item !== null).map((item) => ({ ...item, exactMidiNotes: [...item.exactMidiNotes] }));
    },
    bank(input: HarmonySuggestionInput = {}): HarmonySuggestionBank {
      return getBank(input).map((item) => item ? { ...item, exactMidiNotes: [...item.exactMidiNotes], likelyTargets: [...item.likelyTargets], extensions: [...item.extensions] } : null);
    },
    clear(): void { cache.clear(); },
  };
}

export type HarmonySuggestionEngine = ReturnType<typeof createHarmonySuggestionEngine>;
