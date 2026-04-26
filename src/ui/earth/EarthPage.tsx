/**
 * Earth Page — Pure UI for Soundscapes (Water + Ocean + Insects)
 *
 * No audio code — all synthesis runs in the main engine (engine.ts).
 * State flows through SliderState; props follow the same pattern as
 * SynthPage / DrumPage / GranularPage.
 *
 * Layout: Left = Sound-engine controls, Right = Scene mixer + advanced layers
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './earth.css';
import { DualSlider, type DualSliderRange } from '../DualSlider';
import type { SliderMode, SliderState } from '../state';
import { QUANTIZATION } from '../state';
import type { EarthTextureDebugState } from '../../audio/engine';
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
  onStateChange?: (newState: SliderState) => void;
  sliderProps: (paramKey: keyof SliderState) => {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode: (key: keyof SliderState) => void;
    onDualRangeChange: (key: keyof SliderState, min: number, max: number) => void;
  };
  isRunning: boolean;
  getEarthTextureDebugState: () => EarthTextureDebugState;
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
}: EarthPageProps) {
  const [selectedInsects1Preset, setSelectedInsects1Preset] = useState(() => `stock:${state.insectsEngine}`);
  const [selectedInsects2Preset, setSelectedInsects2Preset] = useState(() => `stock:${state.insects2Engine}`);
  const {
    presets: waterEnginePresets,
    save: saveWaterPreset,
    load: loadWaterPreset,
    refresh: refreshWaterPresets,
  } = usePresets('engine', 'water');
  const {
    presets: insects1EnginePresets,
    save: saveInsects1Preset,
    load: loadInsects1Preset,
    refresh: refreshInsects1Presets,
  } = usePresets('engine', 'insects1');
  const {
    presets: insects2EnginePresets,
    save: saveInsects2Preset,
    load: loadInsects2Preset,
    refresh: refreshInsects2Presets,
  } = usePresets('engine', 'insects2');

  const anyWalkMode = useMemo(
    () => EARTH_DUAL_KEYS.some(k => sliderProps(k).mode === 'walk'),
    [sliderProps],
  );

  const expandedCards = useMemo(() => {
    const next = new Set<string>();
    const anyWaterLayerActive =
      Number(state.waterLayerHardDrops) > 0.01 ||
      Number(state.waterLayerWaterDrops) > 0.01 ||
      Number(state.waterLayerBubbling) > 0.01 ||
      Number(state.waterLayerChannels) > 0.01 ||
      Number(state.waterLayerTurbulence) > 0.01 ||
      Number(state.waterLayerSurf) > 0.01;

    if (anyWaterLayerActive) next.add('water');
    if (state.oceanSampleEnabled) next.add('ocean');
    if (state.birdsEnabled) next.add('birds');
    if (state.birds2Enabled) next.add('birds2');
    if (state.frogsEnabled) next.add('frogs');
    if (state.insectsEnabled) next.add('insects1');
    if (state.insects2Enabled) next.add('insects2');

    return next;
  }, [
    state.birds2Enabled,
    state.birdsEnabled,
    state.frogsEnabled,
    state.insects2Enabled,
    state.insectsEnabled,
    state.oceanSampleEnabled,
    state.waterLayerBubbling,
    state.waterLayerChannels,
    state.waterLayerHardDrops,
    state.waterLayerSurf,
    state.waterLayerTurbulence,
    state.waterLayerWaterDrops,
  ]);

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
    () => getWaterPresetOptions().map((option) => ({
      value: String(option.id),
      label: option.name,
      library: option.library,
    })),
    [waterEnginePresets],
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
      };
    });
    const custom = insects1EnginePresets
      .filter((preset) => !stockNames.has(preset.name.trim().toLowerCase()))
      .map((preset) => ({
        value: `${preset.library}:${preset.name}`,
        label: preset.name,
        library: preset.library,
        presetName: preset.name,
      }));
    return [...stock, ...custom];
  }, [insects1EnginePresets]);

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
      };
    });
    const custom = insects2EnginePresets
      .filter((preset) => !stockNames.has(preset.name.trim().toLowerCase()))
      .map((preset) => ({
        value: `${preset.library}:${preset.name}`,
        label: preset.name,
        library: preset.library,
        presetName: preset.name,
      }));
    return [...stock, ...custom];
  }, [insects2EnginePresets]);

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

  const handleWaterSlotSave = useCallback(async (slotKey: 'waterMorphA' | 'waterMorphB') => {
    const currentId = Number(state[slotKey] ?? 0);
    const currentOption = getWaterPresetOptions().find((option) => option.id === currentId);
    const defaultName = currentOption?.name || WATER_PRESETS[currentId] || 'Water Preset';

    let targetName = defaultName;
    if (!currentOption) {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Name this ${slotKey === 'waterMorphA' ? 'Water slot A' : 'Water slot B'} preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
    }

    const metadata = collectWaterPresetMetadata();
    await saveWaterPreset(
      targetName,
      state,
      currentOption ? 'Updated from water slot' : 'Saved from water slot',
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

    if (Number(state[slotKey] ?? 0) !== savedId) {
      onSelectChange(slotKey, savedId as SliderState[typeof slotKey]);
    }
  }, [collectWaterPresetMetadata, loadWaterPreset, onSelectChange, refreshWaterPresets, saveWaterPreset, state]);

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
        onCycleMode={sp.onCycleMode}
        onDualRangeChange={sp.onDualRangeChange}
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
        <div className="earth-kit-preset-bar">
          <span className="earth-kit-label">Earth Kit</span>
          <PresetDropdown
            level="kit"
            scope="earthKit"
            state={state}
            onLoad={(_entry: PresetEntry) => {}}
            onStateChange={onStateChange}
            compact
          />
        </div>

        <div className="sound-panel">
          <WaterCard
            state={state}
            ds={ds}
            waterPresetOptions={waterPresetOptions}
            expandedCards={expandedCards}
            onSelectChange={onSelectChange}
            onWaterSlotSave={(slotKey) => { void handleWaterSlotSave(slotKey); }}
            enabled={state.waterEnabled}
          />
          <OceanCard
            state={state}
            ds={ds}
            expandedCards={expandedCards}
            onSelectChange={onSelectChange}
            enabled={expandedCards.has('ocean')}
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
            onSelectChange={onSelectChange}
            enabled={expandedCards.has('birds')}
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
            onSelectChange={onSelectChange}
            enabled={expandedCards.has('birds2')}
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
            onSelectChange={onSelectChange}
            enabled={expandedCards.has('frogs')}
          />
          <InsectsCard
            scope="insects1"
            title="Insects — Layer 1"
            accent="#2ecc71"
            selectedPreset={selectedInsects1Preset}
            presetOptions={insects1PresetOptions}
            expandedCards={expandedCards}
            onPresetLoad={(scope, value) => { void handleInsectsPresetLoad(scope, value); }}
            onPresetSave={(scope) => { void handleInsectsPresetSave(scope); }}
            ds={ds}
            enabled={expandedCards.has('insects1')}
            engineName={INSECT_ENGINES[state.insectsEngine] ?? ''}
          />
          <InsectsCard
            scope="insects2"
            title="Insects — Layer 2"
            accent="#27ae60"
            selectedPreset={selectedInsects2Preset}
            presetOptions={insects2PresetOptions}
            expandedCards={expandedCards}
            onPresetLoad={(scope, value) => { void handleInsectsPresetLoad(scope, value); }}
            onPresetSave={(scope) => { void handleInsectsPresetSave(scope); }}
            ds={ds}
            enabled={expandedCards.has('insects2')}
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
          />
        </div>
      </div>
    </div>
  );
}
