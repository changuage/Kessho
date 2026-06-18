import React from 'react';
import type { EngineScatterState, ScatterRuleState } from './scatterTypes';

interface ScatterAdvancedDrawerProps {
  open: boolean;
  engineState: EngineScatterState;
  onChange: (state: EngineScatterState) => void;
}

const RULES: Array<keyof ScatterRuleState> = ['anchor', 'breath', 'memory', 'motion', 'fracture', 'spread'];

const ScatterAdvancedDrawer: React.FC<ScatterAdvancedDrawerProps> = ({ open, engineState, onChange }) => {
  if (!open) return null;
  return (
    <div className="scatter-advanced-drawer">
      {RULES.map((rule) => (
        <label key={rule}>
          <span>{rule}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={engineState.rules[rule]}
            onChange={(event) => onChange({
              ...engineState,
              rules: {
                ...engineState.rules,
                [rule]: Number(event.target.value),
              },
            })}
          />
          <span>{Math.round(engineState.rules[rule] * 100)}</span>
        </label>
      ))}
    </div>
  );
};

export default ScatterAdvancedDrawer;
