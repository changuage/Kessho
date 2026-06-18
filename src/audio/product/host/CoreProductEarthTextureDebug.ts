import { CORE_PRODUCT_SOUNDSCAPE_ASSETS } from '../../coreProductAssets';
import type { EarthTextureDebugState } from '../../engineSharedTypes';
import type { EarthTexturePlayerDebugSnapshot, EarthTextureSliceDebug } from '../../earthTexturePlayer';
import { getUtcBucket, xmur3 } from '../../rng';

type EarthTextureDebugKey = keyof EarthTextureDebugState;

type CoreProductEarthTextureConfig = {
  key: EarthTextureDebugKey;
  layer: string;
  assetKey: keyof typeof CORE_PRODUCT_SOUNDSCAPE_ASSETS;
  enabledKey: string;
  levelKey: string;
  masterLevelKey?: string;
  sliceKey: string;
  densityKey: string;
  fallbackSliceDuration: number;
  fallbackDensity: number;
  fadeTime: number;
  assetDuration: number;
};

const CORE_PRODUCT_EARTH_TEXTURES: readonly CoreProductEarthTextureConfig[] = [
  {
    key: 'waves',
    layer: 'ocean',
    assetKey: 'ocean',
    enabledKey: 'oceanSampleEnabled',
    levelKey: 'oceanSampleLevel',
    sliceKey: 'oceanSliceDuration',
    densityKey: 'oceanSliceDensity',
    fallbackSliceDuration: 22,
    fallbackDensity: 0.38,
    fadeTime: 5.5,
    assetDuration: 118.676372,
  },
  {
    key: 'birds',
    layer: 'birds',
    assetKey: 'birds',
    enabledKey: 'birdsEnabled',
    levelKey: 'birdsLevel',
    masterLevelKey: 'natureLevel',
    sliceKey: 'birdsSliceDuration',
    densityKey: 'birdsSliceDensity',
    fallbackSliceDuration: 20,
    fallbackDensity: 0.45,
    fadeTime: 3.2,
    assetDuration: 118.685057,
  },
  {
    key: 'birds2',
    layer: 'birds2',
    assetKey: 'birds2',
    enabledKey: 'birds2Enabled',
    levelKey: 'birds2Level',
    masterLevelKey: 'natureLevel',
    sliceKey: 'birds2SliceDuration',
    densityKey: 'birds2SliceDensity',
    fallbackSliceDuration: 20,
    fallbackDensity: 0.48,
    fadeTime: 3.1,
    assetDuration: 48.629025,
  },
  {
    key: 'frogs',
    layer: 'frogs',
    assetKey: 'frogs',
    enabledKey: 'frogsEnabled',
    levelKey: 'frogsLevel',
    masterLevelKey: 'natureLevel',
    sliceKey: 'frogsSliceDuration',
    densityKey: 'frogsSliceDensity',
    fallbackSliceDuration: 18,
    fallbackDensity: 0.52,
    fadeTime: 2.6,
    assetDuration: 42.976553,
  },
] as const;

const PRODUCT_TEXTURE_INITIAL_DELAY_SECONDS = 0.158;
const PRODUCT_TEXTURE_PITCH_RANGE_CENTS = 200;
const PRODUCT_TEXTURE_SPEED_VARIATION = 0.2;
const PRODUCT_TEXTURE_MAX_RECENT_OFFSETS = 6;
const PRODUCT_TEXTURE_DEBUG_MAX_VISIBLE_SLICES = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function numberFromState(state: Record<string, unknown> | null | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanFromState(state: Record<string, unknown> | null | undefined, key: string): boolean {
  return state?.[key] === true;
}

function computeStrideSeconds(outputDuration: number, fadeTime: number, densityValue: number): number {
  const duration = Math.max(1.5, outputDuration);
  const density = clamp(densityValue, 0, 1);
  const fade = clamp(fadeTime, 0.1, duration * 0.45);
  const silenceGapAtZero = clamp(Math.min(fade * 0.45, duration * 0.14), 0.18, 1.25);
  const handoffOverlap = fade;
  const denseOverlap = clamp(fade + duration * 0.16, fade * 1.25, duration * 0.42);
  const overlapOrGap = density <= 0.25
    ? -silenceGapAtZero + (handoffOverlap + silenceGapAtZero) * (density / 0.25)
    : handoffOverlap + (denseOverlap - handoffOverlap) * ((density - 0.25) / 0.75);
  return clamp(duration - overlapOrGap, 0.35, duration + silenceGapAtZero);
}

function textureSeed(config: CoreProductEarthTextureConfig, state: Record<string, unknown> | null | undefined): string {
  const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
  const rawSeed = Number(state?.seed);
  const seed = Number.isFinite(rawSeed) ? Math.trunc(rawSeed) : 42;
  return `${getUtcBucket(seedWindow)}|${seed}|earth-texture|${config.layer}`;
}

function numericTextureSeed(
  config: CoreProductEarthTextureConfig,
  state: Record<string, unknown> | null | undefined,
): number {
  return xmur3(textureSeed(config, state))() || 1;
}

function finiteTelemetryNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function productTextureRandom(rng: { state: number }): number {
  let t = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pickProductTextureOffset(
  rng: { state: number },
  maxOffset: number,
  duration: number,
  recentOffsets: number[],
): number {
  if (maxOffset <= 0.0001) return 0;

  const exclusionDistance = Math.min(duration * 0.75, Math.max(2.5, maxOffset * 0.12));
  let candidate = productTextureRandom(rng) * maxOffset;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    candidate = productTextureRandom(rng) * maxOffset;
    const tooClose = recentOffsets.some((recent) => Math.abs(recent - candidate) < exclusionDistance);
    if (!tooClose) break;
  }

  recentOffsets.push(candidate);
  if (recentOffsets.length > PRODUCT_TEXTURE_MAX_RECENT_OFFSETS) {
    recentOffsets.shift();
  }
  return candidate;
}

function scheduledProductTextureSlices(
  nowTime: number,
  sliceDuration: number,
  fadeTime: number,
  density: number,
  assetDuration: number,
  seed: number,
  lastScheduledSliceId = 0,
): EarthTextureSliceDebug[] {
  const rng = { state: (seed || 1) >>> 0 };
  const bufferDuration = clamp(sliceDuration, 1.5, Math.max(1.5, assetDuration - 0.05));
  const maxOffset = Math.max(0, assetDuration - bufferDuration - 0.02);
  const recentOffsets: number[] = [];
  const slices: EarthTextureSliceDebug[] = [];
  const lookBack = Math.min(1.2, Math.max(0.35, bufferDuration * 0.12));
  const horizon = nowTime + Math.max(4, bufferDuration * 4 + Math.max(1.25, fadeTime) * 4);
  const targetLastId = Math.max(0, Math.trunc(lastScheduledSliceId));
  let startTime = PRODUCT_TEXTURE_INITIAL_DELAY_SECONDS;

  for (let id = 1; id <= 4096; id += 1) {
    const detuneCents = (productTextureRandom(rng) * 2 - 1) * PRODUCT_TEXTURE_PITCH_RANGE_CENTS;
    const speedMultiplier = 1 + (productTextureRandom(rng) * 2 - 1) * PRODUCT_TEXTURE_SPEED_VARIATION;
    const offset = pickProductTextureOffset(rng, maxOffset, bufferDuration, recentOffsets);
    const totalRate = Math.max(0.25, speedMultiplier * Math.pow(2, detuneCents / 1200));
    const outputDuration = bufferDuration / totalRate;
    const fade = clamp(fadeTime, 0.1, outputDuration * 0.45);
    const endTime = startTime + outputDuration;
    if (endTime >= nowTime - lookBack && startTime <= horizon) {
      slices.push({
        id,
        startTime,
        endTime,
        offset,
        bufferDuration,
        outputDuration,
        detuneCents,
        speedMultiplier,
        totalRate,
        isPlaying: nowTime >= startTime && nowTime <= endTime,
      });
    }

    startTime += computeStrideSeconds(outputDuration, fade, density);
    if (id >= targetLastId && startTime > horizon && slices.length >= 4) {
      break;
    }
  }

  return slices;
}

function readableProductTextureSlices(
  slices: readonly EarthTextureSliceDebug[],
  nowTime: number,
): EarthTextureSliceDebug[] {
  if (slices.length <= PRODUCT_TEXTURE_DEBUG_MAX_VISIBLE_SLICES) {
    return [...slices].sort((a, b) => a.startTime - b.startTime);
  }

  const sorted = [...slices].sort((a, b) => a.startTime - b.startTime);
  const selected = new Map<number, EarthTextureSliceDebug>();
  const previous = [...sorted].reverse().find((slice) => slice.endTime < nowTime);
  const playing = sorted.filter((slice) => slice.startTime <= nowTime && slice.endTime >= nowTime);
  const upcoming = sorted.filter((slice) => slice.startTime > nowTime);

  if (playing.length === 0 && previous) {
    selected.set(previous.id, previous);
  }
  for (const slice of playing.slice(0, 2)) {
    selected.set(slice.id, slice);
  }
  for (const slice of upcoming) {
    if (selected.size >= PRODUCT_TEXTURE_DEBUG_MAX_VISIBLE_SLICES) break;
    selected.set(slice.id, slice);
  }
  if (selected.size === 0) {
    const nearest = sorted.find((slice) => slice.endTime >= nowTime) ?? sorted[sorted.length - 1];
    if (nearest) selected.set(nearest.id, nearest);
  }

  return [...selected.values()]
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, PRODUCT_TEXTURE_DEBUG_MAX_VISIBLE_SLICES);
}

function textureDebugSnapshot(
  config: CoreProductEarthTextureConfig,
  state: Record<string, unknown> | null | undefined,
  nowTime: number,
  telemetrySnapshot: EarthTexturePlayerDebugSnapshot | null | undefined,
): EarthTexturePlayerDebugSnapshot {
  const asset = CORE_PRODUCT_SOUNDSCAPE_ASSETS[config.assetKey];
  const assetDuration = Math.max(1.5, finiteTelemetryNumber(telemetrySnapshot?.assetDuration, config.assetDuration));
  const sliceDuration = clamp(
    finiteTelemetryNumber(telemetrySnapshot?.sliceDuration, numberFromState(state, config.sliceKey, config.fallbackSliceDuration)),
    1.5,
    Math.max(1.5, assetDuration - 0.05),
  );
  const density = clamp(
    finiteTelemetryNumber(telemetrySnapshot?.density, numberFromState(state, config.densityKey, config.fallbackDensity)),
    0,
    1,
  );
  const fadeTime = clamp(finiteTelemetryNumber(telemetrySnapshot?.fadeTime, config.fadeTime), 0.1, sliceDuration * 0.45);
  const level = clamp(numberFromState(state, config.levelKey, 0), 0, 1);
  const masterLevel = config.masterLevelKey ? clamp(numberFromState(state, config.masterLevelKey, 1), 0, 1) : 1;
  const stateActive = booleanFromState(state, config.enabledKey) && level * masterLevel > 0.0001;
  const densityZeroActive = telemetrySnapshot?.inactiveReason === 'density zero';
  const active = telemetrySnapshot ? (telemetrySnapshot.active === true || densityZeroActive) : stateActive;
  const seed = Math.trunc(finiteTelemetryNumber(telemetrySnapshot?.seed, numericTextureSeed(config, state))) || 1;
  const lastScheduledSliceId = telemetrySnapshot?.activeSlices[0]?.id ?? 0;
  const scheduledSlices = active
    ? scheduledProductTextureSlices(nowTime, sliceDuration, fadeTime, density, assetDuration, seed, lastScheduledSliceId)
    : [];
  const slices = readableProductTextureSlices(scheduledSlices, nowTime);
  const playingSliceCount = scheduledSlices.filter((slice) => slice.isPlaying).length;
  return {
    fileName: telemetrySnapshot?.fileName ?? asset.path.split('/').pop() ?? asset.path,
    assetId: asset.assetId,
    active,
    inactiveReason: active ? null : (telemetrySnapshot?.inactiveReason ?? (booleanFromState(state, config.enabledKey) ? 'level muted' : 'source disabled')),
    parityFixture: telemetrySnapshot?.parityFixture,
    textureParamsAvailable: telemetrySnapshot?.textureParamsAvailable ?? true,
    useTextureSlices: telemetrySnapshot?.useTextureSlices ?? active,
    assetTooShortForRequestedSlice: telemetrySnapshot?.assetTooShortForRequestedSlice ?? false,
    assetDuration,
    maxOffset: Math.max(0, assetDuration - sliceDuration - 0.02),
    seed: seed >>> 0,
    sliceDuration,
    fadeTime,
    density,
    strideSeconds: computeStrideSeconds(sliceDuration, fadeTime, density),
    nowTime,
    activeSliceCount: Math.max(telemetrySnapshot?.activeSliceCount ?? 0, scheduledSlices.length),
    playingSliceCount: Math.max(telemetrySnapshot?.playingSliceCount ?? 0, playingSliceCount),
    activeSlices: slices,
  };
}

export function createCoreProductEarthTextureDebugState(
  state: Record<string, unknown> | null | undefined,
  nowTime: number,
  telemetryState?: EarthTextureDebugState | null,
): EarthTextureDebugState {
  const result = {} as EarthTextureDebugState;
  for (const config of CORE_PRODUCT_EARTH_TEXTURES) {
    result[config.key] = textureDebugSnapshot(config, state, nowTime, telemetryState?.[config.key]);
  }
  return result;
}
