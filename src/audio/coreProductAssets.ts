import { getNearestPianoSample, getPianoSamplePath } from './pianoSamples';

export const CORE_PRODUCT_ASSET_FLAGS = Object.freeze({
  loop: 1 << 0,
  piano: 1 << 1,
  soundscape: 1 << 2,
} as const);

export const CORE_PRODUCT_DEFAULT_PIANO_MIDI = 60;
export const CORE_PRODUCT_PIANO_ASSET_ID_BASE = 7200;
export const CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID =
  CORE_PRODUCT_PIANO_ASSET_ID_BASE + getNearestPianoSample(CORE_PRODUCT_DEFAULT_PIANO_MIDI).index;
export const CORE_PRODUCT_PIANO_PRELOAD_MIDI_NOTES = Object.freeze([
  36,
  40,
  43,
  48,
  52,
  55,
  60,
  64,
  67,
  72,
  76,
  79,
  84,
] as const);
export const CORE_PRODUCT_DEFAULT_SOUNDSCAPE_ASSET_ID = 7101;
export const CORE_PRODUCT_SOUNDSCAPE_ASSETS = Object.freeze({
  ocean: {
    assetId: CORE_PRODUCT_DEFAULT_SOUNDSCAPE_ASSET_ID,
    path: 'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg',
  },
  water: {
    assetId: 7104,
    path: 'Ghetary-Waves-Rocks_cl-normalized.ogg',
  },
  birds: {
    assetId: 7102,
    path: 'Alps Birds_441_m_normalized.ogg',
  },
  birds2: {
    assetId: 7105,
    path: 'Fujian Birds 2_441_m_normalized.ogg',
  },
  frogs: {
    assetId: 7103,
    path: 'Fujian_Frogs_m_441_normalized.ogg',
  },
  insects: {
    assetId: 7106,
    path: 'Alps Birds 2_noiseremoval_441_m.ogg',
  },
} as const);

export type CoreProductSoundscapeAssetKey = keyof typeof CORE_PRODUCT_SOUNDSCAPE_ASSETS;

export type CoreProductPianoAssetDescriptor = {
  assetId: number;
  url: string;
};

export type CoreProductSoundscapeAssetDescriptor = {
  assetId: number;
  url: string;
};

export type DecodedCoreProductAsset = {
  assetId: number;
  sampleRate: number;
  channels: Float32Array[];
  flags: number;
};

export function resolveCoreProductAssetUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  return new URL(`samples/${path}`, base).toString();
}

export function getDefaultCoreProductPianoAssetUrl(): string {
  const { index } = getNearestPianoSample(CORE_PRODUCT_DEFAULT_PIANO_MIDI);
  return resolveCoreProductAssetUrl(getPianoSamplePath('regular', index));
}

export function getCoreProductPianoAssetIdForMidi(midiNote: number): number {
  const { index } = getNearestPianoSample(midiNote);
  return CORE_PRODUCT_PIANO_ASSET_ID_BASE + index;
}

export function getCoreProductPianoAssetUrlForMidi(midiNote: number): string {
  const { index } = getNearestPianoSample(midiNote);
  return resolveCoreProductAssetUrl(getPianoSamplePath('regular', index));
}

function numberFromState(state: Record<string, unknown> | undefined | null, key: string): number | null {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

export function getDefaultCoreProductSoundscapeAssetUrl(state?: Record<string, unknown> | null): string {
  const asset = CORE_PRODUCT_SOUNDSCAPE_ASSETS[getDefaultCoreProductSoundscapeAssetKey(state)];
  return resolveCoreProductAssetUrl(asset.path);
}

export function getCoreProductSoundscapeAssetDescriptorsForState(
  state?: Record<string, unknown> | null,
): CoreProductSoundscapeAssetDescriptor[] {
  const keys: CoreProductSoundscapeAssetKey[] = [];
  if (state?.oceanSampleEnabled === true) keys.push('ocean');
  if (state?.waterEnabled === true) keys.push('water');
  if (state?.birdsEnabled === true) keys.push('birds');
  if (state?.birds2Enabled === true) keys.push('birds2');
  if (state?.frogsEnabled === true) keys.push('frogs');
  if (state?.insectsEnabled === true || state?.insects2Enabled === true) keys.push('insects');

  if (keys.length === 0 && getDefaultCoreProductSoundscapeAssetKey(state)) {
    keys.push(getDefaultCoreProductSoundscapeAssetKey(state));
  }

  const seen = new Set<number>();
  return keys.flatMap((key) => {
    const asset = CORE_PRODUCT_SOUNDSCAPE_ASSETS[key];
    if (seen.has(asset.assetId)) return [];
    seen.add(asset.assetId);
    return [{
      assetId: asset.assetId,
      url: resolveCoreProductAssetUrl(asset.path),
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
