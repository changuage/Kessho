import { PARAM_REGISTRY } from './ParamRegistry';
import { normalizePresetParameterBehavior, type PresetContentCandidate } from './contentNodes';
import type { PresetVersionContentRefV2Row } from './presetStorageV2';
import type { PresetVersionMetadata } from './types';

export interface ParameterBehaviorInstance {
  id: string;
  refSlot: string;
  contentType: 'parameterBehaviorMap';
  content: Record<string, unknown>;
}

function scopeSlug(scope: string): string {
  return scope.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
}

export function buildParameterBehaviorInstances(
  metadata: PresetVersionMetadata | undefined,
): ParameterBehaviorInstance[] {
  const keys = new Set([
    ...Object.keys(metadata?.sliderModes ?? {}),
    ...Object.keys(metadata?.dualRanges ?? {}),
  ]);
  const byScope = new Map<string, Record<string, unknown>>();
  for (const key of keys) {
    const mode = metadata?.sliderModes?.[key];
    const range = metadata?.dualRanges?.[key];
    const behavior = normalizePresetParameterBehavior({ mode, ...(range ? { range } : {}) });
    if (behavior.mode === 'single') continue;
    const scope = PARAM_REGISTRY[key]?.scope ?? 'global';
    const values = byScope.get(scope) ?? {};
    values[key] = behavior;
    byScope.set(scope, values);
  }
  return [...byScope.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([scope, behaviors]) => ({
    id: `behavior.${scope}`,
    refSlot: `behavior.scope.${scopeSlug(scope)}.content`,
    contentType: 'parameterBehaviorMap',
    content: { scope, behaviors },
  }));
}

export function parameterBehaviorCandidates(
  instances: readonly ParameterBehaviorInstance[],
): PresetContentCandidate[] {
  return instances.map(instance => ({ id: instance.id, contentType: instance.contentType, content: instance.content }));
}

export function hydrateParameterBehaviorRefs(
  metadata: PresetVersionMetadata | undefined,
  refs: readonly PresetVersionContentRefV2Row[],
  payloadMap: Map<string, unknown>,
): PresetVersionMetadata | undefined {
  const next: PresetVersionMetadata = { ...(metadata ?? {}) };
  const sliderModes = { ...(next.sliderModes ?? {}) };
  const dualRanges = { ...(next.dualRanges ?? {}) };
  for (const ref of refs) {
    if (ref.content_type !== 'parameterBehaviorMap') continue;
    const envelope = payloadMap.get(ref.content_hash);
    if (!isRecord(envelope) || !isRecord(envelope.content) || !isRecord(envelope.content.behaviors)) continue;
    for (const [key, rawBehavior] of Object.entries(envelope.content.behaviors)) {
      if (!isRecord(rawBehavior) || (rawBehavior.mode !== 'walk' && rawBehavior.mode !== 'sampleHold')) continue;
      sliderModes[key] = rawBehavior.mode;
      if (isRecord(rawBehavior.range)
          && typeof rawBehavior.range.min === 'number'
          && typeof rawBehavior.range.max === 'number') {
        dualRanges[key] = { min: rawBehavior.range.min, max: rawBehavior.range.max };
      }
    }
  }
  if (Object.keys(sliderModes).length > 0) next.sliderModes = sliderModes;
  if (Object.keys(dualRanges).length > 0) next.dualRanges = dualRanges;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function stripParameterBehaviorsFromV2Metadata(
  metadata: PresetVersionMetadata | undefined,
): PresetVersionMetadata | undefined {
  if (!metadata) return undefined;
  const next = { ...metadata };
  delete next.sliderModes;
  delete next.dualRanges;
  return Object.keys(next).length > 0 ? next : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
