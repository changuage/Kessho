import React from 'react';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICES } from '../../../audio/drumVoiceConfig';
import type { EngineScatterState, GeneratedDrumPhrase } from './scatterTypes';
import FeelField2D from './FeelField2D';

interface EngineScatterCardProps {
  voice: DrumVoiceType;
  state: EngineScatterState;
  phrases: GeneratedDrumPhrase[];
  selected: boolean;
  onSelect: () => void;
  onToggleEnabled: () => void;
  onChange: (state: EngineScatterState) => void;
  onGenerate: () => void;
  onPreview?: () => void;
}

const EngineScatterCard: React.FC<EngineScatterCardProps> = ({
  voice,
  state,
  phrases,
  selected,
  onSelect,
  onToggleEnabled,
  onChange,
  onGenerate,
  onPreview,
}) => {
  const cfg = DRUM_VOICES[voice];
  const chaos = Math.round(((state.feelY + 1) / 2) * 100);
  return (
    <div
      className={`scatter-engine-card${selected ? ' scatter-engine-card--selected' : ''}${state.enabled ? ' enabled' : ''}`}
      style={{ '--engine-color': cfg.color } as React.CSSProperties}
      onClick={onSelect}
    >
      <div className="scatter-engine-card__head">
        <button
          type="button"
          className="scatter-engine-card__name"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <span>{cfg.icon}</span>
          <span>{cfg.label}</span>
        </button>
        <div className="scatter-engine-card__actions">
          {onPreview && (
            <button
              type="button"
              className="scatter-engine-card__preview"
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
                onPreview();
              }}
              title={`Preview ${cfg.label}`}
            >
              ▶︎
            </button>
          )}
          <button
            type="button"
            className={`scatter-engine-card__enable${state.enabled ? ' on' : ''}`}
            aria-pressed={state.enabled}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onToggleEnabled();
            }}
            title={state.enabled ? `Disable ${cfg.label}` : `Enable ${cfg.label}`}
          >
            ●
          </button>
          <span className="scatter-engine-card__chaos">{chaos}</span>
        </div>
      </div>
      <FeelField2D
        value={{ x: state.feelX, y: state.feelY }}
        color={cfg.color}
        disabled={!state.enabled}
        onChange={(value) => onChange({ ...state, feelX: value.x, feelY: value.y })}
        onGenerate={onGenerate}
      />
      <div className="scatter-engine-card__sliders" onClick={(event) => event.stopPropagation()}>
        <label>
          <span>Trig</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.triggerProbability}
            onChange={(event) => onChange({ ...state, triggerProbability: Number(event.target.value) })}
          />
        </label>
        <label>
          <span>Burst</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.burstProbability}
            onChange={(event) => onChange({ ...state, burstProbability: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="scatter-engine-card__glyphs">
        {phrases.slice(0, 3).map((phrase) => (
          <span key={phrase.id} title={phrase.label}>
            {phrase.summary.hits}/{phrase.summary.steps}
          </span>
        ))}
      </div>
    </div>
  );
};

export default EngineScatterCard;
