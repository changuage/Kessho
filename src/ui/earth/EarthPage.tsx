/**
 * Earth Page — Pure UI for Soundscapes (Water + Ocean + Insects)
 *
 * No audio code — all synthesis runs in the main engine (engine.ts).
 * State flows through SliderState; props follow the same pattern as
 * SynthPage / DrumPage / GranularPage.
 *
 * Layout: Left = Sound-engine controls, Right = Scene mixer + advanced layers
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './earth.css';
import { DualSlider, type DualSliderRange } from '../DualSlider';
import type { SliderMode, SliderState } from '../state';
import { QUANTIZATION } from '../state';
import type { EarthTextureDebugState } from '../../audio/engineSharedTypes';
import { usePresets } from '../../presets/usePresets';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import {
  INSECT_ENGINES,
  INSECT_ENGINE_DEFAULTS,
  WATER_MORPH_PARAM_KEYS,
  WATER_PRESETS,
  getStockWaterPresetIdByName,
  getWaterPresetOptions,
  morphWaterPresets,
  setUserWaterPresets,
  upsertUserWaterPreset,
} from '../../audio/waterPresets';
import {
  EarthDualSliderRenderer,
  EarthPresetOption,
  EarthDualSliderOptions,
} from './components/EarthControls';
import { WaterCard } from './components/WaterCard';
import { OceanCard } from './components/OceanCard';
import { NatureCard } from './components/NatureCard';
import { InsectsCard } from './components/InsectsCard';
import { WalkSpeedCard } from './components/WalkSpeedCard';
import { ActiveEarthMatrix } from './components/ActiveEarthMatrix';

export interface EarthPageProps {
  state: SliderState;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  sliderProps: (paramKey: keyof SliderState) => {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode?: (key: keyof SliderState) => void;
    onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
  };
  isRunning: boolean;
  getEarthTextureDebugState: () => EarthTextureDebugState;
  textureDebugAvailable?: boolean;
}

const EARTH_DUAL_KEYS: readonly (keyof SliderState)[] = [
  'earthLevel',
  'waterMorph',
  'waterIntensity', 'waterDistance', 'waterDropSize',
  'waterHardness', 'waterGlassThickness', 'waterHardDropBaseFreq',
  'waterWaterDropBaseFreq', 'waterReverbSend',
  'oceanSampleLevel', 'oceanSliceDuration', 'oceanSliceDensity',
  'oceanFilterCutoff', 'oceanFilterResonance',
  'oceanReverbSend', 'oceanDelayASend', 'oceanDelayBSend',
  'birdsLevel', 'birdsSliceDuration', 'birdsSliceDensity',
  'birds2Level', 'birds2SliceDuration', 'birds2SliceDensity',
  'frogsLevel', 'frogsSliceDuration', 'frogsSliceDensity',
  'natureLevel', 'natureReverbSend', 'natureDelayASend', 'natureDelayBSend',
  'insectsDensity', 'insectsTemperature', 'insectsDistance', 'insectsProximity',
  'insectsAntiphony', 'insectsClickRate', 'insectsMotion',
  'insects2Density', 'insects2Temperature', 'insects2Distance', 'insects2Proximity',
  'insects2Antiphony', 'insects2ClickRate', 'insects2Motion',
  'waterLevel', 'insectsLevel', 'insectsSharedLevel', 'insects2Level',
  'insectsReverbSend', 'waterDelayASend', 'waterDelayBSend',
  'granularWavesSend', 'granularNatureSend', 'granularWaterSend', 'granularInsectsSend',
  'waterLayerHardDrops', 'waterLayerWaterDrops', 'waterLayerTurbulence',
  'waterLayerBubbling', 'waterLayerSurf', 'waterLayerChannels',
  'waterHardDropRate', 'waterHardDropLPF', 'waterHardDropTone',
  'waterWaterDropRate', 'waterWaterDropLPF',
  'waterBubblingRate', 'waterBubblingLPF',
  'waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfFoamBright', 'waterSurfProximity', 'waterSurfDepth',
  'waterSurfBody', 'waterSurfSpray',
  'waterDensityHardSend', 'waterDensityWaterSend', 'waterDensityBubbleSend',
  'waterDensityFeedback', 'waterDensityTone', 'waterDensityRing', 'waterDensityWet',
  'waterChannelsMorph', 'waterChannelsSpeed',
] as const;

const EARTH_ENGINE_CARD_IDS = ['water', 'ocean', 'birds', 'birds2', 'frogs', 'insects1', 'insects2'] as const;

type EarthEngineCardId = typeof EARTH_ENGINE_CARD_IDS[number];

type EarthEngineCardExpansion = Partial<Record<EarthEngineCardId, boolean>>;

type QuantizationRange = { min: number; max: number; step: number };

function quantize(key: string, v: number): number {
  const q = (QUANTIZATION as Record<string, QuantizationRange>)[key];
  if (!q) return v;
  const clamped = Math.max(q.min, Math.min(q.max, v));
  return q.min + Math.round((clamped - q.min) / q.step) * q.step;
}

const WATER_PRESET_METADATA_KEYS: readonly (keyof SliderState)[] = [
  'waterSurfDuration',
  'waterSurfInterval',
  'waterSurfFoam',
  'waterSurfProximity',
  'waterSurfDepth',
] as const;

const INSECTS1_PARAM_KEYS: readonly (keyof SliderState)[] = [
  'insectsEngine',
  'insectsDensity',
  'insectsTemperature',
  'insectsDistance',
  'insectsProximity',
  'insectsAntiphony',
  'insectsClickRate',
  'insectsMotion',
] as const;

const INSECTS2_PARAM_KEYS: readonly (keyof SliderState)[] = [
  'insects2Engine',
  'insects2Density',
  'insects2Temperature',
  'insects2Distance',
  'insects2Proximity',
  'insects2Antiphony',
  'insects2ClickRate',
  'insects2Motion',
] as const;

export default function EarthPage({
  state,
  onParamChange,
  onSelectChange,
  onStateChange,
  sliderProps,
  isRunning: _isRunning,
  getEarthTextureDebugState,
  textureDebugAvailable = true,
}: EarthPageProps) {
  const [selectedWaterPreset, setSelectedWaterPreset] = useState(() => String(state.waterPreset));
  const [selectedInsects1Preset, setSelectedInsects1Preset] = useState(() => `stock:${state.insectsEngine}`);
  const [selectedInsects2Preset, setSelectedInsects2Preset] = useState(() => `stock:${state.insects2Engine}`);
  const [earthKitPresetName, setEarthKitPresetName] = useState<string | undefined>();
  const [waterLocalRatings, setWaterLocalRatings] = useState<Record<string, number>>({});
  const [insectsLocalRatings, setInsectsLocalRatings] = useState<Record<string, number>>({});
  const [manualExpandedCards, setManualExpandedCards] = useState<EarthEngineCardExpansion>({});
  const {
    presets: waterEnginePresets,
    save: saveWaterPreset,
    load: loadWaterPreset,
    refresh: refreshWaterPresets,
    updateMetadata: updateWaterPresetMetadata,
  } = usePresets('engine', 'water');
  const {
    presets: insects1EnginePresets,
    save: saveInsects1Preset,
    load: loadInsects1Preset,
    refresh: refreshInsects1Presets,
    updateMetadata: updateInsects1PresetMetadata,
  } = usePresets('engine', 'insects1');
  const {
    presets: insects2EnginePresets,
    save: saveInsects2Preset,
    load: loadInsects2Preset,
    refresh: refreshInsects2Presets,
    updateMetadata: updateInsects2PresetMetadata,
  } = usePresets('engine', 'insects2');

  const anyWalkMode = useMemo(
    () => EARTH_DUAL_KEYS.some(k => sliderProps(k).mode === 'walk'),
    [sliderProps],
  );

  const defaultExpandedCards = useMemo<Record<EarthEngineCardId, boolean>>(() => ({
    water: Boolean(state.waterEnabled),
    ocean: Boolean(state.oceanSampleEnabled),
    birds: Boolean(state.birdsEnabled),
    birds2: Boolean(state.birds2Enabled),
    frogs: Boolean(state.frogsEnabled),
    insects1: Boolean(state.insectsEnabled),
    insects2: Boolean(state.insects2Enabled),
  }), [
    state.birds2Enabled,
    state.birdsEnabled,
    state.frogsEnabled,
    state.insects2Enabled,
    state.insectsEnabled,
    state.oceanSampleEnabled,
    state.waterEnabled,
  ]);

  const previousDefaultExpandedCards = useRef(defaultExpandedCards);

  useEffect(() => {
    const changedCards = EARTH_ENGINE_CARD_IDS.filter((cardId) => (
      previousDefaultExpandedCards.current[cardId] !== defaultExpandedCards[cardId]
    ));
    previousDefaultExpandedCards.current = defaultExpandedCards;
    if (changedCards.length === 0) return;
    setManualExpandedCards((prev) => {
      if (!changedCards.some((cardId) => Object.prototype.hasOwnProperty.call(prev, cardId))) return prev;
      const next = { ...prev };
      changedCards.forEach((cardId) => { delete next[cardId]; });
      return next;
    });
  }, [defaultExpandedCards]);

  const toggleCard = useCallback((cardId: string) => {
    if (!EARTH_ENGINE_CARD_IDS.includes(cardId as EarthEngineCardId)) return;
    const engineCardId = cardId as EarthEngineCardId;
    setManualExpandedCards((prev) => ({
      ...prev,
      [engineCardId]: !(prev[engineCardId] ?? defaultExpandedCards[engineCardId]),
    }));
  }, [defaultExpandedCards]);

  const expandedCards = useMemo(() => {
    const next = new Set<string>();
    EARTH_ENGINE_CARD_IDS.forEach((cardId) => {
      if (manualExpandedCards[cardId] ?? defaultExpandedCards[cardId]) next.add(cardId);
    });
    return next;
  }, [defaultExpandedCards, manualExpandedCards]);

  useEffect(() => {
    setSelectedWaterPreset(String(state.waterPreset));
  }, [state.waterPreset]);

  useEffect(() => {
    setSelectedInsects1Preset(prev => (prev.startsWith('stock:') ? `stock:${state.insectsEngine}` : prev));
  }, [state.insectsEngine]);

  useEffect(() => {
    setSelectedInsects2Preset(prev => (prev.startsWith('stock:') ? `stock:${state.insects2Engine}` : prev));
  }, [state.insects2Engine]);

  useEffect(() => {
    let cancelled = false;

    const syncWaterRuntimePresets = async () => {
      const runtimePresets = await Promise.all(
        waterEnginePresets
          .map(async (preset) => {
            const entry = await loadWaterPreset(preset.name);
            if (!entry) return null;
            const version = entry.versions.find(v => v.v === entry.currentVersion)
              || entry.versions[entry.versions.length - 1];
            if (!version) return null;
            const data = Object.fromEntries(
              WATER_MORPH_PARAM_KEYS
                .map((key) => [key, version.data[key]])
                .filter(([, value]) => typeof value === 'number'),
            ) as Record<string, number>;
            const stockId = getStockWaterPresetIdByName(entry.name);
            const runtimeLibrary: 'user' | 'cloud' = entry.library === 'cloud' ? 'cloud' : 'user';

            return {
              sourceId: stockId != null
                ? `stock:${stockId}`
                : entry.id ?? entry.name,
              name: entry.name,
              library: runtimeLibrary,
              data,
              dualRanges: version.dualRanges,
              sliderModes: version.sliderModes as Record<string, SliderMode> | undefined,
            };
          }),
      );

      if (!cancelled) {
        setUserWaterPresets(runtimePresets.filter((preset): preset is NonNullable<typeof preset> => Boolean(preset)));
      }
    };

    syncWaterRuntimePresets().catch((error) => {
      console.warn('Failed to sync water L1 presets:', error);
      if (!cancelled) setUserWaterPresets([]);
    });

    return () => {
      cancelled = true;
    };
  }, [loadWaterPreset, waterEnginePresets]);

  const waterPresetOptions = useMemo<EarthPresetOption[]>(
    () => {
      const presetsByName = new Map(
        waterEnginePresets.map((preset) => [preset.name.trim().toLowerCase(), preset]),
      );
      return getWaterPresetOptions().map((option) => {
        const preset = presetsByName.get(option.name.trim().toLowerCase());
        const stockIndex = getStockWaterPresetIdByName(option.name);
        return {
          value: String(option.id),
          label: option.name,
          library: preset?.library ?? option.library,
          stockIndex: stockIndex ?? undefined,
          presetName: preset?.name,
          rating: waterLocalRatings[String(option.id)] ?? preset?.rating,
        };
      });
    },
    [waterEnginePresets, waterLocalRatings],
  );

  const insects1PresetOptions = useMemo<EarthPresetOption[]>(() => {
    const stockNames = new Set(INSECT_ENGINES.map((name) => name.trim().toLowerCase()));
    const presetsByName = new Map(
      insects1EnginePresets.map((preset) => [preset.name.trim().toLowerCase(), preset]),
    );
    const stock = INSECT_ENGINES.map((name, index) => {
      const preset = presetsByName.get(name.trim().toLowerCase());
      return {
        value: `stock:${index}`,
        label: name,
        library: preset?.library ?? 'stock',
        stockIndex: index,
        presetName: preset?.name,
        rating: insectsLocalRatings[`insects1:stock:${index}`] ?? preset?.rating,
      };
    });
    const custom = insects1EnginePresets
      .filter((preset) => !stockNames.has(preset.name.trim().toLowerCase()))
      .map((preset) => ({
        value: `${preset.library}:${preset.name}`,
        label: preset.name,
        library: preset.library,
        presetName: preset.name,
        rating: insectsLocalRatings[`insects1:${preset.library}:${preset.name}`] ?? preset.rating,
      }));
    return [...stock, ...custom];
  }, [insects1EnginePresets, insectsLocalRatings]);

  const insects2PresetOptions = useMemo<EarthPresetOption[]>(() => {
    const stockNames = new Set(INSECT_ENGINES.map((name) => name.trim().toLowerCase()));
    const presetsByName = new Map(
      insects2EnginePresets.map((preset) => [preset.name.trim().toLowerCase(), preset]),
    );
    const stock = INSECT_ENGINES.map((name, index) => {
      const preset = presetsByName.get(name.trim().toLowerCase());
      return {
        value: `stock:${index}`,
        label: name,
        library: preset?.library ?? 'stock',
        stockIndex: index,
        presetName: preset?.name,
        rating: insectsLocalRatings[`insects2:stock:${index}`] ?? preset?.rating,
      };
    });
    const custom = insects2EnginePresets
      .filter((preset) => !stockNames.has(preset.name.trim().toLowerCase()))
      .map((preset) => ({
        value: `${preset.library}:${preset.name}`,
        label: preset.name,
        library: preset.library,
        presetName: preset.name,
        rating: insectsLocalRatings[`insects2:${preset.library}:${preset.name}`] ?? preset.rating,
      }));
    return [...stock, ...custom];
  }, [insects2EnginePresets, insectsLocalRatings]);

  const handleWaterPresetRate = useCallback(async (option: EarthPresetOption, rating: number) => {
    setWaterLocalRatings(prev => ({ ...prev, [option.value]: rating }));
    try {
      let targetName = option.presetName;
      if (!targetName && option.stockIndex != null) {
        targetName = option.label;
        const presetData = morphWaterPresets(option.stockIndex, option.stockIndex, 0);
        await saveWaterPreset(
          targetName,
          {
            ...state,
            ...presetData,
            waterPreset: option.stockIndex,
            waterMorphA: option.stockIndex,
            waterMorphB: option.stockIndex,
            waterMorph: 0,
          },
          'Seeded from water preset for rating',
          ['water', 'nature'],
          undefined,
          { creator: 'Kessho' },
        );
        await refreshWaterPresets();
      }

      if (!targetName) return;
      await updateWaterPresetMetadata(targetName, { rating });
    } catch (ratingError) {
      console.warn('Failed to update water preset rating:', ratingError);
    }
  }, [morphWaterPresets, refreshWaterPresets, saveWaterPreset, state, updateWaterPresetMetadata]);

  const handleInsectsPresetRate = useCallback(async (scope: 'insects1' | 'insects2', option: EarthPresetOption, rating: number) => {
    setInsectsLocalRatings(prev => ({ ...prev, [`${scope}:${option.value}`]: rating }));
    try {
      const updatePresetMetadata = scope === 'insects1' ? updateInsects1PresetMetadata : updateInsects2PresetMetadata;
      let targetName = option.presetName;

      if (!targetName && option.stockIndex != null) {
        targetName = option.label;
        const defaults = INSECT_ENGINE_DEFAULTS[option.stockIndex];
        if (!defaults) return;
        const savePreset = scope === 'insects1' ? saveInsects1Preset : saveInsects2Preset;
        const refreshPresetList = scope === 'insects1' ? refreshInsects1Presets : refreshInsects2Presets;
        const seedState = scope === 'insects1'
          ? {
              ...state,
              insectsEngine: option.stockIndex,
              insectsDensity: defaults.density,
              insectsTemperature: defaults.temperature,
              insectsDistance: defaults.distance,
              insectsProximity: defaults.proximity,
              insectsAntiphony: defaults.antiphony,
              insectsClickRate: defaults.clickRate,
              insectsMotion: defaults.motion,
            }
          : {
              ...state,
              insects2Engine: option.stockIndex,
              insects2Density: defaults.density,
              insects2Temperature: defaults.temperature,
              insects2Distance: defaults.distance,
              insects2Proximity: defaults.proximity,
              insects2Antiphony: defaults.antiphony,
              insects2ClickRate: defaults.clickRate,
              insects2Motion: defaults.motion,
            };
        await savePreset(
          targetName,
          seedState,
          'Seeded from insects preset for rating',
          ['insects', 'nature'],
          undefined,
          { creator: 'Kessho' },
        );
        await refreshPresetList();
      }

      if (!targetName) return;
      await updatePresetMetadata(targetName, { rating });
    } catch (ratingError) {
      console.warn('Failed to update insects preset rating:', ratingError);
    }
  }, [
    refreshInsects1Presets,
    refreshInsects2Presets,
    saveInsects1Preset,
    saveInsects2Preset,
    state,
    updateInsects1PresetMetadata,
    updateInsects2PresetMetadata,
  ]);

  const applyNumericPresetData = useCallback((
    keys: readonly (keyof SliderState)[],
    data: Record<string, unknown>,
  ) => {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'number') {
        onParamChange(key, value);
      }
    }
  }, [onParamChange]);

  const handleEarthKitPresetLoad = useCallback((entry: PresetEntry, _data: Record<string, unknown>) => {
    setEarthKitPresetName(entry.name);
  }, []);

  const collectWaterPresetMetadata = useCallback(() => {
    const sliderModes: Record<string, SliderMode> = {};
    const dualRanges: Record<string, { min: number; max: number }> = {};

    for (const key of WATER_PRESET_METADATA_KEYS) {
      const sp = sliderProps(key);
      if (sp.mode !== 'single') sliderModes[key] = sp.mode;
      if (sp.dualRange) dualRanges[key] = sp.dualRange;
    }

    return {
      sliderModes: Object.keys(sliderModes).length > 0 ? sliderModes : undefined,
      dualRanges: Object.keys(dualRanges).length > 0 ? dualRanges : undefined,
    };
  }, [sliderProps]);

  const handleWaterPresetSelect = useCallback((value: string) => {
    const option = waterPresetOptions.find((entry) => entry.value === value);
    if (!option) return;
    setSelectedWaterPreset(option.value);
  }, [waterPresetOptions]);

  const handleWaterPresetLoad = useCallback((value: string, slot: 'A' | 'B') => {
    const option = waterPresetOptions.find((entry) => entry.value === value);
    if (!option) return;
    const presetId = Number(option.value);
    if (!Number.isFinite(presetId)) return;

    setSelectedWaterPreset(option.value);
    if (slot === 'A') {
      onSelectChange('waterMorphA', presetId as SliderState['waterMorphA']);
    } else {
      onSelectChange('waterMorphB', presetId as SliderState['waterMorphB']);
    }
    const currentMorph = Number(state.waterMorph);
    const slotIsActive = slot === 'A' ? currentMorph < 0.5 : currentMorph >= 0.5;
    if (slotIsActive) {
      onSelectChange('waterPreset', presetId as SliderState['waterPreset']);
    }
  }, [onSelectChange, state.waterMorph, waterPresetOptions]);

  const handleWaterPresetSave = useCallback(async () => {
    const currentId = Number(selectedWaterPreset);
    const currentOption = waterPresetOptions.find((option) => option.value === selectedWaterPreset);
    const defaultName = currentOption?.label || WATER_PRESETS[currentId] || 'Water Preset';

    let targetName = defaultName;
    if (!currentOption) {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        'Name this Water preset',
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
    }

    const metadata = collectWaterPresetMetadata();
    await saveWaterPreset(
      targetName,
      state,
      currentOption ? 'Updated from water preset loader' : 'Saved from water preset loader',
      undefined,
      metadata,
    );
    await refreshWaterPresets();

    const savedEntry = await loadWaterPreset(targetName);
    if (!savedEntry) return;
    const version = savedEntry.versions.find(v => v.v === savedEntry.currentVersion)
      || savedEntry.versions[savedEntry.versions.length - 1];
    if (!version) return;

    const data = Object.fromEntries(
      WATER_MORPH_PARAM_KEYS
        .map((key) => [key, version.data[key]])
        .filter(([, value]) => typeof value === 'number'),
    ) as Record<string, number>;
    const stockId = getStockWaterPresetIdByName(savedEntry.name);

    const savedId = upsertUserWaterPreset({
      sourceId: stockId != null
        ? `stock:${stockId}`
        : savedEntry.id ?? savedEntry.name,
      name: savedEntry.name,
      library: savedEntry.library === 'cloud' ? 'cloud' : 'user',
      data,
      dualRanges: version.dualRanges,
      sliderModes: version.sliderModes as Record<string, SliderMode> | undefined,
    });

    setSelectedWaterPreset(String(savedId));
  }, [
    collectWaterPresetMetadata,
    loadWaterPreset,
    refreshWaterPresets,
    saveWaterPreset,
    selectedWaterPreset,
    state,
    waterPresetOptions,
  ]);

  const applyInsectsStockPreset = useCallback((scope: 'insects1' | 'insects2', stockIndex: number) => {
    const defaults = INSECT_ENGINE_DEFAULTS[stockIndex];
    if (!defaults) return;
    if (scope === 'insects1') {
      onParamChange('insectsEngine', stockIndex);
      onParamChange('insectsDensity', defaults.density);
      onParamChange('insectsTemperature', defaults.temperature);
      onParamChange('insectsDistance', defaults.distance);
      onParamChange('insectsProximity', defaults.proximity);
      onParamChange('insectsAntiphony', defaults.antiphony);
      onParamChange('insectsClickRate', defaults.clickRate);
      onParamChange('insectsMotion', defaults.motion);
      return;
    }
    onParamChange('insects2Engine', stockIndex);
    onParamChange('insects2Density', defaults.density);
    onParamChange('insects2Temperature', defaults.temperature);
    onParamChange('insects2Distance', defaults.distance);
    onParamChange('insects2Proximity', defaults.proximity);
    onParamChange('insects2Antiphony', defaults.antiphony);
    onParamChange('insects2ClickRate', defaults.clickRate);
    onParamChange('insects2Motion', defaults.motion);
  }, [onParamChange]);

  const handleInsectsPresetLoad = useCallback(async (scope: 'insects1' | 'insects2', value: string) => {
    const options = scope === 'insects1' ? insects1PresetOptions : insects2PresetOptions;
    const option = options.find((entry) => entry.value === value);
    if (!option) return;

    if (scope === 'insects1') setSelectedInsects1Preset(value);
    else setSelectedInsects2Preset(value);

    const loadPreset = scope === 'insects1' ? loadInsects1Preset : loadInsects2Preset;
    const entry = option.presetName ? await loadPreset(option.presetName) : null;
    if (entry) {
      const version = entry.versions.find(v => v.v === entry.currentVersion)
        || entry.versions[entry.versions.length - 1];
      if (!version) return;
      applyNumericPresetData(scope === 'insects1' ? INSECTS1_PARAM_KEYS : INSECTS2_PARAM_KEYS, version.data);
      return;
    }

    if (option.stockIndex != null) {
      applyInsectsStockPreset(scope, option.stockIndex);
    }
  }, [
    applyInsectsStockPreset,
    applyNumericPresetData,
    insects1PresetOptions,
    insects2PresetOptions,
    loadInsects1Preset,
    loadInsects2Preset,
  ]);

  const handleInsectsPresetSave = useCallback(async (scope: 'insects1' | 'insects2') => {
    const selectedValue = scope === 'insects1' ? selectedInsects1Preset : selectedInsects2Preset;
    const options = scope === 'insects1' ? insects1PresetOptions : insects2PresetOptions;
    const currentOption = options.find((option) => option.value === selectedValue);
    const defaultName = currentOption?.label || `${scope === 'insects1' ? 'Insects 1' : 'Insects 2'} Preset`;
    let targetName = defaultName;

    if (!currentOption) {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Name this ${scope === 'insects1' ? 'Insects 1' : 'Insects 2'} preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
    }

    const savePreset = scope === 'insects1' ? saveInsects1Preset : saveInsects2Preset;
    const refreshPresetList = scope === 'insects1' ? refreshInsects1Presets : refreshInsects2Presets;
    await savePreset(
      targetName,
      state,
      currentOption ? 'Updated from insects preset strip' : 'Saved from insects preset strip',
    );
    await refreshPresetList();

    const matchingStockIndex = INSECT_ENGINES.findIndex(
      (name) => name.trim().toLowerCase() === targetName.trim().toLowerCase(),
    );
    const selectedKey = matchingStockIndex >= 0 ? `stock:${matchingStockIndex}` : `user:${targetName}`;
    if (scope === 'insects1') setSelectedInsects1Preset(selectedKey);
    else setSelectedInsects2Preset(selectedKey);
  }, [
    insects1PresetOptions,
    insects2PresetOptions,
    refreshInsects1Presets,
    refreshInsects2Presets,
    saveInsects1Preset,
    saveInsects2Preset,
    selectedInsects1Preset,
    selectedInsects2Preset,
    state,
  ]);

  const ds = useCallback<EarthDualSliderRenderer>((
    key: keyof SliderState,
    label: string,
    fillColor: string,
    opts?: EarthDualSliderOptions,
  ) => {
    const sp = sliderProps(key);
    const q = (QUANTIZATION as Record<string, QuantizationRange>)[key as string];
    if (!q) return null;
    return (
      <DualSlider<keyof SliderState>
        label={label}
        value={state[key] as number}
        paramKey={key}
        paramInfo={q}
        quantizeFn={(_, v) => quantize(key as string, v)}
        mode={sp.mode}
        dualRange={sp.dualRange}
        walkPosition={sp.walkPosition}
        isFlashing={sp.isFlashing}
        onChange={onParamChange}
        onCycleMode={sp.onCycleMode ?? (() => undefined)}
        onDualRangeChange={sp.onDualRangeChange ?? (() => undefined)}
        groupClassName="earth-slider-row"
        fillColor={fillColor}
        format={opts?.format}
        logarithmic={opts?.logarithmic}
      />
    );
  }, [onParamChange, sliderProps, state]);

  return (
    <div className="earth-root">
      <div className="container">
        <div className="sound-panel">
          <div className="earth-kit-preset-bar fx-page-header fx-page-header--identity">
            <span className="earth-kit-label fx-page-title">≈ Earth</span>
          </div>

          <div className="earth-kit-preset-card fx-kit-preset-card">
            <span className="fx-kit-preset-title">Kit</span>
            <PresetDropdown
              level="kit"
              scope="earthKit"
              state={state}
              currentName={earthKitPresetName}
              onLoad={handleEarthKitPresetLoad}
              onStateChange={onStateChange}
              compact
            />
          </div>

          <WaterCard
            state={state}
            ds={ds}
            waterPresetOptions={waterPresetOptions}
            selectedWaterPreset={selectedWaterPreset}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onSelectChange={onSelectChange}
            onWaterPresetSelect={handleWaterPresetSelect}
            onWaterPresetLoadToSlot={handleWaterPresetLoad}
            onWaterPresetSave={() => { void handleWaterPresetSave(); }}
            onWaterPresetRate={(option, rating) => { void handleWaterPresetRate(option, rating); }}
            enabled={state.waterEnabled}
          />
          <OceanCard
            state={state}
            ds={ds}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onSelectChange={onSelectChange}
            enabled={Boolean(state.oceanSampleEnabled)}
          />
          <NatureCard
            cardId="birds"
            title="Birds — Alps"
            accent="#a5c4d4"
            enabledKey="birdsEnabled"
            levelKey="birdsLevel"
            sliceDurationKey="birdsSliceDuration"
            sliceDensityKey="birdsSliceDensity"
            state={state}
            ds={ds}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onSelectChange={onSelectChange}
            enabled={Boolean(state.birdsEnabled)}
          />
          <NatureCard
            cardId="birds2"
            title="Birds — Fujian"
            accent="#8ec5d4"
            enabledKey="birds2Enabled"
            levelKey="birds2Level"
            sliceDurationKey="birds2SliceDuration"
            sliceDensityKey="birds2SliceDensity"
            state={state}
            ds={ds}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onSelectChange={onSelectChange}
            enabled={Boolean(state.birds2Enabled)}
          />
          <NatureCard
            cardId="frogs"
            title="Frogs"
            accent="#b4b450"
            enabledKey="frogsEnabled"
            levelKey="frogsLevel"
            sliceDurationKey="frogsSliceDuration"
            sliceDensityKey="frogsSliceDensity"
            state={state}
            ds={ds}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onSelectChange={onSelectChange}
            enabled={Boolean(state.frogsEnabled)}
          />
          <InsectsCard
            scope="insects1"
            title="Insects — Layer 1"
            accent="#2ecc71"
            selectedPreset={selectedInsects1Preset}
            presetOptions={insects1PresetOptions}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onPresetLoad={(scope, value) => { void handleInsectsPresetLoad(scope, value); }}
            onPresetSave={(scope) => { void handleInsectsPresetSave(scope); }}
            onPresetRate={handleInsectsPresetRate}
            ds={ds}
            enabled={Boolean(state.insectsEnabled)}
            onToggleEnabled={() => onSelectChange('insectsEnabled', !state.insectsEnabled)}
            engineName={INSECT_ENGINES[state.insectsEngine] ?? ''}
          />
          <InsectsCard
            scope="insects2"
            title="Insects — Layer 2"
            accent="#27ae60"
            selectedPreset={selectedInsects2Preset}
            presetOptions={insects2PresetOptions}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onPresetLoad={(scope, value) => { void handleInsectsPresetLoad(scope, value); }}
            onPresetSave={(scope) => { void handleInsectsPresetSave(scope); }}
            onPresetRate={handleInsectsPresetRate}
            ds={ds}
            enabled={Boolean(state.insects2Enabled)}
            onToggleEnabled={() => onSelectChange('insects2Enabled', !state.insects2Enabled)}
            engineName={INSECT_ENGINES[state.insects2Engine] ?? ''}
          />
          {anyWalkMode && (
            <WalkSpeedCard
              ds={ds}
            />
          )}
        </div>

        <div className="mixer-panel">
          <ActiveEarthMatrix
            state={state}
            onParamChange={onParamChange}
            onSelectChange={onSelectChange}
            sliderProps={sliderProps}
            getEarthTextureDebugState={getEarthTextureDebugState}
            textureDebugAvailable={textureDebugAvailable}
          />
        </div>
      </div>
    </div>
  );
}
