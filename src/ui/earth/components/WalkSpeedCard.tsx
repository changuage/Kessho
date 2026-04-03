import React from 'react';
import type { SliderState } from '../../state';
import { ParamSlider } from './EarthControls';

type WalkSpeedCardProps = {
  state: SliderState;
  onParamChange: (key: keyof SliderState, value: number) => void;
};

export function WalkSpeedCard({ state, onParamChange }: WalkSpeedCardProps) {
  return (
    <div
      className="earth-card"
      style={{ '--sc': '#a5c4d4', padding: '8px 12px' } as React.CSSProperties}
    >
      <ParamSlider
        paramKey="randomWalkSpeed"
        label="Walk Speed"
        value={state.randomWalkSpeed}
        min={0.1}
        max={5}
        step={0.1}
        onChange={v => onParamChange('randomWalkSpeed', v)}
        format={v => v.toFixed(1)}
        labelColor="#a5c4d4"
      />
    </div>
  );
}
