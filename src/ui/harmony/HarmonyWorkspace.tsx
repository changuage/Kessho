import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { HarmonyState } from '../../audio/harmony';
import { resolveHarmonyProjection, type HarmonyLiveLayer, type HarmonyProjection } from '../../audio/harmony/harmonyProjection';
import type { ProductManualSynthNote } from '../../audio/product/ProductEngineTypes';
import type { SliderState } from '../state';
import type { CircleOfFifthsProps } from '../CircleOfFifths';
import { HarmonyEnginePanel } from './HarmonyEnginePanel';
import { HarmonySlotStrip } from './HarmonySlotStrip';
import { HarmonyWorkspaceHeader } from './HarmonyWorkspaceHeader';
import { deriveHarmonyWorkspaceTonalContext, useHarmonyWorkspaceController } from './useHarmonyWorkspaceController';
import { captureHarmonyAuthoredSnapshot } from './useHarmonyWorkspaceController';
import { crossedHarmonyProgressionBoundary, createHarmonyAdoptionController, type HarmonyAdoptionController, type HarmonyBoundaryPosition } from './harmonyAdoptionController';
import type { TonalContextDisplay } from '../../audio/harmony/tonalContextAnalysis';
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
  onHarmonyLiveLayerChange?: (layer: HarmonyLiveLayer | null) => void;
  isRunning?: boolean;
  /** Advisory context only; Engine state remains the sole mutation authority. */
  tonalContext?: TonalContextDisplay | null;
}

function viewDescription(view: 'simple' | 'detail' | 'overview'): string {
  if (view === 'simple') return 'Root, scale, Circle of Fifths, and automatic Harmony policy';
  if (view === 'detail') return 'Manual voicing and single-slot chord construction';
  return 'Canonical progression, performance, and Harmony takeover';
}

const HARMONY_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function HarmonyWorkspace({ state, harmonyState, harmonyProjection, onStateChange, onAuditionNote, morphReadOnly = false, CircleOfFifthsComponent, cofCurrentStep = 0, morphCoFViz = null, morphPosition = 0, onResetCofDrift, onHarmonyLiveLayerChange, isRunning = false, tonalContext = null }: HarmonyWorkspaceProps) {
  const projection = useMemo(() => harmonyProjection ?? resolveHarmonyProjection(state, { harmonyState }), [harmonyProjection, harmonyState, state]);
  const actionsLocked = harmonyWorkspaceActionsLocked(morphReadOnly, projection.engine.morphLocked);
  const controller = useHarmonyWorkspaceController(state, actionsLocked ? undefined : onStateChange);
  const workspaceTonalContext = useMemo(() => tonalContext ?? deriveHarmonyWorkspaceTonalContext(projection, Date.now(), isRunning), [projection, tonalContext, isRunning]);
  const adoptionControllerRef = useRef<HarmonyAdoptionController | null>(null);
  if (!adoptionControllerRef.current) adoptionControllerRef.current = createHarmonyAdoptionController({ rootNote: state.rootNote, manualScale: state.manualScale, cofCurrentStep: state.cofCurrentStep });
  const [adoptionView, setAdoptionView] = useState(() => adoptionControllerRef.current!.snapshot());
  const adoptionBeforeRef = useRef<ReturnType<typeof captureHarmonyAuthoredSnapshot> | null>(null);
  const adoptionModeRef = useRef<'playing' | 'preview' | null>(null);
  const boundaryPosition: HarmonyBoundaryPosition = { eventIndex: projection.position.eventIndex, absoluteBarIndex: projection.position.absoluteBarIndex };
  const boundaryRef = useRef<HarmonyBoundaryPosition>(boundaryPosition);
  const editableStateChange = actionsLocked ? undefined : controller.onStateChange;
  const transientStateChange = actionsLocked ? undefined : controller.onTransientStateChange;
  const activeSlotId = projection.position.eventIndex >= 0 ? projection.progression[projection.position.eventIndex]?.slotId ?? null : null;
  const historyLabel = controller.history.past.length > 0 ? controller.history.past[controller.history.past.length - 1]?.label : 'No authored edits';
  const surface = harmonyWorkspaceSurfaceForView(controller.view);
  useEffect(() => {
    adoptionControllerRef.current?.syncAuthored({ rootNote: state.rootNote, manualScale: state.manualScale, cofCurrentStep: state.cofCurrentStep });
  }, [state.rootNote, state.manualScale, state.cofCurrentStep]);

  const advisoryTarget = workspaceTonalContext.preview?.top ?? workspaceTonalContext.playing.top;
  const advisoryMode = workspaceTonalContext.preview?.top ? 'preview' : workspaceTonalContext.playing.top ? 'playing' : null;
  const adoptionTarget = advisoryTarget ? { rootPitchClass: advisoryTarget.rootPitchClass, scaleId: advisoryTarget.scaleId, scaleName: advisoryTarget.scaleName } : null;
  const fixedTransitionTarget = adoptionView.isActive && adoptionView.transition ? { rootPitchClass: adoptionView.transition.targetRoot, scaleId: adoptionView.transition.targetScaleId, scaleName: adoptionView.transition.targetScaleName } : null;
  const visibleAdoptionTarget = fixedTransitionTarget ?? adoptionTarget;
  const adoptionTargetLabel = visibleAdoptionTarget ? `${HARMONY_NOTE_NAMES[((Math.round(visibleAdoptionTarget.rootPitchClass) % 12) + 12) % 12]} · ${visibleAdoptionTarget.scaleName ?? `Scale ${visibleAdoptionTarget.scaleId}`}` : null;
  const visibleAdoptionMode = adoptionView.isActive ? adoptionModeRef.current ?? advisoryMode : advisoryMode;

  const refreshAdoptionView = () => setAdoptionView(adoptionControllerRef.current!.snapshot());
  const handleAdopt = () => {
    if (!adoptionTarget || actionsLocked) return;
    adoptionBeforeRef.current = captureHarmonyAuthoredSnapshot(state);
    adoptionModeRef.current = advisoryMode;
    if (isRunning) {
      adoptionControllerRef.current!.startRunning({ effectiveRootMidi: projection.engine.rootMidi, effectiveScaleId: projection.engine.scaleId, target: adoptionTarget, preview: false, sourceNotePool: projection.underlyingFrame.currentNotePool });
      refreshAdoptionView();
      return;
    }
    const result = adoptionControllerRef.current!.adoptStopped(adoptionTarget, false);
    if (result.accepted && result.patch) controller.commitAuthoredStateChange((previous) => ({ ...previous, ...result.patch }), adoptionBeforeRef.current, 'Adopt harmony');
    refreshAdoptionView();
  };

  const handleCancelAdopt = () => {
    if (actionsLocked) return;
    const result = adoptionControllerRef.current!.cancel(true);
    if (result.accepted && result.patch) onStateChange?.((previous) => ({ ...previous, ...result.patch }));
    if (result.accepted) adoptionModeRef.current = null;
    refreshAdoptionView();
  };

  useEffect(() => {
    const crossed = crossedHarmonyProgressionBoundary(boundaryRef.current, boundaryPosition, projection.canonicalProgression, state.transportBarsPerPhrase);
    boundaryRef.current = boundaryPosition;
    if (!crossed || !adoptionControllerRef.current?.snapshot().isActive || actionsLocked) return;
    const result = adoptionControllerRef.current.advance(true);
    if (!result.patch) { refreshAdoptionView(); return; }
    if (result.complete) controller.commitAuthoredStateChange((previous) => ({ ...previous, ...result.patch }), adoptionBeforeRef.current ?? undefined, 'Adopt harmony');
    else onStateChange?.((previous) => ({ ...previous, ...result.patch }));
    refreshAdoptionView();
  }, [actionsLocked, boundaryPosition.absoluteBarIndex, boundaryPosition.eventIndex, controller, onStateChange, projection.canonicalProgression, state.transportBarsPerPhrase]);

  return (
    <section className={`harmony-workspace harmony-workspace--${controller.view}`} aria-label="Harmony workspace" data-harmony-view={controller.view}>
      <HarmonyWorkspaceHeader projection={projection} view={controller.view} onViewChange={controller.setView} morphReadOnly={actionsLocked} tonalContext={workspaceTonalContext} adoption={{ targetLabel: adoptionTargetLabel, mode: visibleAdoptionMode, active: adoptionView.isActive, onAdopt: handleAdopt, onCancel: handleCancelAdopt, disabled: actionsLocked || (!adoptionView.isActive && !adoptionTarget) }} />
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
          onHarmonyLiveLayerChange={onHarmonyLiveLayerChange}
          isRunning={isRunning}
          workspaceView={controller.view}
        />
      </div>
    </section>
  );
}

export default HarmonyWorkspace;
