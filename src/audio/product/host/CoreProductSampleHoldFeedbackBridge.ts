import {
  CORE_PRODUCT_DRUM_RANGE_TARGET_BASE,
  CORE_PRODUCT_SOURCE_IDS,
} from '../../coreProductEvents';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';

export type CoreProductSampleHoldDebugState = {
  telemetryUpdateCount: number;
  changedTriggerCount: number;
  publishedGenericCount: number;
  publishedSourceCount: number;
  publishedDrumCount: number;
  lastKeys: string[];
  lastFlashKeys: string[];
};

type UpdateCoreProductSampleHoldTriggerFeedbackOptions = {
  telemetry: CoreProductTelemetrySnapshot;
  triggerCounters: Map<string, number>;
  debugState: CoreProductSampleHoldDebugState;
  publish: (name: string, ...payload: unknown[]) => void;
};

export function createCoreProductSampleHoldDebugState(): CoreProductSampleHoldDebugState {
  return {
    telemetryUpdateCount: 0,
    changedTriggerCount: 0,
    publishedGenericCount: 0,
    publishedSourceCount: 0,
    publishedDrumCount: 0,
    lastKeys: [],
    lastFlashKeys: [],
  };
}

export function snapshotCoreProductSampleHoldDebugState(state: CoreProductSampleHoldDebugState): CoreProductSampleHoldDebugState {
  return {
    ...state,
    lastKeys: [...state.lastKeys],
    lastFlashKeys: [...state.lastFlashKeys],
  };
}

export function updateCoreProductSampleHoldTriggerFeedback({
  telemetry,
  triggerCounters,
  debugState,
  publish,
}: UpdateCoreProductSampleHoldTriggerFeedbackOptions): void {
  debugState.telemetryUpdateCount += 1;
  const genericPositions: Record<string, number> = {};
  const leadMorph: { lead1: number; lead2: number } = { lead1: -1, lead2: -1 };
  const leadDistance: { lead1: number; lead2: number } = { lead1: -1, lead2: -1 };
  const leadExpression: Record<string, number> = {};
  let sawLeadMorph = false;
  let sawLeadDistance = false;
  let sawLeadExpression = false;
  let sourcePublishCount = 0;
  let drumPublishCount = 0;
  const changedKeys: string[] = [];

  for (const entry of telemetry.productModulationDebug?.sampleHold ?? []) {
    const key = entry.controlName;
    if (!key || entry.triggerCounter <= 0) continue;
    const triggerKey = `${entry.controlId}:${entry.targetId}:${entry.paramId}`;
    const previous = triggerCounters.get(triggerKey) ?? 0;
    if (entry.triggerCounter <= previous) continue;
    triggerCounters.set(triggerKey, entry.triggerCounter);
    const position = Number.isFinite(entry.normalizedPosition)
      ? Math.max(0, Math.min(1, entry.normalizedPosition))
      : 0.5;
    genericPositions[key] = position;
    changedKeys.push(key);
    const published = publishSampleHoldSourceFeedback(entry.targetId, entry.paramId, key, position, {
      leadMorph,
      leadDistance,
      leadExpression,
      markLeadMorph: () => { sawLeadMorph = true; },
      markLeadDistance: () => { sawLeadDistance = true; },
      markLeadExpression: () => { sawLeadExpression = true; },
      publish,
    });
    sourcePublishCount += published.source;
    drumPublishCount += published.drum;
  }

  if (sawLeadMorph) {
    publish('leadMorph', leadMorph);
    sourcePublishCount += 1;
  }
  if (sawLeadDistance) {
    publish('leadDistance', leadDistance);
    sourcePublishCount += 1;
  }
  if (sawLeadExpression) {
    publish('leadExpression', leadExpression);
    sourcePublishCount += 1;
  }
  if (Object.keys(genericPositions).length > 0) {
    publish('granularSH', genericPositions);
    debugState.publishedGenericCount += 1;
    debugState.lastFlashKeys = Object.keys(genericPositions).sort();
  }
  debugState.changedTriggerCount += changedKeys.length;
  debugState.publishedSourceCount += sourcePublishCount;
  debugState.publishedDrumCount += drumPublishCount;
  debugState.lastKeys = changedKeys.sort();
}

type SampleHoldSourcePublishContext = {
  leadMorph: { lead1: number; lead2: number };
  leadDistance: { lead1: number; lead2: number };
  leadExpression: Record<string, number>;
  markLeadMorph: () => void;
  markLeadDistance: () => void;
  markLeadExpression: () => void;
  publish: (name: string, ...payload: unknown[]) => void;
};

function publishSampleHoldSourceFeedback(
  targetId: number,
  paramId: number,
  key: string,
  position: number,
  context: SampleHoldSourcePublishContext,
): { source: number; drum: number } {
  if (targetId === CORE_PRODUCT_SOURCE_IDS.pad1) return publishPadFeedback('pad', paramId, position, context);
  if (targetId === CORE_PRODUCT_SOURCE_IDS.pad2) return publishPadFeedback('pad2', paramId, position, context);
  if (targetId === CORE_PRODUCT_SOURCE_IDS.lead1) return markLeadFeedback('lead1', paramId, position, context);
  if (targetId === CORE_PRODUCT_SOURCE_IDS.lead2) return markLeadFeedback('lead2', paramId, position, context);
  if (targetId === CORE_PRODUCT_SOURCE_IDS.piano && paramId === KESSHO_PRODUCT_PARAM_IDS.SourceDistance) {
    context.publish('pianoDistance', position);
    return { source: 1, drum: 0 };
  }
  if (targetId >= CORE_PRODUCT_DRUM_RANGE_TARGET_BASE) {
    const voiceIndex = targetId - CORE_PRODUCT_DRUM_RANGE_TARGET_BASE;
    if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceMorph) context.publish('drumMorph', voiceIndex, position);
    else context.publish('drumParamSH', voiceIndex, key, position);
    return { source: 0, drum: 1 };
  }
  return { source: 0, drum: 0 };
}

function publishPadFeedback(
  prefix: 'pad' | 'pad2',
  paramId: number,
  position: number,
  context: SampleHoldSourcePublishContext,
): { source: number; drum: number } {
  if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceMorph) {
    context.publish(`${prefix}Morph`, position);
    return { source: 1, drum: 0 };
  }
  if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceDistance) {
    context.publish(`${prefix}Distance`, position);
    return { source: 1, drum: 0 };
  }
  return { source: 0, drum: 0 };
}

function markLeadFeedback(
  lead: 'lead1' | 'lead2',
  paramId: number,
  position: number,
  context: SampleHoldSourcePublishContext,
): { source: number; drum: number } {
  if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceMorph) {
    context.leadMorph[lead] = position;
    context.markLeadMorph();
  } else if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceDistance) {
    context.leadDistance[lead] = position;
    context.markLeadDistance();
  } else if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceExpression) {
    context.leadExpression[lead] = position;
    context.markLeadExpression();
  } else if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoDepth) {
    context.leadExpression.vibratoDepth = position;
    context.markLeadExpression();
  } else if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceLeadVibratoRate) {
    context.leadExpression.vibratoRate = position;
    context.markLeadExpression();
  } else if (paramId === KESSHO_PRODUCT_PARAM_IDS.SourceLeadGlide) {
    context.leadExpression.glide = position;
    context.markLeadExpression();
  }
  return { source: 0, drum: 0 };
}
