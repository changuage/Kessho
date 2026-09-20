import React, { useState } from 'react';
import type { SequencerState, LaneDirection, ScaleName, PitchMode, PitchBindingMode, TrigCondition } from '../../audio/drumSeqTypes';
import type { SubLaneValueMode } from '../sequencer/useEuclideanSequencer';
import { seqLaneIndex } from '../../audio/drumSequencer';
import {
  clampMidiNote,
  NOTE_DEGREE_OFFSET_MIN,
  NOTE_DEGREE_OFFSET_RANGE,
  SCALES,
  normalizeNoteDegreeOffset,
  scaleDegreeToSemitone,
} from '../../audio/drumSeqTypes';
import DragNumber from './DragNumber';
import { SliderPrimitive } from '../sliderSystem';
import { SEQUENCER_SUB_LANE_COLORS } from '../../designSystem/colors';
import { DRUM_PITCH_OFFSET_LIMIT } from '../sequencer/drumPitchSequencer';
import {
  EUCLIDEAN_SUB_LANE_STEP_MAX,
  sequencerGridCellCount,
  sequencerGridColumnCount,
} from '../sequencer/sequencerLimits';
import { clampNudge, nudgeLabel } from '../sequencer/nudgeTiming';
import {
  normalizeSeqLaneRange,
  seqLaneRangeFromPercent,
  seqLaneRangeToPercent,
  type SeqLaneRange,
} from './seqLaneRange';

type LaneKind = 'trigger' | 'chord' | 'pitch' | 'expression' | 'morph' | 'distance' | 'nudge' | 'slice' | 'reverse';

const DIRECTION_LABELS: Record<LaneDirection, string> = {
  forward: '→ Forward',
  reverse: '← Reverse',
  pingpong: '↔ PingPong',
};

const PROB_DRAG_RANGE_PX = 80; // vertical pixel range for full 0–100% drag
const SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR = 3.6;
const SEQ_SUBSEQ_DRAG_DISTANCE_FACTOR = 1.8;

const FALLBACK_LANE_COLORS: Record<LaneKind, string> = {
  trigger: SEQUENCER_SUB_LANE_COLORS.pitch,
  chord: SEQUENCER_SUB_LANE_COLORS.pitch,
  pitch: SEQUENCER_SUB_LANE_COLORS.pitch,
  expression: SEQUENCER_SUB_LANE_COLORS.expression,
  morph: SEQUENCER_SUB_LANE_COLORS.morph,
  distance: SEQUENCER_SUB_LANE_COLORS.distance,
  nudge: SEQUENCER_SUB_LANE_COLORS.nudge,
  slice: SEQUENCER_SUB_LANE_COLORS.slice,
  reverse: SEQUENCER_SUB_LANE_COLORS.reverse,
};

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

function midiToPercent(midi: number): number {
  return ((Math.max(36, Math.min(96, midi)) - 36) / 60) * 100;
}

function percentToMidi(percent: number): number {
  return 36 + Math.round((Math.max(0, Math.min(100, percent)) / 100) * 60);
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

interface SeqLaneRangeSliderProps {
  label: string;
  low: number;
  high: number;
  color: string;
  toUnit?: (value: number) => number;
  fromUnit?: (value: number) => number;
  formatValue: (value: number) => string;
  onChangeRange: (min: number, max: number) => void;
}

/**
 * Shared endpoint editor for lane ranges. SliderPrimitive owns pointer/touch,
 * keyboard and RAF-coalesced range callbacks; this adapter only maps lane
 * storage values into its normalized 0–100 presentation domain.
 */
function SeqLaneRangeSlider({
  label,
  low,
  high,
  color,
  toUnit = (value) => value,
  fromUnit = (value) => value,
  formatValue,
  onChangeRange,
}: SeqLaneRangeSliderProps) {
  const authoredRange = normalizeSeqLaneRange(toUnit(low), toUnit(high));
  const sliderRange = seqLaneRangeToPercent(authoredRange);
  const displayValue = `${formatValue(fromUnit(authoredRange.min))}–${formatValue(fromUnit(authoredRange.max))}`;
  const midpoint = (sliderRange.min + sliderRange.max) * 0.5;

  return (
    <SliderPrimitive
      className="seq-lane-range-slider"
      label={label}
      mode="walk"
      value={midpoint}
      range={sliderRange}
      hero={color}
      variant="full"
      density="compact"
      displayValue={displayValue}
      formatValue={(percent) => formatValue(fromUnit(percent / 100))}
      updatePolicy="frame"
      minRangeGap={0}
      onRangeChange={(nextRange: SeqLaneRange) => {
        const normalized = seqLaneRangeFromPercent(nextRange);
        onChangeRange(fromUnit(normalized.min), fromUnit(normalized.max));
      }}
      title={`${label}: ${displayValue}. Drag either endpoint or the range band.`}
    />
  );
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
  onCycleTriggerHold?: (step: number) => void;
  onSetTriggerHold?: (step: number, holdSteps: number) => void;
  triggerHoldSteps?: readonly number[];
  triggerTieSteps?: readonly boolean[];
  triggerStepLabels?: readonly (string | null | undefined)[];
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
  /** Show the synthetic Harmony scale option before concrete scales. */
  allowHarmonyPitchScale?: boolean;
  /** Root used for pitch note labels after caller-specific resolution. */
  pitchDisplayRoot?: number;
  /** Scale intervals used for pitch note labels after caller-specific resolution. */
  pitchDisplayScaleIntervals?: readonly number[];
  /** Hide note-range mode when the caller needs direct note entry. */
  hidePitchNoteRange?: boolean;
  /** Optional selected step highlight, used for keyboard note-entry targeting. */
  selectedStep?: number | null;
  selectedStepLabel?: string;
  selectedStepKeyboardFocus?: boolean;
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
  maxSubLaneSteps?: number;
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
  onCycleTriggerHold,
  onSetTriggerHold,
  triggerHoldSteps,
  triggerTieSteps,
  triggerStepLabels,
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
  allowHarmonyPitchScale = false,
  pitchDisplayRoot,
  pitchDisplayScaleIntervals,
  selectedStep = null,
  selectedStepLabel = 'Step',
  selectedStepKeyboardFocus = true,
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
  maxSubLaneSteps = EUCLIDEAN_SUB_LANE_STEP_MAX,
}) => {
  const laneAccent = color || FALLBACK_LANE_COLORS[lane];
  const cursorMarkerStyle = getCursorMarkerStyle(laneAccent);
  const pitchScaleOptions = Object.keys(SCALES).filter((scale) => allowHarmonyPitchScale || scale !== 'Harmony');
  const resolvedPitchRoot = pitchDisplayRoot ?? sequencer.pitch.root;
  const resolvedPitchScale = pitchDisplayScaleIntervals ?? SCALES[sequencer.pitch.scale] ?? SCALES.Major;
  const showPitchRootControl = sequencer.pitch.scale !== 'Harmony';
  const laneSteps = lane === 'trigger'
    ? sequencer.trigger.steps
    : lane === 'chord'
      ? sequencer.slice.steps
    : lane === 'pitch'
      ? sequencer.pitch.steps
      : lane === 'expression'
        ? sequencer.expression.steps
        : lane === 'morph'
          ? sequencer.morph.steps
          : lane === 'distance'
            ? sequencer.distance.steps
            : lane === 'nudge'
              ? sequencer.nudge.steps
              : lane === 'slice'
                ? sequencer.slice.steps
                : sequencer.reverse.steps;

  const getValue = (step: number): number => {
    if (lane === 'pitch') return sequencer.pitch.offsets[step % sequencer.pitch.offsets.length] ?? 0;
    if (lane === 'chord') return sequencer.slice.values[step % sequencer.slice.values.length] ?? 1;
    if (lane === 'expression') return sequencer.expression.velocities[step % sequencer.expression.velocities.length] ?? 0;
    if (lane === 'morph') return sequencer.morph.values[step % sequencer.morph.values.length] ?? 0.5;
    if (lane === 'distance') return sequencer.distance.values[step % sequencer.distance.values.length] ?? 0;
    if (lane === 'nudge') return sequencer.nudge.values[step % sequencer.nudge.values.length] ?? 0;
    if (lane === 'slice') return sequencer.slice.values[step % sequencer.slice.values.length] ?? 0;
    if (lane === 'reverse') return sequencer.reverse.values[step % sequencer.reverse.values.length] ?? 0;
    return sequencer.trigger.pattern[step] ? 1 : 0;
  };

  // Drag popup state
  const [dragPopup, setDragPopup] = useState<{ x: number; y: number; text: string } | null>(null);

  const laneClassMap: Record<LaneKind, string> = {
    trigger: 'seq-lane-trigger',
    chord: 'seq-lane-chord',
    pitch: 'seq-lane-pitch',
    expression: 'seq-lane-expr',
    morph: 'seq-lane-morph',
    distance: 'seq-lane-dist',
    nudge: 'seq-lane-nudge',
    slice: 'seq-lane-slice',
    reverse: 'seq-lane-reverse',
  };

  const laneTitle: Record<LaneKind, string> = {
    trigger: '● TRIGGER (Euclidean)',
    chord: '● CHORD',
    pitch: '● PITCH',
    expression: '● EXPRESSION',
    morph: '● MORPH',
    distance: '● DISTANCE',
    nudge: '● NUDGE',
    slice: '● SLICE',
    reverse: '● REVERSE',
  };

  const hasPitchControls = lane === 'pitch' && Boolean(
    onChangePitchMode ||
    onChangePitchBindingMode ||
    onChangePitchRoot ||
    onChangePitchScale ||
    onChangePitchNoteMin ||
    onChangePitchNoteMax,
  );
  const supportsRangeMode = (lane === 'expression' || lane === 'morph' || lane === 'distance') && Boolean(onChangeValueMode && onChangeRange);
  const normalizedRangeMin = clampUnit(rangeMin ?? (lane === 'expression' ? 0.75 : lane === 'distance' ? 0 : 0.25));
  const normalizedRangeMax = clampUnit(rangeMax ?? (lane === 'expression' ? 1 : lane === 'distance' ? 1 : 0.75));
  const rangeLow = Math.min(normalizedRangeMin, normalizedRangeMax);
  const rangeHigh = Math.max(normalizedRangeMin, normalizedRangeMax);
  const laneAccentStyle = { '--lane-color': laneAccent } as React.CSSProperties;

  return (
    <div className={`seq-lane ${laneClassMap[lane]}${!enabled ? ' disabled' : ''}`} style={laneAccentStyle}>
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
              max={maxSubLaneSteps}
              label="Steps"
              onChange={(v) => onChangeSteps?.(v)}
              disabled={linked || lane === 'nudge'}
            />
            <button
              className="seq-spark-ctrl-btn"
              onClick={onCycleDirection}
              title={DIRECTION_LABELS[direction]}
            >
              {direction === 'forward' ? '→' : direction === 'reverse' ? '←' : '↔'}
            </button>
            {linked && (
              <span className="seq-link-badge">
                <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="m6 10-1.25 1.25a2.25 2.25 0 0 1-3.18-3.18l2.25-2.25a2.25 2.25 0 0 1 3.18 0" />
                  <path d="m10 6 1.25-1.25a2.25 2.25 0 0 1 3.18 3.18l-2.25 2.25a2.25 2.25 0 0 1-3.18 0" />
                  <path d="m5.75 10.25 4.5-4.5" />
                </svg>
              </span>
            )}
            {/* Pitch-specific controls */}
            {hasPitchControls && (
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
                {sequencer.pitch.mode !== 'notes' && (
                  <>
                    {showPitchRootControl && (
                      <DragNumber
                        value={sequencer.pitch.root}
                        min={0}
                        max={127}
                        label="Root"
                        displayValue={midiToName(sequencer.pitch.root)}
                        onChange={(v) => onChangePitchRoot?.(v)}
                      />
                    )}
                    <select
                      className="seq-pitch-scale"
                      value={sequencer.pitch.scale}
                      onChange={(e) => onChangePitchScale?.(e.target.value as ScaleName)}
                    >
                      {pitchScaleOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
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
      {hasPitchControls && lane === 'pitch' && sequencer.pitch.mode === 'noteRange' ? (
        <div className="seq-lane-body seq-noterange-body">
          <SeqLaneRangeSlider
            label="Note range"
            low={pitchNoteMin ?? 48}
            high={pitchNoteMax ?? 72}
            color={color}
            toUnit={(midi) => midiToPercent(midi) / 100}
            fromUnit={(unit) => percentToMidi(unit * 100)}
            formatValue={midiToName}
            onChangeRange={(min, max) => {
              onChangePitchNoteMin?.(min);
              onChangePitchNoteMax?.(max);
            }}
          />
          <div style={{ fontSize: '0.6rem', color: '#666', textAlign: 'center' }}>
            Each trigger picks a random note between {midiToName(pitchNoteMin ?? 48)} and {midiToName(pitchNoteMax ?? 72)}
          </div>
        </div>
      ) : supportsRangeMode && valueMode === 'range' ? (
        <div className="seq-lane-body seq-noterange-body">
          <SeqLaneRangeSlider
            label="Range"
            low={rangeLow}
            high={rangeHigh}
            color={color}
            formatValue={(value) => formatRangeValue(lane, value)}
            onChangeRange={(min, max) => onChangeRange?.(min, max)}
          />
          <div style={{ fontSize: '0.6rem', color: '#666', textAlign: 'center' }}>
            {getRangeHint(lane, rangeLow, rangeHigh)}
          </div>
        </div>
      ) : (
      <div className="seq-lane-body">
        {(() => {
          const visibleCells = sequencerGridCellCount(laneSteps, selectedStep);
          const columnCount = sequencerGridColumnCount(laneSteps, selectedStep);
          return (
        <div
          className="seq-step-grid"
          style={{ '--seq-grid-base-columns': columnCount } as React.CSSProperties}
        >
          {new Array(visibleCells).fill(0).map((_, step) => {
            const inRange = step < laneSteps;
            const value = inRange ? getValue(step) : 0;
            const isSelected = selectedStep === step && (lane === 'pitch' || inRange);
            const isKeyboardSelected = isSelected && selectedStepKeyboardFocus;
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
              const tie = Boolean(triggerTieSteps?.[step]);
              const startHoldSteps = Math.max(1, Math.round(triggerHoldSteps?.[step] ?? 1));
              const maxHoldSteps = Math.max(1, sequencer.trigger.steps);
              const prob = sequencer.trigger.probability[step] ?? 1.0;
              const probPct = Math.round(prob * 100);
              const trigCond: TrigCondition = sequencer.trigger.trigCondition?.[step] ?? [1, 1];
              const cellClass = ['seq-step-cell', active ? 'active' : '', tie ? 'tie' : '', isPlayhead ? 'playing' : '', isKeyboardSelected ? 'selected' : '', isSelected ? 'target' : '', !inRange ? 'inactive' : ''].filter(Boolean).join(' ');
              const showStepNumber = inRange && (isBeatHead || active || isSelected);
              const stepNumberClass = [
                'seq-step-num',
                'seq-step-select-btn',
                active ? 'active-step' : '',
                isKeyboardSelected ? 'selected' : '',
                isSelected ? 'target' : '',
              ].filter(Boolean).join(' ');

              return (
                <div key={step} className="seq-step">
                  <button
                    type="button"
                    className={stepNumberClass}
                    style={{ '--sc': color } as React.CSSProperties}
                    disabled={!showStepNumber || !onSelectStep}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (showStepNumber) onSelectStep?.(step);
                    }}
                    title={showStepNumber ? `Select trigger step ${step + 1}` : undefined}
                  >
                    {showStepNumber ? step + 1 : ''}
                  </button>
                  <button
                    type="button"
                    className={cellClass}
                    style={{ '--sc': color, touchAction: 'none' } as React.CSSProperties}
                    aria-label={`Trigger step ${step + 1}`}
                    aria-pressed={inRange ? active : undefined}
                    disabled={!inRange}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const el = e.currentTarget;
                      el.setPointerCapture(e.pointerId);
                      const startX = e.clientX;
                      const startY = e.clientY;
                      const startProb = prob;
                      const cycleHold = e.shiftKey;
                      let dragMode: 'none' | 'probability' | 'hold' = 'none';
                      let dragged = false;

                      const onMove = (ev: PointerEvent) => {
                        const deltaX = ev.clientX - startX;
                        const deltaY = ev.clientY - startY;
                        if (dragMode === 'none') {
                          const absX = Math.abs(deltaX);
                          const absY = Math.abs(deltaY);
                          if (onSetTriggerHold && active && absX > 6 && absX > absY * 1.15) {
                            dragMode = 'hold';
                          } else if (absY > 5) {
                            dragMode = 'probability';
                          }
                        }
                        if (dragMode === 'none') return;
                        dragged = true;
                        if (dragMode === 'hold') {
                          const nextHold = Math.max(1, Math.min(maxHoldSteps, startHoldSteps + Math.round(deltaX / 38)));
                          onSetTriggerHold?.(step, nextHold);
                          setDragPopup({ x: ev.clientX, y: ev.clientY, text: `Hold ${nextHold}` });
                          return;
                        }
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
                        if (!dragged && inRange) {
                          onSelectStep?.(step);
                          if (cycleHold && active && onCycleTriggerHold) {
                            onCycleTriggerHold(step);
                          } else {
                            onToggleTriggerStep?.(step);
                          }
                        }
                      };
                      el.addEventListener('pointermove', onMove);
                      el.addEventListener('pointerup', onUp);
                    }}
                    onClick={(event) => {
                      if (event.detail !== 0 || !inRange) return;
                      event.preventDefault();
                      event.stopPropagation();
                      onSelectStep?.(step);
                      if (event.shiftKey && active && onCycleTriggerHold) {
                        onCycleTriggerHold(step);
                      } else {
                        onToggleTriggerStep?.(step);
                      }
                    }}
                    onDoubleClick={() => inRange ? onResetProbability?.(step) : undefined}
                  >
                    <div className="prob-fill" style={{ height: `${probPct}%` }} />
                    <span className="prob-label">{probPct}%</span>
                    {triggerStepLabels?.[step] ? (
                      <span className="seq-step-hold-label">{triggerStepLabels[step]}</span>
                    ) : null}
                    {isKeyboardSelected && (
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

            if (lane === 'chord') {
              const slot = Math.max(1, Math.min(8, Math.round(value)));
              const norm = (slot - 1) / 7;
              const heightPct = 12.5 + norm * 87.5;

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-vel-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startNorm = norm;
                      let dragged = false;
                      const onMove = (ev: PointerEvent) => {
                        if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_SUBSEQ_DRAG_DISTANCE_FACTOR;
                        const raw = Math.max(0, Math.min(1, startNorm + (startY - ev.clientY) / dragRange));
                        const nextSlot = Math.max(1, Math.min(8, Math.round(raw * 7) + 1));
                        onChangeValue?.(step, nextSlot);
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: `Chord ${nextSlot}` });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                        if (!dragged && inRange) {
                          onSelectStep?.(step);
                        }
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 1)}
                  >
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div
                      className="seq-vel-bar"
                      style={{
                        height: `${heightPct}%`,
                        background: laneAccent,
                        opacity: 0.28 + norm * 0.62,
                      }}
                    />
                    <div className="seq-vel-label">{slot}</div>
                    <div className="seq-chord-slot-name">Slot</div>
                  </div>
                </div>
              );
            }

            if (lane === 'pitch') {
              /* ── Pitch bar: bipolar drum offsets or tonal scale degrees ── */
              const isScaleDegrees = sequencer.pitch.mode === 'semitones';
              const isFixedNotes = sequencer.pitch.mode === 'notes';
              const off = value;
              let barStyle: React.CSSProperties;
              let valText: string;
              if (isScaleDegrees) {
                const pct = normalizeNoteDegreeOffset(off) * 100;
                barStyle = { bottom: 0, top: `${100 - pct}%`, height: `${pct}%` };
                valText = `${off}`;
              } else if (isFixedNotes) {
                const pct = (clampMidiNote(off) / 127) * 100;
                barStyle = { bottom: 0, top: `${100 - pct}%`, height: `${pct}%` };
                valText = midiToName(off);
              } else {
                const norm = (off + DRUM_PITCH_OFFSET_LIMIT) / (DRUM_PITCH_OFFSET_LIMIT * 2);
                if (off >= 0) {
                  barStyle = { top: `${(1 - norm) * 100}%`, height: `${norm * 100 - 50}%` };
                } else {
                  barStyle = { top: '50%', height: `${50 - norm * 100}%` };
                }
                valText = (off >= 0 ? '+' : '') + off;
              }
              let noteName = '';
              if (isScaleDegrees) {
                const midi = resolvedPitchRoot + scaleDegreeToSemitone(off, resolvedPitchScale);
                noteName = midiToName(midi);
              } else if (isFixedNotes) {
                noteName = midiToName(off);
              }

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-pitch-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startNorm = isScaleDegrees
                        ? normalizeNoteDegreeOffset(off)
                        : isFixedNotes
                          ? clampMidiNote(off) / 127
                          : Math.max(0, Math.min(1, (off + DRUM_PITCH_OFFSET_LIMIT) / (DRUM_PITCH_OFFSET_LIMIT * 2)));
                      let dragged = false;
                      const onMove = (ev: PointerEvent) => {
                        if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR;
                        const pct = Math.max(0, Math.min(1, startNorm + (startY - ev.clientY) / dragRange));
                        const val = isScaleDegrees
                          ? Math.round(NOTE_DEGREE_OFFSET_MIN + pct * NOTE_DEGREE_OFFSET_RANGE)
                          : isFixedNotes
                            ? clampMidiNote(pct * 127)
                          : Math.round((pct - 0.5) * DRUM_PITCH_OFFSET_LIMIT * 2);
                        onChangeValue?.(step, val);
                        const label = isScaleDegrees
                          ? `deg ${val}`
                          : isFixedNotes
                            ? midiToName(val)
                            : `${val >= 0 ? '+' : ''}${val} st`;
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: label });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                        if (!dragged && inRange) {
                          onSelectStep?.(step);
                        }
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, isFixedNotes ? 60 : 0)}
                  >
                    {!isScaleDegrees && !isFixedNotes && <div className="pitch-center" />}
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div className="pitch-bar" style={barStyle} />
                    <div className="pitch-val" style={off >= 0 || isScaleDegrees || isFixedNotes ? { top: 2 } : { bottom: 2 }}>{valText}</div>
                  </div>
                  {(isScaleDegrees || isFixedNotes) && <div className="seq-pitch-note-name">{noteName}</div>}
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
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-vel-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startVal = Math.max(0, Math.min(1, vel));
                      let dragged = false;
                      const onMove = (ev: PointerEvent) => {
                        if (Math.abs(ev.clientY - startY) > 5) dragged = true;
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
                        if (!dragged && inRange) {
                          onSelectStep?.(step);
                        }
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
                        background: laneAccent,
                        opacity: Number(alpha),
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
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-morph-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startVal = Math.max(0, Math.min(1, val));
                      let dragged = false;
                      const onMove = (ev: PointerEvent) => {
                        if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR;
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
                        if (!dragged && inRange) {
                          onSelectStep?.(step);
                        }
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 0)}
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

            if (lane === 'nudge') {
              /* ── Nudge bar: signed timing offset, early below center and late above ── */
              const val = clampNudge(value);
              const heightPct = Math.abs(val) * 50;
              const barStyle: React.CSSProperties = val >= 0
                ? { top: `${50 - heightPct}%`, height: `${heightPct}%` }
                : { top: '50%', height: `${heightPct}%` };
              const labelText = nudgeLabel(val);

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-morph-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startVal = val;
                      let dragged = false;
                      const onMove = (ev: PointerEvent) => {
                        if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR;
                        const raw = clampNudge(startVal + ((startY - ev.clientY) / dragRange) * 2);
                        const snapVal = Math.round(raw * 20) / 20;
                        onChangeValue?.(step, snapVal);
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: nudgeLabel(snapVal) });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                        if (!dragged && inRange) {
                          onSelectStep?.(step);
                        }
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 0)}
                  >
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div className="morph-center" />
                    <div className="morph-bar" style={barStyle} />
                    <div className="morph-val" style={val >= 0 ? { top: 2 } : { bottom: 2 }}>{labelText}</div>
                    <div className="morph-label-a">late</div>
                    <div className="morph-label-b">early</div>
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
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
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
                        background: laneAccent,
                        opacity: 0.25 + (sliceVal / 15) * 0.75,
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
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
                  <button
                    type="button"
                    className={`seq-step-cell${isReversed ? ' active' : ''}${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ '--sc': laneAccent, touchAction: 'none', fontSize: '0.65rem' } as React.CSSProperties}
                    onClick={() => inRange ? onChangeValue?.(step, isReversed ? 0 : 1) : undefined}
                  >
                    {isReversed ? '\u25c0' : '\u25b6'}
                  </button>
                </div>
              );
            }

            /* ── Distance bar: 0..1, same box treatment as expression ── */
            {
              const val = value;
              const pct = Math.round(val * 100);
              const alpha = (0.12 + val * 0.88).toFixed(3);
              const bright = (0.45 + val * 0.55).toFixed(3);

              return (
                <div key={step} className="seq-step">
                  <span className="seq-step-num" style={{ color: laneAccent }}>{isBeatHead ? step + 1 : ''}</span>
                  <div
                    className={`seq-vel-bar-wrap${isPlayhead ? ' playing' : ''}${isSelected ? ' selected' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startVal = Math.max(0, Math.min(1, val));
                      let dragged = false;
                      const onMove = (ev: PointerEvent) => {
                        if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR;
                        const raw = Math.max(0, Math.min(1, startVal + (startY - ev.clientY) / dragRange));
                        const snapVal = Math.round(raw * 20) / 20;
                        onChangeValue?.(step, snapVal);
                        setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(snapVal * 100)}%` });
                      };
                      const onUp = () => {
                        wrap.removeEventListener('pointermove', onMove);
                        wrap.removeEventListener('pointerup', onUp);
                        setDragPopup(null);
                        if (!dragged && inRange) {
                          onSelectStep?.(step);
                        }
                      };
                      wrap.addEventListener('pointermove', onMove);
                      wrap.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => onChangeValue?.(step, 0)}
                  >
                    {isSelected && (
                      <span className="seq-step-cursor" style={cursorMarkerStyle} aria-hidden="true">
                        {selectedStepLabel}
                      </span>
                    )}
                    <div
                      className="seq-vel-bar"
                      style={{
                        height: `${val * 100}%`,
                        background: laneAccent,
                        opacity: Number(alpha),
                        filter: `brightness(${bright})`,
                      }}
                    />
                    <div className="seq-vel-label">{pct}%</div>
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
