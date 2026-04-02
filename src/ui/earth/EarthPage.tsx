/**
 * Earth Page — Pure UI for Soundscapes (Water + Ocean + Insects)
 *
 * No audio code — all synthesis runs in the main engine (engine.ts).
 * State flows through SliderState; props follow the same pattern as
 * SynthPage / DrumPage / GranularPage.
 *
 * Layout: Left = Sound-engine controls, Right = Mixer
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import './earth.css';
import { DualSlider, type DualSliderRange } from '../DualSlider';
import { useSliderHelp } from '../SliderHelpOverlay';
import type { SliderState, SliderMode } from '../state';
import { QUANTIZATION } from '../state';
import { usePresets } from '../../presets/usePresets';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import {
  WATER_PRESETS, INSECT_ENGINES, INSECT_ENGINE_DEFAULTS,
  WATER_MORPH_PARAM_KEYS,
  LAYER_KEYS, LAYER_LABELS,
  getWaterPresetOptions,
  setUserWaterPresets,
  upsertUserWaterPreset,
  type LayerKey,
} from '../../audio/waterPresets';

// ═══ Props ═══

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

// ═══ Helpers ═══

/** Map LayerKey → SliderState key */
const LAYER_STATE_KEY: Record<LayerKey, keyof SliderState> = {
  hardDrops: 'waterLayerHardDrops',
  waterDrops: 'waterLayerWaterDrops',
  turbulence: 'waterLayerTurbulence',
  bubbling: 'waterLayerBubbling',
  surf: 'waterLayerSurf',
  channels: 'waterLayerChannels',
};

/** All earth dual-slider keys — used to check if any is in walk mode */
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
  'waterHardDropRate', 'waterHardDropLPF',
  'waterWaterDropRate', 'waterWaterDropLPF',
  'waterBubblingRate', 'waterBubblingLPF',
  'waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfFoamBright', 'waterSurfProximity', 'waterSurfDepth',
  'waterSurfBody', 'waterSurfSpray',
  'waterDensityHardSend', 'waterDensityWaterSend', 'waterDensityBubbleSend',
  'waterDensityFeedback', 'waterDensityTone', 'waterDensityRing', 'waterDensityWet',
  'waterChannelsMorph', 'waterChannelsSpeed',
] as const;

function quantize(key: string, v: number): number {
  const q = (QUANTIZATION as Record<string, { min: number; max: number; step: number }>)[key];
  if (!q) return v;
  const clamped = Math.max(q.min, Math.min(q.max, v));
  return q.min + Math.round((clamped - q.min) / q.step) * q.step;
}

type EarthPresetOption = {
  value: string;
  label: string;
  library: 'stock' | 'user' | 'cloud';
  stockIndex?: number;
  presetName?: string;
};

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

// ═══ Component ═══

export default function EarthPage({
  state, onParamChange, onSelectChange, onStateChange, sliderProps, isRunning: _isRunning,
}: EarthPageProps) {

  // ── Local UI state ──
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Show walk-speed control when any earth slider is in walk mode
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

  const waterPresetOptions = useMemo(
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

  const renderPresetOptions = useCallback((options: Array<{ value: string; label: string; library: 'stock' | 'user' | 'cloud' }>) => {
    const stock = options.filter(option => option.library === 'stock');
    const user = options.filter(option => option.library === 'user');
    const cloud = options.filter(option => option.library === 'cloud');

    return (
      <>
        <optgroup label="Stock">
          {stock.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </optgroup>
        {user.length > 0 && (
          <optgroup label="My Presets">
            {user.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
        )}
        {cloud.length > 0 && (
          <optgroup label="Cloud">
            {cloud.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
        )}
      </>
    );
  }, []);

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

  // ── DualSlider helper ──
  function ds(
    key: keyof SliderState,
    label: string,
    fillColor: string,
    opts?: { format?: (v: number) => string; logarithmic?: boolean },
  ) {
    const sp = sliderProps(key);
    const q = (QUANTIZATION as Record<string, { min: number; max: number; step: number }>)[key as string];
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
  }

  // ════════════════════════════════════════════
  // JSX
  // ════════════════════════════════════════════
  return (
    <div className="earth-root">
      <div className="container">

        {/* ═══ Earth Source Preset (L2 / earthKit) ═══ */}
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

        {/* ════ LEFT: Sound Engine Controls ════ */}
        <div className="sound-panel">

          {/* ─── Water Engine Card ─── */}
          <div
            className={`earth-card${expandedCards.has('water') ? ' expanded' : ''}`}
            style={{ '--sc': '#4a9eff' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('water')}>
              <span className="ec-name">Water Engine</span>
              <span className="ec-chevron">{expandedCards.has('water') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('water') && (
              <div className="earth-card-body">
                {/* Morph row */}
                <div className="earth-preset-row">
                  <div className="earth-preset-slot">
                    <select
                      className="earth-select earth-preset-select"
                      value={String(state.waterMorphA)}
                      onChange={e =>
                        onSelectChange('waterMorphA', Number(e.target.value) as SliderState['waterMorphA'])
                      }
                    >
                      {renderPresetOptions(waterPresetOptions)}
                    </select>
                    <button
                      type="button"
                      className="earth-preset-save"
                      onClick={() => { void handleWaterSlotSave('waterMorphA'); }}
                      title="Save the current Water engine state into slot A's L1 preset"
                    >
                      Save
                    </button>
                  </div>

                  <div style={{ flex: 1 }}>
                    {ds('waterMorph', 'Morph', 'rgba(74,158,255,0.5)')}
                  </div>

                  <div className="earth-preset-slot">
                    <select
                      className="earth-select earth-preset-select"
                      value={String(state.waterMorphB)}
                      onChange={e =>
                        onSelectChange('waterMorphB', Number(e.target.value) as SliderState['waterMorphB'])
                      }
                    >
                      {renderPresetOptions(waterPresetOptions)}
                    </select>
                    <button
                      type="button"
                      className="earth-preset-save"
                      onClick={() => { void handleWaterSlotSave('waterMorphB'); }}
                      title="Save the current Water engine state into slot B's L1 preset"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {ds('waterIntensity', 'Intensity', 'rgba(74,158,255,0.5)')}
                {ds('waterDistance', 'Distance', 'rgba(74,158,255,0.5)')}
                {ds('waterDropSize', 'Drop Size', 'rgba(74,158,255,0.5)')}
                {ds('waterHardness', 'Hardness', 'rgba(74,158,255,0.5)')}
                {ds('waterGlassThickness', 'Glass', 'rgba(74,158,255,0.5)')}
                {ds('waterBaseFreq', 'Base Freq', 'rgba(74,158,255,0.5)', {
                  format: v => `${Math.round(v)} Hz`,
                })}
                {ds('waterReverbSend', 'Reverb Send', 'rgba(139,92,246,0.5)')}

                {/* ── Discrete event layer timbre ── */}
                <div className="section-divider" />
                <div className="param-section-label" style={{ fontSize: 11, opacity: 0.6, margin: '6px 0 2px' }}>Discrete Layers</div>
                {ds('waterHardDropRate', 'Hard Drop Rate', 'rgba(74,158,255,0.5)')}
                {ds('waterHardDropLPF', 'Hard Drop LPF', 'rgba(74,158,255,0.5)', {
                  logarithmic: true,
                  format: v => `${Math.round(v)} Hz`,
                })}
                {ds('waterWaterDropRate', 'Water Drop Rate', 'rgba(74,158,255,0.5)')}
                {ds('waterWaterDropLPF', 'Water Drop LPF', 'rgba(74,158,255,0.5)', {
                  logarithmic: true,
                  format: v => `${Math.round(v)} Hz`,
                })}
                {ds('waterBubblingRate', 'Bubbling Rate', 'rgba(74,158,255,0.5)')}
                {ds('waterBubblingLPF', 'Bubbling LPF', 'rgba(74,158,255,0.5)', {
                  logarithmic: true,
                  format: v => `${Math.round(v)} Hz`,
                })}

                {/* ── Shared density loop params ── */}
                <div className="section-divider" />
                <div className="param-section-label" style={{ fontSize: 11, opacity: 0.6, margin: '6px 0 2px' }}>Density Loop (Drops + Bubbling)</div>
                {ds('waterDensityHardSend', 'Hard Send', 'rgba(96,165,250,0.5)')}
                {ds('waterDensityWaterSend', 'Drop Send', 'rgba(96,165,250,0.5)')}
                {ds('waterDensityBubbleSend', 'Bubble Send', 'rgba(96,165,250,0.5)')}
                {ds('waterDensityFeedback', 'Feedback', 'rgba(96,165,250,0.5)')}
                {ds('waterDensityTone', 'Tone', 'rgba(96,165,250,0.5)', {
                  format: v => `${Math.round(v)} Hz`,
                })}
                {ds('waterDensityRing', 'Ring Amount', 'rgba(96,165,250,0.5)')}
                {ds('waterDensityWet', 'Density Wet', 'rgba(96,165,250,0.5)')}

                {/* ── Surf layer params ── */}
                <div className="section-divider" />
                <div className="param-section-label" style={{ fontSize: 11, opacity: 0.6, margin: '6px 0 2px' }}>Surf (Wave Envelope)</div>
                {ds('waterSurfDuration', 'Wave Duration', 'rgba(0,180,216,0.5)', {
                  format: v => `${v.toFixed(1)}s`,
                })}
                {ds('waterSurfInterval', 'Wave Interval', 'rgba(0,180,216,0.5)', {
                  format: v => `${v.toFixed(1)}s`,
                })}
                {ds('waterSurfFoam', 'Foam', 'rgba(0,180,216,0.5)')}
                {ds('waterSurfFoamBright', 'Foam Bright', 'rgba(0,180,216,0.5)')}
                {ds('waterSurfProximity', 'Proximity', 'rgba(0,180,216,0.5)', {
                  format: v => v < 0.34 ? 'Far' : v > 0.66 ? 'Near' : 'Mid',
                })}
                {ds('waterSurfDepth', 'Depth', 'rgba(0,180,216,0.5)')}
                {ds('waterSurfBody', 'Body Freq', 'rgba(0,180,216,0.5)', {
                  format: v => `${Math.round(v)} Hz`,
                })}
                {ds('waterSurfSpray', 'Spray Freq', 'rgba(0,180,216,0.5)', {
                  format: v => `${Math.round(v)} Hz`,
                })}

                {/* ── Channels layer params ── */}
                <div className="section-divider" />
                <div className="param-section-label" style={{ fontSize: 11, opacity: 0.6, margin: '6px 0 2px' }}>Channels (Wind↔Stream)</div>
                {ds('waterChannelsMorph', 'Morph', 'rgba(0,150,136,0.5)', {
                  format: v => v < 0.3 ? 'Stream' : v > 0.7 ? 'Wind' : 'Blend',
                })}
                {ds('waterChannelsSpeed', 'Speed', 'rgba(0,150,136,0.5)')}
              </div>
            )}
          </div>

          {/* ─── Waves Card ─── */}
          <div
            className={`earth-card${expandedCards.has('ocean') ? ' expanded' : ''}`}
            style={{ '--sc': '#00d4ff' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('ocean')}>
              <span className="ec-name">Waves</span>
              <span className="ec-chevron">{expandedCards.has('ocean') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('ocean') && (
              <div className="earth-card-body">
                {/* Ghetary sample toggle + level */}
                <div className="layer-row" style={{ marginBottom: 10 }}>
                  <button
                    className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
                    onClick={() =>
                      onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)
                    }
                    title={state.oceanSampleEnabled ? 'Disable Ghetary Waves' : 'Enable Ghetary Waves'}
                  >
                    {state.oceanSampleEnabled ? '●' : '○'}
                  </button>
                  <span className="layer-label" style={{ minWidth: 100 }}>Ghetary Waves</span>
                  <span className="layer-value">
                    {state.oceanSampleEnabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                {ds('oceanSampleLevel', 'Waves Level', 'rgba(0,212,255,0.5)')}

                {/* Waves filter */}
                <div style={{ marginTop: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Waves Filter
                  </span>
                </div>
                <div className="param-row">
                  <span className="param-label">Filter Type</span>
                  <select
                    className="earth-select"
                    value={state.oceanFilterType}
                    onChange={e =>
                      onSelectChange(
                        'oceanFilterType',
                        e.target.value as SliderState['oceanFilterType'],
                      )
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="lowpass">Lowpass (Warm)</option>
                    <option value="bandpass">Bandpass (Focused)</option>
                    <option value="highpass">Highpass (Airy)</option>
                    <option value="notch">Notch (Scoop)</option>
                  </select>
                  <span className="param-value">&nbsp;</span>
                </div>

                <ParamSlider
                  paramKey="oceanFilterCutoff"
                  label="Filter Cutoff"
                  value={state.oceanFilterCutoff}
                  min={40} max={12000} step={10}
                  onChange={v => onParamChange('oceanFilterCutoff', v)}
                  format={v => `${Math.round(v)} Hz`}
                />
                <ParamSlider
                  paramKey="oceanFilterResonance"
                  label="Filter Resonance"
                  value={state.oceanFilterResonance}
                  onChange={v => onParamChange('oceanFilterResonance', v)}
                />
              </div>
            )}
          </div>

          {/* ─── Insects Layer 1 Card ─── */}
          <div
            className={`earth-card${expandedCards.has('insects1') ? ' expanded' : ''}`}
            style={{ '--sc': '#2ecc71' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('insects1')}>
              <span className="ec-name">Insects — Layer 1</span>
              <span className="ec-chevron">{expandedCards.has('insects1') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('insects1') && (
              <div className="earth-card-body">
                <div className="earth-preset-bar">
                  <select
                    className="earth-select earth-preset-select"
                    value={selectedInsects1Preset}
                    onChange={(e) => { void handleInsectsPresetLoad('insects1', e.target.value); }}
                  >
                    {renderPresetOptions(insects1PresetOptions)}
                  </select>
                  <button
                    type="button"
                    className="earth-preset-save"
                    onClick={() => { void handleInsectsPresetSave('insects1'); }}
                    title="Save the current Insects 1 engine state as an L1 preset"
                  >
                    Save
                  </button>
                </div>

                {ds('insectsDensity', 'Density', 'rgba(46,204,113,0.5)')}
                {ds('insectsTemperature', 'Temperature', 'rgba(46,204,113,0.5)')}
                {ds('insectsDistance', 'Distance', 'rgba(46,204,113,0.5)')}
                {ds('insectsProximity', 'Proximity', 'rgba(46,204,113,0.5)')}
                {ds('insectsAntiphony', 'Antiphony', 'rgba(46,204,113,0.5)')}
                {ds('insectsClickRate', 'Click Rate', 'rgba(46,204,113,0.5)')}
                {ds('insectsMotion', 'Motion', 'rgba(46,204,113,0.5)')}
              </div>
            )}
          </div>

          {/* ─── Insects Layer 2 Card ─── */}
          <div
            className={`earth-card${expandedCards.has('insects2') ? ' expanded' : ''}`}
            style={{ '--sc': '#27ae60' } as React.CSSProperties}
          >
            <div className="earth-card-header" onClick={() => toggleCard('insects2')}>
              <span className="ec-name">Insects — Layer 2</span>
              <span className="ec-chevron">{expandedCards.has('insects2') ? '▼' : '▶'}</span>
            </div>

            {expandedCards.has('insects2') && (
              <div className="earth-card-body">
                <div className="earth-preset-bar">
                  <select
                    className="earth-select earth-preset-select"
                    value={selectedInsects2Preset}
                    onChange={(e) => { void handleInsectsPresetLoad('insects2', e.target.value); }}
                  >
                    {renderPresetOptions(insects2PresetOptions)}
                  </select>
                  <button
                    type="button"
                    className="earth-preset-save"
                    onClick={() => { void handleInsectsPresetSave('insects2'); }}
                    title="Save the current Insects 2 engine state as an L1 preset"
                  >
                    Save
                  </button>
                </div>

                {ds('insects2Density', 'Density', 'rgba(39,174,96,0.5)')}
                {ds('insects2Temperature', 'Temperature', 'rgba(39,174,96,0.5)')}
                {ds('insects2Distance', 'Distance', 'rgba(39,174,96,0.5)')}
                {ds('insects2Proximity', 'Proximity', 'rgba(39,174,96,0.5)')}
                {ds('insects2Antiphony', 'Antiphony', 'rgba(39,174,96,0.5)')}
                {ds('insects2ClickRate', 'Click Rate', 'rgba(39,174,96,0.5)')}
                {ds('insects2Motion', 'Motion', 'rgba(39,174,96,0.5)')}
              </div>
            )}
          </div>

          {/* ─── Walk Speed (shown when any earth slider is in walk mode) ─── */}
          {anyWalkMode && (
            <div
              className="earth-card"
              style={{ '--sc': '#a5c4d4', padding: '8px 12px' } as React.CSSProperties}
            >
              <ParamSlider
                paramKey="randomWalkSpeed"
                label="Walk Speed"
                value={state.randomWalkSpeed}
                min={0.1} max={5} step={0.1}
                onChange={v => onParamChange('randomWalkSpeed', v)}
                format={v => v.toFixed(1)}
                labelColor="#a5c4d4"
              />
            </div>
          )}
        </div>

        {/* ════ RIGHT: Mixer ════ */}
        <div className="mixer-panel">

          {/* Water Layers */}
          <div className="mixer-section">
            <div className="mixer-section-header">Water Layers</div>
            <div className="mixer-section-body">
              {LAYER_KEYS.map(key => {
                const stateKey = LAYER_STATE_KEY[key];
                const level = state[stateKey] as number;
                return (
                  <div
                    key={key}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}
                  >
                    <button
                      className={`layer-toggle ${level > 0.01 ? 'on' : ''}`}
                      onClick={() => onParamChange(stateKey, level > 0.01 ? 0 : 0.5)}
                      title={level > 0.01 ? 'Mute layer' : 'Unmute layer'}
                    >
                      {level > 0.01 ? '●' : '○'}
                    </button>
                    {ds(stateKey, LAYER_LABELS[key], 'rgba(74,158,255,0.5)')}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Earth Mixer */}
          <div className="mixer-section">
            <div className="mixer-section-header">Earth Mixer</div>
            <div className="mixer-section-body">
              {/* Earth Master Level */}
              {ds('earthLevel', 'Earth Master', 'rgba(255,215,0,0.5)')}
              <div className="section-divider" />
              {/* Water */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.waterEnabled ? 'on' : ''}`}
                  onClick={() => onSelectChange('waterEnabled', !state.waterEnabled)}
                  title={state.waterEnabled ? 'Disable Water' : 'Enable Water'}
                >
                  {state.waterEnabled ? '●' : '○'}
                </button>
                {ds('waterLevel', 'Water', 'rgba(74,158,255,0.5)')}
              </div>

              {/* Ghetary Waves */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.oceanSampleEnabled ? 'on' : ''}`}
                  onClick={() =>
                    onSelectChange('oceanSampleEnabled', !state.oceanSampleEnabled)
                  }
                  title={state.oceanSampleEnabled ? 'Disable Ghetary Waves' : 'Enable Ghetary Waves'}
                >
                  {state.oceanSampleEnabled ? '●' : '○'}
                </button>
                {ds('oceanSampleLevel', 'Waves', 'rgba(0,212,255,0.5)')}
              </div>

              {/* Insect 1 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.insectsEnabled ? 'on' : ''}`}
                  onClick={() => onSelectChange('insectsEnabled', !state.insectsEnabled)}
                  title={state.insectsEnabled ? 'Disable Insect 1' : 'Enable Insect 1'}
                >
                  {state.insectsEnabled ? '●' : '○'}
                </button>
                {ds('insectsLevel', 'Insect 1', 'rgba(46,204,113,0.5)')}
              </div>

              {/* Insect 2 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <button
                  className={`layer-toggle ${state.insects2Enabled ? 'on' : ''}`}
                  onClick={() => onSelectChange('insects2Enabled', !state.insects2Enabled)}
                  title={state.insects2Enabled ? 'Disable Insect 2' : 'Enable Insect 2'}
                >
                  {state.insects2Enabled ? '●' : '○'}
                </button>
                {ds('insects2Level', 'Insect 2', 'rgba(39,174,96,0.5)')}
              </div>

              <div className="section-divider" />

              {/* Reverb Sends */}
              {ds('oceanReverbSend', 'Waves Reverb', 'rgba(139,92,246,0.5)')}
              {ds('waterReverbSend', 'Water Reverb', 'rgba(139,92,246,0.5)')}
              {ds('insectsReverbSend', 'Insect Reverb', 'rgba(139,92,246,0.5)')}

              <div className="section-divider" />

              {/* Granular Sends */}
              {ds('granularWavesSend', 'Waves → Granular', 'rgba(168,85,247,0.5)')}
              {ds('granularWaterSend', 'Water → Granular', 'rgba(168,85,247,0.5)')}
              {ds('granularInsectsSend', 'Insects → Granular', 'rgba(168,85,247,0.5)')}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ═══ Sub-Components ═══

interface ParamSliderProps {
  paramKey: keyof SliderState;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  labelColor?: string;
}

function ParamSlider({
  paramKey,
  label, value, min = 0, max = 1, step = 0.01, onChange, format, labelColor,
}: ParamSliderProps) {
  const { announceSlider } = useSliderHelp();
  const announceHelp = () => announceSlider(String(paramKey), { label });
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="param-row" onMouseEnter={announceHelp} onPointerDown={announceHelp}>
      <span
        className="param-label"
        style={labelColor ? { color: labelColor } : undefined}
      >
        {label}
      </span>
      <input
        className="param-slider"
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => {
          announceHelp();
          onChange(Number(e.target.value));
        }}
        onFocus={announceHelp}
        style={{
          background: `linear-gradient(to right, rgba(165,196,212,0.5) 0%, rgba(165,196,212,0.5) ${pct}%, rgba(255,255,255,0.15) ${pct}%, rgba(255,255,255,0.15) 100%)`,
        }}
      />
      <span className="param-value">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}
