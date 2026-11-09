import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prepareMorphPair, evaluatePreparedMorphPair } from '../app/morphInterpolation';
import { DEFAULT_STATE, type SliderState } from './state';
import type { DualSliderConfig } from './sliderSystem/dualConfigReducer';
import { useJourneyMorphRuntimeSurface } from './useJourneyMorphRuntimeSurface';

const ref = <T,>(current: T) => ({ current });

test('Journey updates ranges throughout both morph directions and ignores cancelled preset resolution', async () => {
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible' } });
  const a = { name: 'A', state: { ...DEFAULT_STATE },
    dualSliderConfigs: { nature1FilterCutoff: { source: 'a' as const, range: [100, 1000] as readonly [number, number] } } };
  const b = { name: 'B', state: { ...DEFAULT_STATE, spectralFreezeEnabled: true, spectralFreezeActive: true },
    dualSliderConfigs: { nature1FilterCutoff: { source: 'a' as const, range: [1000, 2000] as readonly [number, number] } } };
  const direction = ref<'toA' | 'toB'>('toB');
  const lastState = ref<SliderState | null>({ ...a.state, spectralFreezeCaptureSerial: 41 });
  const positions: number[] = [];
  const submissions: SliderState[] = [];
  const configs: Record<string, DualSliderConfig>[] = [];
  let clock: ((now: number) => void) | null = null;
  let api!: ReturnType<typeof useJourneyMorphRuntimeSurface<typeof a>>;
  let pendingResolve: ((preset: typeof a) => void) | null = null;
  let stageAssets = 0;
  let progress = 0;
  const noop = () => undefined;
  function Probe() {
    api = useJourneyMorphRuntimeSurface({
      journeyPresetARef: ref<typeof a | null>(a), journeyPresetBRef: ref<typeof a | null>(b),
      journeyLastAppliedStateRef: lastState,
      journeyLastDualModesRef: ref({}), journeyLastDualRangesRef: ref({}), journeyLastDualConfigsRef: ref({}),
      journeyLastMorphPositionRef: ref<number | null>(0), journeyLastMorphCoFVizRef: ref(null),
      setState: noop, dualConfigs: {}, setDualSliderConfigs: (value) => configs.push(value),
      setMorphPresetA: noop, setMorphPresetB: noop, setMorphSlotAName: noop, setMorphSlotBName: noop,
      setMorphPosition: (value) => { if (typeof value === 'number') positions.push(value); },
      setMorphCoFViz: noop, setStatePresetName: noop,
      stateRef: ref(a.state), journeyMorphDirectionRef: direction, phraseLength: 1, currentCofStep: 0,
      resolveSavedPresetByName: (name) => name === 'pending'
        ? new Promise((resolve) => { pendingResolve = resolve; }) : Promise.resolve(name === 'A' ? a : b),
      handleLoadPresetFromList: async () => true, lastAppliedPresetLoadRef: ref(null),
      prepareMorphSceneAssets: async () => { stageAssets += 1; }, startJourneyPlayback: async () => undefined,
      lerpPresets: (left, right, position) => evaluatePreparedMorphPair(prepareMorphPair(left, right), position),
      resetCofDrift: noop, scheduleProductRuntimeParamUpdate: (state) => submissions.push(state),
      startJourneyMorphClock: (callback) => { clock = callback; }, stopJourneyMorphClock: () => { clock = null; },
      setIsJourneyPlaying: noop,
    });
    return null;
  }
  try {
    renderToStaticMarkup(createElement(Probe));
    const frame = (now: number) => {
      assert.ok(clock);
      (clock as (now: number) => void)(now);
    };
    await api.handleJourneyMorphTo('B', 1, 1000, () => progress);
    const start = performance.now();
    progress = 0.5;
    frame(start + 500);
    const range = configs[configs.length - 1]!.nature1FilterCutoff!.range;
    assert.ok(range[0] > 500 && range[0] < 600, 'range already moves in the middle of the morph');
    assert.equal(submissions[submissions.length - 1]!.spectralFreezeCaptureSerial, 42);
    const count = submissions.length;
    frame(start + 501);
    assert.equal(submissions.length, count, 'closely spaced frames do not rebuild audio state');
    progress = 0.6;
    frame(start + 100600);
    assert.equal(positions[positions.length - 1], 68, 'a hidden wall-clock gap cannot advance beyond Journey progress');
    progress = 1;
    frame(start + 101100);
    assert.equal(positions[positions.length - 1], 100);
    assert.equal(direction.current, 'toA');
    progress = 0;
    await api.handleJourneyMorphTo('A', 1, 1000, () => progress);
    const reverse = performance.now();
    progress = 0.5;
    frame(reverse + 500);
    assert.ok(positions[positions.length - 1]! > 45 && positions[positions.length - 1]! < 55);
    assert.equal(submissions[submissions.length - 1]!.spectralFreezeCaptureSerial, 42, 'reverse morph retains its live capture');
    progress = 1;
    frame(reverse + 1100);
    assert.equal(positions[positions.length - 1], 0);
    assert.equal(submissions[submissions.length - 1]!.spectralFreezeActive, false);
    const staged = stageAssets;
    const pending = api.handleJourneyMorphTo('pending', 1, 1000, () => progress);
    api.stopJourneyMorphPlayback();
    assert.ok(pendingResolve);
    (pendingResolve as (preset: typeof a) => void)(b);
    await pending;
    assert.equal(clock, null);
    assert.equal(stageAssets, staged, 'cancelled resolution cannot stage assets or start a morph');
  } finally {
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
