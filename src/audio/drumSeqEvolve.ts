import type { LaneDirection, SequencerSnapshot, SequencerState } from './drumSeqTypes';
import { seqEuclidean } from './drumSequencer';
import {
  SUB_LANE_VALUE_CONFIGS,
  mutateValueDrift,
  mutateValueScramble,
  mutateValueWiden,
  gravityPullValues,
} from './seqEvolveTypes';
import type { MutationMode, SubLaneValueConfig } from './seqEvolveTypes';
import { clamp, chance, drift, tensionGate, randomOtherDirection, maskByWriteOffset, mutateRatchetHomeBiased } from './seqEvolveCore';


function randomActiveStep(s: SequencerState): number | null {
  const active: number[] = [];
  for (let i = 0; i < s.trigger.pattern.length; i++) {
    if (s.trigger.pattern[i]) active.push(i);
  }
  if (active.length === 0) return null;
  return active[Math.floor(s.rng() * active.length)] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-lane accessor helpers (type-safe access to the differently-named values arrays)
// ═══════════════════════════════════════════════════════════════════════
export type SubLaneName = 'expression' | 'morph' | 'distance' | 'pitch' | 'slice' | 'reverse';
const EUCLIDEAN_STEP_MAX = 32;
const DRUM_AUDIO_SUB_LANES: SubLaneName[] = ['expression', 'morph', 'distance', 'pitch'];
const DRUM_AUDIO_SUB_LANE_SET = new Set<SubLaneName>(DRUM_AUDIO_SUB_LANES);
const DRUM_SUB_LANE_DEFAULT_VALUES: Record<SubLaneName, number> = {
  expression: 1,
  morph: 0,
  distance: 0,
  pitch: 0,
  slice: 0,
  reverse: 0,
};

function getSubLaneValues(s: SequencerState, lane: SubLaneName): number[] {
  if (lane === 'expression') return s.expression.velocities;
  if (lane === 'pitch') return s.pitch.offsets;
  return s[lane].values;
}

function setSubLaneValues(s: SequencerState, lane: SubLaneName, values: number[]): void {
  if (lane === 'expression') { s.expression.velocities = values; return; }
  if (lane === 'pitch') { s.pitch.offsets = values; return; }
  s[lane].values = values;
}

function resizeSubLaneValuesForSteps(lane: SubLaneName, values: number[], steps: number): number[] {
  if (values.length === steps) return values;
  const next = values.slice(0, steps);
  const fallback = values[values.length - 1] ?? DRUM_SUB_LANE_DEFAULT_VALUES[lane];
  while (next.length < steps) next.push(fallback);
  return next;
}

function getSnapshotValues(snap: SequencerSnapshot, lane: SubLaneName): number[] {
  if (lane === 'expression') return snap.expression.velocities;
  if (lane === 'pitch') return snap.pitch.offsets;
  return snap[lane].values;
}

function filterAudioSubLanes(lanes: readonly SubLaneName[]): SubLaneName[] {
  return lanes.filter((lane) => DRUM_AUDIO_SUB_LANE_SET.has(lane));
}

function getSubLaneConfig(lane: SubLaneName): SubLaneValueConfig {
  const config = SUB_LANE_VALUE_CONFIGS[lane];
  if (!config) {
    throw new Error(`Missing sub-lane config for ${lane}`);
  }
  return config;
}

function pickSubLane(lanes: readonly SubLaneName[], rng: () => number): SubLaneName | null {
  return lanes[Math.floor(rng() * lanes.length)] ?? null;
}

function getSubLaneSteps(source: SequencerState | SequencerSnapshot, lane: SubLaneName): number {
  switch (lane) {
    case 'expression': return source.expression.steps;
    case 'morph': return source.morph.steps;
    case 'distance': return source.distance.steps;
    case 'pitch': return source.pitch.steps;
    case 'slice': return source.slice.steps;
    case 'reverse': return source.reverse.steps;
  }
}

function getSubLaneDirection(source: SequencerState | SequencerSnapshot, lane: SubLaneName): LaneDirection {
  switch (lane) {
    case 'expression': return source.expression.direction;
    case 'morph': return source.morph.direction;
    case 'distance': return source.distance.direction;
    case 'pitch': return source.pitch.direction;
    case 'slice': return source.slice.direction;
    case 'reverse': return source.reverse.direction;
  }
}

/** Type-safe sub-lane steps update (avoids TS union narrowing issue with indexed access) */
function setSubLaneSteps(s: SequencerState, lane: SubLaneName, steps: number): void {
  const nextValues = resizeSubLaneValuesForSteps(lane, getSubLaneValues(s, lane), steps);
  setSubLaneValues(s, lane, nextValues);
  switch (lane) {
    case 'expression': s.expression = { ...s.expression, steps }; break;
    case 'morph':      s.morph = { ...s.morph, steps }; break;
    case 'distance':   s.distance = { ...s.distance, steps }; break;
    case 'pitch':      s.pitch = { ...s.pitch, steps }; break;
    case 'slice':      s.slice = { ...s.slice, steps }; break;
    case 'reverse':    s.reverse = { ...s.reverse, steps }; break;
  }
}

/** Type-safe sub-lane direction update */
function setSubLaneDirection(s: SequencerState, lane: SubLaneName, direction: LaneDirection): void {
  switch (lane) {
    case 'expression': s.expression = { ...s.expression, direction }; break;
    case 'morph':      s.morph = { ...s.morph, direction }; break;
    case 'distance':   s.distance = { ...s.distance, direction }; break;
    case 'pitch':      s.pitch = { ...s.pitch, direction }; break;
    case 'slice':      s.slice = { ...s.slice, direction }; break;
    case 'reverse':    s.reverse = { ...s.reverse, direction }; break;
  }
}

export function captureHomeSnapshot(s: SequencerState): SequencerSnapshot {
  return {
    trigger: {
      steps: s.trigger.steps,
      hits: s.trigger.hits,
      rotation: s.trigger.rotation,
      probability: [...s.trigger.probability],
      ratchet: [...s.trigger.ratchet],
      trigCondition: s.trigger.trigCondition.map((entry) => [entry[0], entry[1]]),
      pattern: [...s.trigger.pattern],
    },
    pitch: {
      offsets: [...s.pitch.offsets],
      mode: s.pitch.mode,
      root: s.pitch.root,
      scale: s.pitch.scale,
      scaleQuantize: s.pitch.scaleQuantize,
      steps: s.pitch.steps,
      direction: s.pitch.direction,
    },
    expression: {
      velocities: [...s.expression.velocities],
      steps: s.expression.steps,
      direction: s.expression.direction,
    },
    morph: {
      values: [...s.morph.values],
      steps: s.morph.steps,
      direction: s.morph.direction,
    },
    distance: {
      values: [...s.distance.values],
      steps: s.distance.steps,
      direction: s.distance.direction,
    },
    nudge: {
      values: [...s.nudge.values],
      steps: s.nudge.steps,
      direction: s.nudge.direction,
    },
    slice: {
      values: [...s.slice.values],
      steps: s.slice.steps,
      direction: s.slice.direction,
    },
    reverse: {
      values: [...s.reverse.values],
      steps: s.reverse.steps,
      direction: s.reverse.direction,
    },
    swing: s.swing,
  };
}

export interface EvolveContext {
  /** Which audio-backed sub-lanes participate. Slice/reverse are retained only for preset compatibility. */
  enabledSubLanes?: SubLaneName[];
  /** Per-engine effective tension (0-1), used for method probability bias */
  effectiveTension?: number;
  /** Current pitch scale intervals for semitones mode scale-degree walking. */
  scaleIntervals?: readonly number[];
}

export function evolveSequencer(
  s: SequencerState,
  currentBar: number,
  ctx: EvolveContext = {},
): SequencerState {
  if (!s.evolve.enabled) return s;
  if (currentBar - s.evolve.lastEvolveBar < s.evolve.everyBars) return s;

  const next: SequencerState = {
    ...s,
    trigger: {
      ...s.trigger,
      probability: [...s.trigger.probability],
      ratchet: [...s.trigger.ratchet],
      pattern: [...s.trigger.pattern],
      overrides: new Set(s.trigger.overrides),
    },
    pitch: { ...s.pitch, offsets: [...s.pitch.offsets] },
    expression: { ...s.expression, velocities: [...s.expression.velocities] },
    morph: { ...s.morph, values: [...s.morph.values] },
    distance: { ...s.distance, values: [...s.distance.values] },
    nudge: { ...s.nudge, values: [...s.nudge.values] },
    slice: { ...s.slice, values: [...s.slice.values] },
    reverse: { ...s.reverse, values: [...s.reverse.values] },
    evolve: { ...s.evolve, lastEvolveBar: currentBar },
  };

  const intensity = clamp(next.evolve.evolution, 0, 1);
  const methods = next.evolve.methods;
  const home = next.evolve.home;
  const mode: MutationMode = next.evolve.mutationMode ?? 'biased';

  const activeLanes: SubLaneName[] = filterAudioSubLanes(ctx.enabledSubLanes ?? DRUM_AUDIO_SUB_LANES);
  const tension = ctx.effectiveTension;

  /** Local shorthand: delegates to shared tensionGate with captured rng/tension */
  const tGate = (methodName: string, baseProbability: number): boolean =>
    tensionGate(next.rng, methodName, baseProbability, tension);

  // ═══════════════════════════════════════════════════════════════════════
  // Trigger-lane mutations (bespoke — structurally different from sub-lanes)
  // ═══════════════════════════════════════════════════════════════════════

  // 1. Rotate Drift — shift rotation ±1, chance scales with intensity
  if (methods.rotateDrift && tGate('rotateDrift', 0.4 + 0.4 * intensity)) {
    const dir = next.rng() < 0.5 ? 1 : -1;
    next.trigger.rotation = ((next.trigger.rotation + dir) % next.trigger.steps + next.trigger.steps) % next.trigger.steps;
  }

  // 2. Swing Drift — drift scaled by intensity
  if (methods.swingDrift && tGate('swingDrift', 1)) {
    next.swing = clamp(drift(next.swing, 0.03 * intensity, next.rng), 0, 0.75);
  }

  // 3. Probability Drift — only active steps, clamp [0.2, 1.0]
  if (methods.probDrift && tGate('probDrift', 1)) {
    next.trigger.probability = next.trigger.probability.map((p, i) => {
      if (!next.trigger.pattern[i]) return p;
      return clamp(drift(p, 0.15 * intensity, next.rng), 0.2, 1.0);
    });
  }

  // 4. Ghost Notes — cross-lane coordination (trigger + expression + distance)
  //    Only fires when 'expression' and 'distance' are in activeLanes (drum context).
  //    Sources check is drum-specific, skipped when sources is absent.
  if (methods.ghostNotes && tGate('ghostNotes', 0.55 * intensity)
      && activeLanes.includes('expression') && activeLanes.includes('distance')) {
    const hasSources = next.sources && typeof next.sources === 'object';
    const isMonoOnly = hasSources
      ? (() => {
          const monoVoices = new Set(['sub', 'kick']);
          const activeVoices = Object.entries(next.sources).filter(([, v]) => v).map(([k]) => k);
          return activeVoices.length > 0 && activeVoices.every(v => monoVoices.has(v));
        })()
      : false;  // no sources → not mono-only → allow ghost notes
    if (!isMonoOnly) {
      const inactiveSteps: number[] = [];
      for (let i = 0; i < next.trigger.steps; i++) {
        if (!next.trigger.pattern[i] && !next.trigger.overrides.has(i)) {
          inactiveSteps.push(i);
        }
      }
      if (inactiveSteps.length > 0) {
        const count = Math.min(3, Math.ceil(inactiveSteps.length * 0.25));
        for (let c = 0; c < count && inactiveSteps.length > 0; c++) {
          const pick = Math.floor(next.rng() * inactiveSteps.length);
          const idx = inactiveSteps.splice(pick, 1)[0]!;
          next.trigger.overrides.add(idx);
          next.trigger.pattern[idx] = true;
          next.trigger.probability[idx] = 0.15 + next.rng() * 0.2;
          next.expression.velocities[idx] = 0.2 + next.rng() * 0.2;
          next.distance.values[idx] = 0.6 + next.rng() * 0.2;
        }
      }
    }
  }

  // 5. Ratchet Spray — home-biased mutation, chance = 0.4 * intensity
  if (methods.ratchetSpray && tGate('ratchetSpray', 0.4 * intensity)) {
    const idx = randomActiveStep(next);
    if (idx !== null) {
      const homeVal = home?.trigger.ratchet[idx] ?? 1;
      const currentRatchet = next.trigger.ratchet[idx] ?? 1;
      next.trigger.ratchet[idx] = mutateRatchetHomeBiased(currentRatchet, homeVal, intensity, next.rng);
    }
  }

  // 6. Hit Drift — ±1 hits (or ±2 at very high intensity), chance = 0.45 * intensity
  if (methods.hitDrift && tGate('hitDrift', 0.45 * intensity)) {
    const step = intensity > 0.85 && next.rng() < 0.4 ? 2 : 1;
    const dir = next.rng() < 0.5 ? -step : step;
    const newHits = clamp(next.trigger.hits + dir, 1, next.trigger.steps - 1);
    if (newHits !== next.trigger.hits) {
      next.trigger.hits = newHits;
      next.trigger.overrides.clear();
    }
  }

  // 7. Pitch Walk — ±1 or ±2 steps, clamped ±5 from home (bespoke: home-relative constraint)
  //    Bypasses tension gate so pitch always evolves at full probability.
  //    In semitones mode, values are scale-degree offsets and walk by degree.
  if (methods.pitchWalk && activeLanes.includes('pitch') && chance(next.rng, 0.55 * intensity)) {
    // Walk multiple steps at high intensity
    const walkStepCount = intensity > 0.8 ? (next.rng() < 0.5 ? 2 : 1) : 1;
    for (let w = 0; w < walkStepCount; w++) {
      const idx = Math.floor(next.rng() * next.pitch.offsets.length);
      const currentOffset = next.pitch.offsets[idx] ?? 0;
      const orig = home ? (home.pitch.offsets[idx] ?? 0) : 0;
      const si = ctx.scaleIntervals;
      const useScaleDegrees = next.pitch.mode === 'semitones' && si && si.length > 0;

      if (useScaleDegrees) {
        const dir = next.rng() < 0.5 ? -1 : 1;
        const newVal = currentOffset + dir;
        if (Math.abs(newVal - orig) <= 7) {
          next.pitch.offsets[idx] = newVal;
        }
      } else {
        const dir = next.rng() < 0.5 ? -1 : 1;
        const newVal = currentOffset + dir;
        if (Math.abs(newVal - orig) <= 5) {
          next.pitch.offsets[idx] = newVal;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Generic sub-lane value mutations (unified across all sub-lanes)
  // ═══════════════════════════════════════════════════════════════════════

  // Value Drift — nudge values within their natural range (Zone A)
  if (methods.valueDrift && tGate('valueDrift', 1)) {
    for (const lane of activeLanes) {
      const config = getSubLaneConfig(lane);
      const vals = getSubLaneValues(next, lane);
      setSubLaneValues(next, lane, mutateValueDrift(vals, config, intensity, next.rng, mode));
    }
  }

  // Value Scramble — reorder step values (Zone A/B, ~0.4+)
  if (methods.valueScramble && intensity > 0.4 && tGate('valueScramble', 0.3 * intensity)) {
    const swaps = Math.max(2, Math.floor(intensity * 6));
    for (const lane of activeLanes) {
      // Only scramble each lane with 50% chance to keep changes sparse
      if (next.rng() < 0.5) continue;
      const vals = getSubLaneValues(next, lane);
      setSubLaneValues(next, lane, mutateValueScramble(vals, swaps, next.rng));
    }
  }

  // Value Widen — expand range/contrast (Zone B, ~0.6+)
  if (methods.valueWiden && intensity > 0.6 && tGate('valueWiden', 0.15 * intensity)) {
    for (const lane of activeLanes) {
      if (next.rng() < 0.5) continue;
      const config = getSubLaneConfig(lane);
      const vals = getSubLaneValues(next, lane);
      setSubLaneValues(next, lane, mutateValueWiden(vals, config, intensity, next.rng));
    }
  }

  // Sub-Lane Length Drift — ±1 steps on a random sub-lane for polyrhythm (Zone B, ~0.5+)
  if (methods.subLaneLengthDrift && intensity > 0.5 && chance(next.rng, 0.25 * intensity)) {
    const lane = pickSubLane(activeLanes, next.rng);
    if (lane) {
      const stepDir = next.rng() < 0.5 ? -1 : 1;
      setSubLaneSteps(next, lane, clamp(getSubLaneSteps(next, lane) + stepDir, 1, EUCLIDEAN_STEP_MAX));
    }
  }

  // Sub-Lane Direction Flip — change direction on a random sub-lane (Zone B, ~0.8+)
  if (methods.subLaneDirectionFlip && intensity > 0.8 && tGate('subLaneDirectionFlip', 0.08 * intensity)) {
    const lane = pickSubLane(activeLanes, next.rng);
    if (lane) {
      setSubLaneDirection(next, lane, randomOtherDirection(getSubLaneDirection(next, lane), next.rng));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Regenerate Euclidean pattern from (possibly changed) hits/rotation
  // ═══════════════════════════════════════════════════════════════════════
  next.trigger.pattern = seqEuclidean(next.trigger.steps, next.trigger.hits, next.trigger.rotation);

  // Write-offset masking: restrict sub-lane mutations to a single step per cycle
  const wo = next.evolve.writeOffset;
  if (wo !== 0) {
    for (const lane of activeLanes) {
      const origVals = getSubLaneValues(s, lane);
      const nextVals = getSubLaneValues(next, lane);
      setSubLaneValues(next, lane, maskByWriteOffset(origVals, nextVals, wo, currentBar));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Home gravity — pull mutated values back toward home snapshot
  // ═══════════════════════════════════════════════════════════════════════
  if (home && chance(next.rng, 0.15 * (1.2 - intensity))) {
    // Trigger-lane gravity targets
    const triggerTargets = ['rotation', 'swing', 'probability'];
    const target = triggerTargets[Math.floor(next.rng() * triggerTargets.length)];
    switch (target) {
      case 'rotation':
        if (next.trigger.rotation !== home.trigger.rotation) {
          const diff = next.trigger.rotation - home.trigger.rotation;
          const step = diff > 0 ? -1 : 1;
          next.trigger.rotation = ((next.trigger.rotation + step) % next.trigger.steps + next.trigger.steps) % next.trigger.steps;
          next.trigger.pattern = seqEuclidean(next.trigger.steps, next.trigger.hits, next.trigger.rotation);
          next.trigger.overrides.clear();
        }
        break;
      case 'swing':
        next.swing += (home.swing - next.swing) * 0.3;
        break;
      case 'probability':
        for (let i = 0; i < next.trigger.steps; i++) {
          const hp = home.trigger.probability[i] ?? 1;
          const probability = next.trigger.probability[i] ?? hp;
          next.trigger.probability[i] = probability + (hp - probability) * 0.2;
        }
        break;
    }
  }

  // Sub-lane value gravity — pull all sub-lane values toward home
  if (home && chance(next.rng, 0.15 * (1.2 - intensity))) {
    const lane = pickSubLane(activeLanes, next.rng);
    if (lane) {
      const config = getSubLaneConfig(lane);
      const currentVals = getSubLaneValues(next, lane);
      const homeVals = getSnapshotValues(home, lane);
      setSubLaneValues(next, lane, gravityPullValues(currentVals, homeVals, config, 0.2));
    }
  }

  // Sub-lane steps/direction gravity — pull toward home
  if (home && chance(next.rng, 0.15 * (1.2 - intensity))) {
    const lane = pickSubLane(activeLanes, next.rng);
    if (lane) {
      const nextSteps = getSubLaneSteps(next, lane);
      const homeSteps = getSubLaneSteps(home, lane);
      if (nextSteps !== homeSteps) {
        const diff = nextSteps - homeSteps;
        setSubLaneSteps(next, lane, nextSteps + (diff > 0 ? -1 : 1));
      }
      const nextDirection = getSubLaneDirection(next, lane);
      const homeDirection = getSubLaneDirection(home, lane);
      if (nextDirection !== homeDirection) {
        setSubLaneDirection(next, lane, homeDirection);
      }
    }
  }

  return next;
}

export function resetSequencerToHome(s: SequencerState): SequencerState {
  if (!s.evolve.home) return s;
  const home = s.evolve.home;
  return {
    ...s,
    swing: home.swing,
    trigger: {
      ...s.trigger,
      steps: home.trigger.steps,
      hits: home.trigger.hits,
      rotation: home.trigger.rotation,
      probability: [...home.trigger.probability],
      ratchet: [...home.trigger.ratchet],
      trigCondition: home.trigger.trigCondition.map((entry) => [entry[0], entry[1]]),
      pattern: [...home.trigger.pattern],
      overrides: new Set<number>(),
    },
    pitch: {
      ...s.pitch,
      offsets: [...home.pitch.offsets],
      mode: home.pitch.mode,
      root: home.pitch.root,
      scale: home.pitch.scale,
      scaleQuantize: home.pitch.scaleQuantize,
      steps: home.pitch.steps,
      direction: home.pitch.direction,
    },
    expression: {
      ...s.expression,
      velocities: [...home.expression.velocities],
      steps: home.expression.steps,
      direction: home.expression.direction,
    },
    morph: {
      ...s.morph,
      values: [...home.morph.values],
      steps: home.morph.steps,
      direction: home.morph.direction,
    },
    distance: {
      ...s.distance,
      values: [...home.distance.values],
      steps: home.distance.steps,
      direction: home.distance.direction,
    },
    nudge: {
      ...s.nudge,
      values: [...home.nudge.values],
      steps: home.nudge.steps,
      direction: home.nudge.direction,
    },
    slice: {
      ...s.slice,
      values: [...home.slice.values],
      steps: home.slice.steps,
      direction: home.slice.direction,
    },
    reverse: {
      ...s.reverse,
      values: [...home.reverse.values],
      steps: home.reverse.steps,
      direction: home.reverse.direction,
    },
  };
}
