import type { LaneDirection, SequencerSnapshot, SequencerState } from './drumSeqTypes';
import { seqEuclidean } from './drumSequencer';
import {
  SUB_LANE_VALUE_CONFIGS,
  mutateValueDrift,
  mutateValueScramble,
  mutateValueWiden,
  gravityPullValues,
} from './seqEvolveTypes';
import type { MutationMode } from './seqEvolveTypes';
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

function getSnapshotValues(snap: SequencerSnapshot, lane: SubLaneName): number[] {
  if (lane === 'expression') return snap.expression.velocities;
  if (lane === 'pitch') return snap.pitch.offsets;
  return snap[lane].values;
}

const ALL_SUB_LANES: SubLaneName[] = ['expression', 'morph', 'distance', 'pitch', 'slice', 'reverse'];

/** Type-safe sub-lane steps update (avoids TS union narrowing issue with indexed access) */
function setSubLaneSteps(s: SequencerState, lane: SubLaneName, steps: number): void {
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
      pattern: [...s.trigger.pattern],
    },
    pitch: {
      offsets: [...s.pitch.offsets],
      root: s.pitch.root,
      scale: s.pitch.scale,
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
  /** Which sub-lanes participate (defaults to ALL_SUB_LANES for drums) */
  enabledSubLanes?: SubLaneName[];
  /** Per-engine effective tension (0-1), used for method probability bias */
  effectiveTension?: number;
  /** Current harmony scale intervals (e.g. [0,2,4,5,7,9,11] for Major).
   *  When present AND pitch scaleQuantize is enabled, pitchWalk uses
   *  scale-degree steps instead of chromatic ±1 semitones. */
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
    slice: { ...s.slice, values: [...s.slice.values] },
    reverse: { ...s.reverse, values: [...s.reverse.values] },
    evolve: { ...s.evolve, lastEvolveBar: currentBar },
  };

  const intensity = clamp(next.evolve.evolution, 0, 1);
  const methods = next.evolve.methods;
  const home = next.evolve.home;
  const mode: MutationMode = next.evolve.mutationMode ?? 'biased';

  const activeLanes: SubLaneName[] = ctx.enabledSubLanes ?? ALL_SUB_LANES;
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
      next.trigger.ratchet[idx] = mutateRatchetHomeBiased(next.trigger.ratchet[idx], homeVal, intensity, next.rng);
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
  //    When scaleQuantize is enabled and scaleIntervals are available,
  //    walk by scale degrees (interval jumps) instead of chromatic ±1 semitones.
  if (methods.pitchWalk && chance(next.rng, 0.55 * intensity)) {
    // Walk multiple steps at high intensity
    const walkStepCount = intensity > 0.8 ? (next.rng() < 0.5 ? 2 : 1) : 1;
    for (let w = 0; w < walkStepCount; w++) {
    const idx = Math.floor(next.rng() * next.pitch.offsets.length);
    const orig = home ? (home.pitch.offsets[idx] ?? 0) : 0;
    const si = ctx.scaleIntervals;
    const useScaleDegrees = next.pitch.scaleQuantize && si && si.length > 0;

    if (useScaleDegrees) {
      // Walk by one scale degree up or down
      const cur = next.pitch.offsets[idx];
      const octaves = Math.floor(cur / 12);
      const rem = ((cur % 12) + 12) % 12;
      // Find nearest scale degree index
      let bestDeg = 0;
      let bestDist = 99;
      for (let d = 0; d < si.length; d++) {
        const dist = Math.min(Math.abs(si[d] - rem), 12 - Math.abs(si[d] - rem));
        if (dist < bestDist) { bestDist = dist; bestDeg = d; }
      }
      const dir = next.rng() < 0.5 ? -1 : 1;
      let newDeg = bestDeg + dir;
      let newOct = octaves;
      if (newDeg < 0) { newDeg = si.length - 1; newOct--; }
      else if (newDeg >= si.length) { newDeg = 0; newOct++; }
      const newVal = newOct * 12 + si[newDeg];
      if (Math.abs(newVal - orig) <= 14) {
        next.pitch.offsets[idx] = newVal;
      }
    } else {
      const dir = next.rng() < 0.5 ? -1 : 1;
      const newVal = next.pitch.offsets[idx] + dir;
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
      const config = SUB_LANE_VALUE_CONFIGS[lane];
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
      const config = SUB_LANE_VALUE_CONFIGS[lane];
      const vals = getSubLaneValues(next, lane);
      setSubLaneValues(next, lane, mutateValueWiden(vals, config, intensity, next.rng));
    }
  }

  // Sub-Lane Length Drift — ±1 steps on a random sub-lane for polyrhythm (Zone B, ~0.5+)
  if (methods.subLaneLengthDrift && intensity > 0.5 && chance(next.rng, 0.25 * intensity)) {
    const lane = activeLanes[Math.floor(next.rng() * activeLanes.length)];
    const stepDir = next.rng() < 0.5 ? -1 : 1;
    setSubLaneSteps(next, lane, clamp(next[lane].steps + stepDir, 1, 16));
  }

  // Sub-Lane Direction Flip — change direction on a random sub-lane (Zone B, ~0.8+)
  if (methods.subLaneDirectionFlip && intensity > 0.8 && tGate('subLaneDirectionFlip', 0.08 * intensity)) {
    const lane = activeLanes[Math.floor(next.rng() * activeLanes.length)];
    setSubLaneDirection(next, lane, randomOtherDirection(next[lane].direction, next.rng));
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
          next.trigger.probability[i] += (hp - next.trigger.probability[i]) * 0.2;
        }
        break;
    }
  }

  // Sub-lane value gravity — pull all sub-lane values toward home
  if (home && chance(next.rng, 0.15 * (1.2 - intensity))) {
    const lane = activeLanes[Math.floor(next.rng() * activeLanes.length)];
    const config = SUB_LANE_VALUE_CONFIGS[lane];
    const currentVals = getSubLaneValues(next, lane);
    const homeVals = getSnapshotValues(home, lane);
    setSubLaneValues(next, lane, gravityPullValues(currentVals, homeVals, config, 0.2));
  }

  // Sub-lane steps/direction gravity — pull toward home
  if (home && chance(next.rng, 0.15 * (1.2 - intensity))) {
    const lane = activeLanes[Math.floor(next.rng() * activeLanes.length)];
    const homeLane = home[lane];
    if (next[lane].steps !== homeLane.steps) {
      const diff = next[lane].steps - homeLane.steps;
      setSubLaneSteps(next, lane, next[lane].steps + (diff > 0 ? -1 : 1));
    }
    if (next[lane].direction !== homeLane.direction) {
      setSubLaneDirection(next, lane, homeLane.direction);
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
      pattern: [...home.trigger.pattern],
      overrides: new Set<number>(),
    },
    pitch: {
      ...s.pitch,
      offsets: [...home.pitch.offsets],
      root: home.pitch.root,
      scale: home.pitch.scale,
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
