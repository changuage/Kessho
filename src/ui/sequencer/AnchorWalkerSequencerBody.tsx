import React, { useEffect, useRef, useState } from 'react';
import type { HarmonyState } from '../../audio/harmony';
import { TEXT_SYMBOLS } from '../../designSystem/textSymbols';
import type { AnchorWalkerConfig, AnchorWalkerPerformanceEvent, AnchorWalkerRuntimeViewState, WalkerPlayMode } from './anchorWalkerTypes';
import { formatPitchClassName } from './anchorWalkerMath';
import AnchorWalkerKeyboardVisualizer from './AnchorWalkerKeyboardVisualizer';
import { useAnchorWalkerSequencer } from './useAnchorWalkerSequencer';
import './AnchorWalkerSequencer.css';

interface AnchorWalkerSequencerBodyProps {
  config: AnchorWalkerConfig;
  laneIndex: number;
  color: string;
  harmonyState?: HarmonyState | null;
  runtimeState?: AnchorWalkerRuntimeViewState | null;
  onChange: (config: AnchorWalkerConfig) => void;
  onPerformanceEvent?: (event: AnchorWalkerPerformanceEvent) => void;
}

const GESTURE_BUTTONS = [
  { delta: 4, label: '+5th', shortcut: 'H' },
  { delta: -2, label: '-3rd', shortcut: 'S' },
  { delta: 2, label: '+3rd', shortcut: 'G' },
  { delta: -1, label: '-2nd', shortcut: 'D' },
  { delta: 1, label: '+2nd', shortcut: 'F' },
  { delta: -4, label: '-5th', shortcut: 'A' },
] as const;

const KEYBOARD_GESTURES: Readonly<Record<string, number>> = {
  a: -4,
  s: -2,
  d: -1,
  f: 1,
  g: 2,
  h: 4,
};

const PITCH_CLASSES = Array.from({ length: 12 }, (_, index) => index);

function layerSummary(layer: AnchorWalkerConfig['layers'][number]): string {
  if (layer.tuning === 'diatonicOffset') return `${layer.diatonicOffset >= 0 ? '+' : ''}${layer.diatonicOffset} deg`;
  return `${layer.transposeSemitones >= 0 ? '+' : ''}${layer.transposeSemitones} st`;
}

export function AnchorWalkerSequencerBody({
  config,
  laneIndex,
  color,
  harmonyState,
  runtimeState,
  onChange,
  onPerformanceEvent,
}: AnchorWalkerSequencerBodyProps) {
  const walker = useAnchorWalkerSequencer({ config, harmonyState, onChange, onPerformanceEvent, runtimeState });
  const gestureDownRef = useRef(walker.gestureDown);
  const gestureUpRef = useRef(walker.gestureUp);
  const latchManualAnchorRef = useRef(walker.latchManualAnchor);
  const releaseManualAnchorRef = useRef(walker.releaseManualAnchor);
  const heldKeysRef = useRef(new Set<string>());
  const [activeGestureDeltas, setActiveGestureDeltas] = useState<Set<number>>(() => new Set());
  gestureDownRef.current = walker.gestureDown;
  gestureUpRef.current = walker.gestureUp;
  latchManualAnchorRef.current = walker.latchManualAnchor;
  releaseManualAnchorRef.current = walker.releaseManualAnchor;
  const chordLabel = harmonyState
    ? (walker.config.snapSource === 'customPitchClasses' ? 'Custom Scale' : harmonyState.scaleFamily.name)
    : 'Harmony';

  useEffect(() => {
    const editableSelector = 'input, select, textarea, [contenteditable="true"]';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(editableSelector)) return;
      if (event.code === 'Space' && config.anchorSource === 'manualLatch') {
        if (heldKeysRef.current.has('space')) return;
        heldKeysRef.current.add('space');
        latchManualAnchorRef.current();
        event.preventDefault();
        return;
      }
      const key = event.key.toLowerCase();
      const delta = KEYBOARD_GESTURES[key];
      if (delta == null || heldKeysRef.current.has(key)) return;
      heldKeysRef.current.add(key);
      setActiveGestureDeltas((current) => {
        const next = new Set(current);
        next.add(delta);
        return next;
      });
      gestureDownRef.current(delta);
      event.preventDefault();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        if (!heldKeysRef.current.delete('space')) return;
        if (config.anchorSource === 'manualLatch') {
          releaseManualAnchorRef.current();
          event.preventDefault();
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (!heldKeysRef.current.delete(key)) return;
      const delta = KEYBOARD_GESTURES[key];
      if (delta == null) return;
      setActiveGestureDeltas((current) => {
        const next = new Set(current);
        next.delete(delta);
        return next;
      });
      gestureUpRef.current(delta);
      event.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (heldKeysRef.current.size > 0) {
        gestureUpRef.current();
        heldKeysRef.current.clear();
        setActiveGestureDeltas(new Set());
      }
    };
  }, [config.anchorSource]);

  const markGestureActive = (delta: number, active: boolean) => {
    setActiveGestureDeltas((current) => {
      const next = new Set(current);
      if (active) next.add(delta);
      else next.delete(delta);
      return next;
    });
  };

  const setPlayMode = (playMode: WalkerPlayMode) => {
    walker.updateConfig({
      playMode,
      triggerMode: playMode === 'gridPattern' ? 'stepGrid' : 'gestureHold',
      mode: 'hybrid',
    });
  };

  const setScaleSource = (snapSource: AnchorWalkerConfig['snapSource']) => {
    if (snapSource === 'customPitchClasses' && walker.config.snapSource !== 'customPitchClasses') {
      walker.updateConfig({ snapSource, customPitchClasses: walker.runtime.activeSnapPitchClasses });
      return;
    }
    walker.updateConfig({ snapSource });
  };

  const toggleCustomPitchClass = (pitchClass: number) => {
    const current = new Set(walker.config.customPitchClasses);
    if (current.has(pitchClass)) {
      if (current.size > 1) current.delete(pitchClass);
    } else {
      current.add(pitchClass);
    }
    walker.updateConfig({
      snapSource: 'customPitchClasses',
      customPitchClasses: [...current],
    });
  };

  return (
    <div
      className="anchor-walker-root"
      style={{ '--lane-color': color } as React.CSSProperties}
      data-lane={laneIndex + 1}
    >
      <div className="anchor-walker-top">
        <label className="anchor-walker-label">
          Input
          <select
            className="anchor-walker-select"
            value={walker.config.playMode}
            onChange={(event) => setPlayMode(event.target.value as WalkerPlayMode)}
          >
            <option value="hybridPlay">Hybrid</option>
            <option value="gridPattern">Grid</option>
          </select>
        </label>
        <label className="anchor-walker-label">
          Scale
          <select
            className="anchor-walker-select"
            aria-label="Walker scale"
            value={walker.config.snapSource}
            onChange={(event) => setScaleSource(event.target.value as AnchorWalkerConfig['snapSource'])}
          >
            <option value="harmonyEngine">Harmony</option>
            <option value="customPitchClasses">Custom</option>
          </select>
        </label>
        <label className="anchor-walker-label">
          {TEXT_SYMBOLS.anchor} Anchor
          <select
            className="anchor-walker-select"
            value={walker.config.anchorSource}
            onChange={(event) => walker.updateConfig({ anchorSource: event.target.value as AnchorWalkerConfig['anchorSource'] })}
          >
            <option value="harmonyRoot">Root</option>
            <option value="manualLatch">Latch</option>
          </select>
        </label>
        <label className="anchor-walker-label">
          Boundary
          <select
            className="anchor-walker-select"
            value={walker.config.boundaryMode}
            onChange={(event) => walker.updateConfig({ boundaryMode: event.target.value as AnchorWalkerConfig['boundaryMode'] })}
          >
            <option value="fold">Fold</option>
            <option value="wrap">Wrap</option>
            <option value="clamp">Clamp</option>
          </select>
        </label>
      </div>

      <div className="anchor-walker-main">
        <div className="anchor-walker-card">
          <div className="anchor-walker-card-title">
            <span>{chordLabel}</span>
            <span>Anchor {walker.anchorLabel} / Cursor {walker.cursorLabel}</span>
          </div>
          {walker.config.snapSource === 'customPitchClasses' ? (
            <div className="anchor-walker-scale-editor" aria-label="Custom Walker scale">
              {PITCH_CLASSES.map((pitchClass) => {
                const active = walker.config.customPitchClasses.includes(pitchClass);
                return (
                  <button
                    key={pitchClass}
                    type="button"
                    className={`anchor-walker-scale-note${active ? ' active' : ''}`}
                    onClick={() => toggleCustomPitchClass(pitchClass)}
                  >
                    {formatPitchClassName(pitchClass)}
                  </button>
                );
              })}
            </div>
          ) : null}
          <AnchorWalkerKeyboardVisualizer
            anchorMidi={walker.runtime.anchorMidi}
            cursorMidi={walker.runtime.cursorMidi}
            previousCursorMidi={walker.runtime.previousCursorMidi}
            snapPitchClasses={walker.runtime.activeSnapPitchClasses}
            layerOutputMidis={walker.runtime.layerOutputMidis}
            linkedOutputMidis={[]}
            outputRangeMin={walker.config.outputRangeMin}
            outputRangeMax={walker.config.outputRangeMax}
            range="oneOctave"
            direction={walker.runtime.direction}
            boundaryEvent={walker.runtime.boundaryEvent}
            color={color}
            onAnchorSelect={(midi) => walker.setManualAnchor(midi)}
          />
        </div>

        <div className="anchor-walker-card">
          <div className="anchor-walker-card-title">
            <span>{TEXT_SYMBOLS.walker} Gesture Pad</span>
            <button type="button" className="anchor-walker-toggle" onClick={walker.resetCursor}>Reset</button>
          </div>
          <div className="anchor-walker-gesture-pad">
            {GESTURE_BUTTONS.map((button) => (
              <button
                key={button.delta}
                type="button"
                className={`anchor-walker-pad-button${activeGestureDeltas.has(button.delta) ? ' active' : ''}`}
                data-delta={button.delta}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  markGestureActive(button.delta, true);
                  walker.gestureDown(button.delta);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  markGestureActive(button.delta, false);
                  walker.gestureUp(button.delta);
                }}
                onPointerCancel={() => {
                  markGestureActive(button.delta, false);
                  walker.gestureUp(button.delta);
                }}
                onBlur={() => {
                  markGestureActive(button.delta, false);
                  walker.gestureUp(button.delta);
                }}
              >
                <span>{button.label}</span>
                <kbd>{button.shortcut}</kbd>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="anchor-walker-card">
        <div className="anchor-walker-card-title">
          <span>{TEXT_SYMBOLS.layers} Layers</span>
          <label className="anchor-walker-label">
            Preset
            <select
              className="anchor-walker-select"
              value={walker.config.layerPreset}
              onChange={(event) => walker.setLayerPreset(event.target.value)}
            >
              {walker.layerPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label className="anchor-walker-label">
            Spread {Math.round(walker.config.spreadMs)}ms
            <input
              className="anchor-walker-range"
              type="range"
              min={0}
              max={140}
              step={5}
              value={walker.config.spreadMs}
              onChange={(event) => walker.setSpreadMs(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="anchor-walker-layer-stack">
          {walker.config.layers.map((layer, index) => (
            <div key={layer.id} className={`anchor-walker-layer${layer.enabled ? ' on' : ''}`}>
              <button
                type="button"
                onClick={() => walker.updateConfig({
                  layers: walker.config.layers.map((item, layerIndex) => (
                    layerIndex === index ? { ...item, enabled: !item.enabled } : item
                  )),
                })}
              >
                {layer.enabled ? '1' : '0'}
              </button>
              <span><strong>{layer.label}</strong> {layerSummary(layer)} / {Math.round(layer.delayMs)}ms</span>
              <span>{Math.round(layer.velocityScale * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

export default AnchorWalkerSequencerBody;
