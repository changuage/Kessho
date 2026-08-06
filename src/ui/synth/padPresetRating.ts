import {
  getFactoryPadPresetIdByName,
  getPadPreset,
  PAD1_TO_PAD2_KEY,
  type PadPresetOption,
} from '../../audio/padPresets';
import type { PresetEntry, PresetIdentityMetadata, PresetSummary, PresetVersionMetadata } from '../../presets/types';
import { DEFAULT_STATE, type SliderState } from '../state';

type PadScope = 'pad1' | 'pad2';

type SavePreset = (
  name: string,
  state: SliderState,
  note?: string,
  tags?: string[],
  metadata?: PresetVersionMetadata,
  identity?: PresetIdentityMetadata,
) => Promise<PresetEntry | null>;

type UpdateMetadata = (name: string, meta: Partial<PresetIdentityMetadata>) => Promise<boolean>;

function normalizePresetName(name: string): string {
  return name.trim().toLowerCase();
}

function mapPadParamsToState(scope: PadScope, params: Record<string, number | string | boolean>): Partial<SliderState> {
  if (scope === 'pad1') return params as Partial<SliderState>;

  const mapped: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    const pad2Key = PAD1_TO_PAD2_KEY[key];
    if (pad2Key) mapped[pad2Key] = value;
  }
  return mapped as Partial<SliderState>;
}

export function findPadPresetSummary(
  presets: PresetSummary[],
  option: PadPresetOption | null | undefined,
): PresetSummary | undefined {
  if (!option) return undefined;
  const optionName = normalizePresetName(option.name);
  const optionId = normalizePresetName(option.id);
  return presets.find((preset) => (
    normalizePresetName(preset.name) === optionName
    || normalizePresetName(preset.name) === optionId
    || normalizePresetName(preset.id ?? '') === optionId
  ));
}

export function canRatePadPreset(
  scope: PadScope,
  option: PadPresetOption | null | undefined,
  presets: PresetSummary[],
): boolean {
  if (!option) return false;
  if (findPadPresetSummary(presets, option)) return true;
  const factoryId = getFactoryPadPresetIdByName(option.name);
  return Boolean(getPadPreset(option.id, scope) || (factoryId && getPadPreset(factoryId, scope)));
}

export async function ratePadPreset({
  scope,
  option,
  rating,
  presets,
  save,
  updateMetadata,
}: {
  scope: PadScope;
  option: PadPresetOption;
  rating: number;
  presets: PresetSummary[];
  save: SavePreset;
  updateMetadata: UpdateMetadata;
}): Promise<void> {
  const existing = findPadPresetSummary(presets, option);
  const targetName = existing?.name ?? option.name;

  if (!existing) {
    const factoryId = getFactoryPadPresetIdByName(option.name);
    const runtimePreset = getPadPreset(option.id, scope) || (factoryId ? getPadPreset(factoryId, scope) : undefined);
    if (!runtimePreset) return;
    await save(
      targetName,
      {
        ...DEFAULT_STATE,
        ...mapPadParamsToState(scope, runtimePreset.params),
      } as SliderState,
      'Seeded from pad preset for rating',
      runtimePreset.tags,
      undefined,
      { creator: 'Kessho' },
    );
  }

  const updated = await updateMetadata(targetName, { rating });
  if (!updated) throw new Error(`Rating for preset "${targetName}" was not updated.`);
}
