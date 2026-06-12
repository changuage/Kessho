import { useCallback, useMemo, useState } from 'react';
import type { HarmonyState } from '../../audio/harmony';
import {
  ANCHOR_WALKER_LAYER_PRESETS,
  applyAnchorWalkerLayerPreset,
  normalizeAnchorWalkerConfig,
  type AnchorWalkerConfig,
  type AnchorWalkerRuntimeViewState,
} from './anchorWalkerTypes';
import {
  applyLayer,
  buildPitchLattice,
  degreeToMidi,
  formatMidiNoteName,
  pitchClassMaskToPitchClasses,
  resolveAnchorWalkerSnapMask,
} from './anchorWalkerMath';

export interface UseAnchorWalkerSequencerArgs {
  config: AnchorWalkerConfig;
  harmonyState?: HarmonyState | null;
  onChange: (config: AnchorWalkerConfig) => void;
}

export function useAnchorWalkerSequencer({
  config,
  harmonyState,
  onChange,
}: UseAnchorWalkerSequencerArgs) {
  const safeConfig = useMemo(() => normalizeAnchorWalkerConfig(config), [config]);
  const [cursorDegree, setCursorDegree] = useState(0);
  const [lastGestureDelta, setLastGestureDelta] = useState(safeConfig.activePadDelta || 1);

  const snapMask = useMemo(() => resolveAnchorWalkerSnapMask({
    snapSource: safeConfig.snapSource,
    customPitchClasses: safeConfig.customPitchClasses,
    harmonyState,
  }), [harmonyState, safeConfig.customPitchClasses, safeConfig.snapSource]);

  const anchorMidi = useMemo(() => {
    if (safeConfig.anchorSource === 'harmonyRoot' && typeof harmonyState?.effectiveRoot === 'number') {
      const pitchClass = ((Math.round(harmonyState.effectiveRoot) % 12) + 12) % 12;
      return 60 + pitchClass;
    }
    return safeConfig.manualAnchorMidi;
  }, [harmonyState, safeConfig.anchorSource, safeConfig.manualAnchorMidi]);

  const lattice = useMemo(() => buildPitchLattice(
    anchorMidi,
    snapMask,
    safeConfig.outputRangeMin,
    safeConfig.outputRangeMax,
  ), [anchorMidi, safeConfig.outputRangeMax, safeConfig.outputRangeMin, snapMask]);

  const cursorMidi = useMemo(() => degreeToMidi(cursorDegree, lattice, anchorMidi), [anchorMidi, cursorDegree, lattice]);

  const layerOutputMidis = useMemo(() => safeConfig.layers
    .filter((layer) => layer.enabled)
    .map((layer) => applyLayer(cursorMidi, layer, snapMask, anchorMidi, safeConfig.outputRangeMin, safeConfig.outputRangeMax)), [
    anchorMidi,
    cursorMidi,
    safeConfig.layers,
    safeConfig.outputRangeMax,
    safeConfig.outputRangeMin,
    snapMask,
  ]);

  const runtime: AnchorWalkerRuntimeViewState = useMemo(() => ({
    anchorMidi,
    cursorMidi,
    cursorDegree,
    activeSnapPitchClasses: pitchClassMaskToPitchClasses(snapMask),
    layerOutputMidis,
    lastGestureDelta,
    isWalking: safeConfig.autoRate !== 'off' || lastGestureDelta !== 0,
  }), [anchorMidi, cursorDegree, cursorMidi, lastGestureDelta, layerOutputMidis, safeConfig.autoRate, snapMask]);

  const updateConfig = useCallback((patch: Partial<AnchorWalkerConfig>) => {
    onChange(normalizeAnchorWalkerConfig({ ...safeConfig, ...patch }));
  }, [onChange, safeConfig]);

  const moveByDelta = useCallback((delta: number) => {
    const safeDelta = Math.max(-7, Math.min(7, Math.round(delta)));
    if (safeDelta === 0) return;
    setLastGestureDelta(safeDelta);
    setCursorDegree((current) => current + safeDelta);
    updateConfig({ activePadDelta: safeDelta });
  }, [updateConfig]);

  const resetCursor = useCallback(() => {
    setCursorDegree(0);
    setLastGestureDelta(safeConfig.activePadDelta || 1);
  }, [safeConfig.activePadDelta]);

  const setLayerPreset = useCallback((presetId: string) => {
    onChange(applyAnchorWalkerLayerPreset(safeConfig, presetId));
  }, [onChange, safeConfig]);

  const setSpreadMs = useCallback((spreadMs: number) => {
    const safeSpread = Math.max(0, Math.min(500, Math.round(spreadMs)));
    updateConfig({
      spreadMs: safeSpread,
      layers: safeConfig.layers.map((layer, index) => ({ ...layer, delayMs: index * safeSpread })),
    });
  }, [safeConfig.layers, updateConfig]);

  return {
    config: safeConfig,
    runtime,
    lattice,
    cursorLabel: formatMidiNoteName(cursorMidi),
    anchorLabel: formatMidiNoteName(anchorMidi),
    layerPresets: ANCHOR_WALKER_LAYER_PRESETS,
    updateConfig,
    moveByDelta,
    resetCursor,
    setLayerPreset,
    setSpreadMs,
  };
}
