/**
 * SeqProbability — Probability-based sequencer view.
 * 
 * Non-Euclidean mode: all steps are "active" by default, and each step has
 * an independent probability (0–1) of firing. The user drags vertically on
 * each cell to set its probability. Clicking toggles the step fully on/off.
 * 
 * Shows all 4 lanes stacked with inline header controls (steps, clock div,
 * sources, M/S). Essentially a stripped-down "random trigger" sequencer.
 */
import React, { useState } from 'react';
import type { SequencerState, ClockDivision } from '../../audio/drumSeqTypes';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { DRUM_VOICES as VOICE_CONFIG, DRUM_VOICE_ORDER } from '../../audio/drumVoiceConfig';
import DragNumber from './DragNumber';

const PROB_DRAG_RANGE_PX = 80;

interface SeqProbabilityProps {
  sequencers: SequencerState[];
  playheads: number[];
  onSelectSequencer: (index: number) => void;
  onSetSteps: (seqIdx: number, steps: number) => void;
  onToggleTriggerStep: (seqIdx: number, step: number) => void;
  onSetProbability: (seqIdx: number, step: number, value: number) => void;
  onResetProbability: (seqIdx: number, step: number) => void;
  onToggleMute: (seqIdx: number) => void;
  onToggleSolo: (seqIdx: number) => void;
  onToggleSource: (seqIdx: number, voice: string, on: boolean) => void;
  onSetClockDiv: (seqIdx: number, div: ClockDivision) => void;
  getParam: (seqIdx: number, param: string) => unknown;
}

const CLOCK_DIV_OPTIONS: ClockDivision[] = ['1/4', '1/8', '1/16', '1/8T'];

const SeqProbability: React.FC<SeqProbabilityProps> = ({
  sequencers,
  playheads,
  onSelectSequencer,
  onSetSteps,
  onToggleTriggerStep,
  onSetProbability,
  onResetProbability,
  onToggleMute,
  onToggleSolo,
  onToggleSource,
  onSetClockDiv,
  getParam,
}) => {
  const [dragPopup, setDragPopup] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div className="seq-probability">
      {sequencers.map((seq, seqIdx) => {
        const steps = seq.trigger.steps;
        const maxCells = steps < 9 ? 8 : 16;
        const laneStep = ((playheads[seqIdx] ?? -1) % steps + steps) % steps;

        return (
          <div
            key={seq.id}
            className={`seq-prob-row${seq.muted ? ' muted' : ''}`}
            style={{ '--sc': seq.color } as React.CSSProperties}
          >
            {/* Header row */}
            <div className="seq-prob-header" onClick={() => onSelectSequencer(seqIdx)}>
              <span className="seq-prob-name" style={{ color: seq.color }}>{seq.name}</span>

              {/* Steps */}
              <DragNumber
                value={steps}
                min={2}
                max={16}
                label="Steps"
                onChange={(v) => onSetSteps(seqIdx, v)}
              />

              {/* Clock div */}
              <select
                className="seq-prob-clock"
                value={seq.clockDiv}
                onChange={(e) => { e.stopPropagation(); onSetClockDiv(seqIdx, e.target.value as ClockDivision); }}
                onClick={(e) => e.stopPropagation()}
              >
                {CLOCK_DIV_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              {/* Sources */}
              <div className="seq-prob-sources" onClick={e => e.stopPropagation()}>
                {DRUM_VOICE_ORDER.map((voice) => {
                  const isOn = Boolean(seq.sources[voice as DrumVoiceType]);
                  const cfg = VOICE_CONFIG[voice];
                  return (
                    <button
                      key={voice}
                      className={`seq-prob-src${isOn ? ' on' : ''}`}
                      style={isOn ? { color: cfg.color } : undefined}
                      onClick={() => onToggleSource(seqIdx, voice, !isOn)}
                      title={cfg.label}
                    >
                      {cfg.icon}
                    </button>
                  );
                })}
              </div>

              {/* M/S buttons */}
              <div className="seq-prob-ms" onClick={e => e.stopPropagation()}>
                <button
                  className={`seq-prob-mute${seq.muted ? ' on' : ''}`}
                  onClick={() => onToggleMute(seqIdx)}
                >M</button>
                <button
                  className={`seq-prob-solo${seq.solo ? ' on' : ''}`}
                  onClick={() => onToggleSolo(seqIdx)}
                >S</button>
              </div>
            </div>

            {/* Probability grid */}
            <div
              className="seq-prob-grid"
              style={{ gridTemplateColumns: `repeat(${maxCells}, 1fr)` }}
            >
              {new Array(maxCells).fill(0).map((_, step) => {
                const inRange = step < steps;
                const isActive = inRange && seq.trigger.pattern[step];
                const prob = seq.trigger.probability[step] ?? 1.0;
                const probPct = Math.round(prob * 100);
                const isPlayhead = inRange && laneStep === step;
                const isBeatHead = step % 4 === 0;

                return (
                  <div key={step} className="seq-prob-step">
                    <span className="seq-prob-step-num">{isBeatHead ? step + 1 : ''}</span>
                    <button
                      type="button"
                      className={[
                        'seq-prob-cell',
                        isActive ? 'active' : '',
                        isPlayhead ? 'playing' : '',
                        !inRange ? 'inactive' : '',
                      ].filter(Boolean).join(' ')}
                      style={{ '--sc': seq.color, touchAction: 'none' } as React.CSSProperties}
                      onPointerDown={(e) => {
                        if (!inRange) return;
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
                          onSetProbability(seqIdx, step, snapped);
                          setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(snapped * 100)}%` });
                        };
                        const onUp = () => {
                          el.removeEventListener('pointermove', onMove);
                          el.removeEventListener('pointerup', onUp);
                          setDragPopup(null);
                          if (!dragged) onToggleTriggerStep(seqIdx, step);
                        };
                        el.addEventListener('pointermove', onMove);
                        el.addEventListener('pointerup', onUp);
                      }}
                      onDoubleClick={() => inRange ? onResetProbability(seqIdx, step) : undefined}
                    >
                      <div className="prob-fill" style={{ height: `${probPct}%` }} />
                      <span className="prob-label">{isActive ? `${probPct}%` : ''}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Drag popup */}
      {dragPopup && (
        <div className="seq-drag-popup" style={{ left: dragPopup.x, top: dragPopup.y }}>
          {dragPopup.text}
        </div>
      )}

      <div className="seq-prob-hint">
        tap = toggle step │ drag ↕ = probability │ double-tap = reset to 100%
      </div>
    </div>
  );
};

export default SeqProbability;
