import React from 'react';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import { DRUM_VOICES } from '../../../audio/drumVoiceConfig';
import type { EngineScatterState, GeneratedDrumPhrase } from './scatterTypes';
import FeelField2D from './FeelField2D';

interface EngineScatterOrbProps {
  voice: DrumVoiceType;
  state: EngineScatterState;
  phrases: GeneratedDrumPhrase[];
  selected: boolean;
  activeUntil?: number;
  onSelect: () => void;
  onToggleEnabled: () => void;
  onChange: (state: EngineScatterState) => void;
  onGenerate: () => void;
  onPreview?: () => void;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const EngineScatterOrb: React.FC<EngineScatterOrbProps> = ({
  voice,
  state,
  phrases,
  selected,
  activeUntil,
  onSelect,
  onToggleEnabled,
  onChange,
  onGenerate,
  onPreview,
}) => {
  const cfg = DRUM_VOICES[voice];
  const isPulsing = (activeUntil ?? 0) > Date.now();
  const triggerProbability = clampUnit(state.triggerProbability);
  const burstProbability = clampUnit(state.burstProbability);

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'scatter-orb',
        selected ? 'selected' : '',
        state.enabled ? 'enabled' : 'muted',
        isPulsing ? 'pulsing' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--engine-color': cfg.color } as React.CSSProperties}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.preventDefault();
        onGenerate();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      title={cfg.label}
    >
      <svg className="scatter-orb__rings" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="scatter-orb__ring ghost" cx="50" cy="50" r="45" />
        <circle
          className="scatter-orb__ring probability"
          cx="50"
          cy="50"
          r="45"
          pathLength={1}
          strokeDasharray={`${triggerProbability} ${1 - triggerProbability}`}
        />
        <circle className="scatter-orb__ring ghost inner" cx="50" cy="50" r="35" />
        <circle
          className="scatter-orb__ring burst"
          cx="50"
          cy="50"
          r="35"
          pathLength={1}
          strokeDasharray={`${burstProbability} ${1 - burstProbability}`}
        />
      </svg>

      <FeelField2D
        value={{ x: state.feelX, y: state.feelY }}
        color={cfg.color}
        size="mini"
        disabled={!state.enabled}
        onChange={(value) => onChange({ ...state, feelX: value.x, feelY: value.y })}
        onGenerate={onGenerate}
      />

      <div className="scatter-orb__identity">
        <span className="scatter-orb__icon">{cfg.icon}</span>
        <span className="scatter-orb__label">{cfg.label}</span>
      </div>

      <div className="scatter-orb__memory" aria-hidden="true">
        {phrases.slice(0, 3).map((phrase) => (
          <span key={phrase.id} className="scatter-orb__memory-dot" />
        ))}
      </div>

      <div className="scatter-orb__controls" onClick={(event) => event.stopPropagation()}>
        <div className="scatter-orb__control-row">
          <button
            type="button"
            className={`scatter-orb__enable${state.enabled ? ' on' : ''}`}
            aria-pressed={state.enabled}
            onClick={() => {
              onSelect();
              onToggleEnabled();
            }}
            title={state.enabled ? `Disable ${cfg.label}` : `Enable ${cfg.label}`}
          />
          {onPreview && (
            <button
              type="button"
              className="scatter-orb__preview"
              onClick={() => {
                onSelect();
                onPreview();
              }}
              title={`Preview ${cfg.label}`}
            >
              ▶
            </button>
          )}
          <button
            type="button"
            className="scatter-orb__generate"
            onClick={() => {
              onSelect();
              onGenerate();
            }}
            title={`Generate ${cfg.label} burst`}
          >
            ✦
          </button>
        </div>
        <label>
          <span>Trigger</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={triggerProbability}
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
            value={burstProbability}
            onChange={(event) => onChange({ ...state, burstProbability: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
};

export default EngineScatterOrb;
