import React, { type ReactNode } from 'react';

export type SeqStepDetailMode = 'note' | 'chord' | 'arp';

export interface SeqStepDetailPanelProps {
  selectedStep: number | null;
  stepCount: number;
  mode: SeqStepDetailMode;
  onModeChange: (mode: SeqStepDetailMode) => void;
  variationLabel?: string;
  audibleVariationLabel?: string | null;
  sharedControls?: ReactNode;
  note?: ReactNode;
  chord?: ReactNode;
  arp?: ReactNode;
  disabled?: boolean;
}

/**
 * Contextual editor shell for one selected sequencer cell. It deliberately
 * owns no step data; callers keep the audible bank and edit bank separate.
 */
export const SeqStepDetailPanel: React.FC<SeqStepDetailPanelProps> = ({
  selectedStep,
  stepCount,
  mode,
  onModeChange,
  variationLabel,
  audibleVariationLabel = null,
  sharedControls,
  note,
  chord,
  arp,
  disabled = false,
}) => {
  const safeStepCount = Math.max(1, Math.round(stepCount));
  const stepLabel = selectedStep == null
    ? 'Select a step'
    : `Step ${Math.max(0, Math.min(safeStepCount - 1, Math.round(selectedStep))) + 1}/${safeStepCount}`;
  const panel = mode === 'chord' ? chord : mode === 'arp' ? arp : note;
  return (
    <section className="seq-step-detail-panel" aria-label="Selected step editor">
      <header className="seq-step-detail-header">
        <div className="seq-step-detail-context">
          <strong>{stepLabel}</strong>
          {variationLabel ? <span>Variation {variationLabel}</span> : null}
          {audibleVariationLabel && audibleVariationLabel !== variationLabel ? <span className="seq-step-detail-audible">Playing {audibleVariationLabel}</span> : null}
        </div>
        <div className="seq-step-detail-tabs" role="tablist" aria-label="Step editor type">
          {(['note', 'chord', 'arp'] as const).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              role="tab"
              aria-selected={mode === nextMode}
              className={mode === nextMode ? 'active' : ''}
              onClick={() => onModeChange(nextMode)}
              disabled={disabled || selectedStep == null}
            >
              {nextMode === 'note' ? 'Note' : nextMode === 'chord' ? 'Chord' : 'Arp'}
            </button>
          ))}
        </div>
      </header>
      {selectedStep == null ? null : sharedControls}
      <div className={`seq-step-detail-body seq-step-detail-body--${mode}`}>
        {selectedStep == null ? <span className="seq-step-detail-empty">Click a step to edit its note, chord, or arp.</span> : panel ?? <span className="seq-step-detail-empty">No editor available.</span>}
      </div>
    </section>
  );
};

export default SeqStepDetailPanel;
