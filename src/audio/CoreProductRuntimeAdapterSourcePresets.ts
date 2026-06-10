import type { CoreProductEvent } from './coreProductEvents';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductSourcePresetEndpointEvent } from './coreProductEvents';
import type { CoreProductSnapshot } from './coreProductSnapshot';
import { KESSHO_PRODUCT_DRUM_VOICE_COUNT } from './generated/kesshoProductSchema';

type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];

function u32ArrayChanged(previous: readonly number[] | undefined, next: readonly number[] | undefined): boolean {
  const length = Math.max(previous?.length ?? 0, next?.length ?? 0);
  for (let index = 0; index < length; index += 1) {
    if ((previous?.[index] ?? 0) !== (next?.[index] ?? 0)) return true;
  }
  return false;
}

function unitArrayChanged(previous: readonly number[] | undefined, next: readonly number[] | undefined): boolean {
  const length = Math.max(previous?.length ?? 0, next?.length ?? 0);
  for (let index = 0; index < length; index += 1) {
    if (Math.abs((previous?.[index] ?? 0) - (next?.[index] ?? 0)) > 0.000001) return true;
  }
  return false;
}

export function isPadOrLeadEndpointSource(sourceId: number): boolean {
  return sourceId === CORE_PRODUCT_SOURCE_IDS.pad1 ||
    sourceId === CORE_PRODUCT_SOURCE_IDS.pad2 ||
    sourceId === CORE_PRODUCT_SOURCE_IDS.lead1 ||
    sourceId === CORE_PRODUCT_SOURCE_IDS.lead2;
}

export function coreProductSourcePresetEndpointIdsChanged(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
  if (isPadOrLeadEndpointSource(next.sourceId)) {
    return (previous.sourcePresetAId ?? 0) !== (next.sourcePresetAId ?? 0) ||
      (previous.sourcePresetBId ?? 0) !== (next.sourcePresetBId ?? 0);
  }
  if (next.sourceId !== CORE_PRODUCT_SOURCE_IDS.drum) return false;
  return u32ArrayChanged(previous.drumVoicePresetAIds, next.drumVoicePresetAIds) ||
    u32ArrayChanged(previous.drumVoicePresetBIds, next.drumVoicePresetBIds) ||
    unitArrayChanged(previous.drumVoiceMorphs, next.drumVoiceMorphs);
}

export function canApplyCoreProductSourcePresetEndpointIdDiff(previous: ProductSourceSnapshot, next: ProductSourceSnapshot): boolean {
  if (previous.sourceId !== next.sourceId) return false;
  if (isPadOrLeadEndpointSource(next.sourceId)) {
    const nextA = next.sourcePresetAId ?? 0;
    const nextB = next.sourcePresetBId ?? 0;
    const aChanged = (previous.sourcePresetAId ?? 0) !== nextA;
    const bChanged = (previous.sourcePresetBId ?? 0) !== nextB;
    return (!aChanged || nextA > 0) && (!bChanged || nextB > 0);
  }
  if (next.sourceId !== CORE_PRODUCT_SOURCE_IDS.drum) return false;
  const maxLength = Math.max(
    previous.drumVoicePresetAIds?.length ?? 0,
    previous.drumVoicePresetBIds?.length ?? 0,
    next.drumVoicePresetAIds?.length ?? 0,
    next.drumVoicePresetBIds?.length ?? 0,
    previous.drumVoiceMorphs?.length ?? 0,
    next.drumVoiceMorphs?.length ?? 0,
  );
  for (let index = 0; index < maxLength; index += 1) {
    const aChanged = (previous.drumVoicePresetAIds?.[index] ?? 0) !== (next.drumVoicePresetAIds?.[index] ?? 0);
    const bChanged = (previous.drumVoicePresetBIds?.[index] ?? 0) !== (next.drumVoicePresetBIds?.[index] ?? 0);
    const morphChanged = Math.abs((previous.drumVoiceMorphs?.[index] ?? 0) - (next.drumVoiceMorphs?.[index] ?? 0)) > 0.000001;
    if (!aChanged && !bChanged && !morphChanged) continue;
    if (index >= KESSHO_PRODUCT_DRUM_VOICE_COUNT) return false;
    if (aChanged && (next.drumVoicePresetAIds?.[index] ?? 0) <= 0) return false;
    if (bChanged && (next.drumVoicePresetBIds?.[index] ?? 0) <= 0) return false;
    if (morphChanged && Math.max(next.drumVoicePresetAIds?.[index] ?? 0, next.drumVoicePresetBIds?.[index] ?? 0) <= 0) return false;
  }
  return true;
}

export function appendCoreProductSourcePresetEndpointDiffs(
  events: CoreProductEvent[],
  previousSources: ProductSourceSnapshot[],
  nextSources: ProductSourceSnapshot[],
): void {
  for (let sourceIndex = 0; sourceIndex < nextSources.length; sourceIndex += 1) {
    const previous = previousSources[sourceIndex];
    const next = nextSources[sourceIndex];
    if (!previous || !next || !canApplyCoreProductSourcePresetEndpointIdDiff(previous, next)) continue;
    if (isPadOrLeadEndpointSource(next.sourceId)) {
      const nextA = next.sourcePresetAId ?? 0;
      const nextB = next.sourcePresetBId ?? 0;
      if ((previous.sourcePresetAId ?? 0) !== nextA && nextA > 0) {
        events.push(createCoreProductSourcePresetEndpointEvent(next.sourceId, 'A', nextA));
      }
      if ((previous.sourcePresetBId ?? 0) !== nextB && nextB > 0) {
        events.push(createCoreProductSourcePresetEndpointEvent(next.sourceId, 'B', nextB));
      }
      continue;
    }
    if (next.sourceId !== CORE_PRODUCT_SOURCE_IDS.drum) continue;
    for (let voiceIndex = 0; voiceIndex < KESSHO_PRODUCT_DRUM_VOICE_COUNT; voiceIndex += 1) {
      const nextA = next.drumVoicePresetAIds?.[voiceIndex] ?? 0;
      const nextB = next.drumVoicePresetBIds?.[voiceIndex] ?? 0;
      const drumMorph = next.drumVoiceMorphs?.[voiceIndex];
      const aChanged = (previous.drumVoicePresetAIds?.[voiceIndex] ?? 0) !== nextA;
      const bChanged = (previous.drumVoicePresetBIds?.[voiceIndex] ?? 0) !== nextB;
      const morphChanged = Math.abs((previous.drumVoiceMorphs?.[voiceIndex] ?? 0) - (next.drumVoiceMorphs?.[voiceIndex] ?? 0)) > 0.000001;
      if (aChanged && nextA > 0) {
        events.push(createCoreProductSourcePresetEndpointEvent(next.sourceId, 'A', nextA, voiceIndex, drumMorph));
      }
      if (bChanged && nextB > 0) {
        events.push(createCoreProductSourcePresetEndpointEvent(next.sourceId, 'B', nextB, voiceIndex, drumMorph));
      }
      if (!aChanged && !bChanged && morphChanged) {
        const endpoint = nextA > 0 ? 'A' : 'B';
        const presetId = nextA > 0 ? nextA : nextB;
        if (presetId > 0) {
          events.push(createCoreProductSourcePresetEndpointEvent(next.sourceId, endpoint, presetId, voiceIndex, drumMorph));
        }
      }
    }
  }
}
