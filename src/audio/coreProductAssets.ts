import { getNearestPianoSample, type PianoSampleVariant } from './pianoSamples';
import coreProductAssetManifest from './coreProductAssetManifest.json';

export const CORE_PRODUCT_ASSET_FLAGS = Object.freeze({
  loop: coreProductAssetManifest.flags.loop,
  piano: coreProductAssetManifest.flags.piano,
  soundscape: coreProductAssetManifest.flags.soundscape,
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

export type CoreProductPianoAssetDescriptor = {
  assetId: number;
  url: string;
};

export type CoreProductSoundscapeAssetDescriptor = {
  assetId: number;
  url: string;
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

export function resolveCoreProductAssetUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  return new URL(`${CORE_PRODUCT_ASSET_BASE_PATH}/${path}`, base).toString();
}

function getManifestPianoSamplePath(variant: 'regular' | 'short', index: number): string {
  const safeIndex = String(Math.max(1, Math.min(coreProductAssetManifest.piano.sampleCount, Math.round(index)))).padStart(2, '0');
  const pattern = variant === 'short'
    ? coreProductAssetManifest.piano.shortSamplePathPattern
    : coreProductAssetManifest.piano.regularSamplePathPattern;
  return pattern.replace('{index}', safeIndex);
}

export function getDefaultCoreProductPianoAssetUrl(): string {
  const { index } = getNearestPianoSample(CORE_PRODUCT_DEFAULT_PIANO_MIDI);
  return resolveCoreProductAssetUrl(getManifestPianoSamplePath('regular', index));
}

export function getCoreProductPianoAssetIdForMidi(midiNote: number): number {
  return getCoreProductPianoAssetIdForMidiVariant(midiNote, 'regular');
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

export function getCoreProductPianoAssetUrlForMidi(midiNote: number): string {
  return getCoreProductPianoAssetUrlForMidiVariant(midiNote, 'regular');
}

export function getCoreProductPianoAssetUrlForMidiVariant(
  midiNote: number,
  variant: PianoSampleVariant,
): string {
  const { index } = getNearestPianoSample(midiNote);
  return resolveCoreProductAssetUrl(getManifestPianoSamplePath(variant, index));
}

function numberFromState(state: Record<string, unknown> | undefined | null, key: string): number | null {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanFromState(state: Record<string, unknown> | undefined | null, key: string): boolean {
  return state?.[key] === true;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function addPianoMidiDescriptor(
  descriptors: Map<number, CoreProductPianoAssetDescriptor>,
  midiNote: number,
): void {
  const assetId = getCoreProductPianoAssetIdForMidi(midiNote);
  descriptors.set(assetId, {
    assetId,
    url: getCoreProductPianoAssetUrlForMidi(midiNote),
  });
}

export function getCoreProductPianoPreloadAssetDescriptors(
  state?: Record<string, unknown> | null,
): CoreProductPianoAssetDescriptor[] {
  const descriptors = new Map<number, CoreProductPianoAssetDescriptor>();
  addPianoMidiDescriptor(descriptors, CORE_PRODUCT_DEFAULT_PIANO_MIDI);

  if (state?.pianoEnabled === true) {
    for (const midiNote of CORE_PRODUCT_PIANO_PRELOAD_MIDI_NOTES) {
      addPianoMidiDescriptor(descriptors, midiNote);
    }
  }

  for (let lane = 1; lane <= 4; lane += 1) {
    if (state?.[`synthEuclid${lane}Enabled`] !== true || state?.[`synthEuclid${lane}Source`] !== 'piano') {
      continue;
    }
    const min = numberFromState(state, `synthEuclid${lane}NoteMin`);
    const max = numberFromState(state, `synthEuclid${lane}NoteMax`);
    if (min !== null) addPianoMidiDescriptor(descriptors, min);
    if (max !== null) addPianoMidiDescriptor(descriptors, max);
    if (min !== null && max !== null) {
      addPianoMidiDescriptor(descriptors, (min + max) * 0.5);
    } else {
      addPianoMidiDescriptor(descriptors, CORE_PRODUCT_DEFAULT_PIANO_MIDI);
    }
  }

  return [...descriptors.values()];
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
  const natureLevel = clamp01(numberFromState(state, 'natureLevel') ?? 1);
  const candidates: Array<{ key: CoreProductSoundscapeAssetKey; level: number }> = [];
  const oceanSendActive = booleanFromState(state, 'oceanSampleEnabled');
  // required: oceanSendActive
  if (oceanSendActive) {
    const oceanLevel = clamp01(numberFromState(state, 'oceanSampleLevel') ?? 0);
    if (oceanLevel > 0.0001) {
      candidates.push({ key: 'ocean', level: oceanLevel });
    }
  }
  if (booleanFromState(state, 'birdsEnabled')) {
    candidates.push({ key: 'birds', level: clamp01(numberFromState(state, 'birdsLevel') ?? 0) * natureLevel });
  }
  if (booleanFromState(state, 'birds2Enabled')) {
    candidates.push({ key: 'birds2', level: clamp01(numberFromState(state, 'birds2Level') ?? 0) * natureLevel });
  }
  if (booleanFromState(state, 'frogsEnabled')) {
    candidates.push({ key: 'frogs', level: clamp01(numberFromState(state, 'frogsLevel') ?? 0) * natureLevel });
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
