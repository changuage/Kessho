import type { ClockDivision, LaneDirection, TrigCondition } from '../../../audio/drumSeqTypes';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICES } from '../../../audio/drumVoiceConfig';
import { createRng, rngInt, rngPick } from '../../../audio/rng';
import { createBitmapTriggerClip } from '../../sequencer/triggerClip';
import type {
  EngineScatterState,
  GeneratedDrumPhrase,
  ScatterContour,
  ScatterFeelZone,
} from './scatterTypes';

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampFeel(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function chaosFromFeelY(feelY: number): number {
  return clampUnit((clampFeel(feelY) + 1) / 2);
}

export function zoneFromChaos(chaos: number): ScatterFeelZone {
  if (chaos < 0.2) return 'pulse';
  if (chaos < 0.4) return 'gesture';
  if (chaos < 0.6) return 'wave';
  if (chaos < 0.8) return 'fracture';
  return 'scatter';
}

function phraseLength(zone: ScatterFeelZone, rng: () => number): number {
  if (zone === 'pulse') return rngInt(rng, 2, 4);
  if (zone === 'gesture') return rngInt(rng, 3, 8);
  if (zone === 'wave') return rngInt(rng, 4, 12);
  if (zone === 'fracture') return rngInt(rng, 5, 16);
  return rngInt(rng, 2, 16);
}

function contourFor(feelX: number, zone: ScatterFeelZone, rng: () => number): ScatterContour {
  if (zone === 'scatter') return rngPick(rng, ['randomWalk', 'scatter', 'zigzag'] as const);
  if (zone === 'fracture' && rng() < 0.35) return rngPick(rng, ['zigzag', 'randomWalk'] as const);
  if (zone === 'wave') return feelX < -0.45 ? 'fall' : feelX > 0.45 ? 'rise' : 'wave';
  if (feelX < -0.25) return 'fall';
  if (feelX > 0.25) return 'rise';
  return zone === 'gesture' ? rngPick(rng, ['flat', 'wave'] as const) : 'flat';
}

function contourValue(
  contour: ScatterContour,
  step: number,
  steps: number,
  rng: () => number,
  chaos: number,
): number {
  const t = steps <= 1 ? 0 : step / (steps - 1);
  if (contour === 'rise') return t;
  if (contour === 'fall') return 1 - t;
  if (contour === 'wave') return 0.5 + Math.sin(t * Math.PI * 2 - Math.PI * 0.5) * 0.5;
  if (contour === 'zigzag') return step % 2 === 0 ? 0.2 : 0.85;
  if (contour === 'randomWalk') return clampUnit(0.5 + (rng() - 0.5) * (0.5 + chaos * 0.7));
  if (contour === 'scatter') return rng();
  return 0.5;
}

function generatePattern(args: {
  steps: number;
  hitTarget: number;
  anchor: number;
  breath: number;
  chaos: number;
  rng: () => number;
}): boolean[] {
  const { steps, hitTarget, anchor, breath, chaos, rng } = args;
  const pattern = new Array(steps).fill(false);
  let hits = 0;
  if (rng() < anchor) {
    pattern[0] = true;
    hits += 1;
  }

  const candidates = Array.from({ length: steps }, (_, step) => step)
    .sort((left, right) => {
      const leftScore = (left % 4 === 0 ? 0.2 : 0) + rng();
      const rightScore = (right % 4 === 0 ? 0.2 : 0) + rng();
      return rightScore - leftScore;
    });

  for (const step of candidates) {
    if (hits >= hitTarget) break;
    if (pattern[step]) continue;
    const adjacent = Boolean(pattern[(step - 1 + steps) % steps]) || Boolean(pattern[(step + 1) % steps]);
    if (adjacent && chaos < 0.65 && rng() < breath) continue;
    pattern[step] = true;
    hits += 1;
  }

  for (let step = 0; hits < hitTarget && step < steps; step += 1) {
    if (!pattern[step]) {
      pattern[step] = true;
      hits += 1;
    }
  }

  return pattern;
}

function directionFor(zone: ScatterFeelZone, contour: ScatterContour, rng: () => number): LaneDirection {
  if (zone === 'wave') return 'pingpong';
  if ((zone === 'fracture' || zone === 'scatter') && contour === 'fall' && rng() < 0.5) return 'reverse';
  if (zone === 'scatter' && rng() < 0.25) return rngPick(rng, ['forward', 'reverse', 'pingpong'] as const);
  return 'forward';
}

function trigConditionFor(chaos: number, rng: () => number): TrigCondition {
  if (chaos < 0.35 || rng() > chaos * 0.35) return [1, 1];
  return rngPick(rng, [[1, 2], [2, 2], [1, 3], [2, 3], [1, 4]] as const).slice() as TrigCondition;
}

function enabledStepIndexes(pattern: readonly boolean[]): number[] {
  const indexes: number[] = [];
  pattern.forEach((enabled, step) => {
    if (enabled) indexes.push(step);
  });
  return indexes;
}

function hasRoundedVariation(values: readonly number[], indexes: readonly number[], scale = 100): boolean {
  if (indexes.length < 2) return false;
  const rounded = new Set(indexes.map((step) => Math.round((values[step] ?? 0) * scale)));
  return rounded.size > 1;
}

function hasPitchVariation(values: readonly number[], indexes: readonly number[]): boolean {
  if (indexes.length < 2) return false;
  const pitches = new Set(indexes.map((step) => Math.round(values[step] ?? 0)));
  return pitches.size > 1;
}

function ensureUnitVariation(values: number[], pattern: readonly boolean[], amount: number): void {
  const hitSteps = enabledStepIndexes(pattern);
  if (hitSteps.length < 2 || hasRoundedVariation(values, hitSteps)) return;

  const safeAmount = Math.max(0.03, Math.min(0.35, amount));
  hitSteps.forEach((step, index) => {
    const phase = hitSteps.length <= 1 ? 0 : index / (hitSteps.length - 1);
    const sweep = (phase - 0.5) * safeAmount;
    const alternate = (index % 2 === 0 ? -1 : 1) * safeAmount * 0.45;
    values[step] = clampUnit((values[step] ?? 0.5) + sweep + alternate);
  });
}

function ensurePitchVariation(values: number[], pattern: readonly boolean[], spread: number): void {
  const hitSteps = enabledStepIndexes(pattern);
  if (hitSteps.length < 2 || hasPitchVariation(values, hitSteps)) return;

  const interval = Math.max(1, Math.min(12, Math.round(spread / 3)));
  hitSteps.forEach((step, index) => {
    const phase = hitSteps.length <= 1 ? 0 : index / (hitSteps.length - 1);
    const direction = index % 2 === 0 ? -1 : 1;
    values[step] = direction * Math.max(1, Math.round(interval + phase * interval));
  });
}

function labelFor(engine: DrumVoiceType, hits: number, zone: ScatterFeelZone, contour: ScatterContour): string {
  const voice = DRUM_VOICES[engine]?.label ?? engine;
  return `${voice} · ${hits} · ${contour === 'flat' ? zone : contour}`;
}

export function generateScatterPhrase(args: {
  engine: DrumVoiceType;
  engineState: EngineScatterState;
  previousPhrases: GeneratedDrumPhrase[];
  seed: number;
}): GeneratedDrumPhrase {
  const { engine, engineState, seed } = args;
  const rng = createRng(`scatter:${engine}:${seed}`);
  const chaos = chaosFromFeelY(engineState.feelY);
  const zone = zoneFromChaos(chaos);
  const steps = phraseLength(zone, rng);
  const density = clampUnit(
    engineState.triggerProbability * (1.25 - engineState.rules.breath * 0.55) + chaos * 0.36,
  );
  const hitTarget = Math.max(1, Math.min(steps, Math.round(steps * density) + (rng() < engineState.burstProbability ? 1 : 0)));
  const pattern = generatePattern({
    steps,
    hitTarget,
    anchor: engineState.rules.anchor,
    breath: engineState.rules.breath,
    chaos,
    rng,
  });
  const hits = pattern.filter(Boolean).length;
  const contour = contourFor(engineState.feelX, zone, rng);
  const motion = clampUnit(engineState.rules.motion + chaos * 0.3);
  const fracture = clampUnit(engineState.rules.fracture + chaos * 0.5);
  const spread = clampUnit(engineState.rules.spread + chaos * 0.35);
  const probability = Array.from({ length: steps }, (_, step) => (
    pattern[step] ? clampUnit(0.95 - chaos * 0.2 + rng() * chaos * 0.2) : 1
  ));
  const expression = Array.from({ length: steps }, (_, step) => clampUnit(0.72 + contourValue(contour, step, steps, rng, chaos) * 0.28));
  const morph = Array.from({ length: steps }, (_, step) => clampUnit((0.5 - motion * 0.25) + contourValue(contour, step, steps, rng, chaos) * motion * 0.5));
  const distance = Array.from({ length: steps }, (_, step) => {
    const contourAmount = contourValue(contour, step, steps, rng, chaos);
    return clampUnit(engineState.feelX > 0 ? 1 - contourAmount * 0.6 : 0.35 + contourAmount * 0.55);
  });
  const pitchSpread = Math.max(2, Math.round(3 + chaos * 10 + spread * 14 + motion * 4));
  const pitch = Array.from({ length: steps }, (_, step) => {
    const centered = contourValue(contour, step, steps, rng, chaos) - 0.5;
    return Math.round(centered * pitchSpread);
  });
  ensureUnitVariation(expression, pattern, 0.05 + motion * 0.08 + fracture * 0.07);
  ensureUnitVariation(morph, pattern, 0.07 + motion * 0.18);
  ensureUnitVariation(distance, pattern, 0.08 + spread * 0.16 + fracture * 0.08);
  ensurePitchVariation(pitch, pattern, pitchSpread);

  const ratchet = Array.from({ length: steps }, (_, step) => {
    if (!pattern[step]) return 1;
    if (zone === 'pulse') return 1;
    if (rng() < fracture * 0.3) return rngInt(rng, 2, zone === 'scatter' ? 4 : 3);
    return 1;
  });
  if (hits > 1 && !ratchet.some((value) => value > 1) && (fracture > 0.22 || motion > 0.45)) {
    const hitSteps = enabledStepIndexes(pattern);
    const ratchetStep = hitSteps[Math.floor(hitSteps.length / 2)];
    if (ratchetStep !== undefined) ratchet[ratchetStep] = fracture > 0.66 ? 3 : 2;
  }
  const trigCondition = Array.from({ length: steps }, () => trigConditionFor(chaos, rng));
  const slice = Array.from({ length: steps }, () => 0);
  const reverse = Array.from({ length: steps }, () => 0);
  const nudge = pattern
    .filter(Boolean)
    .map(() => 0);
  const directions = {
    pitch: directionFor(zone, contour, rng),
    expression: zone === 'wave' ? 'pingpong' as const : 'forward' as const,
    morph: directionFor(zone, contour, rng),
    distance: directionFor(zone, contour, rng),
    nudge: 'forward' as const,
    slice: zone === 'scatter' && rng() < 0.5 ? 'reverse' as const : 'forward' as const,
    reverse: 'forward' as const,
  };
  const label = labelFor(engine, hits, zone, contour);
  const triggerClip = createBitmapTriggerClip({
    steps,
    bits: pattern,
    origin: 'scatter',
    label,
    generator: {
      kind: 'scatter',
      phraseId: `${engine}-${seed}`,
      seed,
      engine,
      feelX: clampFeel(engineState.feelX),
      feelY: clampFeel(engineState.feelY),
      chaos,
      label,
    },
  });
  const hasSlice = slice.some((value) => value > 0);
  const hasReverse = reverse.some((value) => value > 0);
  const hasNudge = nudge.some((value) => Math.abs(value) > 0.001);
  const hitSteps = enabledStepIndexes(pattern);
  const pitchVaries = hasPitchVariation(pitch, hitSteps);
  const morphVaries = hasRoundedVariation(morph, hitSteps);
  const distanceVaries = hasRoundedVariation(distance, hitSteps);

  return {
    id: `${engine}-${seed}`,
    seed,
    createdAt: seed,
    engine,
    label,
    triggerClip,
    clockDiv: (chaos > 0.7 ? '1/16' : chaos > 0.35 ? '1/8T' : '1/8') as ClockDivision,
    swing: zone === 'pulse' ? 0 : Math.round(chaos * 8) / 100,
    probability,
    ratchet,
    trigCondition,
    pitch,
    expression,
    morph,
    distance,
    nudge,
    slice,
    reverse,
    directions,
    subLaneEnabled: {
      pitch: pitchVaries,
      expression: true,
      morph: morphVaries,
      distance: distanceVaries,
      nudge: hasNudge,
      slice: hasSlice,
      reverse: hasReverse,
    },
    feel: {
      x: clampFeel(engineState.feelX),
      y: clampFeel(engineState.feelY),
      chaos,
      zone,
    },
    summary: {
      steps,
      hits,
      contour,
      hasRatchet: ratchet.some((value) => value > 1),
      hasSlice,
      hasReverse,
    },
  };
}
