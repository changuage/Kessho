import assert from 'node:assert/strict';

import type { ReactiveVisualizerControls } from './ReactiveVisualizerRenderer';
import {
  DEFAULT_VISUALIZER_LAYER_MACROS,
  DEFAULT_VISUALIZER_MACROS,
} from './visualizerControls';
import { resolveVisualizerMacroControls } from './visualizerSceneResolver';
import {
  applyVisualizerModulation,
  buildVisualBuses,
  createVisualBuses,
  getEffectiveReactionDepth,
} from './visualizerModulation';
import { resolveVisualizerQualityMode } from './visualizerQuality';
import {
  publishVisualizerTelemetrySignal,
  publishVisualizerTransient,
  readVisualizerTelemetrySignal,
  resetVisualizerTelemetry,
} from './visualizerTelemetry';
import {
  formatVisualizerControlValue,
  VISUALIZER_CONTROL_METADATA,
} from './visualizerControlDomains';
import { DEFAULT_VISUALIZER_CONTROLS } from './visualizerControlSchema';
import { ReactiveVisualizerUniformPacker } from './ReactiveVisualizerUniformPacker';
import { ReactiveVisualizerCanvas2DRenderer } from './ReactiveVisualizerCanvas2DRenderer';
import type { ReactiveVisualizerFrame } from './ReactiveVisualizerRenderer';

const base = {
  shapeCount: 0,
  shapeSize: 0,
  shapeSpread: 0,
  shape: 0,
  edges: 0,
  pointCloudAmount: 0,
  charAmount: 0,
  charStyle: 0,
  layerOrder: [0, 1, 2, 3, 4],
  focus: 'all',
} as ReactiveVisualizerControls;

{
  const resolved = resolveVisualizerMacroControls(
    base,
    DEFAULT_VISUALIZER_MACROS,
    DEFAULT_VISUALIZER_LAYER_MACROS,
  );
  assert.equal(resolved.shapeCount, 0, 'centered macros should preserve base controls');
  assert.equal(resolved.pointCloudAmount, 0, 'centered material should preserve the base material');
  assert.notEqual(resolved, base, 'macro resolution should not mutate the preset base object');
  assert.deepEqual(base.layerOrder, [0, 1, 2, 3, 4]);
}

assert.equal(formatVisualizerControlValue('style', 0, 'Nebula', 'Aurora'), 'Off');
assert.equal(formatVisualizerControlValue('pointCloudAmount', -1, 'Off', 'Cloud'), 'Off');
assert.equal(formatVisualizerControlValue('pointCloudAmount', 0, 'Off', 'Cloud'), 'Cloud 50%');
assert.equal(
  Object.keys(VISUALIZER_CONTROL_METADATA).length,
  48,
  'every numeric visualizer control should have explicit domain metadata',
);

function createTestFrame(mobileSafe: boolean): ReactiveVisualizerFrame {
  const quality = resolveVisualizerQualityMode({
    requestedMode: mobileSafe ? 'mobileSafe' : 'desktopBeauty',
    isMobileReducedVisuals: mobileSafe,
    isCoarsePointer: mobileSafe,
    devicePixelRatio: 2,
  });
  return {
    timeMs: 1000,
    width: 640,
    height: 360,
    dpr: quality.maxDpr,
    controls: { ...DEFAULT_VISUALIZER_CONTROLS, layerOrder: [...DEFAULT_VISUALIZER_CONTROLS.layerOrder] },
    snapshot: {
      pad: 0.7,
      lead: 0.6,
      drums: 0.8,
      earth: 0.5,
      granular: 0.4,
      delay: 0.35,
      reverb: 0.45,
      dynamics: 0.2,
      root: 0.25,
      tension: 0.4,
      spread: 0.5,
      detune: 0.1,
      morph: 0.3,
      brightness: 0.5,
      activeGrains: 8,
      pulses: {
        global: 0.4,
        synth: 0.3,
        pad: 0.2,
        lead: 0.25,
        drums: 0.6,
        earth: 0.1,
        granular: 0.2,
        delay: 0.15,
        reverb: 0.2,
        dynamics: 0.1,
        sequencer: 0.3,
        synthStepPhase: 0.25,
        drumStepPhase: 0.5,
        synthHitDensity: 0.4,
        drumHitDensity: 0.6,
      },
    },
    seed: 0.42,
    quality,
  };
}

{
  const packed = new ReactiveVisualizerUniformPacker().pack(createTestFrame(true));
  assert.equal(packed.quality[3], 8, 'uniform packing should carry the reduced shape budget');
  assert.equal(packed.resolution[0], 800, 'mobile DPR cap should determine packed render width');
  assert.ok((packed.pulseA[3] ?? 0) > 0.6, 'drum transient should reach packed pulse uniforms');
}

class FakeCanvasContext {
  lineToCount = 0;
  strokeCount = 0;
  fillRectCount = 0;
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalCompositeOperation = 'source-over';
  setTransform(): void {}
  fillRect(): void { this.fillRectCount += 1; }
  beginPath(): void {}
  closePath(): void {}
  stroke(): void { this.strokeCount += 1; }
  moveTo(): void {}
  lineTo(): void { this.lineToCount += 1; }
}

function renderFallbackForTest(frame: ReactiveVisualizerFrame): FakeCanvasContext {
  const context = new FakeCanvasContext();
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
  const renderer = new ReactiveVisualizerCanvas2DRenderer(canvas);
  assert.equal(renderer.available, true);
  renderer.render(frame);
  assert.equal(context.fillRectCount, 1, 'fallback should paint one frame background');
  assert.ok(context.strokeCount > 0, 'fallback should render reactive engine rings');
  return context;
}

{
  const mobile = renderFallbackForTest(createTestFrame(true));
  const desktop = renderFallbackForTest(createTestFrame(false));
  assert.ok(
    mobile.lineToCount < desktop.lineToCount,
    'Mobile Safe must execute fewer Canvas2D path points than Desktop Beauty',
  );
}

{
  const snapshot = createTestFrame(false).snapshot;
  const busScratch = createVisualBuses();
  const buses = buildVisualBuses(snapshot, { afterglow: 0.5 }, busScratch);
  assert.equal(buses, busScratch, 'visual bus updates should reuse the frame-owned scratch object');
  assert.ok(buses.geometry.pulse > 0.2, 'synth and lead events should drive geometry transients');
  assert.ok(buses.atmosphere.level > 0.3, 'pad and reverb energy should drive atmosphere');
  assert.ok(buses.fragment.pulse > 0.1, 'granular events should drive fragmentation');
  assert.ok(buses.echo.level > 0.2, 'delay and reverb energy should drive echo transforms');
  assert.ok(buses.impact.pulse > 0.4, 'drum transients should dominate the impact bus');
  const controlsScratch = { ...base, layerOrder: [...base.layerOrder] };
  const modulated = applyVisualizerModulation(
    base,
    { brightness: { min: -1, max: 1 } },
    buses,
    { reactionAmount: 1, morphAroundPreset: 0.5, afterglow: 0.5, mode: 'auto' },
    controlsScratch,
  );
  assert.equal(modulated, controlsScratch, 'visual modulation should reuse the frame-owned controls scratch object');
}

{
  resetVisualizerTelemetry();
  assert.equal(readVisualizerTelemetrySignal('synth', 'level', 100), null);
  publishVisualizerTelemetrySignal('synth', 'level', 0.8, 100);
  assert.ok((readVisualizerTelemetrySignal('synth', 'level', 150) ?? 0) > 0.79);
  assert.equal(
    readVisualizerTelemetrySignal('synth', 'level', 20_000),
    null,
    'stale telemetry should release and relinquish authority to cached intent',
  );
  publishVisualizerTransient('drums', 0.7, 100);
  const initial = readVisualizerTelemetrySignal('drums', 'transient', 100) ?? 0;
  const released = readVisualizerTelemetrySignal('drums', 'transient', 900) ?? 0;
  assert.ok(initial > released, 'transient telemetry should preserve a release envelope');
}

{
  const mobile = resolveVisualizerQualityMode({
    requestedMode: 'mobileSafe',
    isMobileReducedVisuals: false,
    isCoarsePointer: false,
    devicePixelRatio: 3,
  });
  const desktop = resolveVisualizerQualityMode({
    requestedMode: 'desktopBeauty',
    isMobileReducedVisuals: false,
    isCoarsePointer: false,
    devicePixelRatio: 3,
  });
  assert.ok(mobile.maxShapes < desktop.maxShapes, 'Mobile Safe must reduce actual SDF iterations');
  assert.ok(mobile.shaderDetail < desktop.shaderDetail, 'Mobile Safe must reduce FBM octave work');
}

{
  const resolved = resolveVisualizerMacroControls(
    base,
    DEFAULT_VISUALIZER_MACROS,
    { ...DEFAULT_VISUALIZER_LAYER_MACROS, formation: 1 },
  );
  assert.ok(resolved.shapeCount > 0.4, 'Formation should make a large coordinated count change');
  assert.ok(resolved.shapeSpread > 0.4, 'Formation should coordinate composition spread');
  assert.equal(resolved.pointCloudAmount, 0, 'Formation must not alter unrelated layer material');
}

{
  const analog = resolveVisualizerMacroControls(
    base,
    DEFAULT_VISUALIZER_MACROS,
    { ...DEFAULT_VISUALIZER_LAYER_MACROS, age: 0 },
  );
  const digital = resolveVisualizerMacroControls(
    base,
    DEFAULT_VISUALIZER_MACROS,
    { ...DEFAULT_VISUALIZER_LAYER_MACROS, age: 1 },
  );
  assert.ok(analog.charAmount > 0.75 && digital.charAmount > 0.75, 'Age endpoints should both add character');
  assert.ok(analog.charStyle < 0 && digital.charStyle > 0, 'Age direction should select analog or digital character');
}

{
  const low = getEffectiveReactionDepth({
    reactionAmount: 0.5,
    morphAroundPreset: 0,
    afterglow: 0.5,
    mode: 'auto',
  });
  const center = getEffectiveReactionDepth({
    reactionAmount: 0.5,
    morphAroundPreset: 0.5,
    afterglow: 0.5,
    mode: 'auto',
  });
  const high = getEffectiveReactionDepth({
    reactionAmount: 0.5,
    morphAroundPreset: 1,
    afterglow: 0.5,
    mode: 'auto',
  });
  assert.ok(low < center && center < high, 'Morph Depth must be effective in automatic mode');
}
