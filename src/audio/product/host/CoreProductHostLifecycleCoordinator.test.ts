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
