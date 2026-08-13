import React from 'react';
import RoutingMatrix from '../global/RoutingMatrix';
import type { DualSliderRange } from '../DualSlider';
import type { SliderMode, SliderState } from '../state';
import MidiPage from '../midi/MidiPage';
import type { DawOutputDeviceSelection, DawOutputRoutingConfig } from '../../audio/dawOutputRouting';
import DawOutputPanel from './DawOutputPanel';
import RoutingMuteGroupsPanel from './RoutingMuteGroupsPanel';
import FxRoutingGraphView from './FxRoutingGraphView';
import { FX_ROUTING_NODE_ENABLE_KEYS, type FxRoutingGraphState, type FxRoutingNodeId } from './fxRoutingGraph';
import type { RoutingMuteGroupsController, RoutingMuteGroupsState } from './routingMuteGroups';
import './routing.css';

export interface RoutingPageProps {
  state: SliderState;
  isMobile: boolean;
  routingMuteGroups: RoutingMuteGroupsState;
  muteGroupsController: RoutingMuteGroupsController;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onColumnParamChange: (key: keyof SliderState, value: number) => void;
  onBooleanParamChange: (key: keyof SliderState, value: boolean) => void;
  onToggleSource: (sourceId: string, enabled: boolean) => void;
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
  onFxRoutingGraphChange: (graph: FxRoutingGraphState) => void;
  onOpenSynthPresetPool: (source: 'pad1' | 'pad2' | 'lead1' | 'lead2') => void;
}

export default function RoutingPage({
  state,
  isMobile,
  routingMuteGroups,
  muteGroupsController,
  onParamChange,
  onColumnParamChange,
  onBooleanParamChange,
  onToggleSource,
  dawOutputRouting,
  dawOutputDeviceSelection,
  onDawOutputRoutingChange,
  onDawOutputDeviceSelectionChange,
  sliderProps,
  onFxRoutingGraphChange,
  onOpenSynthPresetPool,
}: RoutingPageProps) {
  const [routingView, setRoutingView] = React.useState<'matrix' | 'nodes'>(() => {
    if (typeof window === 'undefined') return 'nodes';
    try {
      return window.sessionStorage.getItem('patch:view:v1') === 'matrix' ? 'matrix' : 'nodes';
    } catch {
      return 'nodes';
    }
  });
  React.useEffect(() => {
    try { window.sessionStorage.setItem('patch:view:v1', routingView); } catch { /* in-memory fallback */ }
  }, [routingView]);
  const toggleFxNode = React.useCallback((node: FxRoutingNodeId, enabled: boolean) => {
    for (const key of FX_ROUTING_NODE_ENABLE_KEYS[node][enabled ? 'enable' : 'disable']) {
      onBooleanParamChange(key as keyof SliderState, enabled);
    }
  }, [onBooleanParamChange]);
  return (
    <div className={`routing-root${isMobile ? ' mobile' : ''}`}>
      <div className="routing-container">
        <section
          className="routing-card"
          style={{ '--sc': '#a5c4d4' } as React.CSSProperties}
        >
          <div className="routing-card-header">
            <span className="routing-card-title">FX Routing</span>
            <div className="routing-view-tabs" role="tablist" aria-label="Patch view">
              {([['nodes', 'Nodes'], ['matrix', 'Matrix']] as const).map(([view, label]) => (
                <button key={view} type="button" role="tab" aria-selected={routingView === view}
                  className={routingView === view ? 'active' : ''} onClick={() => setRoutingView(view)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="routing-card-body">
            {routingView === 'matrix' ? (
              <RoutingMatrix
                state={state}
                isMobile={isMobile}
                onParamChange={onParamChange}
                onColumnParamChange={onColumnParamChange}
                onToggleSource={onToggleSource}
                sliderProps={sliderProps}
                helpPage="routing"
                fxRoutingGraph={state.fxRoutingGraph}
                onFxRoutingGraphChange={onFxRoutingGraphChange}
              />
            ) : (
              <FxRoutingGraphView state={state} graph={state.fxRoutingGraph} mobile={isMobile} onChange={onFxRoutingGraphChange}
                onParamChange={onParamChange} onBooleanParamChange={onBooleanParamChange}
                onToggleSource={onToggleSource} onToggleFxNode={toggleFxNode} sliderProps={sliderProps}
                onOpenSynthPresetPool={onOpenSynthPresetPool} />
            )}
            <RoutingMuteGroupsPanel
              muteGroups={routingMuteGroups}
              activeSlotIndex={muteGroupsController.activeSlotIndex}
              selectedSlotIndex={muteGroupsController.selectedSlotIndex}
              onSelectSlot={muteGroupsController.selectSlot}
              onPressSlot={muteGroupsController.pressSlot}
              onSaveSlot={muteGroupsController.saveSlot}
              onSaveSelectedSlot={muteGroupsController.saveSelectedSlot}
              onClearSlot={muteGroupsController.clearSlot}
              onClearSelectedSlot={muteGroupsController.clearSelectedSlot}
              runtimeSnapshot={muteGroupsController.runtimeSnapshot}
              onUpdateSlotPhraseRange={muteGroupsController.updateSlotPhraseRange}
              onUpdateRandomSettings={muteGroupsController.updateRandomSettings}
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
