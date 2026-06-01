import React, { useCallback, useMemo, useState } from 'react';
import { DEFAULT_STATE, type SliderState } from '../state';
import type { DynamicsAnalyserKey, DynamicsVisualTelemetrySnapshot } from '../../audio/engineSharedTypes';
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
import {
  DYNAMICS_CHARACTER_CONTROLS,
  DYNAMICS_DEGRADE_CONTROLS,
  DYNAMICS_END_CHAIN_CONTROLS,
  DYNAMICS_SATURATION_CONTROLS,
  DYNAMICS_SIDECHAIN_MIX_CONTROLS,
  DYNAMICS_SIDECHAIN_SHAPE_CONTROLS,
  DYNAMICS_SIDECHAIN_TARGET_CONTROLS,
  type DynamicsSliderControlDefinition,
} from './dynamicsControlSchema';
import { getProductSliderValue } from '../controls/productControlSchema';
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
    () => DYNAMICS_SIDECHAIN_TARGET_CONTROLS.filter(({ key }) => Number(state[key] ?? 0) > 0.001).length,
    [state],
  );
  const activeCharacter = CHARACTER_MODE_OPTIONS.find((mode) => mode.value === state.characterMode)?.label ?? 'Clean';
  const sidechainPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_SIDECHAIN_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const endChainPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_END_CHAIN_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const characterPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_CHARACTER_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const degradePresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_DEGRADE_PRESET_KEYS, { forceDynamicsEnabled: true }), []);
  const saturationPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_SATURATION_PRESET_KEYS), []);

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

  const renderDynamicsSlider = useCallback((control: DynamicsSliderControlDefinition) => (
    <Slider
      key={String(control.key)}
      label={control.label}
      value={getProductSliderValue(state, control)}
      paramKey={control.key}
      onChange={onParamChange}
      helpPage={control.helpPage}
      unit={control.unit}
      logarithmic={control.logarithmic}
      {...sliderProps(control.key)}
      {...(control.announceHelp ? bindSliderHelp(control.key, control.label) : {})}
    />
  ), [Slider, bindSliderHelp, onParamChange, sliderProps, state]);

  const setModuleEnabled = useCallback((key: 'sidechainEnabled' | 'characterEnabled' | 'degradeEnabled' | 'dynamicsSaturationEnabled' | 'endCompEnabled', enabled: boolean) => {
    const shouldEnableDynamics = key !== 'dynamicsSaturationEnabled';
    if (onStateChange) {
      onStateChange((currentState) => ({
        ...currentState,
        ...(shouldEnableDynamics ? { dynamicsEnabled: true } : {}),
        [key]: enabled,
      }));
      return;
    }
    if (shouldEnableDynamics) {
      onSelectChange('dynamicsEnabled', true);
    }
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
                {DYNAMICS_CHARACTER_CONTROLS.map(renderDynamicsSlider)}
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
                  {DYNAMICS_DEGRADE_CONTROLS.map(renderDynamicsSlider)}
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
                {DYNAMICS_SATURATION_CONTROLS.map(renderDynamicsSlider)}
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
                {DYNAMICS_END_CHAIN_CONTROLS.map(renderDynamicsSlider)}
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
                {DYNAMICS_SIDECHAIN_MIX_CONTROLS.map(renderDynamicsSlider)}
              </div>

              <div className="dynamics-subsection">Shape</div>
              <div className="dynamics-grid-2">
                {DYNAMICS_SIDECHAIN_SHAPE_CONTROLS.map(renderDynamicsSlider)}
              </div>

              <div className="dynamics-subsection">Targets</div>
              <div className="dynamics-grid-2">
                {DYNAMICS_SIDECHAIN_TARGET_CONTROLS.map(renderDynamicsSlider)}
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
