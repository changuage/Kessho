import type { ClockDivision, TrigCondition } from '../../../audio/drumSeqTypes';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICES } from '../../../audio/drumVoiceConfig';
import { seqEuclidean } from '../../../audio/drumSequencer';
import { createRng, rngInt, rngPick } from '../../../audio/rng';
import { createEuclideanTriggerClip } from '../../sequencer/euclideanTriggerGenerator';
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

const SCATTER_PITCH_OFFSET_LIMIT = 48;

function clampPitchOffset(value: number): number {
  return Math.max(-SCATTER_PITCH_OFFSET_LIMIT, Math.min(SCATTER_PITCH_OFFSET_LIMIT, Math.round(value)));
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

const STEP_OPTIONS_BY_ZONE: Record<ScatterFeelZone, readonly number[]> = {
  pulse: [2, 3, 4],
  gesture: [4, 5, 6, 7, 8],
  wave: [8, 12],
  fracture: [8, 12, 16],
  scatter: [5, 7, 11, 13, 16],
};

type ContourDirection = 'rise' | 'fall';

function phraseLength(zone: ScatterFeelZone, rng: () => number): number {
  return rngPick(rng, STEP_OPTIONS_BY_ZONE[zone]);
}

function instabilityFromFeelX(feelX: number): number {
  return clampUnit((clampFeel(feelX) + 1) / 2);
}

function hitTargetForSteps(steps: number, burstProbability: number): number {
  return Math.max(1, Math.min(steps, Math.round(steps * clampUnit(burstProbability))));
}

function contourFor(feelX: number, zone: ScatterFeelZone, randomWalk: number, rng: () => number): ScatterContour {
  const instability = instabilityFromFeelX(feelX);
  const walkBias = clampUnit(randomWalk);
  const scatterChance = clampUnit(instability * 0.65 * (1 - walkBias * 0.45));
  const walkChance = clampUnit(walkBias * 0.78 + (instability > 0.6 ? 0.28 : 0) + (zone === 'fracture' ? instability * 0.28 : 0));
  if (instability > 0.82 && walkBias < 0.62) return 'scatter';
  if (zone === 'scatter' && rng() < scatterChance) return 'scatter';
  if (walkBias > 0.92 || rng() < walkChance) return 'randomWalk';
  if (zone === 'pulse') return rngPick(rng, ['linear', 'stepped'] as const);
  return rngPick(rng, ['linear', 'exponential', 'logarithmic', 'stepped', 'wave'] as const);
}

function contourDirectionFor(contour: ScatterContour, rng: () => number): ContourDirection {
  if (contour === 'randomWalk' || contour === 'scatter') return 'rise';
  return rng() < 0.5 ? 'rise' : 'fall';
}

function shapedContourValue(contour: ScatterContour, t: number): number {
  if (contour === 'linear') return t;
  if (contour === 'exponential') return t * t;
  if (contour === 'logarithmic') return Math.sqrt(t);
  if (contour === 'stepped') return Math.round(t * 3) / 3;
  if (contour === 'wave') return 0.5 + Math.sin(t * Math.PI * 2 - Math.PI * 0.5) * 0.5;
  return t;
}

function contourValuesForHits(args: {
  hits: number;
  contour: ScatterContour;
  direction: ContourDirection;
  instability: number;
  randomWalk: number;
  chaos: number;
  rng: () => number;
}): number[] {
  const { hits, contour, direction, instability, randomWalk, chaos, rng } = args;
  if (hits <= 0) return [];
  if (contour === 'scatter') return Array.from({ length: hits }, () => rng());
  if (contour === 'randomWalk') {
    let current = rng();
    const stepSize = 0.16 + instability * 0.28 + chaos * 0.1 + clampUnit(randomWalk) * 0.22;
    return Array.from({ length: hits }, () => {
      current = clampUnit(current + (rng() - 0.5) * stepSize);
      return current;
    });
  }

  const randomMix = clampUnit(Math.max(0, instability - 0.18) * 0.95 + (chaos > 0.8 ? 0.08 : 0));
  const jitterAmount = instability * 0.34 + chaos * 0.08;
  return Array.from({ length: hits }, (_, index) => {
    const t = hits <= 1 ? 0.5 : index / (hits - 1);
    const shaped = shapedContourValue(contour, t);
    const directed = direction === 'fall' ? 1 - shaped : shaped;
    const mixed = directed * (1 - randomMix) + rng() * randomMix;
    return clampUnit(mixed + (rng() - 0.5) * jitterAmount);
  });
}

function decorrelateValue(value: number, amount: number, rng: () => number): number {
  const safeAmount = clampUnit(amount);
  return clampUnit(value * (1 - safeAmount) + rng() * safeAmount);
}

function euclideanRotation(args: {
  steps: number;
  anchor: number;
  breath: number;
  chaos: number;
  fracture: number;
  instability: number;
  rng: () => number;
}): number {
  const { steps, anchor, breath, chaos, fracture, instability, rng } = args;
  const rotationEnergy = clampUnit(instability * 0.5 + fracture * 0.25 + chaos * 0.2 - breath * 0.15);
  const shouldAnchorRoot = rng() < clampUnit(anchor * (0.6 + (1 - rotationEnergy) * 0.4));
  const localRotation = rngInt(rng, -Math.max(1, Math.round(steps * 0.18)), Math.max(1, Math.round(steps * 0.18)));
  const freeRotation = rngInt(rng, 0, steps - 1);
  const rawRotation = shouldAnchorRoot ? 0 : (rotationEnergy < 0.5 ? localRotation : freeRotation);
  return ((rawRotation % steps) + steps) % steps;
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

function hasBipolarPitchVariation(values: readonly number[], indexes: readonly number[]): boolean {
  if (indexes.length < 2) return false;
  let hasNegative = false;
  let hasPositive = false;
  for (const step of indexes) {
    const value = Math.round(values[step] ?? 0);
    if (value < 0) hasNegative = true;
    if (value > 0) hasPositive = true;
  }
  return hasNegative && hasPositive;
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

  const interval = Math.max(2, Math.min(SCATTER_PITCH_OFFSET_LIMIT, Math.round(spread / 2)));
  hitSteps.forEach((step, index) => {
    const phase = hitSteps.length <= 1 ? 0 : index / (hitSteps.length - 1);
    const direction = index % 2 === 0 ? -1 : 1;
    values[step] = clampPitchOffset(direction * Math.max(2, Math.round(interval + phase * interval)));
  });
}

function ensureBipolarPitchVariation(values: number[], pattern: readonly boolean[], spread: number): void {
  const hitSteps = enabledStepIndexes(pattern);
  if (hitSteps.length < 2 || hasBipolarPitchVariation(values, hitSteps)) return;

  const amplitude = Math.max(6, Math.min(SCATTER_PITCH_OFFSET_LIMIT, Math.round(spread * 0.72)));
  hitSteps.forEach((step, index) => {
    const phase = hitSteps.length <= 1 ? 0 : index / (hitSteps.length - 1);
    const sweep = Math.round((phase * 2 - 1) * amplitude);
    const alternate = Math.round((index % 2 === 0 ? -1 : 1) * amplitude * 0.28);
    values[step] = clampPitchOffset((values[step] ?? 0) * 0.25 + sweep * 0.55 + alternate * 0.2);
  });

  if (!hasBipolarPitchVariation(values, hitSteps)) {
    const first = hitSteps[0];
    const last = hitSteps[hitSteps.length - 1];
    if (first !== undefined) values[first] = -amplitude;
    if (last !== undefined) values[last] = amplitude;
  }
}

function labelFor(engine: DrumVoiceType, hits: number, zone: ScatterFeelZone, contour: ScatterContour): string {
  const voice = DRUM_VOICES[engine]?.label ?? engine;
  return `${voice} · ${hits} · ${zone === 'pulse' ? zone : contour}`;
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
  const instability = instabilityFromFeelX(engineState.feelX);
  const randomWalk = engineState.randomWalkEnabled ? clampUnit(engineState.randomWalk ?? 0) : 0;
  const motion = clampUnit(engineState.rules.motion + chaos * 0.3);
  const fracture = clampUnit(engineState.rules.fracture + chaos * 0.5);
  const spread = clampUnit(engineState.rules.spread + chaos * 0.35);
  const hitTarget = hitTargetForSteps(steps, engineState.burstProbability);
  const rotation = euclideanRotation({
    steps,
    anchor: engineState.rules.anchor,
    breath: engineState.rules.breath,
    chaos,
    fracture,
    instability,
    rng,
  });
  const pattern = seqEuclidean(steps, hitTarget, rotation);
  const hits = pattern.filter(Boolean).length;
  const contour = contourFor(engineState.feelX, zone, randomWalk, rng);
  const contourDirection = contourDirectionFor(contour, rng);
  const hitSteps = enabledStepIndexes(pattern);
  const primaryValues = contourValuesForHits({
    hits,
    contour,
    direction: contourDirection,
    instability,
    randomWalk,
    chaos,
    rng,
  });
  const laneRandomness = clampUnit(instability * 0.72 + chaos * 0.16);
  const pitchSpread = Math.max(
    8,
    Math.min(SCATTER_PITCH_OFFSET_LIMIT, Math.round(12 + chaos * 16 + spread * 20 + motion * 8 + instability * 14)),
  );
  const expressionFloor = clampUnit(0.7 - chaos * 0.22 - instability * 0.18);
  const expressionCeiling = clampUnit(0.92 + chaos * 0.04 + instability * 0.08);
  const probability = Array.from({ length: steps }, () => 1);
  const expression = Array.from({ length: steps }, () => 0.78);
  const morph = Array.from({ length: steps }, () => 0.5);
  const distance = Array.from({ length: steps }, () => 0.5);
  const pitch = Array.from({ length: steps }, () => 0);

  hitSteps.forEach((step, hitIndex) => {
    const primary = primaryValues[hitIndex] ?? 0.5;
    const pitchValue = decorrelateValue(primary, laneRandomness, rng);
    const expressionValue = decorrelateValue(primary, laneRandomness * 0.8 + chaos * 0.08, rng);
    const morphValue = decorrelateValue(primary, laneRandomness * 0.65, rng);
    const distanceValue = decorrelateValue(1 - primary, laneRandomness * 0.58 + spread * 0.15, rng);
    const morphDepth = clampUnit(0.32 + motion * 0.48 + instability * 0.2);
    const distanceDepth = clampUnit(0.54 + spread * 0.34 + instability * 0.18);

    pitch[step] = clampPitchOffset((pitchValue - 0.5) * pitchSpread * 2);
    expression[step] = clampUnit(expressionFloor + expressionValue * (expressionCeiling - expressionFloor));
    morph[step] = clampUnit(0.5 + (morphValue - 0.5) * morphDepth * 2);
    distance[step] = clampUnit(0.5 + (distanceValue - 0.5) * distanceDepth * 2);
  });

  ensureUnitVariation(expression, pattern, 0.06 + motion * 0.08 + fracture * 0.08 + instability * 0.1);
  ensureUnitVariation(morph, pattern, 0.07 + motion * 0.18 + instability * 0.08);
  ensureUnitVariation(distance, pattern, 0.08 + spread * 0.16 + fracture * 0.08 + instability * 0.08);
  ensurePitchVariation(pitch, pattern, pitchSpread);
  ensureBipolarPitchVariation(pitch, pattern, pitchSpread);

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
  const trigCondition: TrigCondition[] = Array.from({ length: steps }, () => [1, 1]);
  const slice = Array.from({ length: steps }, () => 0);
  const reverse = Array.from({ length: steps }, () => 0);
  const nudge = pattern
    .filter(Boolean)
    .map(() => 0);
  const directions = {
    pitch: 'forward' as const,
    expression: 'forward' as const,
    morph: 'forward' as const,
    distance: 'forward' as const,
    nudge: 'forward' as const,
    slice: 'forward' as const,
    reverse: 'forward' as const,
  };
  const label = labelFor(engine, hits, zone, contour);
  const triggerClip = createEuclideanTriggerClip({
    preset: 'custom',
    steps,
    hits,
    rotation,
    label,
  });
  const hasSlice = slice.some((value) => value > 0);
  const hasReverse = reverse.some((value) => value > 0);
  const hasNudge = nudge.some((value) => Math.abs(value) > 0.001);
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
      rotation,
      contour,
      hasRatchet: ratchet.some((value) => value > 1),
      hasSlice,
      hasReverse,
    },
  };
}
