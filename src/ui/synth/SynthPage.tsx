/**
 * SynthPage — Combined Pad + Lead synth page
 * Two-column layout matching DrumPage:
 *   Left  = Collapsible panels for Pad Synth ADSR, Pad Timbre, Lead Synth
 *   Right = Sequencer with Simple / Detail / Overview view modes
 *
 * Simple  = Probability-based controls (chord rate, voicing spread, etc.)
 * Detail  = Euclidean sequencer per-lane (reuses useEuclideanSequencer hook)
 * Overview = All 4 trigger lanes at once
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatIndexedDelayDivision, getSliderNumericValue, SliderState } from '../state';
import { useEuclideanSequencer, type EvolveConfig, type StepOverrides, type SubLaneKind, type SubLaneState, type PitchSettings } from '../sequencer/useEuclideanSequencer';
// DrumStepOverrides no longer needed — SynthPage uses StepOverrides from the shared hook
import DragNumber from '../drums/DragNumber';
import SeqLane from '../drums/SeqLane';
import SeqSparkline from '../drums/SeqSparkline';
import SeqMiniOverview from '../drums/SeqMiniOverview';
import { SCALES } from '../../audio/drumSeqTypes';
import type { ClockDivision } from '../../audio/drumSeqTypes';
import { useSliderHelp } from '../SliderHelpOverlay';
import './synth.css';
import SynthPresetManager from './SynthPresetManager';
import { usePresets } from '../../presets/usePresets';
import { PresetDropdown } from '../../presets/PresetDropdown';
import { extractParams } from '../../presets/codec';
import type { PresetEntry } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';

/** Convert a scale-degree index to semitone offset (matching SeqLane.tsx logic) */
function scaleDegreeToSemitone(degree: number, scale: number[]): number {
  if (degree <= 0) return 0;
  const oct = Math.floor(degree / scale.length);
  const idx = degree % scale.length;
  return oct * 12 + (scale[idx] ?? 0);
}
import {
  getPadPresetOptions,
  upsertUserPadPreset,
  setUserPadPresets,
  type PadPreset,
  type PadPresetOption,
} from '../../audio/padPresets';
import {
  loadLead4opFMPreset,
  saveUserLead4opFMPreset,
  setUserLead4opFMPresets,
  upsertUserLead4opFMPreset,
} from '../../audio/lead4opfm';
import FilterLfoViz from './FilterLfoViz';
import WaveFoldViz from './WaveFoldViz';
import LeadAdsrViz from './LeadAdsrViz';
import { LFO_PRESETS, LFO_PRESET_CATEGORIES } from './lfoPresets';

const OV_PROB_DRAG_PX = 80;

const LANE_CONFIGS = [
  { color: '#f59e0b', name: 'Seq 1' },
  { color: '#10b981', name: 'Seq 2' },
  { color: '#3b82f6', name: 'Seq 3' },
  { color: '#ec4899', name: 'Seq 4' },
];

const SYNTH_SOURCES = [
  { value: 'lead1', label: 'Lead 1', color: '#f59e0b' },
  { value: 'lead2', label: 'Lead 2', color: '#06b6d4' },
  { value: 'synth1', label: 'Pad 1', color: '#C4724E' },
  { value: 'synth2', label: 'Pad 2', color: '#D4855E' },
  { value: 'synth3', label: 'Pad 3', color: '#B4624E' },
  { value: 'synth4', label: 'Pad 4', color: '#A45E4E' },
  { value: 'synth5', label: 'Pad 5', color: '#946050' },
  { value: 'synth6', label: 'Pad 6', color: '#8E5842' },
];

const PAD1_TO_PAD2_KEY: Record<string, string> = {
  padOscAWave: 'pad2OscAWave', padOscAOctave: 'pad2OscAOctave', padOscADetune: 'pad2OscADetune', padOscALevel: 'pad2OscALevel',
  padOscBWave: 'pad2OscBWave', padOscBOctave: 'pad2OscBOctave', padOscBDetune: 'pad2OscBDetune', padOscBLevel: 'pad2OscBLevel',
  padSubEnabled: 'pad2SubEnabled', padSubOctave: 'pad2SubOctave', padSubWave: 'pad2SubWave', padSubLevel: 'pad2SubLevel',
  padNoiseType: 'pad2NoiseType', padNoiseLevel: 'pad2NoiseLevel',
  hardness: 'pad2Hardness', warmth: 'pad2Warmth', presence: 'pad2Presence',
  filterType: 'pad2FilterType', filterCutoffMin: 'pad2FilterCutoffMin', filterCutoffMax: 'pad2FilterCutoffMax',
  filterResonance: 'pad2FilterResonance', filterQ: 'pad2FilterQ',
  padFilterBEnabled: 'pad2FilterBEnabled', padFilterBType: 'pad2FilterBType', padFilterBCutoff: 'pad2FilterBCutoff',
  padFilterBResonance: 'pad2FilterBResonance', padFilterBQ: 'pad2FilterBQ', padFilterRouting: 'pad2FilterRouting',
  synthAttack: 'pad2Attack', synthDecay: 'pad2Decay', synthSustain: 'pad2Sustain', synthRelease: 'pad2Release',
  padLfo1Rate: 'pad2Lfo1Rate', padLfo1Depth: 'pad2Lfo1Depth', padLfo1Wave: 'pad2Lfo1Wave', padLfo1Dest: 'pad2Lfo1Dest',
  padLfo2Rate: 'pad2Lfo2Rate', padLfo2Depth: 'pad2Lfo2Depth', padLfo2Wave: 'pad2Lfo2Wave', padLfo2Dest: 'pad2Lfo2Dest',
  padModEnvEnabled: 'pad2ModEnvEnabled', padModEnvAttack: 'pad2ModEnvAttack', padModEnvDecay: 'pad2ModEnvDecay',
  padModEnvSustain: 'pad2ModEnvSustain', padModEnvRelease: 'pad2ModEnvRelease',
  padModEnvDepth: 'pad2ModEnvDepth', padModEnvDest: 'pad2ModEnvDest',
};

const PAD2_TO_PAD1_KEY = Object.fromEntries(
  Object.entries(PAD1_TO_PAD2_KEY).map(([pad1Key, pad2Key]) => [pad2Key, pad1Key]),
) as Record<string, string>;

function createRuntimePadPreset(scope: 'pad1' | 'pad2', name: string, data: Record<string, unknown>): PadPreset {
  const params: Record<string, number | string | boolean> = {};

  if (scope === 'pad1') {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        params[key] = value;
      }
    }
  } else {
    for (const [key, value] of Object.entries(data)) {
      const pad1Key = PAD2_TO_PAD1_KEY[key];
      if (!pad1Key) continue;
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        params[pad1Key] = value;
      }
    }
  }

  return {
    name,
    tags: [],
    params,
  };
}

// Inline styles available for future use — currently CSS classes handle layout
// const inlineStyles = { ... };

// ═══════════════ Props ═══════════════

export interface SynthPageProps {
  state: SliderState;
  isMobile: boolean;
  expandedPanels: Set<string>;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: (newState: SliderState) => void;
  togglePanel: (id: string) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  SelectComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  /** Lead 4op FM preset list */
  lead4opPresets: Array<{ id: string; name: string }>;
  /** Live filter frequency from audio engine */
  liveFilterFreq: number;
  /** Live LFO value from audio engine (-1 to +1 after depth) */
  liveLfoValue: number;
  /** Whether audio engine is running */
  isRunning: boolean;
  /** Get morphed lead params for ADSR preview */
  getLeadMorphedParams: (lead: 1 | 2) => { attack: number; decay: number; sustain: number; release: number } | null;
  /** Sequencer playheads from audio engine */
  playheads: number[];
  /** Sequencer hit counts from audio engine */
  hitCounts: number[];
  /** Evolve flash state */
  evolveFlashing?: boolean[];
  /** Evolve configs change callback */
  onEvolveConfigsChange?: (configs: EvolveConfig[]) => void;
  /** Initial evolve configs to restore across tab switches / preset loads */
  initialEvolveConfigs?: EvolveConfig[];
  /** Preset version counter for triggering UI reset on preset load */
  presetVersion?: number;
  /** Step overrides change callback (sends MIDI-converted pitch for engine) */
  onStepOverridesChange?: (overrides: StepOverrides) => void;
  /** Raw step overrides change callback (unconverted pitch offsets for persistence/round-trip) */
  onRawStepOverridesChange?: (overrides: StepOverrides) => void;
  /** Initial step overrides to restore across tab switches */
  initialStepOverrides?: StepOverrides;
  /** Initial sub-lane states to restore across tab switches */
  initialSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  /** Called when sub-lane states change, so parent can persist across tab switches */
  onSubLaneStatesChange?: (states: Record<SubLaneKind, SubLaneState>[]) => void;
  /** Initial view mode to restore */
  initialViewMode?: 'simple' | 'detail' | 'overview';
  /** Called when view mode changes */
  onViewModeChange?: (mode: 'simple' | 'detail' | 'overview') => void;
  /** Reset evolve home */
  resetEvolveHome?: (laneIdx: number) => void;
  /** Dice: regenerate lane with random values */
  diceLane?: (laneIdx: number, intensity: number) => void;
  /** Evolved step overrides pushed from audio engine (for visual sync) */
  evolvedOverrides?: { laneIndex: number; version: number; data: Partial<StepOverrides> };
  /** Called when per-lane clock divisions change */
  onClockDivsChange?: (divs: ClockDivision[]) => void;
  /** Called when per-lane swing amounts change */
  onSwingsChange?: (swings: number[]) => void;
  /** Initial pitch settings to restore across tab switches */
  initialPitchSettings?: PitchSettings[];
  /** Called when pitch settings change, so parent can persist across tab switches */
  onPitchSettingsChange?: (settings: PitchSettings[]) => void;
}

// ═══════════════ Component ═══════════════

const SynthPage: React.FC<SynthPageProps> = (props) => {
  const {
    state,
    // isMobile, expandedPanels, togglePanel — available via props if needed
    onParamChange,
    onSelectChange,
    sliderProps,
    SliderComponent,
    SelectComponent,
    // CollapsiblePanelComponent — available via props if needed
    lead4opPresets,
    liveFilterFreq,
    liveLfoValue,
    isRunning,
    getLeadMorphedParams,
    playheads,
    hitCounts,
    evolveFlashing,
    onEvolveConfigsChange,
    onStepOverridesChange,
    onRawStepOverridesChange,
    initialStepOverrides,
    initialSubLaneStates,
    onSubLaneStatesChange,
    initialViewMode,
    onViewModeChange,
    resetEvolveHome,
    diceLane,
    onClockDivsChange,
    onSwingsChange,
    initialPitchSettings,
    onPitchSettingsChange,
  } = props;
  const onStateChange = props.onStateChange;

  const evolvedOverrides = props.evolvedOverrides;
  const initialEvolveConfigs = props.initialEvolveConfigs;
  const presetVersion = props.presetVersion;

  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [diceIntensity, setDiceIntensity] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [padTier, setPadTier] = useState<0 | 1 | 2>(0); // 0=closed, 1=primary, 2=advanced
  const [pad2Tier, setPad2Tier] = useState<0 | 1 | 2>(0); // Pad 2: 0=closed by default
  const [dragPopup, setDragPopup] = useState<{ x: number; y: number; text: string } | null>(null);
  const {
    presets: pad1EnginePresets,
    save: savePad1Preset,
    load: loadPad1Preset,
    refresh: refreshPad1Presets,
  } = usePresets('engine', 'pad1');
  const {
    presets: pad2EnginePresets,
    save: savePad2Preset,
    load: loadPad2Preset,
    refresh: refreshPad2Presets,
  } = usePresets('engine', 'pad2');
  const {
    presets: leadFmPresets,
    load: loadLeadFmPresetEntry,
    refresh: refreshLeadFmPresets,
  } = usePresets('engine', 'lead4opfm');
  const toggleEdit = (section: string) => setEditingSection(prev => prev === section ? null : section);

  const Slider = SliderComponent as React.ComponentType<any>;
  const Select = SelectComponent as React.ComponentType<any>;
  const { announceHelp } = useSliderHelp();
  const bindHelp = useCallback((helpKey: string, options: { label?: string } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, options),
    onPointerDown: () => announceHelp(helpKey, options),
    onFocus: () => announceHelp(helpKey, options),
  }), [announceHelp]);

  // ── Euclidean sequencer preset (L1 synthEuclidean) ──
  const [euclidPresetName, setEuclidPresetName] = useState<string | undefined>();
  const handleEuclidPresetLoad = useCallback((entry: PresetEntry, _data: Record<string, unknown>) => {
    setEuclidPresetName(entry.name);
  }, []);

  // ── Composite extract: L3 synth source includes L1 synthEuclidean + L2 kits ──
  const synthCompositeExtract = React.useMemo<UsePresetsOptions>(() => ({
    customExtract: (s: SliderState) => {
      const combined: Record<string, unknown> = {};
      Object.assign(combined, extractParams(s, 1, 'synthEuclidean'));
      Object.assign(combined, extractParams(s, 1, 'leadDelay'));
      Object.assign(combined, extractParams(s, 2, 'pad1Kit'));
      Object.assign(combined, extractParams(s, 2, 'pad2Kit'));
      Object.assign(combined, extractParams(s, 2, 'lead1Kit'));
      Object.assign(combined, extractParams(s, 2, 'lead2Kit'));
      Object.assign(combined, extractParams(s, 3, 'synth'));
      return combined;
    },
  }), []);

  // CollapsiblePanel available from CollapsiblePanelComponent prop if needed

  useEffect(() => {
    let cancelled = false;

    const syncPadRuntimePresets = async (
      scope: 'pad1' | 'pad2',
      summaries: typeof pad1EnginePresets,
      loadPreset: typeof loadPad1Preset,
    ) => {
      const runtimePresets = await Promise.all(
        summaries
          .filter((preset) => preset.library !== 'stock')
          .map(async (preset) => {
            const entry = await loadPreset(preset.name);
            if (!entry) return null;
            const version = entry.versions.find(v => v.v === entry.currentVersion)
              || entry.versions[entry.versions.length - 1];
            if (!version) return null;
            return {
              id: entry.id ?? entry.name,
              name: entry.name,
              library: (entry.library ?? 'user') as Exclude<PadPresetOption['library'], 'stock'>,
              preset: createRuntimePadPreset(scope, entry.name, version.data),
            };
          }),
      );

      if (!cancelled) {
        setUserPadPresets(
          scope,
          runtimePresets.filter((preset): preset is {
            id: string;
            name: string;
            library: Exclude<PadPresetOption['library'], 'stock'>;
            preset: PadPreset;
          } => Boolean(preset)),
        );
      }
    };

    syncPadRuntimePresets('pad1', pad1EnginePresets, loadPad1Preset).catch((error) => {
      console.warn('Failed to sync pad1 L1 presets:', error);
      if (!cancelled) setUserPadPresets('pad1', []);
    });
    syncPadRuntimePresets('pad2', pad2EnginePresets, loadPad2Preset).catch((error) => {
      console.warn('Failed to sync pad2 L1 presets:', error);
      if (!cancelled) setUserPadPresets('pad2', []);
    });

    return () => {
      cancelled = true;
    };
  }, [loadPad1Preset, loadPad2Preset, pad1EnginePresets, pad2EnginePresets]);

  useEffect(() => {
    let cancelled = false;

    const syncLeadRuntimePresets = async () => {
      const runtimePresets = await Promise.all(
        leadFmPresets
          .filter((preset) => preset.library !== 'stock')
          .map(async (preset) => {
            const entry = await loadLeadFmPresetEntry(preset.name);
            if (!entry) return null;
            const resolvedPreset = await loadLead4opFMPreset(entry.name);
            return {
              id: entry.name,
              name: entry.name,
              library: (entry.library ?? 'user') as 'user' | 'cloud',
              preset: resolvedPreset,
            };
          }),
      );

      if (!cancelled) {
        setUserLead4opFMPresets(runtimePresets.filter((preset): preset is NonNullable<typeof preset> => Boolean(preset)));
      }
    };

    syncLeadRuntimePresets().catch((error) => {
      console.warn('Failed to sync lead FM L1 presets:', error);
      if (!cancelled) setUserLead4opFMPresets([]);
    });

    return () => {
      cancelled = true;
    };
  }, [leadFmPresets, loadLeadFmPresetEntry]);

  const pad1PresetOptions = getPadPresetOptions('pad1');
  const pad2PresetOptions = getPadPresetOptions('pad2');
  const pad1OptionById = new Map(pad1PresetOptions.map(option => [option.id, option]));
  const pad2OptionById = new Map(pad2PresetOptions.map(option => [option.id, option]));
  const leadPresetOptions = [
    ...lead4opPresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      library: 'stock' as const,
    })),
    ...leadFmPresets
      .filter((preset) => preset.library !== 'stock')
      .map((preset) => ({
        id: preset.name,
        name: preset.name,
        library: preset.library,
      })),
  ];
  const leadPresetOptionById = new Map(leadPresetOptions.map(option => [option.id, option]));

  const renderPadPresetOptions = useCallback((options: PadPresetOption[]) => {
    const stock = options.filter(option => option.library === 'stock');
    const user = options.filter(option => option.library === 'user');
    const cloud = options.filter(option => option.library === 'cloud');

    return (
      <>
        <optgroup label="Stock">
          {stock.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </optgroup>
        {user.length > 0 && (
          <optgroup label="My Presets">
            {user.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </optgroup>
        )}
        {cloud.length > 0 && (
          <optgroup label="Cloud">
            {cloud.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </optgroup>
        )}
      </>
    );
  }, []);

  const renderLeadPresetOptions = useCallback((options: Array<{ id: string; name: string; library: 'stock' | 'user' | 'cloud' }>) => {
    const stock = options.filter(option => option.library === 'stock');
    const user = options.filter(option => option.library === 'user');
    const cloud = options.filter(option => option.library === 'cloud');

    return (
      <>
        <optgroup label="Stock">
          {stock.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </optgroup>
        {user.length > 0 && (
          <optgroup label="My Presets">
            {user.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </optgroup>
        )}
        {cloud.length > 0 && (
          <optgroup label="Cloud">
            {cloud.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </optgroup>
        )}
      </>
    );
  }, []);

  const handlePadSlotSave = useCallback(async (
    scope: 'pad1' | 'pad2',
    slotKey: 'padPresetA' | 'padPresetB' | 'pad2PresetA' | 'pad2PresetB',
  ) => {
    const currentId = String(state[slotKey] ?? '').trim();
    const optionMap = scope === 'pad1' ? pad1OptionById : pad2OptionById;
    const currentOption = optionMap.get(currentId);
    const savePreset = scope === 'pad1' ? savePad1Preset : savePad2Preset;
    const loadPreset = scope === 'pad1' ? loadPad1Preset : loadPad2Preset;
    const refreshPresetList = scope === 'pad1' ? refreshPad1Presets : refreshPad2Presets;
    const defaultName = currentOption?.name || `${scope === 'pad1' ? 'Pad 1' : 'Pad 2'} Preset`;

    let targetName = defaultName;
    if (!currentOption || currentOption.library !== 'user') {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Save ${scope === 'pad1' ? 'Pad 1' : 'Pad 2'} slot as a new L1 preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
      const existingOption = [...optionMap.values()].find(option => option.name === targetName && option.library !== 'user');
      if (existingOption) {
        targetName = `${targetName} (Custom)`;
      }
    }

    await savePreset(
      targetName,
      state,
      currentOption?.library === 'user' ? 'Updated from pad slot' : 'Saved from pad slot',
    );
    await refreshPresetList();

    const savedEntry = await loadPreset(targetName);
    if (!savedEntry) return;
    const version = savedEntry.versions.find(v => v.v === savedEntry.currentVersion)
      || savedEntry.versions[savedEntry.versions.length - 1];
    if (!version) return;

    const savedId = savedEntry.id ?? savedEntry.name;
    upsertUserPadPreset(scope, {
      id: savedId,
      name: savedEntry.name,
      library: (savedEntry.library ?? 'user') as Exclude<PadPresetOption['library'], 'stock'>,
      preset: createRuntimePadPreset(scope, savedEntry.name, version.data),
    });

    if (String(state[slotKey] ?? '') !== savedId) {
      onSelectChange(slotKey, savedId as SliderState[keyof SliderState]);
    }
  }, [
    loadPad1Preset,
    loadPad2Preset,
    onSelectChange,
    pad1OptionById,
    pad2OptionById,
    refreshPad1Presets,
    refreshPad2Presets,
    savePad1Preset,
    savePad2Preset,
    state,
  ]);
  void handlePadSlotSave;

  const handleLeadSlotSave = useCallback(async (
    slotKey: 'lead1PresetA' | 'lead1PresetB' | 'lead2PresetC' | 'lead2PresetD',
    fallbackName: string,
  ) => {
    const currentId = String(state[slotKey] ?? '').trim();
    const currentOption = leadPresetOptionById.get(currentId);
    const defaultName = currentOption?.name || fallbackName;

    let targetName = defaultName;
    if (!currentOption || currentOption.library !== 'user') {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Save ${fallbackName} as a new L1 FM preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
      const existing = leadPresetOptions.find(option => option.name === targetName && option.library !== 'user');
      if (existing) targetName = `${targetName} (Custom)`;
    }

    const currentPreset = await loadLead4opFMPreset(currentId);
    const savedId = await saveUserLead4opFMPreset(
      targetName,
      currentPreset,
      currentOption?.library === 'user' ? 'Updated from lead slot' : 'Saved from lead slot',
    );
    await refreshLeadFmPresets();

    upsertUserLead4opFMPreset({
      id: savedId,
      name: savedId,
      library: 'user',
      preset: {
        ...currentPreset,
        id: savedId,
        name: savedId,
      },
    });

    if (String(state[slotKey] ?? '') !== savedId) {
      onSelectChange(slotKey, savedId as SliderState[typeof slotKey]);
    }
  }, [leadPresetOptionById, leadPresetOptions, onSelectChange, refreshLeadFmPresets, state]);
  void handleLeadSlotSave;

  // ── Euclidean Sequencer Hook (reuses same hook as DrumPage) ──
  const seq = useEuclideanSequencer({
    state,
    onParamChange,
    onSelectChange,
    prefix: 'synth',
    laneCount: 4,
    lanes: LANE_CONFIGS,
    playheads,
    hitCounts,
    evolveFlashing,
    initialViewMode,
    initialStepOverrides,
    initialSubLaneStates,
    initialPitchSettings,
    initialEvolveConfigs,
    resetKey: presetVersion,
  });

  const setSharedSequencerBpm = useCallback((bpm: number) => {
    onParamChange('sequencerMasterBPM' as keyof SliderState, bpm);
    onParamChange('synthEuclidBaseBPM' as keyof SliderState, bpm);
    onParamChange('drumEuclidBaseBPM' as keyof SliderState, bpm);
    onParamChange('granularEuclidBaseBPM' as keyof SliderState, bpm);
  }, [onParamChange]);

  // Notify parent when viewMode changes
  useEffect(() => {
    onViewModeChange?.(seq.viewMode);
  }, [seq.viewMode, onViewModeChange]);

  // Sync evolve configs to audio engine
  const evolveConfigsRef = useRef(seq.evolveConfigs);
  useEffect(() => {
    if (evolveConfigsRef.current !== seq.evolveConfigs) {
      evolveConfigsRef.current = seq.evolveConfigs;
      onEvolveConfigsChange?.(seq.evolveConfigs);
    }
  }, [seq.evolveConfigs, onEvolveConfigsChange]);

  // Merge evolved overrides from audio engine into visualizer state
  const evolvedVersionRef = useRef(-1);
  useEffect(() => {
    if (!evolvedOverrides || evolvedOverrides.version === evolvedVersionRef.current) return;
    evolvedVersionRef.current = evolvedOverrides.version;
    const { laneIndex, data } = evolvedOverrides;
    seq.setStepOverrides(prev => {
      const next = { ...prev };
      if (data.triggerToggles?.[laneIndex] != null) {
        const arr = [...prev.triggerToggles];
        arr[laneIndex] = new Map(data.triggerToggles[laneIndex]);
        next.triggerToggles = arr;
      }
      const keys = ['expression', 'morph', 'distance', 'probability', 'ratchet', 'pitch', 'slice', 'reverse'] as const;
      for (const key of keys) {
        if (data[key] && data[key]![laneIndex] != null) {
          const arr = [...prev[key]];
          arr[laneIndex] = data[key]![laneIndex];
          next[key] = arr;
        }
      }
      return next;
    });
  }, [evolvedOverrides, seq]);

  // Sync step overrides to audio engine
  // Track both stepOverrides AND pitchSettings so conversion re-runs on either change
  const stepOverridesRef = useRef(seq.stepOverrides);
  const pitchSettingsRef = useRef(seq.pitchSettings);
  const pitchSubLaneStatesRef = useRef(seq.subLaneStates);
  useEffect(() => {
    const overridesChanged = stepOverridesRef.current !== seq.stepOverrides;
    const settingsChanged = pitchSettingsRef.current !== seq.pitchSettings;
    const subLaneStatesChanged = pitchSubLaneStatesRef.current !== seq.subLaneStates;
    if (overridesChanged || settingsChanged || subLaneStatesChanged) {
      stepOverridesRef.current = seq.stepOverrides;
      pitchSettingsRef.current = seq.pitchSettings;
      pitchSubLaneStatesRef.current = seq.subLaneStates;
      // Convert pitch offsets to absolute MIDI notes before sending to engine
      // (engine doesn't know pitch mode/root/scale — we convert here)
      const convertedPitch = seq.stepOverrides.pitch.map((offsets, laneIdx) => {
        if (!offsets) return null;
        // When pitch sub-lane is disabled, return null so engine uses noteMin/noteMax range
        if (!seq.subLaneStates[laneIdx]?.pitch?.enabled) return null;
        const ps = seq.pitchSettings[laneIdx];
        if (!ps) return offsets;
        // noteRange mode: engine handles note selection via noteMin/noteMax
        if (ps.mode === 'noteRange') return null;
        if (ps.mode === 'notes') {
          // Scale degree → MIDI note number
          const scaleIntervals = SCALES[ps.scale] || [0, 2, 4, 5, 7, 9, 11];
          return offsets.map(deg => ps.root + scaleDegreeToSemitone(deg, scaleIntervals));
        }
        // Semitones mode: offset from root note
        return offsets.map(off => ps.root + off);
      });
      // Persist raw (unconverted) overrides for round-trip safety
      if (overridesChanged) {
        onRawStepOverridesChange?.(seq.stepOverrides);
      }
      // Send MIDI-converted pitch to audio engine
      onStepOverridesChange?.({
        ...seq.stepOverrides,
        pitch: convertedPitch,  // Send MIDI notes, not raw offsets
      });
    }
  }, [seq.stepOverrides, seq.pitchSettings, seq.subLaneStates, onStepOverridesChange, onRawStepOverridesChange]);

  // Persist sub-lane states (enabled/steps/direction) across tab switches
  const subLaneStatesRef = useRef(seq.subLaneStates);
  useEffect(() => {
    if (subLaneStatesRef.current !== seq.subLaneStates) {
      subLaneStatesRef.current = seq.subLaneStates;
      onSubLaneStatesChange?.(seq.subLaneStates);
    }
  }, [seq.subLaneStates, onSubLaneStatesChange]);

  // Persist pitch settings (mode/root/scale) across tab switches
  const pitchSettingsRef2 = useRef(seq.pitchSettings);
  useEffect(() => {
    if (pitchSettingsRef2.current !== seq.pitchSettings) {
      pitchSettingsRef2.current = seq.pitchSettings;
      onPitchSettingsChange?.(seq.pitchSettings);
    }
  }, [seq.pitchSettings, onPitchSettingsChange]);

  // Sync per-lane clock divisions to audio engine
  const clockDivsRef = useRef(seq.clockDivs);
  useEffect(() => {
    if (clockDivsRef.current !== seq.clockDivs) {
      clockDivsRef.current = seq.clockDivs;
      onClockDivsChange?.(seq.clockDivs);
    }
  }, [seq.clockDivs, onClockDivsChange]);

  // Sync per-lane swing amounts to audio engine
  const swingsRef = useRef(seq.swings);
  useEffect(() => {
    if (swingsRef.current !== seq.swings) {
      swingsRef.current = seq.swings;
      onSwingsChange?.(seq.swings);
    }
  }, [seq.swings, onSwingsChange]);

  const activeSeq = seq.activeSeq;

  // ── Source key helpers ──
  const getSourceKey = (laneIdx: number): keyof SliderState =>
    `synthEuclid${laneIdx + 1}Source` as keyof SliderState;

  const getSourceColor = (source: string): string =>
    SYNTH_SOURCES.find(s => s.value === source)?.color ?? '#888';

  // ── ADSR renderer (per-lead: Lead 1 uses lead1* params, Lead 2 uses lead2* params) ──
  const renderLeadAdsr = (leadNum: 1 | 2) => {
    const mp = getLeadMorphedParams(leadNum);
    const env = mp
      ? { attack: mp.attack, decay: mp.decay, sustain: mp.sustain, release: mp.release }
      : null;
    const useCustomAdsr = leadNum === 2 ? state.lead2UseCustomAdsr : state.lead1UseCustomAdsr;
    const customAdsrKey = leadNum === 2 ? 'lead2UseCustomAdsr' : 'lead1UseCustomAdsr';
    const attackKey = leadNum === 2 ? 'lead2Attack' : 'lead1Attack';
    const decayKey = leadNum === 2 ? 'lead2Decay' : 'lead1Decay';
    const sustainKey = leadNum === 2 ? 'lead2Sustain' : 'lead1Sustain';
    const holdKey = leadNum === 2 ? 'lead2Hold' : 'lead1Hold';
    const releaseKey = leadNum === 2 ? 'lead2Release' : 'lead1Release';
    const hasPresetEnv = (
      !!env &&
      typeof env.attack === 'number' && typeof env.decay === 'number' &&
      typeof env.sustain === 'number' && typeof env.release === 'number' &&
      Number.isFinite(env.attack) && Number.isFinite(env.decay) &&
      Number.isFinite(env.sustain) && Number.isFinite(env.release)
    );
    const customEnv = {
      attack: state[attackKey], decay: state[decayKey],
      sustain: state[sustainKey], release: state[releaseKey],
    };
    const safeEnv = useCustomAdsr ? customEnv : hasPresetEnv ? env! : customEnv;

    if (
      typeof safeEnv.attack !== 'number' || typeof safeEnv.decay !== 'number' ||
      typeof safeEnv.sustain !== 'number' || typeof safeEnv.release !== 'number' ||
      !Number.isFinite(safeEnv.attack) || !Number.isFinite(safeEnv.decay) ||
      !Number.isFinite(safeEnv.sustain) || !Number.isFinite(safeEnv.release)
    ) {
      return null;
    }

    const sourceLabel = useCustomAdsr ? 'custom' : (hasPresetEnv ? 'from preset' : 'fallback');

    const accentColor = leadNum === 1 ? '#f59e0b' : '#06b6d4';
    const accentRgba = leadNum === 1 ? 'rgba(245,158,11,' : 'rgba(6,182,212,';

    return (
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <button
            onClick={() => onSelectChange(customAdsrKey as keyof SliderState, false)}
            style={{
              padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontSize: '0.7rem',
              background: !useCustomAdsr ? `${accentRgba}0.2)` : 'rgba(255,255,255,0.08)',
              color: !useCustomAdsr ? accentColor : '#999',
            }}
          >
            Preset ADSR
          </button>
          <button
            onClick={() => onSelectChange(customAdsrKey as keyof SliderState, true)}
            style={{
              padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontSize: '0.7rem',
              background: useCustomAdsr ? `${accentRgba}0.2)` : 'rgba(255,255,255,0.08)',
              color: useCustomAdsr ? accentColor : '#999',
            }}
          >
            Custom ADSR
          </button>
        </div>
        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>
          Envelope ({sourceLabel}) — A:{safeEnv.attack.toFixed(3)}s D:{safeEnv.decay.toFixed(2)}s S:{(safeEnv.sustain * 100).toFixed(0)}% R:{safeEnv.release.toFixed(2)}s
        </div>
        <LeadAdsrViz
          attack={safeEnv.attack}
          decay={safeEnv.decay}
          sustain={safeEnv.sustain}
          hold={state[holdKey]}
          release={safeEnv.release}
          accentColor={accentColor}
          accentRgba={accentRgba}
          onChange={useCustomAdsr ? (param, v) => onParamChange(param as keyof SliderState, v) : undefined}
          disabled={!useCustomAdsr}
          paramPrefix={leadNum === 2 ? 'lead2' : 'lead1'}
        />
        {useCustomAdsr && (
          <div style={{ marginTop: '8px' }}>
            <Slider label="Attack" value={state[attackKey]} paramKey={attackKey} unit="s" onChange={onParamChange} {...sliderProps(attackKey)} />
            <Slider label="Decay" value={state[decayKey]} paramKey={decayKey} unit="s" onChange={onParamChange} {...sliderProps(decayKey)} />
            <Slider label="Sustain" value={state[sustainKey]} paramKey={sustainKey} onChange={onParamChange} {...sliderProps(sustainKey)} />
            <Slider label="Hold" value={state[holdKey]} paramKey={holdKey} unit="s" onChange={onParamChange} {...sliderProps(holdKey)} />
            <Slider label="Release" value={state[releaseKey]} paramKey={releaseKey} unit="s" onChange={onParamChange} {...sliderProps(releaseKey)} />
          </div>
        )}
      </div>
    );
  };

  // ═══════════════ Render ═══════════════

  return (
    <div className="synth-root">
      <div className="container">
        {/* ═══ Synth Source Preset (L3) ═══ */}
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Synth Source</span>
          <PresetDropdown
            level="source"
            scope="synth"
            state={state}
            onLoad={(_entry: PresetEntry) => {}}
            onStateChange={onStateChange}
            presetOptions={synthCompositeExtract}
            compact
          />
        </div>

        {/* ════════ LEFT: Sound Panels ════════ */}
        <div className="sound-panel">

          {/* ── Pad Synth Card ── */}
          <div className={`synth-card${padTier > 0 ? ' editing' : ''}`} style={{ '--sc': '#4a9eff' } as React.CSSProperties}>
            <div className="synth-card-header">
              <span className="sc-name">Pad Synth</span>
              <button
                className={`sc-enable-btn${state.padEnabled ? ' on' : ''}`}
                onClick={() => onSelectChange('padEnabled' as keyof SliderState, !state.padEnabled)}
              >
                {state.padEnabled ? 'ON' : 'OFF'}
              </button>
              {/* Tier toggle buttons */}
              <button
                className={`sc-tier-btn${padTier >= 1 ? ' active' : ''}`}
                onClick={() => setPadTier(padTier >= 1 ? 0 : 1)}
                title="Primary controls"
                {...bindHelp('synthPadPrimaryTier')}
              >
                {'\u2699'}
              </button>
              <button
                className={`sc-tier-btn adv${padTier === 2 ? ' active' : ''}`}
                onClick={() => setPadTier(padTier === 2 ? 1 : 2)}
                title="Advanced controls"
                {...bindHelp('synthPadAdvancedTier')}
              >
                {'\u270E'}
              </button>
            </div>

            {/* ══ TIER 1 — Always visible: Presets + Interactive Viz ══ */}
            <div className="synth-card-simple sc-tier1">
              <SynthPresetManager engineScope="pad1" slotAKey={'padPresetA' as keyof SliderState} slotBKey={'padPresetB' as keyof SliderState} state={state} onSelectChange={onSelectChange} color="#4a9eff" />
              {/* Preset A / Morph / B — single row */}
              <div className="sc-morph-row">
                <span className="sc-morph-tag" style={{ color: '#4a9eff' }}>A</span>
                <div className="sc-preset-slot">
                  <select
                    value={state.padPresetA}
                    onChange={(e) => onSelectChange('padPresetA' as keyof SliderState, e.target.value)}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(74,158,255,0.3)' }}
                  >
                    {renderPadPresetOptions(pad1PresetOptions)}
                  </select>
                </div>
                <div className="sc-morph-slider">
                  <Slider label="" value={state.padMorph} paramKey="padMorph" onChange={onParamChange} {...sliderProps('padMorph')} />
                </div>
                <div className="sc-preset-slot">
                  <select
                    value={state.padPresetB}
                    onChange={(e) => onSelectChange('padPresetB' as keyof SliderState, e.target.value)}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(139,92,246,0.3)' }}
                  >
                    {renderPadPresetOptions(pad1PresetOptions)}
                  </select>
                </div>
                <span className="sc-morph-tag" style={{ color: '#8b5cf6' }}>B</span>
              </div>

              {/* Interactive Visualization — drag filter min/max & ADSR points */}
              <FilterLfoViz
                filterAType={state.filterType}
                filterACutoff={state.filterCutoffMin + (state.filterCutoffMax - state.filterCutoffMin) * 0.5}
                filterARes={state.filterResonance}
                filterAQ={state.filterQ}
                hardness={state.hardness}
                filterBEnabled={state.padFilterBEnabled ?? false}
                filterBType={state.padFilterBType ?? 'highpass'}
                filterBCutoff={state.padFilterBCutoff ?? 2000}
                filterBRes={state.padFilterBResonance ?? 0}
                filterRouting={state.padFilterRouting ?? 'series'}
                lfoWave={state.padLfo1Wave ?? 'sine'}
                lfoRate={state.padLfo1Rate ?? 0.5}
                lfoDepth={state.padLfo1Depth ?? 0}
                lfoDest={state.padLfo1Dest ?? 'none'}
                filterCutoffMin={state.filterCutoffMin}
                filterCutoffMax={state.filterCutoffMax}
                synthAttack={state.synthAttack}
                synthDecay={state.synthDecay}
                synthSustain={state.synthSustain}
                synthRelease={state.synthRelease}
                liveFilterFreq={liveFilterFreq}
                liveLfoValue={liveLfoValue}
                isRunning={isRunning}
                onFilterMinChange={(v) => onParamChange('filterCutoffMin', v)}
                onFilterMaxChange={(v) => onParamChange('filterCutoffMax', v)}
                onAdsrChange={(param, v) => onParamChange(param, v)}
              />

              {/* Drive + Osc Mix — same line */}
              <div className="sc-compact-grid-2">
                <Slider label="Drive" value={state.hardness} paramKey="hardness" onChange={onParamChange} {...sliderProps('hardness')} />
                <Slider label="Osc Mix" value={state.padOscMix ?? 0.5} paramKey="padOscMix" onChange={onParamChange} {...sliderProps('padOscMix')} />
              </div>

              {/* Wave Fold — viz + slider + mode on one line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <WaveFoldViz foldAmount={state.padFoldAmount ?? 0} foldMode={state.padFoldMode ?? 0} oscAWave={state.padOscAWave ?? 'sine'} oscBWave={state.padOscBWave ?? 'sine'} oscALevel={state.padOscALevel ?? 1} oscBLevel={state.padOscBLevel ?? 1} oscMix={state.padOscMix ?? 0.5} />
                <div style={{ flex: 1 }}>
                  <Slider label="Fold" value={state.padFoldAmount ?? 0} paramKey="padFoldAmount" onChange={onParamChange} {...sliderProps('padFoldAmount')} />
                </div>
                <Select
                  label=""
                  value={state.padFoldMode ?? 0}
                  options={[
                    { value: 0, label: 'Buchla' },
                    { value: 1, label: 'Sine' },
                    { value: 2, label: 'Serge' },
                  ]}
                  onChange={(v: number) => onSelectChange('padFoldMode' as keyof SliderState, v)}
                />
              </div>
            </div>

            {/* ══ TIER 2 — Primary controls ══ */}
            {padTier >= 1 && (
              <div className="synth-card-tier2">
                {/* ─── Filter ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Filter</div>
                  <div className="sc-compact-row">
                    <Select
                      label="Type"
                      value={state.filterType}
                      options={[
                        { value: 'lowpass', label: 'LP' },
                        { value: 'bandpass', label: 'BP' },
                        { value: 'highpass', label: 'HP' },
                        { value: 'notch', label: 'Notch' },
                      ]}
                      onChange={(v: string) => onSelectChange('filterType' as keyof SliderState, v)}
                    />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Min" value={state.filterCutoffMin} paramKey="filterCutoffMin" unit="Hz" logarithmic onChange={onParamChange} {...sliderProps('filterCutoffMin')} />
                    <Slider label="Max" value={state.filterCutoffMax} paramKey="filterCutoffMax" unit="Hz" logarithmic onChange={onParamChange} {...sliderProps('filterCutoffMax')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Resonance" value={state.filterResonance} paramKey="filterResonance" onChange={onParamChange} {...sliderProps('filterResonance')} />
                    <Slider label="Q" value={state.filterQ} paramKey="filterQ" onChange={onParamChange} {...sliderProps('filterQ')} />
                  </div>
                </div>

                {/* ─── Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Envelope</div>
                  <div className="sc-compact-grid-4">
                    <Slider label="Attack" value={state.synthAttack} paramKey="synthAttack" unit="s" onChange={onParamChange} {...sliderProps('synthAttack')} />
                    <Slider label="Decay" value={state.synthDecay} paramKey="synthDecay" unit="s" onChange={onParamChange} {...sliderProps('synthDecay')} />
                    <Slider label="Sustain" value={state.synthSustain} paramKey="synthSustain" onChange={onParamChange} {...sliderProps('synthSustain')} />
                    <Slider label="Release" value={state.synthRelease} paramKey="synthRelease" unit="s" onChange={onParamChange} {...sliderProps('synthRelease')} />
                  </div>
                </div>

                {/* ─── LFO ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('padLfo1Dest' as keyof SliderState, preset.dest);
                          onSelectChange('padLfo1Wave' as keyof SliderState, preset.wave);
                          onParamChange('padLfo1Rate' as keyof SliderState, preset.rate);
                          onParamChange('padLfo1Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.padLfo1Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                        { value: 'foldAmount', label: 'Fold' },
                      ]}
                      onChange={(v: string) => onSelectChange('padLfo1Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.padLfo1Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.padLfo1Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('padLfo1Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.padLfo1Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.padLfo1Rate ?? 0.5} paramKey="padLfo1Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('padLfo1Rate')} />
                      <Slider label="Depth" value={state.padLfo1Depth ?? 0} paramKey="padLfo1Depth" onChange={onParamChange} {...sliderProps('padLfo1Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── LFO 2 ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO 2</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('padLfo2Dest' as keyof SliderState, preset.dest);
                          onSelectChange('padLfo2Wave' as keyof SliderState, preset.wave);
                          onParamChange('padLfo2Rate' as keyof SliderState, preset.rate);
                          onParamChange('padLfo2Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.padLfo2Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                      ]}
                      onChange={(v: string) => onSelectChange('padLfo2Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.padLfo2Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.padLfo2Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('padLfo2Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.padLfo2Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.padLfo2Rate ?? 0.5} paramKey="padLfo2Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('padLfo2Rate')} />
                      <Slider label="Depth" value={state.padLfo2Depth ?? 0} paramKey="padLfo2Depth" onChange={onParamChange} {...sliderProps('padLfo2Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── Oscillators (compact 2-col grid) ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Oscillators</div>
                  <div className="sc-osc-grid">
                    {/* Osc A */}
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc A</div>
                      <Select
                        label=""
                        value={state.padOscAWave ?? 'sawtooth'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('padOscAWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.padOscALevel ?? 0.6} paramKey="padOscALevel" onChange={onParamChange} {...sliderProps('padOscALevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.padOscAOctave ?? 0} paramKey="padOscAOctave" onChange={onParamChange} {...sliderProps('padOscAOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.padOscADetune ?? 0} paramKey="padOscADetune" onChange={onParamChange} {...sliderProps('padOscADetune')} />
                      </div>
                    </div>
                    {/* Osc B */}
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc B</div>
                      <Select
                        label=""
                        value={state.padOscBWave ?? 'triangle'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('padOscBWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.padOscBLevel ?? 0.4} paramKey="padOscBLevel" onChange={onParamChange} {...sliderProps('padOscBLevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.padOscBOctave ?? 0} paramKey="padOscBOctave" onChange={onParamChange} {...sliderProps('padOscBOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.padOscBDetune ?? 0} paramKey="padOscBDetune" onChange={onParamChange} {...sliderProps('padOscBDetune')} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TIER 3 — Advanced controls ══ */}
            {padTier === 2 && (
              <div className="synth-card-advanced">
                {/* ─── Auto Morph ─── */}
                <div className="sc-morph-auto-row">
                  <button
                    className={`sc-toggle-btn${state.padMorphAuto ? ' on' : ''}`}
                    onClick={() => onSelectChange('padMorphAuto' as keyof SliderState, !state.padMorphAuto)}
                  >
                    {state.padMorphAuto ? '● Auto Morph' : '○ Auto Morph'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.padMorphSpeed} paramKey="padMorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('padMorphSpeed')} />
                  </div>
                </div>



                {/* ─── Sub Oscillator ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Sub Oscillator
                    <button
                      className={`sc-toggle-btn small${state.padSubEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('padSubEnabled' as keyof SliderState, !state.padSubEnabled)}
                    >
                      {state.padSubEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.padSubEnabled && (
                    <div className="sc-compact-grid-2">
                      <div>
                        <Select
                          label="Wave"
                          value={state.padSubWave ?? 'sine'}
                          options={[
                            { value: 'sine', label: 'Sine' },
                            { value: 'triangle', label: 'Triangle' },
                          ]}
                          onChange={(v: string) => onSelectChange('padSubWave' as keyof SliderState, v)}
                        />
                        <Slider label="Level" value={state.padSubLevel ?? 0.3} paramKey="padSubLevel" onChange={onParamChange} {...sliderProps('padSubLevel')} />
                      </div>
                      <div>
                        <Slider label="Octave" value={state.padSubOctave ?? -1} paramKey="padSubOctave" onChange={onParamChange} {...sliderProps('padSubOctave')} />
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── Noise ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Noise</div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Type"
                      value={state.padNoiseType ?? 'white'}
                      options={[
                        { value: 'white', label: 'White' },
                        { value: 'pink', label: 'Pink' },
                      ]}
                      onChange={(v: string) => onSelectChange('padNoiseType' as keyof SliderState, v)}
                    />
                    <Slider label="Level" value={state.padNoiseLevel ?? 0.15} paramKey="padNoiseLevel" onChange={onParamChange} {...sliderProps('padNoiseLevel')} />
                  </div>
                </div>

                {/* ─── Character ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Character</div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Warmth" value={state.warmth} paramKey="warmth" onChange={onParamChange} {...sliderProps('warmth')} />
                    <Slider label="Presence" value={state.presence} paramKey="presence" onChange={onParamChange} {...sliderProps('presence')} />
                  </div>
                  {/* Legacy: global detune — superseded by per-osc detune */}
                </div>

                {/* ─── Mod Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Mod Envelope
                    <button
                      className={`sc-toggle-btn small${state.padModEnvEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('padModEnvEnabled' as keyof SliderState, !state.padModEnvEnabled)}
                      {...bindHelp('synthModEnvEnable')}
                    >
                      {state.padModEnvEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.padModEnvEnabled && (
                    <>
                      <Select
                        label="Target"
                        value={state.padModEnvDest ?? 'filterCutoff'}
                        options={[
                          { value: 'filterCutoff', label: 'Filter Cutoff' },
                          { value: 'pitch', label: 'Pitch' },
                          { value: 'oscBLevel', label: 'Osc B Level' },
                          { value: 'foldAmount', label: 'Fold' },
                        ]}
                        onChange={(v: string) => onSelectChange('padModEnvDest' as keyof SliderState, v)}
                        {...bindHelp('synthModEnvTarget')}
                      />
                      <Slider label="Depth" value={state.padModEnvDepth ?? 0} paramKey="padModEnvDepth" onChange={onParamChange} {...sliderProps('padModEnvDepth')} />
                      <div className="sc-compact-grid-4">
                        <Slider label="Attack" value={state.padModEnvAttack ?? 0.1} paramKey="padModEnvAttack" unit="s" onChange={onParamChange} {...sliderProps('padModEnvAttack')} />
                        <Slider label="Decay" value={state.padModEnvDecay ?? 0.3} paramKey="padModEnvDecay" unit="s" onChange={onParamChange} {...sliderProps('padModEnvDecay')} />
                        <Slider label="Sustain" value={state.padModEnvSustain ?? 0} paramKey="padModEnvSustain" onChange={onParamChange} {...sliderProps('padModEnvSustain')} />
                        <Slider label="Release" value={state.padModEnvRelease ?? 0.5} paramKey="padModEnvRelease" unit="s" onChange={onParamChange} {...sliderProps('padModEnvRelease')} />
                      </div>
                    </>
                  )}
                </div>

                {/* ─── Filter B ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Filter B
                    <button
                      className={`sc-toggle-btn small${state.padFilterBEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('padFilterBEnabled' as keyof SliderState, !state.padFilterBEnabled)}
                    >
                      {state.padFilterBEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.padFilterBEnabled && (
                    <>
                      <Select
                        label="Type"
                        value={state.padFilterBType ?? 'highpass'}
                        options={[
                          { value: 'lowpass', label: 'Lowpass' },
                          { value: 'bandpass', label: 'Bandpass' },
                          { value: 'highpass', label: 'Highpass' },
                          { value: 'notch', label: 'Notch' },
                        ]}
                        onChange={(v: string) => onSelectChange('padFilterBType' as keyof SliderState, v)}
                      />
                      <div className="sc-compact-grid-2">
                        <Slider label="Cutoff" value={state.padFilterBCutoff ?? 200} paramKey="padFilterBCutoff" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('padFilterBCutoff')} />
                        <Slider label="Res" value={state.padFilterBResonance ?? 0.2} paramKey="padFilterBResonance" onChange={onParamChange} {...sliderProps('padFilterBResonance')} />
                      </div>
                      <Slider label="Q" value={state.padFilterBQ ?? 1} paramKey="padFilterBQ" onChange={onParamChange} {...sliderProps('padFilterBQ')} />
                    </>
                  )}
                </div>

                {/* ─── Filter Routing ─── */}
                {state.padFilterBEnabled && (
                  <div className="sc-advanced-section">
                    <div className="sc-section-label">Routing</div>
                    <Select
                      label="Mode"
                      value={state.padFilterRouting ?? 'series'}
                      options={[
                        { value: 'series', label: 'Series (A → B)' },
                        { value: 'aOnly', label: 'A Only' },
                        { value: 'bOnly', label: 'B Only' },
                      ]}
                      onChange={(v: string) => onSelectChange('padFilterRouting' as keyof SliderState, v)}
                      {...bindHelp('synthFilterRoutingMode')}
                    />
                  </div>
                )}

                {/* ─── Voices ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Voices</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#888' }}>Mask</span>
                    <span style={{ fontSize: '0.55rem', color: '#666' }}>
                      {[1, 2, 3, 4, 5, 6].filter(v => (state.synthVoiceMask || 63) & (1 << (v - 1))).join(' ')}
                    </span>
                  </div>
                  <div className="voice-mask-row">
                    {[1, 2, 3, 4, 5, 6].map(voice => {
                      const bit = 1 << (voice - 1);
                      const isEnabled = ((state.synthVoiceMask || 63) & bit) !== 0;
                      return (
                        <button
                          key={voice}
                          className={`voice-mask-btn ${isEnabled ? 'active' : ''}`}
                          onClick={() => {
                            const currentMask = state.synthVoiceMask || 63;
                            let newMask = currentMask ^ bit;
                            if (newMask === 0) newMask = bit;
                            onParamChange('synthVoiceMask', newMask);
                          }}
                          style={isEnabled ? {
                            background: `linear-gradient(135deg, hsl(${210 + voice * 25}, 60%, 35%), hsl(${210 + voice * 25}, 60%, 25%))`,
                            borderColor: `hsl(${210 + voice * 25}, 60%, 50%)`,
                          } : undefined}
                          title={`Voice ${voice}`}
                          {...bindHelp('synthVoiceMaskToggle', { label: `Voice ${voice}` })}
                        >
                          {voice}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 4px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#888' }}>Octave</span>
                    <span style={{ fontSize: '0.55rem', color: '#666' }}>
                      {state.synthOctave === 0 ? '0' : (state.synthOctave > 0 ? `+${state.synthOctave}` : state.synthOctave)}
                    </span>
                  </div>
                  <div className="octave-row">
                    {[-2, -1, 0, 1, 2].map(oct => (
                      <button
                        key={oct}
                        className={`octave-btn ${state.synthOctave === oct ? 'active' : ''}`}
                        onClick={() => onParamChange('synthOctave', oct)}
                      >
                        {oct === 0 ? '0' : (oct > 0 ? `+${oct}` : oct)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Pad 2 Card ── */}
          <div className={`synth-card${pad2Tier > 0 ? ' editing' : ''}`} style={{ '--sc': '#8b5cf6' } as React.CSSProperties}>
            <div className="synth-card-header">
              <span className="sc-name">Pad 2</span>
              <button
                className={`sc-enable-btn${state.pad2Enabled ? ' on' : ''}`}
                onClick={() => onSelectChange('pad2Enabled' as keyof SliderState, !state.pad2Enabled)}
              >
                {state.pad2Enabled ? 'ON' : 'OFF'}
              </button>
              {state.pad2Enabled && (
                <button
                  className={`sc-tier-btn${pad2Tier >= 1 ? ' active' : ''}`}
                  onClick={() => setPad2Tier(pad2Tier >= 1 ? 0 : 1)}
                  title="Primary controls"
                  {...bindHelp('synthPadPrimaryTier')}
                >
                  {'\u2699'}
                </button>
              )}
              {state.pad2Enabled && (
                <button
                  className={`sc-tier-btn adv${pad2Tier === 2 ? ' active' : ''}`}
                  onClick={() => setPad2Tier(pad2Tier === 2 ? 1 : 2)}
                  title="Advanced controls"
                  {...bindHelp('synthPadAdvancedTier')}
                >
                  {'\u270E'}
                </button>
              )}
            </div>

            {state.pad2Enabled && (<>
            {/* ══ TIER 1 — Always visible: Presets + Viz + Drive + Voice Assign ══ */}
            <div className="synth-card-simple sc-tier1">
              <SynthPresetManager engineScope="pad2" slotAKey={'pad2PresetA' as keyof SliderState} slotBKey={'pad2PresetB' as keyof SliderState} state={state} onSelectChange={onSelectChange} color="#8b5cf6" />
              {/* Preset A/B morph */}
              {/* Preset A / Morph / B — single row */}
              <div className="sc-morph-row">
                <span className="sc-morph-tag" style={{ color: '#8b5cf6' }}>A</span>
                <div className="sc-preset-slot">
                  <select
                    value={state.pad2PresetA}
                    onChange={(e) => onSelectChange('pad2PresetA' as keyof SliderState, e.target.value)}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(139,92,246,0.3)' }}
                  >
                    {renderPadPresetOptions(pad2PresetOptions)}
                  </select>
                </div>
                <div className="sc-morph-slider">
                  <Slider label="" value={state.pad2Morph} paramKey="pad2Morph" onChange={onParamChange} {...sliderProps('pad2Morph')} />
                </div>
                <div className="sc-preset-slot">
                  <select
                    value={state.pad2PresetB}
                    onChange={(e) => onSelectChange('pad2PresetB' as keyof SliderState, e.target.value)}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(236,72,153,0.3)' }}
                  >
                    {renderPadPresetOptions(pad2PresetOptions)}
                  </select>
                </div>
                <span className="sc-morph-tag" style={{ color: '#ec4899' }}>B</span>
              </div>

              {/* Interactive Visualization */}
              <FilterLfoViz
                filterAType={state.pad2FilterType ?? 'lowpass'}
                filterACutoff={(state.pad2FilterCutoffMin ?? 400) + ((state.pad2FilterCutoffMax ?? 3000) - (state.pad2FilterCutoffMin ?? 400)) * 0.5}
                filterARes={state.pad2FilterResonance ?? 0.2}
                filterAQ={state.pad2FilterQ ?? 1}
                hardness={state.pad2Hardness ?? 0.3}
                filterBEnabled={state.pad2FilterBEnabled ?? false}
                filterBType={state.pad2FilterBType ?? 'highpass'}
                filterBCutoff={state.pad2FilterBCutoff ?? 2000}
                filterBRes={state.pad2FilterBResonance ?? 0}
                filterRouting={state.pad2FilterRouting ?? 'series'}
                lfoWave={state.pad2Lfo1Wave ?? 'sine'}
                lfoRate={state.pad2Lfo1Rate ?? 0.5}
                lfoDepth={state.pad2Lfo1Depth ?? 0}
                lfoDest={state.pad2Lfo1Dest ?? 'none'}
                filterCutoffMin={state.pad2FilterCutoffMin ?? 400}
                filterCutoffMax={state.pad2FilterCutoffMax ?? 3000}
                synthAttack={state.pad2Attack ?? 6}
                synthDecay={state.pad2Decay ?? 1}
                synthSustain={state.pad2Sustain ?? 0.8}
                synthRelease={state.pad2Release ?? 12}
                liveFilterFreq={liveFilterFreq}
                liveLfoValue={liveLfoValue}
                isRunning={isRunning}
                onFilterMinChange={(v) => onParamChange('pad2FilterCutoffMin', v)}
                onFilterMaxChange={(v) => onParamChange('pad2FilterCutoffMax', v)}
                onAdsrChange={(param, v) => {
                  const pad2Map: Record<string, string> = {
                    synthAttack: 'pad2Attack', synthDecay: 'pad2Decay',
                    synthSustain: 'pad2Sustain', synthRelease: 'pad2Release',
                  };
                  onParamChange((pad2Map[param] || param) as keyof SliderState, v);
                }}
              />

              {/* Drive + Osc Mix */}
              <div className="sc-compact-grid-2">
                <Slider label="Drive" value={state.pad2Hardness} paramKey="pad2Hardness" onChange={onParamChange} {...sliderProps('pad2Hardness')} />
                <Slider label="Osc Mix" value={state.pad2OscMix ?? 0.5} paramKey="pad2OscMix" onChange={onParamChange} {...sliderProps('pad2OscMix')} />
              </div>

              {/* Wave Fold — viz + slider + mode on one line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <WaveFoldViz foldAmount={state.pad2FoldAmount ?? 0} foldMode={state.pad2FoldMode ?? 0} oscAWave={state.pad2OscAWave ?? 'sine'} oscBWave={state.pad2OscBWave ?? 'sine'} oscALevel={state.pad2OscALevel ?? 1} oscBLevel={state.pad2OscBLevel ?? 1} oscMix={state.pad2OscMix ?? 0.5} />
                <div style={{ flex: 1 }}>
                  <Slider label="Fold" value={state.pad2FoldAmount ?? 0} paramKey="pad2FoldAmount" onChange={onParamChange} {...sliderProps('pad2FoldAmount')} />
                </div>
                <Select
                  label=""
                  value={state.pad2FoldMode ?? 0}
                  options={[
                    { value: 0, label: 'Buchla' },
                    { value: 1, label: 'Sine' },
                    { value: 2, label: 'Serge' },
                  ]}
                  onChange={(v: number) => onSelectChange('pad2FoldMode' as keyof SliderState, v)}
                />
              </div>

              {/* Voice assignment — which of the 6 voices belong to Pad 2 */}
              <div className="sc-advanced-section" style={{ marginTop: '4px' }}>
                <div className="sc-section-label" style={{ fontSize: '0.65rem' }}>Voice Assignment</div>
                <div className="voice-mask-row">
                  {[1, 2, 3, 4, 5, 6].map(voice => {
                    const bit = 1 << (voice - 1);
                    const isAssigned = ((state.pad2VoiceAssign ?? 0) & bit) !== 0;
                    return (
                      <button
                        key={voice}
                        className={`voice-mask-btn ${isAssigned ? 'active' : ''}`}
                        onClick={() => {
                          const cur = state.pad2VoiceAssign ?? 0;
                          onParamChange('pad2VoiceAssign', cur ^ bit);
                        }}
                        style={isAssigned ? {
                          background: `linear-gradient(135deg, hsl(${260 + voice * 15}, 60%, 35%), hsl(${260 + voice * 15}, 60%, 25%))`,
                          borderColor: `hsl(${260 + voice * 15}, 60%, 50%)`,
                        } : undefined}
                        title={`Voice ${voice}`}
                        {...bindHelp('synthPad2VoiceAssign', { label: `Voice ${voice}` })}
                      >
                        {voice}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.55rem', color: '#888', marginTop: '2px' }}>
                  Assigned voices play Pad 2. Unassigned stay on Pad 1.
                </div>
              </div>
            </div>

            {/* ══ TIER 2 — Primary controls ══ */}
            {pad2Tier >= 1 && (
              <div className="synth-card-tier2">
                {/* ─── Filter ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Filter</div>
                  <div className="sc-compact-row">
                    <Select
                      label="Type"
                      value={state.pad2FilterType ?? 'lowpass'}
                      options={[
                        { value: 'lowpass', label: 'LP' },
                        { value: 'bandpass', label: 'BP' },
                        { value: 'highpass', label: 'HP' },
                        { value: 'notch', label: 'Notch' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2FilterType' as keyof SliderState, v)}
                    />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Min" value={state.pad2FilterCutoffMin} paramKey="pad2FilterCutoffMin" unit="Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2FilterCutoffMin')} />
                    <Slider label="Max" value={state.pad2FilterCutoffMax} paramKey="pad2FilterCutoffMax" unit="Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2FilterCutoffMax')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Resonance" value={state.pad2FilterResonance} paramKey="pad2FilterResonance" onChange={onParamChange} {...sliderProps('pad2FilterResonance')} />
                    <Slider label="Q" value={state.pad2FilterQ} paramKey="pad2FilterQ" onChange={onParamChange} {...sliderProps('pad2FilterQ')} />
                  </div>
                </div>

                {/* ─── Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Envelope</div>
                  <div className="sc-compact-grid-4">
                    <Slider label="Attack" value={state.pad2Attack} paramKey="pad2Attack" unit="s" onChange={onParamChange} {...sliderProps('pad2Attack')} />
                    <Slider label="Decay" value={state.pad2Decay} paramKey="pad2Decay" unit="s" onChange={onParamChange} {...sliderProps('pad2Decay')} />
                    <Slider label="Sustain" value={state.pad2Sustain} paramKey="pad2Sustain" onChange={onParamChange} {...sliderProps('pad2Sustain')} />
                    <Slider label="Release" value={state.pad2Release} paramKey="pad2Release" unit="s" onChange={onParamChange} {...sliderProps('pad2Release')} />
                  </div>
                </div>

                {/* ─── LFO 1 ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('pad2Lfo1Dest' as keyof SliderState, preset.dest);
                          onSelectChange('pad2Lfo1Wave' as keyof SliderState, preset.wave);
                          onParamChange('pad2Lfo1Rate' as keyof SliderState, preset.rate);
                          onParamChange('pad2Lfo1Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.pad2Lfo1Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                        { value: 'foldAmount', label: 'Fold' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2Lfo1Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.pad2Lfo1Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.pad2Lfo1Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2Lfo1Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.pad2Lfo1Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.pad2Lfo1Rate ?? 0.5} paramKey="pad2Lfo1Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2Lfo1Rate')} />
                      <Slider label="Depth" value={state.pad2Lfo1Depth ?? 0} paramKey="pad2Lfo1Depth" onChange={onParamChange} {...sliderProps('pad2Lfo1Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── LFO 2 ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO 2</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('pad2Lfo2Dest' as keyof SliderState, preset.dest);
                          onSelectChange('pad2Lfo2Wave' as keyof SliderState, preset.wave);
                          onParamChange('pad2Lfo2Rate' as keyof SliderState, preset.rate);
                          onParamChange('pad2Lfo2Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.pad2Lfo2Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2Lfo2Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.pad2Lfo2Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.pad2Lfo2Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2Lfo2Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.pad2Lfo2Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.pad2Lfo2Rate ?? 0.5} paramKey="pad2Lfo2Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2Lfo2Rate')} />
                      <Slider label="Depth" value={state.pad2Lfo2Depth ?? 0} paramKey="pad2Lfo2Depth" onChange={onParamChange} {...sliderProps('pad2Lfo2Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── Oscillators ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Oscillators</div>
                  <div className="sc-osc-grid">
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc A</div>
                      <Select
                        label=""
                        value={state.pad2OscAWave ?? 'sawtooth'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2OscAWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.pad2OscALevel ?? 0.6} paramKey="pad2OscALevel" onChange={onParamChange} {...sliderProps('pad2OscALevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.pad2OscAOctave ?? 0} paramKey="pad2OscAOctave" onChange={onParamChange} {...sliderProps('pad2OscAOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.pad2OscADetune ?? 0} paramKey="pad2OscADetune" onChange={onParamChange} {...sliderProps('pad2OscADetune')} />
                      </div>
                    </div>
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc B</div>
                      <Select
                        label=""
                        value={state.pad2OscBWave ?? 'triangle'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2OscBWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.pad2OscBLevel ?? 0.4} paramKey="pad2OscBLevel" onChange={onParamChange} {...sliderProps('pad2OscBLevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.pad2OscBOctave ?? 0} paramKey="pad2OscBOctave" onChange={onParamChange} {...sliderProps('pad2OscBOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.pad2OscBDetune ?? 0} paramKey="pad2OscBDetune" onChange={onParamChange} {...sliderProps('pad2OscBDetune')} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TIER 3 — Advanced controls ══ */}
            {pad2Tier === 2 && (
              <div className="synth-card-advanced">
                {/* ─── Auto Morph ─── */}
                <div className="sc-morph-auto-row">
                  <button
                    className={`sc-toggle-btn${state.pad2MorphAuto ? ' on' : ''}`}
                    onClick={() => onSelectChange('pad2MorphAuto' as keyof SliderState, !state.pad2MorphAuto)}
                  >
                    {state.pad2MorphAuto ? '● Auto Morph' : '○ Auto Morph'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.pad2MorphSpeed} paramKey="pad2MorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('pad2MorphSpeed')} />
                  </div>
                </div>

                {/* ─── Sub Oscillator ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Sub Oscillator
                    <button
                      className={`sc-toggle-btn small${state.pad2SubEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('pad2SubEnabled' as keyof SliderState, !state.pad2SubEnabled)}
                    >
                      {state.pad2SubEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.pad2SubEnabled && (
                    <div className="sc-compact-grid-2">
                      <div>
                        <Select
                          label="Wave"
                          value={state.pad2SubWave ?? 'sine'}
                          options={[
                            { value: 'sine', label: 'Sine' },
                            { value: 'triangle', label: 'Triangle' },
                          ]}
                          onChange={(v: string) => onSelectChange('pad2SubWave' as keyof SliderState, v)}
                        />
                        <Slider label="Level" value={state.pad2SubLevel ?? 0.3} paramKey="pad2SubLevel" onChange={onParamChange} {...sliderProps('pad2SubLevel')} />
                      </div>
                      <div>
                        <Slider label="Octave" value={state.pad2SubOctave ?? -1} paramKey="pad2SubOctave" onChange={onParamChange} {...sliderProps('pad2SubOctave')} />
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── Noise ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Noise</div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Type"
                      value={state.pad2NoiseType ?? 'white'}
                      options={[
                        { value: 'white', label: 'White' },
                        { value: 'pink', label: 'Pink' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2NoiseType' as keyof SliderState, v)}
                    />
                    <Slider label="Level" value={state.pad2NoiseLevel ?? 0.15} paramKey="pad2NoiseLevel" onChange={onParamChange} {...sliderProps('pad2NoiseLevel')} />
                  </div>
                </div>

                {/* ─── Character ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Character</div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Warmth" value={state.pad2Warmth} paramKey="pad2Warmth" onChange={onParamChange} {...sliderProps('pad2Warmth')} />
                    <Slider label="Presence" value={state.pad2Presence} paramKey="pad2Presence" onChange={onParamChange} {...sliderProps('pad2Presence')} />
                  </div>
                </div>

                {/* ─── Mod Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Mod Envelope
                    <button
                      className={`sc-toggle-btn small${state.pad2ModEnvEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('pad2ModEnvEnabled' as keyof SliderState, !state.pad2ModEnvEnabled)}
                      {...bindHelp('synthModEnvEnable')}
                    >
                      {state.pad2ModEnvEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.pad2ModEnvEnabled && (
                    <>
                      <Select
                        label="Target"
                        value={state.pad2ModEnvDest ?? 'filterCutoff'}
                        options={[
                          { value: 'filterCutoff', label: 'Filter Cutoff' },
                          { value: 'pitch', label: 'Pitch' },
                          { value: 'oscBLevel', label: 'Osc B Level' },
                          { value: 'foldAmount', label: 'Fold' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2ModEnvDest' as keyof SliderState, v)}
                        {...bindHelp('synthModEnvTarget')}
                      />
                      <Slider label="Depth" value={state.pad2ModEnvDepth ?? 0} paramKey="pad2ModEnvDepth" onChange={onParamChange} {...sliderProps('pad2ModEnvDepth')} />
                      <div className="sc-compact-grid-4">
                        <Slider label="Attack" value={state.pad2ModEnvAttack ?? 0.1} paramKey="pad2ModEnvAttack" unit="s" onChange={onParamChange} {...sliderProps('pad2ModEnvAttack')} />
                        <Slider label="Decay" value={state.pad2ModEnvDecay ?? 0.3} paramKey="pad2ModEnvDecay" unit="s" onChange={onParamChange} {...sliderProps('pad2ModEnvDecay')} />
                        <Slider label="Sustain" value={state.pad2ModEnvSustain ?? 0} paramKey="pad2ModEnvSustain" onChange={onParamChange} {...sliderProps('pad2ModEnvSustain')} />
                        <Slider label="Release" value={state.pad2ModEnvRelease ?? 0.5} paramKey="pad2ModEnvRelease" unit="s" onChange={onParamChange} {...sliderProps('pad2ModEnvRelease')} />
                      </div>
                    </>
                  )}
                </div>

                {/* ─── Filter B ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Filter B
                    <button
                      className={`sc-toggle-btn small${state.pad2FilterBEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('pad2FilterBEnabled' as keyof SliderState, !state.pad2FilterBEnabled)}
                    >
                      {state.pad2FilterBEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.pad2FilterBEnabled && (
                    <>
                      <Select
                        label="Type"
                        value={state.pad2FilterBType ?? 'highpass'}
                        options={[
                          { value: 'lowpass', label: 'Lowpass' },
                          { value: 'bandpass', label: 'Bandpass' },
                          { value: 'highpass', label: 'Highpass' },
                          { value: 'notch', label: 'Notch' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2FilterBType' as keyof SliderState, v)}
                      />
                      <div className="sc-compact-grid-2">
                        <Slider label="Cutoff" value={state.pad2FilterBCutoff ?? 200} paramKey="pad2FilterBCutoff" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2FilterBCutoff')} />
                        <Slider label="Res" value={state.pad2FilterBResonance ?? 0.2} paramKey="pad2FilterBResonance" onChange={onParamChange} {...sliderProps('pad2FilterBResonance')} />
                      </div>
                      <Slider label="Q" value={state.pad2FilterBQ ?? 1} paramKey="pad2FilterBQ" onChange={onParamChange} {...sliderProps('pad2FilterBQ')} />
                    </>
                  )}
                </div>

                {/* ─── Filter Routing ─── */}
                {state.pad2FilterBEnabled && (
                  <div className="sc-advanced-section">
                    <div className="sc-section-label">Routing</div>
                    <Select
                      label="Mode"
                      value={state.pad2FilterRouting ?? 'series'}
                      options={[
                        { value: 'series', label: 'Series (A → B)' },
                        { value: 'aOnly', label: 'A Only' },
                        { value: 'bOnly', label: 'B Only' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2FilterRouting' as keyof SliderState, v)}
                      {...bindHelp('synthFilterRoutingMode')}
                    />
                  </div>
                )}

                {/* ─── Octave ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Octave</div>
                  <div className="octave-row">
                    {[-2, -1, 0, 1, 2].map(oct => (
                      <button
                        key={oct}
                        className={`octave-btn ${state.pad2Octave === oct ? 'active' : ''}`}
                        onClick={() => onParamChange('pad2Octave', oct)}
                      >
                        {oct === 0 ? '0' : (oct > 0 ? `+${oct}` : oct)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </>)}
          </div>

          {/* ── Lead 1 Card ── */}
          <div className={`synth-card${editingSection === 'lead1' ? ' editing' : ''}`} style={{ '--sc': '#f59e0b' } as React.CSSProperties}>
            <div className="synth-card-header">
              <span className="sc-name">Lead 1</span>
              <button
                className={`sc-enable-btn${state.leadEnabled ? ' on' : ''}`}
                onClick={() => onSelectChange('leadEnabled' as keyof SliderState, !state.leadEnabled)}
              >
                {state.leadEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                className={`sc-edit-btn${editingSection === 'lead1' ? ' active' : ''}`}
                onClick={() => toggleEdit('lead1')}
                title={editingSection === 'lead1' ? 'Close advanced' : 'Advanced parameters'}
                {...bindHelp('synthLeadEdit')}
              >
                {'\u270E'}
              </button>
            </div>

            <div className="synth-card-simple">
              {/* Preset A / Morph / B — single row */}
              <div className="sc-morph-row">
                <span className="sc-morph-tag" style={{ color: '#f59e0b' }}>A</span>
                <div className="sc-preset-slot">
                  <select
                    value={state.lead1PresetA}
                    onChange={(e) => onSelectChange('lead1PresetA' as keyof SliderState, e.target.value)}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(245,158,11,0.3)' }}
                  >
                    {renderLeadPresetOptions(leadPresetOptions)}
                  </select>
                </div>
                <div className="sc-morph-slider">
                  <Slider label="" value={state.lead1Morph} paramKey="lead1Morph" onChange={onParamChange} {...sliderProps('lead1Morph')} />
                </div>
                <div className="sc-preset-slot">
                  <select
                    value={state.lead1PresetB}
                    onChange={(e) => onSelectChange('lead1PresetB' as keyof SliderState, e.target.value)}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(139,92,246,0.3)' }}
                  >
                    {renderLeadPresetOptions(leadPresetOptions)}
                  </select>
                </div>
                <span className="sc-morph-tag" style={{ color: '#8b5cf6' }}>B</span>
              </div>

              {/* ADSR */}
              {renderLeadAdsr(1)}
            </div>

            {/* Advanced */}
            {editingSection === 'lead1' && (
              <div className="synth-card-advanced">
                {/* Random walk */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <button
                    onClick={() => onSelectChange('lead1MorphAuto' as keyof SliderState, !state.lead1MorphAuto)}
                    style={{
                      padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      fontSize: '0.7rem', fontWeight: 'bold',
                      background: state.lead1MorphAuto ? 'linear-gradient(135deg, #f59e0b, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                      color: state.lead1MorphAuto ? '#fff' : '#888',
                    }}
                  >
                    {state.lead1MorphAuto ? '\u25CF Random Walk' : '\u25CB Random Walk'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.lead1MorphSpeed} paramKey="lead1MorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('lead1MorphSpeed')} />
                  </div>
                </div>

                {/* Algorithm mode */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#888' }}>Algorithm:</span>
                  <button
                    onClick={() => onSelectChange('lead1AlgorithmMode' as keyof SliderState, state.lead1AlgorithmMode === 'snap' ? 'presetA' : 'snap')}
                    style={{
                      padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                      background: state.lead1AlgorithmMode === 'snap' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)',
                      color: state.lead1AlgorithmMode === 'snap' ? '#f59e0b' : '#8b5cf6',
                    }}
                  >
                    {state.lead1AlgorithmMode === 'snap' ? 'Snap @ 50%' : 'Always A'}
                  </button>
                </div>

                <Slider label="Lead 1 Level" value={state.lead1Level} paramKey="lead1Level" onChange={onParamChange} {...sliderProps('lead1Level')} />

                {/* Hold Time (shared) */}
                <Slider label="Hold Time" value={state.lead1Hold} paramKey="lead1Hold" unit="s" onChange={onParamChange} {...sliderProps('lead1Hold')} />

                {/* Expression */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Expression (per note)</div>
                  <Slider label="Vibrato Depth" value={state.leadVibratoDepth} paramKey="leadVibratoDepth" unit=" st" onChange={onParamChange} {...sliderProps('leadVibratoDepth')} />
                  <Slider label="Vibrato Rate" value={state.leadVibratoRate} paramKey="leadVibratoRate" unit=" Hz" onChange={onParamChange} {...sliderProps('leadVibratoRate')} />
                  <Slider label="Glide" value={state.leadGlide} paramKey="leadGlide" onChange={onParamChange} {...sliderProps('leadGlide')} />
                </div>

                {/* Delay */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Delay A</div>
                  <Slider label="Delay A Send" value={state.lead1DelayASend} paramKey="lead1DelayASend" onChange={onParamChange} {...sliderProps('lead1DelayASend')} />
                  <Slider label="Left Division" value={getSliderNumericValue('drumDelayNoteL', state.drumDelayNoteL) ?? 0} paramKey="drumDelayNoteL" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteL', value)} {...sliderProps('drumDelayNoteL')} />
                  <Slider label="Right Division" value={getSliderNumericValue('drumDelayNoteR', state.drumDelayNoteR) ?? 0} paramKey="drumDelayNoteR" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteR', value)} {...sliderProps('drumDelayNoteR')} />
                  <Slider label="Delay Feedback" value={state.delayAFeedback} paramKey="delayAFeedback" onChange={onParamChange} {...sliderProps('delayAFeedback')} />
                  <Slider label="Delay Mix" value={state.delayAMix} paramKey="delayAMix" onChange={onParamChange} {...sliderProps('delayAMix')} />
                  <Slider label="Delay Filter" value={state.delayAFilter} paramKey="delayAFilter" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('delayAFilter')} />
                </div>
              </div>
            )}
          </div>

          {/* ── Lead 2 Card ── */}
          <div className={`synth-card${editingSection === 'lead2' ? ' editing' : ''}`} style={{ '--sc': '#06b6d4' } as React.CSSProperties}>
            <div className="synth-card-header">
              <span className="sc-name">Lead 2</span>
              <button
                className={`sc-enable-btn${state.lead2Enabled ? ' on' : ''}`}
                onClick={() => onSelectChange('lead2Enabled' as keyof SliderState, !state.lead2Enabled)}
              >
                {state.lead2Enabled ? 'ON' : 'OFF'}
              </button>
              <button
                className={`sc-edit-btn${editingSection === 'lead2' ? ' active' : ''}`}
                onClick={() => toggleEdit('lead2')}
                title={editingSection === 'lead2' ? 'Close advanced' : 'Advanced parameters'}
                {...bindHelp('synthLeadEdit')}
              >
                {'\u270E'}
              </button>
            </div>

            {state.lead2Enabled && (
              <div className="synth-card-simple">
                {/* Preset C / Morph / D — single row */}
                <div className="sc-morph-row">
                  <span className="sc-morph-tag" style={{ color: '#06b6d4' }}>C</span>
                  <div className="sc-preset-slot">
                    <select
                      value={state.lead2PresetC}
                      onChange={(e) => onSelectChange('lead2PresetC' as keyof SliderState, e.target.value)}
                      className="sc-preset-select"
                      style={{ borderColor: 'rgba(6,182,212,0.3)' }}
                    >
                      {renderLeadPresetOptions(leadPresetOptions)}
                    </select>
                  </div>
                  <div className="sc-morph-slider">
                    <Slider label="" value={state.lead2Morph} paramKey="lead2Morph" onChange={onParamChange} {...sliderProps('lead2Morph')} />
                  </div>
                  <div className="sc-preset-slot">
                    <select
                      value={state.lead2PresetD}
                      onChange={(e) => onSelectChange('lead2PresetD' as keyof SliderState, e.target.value)}
                      className="sc-preset-select"
                      style={{ borderColor: 'rgba(167,139,250,0.3)' }}
                    >
                      {renderLeadPresetOptions(leadPresetOptions)}
                    </select>
                  </div>
                  <span className="sc-morph-tag" style={{ color: '#a78bfa' }}>D</span>
                </div>

                {/* ADSR */}
                {renderLeadAdsr(2)}
              </div>
            )}

            {/* Advanced */}
            {editingSection === 'lead2' && state.lead2Enabled && (
              <div className="synth-card-advanced">
                {/* Random walk */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <button
                    onClick={() => onSelectChange('lead2MorphAuto' as keyof SliderState, !state.lead2MorphAuto)}
                    style={{
                      padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      fontSize: '0.7rem', fontWeight: 'bold',
                      background: state.lead2MorphAuto ? 'linear-gradient(135deg, #06b6d4, #a78bfa)' : 'rgba(255,255,255,0.1)',
                      color: state.lead2MorphAuto ? '#fff' : '#888',
                    }}
                  >
                    {state.lead2MorphAuto ? '\u25CF Random Walk' : '\u25CB Random Walk'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.lead2MorphSpeed} paramKey="lead2MorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('lead2MorphSpeed')} />
                  </div>
                </div>

                {/* Algorithm mode */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#888' }}>Algorithm:</span>
                  <button
                    onClick={() => onSelectChange('lead2AlgorithmMode' as keyof SliderState, state.lead2AlgorithmMode === 'snap' ? 'presetA' : 'snap')}
                    style={{
                      padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                      background: state.lead2AlgorithmMode === 'snap' ? 'rgba(6,182,212,0.2)' : 'rgba(167,139,250,0.2)',
                      color: state.lead2AlgorithmMode === 'snap' ? '#06b6d4' : '#a78bfa',
                    }}
                  >
                    {state.lead2AlgorithmMode === 'snap' ? 'Snap @ 50%' : 'Always C'}
                  </button>
                </div>

                <Slider label="Lead 2 Level" value={state.lead2Level} paramKey="lead2Level" onChange={onParamChange} {...sliderProps('lead2Level')} />

                {/* Expression */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Expression (per note)</div>
                  <Slider label="Vibrato Depth" value={state.leadVibratoDepth} paramKey="leadVibratoDepth" unit=" st" onChange={onParamChange} {...sliderProps('leadVibratoDepth')} />
                  <Slider label="Vibrato Rate" value={state.leadVibratoRate} paramKey="leadVibratoRate" unit=" Hz" onChange={onParamChange} {...sliderProps('leadVibratoRate')} />
                  <Slider label="Glide" value={state.leadGlide} paramKey="leadGlide" onChange={onParamChange} {...sliderProps('leadGlide')} />
                </div>

                {/* Delay */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Delay A</div>
                  <Slider label="Delay A Send" value={state.lead2DelayASend} paramKey="lead2DelayASend" onChange={onParamChange} {...sliderProps('lead2DelayASend')} />
                  <Slider label="Left Division" value={getSliderNumericValue('drumDelayNoteL', state.drumDelayNoteL) ?? 0} paramKey="drumDelayNoteL" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteL', value)} {...sliderProps('drumDelayNoteL')} />
                  <Slider label="Right Division" value={getSliderNumericValue('drumDelayNoteR', state.drumDelayNoteR) ?? 0} paramKey="drumDelayNoteR" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteR', value)} {...sliderProps('drumDelayNoteR')} />
                  <Slider label="Delay Feedback" value={state.delayAFeedback} paramKey="delayAFeedback" onChange={onParamChange} {...sliderProps('delayAFeedback')} />
                  <Slider label="Delay Mix" value={state.delayAMix} paramKey="delayAMix" onChange={onParamChange} {...sliderProps('delayAMix')} />
                  <Slider label="Delay Filter" value={state.delayAFilter} paramKey="delayAFilter" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('delayAFilter')} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ════════ RIGHT: Sequencer Panel ════════ */}
        <div className="sequencer-panel">
          {/* ── Transport bar ── */}
          <div className="seq-transport">
            <button
              className={`seq-play-btn${state.synthEuclideanMasterEnabled ? ' playing' : ''}`}
              onClick={() => {
                const next = !state.synthEuclideanMasterEnabled;
                if (next && !state.leadEnabled) {
                  onSelectChange('leadEnabled' as keyof SliderState, true);
                }
                if (next && !state.padEnabled) {
                  onSelectChange('padEnabled' as keyof SliderState, true);
                }
                onSelectChange('synthEuclideanMasterEnabled' as keyof SliderState, next);
              }}
              {...bindHelp('synthSeqPlayToggle')}
            >
              {state.synthEuclideanMasterEnabled ? '\u25A0' : '\u25B6'}
            </button>
            <DragNumber
              value={state.sequencerMasterBPM as number}
              min={40}
              max={300}
              label="BPM"
              onChange={setSharedSequencerBpm}
            />
            <div className="seq-view-toggle">
              <button
                className={`seq-view-btn${seq.viewMode === 'simple' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('simple')}
                {...bindHelp('synthSeqViewSimple')}
              >
                Simple
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'detail' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('detail')}
                {...bindHelp('synthSeqViewDetail')}
              >
                Detail
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'overview' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('overview')}
                {...bindHelp('synthSeqViewOverview')}
              >
                Overview
              </button>
            </div>
          </div>

          {/* Sequencer Preset (L1 synthEuclidean) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', marginBottom: 4, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Pattern</span>
            <PresetDropdown
              level="engine"
              scope="synthEuclidean"
              state={state}
              currentName={euclidPresetName}
              onLoad={handleEuclidPresetLoad}
              onStateChange={onStateChange}
              showSaveButton={false}
              compact
            />
          </div>

          {/* ══════ SIMPLE MODE ══════ */}
          {seq.viewMode === 'simple' && (
            <div className="synth-simple-seq">
              {/* ── Pad Synth Chord Sequencer ── */}
              <div className="synth-simple-section">
                <div className="synth-simple-header">
                  <span>Pad — Chord Sequencer</span>
                  <button
                    className={`synth-simple-enable${state.synthChordSequencerEnabled !== false ? ' on' : ''}`}
                    onClick={() => onSelectChange('synthChordSequencerEnabled' as keyof SliderState, !state.synthChordSequencerEnabled)}
                  >
                    {state.synthChordSequencerEnabled !== false ? 'ON' : 'OFF'}
                  </button>
                </div>
                <Slider label="Chord Rate" value={state.chordRate} paramKey="chordRate" unit="s" onChange={onParamChange} {...sliderProps('chordRate')} />
                <Slider label="Voicing Spread" value={state.voicingSpread} paramKey="voicingSpread" onChange={onParamChange} {...sliderProps('voicingSpread')} />
                <Slider label="Wave Spread" value={state.waveSpread} paramKey="waveSpread" onChange={onParamChange} {...sliderProps('waveSpread')} />
                <div style={{ position: 'relative', height: '14px', marginTop: '-4px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5rem', color: '#666', padding: '0 2px' }}>
                    <span>0</span>
                    <span style={{ position: 'absolute', left: '6.25%', transform: 'translateX(-50%)' }}>1/16</span>
                    <span style={{ position: 'absolute', left: '12.5%', transform: 'translateX(-50%)' }}>⅛</span>
                    <span style={{ position: 'absolute', left: '25%', transform: 'translateX(-50%)' }}>¼</span>
                    <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>½</span>
                    <span style={{ position: 'absolute', right: 0 }}>1</span>
                  </div>
                </div>
                <Slider label="Detune" value={state.detune} paramKey="detune" unit={'\u00A2'} onChange={onParamChange} {...sliderProps('detune')} />

                {/* Voice Mask */}
                <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Voice Mask</span>
                    <span style={{ fontSize: '0.6rem', color: '#888' }}>
                      {[1, 2, 3, 4, 5, 6].filter(v => (state.synthVoiceMask || 63) & (1 << (v - 1))).join(' ')}
                    </span>
                  </div>
                  <div className="voice-mask-row">
                    {[1, 2, 3, 4, 5, 6].map(voice => {
                      const bit = 1 << (voice - 1);
                      const isEnabled = ((state.synthVoiceMask || 63) & bit) !== 0;
                      return (
                        <button
                          key={voice}
                          className={`voice-mask-btn ${isEnabled ? 'active' : ''}`}
                          onClick={() => {
                            const currentMask = state.synthVoiceMask || 63;
                            let newMask = currentMask ^ bit;
                            if (newMask === 0) newMask = bit;
                            onParamChange('synthVoiceMask', newMask);
                          }}
                          style={isEnabled ? {
                            background: `linear-gradient(135deg, hsl(${210 + voice * 25}, 60%, 35%), hsl(${210 + voice * 25}, 60%, 25%))`,
                            borderColor: `hsl(${210 + voice * 25}, 60%, 50%)`,
                          } : undefined}
                          title={`Voice ${voice}`}
                          {...bindHelp('synthVoiceMaskToggle', { label: `Voice ${voice}` })}
                        >
                          {voice}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Synth Octave */}
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Octave</span>
                    <span style={{ fontSize: '0.65rem', color: '#888' }}>
                      {state.synthOctave === 0 ? '0' : (state.synthOctave > 0 ? `+${state.synthOctave}` : state.synthOctave)}
                    </span>
                  </div>
                  <div className="octave-row">
                    {[-2, -1, 0, 1, 2].map(oct => (
                      <button
                        key={oct}
                        className={`octave-btn ${state.synthOctave === oct ? 'active' : ''}`}
                        onClick={() => onParamChange('synthOctave', oct)}
                      >
                        {oct === 0 ? '0' : (oct > 0 ? `+${oct}` : oct)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Lead Synth Random Timing ── */}
              <div className="synth-simple-section">
                <div className="synth-simple-header">
                  <span>Lead — Random Timing</span>
                  <button
                    className={`synth-simple-enable${state.leadRandomEnabled ? ' on' : ''}`}
                    onClick={() => onSelectChange('leadRandomEnabled' as keyof SliderState, !state.leadRandomEnabled)}
                  >
                    {state.leadRandomEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <Slider label="Note Density" value={state.lead1Density} paramKey="lead1Density" unit="/phrase" onChange={onParamChange} {...sliderProps('lead1Density')} />
                <Slider label="Octave Offset" value={state.lead1Octave} paramKey="lead1Octave" onChange={onParamChange} {...sliderProps('lead1Octave')} />
                <Slider label="Octave Range" value={state.lead1OctaveRange} paramKey="lead1OctaveRange" unit=" oct" onChange={onParamChange} {...sliderProps('lead1OctaveRange')} />
                <div style={{ fontSize: '0.6rem', color: '#666', marginTop: '4px' }}>
                  Controls random lead melody timing when Euclidean mode is OFF
                </div>
              </div>
            </div>
          )}

          {/* ══════ DETAIL MODE ══════ */}
          {seq.viewMode === 'detail' && (
            <div>
              {/* Tab bar */}
              <div className="seq-tab-bar">
                {seq.sequencerModels.map((seqModel, idx) => (
                  <div
                    key={seqModel.id}
                    className={`seq-tab${idx === seq.activeTab ? ' active' : ''}${seqModel.muted ? ' muted' : ''}`}
                    style={{ '--sc': seqModel.color } as React.CSSProperties}
                    onClick={() => seq.setActiveTab(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <span>{seqModel.name}</span>
                    <div className="seq-tab-ms">
                      <button
                        className={`mute-btn${seqModel.muted ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleMute(idx); }}
                      >M</button>
                      <button
                        className={`solo-btn${seqModel.solo ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleSolo(idx); }}
                      >S</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Seq body */}
              <div className="seq-body" style={{ '--sc': activeSeq.color } as React.CSSProperties}>

                {/* ── Source selector + per-seq controls ── */}
                <div className="seq-sources">
                  {/* Single source dropdown */}
                  <label className="synth-source-label">
                    Source
                    <select
                      className="synth-source-select"
                      value={(state[getSourceKey(seq.activeTab)] as string) ?? 'lead1'}
                      onChange={(e) => onSelectChange(getSourceKey(seq.activeTab), e.target.value)}
                      {...bindHelp('synthSeqSourceSelect')}
                      style={{
                        borderColor: getSourceColor((state[getSourceKey(seq.activeTab)] as string) ?? 'lead1') + '60',
                        color: getSourceColor((state[getSourceKey(seq.activeTab)] as string) ?? 'lead1'),
                      }}
                    >
                      {SYNTH_SOURCES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </label>

                  {/* Per-seq controls */}
                  <div className="seq-per-controls">
                    <label className="seq-clock-label">
                      Clock
                      <select
                        className="seq-clock-select"
                        value={seq.clockDivs[seq.activeTab]}
                        onChange={(e) => seq.setClockDiv(seq.activeTab, e.target.value as any)}
                        {...bindHelp('synthSeqClockSelect')}
                      >
                        <option value="1/4">1/4</option>
                        <option value="1/8">1/8</option>
                        <option value="1/16">1/16</option>
                        <option value="1/8T">1/8T</option>
                      </select>
                    </label>
                    <label className="seq-swing-label">
                      Swing
                      <input
                        type="range"
                        className="seq-swing-range"
                        min={0}
                        max={0.75}
                        step={0.05}
                        value={seq.swings[seq.activeTab] ?? 0}
                        onChange={(e) => seq.setSwing(seq.activeTab, parseFloat(e.target.value))}
                      />
                      <span className="seq-swing-val">{Math.round((seq.swings[seq.activeTab] ?? 0) * 100)}%</span>
                    </label>
                    <button
                      className={`seq-link-btn${seq.linked[seq.activeTab] ? ' on' : ''}`}
                      onClick={() => seq.toggleLinked(seq.activeTab)}
                      title={seq.linked[seq.activeTab] ? 'Sub-lanes linked to trigger steps' : 'Sub-lanes use independent step counts'}
                      {...bindHelp('synthSeqLink')}
                    >
                      Link
                    </button>
                    <button
                      className={`seq-evolve-btn${seq.evolveConfigs[seq.activeTab]?.enabled ? ' on' : ''}`}
                      onClick={() => {
                        seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                          idx === seq.activeTab ? { ...cfg, enabled: !cfg.enabled } : cfg
                        )));
                      }}
                      {...bindHelp('synthSeqEvolve')}
                    >
                      Evolve
                    </button>
                  </div>
                </div>

                {/* Evolution panel */}
                <div className={`seq-evolve-panel${seq.evolveConfigs[seq.activeTab]?.enabled ? ' open' : ''}`}>
                  <div className="seq-evolve-row">
                    <DragNumber
                      value={seq.evolveConfigs[seq.activeTab]?.everyBars ?? 4}
                      min={1}
                      max={32}
                      label="Every"
                      onChange={(v) => {
                        seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                          idx === seq.activeTab ? { ...cfg, everyBars: v } : cfg
                        )));
                      }}
                    />
                    <span className="seq-drag-num-label">bars</span>
                    <div className="seq-evolve-zone-wrap">
                      <label>
                        Evolution
                        <input
                          type="range" min={0} max={100} step={5}
                          value={Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}
                          onChange={(e) => {
                            const evolution = parseInt(e.target.value, 10) / 100;
                            seq.setEvolveConfigs(prev => prev.map((cfg, idx) => {
                              if (idx !== seq.activeTab) return cfg;
                              const pct = evolution * 100;
                              const methods: Record<string, boolean> = {
                                swingDrift: true,
                                probDrift: pct > 30,
                                ratchetSpray: pct > 60,
                                pitchWalk: true,
                                valueDrift: true,
                                valueScramble: pct > 40,
                                valueWiden: pct > 60,
                                subLaneLengthDrift: pct > 50,
                                subLaneDirectionFlip: pct > 80,
                                triggerToggle: pct > 50,
                              };
                              return { ...cfg, evolution, methods };
                            }));
                          }}
                        />
                        <span>{Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}%</span>
                      </label>
                      {(() => {
                        const pct = Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100);
                        return (
                          <div className="seq-evolve-methods">
                            <span className="seq-evolve-method on">Swing</span>
                            <span className="seq-evolve-method on">Pitch</span>
                            <span className="seq-evolve-method on">Drift</span>
                            <span className={`seq-evolve-method${pct > 30 ? ' on-t' : ''}`}>Probability</span>
                            <span className={`seq-evolve-method${pct > 40 ? ' on-t' : ''}`}>Scramble</span>
                            <span className={`seq-evolve-method${pct > 50 ? ' on-t' : ''}`}>Triggers</span>
                            <span className={`seq-evolve-method${pct > 50 ? ' on-t' : ''}`}>Length</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Ratchet</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Widen</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Direction</span>
                          </div>
                        );
                      })()}
                    </div>
                    <button className="seq-evolve-reset" onClick={() => resetEvolveHome?.(seq.activeTab)}>Reset</button>
                    {diceLane && (
                      <span className="seq-dice-group">
                        <input type="range" className="seq-dice-slider" min={0} max={100} value={Math.round(diceIntensity * 100)} onChange={e => setDiceIntensity(Number(e.target.value) / 100)} title={`Dice intensity: ${Math.round(diceIntensity * 100)}%`} />
                        <button className="seq-evolve-dice" onClick={() => diceLane(seq.activeTab, diceIntensity)} title="Randomize lane">&#x1F3B2;</button>
                      </span>
                    )}
                  </div>
                  <button
                    className="seq-evolve-advanced-toggle"
                    onClick={() => setShowAdvanced(v => !v)}
                    {...bindHelp('synthSeqEvolveAdvanced')}
                  >
                    {showAdvanced ? '▾' : '▸'} Advanced
                  </button>
                  <div className={`seq-evolve-advanced-body${showAdvanced ? ' open' : ''}`}>
                    <div className="seq-evolve-advanced-row">
                      <label>Write Offset</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'auto' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 'auto' } : cfg))}
                          {...bindHelp('synthSeqWriteOffsetAuto')}
                        >Auto</button>
                        <button
                          className={`seq-evolve-mode-btn${typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 0 } : cfg))}
                          {...bindHelp('synthSeqWriteOffsetManual')}
                        >Manual</button>
                      </span>
                      {typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' && (
                        <input
                          type="range" min={0} max={Math.max(1, (activeSeq?.trigger?.steps ?? 16) - 1)} step={1}
                          value={seq.evolveConfigs[seq.activeTab]?.writeOffset as number}
                          onChange={(e) => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: parseInt(e.target.value, 10) } : cfg))}
                        />
                      )}
                    </div>
                    <div className="seq-evolve-advanced-row">
                      <label>Mutation</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'biased' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'biased' } : cfg))}
                          {...bindHelp('synthSeqMutationBiased')}
                        >Biased</button>
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'strict' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'strict' } : cfg))}
                          {...bindHelp('synthSeqMutationStrict')}
                        >Strict</button>
                      </span>
                    </div>
                    <div className="seq-evolve-sublanes">
                      {(['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'] as const).map((sl) => {
                        const enabled = seq.evolveConfigs[seq.activeTab]?.enabledSubLanes;
                        const isOn = !enabled || enabled.includes(sl);
                        return (
                          <label key={sl}>
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => {
                                seq.setEvolveConfigs(prev => prev.map((cfg, idx) => {
                                  if (idx !== seq.activeTab) return cfg;
                                  const current = cfg.enabledSubLanes ?? ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'];
                                  const next = isOn ? current.filter(s => s !== sl) : [...current, sl];
                                  return { ...cfg, enabledSubLanes: next };
                                }));
                              }}
                            />
                            {sl}
                          </label>
                        );
                      })}
                    </div>
                    <div className="seq-evolve-checks">
                      {Object.keys(seq.evolveConfigs[seq.activeTab]?.methods ?? {}).map((method) => (
                        <label key={method}>
                          <input
                            type="checkbox"
                            checked={!!seq.evolveConfigs[seq.activeTab]?.methods[method]}
                            onChange={() => {
                              seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                                idx === seq.activeTab
                                  ? { ...cfg, methods: { ...cfg.methods, [method]: !cfg.methods[method] } }
                                  : cfg
                              )));
                            }}
                          />
                          {method}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── TRIGGER LANE ── */}
                <div className="seq-trigger-always">
                  <div className="seq-lane-header">
                    <button
                      className={`seq-lane-enable-btn trigger-toggle${!activeSeq.muted ? ' on' : ''}`}
                      style={!activeSeq.muted ? { background: activeSeq.color, color: '#000' } as React.CSSProperties : undefined}
                      onClick={() => seq.toggleMute(seq.activeTab)}
                    >
                      {activeSeq.muted ? 'Off' : 'On'}
                    </button>
                    <div className="seq-lane-controls">
                      <DragNumber
                        value={activeSeq.trigger.steps}
                        min={2}
                        max={16}
                        label="Steps"
                        shapeByDrag
                        onChange={(v) => seq.setParam(seq.activeTab, 'Steps', v)}
                      />
                      <DragNumber
                        value={activeSeq.trigger.hits}
                        min={0}
                        max={activeSeq.trigger.steps}
                        label="Hits"
                        onChange={(v) => seq.setParam(seq.activeTab, 'Hits', v)}
                      />
                      <div className="seq-rotation-control">
                        <button onClick={() => seq.setParam(seq.activeTab, 'Rotation', activeSeq.trigger.rotation - 1)}>{'\u2190'}</button>
                        <span className="seq-rotation-val">{activeSeq.trigger.rotation}</span>
                        <button onClick={() => seq.setParam(seq.activeTab, 'Rotation', activeSeq.trigger.rotation + 1)}>{'\u2192'}</button>
                      </div>
                      <select
                        className="seq-preset-select"
                        value={seq.getParam(seq.activeTab, 'Preset') as string}
                        onChange={(e) => seq.setParamSelect(seq.activeTab, 'Preset', e.target.value as any)}
                        {...bindHelp('synthSeqTriggerPreset')}
                      >
                        {seq.presetNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <SeqLane
                    sequencer={activeSeq}
                    lane="trigger"
                    color={activeSeq.color}
                    playhead={seq.playheads[seq.activeTab] ?? 0}
                    hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                    onToggleTriggerStep={(step) => seq.toggleTriggerStep(seq.activeTab, step)}
                    onSetProbability={(step, value) => seq.setStepProbability(seq.activeTab, step, value)}
                    onResetProbability={(step) => seq.resetStepProbability(seq.activeTab, step)}
                    onCycleRatchet={(step) => seq.cycleStepRatchet(seq.activeTab, step)}
                    onCycleTrigCondition={(step) => seq.cycleTrigCondition(seq.activeTab, step)}
                  />
                </div>

                {/* ── Sub-lane sparklines: pitch, expression, morph (no distance) ── */}
                <div className="seq-spark-container">
                  {(['pitch', 'expression', 'morph'] as const).map((laneKind) => {
                    const subState = seq.subLaneStates[seq.activeTab]?.[laneKind];
                    const laneColor = laneKind === 'pitch' ? '#ff6b81'
                      : laneKind === 'expression' ? '#ffa502'
                      : '#c084fc';

                    const noteMinKey = `synthEuclid${seq.activeTab + 1}NoteMin` as keyof SliderState;
                    const noteMaxKey = `synthEuclid${seq.activeTab + 1}NoteMax` as keyof SliderState;

                    return (
                      <React.Fragment key={laneKind}>
                        <SeqSparkline
                          label={`${laneKind.charAt(0).toUpperCase()}:`}
                          steps={subState?.steps ?? 5}
                          values={
                            laneKind === 'pitch'
                              ? activeSeq.pitch.offsets.map(off =>
                                  activeSeq.pitch.mode === 'notes'
                                    ? Math.min(1, off / 14)
                                    : activeSeq.pitch.mode === 'noteRange'
                                      ? 0.5
                                      : (off + 24) / 48
                                )
                              : laneKind === 'expression'
                                ? activeSeq.expression.velocities
                                : activeSeq.morph.values
                          }
                          color={laneColor}
                          playhead={seq.playheads[seq.activeTab]}
                          hitCount={seq.hitCounts[seq.activeTab]}
                          direction={subState?.direction ?? 'forward'}
                          bipolar={
                            laneKind === 'morph' ||
                            (laneKind === 'pitch' && activeSeq.pitch.mode !== 'notes' && activeSeq.pitch.mode !== 'noteRange')
                          }
                          invertFill={laneKind === 'expression'}
                          enabled={subState?.enabled ?? false}
                          expanded={seq.openLane === laneKind}
                          onClick={() => seq.setOpenLane(seq.openLane === laneKind ? 'trigger' : laneKind)}
                          onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                        />
                        {seq.openLane === laneKind && (
                          <div className="seq-lane-editor-wrap">
                            <SeqLane
                              sequencer={activeSeq}
                              lane={laneKind}
                              color={laneColor}
                              playhead={seq.playheads[seq.activeTab] ?? 0}
                              hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                              enabled={subState?.enabled ?? false}
                              direction={subState?.direction ?? 'forward'}
                              onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                              onChangeSteps={(v) => seq.setSubLaneSteps(seq.activeTab, laneKind, v)}
                              onCycleDirection={() => seq.cycleSubLaneDirection(seq.activeTab, laneKind)}
                              onChangeValue={(step, value) => seq.changeStepValue(seq.activeTab, laneKind, step, value)}
                              linked={seq.linked[seq.activeTab]}
                              {...(laneKind === 'expression' ? {
                                onCycleRatchet: (step: number) => seq.cycleStepRatchet(seq.activeTab, step),
                              } : {})}
                              {...(laneKind === 'pitch' ? {
                                onChangePitchMode: (mode) => seq.setPitchMode(seq.activeTab, mode),
                                onChangePitchRoot: (root) => seq.setPitchRoot(seq.activeTab, root),
                                onChangePitchScale: (scale) => seq.setPitchScale(seq.activeTab, scale),
                                pitchNoteMin: state[noteMinKey] as number,
                                pitchNoteMax: state[noteMaxKey] as number,
                                onChangePitchNoteMin: (v: number) => onParamChange(noteMinKey, v),
                                onChangePitchNoteMax: (v: number) => onParamChange(noteMaxKey, v),
                              } : {})}
                            />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Mini overview at bottom */}
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => seq.setActiveTab(idx)}
              />
            </div>
          )}

          {/* ══════ OVERVIEW MODE ══════ */}
          {seq.viewMode === 'overview' && (
            <>
              <div className="seq-overview">
                {seq.sequencerModels.map((seqModel, row) => {
                  const source = (state[getSourceKey(row)] as string) ?? 'lead1';
                  const sourceInfo = SYNTH_SOURCES.find(s => s.value === source);
                  return (
                    <div
                      key={seqModel.id}
                      className={`seq-ov-row${seqModel.muted ? ' muted' : ''}`}
                      style={{ '--sc': seqModel.color } as React.CSSProperties}
                    >
                      <div className="seq-ov-header" onClick={() => { seq.setActiveTab(row); seq.setViewMode('detail'); }}>
                        <span className="seq-ov-name">{seqModel.name}</span>
                        <div className="seq-ov-controls" onClick={(e) => e.stopPropagation()}>
                          <DragNumber
                            value={seqModel.trigger.steps}
                            min={2} max={16} label="S" shapeByDrag
                            onChange={(v) => seq.setParam(row, 'Steps', v)}
                          />
                          <DragNumber
                            value={seqModel.trigger.hits}
                            min={0} max={seqModel.trigger.steps} label="H"
                            onChange={(v) => seq.setParam(row, 'Hits', v)}
                          />
                          <div className="seq-rotation-control seq-ov-rot">
                            <button onClick={() => seq.setParam(row, 'Rotation', seqModel.trigger.rotation - 1)}>{'\u2190'}</button>
                            <span className="seq-rotation-val">{seqModel.trigger.rotation}</span>
                            <button onClick={() => seq.setParam(row, 'Rotation', seqModel.trigger.rotation + 1)}>{'\u2192'}</button>
                          </div>
                          <select
                            className="seq-ov-select"
                            value={(seq.getParam(row, 'Preset') as string) ?? 'custom'}
                            onChange={(e) => seq.setParamSelect(row, 'Preset', e.target.value as any)}
                            {...bindHelp('synthSeqTriggerPreset')}
                          >
                            {seq.presetNames.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                          <select
                            className="seq-ov-select seq-ov-clk"
                            value={seqModel.clockDiv}
                            onChange={(e) => seq.setClockDiv(row, e.target.value as any)}
                            {...bindHelp('synthSeqClockSelect')}
                          >
                            <option value="1/4">1/4</option>
                            <option value="1/8">1/8</option>
                            <option value="1/16">1/16</option>
                            <option value="1/8T">1/8T</option>
                          </select>
                          {/* Source dropdown */}
                          <select
                            className="seq-ov-select synth-ov-source"
                            value={source}
                            onChange={(e) => onSelectChange(getSourceKey(row), e.target.value)}
                            {...bindHelp('synthSeqSourceSelect')}
                            style={{ color: sourceInfo?.color ?? '#888' }}
                          >
                            {SYNTH_SOURCES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                          <button
                            className={`ov-mute-btn${seqModel.muted ? ' on' : ''}`}
                            onClick={(e) => { e.stopPropagation(); seq.toggleMute(row); }}
                          >M</button>
                          <button
                            className={`ov-solo-btn${seqModel.solo ? ' on' : ''}`}
                            onClick={(e) => { e.stopPropagation(); seq.toggleSolo(row); }}
                          >S</button>
                        </div>
                      </div>
                      {/* Trigger grid */}
                      <div className="seq-ov-grid-wrap">
                        {(() => {
                          const maxCells = seqModel.trigger.steps < 9 ? 8 : 16;
                          return (
                            <div className="seq-step-grid" style={{ gridTemplateColumns: `repeat(${maxCells}, 1fr)` }}>
                              {new Array(maxCells).fill(0).map((_, step) => {
                                const inRange = step < seqModel.trigger.steps;
                                const hit = inRange ? (seqModel.trigger.pattern[step] ?? false) : false;
                                const isPlayhead = inRange && ((seq.playheads[row] ?? 0) % seqModel.trigger.steps === step);
                                const prob = inRange ? (seqModel.trigger.probability[step] ?? 1.0) : 1.0;
                                const probPct = Math.round(prob * 100);

                                return (
                                  <div key={step} className="seq-step">
                                    <span className="seq-step-num">{step % 4 === 0 ? step + 1 : ''}</span>
                                    <button
                                      type="button"
                                      className={`seq-step-cell${hit ? ' active' : ''}${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                                      style={{ touchAction: 'none' } as React.CSSProperties}
                                      onPointerDown={inRange ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const el = e.currentTarget;
                                        el.setPointerCapture(e.pointerId);
                                        const startY = e.clientY;
                                        const startProb = prob;
                                        let dragged = false;
                                        const onMove = (ev: PointerEvent) => {
                                          if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                                          if (!dragged) return;
                                          const pct = Math.max(0, Math.min(1,
                                            startProb + (startY - ev.clientY) / OV_PROB_DRAG_PX
                                          ));
                                          const snapped = Math.round(pct * 20) / 20;
                                          seq.setStepProbability(row, step, snapped);
                                          setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(snapped * 100)}%` });
                                        };
                                        const onUp = () => {
                                          el.removeEventListener('pointermove', onMove);
                                          el.removeEventListener('pointerup', onUp);
                                          setDragPopup(null);
                                          if (!dragged) seq.toggleTriggerStep(row, step);
                                        };
                                        el.addEventListener('pointermove', onMove);
                                        el.addEventListener('pointerup', onUp);
                                      } : undefined}
                                      onDoubleClick={inRange ? (e) => {
                                        e.stopPropagation();
                                        seq.resetStepProbability(row, step);
                                      } : undefined}
                                    >
                                      {inRange && (
                                        <div className="prob-fill" style={{ height: `${probPct}%` }} />
                                      )}
                                      {inRange && <span className="prob-label">{probPct}%</span>}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
              {dragPopup && (
                <div className="seq-drag-popup" style={{ left: dragPopup.x, top: dragPopup.y }}>
                  {dragPopup.text}
                </div>
              )}
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => {
                  seq.setActiveTab(idx);
                  seq.setViewMode('detail');
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SynthPage;
