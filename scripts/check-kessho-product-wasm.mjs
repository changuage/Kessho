import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { kesshoCoreWasmExportedFunctions } from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const workletPath = resolve(root, 'public/worklets/kessho-core-product.worklet.js');
const captureHeaderPath = resolve(root, 'cpp/KesshoCore/include/KesshoCore/KesshoProductGeneratedSequencerCapture.h');
const schemaPath = resolve(root, 'src/audio/generated/kesshoProductSchema.ts');
const capabilityPath = resolve(root, 'src/audio/product/ProductRuntimeCapabilityReport.ts');

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

function parseProductAbiVersion() {
  const capabilitySource = readFileSync(capabilityPath, 'utf8');
  const match = capabilitySource.match(/KESSHO_PRODUCT_ABI_VERSION = (\d+) as const/);
  assert(match, 'Product runtime capability report is missing KESSHO_PRODUCT_ABI_VERSION');
  return Number(match[1]);
}

const expectedSchemaHash = parseGeneratedSchemaHash();
const expectedSchemaHashHex = `0x${expectedSchemaHash.toString(16).padStart(8, '0')}`;
const expectedAbiVersion = parseProductAbiVersion();
const wasmBinary = readFileSync(wasmPath);
const workletSource = readFileSync(workletPath, 'utf8');
const captureHeader = readFileSync(captureHeaderPath, 'utf8');
const captureSizeMatch = captureHeader.match(/sizeof\(KesshoProductGeneratedSequencerCaptureEvent\) == (\d+)u/);
assert(captureSizeMatch, 'Generated sequencer capture header is missing its ABI size assertion');
const captureEventBytes = Number(captureSizeMatch[1]);
assert(
  workletSource.includes(`const GENERATED_CAPTURE_EVENT_BYTES = ${captureEventBytes};`),
  `Product worklet capture event stride must match the ${captureEventBytes}-byte C ABI`,
);
assert(
  kesshoCoreWasmExportedFunctions.includes('kessho_product_drain_generated_sequencer_capture_events'),
  'Product WASM export manifest is missing generated sequencer capture draining',
);
assert(
  workletSource.includes(`EXPECTED_PRODUCT_SCHEMA_HASH = ${expectedSchemaHashHex}`),
  'Product worklet expected schema hash is stale relative to generated TypeScript schema',
);
assert(
  workletSource.includes(`EXPECTED_PRODUCT_ABI_VERSION = ${expectedAbiVersion}`),
  'Product worklet expected ABI version is stale relative to the host capability report',
);
assert(
  workletSource.includes('const base = ptr + TELEMETRY_EARTH_OFFSET;'),
  'Product worklet must read Earth texture telemetry relative to the telemetry pointer',
);
for (const [name, id] of [
  ['SetAutoStop', 51],
  ['SetScatterEnabled', 54],
  ['CommitSceneProgram', 59],
  ['SetRoutingMuteGroupsEnabled', 65],
  ['ConfigureGlobalAutoCycle', 66],
]) {
  assert(
    workletSource.includes(`${name}: ${id}`),
    `Product worklet validator is missing ${name} event ${id}`,
  );
}

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
const getAbiVersion = resolveExport(wasm, 'kessho_product_get_abi_version');
const destroy = resolveExport(wasm, 'kessho_product_destroy');
const reset = resolveExport(wasm, 'kessho_product_reset');
const enqueueEvent = resolveExport(wasm, 'kessho_product_enqueue_event');
const render = resolveExport(wasm, 'kessho_product_render');
const copyTelemetry = resolveExport(wasm, 'kessho_product_copy_telemetry');
const refreshTelemetry = resolveExport(wasm, 'kessho_product_refresh_telemetry');
const setMeterDemand = resolveExport(wasm, 'kessho_product_set_meter_demand');
const setStemsEnabled = resolveExport(wasm, 'kessho_product_set_stems_enabled');
const copySequencerUiState = resolveExport(wasm, 'kessho_product_copy_sequencer_ui_state');
assert(getAbiVersion() === expectedAbiVersion, 'WASM Product ABI version does not match the host capability report');
const EVENT_DICE_SEQUENCER_LANE = 29;
const SEQUENCER_SYNTH = 1;
const DICE_FIELD_EXPRESSION = 1 << 4;
const EVOLVE_METHOD_VALUE_SCRAMBLE = 1 << 16;
const EVOLVE_MANUAL_COMMIT = 1 << 28;
const EVOLVE_MODE_PARITY = 0x80000000;
const SEQUENCER_UI_LANE_BASE_OFFSET = 36;
const SEQUENCER_UI_LANE_SIZE = 3296;
const LANE_EXPRESSION_OVERRIDE_SET_LOW_OFFSET = 76;
const LANE_EXPRESSION_OVERRIDES_OFFSET = 1448;
const TELEMETRY_BYTES = 14912;
const TELEMETRY_SYNTH_ARP_CURRENT_STEPS_OFFSET = 1296;
const TELEMETRY_TRANSPORT_BPM_OFFSET = 14076;
const TELEMETRY_TRANSPORT_PHRASE_SECONDS_OFFSET = 14088;
const TELEMETRY_TRANSPORT_PENDING_OFFSET = 14092;
const TELEMETRY_TRANSPORT_PENDING_APPLY_FRAME_OFFSET = 14112;
const TELEMETRY_TRANSPORT_REVISION_OFFSET = 14120;

const frames = 128;
const leftPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const rightPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const eventPtr = malloc(40);
const telemetryPtr = malloc(TELEMETRY_BYTES);
const sequencerUiStatePtr = malloc(105508);
const engine = create(48000, frames, 0);
assert(leftPtr && rightPtr && eventPtr && telemetryPtr && sequencerUiStatePtr && engine, 'WASM product smoke allocation failed');
assert(setMeterDemand(engine, 1) === 1, 'WASM product meter demand enable failed');
assert(setStemsEnabled(engine, 1) === 1, 'WASM product stem enable failed');

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

function refreshAndCopyTelemetry(message) {
  assert(refreshTelemetry(engine) === 1, `${message} refresh failed`);
  assert(copyTelemetry(engine, telemetryPtr) === 1, `${message} copy failed`);
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

function sequencerUiSynthLaneOffset(laneIndex) {
  return sequencerUiStatePtr + SEQUENCER_UI_LANE_BASE_OFFSET + laneIndex * SEQUENCER_UI_LANE_SIZE;
}

function readSequencerUiLaneFloatArray(laneBase, offset, count) {
  return Array.from({ length: count }, (_, index) => view.getFloat32(laneBase + offset + index * 4, true));
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

refreshAndCopyTelemetry('WASM product telemetry');
assert(view.getUint32(telemetryPtr + 60, true) > 0, 'WASM product telemetry did not report active voices');
assert(view.getUint32(telemetryPtr + 928, true) > 0, 'WASM product telemetry did not expose RNG seed');
assert(view.getUint32(telemetryPtr + 932, true) > 0, 'WASM product telemetry did not expose RNG state');
assert(view.getUint32(telemetryPtr + 936 + 4 * 4, true) > 0, 'WASM product telemetry did not expose source preset IDs');
assert(view.getFloat32(telemetryPtr + 972, true) > 0, 'WASM product telemetry did not expose master output peak');
assert(view.getFloat32(telemetryPtr + 976, true) > 0, 'WASM product telemetry did not expose master output RMS');
assert(view.getFloat32(telemetryPtr + 992, true) >= view.getFloat32(telemetryPtr + 972, true), 'WASM product telemetry did not expose master true peak');
assert(Number.isFinite(view.getFloat32(telemetryPtr + 996, true)), 'WASM product telemetry did not expose master true peak dBTP');
assert(view.getFloat32(telemetryPtr + 1000, true) > -100, 'WASM product telemetry did not expose integrated LUFS');
assert(Number.isFinite(view.getFloat32(telemetryPtr + 1004, true)), 'WASM product telemetry did not expose granular write head');
for (let index = 0; index < 4; index += 1) {
  const position = view.getFloat32(telemetryPtr + 1008 + index * 4, true);
  assert(position >= 0 && position <= 1, 'WASM product telemetry did not expose normalized granular voice positions');
}
assert(view.getUint32(telemetryPtr + 1040, true) >= 0, 'WASM product telemetry did not expose synth sequencer hit counts');
assert(view.getUint32(telemetryPtr + 1104, true) >= 0, 'WASM product telemetry did not expose drum sequencer hit counts');
assert(view.getUint32(telemetryPtr + TELEMETRY_SYNTH_ARP_CURRENT_STEPS_OFFSET, true) >= 0, 'WASM product telemetry did not expose synth arp current steps');
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
refreshAndCopyTelemetry('WASM product post-dice telemetry');
assert(view.getUint32(telemetryPtr + 988, true) > 0, 'WASM product telemetry did not expose sequencer UI revision');
assert(copySequencerUiState(engine, sequencerUiStatePtr) === 1, 'WASM product sequencer UI state copy failed');
assert(view.getUint32(sequencerUiStatePtr + 4, true) === view.getUint32(telemetryPtr + 988, true), 'WASM product sequencer UI revision mismatch');
assert(view.getUint32(sequencerUiStatePtr + 24, true) === 1, 'WASM product sequencer UI state did not report latest synth target');
assert(view.getUint32(sequencerUiStatePtr + 32, true) === 3, 'WASM product sequencer UI state did not classify dice');
assert((view.getUint32(sequencerUiStatePtr + 36 + 24, true) & 1) !== 0, 'WASM product sequencer UI lane did not expose diced override state');
assert(view.getFloat32(sequencerUiStatePtr + 36 + 3016, true) <= view.getFloat32(sequencerUiStatePtr + 36 + 3020, true), 'WASM product sequencer UI lane did not expose valid note-range bounds');

reset(engine);
enqueueRawEvent(
  {
    eventKind: EVENT_DICE_SEQUENCER_LANE,
    targetId: SEQUENCER_SYNTH,
    index: 0,
    value: 1,
    value2: 7171,
    value3: -1,
    value4: 3,
    flags: (EVOLVE_MODE_PARITY + EVOLVE_MANUAL_COMMIT + EVOLVE_METHOD_VALUE_SCRAMBLE + DICE_FIELD_EXPRESSION) >>> 0,
  },
  'WASM product manual-commit synth dice enqueue failed',
);
render(engine, leftPtr, rightPtr, frames);
assert(copySequencerUiState(engine, sequencerUiStatePtr) === 1, 'WASM product post-manual-commit sequencer UI state copy failed');
const manualCommitLane = sequencerUiSynthLaneOffset(0);
const manualCommitExpressionMask = view.getUint32(manualCommitLane + LANE_EXPRESSION_OVERRIDE_SET_LOW_OFFSET, true);
assert(manualCommitExpressionMask !== 0, 'WASM product manual-commit synth dice did not expose an expression override mask');
const manualCommitExpressionValues = readSequencerUiLaneFloatArray(manualCommitLane, LANE_EXPRESSION_OVERRIDES_OFFSET, 8);
assert(
  manualCommitExpressionValues.some((value) => Number.isFinite(value) && value > 0 && value < 1),
  'WASM product manual-commit synth dice did not expose a mutated expression value',
);

reset(engine);
enqueueRawEvent(
  { eventKind: 2, value: 60, value2: 1, value3: 1, value4: 0.01 },
  'WASM product initial transport enqueue failed',
);
enqueueRawEvent({ eventKind: 3 }, 'WASM product transport start enqueue failed');
render(engine, leftPtr, rightPtr, frames);
refreshAndCopyTelemetry('WASM product initial transport telemetry');
const initialTransitionRevision = view.getUint32(telemetryPtr + TELEMETRY_TRANSPORT_REVISION_OFFSET, true);
enqueueRawEvent(
  { eventKind: 2, value: 30, value2: 1, value3: 1, value4: 0.02, flags: 1 },
  'WASM product pending transport enqueue failed',
);
render(engine, leftPtr, rightPtr, frames);
refreshAndCopyTelemetry('WASM product pending transport telemetry');
assert(view.getUint32(telemetryPtr + TELEMETRY_TRANSPORT_PENDING_OFFSET, true) === 1, 'WASM product telemetry did not report a pending transport transition');
assert(view.getFloat32(telemetryPtr + TELEMETRY_TRANSPORT_BPM_OFFSET, true) === 60, 'WASM product changed BPM before the phrase boundary');
assert(Number(view.getBigUint64(telemetryPtr + TELEMETRY_TRANSPORT_PENDING_APPLY_FRAME_OFFSET, true)) === 480, 'WASM product pending transition targeted the wrong phrase boundary');
render(engine, leftPtr, rightPtr, frames);
render(engine, leftPtr, rightPtr, frames);
refreshAndCopyTelemetry('WASM product applied transport telemetry');
assert(view.getUint32(telemetryPtr + TELEMETRY_TRANSPORT_PENDING_OFFSET, true) === 0, 'WASM product pending transition did not clear at the phrase boundary');
const appliedTransitionRevision = view.getUint32(telemetryPtr + TELEMETRY_TRANSPORT_REVISION_OFFSET, true);
assert(
  appliedTransitionRevision === initialTransitionRevision + 1,
  `WASM product transition revision did not advance exactly once (initial=${initialTransitionRevision}, applied=${appliedTransitionRevision}, bpm=${view.getFloat32(telemetryPtr + TELEMETRY_TRANSPORT_BPM_OFFSET, true)})`,
);
assert(view.getFloat32(telemetryPtr + TELEMETRY_TRANSPORT_BPM_OFFSET, true) === 30, 'WASM product did not apply BPM at the phrase boundary');
assert(Math.abs(view.getFloat32(telemetryPtr + TELEMETRY_TRANSPORT_PHRASE_SECONDS_OFFSET, true) - 0.02) < 0.0001, 'WASM product did not apply phrase duration at the phrase boundary');

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

function fakeWebAssemblyWithTelemetryHash(schemaHash, hooks = {}) {
  const memory = new WebAssembly.Memory({ initial: 16 });
  let nextPtr = 1024;
  const align = (value) => (value + 7) & ~7;
  const malloc = (bytes) => {
    hooks.onMalloc?.(bytes);
    const ptr = nextPtr;
    nextPtr = align(nextPtr + Math.max(0, bytes | 0));
    if (nextPtr > memory.buffer.byteLength) memory.grow(Math.ceil((nextPtr - memory.buffer.byteLength) / 65536));
    return ptr;
  };
  const copyTelemetry = (_engine, ptr) => {
    new DataView(memory.buffer).setUint32(ptr, schemaHash >>> 0, true);
    return 1;
  };
  const copyCaptureClock = (_engine, ptr) => {
    const view = new DataView(memory.buffer);
    view.setUint32(ptr, hooks.captureClockSchema ?? 2, true);
    view.setUint32(ptr + 4, hooks.captureClockReserved ?? 0, true);
    view.setBigUint64(ptr + 8, BigInt(hooks.captureClockSample ?? 0), true);
    view.setFloat64(ptr + 16, hooks.captureClockBeat ?? 0, true);
    view.setFloat64(ptr + 24, hooks.captureClockBpm ?? 120, true);
    hooks.onCaptureClockCopy?.();
    return hooks.captureClockResult ?? 1;
  };
  const exports = {
    memory,
    malloc,
    free: (ptr) => hooks.free?.(ptr),
    kessho_product_get_abi_version: () => hooks.abiVersion ?? expectedAbiVersion,
    kessho_product_create: () => 64,
    kessho_product_reset: () => {},
    kessho_product_reset_parity_fx: () => {},
    kessho_product_render: () => {},
    kessho_product_get_stem: () => 0,
    kessho_product_get_graph_tap: () => 0,
    kessho_product_set_graph_taps_enabled: () => 1,
    kessho_product_set_stems_enabled: () => 1,
    kessho_product_load_snapshot_v2: () => 1,
    kessho_product_enqueue_event: () => 1,
    kessho_product_copy_telemetry: copyTelemetry,
    kessho_product_refresh_telemetry: () => 1,
    kessho_product_copy_capture_clock: copyCaptureClock,
    kessho_product_set_sequencer_variation_bank: () => 1,
    kessho_product_select_sequencer_variation: () => 1,
    kessho_product_copy_sequencer_variation_runtime: () => 1,
    kessho_product_set_meter_demand: () => 1,
    kessho_product_set_simple_sequencer_visual_demand: () => 1,
    kessho_product_drain_generated_sequencer_capture_events: () => 0,
    kessho_product_drain_simple_sequencer_visual_events: () => 0,
    kessho_product_copy_granular_waveform: () => 1,
    kessho_product_copy_sequencer_ui_state: () => 1,
    kessho_product_register_asset_buffer: () => 1,
    kessho_product_unregister_asset_buffer: (...args) => hooks.unregisterAsset?.(...args) ?? 1,
  };
  return {
    instantiate: async () => ({ instance: { exports } }),
  };
}

let staleAbiAllocations = 0;
let staleAbiClockCopies = 0;
const staleAbi = instantiateWorklet({
  wasmBinaryOverride: new ArrayBuffer(8),
  webAssemblyOverride: fakeWebAssemblyWithTelemetryHash(expectedSchemaHash, {
    abiVersion: expectedAbiVersion - 1,
    onMalloc: () => { staleAbiAllocations += 1; },
    onCaptureClockCopy: () => { staleAbiClockCopies += 1; },
  }),
});
const staleAbiError = await waitForMessage(staleAbi.messages, (message) => message.type === 'error');
assert(
  staleAbiError.message.includes('WASM ABI version mismatch'),
  'Product worklet did not reject a stale WASM ABI version',
);
assert(staleAbi.processor.ready === false, 'Product worklet must not become ready after a stale WASM ABI version');
assert(staleAbiAllocations === 0 && staleAbiClockCopies === 0, 'Product worklet allocated or copied clock state before rejecting its ABI');

const malformedClock = instantiateWorklet({
  wasmBinaryOverride: new ArrayBuffer(8),
  webAssemblyOverride: fakeWebAssemblyWithTelemetryHash(expectedSchemaHash, {
    captureClockSchema: 1,
  }),
});
await waitForMessage(malformedClock.messages, (message) => message.type === 'ready' || message.type === 'error');
assert(malformedClock.processor.ready, 'Malformed clock worklet fixture did not initialize');
malformedClock.processor.handleMessage({
  type: 'recorded-capture-control',
  request: {
    action: 'start',
    enabled: true,
    sessionToken: 'malformed-clock',
    sourceLaneIndex: 0,
    targetLaneIndex: 0,
    source: 'keyboard',
    durationBeats: 1,
  },
});
malformedClock.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
const malformedClockError = malformedClock.messages.find(
  (message) => message.type === 'recorded-capture-batch' && message.batch.phase === 'error',
);
assert(malformedClockError?.batch.error?.includes('capture clock schema mismatch'), 'Worklet did not reject a malformed capture clock');
assert(malformedClock.processor.recordedCapture === null, 'Malformed capture clock left the capture session active');

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

let deferredReleaseAttempts = 0;
const deferredFreedPointers = [];
const deferredWorklet = instantiateWorklet({
  wasmBinaryOverride: new ArrayBuffer(8),
  webAssemblyOverride: fakeWebAssemblyWithTelemetryHash(expectedSchemaHash, {
    free: (ptr) => deferredFreedPointers.push(ptr),
    unregisterAsset: () => (++deferredReleaseAttempts === 1 ? -16 : 1),
  }),
});
await waitForMessage(deferredWorklet.messages, (message) => message.type === 'ready' || message.type === 'error');
assert(deferredWorklet.processor.ready, 'Deferred-release worklet fixture did not initialize');
deferredWorklet.processor.handleMessage({ type: 'host-visibility', hidden: true });
deferredWorklet.processor.handleMessage({ type: 'host-visibility', hidden: false });
deferredWorklet.processor.handleMessage({
  type: 'register-asset',
  assetId: 42,
  sampleRate: 48000,
  flags: 8,
  channels: [new Float32Array(256).fill(0.25)],
});
assert(deferredWorklet.processor.assetAllocations.has(42), 'Worklet asset fixture did not register');
assert(
  deferredWorklet.messages.filter((message) => message.type === 'asset-registration-complete' && message.assetId === 42).length === 1,
  'Worklet did not acknowledge asset registration',
);
const freeCountBeforeDuplicate = deferredFreedPointers.length;
deferredWorklet.processor.handleMessage({
  type: 'register-asset',
  assetId: 42,
  sampleRate: 48000,
  flags: 8,
  channels: [new Float32Array(256).fill(0.5)],
});
assert(
  deferredFreedPointers.length === freeCountBeforeDuplicate,
  'Duplicate worklet registration freed an active allocation',
);
assert(
  deferredWorklet.messages.some((message) => message.type === 'asset-registration-failed' && message.assetId === 42),
  'Duplicate worklet registration did not return a failed acknowledgement',
);
deferredWorklet.processor.handleMessage({ type: 'unregister-asset', assetId: 42 });
deferredWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
assert(deferredWorklet.processor.assetAllocations.has(42), 'ASSET_IN_USE freed the worklet allocation');
assert(deferredFreedPointers.length === freeCountBeforeDuplicate, 'ASSET_IN_USE called free');
const assetReleaseRetryIntervalBlocks = deferredWorklet.processor.assetReleaseRetryIntervalBlocks;
for (let block = 1; block < assetReleaseRetryIntervalBlocks; block += 1) {
  deferredWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
}
assert(deferredReleaseAttempts === 1, 'Deferred asset release retried before its block interval elapsed');
assert(deferredWorklet.processor.assetAllocations.has(42), 'Deferred retry interval freed the worklet allocation');
deferredWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
assert(!deferredWorklet.processor.assetAllocations.has(42), 'Successful retry retained the worklet allocation');
assert(deferredReleaseAttempts === 2, 'Successful deferred asset release did not retry exactly once');
assert(deferredFreedPointers.length === freeCountBeforeDuplicate + 2, 'Successful retry did not free pointers exactly once');
assert(
  deferredWorklet.messages.filter((message) => message.type === 'asset-release-complete' && message.assetId === 42).length === 1,
  'Worklet did not acknowledge asset release exactly once',
);
deferredWorklet.processor.handleMessage({
  type: 'register-asset',
  assetId: 43,
  sampleRate: 48000,
  flags: 8,
  channels: [new Float32Array(64).fill(0.25)],
});
deferredWorklet.processor.handleMessage({ type: 'unregister-asset', assetId: 43 });
deferredWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
assert(deferredReleaseAttempts === 3, 'A new asset release did not run immediately after the queue emptied');
assert(!deferredWorklet.processor.assetAllocations.has(43), 'Immediate new asset release retained its allocation');
assert(
  deferredWorklet.messages.filter((message) => message.type === 'asset-release-complete' && message.assetId === 43).length === 1,
  'Immediate new asset release was not acknowledged exactly once',
);

const liveWorklet = instantiateWorklet();
await waitForMessage(liveWorklet.messages, (message) => message.type === 'ready' || message.type === 'error');
const liveInitError = liveWorklet.messages.find((message) => message.type === 'error');
assert(!liveInitError, `Product worklet failed to initialize with committed WASM: ${liveInitError?.message}`);
liveWorklet.processor.handleMessage({ type: 'event', event: { eventKind: 3 } });
liveWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
const refreshesBeforeCapture = liveWorklet.processor.exports.kessho_product_get_telemetry_refresh_count(
  liveWorklet.processor.engine,
);
liveWorklet.processor.handleMessage({
  type: 'recorded-capture-control',
  request: {
    action: 'start',
    enabled: true,
    sessionToken: 'live-clock-tempo-finish',
    sourceLaneIndex: 0,
    targetLaneIndex: 0,
    source: 'keyboard',
    durationBeats: 0.01,
    gridSteps: 16,
  },
});
liveWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
liveWorklet.processor.handleMessage({
  type: 'event',
  event: { eventKind: 2, value: 60, value2: 4, value3: 4, value4: 0 },
});
liveWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
assert(liveWorklet.processor.captureClock?.bpm === 60, 'Recorded capture did not publish the live transport BPM');
liveWorklet.processor.handleMessage({
  type: 'recorded-capture-control',
  request: {
    action: 'finish',
    sessionToken: 'live-clock-tempo-finish',
  },
});
for (let block = 0; block < 16; block += 1) {
  liveWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
  if (liveWorklet.messages.some(
    (message) => message.type === 'recorded-capture-batch' && message.batch.phase === 'ready',
  )) break;
}
assert(
  liveWorklet.messages.some(
    (message) => message.type === 'recorded-capture-batch' && message.batch.phase === 'ready',
  ),
  'Recorded capture did not finish at an audio clock boundary',
);
const refreshesAfterCapture = liveWorklet.processor.exports.kessho_product_get_telemetry_refresh_count(
  liveWorklet.processor.engine,
);
assert(refreshesAfterCapture === refreshesBeforeCapture, 'Capture clock polling performed a full telemetry refresh');
let warmedHeapBytes = 0;
for (let cycle = 0; cycle < 1000; cycle += 1) {
  liveWorklet.processor.handleMessage({
    type: 'register-asset',
    assetId: 5000,
    sampleRate: 48000,
    flags: 8,
    channels: [new Float32Array([0.25])],
  });
  liveWorklet.processor.handleMessage({ type: 'unregister-asset', assetId: 5000 });
  liveWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
  if (cycle === 9) warmedHeapBytes = liveWorklet.processor.exports.memory.buffer.byteLength;
}
assert(liveWorklet.processor.assetAllocations.size === 0, 'Register/release cycles leaked worklet allocations');
assert(liveWorklet.processor.assetDecodedBytes === 0, 'Register/release cycles drifted decoded byte accounting');
assert(liveWorklet.processor.assetAllocationBytes === 0, 'Register/release cycles drifted allocation byte accounting');
assert(
  liveWorklet.processor.exports.memory.buffer.byteLength === warmedHeapBytes,
  'Repeated asset cycles grew the warmed WASM heap high-water mark',
);
const staleSnapshot = new ArrayBuffer(16);
new DataView(staleSnapshot).setUint32(4, expectedSchemaHash ^ 0xffffffff, true);
liveWorklet.processor.handleMessage({ type: 'snapshot', snapshot: staleSnapshot });
liveWorklet.processor.process([], [[new Float32Array(128), new Float32Array(128)]]);
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

const workletErrorCountBeforeArpCommit = liveWorklet.messages.filter((message) => message.type === 'error').length;
liveWorklet.processor.handleMessage({
  type: 'event',
  event: { eventKind: 50, targetId: 1, index: 0 },
});
assert(
  liveWorklet.messages.filter((message) => message.type === 'error').length === workletErrorCountBeforeArpCommit,
  'Product worklet did not accept the ARP pattern commit event',
);

// Registration failures must clean up every earlier allocation before publishing.
{
  const processor = deferredWorklet.processor;
  const malloc = processor.api.malloc;
  const register = processor.api.registerAsset;
  const attempt = (assetId, channels) => processor.handleMessage({
    type: 'register-asset', assetId, sampleRate: 48000, flags: 8, channels,
  });
  let allocations = 0;
  processor.api.malloc = (bytes) => { allocations += 1; return malloc(bytes); };
  for (const channels of [[], [new Float32Array(0)], [new Float32Array(2), new Float32Array(3)],
    [new Float32Array(2), new Float32Array(2), new Float32Array(2)], [[1, 2]]]) {
    attempt(8100, channels);
  }
  assert(allocations === 0, 'Invalid channel shape allocated WASM memory');
  for (const failAt of [2, 3, 4]) {
    allocations = 0;
    const freedBefore = deferredFreedPointers.length;
    processor.api.malloc = (bytes) => ++allocations === failAt ? 0 : malloc(bytes);
    processor.api.registerAsset = failAt === 4 ? () => { throw new Error('registration trap'); } : register;
    const assetId = 8100 + failAt;
    attempt(assetId, [new Float32Array(2), new Float32Array(2)]);
    assert(deferredFreedPointers.length - freedBefore === failAt - 1, 'Partial admission leaked an allocation');
    assert(!processor.assetAllocations.has(assetId), 'Failed admission was published');
    assert(deferredWorklet.messages.filter((message) => message.assetId === assetId
      && message.type === 'asset-registration-failed').length === 1, 'Admission failure did not acknowledge exactly once');
  }
  processor.api.malloc = malloc;
  processor.api.registerAsset = register;
  assert(processor.assetAllocationBytes === 0 && processor.assetDecodedBytes === 0, 'Failed admission changed accounting');
  processor.handleMessage({ type: 'asset-render-state', active: true });
  // Saturation retains neither rejected PCM nor extra reservations; cancellation
  // before allocation drains the same queue without touching the heap.
  const freedBeforeQueue = deferredFreedPointers.length;
  for (let i = 0; i < 65; i += 1) attempt(8300 + i, [new Float32Array(1)]);
  assert(processor.pendingAssetCopies.size === 64 && processor.pendingAssetCopyBytes === 256,
    'Transfer count cap retained an excess admission');
  assert(deferredWorklet.messages.filter((message) => message.assetId === 8364
    && message.type === 'asset-registration-failed').length === 1, 'Count rejection did not acknowledge exactly once');
  processor.handleMessage({ type: 'cancel-asset-copies' });
  assert(deferredFreedPointers.length === freedBeforeQueue && processor.pendingAssetCopyBytes === 0,
    'Unallocated cancellation changed the heap or retained reservations');
  // Shared test view avoids allocating another full 192 MiB test payload.
  const largeChannel = new Float32Array(96 * 1024 * 1024 / 4);
  attempt(8400, [largeChannel, largeChannel]);
  attempt(8401, [new Float32Array(1)]);
  assert(processor.pendingAssetCopies.size === 1 && processor.pendingAssetCopyBytes === 192 * 1024 * 1024,
    'Transfer byte cap retained an excess admission');
  assert(deferredWorklet.messages.filter((message) => message.assetId === 8401
    && message.type === 'asset-registration-failed').length === 1, 'Byte rejection did not acknowledge exactly once');
  processor.handleMessage({ type: 'cancel-asset-copies' });
  assert(processor.pendingAssetCopyBytes === 0, 'Byte-cap cancellation retained reservations');
  assert(deferredFreedPointers.length === freedBeforeQueue, 'Rejected or unallocated byte-cap admission freed heap memory');
  const channels = [new Float32Array(65536), new Float32Array(65536)];
  const output = [[new Float32Array(128), new Float32Array(128)]];
  // One scenario: active partial copy -> release/reset/dispose cancellation ->
  // suspended startup/transition completion without needing a render callback.
  for (const action of ['unregister-asset', 'reset', 'cancel-asset-copies']) {
    const assetId = 8200;
    attempt(assetId, channels);
    assert(!processor.assetAllocations.has(assetId), 'Active admission published in its handler');
    processor.process([], output);
    assert(processor.pendingAssetCopies.get(assetId).offset === 32768, 'Active copy exceeded 128 KiB');
    const before = deferredWorklet.messages.length;
    const freedBefore = deferredFreedPointers.length;
    processor.handleMessage({ type: action, assetId });
    assert(deferredFreedPointers.length - freedBefore === 3, 'Cancelled partial copy leaked memory');
    for (let i = 0; i < 6; i += 1) processor.process([], output);
    assert(!processor.assetAllocations.has(assetId), 'Cancelled copy resurrected');
    assert(processor.pendingAssetCopyBytes === 0, 'Cancellation retained transfer reservation');
    assert(deferredWorklet.messages.slice(before).filter((message) => message.type === 'asset-registration-failed').length === 1,
      'Cancellation did not acknowledge exactly once');
  }
  attempt(8201, channels);
  processor.process([], output);
  processor.handleMessage({ type: 'asset-render-state', active: false });
  assert(processor.assetAllocations.has(8201), 'Suspending mid-copy left readiness waiting for process');
  attempt(8202, [new Float32Array(16)]);
  assert(processor.assetAllocations.has(8202), 'Suspended startup waited for process');
  assert(processor.pendingAssetCopyBytes === 0, 'Completed admission retained transfer reservation');
  for (const assetId of [8201, 8202]) processor.freeAssetAllocation(assetId);
}

// Opt-in desktop message-handler evidence; this is not an AudioWorklet deadline/device test.
if (process.argv.includes('--measure-admission')) {
  const fixture = instantiateWorklet();
  const reference = instantiateWorklet();
  await waitForMessage(reference.messages, (message) => message.type === 'ready' || message.type === 'error');
  const referenceOutput = [[new Float32Array(128), new Float32Array(128)]];
  let maxOutputDifference = 0;
  await waitForMessage(fixture.messages, (message) => message.type === 'ready' || message.type === 'error');
  const processor = fixture.processor;
  assert(processor.ready, 'Admission measurement did not initialize');
  const output = [[new Float32Array(128), new Float32Array(128)]];
  const renderTimes = [];
  let activeRenderTimes = [];
  let measuringActive = false;
  let maxCopyBytes = 0;
  let peak = 0;
  let boundaryJump = 0;
  let previousSample = 0;
  const renderBlock = () => {
    const start = performance.now();
    processor.process([], output);
    const elapsed = performance.now() - start;
    renderTimes.push(elapsed);
    if (measuringActive) activeRenderTimes.push(elapsed);
    reference.processor.process([], referenceOutput);
    for (let channel = 0; channel < 2; channel += 1) {
      for (let i = 0; i < 128; i += 1) maxOutputDifference = Math.max(maxOutputDifference,
        Math.abs(output[0][channel][i] - referenceOutput[0][channel][i]));
    }
    boundaryJump = Math.max(boundaryJump, Math.abs(output[0][0][0] - previousSample));
    for (const sample of output[0][0]) {
      assert(Number.isFinite(sample), 'Admission rendered nonfinite output');
      peak = Math.max(peak, Math.abs(sample));
    }
    previousSample = output[0][0][127];
  };
  let allocationMs = 0;
  let copyMs = 0;
  let registrationMs = 0;
  let growthMs = 0;
  let allocations = [];
  const malloc = processor.api.malloc;
  processor.api.malloc = (bytes) => {
    const before = processor.exports.memory.buffer.byteLength;
    const start = performance.now();
    const ptr = malloc(bytes);
    const elapsed = performance.now() - start;
    const after = processor.exports.memory.buffer.byteLength;
    allocationMs += elapsed;
    if (after > before) growthMs += elapsed;
    allocations.push({ bytes, ms: elapsed, before, after });
    return ptr;
  };
  const instrumentCopy = () => {
    const heap = processor.heapF32;
    heap.set = function (data, offset) {
      const start = performance.now();
      Float32Array.prototype.set.call(this, data, offset);
      copyMs += performance.now() - start;
      maxCopyBytes = Math.max(maxCopyBytes, data.byteLength);
    };
  };
  const refresh = processor.refreshViews.bind(processor);
  processor.refreshViews = () => { refresh(); instrumentCopy(); };
  instrumentCopy();
  const register = processor.api.registerAsset;
  processor.api.registerAsset = (...args) => {
    const start = performance.now();
    const result = register(...args);
    registrationMs += performance.now() - start;
    return result;
  };
  processor.handleMessage({ type: 'asset-render-state', active: true });
  // 4 MiB sample reservation, 128 MiB soundscape reservation, 192 MiB hard admission ceiling.
  for (const mib of [4, 128, 192, 192]) {
    for (const target of [processor, reference.processor]) {
      target.handleMessage({ type: 'event', event: { eventKind: 12, targetId: 1, value: 1009 } });
      target.handleMessage({ type: 'event', event: { eventKind: 14, targetId: 1, value: 60, value2: 0.85, value3: 8 } });
    }
    for (let i = 0; i < 64; i += 1) renderBlock();
    allocationMs = copyMs = registrationMs = growthMs = maxCopyBytes = 0;
    activeRenderTimes = [];
    allocations = [];
    const bytes = mib * 1024 * 1024;
    const channels = [new Float32Array(bytes / 8).fill(0.125), new Float32Array(bytes / 8).fill(-0.125)];
    const heapBefore = processor.exports.memory.buffer.byteLength;
    const start = performance.now();
    processor.handleMessage({ type: 'register-asset', assetId: 9001, sampleRate: 48000, flags: 8, channels });
    const handlerMs = performance.now() - start;
    assert(!processor.assetAllocations.has(9001), 'Active handler published an incomplete asset');
    measuringActive = true;
    while (processor.pendingAssetCopies.size) renderBlock();
    measuringActive = false;
    assert(processor.assetAllocations.has(9001), 'Measured registration failed');
    assert(maxCopyBytes <= 128 * 1024, 'Copy exceeded per-block budget');
    assert(activeRenderTimes.length === bytes / (128 * 1024), 'Copy block count did not match fixed budget');
    const heapAfter = processor.exports.memory.buffer.byteLength;
    for (let i = 0; i < 64; i += 1) renderBlock();
    processor.handleMessage({ type: 'unregister-asset', assetId: 9001 });
    renderBlock();
    assert(processor.assetAllocationBytes === 0, 'Measured admission leaked allocation accounting');
    const sorted = [...renderTimes].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    console.log('ADMISSION', JSON.stringify({ bytes, handlerMs, allocationMs, growthMs, copyMs, registrationMs,
      heapBefore, heapAfter, allocations, maxCopyBytes, copyBlocks: activeRenderTimes.length,
      activeProcessMaxMs: Math.max(...activeRenderTimes),
      activeProcessP99Ms: [...activeRenderTimes].sort((a, b) => a - b)[Math.floor(activeRenderTimes.length * 0.99)],
      renderP99Ms: p99, quantumMs: 128 / 48,
      estimatedHeadroomMs: 128 / 48 - p99, peak, boundaryJump, maxOutputDifference, rss: process.memoryUsage().rss }));
  }
  assert(peak > 0.001, 'Admission measurement remained silent');
  assert(maxOutputDifference === 0, 'Live admission changed audible output relative to uninterrupted reference');
}

console.log('Kessho Product WASM smoke passed');
