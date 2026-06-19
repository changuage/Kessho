import React, { useState } from 'react';
import type { EngineScatterState, ScatterRuleState } from './scatterTypes';

interface ScatterAdvancedDrawerProps {
  open: boolean;
  engineState: EngineScatterState;
  onChange: (state: EngineScatterState) => void;
}

const RULES: Array<keyof ScatterRuleState> = ['anchor', 'breath', 'memory', 'motion', 'fracture', 'spread'];

const RULE_LABELS: Record<keyof ScatterRuleState, string> = {
  anchor: 'Ground',
  breath: 'Space',
  memory: 'Repeat',
  motion: 'Flow',
  fracture: 'Shatter',
  spread: 'Link',
};

const RULE_HINTS: Record<keyof ScatterRuleState, string> = {
  anchor: 'Keeps the groove stable.',
  breath: 'Leaves rests and prevents overcrowding.',
  memory: 'Reuses or mutates recent motifs.',
  motion: 'Shapes pitch, expression, morph, and distance movement.',
  fracture: 'Adds ratchets, slices, reverse hits, and glitch detail.',
  spread: 'Lets one engine influence nearby engines.',
};

const ScatterAdvancedDrawer: React.FC<ScatterAdvancedDrawerProps> = ({ open, engineState, onChange }) => {
  const [expandedRule, setExpandedRule] = useState<keyof ScatterRuleState | null>(null);
  if (!open) return null;
  return (
    <div className="scatter-advanced-drawer">
      {RULES.map((rule) => (
        <div className="scatter-rule-chip" key={rule}>
          <button
            type="button"
            title={RULE_HINTS[rule]}
            aria-expanded={expandedRule === rule}
            onClick={() => setExpandedRule(expandedRule === rule ? null : rule)}
          >
            <span>{RULE_LABELS[rule]}</span>
            <span
              className="scatter-rule-chip__meter"
              style={{ '--amount': engineState.rules[rule] } as React.CSSProperties}
            />
          </button>
          {expandedRule === rule && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={engineState.rules[rule]}
              aria-label={RULE_LABELS[rule]}
              onChange={(event) => onChange({
                ...engineState,
                rules: {
                  ...engineState.rules,
                  [rule]: Number(event.target.value),
                },
              })}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ScatterAdvancedDrawer;
