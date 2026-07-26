import type {
  HarmonyChordQuality,
  HarmonyControlSource,
  HarmonyIntent,
  HarmonyRecognitionCandidate,
} from './harmonyTypes';
import { HARMONY_CHORD_RECIPES, recipePitchClasses, type HarmonyChordRecipe } from './chordRecipes';
import { analyzeChordVoicing } from './chordVoicingAnalysis';
import { DEFAULT_HARMONY_SCALE_INTERVALS, HARMONY_SCALE_INTERVALS } from './harmonyScaleIntervals';

const ROOT_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const HARMONY_RECOGNITION_MIN_CONFIDENCE = 0.78;
export const HARMONY_RECOGNITION_MIN_MARGIN = 0.08;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pc = (value: number) => ((Math.round(value) % 12) + 12) % 12;

export interface HarmonyRecognitionEngineContext {
  rootPitchClass?: number;
  quality?: HarmonyChordQuality;
  degree?: number;
}

export interface HarmonyRecognitionArgs {
  midiNotes: readonly number[];
  previousIntent?: HarmonyIntent | null;
  rootMidi?: number;
  scaleId?: number;
  tension?: number;
  engineContext?: HarmonyRecognitionEngineContext;
  maxCandidates?: number;
}

/** A Custom exact capture cannot invent Relative/Auto semantics. */
export function harmonyRequiresSemanticSelection(value: { intent: HarmonyIntent | null; playbackBehavior: 'auto' | 'relative' | 'exact' }): boolean {
  return value.intent === null && value.playbackBehavior !== 'exact';
}

export function uniqueHarmonyRecognitionCandidate(candidates: readonly HarmonyRecognitionCandidate[]): HarmonyRecognitionCandidate | null {
  const top = candidates[0];
  if (!top || top.confidence < HARMONY_RECOGNITION_MIN_CONFIDENCE) return null;
  if (candidates[1] && top.confidence - candidates[1].confidence < HARMONY_RECOGNITION_MIN_MARGIN) return null;
  return top;
}

function rootModeFor(previous: HarmonyIntent | null, rootPitchClass: number, rootMidi: number, scaleId: number): { rootMode: HarmonyIntent['rootMode']; degree: number } {
  if (previous?.rootMode === 'captured') return { rootMode: 'absolute', degree: previous.degree };
  if (previous?.rootMode === 'degree' || !previous) {
    const root = pc(rootMidi);
    const intervals = HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
    const degree = intervals.findIndex((interval) => pc(root + interval) === rootPitchClass);
    if (degree >= 0) return { rootMode: 'degree', degree };
  }
  return { rootMode: 'absolute', degree: previous?.degree ?? 0 };
}

function labelFor(rootPitchClass: number, recipe: HarmonyChordRecipe): string {
  const root = ROOT_LABELS[pc(rootPitchClass)] ?? 'C';
  const suffix: Record<string, string> = {
    maj: '', min: 'm', dim: 'dim', sus: 'sus', maj7: 'maj7', min7: 'm7', dom7: '7',
    add9: 'add9', six: '6', sixNine: '6/9', nine: '9', quartal: 'quartal', cluster: 'cluster',
  };
  let quality = suffix[recipe.quality] ?? recipe.quality;
  if (recipe.quality === 'maj7' && recipe.extensions.includes('9')) quality = 'maj9';
  else if (recipe.quality === 'min7' && recipe.extensions.includes('9')) quality = 'm9';
  else if (recipe.quality === 'dom7' && recipe.extensions.includes('13')) quality = '13';
  const alteration = recipe.alterations.join('');
  return `${root}${quality}${alteration}`;
}

function labelWithBass(rootPitchClass: number, recipe: HarmonyChordRecipe, bassMidi: number, expected: readonly number[]): string {
  const label = labelFor(rootPitchClass, recipe);
  const bassPitchClass = pc(bassMidi);
  if (bassMidi === 0 || bassPitchClass === pc(rootPitchClass) || !expected.includes(bassPitchClass)) return label;
  return `${label}/${ROOT_LABELS[bassPitchClass] ?? 'C'}`;
}

function contextScoreFor(rootPitchClass: number, recipe: HarmonyChordRecipe, args: HarmonyRecognitionArgs): number {
  let score = 0;
  const previous = args.previousIntent;
  if (previous) {
    const previousRoot = previous.rootMode === 'degree'
      ? (() => {
        const intervals = HARMONY_SCALE_INTERVALS[Math.round(args.scaleId ?? 1)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
        return pc((args.rootMidi ?? 60) + (intervals[previous.degree % intervals.length] ?? 0));
      })()
      : pc(previous.rootNote);
    if (previousRoot === rootPitchClass) score += 0.55;
    if (previous.quality === recipe.quality) score += 0.30;
  }
  const engine = args.engineContext;
  if (engine?.rootPitchClass !== undefined && pc(engine.rootPitchClass) === rootPitchClass) score += 0.10;
  if (engine?.quality !== undefined && engine.quality === recipe.quality) score += 0.05;
  return clamp(score, 0, 1);
}

function candidateIntent(args: HarmonyRecognitionArgs, rootPitchClass: number, recipe: HarmonyChordRecipe): HarmonyIntent {
  const previous = args.previousIntent;
  const root = rootModeFor(previous ?? null, rootPitchClass, args.rootMidi ?? 60, args.scaleId ?? 1);
  return {
    ...(previous ?? {
      source: 'slot' as HarmonyControlSource,
      strength: 'bias' as const,
      rootMode: 'absolute' as const,
      degree: 0,
      rootNote: 0,
      quality: 'auto' as const,
      extensions: [],
      inversion: 0,
      spread: 0.5,
      octave: 4,
      bassMode: 'off' as const,
      bassNote: null,
      capturedMidiNotes: [],
      preserveCapturedVoicing: false,
    }),
    rootMode: root.rootMode,
    degree: root.degree,
    rootNote: rootPitchClass,
    quality: recipe.quality,
    extensions: [...recipe.extensions],
    alterations: [...recipe.alterations],
    inversion: 0,
    bassMode: 'off',
    bassNote: null,
    capturedMidiNotes: [],
    preserveCapturedVoicing: false,
  };
}

/** Return ranked semantic candidates; exact MIDI notes are never normalized or changed. */
export function recognizeHarmonyCandidates(args: HarmonyRecognitionArgs): HarmonyRecognitionCandidate[] {
  const notes = args.midiNotes.filter(Number.isFinite).map((note) => Math.round(note));
  if (notes.length === 0) return [];
  const input = new Set(notes.map(pc));
  const candidates: HarmonyRecognitionCandidate[] = [];
  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
    for (let recipeIndex = 0; recipeIndex < HARMONY_CHORD_RECIPES.length; recipeIndex += 1) {
      const recipe = HARMONY_CHORD_RECIPES[recipeIndex]!;
      const expected = recipePitchClasses(recipe, rootPitchClass);
      let extras = 0;
      for (const pitchClass of input) if (!expected.includes(pitchClass)) extras += 1;
      // Fifth omissions are common; other omissions remain possible but rank lower.
      const missingPenalty = expected.filter((pitchClass) => !input.has(pitchClass)).reduce((sum, pitchClass) => {
        const interval = (pitchClass - rootPitchClass + 12) % 12;
        return sum + (interval === 7 ? 0.08 : 0.25);
      }, 0);
      const pitchClassScore = clamp(1 - missingPenalty - extras * 0.30, 0, 1);
      if (pitchClassScore < 0.34) continue;
      const contextScore = contextScoreFor(rootPitchClass, recipe, args);
      const voicing = analyzeChordVoicing(notes, rootPitchClass, recipe.intervals);
      const bassPenalty = voicing.bassMidi !== 0 && !expected.includes(pc(voicing.bassMidi)) ? 0.08 : 0;
      const confidence = clamp(0.78 * pitchClassScore + 0.20 * contextScore + 0.02 * (1 - bassPenalty), 0, 1);
      const intent = candidateIntent(args, rootPitchClass, recipe);
      intent.inversion = voicing.inversion;
      if (voicing.inversion > 0) {
        intent.bassMode = 'captured';
        intent.bassNote = voicing.bassMidi;
      }
      candidates.push({
        intent,
        label: labelWithBass(rootPitchClass, recipe, voicing.bassMidi, expected),
        quality: recipe.quality,
        extensions: [...recipe.extensions],
        confidence,
        pitchClassScore,
        contextScore,
        voicing,
      });
    }
  }
  candidates.sort((left, right) => {
    const confidence = right.confidence - left.confidence;
    if (Math.abs(confidence) > 1e-6) return confidence;
    const context = right.contextScore - left.contextScore;
    if (Math.abs(context) > 1e-6) return context;
    return left.label.localeCompare(right.label);
  });
  const limit = Math.max(1, Math.min(8, Math.round(args.maxCandidates ?? 5)));
  return candidates.slice(0, limit);
}

/** Compatibility helper for old callers that need one inferred intent. */
export function recognizeHarmonyIntentFromCandidates(args: HarmonyRecognitionArgs): HarmonyIntent {
  const candidates = recognizeHarmonyCandidates(args);
  const top = uniqueHarmonyRecognitionCandidate(candidates);
  if (top) {
    return { ...top.intent };
  }
  return {
    ...(args.previousIntent ?? {
      source: 'slot' as HarmonyControlSource,
      strength: 'bias' as const,
      rootMode: 'absolute' as const,
      degree: 0,
      rootNote: 0,
      quality: 'auto' as const,
      extensions: [],
      inversion: 0,
      spread: 0.5,
      octave: 4,
      bassMode: 'off' as const,
      bassNote: null,
      capturedMidiNotes: [],
      preserveCapturedVoicing: false,
    }),
    quality: 'custom',
    extensions: [],
    alterations: [],
    capturedMidiNotes: args.midiNotes.filter(Number.isFinite).map((note) => Math.round(note)),
    preserveCapturedVoicing: true,
  };
}
