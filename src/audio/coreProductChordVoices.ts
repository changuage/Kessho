import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { isProductSourceMonophonic } from './productSourceCapabilities';
import {
  PAD_VOICE_COUNT,
  enabledChordMidiForMask,
  enabledVoiceRank,
  padChordVoiceMasksForSource,
  padEuclidOwnedVoiceMask,
} from './coreProductArrangementVoiceMapping';
import {
  boundedInteger,
  boundedNumber,
  clamp,
  manualNoteSourceEnabled,
} from './coreProductArrangementSchedulerUtils';

export interface CoreProductChordVoice {
  sourceId: number;
  midi: number;
  voiceIndex: number;
  baseDelaySeconds: number;
  velocity: number;
}

export interface ResolveCoreProductChordVoicesArgs {
  state: Record<string, unknown>;
  source: string;
  voiceCount: number;
  chordMidi: readonly number[];
  octaveShift: number;
  triggerIntervalSeconds: number;
  /** Fraction of the trigger interval available to a mono traversal. */
  gate?: number;
  /** Strum scheduling applies its own spread/curve after voice resolution. */
  timingMode?: 'straight' | 'strum';
  rng: () => number;
  velocity?: number;
}

export function resolveCoreProductChordVoices(args: ResolveCoreProductChordVoicesArgs): CoreProductChordVoice[] {
  const { state, triggerIntervalSeconds, rng } = args;
  const source = String(args.source ?? 'sample1').trim().toLowerCase();
  const voiceCount = clamp(Math.round(args.voiceCount), 1, PAD_VOICE_COUNT);
  const velocity = clamp(args.velocity ?? 1, 0.001, 1);
  const chordMidi = args.chordMidi.length > 0 ? args.chordMidi : [48 + boundedInteger(state, 'rootNote', 4, 0, 11)];
  const octaveShift = Math.round(args.octaveShift);
  const voices: CoreProductChordVoice[] = [];
  const nonPadSourceId = source === 'lead1' || source === 'lead'
    ? CORE_PRODUCT_SOURCE_IDS.lead1
    : source === 'lead2'
      ? CORE_PRODUCT_SOURCE_IDS.lead2
      : source === 'sample1'
        ? CORE_PRODUCT_SOURCE_IDS.sample1
        : source === 'sample2'
          ? CORE_PRODUCT_SOURCE_IDS.sample2
        : 0;

  if (nonPadSourceId !== 0) {
    if (!manualNoteSourceEnabled(state, nonPadSourceId)) return [];
    const mono = isProductSourceMonophonic(nonPadSourceId);
    const orderedMidi = mono ? [...chordMidi].sort((left, right) => left - right) : chordMidi;
    const monoCount = Math.min(voiceCount, orderedMidi.length);
    const gate = clamp(args.gate ?? 1, 0.05, 1);
    const waveSpreadSeconds = !mono
      ? boundedNumber(state, 'waveSpread', 0.125, 0, 1) * triggerIntervalSeconds
      : 0;
    const voiceOffsets = !mono
      ? Array.from({ length: PAD_VOICE_COUNT }, () => rng() * waveSpreadSeconds).sort((a, b) => a - b)
      : [];
    for (let index = 0; index < (mono ? monoCount : voiceCount); index += 1) {
      voices.push({
        sourceId: nonPadSourceId,
        midi: clamp(orderedMidi[index % orderedMidi.length]! + octaveShift, 0, 127),
        voiceIndex: index,
        baseDelaySeconds: mono && args.timingMode !== 'strum'
          ? triggerIntervalSeconds * gate * (monoCount <= 1 ? 0 : index / (monoCount - 1))
          : voiceOffsets[index] ?? 0,
        velocity,
      });
    }
    return voices;
  }

  const waveSpreadSeconds = boundedNumber(state, 'waveSpread', 0.125, 0, 1) * triggerIntervalSeconds;
  const voiceOffsets = Array.from({ length: PAD_VOICE_COUNT }, () => rng() * waveSpreadSeconds).sort((a, b) => a - b);

  const maskLimit = (1 << PAD_VOICE_COUNT) - 1;
  const euclidOwnedMask = padEuclidOwnedVoiceMask(state);
  const rawVoiceMask = boundedInteger(state, 'synthVoiceMask', 63, 0, maskLimit) & maskLimit;
  const pad2Assign = boundedInteger(state, 'pad2VoiceAssign', 0, 0, maskLimit) & maskLimit;
  const availablePadMask = rawVoiceMask & ~euclidOwnedMask;
  const rawPadMasks = padChordVoiceMasksForSource(source, availablePadMask, pad2Assign, voiceCount);
  const pad1Mask = manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad1) ? rawPadMasks.pad1Mask : 0;
  const pad2Mask = manualNoteSourceEnabled(state, CORE_PRODUCT_SOURCE_IDS.pad2) ? rawPadMasks.pad2Mask : 0;
  if ((pad1Mask | pad2Mask) === 0) return [];

  const pad1ChordMidi = enabledChordMidiForMask([...chordMidi], pad1Mask);
  const pad2ChordMidi = enabledChordMidiForMask([...chordMidi], pad2Mask);
  for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT; voiceIndex += 1) {
    const bit = 1 << voiceIndex;
    const delaySeconds = voiceOffsets[voiceIndex] ?? 0;
    if ((pad1Mask & bit) !== 0) {
      const enabledIndex = enabledVoiceRank(pad1Mask, voiceIndex);
      voices.push({
        sourceId: CORE_PRODUCT_SOURCE_IDS.pad1,
        midi: clamp(pad1ChordMidi[enabledIndex % pad1ChordMidi.length]! + octaveShift, 0, 127),
        voiceIndex,
        baseDelaySeconds: delaySeconds,
        velocity,
      });
    }
    if ((pad2Mask & bit) !== 0) {
      const enabledIndex = enabledVoiceRank(pad2Mask, voiceIndex);
      voices.push({
        sourceId: CORE_PRODUCT_SOURCE_IDS.pad2,
        midi: clamp(pad2ChordMidi[enabledIndex % pad2ChordMidi.length]! + octaveShift, 0, 127),
        voiceIndex,
        baseDelaySeconds: delaySeconds,
        velocity,
      });
    }
  }
  return voices;
}
