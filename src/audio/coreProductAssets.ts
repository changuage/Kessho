import { getNearestPianoSample, type PianoSampleVariant } from './pianoSamples';
import coreProductAssetManifest from './coreProductAssetManifest.json';
import { NATURE_SLOT_KEYS } from './natureSlots';
import { natureSampleDefinition } from './natureSampleCatalog';

export const CORE_PRODUCT_ASSET_FLAGS = Object.freeze({
  loop: coreProductAssetManifest.flags.loop,
  piano: coreProductAssetManifest.flags.piano,
  soundscape: coreProductAssetManifest.flags.soundscape,
  sample: coreProductAssetManifest.flags.sample,
} as const);

type CoreProductSoundscapeAssetManifestKey = 'ocean' | 'water' | 'birds' | 'birds2' | 'frogs' | 'insects';

export const CORE_PRODUCT_ASSET_MANIFEST_VERSION = coreProductAssetManifest.version;
export const CORE_PRODUCT_ASSET_BASE_PATH = coreProductAssetManifest.assetBasePath;
export const CORE_PRODUCT_DEFAULT_PIANO_MIDI = coreProductAssetManifest.piano.defaultMidi;
export const CORE_PRODUCT_PIANO_ASSET_ID_BASE = coreProductAssetManifest.piano.baseAssetId;
export const CORE_PRODUCT_PIANO_SHORT_ASSET_ID_BASE = coreProductAssetManifest.piano.shortBaseAssetId;
export const CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID =
  CORE_PRODUCT_PIANO_ASSET_ID_BASE + getNearestPianoSample(CORE_PRODUCT_DEFAULT_PIANO_MIDI).index;
export const CORE_PRODUCT_PIANO_PRELOAD_MIDI_NOTES = Object.freeze([
  ...coreProductAssetManifest.piano.preloadMidiNotes,
]);
export const CORE_PRODUCT_MEMORY_BUDGETS = Object.freeze({
  ...coreProductAssetManifest.memoryBudgets,
});
const soundscapeEntries = coreProductAssetManifest.soundscapes.map((asset) => [
  asset.key,
  {
    assetId: asset.assetId,
    path: asset.path,
    layer: asset.layer,
    startupPreload: asset.startupPreload,
  },
]);
export const CORE_PRODUCT_SOUNDSCAPE_ASSETS = Object.freeze(
  Object.fromEntries(soundscapeEntries),
) as Readonly<Record<CoreProductSoundscapeAssetManifestKey, {
  assetId: number;
  path: string;
  layer: string;
  startupPreload: boolean;
}>>;
export const CORE_PRODUCT_DEFAULT_SOUNDSCAPE_ASSET_ID = CORE_PRODUCT_SOUNDSCAPE_ASSETS.ocean.assetId;

export type CoreProductSoundscapeAssetKey = CoreProductSoundscapeAssetManifestKey;

export type CoreProductSoundscapeAssetDescriptor = {
  assetId: number;
  url: string;
  assetPath: string;
  level: number;
};

export type DecodedCoreProductAsset = {
  readonly assetId: number;
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
  readonly flags: number;
  readonly sampleLibraryKey?: string;
  readonly sampleId?: string;
  readonly rootMidi?: number;
  readonly decodedLoopStartFrame?: number;
  readonly decodedLoopEndFrame?: number;
  readonly loopCrossfadeFrames?: number;
};

export function getDecodedCoreProductAssetByteLength(asset: DecodedCoreProductAsset): number {
  return asset.channels.reduce((total, channel) => total + channel.byteLength, 0);
}

export function cloneDecodedCoreProductAssetForTransfer(asset: DecodedCoreProductAsset): DecodedCoreProductAsset {
  return {
    ...asset,
    channels: asset.channels.map((channel) => new Float32Array(channel)),
  };
}

export function resolveCoreProductAssetUrl(path: string): string {
  const embeddedAssetBaseUrl = typeof window !== 'undefined'
    ? (window as Window & {
      __pointCloudsEmbeddedProductCoreAssets?: { assetBaseUrl?: string };
    }).__pointCloudsEmbeddedProductCoreAssets?.assetBaseUrl
    : undefined;
  if (embeddedAssetBaseUrl) {
    return new URL(`${CORE_PRODUCT_ASSET_BASE_PATH}/${path}`, embeddedAssetBaseUrl).toString();
  }
  const base = new URL(import.meta.env?.BASE_URL ?? '/', window.location.origin);
  return new URL(`${CORE_PRODUCT_ASSET_BASE_PATH}/${path}`, base).toString();
}

function getManifestPianoSamplePath(variant: 'regular' | 'short', index: number): string {
  const safeIndex = String(Math.max(1, Math.min(coreProductAssetManifest.piano.sampleCount, Math.round(index)))).padStart(2, '0');
  const pattern = variant === 'short'
    ? coreProductAssetManifest.piano.shortSamplePathPattern
    : coreProductAssetManifest.piano.regularSamplePathPattern;
  return pattern.replace('{index}', safeIndex);
}

export function getCoreProductPianoAssetIdForMidiVariant(
  midiNote: number,
  variant: PianoSampleVariant,
): number {
  const { index } = getNearestPianoSample(midiNote);
  const base = variant === 'short'
    ? CORE_PRODUCT_PIANO_SHORT_ASSET_ID_BASE
    : CORE_PRODUCT_PIANO_ASSET_ID_BASE;
  return base + index;
}

export function getCoreProductPianoAssetUrlForMidiVariant(
  midiNote: number,
  variant: PianoSampleVariant,
): string {
  const { index } = getNearestPianoSample(midiNote);
  return resolveCoreProductAssetUrl(getManifestPianoSamplePath(variant, index));
}

function booleanFromState(state: Record<string, unknown> | undefined | null, key: string): boolean {
  return state?.[key] === true;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function getDefaultCoreProductSoundscapeAssetKey(
  state?: Record<string, unknown> | null,
): CoreProductSoundscapeAssetKey {
  if (state?.frogsEnabled === true) return 'frogs';
  if (state?.insectsEnabled === true || state?.insects2Enabled === true) return 'insects';
  if (state?.birds2Enabled === true) return 'birds2';
  if (state?.birdsEnabled === true) return 'birds';
  if (state?.waterEnabled === true) return 'water';
  return 'ocean';
}

export function getDefaultCoreProductSoundscapeAssetId(state?: Record<string, unknown> | null): number {
  return CORE_PRODUCT_SOUNDSCAPE_ASSETS[getDefaultCoreProductSoundscapeAssetKey(state)].assetId;
}

export function getPrimaryCoreProductSoundscapeAssetIdForState(state?: Record<string, unknown> | null): number {
  for (const keys of NATURE_SLOT_KEYS) {
    if (booleanFromState(state, keys.enabledKey)) return natureSampleDefinition(state?.[keys.sampleIdKey], keys.slot).assetId;
  }
  if (booleanFromState(state, 'frogsEnabled')) return CORE_PRODUCT_SOUNDSCAPE_ASSETS.frogs.assetId;
  if (booleanFromState(state, 'birds2Enabled')) return CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds2.assetId;
  if (booleanFromState(state, 'birdsEnabled')) return CORE_PRODUCT_SOUNDSCAPE_ASSETS.birds.assetId;
  if (booleanFromState(state, 'oceanSampleEnabled')) return CORE_PRODUCT_SOUNDSCAPE_ASSETS.ocean.assetId;
  return 0;
}

export function getDefaultCoreProductSoundscapeAssetUrl(state?: Record<string, unknown> | null): string {
  const asset = CORE_PRODUCT_SOUNDSCAPE_ASSETS[getDefaultCoreProductSoundscapeAssetKey(state)];
  return resolveCoreProductAssetUrl(asset.path);
}

export function getCoreProductSoundscapeAssetDescriptorsForState(
  state?: Record<string, unknown> | null,
): CoreProductSoundscapeAssetDescriptor[] {
  const candidates: Array<{ key: CoreProductSoundscapeAssetKey; level: number }> = [];
  for (const keys of NATURE_SLOT_KEYS) {
    if (!booleanFromState(state, keys.enabledKey)) continue;
    const sample = natureSampleDefinition(state?.[keys.sampleIdKey], keys.slot);
    candidates.push({ key: sample.assetKey, level: 1 });
  }
  if (candidates.length === 0) {
    const legacyCandidates: Array<{ key: CoreProductSoundscapeAssetKey; enabledKey: string; levelKey: string }> = [
      { key: 'ocean', enabledKey: 'oceanSampleEnabled', levelKey: 'oceanSampleLevel' },
      { key: 'birds', enabledKey: 'birdsEnabled', levelKey: 'birdsLevel' },
      { key: 'birds2', enabledKey: 'birds2Enabled', levelKey: 'birds2Level' },
      { key: 'frogs', enabledKey: 'frogsEnabled', levelKey: 'frogsLevel' },
    ];
    for (const candidate of legacyCandidates) {
      if (!booleanFromState(state, candidate.enabledKey)) continue;
      candidates.push({
        key: candidate.key,
        level: clamp01(Number(state?.[candidate.levelKey] ?? 1)),
      });
    }
  }
  const seen = new Set<number>();
  return candidates.flatMap(({ key, level }) => {
    const clampedLevel = clamp01(level);
    if (clampedLevel <= 0.0001) return [];
    const asset = CORE_PRODUCT_SOUNDSCAPE_ASSETS[key];
    if (seen.has(asset.assetId)) return [];
    seen.add(asset.assetId);
    return [{
      assetId: asset.assetId,
      url: resolveCoreProductAssetUrl(asset.path),
      assetPath: asset.path,
      level: clampedLevel,
    }];
  });
}

export async function decodeCoreProductAsset(
  context: BaseAudioContext,
  assetId: number,
  url: string,
  flags: number,
): Promise<DecodedCoreProductAsset> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Kessho Product asset ${url}: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const audioBuffer = await context.decodeAudioData(bytes.slice(0));
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < Math.min(2, audioBuffer.numberOfChannels); channel += 1) {
    channels.push(new Float32Array(audioBuffer.getChannelData(channel)));
  }
  return {
    assetId,
    sampleRate: audioBuffer.sampleRate,
    channels,
    flags,
  };
}
