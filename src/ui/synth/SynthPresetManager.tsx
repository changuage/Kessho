import React, { useMemo } from 'react';
import type { SliderState } from '../state';
import {
  getFactoryPadPresetIdByName,
  getPadPresetOptions,
  PAD1_TO_PAD2_KEY,
  upsertUserPadPreset,
} from '../../audio/padPresets';
import type { PresetEntry } from '../../presets/types';
import {
  PresetManagerPanel,
  usePresetManagerController,
  type PresetManagerOption,
  type PresetManagerRepository,
  type PresetManagerVariationControls,
} from '../../presets/PresetManagerController';
import { canRatePadPreset, findPadPresetSummary, ratePadPreset } from './padPresetRating';
import { PRESET_POOL_ICON } from '../../presets/presetPool';

const PAD2_TO_PAD1_KEY = Object.fromEntries(
  Object.entries(PAD1_TO_PAD2_KEY).map(([pad1Key, pad2Key]) => [pad2Key, pad1Key]),
) as Record<string, string>;

function createRuntimePadPreset(scope: 'pad1' | 'pad2', name: string, data: Record<string, unknown>, tags?: string[]) {
  const params: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    const targetKey = scope === 'pad1' ? key : PAD2_TO_PAD1_KEY[key];
    if (targetKey && (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean')) {
      params[targetKey] = value;
    }
  }
  return { name, tags: tags ?? [], params };
}

function resolveRuntimePadPresetId(entry: Pick<PresetEntry, 'id' | 'name'>): string {
  return getFactoryPadPresetIdByName(entry.name) ?? entry.id ?? entry.name;
}

export interface SynthPresetManagerProps {
  engineScope: 'pad1' | 'pad2';
  slotAKey: keyof SliderState;
  slotBKey: keyof SliderState;
  slotALabel?: string;
  slotBLabel?: string;
  state: SliderState;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  color: string;
  repository: PresetManagerRepository;
  onOpenPool?: () => void;
  poolButtonTitle?: string;
  poolButtonAriaLabel?: string;
  poolButtonLabel?: React.ReactNode;
  variationControls?: PresetManagerVariationControls;
}

const SynthPresetManager: React.FC<SynthPresetManagerProps> = ({
  engineScope,
  slotAKey,
  slotBKey,
  slotALabel = 'A',
  slotBLabel = 'B',
  state,
  onSelectChange,
  color,
  repository,
  onOpenPool,
  poolButtonTitle = 'Edit preset pool',
  poolButtonAriaLabel = 'Edit preset pool',
  poolButtonLabel = PRESET_POOL_ICON,
  variationControls,
}) => {
  const padOptions = useMemo(() => getPadPresetOptions(engineScope), [engineScope, repository.presets]);
  const options = useMemo<PresetManagerOption[]>(
    () => padOptions.map(option => ({
      value: option.id,
      label: option.name,
      key: `${option.library}:${option.id}`,
      summary: findPadPresetSummary(repository.presets, option),
    })),
    [padOptions, repository.presets],
  );
  const adapter = useMemo(() => ({
    saveNote: 'Saved from synth editor',
    saveAsNote: 'Saved from synth editor',
    overwriteNote: 'Updated from synth editor',
    valueForEntry: resolveRuntimePadPresetId,
    onSaved: (entry: PresetEntry) => {
      const version = entry.versions.find(item => item.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];
      if (!version) return;
      upsertUserPadPreset(engineScope, {
        id: resolveRuntimePadPresetId(entry),
        name: entry.name,
        library: entry.library === 'cloud' ? 'cloud' : 'user',
        preset: createRuntimePadPreset(engineScope, entry.name, version.data, entry.tags),
      });
    },
    onRenamed: (entry: PresetEntry) => {
      const version = entry.versions.find(item => item.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];
      if (!version) return;
      upsertUserPadPreset(engineScope, {
        id: resolveRuntimePadPresetId(entry),
        name: entry.name,
        library: entry.library === 'cloud' ? 'cloud' : 'user',
        preset: createRuntimePadPreset(engineScope, entry.name, version.data, entry.tags),
      });
    },
    applyToSlot: (slot: 'A' | 'B', value: string) => {
      onSelectChange(slot === 'A' ? slotAKey : slotBKey, value as SliderState[keyof SliderState]);
    },
    canRate: (option: PresetManagerOption) => {
      const padOption = padOptions.find(candidate => candidate.id === option.value);
      return canRatePadPreset(engineScope, padOption, repository.presets);
    },
    rate: async (option: PresetManagerOption, rating: number) => {
      const padOption = padOptions.find(candidate => candidate.id === option.value);
      if (!padOption) return;
      await ratePadPreset({
        scope: engineScope,
        option: padOption,
        rating,
        presets: repository.presets,
        save: repository.save,
        updateMetadata: repository.updateMetadata,
      });
    },
  }), [engineScope, onSelectChange, padOptions, repository, slotAKey, slotBKey]);
  const controller = usePresetManagerController({
    repository,
    options,
    initialValue: String(state[slotAKey] ?? ''),
    scopeKey: engineScope,
    state,
    adapter,
  });

  return (
    <PresetManagerPanel
      controller={controller}
      color={color}
      slotALabel={slotALabel}
      slotBLabel={slotBLabel}
      onOpenPool={onOpenPool}
      poolButtonTitle={poolButtonTitle}
      poolButtonAriaLabel={poolButtonAriaLabel}
      poolButtonLabel={poolButtonLabel}
      variationControls={variationControls}
    />
  );
};

export default SynthPresetManager;
