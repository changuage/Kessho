import React from 'react';
import RoutingMatrix from '../global/RoutingMatrix';
import type { DualSliderRange } from '../DualSlider';
import type { SliderMode, SliderState } from '../state';
import MidiPage from '../midi/MidiPage';
import type { KesshoMidiMessage } from '../../native/capacitorMidiRouting';
import type { DawOutputDeviceSelection, DawOutputRoutingConfig } from '../../audio/dawOutputRouting';
import DawOutputPanel from './DawOutputPanel';
import './routing.css';

export interface RoutingPageProps {
  state: SliderState;
  isMobile: boolean;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onColumnParamChange: (key: keyof SliderState, value: number) => void;
  onToggleSource: (sourceId: string, enabled: boolean) => void;
  onMidiMessage: (message: KesshoMidiMessage) => void;
  dawOutputRouting: DawOutputRoutingConfig;
  dawOutputDeviceSelection: DawOutputDeviceSelection;
  onDawOutputRoutingChange: (config: DawOutputRoutingConfig) => void;
  onDawOutputDeviceSelectionChange: (selection: DawOutputDeviceSelection) => void;
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
  dawOutputRouting,
  dawOutputDeviceSelection,
  onDawOutputRoutingChange,
  onDawOutputDeviceSelectionChange,
  sliderProps,
}: RoutingPageProps) {
  void onMidiMessage;
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

        <DawOutputPanel
          state={state}
          config={dawOutputRouting}
          deviceSelection={dawOutputDeviceSelection}
          onChange={onDawOutputRoutingChange}
          onDeviceSelectionChange={onDawOutputDeviceSelectionChange}
        />

        <MidiPage />
      </div>
    </div>
  );
}
