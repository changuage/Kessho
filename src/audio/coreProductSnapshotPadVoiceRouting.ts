import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { PAD_VOICE_COUNT, PAD_VOICE_DEFAULT_MASK, PAD_VOICE_MASK_ALL } from './coreProductArrangementVoiceMapping';
import { normalizeSynthEuclidSource } from './coreProductSourceMapping';
import { booleanFromState, clamp, numberFromState } from './coreProductSnapshotState';

const PAD_VOICE_SEED_FLAG = 0x40000000;
const PAD_VOICE_MASK_SEED_FLAG = 0x20000000;
const PAD_VOICE_MASK_SEED_SHIFT = 16;
const PAD_VOICE_MASK_SEED_PAYLOAD_MASK = 0x0000ffff;
const PAD_VOICE_SEED_SHIFT = 24;
const PAD_VOICE_SEED_PAYLOAD_MASK = 0x00ffffff;

export function synthSourceIdFromState(state: Record<string, unknown> | undefined, key: string): number {
  const source = normalizeSynthEuclidSource(state?.[key]);
  if (source === 'lead1') return CORE_PRODUCT_SOURCE_IDS.lead1;
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'sample1') return CORE_PRODUCT_SOURCE_IDS.sample1;
  if (source === 'sample2') return CORE_PRODUCT_SOURCE_IDS.sample2;
  if (source === 'pad1') return CORE_PRODUCT_SOURCE_IDS.pad1;
  if (source === 'pad2') return CORE_PRODUCT_SOURCE_IDS.pad2;
  if (source.startsWith('synth')) {
    const voiceIndex = Number.parseInt(source.slice('synth'.length), 10) - 1;
    const pad2Assign = Math.round(numberFromState(state, 'pad2VoiceAssign', 0)) & PAD_VOICE_MASK_ALL;
    const pad2Enabled = booleanFromState(state, 'pad2Enabled', false);
    return pad2Enabled && voiceIndex >= 0 && voiceIndex < PAD_VOICE_COUNT && (pad2Assign & (1 << voiceIndex)) !== 0
      ? CORE_PRODUCT_SOURCE_IDS.pad2
      : CORE_PRODUCT_SOURCE_IDS.pad1;
  }
  return CORE_PRODUCT_SOURCE_IDS.lead1;
}

export function synthSourcePadVoiceMaskFromState(state: Record<string, unknown> | undefined, key: string): number {
  const source = normalizeSynthEuclidSource(state?.[key]);
  if (source === 'pad1' || source === 'pad2') {
    const mask = Math.round(numberFromState(state, key.replace(/Source$/, 'VoiceMask'), PAD_VOICE_DEFAULT_MASK)) & PAD_VOICE_MASK_ALL;
    return mask !== 0 ? mask : PAD_VOICE_DEFAULT_MASK;
  }
  if (!source.startsWith('synth')) return 0;
  const voiceIndex = Number.parseInt(source.slice('synth'.length), 10) - 1;
  return Number.isFinite(voiceIndex) && voiceIndex >= 0 && voiceIndex < PAD_VOICE_COUNT ? (1 << voiceIndex) : 0;
}

export function synthEuclidUsesSourceId(state: Record<string, unknown> | undefined, sourceId: number): boolean {
  if (!booleanFromState(state, 'synthEuclideanMasterEnabled', false)) return false;
  for (let laneNumber = 1; laneNumber <= 4; laneNumber += 1) {
    if (
      booleanFromState(state, `synthEuclid${laneNumber}Enabled`, laneNumber === 1) &&
      synthSourceIdFromState(state, `synthEuclid${laneNumber}Source`) === sourceId
    ) {
      return true;
    }
  }
  return false;
}

export function encodedPadVoiceLaneSeed(baseSeed: number, voiceMask: number): number {
  const mask = Math.round(voiceMask) & PAD_VOICE_MASK_ALL;
  if (mask === 0) return baseSeed >>> 0;
  if ((mask & (mask - 1)) !== 0) {
    return (
      PAD_VOICE_MASK_SEED_FLAG |
      (mask << PAD_VOICE_MASK_SEED_SHIFT) |
      (baseSeed & PAD_VOICE_MASK_SEED_PAYLOAD_MASK)
    ) >>> 0;
  }
  const voiceIndex = Math.floor(Math.log2(mask));
  const encodedVoice = clamp(voiceIndex + 1, 1, PAD_VOICE_COUNT);
  return (PAD_VOICE_SEED_FLAG | (encodedVoice << PAD_VOICE_SEED_SHIFT) | (baseSeed & PAD_VOICE_SEED_PAYLOAD_MASK)) >>> 0;
}
