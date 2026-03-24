/**
 * Synth (Lead) Euclidean sequencer evolution engine.
 * Operates on the synth's native override arrays: (number[] | null)[] per lane.
 * Reuses shared mutation utilities from seqEvolveTypes.ts and seqEvolveCore.ts.
 */
import type { LaneDirection } from './drumSeqTypes';
import {
  SUB_LANE_VALUE_CONFIGS,
  mutateValueDrift,
  mutateValueScramble,
  mutateValueWiden,
  gravityPullValues,
} from './seqEvolveTypes';
import type { SubLaneValueConfig } from './seqEvolveTypes';
import { clamp, chance, drift, tensionGate, randomOtherDirection, maskByWriteOffset, mutateRatchetHomeBiased } from './seqEvolveCore';

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export type SynthEvolveMethod =
  | 'swingDrift'
  | 'probDrift'
  | 'ratchetSpray'
  | 'pitchWalk'
  | 'valueDrift'
  | 'valueScramble'
  | 'valueWiden'
  | 'subLaneLengthDrift'
  | 'subLaneDirectionFlip'
  | 'triggerToggle';

export interface SynthEvolveConfig {
  enabled: boolean;
  everyBars: number;
  evolution: number;       // 0-1 intensity
  writeOffset: number | 'auto';
  mutationMode: 'strict' | 'biased';
  methods: Record<SynthEvolveMethod, boolean>;
  enabledSubLanes?: string[];  // which sub-lanes participate in evolution
}

/** Per-lane overrides — the unit the evolve function operates on */
export interface SynthLaneOverrides {
  pitch: number[] | null;
  pitchDirection: LaneDirection | null;
  triggerToggles: Map<number, boolean>;
  expression: number[] | null;
  expressionDirection: LaneDirection | null;
  morph: number[] | null;
  morphDirection: LaneDirection | null;
  distance: number[] | null;
  distanceDirection: LaneDirection | null;
  probability: number[] | null;
  ratchet: number[] | null;
}

/** Mutable per-lane evolve state stored in the engine */
export interface SynthEvolveState {
  lastEvolveBar: number;
  home: SynthLaneOverrides | null;
  homeSwing: number;
  homeNoteRangeMin: number | null;
  homeNoteRangeMax: number | null;
}

/** Sub-lanes that participate in synth evolution */
type SynthSubLane = 'pitch' | 'expression' | 'morph' | 'distance' | 'probability' | 'ratchet';

const ALL_SYNTH_SUB_LANES: SynthSubLane[] = ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'];

/** Value configs for synth sub-lanes (reuse from shared where possible, add synth-specific) */
const SYNTH_SUB_LANE_CONFIGS: Record<SynthSubLane, SubLaneValueConfig> = {
  pitch:       SUB_LANE_VALUE_CONFIGS.pitch,       // integer, -12..12, driftScale 1
  expression:  SUB_LANE_VALUE_CONFIGS.expression,   // continuous, 0.2..1.0, driftScale 0.08
  morph:       SUB_LANE_VALUE_CONFIGS.morph,         // continuous, 0..1.0, driftScale 0.05
  distance:    SUB_LANE_VALUE_CONFIGS.distance,      // continuous, 0..1.0, driftScale 0.06
  probability: { type: 'continuous', min: 0.3, max: 1.0, driftScale: 0.06 },
  ratchet:     { type: 'integer', min: 1, max: 4, driftScale: 1 },
};

// ═══════════════════════════════════════════════════════════════════════
// Sub-lane accessors
// ═══════════════════════════════════════════════════════════════════════

function getValues(ov: SynthLaneOverrides, lane: SynthSubLane): number[] | null {
  return ov[lane];
}

function setValues(ov: SynthLaneOverrides, lane: SynthSubLane, values: number[] | null): void {
  (ov as unknown as Record<string, unknown>)[lane] = values;
}

const DIRECTION_LANES: Record<string, keyof SynthLaneOverrides> = {
  pitch: 'pitchDirection',
  expression: 'expressionDirection',
  morph: 'morphDirection',
  distance: 'distanceDirection',
};

function getDirection(ov: SynthLaneOverrides, lane: SynthSubLane): LaneDirection | null {
  const key = DIRECTION_LANES[lane];
  return key ? (ov[key] as LaneDirection | null) : null;
}

function setDirection(ov: SynthLaneOverrides, lane: SynthSubLane, dir: LaneDirection): void {
  const key = DIRECTION_LANES[lane];
  if (key) (ov as unknown as Record<string, unknown>)[key] = dir;
}

// ═══════════════════════════════════════════════════════════════════════
// Home snapshot
// ═══════════════════════════════════════════════════════════════════════

export function captureSynthHomeSnapshot(ov: SynthLaneOverrides): SynthLaneOverrides {
  return {
    pitch: ov.pitch ? [...ov.pitch] : null,
    pitchDirection: ov.pitchDirection,
    triggerToggles: new Map(ov.triggerToggles),
    expression: ov.expression ? [...ov.expression] : null,
    expressionDirection: ov.expressionDirection,
    morph: ov.morph ? [...ov.morph] : null,
    morphDirection: ov.morphDirection,
    distance: ov.distance ? [...ov.distance] : null,
    distanceDirection: ov.distanceDirection,
    probability: ov.probability ? [...ov.probability] : null,
    ratchet: ov.ratchet ? [...ov.ratchet] : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Main evolve function
// ═══════════════════════════════════════════════════════════════════════

export interface SynthEvolveContext {
  effectiveTension?: number;
  swing?: number;       // current lane swing value, returned mutated
  steps?: number;       // sequencer step count, used to auto-init null sub-lanes
  scaleIntervals?: number[];  // scale intervals for scale-degree-aware pitch walking
  pitchMode?: 'semitones' | 'notes' | 'noteRange';  // pitch mode for scale-aware walking
  noteRangeMin?: number;  // current noteRange min (MIDI), for noteRange mode evolution
  noteRangeMax?: number;  // current noteRange max (MIDI), for noteRange mode evolution
}

export interface SynthEvolveResult {
  overrides: SynthLaneOverrides;
  swing: number;
  changed: boolean;
  noteRangeMin?: number;  // evolved noteRange min (MIDI), when pitchMode === 'noteRange'
  noteRangeMax?: number;  // evolved noteRange max (MIDI), when pitchMode === 'noteRange'
}

/**
 * Evolve a single synth lane's overrides.
 * Returns a new object with mutated values (never mutates input).
 */
export function evolveSynthLane(
  overrides: SynthLaneOverrides,
  config: SynthEvolveConfig,
  state: SynthEvolveState,
  currentBar: number,
  rng: () => number,
  ctx: SynthEvolveContext = {},
): SynthEvolveResult {
  const swing = ctx.swing ?? 0;

  if (!config.enabled) return { overrides, swing, changed: false };
  if (currentBar - state.lastEvolveBar < config.everyBars) return { overrides, swing, changed: false };

  // Deep-copy overrides
  const next: SynthLaneOverrides = {
    pitch: overrides.pitch ? [...overrides.pitch] : null,
    pitchDirection: overrides.pitchDirection,
    triggerToggles: new Map(overrides.triggerToggles),
    expression: overrides.expression ? [...overrides.expression] : null,
    expressionDirection: overrides.expressionDirection,
    morph: overrides.morph ? [...overrides.morph] : null,
    morphDirection: overrides.morphDirection,
    distance: overrides.distance ? [...overrides.distance] : null,
    distanceDirection: overrides.distanceDirection,
    probability: overrides.probability ? [...overrides.probability] : null,
    ratchet: overrides.ratchet ? [...overrides.ratchet] : null,
  };

  // Capture home on first evolve pass
  if (!state.home) {
    state.home = captureSynthHomeSnapshot(overrides);
    state.homeSwing = swing;
    if (ctx.pitchMode === 'noteRange' && ctx.noteRangeMin !== undefined && ctx.noteRangeMax !== undefined) {
      state.homeNoteRangeMin = ctx.noteRangeMin;
      state.homeNoteRangeMax = ctx.noteRangeMax;
    }
  }
  state.lastEvolveBar = currentBar;

  // Auto-initialize null sub-lane arrays so evolve has something to mutate
  const stepCount = ctx.steps ?? next.pitch?.length ?? next.expression?.length ?? 16;
  const enabledSubs = new Set<string>(config.enabledSubLanes ?? ALL_SYNTH_SUB_LANES);
  for (const lane of ALL_SYNTH_SUB_LANES) {
    if (!enabledSubs.has(lane)) continue;
    if (getValues(next, lane) === null) {
      const cfg = SYNTH_SUB_LANE_CONFIGS[lane];
      const defaultVal = lane === 'pitch' ? 0
        : lane === 'ratchet' ? 1
        : lane === 'probability' ? 1.0
        : (cfg.min + cfg.max) / 2;
      setValues(next, lane, new Array(stepCount).fill(defaultVal));
      // Also set home for the newly initialized lane
      if (state.home && getValues(state.home, lane) === null) {
        setValues(state.home, lane, new Array(stepCount).fill(defaultVal));
      }
    }
  }

  const intensity = clamp(config.evolution, 0, 1);
  const methods = config.methods;
  const home = state.home;
  const tension = ctx.effectiveTension;
  const mode = config.mutationMode ?? 'biased';

  /** Local shorthand for tension gate */
  const tGate = (methodName: string, baseProbability: number): boolean =>
    tensionGate(rng, methodName, baseProbability, tension);

  let nextSwing = swing;

  // ═══════════════════════════════════════════════════════════════════
  // Swing Drift
  // ═══════════════════════════════════════════════════════════════════
  if (methods.swingDrift && tGate('swingDrift', 1)) {
    nextSwing = clamp(drift(nextSwing, 0.03 * intensity, rng), 0, 0.75);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Probability Drift — per-step probability sub-lane
  // ═══════════════════════════════════════════════════════════════════
  if (methods.probDrift && tGate('probDrift', 1) && enabledSubs.has('probability') && next.probability) {
    next.probability = next.probability.map(p =>
      clamp(drift(p, 0.15 * intensity, rng), 0.2, 1.0)
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // Ratchet Spray — toggle between 1 and 2
  // ═══════════════════════════════════════════════════════════════════
  if (methods.ratchetSpray && tGate('ratchetSpray', 0.4 * intensity) && enabledSubs.has('ratchet') && next.ratchet) {
    const idx = Math.floor(rng() * next.ratchet.length);
    const homeVal = home?.ratchet?.[idx] ?? 1;
    next.ratchet[idx] = mutateRatchetHomeBiased(next.ratchet[idx], homeVal, intensity, rng);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Pitch Walk — operates on relative offsets (semitones or scale degrees)
  // Bypasses tension gate so pitch always evolves at full probability
  // ═══════════════════════════════════════════════════════════════════
  if (methods.pitchWalk && chance(rng, 0.6 * intensity) && enabledSubs.has('pitch') && next.pitch) {
    const si = ctx.scaleIntervals;
    const useScaleDegrees = ctx.pitchMode === 'notes' && si && si.length > 0;
    // Walk multiple steps at high intensity
    const walkStepCount = intensity > 0.7 ? (rng() < intensity ? 2 : 1) : 1;
    for (let w = 0; w < walkStepCount; w++) {
      const idx = Math.floor(rng() * next.pitch.length);
      const homeVal = home?.pitch ? (home.pitch[idx] ?? next.pitch[idx]) : next.pitch[idx];

      if (useScaleDegrees) {
        // Walk by scale degree with octave tracking (like drum evolve)
        const cur = next.pitch[idx];
        const dir = rng() < 0.5 ? -1 : 1;
        const newVal = cur + dir;  // ±1 scale degree
        if (Math.abs(newVal - homeVal) <= 7) {  // ±7 scale degrees from home
          next.pitch[idx] = newVal;
        }
      } else {
        // Semitone mode: ±1 or ±2 semitone offsets
        const step = (intensity > 0.6 && rng() < intensity) ? 2 : 1;
        const dir = rng() < 0.5 ? -step : step;
        const newVal = next.pitch[idx] + dir;
        if (Math.abs(newVal - homeVal) <= 5) {  // ±5 semitones from home
          next.pitch[idx] = clamp(newVal, -48, 48);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Note Range Walk — shift and widen noteMin/noteMax bounds (noteRange mode)
  // ═══════════════════════════════════════════════════════════════════
  let evolvedNoteRangeMin: number | undefined;
  let evolvedNoteRangeMax: number | undefined;
  if (methods.pitchWalk && ctx.pitchMode === 'noteRange' && chance(rng, 0.6 * intensity)
    && ctx.noteRangeMin !== undefined && ctx.noteRangeMax !== undefined) {
    const homeMin = state.homeNoteRangeMin ?? ctx.noteRangeMin;
    const homeMax = state.homeNoteRangeMax ?? ctx.noteRangeMax;
    let nMin = ctx.noteRangeMin;
    let nMax = ctx.noteRangeMax;

    // Shift both bounds together (±1-2 semitones, intensity-scaled)
    const shiftStep = (intensity > 0.5 && rng() < intensity) ? 2 : 1;
    const shiftDir = rng() < 0.5 ? -shiftStep : shiftStep;
    nMin += shiftDir;
    nMax += shiftDir;

    // At higher intensity (>0.6): also widen or narrow the range
    if (intensity > 0.6 && rng() < (intensity - 0.4)) {
      const widenStep = (intensity > 0.8 && rng() < intensity) ? 2 : 1;
      nMin -= widenStep;  // lower bound moves down
      nMax += widenStep;  // upper bound moves up
    }

    // Enforce minimum 2-semitone gap
    if (nMax - nMin < 2) {
      const mid = (nMin + nMax) / 2;
      nMin = Math.floor(mid - 1);
      nMax = Math.ceil(mid + 1);
    }

    // Clamp midpoint drift from home (±12 semitones from home midpoint)
    const homeMid = (homeMin + homeMax) / 2;
    const curMid = (nMin + nMax) / 2;
    if (Math.abs(curMid - homeMid) > 12) {
      const overshoot = curMid - homeMid;
      const correction = overshoot > 0 ? overshoot - 12 : overshoot + 12;
      nMin -= Math.round(correction);
      nMax -= Math.round(correction);
    }

    // Clamp to absolute bounds (SeqLane sliders: 36-96)
    nMin = clamp(nMin, 36, 94);
    nMax = clamp(nMax, nMin + 2, 96);

    evolvedNoteRangeMin = nMin;
    evolvedNoteRangeMax = nMax;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Generic sub-lane value mutations
  // ═══════════════════════════════════════════════════════════════════

  // Value Drift — nudge values within their natural range
  if (methods.valueDrift && tGate('valueDrift', 1)) {
    for (const lane of ALL_SYNTH_SUB_LANES) {
      if (lane === 'pitch') continue; // pitch has pitchWalk
      if (!enabledSubs.has(lane)) continue;
      const vals = getValues(next, lane);
      if (!vals) continue;
      const cfg = SYNTH_SUB_LANE_CONFIGS[lane];
      setValues(next, lane, mutateValueDrift(vals, cfg, intensity, rng, mode));
    }
  }

  // Value Scramble — reorder step values (Zone A/B, ~0.4+)
  if (methods.valueScramble && intensity > 0.4 && tGate('valueScramble', 0.3 * intensity)) {
    const swaps = Math.max(2, Math.floor(intensity * 6));
    for (const lane of ALL_SYNTH_SUB_LANES) {
      if (!enabledSubs.has(lane)) continue;
      const vals = getValues(next, lane);
      if (!vals || rng() < 0.5) continue;
      setValues(next, lane, mutateValueScramble(vals, swaps, rng));
    }
  }

  // Value Widen — expand range/contrast (Zone B, ~0.6+)
  if (methods.valueWiden && intensity > 0.6 && tGate('valueWiden', 0.15 * intensity)) {
    for (const lane of ALL_SYNTH_SUB_LANES) {
      if (lane === 'pitch') continue; // pitch range controlled by pitchWalk
      if (!enabledSubs.has(lane)) continue;
      const vals = getValues(next, lane);
      if (!vals || rng() < 0.5) continue;
      const cfg = SYNTH_SUB_LANE_CONFIGS[lane];
      setValues(next, lane, mutateValueWiden(vals, cfg, intensity, rng));
    }
  }

  // Sub-Lane Direction Flip (Zone B, ~0.8+)
  if (methods.subLaneDirectionFlip && intensity > 0.8 && tGate('subLaneDirectionFlip', 0.08 * intensity)) {
    const dirLanes = Object.keys(DIRECTION_LANES) as SynthSubLane[];
    const activeDirLanes = dirLanes.filter(l => getValues(next, l) !== null);
    if (activeDirLanes.length > 0) {
      const lane = activeDirLanes[Math.floor(rng() * activeDirLanes.length)];
      const current = getDirection(next, lane) ?? 'forward';
      setDirection(next, lane, randomOtherDirection(current, rng));
    }
  }

  // Sub-Lane Length Drift — ±1 step on a random sub-lane for polyrhythm (Zone B, ~0.5+)
  if (methods.subLaneLengthDrift && intensity > 0.5 && chance(rng, 0.25 * intensity)) {
    const activeLanes = ALL_SYNTH_SUB_LANES.filter(l => enabledSubs.has(l) && getValues(next, l) !== null);
    if (activeLanes.length > 0) {
      const lane = activeLanes[Math.floor(rng() * activeLanes.length)];
      const vals = getValues(next, lane)!;
      const dir = rng() < 0.5 ? -1 : 1;
      const newLen = clamp(vals.length + dir, 2, 32);
      if (newLen !== vals.length) {
        if (newLen > vals.length) {
          // Grow: duplicate last value
          const grown = [...vals, vals[vals.length - 1]];
          setValues(next, lane, grown);
        } else {
          // Shrink: trim last element
          setValues(next, lane, vals.slice(0, newLen));
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Trigger Toggle — flip random steps on/off (Zone B: rhythm, >0.3)
  // ═══════════════════════════════════════════════════════════════════
  if (methods.triggerToggle && intensity > 0.3 && tGate('triggerToggle', 0.55 * intensity)) {
    const toggleCount = Math.max(1, Math.floor((intensity - 0.3) * 5)); // 1-4 toggles at max
    for (let t = 0; t < toggleCount; t++) {
      const idx = Math.floor(rng() * stepCount);
      const current = next.triggerToggles.get(idx);
      if (current === undefined) {
        // Not yet overridden — flip from whatever the Euclidean pattern would give
        next.triggerToggles.set(idx, rng() < 0.5);
      } else {
        // Already overridden — either flip or remove override (return to pattern)
        if (rng() < 0.3) {
          next.triggerToggles.delete(idx); // revert to Euclidean pattern
        } else {
          next.triggerToggles.set(idx, !current);
        }
      }
    }
  }

  // Write-offset masking: restrict mutations to a single step per cycle
  if (config.writeOffset !== 0) {
    for (const lane of ALL_SYNTH_SUB_LANES) {
      const orig = getValues(overrides, lane);
      const curr = getValues(next, lane);
      if (orig && curr && orig.length === curr.length) {
        setValues(next, lane, maskByWriteOffset(orig, curr, config.writeOffset, currentBar));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Home gravity — pull mutated values back toward home snapshot
  // ═══════════════════════════════════════════════════════════════════
  if (home && chance(rng, 0.15 * (1.2 - intensity))) {
    // Swing gravity
    nextSwing += (state.homeSwing - nextSwing) * 0.3;

    // Sub-lane value gravity
    const lane = ALL_SYNTH_SUB_LANES[Math.floor(rng() * ALL_SYNTH_SUB_LANES.length)];
    const currentVals = getValues(next, lane);
    const homeVals = getValues(home, lane);
    if (currentVals && homeVals) {
      const cfg = SYNTH_SUB_LANE_CONFIGS[lane];
      setValues(next, lane, gravityPullValues(currentVals, homeVals, cfg, 0.2));
      // Length gravity: if array drifted in length, pull back toward home length
      if (currentVals.length !== homeVals.length) {
        const pullDir = currentVals.length > homeVals.length ? -1 : 1;
        const pulled = pullDir > 0
          ? [...currentVals, currentVals[currentVals.length - 1]]
          : currentVals.slice(0, currentVals.length - 1);
        if (pulled.length >= 2) setValues(next, lane, pulled);
      }
    }
  }

  // Note range gravity (pull evolved noteRange back toward home)
  if (home && evolvedNoteRangeMin !== undefined && evolvedNoteRangeMax !== undefined
    && state.homeNoteRangeMin !== null && state.homeNoteRangeMax !== null
    && chance(rng, 0.15 * (1.2 - intensity))) {
    evolvedNoteRangeMin += Math.round((state.homeNoteRangeMin - evolvedNoteRangeMin) * 0.3);
    evolvedNoteRangeMax += Math.round((state.homeNoteRangeMax - evolvedNoteRangeMax) * 0.3);
  }

  // Direction gravity
  if (home && chance(rng, 0.15 * (1.2 - intensity))) {
    const dirLanes = Object.keys(DIRECTION_LANES) as SynthSubLane[];
    const lane = dirLanes[Math.floor(rng() * dirLanes.length)];
    const homeDir = getDirection(home, lane);
    const currentDir = getDirection(next, lane);
    if (homeDir && currentDir && homeDir !== currentDir) {
      setDirection(next, lane, homeDir);
    }
  }

  // Trigger toggle gravity — revert overridden triggers toward home
  if (home && next.triggerToggles.size > 0 && chance(rng, 0.15 * (1.2 - intensity))) {
    const keys = Array.from(next.triggerToggles.keys());
    const key = keys[Math.floor(rng() * keys.length)];
    const homeHas = home.triggerToggles.has(key);
    if (!homeHas) {
      next.triggerToggles.delete(key); // home had no override → remove ours
    } else {
      next.triggerToggles.set(key, home.triggerToggles.get(key)!);
    }
  }

  return {
    overrides: next,
    swing: nextSwing,
    changed: true,
    noteRangeMin: evolvedNoteRangeMin,
    noteRangeMax: evolvedNoteRangeMax,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Reset to home
// ═══════════════════════════════════════════════════════════════════════

export function resetSynthLaneToHome(
  overrides: SynthLaneOverrides,
  state: SynthEvolveState,
): SynthLaneOverrides {
  if (!state.home) return overrides;
  return captureSynthHomeSnapshot(state.home);
}

// ═══════════════════════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════════════════════

export function defaultSynthEvolveConfig(): SynthEvolveConfig {
  return {
    enabled: false,
    everyBars: 4,
    evolution: 0.5,
    writeOffset: 0,
    mutationMode: 'biased',
    methods: defaultSynthEvolveMethods(),
  };
}

export function defaultSynthEvolveMethods(): Record<SynthEvolveMethod, boolean> {
  return {
    swingDrift: true,
    probDrift: false,
    ratchetSpray: false,
    pitchWalk: false,
    valueDrift: true,
    valueScramble: false,
    valueWiden: false,
    subLaneLengthDrift: false,
    subLaneDirectionFlip: false,
    triggerToggle: true,
  };
}

export function defaultSynthEvolveState(): SynthEvolveState {
  return {
    lastEvolveBar: 0,
    home: null,
    homeSwing: 0,
    homeNoteRangeMin: null,
    homeNoteRangeMax: null,
  };
}
