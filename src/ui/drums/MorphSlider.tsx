import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { VOICE_MORPH_KEYS } from '../../audio/drumMorph';
import { DRUM_VOICE_SCOPES } from '../../audio/drumVoiceConfig';
import { usePresets } from '../../presets/usePresets';
import { removeRuntimeValues, useRuntimeValue } from '../runtimeValueState';
import {
  getFactoryPresetNames,
  setUserPresets,
} from '../../audio/drumPresets';
import { applyDrumPresetSlotChange } from './drumPresetApply';
import { PresetPoolPopup } from '../../presets/PresetPoolPopup';
import { usePresetPoolCandidates } from '../../presets/PresetPoolContext';
import { getPresetPoolLabel, type PresetPoolCandidate } from '../../presets/presetPool';
import { rateDrumPreset } from './drumPresetRating';

interface MorphSliderProps {
  voice: DrumVoiceType;
  state: SliderState;
  getPresetNames: (voice: DrumVoiceType) => string[];
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  onAuditionPresetPreview?: (voice: DrumVoiceType, externalState: SliderState) => void | Promise<void>;
  poolPopupSlot?: 'A' | 'B' | null;
  onPoolPopupSlotChange?: (slot: 'A' | 'B' | null) => void;
}

const DRUM_POOL_PREVIEW_LEVEL_FLOOR = 0.68;

function applyDrumPoolPreviewLevelFloor(state: SliderState): SliderState {
  if (
    state.drumEnabled === true &&
    typeof state.drumLevel === 'number' &&
    state.drumLevel >= DRUM_POOL_PREVIEW_LEVEL_FLOOR
  ) {
    return state;
  }
  return {
    ...state,
    drumEnabled: true,
    drumLevel: Math.max(
      typeof state.drumLevel === 'number' ? state.drumLevel : 0,
      DRUM_POOL_PREVIEW_LEVEL_FLOOR,
    ),
  };
}

function createRuntimeDrumPreset(
  voice: DrumVoiceType,
  name: string,
  data: Record<string, unknown>,
  tags?: string[],
) {
  const params: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' || typeof value === 'string') {
      params[key] = value;
    }
  }
  return {
    name,
    voice,
    params,
    tags: tags ?? [],
  };
}

const MorphSlider: React.FC<MorphSliderProps> = ({
  voice,
  state,
  getPresetNames,
  onParamChange,
  onStateChange,
  sliderProps: getSliderProps,
  SliderComponent,
  onAuditionPresetPreview,
  poolPopupSlot: controlledPoolPopupSlot,
  onPoolPopupSlotChange,
}) => {
  const { presetA, presetB, morph: morphKey } = VOICE_MORPH_KEYS[voice];
  const engineScope = DRUM_VOICE_SCOPES[voice];
  const { presets: enginePresets, save, load, remove, updateMetadata } = usePresets('engine', engineScope);
  const [internalPoolPopupSlot, setInternalPoolPopupSlot] = useState<'A' | 'B' | null>(null);
  const poolPopupSlot = controlledPoolPopupSlot !== undefined ? controlledPoolPopupSlot : internalPoolPopupSlot;
  const setPoolPopupSlot = onPoolPopupSlotChange ?? setInternalPoolPopupSlot;
  const liveMorphValue = useRuntimeValue(String(morphKey));
  const morphValue = liveMorphValue ?? (state[morphKey] as number);
  const factoryPresetNames = getFactoryPresetNames(voice);
  const knownPresetNames = getPresetNames(voice);
  const summaryByName = useMemo(() => new Map(enginePresets.map(preset => [preset.name, preset])), [enginePresets]);
  const userPresetNames: string[] = [];
  const cloudPresetNames: string[] = [];
  const poolCandidates = useMemo<PresetPoolCandidate[]>(() => {
    const candidates: PresetPoolCandidate[] = factoryPresetNames.map((name) => {
      const summary = summaryByName.get(name);
      return {
        id: summary?.id ?? summary?.remoteId ?? name,
        name,
        library: summary?.library ?? 'stock',
        tags: summary?.tags,
        aliases: [name, summary?.id, summary?.remoteId].filter((value): value is string => Boolean(value)),
        updatedAt: summary?.updatedAt,
        rating: summary?.rating,
      };
    });
    for (const name of knownPresetNames) {
      if (factoryPresetNames.includes(name)) continue;
      const summary = summaryByName.get(name);
      candidates.push({
        id: summary?.id ?? summary?.remoteId ?? name,
        name,
        library: summary?.library ?? 'user',
        tags: summary?.tags,
        aliases: [name, summary?.id, summary?.remoteId].filter((value): value is string => Boolean(value)),
        updatedAt: summary?.updatedAt,
        rating: summary?.rating,
      });
    }
    return candidates;
  }, [factoryPresetNames, knownPresetNames, summaryByName]);
  const pool = usePresetPoolCandidates('engine', engineScope, poolCandidates, [
    String(state[presetA] ?? ''),
    String(state[presetB] ?? ''),
  ]);
  const visiblePresetNames = useMemo(() => {
    const names = new Set<string>();
    for (const candidate of pool.filteredCandidates) {
      names.add(candidate.name);
      for (const alias of candidate.aliases ?? []) names.add(alias);
    }
    return names;
  }, [pool.filteredCandidates]);
  const pooledFactoryPresetNames = factoryPresetNames.filter(name => visiblePresetNames.has(name));
  const clearLiveMorphValue = useCallback(() => {
    removeRuntimeValues([String(morphKey)]);
  }, [morphKey]);
  const handleMorphChange = useCallback((key: keyof SliderState, value: number) => {
    clearLiveMorphValue();
    onParamChange(key, value as SliderState[keyof SliderState]);
  }, [clearLiveMorphValue, onParamChange]);
  const handlePresetAChange = useCallback((value: string) => {
    clearLiveMorphValue();
    if (onStateChange) {
      onStateChange((previous) => applyDrumPresetSlotChange(previous, voice, 'A', value));
      return;
    }
    onParamChange(presetA, value as SliderState[keyof SliderState]);
  }, [clearLiveMorphValue, onParamChange, onStateChange, presetA, voice]);
  const handlePresetBChange = useCallback((value: string) => {
    clearLiveMorphValue();
    if (onStateChange) {
      onStateChange((previous) => applyDrumPresetSlotChange(previous, voice, 'B', value));
      return;
    }
    onParamChange(presetB, value as SliderState[keyof SliderState]);
  }, [clearLiveMorphValue, onParamChange, onStateChange, presetB, voice]);
  const handlePoolLoad = useCallback((candidate: PresetPoolCandidate) => {
    if (poolPopupSlot === 'A') {
      handlePresetAChange(candidate.name);
    } else if (poolPopupSlot === 'B') {
      handlePresetBChange(candidate.name);
    }
    setPoolPopupSlot(null);
  }, [handlePresetAChange, handlePresetBChange, poolPopupSlot]);

  const handlePoolAudition = useCallback((candidate: PresetPoolCandidate) => {
    if (!poolPopupSlot || !onAuditionPresetPreview) return;
    const endpointState = {
      ...state,
      [morphKey]: poolPopupSlot === 'A' ? 0 : 1,
    } as SliderState;
    const previewState = applyDrumPoolPreviewLevelFloor(applyDrumPresetSlotChange(endpointState, voice, poolPopupSlot, candidate.name));
    void onAuditionPresetPreview(voice, previewState);
  }, [morphKey, onAuditionPresetPreview, poolPopupSlot, state, voice]);

  const handlePoolDelete = useCallback((candidate: PresetPoolCandidate) => {
    return remove(candidate.name);
  }, [remove]);

  const handlePoolRate = useCallback(async (candidate: PresetPoolCandidate, rating: number) => {
    try {
      await rateDrumPreset({
        voice,
        name: candidate.name,
        rating,
        presets: enginePresets,
        save,
        updateMetadata,
      });
    } catch (ratingError) {
      console.warn(`Failed to update ${voice} preset rating:`, ratingError);
    }
  }, [enginePresets, save, updateMetadata, voice]);

  for (const name of knownPresetNames) {
    if (factoryPresetNames.includes(name)) continue;
    if (!visiblePresetNames.has(name)) continue;
    const summary = summaryByName.get(name);
    if (summary?.library === 'cloud') {
      cloudPresetNames.push(name);
    } else {
      userPresetNames.push(name);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const syncRuntimePresets = async () => {
      const runtimeNames = Array.from(new Set(enginePresets.map(preset => preset.name)));

      if (!runtimeNames.length) {
        setUserPresets(voice, []);
        return;
      }

      const runtimePresets = await Promise.all(runtimeNames.map(async (name) => {
        const entry = await load(name);
        if (!entry) return null;
        const version = entry.versions.find(v => v.v === entry.currentVersion)
          || entry.versions[entry.versions.length - 1];
        if (!version) return null;
        return createRuntimeDrumPreset(voice, entry.name, version.data, entry.tags);
      }));

      if (!cancelled) {
        setUserPresets(voice, runtimePresets.filter((preset): preset is ReturnType<typeof createRuntimeDrumPreset> => Boolean(preset)));
      }
    };

    syncRuntimePresets().catch((error) => {
      console.warn(`Failed to sync drum L1 presets for ${voice}:`, error);
      if (!cancelled) setUserPresets(voice, []);
    });

    return () => {
      cancelled = true;
    };
  }, [enginePresets, load, voice]);

  return (
    <div className="vc-morph-row">
      <span className="morph-label">A</span>
      <div className="morph-slot-wrap">
        <select
          value={String(state[presetA])}
          onChange={(e) => handlePresetAChange(e.target.value)}
          data-voice={voice}
          data-slot="A"
          title="Preset A"
        >
          <optgroup label="Stock">
            {pooledFactoryPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </optgroup>
          {userPresetNames.length > 0 && (
            <optgroup label="My Presets">
              {userPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
          {cloudPresetNames.length > 0 && (
            <optgroup label="Cloud">
              {cloudPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      <div className="vc-morph-slider">
        <SliderComponent
          label="Morph"
          value={morphValue}
          paramKey={morphKey}
          onChange={handleMorphChange}
          format={(value: number) => String(Math.round(value * 100))}
          unit="%"
          {...getSliderProps(morphKey)}
        />
      </div>

      <div className="morph-slot-wrap">
        <select
          value={String(state[presetB])}
          onChange={(e) => handlePresetBChange(e.target.value)}
          data-voice={voice}
          data-slot="B"
          title="Preset B"
        >
          <optgroup label="Stock">
            {pooledFactoryPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </optgroup>
          {userPresetNames.length > 0 && (
            <optgroup label="My Presets">
              {userPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
          {cloudPresetNames.length > 0 && (
            <optgroup label="Cloud">
              {cloudPresetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      <span className="morph-label">B</span>
      <PresetPoolPopup
        open={Boolean(poolPopupSlot)}
        title={`Preset Pool: ${getPresetPoolLabel(pool.poolKey ?? engineScope)}`}
        candidates={poolCandidates}
        poolIds={pool.poolIds}
        onChange={pool.setPoolIds}
        onReset={pool.resetPoolIds}
        onClose={() => setPoolPopupSlot(null)}
        onAudition={handlePoolAudition}
        onLoad={handlePoolLoad}
        onDelete={handlePoolDelete}
        onRate={handlePoolRate}
      />
    </div>
  );
};

export default MorphSlider;
