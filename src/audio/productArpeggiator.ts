import { DEFAULT_STATE } from '../ui/state';
import {
  HARMONY_POOL_MAX_NOTES,
  resolveHarmonyIntentToNotePool,
  resolveProductHarmonyState,
  type HarmonyChordSlot,
} from './CoreProductHarmonyControl';
import { productHarmonyScaleIdFromName } from './coreProductHarmonyScaleIds';
import { createRng, getUtcBucket } from './rng';
import { getScaleByName, selectScaleFamily } from './scales';

export type ProductArpSourceMode = 'followHarmony' | 'slotLane';
export type ProductArpDirection = 'up' | 'down' | 'upDown' | 'downUp' | 'randomLiveTone' | 'diceHold';
export type ProductArpSlotChoice = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ProductArpPulseCount = 4 | 8 | 16;

export interface ProductArpConfig {
  enabled: boolean;
  sourceMode: ProductArpSourceMode;
  direction: ProductArpDirection;
  pulseCount: ProductArpPulseCount;
  pulseMask: number;
  tonePattern: number[];
  slotLane: ProductArpSlotChoice[];
}

export interface ProductArpHarmonyContext {
  rootMidi: number;
  scaleId: number;
  tension: number;
  notePoolMidi: number[];
  chordSlots: HarmonyChordSlot[];
}

export interface ProductArpLiveHarmonyFrame {
  effectiveRoot: number;
  scaleFamily: { name: string };
}

const PRODUCT_ARP_DIRECTIONS: readonly ProductArpDirection[] = ['up', 'down', 'upDown', 'downUp', 'randomLiveTone', 'diceHold'];
const DEFAULT_TONE_PATTERN = [0, 2, 1, 3, 0, 1, 3, 2, 0, 2, 4, 3, 1, 4, 2, 5];
const DEFAULT_SLOT_LANE: ProductArpSlotChoice[] = Array.from({ length: 16 }, () => -1);
const DEFAULT_PULSE_MASK = 0b01011111;

export function defaultProductArpConfig(): ProductArpConfig {
  return {
    enabled: false,
    sourceMode: 'followHarmony',
    direction: 'up',
    pulseCount: 8,
    pulseMask: DEFAULT_PULSE_MASK,
    tonePattern: [...DEFAULT_TONE_PATTERN],
    slotLane: [...DEFAULT_SLOT_LANE],
  };
}

export function normalizeProductArpConfig(value: unknown): ProductArpConfig {
  const fallback = defaultProductArpConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const source = value as Partial<ProductArpConfig>;
  const pulseCount = source.pulseCount === 4 || source.pulseCount === 8 || source.pulseCount === 16
    ? source.pulseCount
    : fallback.pulseCount;
  const pulseMask = typeof source.pulseMask === 'number' && Number.isFinite(source.pulseMask)
    ? Math.max(0, Math.min(0xffff, Math.round(source.pulseMask))) & ((1 << pulseCount) - 1)
    : fallback.pulseMask;
  return {
    enabled: source.enabled === true,
    sourceMode: source.sourceMode === 'slotLane' ? 'slotLane' : 'followHarmony',
    direction: PRODUCT_ARP_DIRECTIONS.includes(source.direction as ProductArpDirection)
      ? source.direction as ProductArpDirection
      : fallback.direction,
    pulseCount,
    pulseMask,
    tonePattern: normalizeTonePattern(source.tonePattern),
    slotLane: normalizeSlotLane(source.slotLane),
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
}): number[] | null {
  const config = normalizeProductArpConfig(options.config);
  if (!config.enabled) return null;
  const values: number[] = [];
  const pulseCount = config.pulseCount;
  for (let pulse = 0; pulse < pulseCount; pulse += 1) {
    if ((config.pulseMask & (1 << pulse)) === 0) {
      values.push(-1);
      continue;
    }
    const pool = resolveSourcePool(config, options.harmony, pulse);
    if (pool.length === 0) {
      values.push(-1);
      continue;
    }
    const ordered = orderedPoolForDirection(pool, config.direction);
    const toneIndex = resolveToneIndex(config, pulse, options.laneIndex, options.runtimeTick ?? 0, ordered.length);
    values.push(ordered[toneIndex % ordered.length] ?? ordered[0] ?? -1);
  }
  return values;
}

export function productArpPulseValues(config: ProductArpConfig): number[] {
  const normalized = normalizeProductArpConfig(config);
  return Array.from({ length: normalized.pulseCount }, (_, index) => {
    if ((normalized.pulseMask & (1 << index)) === 0) return 0;
    return ((normalized.tonePattern[index] ?? 0) + 1) / HARMONY_POOL_MAX_NOTES;
  });
}

function normalizeTonePattern(value: unknown): number[] {
  const source = Array.isArray(value) ? value : DEFAULT_TONE_PATTERN;
  return Array.from({ length: 16 }, (_, index) => {
    const raw = source[index];
    return typeof raw === 'number' && Number.isFinite(raw)
      ? Math.max(0, Math.min(HARMONY_POOL_MAX_NOTES - 1, Math.round(raw)))
      : DEFAULT_TONE_PATTERN[index] ?? 0;
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

function resolveSourcePool(config: ProductArpConfig, harmony: ProductArpHarmonyContext, pulse: number): number[] {
  const slotChoice = config.sourceMode === 'slotLane' ? config.slotLane[pulse] ?? -1 : -1;
  if (slotChoice >= 0) {
    const slot = harmony.chordSlots[slotChoice];
    if (slot) {
      return normalizePool(resolveHarmonyIntentToNotePool({
        intent: { ...slot.intent, source: 'slot' },
        rootMidi: harmony.rootMidi,
        scaleId: harmony.scaleId,
        tension: harmony.tension,
      }));
    }
  }
  return normalizePool(harmony.notePoolMidi);
}

function orderedPoolForDirection(pool: readonly number[], direction: ProductArpDirection): number[] {
  const up = normalizePool(pool);
  const down = [...up].reverse();
  if (direction === 'down' || direction === 'downUp') {
    return direction === 'down' ? down : pingPongPool(down);
  }
  if (direction === 'upDown') return pingPongPool(up);
  return up;
}

function pingPongPool(pool: readonly number[]): number[] {
  if (pool.length <= 2) return [...pool];
  return [...pool, ...pool.slice(1, -1).reverse()];
}

function resolveToneIndex(
  config: ProductArpConfig,
  pulse: number,
  laneIndex: number,
  runtimeTick: number,
  poolLength: number,
): number {
  if (poolLength <= 1) return 0;
  if (config.direction === 'randomLiveTone') {
    return hashU32((runtimeTick + 1) * 0x45d9f3b + laneIndex * 0x119de1f3 + pulse * 0x27d4eb2d) % poolLength;
  }
  if (config.direction === 'diceHold') {
    return hashU32(config.pulseMask * 0x9e3779b1 + laneIndex * 0x85ebca6b + pulse * 0xc2b2ae35) % poolLength;
  }
  return config.tonePattern[pulse] ?? 0;
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
