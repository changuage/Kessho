import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MacNativeProductRuntime,
  decodeMacNativeProductInteractionSignals,
  decodeMacNativeProductInteractionEvents,
  decodeMacNativeProductTelemetry,
  encodeMacNativeProductEvents,
} from './MacNativeProductRuntime';
import type { DecodedCoreProductAsset } from '../../coreProductAssets';
import type { CoreProductEvent } from '../../coreProductEvents';
import { KESSHO_PRODUCT_SCHEMA_HASH } from '../../generated/kesshoProductSchema';

const TELEMETRY_BYTES = 14912;
const INTERACTION_SIGNAL_BYTES = 192;

type PluginCall = { method: string; options?: unknown };

function makeTelemetryBase64(): string {
  const bytes = new Uint8Array(TELEMETRY_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, KESSHO_PRODUCT_SCHEMA_HASH, true);
  view.setFloat64(8, 48_000, true);
  view.setUint32(16, 256, true);
  view.setUint32(20, 1, true);
  view.setBigUint64(24, 96_000n, true);
  view.setFloat32(972, 0.5, true);
  view.setFloat32(14076, 120, true);
  return Buffer.from(bytes).toString('base64');
}

function makeInteractionBase64(): string {
  const bytes = new Uint8Array(INTERACTION_SIGNAL_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, 7, true);
  view.setUint32(8, 30, true);
  view.setUint32(12, 0x3ff, true);
  view.setUint32(16, 0x3ff, true);
  view.setBigUint64(24, 96_000n, true);
  view.setFloat32(32, 0.75, true);
  return Buffer.from(bytes).toString('base64');
}

function makeInteractionEventsBase64(): string {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 7, true);
  view.setUint32(4, 3, true);
  view.setUint32(8, 5, true);
  view.setUint32(12, 1, true);
  view.setUint32(16, 2, true);
  view.setBigUint64(24, 96_128n, true);
  view.setFloat32(32, 36, true);
  view.setFloat32(36, 0.8, true);
  return Buffer.from(bytes).toString('base64');
}

function makeNativePluginFixture(): { calls: PluginCall[]; plugin: Record<string, unknown> } {
  const calls: PluginCall[] = [];
  let rejectNextSnapshot = true;
  const status = (method: string, options?: unknown): Promise<unknown> => {
    calls.push({ method, options });
    return Promise.resolve({});
  };
  const plugin: Record<string, unknown> = {
    prepareNativeProductRuntime: () => status('prepareNativeProductRuntime'),
    loadNativeProductSnapshot: (options: unknown) => {
      calls.push({ method: 'loadNativeProductSnapshot', options });
      if (rejectNextSnapshot) {
        rejectNextSnapshot = false;
        return Promise.reject(new Error('snapshot bridge failed'));
      }
      return Promise.resolve({});
    },
    enqueueNativeProductEvents: (options: unknown) => status('enqueueNativeProductEvents', options),
    registerNativeProductFileAsset: (options: unknown) => status('registerNativeProductFileAsset', options),
    registerNativeProductDecodedAsset: (options: unknown) => status('registerNativeProductDecodedAsset', options),
    unregisterNativeProductAsset: (options: unknown) => status('unregisterNativeProductAsset', options),
    resetNativeProductRuntime: () => status('resetNativeProductRuntime'),
    startNativeProductRuntime: () => status('startNativeProductRuntime'),
    stopNativeProductRuntime: () => status('stopNativeProductRuntime'),
    getNativeProductTelemetry: () => {
      calls.push({ method: 'getNativeProductTelemetry' });
      return Promise.resolve({
        telemetryBase64: makeTelemetryBase64(),
        interactionBase64: makeInteractionBase64(),
        interactionEventsBase64: makeInteractionEventsBase64(),
        interactionEventOverflowCount: 2,
      });
    },
    setNativeProductInteractionDemand: (options: unknown) => status('setNativeProductInteractionDemand', options),
  };
  return { calls, plugin };
}

function installMacNativePlugin(plugin: Record<string, unknown>): Window {
  const testWindow = {
    Capacitor: {
      getPlatform: () => 'macos',
      Plugins: { KesshoAudioSession: plugin },
    },
    location: { href: 'https://kessho.test/app', origin: 'https://kessho.test' },
  } as unknown as Window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow });
  return testWindow;
}

test('encodes the native Product event ABI exactly', () => {
  const bytes = encodeMacNativeProductEvents([{
    sampleOffset: 7,
    eventKind: 16,
    targetId: 2,
    index: 3,
    paramId: 4,
    value: 0.25,
    value2: 0.5,
    value3: 0.75,
    value4: 1,
    flags: 0x80000000,
  }]);
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.byteLength, 40);
  assert.deepEqual([
    view.getUint32(0, true), view.getUint32(4, true), view.getUint32(8, true),
    view.getUint32(12, true), view.getUint32(16, true),
  ], [7, 16, 2, 3, 4]);
  assert.deepEqual([
    view.getFloat32(20, true), view.getFloat32(24, true),
    view.getFloat32(28, true), view.getFloat32(32, true),
  ], [0.25, 0.5, 0.75, 1]);
  assert.equal(view.getUint32(36, true), 0x80000000);
});

test('decodes the native Product telemetry ABI', () => {
  const bytes = new Uint8Array(14912);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xc602ab76, true);
  view.setFloat64(8, 48_000, true);
  view.setUint32(16, 256, true);
  view.setUint32(20, 1, true);
  view.setBigUint64(24, 96_000n, true);
  view.setFloat32(972, 0.5, true);
  view.setFloat32(14076, 120, true);
  const telemetry = decodeMacNativeProductTelemetry(Buffer.from(bytes).toString('base64'));
  assert.equal(telemetry.schemaHash, 0xc602ab76);
  assert.equal(telemetry.sampleRate, 48_000);
  assert.equal(telemetry.blockSize, 256);
  assert.equal(telemetry.transportRunning, true);
  assert.equal(telemetry.absoluteSampleTime, 96_000);
  assert.equal(telemetry.masterOutputPeak, 0.5);
  assert.equal(telemetry.transportBpm, 120);
});

test('decodes the compact native interaction signal ABI', () => {
  const signals = decodeMacNativeProductInteractionSignals(makeInteractionBase64());
  assert.equal(signals.version, 1);
  assert.equal(signals.revision, 7);
  assert.equal(signals.sampleFrame, 96_000);
  assert.equal(signals.envelope[0], 0.75);
  assert.equal(signals.envelope.length, 10);
});

test('decodes compact native interaction event records', () => {
  const events = decodeMacNativeProductInteractionEvents(makeInteractionEventsBase64());
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 7);
  assert.equal(events[0]?.sampleFrame, 96_128);
  assert.ok(Math.abs((events[0]?.strength ?? 0) - 0.8) < 0.00001);
});

test('routes the macOS Product runtime lifecycle through the plugin boundary', async () => {
  const { calls, plugin } = makeNativePluginFixture();
  const globalWithWindow = globalThis as { window?: Window };
  const previousWindow = globalWithWindow.window;
  installMacNativePlugin(plugin);

  try {
    const runtime = MacNativeProductRuntime.createIfAvailable();
    assert.ok(runtime);

    const snapshot = Uint8Array.from([1, 2, 3, 4]).buffer;
    const event: CoreProductEvent = {
      sampleOffset: 7,
      eventKind: 16,
      targetId: 2,
      index: 3,
      paramId: 4,
      value: 0.25,
    };
    const fileAsset: DecodedCoreProductAsset = {
      assetId: 11,
      sampleRate: 48_000,
      channels: [new Float32Array([0.25])],
      flags: 3,
      sourceUrl: '/assets/test.wav',
    };
    const decodedAsset: DecodedCoreProductAsset = {
      assetId: 12,
      sampleRate: 48_000,
      channels: [new Float32Array([0.25, -0.5]), new Float32Array([0.75])],
      flags: 5,
    };

    runtime.expectSnapshot();
    runtime.postEvents([event]);
    await assert.rejects(runtime.loadSnapshot(snapshot), /snapshot bridge failed/);
    await runtime.loadSnapshot(snapshot);
    await runtime.registerAsset(fileAsset);
    await runtime.registerAsset(decodedAsset);
    await runtime.unregisterAsset(fileAsset.assetId);
    await runtime.resume();
    runtime.setInteractionDemand(30, 0x3ff);
    const telemetry = await runtime.telemetry();
    await runtime.suspend();

    assert.equal(telemetry.transportRunning, true);
    assert.equal(telemetry.absoluteSampleTime, 96_000);
    assert.equal(telemetry.interactionSignals?.envelope[0], 0.75);
    assert.equal(telemetry.interactionEvents?.[0]?.type, 7);
    assert.equal(telemetry.interactionEventOverflowCount, 2);
    assert.deepEqual(calls.map(({ method }) => method), [
      'loadNativeProductSnapshot',
      'loadNativeProductSnapshot',
      'enqueueNativeProductEvents',
      'registerNativeProductFileAsset',
      'registerNativeProductDecodedAsset',
      'unregisterNativeProductAsset',
      'prepareNativeProductRuntime',
      'startNativeProductRuntime',
      'setNativeProductInteractionDemand',
      'getNativeProductTelemetry',
      'stopNativeProductRuntime',
    ]);
    assert.deepEqual(calls.find(({ method }) => method === 'setNativeProductInteractionDemand')?.options, {
      demandMask: 30,
      sourceMask: 0x3ff,
    });

    const snapshotCalls = calls.filter(({ method }) => method === 'loadNativeProductSnapshot');
    assert.equal((snapshotCalls[1]?.options as { snapshotBase64: string }).snapshotBase64, Buffer.from(snapshot).toString('base64'));
    const eventCall = calls.find(({ method }) => method === 'enqueueNativeProductEvents');
    assert.equal(
      (eventCall?.options as { eventsBase64: string }).eventsBase64,
      Buffer.from(encodeMacNativeProductEvents([event])).toString('base64'),
    );
    assert.deepEqual(calls.find(({ method }) => method === 'registerNativeProductFileAsset')?.options, {
      assetId: 11,
      assetPath: '/assets/test.wav',
      flags: 3,
    });
    const decodedCall = calls.find(({ method }) => method === 'registerNativeProductDecodedAsset');
    assert.deepEqual(decodedCall?.options, {
      assetId: 12,
      sampleRate: 48_000,
      flags: 5,
      channelsBase64: [
        Buffer.from(new Float32Array([0.25, -0.5]).buffer).toString('base64'),
        Buffer.from(new Float32Array([0.75]).buffer).toString('base64'),
      ],
    });
  } finally {
    if (previousWindow === undefined) delete globalWithWindow.window;
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
});
