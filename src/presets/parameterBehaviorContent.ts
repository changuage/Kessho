import { PARAM_REGISTRY } from './ParamRegistry';
import { normalizePresetParameterBehavior, type PresetContentCandidate } from './contentNodes';
import type { PresetVersionContentRefV2Row } from './presetStorageV2';
import type { PresetVersionMetadata } from './types';
import { canonicalizePresetParameterBehaviorMetadata } from './versionMetadataHelpers';

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
  const canonical = canonicalizePresetParameterBehaviorMetadata(metadata);
  const keys = Object.keys(canonical.dualSliderConfigs ?? {});
  const byScope = new Map<string, Record<string, unknown>>();
  for (const key of keys) {
    const config = canonical.dualSliderConfigs?.[key];
    const behavior = normalizePresetParameterBehavior(config ? {
      mode: config.source === 'a' ? 'modA' : 'modB',
      range: { min: config.range[0], max: config.range[1] },
    } : undefined);
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
  const next: PresetVersionMetadata = {
    ...(metadata ?? {}),
    ...canonicalizePresetParameterBehaviorMetadata(metadata),
  };
  const dualSliderConfigs = { ...(next.dualSliderConfigs ?? {}) };
  for (const ref of refs) {
    if (ref.content_type !== 'parameterBehaviorMap') continue;
    const envelope = payloadMap.get(ref.content_hash);
    if (!isRecord(envelope) || !isRecord(envelope.content) || !isRecord(envelope.content.behaviors)) continue;
    for (const [key, rawBehavior] of Object.entries(envelope.content.behaviors)) {
      if (!isRecord(rawBehavior)) continue;
      const behavior = normalizePresetParameterBehavior(rawBehavior);
      if (behavior.mode === 'single' || !behavior.range) continue;
      dualSliderConfigs[key] = {
        source: behavior.mode === 'modB' ? 'b' : 'a',
        range: [behavior.range.min, behavior.range.max],
      };
    }
  }
  const canonical = canonicalizePresetParameterBehaviorMetadata({ dualSliderConfigs });
  if (canonical.dualSliderConfigs) next.dualSliderConfigs = canonical.dualSliderConfigs;
  else delete next.dualSliderConfigs;
  if (canonical.sliderModes) next.sliderModes = canonical.sliderModes;
  else delete next.sliderModes;
  if (canonical.dualRanges) next.dualRanges = canonical.dualRanges;
  else delete next.dualRanges;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function stripParameterBehaviorsFromV2Metadata(
  metadata: PresetVersionMetadata | undefined,
): PresetVersionMetadata | undefined {
  if (!metadata) return undefined;
  const next = { ...metadata };
  delete next.dualSliderConfigs;
  delete next.sliderModes;
  delete next.dualRanges;
  return Object.keys(next).length > 0 ? next : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
