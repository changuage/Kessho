import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { kesshoCoreWasmExportedFunctions } from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const workletPath = resolve(root, 'public/worklets/kessho-core-product.worklet.js');
const schemaPath = resolve(root, 'src/audio/generated/kesshoProductSchema.ts');

if (!existsSync(wasmPath)) {
  throw new Error('Missing public/worklets/kessho_core.wasm; run npm run core:build:wasm first.');
}

function resolveExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }
  return fn;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function parseGeneratedSchemaHash() {
  const schemaSource = readFileSync(schemaPath, 'utf8');
  const match = schemaSource.match(/KESSHO_PRODUCT_SCHEMA_HASH = (\d+) as const/);
  assert(match, 'generated TypeScript schema is missing KESSHO_PRODUCT_SCHEMA_HASH');
  return Number(match[1]) >>> 0;
}

const expectedSchemaHash = parseGeneratedSchemaHash();
const expectedSchemaHashHex = `0x${expectedSchemaHash.toString(16).padStart(8, '0')}`;
const wasmBinary = readFileSync(wasmPath);
const workletSource = readFileSync(workletPath, 'utf8');
assert(
  workletSource.includes(`EXPECTED_PRODUCT_SCHEMA_HASH = ${expectedSchemaHashHex}`),
  'Product worklet expected schema hash is stale relative to generated TypeScript schema',
);

const module = await WebAssembly.compile(wasmBinary);
const instance = await WebAssembly.instantiate(module, {
  env: {
    emscripten_notify_memory_growth: () => {},
    abort: () => {},
  },
  wasi_snapshot_preview1: {
    fd_write: () => 0,
    fd_seek: () => 0,
    fd_close: () => 0,
    proc_exit: () => {},
    environ_get: () => 0,
    environ_sizes_get: () => 0,
    clock_time_get: () => 0,
  },
});

const wasm = instance.exports;
for (const exportedFunction of kesshoCoreWasmExportedFunctions) {
  if (!exportedFunction.startsWith('kessho_product_')) {
    continue;
  }
  resolveExport(wasm, exportedFunction);
}
const malloc = resolveExport(wasm, 'malloc');
const free = resolveExport(wasm, 'free');
const create = resolveExport(wasm, 'kessho_product_create');
const destroy = resolveExport(wasm, 'kessho_product_destroy');
const reset = resolveExport(wasm, 'kessho_product_reset');
const enqueueEvent = resolveExport(wasm, 'kessho_product_enqueue_event');
const render = resolveExport(wasm, 'kessho_product_render');
const copyTelemetry = resolveExport(wasm, 'kessho_product_copy_telemetry');
const copySequencerUiState = resolveExport(wasm, 'kessho_product_copy_sequencer_ui_state');

const frames = 128;
const leftPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const rightPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const eventPtr = malloc(40);
const telemetryPtr = malloc(1040);
const sequencerUiStatePtr = malloc(70948);
const engine = create(48000, frames, 0);
assert(leftPtr && rightPtr && eventPtr && telemetryPtr && sequencerUiStatePtr && engine, 'WASM product smoke allocation failed');

const view = new DataView(wasm.memory.buffer);
const heap = new Float32Array(wasm.memory.buffer);
function writeEvent(fields) {
  view.setUint32(eventPtr, fields.sampleOffset ?? 0, true);
  view.setUint32(eventPtr + 4, fields.eventKind, true);
  view.setUint32(eventPtr + 8, fields.targetId ?? 0, true);
  view.setUint32(eventPtr + 12, fields.index ?? 0, true);
  view.setUint32(eventPtr + 16, fields.paramId ?? 0, true);
  view.setFloat32(eventPtr + 20, fields.value ?? 0, true);
  view.setFloat32(eventPtr + 24, fields.value2 ?? 0, true);
  view.setFloat32(eventPtr + 28, fields.value3 ?? 0, true);
  view.setFloat32(eventPtr + 32, fields.value4 ?? 0, true);
  view.setUint32(eventPtr + 36, fields.flags ?? 0, true);
}

function enqueueRawEvent(fields, message) {
  writeEvent(fields);
  assert(enqueueEvent(engine, eventPtr) === 1, message);
}

function renderPeak(blocks = 1) {
  let peak = 0;
  for (let block = 0; block < blocks; block += 1) {
    render(engine, leftPtr, rightPtr, frames);
    for (let i = 0; i < frames; i += 1) {
      const left = heap[(leftPtr >> 2) + i];
      const right = heap[(rightPtr >> 2) + i];
      assert(Number.isFinite(left) && Number.isFinite(right), 'WASM product render produced non-finite output');
      peak = Math.max(peak, Math.abs(left), Math.abs(right));
    }
  }
  return peak;
}

writeEvent({ eventKind: 14, value: 60, value2: 0.8, value3: 0.2 });
assert(
  enqueueEvent(engine, eventPtr) === -9,
  'WASM product manual note without target must fail explicitly',
);

reset(engine);
enqueueRawEvent(
  { eventKind: 17, targetId: 1, value: 0.9 },
  'WASM product drum trigger enqueue failed',
);
assert(renderPeak() > 0.001, 'WASM product render stayed silent after drum trigger');

reset(engine);
enqueueRawEvent(
  { eventKind: 12, targetId: 1, value: 1009 },
  'WASM product pad preset enqueue failed',
);
enqueueRawEvent(
  { eventKind: 14, targetId: 1, value: 60, value2: 0.85, value3: 0.25 },
  'WASM product pad manual note enqueue failed',
);
assert(renderPeak(32) > 0.001, 'WASM product pad manual note rendered silence');

reset(engine);
enqueueRawEvent(
  { eventKind: 14, targetId: 3, value: 72, value2: 0.85, value3: 0.25 },
  'WASM product lead manual note enqueue failed',
);
assert(renderPeak(32) > 0.001, 'WASM product lead manual note rendered silence');

assert(copyTelemetry(engine, telemetryPtr) === 1, 'WASM product telemetry copy failed');
assert(view.getUint32(telemetryPtr + 60, true) > 0, 'WASM product telemetry did not report active voices');
assert(view.getUint32(telemetryPtr + 928, true) > 0, 'WASM product telemetry did not expose RNG seed');
assert(view.getUint32(telemetryPtr + 932, true) > 0, 'WASM product telemetry did not expose RNG state');
assert(view.getUint32(telemetryPtr + 936 + 4 * 4, true) > 0, 'WASM product telemetry did not expose source preset IDs');
assert(view.getFloat32(telemetryPtr + 968, true) > 0, 'WASM product telemetry did not expose master output peak');
assert(view.getFloat32(telemetryPtr + 972, true) > 0, 'WASM product telemetry did not expose master output RMS');
assert(view.getFloat32(telemetryPtr + 992, true) >= view.getFloat32(telemetryPtr + 968, true), 'WASM product telemetry did not expose master true peak');
assert(Number.isFinite(view.getFloat32(telemetryPtr + 996, true)), 'WASM product telemetry did not expose master true peak dBTP');
assert(view.getFloat32(telemetryPtr + 1000, true) > -100, 'WASM product telemetry did not expose integrated LUFS');
assert(Number.isFinite(view.getFloat32(telemetryPtr + 1004, true)), 'WASM product telemetry did not expose granular write head');
for (let index = 0; index < 4; index += 1) {
  const position = view.getFloat32(telemetryPtr + 1008 + index * 4, true);
  assert(position >= 0 && position <= 1, 'WASM product telemetry did not expose normalized granular voice positions');
}
view.setUint32(eventPtr, 0, true);
view.setUint32(eventPtr + 4, 29, true);
view.setUint32(eventPtr + 8, 1, true);
view.setUint32(eventPtr + 12, 0, true);
view.setUint32(eventPtr + 16, 0, true);
view.setFloat32(eventPtr + 20, 1, true);
view.setFloat32(eventPtr + 24, 4242, true);
view.setFloat32(eventPtr + 28, 0, true);
view.setFloat32(eventPtr + 32, 0, true);
view.setUint32(eventPtr + 36, 0, true);
assert(enqueueEvent(engine, eventPtr) === 1, 'WASM product sequencer dice enqueue failed');
render(engine, leftPtr, rightPtr, frames);
assert(copyTelemetry(engine, telemetryPtr) === 1, 'WASM product post-dice telemetry copy failed');
assert(view.getUint32(telemetryPtr + 988, true) > 0, 'WASM product telemetry did not expose sequencer UI revision');
assert(copySequencerUiState(engine, sequencerUiStatePtr) === 1, 'WASM product sequencer UI state copy failed');
assert(view.getUint32(sequencerUiStatePtr + 4, true) === view.getUint32(telemetryPtr + 988, true), 'WASM product sequencer UI revision mismatch');
assert(view.getUint32(sequencerUiStatePtr + 24, true) === 1, 'WASM product sequencer UI state did not report latest synth target');
assert(view.getUint32(sequencerUiStatePtr + 32, true) === 3, 'WASM product sequencer UI state did not classify dice');
assert((view.getUint32(sequencerUiStatePtr + 36 + 24, true) & 1) !== 0, 'WASM product sequencer UI lane did not expose diced override state');

destroy(engine);
free(leftPtr);
free(rightPtr);
free(eventPtr);
free(telemetryPtr);
free(sequencerUiStatePtr);

function waitForMessage(messages, predicate, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    const tick = () => {
      const message = messages.find(predicate);
      if (message) {
        resolveWait(message);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        rejectWait(new Error('Timed out waiting for Product worklet message'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function instantiateWorklet({ wasmBinaryOverride = toArrayBuffer(wasmBinary), webAssemblyOverride = WebAssembly } = {}) {
  const messages = [];
  let Processor = null;
  class AudioWorkletProcessor {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: (message) => messages.push(message),
      };
    }
  }
  const sandbox = {
    AudioWorkletProcessor,
    registerProcessor: (_name, processorClass) => {
      Processor = processorClass;
    },
    sampleRate: 48000,
    WebAssembly: webAssemblyOverride,
    ArrayBuffer,
    Uint8Array,
    Float32Array,
    DataView,
    Map,
    Error,
    Math,
    Number,
    console,
    fetch: async () => {
      throw new Error('Product worklet test must not fetch WASM');
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(workletSource, sandbox, { filename: workletPath });
  assert(typeof Processor === 'function', 'Product worklet did not register its processor');
  return {
    processor: new Processor({ processorOptions: { wasmBinary: wasmBinaryOverride } }),
    messages,
  };
}

function fakeWebAssemblyWithTelemetryHash(schemaHash) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let nextPtr = 1024;
  const align = (value) => (value + 7) & ~7;
  const malloc = (bytes) => {
    const ptr = nextPtr;
    nextPtr = align(nextPtr + Math.max(0, bytes | 0));
    return ptr;
  };
  const copyTelemetry = (_engine, ptr) => {
    new DataView(memory.buffer).setUint32(ptr, schemaHash >>> 0, true);
    return 1;
  };
  const exports = {
    memory,
    malloc,
    free: () => {},
    kessho_product_create: () => 64,
    kessho_product_reset: () => {},
    kessho_product_reset_parity_fx: () => {},
    kessho_product_render: () => {},
    kessho_product_get_stem: () => 0,
    kessho_product_get_graph_tap: () => 0,
    kessho_product_set_graph_taps_enabled: () => 1,
    kessho_product_load_snapshot_v2: () => 1,
    kessho_product_enqueue_event: () => 1,
    kessho_product_copy_telemetry: copyTelemetry,
    kessho_product_copy_sequencer_ui_state: () => 1,
    kessho_product_register_asset_buffer: () => 1,
    kessho_product_unregister_asset_buffer: () => 1,
  };
  return {
    instantiate: async () => ({ instance: { exports } }),
  };
}

const staleWasm = instantiateWorklet({
  wasmBinaryOverride: new ArrayBuffer(8),
  webAssemblyOverride: fakeWebAssemblyWithTelemetryHash(expectedSchemaHash ^ 0xffffffff),
});
const staleWasmError = await waitForMessage(staleWasm.messages, (message) => message.type === 'error');
assert(
  staleWasmError.message.includes('WASM telemetry schema hash mismatch'),
  'Product worklet did not reject stale WASM telemetry schema hash',
);
assert(staleWasm.processor.ready === false, 'Product worklet must not become ready after stale WASM schema mismatch');

const liveWorklet = instantiateWorklet();
await waitForMessage(liveWorklet.messages, (message) => message.type === 'ready' || message.type === 'error');
const liveInitError = liveWorklet.messages.find((message) => message.type === 'error');
assert(!liveInitError, `Product worklet failed to initialize with committed WASM: ${liveInitError?.message}`);
const staleSnapshot = new ArrayBuffer(16);
new DataView(staleSnapshot).setUint32(4, expectedSchemaHash ^ 0xffffffff, true);
liveWorklet.processor.handleMessage({ type: 'snapshot', snapshot: staleSnapshot });
const staleSnapshotError = liveWorklet.messages.find(
  (message) => message.type === 'error' && message.message.includes('snapshot schema hash mismatch'),
);
assert(staleSnapshotError, 'Product worklet did not report stale snapshot schema mismatch');
assert(liveWorklet.processor.snapshotPtr === 0, 'Product worklet must refuse stale snapshots before allocation');
liveWorklet.processor.handleMessage({
  type: 'event',
  event: { eventKind: 14, value: 60, value2: 0.8, value3: 0.2 },
});
const missingTargetError = liveWorklet.messages.find(
  (message) => message.type === 'error' && message.message.includes('missing required field: targetId'),
);
assert(missingTargetError, 'Product worklet did not reject manual note events missing targetId');

console.log('Kessho Product WASM smoke passed');
