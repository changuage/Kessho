import React, { useMemo } from 'react';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { DrumVoicePreset } from '../../audio/drumPresets';
import { getFactoryPresetNames, renameUserPreset, upsertUserPreset } from '../../audio/drumPresets';
import { DRUM_VOICE_SCOPES } from '../../audio/drumVoiceConfig';
import { VOICE_MORPH_KEYS } from '../../audio/drumMorph';
import type { PresetEntry } from '../../presets/types';
import {
  PresetManagerPanel,
  usePresetManagerController,
  type PresetManagerOption,
  type PresetManagerRepository,
} from '../../presets/PresetManagerController';
import { canRateDrumPreset, rateDrumPreset } from './drumPresetRating';
import { applyDrumPresetSlotChange } from './drumPresetApply';
import { PRESET_POOL_ICON } from '../../presets/presetPool';

function createRuntimeDrumPreset(voice: DrumVoiceType, name: string, data: Record<string, unknown>, tags?: string[]): DrumVoicePreset {
  const params: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' || typeof value === 'string') params[key] = value;
  }
  return { name, voice, params, tags: tags ?? [] };
}

export interface DrumPresetManagerProps {
  voice: DrumVoiceType;
  state: SliderState;
  color: string;
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  repository: PresetManagerRepository;
  onOpenPool?: () => void;
  poolButtonTitle?: string;
  poolButtonAriaLabel?: string;
  poolButtonLabel?: React.ReactNode;
}

const DrumPresetManager: React.FC<DrumPresetManagerProps> = ({
  voice,
  state,
  color,
  onParamChange,
  onStateChange,
  repository,
  onOpenPool,
  poolButtonTitle = 'Edit drum preset pool',
  poolButtonAriaLabel = 'Edit drum preset pool',
  poolButtonLabel = PRESET_POOL_ICON,
}) => {
  const morphKeys = VOICE_MORPH_KEYS[voice];
  const engineScope = DRUM_VOICE_SCOPES[voice];
  const options = useMemo<PresetManagerOption[]>(() => {
    const stockNames = new Set(getFactoryPresetNames(voice));
    for (const preset of repository.presets) {
      if (preset.creator === 'Kessho') stockNames.add(preset.name);
    }
    const stock = [...stockNames].sort((left, right) => left.localeCompare(right)).map(name => ({
      value: name,
      label: name,
      key: `stock:${name}`,
      group: 'Stock',
      summary: repository.presets.find(preset => preset.name === name),
    }));
    const user = repository.presets
      .filter(preset => preset.creator !== 'Kessho')
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(preset => ({ value: preset.name, label: preset.name, key: `user:${preset.name}`, group: 'My Presets', summary: preset }));
    return [...stock, ...user];
  }, [repository.presets, voice]);
  const adapter = useMemo(() => ({
    saveNote: 'Saved from voice editor',
    saveAsNote: 'Saved from voice editor',
    overwriteNote: 'Updated from voice editor',
    valueForEntry: (entry: PresetEntry) => entry.name,
    onSaved: (entry: PresetEntry) => {
      const version = entry.versions.find(item => item.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];
      if (version) upsertUserPreset(voice, createRuntimeDrumPreset(voice, entry.name, version.data, entry.tags));
    },
    onRenamed: (entry: PresetEntry, previousName: string) => {
      const version = entry.versions.find(item => item.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1];
      if (version) renameUserPreset(voice, previousName, createRuntimeDrumPreset(voice, entry.name, version.data, entry.tags));
    },
    applyToSlot: (slot: 'A' | 'B', value: string) => {
      if (onStateChange) {
        onStateChange(previous => applyDrumPresetSlotChange(previous, voice, slot, value));
      } else {
        onParamChange(morphKeys[slot === 'A' ? 'presetA' : 'presetB'], value as SliderState[keyof SliderState]);
      }
    },
    canRate: (option: PresetManagerOption) => canRateDrumPreset(voice, option.value, repository.presets),
    rate: async (option: PresetManagerOption, rating: number) => {
      await rateDrumPreset({
        voice,
        name: option.value,
        rating,
        presets: repository.presets,
        save: repository.save,
        updateMetadata: repository.updateMetadata,
      });
    },
  }), [morphKeys, onParamChange, onStateChange, repository, voice]);
  const controller = usePresetManagerController({
    repository,
    options,
    initialValue: String(state[morphKeys.presetA] ?? ''),
    scopeKey: engineScope,
    state,
    adapter,
  });

  return (
    <PresetManagerPanel
      controller={controller}
      color={color}
      header="Presets"
      onOpenPool={onOpenPool}
      poolButtonTitle={poolButtonTitle}
      poolButtonAriaLabel={poolButtonAriaLabel}
      poolButtonLabel={poolButtonLabel}
    />
  );
};

export default DrumPresetManager;
