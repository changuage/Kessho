import React, { useCallback, useMemo, useState } from 'react';
import { DEFAULT_STATE, type SliderState } from '../state';
import type { DynamicsAnalyserKey, DynamicsVisualTelemetrySnapshot } from '../../audio/engineSharedTypes';
import type { SliderPageId } from '../sliderHelpCatalog';
import { useSliderHelp } from '../SliderHelpOverlay';
import { PresetDropdown } from '../../presets/PresetDropdown';
import type { PresetEntry } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';
import { normalizeDynamicsErosionAliases, normalizeDynamicsQualityFields } from '../../audio/dynamicsModel';
import {
  EROSION_MOD_SOURCES,
  EROSION_MOD_TARGETS,
  DYNAMICS_DRIFT_PRESET_KEYS,
  DYNAMICS_EQ1_PRESET_KEYS,
  DYNAMICS_EQ2_PRESET_KEYS,
  DYNAMICS_EROSION_PRESET_KEYS,
  DYNAMICS_END_CHAIN_PRESET_KEYS,
  DYNAMICS_MASTER_FX_PRESET_KEYS,
  DYNAMICS_SATURATION_PRESET_KEYS,
  DYNAMICS_SIDECHAIN_PRESET_KEYS,
} from './dynamicsPresets';
import {
  DynamicsDriftVisualizer,
  DynamicsCompressorVisualizer,
  DynamicsEqVisualizer,
  DynamicsErosionVisualizer,
  DynamicsSaturationVisualizer,
  DynamicsSidechainVisualizer,
} from './DynamicsVisualizers';
import {
  DYNAMICS_DRIFT_CONTROLS,
  DYNAMICS_DRIFT_QUALITY_CONTROLS,
  DYNAMICS_EQ_CONTROL_SETS,
  DYNAMICS_EROSION_CONTROLS,
  DYNAMICS_EROSION_QUALITY_CONTROLS,
  DYNAMICS_END_CHAIN_CONTROLS,
  DYNAMICS_END_CHAIN_QUALITY_CONTROLS,
  DYNAMICS_SATURATION_CONTROLS,
  DYNAMICS_SIDECHAIN_MIX_CONTROLS,
  DYNAMICS_SIDECHAIN_SHAPE_CONTROLS,
  type DynamicsEqControlSet,
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

const DRIFT_MODE_OPTIONS: Array<{ value: SliderState['driftMode']; label: string }> = [
  { value: 'clean', label: 'Clean' },
  { value: 'abyssWater', label: 'Abyss' },
  { value: 'shallowWater', label: 'Shallow' },
];

const DRIFT_QUALITY_OPTIONS: Array<{ value: SliderState['driftQuality']; label: string }> = [
  { value: 'eco', label: 'Eco' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'hq', label: 'HQ' },
];

const EROSION_QUALITY_OPTIONS: Array<{ value: SliderState['erosionQuality']; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'media', label: 'Media' },
  { value: 'hq', label: 'HQ' },
];

const END_COMP_MODE_OPTIONS: Array<{ value: SliderState['endCompMode']; label: string }> = [
  { value: 'studioClear', label: 'Studio' },
  { value: 'clarity', label: 'Clarity' },
  { value: 'glue', label: 'Glue' },
  { value: 'punch', label: 'Punch' },
  { value: 'twoBand', label: '2-Band' },
];

const SAT_MODE_OPTIONS: Array<{ value: SliderState['dynamicsSaturationMode']; label: string }> = [
  { value: 'clean', label: 'Clean' },
  { value: 'tape', label: 'Tape' },
  { value: 'tube', label: 'Tube' },
  { value: 'diode', label: 'Diode' },
  { value: 'fold', label: 'Fold' },
];

const SAT_QUALITY_OPTIONS: Array<{ value: SliderState['dynamicsSaturationQuality']; label: string }> = [
  { value: 'eco', label: 'Eco' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'hq', label: 'HQ' },
];

const EQ_EDGE_TYPE_OPTIONS: Array<{ value: SliderState['dynamicsEq1LowType']; label: string }> = [
  { value: 'shelf', label: 'Shelf' },
  { value: 'bell', label: 'Bell' },
];

type ToggleableDynamicsModule =
  | 'dynamicsBusEnabled'
  | 'dynamicsEq1Enabled'
  | 'dynamicsEq2Enabled'
  | 'sidechainEnabled'
  | 'driftEnabled'
  | 'erosionEnabled'
  | 'dynamicsSaturationEnabled'
  | 'endCompEnabled';

const END_COMP_MODE_PRESETS: Record<SliderState['endCompMode'], Partial<SliderState>> = {
  studioClear: {
    endCompThreshold: -22,
    endCompKnee: 8,
    endCompRatio: 2.6,
    endCompAttackMs: 18,
    endCompReleaseMs: 160,
    endCompMakeup: 1,
    endCompMix: 0.78,
    endCompDetectorHp: 0.62,
    endCompDetectorTilt: 0.65,
    endCompAutoMakeup: 0.65,
    endCompProgramRelease: 0.7,
    endCompPeakBlend: 0.25,
    endCompClarity: 0.22,
    endCompTwoBandAmount: 0,
    endCompBandSplit: 0.5,
  },
  clarity: {
    endCompThreshold: -26,
    endCompKnee: 10,
    endCompRatio: 2.2,
    endCompAttackMs: 24,
    endCompReleaseMs: 120,
    endCompMakeup: 1,
    endCompMix: 0.68,
    endCompDetectorHp: 0.7,
    endCompDetectorTilt: 0.78,
    endCompAutoMakeup: 0.55,
    endCompProgramRelease: 0.8,
    endCompPeakBlend: 0.3,
    endCompClarity: 0.3,
    endCompTwoBandAmount: 0,
    endCompBandSplit: 0.5,
  },
  glue: {
    endCompThreshold: -18,
    endCompKnee: 6,
    endCompRatio: 1.8,
    endCompAttackMs: 30,
    endCompReleaseMs: 220,
    endCompMakeup: 1,
    endCompMix: 0.85,
    endCompDetectorHp: 0.54,
    endCompDetectorTilt: 0.45,
    endCompAutoMakeup: 0.45,
    endCompProgramRelease: 0.65,
    endCompPeakBlend: 0.15,
    endCompClarity: 0.1,
    endCompTwoBandAmount: 0,
    endCompBandSplit: 0.5,
  },
  punch: {
    endCompThreshold: -20,
    endCompKnee: 5,
    endCompRatio: 3.2,
    endCompAttackMs: 32,
    endCompReleaseMs: 95,
    endCompMakeup: 1,
    endCompMix: 0.72,
    endCompDetectorHp: 0.62,
    endCompDetectorTilt: 0.55,
    endCompAutoMakeup: 0.5,
    endCompProgramRelease: 0.45,
    endCompPeakBlend: 0.45,
    endCompClarity: 0.16,
    endCompTwoBandAmount: 0,
    endCompBandSplit: 0.5,
  },
  twoBand: {
    endCompThreshold: -24,
    endCompKnee: 8,
    endCompRatio: 2.2,
    endCompAttackMs: 24,
    endCompReleaseMs: 160,
    endCompMakeup: 1,
    endCompMix: 0.76,
    endCompDetectorHp: 0.62,
    endCompDetectorTilt: 0.65,
    endCompAutoMakeup: 0.5,
    endCompProgramRelease: 0.7,
    endCompPeakBlend: 0.25,
    endCompClarity: 0.24,
    endCompTwoBandAmount: 0.7,
    endCompBandSplit: 0.5,
  },
};

function makeSubsetPresetOptions(keys: readonly (keyof SliderState)[]): UsePresetsOptions {
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
      const normalizedData = normalizeDynamicsQualityFields(
        normalizeDynamicsErosionAliases(data),
      );
      const defaultState = DEFAULT_STATE as unknown as Record<string, unknown>;
      const nextEndCompEnabled = 'endCompEnabled' in normalizedData
        ? Boolean(normalizedData.endCompEnabled)
        : Boolean(defaultState.endCompEnabled);
      if (nextEndCompEnabled) next.dynamicsEnabled = true;
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
  const [degradePresetName, setDegradePresetName] = useState<string | undefined>();
  const [degradePresetDescription, setDegradePresetDescription] = useState<string>('');
  const [sidechainPresetName, setSidechainPresetName] = useState<string | undefined>();
  const [endChainPresetName, setEndChainPresetName] = useState<string | undefined>();
  const [dynamicsBusPresetName, setDynamicsBusPresetName] = useState<string | undefined>();
  const [dynamicsBusPresetDescription, setDynamicsBusPresetDescription] = useState<string>('');
  const [masterFxPresetName, setMasterFxPresetName] = useState<string | undefined>();
  const [masterFxPresetDescription, setMasterFxPresetDescription] = useState<string>('');
  const [eq1PresetName, setEq1PresetName] = useState<string | undefined>();
  const [eq2PresetName, setEq2PresetName] = useState<string | undefined>();
  const [driftPresetName, setDriftPresetName] = useState<string | undefined>();
  const [erosionPresetName, setErosionPresetName] = useState<string | undefined>();
  const [saturationPresetName, setSaturationPresetName] = useState<string | undefined>();
  const [erosionMatrixOpen, setErosionMatrixOpen] = useState(false);

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

  const activeBusModules = [
    state.dynamicsEq1Enabled,
    state.dynamicsEq2Enabled,
    state.sidechainEnabled,
  ].filter(Boolean).length;
  const dynamicsBusActive = state.dynamicsBusEnabled || activeBusModules > 0;
  const activeDrift = DRIFT_MODE_OPTIONS.find((mode) => mode.value === state.driftMode)?.label ?? 'Clean';
  const eq1PresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_EQ1_PRESET_KEYS), []);
  const eq2PresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_EQ2_PRESET_KEYS), []);
  const sidechainPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_SIDECHAIN_PRESET_KEYS), []);
  const endChainPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_END_CHAIN_PRESET_KEYS), []);
  const masterFxPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_MASTER_FX_PRESET_KEYS), []);
  const driftPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_DRIFT_PRESET_KEYS), []);
  const erosionPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_EROSION_PRESET_KEYS), []);
  const saturationPresetOptions = useMemo(() => makeSubsetPresetOptions(DYNAMICS_SATURATION_PRESET_KEYS), []);

  const handleDegradePresetLoad = useCallback((entry: PresetEntry) => {
    setDegradePresetName(entry.name);
    const currentVersion = entry.versions.find(version => version.v === entry.currentVersion);
    setDegradePresetDescription(entry.description ?? currentVersion?.note ?? '');
  }, []);
  const handleSidechainPresetLoad = useCallback((entry: PresetEntry) => {
    setSidechainPresetName(entry.name);
  }, []);
  const handleDynamicsBusPresetLoad = useCallback((entry: PresetEntry) => {
    setDynamicsBusPresetName(entry.name);
    const currentVersion = entry.versions.find(version => version.v === entry.currentVersion);
    setDynamicsBusPresetDescription(entry.description ?? currentVersion?.note ?? '');
  }, []);
  const handleMasterFxPresetLoad = useCallback((entry: PresetEntry) => {
    setMasterFxPresetName(entry.name);
    const currentVersion = entry.versions.find(version => version.v === entry.currentVersion);
    setMasterFxPresetDescription(entry.description ?? currentVersion?.note ?? '');
  }, []);
  const handleEq1PresetLoad = useCallback((entry: PresetEntry) => {
    setEq1PresetName(entry.name);
  }, []);
  const handleEq2PresetLoad = useCallback((entry: PresetEntry) => {
    setEq2PresetName(entry.name);
  }, []);
  const handleEndChainPresetLoad = useCallback((entry: PresetEntry) => {
    setEndChainPresetName(entry.name);
  }, []);
  const handleDriftPresetLoad = useCallback((entry: PresetEntry) => {
    setDriftPresetName(entry.name);
  }, []);
  const handleErosionPresetLoad = useCallback((entry: PresetEntry) => {
    setErosionPresetName(entry.name);
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

  const setModuleEnabled = useCallback((key: ToggleableDynamicsModule, enabled: boolean) => {
    const shouldEnableDynamics = key === 'sidechainEnabled' || key === 'endCompEnabled';
    const isDegradeChild = key === 'driftEnabled' || key === 'erosionEnabled';
    const isDynamicsBusChild = key === 'dynamicsEq1Enabled' || key === 'dynamicsEq2Enabled' || key === 'sidechainEnabled';
    if (onStateChange) {
      onStateChange((currentState) => {
        const next = {
          ...currentState,
          ...(enabled && shouldEnableDynamics ? { dynamicsEnabled: true } : {}),
          ...(enabled && isDynamicsBusChild ? { dynamicsBusEnabled: true } : {}),
          [key]: enabled,
        };
        if (key === 'dynamicsBusEnabled' && !enabled) {
          next.dynamicsEq1Enabled = false;
          next.dynamicsEq2Enabled = false;
          next.sidechainEnabled = false;
        }
        if (isDegradeChild) {
          next.degradeEnabled = enabled
            ? true
            : key === 'driftEnabled'
              ? Boolean(currentState.erosionEnabled)
              : Boolean(currentState.driftEnabled);
        }
        return next;
      });
      return;
    }
    if (enabled && shouldEnableDynamics) {
      onSelectChange('dynamicsEnabled', true);
    }
    if (enabled && isDynamicsBusChild) {
      onSelectChange('dynamicsBusEnabled', true);
    }
    if (key === 'dynamicsBusEnabled' && !enabled) {
      onSelectChange('dynamicsEq1Enabled', false);
      onSelectChange('dynamicsEq2Enabled', false);
      onSelectChange('sidechainEnabled', false);
    }
    if (isDegradeChild) {
      onSelectChange('degradeEnabled', enabled || (key === 'driftEnabled' ? state.erosionEnabled : state.driftEnabled));
    }
    onSelectChange(key, enabled);
  }, [onSelectChange, onStateChange, state.driftEnabled, state.erosionEnabled]);

  const applyEndCompMode = useCallback((mode: SliderState['endCompMode']) => {
    const preset = END_COMP_MODE_PRESETS[mode];
    if (onStateChange) {
      onStateChange((currentState) => ({
        ...currentState,
        dynamicsEnabled: true,
        endCompEnabled: true,
        endCompMode: mode,
        ...preset,
      }));
      return;
    }

    onSelectChange('dynamicsEnabled', true);
    onSelectChange('endCompEnabled', true);
    onSelectChange('endCompMode', mode);
    for (const [key, value] of Object.entries(preset) as Array<[keyof SliderState, SliderState[keyof SliderState]]>) {
      if (typeof value === 'number') {
        onParamChange(key, value);
      } else {
        onSelectChange(key, value);
      }
    }
  }, [onParamChange, onSelectChange, onStateChange]);

  const renderEqModule = (config: DynamicsEqControlSet) => {
    const enabled = Boolean(state[config.enabledKey]);
    const presetName = config.id === 'eq1' ? eq1PresetName : eq2PresetName;
    const presetOptions = config.id === 'eq1' ? eq1PresetOptions : eq2PresetOptions;
    const onPresetLoad = config.id === 'eq1' ? handleEq1PresetLoad : handleEq2PresetLoad;
    const lowType = state[config.lowTypeKey] === 'bell' ? 'bell' : 'shelf';
    const highType = state[config.highTypeKey] === 'bell' ? 'bell' : 'shelf';
    const note = enabled
      ? `${lowType === 'shelf' ? 'Low shelf' : 'Low bell'} / ${highType === 'shelf' ? 'High shelf' : 'High bell'}`
      : 'Off';

    return (
      <div key={config.id} className="dynamics-bus-module dynamics-eq-module">
        <div className="dynamics-bus-module-head">
          <div className="dynamics-section-label">
            <span className="dynamics-section-title">{config.label}</span>
            <button
              className={`dynamics-fx-toggle${enabled ? ' on cyan' : ''}`}
              type="button"
              aria-pressed={enabled}
              onClick={() => setModuleEnabled(config.enabledKey, !enabled)}
              {...bindHelp(`${config.enabledKey}`, { label: `${config.label} FX`, page: 'dynamics' })}
            >
              {enabled ? 'FX On' : 'FX Off'}
            </button>
          </div>
          <span className="dynamics-section-note">{note}</span>
        </div>
        {enabled && (
          <div className="dynamics-bus-module-body">
            <div className="dynamics-module-preset-row">
              <PresetDropdown
                className="dynamics-preset-toolbar"
                level="engine"
                scope={config.scope}
                state={state}
                currentName={presetName}
                onLoad={onPresetLoad}
                onStateChange={onStateChange}
                presetOptions={presetOptions}
                compact
              />
            </div>
            <div className="dynamics-eq-type-row">
              <span className="dynamics-chip-label">Low</span>
              <div className="dynamics-mode-row" aria-label={`${config.label} low band type`}>
                {EQ_EDGE_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`dynamics-mode-btn${lowType === option.value ? ' active' : ''}`}
                    onClick={() => onSelectChange(config.lowTypeKey, option.value)}
                    {...bindHelp(`${String(config.lowTypeKey)}_${option.value}`, { label: option.label, page: 'dynamics' })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="dynamics-chip-label">High</span>
              <div className="dynamics-mode-row" aria-label={`${config.label} high band type`}>
                {EQ_EDGE_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`dynamics-mode-btn${highType === option.value ? ' active' : ''}`}
                    onClick={() => onSelectChange(config.highTypeKey, option.value)}
                    {...bindHelp(`${String(config.highTypeKey)}_${option.value}`, { label: option.label, page: 'dynamics' })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div {...bindHelp('dynamicsEqVisualizer', { label: `${config.label} Visualizer`, page: 'dynamics' })}>
              <DynamicsEqVisualizer
                state={state}
                eqId={config.id}
                onParamChange={onParamChange}
              />
            </div>
            <div className="dynamics-subsection">Trim</div>
            <div className="dynamics-grid-2">
              {config.trimControls.map(renderDynamicsSlider)}
            </div>
            <div className="dynamics-subsection">Low Band</div>
            <div className="dynamics-grid-2">
              {config.lowControls.map((control) => {
                if (control.key === 'dynamicsEq1LowSlope' && lowType !== 'shelf') return null;
                if (control.key === 'dynamicsEq2LowSlope' && lowType !== 'shelf') return null;
                return renderDynamicsSlider(control);
              })}
            </div>
            <div className="dynamics-subsection">Mid Band</div>
            <div className="dynamics-grid-2">
              {config.midControls.map(renderDynamicsSlider)}
            </div>
            <div className="dynamics-subsection">High Band</div>
            <div className="dynamics-grid-2">
              {config.highControls.map((control) => {
                if (control.key === 'dynamicsEq1HighSlope' && highType !== 'shelf') return null;
                if (control.key === 'dynamicsEq2HighSlope' && highType !== 'shelf') return null;
                return renderDynamicsSlider(control);
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`dynamics-root${isMobile ? ' mobile' : ''}`}>
      <div className="dynamics-container">
        <div className="dynamics-column dynamics-left">
          <div className="dynamics-global-bar fx-page-header">
            <span className="dynamics-title fx-page-title">Texture</span>
          </div>

          <section className="dynamics-section-card dynamics-preset-card">
            <div className="dynamics-section-head">
              <span className="dynamics-section-title">Degrade Preset</span>
              <span className="dynamics-section-note">Save or recall Drift and Erosion together</span>
            </div>
            <div className="dynamics-preset-body">
              <PresetDropdown
                className="dynamics-preset-toolbar"
                level="source"
                scope="degrade"
                state={state}
                currentName={degradePresetName}
                onLoad={handleDegradePresetLoad}
                onStateChange={onStateChange}
                compact
              />
              <div className="dynamics-preset-meta">
                <div className="dynamics-preset-description">
                  {degradePresetDescription || (degradePresetName ? 'No description saved for this preset.' : 'Load a Degrade preset to view its description.')}
                </div>
                <div className="dynamics-preset-description dynamics-preset-note">
                  Stores the Degrade parent controls plus Drift and Erosion child presets.
                </div>
              </div>
            </div>
          </section>

          <section className="dynamics-section-card dynamics-drift-card">
            <div className="dynamics-section-head">
              <div className="dynamics-section-label">
                <span className="dynamics-section-title"><span className="dynamics-parent-label">Degrade - </span>Drift</span>
                <button
                  className={`dynamics-fx-toggle${state.driftEnabled ? ' on green' : ''}`}
                  type="button"
                  aria-pressed={state.driftEnabled}
                  onClick={() => setModuleEnabled('driftEnabled', !state.driftEnabled)}
                  {...bindHelp('driftEnabled', { label: 'Drift FX', page: 'dynamics' })}
                >
                  {state.driftEnabled ? 'FX On' : 'FX Off'}
                </button>
              </div>
              <span className="dynamics-section-note">{state.driftEnabled ? activeDrift : 'Off'}</span>
            </div>
            {state.driftEnabled && (
            <div className="dynamics-section-body">
              <div className="dynamics-module-preset-row">
                <PresetDropdown
                  className="dynamics-preset-toolbar"
                  level="kit"
                  scope="dynamicsDrift"
                  state={state}
                  currentName={driftPresetName}
                  onLoad={handleDriftPresetLoad}
                  onStateChange={onStateChange}
                  presetOptions={driftPresetOptions}
                  compact
                />
              </div>
              <div className="dynamics-mode-row">
                {DRIFT_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.value}
                    className={`dynamics-mode-btn${state.driftMode === mode.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('driftMode', mode.value)}
                    {...bindHelp(`driftMode_${mode.value}`, { label: mode.label, page: 'dynamics' })}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div className="dynamics-mode-row" aria-label="Drift quality">
                {DRIFT_QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`dynamics-mode-btn${state.driftQuality === option.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('driftQuality', option.value)}
                    {...bindHelp(`driftQuality_${option.value}`, { label: option.label, page: 'dynamics' })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div {...bindHelp('driftVisualizer', { label: 'Visualizer', page: 'dynamics' })}>
                <DynamicsDriftVisualizer
                  state={state}
                  onParamChange={onParamChange}
                  getDynamicsAnalyser={getDynamicsAnalyser}
                  getDynamicsTelemetry={getDynamicsTelemetry}
                />
              </div>
              <div className="dynamics-grid-2">
                {DYNAMICS_DRIFT_QUALITY_CONTROLS.map(renderDynamicsSlider)}
                {DYNAMICS_DRIFT_CONTROLS.map(renderDynamicsSlider)}
              </div>
            </div>
            )}
          </section>
        </div>

        <div className="dynamics-column dynamics-middle">
          <section className="dynamics-section-card dynamics-erosion-card">
              <div className="dynamics-section-head">
                <div className="dynamics-section-label">
                  <span className="dynamics-section-title"><span className="dynamics-parent-label">Degrade - </span>Erosion</span>
                  <button
                    className={`dynamics-fx-toggle${state.erosionEnabled ? ' on purple' : ''}`}
                    type="button"
                    aria-pressed={state.erosionEnabled}
                    onClick={() => setModuleEnabled('erosionEnabled', !state.erosionEnabled)}
                    {...bindHelp('erosionEnabled', { label: 'Erosion FX', page: 'dynamics' })}
                  >
                    {state.erosionEnabled ? 'FX On' : 'FX Off'}
                  </button>
                </div>
                <span className="dynamics-section-note">{state.erosionEnabled ? 'Media' : 'Off'}</span>
              </div>
              {state.erosionEnabled && (
              <div className="dynamics-section-body">
                <div className="dynamics-module-preset-row">
                  <PresetDropdown
                    className="dynamics-preset-toolbar"
                    level="kit"
                    scope="dynamicsErosion"
                    state={state}
                    currentName={erosionPresetName}
                    onLoad={handleErosionPresetLoad}
                    onStateChange={onStateChange}
                    presetOptions={erosionPresetOptions}
                    compact
                  />
                </div>
                <div className="dynamics-mode-row" aria-label="Erosion quality">
                  {EROSION_QUALITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`dynamics-mode-btn${state.erosionQuality === option.value ? ' active' : ''}`}
                      onClick={() => onSelectChange('erosionQuality', option.value)}
                      {...bindHelp(`erosionQuality_${option.value}`, { label: option.label, page: 'dynamics' })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <DynamicsErosionVisualizer
                  state={state}
                  getDynamicsAnalyser={getDynamicsAnalyser}
                  getDynamicsTelemetry={getDynamicsTelemetry}
                />
                <div className="dynamics-grid-2">
                  {DYNAMICS_EROSION_QUALITY_CONTROLS.map(renderDynamicsSlider)}
                  {DYNAMICS_EROSION_CONTROLS.map(renderDynamicsSlider)}
                </div>
                <div className="dynamics-mod-panel">
                  <button
                    className="dynamics-advanced-toggle"
                    type="button"
                    aria-expanded={erosionMatrixOpen}
                    onClick={() => setErosionMatrixOpen((open) => !open)}
                    {...bindHelp('erosionModMatrix', { label: 'Mod Matrix', page: 'dynamics' })}
                  >
                    <span>Mod Matrix</span>
                    <span>{erosionMatrixOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {erosionMatrixOpen && (
                    <div className="dynamics-mod-scroll">
                      <div className="dynamics-mod-matrix">
                        <div className="dynamics-mod-corner">Source</div>
                        {EROSION_MOD_TARGETS.map((target) => (
                          <div key={target.id} className="dynamics-mod-header">{target.label}</div>
                        ))}
                        {EROSION_MOD_SOURCES.map((source) => (
                          <React.Fragment key={source.id}>
                            <div className="dynamics-mod-source">{source.label}</div>
                            {EROSION_MOD_TARGETS.map((target) => {
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
          <section className="dynamics-section-card dynamics-bus-card">
            <div className="dynamics-section-head">
              <div className="dynamics-section-label">
                <span className="dynamics-section-title">Dynamics Bus</span>
                <button
                  className={`dynamics-fx-toggle${dynamicsBusActive ? ' on cyan' : ''}`}
                  type="button"
                  aria-pressed={dynamicsBusActive}
                  onClick={() => setModuleEnabled('dynamicsBusEnabled', !dynamicsBusActive)}
                  {...bindHelp('dynamicsBusEnabled', { label: 'Dynamics Bus', page: 'dynamics' })}
                >
                  {dynamicsBusActive ? 'FX On' : 'FX Off'}
                </button>
              </div>
              <span className="dynamics-section-note">{dynamicsBusActive ? `${activeBusModules}/3 active` : 'Off'}</span>
            </div>
            {dynamicsBusActive && (
              <div className="dynamics-section-body">
                <div className="dynamics-module-preset-row">
                  <PresetDropdown
                    className="dynamics-preset-toolbar"
                    level="source"
                    scope="dynamicsBus"
                    state={state}
                    currentName={dynamicsBusPresetName}
                    onLoad={handleDynamicsBusPresetLoad}
                    onStateChange={onStateChange}
                    compact
                  />
                </div>
                <div className="dynamics-preset-description dynamics-bus-description">
                  {dynamicsBusPresetDescription || (dynamicsBusPresetName ? 'No description saved for this preset.' : 'Stores EQ 1, EQ 2, and Sidechain Compression together.')}
                </div>

                {DYNAMICS_EQ_CONTROL_SETS.map(renderEqModule)}

                <div className="dynamics-bus-module dynamics-sidechain-card">
                  <div className="dynamics-bus-module-head">
                    <div className="dynamics-section-label">
                      <span className="dynamics-section-title">Sidechain Compression</span>
                      <button
                        className={`dynamics-fx-toggle${state.sidechainEnabled ? ' on cyan' : ''}`}
                        type="button"
                        aria-pressed={state.sidechainEnabled}
                        onClick={() => setModuleEnabled('sidechainEnabled', !state.sidechainEnabled)}
                        {...bindHelp('sidechainEnabled', { label: 'Sidechain Compression', page: 'dynamics' })}
                      >
                        {state.sidechainEnabled ? 'FX On' : 'FX Off'}
                      </button>
                    </div>
                    <span className="dynamics-section-note">{state.sidechainEnabled ? 'Routing bus' : 'Off'}</span>
                  </div>
                  {state.sidechainEnabled && (
                    <div className="dynamics-bus-module-body">
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
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="dynamics-section-card dynamics-master-fx-card">
            <div className="dynamics-section-head">
              <div className="dynamics-section-label">
                <span className="dynamics-section-title">Master FX</span>
              </div>
              <span className="dynamics-section-note">
                {state.dynamicsSaturationEnabled || state.endCompEnabled ? 'Active' : 'Off'}
              </span>
            </div>
            <div className="dynamics-section-body">
              <div className="dynamics-module-preset-row">
                <PresetDropdown
                  className="dynamics-preset-toolbar"
                  level="source"
                  scope="masterFx"
                  state={state}
                  currentName={masterFxPresetName}
                  onLoad={handleMasterFxPresetLoad}
                  onStateChange={onStateChange}
                  presetOptions={masterFxPresetOptions}
                  compact
                />
              </div>
              <div className="dynamics-preset-description">
                {masterFxPresetDescription || (masterFxPresetName ? 'No description saved for this preset.' : 'Stores Saturation and End Chain Compression together.')}
              </div>
            </div>
          </section>

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
              <div className="dynamics-mode-row" aria-label="Saturation quality">
                {SAT_QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`dynamics-mode-btn${state.dynamicsSaturationQuality === option.value ? ' active' : ''}`}
                    onClick={() => onSelectChange('dynamicsSaturationQuality', option.value)}
                    {...bindHelp(`dynamicsSaturationQuality_${option.value}`, { label: option.label, page: 'dynamics' })}
                  >
                    {option.label}
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
              <div className="dynamics-mode-row" aria-label="End compressor mode">
                {END_COMP_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`dynamics-mode-btn${state.endCompMode === option.value ? ' active' : ''}`}
                    onClick={() => applyEndCompMode(option.value)}
                    {...bindHelp(`endCompMode_${option.value}`, { label: option.label, page: 'dynamics' })}
                  >
                    {option.label}
                  </button>
                ))}
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
                {DYNAMICS_END_CHAIN_QUALITY_CONTROLS.map((control) => {
                  if (control.key === 'endCompTwoBandAmount' && state.endCompMode !== 'twoBand') return null;
                  if (control.key === 'endCompBandSplit' && state.endCompMode !== 'twoBand') return null;
                  return renderDynamicsSlider(control);
                })}
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
