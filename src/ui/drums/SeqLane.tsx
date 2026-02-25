import React, { useState } from 'react';
import type { SequencerState, LaneDirection, ScaleName, PitchMode, TrigCondition } from '../../audio/drumSeqTypes';
import { SCALES } from '../../audio/drumSeqTypes';
import DragNumber from './DragNumber';

type LaneKind = 'trigger' | 'pitch' | 'expression' | 'morph' | 'distance';

const DIRECTION_LABELS: Record<LaneDirection, string> = {
  forward: '→ Forward',
  reverse: '← Reverse',
  pingpong: '↔ PingPong',
};

const PROB_DRAG_RANGE_PX = 80; // vertical pixel range for full 0–100% drag
const SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR = 3.6;
const SEQ_SUBSEQ_DRAG_DISTANCE_FACTOR = 1.8;

/* ── MIDI note name helper ── */
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToName(midi: number): string {
  if (midi < 0 || midi > 127) return '';
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}
function scaleDegreeToSemitone(degree: number, scale: number[]): number {
  if (degree <= 0) return 0;
  const oct = Math.floor(degree / scale.length);
  const idx = degree % scale.length;
  return oct * 12 + (scale[idx] ?? 0);
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
  /** Pitch-specific: change root note */
  onChangePitchRoot?: (root: number) => void;
  /** Pitch-specific: change scale */
  onChangePitchScale?: (scale: ScaleName) => void;
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
  onChangePitchRoot,
  onChangePitchScale,
}) => {
  // Sub-lanes use their own step count; trigger uses trigger.steps
  const laneSteps = lane === 'trigger'
    ? sequencer.trigger.steps
    : lane === 'pitch'
      ? sequencer.pitch.steps
      : lane === 'expression'
        ? sequencer.expression.steps
        : lane === 'morph'
          ? sequencer.morph.steps
          : sequencer.distance.steps;

  const getValue = (step: number): number => {
    if (lane === 'pitch') return sequencer.pitch.offsets[step % sequencer.pitch.offsets.length] ?? 0;
    if (lane === 'expression') return sequencer.expression.velocities[step % sequencer.expression.velocities.length] ?? 0;
    if (lane === 'morph') return sequencer.morph.values[step % sequencer.morph.values.length] ?? 0.5;
    if (lane === 'distance') return sequencer.distance.values[step % sequencer.distance.values.length] ?? 0.5;
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
  };

  const laneTitle: Record<LaneKind, string> = {
    trigger: '● TRIGGER (Euclidean)',
    pitch: '● PITCH',
    expression: '● EXPRESSION',
    morph: '● MORPH',
    distance: '● DISTANCE',
  };

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
                </select>
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
              </div>
            )}
          </div>
      </div>
      )}
      {/* Step grid */}
      <div className="seq-lane-body">
        {(() => {
          // Adaptive: 8 columns when steps < 9, 16 when steps >= 9
          const maxCells = laneSteps < 9 ? 8 : 16;
          return (
        <div
          className="seq-step-grid"
          style={{ gridTemplateColumns: `repeat(${maxCells}, 1fr)` }}
        >
          {new Array(maxCells).fill(0).map((_, step) => {
            const inRange = step < laneSteps;
            const value = inRange ? getValue(step) : 0;
            // Trigger lane: playhead tracks the trigger step.
            // Sub-lanes: playhead derived from hitCount (Elektron-style, advance on trigger only).
            let isPlayhead: boolean;
            if (lane === 'trigger') {
              isPlayhead = inRange && playhead % laneSteps === step;
            } else {
              // Compute sub-lane index from hitCount, respecting direction
              const basis = hitCount;
              let idx = ((basis % laneSteps) + laneSteps) % laneSteps;
              if (direction === 'reverse') {
                idx = laneSteps - 1 - idx;
              } else if (direction === 'pingpong') {
                const cycle = laneSteps > 1 ? laneSteps * 2 - 2 : 1;
                const p = ((basis % cycle) + cycle) % cycle;
                idx = p < laneSteps ? p : cycle - p;
              }
              isPlayhead = inRange && idx === step;
            }
            const isBeatHead = step % 4 === 0;

            if (lane === 'trigger') {
              /* ── Trigger cell ── */
              const active = Boolean(value);
              const prob = sequencer.trigger.probability[step] ?? 1.0;
              const probPct = Math.round(prob * 100);
              const trigCond: TrigCondition = sequencer.trigger.trigCondition?.[step] ?? [1, 1];
              const cellClass = ['seq-step-cell', active ? 'active' : '', isPlayhead ? 'playing' : '', !inRange ? 'inactive' : ''].filter(Boolean).join(' ');

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
                        if (!dragged) onToggleTriggerStep?.(step);
                      };
                      el.addEventListener('pointermove', onMove);
                      el.addEventListener('pointerup', onUp);
                    }}
                    onDoubleClick={() => inRange ? onResetProbability?.(step) : undefined}
                  >
                    <div className="prob-fill" style={{ height: `${probPct}%` }} />
                    <span className="prob-label">{probPct}%</span>
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
              /* ── Pitch bar: bipolar -24..+24 or tonal 0..14 ── */
              const isNotes = sequencer.pitch.mode === 'notes';
              const off = value;
              let barStyle: React.CSSProperties;
              let valText: string;
              if (isNotes) {
                const pct = Math.min(1, off / 14) * 100;
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
                    className={`seq-pitch-bar-wrap${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      const wrap = e.currentTarget;
                      wrap.setPointerCapture(e.pointerId);
                      const startY = e.clientY;
                      const startNorm = isNotes
                        ? Math.max(0, Math.min(1, off / 14))
                        : Math.max(0, Math.min(1, (off + 24) / 48));
                      const onMove = (ev: PointerEvent) => {
                        const rect = wrap.getBoundingClientRect();
                        const dragRange = rect.height * SEQ_BIPOLAR_DRAG_DISTANCE_FACTOR;
                        const pct = Math.max(0, Math.min(1, startNorm + (startY - ev.clientY) / dragRange));
                        const val = isNotes ? Math.round(pct * 14) : Math.round((pct - 0.5) * 48);
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
                    className={`seq-vel-bar-wrap${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
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
                  {/* Ratchet indicator (moved from trigger lane) */}
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
                    className={`seq-morph-bar-wrap${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
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
                    <div className="morph-center" />
                    <div className="morph-bar" style={barStyle} />
                    <div className="morph-val" style={val >= 0.5 ? { top: 2 } : { bottom: 2 }}>{labelText}</div>
                    <div className="morph-label-a">B</div>
                    <div className="morph-label-b">A</div>
                  </div>
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
                    className={`seq-dist-bar-wrap${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
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
