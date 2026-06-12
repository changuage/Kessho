import React, { useMemo } from 'react';
import type { HarmonyState } from '../../audio/harmony';
import { TEXT_SYMBOLS } from '../../designSystem/textSymbols';
import {
  formatMidiNoteName,
  formatPitchClassName,
  pitchClass,
} from './anchorWalkerMath';
import type { AnchorWalkerConfig, WalkRate } from './anchorWalkerTypes';
import { useAnchorWalkerSequencer } from './useAnchorWalkerSequencer';
import './AnchorWalkerSequencer.css';

interface AnchorWalkerSequencerBodyProps {
  config: AnchorWalkerConfig;
  laneIndex: number;
  color: string;
  harmonyState?: HarmonyState | null;
  onChange: (config: AnchorWalkerConfig) => void;
}

const WALK_RATES: readonly WalkRate[] = ['off', '1/1', '1/2', '1/4', '1/8', '1/16', '1/32'];

const GESTURE_BUTTONS = [
  { delta: 2, label: 'Up 3rd' },
  { delta: -1, label: 'Down 2nd' },
  { delta: 1, label: 'Up 2nd' },
  { delta: 4, label: 'Up 5th' },
  { delta: -2, label: 'Down 3rd' },
] as const;

function layerSummary(layer: AnchorWalkerConfig['layers'][number]): string {
  if (layer.tuning === 'diatonicOffset') return `${layer.diatonicOffset >= 0 ? '+' : ''}${layer.diatonicOffset} deg`;
  return `${layer.transposeSemitones >= 0 ? '+' : ''}${layer.transposeSemitones} st`;
}

export function AnchorWalkerSequencerBody({
  config,
  laneIndex,
  color,
  harmonyState,
  onChange,
}: AnchorWalkerSequencerBodyProps) {
  const walker = useAnchorWalkerSequencer({ config, harmonyState, onChange });
  const activePitchClasses = walker.runtime.activeSnapPitchClasses;
  const visibleNotes = useMemo(() => {
    const baseOctave = Math.floor((walker.runtime.anchorMidi ?? 60) / 12) * 12;
    return activePitchClasses.map((pc) => baseOctave + pc);
  }, [activePitchClasses, walker.runtime.anchorMidi]);
  const layerPitchClasses = new Set(walker.runtime.layerOutputMidis.map(pitchClass));
  const cursorPitchClass = walker.runtime.cursorMidi == null ? null : pitchClass(walker.runtime.cursorMidi);
  const anchorPitchClass = walker.runtime.anchorMidi == null ? null : pitchClass(walker.runtime.anchorMidi);
  const chordLabel = harmonyState
    ? `${formatPitchClassName(harmonyState.effectiveRoot ?? 0)} ${harmonyState.scaleFamily.name}`
    : 'Harmony';

  return (
    <div
      className="anchor-walker-root"
      style={{ '--lane-color': color } as React.CSSProperties}
      data-lane={laneIndex + 1}
    >
      <div className="anchor-walker-top">
        <label className="anchor-walker-label">
          {TEXT_SYMBOLS.snap} Snap
          <select
            className="anchor-walker-select"
            value={walker.config.snapSource}
            onChange={(event) => walker.updateConfig({ snapSource: event.target.value as AnchorWalkerConfig['snapSource'] })}
          >
            <option value="harmonyEngine">Harmony</option>
            <option value="manualVoicing">Voicing</option>
            <option value="chordStep">Chord</option>
            <option value="customPitchClasses">Custom</option>
            <option value="liveBlueKeys">Blue Keys</option>
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
            <option value="selectedNote">Selected</option>
            <option value="lastPlayed">Last</option>
            <option value="manualLatch">Latch</option>
          </select>
        </label>
        <label className="anchor-walker-label">
          Mode
          <select
            className="anchor-walker-select"
            value={walker.config.mode}
            onChange={(event) => walker.updateConfig({ mode: event.target.value as AnchorWalkerConfig['mode'] })}
          >
            <option value="hybrid">Hybrid</option>
            <option value="compactPad">Pad</option>
            <option value="fullMidi">Full MIDI</option>
          </select>
        </label>
        <label className="anchor-walker-label">
          Auto
          <select
            className="anchor-walker-select"
            value={walker.config.autoRate}
            onChange={(event) => walker.updateConfig({ autoRate: event.target.value as WalkRate })}
          >
            {WALK_RATES.map((rate) => <option key={rate} value={rate}>{rate === 'off' ? 'Off' : rate}</option>)}
          </select>
        </label>
        <button
          type="button"
          className={`anchor-walker-toggle${walker.config.leadMode ? ' on' : ''}`}
          onClick={() => walker.updateConfig({ leadMode: !walker.config.leadMode })}
        >
          Lead
        </button>
        <button
          type="button"
          className={`anchor-walker-toggle${walker.config.mwToVelocity ? ' on' : ''}`}
          onClick={() => walker.updateConfig({ mwToVelocity: !walker.config.mwToVelocity })}
        >
          MW-&gt;Vel
        </button>
      </div>

      <div className="anchor-walker-main">
        <div className="anchor-walker-card">
          <div className="anchor-walker-card-title">
            <span>{chordLabel}</span>
            <span>Anchor {walker.anchorLabel} / Cursor {walker.cursorLabel}</span>
          </div>
          <div className="anchor-walker-pitch-strip">
            {visibleNotes.map((midi) => {
              const pc = pitchClass(midi);
              return (
                <div
                  key={pc}
                  className={[
                    'anchor-walker-note',
                    pc === anchorPitchClass ? 'anchor' : '',
                    pc === cursorPitchClass ? 'cursor' : '',
                    layerPitchClasses.has(pc) ? 'layers' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {formatPitchClassName(pc)}
                </div>
              );
            })}
          </div>
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
                className="anchor-walker-pad-button"
                data-delta={button.delta}
                onClick={() => walker.moveByDelta(button.delta)}
              >
                {button.label}
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

      <div className="anchor-walker-card">
        <div className="anchor-walker-card-title">
          <span>Gesture Pattern</span>
          <span>{walker.config.autoFeel}</span>
        </div>
        <div className="anchor-walker-pattern">
          {walker.config.gesturePattern.slice(0, walker.config.gesturePatternLength).map((delta, index) => (
            <span key={`${index}-${delta}`}>{delta > 0 ? `+${delta}` : delta}</span>
          ))}
        </div>
        <div className="anchor-walker-card-title" style={{ marginTop: 8, marginBottom: 0 }}>
          <span>Layer Output</span>
          <span>{walker.runtime.layerOutputMidis.map(formatMidiNoteName).join(' / ') || 'Off'}</span>
        </div>
      </div>
    </div>
  );
}

export default AnchorWalkerSequencerBody;
