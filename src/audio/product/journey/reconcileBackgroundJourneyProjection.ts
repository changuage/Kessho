import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';

export type BackgroundJourneyRuntimePhase = 'playing' | 'morphing' | 'completed' | 'stopped';

export type BackgroundJourneyTerminalState = {
  terminalRevision: number | null;
  observedRunning: boolean;
};

export type BackgroundJourneyTerminalActions = {
  projectEnded: () => void;
  stopJourney: () => void;
  stopPolling: () => void;
  clearPlaying: () => void;
  releaseAssets: () => void;
};

export function resolveBackgroundJourneyRuntimePhase(
  telemetry: Pick<CoreProductTelemetrySnapshot, 'journeySchedulePhase' | 'journeyScheduleRunning'>,
): BackgroundJourneyRuntimePhase {
  if (telemetry.journeySchedulePhase === 3) return 'completed';
  if (!telemetry.journeyScheduleRunning) return 'stopped';
  return telemetry.journeySchedulePhase === 2 ? 'morphing' : 'playing';
}

export function reconcileBackgroundJourneyTerminal(
  state: BackgroundJourneyTerminalState,
  revision: number,
  phase: BackgroundJourneyRuntimePhase,
  acceptUnobservedStop: boolean,
  actions: BackgroundJourneyTerminalActions,
): boolean {
  if (phase === 'playing' || phase === 'morphing') {
    state.terminalRevision = null;
    state.observedRunning = true;
    return false;
  }
  if (phase === 'stopped' && !state.observedRunning && !acceptUnobservedStop) return false;
  if (state.terminalRevision === revision) return true;

  state.terminalRevision = revision;
  if (phase === 'completed') actions.projectEnded();
  else actions.stopJourney();
  actions.clearPlaying();
  actions.stopPolling();
  actions.releaseAssets();
  return true;
}
