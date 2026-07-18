import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reconcileBackgroundJourneyTerminal,
  resolveBackgroundJourneyRuntimePhase,
  type BackgroundJourneyTerminalActions,
} from './reconcileBackgroundJourneyProjection';

test('resolves Product Core terminal and active Journey telemetry', () => {
  assert.equal(resolveBackgroundJourneyRuntimePhase({ journeySchedulePhase: 3, journeyScheduleRunning: false }), 'completed');
  assert.equal(resolveBackgroundJourneyRuntimePhase({ journeySchedulePhase: 0, journeyScheduleRunning: false }), 'stopped');
  assert.equal(resolveBackgroundJourneyRuntimePhase({ journeySchedulePhase: 1, journeyScheduleRunning: true }), 'playing');
  assert.equal(resolveBackgroundJourneyRuntimePhase({ journeySchedulePhase: 2, journeyScheduleRunning: true }), 'morphing');
});

test('reconciles natural completion once and releases host runtime ownership', () => {
  const calls: string[] = [];
  const actions: BackgroundJourneyTerminalActions = {
    projectEnded: () => calls.push('ended'),
    stopJourney: () => calls.push('stopped'),
    clearPlaying: () => calls.push('clear-playing'),
    stopPolling: () => calls.push('stop-polling'),
    releaseAssets: () => calls.push('release-assets'),
  };
  const state = { terminalRevision: null, observedRunning: true };

  assert.equal(reconcileBackgroundJourneyTerminal(state, 7, 'completed', false, actions), true);
  assert.equal(reconcileBackgroundJourneyTerminal(state, 7, 'completed', false, actions), true);
  assert.deepEqual(calls, ['ended', 'clear-playing', 'stop-polling', 'release-assets']);
});

test('reconciles engine stop and permits a later run of the same revision', () => {
  const calls: string[] = [];
  const actions: BackgroundJourneyTerminalActions = {
    projectEnded: () => calls.push('ended'),
    stopJourney: () => calls.push('stopped'),
    clearPlaying: () => calls.push('clear-playing'),
    stopPolling: () => calls.push('stop-polling'),
    releaseAssets: () => calls.push('release-assets'),
  };
  const state = { terminalRevision: null, observedRunning: true };

  reconcileBackgroundJourneyTerminal(state, 11, 'stopped', false, actions);
  reconcileBackgroundJourneyTerminal(state, 11, 'playing', false, actions);
  reconcileBackgroundJourneyTerminal(state, 11, 'stopped', false, actions);
  assert.deepEqual(calls, [
    'stopped', 'clear-playing', 'stop-polling', 'release-assets',
    'stopped', 'clear-playing', 'stop-polling', 'release-assets',
  ]);
});

test('ignores stale pre-start off telemetry but accepts unobserved Auto-Stop', () => {
  let releases = 0;
  const actions: BackgroundJourneyTerminalActions = {
    projectEnded: () => {},
    stopJourney: () => {},
    clearPlaying: () => {},
    stopPolling: () => {},
    releaseAssets: () => { releases += 1; },
  };
  const state = { terminalRevision: null, observedRunning: false };

  assert.equal(reconcileBackgroundJourneyTerminal(state, 13, 'stopped', false, actions), false);
  assert.equal(releases, 0);
  assert.equal(reconcileBackgroundJourneyTerminal(state, 13, 'stopped', true, actions), true);
  assert.equal(releases, 1);
});
