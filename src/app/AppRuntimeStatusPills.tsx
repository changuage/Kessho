import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KesshoMacAudioOutputStatus } from '../native/capacitorMacShell';
import type { NativeProductRendererDiagnosticStatus } from '../ui/useCapacitorAudioSessionDiagnostics';
import type { ProductRuntimeBackgroundAudioStatus } from '../ui/useProductRuntimeBackgroundAudioSupport';
import { appStyles as styles } from './appStyles';

type MacAudioStatusPillProps = {
  readonly macShellAvailable: boolean;
  readonly macAudioOutputStatus: KesshoMacAudioOutputStatus | null;
  readonly macAirPlayPerformanceActive: boolean;
  readonly onToggleAirPlayPerformance: () => void;
  readonly onOpenMacSoundSettings: () => void;
};

type BackgroundAudioStatusPillProps = {
  readonly productRuntimeCore: boolean;
  readonly backgroundAudioStatus: ProductRuntimeBackgroundAudioStatus;
  readonly nativeProductRendererDiagnosticStatus: NativeProductRendererDiagnosticStatus;
  readonly requestVisiblePageWakeLock: () => void | Promise<void>;
  readonly releaseVisiblePageWakeLock: () => void | Promise<void>;
};

const activeStatusButtonStyle = {
  border: '1px solid rgba(94, 234, 212, 0.45)',
  background: 'rgba(20, 184, 166, 0.18)',
  color: '#99f6e4',
} as const;

export function MacAudioStatusPill({
  macShellAvailable,
  macAudioOutputStatus,
  macAirPlayPerformanceActive,
  onToggleAirPlayPerformance,
  onOpenMacSoundSettings,
}: MacAudioStatusPillProps) {
  if (!macShellAvailable) return null;
  const outputName = macAudioOutputStatus?.outputName ?? 'Mac Output';
  const routeLabel = macAudioOutputStatus?.isAirPlay ? 'AirPlay' : macAudioOutputStatus?.transportType ? macAudioOutputStatus.transportType : 'macOS';
  const sampleRate = macAudioOutputStatus?.sampleRate ? `${Math.round(macAudioOutputStatus.sampleRate / 100) / 10}k` : null;

  return (
    <div style={styles.macAudioStatus} aria-label="macOS audio output">
      <span style={styles.macAudioStatusText}>
        {routeLabel} · {outputName}
        {sampleRate ? ` · ${sampleRate}` : ''}
      </span>
      <button
        type="button"
        style={{
          ...styles.macAudioStatusButton,
          ...(macAirPlayPerformanceActive ? activeStatusButtonStyle : {}),
        }}
        aria-pressed={macAirPlayPerformanceActive}
        onClick={onToggleAirPlayPerformance}
        title="Toggle AirPlay performance mode"
      >
        Stable
      </button>
      <button type="button" style={styles.macAudioStatusButton} onClick={onOpenMacSoundSettings} title="Open macOS Sound settings">
        Sound
      </button>
    </div>
  );
}

export function BackgroundAudioStatusPill({
  productRuntimeCore,
  backgroundAudioStatus,
  requestVisiblePageWakeLock,
  releaseVisiblePageWakeLock,
}: BackgroundAudioStatusPillProps) {
  const [debugPanelTarget, setDebugPanelTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setDebugPanelTarget(document.querySelector<HTMLElement>('.app-debug-panel'));
  }, []);

  if (!productRuntimeCore || !debugPanelTarget) return null;

  const wakeLockAction = backgroundAudioStatus.wakeLockStatus === 'active'
    ? releaseVisiblePageWakeLock
    : requestVisiblePageWakeLock;
  const wakeLockDisabled = backgroundAudioStatus.wakeLockStatus === 'unsupported' || backgroundAudioStatus.pageStatus !== 'foreground';
  const wakeLockLabel = backgroundAudioStatus.wakeLockStatus === 'active' ? 'Release' : 'Wake';

  return createPortal(
    <div
      style={styles.debugRow}
      title={backgroundAudioStatus.limitation}
    >
      <span style={styles.debugLabel}>Wake Control:</span>
      <button
        type="button"
        style={{
          ...styles.macAudioStatusButton,
          ...(backgroundAudioStatus.wakeLockStatus === 'active' ? activeStatusButtonStyle : {}),
          ...(wakeLockDisabled ? styles.statusButtonDisabled : {}),
        }}
        onClick={() => void wakeLockAction()}
        disabled={wakeLockDisabled}
        title="Visible-page Wake Lock. Browser/mobile lock-screen and app-background playback remain best-effort."
      >
        {wakeLockLabel}
      </button>
    </div>,
    debugPanelTarget,
  );
}
