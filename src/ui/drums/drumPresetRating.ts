import type { DrumVoiceType } from '../../audio/drumSynth';
import { getPreset } from '../../audio/drumPresets';
import type { PresetIdentityMetadata, PresetSummary, PresetVersionMetadata } from '../../presets/types';
import { DEFAULT_STATE, type SliderState } from '../state';

type SavePreset = (
  name: string,
  state: SliderState,
  note?: string,
  tags?: string[],
  metadata?: PresetVersionMetadata,
  identity?: PresetIdentityMetadata,
) => Promise<void>;

type UpdateMetadata = (name: string, meta: Partial<PresetIdentityMetadata>) => Promise<void>;

function normalizePresetName(name: string): string {
  return name.trim().toLowerCase();
}

export function findDrumPresetSummary(presets: PresetSummary[], name: string): PresetSummary | undefined {
  const key = normalizePresetName(name);
  return presets.find(preset => normalizePresetName(preset.name) === key);
}

export function canRateDrumPreset(voice: DrumVoiceType, name: string, presets: PresetSummary[]): boolean {
  return Boolean(findDrumPresetSummary(presets, name) || getPreset(voice, name));
}

export async function rateDrumPreset({
  voice,
  name,
  rating,
  presets,
  save,
  updateMetadata,
}: {
  voice: DrumVoiceType;
  name: string;
  rating: number;
  presets: PresetSummary[];
  save: SavePreset;
  updateMetadata: UpdateMetadata;
}): Promise<void> {
  if (!name.trim()) return;

  const existing = findDrumPresetSummary(presets, name);
  if (!existing) {
    const runtimePreset = getPreset(voice, name);
    if (!runtimePreset) return;
    await save(
      name,
      { ...DEFAULT_STATE, ...runtimePreset.params } as SliderState,
      'Seeded from drum preset for rating',
      runtimePreset.tags,
      undefined,
      { creator: 'Kessho' },
    );
  }

  await updateMetadata(name, { rating });
}
