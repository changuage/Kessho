import React from 'react';

export type SequencerVariationId = 'A' | 'B' | 'C' | 'D';

export interface SequencerVariationSummary {
  id: SequencerVariationId;
  /** Number of printed cells in this variation. The UI caps this at 32. */
  steps: number;
  noteCount?: number;
  hitCount?: number;
  phraseLabel?: string;
  available?: boolean;
}

export interface SequencerVariationRailProps {
  variations: readonly SequencerVariationSummary[];
  /** Variation currently selected for editing. */
  selectedVariation: SequencerVariationId;
  /** Variation currently driving audio. This may differ from selectedVariation. */
  audibleVariation?: SequencerVariationId | null;
  /** A bank/runtime selection request awaiting accepted telemetry. */
  queuedVariation?: SequencerVariationId | null;
  chainEnabled?: boolean;
  onSelectVariation: (variation: SequencerVariationId) => void;
  onToggleChain?: () => void;
  progress?: { variation: SequencerVariationId; step: number; totalSteps: number } | null;
  disabled?: boolean;
}

const VARIATION_IDS: readonly SequencerVariationId[] = ['A', 'B', 'C', 'D'];

function safeSteps(value: number): number {
  return Math.max(0, Math.min(32, Math.round(Number.isFinite(value) ? value : 0)));
}

/** Compact per-lane variation selector. It has no playback authority. */
export const SequencerVariationRail: React.FC<SequencerVariationRailProps> = ({
  variations,
  selectedVariation,
  audibleVariation = null,
  queuedVariation = null,
  chainEnabled = false,
  onSelectVariation,
  onToggleChain,
  progress = null,
  disabled = false,
}) => {
  const byId = new Map(variations.map((variation) => [variation.id, variation]));
  return (
    <div className="seq-variation-rail" aria-label="Phrase variations">
      <div className="seq-variation-heading">
        <span className="seq-variation-title">Variations</span>
        {progress ? (
          <span className="seq-variation-progress">
            {progress.variation}{Math.max(0, Math.min(progress.totalSteps, progress.step))}/{Math.max(1, progress.totalSteps)}
          </span>
        ) : null}
        {queuedVariation ? <span className="seq-variation-queued">Requested {queuedVariation}</span> : null}
        {onToggleChain ? (
          <button
            type="button"
            className={`seq-variation-chain${chainEnabled ? ' on' : ''}`}
            onClick={onToggleChain}
            disabled={disabled}
            aria-pressed={chainEnabled}
          >
            Chain
          </button>
        ) : null}
      </div>
      <div className="seq-variation-strip" role="tablist" aria-label="A to D phrase variations">
        {VARIATION_IDS.map((id) => {
          const variation = byId.get(id);
          const selected = selectedVariation === id;
          const audible = audibleVariation === id;
          const queued = queuedVariation === id;
          const hasProgress = progress?.variation === id;
          const steps = safeSteps(variation?.steps ?? 0);
          const available = variation?.available !== false;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`Variation ${id}${audible ? ', playing' : ''}${queued ? ', requested' : ''}`}
              className={`seq-variation-tab${selected ? ' selected' : ''}${audible ? ' audible' : ''}${queued ? ' queued' : ''}${!available ? ' empty' : ''}`}
              onClick={() => onSelectVariation(id)}
              disabled={disabled || !available}
            >
              <span className="seq-variation-tab-label">{id}</span>
              <span className="seq-variation-tab-meta">
                {steps}/32{variation?.noteCount != null
                  ? ` · ${variation.noteCount} notes${variation.hitCount != null && variation.hitCount !== variation.noteCount ? ` / ${variation.hitCount} hits` : ''}`
                  : ''}
              </span>
              {variation?.phraseLabel ? <span className="seq-variation-tab-phrase">{variation.phraseLabel}</span> : null}
              {hasProgress ? <span className="seq-variation-tab-progress" style={{ width: `${Math.max(0, Math.min(1, progress.step / Math.max(1, progress.totalSteps))) * 100}%` }} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SequencerVariationRail;
