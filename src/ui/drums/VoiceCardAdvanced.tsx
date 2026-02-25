import React from 'react';
import type { SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { DrumVoiceConfig } from '../../audio/drumVoiceConfig';
import EnvelopeVisualizer from './EnvelopeVisualizer';

interface VoiceCardAdvancedProps {
  voice: DrumVoiceType;
  config: DrumVoiceConfig;
  state: SliderState;
  onParamChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  isTriggered?: boolean;
  analyserNode?: AnalyserNode;
}

const VoiceCardAdvanced: React.FC<VoiceCardAdvancedProps> = ({
  voice,
  config,
  state,
  onParamChange,
  sliderProps: _sliderProps,
  SliderComponent: _SliderComponent,
  isTriggered = false,
  analyserNode,
}) => {
  return (
    <div>
      <EnvelopeVisualizer voice={voice} state={state} analyserNode={analyserNode} isTriggered={isTriggered} />
      {Object.entries(config.sections).map(([sectionName, defs]) => {
        if (sectionName === 'Variation') return null;
        return (
          <div key={sectionName} className="param-section">
            <div className="section-header">{sectionName}</div>
            <div className="section-body">
              {defs.map((def) => {
                const paramKey = def.key as keyof SliderState;
                if (def.type === 'select') {
                  return (
                    <div key={def.key} className="param-row">
                      <label>{def.label}</label>
                      <select
                        value={String(state[paramKey])}
                        data-key={def.key}
                        onChange={(e) => onParamChange(paramKey, e.target.value as SliderState[keyof SliderState])}
                      >
                        {(def.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <span className="val">{String(state[paramKey])}</span>
                    </div>
                  );
                }

                const numVal = state[paramKey] as number;
                const formatted = def.unit === 'Hz'
                  ? `${Math.round(numVal)}`
                  : def.unit === 'ms'
                    ? `${Math.round(numVal)}`
                    : def.unit === '%'
                      ? `${Math.round(numVal * 100)}%`
                      : `${numVal.toFixed(2)}`;

                return (
                  <div key={def.key} className="param-row">
                    <label>{def.label}</label>
                    <input
                      type="range"
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={numVal}
                      data-key={def.key}
                      onChange={(e) => onParamChange(paramKey, parseFloat(e.target.value) as SliderState[keyof SliderState])}
                    />
                    <span className="val">{formatted}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default VoiceCardAdvanced;
