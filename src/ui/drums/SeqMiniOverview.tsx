import React from 'react';
import type { SequencerState } from '../../audio/drumSeqTypes';

interface SeqMiniOverviewProps {
  patterns: boolean[][];
  playheads: number[];
  colors: string[];
  sequencers?: SequencerState[];
  /** Printed variation patterns take precedence over legacy trigger dots. */
  variationPatterns?: readonly (readonly boolean[] | null | undefined)[];
  variationLabels?: readonly (string | null | undefined)[];
  variationNoteCounts?: readonly (number | null | undefined)[];
  variationHitCounts?: readonly (number | null | undefined)[];
  variationPhraseBeats?: readonly (number | null | undefined)[];
  onRowClick?: (index: number) => void;
}

const SOURCE_DISPLAY: Record<string, string> = {
  sub: 'Sub', kick: 'Kick', click: 'Click', beepHi: 'BHi', beepLo: 'BLo', noise: 'Noi', membrane: 'Mem',
};

function getSourceBrief(seq: SequencerState): string {
  const active = Object.entries(seq.sources).filter(([, v]) => v).map(([k]) => SOURCE_DISPLAY[k] ?? k);
  if (active.length === 0) return '—';
  if (active.length <= 2) return active.join('+');
  return `${active.length}v`;
}

const SeqMiniOverview: React.FC<SeqMiniOverviewProps> = ({ patterns, playheads, colors, sequencers, variationPatterns, variationLabels, variationNoteCounts, variationHitCounts, variationPhraseBeats, onRowClick }) => {
  return (
    <div className="seq-mini-overview">
      {patterns.map((pattern, row) => {
        const seq = sequencers?.[row];
        const variationPattern = variationPatterns?.[row];
        const hasVariation = Array.isArray(variationPattern) && variationPattern.length > 0;
        const variationLabel = variationLabels?.[row] ?? 'Printed';
        const variationNoteCount = variationNoteCounts?.[row];
        const variationHitCount = variationHitCounts?.[row];
        const variationPhraseBeat = variationPhraseBeats?.[row];
        return (
        <div
          key={row}
          className={`seq-mini-row${onRowClick ? ' clickable' : ''}${seq?.muted ? ' muted' : ''}`}
          style={{ '--sc': colors[row] ?? '#a855f7' } as React.CSSProperties}
          onClick={() => onRowClick?.(row)}
        >
          {seq && (
            <div className="seq-mini-label">
              <span>{seq.name} {hasVariation ? variationLabel : `(${seq.clockDiv}) ${getSourceBrief(seq)}`}</span>
              <span className="mini-ms">
                {seq.muted ? <span className="on">M</span> : 'M'}
                {' '}
                {seq.solo ? <span className="on">S</span> : 'S'}
              </span>
            </div>
          )}
          {hasVariation ? (
            <>
              <div className="seq-mini-printed-summary" aria-label="Printed variation summary">
                <span>{variationLabel}</span>
                <span>{variationPattern.length} steps</span>
                {variationNoteCount == null ? null : <span>{variationNoteCount} notes{variationHitCount != null && variationHitCount !== variationNoteCount ? ` / ${variationHitCount} hits` : ''}</span>}
                {variationPhraseBeat == null ? null : <span>{variationPhraseBeat.toFixed(2)} beats</span>}
              </div>
              <div className="seq-mini-dots">
                {variationPattern.map((hit, step) => {
                  const isPlayhead = playheads[row] === step;
                  const cn = isPlayhead ? 'dot-cur' : hit ? 'dot-hit' : 'dot-rest';
                  return <span key={`${row}-${step}`} className={cn}>{hit ? '●' : '○'}</span>;
                })}
              </div>
            </>
          ) : (
            <div className="seq-mini-dots">
              {pattern.map((hit, step) => {
                const isPlayhead = playheads[row] === step;
                const cn = isPlayhead ? 'dot-cur' : hit ? 'dot-hit' : 'dot-rest';
                return (
                  <span key={`${row}-${step}`} className={cn}>
                    {hit ? '●' : '○'}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
};

export default SeqMiniOverview;
