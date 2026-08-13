import type { KesshoMacAudioOutputStatus } from '../native/capacitorMacShell';
import { appStyles as styles } from './appStyles';

type MacAudioStatusPillProps = {
  readonly macShellAvailable: boolean;
  readonly macAudioOutputStatus: KesshoMacAudioOutputStatus | null;
  readonly macAirPlayPerformanceActive: boolean;
  readonly onToggleAirPlayPerformance: () => void;
  readonly onOpenMacSoundSettings: () => void;
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
