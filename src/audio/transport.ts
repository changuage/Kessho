import type {
  SliderState,
  PhraseClockSource,
  BeatClockSource,
  ProgressionClockSource,
} from '../ui/state';
import type { SimpleSequencerPhrasePreview } from './simpleSequencerRuntimePlan';

export interface TransportAnchors {
  localPhraseWallStartSec: number;
  localBeatWallStartSec: number;
  localBeatCtxStartSec: number;
}

export interface TransportMetrics {
  effectiveBpm: number;
  beatDurationSec: number;
  barDurationSec: number;
  phraseDurationFromPhraseClockSec: number;
  phraseDurationFromBeatClockSec: number;
  effectivePhraseDurationSec: number;
  equivalentBpmFromPhraseClock: number;
}

export interface TransportDebugSnapshot {
  effectiveBpm: number;
  effectivePhraseSeconds: number;
  nextPhraseBoundaryIn: number;
  nextHarmonyEventIn: number | null;
  nextProgressionStepIn: number | null;
  padChordPhraseSeconds?: number | null;
  nextPadChordBoundaryIn?: number | null;
  padChordPlan?: SimpleSequencerPhrasePreview | null;
  previousPadChordPlan?: SimpleSequencerPhrasePreview | null;
  randomTimingPhraseSeconds?: number | null;
  nextRandomTimingBoundaryIn?: number | null;
  randomTimingPlan?: SimpleSequencerPhrasePreview | null;
  previousRandomTimingPlan?: SimpleSequencerPhrasePreview | null;
}

type AnyClockSource = PhraseClockSource | BeatClockSource | ProgressionClockSource;

function alignForward(value: number, anchor: number, stepDuration: number): number {
  if (!Number.isFinite(stepDuration) || stepDuration <= 0) return value;
  return anchor + Math.ceil((value - anchor) / stepDuration) * stepDuration;
}

function getLegacySequencerBpm(state?: Partial<Pick<SliderState, 'sequencerMasterBPM' | 'synthEuclidBaseBPM' | 'drumEuclidBaseBPM'>> | null): number {
  return state?.sequencerMasterBPM
    ?? state?.synthEuclidBaseBPM
    ?? state?.drumEuclidBaseBPM
    ?? 120;
}

export function getTransportMetrics(state: Partial<SliderState>): TransportMetrics {
  const primaryClock = state.transportPrimaryClock ?? 'seconds';
  const storedBpm = Math.max(1, getLegacySequencerBpm(state));
  const beatsPerBar = Math.max(1, state.transportBeatsPerBar ?? 4);
  const barsPerPhrase = Math.max(1, state.transportBarsPerPhrase ?? 4);
  const phraseDurationFromPhraseClockSec = Math.max(0.001, state.phraseLength ?? 16);
  const equivalentBpmFromPhraseClock = (barsPerPhrase * beatsPerBar * 60) / phraseDurationFromPhraseClockSec;
  const effectiveBpm = primaryClock === 'seconds'
    ? Math.max(0.001, equivalentBpmFromPhraseClock)
    : storedBpm;
  const beatDurationSec = 60 / effectiveBpm;
  const barDurationSec = beatDurationSec * beatsPerBar;
  const phraseDurationFromBeatClockSec = barDurationSec * barsPerPhrase;
  const effectivePhraseDurationSec = primaryClock === 'bpm'
    ? phraseDurationFromBeatClockSec
    : phraseDurationFromPhraseClockSec;

  return {
    effectiveBpm,
    beatDurationSec,
    barDurationSec,
    phraseDurationFromPhraseClockSec,
    phraseDurationFromBeatClockSec,
    effectivePhraseDurationSec,
    equivalentBpmFromPhraseClock,
  };
}

export function getEffectiveSequencerBpm(state: Partial<SliderState>): number {
  return getTransportMetrics(state).effectiveBpm;
}

export function getEffectivePhraseDuration(state: Partial<SliderState>): number {
  return getTransportMetrics(state).effectivePhraseDurationSec;
}

export function isGlobalClockSource(source: AnyClockSource): boolean {
  return source === 'globalPhrase' || source === 'globalBeat';
}

export function isBeatClockSource(source: AnyClockSource): boolean {
  return source === 'localBeat' || source === 'globalBeat';
}

export function resolveProgressionPhraseClockSource(
  progressionClockSource: ProgressionClockSource,
  harmonyClockSource: PhraseClockSource,
): PhraseClockSource {
  if (progressionClockSource === 'harmony') return harmonyClockSource;
  return progressionClockSource;
}

export function getPhraseDurationForClockSource(
  state: Partial<SliderState>,
  source: PhraseClockSource | ProgressionClockSource,
): number {
  const metrics = getTransportMetrics(state);
  return isBeatClockSource(source) ? metrics.phraseDurationFromBeatClockSec : metrics.effectivePhraseDurationSec;
}

export function getAnchorWallForClockSource(source: AnyClockSource, anchors: TransportAnchors): number {
  if (source === 'localPhrase') return anchors.localPhraseWallStartSec;
  if (source === 'localBeat') return anchors.localBeatWallStartSec;
  return 0;
}

export function getCurrentClockIndexWall(
  source: AnyClockSource,
  durationSec: number,
  anchors: TransportAnchors,
  nowWallSec: number = Date.now() / 1000,
): number {
  const anchor = getAnchorWallForClockSource(source, anchors);
  return Math.max(0, Math.floor((nowWallSec - anchor) / Math.max(0.001, durationSec)));
}

export function getTimeUntilNextBoundaryWall(
  source: AnyClockSource,
  durationSec: number,
  anchors: TransportAnchors,
  nowWallSec: number = Date.now() / 1000,
): number {
  const anchor = getAnchorWallForClockSource(source, anchors);
  const target = alignForward(nowWallSec, anchor, Math.max(0.001, durationSec));
  return Math.max(0, target - nowWallSec);
}

export function getNextBoundaryWallTime(
  source: AnyClockSource,
  durationSec: number,
  anchors: TransportAnchors,
  nowWallSec: number = Date.now() / 1000,
): number {
  return nowWallSec + getTimeUntilNextBoundaryWall(source, durationSec, anchors, nowWallSec);
}

export function getNextBeatGridCtxTime(
  source: BeatClockSource,
  stepDurationSec: number,
  anchors: TransportAnchors,
  nowWallSec: number,
  nowCtxSec: number,
): number {
  if (source === 'localBeat') {
    return alignForward(nowCtxSec, anchors.localBeatCtxStartSec, stepDurationSec);
  }

  const nextWall = getNextBoundaryWallTime(source, stepDurationSec, anchors, nowWallSec);
  return nowCtxSec + (nextWall - nowWallSec);
}

export function getNextBarBoundaryCtxTime(
  source: BeatClockSource,
  state: Partial<SliderState>,
  anchors: TransportAnchors,
  nowWallSec: number,
  nowCtxSec: number,
): number {
  const metrics = getTransportMetrics(state);
  return getNextBeatGridCtxTime(source, metrics.barDurationSec, anchors, nowWallSec, nowCtxSec);
}

function hashStringToUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function smoothNoise(seed: string, t: number): number {
  const i0 = Math.floor(t);
  const i1 = i0 + 1;
  const frac = t - i0;
  const smooth = frac * frac * (3 - 2 * frac);
  const v0 = hashStringToUnit(`${seed}:${i0}`);
  const v1 = hashStringToUnit(`${seed}:${i1}`);
  return v0 + (v1 - v0) * smooth;
}

export function sampleGlobalWalkPosition(
  key: string,
  walkSpeed: number,
  seedWindow: SliderState['seedWindow'],
  nowWallSec: number = Date.now() / 1000,
): number {
  const bucketSec = seedWindow === 'day' ? 86400 : 3600;
  const bucket = Math.floor(nowWallSec / bucketSec);
  const phase = nowWallSec * Math.max(0.05, walkSpeed) * 0.08;
  return smoothNoise(`${key}|bucket:${bucket}|mode:globalWalk`, phase);
}
