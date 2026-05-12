/**
 * GranularPage — Unified Granular FX UI
 *
 * 4-voice granular-chopper-granular engine with:
 * - Global controls bar (enable, freeze, dry/wet, feedback, preset)
 * - 16-slice buffer visualization with write head + voice position markers
 * - 4 expandable voice cards with mode selection, slice, pitch, grain, LFO controls
 * - Legacy mode support for original granulator compatibility
 *
 * Follows SynthPage/DrumPage pattern: dedicated component with own CSS,
 * receives SliderComponent, sliderProps, onParamChange as props from App.tsx
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SliderState, formatIndexedDelayDivision, getParamInfo, getSliderNumericValue } from '../state';
import type { ClockDivision } from '../../audio/drumSeqTypes';
import type { DynamicsAnalyserKey, DynamicsVisualTelemetrySnapshot } from '../../audio/engine';
import { computeGranularMacroModel } from '../../audio/granularMacroModel';
import { audioEngine } from '../../audio/runtime';
import GranularBufferCanvas from './GranularBufferCanvas';
import type { CanvasVoiceVisual } from './GranularBufferCanvas';
import { useSliderHelp } from '../SliderHelpOverlay';
import { useVisibleInterval } from '../hooks/useVisibleInterval';
import { useRuntimeSliderVersion } from '../runtimeSliderState';
import { PresetDropdown } from '../../presets/PresetDropdown';
import { extractParams } from '../../presets/codec';
import { GRANULAR_VOICE_COLORS } from '../../designSystem/colors';
import type { PresetEntry } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';

import './granular.css';

// ═══════════════ Types ═══════════════

type VoiceMode = 'clean' | 'granular' | 'legacy';
type GranularSpaceMode = 'diffuse' | 'clocked';
type GranularPresetBehavior = 'pure' | 'expressive';
type GranularShape = 'triangle' | 'sawUp' | 'sawDown' | 'square';

interface VoicePrefix {
  enabled: keyof SliderState;
  mode: keyof SliderState;
  slice: keyof SliderState;
  speed: keyof SliderState;
  scanRate: keyof SliderState;
  reverse: keyof SliderState;
  pitch: keyof SliderState;
  attack: keyof SliderState;
  decay: keyof SliderState;
  blur: keyof SliderState;
  grainOct: keyof SliderState;
  spray: keyof SliderState;
  density: keyof SliderState;
  tempoSync: keyof SliderState;
  tempoDiv: keyof SliderState;
  grainSize: keyof SliderState;
  pan: keyof SliderState;
  gain: keyof SliderState;
  posLFORate: keyof SliderState;
  posLFODepth: keyof SliderState;
  panLFORate: keyof SliderState;
  stereoSpread: keyof SliderState;
  reverseLFORate: keyof SliderState;
  writeFollow: keyof SliderState;
  recordLFORate: keyof SliderState;
}

// ═══════════════ Constants ═══════════════

const NUM_SLICES = 16;

const VOICE_COLORS = [...GRANULAR_VOICE_COLORS];
const VOICE_NAMES = ['Voice 1', 'Voice 2', 'Voice 3', 'Voice 4'];
const CLEAN_RATE_OPTIONS = [
  { label: '0.25×', value: 0.25 },
  { label: '0.30×', value: 0.3 },
  { label: '0.50×', value: 0.5 },
  { label: '0.75×', value: 0.75 },
  { label: '1.00×', value: 1.0 },
  { label: '1.50×', value: 1.5 },
  { label: '2.00×', value: 2.0 },
  { label: '3.00×', value: 3.0 },
  { label: '4.00×', value: 4.0 },
];

const GRAIN_CLOCK_OPTIONS: { label: string; value: ClockDivision }[] = [
  { label: '1/4', value: '1/4' },
  { label: '1/8', value: '1/8' },
  { label: '1/16', value: '1/16' },
  { label: '1/32', value: '1/32' },
  { label: '1/64', value: '1/64' },
  { label: '1/8T', value: '1/8T' },
];

const VOICE_KEYS: VoicePrefix[] = [1, 2, 3, 4].map(n => ({
  enabled: `granularV${n}Enabled` as keyof SliderState,
  mode: `granularV${n}Mode` as keyof SliderState,
  slice: `granularV${n}Slice` as keyof SliderState,
  speed: `granularV${n}Speed` as keyof SliderState,
  scanRate: `granularV${n}ScanRate` as keyof SliderState,
  reverse: `granularV${n}Reverse` as keyof SliderState,
  pitch: `granularV${n}Pitch` as keyof SliderState,
  attack: `granularV${n}Attack` as keyof SliderState,
  decay: `granularV${n}Decay` as keyof SliderState,
  blur: `granularV${n}Blur` as keyof SliderState,
  grainOct: `granularV${n}GrainOct` as keyof SliderState,
  spray: `granularV${n}Spray` as keyof SliderState,
  density: `granularV${n}Density` as keyof SliderState,
  tempoSync: `granularV${n}TempoSync` as keyof SliderState,
  tempoDiv: `granularV${n}TempoDiv` as keyof SliderState,
  grainSize: `granularV${n}GrainSize` as keyof SliderState,
  pan: `granularV${n}Pan` as keyof SliderState,
  gain: `granularV${n}Gain` as keyof SliderState,
  posLFORate: `granularV${n}PosLFORate` as keyof SliderState,
  posLFODepth: `granularV${n}PosLFODepth` as keyof SliderState,
  panLFORate: `granularV${n}PanLFORate` as keyof SliderState,
  stereoSpread: `granularV${n}StereoSpread` as keyof SliderState,
  reverseLFORate: `granularV${n}ReverseLFORate` as keyof SliderState,
  writeFollow: `granularV${n}WriteFollow` as keyof SliderState,
  recordLFORate: `granularV${n}RecordLFORate` as keyof SliderState,
}));


// ═══════════════ Props ═══════════════

export interface GranularPageProps {
  state: SliderState;
  isMobile: boolean;
  isRunning: boolean;
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  getDynamicsAnalyser?: (key: DynamicsAnalyserKey) => AnalyserNode | null;
  getDynamicsTelemetry?: () => DynamicsVisualTelemetrySnapshot;
  liveBufferTelemetryAvailable?: boolean;
}

interface BufferRangeSegment {
  left: number;
  width: number;
}

interface BufferVoiceVisual {
  index: number;
  mode: VoiceMode;
  motionMode: 'scan' | 'linear' | null;
  color: string;
  slice: number;
  currentPos: number;
  markerPositions: number[];
  anchorPos: number;
  rangeSegments: BufferRangeSegment[];
  rangeHeight: number;
  rangeOpacity: number;
  bandTopOffset: number;
  summary: string;
  title: string;
  tempoSync: boolean;
  tempoLabel: string | null;
  // Canvas-specific fields for envelope/direction rendering
  attack: number;
  decay: number;
  reverse: boolean;
  speed: number;
  scanRate: number;
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

const wrap01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  let wrapped = value % 1;
  if (wrapped < 0) wrapped += 1;
  return wrapped;
};

const makeWrappedRangeSegments = (start: number, width: number): BufferRangeSegment[] => {
  const safeWidth = clamp01(width);
  if (safeWidth <= 0.0005) return [];
  if (safeWidth >= 0.999) return [{ left: 0, width: 1 }];
  const wrappedStart = wrap01(start);
  const firstWidth = Math.min(safeWidth, 1 - wrappedStart);
  const segments: BufferRangeSegment[] = [{ left: wrappedStart, width: firstWidth }];
  const remaining = safeWidth - firstWidth;
  if (remaining > 0.0005) {
    segments.push({ left: 0, width: remaining });
  }
  return segments;
};

function positionsEqual(left: number[], right: number[], epsilon = 0.002): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (Math.abs((left[index] ?? 0) - (right[index] ?? 0)) > epsilon) return false;
  }
  return true;
}

// ═══════════════ Component ═══════════════

const GranularPage: React.FC<GranularPageProps> = ({
  state,
  isMobile,
  isRunning,
  expandedPanels,
  togglePanel,
  onParamChange,
  onSelectChange,
  onStateChange,
  sliderProps,
  SliderComponent,
  liveBufferTelemetryAvailable = true,
}) => {
  const { announceHelp } = useSliderHelp();
  const spaceMode = state.granularSpaceMode ?? 'clocked';
  const presetBehavior = state.granularPresetBehavior ?? 'expressive';
  const [writeHeadPosition, setWriteHeadPosition] = useState(0);
  const [voicePositions, setVoicePositions] = useState<number[]>([0, 0, 0, 0]);
  const [activeGrainCount, setActiveGrainCount] = useState(0);
  const [bufferWaveform, setBufferWaveform] = useState<Float32Array | null>(null);
  const [visualizerEnabled, setVisualizerEnabled] = useState(() => liveBufferTelemetryAvailable && !isMobile);

  const syncGranularUi = useCallback(() => {
    const nextActiveGrains = audioEngine.getGranularActiveGrainCount();
    setActiveGrainCount(prev => (prev === nextActiveGrains ? prev : nextActiveGrains));

    if (!liveBufferTelemetryAvailable) return;

    const nextWriteHead = audioEngine.getGranularWriteHeadPosition();
    const nextVoicePositions = audioEngine.getGranularVoicePositions();

    setWriteHeadPosition(prev => (Math.abs(prev - nextWriteHead) > 0.002 ? nextWriteHead : prev));
    setVoicePositions(prev => (positionsEqual(prev, nextVoicePositions) ? prev : nextVoicePositions));

    const waveform = audioEngine.getGranularBufferWaveform();
    if (waveform) {
      setBufferWaveform(prev => (prev === waveform ? prev : waveform));
    }
  }, [liveBufferTelemetryAvailable]);

  const granularUiPollMs = useMemo(() => {
    if (activeGrainCount > 0 || state.granularFreeze) return 90;
    if (state.granularEnabled) return 160;
    return 220;
  }, [activeGrainCount, state.granularEnabled, state.granularFreeze]);

  useVisibleInterval(syncGranularUi, granularUiPollMs, {
    enabled: isRunning && (visualizerEnabled || !liveBufferTelemetryAvailable),
  });

  useEffect(() => {
    audioEngine.setGranularUiActive(isRunning && visualizerEnabled && liveBufferTelemetryAvailable);

    if (!isRunning || !visualizerEnabled || !liveBufferTelemetryAvailable) {
      setWriteHeadPosition(prev => (prev === 0 ? prev : 0));
      setVoicePositions(prev => (positionsEqual(prev, [0, 0, 0, 0]) ? prev : [0, 0, 0, 0]));
      if (!isRunning) {
        setActiveGrainCount(prev => (prev === 0 ? prev : 0));
      }
      setBufferWaveform(prev => (prev === null ? prev : null));
      return () => {
        audioEngine.setGranularUiActive(false);
      };
    }
    return () => {
      audioEngine.setGranularUiActive(false);
    };
  }, [isRunning, liveBufferTelemetryAvailable, visualizerEnabled]);

  useEffect(() => {
    if (!liveBufferTelemetryAvailable) {
      setVisualizerEnabled(false);
    }
  }, [liveBufferTelemetryAvailable]);
  const delayBExternallyDriven =
    (state.delayAToBSend ?? 0) > 0.001 ||
    (state.pad1DelayBSend ?? 0) > 0.001 ||
    (state.pad2DelayBSend ?? 0) > 0.001 ||
    (state.lead1DelayBSend ?? 0) > 0.001 ||
    (state.lead2DelayBSend ?? 0) > 0.001 ||
    (state.drumDelayBSend ?? 0) > 0.001 ||
    (state.oceanDelayBSend ?? 0) > 0.001 ||
    (state.waterDelayBSend ?? 0) > 0.001 ||
    (state.insDelayBSend ?? 0) > 0.001;
  const delayBBusFed = delayBExternallyDriven || (state.granularDelayBSend ?? 0) > 0.001;
  const granularShape = state.granularShape ?? 'triangle';
  // ── Scene preset save/load (composite: L1 voices + L2 kit + L3 source) ──
  const GRANULAR_COMPOSITE_SCOPES = [
    { level: 1 as const, scope: 'granularVoice1' },
    { level: 1 as const, scope: 'granularVoice2' },
    { level: 1 as const, scope: 'granularVoice3' },
    { level: 1 as const, scope: 'granularVoice4' },
    { level: 1 as const, scope: 'granularLegacy' },
    { level: 2 as const, scope: 'granularKit' },
    { level: 3 as const, scope: 'granular' },
  ];
  const granularSceneExtract = useMemo<UsePresetsOptions>(() => ({
    customExtract: (s: SliderState) => {
      const combined: Record<string, unknown> = {};
      for (const { level, scope: sc } of GRANULAR_COMPOSITE_SCOPES) {
        Object.assign(combined, extractParams(s, level, sc));
      }
      return combined;
    },
    customApply: (snapshot: SliderState, data: Record<string, unknown>) => {
      const next = { ...snapshot } as Record<string, unknown>;
      for (const [key, value] of Object.entries(data)) {
        if (key in next) next[key] = value;
      }
      return next as unknown as SliderState;
    },
  }), []);
  const [scenePresetName, setScenePresetName] = useState<string | undefined>();
  const [scenePresetDescription, setScenePresetDescription] = useState<string>('');
  const runtimeSliderVersion = useRuntimeSliderVersion();
  const handleScenePresetLoad = useCallback((entry: PresetEntry, _data: Record<string, unknown>) => {
    setScenePresetName(entry.name);
    const currentVersion = entry.versions.find(version => version.v === entry.currentVersion);
    setScenePresetDescription(entry.description ?? currentVersion?.note ?? '');
  }, []);

  // Alias Slider for convenience (it's passed as generic ComponentType)
  const Slider = SliderComponent as React.ComponentType<{
    label: string;
    value: number;
    paramKey: keyof SliderState;
    ghostValue?: number;
    unit?: string;
    logarithmic?: boolean;
    onChange: (key: keyof SliderState, value: number) => void;
    [key: string]: unknown;
  }>;

  const resolveCurrentSliderValue = useCallback((paramKey: keyof SliderState): number => {
    const baseValue = state[paramKey];
    const numericBase = typeof baseValue === 'number' ? baseValue : 0;
    const runtime = sliderProps(paramKey) as {
      mode?: string;
      dualRange?: { min: number; max: number };
      walkPosition?: number;
    };
    if (runtime.mode !== 'walk' && runtime.mode !== 'sampleHold') return numericBase;
    if (!runtime.dualRange || runtime.walkPosition === undefined) return numericBase;
    return runtime.dualRange.min + runtime.walkPosition * (runtime.dualRange.max - runtime.dualRange.min);
  }, [runtimeSliderVersion, sliderProps, state]);

  const granularMacroModel = useMemo(() => (
    computeGranularMacroModel(state, (paramKey, fallback) => {
      const resolved = resolveCurrentSliderValue(paramKey);
      return Number.isFinite(resolved) ? resolved : fallback;
    })
  ), [state, resolveCurrentSliderValue]);

  const ghostValueFor = useCallback((paramKey: keyof SliderState): number | undefined => {
    const effectiveValue = granularMacroModel.effectiveValues[paramKey];
    if (effectiveValue == null || !Number.isFinite(effectiveValue)) return undefined;
    const currentValue = resolveCurrentSliderValue(paramKey);
    const paramInfo = getParamInfo(paramKey);
    const epsilon = paramInfo
      ? Math.max(paramInfo.step * 0.25, (paramInfo.max - paramInfo.min) * 0.002)
      : 0.0001;
    return Math.abs(effectiveValue - currentValue) > epsilon ? effectiveValue : undefined;
  }, [granularMacroModel, resolveCurrentSliderValue]);

  const sliderWithGhost = useCallback((paramKey: keyof SliderState) => ({
    ...sliderProps(paramKey),
    ghostValue: ghostValueFor(paramKey),
  }), [sliderProps, ghostValueFor]);

  // Which voice cards are expanded for editing — default to all enabled voices
  const [expandedVoices, setExpandedVoices] = useState<Set<number>>(() => {
    const init = new Set<number>();
    for (let v = 0; v < 4; v++) {
      if (state[VOICE_KEYS[v]!.enabled]) init.add(v);
    }
    return init;
  });
  const previousEnabledVoicesRef = useRef<boolean[]>(
    VOICE_KEYS.map((keys) => Boolean(state[keys.enabled])),
  );
  const setSpaceMode = (mode: GranularSpaceMode) => {
    onSelectChange('granularSpaceMode' as keyof SliderState, mode as SliderState[keyof SliderState]);
  };
  const setPresetBehavior = (behavior: GranularPresetBehavior) => {
    onSelectChange('granularPresetBehavior' as keyof SliderState, behavior as SliderState[keyof SliderState]);
  };
  const setGranularShape = (shape: GranularShape) => {
    onSelectChange('granularShape' as keyof SliderState, shape as SliderState[keyof SliderState]);
  };
  const bindHelp = useCallback((helpKey: string, options: { label?: string } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, options),
    onPointerDown: () => announceHelp(helpKey, options),
    onFocus: () => announceHelp(helpKey, options),
  }), [announceHelp]);

  const toggleVoice = (idx: number) => {
    setExpandedVoices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  useEffect(() => {
    const currentEnabledVoices = VOICE_KEYS.map((keys) => Boolean(state[keys.enabled]));
    const previousEnabledVoices = previousEnabledVoicesRef.current;
    const newlyEnabledVoices = currentEnabledVoices.flatMap((enabled, idx) => (
      enabled && !previousEnabledVoices[idx] ? [idx] : []
    ));
    if (newlyEnabledVoices.length > 0) {
      setExpandedVoices((prev) => {
        const next = new Set(prev);
        newlyEnabledVoices.forEach((idx) => next.add(idx));
        return next;
      });
    }
    previousEnabledVoicesRef.current = currentEnabledVoices;
  }, [
    state.granularV1Enabled,
    state.granularV2Enabled,
    state.granularV3Enabled,
    state.granularV4Enabled,
  ]);

  // Compute active slices for highlighting
  const activeSlices = useMemo(() => {
    const slices = new Set<number>();
    for (let v = 0; v < 4; v++) {
      const keys = VOICE_KEYS[v]!;
      if (state[keys.enabled]) {
        slices.add(state[keys.slice] as number);
      }
    }
    return slices;
  }, [
    state.granularV1Enabled, state.granularV1Slice,
    state.granularV2Enabled, state.granularV2Slice,
    state.granularV3Enabled, state.granularV3Slice,
    state.granularV4Enabled, state.granularV4Slice,
  ]);

  const bufferVoiceVisuals = useMemo<BufferVoiceVisual[]>(() => {
    const bufferSeconds = Math.max(1, Number(state.granularBufferSeconds) || 16);
    const sliceLengthNorm = 1 / NUM_SLICES;
    const smearAmount = clamp01(resolveCurrentSliderValue('granularDiffusion'));

    const getEffectiveNumber = (paramKey: keyof SliderState, fallback: number): number => {
      const effective = granularMacroModel.effectiveValues[paramKey];
      if (typeof effective === 'number' && Number.isFinite(effective)) return effective;
      const resolved = resolveCurrentSliderValue(paramKey);
      return Number.isFinite(resolved) ? resolved : fallback;
    };

    return [0, 1, 2, 3].flatMap((voiceIndex) => {
      const keys = VOICE_KEYS[voiceIndex]!;
      if (!state[keys.enabled]) return [];

      const mode = state[keys.mode] as VoiceMode;
      const slice = Math.max(0, Math.min(NUM_SLICES - 1, Math.round(Number(state[keys.slice] ?? 0))));
      const sliceStart = slice / NUM_SLICES;
      const currentPos = wrap01(voicePositions[voiceIndex] ?? 0);
      const lookBack = clamp01(getEffectiveNumber(keys.spray, Number(state[keys.spray]) || 0));
      const density = Math.max(0, getEffectiveNumber(keys.density, Number(state[keys.density]) || 0));
      const grainSizeMs = Math.max(1, getEffectiveNumber(keys.grainSize, Number(state[keys.grainSize]) || 60));
      const posDepth = clamp01(getEffectiveNumber(keys.posLFODepth, Number(state[keys.posLFODepth]) || 0));
      const writeFollow = clamp01(getEffectiveNumber(keys.writeFollow, Number(state[keys.writeFollow]) || 0));
      const speed = getEffectiveNumber(keys.speed, Number(state[keys.speed]) || 0);
      const scanRate = getEffectiveNumber(keys.scanRate, Number(state[keys.scanRate]) || 1);
      const attack = clamp01(getEffectiveNumber(keys.attack, Number(state[keys.attack]) || 0.01));
      const decay = clamp01(getEffectiveNumber(keys.decay, Number(state[keys.decay]) || 0.1));
      const reverse = Boolean(state[keys.reverse]);
      const tempoSync = Boolean(state[keys.tempoSync]);
      const tempoLabel = tempoSync ? String(state[keys.tempoDiv] ?? '1/8') : null;
      const grainSeconds = grainSizeMs / 1000;
      const densityNorm = clamp01(density / 64);

      let rangeStart = sliceStart;
      let rangeWidth = sliceLengthNorm;
      let anchorPos = sliceStart;
      let motionMode: 'scan' | 'linear' | null = null;

      if (mode === 'granular') {
        // Band centered on currentPos (which is last_grain_pos from WASM,
        // already includes base_pos + lfo_offset + spray_offset).
        // Width = spray scatter only. posDepth is visible as the band
        // *swaying* over time (baked into currentPos by the LFO).
        const sprayWindowNorm = Math.max((grainSeconds * 4) / bufferSeconds, sliceLengthNorm * 0.6);
        const sprayRangeNorm = lookBack * lookBack * sprayWindowNorm;
        const halfWidth = Math.max(0.006, sprayRangeNorm);
        anchorPos = currentPos;
        rangeStart = currentPos - halfWidth;
        rangeWidth = Math.max(0.012, Math.min(1, halfWidth * 2));
      } else if (mode === 'legacy') {
        // Legacy: grains trail behind write head by spray amount.
        // Width = trailing window from lookBack only.
        const trailingWindowNorm = (lookBack * 0.6) / bufferSeconds;
        const halfWidth = Math.max(0.006, trailingWindowNorm);
        anchorPos = currentPos;
        rangeStart = currentPos - halfWidth;
        rangeWidth = Math.max(0.012, Math.min(1, halfWidth * 2));
      } else if (Math.abs(speed) < 0.0001) {
        motionMode = 'scan';
        const writeHeadLead = Math.min(0.09 / bufferSeconds, 0.25);
        const writeHeadAnchor = wrap01(writeHeadPosition - writeHeadLead);
        const scanStart = writeHeadAnchor * writeFollow;
        rangeStart = scanStart;
        rangeWidth = Math.max(0.018, Math.min(1, posDepth * Math.max(0.18, 1 - writeFollow)));
        anchorPos = wrap01(scanStart);
      } else {
        motionMode = 'linear';
        rangeStart = sliceStart;
        rangeWidth = Math.max(sliceLengthNorm * 0.5, Math.min(1, sliceLengthNorm + posDepth));
        anchorPos = sliceStart;
      }

      const rangeSegments = makeWrappedRangeSegments(rangeStart, rangeWidth);
      const markerPositions = rangeSegments.length > 1
        ? [currentPos, currentPos < 0.5 ? currentPos + 1 : currentPos - 1]
        : [currentPos];
      const rangeHeight = mode === 'clean'
        ? 5 + posDepth * 5
        : 6 + densityNorm * 7 + smearAmount * 2;
      const rangeOpacity = Math.min(0.82, 0.22 + densityNorm * 0.35 + smearAmount * 0.18);
      const bandTopOffset = Math.max(0, (14 - rangeHeight) / 2);

      const summaryParts = [
        `V${voiceIndex + 1}`,
        mode === 'clean' ? `clean ${motionMode ?? 'linear'}` : mode,
        `S${slice + 1}`,
      ];
      if (mode === 'clean') {
        summaryParts.push(`${(motionMode === 'scan' ? scanRate : speed).toFixed(2)}x`);
      } else {
        summaryParts.push(`D${Math.round(density)}`);
        summaryParts.push(`LB ${lookBack.toFixed(2)}`);
      }
      if (tempoLabel) summaryParts.push(tempoLabel);

      const titleParts = [
        `${VOICE_NAMES[voiceIndex]} — ${mode === 'clean' ? `clean ${motionMode ?? 'linear'}` : mode}`,
        `Slice S${slice + 1}`,
        `Anchor ${(anchorPos * 100).toFixed(1)}%`,
        `Current ${(currentPos * 100).toFixed(1)}%`,
      ];
      if (mode !== 'clean') {
        titleParts.push(`Density ${density.toFixed(1)}`);
        titleParts.push(`Look Back ${lookBack.toFixed(2)}`);
      }
      if (tempoLabel) titleParts.push(`Clock ${tempoLabel}`);

      return [{
        index: voiceIndex,
        mode,
        motionMode,
        color: VOICE_COLORS[voiceIndex]!,
        slice,
        currentPos,
        markerPositions,
        anchorPos,
        rangeSegments,
        rangeHeight,
        rangeOpacity,
        bandTopOffset,
        summary: summaryParts.join(' · '),
        title: titleParts.join(' • '),
        tempoSync,
        tempoLabel,
        attack,
        decay,
        reverse,
        speed,
        scanRate,
      }];
    });
  }, [
    granularMacroModel,
    resolveCurrentSliderValue,
    state,
    voicePositions,
    writeHeadPosition,
  ]);

  return (
    <div className="granular-root">
      <div className="granular-container">

        {/* ═══════════════ SOUND PANEL (left) ═══════════════ */}
        <div className="granular-sound-panel">
          <div className="granular-global-bar granular-global-panel fx-page-header">
            <span className="granular-title fx-page-title">⊞ Granular FX</span>

            <div className="fx-page-actions">
              <button
                className={`granular-enable-btn${state.granularEnabled ? ' on' : ''}`}
                onClick={() => onSelectChange('granularEnabled' as keyof SliderState, !state.granularEnabled)}
              >
                {state.granularEnabled ? 'ON' : 'OFF'}
              </button>

              <button
                className={`granular-freeze-btn${state.granularFreeze ? ' frozen' : ''}`}
                onClick={() => onSelectChange('granularFreeze' as keyof SliderState, !state.granularFreeze)}
              >
                {state.granularFreeze ? '❄ FROZEN' : '❄ Freeze'}
              </button>
            </div>
          </div>

          <div className="granular-section-card granular-preset-card">
            <div className="granular-section-head">
              <span className="granular-section-title">Preset</span>
              <span className="granular-section-note">Save or recall the full granular scene</span>
            </div>
            <div className="granular-preset-body">
              <PresetDropdown
                className="granular-preset-toolbar"
                level="source"
                scope="granular"
                state={state}
                currentName={scenePresetName}
                onLoad={handleScenePresetLoad}
                onStateChange={onStateChange}
                presetOptions={granularSceneExtract}
                compact
              />

              <div className="granular-preset-meta">
                <div className="granular-preset-description">
                  {scenePresetDescription || (scenePresetName ? 'No description saved for this preset.' : 'Load a granular scene preset to view its description.')}
                </div>
                <div className="granular-preset-description" style={{ marginTop: 8, fontSize: '0.72rem', opacity: 0.85 }}>
                  This control stores the full granular scene: all four voices, legacy state, kit macros, and source-level controls.
                </div>
              </div>
            </div>
          </div>

          <div className="granular-section-card granular-buffer-card">
            <div className="granular-section-head">
              <span className="granular-section-title">Buffer</span>
              <span className="granular-section-note">Shared record head + 4 read voices. Bands show each voice&apos;s effective anchor and motion/look-back window; markers show the current read point.</span>
            </div>
            <div className="granular-top-mode-row">
              <div className="granular-chip-group">
                <span className="granular-chip-label">Length</span>
                <button
                  className={`granular-chip-btn${state.granularBufferSeconds === 4 ? ' active' : ''}`}
                  onClick={() => onSelectChange('granularBufferSeconds' as keyof SliderState, 4 as SliderState[keyof SliderState])}
                >
                  4s
                </button>
                <button
                  className={`granular-chip-btn${state.granularBufferSeconds === 16 ? ' active' : ''}`}
                  onClick={() => onSelectChange('granularBufferSeconds' as keyof SliderState, 16 as SliderState[keyof SliderState])}
                >
                  16s
                </button>
              </div>
              <div className="granular-chip-group granular-chip-group-info">
                <span className="granular-chip-label">Live Grains</span>
                <span className="granular-chip-value">{activeGrainCount}</span>
              </div>
            </div>
            {liveBufferTelemetryAvailable && (
              visualizerEnabled ? (
                <>
                  {bufferVoiceVisuals.length > 0 && (
                    <div className="granular-buffer-readouts">
                      {bufferVoiceVisuals.map((voice) => (
                        <div
                          key={voice.index}
                          className={`granular-buffer-readout mode-${voice.mode}`}
                          style={{ '--voice-color': voice.color } as React.CSSProperties}
                          title={voice.title}
                        >
                          {voice.summary}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="granular-buffer-legend">
                    <span className="granular-buffer-legend-swatch anchor" />
                    <span>anchor</span>
                    <span className="granular-buffer-legend-swatch window" />
                    <span>window</span>
                    <span className="granular-buffer-legend-swatch marker" />
                    <span>current</span>
                    <span className="granular-buffer-legend-swatch particle" />
                    <span>grains</span>
                  </div>
                  <GranularBufferCanvas
                    height={128}
                    isRunning={isRunning}
                    voices={bufferVoiceVisuals as CanvasVoiceVisual[]}
                    writeHeadPosition={writeHeadPosition}
                    activeGrainCount={activeGrainCount}
                    bufferWaveform={bufferWaveform}
                    bufferSeconds={(state.granularBufferSeconds as number) || 16}
                    isFrozen={Boolean(state.granularFreeze)}
                    activeSlices={activeSlices}
                    numSlices={NUM_SLICES}
                  />
                </>
              ) : (
                <div className="granular-buffer-readouts" style={{ gap: 12 }}>
                  <div className="granular-buffer-readout" style={{ '--voice-color': '#6b7280' } as React.CSSProperties}>
                    Mobile default keeps the live buffer canvas off to save CPU and battery.
                  </div>
                  <button
                    type="button"
                    className="granular-chip-btn active"
                    onClick={() => setVisualizerEnabled(true)}
                  >
                    Enable Visualizer
                  </button>
                </div>
              )
            )}
          </div>

          <div className="granular-section-card granular-macro-card">
            <div className="granular-section-head">
              <span className="granular-section-title">Modes & Macros</span>
              <span className="granular-section-note">
                Smear is the same bed/smoothing macro that used to live in Space
              </span>
            </div>
            <div className="section-body">
              <div className="granular-top-mode-row">
                <div className="granular-chip-group">
                  <span className="granular-chip-label">Space</span>
                  <button
                    className={`granular-chip-btn${spaceMode === 'diffuse' ? ' active' : ''}`}
                    onClick={() => setSpaceMode('diffuse')}
                    {...bindHelp('granularSpaceModeDiffuse')}
                  >
                    Diffuse
                  </button>
                  <button
                    className={`granular-chip-btn${spaceMode === 'clocked' ? ' active' : ''}`}
                    onClick={() => setSpaceMode('clocked')}
                    {...bindHelp('granularSpaceModeClocked')}
                  >
                    Clocked
                  </button>
                </div>

                <div className="granular-chip-group">
                  <span className="granular-chip-label">Behavior</span>
                  <button
                    className={`granular-chip-btn${presetBehavior === 'pure' ? ' active' : ''}`}
                    onClick={() => setPresetBehavior('pure')}
                    {...bindHelp('granularPresetBehaviorPure')}
                  >
                    Pure
                  </button>
                  <button
                    className={`granular-chip-btn${presetBehavior === 'expressive' ? ' active' : ''}`}
                    onClick={() => setPresetBehavior('expressive')}
                    {...bindHelp('granularPresetBehaviorExpressive')}
                  >
                    Expressive
                  </button>
                </div>

                <div className="granular-chip-group">
                  <span className="granular-chip-label">Shape</span>
                  <button
                    className={`granular-chip-btn${granularShape === 'triangle' ? ' active' : ''}`}
                    onClick={() => setGranularShape('triangle')}
                  >
                    Triangle
                  </button>
                  <button
                    className={`granular-chip-btn${granularShape === 'sawUp' ? ' active' : ''}`}
                    onClick={() => setGranularShape('sawUp')}
                  >
                    Rise
                  </button>
                  <button
                    className={`granular-chip-btn${granularShape === 'sawDown' ? ' active' : ''}`}
                    onClick={() => setGranularShape('sawDown')}
                  >
                    Fall
                  </button>
                  <button
                    className={`granular-chip-btn${granularShape === 'square' ? ' active' : ''}`}
                    onClick={() => setGranularShape('square')}
                  >
                    Square
                  </button>
                </div>
              </div>

              <div className="granular-grid-4">
                <Slider
                  label="Smear"
                  value={state.granularDiffusion}
                  paramKey={'granularDiffusion' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularDiffusion' as keyof SliderState)}
                />
                <Slider
                  label="Activity"
                  value={state.granularMacroActivity ?? 0.35}
                  paramKey={'granularMacroActivity' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroActivity' as keyof SliderState)}
                />
                <Slider
                  label="Texture"
                  value={state.granularMacroTexture ?? 0.3}
                  paramKey={'granularMacroTexture' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroTexture' as keyof SliderState)}
                />
                <Slider
                  label="Motion"
                  value={state.granularMacroComplexity ?? 0.2}
                  paramKey={'granularMacroComplexity' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroComplexity' as keyof SliderState)}
                />
                <Slider
                  label="Tone"
                  value={state.granularMacroDarkness ?? 0.3}
                  paramKey={'granularMacroDarkness' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroDarkness' as keyof SliderState)}
                />
                <Slider
                  label="Chaos"
                  value={state.granularMacroChaos ?? 0.1}
                  paramKey={'granularMacroChaos' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularMacroChaos' as keyof SliderState)}
                />
              </div>
              <div className="granular-section-label" style={{ marginTop: 10 }}>Harmony</div>
              <div className="granular-grid-2">
                <Slider
                  label="Chord Bias"
                  value={state.granularChordBias}
                  paramKey={'granularChordBias' as keyof SliderState}
                  onChange={onParamChange}
                  {...sliderProps('granularChordBias' as keyof SliderState)}
                />
                <div className="granular-macro-note">
                  Smear softens the cloud into a bed. Activity raises density and overlap. Motion drives travel and pan. Tone darkens the output path. Pure stays closer to the preset; Expressive leans harder.
                </div>
              </div>
            </div>
          </div>

          <div className="granular-section-card granular-space-card">
            <div className="granular-section-head">
              <span className="granular-section-title">Space</span>
              <span className="granular-section-note">
                {spaceMode === 'diffuse'
                  ? 'Diffuse mode now adds a softer cloud feed before delay and reverb. Clocked space remains available for contrast.'
                  : 'Clocked prototype uses the current multitap delay path.'}
              </span>
            </div>
            <div className="granular-global-sliders granular-space-sliders">
              <Slider
                label="Granular Level"
                value={state.granularLevel}
                paramKey="granularLevel"
                onChange={onParamChange}
                {...sliderProps('granularLevel')}
              />
              <Slider
                label="Feedback"
                value={state.granularFeedback}
                paramKey={'granularFeedback' as keyof SliderState}
                onChange={onParamChange}
                {...sliderProps('granularFeedback' as keyof SliderState)}
              />
              <Slider
                label="FB LPF"
                value={state.granularFeedbackLPF}
                paramKey={'granularFeedbackLPF' as keyof SliderState}
                unit="Hz"
                onChange={onParamChange}
                {...sliderProps('granularFeedbackLPF' as keyof SliderState)}
              />
              <Slider
                label="Reverb Send"
                value={state.granularReverbSend}
                paramKey="granularReverbSend"
                onChange={onParamChange}
                {...sliderProps('granularReverbSend')}
              />
              <Slider
                label="Reverb LPF"
                value={state.granularReverbLPF}
                paramKey={'granularReverbLPF' as keyof SliderState}
                unit="Hz"
                onChange={onParamChange}
                {...sliderWithGhost('granularReverbLPF' as keyof SliderState)}
              />
              <Slider
                label="Output LPF"
                value={state.granularOutputLPF}
                paramKey={'granularOutputLPF' as keyof SliderState}
                unit="Hz"
                onChange={onParamChange}
                {...sliderWithGhost('granularOutputLPF' as keyof SliderState)}
              />
            </div>
            <div className="granular-space-prototype-note" style={{ marginBottom: 10 }}>
              Diffuse mode and the clocked multitap both shape this output path. The Smear macro itself now lives in Modes & Macros at the top.
            </div>

            <div className={`granular-delay-section granular-clocked-space${spaceMode === 'diffuse' ? ' diffuse' : ''}`}>
              <div
                className={`section-header${expandedPanels.has('granularDelay') ? '' : ' collapsed'}`}
                onClick={() => togglePanel('granularDelay')}
              >
                <span className="section-header-content">
                  Clocked Space
                  <span className="delay-bpm-info">@ {state.sequencerMasterBPM} BPM</span>
                </span>
              </div>
              <div className={`section-body${expandedPanels.has('granularDelay') ? '' : ' collapsed'}`}>
                <div className="granular-space-prototype-note">
                  {spaceMode === 'diffuse'
                    ? 'Diffuse space will get its own shaping path later. For now, this keeps the tested clocked multitap available.'
                    : delayBBusFed
                      ? 'This is the shared Delay B multitap path, still surfaced here from the Granular page. The Routing page can also feed other engines into it.'
                      : 'This is the shared Delay B multitap path. Raise Granular -> Delay B in the Routing page or feed the bus from another engine to wake it.'}
                </div>
                <>
                  <Slider
                    label="Time Division"
                    value={getSliderNumericValue('granularDelayTime', state.granularDelayTime) ?? 0}
                    paramKey={'granularDelayTime' as keyof SliderState}
                    onChange={onParamChange}
                    format={(value: number) => formatIndexedDelayDivision('granularDelayTime', value)}
                    {...sliderProps('granularDelayTime' as keyof SliderState)}
                  />
                  <Slider label="Activity" value={state.granularDelayActivity ?? 0.3} paramKey={'granularDelayActivity' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayActivity' as keyof SliderState)} />
                  <Slider label="Repeats" value={state.granularDelayRepeats ?? 0.3} paramKey={'granularDelayRepeats' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayRepeats' as keyof SliderState)} />
                  <Slider label="Filter" value={state.granularDelayFilter ?? 0.5} paramKey={'granularDelayFilter' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayFilter' as keyof SliderState)} />
                  <Slider label="Vibrato" value={state.granularDelayVibrato ?? 0} paramKey={'granularDelayVibrato' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayVibrato' as keyof SliderState)} />
                  {(state.delayBGranularSend ?? 0) < 0.0001 && (
                    <Slider label="Send" value={state.granularDelayBSend ?? 0} paramKey={'granularDelayBSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayBSend' as keyof SliderState)} />
                  )}
                  <Slider label="Reverb Send" value={state.granularDelayReverbSend ?? 0.4} paramKey={'granularDelayReverbSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDelayReverbSend' as keyof SliderState)} />
                </>
              </div>
            </div>
          </div>

          {/* ── Input Sources ── */}
          <div className="granular-section-card">
            <div className="granular-section-head">
              <span className="granular-section-title">Input Sources</span>
            </div>
            <div className="granular-global-sliders granular-input-sources-grid">
              <Slider label="Pad 1" value={state.granularPad1Send} paramKey={'granularPad1Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularPad1Send' as keyof SliderState)} />
              <Slider label="Pad 2" value={state.granularPad2Send} paramKey={'granularPad2Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularPad2Send' as keyof SliderState)} />
              <Slider label="Lead 1" value={state.granularLead1Send} paramKey={'granularLead1Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularLead1Send' as keyof SliderState)} />
              <Slider label="Lead 2" value={state.granularLead2Send} paramKey={'granularLead2Send' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularLead2Send' as keyof SliderState)} />
              <Slider label="Drums" value={state.granularDrumSend} paramKey={'granularDrumSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularDrumSend' as keyof SliderState)} />
              <Slider label="Waves" value={state.granularWavesSend} paramKey={'granularWavesSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularWavesSend' as keyof SliderState)} />
              <Slider label="Water" value={state.granularWaterSend} paramKey={'granularWaterSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularWaterSend' as keyof SliderState)} />
              <Slider label="Insects" value={state.granularInsectsSend} paramKey={'granularInsectsSend' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularInsectsSend' as keyof SliderState)} />
            </div>
          </div>
        </div>{/* end .granular-sound-panel */}

        {/* ═══════════════ VOICES PANEL (right) ═══════════════ */}
        <div className="granular-voices-panel">
          <div className="granular-section-card granular-voices-card">
            <div className="granular-section-head">
              <span className="granular-section-title">Voices</span>
              <span className="granular-section-note">Four readers on one shared buffer</span>
            </div>
            <div className="granular-voices">
              {VOICE_KEYS.map((keys, v) => {
              const isEnabled = state[keys.enabled] as boolean;
              const isExpanded = expandedVoices.has(v);
              const mode = state[keys.mode] as VoiceMode;
              const slice = state[keys.slice] as number;
              const speed = state[keys.speed] as number;
              const scanRate = state[keys.scanRate] as number;
              const pitch = state[keys.pitch] as number;
              const baseReverse = state[keys.reverse] as boolean;
              const tempoSync = (state[keys.tempoSync] as boolean) ?? false;
              const tempoDiv = (state[keys.tempoDiv] as ClockDivision) ?? '1/8';

              // Summary text
              const summaryParts: string[] = [];
              summaryParts.push(`S${slice + 1}`);
              if (mode === 'clean' && speed === 0) {
                summaryParts.push('SCAN');
                if (Math.abs(scanRate - 1) > 0.001) summaryParts.push(`${scanRate.toFixed(2)}×`);
              } else if (speed !== 1) {
                summaryParts.push(`${speed.toFixed(2)}×`);
              }
              if (mode === 'granular' && tempoSync) summaryParts.push(`${tempoDiv} sync`);
              if (pitch !== 0) summaryParts.push(`${pitch > 0 ? '+' : ''}${pitch}st`);
              if (baseReverse) summaryParts.push('REV');
              const summary = summaryParts.join(' · ');
              const cleanRateValue = speed === 0 ? scanRate : speed;
              const setCleanMotionMode = (nextMode: 'scan' | 'linear') => {
                if (nextMode === 'scan') {
                  if (speed > 0) onSelectChange(keys.scanRate, speed);
                  onSelectChange(keys.speed, 0);
                } else {
                  onSelectChange(keys.speed, cleanRateValue || 1);
                }
              };
              const setCleanRate = (nextRate: number) => {
                onSelectChange(keys.scanRate, nextRate);
                if (speed !== 0) onSelectChange(keys.speed, nextRate);
              };

              return (
                <div
                  key={v}
                  className={`granular-voice-card${isExpanded ? ' editing' : ''}${!isEnabled ? ' disabled' : ''}`}
                  style={{
                    '--voice-color': VOICE_COLORS[v],
                    '--engine-accent': VOICE_COLORS[v],
                  } as React.CSSProperties}
                >
                  {/* Header */}
                  <div
                    className="granular-voice-header"
                    onClick={() => toggleVoice(v)}
                  >
                    <div
                      className="granular-voice-dot"
                      style={{ background: isEnabled ? VOICE_COLORS[v] : '#555' }}
                    />
                    <span className="granular-voice-name">{VOICE_NAMES[v]}</span>
                    <span className="granular-voice-mode-badge">{mode}</span>
                    <span className="granular-voice-summary">{summary}</span>

                    <button
                      className={`granular-voice-enable-btn${isEnabled ? ' on' : ''}`}
                      onClick={e => {
                        e.stopPropagation();
                        const nextEnabled = !isEnabled;
                        onSelectChange(keys.enabled, nextEnabled);
                        if (nextEnabled) {
                          setExpandedVoices((prev) => {
                            const next = new Set(prev);
                            next.add(v);
                            return next;
                          });
                        }
                      }}
                    >
                      {isEnabled ? 'ON' : 'OFF'}
                    </button>
                    <button className={`granular-voice-expand-btn${isExpanded ? ' active' : ''}`}>
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Body (expanded) */}
                  {isExpanded && (
                    <div className="granular-voice-body">

                      {/* Mode Select */}
                      <div className="granular-mode-row">
                        {(['clean', 'granular', 'legacy'] as VoiceMode[]).map(m => (
                          <button
                            key={m}
                            className={`granular-mode-btn${mode === m ? ' active' : ''}`}
                            onClick={() => onSelectChange(keys.mode, m)}
                            {...bindHelp(
                              m === 'clean'
                                ? 'granularVoiceModeClean'
                                : m === 'granular'
                                  ? 'granularVoiceModeGranular'
                                  : 'granularVoiceModeLegacy',
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>

                      {/* ── Slice & Playback (collapsible, open by default) ── */}
                      <div
                        className={`granular-section-label granular-section-label-toggle${expandedPanels.has('granularSliceCollapsed') ? ' collapsed' : ''}`}
                        onClick={() => togglePanel('granularSliceCollapsed')}
                      >
                        {mode === 'clean' ? 'Slice, Motion & Rate' : 'Slice & Playback'} {expandedPanels.has('granularSliceCollapsed') ? '▸' : '▾'}
                      </div>
                      {!expandedPanels.has('granularSliceCollapsed') && (
                      <>
                      {mode === 'clean' && (
                        <>
                          <div className="granular-mode-row" style={{ marginBottom: 6 }}>
                            <button
                              className={`granular-mode-btn${speed === 0 ? ' active' : ''}`}
                              onClick={() => setCleanMotionMode('scan')}
                              {...bindHelp('granularVoiceMotionScan')}
                            >
                              Scan
                            </button>
                            <button
                              className={`granular-mode-btn${speed !== 0 ? ' active' : ''}`}
                              onClick={() => setCleanMotionMode('linear')}
                              {...bindHelp('granularVoiceMotionLinear')}
                            >
                              Linear
                            </button>
                          </div>
                          <div className="granular-space-prototype-note" style={{ marginBottom: 6 }}>
                            Slice picks the voice&apos;s home region. In Scan, the Position LFO moves the read head. Rate Ratio sets the harmonic playback speed for that voice.
                          </div>
                        </>
                      )}
                      <div className="granular-grid-4">
                        <Slider
                          label="Slice"
                          value={state[keys.slice] as number}
                          paramKey={keys.slice}
                          onChange={onParamChange}
                          {...sliderProps(keys.slice)}
                        />
                        {mode === 'clean' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: '0.62rem', color: '#bdbdbd', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Rate Ratio
                            </label>
                            <select
                              value={String(cleanRateValue)}
                              onChange={(e) => setCleanRate(Number(e.target.value))}
                              {...bindHelp('granularVoiceCleanRateRatio')}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.18)',
                                background: 'rgba(0,0,0,0.28)',
                                color: '#e8e8e8',
                                fontSize: '0.72rem',
                              }}
                            >
                              {CLEAN_RATE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {mode !== 'clean' && (
                          <Slider
                            label="Speed"
                            value={state[keys.speed] as number}
                            paramKey={keys.speed}
                            unit="×"
                            onChange={onParamChange}
                            {...sliderWithGhost(keys.speed)}
                          />
                        )}
                        <div className="granular-pitch-wrap">
                          <Slider
                            label="Pitch"
                            value={state[keys.pitch] as number}
                            paramKey={keys.pitch}
                            unit="st"
                            onChange={onParamChange}
                            {...sliderWithGhost(keys.pitch)}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <button
                            className={`granular-reverse-btn${baseReverse ? ' active' : ''}`}
                            onClick={() => onSelectChange(keys.reverse, !baseReverse)}
                          >
                            ↺ REV
                          </button>
                        </div>
                      </div>
                      </>
                      )}

                      {/* ── Grain Controls (only for granular/legacy) ── */}
                      {mode !== 'clean' && (
                        <>
                          <div
                            className={`granular-section-label granular-section-label-toggle${expandedPanels.has('granularGrainCollapsed') ? ' collapsed' : ''}`}
                            onClick={() => togglePanel('granularGrainCollapsed')}
                          >
                            Grain {expandedPanels.has('granularGrainCollapsed') ? '▸' : '▾'}
                          </div>
                          {!expandedPanels.has('granularGrainCollapsed') && (
                          <>
                          {mode === 'granular' && (
                            <>
                              <div className="granular-mode-row" style={{ marginBottom: 6 }}>
                                <button
                                  className={`granular-mode-btn${!tempoSync ? ' active' : ''}`}
                                  onClick={() => onSelectChange(keys.tempoSync, false)}
                                  {...bindHelp('granularVoiceFreeTempo')}
                                >
                                  Free
                                </button>
                                <button
                                  className={`granular-mode-btn${tempoSync ? ' active' : ''}`}
                                  onClick={() => onSelectChange(keys.tempoSync, true)}
                                  {...bindHelp('granularVoiceTempoSync')}
                                >
                                  Tempo
                                </button>
                              </div>
                              <div className="granular-space-prototype-note" style={{ marginBottom: 6 }}>
                                Tempo sync uses the granular BPM and fires grain pulses on a note grid without needing the Euclidean sequencer.
                              </div>
                              {tempoSync && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                                  <label style={{ fontSize: '0.62rem', color: '#bdbdbd', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                    Clock
                                  </label>
                                  <select
                                    value={tempoDiv}
                                    onChange={(e) => onSelectChange(keys.tempoDiv, e.target.value as SliderState[keyof SliderState])}
                                    {...bindHelp('granularVoiceTempoClock')}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px',
                                      borderRadius: '8px',
                                      border: '1px solid rgba(255,255,255,0.18)',
                                      background: 'rgba(0,0,0,0.28)',
                                      color: '#e8e8e8',
                                      fontSize: '0.72rem',
                                    }}
                                  >
                                    {GRAIN_CLOCK_OPTIONS.map(option => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </>
                          )}
                          <div className="granular-grid-4">
                            <Slider label="Density" value={state[keys.density] as number} paramKey={keys.density} unit="/s" onChange={onParamChange} {...sliderWithGhost(keys.density)} />
                            <Slider label="Size" value={state[keys.grainSize] as number} paramKey={keys.grainSize} unit="ms" onChange={onParamChange} {...sliderWithGhost(keys.grainSize)} />
                            <Slider label="Look Back" value={state[keys.spray] as number} paramKey={keys.spray} onChange={onParamChange} {...sliderWithGhost(keys.spray)} />
                            <Slider label="Shimmer" value={state[keys.grainOct] as number} paramKey={keys.grainOct} onChange={onParamChange} {...sliderWithGhost(keys.grainOct)} />
                          </div>
                          </>
                          )}
                        </>
                      )}

                      {/* ── Envelope & Texture (collapsible, collapsed by default) ── */}
                      <div
                        className={`granular-section-label granular-section-label-toggle${expandedPanels.has('granularEdgeTexture') ? '' : ' collapsed'}`}
                        onClick={() => togglePanel('granularEdgeTexture')}
                      >
                        Edge & Texture {expandedPanels.has('granularEdgeTexture') ? '▾' : '▸'}
                      </div>
                      {expandedPanels.has('granularEdgeTexture') && (
                      <div className="granular-grid-4">
                        <Slider label="Fade In" value={state[keys.attack] as number} paramKey={keys.attack} unit="s" onChange={onParamChange} {...sliderWithGhost(keys.attack)} />
                        <Slider label="Fade Out" value={state[keys.decay] as number} paramKey={keys.decay} unit="s" onChange={onParamChange} {...sliderWithGhost(keys.decay)} />
                        <Slider label="Blur" value={state[keys.blur] as number} paramKey={keys.blur} onChange={onParamChange} {...sliderWithGhost(keys.blur)} />
                        <Slider label="Gain" value={state[keys.gain] as number} paramKey={keys.gain} onChange={onParamChange} {...sliderProps(keys.gain)} />
                      </div>
                      )}

                      {/* ── Motion (collapsible, collapsed by default) ── */}
                      <div
                        className={`granular-section-label granular-section-label-toggle${expandedPanels.has('granularMotion') ? '' : ' collapsed'}`}
                        onClick={() => togglePanel('granularMotion')}
                      >
                        Motion {expandedPanels.has('granularMotion') ? '▾' : '▸'}
                      </div>
                      {expandedPanels.has('granularMotion') && (
                      <div className="granular-grid-4">
                        <Slider label="Pos Rate" value={state[keys.posLFORate] as number} paramKey={keys.posLFORate} onChange={onParamChange} {...sliderWithGhost(keys.posLFORate)} />
                        <Slider label="Pos Depth" value={state[keys.posLFODepth] as number} paramKey={keys.posLFODepth} onChange={onParamChange} {...sliderWithGhost(keys.posLFODepth)} />
                        <Slider label="Pan" value={state[keys.pan] as number} paramKey={keys.pan} onChange={onParamChange} {...sliderProps(keys.pan)} />
                        <Slider label="Pan LFO" value={state[keys.panLFORate] as number} paramKey={keys.panLFORate} onChange={onParamChange} {...sliderWithGhost(keys.panLFORate)} />
                        <Slider label="Spread" value={state[keys.stereoSpread] as number} paramKey={keys.stereoSpread} onChange={onParamChange} {...sliderProps(keys.stereoSpread)} />
                        <Slider label="Rev LFO" value={(state[keys.reverseLFORate] as number) ?? 0} paramKey={keys.reverseLFORate} onChange={onParamChange} {...sliderWithGhost(keys.reverseLFORate)} />
                        <Slider label="Rec LFO" value={(state[keys.recordLFORate] as number) ?? 0} paramKey={keys.recordLFORate} onChange={onParamChange} {...sliderProps(keys.recordLFORate)} />
                        <Slider label="Write Fol" value={(state[keys.writeFollow] as number) ?? 0} paramKey={keys.writeFollow} onChange={onParamChange} {...sliderProps(keys.writeFollow)} />
                      </div>
                      )}

                      {/* ── Legacy-only controls ── */}
                      {mode === 'legacy' && v === 0 && (
                        <div className="granular-legacy-section">
                          <div className="granular-legacy-label">Legacy Granulator</div>
                          <div className="granular-grid-3">
                            <Slider label="Jitter" value={state.granularLegacyJitter} paramKey={'granularLegacyJitter' as keyof SliderState} unit="ms" onChange={onParamChange} {...sliderProps('granularLegacyJitter' as keyof SliderState)} />
                            <Slider label="Probability" value={state.granularLegacyProbability} paramKey={'granularLegacyProbability' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularLegacyProbability' as keyof SliderState)} />
                            <Slider label="Max Grains" value={state.granularLegacyMaxGrains} paramKey={'granularLegacyMaxGrains' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularLegacyMaxGrains' as keyof SliderState)} />
                          </div>
                          <div className="granular-grid-2" style={{ marginTop: 4 }}>
                            <Slider label="Pitch Spread" value={state.granularLegacyPitchSpread} paramKey={'granularLegacyPitchSpread' as keyof SliderState} unit="st" onChange={onParamChange} {...sliderProps('granularLegacyPitchSpread' as keyof SliderState)} />
                            <Slider label="Legacy FB" value={state.granularLegacyFeedback} paramKey={'granularLegacyFeedback' as keyof SliderState} onChange={onParamChange} {...sliderProps('granularLegacyFeedback' as keyof SliderState)} />
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <select
                              style={{ width: '100%', padding: '3px 6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: '#e0e0e0', fontSize: '0.65rem' }}
                              value={state.granularLegacyPitchMode}
                              onChange={e => onSelectChange('granularLegacyPitchMode' as keyof SliderState, e.target.value as SliderState[keyof SliderState])}
                              {...bindHelp('granularLegacyPitchMode')}
                            >
                              <option value="harmonic">Harmonic Intervals</option>
                              <option value="random">Random Pitch</option>
                            </select>
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </div>{/* end .granular-voices-panel */}

      </div>
    </div>
  );
};

export default GranularPage;
