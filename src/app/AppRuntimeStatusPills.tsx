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
  readonly productRuntimeMode: string;
  readonly backgroundAudioStatus: ProductRuntimeBackgroundAudioStatus;
  readonly nativeProductRendererDiagnosticStatus: NativeProductRendererDiagnosticStatus;
  readonly requestVisiblePageWakeLock: () => void | Promise<void>;
  readonly releaseVisiblePageWakeLock: () => void | Promise<void>;
};

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
          ...(macAirPlayPerformanceActive ? styles.macAudioStatusButtonActive : {}),
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
  productRuntimeMode,
  backgroundAudioStatus,
  nativeProductRendererDiagnosticStatus,
  requestVisiblePageWakeLock,
  releaseVisiblePageWakeLock,
}: BackgroundAudioStatusPillProps) {
  if (productRuntimeMode !== 'core-product') return null;
  const wakeLockAction = backgroundAudioStatus.wakeLockStatus === 'active'
    ? releaseVisiblePageWakeLock
    : requestVisiblePageWakeLock;
  const wakeLockDisabled = backgroundAudioStatus.wakeLockStatus === 'unsupported' || backgroundAudioStatus.pageStatus !== 'foreground';
  const wakeLockLabel = backgroundAudioStatus.wakeLockStatus === 'active' ? 'Release' : 'Wake';
  const nativeProbeLabel = nativeProductRendererDiagnosticStatus.active
    ? nativeProductRendererDiagnosticStatus.probePeak !== null
      ? ` · Native ${nativeProductRendererDiagnosticStatus.probePeak.toFixed(3)}`
      : nativeProductRendererDiagnosticStatus.bridgeAvailable
        ? ' · Native ready'
        : ' · Native waiting'
    : '';

  return (
    <div style={styles.backgroundAudioStatus} aria-label="Browser background audio status" title={backgroundAudioStatus.limitation}>
      <span style={styles.macAudioStatusText}>
        {backgroundAudioStatus.pageStatus === 'foreground' ? 'Foreground' : 'Hidden'}
        {' · '}
        {backgroundAudioStatus.productLifecycleState}
        {' · Media '}
        {backgroundAudioStatus.mediaSessionStatus}
        {' · Wake '}
        {backgroundAudioStatus.wakeLockStatus}
        {nativeProbeLabel}
      </span>
      <button
        type="button"
        style={{
          ...styles.macAudioStatusButton,
          ...(backgroundAudioStatus.wakeLockStatus === 'active' ? styles.macAudioStatusButtonActive : {}),
          ...(wakeLockDisabled ? styles.statusButtonDisabled : {}),
        }}
        onClick={() => void wakeLockAction()}
        disabled={wakeLockDisabled}
        title="Visible-page Wake Lock. Browser/mobile lock-screen and app-background playback remain best-effort."
      >
        {wakeLockLabel}
      </button>
    </div>
  );
}
