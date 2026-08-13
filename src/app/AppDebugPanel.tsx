import type { CSSProperties } from 'react';
import { calculateDriftedRoot, formatChordDegrees } from '../audio/harmony';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import type { SliderState } from '../ui/state';
import type { NativeProductRendererDiagnosticStatus } from '../ui/useCapacitorAudioSessionDiagnostics';
import type { ProductCoreDebugSummary } from '../ui/useProductCoreDebugSummary';
import type { ProductRuntimeBackgroundAudioStatus } from '../ui/useProductRuntimeBackgroundAudioSupport';
import type { UseJourneyResult } from '../ui/journeyState';
import { ProductRuntimeSwitch, type ProductRuntimeSwitchMode } from '../ui/ProductRuntimeSwitch';
import {
  FX_BUS_LABELS,
  FX_ORIGIN_LABELS,
  FX_OWNER_LABELS,
} from './appNavigation';
import { appStyles as styles } from './appStyles';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const DEGREE_NAMES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const FX_BUSES = ['delayA', 'delayB', 'granular', 'reverb'] as const;

type AppDebugPanelProps = {
  readonly state: SliderState;
  readonly engineState: ProductEngineState;
  readonly productRuntimeMode: ProductRuntimeSwitchMode;
  readonly productRuntimeModes: readonly ProductRuntimeSwitchMode[];
  readonly showProductRuntimeSwitcher: boolean;
  readonly onProductRuntimeModeChange: (mode: ProductRuntimeSwitchMode) => void;
  readonly productRuntimeCore: boolean;
  readonly productCoreDebugSummary: ProductCoreDebugSummary | null;
  readonly backgroundAudioStatus: ProductRuntimeBackgroundAudioStatus;
  readonly nativeProductRendererDiagnosticStatus: NativeProductRendererDiagnosticStatus;
  readonly requestVisiblePageWakeLock: () => void | Promise<void>;
  readonly releaseVisiblePageWakeLock: () => void | Promise<void>;
  readonly isJourneyPlaying: boolean;
  readonly journey: UseJourneyResult;
  readonly journeyMorphDirection: 'toB' | 'toA';
  readonly morphPosition: number;
  readonly mobileDebugPanelStyle?: CSSProperties;
};

function DebugSection({ title }: { readonly title: string }) {
  return (
    <div
      style={{
        borderTop: '1px solid #333',
        margin: '8px 0',
        paddingTop: '8px',
      }}
    >
      <span
        style={{
          color: '#a855f7',
          fontSize: '0.7rem',
          fontWeight: 'bold',
        }}
      >
        {title}
      </span>
    </div>
  );
}

function getChordTypeLabel(chordTension: number): string {
  if (chordTension < 0.2) return 'Triads';
  if (chordTension < 0.4) return 'Triads + Sus';
  if (chordTension < 0.6) return '7th Chords';
  if (chordTension < 0.8) return '9ths / Extensions';
  return 'Clusters / Quartal';
}

function formatNativeProductStatus(status: NativeProductRendererDiagnosticStatus): string {
  if (!status.active) return '—';
  return [
    status.bridgeAvailable ? 'bridge' : 'waiting',
    status.rendererRunning ? 'running' : 'idle',
    status.probePeak !== null ? `peak ${status.probePeak.toFixed(3)}` : null,
    status.probeRms !== null ? `rms ${status.probeRms.toFixed(3)}` : null,
    status.routeChangeCount > 0 ? `route ${status.routeChangeCount}` : null,
    status.interruptionBeginCount + status.interruptionEndCount > 0
      ? `int ${status.interruptionBeginCount}/${status.interruptionEndCount}`
      : null,
    status.mediaServicesResetCount > 0 ? `reset ${status.mediaServicesResetCount}` : null,
    status.remoteCommandCount > 0 ? `cmd ${status.lastRemoteCommand ?? status.remoteCommandCount}` : null,
    status.lastAudioSessionEvent,
  ].filter(Boolean).join(' · ');
}

export function AppDebugPanel({
  state,
  engineState,
  productRuntimeMode,
  productRuntimeModes,
  showProductRuntimeSwitcher,
  onProductRuntimeModeChange,
  productRuntimeCore,
  productCoreDebugSummary,
  backgroundAudioStatus,
  nativeProductRendererDiagnosticStatus,
  requestVisiblePageWakeLock,
  releaseVisiblePageWakeLock,
  isJourneyPlaying,
  journey,
  journeyMorphDirection,
  morphPosition,
  mobileDebugPanelStyle,
}: AppDebugPanelProps) {
  const effectiveRoot = engineState.harmonyState?.effectiveRoot
    ?? calculateDriftedRoot(state.rootNote, engineState.cofCurrentStep);
  const displayedScaleRoot = NOTE_NAMES[engineState.harmonyState?.effectiveRoot ?? (
    state.cofDriftEnabled ? calculateDriftedRoot(state.rootNote, engineState.cofCurrentStep) : state.rootNote
  )];
  const wakeLockActive = backgroundAudioStatus.wakeLockStatus === 'active';
  const wakeLockAction = wakeLockActive ? releaseVisiblePageWakeLock : requestVisiblePageWakeLock;
  const wakeLockDisabled = backgroundAudioStatus.wakeLockStatus === 'unsupported' || backgroundAudioStatus.pageStatus !== 'foreground';

  return (
    <div className="app-debug-panel" style={{ ...styles.debugPanel, ...mobileDebugPanelStyle }}>
      <h3 style={{ ...styles.panelTitle, color: '#a855f7' }}>Debug Info</h3>
      <ProductRuntimeSwitch
        currentMode={productRuntimeMode}
        modes={productRuntimeModes}
        onModeChange={onProductRuntimeModeChange}
        visible={showProductRuntimeSwitcher}
        testId="debug-product-runtime-switch"
      />
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>UTC Bucket:</span>
        <span style={styles.debugValue}>{engineState.currentBucket || '—'}</span>
      </div>
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Seed:</span>
        <span style={styles.debugValue}>{engineState.currentSeed ? engineState.currentSeed.toString(16).toUpperCase() : '—'}</span>
      </div>
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Scale Family:</span>
        <span style={styles.debugValue}>
          {engineState.harmonyState?.scaleFamily.name
            ? `${displayedScaleRoot ?? '—'} ${engineState.harmonyState.scaleFamily.name}`
            : '—'}
        </span>
      </div>
      {state.cofDriftEnabled && (
        <div style={styles.debugRow}>
          <span style={styles.debugLabel}>CoF Key:</span>
          <span style={styles.debugValue}>
            {NOTE_NAMES[effectiveRoot] ?? '—'} (step: {engineState.cofCurrentStep > 0 ? '+' : ''}
            {engineState.cofCurrentStep})
          </span>
        </div>
      )}
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Current Chord:</span>
        <span style={styles.debugValue}>{engineState.harmonyState ? formatChordDegrees(engineState.harmonyState.currentChord.midiNotes) : '—'}</span>
      </div>
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Next Harmony Event:</span>
        <span style={styles.debugValue}>
          {engineState.isRunning && engineState.transportDebug && engineState.transportDebug.nextHarmonyEventIn !== null
            ? `${engineState.transportDebug.nextHarmonyEventIn.toFixed(1)}s`
            : '—'}
        </span>
      </div>
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Next Phrase:</span>
        <span style={styles.debugValue}>{engineState.isRunning && engineState.transportDebug ? `${engineState.transportDebug.nextPhraseBoundaryIn.toFixed(1)}s` : '—'}</span>
      </div>
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Next Progression:</span>
        <span style={styles.debugValue}>
          {engineState.isRunning && engineState.transportDebug && engineState.transportDebug.nextProgressionStepIn !== null
            ? `${engineState.transportDebug.nextProgressionStepIn.toFixed(1)}s`
            : '—'}
        </span>
      </div>
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Phrase Length:</span>
        <span style={styles.debugValue}>{engineState.transportDebug ? `${engineState.transportDebug.effectivePhraseSeconds.toFixed(2)}s` : '—'}</span>
      </div>
      <div style={styles.debugRow}>
        <span style={styles.debugLabel}>Beat BPM:</span>
        <span style={styles.debugValue}>{engineState.transportDebug ? `${engineState.transportDebug.effectiveBpm.toFixed(1)}` : '—'}</span>
      </div>
      {productRuntimeCore && (
        <>
          <DebugSection title="Product Core" />
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Earth:</span>
            <span style={styles.debugValue}>{productCoreDebugSummary?.earth ?? '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Walk:</span>
            <span style={styles.debugValue}>{productCoreDebugSummary?.randomWalk ?? '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>S&amp;H:</span>
            <span style={styles.debugValue}>{productCoreDebugSummary?.sampleHold ?? '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>BG:</span>
            <span style={styles.debugValue}>{backgroundAudioStatus.pageStatus} · {backgroundAudioStatus.lifecycleEvent} · {backgroundAudioStatus.productLifecycleState}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Wake:</span>
            <span style={styles.debugValue}>{backgroundAudioStatus.wakeLockStatus}</span>
          </div>
          <div style={styles.debugRow} title={backgroundAudioStatus.limitation}>
            <span style={styles.debugLabel}>Wake Control:</span>
            <button
              type="button"
              style={{
                ...styles.macAudioStatusButton,
                ...(wakeLockActive ? styles.macAudioStatusButtonActive : {}),
                ...(wakeLockDisabled ? styles.statusButtonDisabled : {}),
              }}
              aria-pressed={wakeLockActive}
              onClick={() => void wakeLockAction()}
              disabled={wakeLockDisabled}
              title="Visible-page Wake Lock. Browser/mobile lock-screen and app-background playback remain best-effort."
            >
              {wakeLockActive ? 'Release' : 'Wake'}
            </button>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Media:</span>
            <span style={styles.debugValue}>{backgroundAudioStatus.mediaSessionStatus}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Native:</span>
            <span style={styles.debugValue}>{formatNativeProductStatus(nativeProductRendererDiagnosticStatus)}</span>
          </div>
        </>
      )}
      <DebugSection title="FX Ownership" />
      {FX_BUSES.map((bus) => {
        const ownerState = engineState.fxOwners[bus];
        const ownerLabel = ownerState.owner ? FX_OWNER_LABELS[ownerState.owner] : '—';
        const originLabel = ownerState.lastOrigin ? FX_ORIGIN_LABELS[ownerState.lastOrigin] : null;
        return (
          <div key={bus} style={styles.debugRow}>
            <span style={styles.debugLabel}>{FX_BUS_LABELS[bus]}:</span>
            <span style={styles.debugValue}>{ownerState.owner ? `${ownerLabel}${ownerState.active ? '' : ' (stale)'}${originLabel ? ` · ${originLabel}` : ''}` : '—'}</span>
          </div>
        );
      })}

      {engineState.harmonyState && (
        <>
          <DebugSection title="Tension & Chord Complexity" />
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Scale Tension:</span>
            <span style={styles.debugValue}>{engineState.harmonyState.scaleTension.toFixed(2)}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Chord Tension:</span>
            <span style={styles.debugValue}>{engineState.harmonyState.chordTension.toFixed(2)}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Chord Type:</span>
            <span style={styles.debugValue}>{getChordTypeLabel(engineState.harmonyState.chordTension)}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Chord Size:</span>
            <span style={styles.debugValue}>{engineState.harmonyState.currentChord.midiNotes.length} notes</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Current Degree:</span>
            <span style={styles.debugValue}>{DEGREE_NAMES[engineState.harmonyState.currentDegree] ?? '—'}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Tension Arc:</span>
            <span style={styles.debugValue}>
              {engineState.harmonyState.tensionArc.type}
              {engineState.harmonyState.tensionArc.phrasesRemaining > 0 ? ` (${engineState.harmonyState.tensionArc.phrasesRemaining} left)` : ''}
            </span>
          </div>
        </>
      )}

      {isJourneyPlaying && journey.config && (
        <>
          <DebugSection title="Journey Mode" />
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Phase:</span>
            <span style={styles.debugValue}>{journey.state.phase}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Current:</span>
            <span style={styles.debugValue}>{journey.config.nodes.find((n) => n.id === journey.state.currentNodeId)?.presetName || '—'}</span>
          </div>
          {journey.state.phase === 'morphing' && (
            <>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Morphing To:</span>
                <span style={styles.debugValue}>{journey.config.nodes.find((n) => n.id === journey.state.nextNodeId)?.presetName || '—'}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Morph Progress:</span>
                <span style={styles.debugValue}>{(journey.state.morphProgress * 100).toFixed(0)}%</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Morph Time Left:</span>
                <span style={styles.debugValue}>{(journey.state.resolvedMorphDuration * (1 - journey.state.morphProgress) * (state.phraseLength ?? 16)).toFixed(1)}s</span>
              </div>
            </>
          )}
          {journey.state.phase === 'playing' && (
            <>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Phrases Left:</span>
                <span style={styles.debugValue}>{Math.ceil(journey.state.resolvedPhraseDuration * (1 - journey.state.phraseProgress))}</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Phrase Time Left:</span>
                <span style={styles.debugValue}>{(journey.state.resolvedPhraseDuration * (1 - journey.state.phraseProgress) * (state.phraseLength ?? 16)).toFixed(1)}s</span>
              </div>
              <div style={styles.debugRow}>
                <span style={styles.debugLabel}>Next Preset:</span>
                <span style={styles.debugValue}>{journey.config.nodes.find((n) => n.id === journey.state.plannedNextNodeId)?.presetName || '—'}</span>
              </div>
            </>
          )}
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Morph Direction:</span>
            <span style={styles.debugValue}>{journeyMorphDirection}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugLabel}>Morph Pos:</span>
            <span style={styles.debugValue}>{morphPosition}%</span>
          </div>
        </>
      )}
    </div>
  );
}
