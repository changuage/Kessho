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
const destroy = resolveExport(wasm, 'kessho_product_destroy');
const reset = resolveExport(wasm, 'kessho_product_reset');
const enqueueEvent = resolveExport(wasm, 'kessho_product_enqueue_event');
const render = resolveExport(wasm, 'kessho_product_render');
const copyTelemetry = resolveExport(wasm, 'kessho_product_copy_telemetry');
const refreshTelemetry = resolveExport(wasm, 'kessho_product_refresh_telemetry');
const setMeterDemand = resolveExport(wasm, 'kessho_product_set_meter_demand');
const setDebugVoiceSpawnDemand = resolveExport(wasm, 'kessho_product_set_debug_voice_spawn_demand');
const setStemsEnabled = resolveExport(wasm, 'kessho_product_set_stems_enabled');
const copySequencerUiState = resolveExport(wasm, 'kessho_product_copy_sequencer_ui_state');
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
const TELEMETRY_BYTES = 15448;
const TELEMETRY_SYNTH_ARP_CURRENT_STEPS_OFFSET = 1296;
const TELEMETRY_DEBUG_SOURCE_COUNT_OFFSET = 8828;
const TELEMETRY_DEBUG_SOURCE_OFFSET = 8832;
const TELEMETRY_DEBUG_SOURCE_BYTES = 32;
const TELEMETRY_DEBUG_VOICE_COUNT_OFFSET = 9088;
const TELEMETRY_DEBUG_VOICE_OFFSET = 9096;
const TELEMETRY_DEBUG_VOICE_BYTES = 48;
const TELEMETRY_TRANSPORT_BPM_OFFSET = 15112;
const TELEMETRY_TRANSPORT_PHRASE_SECONDS_OFFSET = 15124;
const TELEMETRY_TRANSPORT_PENDING_OFFSET = 15128;
const TELEMETRY_TRANSPORT_PENDING_APPLY_FRAME_OFFSET = 15152;
const TELEMETRY_TRANSPORT_REVISION_OFFSET = 15160;

const frames = 128;
const leftPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const rightPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const eventPtr = malloc(40);
const telemetryPtr = malloc(TELEMETRY_BYTES);
const sequencerUiStatePtr = malloc(105508);
const engine = create(48000, frames, 0);
assert(leftPtr && rightPtr && eventPtr && telemetryPtr && sequencerUiStatePtr && engine, 'WASM product smoke allocation failed');
assert(setMeterDemand(engine, 1) === 1, 'WASM product meter demand enable failed');
assert(setDebugVoiceSpawnDemand(engine, 1) === 1, 'WASM product debug voice-spawn demand enable failed');
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
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_SOURCE_COUNT_OFFSET, true) === 8, 'WASM product telemetry did not expose debug source count');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_SOURCE_OFFSET, true) === 1, 'WASM product telemetry did not expose Pad debug source id');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_SOURCE_OFFSET + 4, true) > 0, 'WASM product telemetry did not expose Pad debug preset id');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_SOURCE_OFFSET + 16, true) > 0, 'WASM product telemetry did not expose Pad debug source revision');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_SOURCE_OFFSET + 20, true) > 0, 'WASM product telemetry did not expose Pad debug source hash');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_SOURCE_OFFSET + 24, true) > 0, 'WASM product telemetry did not expose Pad debug compiled source hash');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_SOURCE_OFFSET + 28, true) > 0, 'WASM product telemetry did not expose Pad debug override hash');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_VOICE_COUNT_OFFSET, true) > 0, 'WASM product telemetry did not expose debug voice-spawn count');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_VOICE_OFFSET + 16, true) === 3, 'WASM product telemetry did not expose Lead debug voice source id');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_VOICE_OFFSET + 28, true) > 0, 'WASM product telemetry did not expose Lead debug voice source revision');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_VOICE_OFFSET + 32, true) > 0, 'WASM product telemetry did not expose Lead debug voice source hash');
assert(view.getUint32(telemetryPtr + TELEMETRY_DEBUG_VOICE_OFFSET + 36, true) > 0, 'WASM product telemetry did not expose Lead debug voice compiled hash');
assert(setDebugVoiceSpawnDemand(engine, 0) === 1, 'WASM product debug voice-spawn demand disable failed');
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
  const memory = new WebAssembly.Memory({ initial: 4 });
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
    free: (ptr) => hooks.free?.(ptr),
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
    kessho_product_set_meter_demand: () => 1,
    kessho_product_set_debug_voice_spawn_demand: (engine, enabled) => hooks.setDebugVoiceSpawnDemand?.(engine, enabled) ?? 1,
    kessho_product_drain_generated_sequencer_capture_events: () => 0,
    kessho_product_copy_granular_waveform: () => 1,
    kessho_product_copy_sequencer_ui_state: () => 1,
    kessho_product_register_asset_buffer: () => 1,
    kessho_product_unregister_asset_buffer: (...args) => hooks.unregisterAsset?.(...args) ?? 1,
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

let deferredReleaseAttempts = 0;
const deferredFreedPointers = [];
const debugVoiceSpawnDemandValues = [];
const deferredWorklet = instantiateWorklet({
  wasmBinaryOverride: new ArrayBuffer(8),
  webAssemblyOverride: fakeWebAssemblyWithTelemetryHash(expectedSchemaHash, {
    free: (ptr) => deferredFreedPointers.push(ptr),
    unregisterAsset: () => (++deferredReleaseAttempts === 1 ? -16 : 1),
    setDebugVoiceSpawnDemand: (_engine, enabled) => {
      debugVoiceSpawnDemandValues.push(enabled);
      return 1;
    },
  }),
});
await waitForMessage(deferredWorklet.messages, (message) => message.type === 'ready' || message.type === 'error');
assert(deferredWorklet.processor.ready, 'Deferred-release worklet fixture did not initialize');
assert(debugVoiceSpawnDemandValues.length === 0, 'debug voice-spawn demand should remain disabled by default');
deferredWorklet.processor.handleMessage({ type: 'debug-voice-spawn-demand', enabled: true });
assert(debugVoiceSpawnDemandValues.join(',') === '1', 'visible explicit debug voice-spawn demand was not enabled');
deferredWorklet.processor.handleMessage({ type: 'host-visibility', hidden: true });
assert(debugVoiceSpawnDemandValues.join(',') === '1,0', 'hidden host did not disable debug voice-spawn demand');
deferredWorklet.processor.handleMessage({ type: 'host-visibility', hidden: false });
assert(debugVoiceSpawnDemandValues.join(',') === '1,0,1', 'visible host did not restore explicit debug voice-spawn demand');
deferredWorklet.processor.handleMessage({ type: 'debug-voice-spawn-demand', enabled: false });
assert(debugVoiceSpawnDemandValues.join(',') === '1,0,1,0', 'explicit debug voice-spawn demand disable was not applied');
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

console.log('Kessho Product WASM smoke passed');
