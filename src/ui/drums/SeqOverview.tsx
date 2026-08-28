import React, { useState } from 'react';
import type { SequencerState, ClockDivision, TrigCondition } from '../../audio/drumSeqTypes';
import type { DrumVoiceType } from '../../audio/drumSynth';
import { DRUM_VOICE_ORDER, DRUM_VOICES } from '../../audio/drumVoiceConfig';
import DragNumber from './DragNumber';
import {
  EUCLIDEAN_STEP_MAX,
  sequencerGridCellCount,
  sequencerGridColumnCount,
} from '../sequencer/sequencerLimits';
import { sequencerChainBadgeLabel } from '../sequencer/SequencerChainRail';
import { triggerSourceDisplayLabel } from '../sequencer/triggerSourceLabel';
import type { SequencerChainState } from '../../audio/sequencerChain';

const OV_PROB_DRAG_PX = 80;

interface SeqOverviewProps {
  sequencers: SequencerState[];
  playheads: number[];
  onSelectSequencer?: (index: number) => void;
  onSetParam?: (seqIdx: number, param: string, value: number) => void;
  onRotateSequence?: (seqIdx: number, direction: 1 | -1) => void;
  onToggleSource?: (seqIdx: number, voice: string, on: boolean) => void;
  onToggleMute?: (seqIdx: number) => void;
  onToggleSolo?: (seqIdx: number) => void;
  onSetClockDiv?: (seqIdx: number, div: ClockDivision) => void;
  onToggleTriggerStep?: (seqIdx: number, step: number) => void;
  onSetProbability?: (seqIdx: number, step: number, value: number) => void;
  onResetProbability?: (seqIdx: number, step: number) => void;
  onCycleTrigCondition?: (seqIdx: number, step: number) => void;
  chain?: SequencerChainState;
  activeChainLaneIndex?: number | null;
}

const SeqOverview: React.FC<SeqOverviewProps> = ({
  sequencers, playheads, onSelectSequencer,
  onSetParam, onRotateSequence, onToggleSource, onToggleMute, onToggleSolo,
  onSetClockDiv,
  onToggleTriggerStep, onSetProbability, onResetProbability,
  onCycleTrigCondition,
  chain,
  activeChainLaneIndex = null,
}) => {
  const [dragPopup, setDragPopup] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div className="seq-overview">
      {sequencers.map((seq, row) => {
        const chainBadge = chain ? sequencerChainBadgeLabel(chain, row) : null;
        return (
          <div
            key={seq.id}
            className={`seq-ov-row${seq.muted ? ' muted' : ''}`}
            style={{ '--sc': seq.color } as React.CSSProperties}
          >
            <div className="seq-ov-header" onClick={() => onSelectSequencer?.(row)}>
              <span className="seq-ov-name">{seq.name}</span>
              <span className={`seq-source-badge seq-source-badge--${seq.trigger.sourceOrigin ?? 'euclidean'}`}>
                {triggerSourceDisplayLabel(seq.trigger.sourceLabel, seq.trigger.sourceOrigin)}
                {seq.trigger.sourceDirty ? '*' : ''}
              </span>
              {chainBadge && (
                <span className={`seq-chain-badge${activeChainLaneIndex === row ? ' active' : ''}`}>
                  {chainBadge}
                </span>
              )}
              {/* Inline controls: Steps, Hits, Rotation, Clock, Sources, M/S */}
              <div className="seq-ov-controls" onClick={(e) => e.stopPropagation()}>
              <DragNumber
                value={seq.trigger.steps}
                min={2} max={EUCLIDEAN_STEP_MAX} label="S" shapeByDrag
                onChange={(v) => onSetParam?.(row, 'Steps', v)}
              />
              {seq.trigger.sourceOrigin && seq.trigger.sourceOrigin !== 'euclidean' ? (
                <span
                  className="seq-ov-readonly-hits"
                  title="This phrase is a printed pattern. Generate or print another phrase to change hit density."
                >
                  H {seq.trigger.hits}
                </span>
              ) : (
                <DragNumber
                  value={seq.trigger.hits}
                  min={0} max={seq.trigger.steps} label="H"
                  onChange={(v) => onSetParam?.(row, 'Hits', v)}
                />
              )}
              <div className="seq-rotation-control seq-ov-rot">
                <button onClick={() => {
                  if (onRotateSequence) onRotateSequence(row, -1);
                  else onSetParam?.(row, 'Rotation', seq.trigger.rotation - 1);
                }}>←</button>
                <span className="seq-rotation-val">{seq.trigger.rotation}</span>
                <button onClick={() => {
                  if (onRotateSequence) onRotateSequence(row, 1);
                  else onSetParam?.(row, 'Rotation', seq.trigger.rotation + 1);
                }}>→</button>
              </div>
              <select
                className="seq-ov-select seq-ov-clk"
                value={seq.clockDiv}
                onChange={(e) => onSetClockDiv?.(row, e.target.value as ClockDivision)}
              >
                <option value="1/4">1/4</option>
                <option value="1/4T">1/4T</option>
                <option value="1/8">1/8</option>
                <option value="1/8T">1/8T</option>
                <option value="1/16">1/16</option>
                <option value="1/16T">1/16T</option>
                <option value="1/32">1/32</option>
                <option value="1/32T">1/32T</option>
              </select>
              <div className="seq-ov-sources">
                {DRUM_VOICE_ORDER.map((voice) => {
                  const on = seq.sources[voice as DrumVoiceType];
                  return (
                    <button
                      type="button"
                      key={voice}
                      className={`seq-ov-src-toggle${on ? ' on' : ''}`}
                      data-voice={voice}
                      style={{ '--vc': DRUM_VOICES[voice].color } as React.CSSProperties}
                      aria-label={`${DRUM_VOICES[voice].label} source`}
                      aria-pressed={on}
                      onClick={(e) => { e.stopPropagation(); onToggleSource?.(row, voice, !on); }}
                    >
                      {DRUM_VOICES[voice].icon}
                    </button>
                  );
                })}
              </div>
              <button
                className={`ov-mute-btn${seq.muted ? ' on' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleMute?.(row); }}
              >M</button>
              <button
                className={`ov-solo-btn${seq.solo ? ' on' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleSolo?.(row); }}
              >S</button>
            </div>
            </div>
            <div className="seq-ov-grid-wrap">
              {(() => {
                const visibleCells = sequencerGridCellCount(seq.trigger.steps);
                const columnCount = sequencerGridColumnCount(seq.trigger.steps);
                return (
            <div className="seq-step-grid" style={{ '--seq-grid-base-columns': columnCount } as React.CSSProperties}>
              {new Array(visibleCells).fill(0).map((_, step) => {
                const inRange = step < seq.trigger.steps;
                const hit = inRange ? (seq.trigger.pattern[step] ?? false) : false;
                const isPlayhead = inRange && ((playheads[row] ?? 0) % seq.trigger.steps === step);
                const prob = inRange ? (seq.trigger.probability[step] ?? 1.0) : 1.0;
                const probPct = Math.round(prob * 100);
                const trigCond: TrigCondition = inRange ? (seq.trigger.trigCondition?.[step] ?? [1, 1]) : [1, 1];

                return (
                  <div key={step} className="seq-step">
                    <span className="seq-step-num">{step % 4 === 0 ? step + 1 : ''}</span>
                    <button
                      type="button"
                      className={`seq-step-cell${hit ? ' active' : ''}${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                      style={{ touchAction: 'pan-y' } as React.CSSProperties}
                      aria-label={`Trigger step ${step + 1}`}
                      aria-pressed={inRange ? hit : undefined}
                      disabled={!inRange}
                      onPointerDown={inRange ? (e) => {
                        const pointerType = e.pointerType;
                        if (pointerType !== 'touch') e.preventDefault();
                        e.stopPropagation();
                        const el = e.currentTarget;
                        const pointerId = e.pointerId;
                        const startX = e.clientX;
                        const startY = e.clientY;
                        el.setPointerCapture(e.pointerId);
                        const startProb = prob;
                        let dragged = false;
                        const onMove = (ev: PointerEvent) => {
                          if (ev.pointerId !== pointerId) return;
                          const deltaX = ev.clientX - startX;
                          const deltaY = ev.clientY - startY;
                          if (pointerType === 'touch' && Math.abs(deltaX) <= Math.abs(deltaY)) return;
                          const probabilityDelta = pointerType === 'touch' ? deltaX : -deltaY;
                          if (Math.abs(probabilityDelta) > 5) dragged = true;
                          if (!dragged) return;
                          const pct = Math.max(0, Math.min(1,
                            startProb + probabilityDelta / OV_PROB_DRAG_PX
                          ));
                          const snapped = Math.round(pct * 20) / 20;
                          onSetProbability?.(row, step, snapped);
                          setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(snapped * 100)}%` });
                        };
                        const cleanup = () => {
                          el.removeEventListener('pointermove', onMove);
                          el.removeEventListener('pointerup', onUp);
                          el.removeEventListener('pointercancel', cleanup);
                          if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
                          setDragPopup(null);
                        };
                        const onUp = (ev: PointerEvent) => {
                          if (ev.pointerId !== pointerId) return;
                          cleanup();
                          if (!dragged) onToggleTriggerStep?.(row, step);
                        };
                        el.addEventListener('pointercancel', cleanup);
                        el.addEventListener('pointermove', onMove);
                        el.addEventListener('pointerup', onUp);
                      } : undefined}
                      onClick={(e) => {
                        if (e.detail !== 0 || !inRange) return;
                        e.stopPropagation();
                        onToggleTriggerStep?.(row, step);
                      }}
                      onDoubleClick={inRange ? (e) => {
                        e.stopPropagation();
                        onResetProbability?.(row, step);
                      } : undefined}
                    >
                      {inRange && (
                        <div className="prob-fill" style={{ height: `${probPct}%` }} />
                      )}
                      {inRange && <span className="prob-label">{probPct}%</span>}
                    </button>
                    <button
                      type="button"
                      className={`seq-trig-cond${trigCond[1] > 1 ? ' active' : ''}`}
                      style={{ height: 8, ...(!inRange ? { opacity: 0.25 } : {}) }}
                      onClick={inRange ? (e) => { e.stopPropagation(); onCycleTrigCondition?.(row, step); } : undefined}
                      title={`Trig: ${trigCond[0]}:${trigCond[1]}`}
                    >
                      {trigCond[0]}:{trigCond[1]}
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
      {dragPopup && (
        <div className="seq-drag-popup" style={{ left: dragPopup.x, top: dragPopup.y }}>
          {dragPopup.text}
        </div>
      )}
    </div>
  );
};

export default SeqOverview;
