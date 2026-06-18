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
  const probability = Array.from({ length: steps }, (_, step) => (
    pattern[step] ? clampUnit(0.95 - chaos * 0.2 + rng() * chaos * 0.2) : 1
  ));
  const expression = Array.from({ length: steps }, (_, step) => clampUnit(0.72 + contourValue(contour, step, steps, rng, chaos) * 0.28));
  const morph = Array.from({ length: steps }, (_, step) => clampUnit((0.5 - motion * 0.25) + contourValue(contour, step, steps, rng, chaos) * motion * 0.5));
  const distance = Array.from({ length: steps }, (_, step) => {
    const contourAmount = contourValue(contour, step, steps, rng, chaos);
    return clampUnit(engineState.feelX > 0 ? 1 - contourAmount * 0.6 : 0.35 + contourAmount * 0.55);
  });
  const pitchSpread = Math.max(2, Math.round(4 + chaos * 12));
  const pitch = Array.from({ length: steps }, (_, step) => {
    const centered = contourValue(contour, step, steps, rng, chaos) - 0.5;
    return Math.round(centered * pitchSpread);
  });
  const ratchet = Array.from({ length: steps }, (_, step) => {
    if (!pattern[step]) return 1;
    if (zone === 'pulse') return 1;
    if (rng() < fracture * 0.3) return rngInt(rng, 2, zone === 'scatter' ? 4 : 3);
    return 1;
  });
  const trigCondition = Array.from({ length: steps }, () => trigConditionFor(chaos, rng));
  const slice = Array.from({ length: steps }, (_, step) => (
    pattern[step] && rng() < fracture * 0.35 ? rngInt(rng, 1, 15) : 0
  ));
  const reverse = Array.from({ length: steps }, (_, step) => (
    pattern[step] && rng() < fracture * 0.22 ? 1 : 0
  ));
  const directions = {
    pitch: directionFor(zone, contour, rng),
    expression: zone === 'wave' ? 'pingpong' as const : 'forward' as const,
    morph: directionFor(zone, contour, rng),
    distance: directionFor(zone, contour, rng),
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
    slice,
    reverse,
    directions,
    subLaneEnabled: {
      pitch: chaos > 0.2 || motion > 0.45,
      expression: true,
      morph: chaos > 0.35 || motion > 0.55,
      distance: chaos > 0.25 || motion > 0.5,
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
