import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreProductHostLifecycleCoordinator } from './CoreProductHostLifecycleCoordinator';

test('stopping during startup prevents a late asset or snapshot completion from starting audio', async () => {
  for (const blockedStage of ['resume', 'assets', 'snapshot']) {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let reached!: () => void;
    const entered = new Promise<void>((resolve) => { reached = resolve; });
    const wait = async (stage: string) => { if (stage === blockedStage) { reached(); await pending; } };
    const running: boolean[] = [];
    const gains: number[] = [];
    const events: unknown[] = [];
    const noop = () => undefined;
    let releaseStop: (() => void) | null = null;
    const coordinator = new CoreProductHostLifecycleCoordinator({
      runtime: {
        resume: () => wait('resume'),
        suspend: () => releaseStop === null ? Promise.resolve() : new Promise<void>((resolve) => { releaseStop = resolve; }),
        setOutputGain: (gain: number) => gains.push(gain),
      },
      assetRegistrar: { ensureDefaultAssetsForState: async () => { await wait('assets'); return { status: 'ready' }; } },
      loadLatestSnapshot: () => wait('snapshot'),
      sequencerChain: { start: noop, stop: noop },
      arrangementBridge: { start: noop, stop: noop },
      realtimeTimestampMapper: { reset: noop },
      sequencerVisuals: { reset: noop },
      modulationRangeBridge: { flushModulationRanges: noop },
      setLatestSliderState: noop, latestSliderState: () => ({}), adapterState: () => ({}),
      flushRuntimeProductEvents: noop, setRuntimeReady: noop,
      resetSequencerEvolveState: noop, resetSynthNoteRangeOverrides: noop,
      updateRuntimeTelemetryPolling: noop, publishStateChange: noop,
      setRunning: (value: boolean) => running.push(value), postRuntimeProductEvent: (event: unknown) => events.push(event),
    } as unknown as ConstructorParameters<typeof CoreProductHostLifecycleCoordinator>[0]);
    const start = coordinator.start();
    const rejected = assert.rejects(start, { name: 'AbortError' });
    await entered;
    await coordinator.stop(false);
    release();
    await rejected;
    assert.deepEqual(running, [false], blockedStage);
    assert.deepEqual(gains, [], 'cancelled startup cannot change output gain');
    assert.deepEqual(events, [], `no start event after cancellation at ${blockedStage}`);
    await coordinator.start();
    assert.deepEqual(running, [false, true], 'a fresh Play can start after cancellation');
    assert.deepEqual(gains, [1], 'new playback restores output after a cancelled loading fade');
    releaseStop = () => undefined;
    const stop = coordinator.stop(false);
    await coordinator.start();
    releaseStop!();
    await stop;
    assert.equal(running[running.length - 1], true, 'a late Stop receipt cannot overwrite a newer Play');
  }
});

test('a second start during startup supersedes the first without failing either caller', async () => {
  let releaseFirstSnapshot!: () => void;
  const firstSnapshot = new Promise<void>((resolve) => { releaseFirstSnapshot = resolve; });
  let snapshotLoads = 0;
  const loadedStates: unknown[] = [];
  let latestState: Record<string, unknown> | null = null;
  const startEvents: unknown[] = [];
  const running: boolean[] = [];
  const noop = () => undefined;
  const coordinator = new CoreProductHostLifecycleCoordinator({
    runtime: { resume: async () => undefined, suspend: async () => undefined, setOutputGain: noop },
    assetRegistrar: { ensureDefaultAssetsForState: async () => ({ status: 'ready' }) },
    loadLatestSnapshot: async () => {
      loadedStates.push(latestState);
      snapshotLoads += 1;
      if (snapshotLoads === 1) await firstSnapshot;
    },
    sequencerChain: { start: noop, stop: noop },
    arrangementBridge: { start: noop, stop: noop },
    realtimeTimestampMapper: { reset: noop },
    sequencerVisuals: { reset: noop },
    modulationRangeBridge: { flushModulationRanges: noop },
    setLatestSliderState: (state: Record<string, unknown> | null) => { latestState = state; },
    latestSliderState: () => latestState, adapterState: () => ({}),
    flushRuntimeProductEvents: noop, setRuntimeReady: noop,
    resetSequencerEvolveState: noop, resetSynthNoteRangeOverrides: noop,
    updateRuntimeTelemetryPolling: noop, publishStateChange: noop,
    setRunning: (value: boolean) => running.push(value), postRuntimeProductEvent: (event: unknown) => startEvents.push(event),
  } as unknown as ConstructorParameters<typeof CoreProductHostLifecycleCoordinator>[0]);

  // Play (lifecycle controller) and a sequencer-transport state commit can both start the host.
  const play = coordinator.start({ drumEuclidMasterEnabled: true, revision: 1 });
  while (snapshotLoads === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  const transportCommit = coordinator.start({ drumEuclidMasterEnabled: true, revision: 2 });
  await transportCommit;
  releaseFirstSnapshot();
  await play;

  assert.deepEqual(loadedStates.map((state) => (state as { revision: number }).revision), [1, 2], 'the newest start loads the newest state');
  assert.deepEqual(running, [true], 'only the newest start brings up the running surfaces');
  assert.equal(startEvents.length, 1, 'exactly one runtime start event');

  const replay = coordinator.start({ revision: 3 });
  const stop = coordinator.stop(false);
  await assert.rejects(replay, { name: 'AbortError' }, 'Stop still cancels a pending start');
  await stop;
});
