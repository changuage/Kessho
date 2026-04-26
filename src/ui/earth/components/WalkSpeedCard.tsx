import React from 'react';
import type { EarthDualSliderRenderer } from './EarthControls';

type WalkSpeedCardProps = {
  ds: EarthDualSliderRenderer;
};

export function WalkSpeedCard({ ds }: WalkSpeedCardProps) {
  return (
    <div
      className="earth-card"
      style={{ '--sc': '#a5c4d4', padding: '8px 12px' } as React.CSSProperties}
    >
      {ds('randomWalkSpeed', 'Walk Speed', '#a5c4d4', {
        format: (value) => value.toFixed(1),
        logarithmic: true,
      })}
    </div>
  );
}
