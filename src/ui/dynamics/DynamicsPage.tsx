import React, { useCallback, useMemo, useState } from 'react';
import { DEFAULT_STATE, type SliderState } from '../state';
import type { DynamicsAnalyserKey, DynamicsVisualTelemetrySnapshot } from '../../audio/engine';
import type { SliderPageId } from '../sliderHelpCatalog';
import { useSliderHelp } from '../SliderHelpOverlay';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';
import { normalizeDynamicsDegradeAliases } from '../../audio/dynamicsModel';
import {
  DEGRADE_MOD_SOURCES,
  DEGRADE_MOD_TARGETS,
  DYNAMICS_CHARACTER_PRESET_KEYS,
  DYNAMICS_DEGRADE_PRESET_KEYS,
  DYNAMICS_END_CHAIN_PRESET_KEYS,
  DYNAMICS_SATURATION_PRESET_KEYS,
  DYNAMICS_SIDECHAIN_PRESET_KEYS,
} from './dynamicsPresets';
import {
  DynamicsCharacterVisualizer,
  DynamicsCompressorVisualizer,
  DynamicsDegradeVisualizer,
  DynamicsSaturationVisualizer,
  DynamicsSidechainVisualizer,
} from './DynamicsVisualizers';
import './dynamics.css';

const DRUM_KEY_OPTIONS: Array<{ value: SliderState['sidechainKeyA']; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'sub', label: 'Sub' },
  { value: 'kick', label: 'Kick' },
  { value: 'click', label: 'Click' },
  { value: 'beepHi', label: 'Beep Hi' },
  { value: 'beepLo', label: 'Beep Lo' },
  { value: 'noise', label: 'Noise' },
  { value: 'membrane', label: 'Membrane' },
];

const CHARACTER_MODE_OPTIONS: Array<{ value: SliderState['characterMode']; label: string }> = [
  { value: 'clean', label: 'Clean' },
  { value: 'abyssWater', label: 'Abyss' },
  { value: 'shallowWater', label: 'Shallow' },
];

const SAT_MODE_OPTIONS: Array<{ value: SliderState['dynamicsSaturationMode']; label: string }> = [
  { value: 'clean', label: 'Clean' },
  { value: 'tape', label: 'Tape' },
  { value: 'tube', label: 'Tube' },
  { value: 'diode', label: 'Diode' },
  { value: 'fold', label: 'Fold' },
];

const TARGET_CONTROLS: Array<{ key: keyof SliderState; label: string }> = [
  { key: 'sidechainPad1Target', label: 'Pad 1' },
  { key: 'sidechainPad2Target', label: 'Pad 2' },
  { key: 'sidechainLead1Target', label: 'Lead 1' },
  { key: 'sidechainLead2Target', label: 'Lead 2' },
  { key: 'sidechainPianoTarget', label: 'Piano' },
  { key: 'sidechainGranularTarget', label: 'Granular' },
  { key: 'sidechainDelayATarget', label: 'Delay A' },
  { key: 'sidechainDelayBTarget', label: 'Delay B' },
  { key: 'sidechainReverbTarget', label: 'Reverb' },
];

function makeSubsetPresetOptions(
  keys: readonly (keyof SliderState)[],
  options: { forceDynamicsEnabled?: boolean } = {},
): UsePresetsOptions {
  return {
    customExtract: (snapshot) => {
      const data: Record<string, unknown> = {};
      for (const key of keys) {
        data[key] = snapshot[key];
      }
      return data;
    },
    customApply: (snapshot, data) => {
      const next = { ...snapshot } as Record<string, unknown>;
      const normalizedData = normalizeDynamicsDegradeAliases(data);
      const defaultState = DEFAULT_STATE as unknown as Record<string, unknown>;
      if (options.forceDynamicsEnabled) next.dynamicsEnabled = true;
      for (const key of keys) {
        const normalizedKey = key as string;
        next[normalizedKey] = normalizedKey in normalizedData
          ? normalizedData[normalizedKey]
          : defaultState[normalizedKey];
      }
      return next as unknown as SliderState;
    },
  };
}

export interface DynamicsPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  getDynamicsAnalyser?: (key: DynamicsAnalyserKey) => AnalyserNode | null;
  getDynamicsTelemetry?: () => DynamicsVisualTelemetrySnapshot;
}

const DynamicsPage: React.FC<DynamicsPageProps> = ({
  state,
  isMobile,
  onParamChange,
  onSelectChange,
  onStateChange,
  sliderProps,
  SliderComponent,
  getDynamicsAnalyser,
  getDynamicsTelemetry,
}) => {
  const Slider = SliderComponent as React.ComponentType<any>;
  const { announceHelp, announceSlider } = useSliderHelp();
  const [presetName, setPresetName] = useState<string | undefined>();
  const [presetDescription, setPresetDescription] = useState<string>('');
  const [sidechainPresetName, setSidechainPresetName] = useState<string | undefined>();
  const [endChainPresetName, setEndChainPresetName] = useState<string | undefined>();
  const [characterPresetName, setCharacterPresetName] = useState<string | undefined>();
  const [degradePresetName, setDegradePresetName] = useState<string | undefined>();
  const [saturationPresetName, setSaturationPresetName] = useState<string | undefined>();
  const [degradeMatrixOpen, setDegradeMatrixOpen] = useState(false);

  const bindSliderHelp = useCallback((paramKey: keyof SliderState, label: string, page: SliderPageId = 'dynamics') => ({
    onMouseEnter: () => announceSlider(String(paramKey), { label, page }),
    onPointerDown: () => announceSlider(String(paramKey), { label, page }),
    onFocus: () => announceSlider(String(paramKey), { label, page }),
  }), [announceSlider]);

  const bindHelp = useCallback((helpKey: string, options: { label?: string; page?: SliderPageId } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, options),
    onPointerDown: () => announceHelp(helpKey, options),
    onFocus: () => announceHelp(helpKey, options),
  }), [announceHelp]);

  const activeTargets = useMemo(
    () => TARGET_CONTROLS.filter(({ key }) => Number(state[key] ?? 0) > 0.001).length,
    [state],
  );
  const activeCharacter = CHARACTER_MODE_OPTIONS.find((mode) => mode.value === state.characterMode)?.label ?? 'Clean';
  const sidechainPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_SIDECHAIN_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const endChainPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_END_CHAIN_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const characterPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_CHARACTER_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const degradePresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_DEGRADE_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const saturationPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_SATURATION_PRESET_KEYS, { forceDynamicsEnabled: true }), []);

  const handlePresetLoad = useCallback((entry: PresetEntry) => {
    setPresetName(entry.name);
    const currentVersion = entry.versions.find(version => version.v === entry.currentVersion);
    setPresetDescription(entry.description ?? currentVersion?.note ?? '');
  }, []);
  const handleSidechainPresetLoad = useCallback((entry: PresetEntry) => {
    setSidechainPresetName(entry.name);
  }, []);
  const handleEndChainPresetLoad = useCallback((entry: PresetEntry) => {
    setEndChainPresetName(entry.name);
  }, []);
  const handleCharacterPresetLoad = useCallback((entry: PresetEntry) => {
    setCharacterPresetName(entry.name);
  }, []);
  const handleDegradePresetLoad = useCallback((entry: PresetEntry) => {
    setDegradePresetName(entry.name);
  }, []);
  const handleSaturationPresetLoad = useCallback((entry: PresetEntry) => {
    setSaturationPresetName(entry.name);
  }, []);

  const setModuleEnabled = useCallback((key: 'sidechainEnabled' | 'characterEnabled' | 'degradeEnabled' | 'dynamicsSaturationEnabled' | 'endCompEnabled', enabled: boolean) => {
    if (onStateChange) {
      onStateChange((currentState) => ({ ...currentState, dynamicsEnabled: true, [key]: enabled }));
      return;
    }
    onSelectChange('dynamicsEnabled', true);
    onSelectChange(key, enabled);
  }, [onSelectChange, onStateChange]);

  return (
    <div className={`dynamics-root${isMobile ? ' mobile' : ''}`}>
      <div className="dynamics-container">
        <div className="dynamics-column dynamics-left">
          <div className="dynamics-global-bar fx-page-header">
            <span className="dynamics-title fx-page-title">⊞ Dynamics FX</span>
          </div>

          <section className="dynamics-section-card dynamics-preset-card">
            <div className="dynamics-section-head">
              <span className="dynamics-section-title">Preset</span>
              <span className="dynamics-section-note">Save or recall the dynamics setup</span>
            </div>
            <div className="dynamics-preset-body">
              <PresetDropdown
                className="dynamics-preset-toolbar"
                level="source"
                scope="dynamics"
                state={state}
                currentName={presetName}
                onLoad={handlePresetLoad}
                onStateChange={onStateChange}
                compact
              />
              <div className="dynamics-preset-meta">
                <div className="dynamics-preset-description">
                  {presetDescription || (presetName ? 'No description saved for this preset.' : 'Load a dynamics preset to view its description.')}
                </div>
                <div className="dynamics-preset-description dynamics-preset-note">
                  Stores sidechain keys and targets, character, degrade, saturation, and end-chain compression.
                </div>
              </div>
            </div>
          </section>

          <section className="dynamics-section-card dynamics-character-card">
            <div className="dynamics-section-head">
              <div className="dynamics-section-label">
                <span className="dynamics-section-title">Character</span>
                <button
                  className={`dynamics-fx-toggle${state.characterEnabled ? ' on green' : ''}`}
                  type="button"
                  aria-pressed={state.characterEnabled}
                  onClick={() => setModuleEnabled('characterEnabled', !state.characterEnabled)}
                  {...bindHelp('characterEnabled', { label: 'Character FX', page: 'dynamics' })}
                >
                  {state.characterEnabled ? 'FX On' : 'FX Off'}
                </button>
              </div>
              <span className="dynamics-section-note">{state.characterEnabled ? activeCharacter : 'Off'}</span>
            </div>
            {state.characterEnabled && (
            <div className="dynamics-section-body">
              <div className="dynamics-module-preset-row">
                <PresetDropdown
                  className="dynamics-preset-toolbar"
                  level="engine"
                  scope="dynamicsCharacter"
                  state={state}
                  currentName={characterPresetName}
                  onLoad={handleCharacterPresetLoad}
                  onStateChange={onStateChange}
                  presetOptions={characterPresetOptions}
                  compact
                />
              </div>
              <div className="dynamics-mode-row">
                {CHARACTER_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.value}
                    className={`dynamics-mode-btn${state.characterMode === mode.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('characterMode', mode.value)}
                    {...bindHelp(`characterMode_${mode.value}`, { label: mode.label, page: 'dynamics' })}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div {...bindHelp('characterVisualizer', { label: 'Visualizer', page: 'dynamics' })}>
                <DynamicsCharacterVisualizer
                  state={state}
                  onParamChange={onParamChange}
                  getDynamicsAnalyser={getDynamicsAnalyser}
                  getDynamicsTelemetry={getDynamicsTelemetry}
                />
              </div>
              <div className="dynamics-grid-2">
                <Slider label="Mix" value={state.characterMix} paramKey="characterMix" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterMix')} />
                <Slider label="Age" value={state.characterAge} paramKey="characterAge" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterAge')} />
                <Slider label="Bias" value={state.characterBias} paramKey="characterBias" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterBias')} />
                <Slider label="LPG Open" value={state.characterLpgAmount} paramKey="characterLpgAmount" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterLpgAmount')} />
                <Slider label="Depth" value={state.characterDepth} paramKey="characterDepth" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterDepth')} />
                <Slider label="Rate" value={state.characterRate} paramKey="characterRate" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterRate')} />
                <Slider label="Damp" value={state.characterDamp} paramKey="characterDamp" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterDamp')} />
                <Slider label="Env Follow" value={state.characterEnvFollow} paramKey="characterEnvFollow" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterEnvFollow')} />
                <Slider label="HP" value={state.degradeHp} paramKey="degradeHp" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeHp')} />
                <Slider label="LP" value={state.degradeLp} paramKey="degradeLp" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeLp')} />
                <Slider label="Stereo" value={state.characterStereo} paramKey="characterStereo" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterStereo')} />
                <Slider label="Resonance" value={state.characterResonance} paramKey="characterResonance" onChange={onParamChange} helpPage="dynamics" {...sliderProps('characterResonance')} />
              </div>
            </div>
            )}
          </section>
        </div>

        <div className="dynamics-column dynamics-middle">
          <section className="dynamics-section-card dynamics-degrade-card">
              <div className="dynamics-section-head">
                <div className="dynamics-section-label">
                  <span className="dynamics-section-title">Degrade</span>
                  <button
                    className={`dynamics-fx-toggle${state.degradeEnabled ? ' on purple' : ''}`}
                    type="button"
                    aria-pressed={state.degradeEnabled}
                    onClick={() => setModuleEnabled('degradeEnabled', !state.degradeEnabled)}
                    {...bindHelp('degradeEnabled', { label: 'Degrade FX', page: 'dynamics' })}
                  >
                    {state.degradeEnabled ? 'FX On' : 'FX Off'}
                  </button>
                </div>
                <span className="dynamics-section-note">{state.degradeEnabled ? 'Media' : 'Off'}</span>
              </div>
              {state.degradeEnabled && (
              <div className="dynamics-section-body">
                <div className="dynamics-module-preset-row">
                  <PresetDropdown
                    className="dynamics-preset-toolbar"
                    level="engine"
                    scope="dynamicsDegrade"
                    state={state}
                    currentName={degradePresetName}
                    onLoad={handleDegradePresetLoad}
                    onStateChange={onStateChange}
                    presetOptions={degradePresetOptions}
                    compact
                  />
                </div>
                <DynamicsDegradeVisualizer
                  state={state}
                  getDynamicsAnalyser={getDynamicsAnalyser}
                  getDynamicsTelemetry={getDynamicsTelemetry}
                />
                <div className="dynamics-grid-2">
                  <Slider label="Mix" value={state.degradeMix} paramKey="degradeMix" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeMix')} />
                  <Slider label="Wear" value={state.degradeAge} paramKey="degradeAge" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeAge')} />
                  <Slider label="Generation" value={state.degradeGeneration} paramKey="degradeGeneration" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeGeneration')} />
                  <Slider label="Alias" value={state.degradeAlias} paramKey="degradeAlias" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeAlias')} />
                  <Slider label="Wow" value={state.degradeWow} paramKey="degradeWow" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeWow')} />
                  <Slider label="Flutter" value={state.degradeFlutter} paramKey="degradeFlutter" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeFlutter')} />
                  <Slider label="Drift" value={state.degradeDrift} paramKey="degradeDrift" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeDrift')} />
                  <Slider label="Wobble Speed" value={state.degradeWobbleSpeed} paramKey="degradeWobbleSpeed" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeWobbleSpeed')} />
                  <Slider label="Noise" value={state.degradeNoise} paramKey="degradeNoise" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeNoise')} />
                  <Slider label="HP" value={state.degradeHp} paramKey="degradeHp" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeHp')} />
                  <Slider label="LP" value={state.degradeLp} paramKey="degradeLp" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeLp')} />
                  <Slider label="Tone" value={state.degradeTone} paramKey="degradeTone" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeTone')} />
                  <Slider label="Clip" value={state.degradeSaturation} paramKey="degradeSaturation" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeSaturation')} />
                  <Slider label="Corrosion" value={state.degradeCorrosion} paramKey="degradeCorrosion" onChange={onParamChange} helpPage="dynamics" {...sliderProps('degradeCorrosion')} />
                </div>
                <div className="dynamics-mod-panel">
                  <button
                    className="dynamics-advanced-toggle"
                    type="button"
                    aria-expanded={degradeMatrixOpen}
                    onClick={() => setDegradeMatrixOpen((open) => !open)}
                    {...bindHelp('degradeModMatrix', { label: 'Mod Matrix', page: 'dynamics' })}
                  >
                    <span>Mod Matrix</span>
                    <span>{degradeMatrixOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {degradeMatrixOpen && (
                    <div className="dynamics-mod-scroll">
                      <div className="dynamics-mod-matrix">
                        <div className="dynamics-mod-corner">Source</div>
                        {DEGRADE_MOD_TARGETS.map((target) => (
                          <div key={target.id} className="dynamics-mod-header">{target.label}</div>
                        ))}
                        {DEGRADE_MOD_SOURCES.map((source) => (
                          <React.Fragment key={source.id}>
                            <div className="dynamics-mod-source">{source.label}</div>
                            {DEGRADE_MOD_TARGETS.map((target) => {
                              const key = source.keys[target.id];
                              return (
                                <div key={key} className="dynamics-mod-cell">
                                  <Slider
                                    label={`${source.label} ${target.label}`}
                                    value={Number(state[key] ?? 0)}
                                    paramKey={key}
                                    onChange={onParamChange}
                                    helpPage="dynamics"
                                    {...sliderProps(key)}
                                  />
                                </div>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )}
            </section>
        </div>

        <div className="dynamics-column dynamics-right">
          <section className="dynamics-section-card dynamics-saturation-card">
            <div className="dynamics-section-head">
              <div className="dynamics-section-label">
                <span className="dynamics-section-title">Saturation</span>
                <button
                  className={`dynamics-fx-toggle${state.dynamicsSaturationEnabled ? ' on amber' : ''}`}
                  type="button"
                  aria-pressed={state.dynamicsSaturationEnabled}
                  onClick={() => setModuleEnabled('dynamicsSaturationEnabled', !state.dynamicsSaturationEnabled)}
                  {...bindHelp('dynamicsSaturationEnabled', { label: 'Saturation FX', page: 'dynamics' })}
                >
                  {state.dynamicsSaturationEnabled ? 'FX On' : 'FX Off'}
                </button>
              </div>
              <span className="dynamics-section-note">{state.dynamicsSaturationEnabled ? state.dynamicsSaturationMode : 'Off'}</span>
            </div>
            {state.dynamicsSaturationEnabled && (
            <div className="dynamics-section-body">
              <div className="dynamics-module-preset-row">
                <PresetDropdown
                  className="dynamics-preset-toolbar"
                  level="engine"
                  scope="dynamicsSaturation"
                  state={state}
                  currentName={saturationPresetName}
                  onLoad={handleSaturationPresetLoad}
                  onStateChange={onStateChange}
                  presetOptions={saturationPresetOptions}
                  compact
                />
              </div>
              <div className="dynamics-mode-row">
                {SAT_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.value}
                    className={`dynamics-mode-btn${state.dynamicsSaturationMode === mode.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('dynamicsSaturationMode', mode.value)}
                    {...bindHelp(`dynamicsSaturationMode_${mode.value}`, { label: mode.label, page: 'dynamics' })}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div {...bindHelp('dynamicsSaturationVisualizer', { label: 'Visualizer', page: 'dynamics' })}>
                <DynamicsSaturationVisualizer
                  state={state}
                  getDynamicsAnalyser={getDynamicsAnalyser}
                  getDynamicsTelemetry={getDynamicsTelemetry}
                />
              </div>
              <div className="dynamics-grid-2">
                <Slider label="Drive" value={state.dynamicsSaturationDrive} paramKey="dynamicsSaturationDrive" onChange={onParamChange} helpPage="dynamics" {...sliderProps('dynamicsSaturationDrive')} />
                <Slider label="Tone" value={state.dynamicsSaturationTone} paramKey="dynamicsSaturationTone" onChange={onParamChange} helpPage="dynamics" {...sliderProps('dynamicsSaturationTone')} />
                <Slider label="Bias" value={state.dynamicsSaturationBias} paramKey="dynamicsSaturationBias" onChange={onParamChange} helpPage="dynamics" {...sliderProps('dynamicsSaturationBias')} />
              </div>
            </div>
            )}
          </section>

          <section className="dynamics-section-card dynamics-end-card">
            <div className="dynamics-section-head">
              <div className="dynamics-section-label">
                <span className="dynamics-section-title">End Chain Compression</span>
                <button
                  className={`dynamics-fx-toggle${state.endCompEnabled ? ' on amber' : ''}`}
                  type="button"
                  aria-pressed={state.endCompEnabled}
                  onClick={() => setModuleEnabled('endCompEnabled', !state.endCompEnabled)}
                  {...bindHelp('endCompEnabled', { label: 'End Chain FX', page: 'dynamics' })}
                >
                  {state.endCompEnabled ? 'FX On' : 'FX Off'}
                </button>
              </div>
              <span className="dynamics-section-note">{state.endCompEnabled ? 'Glue' : 'Off'}</span>
            </div>
            {state.endCompEnabled && (
            <div className="dynamics-section-body">
              <div className="dynamics-module-preset-row">
                <PresetDropdown
                  className="dynamics-preset-toolbar"
                  level="engine"
                  scope="dynamicsEndChain"
                  state={state}
                  currentName={endChainPresetName}
                  onLoad={handleEndChainPresetLoad}
                  onStateChange={onStateChange}
                  presetOptions={endChainPresetOptions}
                  compact
                />
              </div>
              <div {...bindHelp('endChainCompressionVisualizer', { label: 'Visualizer', page: 'dynamics' })}>
                <DynamicsCompressorVisualizer
                  state={state}
                  getDynamicsAnalyser={getDynamicsAnalyser}
                  getDynamicsTelemetry={getDynamicsTelemetry}
                />
              </div>
              <div className="dynamics-grid-2">
                <Slider label="Threshold" value={state.endCompThreshold} paramKey="endCompThreshold" unit=" dB" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompThreshold')} />
                <Slider label="Knee" value={state.endCompKnee} paramKey="endCompKnee" unit=" dB" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompKnee')} />
                <Slider label="Ratio" value={state.endCompRatio} paramKey="endCompRatio" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompRatio')} />
                <Slider label="Attack" value={state.endCompAttackMs} paramKey="endCompAttackMs" unit=" ms" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompAttackMs')} />
                <Slider label="Release" value={state.endCompReleaseMs} paramKey="endCompReleaseMs" unit=" ms" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompReleaseMs')} />
                <Slider label="Makeup" value={state.endCompMakeup} paramKey="endCompMakeup" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompMakeup')} />
                <Slider label="Mix" value={state.endCompMix} paramKey="endCompMix" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompMix')} />
                <Slider label="Detector HP" value={state.endCompDetectorHp} paramKey="endCompDetectorHp" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompDetectorHp')} />
                <Slider label="SC Tilt" value={state.endCompDetectorTilt} paramKey="endCompDetectorTilt" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompDetectorTilt')} />
                <Slider label="Auto Makeup" value={state.endCompAutoMakeup} paramKey="endCompAutoMakeup" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompAutoMakeup')} />
                <Slider label="Program Rel" value={state.endCompProgramRelease} paramKey="endCompProgramRelease" onChange={onParamChange} helpPage="dynamics" {...sliderProps('endCompProgramRelease')} />
              </div>
            </div>
            )}
          </section>

          <section className="dynamics-section-card dynamics-sidechain-card">
            <div className="dynamics-section-head">
              <div className="dynamics-section-label">
                <span className="dynamics-section-title">Sidechain</span>
                <button
                  className={`dynamics-fx-toggle${state.sidechainEnabled ? ' on cyan' : ''}`}
                  type="button"
                  aria-pressed={state.sidechainEnabled}
                  onClick={() => setModuleEnabled('sidechainEnabled', !state.sidechainEnabled)}
                  {...bindHelp('sidechainEnabled', { label: 'Sidechain FX', page: 'dynamics' })}
                >
                  {state.sidechainEnabled ? 'FX On' : 'FX Off'}
                </button>
              </div>
              <span className="dynamics-section-note">{state.sidechainEnabled ? `${activeTargets} targets` : 'Off'}</span>
            </div>
            {state.sidechainEnabled && (
            <div className="dynamics-section-body">
              <div className="dynamics-module-preset-row">
                <PresetDropdown
                  className="dynamics-preset-toolbar"
                  level="engine"
                  scope="dynamicsSidechain"
                  state={state}
                  currentName={sidechainPresetName}
                  onLoad={handleSidechainPresetLoad}
                  onStateChange={onStateChange}
                  presetOptions={sidechainPresetOptions}
                  compact
                />
              </div>
              <div className="dynamics-chip-row">
                <div className="dynamics-select-wrap">
                  <span className="dynamics-chip-label">Key A</span>
                  <select
                    value={state.sidechainKeyA}
                    onChange={(event) => onSelectChange('sidechainKeyA', event.target.value as SliderState['sidechainKeyA'])}
                  >
                    {DRUM_KEY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="dynamics-select-wrap">
                  <span className="dynamics-chip-label">Key B</span>
                  <select
                    value={state.sidechainKeyB}
                    onChange={(event) => onSelectChange('sidechainKeyB', event.target.value as SliderState['sidechainKeyB'])}
                  >
                    {DRUM_KEY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>

              <div {...bindHelp('sidechainVisualizer', { label: 'Visualizer', page: 'dynamics' })}>
                <DynamicsSidechainVisualizer
                  state={state}
                  onParamChange={onParamChange}
                  getDynamicsAnalyser={getDynamicsAnalyser}
                  getDynamicsTelemetry={getDynamicsTelemetry}
                />
              </div>

              <div className="dynamics-grid-2">
                <Slider label="Key A Weight" value={state.sidechainKeyAWeight} paramKey="sidechainKeyAWeight" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainKeyAWeight')} {...bindSliderHelp('sidechainKeyAWeight', 'Key A Weight')} />
                <Slider label="Key B Weight" value={state.sidechainKeyBWeight} paramKey="sidechainKeyBWeight" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainKeyBWeight')} {...bindSliderHelp('sidechainKeyBWeight', 'Key B Weight')} />
                <Slider label="Amount" value={state.sidechainAmount} paramKey="sidechainAmount" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainAmount')} {...bindSliderHelp('sidechainAmount', 'Amount')} />
                <Slider label="Mix" value={state.sidechainMix} paramKey="sidechainMix" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainMix')} {...bindSliderHelp('sidechainMix', 'Mix')} />
              </div>

              <div className="dynamics-subsection">Shape</div>
              <div className="dynamics-grid-2">
                <Slider label="Threshold" value={state.sidechainThreshold} paramKey="sidechainThreshold" unit=" dB" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainThreshold')} />
                <Slider label="Ratio" value={state.sidechainRatio} paramKey="sidechainRatio" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainRatio')} />
                <Slider label="Knee" value={state.sidechainKnee} paramKey="sidechainKnee" unit=" dB" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainKnee')} />
                <Slider label="Curve" value={state.sidechainCurve} paramKey="sidechainCurve" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainCurve')} />
                <Slider label="Attack" value={state.sidechainAttackMs} paramKey="sidechainAttackMs" unit=" ms" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainAttackMs')} />
                <Slider label="Hold" value={state.sidechainHoldMs} paramKey="sidechainHoldMs" unit=" ms" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainHoldMs')} />
                <Slider label="Release" value={state.sidechainReleaseMs} paramKey="sidechainReleaseMs" unit=" ms" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainReleaseMs')} />
                <Slider label="Makeup" value={state.sidechainMakeup} paramKey="sidechainMakeup" onChange={onParamChange} helpPage="dynamics" {...sliderProps('sidechainMakeup')} />
              </div>

              <div className="dynamics-subsection">Targets</div>
              <div className="dynamics-grid-2">
                {TARGET_CONTROLS.map(({ key, label }) => (
                  <Slider
                    key={String(key)}
                    label={label}
                    value={Number(state[key] ?? 0)}
                    paramKey={key}
                    onChange={onParamChange}
                    helpPage="dynamics"
                    {...sliderProps(key)}
                  />
                ))}
              </div>
            </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default DynamicsPage;
