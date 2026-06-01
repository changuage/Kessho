import type { PresetEntry, PresetSummary } from './types';

export type SavedPresetSource = 'bundled' | 'device-local' | 'cloud';

type SavedPresetSourceInput = Pick<PresetEntry | PresetSummary, 'remoteId' | 'library' | 'author'>;

export function savedPresetSourceFor(item: SavedPresetSourceInput): SavedPresetSource {
  if (item.remoteId || item.library === 'cloud') return 'cloud';
  if (item.author === 'factory' || item.library === 'stock') return 'bundled';
  return 'device-local';
}
