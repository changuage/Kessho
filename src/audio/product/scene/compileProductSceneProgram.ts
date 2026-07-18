import { buildCoreProductSnapshotDiff } from '../../CoreProductRuntimeAdapter';
import {
  CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE,
  CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE,
  CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS, KESSHO_PRODUCT_PARAMS } from '../../generated/kesshoProductParams';
import {
  KESSHO_PRODUCT_SCENE_MAX_COMMANDS,
  KESSHO_PRODUCT_SCENE_MAX_ENTRIES,
} from '../../generated/kesshoProductSceneCapacities';

export const PRODUCT_SCENE_MAX_ENTRIES = KESSHO_PRODUCT_SCENE_MAX_ENTRIES;
export const PRODUCT_SCENE_MAX_COMMANDS = KESSHO_PRODUCT_SCENE_MAX_COMMANDS;

export type ProductSceneInterpolation = 'linear' | 'log' | 'discrete-a' | 'discrete-b' | 'enable-gate';
export type ProductSceneDirection = 'forward' | 'reverse';

export type ProductSceneEntry = {
  eventKind: number;
  targetId: number;
  index: number;
  paramId: number;
  valueA: number;
  valueB: number;
  interpolation: ProductSceneInterpolation;
  threshold: number;
};

export type ProductSceneBoundaryCommand = {
  event: CoreProductEvent;
  direction: ProductSceneDirection;
  threshold: number;
};

export type ProductSceneProgram = {
  entries: ProductSceneEntry[];
  boundaryCommands: ProductSceneBoundaryCommand[];
  requiredAssetIds: number[];
  unsupportedKeys: string[];
  revision: number;
};

const paramMetadata = new Map<number, (typeof KESSHO_PRODUCT_PARAMS)[number]>(
  KESSHO_PRODUCT_PARAMS.map((param) => [param.id, param]),
);

function finite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function identity(event: CoreProductEvent): string {
  return [event.eventKind, event.targetId ?? 0, event.index ?? 0, event.paramId ?? 0].join(':');
}

function hasAdditionalValues(event: CoreProductEvent): boolean {
  return finite(event.value2) !== 0 || finite(event.value3) !== 0 || finite(event.value4) !== 0;
}

function isContinuousCandidate(event: CoreProductEvent): boolean {
  if (hasAdditionalValues(event) || finite(event.flags) !== 0) return false;
  return event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetParam ||
    event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane;
}

function interpolationFor(event: CoreProductEvent): ProductSceneInterpolation {
  const metadata = paramMetadata.get(event.paramId ?? 0);
  if (metadata?.type === 'uint' && /(?:Id|Mode|Role|Type|Direction|Source|Quality|Articulation|Condition|Binding|Preset|Bus|Trigger|Feel|Tuning)$/.test(metadata.name)) {
    return 'discrete-a';
  }
  if (metadata?.type !== 'bool') return 'linear';
  if (metadata.path.endsWith('.enabled') && (
    metadata.path.startsWith('sources.') ||
    metadata.path.startsWith('fx.')
  )) return 'enable-gate';
  return 'discrete-a';
}

function eventGroups(events: readonly CoreProductEvent[]): Map<string, CoreProductEvent[]> {
  const groups = new Map<string, CoreProductEvent[]>();
  for (const event of events) {
    const key = identity(event);
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }
  return groups;
}

function assetClosure(a: CoreProductSnapshot, b: CoreProductSnapshot): number[] {
  return [...new Set([...a.assetRefs, ...b.assetRefs].filter((assetId) => assetId > 0))].sort((left, right) => left - right);
}

function assetLevels(snapshot: CoreProductSnapshot): Map<number, number> {
  return new Map(snapshot.assetRefs.map((assetId, index) => [assetId, snapshot.assetRefLevels[index] ?? 1]));
}

function appendSyntheticEntry(
  entries: ProductSceneEntry[],
  targetId: number,
  valueA: number,
  valueB: number,
  interpolation: ProductSceneInterpolation = 'linear',
): void {
  if (Math.abs(valueA - valueB) <= 0.000001) return;
  entries.push({
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetParam,
    targetId,
    index: 0,
    paramId: KESSHO_PRODUCT_PARAM_IDS.SourceLevel,
    valueA,
    valueB,
    interpolation,
    threshold: 0.5,
  });
}

function normalizedSceneEndpoints(
  endpointA: CoreProductSnapshot,
  endpointB: CoreProductSnapshot,
): { a: CoreProductSnapshot; b: CoreProductSnapshot; syntheticEntries: ProductSceneEntry[]; requiredAssetIds: number[] } {
  const a = structuredClone(endpointA);
  const b = structuredClone(endpointB);
  const zeroAudibleSourceSide = (source: CoreProductSnapshot['sources'][number]): void => {
    source.level = 0;
    source.reverbSend = 0;
    source.delayASend = 0;
    source.delayBSend = 0;
    source.granularSend = 0;
    source.degradeSend = 0;
  };
  for (let index = 0; index < Math.min(a.sources.length, b.sources.length); index += 1) {
    const sourceA = a.sources[index]!;
    const sourceB = b.sources[index]!;
    if (!sourceA.enabled && sourceB.enabled) zeroAudibleSourceSide(sourceA);
    if (sourceA.enabled && !sourceB.enabled) zeroAudibleSourceSide(sourceB);
  }
  const requiredAssetIds = assetClosure(endpointA, endpointB);
  const levelsA = assetLevels(endpointA);
  const levelsB = assetLevels(endpointB);
  const syntheticEntries: ProductSceneEntry[] = [];
  for (const assetId of requiredAssetIds) {
    appendSyntheticEntry(
      syntheticEntries,
      CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + assetId,
      levelsA.get(assetId) ?? 0,
      levelsB.get(assetId) ?? 0,
    );
  }
  a.assetRefs = [...requiredAssetIds];
  b.assetRefs = [...requiredAssetIds];
  a.assetRefLevels = requiredAssetIds.map(() => 0);
  b.assetRefLevels = requiredAssetIds.map(() => 0);

  const textureCount = Math.max(endpointA.soundscape.textureParamCount, endpointB.soundscape.textureParamCount);
  for (let index = 0; index < textureCount; index += 1) {
    appendSyntheticEntry(
      syntheticEntries,
      CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE + index,
      endpointA.soundscape.textureParams[index] ?? 0,
      endpointB.soundscape.textureParams[index] ?? 0,
    );
  }
  const moduleCount = Math.max(endpointA.soundscape.moduleParamCount, endpointB.soundscape.moduleParamCount);
  for (let index = 0; index < moduleCount; index += 1) {
    appendSyntheticEntry(
      syntheticEntries,
      CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + index,
      endpointA.soundscape.moduleParams[index] ?? 0,
      endpointB.soundscape.moduleParams[index] ?? 0,
      index === 0 || index === 60 || index === 61 || index === 77 || index === 78 || index === 94
        ? 'discrete-a'
        : 'linear',
    );
  }
  a.soundscape = structuredClone(endpointA.soundscape);
  b.soundscape = structuredClone(endpointA.soundscape);
  return { a, b, syntheticEntries, requiredAssetIds };
}

export function evaluateProductSceneEntry(entry: ProductSceneEntry, position: number): number {
  const t = Math.max(0, Math.min(1, position));
  switch (entry.interpolation) {
    case 'log':
      return entry.valueA > 0 && entry.valueB > 0
        ? Math.exp(Math.log(entry.valueA) + (Math.log(entry.valueB) - Math.log(entry.valueA)) * t)
        : entry.valueA + (entry.valueB - entry.valueA) * t;
    case 'discrete-a':
      return t < entry.threshold ? entry.valueA : entry.valueB;
    case 'discrete-b':
      return t <= entry.threshold ? entry.valueA : entry.valueB;
    case 'enable-gate':
      if (entry.valueA < 0.5 && entry.valueB >= 0.5) return t > 0 ? entry.valueB : entry.valueA;
      if (entry.valueA >= 0.5 && entry.valueB < 0.5) return t < 1 ? entry.valueA : entry.valueB;
      return t < entry.threshold ? entry.valueA : entry.valueB;
    case 'linear':
    default:
      return entry.valueA + (entry.valueB - entry.valueA) * t;
  }
}

function programRevision(entries: readonly ProductSceneEntry[], commands: readonly ProductSceneBoundaryCommand[]): number {
  let hash = 2166136261 >>> 0;
  const mix = (value: number): void => {
    const text = Number.isInteger(value) ? String(value) : value.toPrecision(9);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  };
  for (const entry of entries) {
    mix(entry.eventKind); mix(entry.targetId); mix(entry.index); mix(entry.paramId);
    mix(entry.valueA); mix(entry.valueB); mix(entry.threshold);
    for (let index = 0; index < entry.interpolation.length; index += 1) {
      mix(entry.interpolation.charCodeAt(index));
    }
  }
  for (const command of commands) {
    mix(command.event.eventKind); mix(command.event.targetId ?? 0); mix(command.event.index ?? 0);
    mix(command.event.paramId ?? 0); mix(command.event.value ?? 0); mix(command.event.value2 ?? 0);
    mix(command.event.value3 ?? 0); mix(command.event.value4 ?? 0); mix(command.event.flags ?? 0);
    mix(command.threshold);
    mix(command.direction === 'forward' ? 1 : 2);
  }
  return hash;
}

export function compileProductSceneProgram(
  endpointA: CoreProductSnapshot,
  endpointB: CoreProductSnapshot,
): ProductSceneProgram {
  const normalized = normalizedSceneEndpoints(endpointA, endpointB);
  const forward = buildCoreProductSnapshotDiff(normalized.a, normalized.b);
  const reverse = buildCoreProductSnapshotDiff(normalized.b, normalized.a);
  const unsupportedKeys: string[] = [];
  if (!forward.applied) unsupportedKeys.push(`endpoint-a-to-b:${forward.reason}`);
  if (!reverse.applied) unsupportedKeys.push(`endpoint-b-to-a:${reverse.reason}`);
  if (!forward.applied || !reverse.applied) {
    return {
      entries: [], boundaryCommands: [], requiredAssetIds: normalized.requiredAssetIds,
      unsupportedKeys, revision: 0,
    };
  }

  const reverseGroups = eventGroups(reverse.events);
  const continuousKeys = new Set<string>();
  const entries: ProductSceneEntry[] = [...normalized.syntheticEntries];
  for (const eventB of forward.events) {
    if (!isContinuousCandidate(eventB)) continue;
    const key = identity(eventB);
    const candidates = reverseGroups.get(key) ?? [];
    const eventA = candidates[0];
    if (candidates.length !== 1 || !eventA || !isContinuousCandidate(eventA)) continue;
    entries.push({
      eventKind: eventB.eventKind,
      targetId: eventB.targetId ?? 0,
      index: eventB.index ?? 0,
      paramId: eventB.paramId ?? 0,
      valueA: finite(eventA.value),
      valueB: finite(eventB.value),
      interpolation: interpolationFor(eventB),
      threshold: 0.5,
    });
    continuousKeys.add(key);
  }

  const boundaryCommands: ProductSceneBoundaryCommand[] = [];
  for (const event of forward.events) {
    if (!continuousKeys.has(identity(event))) boundaryCommands.push({ event: { ...event, sampleOffset: 0 }, direction: 'forward', threshold: 0.5 });
  }
  for (const event of reverse.events) {
    if (!continuousKeys.has(identity(event))) boundaryCommands.push({ event: { ...event, sampleOffset: 0 }, direction: 'reverse', threshold: 0.5 });
  }

  if (entries.length > PRODUCT_SCENE_MAX_ENTRIES) {
    unsupportedKeys.push(`capacity:entries:${entries.length}>${PRODUCT_SCENE_MAX_ENTRIES}`);
  }
  if (boundaryCommands.length > PRODUCT_SCENE_MAX_COMMANDS) {
    unsupportedKeys.push(`capacity:commands:${boundaryCommands.length}>${PRODUCT_SCENE_MAX_COMMANDS}`);
  }
  const revision = programRevision(entries, boundaryCommands);
  if (normalized.requiredAssetIds.length > 16) {
    unsupportedKeys.push(`capacity:soundscape-assets:${normalized.requiredAssetIds.length}>16`);
  }
  return { entries, boundaryCommands, requiredAssetIds: normalized.requiredAssetIds, unsupportedKeys, revision };
}

const interpolationIds: Record<ProductSceneInterpolation, number> = {
  linear: 0,
  log: 1,
  'discrete-a': 2,
  'discrete-b': 3,
  'enable-gate': 4,
};

export function createCoreProductSceneProgramEvents(program: ProductSceneProgram): CoreProductEvent[] {
  if (program.unsupportedKeys.length > 0) {
    throw new Error(`Cannot upload unsupported Product scene program: ${program.unsupportedKeys.join(', ')}`);
  }
  const events: CoreProductEvent[] = [{
    eventKind: KESSHO_PRODUCT_EVENT_IDS.BeginSceneProgram,
    value: program.entries.length,
    value2: program.boundaryCommands.length,
    value3: program.revision,
  }];
  program.entries.forEach((entry, slot) => {
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSceneEntry,
      targetId: entry.targetId,
      index: slot,
      paramId: entry.paramId,
      value: entry.valueA,
      value2: entry.valueB,
      value3: entry.threshold,
      value4: entry.eventKind,
      flags: interpolationIds[entry.interpolation] | (entry.index << 8),
    });
  });
  program.boundaryCommands.forEach((command, slot) => {
    const event = command.event;
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSceneCommandHeader,
      targetId: event.targetId ?? 0,
      index: slot,
      paramId: event.paramId ?? 0,
      value: event.index ?? 0,
      value2: command.threshold,
      value3: event.eventKind,
      value4: command.direction === 'forward' ? 1 : 2,
      flags: event.flags ?? 0,
    });
    events.push({
      eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSceneCommandValues,
      index: slot,
      value: event.value ?? 0,
      value2: event.value2 ?? 0,
      value3: event.value3 ?? 0,
      value4: event.value4 ?? 0,
    });
  });
  events.push({ eventKind: KESSHO_PRODUCT_EVENT_IDS.CommitSceneProgram });
  return events;
}

export function createCoreProductScenePositionEvent(position: number): CoreProductEvent {
  if (!Number.isFinite(position) || position < 0 || position > 1) {
    throw new RangeError(`Product scene position must be between 0 and 1; received ${position}`);
  }
  return { eventKind: KESSHO_PRODUCT_EVENT_IDS.SetScenePosition, value: position };
}
