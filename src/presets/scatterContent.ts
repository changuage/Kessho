import type { PresetVersionContentRefV2Row } from './presetStorageV2';
import { createPresetContentNode, type PresetContentCandidate } from './contentNodes';
import type { PresetVersionMetadata } from './types';
import type { SerializedSeqScatterState } from '../ui/drums/scatter/scatterTypes';
import {
  deserializeSeqScatterState,
  serializeSeqScatterState,
} from '../ui/drums/scatter/scatterDefaults';

export interface ScatterConfigInstance {
  id: 'scatter.config';
  refSlot: 'scatter.config';
  contentType: 'scatterConfig';
  content: Record<string, unknown>;
}

export function buildScatterConfigInstance(metadata: PresetVersionMetadata | undefined): ScatterConfigInstance | null {
  const value = metadata?.drumScatterState;
  if (!value || value.formatVersion !== 1) return null;
  const config = serializeSeqScatterState(deserializeSeqScatterState(value));
  const content = { config: config as unknown as Record<string, unknown> };
  // Validate once here so malformed legacy metadata is omitted before hashing.
  createPresetContentNode('scatterConfig', content);
  return { id: 'scatter.config', refSlot: 'scatter.config', contentType: 'scatterConfig', content };
}

export function scatterConfigCandidates(instance: ScatterConfigInstance | null): PresetContentCandidate[] {
  return instance ? [{ id: instance.id, contentType: instance.contentType, content: instance.content }] : [];
}

export function hydrateScatterConfigRefs(
  metadata: PresetVersionMetadata | undefined,
  refs: readonly PresetVersionContentRefV2Row[],
  payloadMap: Map<string, unknown>,
): PresetVersionMetadata | undefined {
  const ref = refs.find((candidate) => candidate.ref_slot === 'scatter.config' && candidate.content_type === 'scatterConfig');
  if (!ref) return metadata;
  const payload = payloadMap.get(ref.content_hash);
  if (!isRecord(payload) || !isRecord(payload.content) || !isRecord(payload.content.config)) return metadata;
  const config = payload.content.config as unknown as SerializedSeqScatterState;
  if (config.formatVersion !== 1) return metadata;
  return {
    ...(metadata ?? {}),
    drumScatterState: serializeSeqScatterState(deserializeSeqScatterState(config)),
  };
}

export function stripScatterConfigFromV2Metadata(
  metadata: PresetVersionMetadata | undefined,
): PresetVersionMetadata | undefined {
  if (!metadata) return undefined;
  const next = { ...metadata };
  delete next.drumScatterState;
  return Object.keys(next).length > 0 ? next : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
