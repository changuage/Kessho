import { useCallback, useMemo, useState } from 'react';
import type { HarmonyState } from '../../audio/harmony';
import {
  ANCHOR_WALKER_LAYER_PRESETS,
  applyAnchorWalkerLayerPreset,
  normalizeAnchorWalkerConfig,
  type AnchorWalkerConfig,
  type AnchorWalkerPerformanceEvent,
  type AnchorWalkerRuntimeViewState,
} from './anchorWalkerTypes';
import {
  applyLayer,
  buildPitchLattice,
  degreeToMidiBounded,
  formatMidiNoteName,
  pitchClassMaskToPitchClasses,
  resolveAnchorWalkerSnapMask,
} from './anchorWalkerMath';

export interface UseAnchorWalkerSequencerArgs {
  config: AnchorWalkerConfig;
  harmonyState?: HarmonyState | null;
  onChange: (config: AnchorWalkerConfig) => void;
  onPerformanceEvent?: (event: AnchorWalkerPerformanceEvent) => void;
  runtimeState?: AnchorWalkerRuntimeViewState | null;
}

export function useAnchorWalkerSequencer({
  config,
  harmonyState,
  onChange,
  onPerformanceEvent,
  runtimeState,
}: UseAnchorWalkerSequencerArgs) {
  const safeConfig = useMemo(() => normalizeAnchorWalkerConfig(config), [config]);
  const [cursorDegree, setCursorDegree] = useState(0);
  const [previousCursorDegree, setPreviousCursorDegree] = useState(0);
  const [lastGestureDelta, setLastGestureDelta] = useState(safeConfig.activePadDelta || 1);
  const [heldGestureDelta, setHeldGestureDelta] = useState(0);

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

  const cursorMidi = useMemo(
    () => degreeToMidiBounded(cursorDegree, lattice, anchorMidi, safeConfig.boundaryMode),
    [anchorMidi, cursorDegree, lattice, safeConfig.boundaryMode],
  );
  const previousCursorMidi = useMemo(
    () => degreeToMidiBounded(previousCursorDegree, lattice, anchorMidi, safeConfig.boundaryMode),
    [anchorMidi, lattice, previousCursorDegree, safeConfig.boundaryMode],
  );

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

  const previewRuntime: AnchorWalkerRuntimeViewState = useMemo(() => ({
    anchorMidi,
    cursorMidi,
    previousCursorMidi,
    cursorDegree,
    activeSnapPitchClasses: pitchClassMaskToPitchClasses(snapMask),
    layerOutputMidis,
    lastGestureDelta,
    direction: cursorMidi > previousCursorMidi ? 'up' : cursorMidi < previousCursorMidi ? 'down' : 'none',
    isGestureHeld: heldGestureDelta !== 0,
    isWalking: safeConfig.enabled && (
      heldGestureDelta !== 0 ||
      (safeConfig.triggerMode === 'autoClock' && safeConfig.autoRate !== 'off')
    ),
    boundaryEvent: 'none',
  }), [
    anchorMidi,
    cursorDegree,
    cursorMidi,
    heldGestureDelta,
    lastGestureDelta,
    layerOutputMidis,
    previousCursorMidi,
    safeConfig.autoRate,
    safeConfig.enabled,
    safeConfig.triggerMode,
    snapMask,
  ]);
  const runtime: AnchorWalkerRuntimeViewState = useMemo(() => {
    if (!runtimeState) return previewRuntime;
    return {
      ...previewRuntime,
      ...runtimeState,
      anchorMidi: runtimeState.anchorMidi ?? previewRuntime.anchorMidi,
      cursorMidi: runtimeState.cursorMidi ?? previewRuntime.cursorMidi,
      previousCursorMidi: runtimeState.previousCursorMidi ?? previewRuntime.previousCursorMidi,
      activeSnapPitchClasses: safeConfig.snapSource === 'customPitchClasses'
        ? previewRuntime.activeSnapPitchClasses
        : runtimeState.activeSnapPitchClasses.length > 0
        ? runtimeState.activeSnapPitchClasses
        : previewRuntime.activeSnapPitchClasses,
      layerOutputMidis: runtimeState.layerOutputMidis.length > 0
        ? runtimeState.layerOutputMidis
        : previewRuntime.layerOutputMidis,
      linkedOutputMidis: runtimeState.linkedOutputMidis ?? previewRuntime.linkedOutputMidis,
    };
  }, [previewRuntime, runtimeState, safeConfig.snapSource]);

  const updateConfig = useCallback((patch: Partial<AnchorWalkerConfig>) => {
    onChange(normalizeAnchorWalkerConfig({ ...safeConfig, ...patch }));
  }, [onChange, safeConfig]);

  const emitPerformanceEvent = useCallback((event: AnchorWalkerPerformanceEvent) => {
    onPerformanceEvent?.(event);
  }, [onPerformanceEvent]);

  const previewDelta = useCallback((delta: number) => {
    const safeDelta = Math.max(-7, Math.min(7, Math.round(delta)));
    if (safeDelta === 0) return 0;
    setLastGestureDelta(safeDelta);
    setCursorDegree((current) => {
      setPreviousCursorDegree(current);
      return current + safeDelta;
    });
    return safeDelta;
  }, []);

  const gestureDown = useCallback((delta: number, velocity = 1) => {
    const safeDelta = previewDelta(delta);
    if (safeDelta === 0) return;
    setHeldGestureDelta(safeDelta);
    emitPerformanceEvent({ action: 'gestureDown', delta: safeDelta, velocity });
    const nextTriggerMode = safeConfig.playMode === 'gridPattern' ? 'stepGrid' : 'gestureHold';
    if (safeConfig.triggerMode !== nextTriggerMode) {
      updateConfig({ triggerMode: nextTriggerMode });
    }
  }, [emitPerformanceEvent, previewDelta, safeConfig.playMode, safeConfig.triggerMode, updateConfig]);

  const gestureUp = useCallback((_delta?: number) => {
    setHeldGestureDelta(0);
    emitPerformanceEvent({ action: 'gestureUp' });
  }, [emitPerformanceEvent]);

  const gestureTap = useCallback((delta: number, velocity = 1) => {
    const safeDelta = previewDelta(delta);
    if (safeDelta === 0) return;
    emitPerformanceEvent({ action: 'gestureTap', delta: safeDelta, velocity });
  }, [emitPerformanceEvent, previewDelta]);

  const moveByDelta = useCallback((delta: number) => {
    const safeDelta = previewDelta(delta);
    if (safeDelta === 0) return;
    emitPerformanceEvent({ action: 'gestureTap', delta: safeDelta, velocity: 1 });
  }, [emitPerformanceEvent, previewDelta]);

  const resetCursor = useCallback(() => {
    setCursorDegree(0);
    setPreviousCursorDegree(0);
    setLastGestureDelta(safeConfig.activePadDelta || 1);
    setHeldGestureDelta(0);
    emitPerformanceEvent({ action: 'resetCursor' });
  }, [emitPerformanceEvent, safeConfig.activePadDelta]);

  const setManualAnchor = useCallback((midi: number) => {
    const safeMidi = Math.max(0, Math.min(127, Number.isFinite(midi) ? midi : safeConfig.manualAnchorMidi));
    setCursorDegree(0);
    setPreviousCursorDegree(0);
    setHeldGestureDelta(0);
    updateConfig({ anchorSource: 'manualLatch', manualAnchorMidi: safeMidi });
    emitPerformanceEvent({ action: 'setManualAnchor', midi: safeMidi });
  }, [emitPerformanceEvent, safeConfig.manualAnchorMidi, updateConfig]);

  const latchManualAnchor = useCallback(() => {
    setManualAnchor(runtime.cursorMidi ?? runtime.anchorMidi ?? safeConfig.manualAnchorMidi);
  }, [runtime.anchorMidi, runtime.cursorMidi, safeConfig.manualAnchorMidi, setManualAnchor]);

  const releaseManualAnchor = useCallback(() => {
    setHeldGestureDelta(0);
    emitPerformanceEvent({ action: 'gestureUp' });
  }, [emitPerformanceEvent]);

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
    gestureDown,
    gestureUp,
    gestureTap,
    moveByDelta,
    resetCursor,
    setManualAnchor,
    latchManualAnchor,
    releaseManualAnchor,
    setLayerPreset,
    setSpreadMs,
  };
}
