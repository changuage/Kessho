import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function installBridge({ bridge, hidden = false, protocol = 'http:', scriptSrc, embeddedParent = false } = {}) {
  const listeners = new Map();
  const documentListeners = new Map();
  const document = {
    hidden,
    currentScript: {
      src: scriptSrc
        ?? (protocol === 'file:'
          ? 'file:///Users/panguroo/Documents/generativemusic/point-clouds/shared/kessho-site-bridge.js'
          : 'http://localhost:5173/point-clouds/shared/kessho-site-bridge.js'),
    },
    addEventListener(type, callback) {
      documentListeners.set(type, callback);
    },
    removeEventListener(type, callback) {
      if (documentListeners.get(type) === callback) documentListeners.delete(type);
    },
    querySelector() {
      return null;
    },
  };
  const frameListeners = new Map();
  const frame = {
    src: 'about:blank',
    contentWindow: { __pointCloudsKesshoBridge: bridge },
    addEventListener(type, callback) {
      frameListeners.set(type, callback);
    },
    getAttribute() {
      return this.src;
    },
  };
  const embeddedScripts = [];
  const windowObject = {
    document,
    location: {
      href: protocol === 'file:'
        ? 'file:///Users/panguroo/Documents/generativemusic/point-clouds/alternative-a/index.html'
        : 'http://localhost:5173/point-clouds/alternative-a/',
      protocol,
    },
    performance: { now: () => Date.now() },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
  };
  if (embeddedParent) {
    document.createElement = () => ({ async: false, src: '', onload: null, onerror: null });
    document.head = {
      appendChild(script) {
        embeddedScripts.push(script);
      },
    };
  }
  windowObject.window = windowObject;
  const context = vm.createContext({
    window: windowObject,
    globalThis: windowObject,
    document,
    performance: windowObject.performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Number,
    Math,
    Date,
    URL,
    Error,
    TypeError,
    RangeError,
    console,
  });
  return { context, frame, document, embeddedScripts };
}

async function loadBridge(sandbox) {
  const source = await readFile(new URL('./kessho-site-bridge.js', import.meta.url), 'utf8');
  vm.runInContext(source, sandbox.context, { filename: 'kessho-site-bridge.js' });
  return sandbox.context.window.PointCloudsKessho;
}

function makeStatus(overrides = {}) {
  return {
    ready: true,
    isRunning: false,
    lifecycleState: 'stopped',
    audioContextState: 'suspended',
    presetId: 'string-waves',
    presetName: 'String Waves',
    morphAmount: 0,
    telemetry: {
      schemaHash: 1,
      transportRunning: false,
      activeSources: 0,
      activeVoices: 0,
      activeAssets: 0,
      sequencerEventCount: 0,
      controlQueueDepth: 0,
      assetMissingCount: 0,
      lastErrorCode: 0,
      masterOutputRms: 0,
      masterOutputPeak: 0,
      workletStemPeaks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      synthSequencerCurrentSteps: [0],
      drumSequencerCurrentSteps: [0],
      beatPosition: 0,
      barIndex: 0,
      phraseIndex: 0,
      transportPhraseProgress: 0,
    },
    ...overrides,
  };
}

test('PointCloudsKessho controller starts, normalizes real telemetry, and stops', async () => {
  let status = makeStatus();
  const phases = [];
  const telemetry = [];
  const bridge = {
    listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
    start: async (_preset, options) => {
      assert.equal(options.reverbQuality, 'lite');
      status = makeStatus({
        isRunning: true,
        lifecycleState: 'running',
        audioContextState: 'running',
        telemetry: {
          ...status.telemetry,
          transportRunning: true,
          activeSources: 2,
          activeVoices: 3,
          masterOutputRms: 0.2,
          masterOutputPeak: 0.5,
          workletStemPeaks: [0.1, 0.3, 0.4, 0.2, 0.5, 0.7, 0.6, 0.8, 0.9, 0.25],
          sequencerEventCount: 4,
          synthSequencerCurrentSteps: [2],
          beatPosition: 1,
          barIndex: 1,
          phraseIndex: 2,
          transportPhraseProgress: 0.25,
        },
      });
    },
    stop: () => {
      status = makeStatus({
        // Product Core intentionally keeps the initialized runtime/context
        // alive after playback stop; those diagnostics must not veto ready.
        lifecycleState: 'running',
        audioContextState: 'running',
        telemetry: { ...status.telemetry, transportRunning: false },
      });
    },
    getStatus: () => status,
    setMorph: (amount) => {
      status = { ...status, morphAmount: amount };
    },
  };
  const sandbox = installBridge({ bridge });
  const api = await loadBridge(sandbox);
  const controller = api.create({
    engineFrame: sandbox.frame,
    presetId: 'string-waves',
    overrides: { reverbQuality: 'lite' },
    onStatus: (value) => phases.push(value.phase),
    onTelemetry: (value) => telemetry.push(value),
  });
  await controller.boot();
  await controller.start();
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.phase, 'playing');
  assert.equal(snapshot.telemetry.activeVoices, 3);
  assert.equal(snapshot.telemetry.activeSources, 2);
  assert.equal(snapshot.telemetry.currentStep, 2);
  assert.deepEqual(
    snapshot.telemetry.stemPeakValues,
    [0.1, 0.3, 0.4, 0.2, 0.5, 0.7, 0.6, 0.8, 0.9, 0.25],
  );
  assert.equal(snapshot.telemetry.stemPeaksByName.pad, 0);
  assert.equal(snapshot.telemetry.raw.masterOutputPeak, 0.5);
  assert.equal(snapshot.telemetry.visualInputs.schemaVersion, 1);
  assert.equal(snapshot.telemetry.visualInputs.channels.master.available, true);
  assert.equal(snapshot.telemetry.visualInputs.channels.master.level, 0.2);
  assert.equal(snapshot.telemetry.visualInputs.channels.pads.peak, 0.4);
  assert.equal(snapshot.telemetry.visualInputs.channels.leads.peak, 0.5);
  assert.equal(snapshot.telemetry.visualInputs.channels.samples.peak, 0.9);
  assert.equal(snapshot.telemetry.visualInputs.channels.drums.peak, 0.7);
  assert.equal(snapshot.telemetry.visualInputs.channels.earth.peak, 0.8);
  assert.equal(snapshot.telemetry.visualInputs.channels.effects.peak, 0.25);
  assert.equal(snapshot.telemetry.visualInputs.channels.granular.availability, 'unavailable');
  assert.equal(snapshot.telemetry.visualInputs.channels.delays.availability, 'unavailable');
  assert.equal(snapshot.telemetry.visualInputs.channels.degrade.availability, 'unavailable');
  assert.equal(snapshot.telemetry.visualInputs.channels.reverb.availability, 'unavailable');
  assert.ok(phases.includes('loading'));
  assert.ok(phases.includes('playing'));
  assert.ok(telemetry.some((value) => value.rms === 0.2));
  controller.setMorph(0.75);
  assert.equal(controller.getSnapshot().morphAmount, 0.75);
  await controller.stop();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.ok(phases.includes('stopping'));
  controller.destroy();
});

test('visual input library groups routing children under stable parents and requires exact return telemetry', async () => {
  const graphTapPeaks = Array(22).fill(0);
  graphTapPeaks[8] = 0.35;
  graphTapPeaks[12] = 0.55;
  graphTapPeaks[16] = 0.64;
  graphTapPeaks[21] = 0.33;
  const graphTapValidity = Array(22).fill(false);
  for (const tapId of [8, 12, 16, 21]) graphTapValidity[tapId] = true;
  const status = makeStatus({
    telemetry: {
      ...makeStatus().telemetry,
      workletGraphTapPeaks: graphTapPeaks,
      workletGraphTapPeakValid: graphTapValidity,
    },
  });
  const bridge = {
    listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
    start: async () => {},
    stop: () => {},
    getStatus: () => status,
    setMorph: () => {},
  };
  const sandbox = installBridge({ bridge });
  const api = await loadBridge(sandbox);
  const inputs = api.getInputLibrary();
  assert.equal(inputs, api.inputLibrary);
  assert.equal(inputs.schemaVersion, 1);
  assert.deepEqual(Array.from(inputs.byId.pads.children), ['pad1', 'pad2']);
  assert.deepEqual(Array.from(inputs.byId.leads.children), ['lead1', 'lead2']);
  assert.deepEqual(Array.from(inputs.byId.samples.children), ['sample1', 'sample2']);
  assert.deepEqual(Array.from(inputs.byId.earth.children), ['waves', 'water', 'insects', 'nature']);
  assert.deepEqual(Array.from(inputs.byId.delays.children), ['delayAOut', 'delayBOut']);
  for (const input of inputs.inputs) {
    assert.ok(input.reactions.length >= 2 && input.reactions.length <= 3);
  }

  const controller = api.create({ engineFrame: sandbox.frame });
  await controller.boot();
  const channels = controller.getSnapshot().telemetry.visualInputs.channels;
  assert.equal(channels.granular.peak, 0.64);
  assert.equal(channels.delays.peak, 0.55);
  assert.equal(channels.reverb.peak, 0.33);
  assert.equal(channels.degrade.availability, 'unavailable');
  controller.destroy();
});

test('PointCloudsKessho rejects unknown presets and out-of-range morph', async () => {
  const status = makeStatus();
  const bridge = {
    listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
    start: async () => {},
    stop: () => {},
    getStatus: () => status,
    setMorph: () => {},
  };
  const sandbox = installBridge({ bridge });
  const api = await loadBridge(sandbox);
  const unknown = api.create({ engineFrame: sandbox.frame, presetId: 'missing' });
  await unknown.boot();
  await assert.rejects(unknown.start(), /Unknown Point Clouds preset/);
  const valid = api.create({ engineFrame: sandbox.frame });
  await valid.boot();
  assert.throws(() => valid.setMorph(2), /between 0 and 1/);
  valid.destroy();
  unknown.destroy();
});

test('PointCloudsKessho accepts a stopped lifecycle while telemetry retains its final running sample', async () => {
  let status = makeStatus();
  const bridge = {
    listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
    start: async () => {
      status = makeStatus({
        isRunning: true,
        lifecycleState: 'running',
        audioContextState: 'running',
        telemetry: { ...status.telemetry, transportRunning: true },
      });
    },
    stop: () => {
      status = makeStatus({
        // The Product Core lifecycle has completed the stop, while telemetry
        // polling has already been disabled and still exposes its last sample.
        isRunning: false,
        lifecycleState: 'stopped',
        audioContextState: 'running',
        telemetry: { ...status.telemetry, transportRunning: true },
      });
    },
    getStatus: () => status,
    setMorph: () => {},
  };
  const sandbox = installBridge({ bridge });
  const api = await loadBridge(sandbox);
  const controller = api.create({ engineFrame: sandbox.frame });
  await controller.boot();
  await controller.start();
  await controller.stop();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().raw.lifecycleState, 'stopped');
  assert.equal(controller.getSnapshot().raw.isRunning, false);
  controller.destroy();
});

test('PointCloudsKessho resolves the HTTP engine URL from the shared bridge script', async () => {
  const sandbox = installBridge({ bridge: null });
  const api = await loadBridge(sandbox);
  const bridge = {
    listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
    start: async () => {},
    stop: () => {},
    getStatus: () => makeStatus(),
    setMorph: () => {},
  };
  const controller = api.create({ engineFrame: sandbox.frame });
  const boot = controller.boot();
  assert.equal(sandbox.frame.src, 'http://localhost:5173/index.html?point-clouds-engine=1');
  sandbox.frame.contentWindow.__pointCloudsKesshoBridge = bridge;
  await boot;
  assert.equal(controller.getSnapshot().phase, 'ready');
  controller.destroy();
});

test('PointCloudsKessho uses the generated regular file engine document for direct opens', async () => {
  const sandbox = installBridge({ bridge: null, protocol: 'file:' });
  const api = await loadBridge(sandbox);
  const bridge = {
    listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
    start: async () => {},
    stop: () => {},
    getStatus: () => makeStatus(),
    setMorph: () => {},
  };
  const controller = api.create({ engineFrame: sandbox.frame });
  const boot = controller.boot();
  assert.equal(
    sandbox.frame.src,
    'file:///Users/panguroo/Documents/generativemusic/point-clouds/shared/embedded/kessho-engine.html',
  );
  sandbox.frame.contentWindow.__pointCloudsKesshoBridge = bridge;
  await boot;
  assert.equal(controller.getSnapshot().phase, 'ready');
  controller.destroy();
});

test('PointCloudsKessho bootstraps embedded file assets in the parent when DOM access is available', async () => {
  const sandbox = installBridge({ bridge: null, protocol: 'file:', embeddedParent: true });
  const api = await loadBridge(sandbox);
  const bridge = {
    listPresets: () => [{ id: 'string-waves', name: 'String Waves' }],
    start: async () => {},
    stop: () => {},
    getStatus: () => makeStatus(),
    setMorph: () => {},
  };
  const controller = api.create({ engineFrame: sandbox.frame });
  const boot = controller.boot();
  assert.equal(sandbox.context.window.__pointCloudsEmbeddedEngineMode, true);
  assert.equal(sandbox.embeddedScripts.length, 1);
  assert.match(sandbox.embeddedScripts[0].src, /kessho-product-core-assets\.js$/);
  sandbox.embeddedScripts[0].onload();
  assert.equal(sandbox.embeddedScripts.length, 2);
  assert.match(sandbox.embeddedScripts[1].src, /kessho-engine\.iife\.js$/);
  sandbox.embeddedScripts[1].onload();
  sandbox.context.window.__pointCloudsKesshoBridge = bridge;
  await boot;
  assert.equal(controller.getSnapshot().phase, 'ready');
  controller.destroy();
});

test('Point Clouds alternatives carry an inline bridge fallback for file-origin script failures', async () => {
  for (const pageName of ['index.html', 'alternative-a/index.html', 'alternative-b/index.html']) {
    const source = await readFile(new URL(`../${pageName}`, import.meta.url), 'utf8');
    const fallback = source.match(/<script data-point-clouds-bridge-fallback>[\s\S]*?<\/script>/);
    assert.ok(fallback, `${pageName} should expose the generated fallback marker`);
    assert.match(fallback[0], /if \(!window\.PointCloudsKessho\)/);
    assert.ok(fallback[0].length > 1000, `${pageName} fallback should include the bridge implementation`);
    const sandbox = installBridge({ bridge: null, protocol: 'file:' });
    vm.runInContext(
      fallback[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''),
      sandbox.context,
      { filename: `${pageName} bridge fallback` },
    );
    assert.equal(typeof sandbox.context.window.PointCloudsKessho?.create, 'function');
  }
});

test('original Point Clouds page keeps direct file playback on the embedded bridge', async () => {
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localPreviewUrl|location\.replace\(/);
  assert.match(source, /<script src="\.\/shared\/kessho-site-bridge\.js"><\/script>/);
  assert.match(source, /overrides:\s*\{\s*reverbQuality:\s*['"]lite['"]\s*\}/);
  assert.match(source, /controller\.start\(\)/);
});
