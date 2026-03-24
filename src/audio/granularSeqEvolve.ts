/**
 * Granular Euclidean sequencer evolution engine.
 * Mirrors synthSeqEvolve.ts but operates on granular-specific sub-lanes:
 * expression, pitch, slice, reverse, probability, ratchet.
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

export type GranularEvolveMethod =
  | 'swingDrift'
  | 'probDrift'
  | 'ratchetSpray'
  | 'pitchWalk'
  | 'valueDrift'
  | 'valueScramble'
  | 'valueWiden'
  | 'subLaneDirectionFlip';

export interface GranularEvolveConfig {
  enabled: boolean;
  everyBars: number;
  evolution: number; // 0-1 intensity
  writeOffset: number | 'auto';
  mutationMode: 'strict' | 'biased';
  methods: Record<GranularEvolveMethod, boolean>;
  enabledSubLanes?: string[];
}

/** Per-lane overrides — the unit the evolve function operates on */
export interface GranularLaneOverrides {
  pitch: number[] | null;
  pitchDirection: LaneDirection | null;
  triggerToggles: Map<number, boolean>;
  expression: number[] | null;
  expressionDirection: LaneDirection | null;
  slice: number[] | null;
  sliceDirection: LaneDirection | null;
  reverse: number[] | null;
  reverseDirection: LaneDirection | null;
  probability: number[] | null;
  ratchet: number[] | null;
}

/** Mutable per-lane evolve state stored in the engine */
export interface GranularEvolveState {
  lastEvolveBar: number;
  home: GranularLaneOverrides | null;
  homeSwing: number;
}

/** Sub-lanes that participate in granular evolution */
type GranularSubLane = 'pitch' | 'expression' | 'slice' | 'reverse' | 'probability' | 'ratchet';

const ALL_GRANULAR_SUB_LANES: GranularSubLane[] = ['pitch', 'expression', 'slice', 'reverse', 'probability', 'ratchet'];

/** Value configs for granular sub-lanes */
const GRANULAR_SUB_LANE_CONFIGS: Record<GranularSubLane, SubLaneValueConfig> = {
  pitch:       SUB_LANE_VALUE_CONFIGS.pitch,       // integer, -12..12, driftScale 1
  expression:  SUB_LANE_VALUE_CONFIGS.expression,   // continuous, 0.2..1.0, driftScale 0.08
  slice:       SUB_LANE_VALUE_CONFIGS.slice,         // integer, 0..15
  reverse:     SUB_LANE_VALUE_CONFIGS.reverse,       // integer, 0..1
  probability: { type: 'continuous', min: 0.3, max: 1.0, driftScale: 0.06 },
  ratchet:     { type: 'integer', min: 1, max: 4, driftScale: 1 },
};

// ═══════════════════════════════════════════════════════════════════════
// Sub-lane accessors
// ═══════════════════════════════════════════════════════════════════════

function getValues(ov: GranularLaneOverrides, lane: GranularSubLane): number[] | null {
  return ov[lane];
}

function setValues(ov: GranularLaneOverrides, lane: GranularSubLane, values: number[] | null): void {
  (ov as unknown as Record<string, unknown>)[lane] = values;
}

const DIRECTION_LANES: Record<string, keyof GranularLaneOverrides> = {
  pitch: 'pitchDirection',
  expression: 'expressionDirection',
  slice: 'sliceDirection',
  reverse: 'reverseDirection',
};

function getDirection(ov: GranularLaneOverrides, lane: GranularSubLane): LaneDirection | null {
  const key = DIRECTION_LANES[lane];
  return key ? (ov[key] as LaneDirection | null) : null;
}

function setDirection(ov: GranularLaneOverrides, lane: GranularSubLane, dir: LaneDirection): void {
  const key = DIRECTION_LANES[lane];
  if (key) (ov as unknown as Record<string, unknown>)[key] = dir;
}

// ═══════════════════════════════════════════════════════════════════════
// Home snapshot
// ═══════════════════════════════════════════════════════════════════════

export function captureGranularHomeSnapshot(ov: GranularLaneOverrides): GranularLaneOverrides {
  return {
    pitch: ov.pitch ? [...ov.pitch] : null,
    pitchDirection: ov.pitchDirection,
    triggerToggles: new Map(ov.triggerToggles),
    expression: ov.expression ? [...ov.expression] : null,
    expressionDirection: ov.expressionDirection,
    slice: ov.slice ? [...ov.slice] : null,
    sliceDirection: ov.sliceDirection,
    reverse: ov.reverse ? [...ov.reverse] : null,
    reverseDirection: ov.reverseDirection,
    probability: ov.probability ? [...ov.probability] : null,
    ratchet: ov.ratchet ? [...ov.ratchet] : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Main evolve function
// ═══════════════════════════════════════════════════════════════════════

export interface GranularEvolveContext {
  effectiveTension?: number;
  swing?: number;
}

export interface GranularEvolveResult {
  overrides: GranularLaneOverrides;
  swing: number;
  changed: boolean;
}

export function evolveGranularLane(
  overrides: GranularLaneOverrides,
  config: GranularEvolveConfig,
  state: GranularEvolveState,
  currentBar: number,
  rng: () => number,
  ctx: GranularEvolveContext = {},
): GranularEvolveResult {
  const swing = ctx.swing ?? 0;

  if (!config.enabled) return { overrides, swing, changed: false };
  if (currentBar - state.lastEvolveBar < config.everyBars) return { overrides, swing, changed: false };

  // Deep-copy overrides
  const next: GranularLaneOverrides = captureGranularHomeSnapshot(overrides);

  // Capture home on first evolve pass
  if (!state.home) {
    state.home = captureGranularHomeSnapshot(overrides);
    state.homeSwing = swing;
  }
  state.lastEvolveBar = currentBar;

  const intensity = clamp(config.evolution, 0, 1);
  const methods = config.methods;
  const home = state.home;
  const tension = ctx.effectiveTension;
  const mode = config.mutationMode ?? 'biased';
  const enabledSubs = new Set<string>(config.enabledSubLanes ?? ALL_GRANULAR_SUB_LANES);

  const tGate = (methodName: string, baseProbability: number): boolean =>
    tensionGate(rng, methodName, baseProbability, tension);

  let nextSwing = swing;

  // Swing Drift
  if (methods.swingDrift && tGate('swingDrift', 1)) {
    nextSwing = clamp(drift(nextSwing, 0.03 * intensity, rng), 0, 0.75);
  }

  // Probability Drift
  if (methods.probDrift && tGate('probDrift', 1) && enabledSubs.has('probability') && next.probability) {
    next.probability = next.probability.map(p =>
      clamp(drift(p, 0.08 * intensity, rng), 0.3, 1.0)
    );
  }

  // Ratchet Spray
  if (methods.ratchetSpray && tGate('ratchetSpray', 0.2 * intensity) && enabledSubs.has('ratchet') && next.ratchet) {
    const idx = Math.floor(rng() * next.ratchet.length);
    const homeVal = home?.ratchet?.[idx] ?? 1;
    next.ratchet[idx] = mutateRatchetHomeBiased(next.ratchet[idx], homeVal, intensity, rng);
  }

  // Pitch Walk
  if (methods.pitchWalk && tGate('pitchWalk', 0.25 * intensity) && enabledSubs.has('pitch') && next.pitch) {
    const idx = Math.floor(rng() * next.pitch.length);
    const dir = rng() < 0.5 ? -1 : 1;
    const homeVal = home?.pitch ? (home.pitch[idx] ?? next.pitch[idx]) : next.pitch[idx];
    const newVal = next.pitch[idx] + dir;
    if (Math.abs(newVal - homeVal) <= 3) {
      next.pitch[idx] = clamp(newVal, -12, 12);
    }
  }

  // Value Drift
  if (methods.valueDrift && tGate('valueDrift', 1)) {
    for (const lane of ALL_GRANULAR_SUB_LANES) {
      if (lane === 'pitch' || !enabledSubs.has(lane)) continue;
      const vals = getValues(next, lane);
      if (!vals) continue;
      const cfg = GRANULAR_SUB_LANE_CONFIGS[lane];
      setValues(next, lane, mutateValueDrift(vals, cfg, intensity, rng, mode));
    }
  }

  // Value Scramble (Zone A/B, ~0.4+)
  if (methods.valueScramble && intensity > 0.4 && tGate('valueScramble', 0.2 * intensity)) {
    const swaps = Math.max(2, Math.floor(intensity * 4));
    for (const lane of ALL_GRANULAR_SUB_LANES) {
      if (!enabledSubs.has(lane)) continue;
      const vals = getValues(next, lane);
      if (!vals || rng() < 0.5) continue;
      setValues(next, lane, mutateValueScramble(vals, swaps, rng));
    }
  }

  // Value Widen (Zone B, ~0.6+)
  if (methods.valueWiden && intensity > 0.6 && tGate('valueWiden', 0.15 * intensity)) {
    for (const lane of ALL_GRANULAR_SUB_LANES) {
      if (lane === 'pitch' || !enabledSubs.has(lane)) continue;
      const vals = getValues(next, lane);
      if (!vals || rng() < 0.5) continue;
      const cfg = GRANULAR_SUB_LANE_CONFIGS[lane];
      setValues(next, lane, mutateValueWiden(vals, cfg, intensity, rng));
    }
  }

  // Sub-Lane Direction Flip (Zone B, ~0.8+)
  if (methods.subLaneDirectionFlip && intensity > 0.8 && tGate('subLaneDirectionFlip', 0.08 * intensity)) {
    const dirLanes = Object.keys(DIRECTION_LANES) as GranularSubLane[];
    const activeDirLanes = dirLanes.filter(l => getValues(next, l) !== null);
    if (activeDirLanes.length > 0) {
      const lane = activeDirLanes[Math.floor(rng() * activeDirLanes.length)];
      const current = getDirection(next, lane) ?? 'forward';
      setDirection(next, lane, randomOtherDirection(current, rng));
    }
  }

  // Write-offset masking: restrict mutations to a single step per cycle
  if (config.writeOffset !== 0) {
    for (const lane of ALL_GRANULAR_SUB_LANES) {
      const orig = getValues(overrides, lane);
      const curr = getValues(next, lane);
      if (orig && curr && orig.length === curr.length) {
        setValues(next, lane, maskByWriteOffset(orig, curr, config.writeOffset, currentBar));
      }
    }
  }

  // Home gravity
  if (home && chance(rng, 0.15 * (1.2 - intensity))) {
    nextSwing += (state.homeSwing - nextSwing) * 0.3;

    const lane = ALL_GRANULAR_SUB_LANES[Math.floor(rng() * ALL_GRANULAR_SUB_LANES.length)];
    const currentVals = getValues(next, lane);
    const homeVals = getValues(home, lane);
    if (currentVals && homeVals) {
      const cfg = GRANULAR_SUB_LANE_CONFIGS[lane];
      setValues(next, lane, gravityPullValues(currentVals, homeVals, cfg, 0.2));
    }
  }

  // Direction gravity
  if (home && chance(rng, 0.15 * (1.2 - intensity))) {
    const dirLanes = Object.keys(DIRECTION_LANES) as GranularSubLane[];
    const lane = dirLanes[Math.floor(rng() * dirLanes.length)];
    const homeDir = getDirection(home, lane);
    const currentDir = getDirection(next, lane);
    if (homeDir && currentDir && homeDir !== currentDir) {
      setDirection(next, lane, homeDir);
    }
  }

  return { overrides: next, swing: nextSwing, changed: true };
}

// ═══════════════════════════════════════════════════════════════════════
// Reset to home
// ═══════════════════════════════════════════════════════════════════════

export function resetGranularLaneToHome(
  overrides: GranularLaneOverrides,
  state: GranularEvolveState,
): GranularLaneOverrides {
  if (!state.home) return overrides;
  return captureGranularHomeSnapshot(state.home);
}

// ═══════════════════════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════════════════════

export function defaultGranularEvolveConfig(): GranularEvolveConfig {
  return {
    enabled: false,
    everyBars: 4,
    evolution: 0.5,
    writeOffset: 0,
    mutationMode: 'biased',
    methods: defaultGranularEvolveMethods(),
  };
}

export function defaultGranularEvolveMethods(): Record<GranularEvolveMethod, boolean> {
  return {
    swingDrift: true,
    probDrift: false,
    ratchetSpray: false,
    pitchWalk: false,
    valueDrift: true,
    valueScramble: false,
    valueWiden: false,
    subLaneDirectionFlip: false,
  };
}

export function defaultGranularEvolveState(): GranularEvolveState {
  return {
    lastEvolveBar: 0,
    home: null,
    homeSwing: 0,
  };
}
