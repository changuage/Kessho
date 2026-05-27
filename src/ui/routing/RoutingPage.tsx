import React from 'react';
import RoutingMatrix from '../global/RoutingMatrix';
import type { DualSliderRange } from '../DualSlider';
import type { SliderMode, SliderState } from '../state';
import MidiRoutingPanel from './MidiRoutingPanel';
import type { KesshoMidiMessage } from '../../native/capacitorMidiRouting';
import './routing.css';

export interface RoutingPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onColumnParamChange: (key: keyof SliderState, value: number) => void;
  onToggleSource: (sourceId: string, enabled: boolean) => void;
  onMidiMessage: (message: KesshoMidiMessage) => void;
  sliderProps: (paramKey: keyof SliderState) => {
    mode: SliderMode;
    dualRange?: DualSliderRange;
    walkPosition?: number;
    isFlashing?: boolean;
    onCycleMode?: (key: keyof SliderState) => void;
    onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
  };
}

export default function RoutingPage({
  state,
  isMobile,
  onParamChange,
  onColumnParamChange,
  onToggleSource,
  onMidiMessage,
  sliderProps,
}: RoutingPageProps) {
  return (
    <div className={`routing-root${isMobile ? ' mobile' : ''}`}>
      <div className="routing-container">
        <section
          className="routing-card"
          style={{ '--sc': '#a5c4d4' } as React.CSSProperties}
        >
          <div className="routing-card-header">
            <span className="routing-card-title">FX Routing Matrix</span>
          </div>

          <div className="routing-card-body">
            <RoutingMatrix
              state={state}
              isMobile={isMobile}
              onParamChange={onParamChange}
              onColumnParamChange={onColumnParamChange}
              onToggleSource={onToggleSource}
              sliderProps={sliderProps}
              helpPage="routing"
            />
          </div>
        </section>

        <MidiRoutingPanel onParamChange={onParamChange} onMidiMessage={onMidiMessage} />
      </div>
    </div>
  );
}
