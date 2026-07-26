import { DEFAULT_HARMONY_SCALE_INTERVALS, HARMONY_SCALE_INTERVALS } from './harmonyScaleIntervals';
import type { HarmonyEvidenceEvent, HarmonyEvidenceSnapshot } from './harmonyEvidence';

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

export const TONAL_CONTEXT_SCALE_FAMILY_IDS = Object.freeze(Object.keys(HARMONY_SCALE_INTERVALS).map(Number));
export const TONAL_CONTEXT_HYSTERESIS = 0.1;

export type TonalContextMode = 'playing' | 'preview';

export interface TonalContextEngineState {
  rootPitchClass: number;
  scaleId: number;
  scaleName?: string;
}

export interface TonalContextCandidate {
  rootPitchClass: number;
  scaleId: number;
  scaleName: string;
  score: number;
  confidence: number;
  noteCoverage: number;
  diatonicChordFit: number;
  rootBassEvidence: number;
  cadenceEvidence: number;
  orderEvidence: number;
  confirmedRecognition: number;
}

export interface TonalContextAnalysis {
  mode: TonalContextMode;
  top: TonalContextCandidate | null;
  confidence: number;
  alternatives: readonly TonalContextCandidate[];
  evidenceWeight: number;
  heldByHysteresis: boolean;
  insufficientEvidence: boolean;
}

export interface TonalContextAnalysisInput {
  engine: TonalContextEngineState;
  evidence: HarmonyEvidenceSnapshot | readonly HarmonyEvidenceEvent[];
  mode?: TonalContextMode;
  previous?: TonalContextCandidate | null;
  nowMs?: number;
  maxAlternatives?: number;
}

export interface TonalContextPairInput {
  engine: TonalContextEngineState;
  playingEvidence: HarmonyEvidenceSnapshot | readonly HarmonyEvidenceEvent[];
  previewEvidence?: HarmonyEvidenceSnapshot | readonly HarmonyEvidenceEvent[];
  previousPlaying?: TonalContextCandidate | null;
  previousPreview?: TonalContextCandidate | null;
  nowMs?: number;
}

export interface TonalContextDisplay {
  engine: TonalContextEngineState;
  playing: TonalContextAnalysis;
  preview: TonalContextAnalysis | null;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const pitchClass = (value: number) => ((Math.round(value) % 12) + 12) % 12;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function intervalsFor(scaleId: number): readonly number[] {
  return HARMONY_SCALE_INTERVALS[Math.round(scaleId)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;
}

function candidateKey(candidate: Pick<TonalContextCandidate, 'rootPitchClass' | 'scaleId'>): string {
  return `${candidate.rootPitchClass}:${candidate.scaleId}`;
}

function normalizeEvents(input: HarmonyEvidenceSnapshot | readonly HarmonyEvidenceEvent[], nowMs: number): HarmonyEvidenceEvent[] {
  if ('events' in input) return input.events.slice();
  return input.filter((event) => event.audible !== false).map((event) => ({
    ...event,
    timestampMs: event.timestampMs ?? nowMs,
    strength: event.strength ?? 1,
  }));
}

function eventWeight(event: HarmonyEvidenceEvent): number {
  if ('weight' in event && finite((event as { weight?: unknown }).weight)) return Math.max(0, Number((event as { weight: number }).weight));
  const sourceWeight: Record<string, number> = { playedChord: 1, progression: 0.92, seqTrigger: 0.78, slot: 0.52, baseline: 0.18, livePlay: 0.88, recognition: 0.95 };
  return (sourceWeight[event.kind] ?? 0) * clamp(event.strength ?? 1, 0, 1) * (event.confirmed ? 1.2 : 1);
}

function inScale(pc: number, root: number, intervals: readonly number[]): boolean {
  const relative = (pc - root + 12) % 12;
  return intervals.includes(relative);
}

function rootOf(event: HarmonyEvidenceEvent): number | null {
  if (finite(event.rootPitchClass)) return pitchClass(event.rootPitchClass!);
  const notes = event.notes ?? [];
  if (notes.length === 0) return null;
  return pitchClass(notes[0]!);
}

function scoreCandidate(root: number, scaleId: number, events: readonly HarmonyEvidenceEvent[], engine: TonalContextEngineState): Omit<TonalContextCandidate, 'confidence' | 'score'> & { rawScore: number; totalWeight: number } {
  const intervals = intervalsFor(scaleId);
  let totalWeight = 0;
  let coveredWeight = 0;
  let diatonicWeight = 0;
  let chordWeight = 0;
  let rootBassWeight = 0;
  let confirmedWeight = 0;
  const orderedRoots: { root: number; weight: number; index: number }[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    const weight = eventWeight(event);
    if (weight <= 0 || event.audible === false) continue;
    totalWeight += weight;
    const notes = event.notes ?? [];
    if (notes.length > 0) {
      let covered = 0;
      for (const note of notes) if (finite(note) && inScale(pitchClass(note), root, intervals)) covered += 1;
      coveredWeight += weight * covered / notes.length;
      chordWeight += weight;
      // Chord fit is intentionally chord-level rather than another copy of
      // note coverage: mostly diatonic chords receive a partial, not linear,
      // contribution and fully diatonic chords receive the full event weight.
      const chordFit = covered === notes.length ? 1 : (covered / notes.length) * 0.5;
      diatonicWeight += weight * chordFit;
    }
    const eventRoot = rootOf(event);
    if (eventRoot !== null) {
      orderedRoots.push({ root: eventRoot, weight, index });
      if (eventRoot === root) rootBassWeight += weight;
    }
    if (finite(event.bassMidi) && pitchClass(event.bassMidi!) === root) rootBassWeight += weight * 0.65;
    if (event.confirmed || event.kind === 'recognition' || event.kind === 'playedChord') {
      if (eventRoot === root) confirmedWeight += weight;
    }
  }

  // Engine is deliberately weak prior: analyzer is advisory and does not simply mirror Engine.
  const enginePrior = totalWeight <= 0 && pitchClass(engine.rootPitchClass) === root && Math.round(engine.scaleId) === scaleId ? 0.06 : 0;
  const noteCoverage = totalWeight > 0 ? coveredWeight / totalWeight : 0;
  const diatonicChordFit = chordWeight > 0 ? diatonicWeight / chordWeight : noteCoverage;
  const rootBassEvidence = totalWeight > 0 ? clamp(rootBassWeight / (totalWeight * 1.45), 0, 1) : 0;

  let cadenceEvidence = 0;
  let orderEvidence = 0;
  if (orderedRoots.length > 0) {
    const recent = orderedRoots.slice(-8);
    let orderTotal = 0;
    for (let index = 1; index < recent.length; index += 1) {
      const previous = recent[index - 1]!;
      const current = recent[index]!;
      const relation = (current.root - previous.root + 12) % 12;
      const pairWeight = Math.min(previous.weight, current.weight);
      orderTotal += pairWeight;
      // Dominant-to-tonic, including the cyclic end-to-start cadence in a loop.
      if (previous.root === (root + 7) % 12 && current.root === root) cadenceEvidence += pairWeight;
      if (relation === 5 || relation === 7) orderEvidence += pairWeight * 0.35;
    }
    if (recent.length > 1) {
      const first = recent[0]!;
      const last = recent[recent.length - 1]!;
      const pairWeight = Math.min(first.weight, last.weight);
      if (last.root === (root + 7) % 12 && first.root === root) cadenceEvidence += pairWeight;
    }
    cadenceEvidence = clamp(cadenceEvidence / Math.max(1, orderTotal), 0, 1);
    orderEvidence = clamp(orderEvidence / Math.max(1, orderTotal), 0, 1);
  }
  const confirmedRecognition = totalWeight > 0 ? clamp(confirmedWeight / totalWeight, 0, 1) : 0;
  const evidenceFactor = clamp(totalWeight / 2.8, 0, 1);
  const rawScore = evidenceFactor * (
    noteCoverage * 0.34
    + diatonicChordFit * 0.19
    + rootBassEvidence * 0.17
    + cadenceEvidence * 0.17
    + orderEvidence * 0.06
    + confirmedRecognition * 0.07
  ) + enginePrior;
  return {
    rootPitchClass: root,
    scaleId,
    scaleName: SCALE_NAMES[scaleId] ?? `Scale ${scaleId}`,
    noteCoverage,
    diatonicChordFit,
    rootBassEvidence,
    cadenceEvidence,
    orderEvidence,
    confirmedRecognition,
    rawScore,
    totalWeight,
  };
}

/** Infer a bounded root/scale label from recent evidence without mutating Engine state. */
export function analyzeTonalContext(input: TonalContextAnalysisInput): TonalContextAnalysis {
  const mode = input.mode ?? 'playing';
  const nowMs = input.nowMs ?? ('events' in input.evidence ? input.evidence.nowMs : Date.now());
  const events = normalizeEvents(input.evidence, nowMs).filter((event) => event.audible !== false && (event.scope ?? 'playing') === mode);
  const scored: TonalContextCandidate[] = [];
  for (const scaleId of TONAL_CONTEXT_SCALE_FAMILY_IDS) {
    for (let root = 0; root < 12; root += 1) {
      const scoredCandidate = scoreCandidate(root, scaleId, events, input.engine);
      scored.push({ ...scoredCandidate, score: scoredCandidate.rawScore, confidence: 0 });
    }
  }
  scored.sort((left, right) => right.score - left.score || left.scaleId - right.scaleId || left.rootPitchClass - right.rootPitchClass);
  const rawTop = scored[0] ?? null;
  const second = scored[1] ?? null;
  const rawGap = rawTop && second ? Math.max(0, rawTop.score - second.score) : 0;
  const evidenceWeight = events.reduce((sum, event) => sum + eventWeight(event), 0);
  const confidence = rawTop ? clamp(rawGap * 2.8 + Math.min(0.18, evidenceWeight / 20), 0, 1) : 0;
  let top = rawTop ? { ...rawTop, confidence } : null;
  let heldByHysteresis = false;
  if (input.previous && top) {
    const previousScore = scored.find((candidate) => candidateKey(candidate) === candidateKey(input.previous!))?.score ?? input.previous.score;
    if (candidateKey(input.previous) !== candidateKey(top) && top.score - previousScore < TONAL_CONTEXT_HYSTERESIS) {
      const prior = scored.find((candidate) => candidateKey(candidate) === candidateKey(input.previous!)) ?? input.previous;
      top = { ...prior, confidence: clamp(Math.max(confidence, prior.confidence ?? 0) * 0.9, 0, 1) };
      heldByHysteresis = true;
    }
  }
  // A committed context needs more than one weak/ambiguous event. Keep ranked
  // alternatives available for UI adoption, but do not force a Playing label.
  if (mode === 'playing' && !heldByHysteresis && (evidenceWeight < 1.6 || confidence < 0.12)) top = null;
  const alternatives = scored.filter((candidate) => !top || candidateKey(candidate) !== candidateKey(top)).slice(0, Math.max(1, Math.min(7, Math.round(input.maxAlternatives ?? 4))));
  return {
    mode,
    top,
    confidence: top?.confidence ?? 0,
    alternatives,
    evidenceWeight,
    heldByHysteresis,
    insufficientEvidence: mode === 'playing' && !heldByHysteresis && top === null,
  };
}

/** Analyze committed Playing evidence separately from hypothetical Preview evidence. */
export function analyzePlayingAndPreview(input: TonalContextPairInput): TonalContextDisplay {
  const playing = analyzeTonalContext({ engine: input.engine, evidence: input.playingEvidence, mode: 'playing', previous: input.previousPlaying, nowMs: input.nowMs });
  const preview = input.previewEvidence
    ? analyzeTonalContext({ engine: input.engine, evidence: input.previewEvidence, mode: 'preview', previous: input.previousPreview, nowMs: input.nowMs })
    : null;
  return { engine: input.engine, playing, preview };
}

/** UI-safe projection: Engine plus Playing, and Preview only while preview has evidence. */
export function tonalContextDisplay(input: TonalContextPairInput): TonalContextDisplay {
  const result = analyzePlayingAndPreview(input);
  if (!result.preview || !result.preview.top || result.preview.evidenceWeight <= 0) return { ...result, preview: null };
  return result;
}
