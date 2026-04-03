/**
 * Earth Page — Pure UI for Soundscapes (Water + Ocean + Insects)
 *
 * No audio code — all synthesis runs in the main engine (engine.ts).
 * State flows through SliderState; props follow the same pattern as
 * SynthPage / DrumPage / GranularPage.
 *
 * Layout: Left = Sound-engine controls, Right = Mixer
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './earth.css';
import { DualSlider, type DualSliderRange } from '../DualSlider';
import type { SliderMode, SliderState } from '../state';
import { QUANTIZATION } from '../state';
import { usePresets } from '../../presets/usePresets';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import {
  INSECT_ENGINES,
  INSECT_ENGINE_DEFAULTS,
  WATER_MORPH_PARAM_KEYS,
  WATER_PRESETS,
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
import { InsectsCard } from './components/InsectsCard';
import { WalkSpeedCard } from './components/WalkSpeedCard';
import { WaterLayersSection } from './components/WaterLayersSection';
import { EarthMixerSection } from './components/EarthMixerSection';

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
}

const EARTH_DUAL_KEYS: readonly (keyof SliderState)[] = [
  'waterMorph',
  'waterIntensity', 'waterDistance', 'waterDropSize',
  'waterHardness', 'waterGlassThickness', 'waterBaseFreq', 'waterReverbSend',
  'oceanSampleLevel',
  'insectsDensity', 'insectsTemperature', 'insectsDistance', 'insectsProximity',
  'insectsAntiphony', 'insectsClickRate', 'insectsMotion',
  'insects2Density', 'insects2Temperature', 'insects2Distance', 'insects2Proximity',
  'insects2Antiphony', 'insects2ClickRate', 'insects2Motion',
  'waterLevel', 'insectsLevel', 'insects2Level',
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
}: EarthPageProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set(['water']),
  );
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

  const toggleCard = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const anyWalkMode = useMemo(
    () => EARTH_DUAL_KEYS.some(k => sliderProps(k).mode === 'walk'),
    [sliderProps],
  );

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
          .filter((preset) => preset.library !== 'stock')
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

            return {
              sourceId: entry.id ?? entry.name,
              name: entry.name,
              library: (entry.library ?? 'user') as 'user' | 'cloud',
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
    const stock = INSECT_ENGINES.map((name, index) => ({
      value: `stock:${index}`,
      label: name,
      library: 'stock' as const,
      stockIndex: index,
    }));
    const custom = insects1EnginePresets
      .filter((preset) => preset.library !== 'stock')
      .map((preset) => ({
        value: `${preset.library}:${preset.name}`,
        label: preset.name,
        library: preset.library,
        presetName: preset.name,
      }));
    return [...stock, ...custom];
  }, [insects1EnginePresets]);

  const insects2PresetOptions = useMemo<EarthPresetOption[]>(() => {
    const stock = INSECT_ENGINES.map((name, index) => ({
      value: `stock:${index}`,
      label: name,
      library: 'stock' as const,
      stockIndex: index,
    }));
    const custom = insects2EnginePresets
      .filter((preset) => preset.library !== 'stock')
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
    if (!currentOption || currentOption.library !== 'user') {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Save ${slotKey === 'waterMorphA' ? 'Water slot A' : 'Water slot B'} as a new L1 preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
      const existing = getWaterPresetOptions().find((option) => option.name === targetName && option.library !== 'user');
      if (existing) targetName = `${targetName} (Custom)`;
    }

    const metadata = collectWaterPresetMetadata();
    await saveWaterPreset(
      targetName,
      state,
      currentOption?.library === 'user' ? 'Updated from water slot' : 'Saved from water slot',
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

    const savedId = upsertUserWaterPreset({
      sourceId: savedEntry.id ?? savedEntry.name,
      name: savedEntry.name,
      library: (savedEntry.library ?? 'user') as 'user' | 'cloud',
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

    if (option.library === 'stock' && option.stockIndex != null) {
      applyInsectsStockPreset(scope, option.stockIndex);
      return;
    }

    const loadPreset = scope === 'insects1' ? loadInsects1Preset : loadInsects2Preset;
    const entry = option.presetName ? await loadPreset(option.presetName) : null;
    if (!entry) return;
    const version = entry.versions.find(v => v.v === entry.currentVersion)
      || entry.versions[entry.versions.length - 1];
    if (!version) return;
    applyNumericPresetData(scope === 'insects1' ? INSECTS1_PARAM_KEYS : INSECTS2_PARAM_KEYS, version.data);
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

    if (!currentOption || currentOption.library !== 'user') {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Save ${scope === 'insects1' ? 'Insects 1' : 'Insects 2'} as a new L1 preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
      const existing = options.find((option) => option.label === targetName && option.library !== 'user');
      if (existing) targetName = `${targetName} (Custom)`;
    }

    const savePreset = scope === 'insects1' ? saveInsects1Preset : saveInsects2Preset;
    const refreshPresetList = scope === 'insects1' ? refreshInsects1Presets : refreshInsects2Presets;
    await savePreset(
      targetName,
      state,
      currentOption?.library === 'user' ? 'Updated from insects preset strip' : 'Saved from insects preset strip',
    );
    await refreshPresetList();

    const selectedKey = `user:${targetName}`;
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
        groupClassName="param-row"
        labelClassName="param-label"
        sliderClassName="param-slider"
        fillColor={fillColor}
        format={opts?.format}
        logarithmic={opts?.logarithmic}
      />
    );
  }, [onParamChange, sliderProps, state]);

  return (
    <div className="earth-root">
      <div className="container">
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Earth Kit</span>
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
            onToggleCard={toggleCard}
            onSelectChange={onSelectChange}
            onWaterSlotSave={(slotKey) => { void handleWaterSlotSave(slotKey); }}
          />
          <OceanCard
            state={state}
            ds={ds}
            expandedCards={expandedCards}
            onToggleCard={toggleCard}
            onParamChange={onParamChange}
            onSelectChange={onSelectChange}
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
            ds={ds}
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
            ds={ds}
          />
          {anyWalkMode && (
            <WalkSpeedCard
              state={state}
              onParamChange={onParamChange}
            />
          )}
        </div>

        <div className="mixer-panel">
          <WaterLayersSection
            state={state}
            ds={ds}
            onParamChange={onParamChange}
          />
          <EarthMixerSection
            state={state}
            ds={ds}
            onSelectChange={onSelectChange}
          />
        </div>
      </div>
    </div>
  );
}
