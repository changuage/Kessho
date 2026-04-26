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

function formatAdvancedValue(value: number, unit?: string): string {
  if (unit === 'Hz' || unit === 'ms') return String(Math.round(value));
  if (unit === '%') return String(Math.round(value * 100));
  return value.toFixed(2);
}

const VoiceCardAdvanced: React.FC<VoiceCardAdvancedProps> = ({
  voice,
  config,
  state,
  onParamChange,
  sliderProps,
  SliderComponent,
  isTriggered = false,
  analyserNode,
}) => {
  const Slider = SliderComponent as React.ComponentType<Record<string, unknown>>;
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

                return (
                  <div
                    key={def.key}
                    className="param-row param-row--slider"
                  >
                    <Slider
                      label={def.label}
                      value={numVal}
                      paramKey={paramKey}
                      onChange={onParamChange as (key: keyof SliderState, value: number) => void}
                      format={(value: number) => formatAdvancedValue(value, def.unit)}
                      unit={def.unit === '%' ? '%' : undefined}
                      {...sliderProps(paramKey)}
                    />
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
