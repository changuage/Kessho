import React, { useState } from 'react';
import type { SequencerState, LaneDirection, ScaleName, PitchMode, PitchBindingMode, TrigCondition } from '../../audio/drumSeqTypes';
import type { SubLaneValueMode } from '../sequencer/useEuclideanSequencer';
import { seqLaneIndex } from '../../audio/drumSequencer';
import {
  NOTE_DEGREE_OFFSET_MIN,
  NOTE_DEGREE_OFFSET_RANGE,
  SCALES,
  normalizeNoteDegreeOffset,
  scaleDegreeToSemitone,
} from '../../audio/drumSeqTypes';
import DragNumber from './DragNumber';

type LaneKind = 'trigger' | 'pitch' | 'expression' | 'morph' | 'distance' | 'slice' | 'reverse';

const DIRECTION_LABELS: Record<LaneDirection, string> = {
  forward: '→ Forward',
  reverse: '← Reverse',
  pingpong: '↔ PingPong',
};

const PROB_DRAG_RANGE_PX = 80; // vertical pixel range for full 0–100% drag
const SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR = 3.6;
const SEQ_SUBSEQ_DRAG_DISTANCE_FACTOR = 1.8;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function getComplementaryHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  return rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b);
}

function getCursorMarkerStyle(color: string): React.CSSProperties {
  return {
    '--cursor-color': color,
    '--cursor-accent': getComplementaryHex(color),
  } as React.CSSProperties;
}

/* ── MIDI note name helper ── */
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToName(midi: number): string {
  if (midi < 0 || midi > 127) return '';
  return (NOTE_NAMES[midi % 12] ?? '') + (Math.floor(midi / 12) - 1);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatRangeValue(lane: LaneKind, value: number): string {
  const safe = clampUnit(value);
  if (lane === 'expression' || lane === 'distance') {
    return `${Math.round(safe * 100)}%`;
  }
  if (lane === 'morph') {
    return safe >= 0.5
      ? `${Math.round((safe - 0.5) * 200)}% B`
      : `${Math.round((0.5 - safe) * 200)}% A`;
  }
  return `${Math.round(safe * 100)}%`;
}

function getRangeHint(lane: LaneKind, min: number, max: number): string {
  if (lane === 'expression') {
    return `Each trigger picks a random expression between ${formatRangeValue(lane, min)} and ${formatRangeValue(lane, max)}.`;
  }
  if (lane === 'morph') {
    return `Each trigger picks a random preset morph between ${formatRangeValue(lane, min)} and ${formatRangeValue(lane, max)}.`;
  }
  return `Each trigger picks a random distance between ${formatRangeValue(lane, min)} and ${formatRangeValue(lane, max)}.`;
}

interface SeqLaneProps {
  sequencer: SequencerState;
  lane: LaneKind;
  color: string;
  playhead: number;
  /** Hit count for sub-lane playhead (Elektron-style: advances only on triggers) */
  hitCount?: number;
  /** Whether this lane is enabled */
  enabled?: boolean;
  /** Current direction for sub-lanes */
  direction?: LaneDirection;
  onToggleTriggerStep?: (step: number) => void;
  onChangeValue?: (step: number, value: number) => void;
  /** Set per-step probability (trigger lane) */
  onSetProbability?: (step: number, value: number) => void;
  /** Double-click reset probability to 100% */
  onResetProbability?: (step: number) => void;
  /** Cycle ratchet 1→2→3→4→1 */
  onCycleRatchet?: (step: number) => void;
  /** Cycle Elektron-style trig condition */
  onCycleTrigCondition?: (step: number) => void;
  /** Toggle enable state for this sub-lane */
  onToggleEnabled?: () => void;
  /** Change sub-lane step count */
  onChangeSteps?: (steps: number) => void;
  /** Cycle sub-lane direction */
  onCycleDirection?: () => void;
  /** Whether sub-lane is linked to trigger steps */
  linked?: boolean;
  /** Pitch-specific: change mode */
  onChangePitchMode?: (mode: PitchMode) => void;
  /** Pitch-specific: change pitch binding/index mode */
  pitchBindingMode?: PitchBindingMode;
  onChangePitchBindingMode?: (mode: PitchBindingMode) => void;
  /** Pitch-specific: change root note */
  onChangePitchRoot?: (root: number) => void;
  /** Pitch-specific: change scale */
  onChangePitchScale?: (scale: ScaleName) => void;
  /** Pitch-specific: toggle scale quantize */
  onToggleScaleQuantize?: () => void;
  /** Hide note-range mode when the caller needs direct note entry. */
  hidePitchNoteRange?: boolean;
  /** Optional selected step highlight, used for keyboard note-entry targeting. */
  selectedStep?: number | null;
  selectedStepLabel?: string;
  onSelectStep?: (step: number) => void;
  /** Expression / morph / distance can switch to per-trigger range mode */
  valueMode?: SubLaneValueMode;
  onChangeValueMode?: (mode: SubLaneValueMode) => void;
  rangeMin?: number;
  rangeMax?: number;
  onChangeRange?: (min: number, max: number) => void;
  /** Note-range pitch mode: min/max MIDI notes and callbacks */
  pitchNoteMin?: number;
  pitchNoteMax?: number;
  onChangePitchNoteMin?: (v: number) => void;
  onChangePitchNoteMax?: (v: number) => void;
}

const SeqLane: React.FC<SeqLaneProps> = ({
  sequencer,
  lane,
  color,
  playhead,
  hitCount = 0,
  enabled = true,
  direction = 'forward',
  onToggleTriggerStep,
  onChangeValue,
  onSetProbability,
  onResetProbability,
  onCycleRatchet,
  onCycleTrigCondition,
  onToggleEnabled,
  onChangeSteps,
  onCycleDirection,
  linked = false,
  onChangePitchMode,
  pitchBindingMode,
  onChangePitchBindingMode,
  onChangePitchRoot,
  onChangePitchScale,
  onToggleScaleQuantize,
  selectedStep = null,
  selectedStepLabel = 'Step',
  onSelectStep,
  valueMode = 'sequence',
  onChangeValueMode,
  rangeMin,
  rangeMax,
  onChangeRange,
  pitchNoteMin,
  pitchNoteMax,
  onChangePitchNoteMin,
  onChangePitchNoteMax,
  hidePitchNoteRange = false,
}) => {
  const cursorMarkerStyle = getCursorMarkerStyle(color);
  const laneSteps = lane === 'trigger'
    ? sequencer.trigger.steps
    : lane === 'pitch'
      ? sequencer.pitch.steps
      : lane === 'expression'
        ? sequencer.expression.steps
        : lane === 'morph'
          ? sequencer.morph.steps
          : lane === 'slice'
            ? sequencer.slice.steps
            : lane === 'reverse'
              ? sequencer.reverse.steps
              : sequencer.distance.steps;

  const getValue = (step: number): number => {
    if (lane === 'pitch') return sequencer.pitch.offsets[step % sequencer.pitch.offsets.length] ?? 0;
    if (lane === 'expression') return sequencer.expression.velocities[step % sequencer.expression.velocities.length] ?? 0;
    if (lane === 'morph') return sequencer.morph.values[step % sequencer.morph.values.length] ?? 0.5;
    if (lane === 'distance') return sequencer.distance.values[step % sequencer.distance.values.length] ?? 0.5;
    if (lane === 'slice') return sequencer.slice.values[step % sequencer.slice.values.length] ?? 0;
    if (lane === 'reverse') return sequencer.reverse.values[step % sequencer.reverse.values.length] ?? 0;
    return sequencer.trigger.pattern[step] ? 1 : 0;
  };

  // Drag popup state
  const [dragPopup, setDragPopup] = useState<{ x: number; y: number; text: string } | null>(null);

  const laneClassMap: Record<LaneKind, string> = {
    trigger: 'seq-lane-trigger',
    pitch: 'seq-lane-pitch',
    expression: 'seq-lane-expr',
    morph: 'seq-lane-morph',
    distance: 'seq-lane-dist',
    slice: 'seq-lane-slice',
    reverse: 'seq-lane-reverse',
  };

  const laneTitle: Record<LaneKind, string> = {
    trigger: '● TRIGGER (Euclidean)',
    pitch: '● PITCH',
    expression: '● EXPRESSION',
    morph: '● MORPH',
    distance: '● DISTANCE',
    slice: '● SLICE',
    reverse: '● REVERSE',
  };

  const supportsRangeMode = lane === 'expression' || lane === 'morph' || lane === 'distance';
  const normalizedRangeMin = clampUnit(rangeMin ?? (lane === 'expression' ? 0.75 : 0.25));
  const normalizedRangeMax = clampUnit(rangeMax ?? (lane === 'expression' ? 1 : 0.75));
  const rangeLow = Math.min(normalizedRangeMin, normalizedRangeMax);
  const rangeHigh = Math.max(normalizedRangeMin, normalizedRangeMax);

  return (
    <div className={`seq-lane ${laneClassMap[lane]}${!enabled ? ' disabled' : ''}`}>
      {/* Lane header with controls — hidden for trigger (DrumPage has its own) */}
      {lane !== 'trigger' && (
      <div className="seq-lane-header">
        <span className="seq-lane-title">{laneTitle[lane]}</span>
          <div className="seq-lane-controls">
            <button
              className={`seq-lane-enable-btn${enabled ? ' on' : ''}`}
              onClick={onToggleEnabled}
            >
              {enabled ? 'On' : 'Off'}
            </button>
            <DragNumber
              value={laneSteps}
              min={1}
              max={16}
              label="Steps"
              onChange={(v) => onChangeSteps?.(v)}
              disabled={linked}
            />
            <button
              className="seq-spark-ctrl-btn"
              onClick={onCycleDirection}
              title={DIRECTION_LABELS[direction]}
            >
              {direction === 'forward' ? '→' : direction === 'reverse' ? '←' : '↔'}
            </button>
            {linked && <span className="seq-link-badge">🔗</span>}
            {/* Pitch-specific controls */}
            {lane === 'pitch' && (
              <div className="seq-pitch-controls">
                <select
                  className="seq-pitch-mode"
                  value={sequencer.pitch.mode}
                  onChange={(e) => onChangePitchMode?.(e.target.value as PitchMode)}
                >
                  <option value="semitones">Semitones</option>
                  <option value="notes">Notes</option>
                  {!hidePitchNoteRange && <option value="noteRange">Note Range</option>}
                </select>
                {onChangePitchBindingMode && (
                  <select
                    className="seq-pitch-mode"
                    value={pitchBindingMode ?? 'polyrhythmic'}
                    onChange={(e) => onChangePitchBindingMode(e.target.value as PitchBindingMode)}
                    title="How the pitch lane aligns with trigger steps"
                  >
                    <option value="polyrhythmic">Polyrhythmic</option>
                    <option value="linked">Linked</option>
                    <option value="sequence">Sequence</option>
                  </select>
                )}
                {sequencer.pitch.mode !== 'noteRange' && (
                  <>
                    <DragNumber
                      value={sequencer.pitch.root}
                      min={0}
                      max={127}
                      label="Root"
                      onChange={(v) => onChangePitchRoot?.(v)}
                    />
                    <select
                      className="seq-pitch-scale"
                      value={sequencer.pitch.scale}
                      onChange={(e) => onChangePitchScale?.(e.target.value as ScaleName)}
                    >
                      {Object.keys(SCALES).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <label className="seq-scale-quantize" title="Snap pitch offsets to current harmony scale">
                      <input
                        type="checkbox"
                        checked={sequencer.pitch.scaleQuantize ?? false}
                        onChange={() => onToggleScaleQuantize?.()}
                      />
                      Q
                    </label>
                  </>
                )}
              </div>
            )}
            {supportsRangeMode && (
              <div className="seq-pitch-controls">
                <select
                  className="seq-pitch-mode"
                  value={valueMode}
                  onChange={(e) => onChangeValueMode?.(e.target.value as SubLaneValueMode)}
                  title="Choose between a per-step sequencer and a per-trigger random range"
                >
                  <option value="sequence">Sequence</option>
                  <option value="range">Range</option>
                </select>
              </div>
            )}
          </div>
      </div>
      )}
      {/* Step grid — or noteRange controls when pitch mode is noteRange */}
      {lane === 'pitch' && sequencer.pitch.mode === 'noteRange' ? (
        <div className="seq-lane-body seq-noterange-body">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 4px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>
                Low: {midiToName(pitchNoteMin ?? 48)}
              </div>
              <input type="range" min={36} max={96} step={1}
                value={pitchNoteMin ?? 48}
                onChange={(e) => onChangePitchNoteMin?.(Math.min(parseInt(e.target.value), pitchNoteMax ?? 72))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>
                High: {midiToName(pitchNoteMax ?? 72)}
              </div>
              <input type="range" min={36} max={96} step={1}
                value={pitchNoteMax ?? 72}
                onChange={(e) => onChangePitchNoteMax?.(Math.max(parseInt(e.target.value), pitchNoteMin ?? 48))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
          <div style={{ fontSize: '0.6rem', color: '#666', textAlign: 'center' }}>
            Each trigger picks a random note between {midiToName(pitchNoteMin ?? 48)} and {midiToName(pitchNoteMax ?? 72)}
          </div>
        </div>
      ) : supportsRangeMode && valueMode === 'range' ? (
        <div className="seq-lane-body seq-noterange-body">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 4px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>
                Low: {formatRangeValue(lane, rangeLow)}
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={rangeLow}
                onChange={(e) => onChangeRange?.(Math.min(parseFloat(e.target.value), rangeHigh), rangeHigh)}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.65rem', color: '#888', marginBottom: '2px' }}>
                High: {formatRangeValue(lane, rangeHigh)}
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={rangeHigh}
                onChange={(e) => onChangeRange?.(rangeLow, Math.max(parseFloat(e.target.value), rangeLow))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
          <div style={{ fontSize: '0.6rem', color: '#666', textAlign: 'center' }}>
            {getRangeHint(lane, rangeLow, rangeHigh)}
          </div>
        </div>
      ) : (
      <div className="seq-lane-body">
        {(() => {
          // Adaptive: 8 columns when steps < 9, 16 when steps >= 9
          const visibleSteps = selectedStep != null && selectedStep >= 0 ? Math.max(laneSteps, selectedStep + 1) : laneSteps;
          const maxCells = visibleSteps < 9 ? 8 : 16;
          return (
        <div
          className="seq-step-grid"
          style={{ gridTemplateColumns: `repeat(${maxCells}, 1fr)` }}
        >
          {new Array(maxCells).fill(0).map((_, step) => {
            const inRange = step < laneSteps;
            const value = inRange ? getValue(step) : 0;
            const isSelected = selectedStep === step && (lane === 'pitch' || inRange);
            // Trigger lane: playhead tracks the trigger step.
            // Sub-lanes: playhead derived from hitCount (Elektron-style, advance on trigger only).
            let isPlayhead: boolean;
            if (lane === 'trigger') {
              isPlayhead = inRange && playhead % laneSteps === step;
            } else {
              const playheadMode = lane === 'pitch' && pitchBindingMode === 'sequence' ? 'step' : 'hit';
              const basis = playheadMode === 'step' ? Math.max(0, playhead) : Math.max(0, hitCount - 1);
              const idx = laneSteps > 0
                ? seqLaneIndex({ enabled: true, steps: laneSteps, direction, _ppForward: true }, basis)
                : -1;
              isPlayhead = inRange && idx === step;
            }
            const isBeatHead = step % 4 === 0;

            if (lane === 'trigger') {
              /* ── Trigger cell ── */
              const active = Boolean(value);
              const prob = sequencer.trigger.probability[step] ?? 1.0;
              const probPct = Math.round(prob * 100);
              const trigCond: TrigCondition = sequencer.trigger.trigCondition?.[step] ?? [1, 1];
              const cellClass = ['seq-step-cell', active ? 'active' : '', isPlayhead ? 'playing' : '', isSelected ? 'selected' : '', !inRange ? 'inactive' : ''].filter(Boolean).join(' ');

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num">{isBeatHead ? step + 1 : ''}</span>
                  <button
                    type="button"
                    className={cellClass}
                    style={{ '--sc': color, touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const el = e.currentTarget;
                      el.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startProb = prob;
                      let dragged = false;

                      const onMove = (ev: PointerEvent) => {
                        if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                        if (!dragged) return;
                        const pct = Math.max(0, Math.min(1,
                          startProb + (startY - ev.clientY) / PROB_DRAG_RANGE_PX
                        ));
                        const snapped = Math.round(pct * 20) / 20;
                        onSetProbability?.(step, snapped);
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(snapped * 100)}%` });
                      };
                      const onUp = () => {
                        el.removeEventListener('pointermove', onMove);
                        el.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                        if (!dragged) {
                          if (onSelectStep) onSelectStep(step);
                          else onToggleTriggerStep?.(step);
                        }
                      };
                      el.addEventListener('pointermove', onMove);
                      el.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => inRange ? onResetProbability?.(step) : undefined}
                  >
                    <div className="prob-fill" style={{ height: `${probPct}%` }} />
                    <span className="prob-label">{probPct}%</span>
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`seq-trig-cond${trigCond[1] > 1 ? ' active' : ''}`}
                    style={!inRange ? { opacity: 0.25 } : undefined}
                    onClick={() => inRange ? onCycleTrigCondition?.(step) : undefined}
                    title={`Trig condition: ${trigCond[0]}:${trigCond[1]}`}
                  >
                    {trigCond[0]}:{trigCond[1]}
                  </button>
                </div>
              );
            }

            if (lane === 'pitch') {
              /* ── Pitch bar: bipolar -24..+24 or tonal -3..14 ── */
              const isNotes = sequencer.pitch.mode === 'notes';
              const off = value;
              let barStyle: React.CSSProperties;
              let valText: string;
              if (isNotes) {
                const pct = normalizeNoteDegreeOffset(off) * 100;
                barStyle = { bottom: 0, top: `${100 - pct}%`, height: `${pct}%` };
                valText = `${off}`;
              } else {
                const norm = (off + 24) / 48;
                if (off >= 0) {
                  barStyle = { top: `${(1 - norm) * 100}%`, height: `${norm * 100 - 50}%` };
                } else {
                  barStyle = { top: '50%', height: `${50 - norm * 100}%` };
                }
                valText = (off >= 0 ? '+' : '') + off;
              }
              let noteName = '';
              if (isNotes) {
                const scale = SCALES[sequencer.pitch.scale] || [];
                const midi = sequencer.pitch.root + scaleDegreeToSemitone(off, scale);
                noteName = midiToName(midi);
              }

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: '#ff6b81' }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-pitch-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startNorm = isNotes
                        ? normalizeNoteDegreeOffset(off)
                        : Math.max(0, Math.min(1, (off + 24) / 48));
                      const onMove = (ev: PointerEvent) => {
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR;
                        const pct = Math.max(0, Math.min(1, startNorm + (startY - ev.clientY) / dragRange));
                        const val = isNotes
                          ? Math.round(NOTE_DEGREE_OFFSET_MIN + pct * NOTE_DEGREE_OFFSET_RANGE)
                          : Math.round((pct - 0.5) * 48);
                        onChangeValue?.(step, val);
                        const label = isNotes ? `deg ${val}` : `${val >= 0 ? '+' : ''}${val} st`;
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: label });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 0)}
                  >
                    {!isNotes && <div className="pitch-center" />}
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div className="pitch-bar" style={barStyle} />
                    <div className="pitch-val" style={off >= 0 || isNotes ? { top: 2 } : { bottom: 2 }}>{valText}</div>
                  </div>
                  {isNotes && <div className="seq-pitch-note-name">{noteName}</div>}
                </div>
              );
            }

            if (lane === 'expression') {
              /* ── Expression / velocity bar: 0..1, bottom-up ── */
              const vel = value;
              const pct = Math.round(vel * 100);
              const alpha = (0.12 + vel * 0.88).toFixed(3);
              const bright = (0.45 + vel * 0.55).toFixed(3);

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: '#ffa502' }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-vel-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startVal = Math.max(0, Math.min(1, vel));
                      const onMove = (ev: PointerEvent) => {
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR;
                        const raw = Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / dragRange));
                        const val = Math.round(raw * 20) / 20;
                        onChangeValue?.(step, val);
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(val * 100)}%` });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 1.0)}
                  >
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div
                      className="seq-vel-bar"
                      style={{
                        height: `${vel * 100}%`,
                        background: `rgba(255,165,2,${alpha})`,
                        filter: `brightness(${bright})`,
                      }}
                    />
                    <div className="seq-vel-label">{pct}%</div>
                  </div>
                  {/* Ratchet indicator — in expression lane for polyrhythmic ratchet patterns */}
                  {(() => {
                    const ratchet = sequencer.trigger.ratchet[step % sequencer.trigger.ratchet.length] ?? 1;
                    return (
                      <button
                        type="button"
                        className={`seq-step-ratchet${ratchet > 1 ? ` multi r${ratchet}` : ''}`}
                        style={!inRange ? { opacity: 0.25 } : undefined}
                        onClick={() => inRange ? onCycleRatchet?.(step) : undefined}
                        title={`Ratchet: ${ratchet}x`}
                      >
                        {new Array(ratchet).fill(0).map((_, i) => (
                          <span key={i} className="ratch-line" />
                        ))}
                      </button>
                    );
                  })()}
                </div>
              );
            }

            if (lane === 'morph') {
              /* ── Morph bar: 0=100% A (bottom), 1=100% B (top), center=0.5 ── */
              const val = value;
              let barStyle: React.CSSProperties;
              if (val >= 0.5) {
                const heightPct = (val - 0.5) * 100;
                barStyle = { top: `${50 - heightPct}%`, height: `${heightPct}%` };
              } else {
                const heightPct = (0.5 - val) * 100;
                barStyle = { top: '50%', height: `${heightPct}%` };
              }
              const labelText = val >= 0.5
                ? `${Math.round((val - 0.5) * 200)}% B`
                : `${Math.round((0.5 - val) * 200)}% A`;

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: '#c084fc' }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-morph-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startVal = Math.max(0, Math.min(1, val));
                      const onMove = (ev: PointerEvent) => {
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_SUBSEQ_DRAG_DISTANCE_FACTOR;
                        const raw = Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / dragRange));
                        const snapVal = Math.round(raw * 40) / 40;
                        onChangeValue?.(step, snapVal);
                        const lt = snapVal >= 0.5
                          ? `${Math.round((snapVal - 0.5) * 200)}% B`
                          : `${Math.round((0.5 - snapVal) * 200)}% A`;
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: lt });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 0.5)}
                  >
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div className="morph-center" />
                    <div className="morph-bar" style={barStyle} />
                    <div className="morph-val" style={val >= 0.5 ? { top: 2 } : { bottom: 2 }}>{labelText}</div>
                    <div className="morph-label-a">B</div>
                    <div className="morph-label-b">A</div>
                  </div>
                </div>
              );
            }

            if (lane === 'slice') {
              /* ── Slice bar: 0-15 slice index, bottom-up ── */
              const sliceVal = Math.round(value);
              const pct = (sliceVal / 15) * 100;

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: '#06b6d4' }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-vel-bar-wrap${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startNorm = Math.max(0, Math.min(1, sliceVal / 15));
                      const onMove = (ev: PointerEvent) => {
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_SUBSEQ_DRAG_DISTANCE_FACTOR;
                        const raw = Math.max(0, Math.min(1, startNorm + (startY - ev.clientY) / dragRange));
                        const newSlice = Math.round(raw * 15);
                        onChangeValue?.(step, newSlice);
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: `S${newSlice}` });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 0)}
                  >
                    <div
                      className="seq-vel-bar"
                      style={{
                        height: `${pct}%`,
                        background: `rgba(6,182,212,${(0.25 + (sliceVal / 15) * 0.75).toFixed(3)})`,
                      }}
                    />
                    <div className="seq-vel-label">S{sliceVal}</div>
                  </div>
                </div>
              );
            }

            if (lane === 'reverse') {
              /* ── Reverse toggle: 0 = forward, 1 = reverse ── */
              const isReversed = value >= 0.5;

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: '#f472b6' }}>{isBeatHead ? step + 1 : ''}</span>
                  <button
                    type="button"
                    className={`seq-step-cell${isReversed ? ' active' : ''}${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ '--sc': '#f472b6', touchAction: 'none', fontSize: '0.65rem' } as React.CSSProperties}
                    onClick={() => inRange ? onChangeValue?.(step, isReversed ? 0 : 1) : undefined}
                  >
                    {isReversed ? '\u25c0' : '\u25b6'}
                  </button>
                </div>
              );
            }

            /* ── Distance bar: bipolar 0..1, center=0.5 ── */
            {
              const val = value;
              let barStyle: React.CSSProperties;
              if (val >= 0.5) {
                const heightPct = (val - 0.5) * 100;
                barStyle = { top: `${50 - heightPct}%`, height: `${heightPct}%` };
              } else {
                const heightPct = (0.5 - val) * 100;
                barStyle = { top: '50%', height: `${heightPct}%` };
              }
              const pct = Math.round(val * 100);

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: '#2dd4bf' }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-dist-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startVal = Math.max(0, Math.min(1, val));
                      const onMove = (ev: PointerEvent) => {
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_SUBSEQ_DRAG_DISTANCE_FACTOR;
                        const raw = Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / dragRange));
                        const snapVal = Math.round(raw * 20) / 20;
                        onChangeValue?.(step, snapVal);
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(snapVal * 100)}%` });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 0.5)}
                  >
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div className="dist-center" />
                    <div className="dist-bar" style={barStyle} />
                    <div className="dist-val" style={val >= 0.5 ? { top: 2 } : { bottom: 2 }}>{pct}%</div>
                    <div className="dist-label-max">1</div>
                    <div className="dist-label-min">0</div>
                  </div>
                </div>
              );
            }
          })}
        </div>
          );
        })()}
        {lane === 'trigger' && (
          <div className="seq-step-hint">tap=toggle │ drag↕=probability │ dbl-tap=reset │ tap cond below</div>
        )}
      </div>
      )}
      {/* Drag popup overlay */}
      {dragPopup && (
        <div
          className="seq-drag-popup"
          style={{ left: dragPopup.x, top: dragPopup.y }}
        >
          {dragPopup.text}
        </div>
      )}
    </div>
  );
};

export default SeqLane;
