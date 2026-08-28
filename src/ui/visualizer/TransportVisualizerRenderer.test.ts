import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSPORT_CONTROL_COUNT,
  TRANSPORT_CONTROL_DEFINITIONS,
  TRANSPORT_CONTROL_GROUPS,
  TRANSPORT_DEFAULT_CONTROLS,
  TRANSPORT_PRESETS,
  expandTransportPreset,
  normalizeTransportControls,
} from './visualizerTransportSchema';
import {
  TRANSPORT_BRIGHT_FRAGMENT_SHADER,
  TRANSPORT_COMPOSITE_FRAGMENT_SHADER,
  TRANSPORT_SCENE_FRAGMENT_SHADER,
  TRANSPORT_MAX_IMPULSES,
  TRANSPORT_PERFORMANCE_POLICY_BALANCED,
  TRANSPORT_PERFORMANCE_POLICY_FULL,
  TRANSPORT_PERFORMANCE_POLICY_MINIMUM,
  TransportVisualizerRenderer,
  resolveTransportPerformancePolicy,
  resolveTransportQualityValue,
  resolveTransportImpulseShaderTime,
  resolveTransportRenderSize,
  transportUniformValueChanged,
  type TransportVisualizerFrame,
} from './TransportVisualizerRenderer';

class FakeContext2D {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  fillRectCalls = 0;
  strokeCalls = 0;

  setTransform(): void {}
  fillRect(): void { this.fillRectCalls += 1; }
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  stroke(): void { this.strokeCalls += 1; }
}

class FakeCanvas {
  width = 0;
  height = 0;
  style = { width: '', height: '' };
  readonly context = new FakeContext2D();
  readonly listeners = new Map<string, EventListener>();

  getContext(kind: string): CanvasRenderingContext2D | WebGL2RenderingContext | null {
    return kind === '2d' ? this.context as unknown as CanvasRenderingContext2D : null;
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
}

function quality(): TransportVisualizerFrame['quality'] {
  return {
    mode: 'mobileSafe',
    effectiveMode: 'mobileSafe',
    maxDpr: 1.25,
    targetFps: 30,
    shapeCountScale: 0.78,
    noiseDensityScale: 0.72,
    pointCloudDensityScale: 0.66,
    maxPointCloudGrid: 56,
    maxShapes: 8,
    shaderDetail: 0,
  };
}

function frame(): TransportVisualizerFrame {
  return {
    timeMs: 1000,
    width: 320,
    height: 180,
    dpr: 1,
    seed: 11,
    controls: normalizeTransportControls({ bloom: 0, saturation: 4, sunTaps: 99 }),
    impulses: [],
    quality: quality(),
  };
}

test('transport schema preserves the baseline control vocabulary and defaults', () => {
  assert.equal(TRANSPORT_CONTROL_COUNT, 77);
  assert.equal(TRANSPORT_CONTROL_DEFINITIONS.length, 77);
  assert.equal(TRANSPORT_CONTROL_GROUPS.flatMap(group => group.controls).length, 73);
  assert.equal(TRANSPORT_PRESETS.length, 15);
  assert.equal(TRANSPORT_DEFAULT_CONTROLS.medium, -1);
  assert.equal(TRANSPORT_DEFAULT_CONTROLS.fieldScale, 5.5);

  const normalized = normalizeTransportControls({ medium: 99, octaves: 2.6, unknown: 4 });
  assert.equal(normalized.medium, 1);
  assert.equal(normalized.octaves, 3);
  assert.equal((normalized as Record<string, unknown>).unknown, undefined);
  assert.equal(normalized.saturation, TRANSPORT_DEFAULT_CONTROLS.saturation);
});

test('transport presets expand to complete normalized control state', () => {
  const preset = expandTransportPreset('water · layered shallows');
  assert.ok(preset);
  assert.equal(preset.waterLayering, 0.94);
  assert.equal(preset.sunTaps, 8);
  assert.equal(Object.keys(preset).length, TRANSPORT_CONTROL_COUNT);
  assert.equal(expandTransportPreset('does-not-exist'), null);
});

test('baseline shader sources keep every non-host control live', () => {
  const shaderSources = [
    TRANSPORT_SCENE_FRAGMENT_SHADER,
    TRANSPORT_BRIGHT_FRAGMENT_SHADER,
    TRANSPORT_COMPOSITE_FRAGMENT_SHADER,
  ];
  const aliases: Partial<Record<keyof typeof TRANSPORT_DEFAULT_CONTROLS, string>> = {
    bloom: 'u_bloom_amt',
    bloomThr: 'u_thr',
  };
  for (const definition of TRANSPORT_CONTROL_DEFINITIONS) {
    if (definition.key === 'motion' || definition.key === 'react' || definition.key === 'spin') continue;
    const token = aliases[definition.key] ?? `u_${definition.key}`;
    assert.ok(shaderSources.some(source => source.includes(token)), `${definition.key} must reach a baseline shader uniform`);
  }
  for (const token of ['vnoise', 'layerTransmission', 'transmission', 'projectedDiscTier', 'aperture', 'legacyCaustic', 'primaryCaustic', 'secondaryCaustic', 'causticFromSamples', 'foldUV', 'substrate']) {
    assert.ok(TRANSPORT_SCENE_FRAGMENT_SHADER.includes(token), `baseline scene token missing: ${token}`);
  }
});

test('mobile-safe quality resolver caps costly baseline branches', () => {
  const safe = quality();
  const desktop = { effectiveMode: 'desktopBeauty' as const, shaderDetail: 1 };
  assert.equal(resolveTransportQualityValue('octaves', 4, safe), 2);
  assert.equal(resolveTransportQualityValue('sunTaps', 12, safe), 5);
  assert.equal(resolveTransportQualityValue('layers', 3, safe), 1);
  assert.equal(resolveTransportQualityValue('leafTiers', 3, safe), 2);
  assert.equal(resolveTransportQualityValue('waterLayering', 1, safe), 0);
  assert.equal(resolveTransportQualityValue('dispersion', 1, safe), 0);
  assert.equal(resolveTransportQualityValue('bloom', 1, safe), 0);
  assert.equal(resolveTransportQualityValue('waterLayering', 0.94, desktop), 0.94);
  assert.equal(resolveTransportQualityValue('dispersion', 0.85, desktop), 0.85);
});

test('performance tiers cap actual baseline work and mobile always uses minimum', () => {
  const desktop = { effectiveMode: 'desktopBeauty' as const, shaderDetail: 1 };
  const mobile = quality();
  assert.ok(Object.isFrozen(TRANSPORT_PERFORMANCE_POLICY_FULL));
  assert.ok(Object.isFrozen(TRANSPORT_PERFORMANCE_POLICY_BALANCED));
  assert.ok(Object.isFrozen(TRANSPORT_PERFORMANCE_POLICY_MINIMUM));
  assert.equal(resolveTransportPerformancePolicy(desktop, 'full'), TRANSPORT_PERFORMANCE_POLICY_FULL);
  assert.equal(TRANSPORT_PERFORMANCE_POLICY_FULL.sceneScale, 0.85);
  assert.equal(resolveTransportQualityValue('octaves', 4, desktop, 'full'), 4);
  assert.equal(resolveTransportQualityValue('sunTaps', 12, desktop, 'full'), 12);

  assert.equal(resolveTransportPerformancePolicy(desktop, 'balanced'), TRANSPORT_PERFORMANCE_POLICY_BALANCED);
  assert.equal(TRANSPORT_PERFORMANCE_POLICY_BALANCED.sceneScale, 0.68);
  assert.equal(resolveTransportQualityValue('octaves', 4, desktop, 'balanced'), 3);
  assert.equal(resolveTransportQualityValue('sunTaps', 12, desktop, 'balanced'), 7);
  assert.equal(resolveTransportQualityValue('layers', 3, desktop, 'balanced'), 2);
  assert.equal(resolveTransportQualityValue('leafTiers', 3, desktop, 'balanced'), 2);
  assert.equal(resolveTransportQualityValue('apBars', 4, desktop, 'balanced'), 2);
  assert.equal(resolveTransportQualityValue('waterLayering', 1, desktop, 'balanced'), 0);
  assert.equal(resolveTransportQualityValue('dispersion', 1, desktop, 'balanced'), 0);
  assert.equal(resolveTransportQualityValue('bloom', 1, desktop, 'balanced'), 0.8);

  assert.equal(resolveTransportPerformancePolicy(mobile, 'full'), TRANSPORT_PERFORMANCE_POLICY_MINIMUM);
  assert.equal(resolveTransportPerformancePolicy(mobile, 'balanced'), TRANSPORT_PERFORMANCE_POLICY_MINIMUM);
  assert.equal(TRANSPORT_PERFORMANCE_POLICY_MINIMUM.sceneScale, 0.52);
  assert.equal(resolveTransportQualityValue('apBars', 4, mobile, 'balanced'), 1);
  assert.equal(resolveTransportQualityValue('leafCount', 9, mobile, 'balanced'), 5);
  assert.equal(resolveTransportQualityValue('bloom', 1, mobile, 'balanced'), 0);
});

test('uniform cache compares Float32-packed values', () => {
  const packed = Math.fround(0.94);
  assert.equal(transportUniformValueChanged(packed, 0.94, true), false);
  assert.equal(transportUniformValueChanged(packed, 0.94001, true), true);
  assert.equal(transportUniformValueChanged(packed, 0.94, false), true);
});

test('impulses are packed into the renderer visual clock', () => {
  assert.equal(resolveTransportImpulseShaderTime(900, 1000, 2), 1.9);
  assert.equal(resolveTransportImpulseShaderTime(1100, 1000, 2), 2);
  assert.equal(resolveTransportImpulseShaderTime(-10000, 1000, 2), -7);
});

test('render targets are sized from physical pixels, then scaled', () => {
  assert.deepEqual(resolveTransportRenderSize(960, 640, 2, 0.85), {
    canvasWidth: 1920,
    canvasHeight: 1280,
    sceneWidth: 1632,
    sceneHeight: 1088,
    bloomWidth: 816,
    bloomHeight: 544,
  });
  assert.deepEqual(resolveTransportRenderSize(960, 640, 2, 0.68), {
    canvasWidth: 1920,
    canvasHeight: 1280,
    sceneWidth: 1306,
    sceneHeight: 870,
    bloomWidth: 653,
    bloomHeight: 435,
  });
  assert.deepEqual(resolveTransportRenderSize(960, 640, 2, 0.52), {
    canvasWidth: 1920,
    canvasHeight: 1280,
    sceneWidth: 998,
    sceneHeight: 666,
    bloomWidth: 499,
    bloomHeight: 333,
  });
  const safe = resolveTransportRenderSize(0, Number.NaN, Number.NaN, Number.NaN);
  for (const value of Object.values(safe)) {
    assert.ok(Number.isInteger(value) && value >= 1);
  }
});

test('renderer has a bounded Canvas2D fallback and a disposable lifecycle', () => {
  assert.equal(TRANSPORT_MAX_IMPULSES, 8);
  const canvas = new FakeCanvas();
  const renderer = new TransportVisualizerRenderer(canvas as unknown as HTMLCanvasElement, { forceCanvas2d: true });
  assert.equal(renderer.mode, 'canvas2d');
  renderer.resize(320, 180, 1);
  renderer.render({
    ...frame(),
    impulses: Array.from({ length: TRANSPORT_MAX_IMPULSES + 2 }, (_, index) => ({
      x: index * 0.01,
      y: 0,
      timeMs: 1000,
      strength: 0.4,
      speed: 0.55,
      frequency: 26,
      decay: 1.1,
      tight: 5,
    })),
  });
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 180);
  assert.ok(canvas.context.fillRectCalls > 0);
  assert.ok(canvas.context.strokeCalls > 0);
  renderer.destroy();
  renderer.render(frame());
});
