import { AudioEngineRuntimeSwitch } from '../AudioEngineRuntimeSwitch';
import type { AudioEngineRuntimeMode } from '../useAudioEngineRuntimeNavigation';
import { audioEngineRuntimeModeLabel } from '../audioEngineRuntimeUi';

export type GlobalRuntimeCpuSummary = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  moduleCount: number;
  updatedAt: number;
};

export type GlobalRuntimeComparisonPanelProps = {
  currentMode: AudioEngineRuntimeMode;
  modes: readonly AudioEngineRuntimeMode[];
  cpuSummaries?: Partial<Record<AudioEngineRuntimeMode, GlobalRuntimeCpuSummary>>;
  visible: boolean;
  onModeChange?: (mode: AudioEngineRuntimeMode) => void;
};

function formatCpuPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '--';
}

function runtimePillLabel(mode: AudioEngineRuntimeMode): string {
  if (mode === 'core-product') return 'Product Core';
  if (mode === 'core-smoke') return 'Smoke';
  return 'Web';
}

export function GlobalRuntimeComparisonPanel({
  currentMode,
  modes,
  cpuSummaries,
  visible,
  onModeChange,
}: GlobalRuntimeComparisonPanelProps): JSX.Element | null {
  if (!visible || !onModeChange) return null;

  return (
    <div className="scene-card scene-engine-card">
      <div className="scene-card-header">
        <h3 className="scene-card-title">Audio Engine Test</h3>
        <span className={`scene-run-pill ${currentMode === 'core-product' ? 'running' : 'stopped'}`}>
          {runtimePillLabel(currentMode)}
        </span>
      </div>
      <div className="scene-engine-switch">
        <span className="scene-status-label">Runtime</span>
        <div className="scene-engine-switch-stack">
          <AudioEngineRuntimeSwitch
            currentMode={currentMode}
            modes={modes}
            onModeChange={onModeChange}
            labelVariant="reference"
            testId="global-audio-engine-switch"
            variant="scene"
          />
          <div className="scene-engine-cpu-compare" aria-label="Audio engine CPU comparison">
            {modes.map((mode) => {
              const summary = cpuSummaries?.[mode];
              return (
                <div key={mode} className={`scene-engine-cpu-row${currentMode === mode ? ' active' : ''}`}>
                  <span>{mode === 'web-ts' ? 'Web TS' : audioEngineRuntimeModeLabel(mode)}</span>
                  <span>avg {formatCpuPercent(summary?.avgPercent)}</span>
                  <span>peak {formatCpuPercent(summary?.peakPercent)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
