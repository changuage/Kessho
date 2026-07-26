import React, { useMemo } from 'react';
import type { HarmonyState } from '../../audio/harmony';
import { resolveHarmonyProjection, type HarmonyProjection } from '../../audio/harmony/harmonyProjection';
import type { ProductManualSynthNote } from '../../audio/product/ProductEngineTypes';
import type { SliderState } from '../state';
import type { CircleOfFifthsProps } from '../CircleOfFifths';
import { HarmonyEnginePanel } from './HarmonyEnginePanel';
import { HarmonySlotStrip } from './HarmonySlotStrip';
import { HarmonyWorkspaceHeader } from './HarmonyWorkspaceHeader';
import { useHarmonyWorkspaceController } from './useHarmonyWorkspaceController';
import { harmonyWorkspaceActionsLocked, harmonyWorkspaceSurfaceForView } from './harmonyWorkspaceState';
import './HarmonyWorkspace.css';
import './HarmonySimple.css';

export interface HarmonyWorkspaceProps {
  state: SliderState;
  harmonyState?: HarmonyState | null;
  harmonyProjection?: HarmonyProjection;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  onAuditionNote?: (note: ProductManualSynthNote) => void;
  /** Midpoint morph owns Harmony and makes all authored/live actions read-only. */
  morphReadOnly?: boolean;
  CircleOfFifthsComponent?: React.ComponentType<CircleOfFifthsProps>;
  cofCurrentStep?: number;
  morphCoFViz?: { cofStep: number; startRoot: number; targetRoot: number } | null;
  morphPosition?: number;
  onResetCofDrift?: () => void;
}

function viewDescription(view: 'simple' | 'detail' | 'overview'): string {
  if (view === 'simple') return 'Root, scale, Circle of Fifths, and automatic Harmony policy';
  if (view === 'detail') return 'Manual voicing and single-slot chord construction';
  return 'Canonical progression, performance, and Harmony takeover';
}

export function HarmonyWorkspace({ state, harmonyState, harmonyProjection, onStateChange, onAuditionNote, morphReadOnly = false, CircleOfFifthsComponent, cofCurrentStep = 0, morphCoFViz = null, morphPosition = 0, onResetCofDrift }: HarmonyWorkspaceProps) {
  const projection = useMemo(() => harmonyProjection ?? resolveHarmonyProjection(state, { harmonyState }), [harmonyProjection, harmonyState, state]);
  const actionsLocked = harmonyWorkspaceActionsLocked(morphReadOnly, projection.engine.morphLocked);
  const controller = useHarmonyWorkspaceController(state, actionsLocked ? undefined : onStateChange);
  const editableStateChange = actionsLocked ? undefined : controller.onStateChange;
  const transientStateChange = actionsLocked ? undefined : controller.onTransientStateChange;
  const activeSlotId = projection.position.eventIndex >= 0 ? projection.progression[projection.position.eventIndex]?.slotId ?? null : null;
  const historyLabel = controller.history.past.length > 0 ? controller.history.past[controller.history.past.length - 1]?.label : 'No authored edits';
  const surface = harmonyWorkspaceSurfaceForView(controller.view);

  return (
    <section className={`harmony-workspace harmony-workspace--${controller.view}`} aria-label="Harmony workspace" data-harmony-view={controller.view}>
      <HarmonyWorkspaceHeader projection={projection} view={controller.view} onViewChange={controller.setView} morphReadOnly={actionsLocked} />
      <HarmonySlotStrip slots={projection.slots} activeSlotId={activeSlotId} />
      <div className="harmony-workspace-toolbar">
        <span>{viewDescription(controller.view)}</span>
        <div className="harmony-workspace-history" aria-label="Harmony history controls">
          <button type="button" onClick={controller.undo} disabled={!controller.canUndo || actionsLocked} title={historyLabel}>Undo</button>
          <button type="button" onClick={controller.redo} disabled={!controller.canRedo || actionsLocked}>Redo</button>
          <span aria-live="polite">{controller.history.past.length > 0 ? `${controller.history.past.length} authored edit${controller.history.past.length === 1 ? '' : 's'}` : 'History empty'}</span>
        </div>
      </div>
      <div className="harmony-workspace-body" data-harmony-surface={controller.view} data-harmony-simple-controls={surface.simpleControls} data-harmony-manual-voicing={surface.manualVoicing} data-harmony-progression-editor={surface.progressionEditor} data-harmony-performance-surface={surface.performanceSurface}>
        {controller.view === 'simple' && (
          <div className="harmony-simple-controls" aria-label="Simple Harmony controls">
            <div className="harmony-simple-controls-header"><strong>Simple</strong><span>Root, Scale, Circle of Fifths, and automation</span></div>
            <div className="harmony-simple-cof-row">
              {CircleOfFifthsComponent && <CircleOfFifthsComponent
                homeRoot={state.rootNote}
                currentStep={morphCoFViz?.cofStep ?? cofCurrentStep}
                driftRange={state.cofDriftRange}
                driftDirection={state.cofDriftDirection}
                enabled={Boolean(state.cofDriftEnabled)}
                size={120}
                isMorphing={Boolean(morphCoFViz)}
                morphStartRoot={morphCoFViz?.startRoot}
                morphTargetRoot={morphCoFViz?.targetRoot}
                morphProgress={morphPosition}
                onSelectRoot={(rootNote) => {
                  if (actionsLocked || !editableStateChange) return;
                  editableStateChange((previous) => ({ ...previous, rootNote, cofCurrentStep: 0 }));
                  onResetCofDrift?.();
                }}
              />}
              <div className="harmony-simple-cof-fields">
                <label><span>CoF Drift</span><button type="button" disabled={actionsLocked || !editableStateChange} onClick={() => editableStateChange?.((previous) => ({ ...previous, cofDriftEnabled: !previous.cofDriftEnabled }))}>{state.cofDriftEnabled ? 'On' : 'Off'}</button></label>
                <label><span>Rate</span><input type="range" min={1} max={8} step={1} value={state.cofDriftRate} disabled={actionsLocked || !editableStateChange} onChange={(event) => editableStateChange?.((previous) => ({ ...previous, cofDriftRate: Number(event.target.value) }))} /></label>
                <label><span>Range</span><input type="range" min={1} max={6} step={1} value={state.cofDriftRange} disabled={actionsLocked || !editableStateChange} onChange={(event) => editableStateChange?.((previous) => ({ ...previous, cofDriftRange: Number(event.target.value) }))} /></label>
                <label><span>Direction</span><select value={state.cofDriftDirection} disabled={actionsLocked || !editableStateChange} onChange={(event) => editableStateChange?.((previous) => ({ ...previous, cofDriftDirection: event.target.value as SliderState['cofDriftDirection'] }))}><option value="cw">CW</option><option value="ccw">CCW</option><option value="random">Random</option></select></label>
              </div>
            </div>
          </div>
        )}
        <HarmonyEnginePanel
          state={state}
          harmonyState={harmonyState}
          harmonyProjection={projection}
          onStateChange={editableStateChange}
          onTransientStateChange={transientStateChange}
          onAuditionNote={actionsLocked ? undefined : onAuditionNote}
          workspaceView={controller.view}
        />
      </div>
    </section>
  );
}

export default HarmonyWorkspace;
