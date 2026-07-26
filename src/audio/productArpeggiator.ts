import { DEFAULT_STATE } from '../ui/state';
import {
  HARMONY_POOL_MAX_NOTES,
  resolveProductHarmonyState,
  type HarmonyChordSlot,
} from './CoreProductHarmonyControl';
import { sharedSlotResolvedMidiPool } from './harmony/harmonyChordAdapters';
import { productHarmonyScaleIdFromName } from './coreProductHarmonyScaleIds';
import { createRng, getUtcBucket } from './rng';
import { getScaleByName, selectScaleFamily } from './scales';

export type ProductArpFlow = 'up' | 'down' | 'upDown' | 'downUp' | 'randomLiveTone' | 'diceHold';
export type ProductArpSlotChoice = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ProductArpBoundaryMode = 'fold' | 'wrap' | 'clamp';
export type ProductArpContourMode = 'pool' | 'semitone';
export type ProductArpRate = 0.5 | 1 | 2 | 4;

type LegacyProductArpSourceMode = 'followHarmony' | 'slotLane';
type LegacyProductArpDirection = ProductArpFlow;

export interface ProductArpConfig {
  enabled: boolean;
  flow: ProductArpFlow;
  rate: ProductArpRate;
  length: number;
  pulseMask: number;
  contour: number[];
  contourMode: ProductArpContourMode;
  boundaryMode: ProductArpBoundaryMode;
  slotLane: ProductArpSlotChoice[];
  resetMask: number;
}

export interface ProductArpHarmonyContext {
  rootMidi: number;
  scaleId: number;
  tension: number;
  notePoolMidi: number[];
  chordSlots: HarmonyChordSlot[];
  /** Optional destination source for capability-aware chord rendering. */
  sourceId?: number;
}

export interface ProductArpLiveHarmonyFrame {
  effectiveRoot: number;
  scaleFamily: { name: string };
}

export interface ProductArpResolvedStep {
  step: number;
  enabled: boolean;
  reset: boolean;
  source: ProductArpSlotChoice;
  move: number;
  baseMidi: number | null;
  outputMidi: number | null;
  baseIndex: number | null;
  outputIndex: number | null;
  pool: number[];
}

const PRODUCT_ARP_FLOWS: readonly ProductArpFlow[] = ['up', 'down', 'upDown', 'downUp', 'randomLiveTone', 'diceHold'];
const PRODUCT_ARP_BOUNDARY_MODES: readonly ProductArpBoundaryMode[] = ['fold', 'wrap', 'clamp'];
const PRODUCT_ARP_CONTOUR_MODES: readonly ProductArpContourMode[] = ['pool', 'semitone'];
const PRODUCT_ARP_RATES: readonly ProductArpRate[] = [0.5, 1, 2, 4];
const PRODUCT_ARP_MAX_LENGTH = 16;
const PRODUCT_ARP_CONTOUR_MIN = -12;
const PRODUCT_ARP_CONTOUR_MAX = 12;
const DEFAULT_CONTOUR = [0, 2, -1, 3, 0, 1, -2, 1, 0, 2, -3, 1, 0, -1, 2, 0];
const DEFAULT_TONE_PATTERN = [0, 2, 1, 3, 0, 1, 3, 2, 0, 2, 4, 3, 1, 4, 2, 5];
const DEFAULT_SLOT_LANE: ProductArpSlotChoice[] = Array.from({ length: 16 }, () => -1);
const DEFAULT_PULSE_MASK = 0b01011111;

export function defaultProductArpConfig(): ProductArpConfig {
  return {
    enabled: false,
    flow: 'up',
    rate: 1,
    length: 8,
    pulseMask: DEFAULT_PULSE_MASK,
    contour: [...DEFAULT_CONTOUR],
    contourMode: 'pool',
    boundaryMode: 'fold',
    slotLane: [...DEFAULT_SLOT_LANE],
    resetMask: 0,
  };
}

export function normalizeProductArpConfig(value: unknown): ProductArpConfig {
  const fallback = defaultProductArpConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const source = value as Partial<ProductArpConfig> & {
    sourceMode?: LegacyProductArpSourceMode;
    direction?: LegacyProductArpDirection;
    pulseCount?: number;
    tonePattern?: number[];
  };
  const flow = PRODUCT_ARP_FLOWS.includes(source.flow as ProductArpFlow)
    ? source.flow as ProductArpFlow
    : PRODUCT_ARP_FLOWS.includes(source.direction as LegacyProductArpDirection)
      ? source.direction as LegacyProductArpDirection
      : fallback.flow;
  const length = clampArpLength(source.length ?? source.pulseCount ?? fallback.length);
  const rate = normalizeArpRate(source.rate);
  const pulseMask = typeof source.pulseMask === 'number' && Number.isFinite(source.pulseMask)
    ? normalizeStepMask(source.pulseMask)
    : fallback.pulseMask;
  const resetMask = typeof source.resetMask === 'number' && Number.isFinite(source.resetMask)
    ? normalizeStepMask(source.resetMask)
    : fallback.resetMask;
  const slotLane = normalizeSlotLane(source.slotLane);
  return {
    enabled: source.enabled === true,
    flow,
    rate,
    length,
    pulseMask,
    contour: normalizeContour(source.contour, source.tonePattern, flow, length),
    contourMode: PRODUCT_ARP_CONTOUR_MODES.includes(source.contourMode as ProductArpContourMode)
      ? source.contourMode as ProductArpContourMode
      : fallback.contourMode,
    boundaryMode: PRODUCT_ARP_BOUNDARY_MODES.includes(source.boundaryMode as ProductArpBoundaryMode)
      ? source.boundaryMode as ProductArpBoundaryMode
      : fallback.boundaryMode,
    slotLane: source.sourceMode === 'followHarmony' ? [...DEFAULT_SLOT_LANE] : slotLane,
    resetMask,
  };
}

export function normalizeProductArpConfigs(value: unknown, laneCount = 4): ProductArpConfig[] {
  const lanes = Array.isArray(value) ? value : [];
  return Array.from({ length: laneCount }, (_, index) => normalizeProductArpConfig(lanes[index]));
}

export function productArpConfigsHaveEnabledLane(configs: readonly ProductArpConfig[] | undefined): boolean {
  return configs?.some((config) => config.enabled) === true;
}

export function sanitizeProductArpConfigs(configs: readonly ProductArpConfig[] | undefined): ProductArpConfig[] | undefined {
  if (!configs) return undefined;
  const normalized = normalizeProductArpConfigs(configs, Math.max(4, configs.length));
  return normalized.some((config) => config.enabled) ? normalized : undefined;
}

export function createProductArpHarmonyContext(
  state: Record<string, unknown> | undefined,
  liveHarmony?: ProductArpLiveHarmonyFrame | null,
): ProductArpHarmonyContext {
  const stateRootMidi = rootMidiFromState(state);
  const rootMidi = liveHarmony ? rootMidiWithPitchClass(stateRootMidi, liveHarmony.effectiveRoot) : stateRootMidi;
  const tension = numberFromState(state, 'tension', numberFromState(DEFAULT_STATE as unknown as Record<string, unknown>, 'tension', 0.35));
  const scaleId = liveHarmony ? productHarmonyScaleIdFromName(liveHarmony.scaleFamily.name) : scaleIdFromState(state, tension);
  const seed = positiveU32(numberFromState(state, 'rngSeed', numberFromState(state, 'seed', 1)), 1);
  const morphPercent = numberFromState(state, 'journeyMorphPhase', 0) * 100;
  const harmony = resolveProductHarmonyState({ state, rootMidi, scaleId, tension, seed, morphPercent });
  return {
    rootMidi,
    scaleId,
    tension,
    notePoolMidi: harmony.resolvedHarmonyFrame.currentNotePool,
    chordSlots: harmony.chordSlots,
  };
}

export function resolveProductArpMidiPattern(options: {
  config: ProductArpConfig;
  harmony: ProductArpHarmonyContext;
  laneIndex: number;
  runtimeTick?: number;
  anchorMidi?: number | null;
}): number[] | null {
  const details = resolveProductArpPatternDetails(options);
  return details ? details.map((step) => step.outputMidi ?? -1) : null;
}

export function resolveProductArpPatternDetails(options: {
  config: ProductArpConfig;
  harmony: ProductArpHarmonyContext;
  laneIndex: number;
  runtimeTick?: number;
  anchorMidi?: number | null;
}): ProductArpResolvedStep[] | null {
  const config = normalizeProductArpConfig(options.config);
  if (!config.enabled) return null;
  const values: ProductArpResolvedStep[] = [];
  let segmentStart = 0;
  for (let pulse = 0; pulse < config.length; pulse += 1) {
    const reset = (config.resetMask & (1 << pulse)) !== 0;
    if (reset) segmentStart = pulse;
    const move = config.contour[pulse] ?? 0;
    const source = config.slotLane[pulse] ?? -1;
    if ((config.pulseMask & (1 << pulse)) === 0) {
      values.push({
        step: pulse,
        enabled: false,
        reset,
        source,
        move,
        baseMidi: null,
        outputMidi: null,
        baseIndex: null,
        outputIndex: null,
        pool: [],
      });
      continue;
    }
    const pool = resolveSourcePool(config, options.harmony, pulse);
    if (pool.length === 0) {
      values.push({
        step: pulse,
        enabled: true,
        reset,
        source,
        move,
        baseMidi: null,
        outputMidi: null,
        baseIndex: null,
        outputIndex: null,
        pool: [],
      });
      continue;
    }
    const anchorIndex = nearestPoolIndex(pool, options.anchorMidi);
    const baseIndex = config.contourMode === 'semitone'
      ? anchorIndex ?? 0
      : resolveTraversalIndex({
          flow: config.flow,
          localPulse: pulse - segmentStart,
          pulse,
          laneIndex: options.laneIndex,
          runtimeTick: options.runtimeTick ?? 0,
          poolLength: pool.length,
          pulseMask: config.pulseMask,
          resetMask: config.resetMask,
          anchorIndex,
        });
    const baseMidi = pool[baseIndex] ?? pool[0] ?? null;
    if (baseMidi == null) {
      values.push({
        step: pulse,
        enabled: true,
        reset,
        source,
        move,
        baseMidi: null,
        outputMidi: null,
        baseIndex: null,
        outputIndex: null,
        pool,
      });
      continue;
    }
    if (config.contourMode === 'semitone') {
      values.push({
        step: pulse,
        enabled: true,
        reset,
        source,
        move,
        baseMidi,
        outputMidi: clamp(Math.round(baseMidi + move), 0, 127),
        baseIndex,
        outputIndex: null,
        pool,
      });
      continue;
    }
    const outputIndex = applyBoundaryIndex(baseIndex + move, pool.length, config.boundaryMode);
    values.push({
      step: pulse,
      enabled: true,
      reset,
      source,
      move,
      baseMidi,
      outputMidi: pool[outputIndex] ?? baseMidi,
      baseIndex,
      outputIndex,
      pool,
    });
  }
  return values;
}

export function productArpPulseValues(config: ProductArpConfig): number[] {
  const normalized = normalizeProductArpConfig(config);
  return Array.from({ length: PRODUCT_ARP_MAX_LENGTH }, (_, index) => {
    if (index >= normalized.length || (normalized.pulseMask & (1 << index)) === 0) return 0;
    return (normalized.contour[index] ?? 0) / PRODUCT_ARP_CONTOUR_MAX;
  });
}

function clampArpLength(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(Math.round(value), 1, PRODUCT_ARP_MAX_LENGTH)
    : 8;
}

function normalizeStepMask(value: number): number {
  return Math.max(0, Math.min(0xffff, Math.round(value)));
}

function normalizeArpRate(value: unknown): ProductArpRate {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '1/2x' || trimmed === '1/2' || trimmed === 'half' || trimmed === '0.5x') return 0.5;
    const parsed = Number.parseFloat(trimmed.replace(/x$/, ''));
    if (Number.isFinite(parsed)) return closestArpRate(parsed);
  }
  return typeof value === 'number' && Number.isFinite(value) ? closestArpRate(value) : 1;
}

function closestArpRate(value: number): ProductArpRate {
  let closest: ProductArpRate = 1;
  let bestDistance = Math.abs(value - closest);
  for (const rate of PRODUCT_ARP_RATES) {
    const distance = Math.abs(value - rate);
    if (distance < bestDistance) {
      closest = rate;
      bestDistance = distance;
    }
  }
  return closest;
}

function normalizeContour(value: unknown, legacyTonePattern: unknown, flow: ProductArpFlow, length: number): number[] {
  if (Array.isArray(value)) {
    return Array.from({ length: PRODUCT_ARP_MAX_LENGTH }, (_, index) => normalizeContourValue(value[index], DEFAULT_CONTOUR[index] ?? 0));
  }
  if (Array.isArray(legacyTonePattern)) {
    return legacyTonePatternToContour(legacyTonePattern, flow, length);
  }
  return Array.from({ length: PRODUCT_ARP_MAX_LENGTH }, (_, index) => DEFAULT_CONTOUR[index] ?? 0);
}

function normalizeContourValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(Math.round(value), PRODUCT_ARP_CONTOUR_MIN, PRODUCT_ARP_CONTOUR_MAX)
    : fallback;
}

function legacyTonePatternToContour(value: unknown[], flow: ProductArpFlow, length: number): number[] {
  const source = Array.isArray(value) ? value : DEFAULT_TONE_PATTERN;
  return Array.from({ length: 16 }, (_, index) => {
    const raw = source[index];
    const legacyTone = typeof raw === 'number' && Number.isFinite(raw)
      ? clamp(Math.round(raw), 0, HARMONY_POOL_MAX_NOTES - 1)
      : DEFAULT_TONE_PATTERN[index] ?? 0;
    if (flow === 'randomLiveTone' || flow === 'diceHold') return normalizeContourValue(legacyTone, 0);
    const baseIndex = resolveTraversalIndex({
      flow,
      localPulse: index % Math.max(1, length),
      pulse: index,
      laneIndex: 0,
      runtimeTick: 0,
      poolLength: HARMONY_POOL_MAX_NOTES,
      pulseMask: DEFAULT_PULSE_MASK,
      resetMask: 0,
    });
    return normalizeContourValue(legacyTone - baseIndex, DEFAULT_CONTOUR[index] ?? 0);
  });
}

function normalizeSlotLane(value: unknown): ProductArpSlotChoice[] {
  const source = Array.isArray(value) ? value : DEFAULT_SLOT_LANE;
  return Array.from({ length: 16 }, (_, index) => {
    const raw = source[index];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return -1;
    const rounded = Math.round(raw);
    return (rounded >= -1 && rounded <= 7 ? rounded : -1) as ProductArpSlotChoice;
  });
}

function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rootMidiFromState(state: Record<string, unknown> | undefined): number {
  const explicitRootMidi = numberFromState(state, 'rootMidi', Number.NaN);
  if (Number.isFinite(explicitRootMidi)) return clamp(Math.round(explicitRootMidi), 0, 127);
  const rootNote = numberFromState(state, 'rootNote', 4);
  const pitchClass = ((Math.round(rootNote) % 12) + 12) % 12;
  return 60 + pitchClass;
}

function rootMidiWithPitchClass(baseMidi: number, rootPitchClass: number): number {
  const base = clamp(Math.round(baseMidi), 0, 127);
  const candidate = Math.floor(base / 12) * 12 + ((Math.round(rootPitchClass) % 12) + 12) % 12;
  return clamp(candidate > 127 ? candidate - 12 : candidate, 0, 127);
}

function scaleIdFromState(state: Record<string, unknown> | undefined, tension: number): number {
  const manualScale = typeof state?.manualScale === 'string' ? state.manualScale : 'Major (Ionian)';
  if (state?.scaleMode === 'manual' && getScaleByName(manualScale)) {
    return productHarmonyScaleIdFromName(manualScale);
  }
  const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
  return productHarmonyScaleIdFromName(selectScaleFamily(createRng(`${getUtcBucket(seedWindow)}|E_ROOT`), tension).name);
}

function positiveU32(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback >>> 0 || 1;
  const rounded = Math.round(value) >>> 0;
  return rounded === 0 ? (fallback >>> 0 || 1) : rounded;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizePool(notes: readonly number[]): number[] {
  const pool: number[] = [];
  for (const note of notes) {
    if (!Number.isFinite(note)) continue;
    const midi = clamp(Math.round(note), 0, 127);
    if (!pool.includes(midi)) pool.push(midi);
    if (pool.length >= HARMONY_POOL_MAX_NOTES) break;
  }
  return pool.sort((left, right) => left - right);
}

function nearestPoolIndex(pool: readonly number[], anchorMidi: number | null | undefined): number | null {
  if (!Number.isFinite(anchorMidi) || pool.length === 0) return null;
  let closestIndex = 0;
  let closestDistance = Math.abs((pool[0] ?? 0) - anchorMidi!);
  for (let index = 1; index < pool.length; index += 1) {
    const distance = Math.abs((pool[index] ?? 0) - anchorMidi!);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }
  return closestIndex;
}

function resolveSourcePool(config: ProductArpConfig, harmony: ProductArpHarmonyContext, pulse: number): number[] {
  const slotChoice = config.slotLane[pulse] ?? -1;
  if (slotChoice >= 0) {
    const slot = harmony.chordSlots[slotChoice];
    if (slot) {
      if (!slot.chord) return [];
      return normalizePool(sharedSlotResolvedMidiPool(slot, {
        rootMidi: harmony.rootMidi,
        effectiveRootMidi: harmony.rootMidi,
        scaleId: harmony.scaleId,
        tension: harmony.tension,
      }));
    }
  }
  return normalizePool(harmony.notePoolMidi);
}

function resolveTraversalIndex(options: {
  flow: ProductArpFlow;
  localPulse: number;
  pulse: number;
  laneIndex: number;
  runtimeTick: number,
  poolLength: number;
  pulseMask: number;
  resetMask: number;
  anchorIndex?: number | null;
}): number {
  const { flow, localPulse, pulse, laneIndex, runtimeTick, poolLength, pulseMask, resetMask, anchorIndex } = options;
  if (poolLength <= 1) return 0;
  if (flow === 'randomLiveTone') {
    return hashU32((runtimeTick + 1) * 0x45d9f3b + laneIndex * 0x119de1f3 + pulse * 0x27d4eb2d) % poolLength;
  }
  if (flow === 'diceHold') {
    return hashU32(pulseMask * 0x9e3779b1 + resetMask * 0x632be59b + laneIndex * 0x85ebca6b + pulse * 0xc2b2ae35) % poolLength;
  }
  const position = Math.max(0, Math.floor(localPulse));
  if (anchorIndex != null) {
    if (flow === 'down') return positiveModulo(anchorIndex - position, poolLength);
    if (flow === 'upDown') return positiveModulo(anchorIndex + signedPingPongOffset(position), poolLength);
    if (flow === 'downUp') return positiveModulo(anchorIndex - signedPingPongOffset(position), poolLength);
    return positiveModulo(anchorIndex + position, poolLength);
  }
  if (flow === 'down') return poolLength - 1 - (position % poolLength);
  if (flow === 'upDown') return pingPongIndex(position, poolLength);
  if (flow === 'downUp') return poolLength - 1 - pingPongIndex(position, poolLength);
  return position % poolLength;
}

function signedPingPongOffset(position: number): number {
  if (position <= 0) return 0;
  const magnitude = Math.ceil(position / 2);
  return position % 2 === 1 ? magnitude : -magnitude;
}

function pingPongIndex(position: number, length: number): number {
  if (length <= 1) return 0;
  const period = (length - 1) * 2;
  const folded = positiveModulo(position, period);
  return folded <= length - 1 ? folded : period - folded;
}

function applyBoundaryIndex(index: number, length: number, boundaryMode: ProductArpBoundaryMode): number {
  if (length <= 1) return 0;
  if (boundaryMode === 'wrap') return positiveModulo(index, length);
  if (boundaryMode === 'fold') return pingPongIndex(index, length);
  return clamp(index, 0, length - 1);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function hashU32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}
