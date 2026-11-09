import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_STATE } from './state';
import { useProductRuntimePresetLoadFade } from './useProductRuntimePresetLoadFade';
import { useSavedPresetLoadRuntimeSurface } from './useSavedPresetLoadRuntimeSurface';

test('cancelled Journey loads cannot stop newer audio or restore its output after either fade wait', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let settle!: () => void;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (callback: () => void) => { settle = callback; return 1; },
  } });
  const noop = () => undefined;
  const ref = <T,>(current: T) => ({ current });
  const preset = { name: 'A', timestamp: '', state: DEFAULT_STATE };
  try {
    for (const cancelAt of ['fade', 'settle', 'never']) {
      let current = true;
      let release!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const events: string[] = [];
      let load!: ReturnType<typeof useSavedPresetLoadRuntimeSurface<typeof preset>>;
      function Probe() {
        const fade = useProductRuntimePresetLoadFade({
          playbackIsRunning: true, isJourneyPlaying: false,
          fadeProductRuntimeOutput: async (target) => {
            events.push(`fade:${target}`);
            if (target === 0) await pending;
          },
          stopProductPlayback: () => events.push('stop'),
          stopAudioForJourneyPresetLoad: () => events.push('stop-journey-audio'),
        });
        load = useSavedPresetLoadRuntimeSurface({
          state: DEFAULT_STATE, sliderModes: {}, dualSliderRanges: {}, morphPresetB: null,
          morphPosition: 0, snowflakeActivated: true, setSnowflakeActivated: noop,
          hasLoadedPresetRef: ref(false), lastAppliedPresetLoadRef: ref(null),
          morphCapturedStateRef: ref(null), morphCapturedDualRangesRef: ref(null), morphCapturedSliderModesRef: ref(null),
          setMorphPresetA: noop, setMorphSlotAName: noop, setState: noop, setStatePresetName: noop,
          resolveSavedPresetForLoad: async (value) => value, fadeOutAndStopForPresetLoad: fade,
          confirmOverrideArmedJourneyForStatePreset: async () => true, checkPresetCompatibility: () => [],
          presetEngineUpdateOptions: { updateEngine: false, resetCofDrift: false },
          syncCoreProductAppliedPreset: noop, skipNextPresetLoadEngineSync: noop,
          prepareMorphSceneAssets: async () => undefined, invalidateMorphInputs: noop,
          applyDualRangesFromPreset: noop, restoreEvolveConfigs: noop,
        });
        return null;
      }
      renderToStaticMarkup(createElement(Probe));
      const loading = load.handleLoadPresetFromList(preset, {
        skipJourneyOverridePrompt: true, isCurrent: () => current,
      });
      assert.deepEqual(events, ['fade:0']);
      if (cancelAt === 'fade') current = false;
      release();
      await Promise.resolve();
      await Promise.resolve();
      if (cancelAt !== 'fade') {
        assert.deepEqual(events, ['fade:0', 'stop-journey-audio']);
        if (cancelAt === 'settle') current = false;
        settle();
      }
      assert.equal(await loading, cancelAt === 'never');
      assert.deepEqual(events, cancelAt === 'fade' ? ['fade:0']
        : cancelAt === 'settle' ? ['fade:0', 'stop-journey-audio']
          : ['fade:0', 'stop-journey-audio', 'fade:1']);
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
