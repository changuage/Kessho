import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const wasmPath = resolve(root, 'build/kessho-core/parity/kessho_core_parity.wasm');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function resolveExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }
  return fn;
}

function requireTokens(path, tokens) {
  const source = read(path);
  for (const token of tokens) {
    assert(source.includes(token), `${path} must include deterministic music token: ${token}`);
  }
}

const generatedSchemaSource = read('src/audio/generated/kesshoProductSchema.ts');
function generatedConstNumber(name) {
  const match = generatedSchemaSource.match(new RegExp(`export const ${name} = ([0-9.]+) as const`));
  assert(match, `generated schema is missing ${name}`);
  return Number(match[1]);
}

const snapshotEncoderSource = read('src/audio/coreProductSnapshotEncoder.ts');
const snapshotConstCache = new Map();
function snapshotConstNumber(name) {
  if (snapshotConstCache.has(name)) return snapshotConstCache.get(name);
  const match = snapshotEncoderSource.match(new RegExp(`const ${name} = ([\\s\\S]*?);`));
  assert(match, `snapshot encoder is missing ${name}`);
  let expression = match[1].replaceAll('Uint32Array.BYTES_PER_ELEMENT', '4');
  expression = expression.replace(/\b[A-Z][A-Z0-9_]*\b/g, (identifier) => {
    if (identifier.startsWith('KESSHO_PRODUCT_')) {
      return String(generatedConstNumber(identifier));
    }
    if (identifier === name) {
      throw new Error(`snapshot encoder constant ${name} is self-referential`);
    }
    return String(snapshotConstNumber(identifier));
  });
  assert(
    /^[0-9+\-*/().\s]+$/.test(expression),
    `snapshot encoder constant ${name} contains unsupported syntax: ${match[1].trim()}`,
  );
  const value = Function(`"use strict"; return (${expression});`)();
  assert(Number.isFinite(value), `snapshot encoder constant ${name} did not resolve to a finite number`);
  snapshotConstCache.set(name, value);
  return value;
}

requireTokens('cpp/KesshoCore/tests/ProductDeterminismTests.cpp', [
  'requireRngCallOrderIsolation',
  'requireRngTransactionTrace',
  'requireVoicingDepth',
  'requirePhraseMutationWrites',
  'requireJourneyMorphOwnership',
]);
requireTokens('docs/kessho-product-deterministic-music-closure.md', [
  'RNG call-order contract',
  'RNG transaction trace',
  'Voicing depth',
  'Phrase mutation writes',
  'Journey morph ownership',
  'C++/WASM event timeline',
]);

execFileSync(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', 'ProductDeterminismTests'], {
  cwd: root,
  stdio: 'inherit',
});

execFileSync(process.execPath, ['scripts/build-kessho-core-wasm.mjs', '--parity'], {
  cwd: root,
  stdio: 'inherit',
});
assert(existsSync(wasmPath), 'Parity WASM build did not produce kessho_core_parity.wasm.');

const module = await WebAssembly.compile(readFileSync(wasmPath));
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
const malloc = resolveExport(wasm, 'malloc');
const free = resolveExport(wasm, 'free');
const create = resolveExport(wasm, 'kessho_product_create');
const destroy = resolveExport(wasm, 'kessho_product_destroy');
const loadSnapshot = resolveExport(wasm, 'kessho_product_load_snapshot_v2');
const copyTelemetry = resolveExport(wasm, 'kessho_product_copy_telemetry');
const debugRenderEvents = resolveExport(wasm, 'kessho_product_debug_render_events');

const SNAPSHOT_SIZE = snapshotConstNumber('SNAPSHOT_BYTES');
const SOURCE_SIZE = snapshotConstNumber('SOURCE_BYTES');
const SOURCE_COUNT = 8;
const HEADER_BYTES = 8;
const TRANSPORT_BYTES = 24;
const HARMONY_BYTES = snapshotConstNumber('HARMONY_BYTES');
const SOURCE_OFFSET = HEADER_BYTES + TRANSPORT_BYTES + HARMONY_BYTES;
const SYNTH_OFFSET = SOURCE_OFFSET + SOURCE_SIZE * SOURCE_COUNT;
const LANE_SIZE = snapshotConstNumber('LANE_BYTES');
const LANE0_OFFSET = SYNTH_OFFSET + 4;
const SEQUENCER_EVENT_SIZE = 60;
const SCHEMA_VERSION = generatedConstNumber('KESSHO_PRODUCT_SCHEMA_VERSION');
const SCHEMA_HASH = generatedConstNumber('KESSHO_PRODUCT_SCHEMA_HASH');
const PAD_PARAM_COUNT = generatedConstNumber('KESSHO_PRODUCT_PAD_PARAM_COUNT');
const LEAD_PARAM_COUNT = generatedConstNumber('KESSHO_PRODUCT_LEAD_PARAM_COUNT');
const DRUM_PARAM_COUNT = generatedConstNumber('KESSHO_PRODUCT_DRUM_PARAM_COUNT');
const DRUM_VOICE_COUNT = generatedConstNumber('KESSHO_PRODUCT_DRUM_VOICE_COUNT');
const DEFAULT_SOURCE_PRESET_IDS = [1001, 1001, 2001, 2001, 3001, 4001, 5001, 4001];
assert(DEFAULT_SOURCE_PRESET_IDS.length === SOURCE_COUNT, 'deterministic source defaults must cover every snapshot source');
const DEFAULT_DRUM_VOICE_PRESET_IDS = [3101, 3201, 3301, 3401, 3501, 3601, 3701];
const DEFAULT_SOURCE_ENVELOPE = [0.005, 0.65, 0.72, 0.5, 1.4];
const SOURCE_PRESET_A_OFFSET = 12;
const SOURCE_PRESET_B_OFFSET = 16;
const SOURCE_LEVEL_OFFSET = 32;
const SOURCE_EXPRESSION_OFFSET = 44;
const SOURCE_DRY_GAIN_OFFSET = 48;
const SOURCE_POST_LPF_HZ_OFFSET = 76;
const SOURCE_STEREO_WIDTH_OFFSET = 80;
const SOURCE_COMMON_BYTES = 104;
const SOURCE_SAMPLE_CONFIG_BYTES = 40;
const sparseGeneratedBlockBytes = (paramCount) => 4 + paramCount * 4 + 4 + paramCount * 4 + paramCount * 4;
const SOURCE_DRUM_VOICE_PRESET_A_OFFSET =
  SOURCE_COMMON_BYTES +
  sparseGeneratedBlockBytes(PAD_PARAM_COUNT) +
  sparseGeneratedBlockBytes(LEAD_PARAM_COUNT) +
  sparseGeneratedBlockBytes(DRUM_PARAM_COUNT);
const SOURCE_DRUM_VOICE_PRESET_B_OFFSET = SOURCE_DRUM_VOICE_PRESET_A_OFFSET + DRUM_VOICE_COUNT * 4;
const SOURCE_DRUM_VOICE_MORPH_OFFSET = SOURCE_DRUM_VOICE_PRESET_B_OFFSET + DRUM_VOICE_COUNT * 4;
const SOURCE_ENVELOPE_OFFSET = SOURCE_DRUM_VOICE_MORPH_OFFSET + DRUM_VOICE_COUNT * 4;
assert(
  SOURCE_ENVELOPE_OFFSET + 5 * 4 + SOURCE_SAMPLE_CONFIG_BYTES === SOURCE_SIZE,
  `deterministic source offsets are stale: ${SOURCE_ENVELOPE_OFFSET + 5 * 4 + SOURCE_SAMPLE_CONFIG_BYTES} !== ${SOURCE_SIZE}`,
);
const ASSET_REF_COUNT = 32;
const SOUNDSCAPE_TEXTURE_PARAM_COUNT = generatedConstNumber('KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_COUNT');
const SOUNDSCAPE_MODULE_PARAM_COUNT = generatedConstNumber('KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT');
const SOUNDSCAPE_BYTES = 4 + SOUNDSCAPE_TEXTURE_PARAM_COUNT * 4 + 4 + SOUNDSCAPE_MODULE_PARAM_COUNT * 4;
const ASSET_REF_BYTES = ASSET_REF_COUNT * 4 * 2;
const ARRANGEMENT_BYTES = snapshotConstNumber('ARRANGEMENT_BYTES');
const SONIC_RUNTIME_BYTES = 11 * 16;
const EVOLUTION_AMOUNT_OFFSET = SNAPSHOT_SIZE - SONIC_RUNTIME_BYTES - ARRANGEMENT_BYTES - SOUNDSCAPE_BYTES - ASSET_REF_BYTES - 8;
const EVOLUTION_STATE_OFFSET = EVOLUTION_AMOUNT_OFFSET + 4;
const RNG_SEED_OFFSET = EVOLUTION_AMOUNT_OFFSET - 8;
const RNG_STATE_OFFSET = EVOLUTION_AMOUNT_OFFSET - 4;
const RNG_SEED = 31;
const EVOLUTION_AMOUNT = 0.8;
const EVOLUTION_STATE = 4567;
const SAMPLE_RATE = 48000;
const DETERMINISTIC_BPM = 120;
const BEATS_PER_BAR = 4;
const BARS_PER_PHRASE = 4;
const LANE_SEED = 120;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashU32(value) {
  let result = value >>> 0;
  result = (result ^ (result >>> 16)) >>> 0;
  result = Math.imul(result, 0x7feb352d) >>> 0;
  result = (result ^ (result >>> 15)) >>> 0;
  result = Math.imul(result, 0x846ca68b) >>> 0;
  result = (result ^ (result >>> 16)) >>> 0;
  return result >>> 0;
}

function hashUnit(value) {
  return (hashU32(value) & 0x00ffffff) / 0x01000000;
}

function expectedEvolvedLaneValue(stepId, sample, component, base, depth, minValue, maxValue) {
  const amount = clamp(EVOLUTION_AMOUNT, 0, 1) * clamp(depth, 0, 1);
  if (amount <= 0.000001) {
    return clamp(base, minValue, maxValue);
  }
  const samplesPerBeat = SAMPLE_RATE * 60 / DETERMINISTIC_BPM;
  const bar = Math.trunc((sample / samplesPerBeat) / BEATS_PER_BAR);
  const phrase = Math.trunc(bar / BARS_PER_PHRASE);
  const seed = (
    LANE_SEED ^
    RNG_SEED ^
    EVOLUTION_STATE ^
    Math.imul(component, 374761393) ^
    Math.imul(stepId, 2246822519) ^
    Math.imul(bar, 3266489917) ^
    Math.imul(phrase, 2654435761)
  ) >>> 0;
  const randomDelta = hashUnit(seed) * 2 - 1;
  return clamp(base + amount * randomDelta, minValue, maxValue);
}

const snapshotPtr = malloc(SNAPSHOT_SIZE);
const eventsPtr = malloc(SEQUENCER_EVENT_SIZE * 8);
const telemetryPtr = malloc(14912);
const engine = create(48000, 128, 0);
assert(snapshotPtr && eventsPtr && telemetryPtr && engine, 'WASM deterministic timeline allocation failed');

const bytes = new Uint8Array(wasm.memory.buffer, snapshotPtr, SNAPSHOT_SIZE);
bytes.fill(0);
let view = new DataView(wasm.memory.buffer);
const setU32 = (offset, value) => view.setUint32(snapshotPtr + offset, value, true);
const setF32 = (offset, value) => view.setFloat32(snapshotPtr + offset, value, true);

setU32(0, SCHEMA_VERSION);
setU32(4, SCHEMA_HASH);
setU32(8, 1);
setF32(12, 120.0);
setU32(16, 4);
setU32(20, 4);
setF32(32, 60.0);
setU32(36, 1);
setF32(40, 0.0);

for (let index = 0; index < SOURCE_COUNT; index += 1) {
  const source = SOURCE_OFFSET + index * SOURCE_SIZE;
  setU32(source, 1);
  setU32(source + 4, index + 1);
  setU32(source + 8, DEFAULT_SOURCE_PRESET_IDS[index]);
  if (index === 0 || index === 1) {
    setU32(source + SOURCE_PRESET_A_OFFSET, DEFAULT_SOURCE_PRESET_IDS[index]);
    setU32(source + SOURCE_PRESET_B_OFFSET, DEFAULT_SOURCE_PRESET_IDS[index]);
  }
  if (index === 2 || index === 3) {
    setU32(source + SOURCE_PRESET_A_OFFSET, DEFAULT_SOURCE_PRESET_IDS[index]);
    setU32(source + SOURCE_PRESET_B_OFFSET, DEFAULT_SOURCE_PRESET_IDS[index]);
  }
  if (index === 4) {
    for (let voiceIndex = 0; voiceIndex < DRUM_VOICE_COUNT; voiceIndex += 1) {
      setU32(source + SOURCE_DRUM_VOICE_PRESET_A_OFFSET + voiceIndex * 4, DEFAULT_DRUM_VOICE_PRESET_IDS[voiceIndex]);
      setU32(source + SOURCE_DRUM_VOICE_PRESET_B_OFFSET + voiceIndex * 4, DEFAULT_DRUM_VOICE_PRESET_IDS[voiceIndex]);
    }
  }
  setF32(source + SOURCE_LEVEL_OFFSET, 0.8);
  setF32(source + SOURCE_EXPRESSION_OFFSET, 1.0);
  setF32(source + SOURCE_DRY_GAIN_OFFSET, 0.8);
  setF32(source + SOURCE_POST_LPF_HZ_OFFSET, 18000.0);
  setF32(source + SOURCE_STEREO_WIDTH_OFFSET, 1.0);
  for (let envelopeIndex = 0; envelopeIndex < DEFAULT_SOURCE_ENVELOPE.length; envelopeIndex += 1) {
    setF32(source + SOURCE_ENVELOPE_OFFSET + envelopeIndex * 4, DEFAULT_SOURCE_ENVELOPE[envelopeIndex]);
  }
}

setU32(SYNTH_OFFSET, 1);
setU32(LANE0_OFFSET, 1);
setU32(LANE0_OFFSET + 8, 1);
setU32(LANE0_OFFSET + 12, 4);
setU32(LANE0_OFFSET + 16, 4);
setU32(LANE0_OFFSET + 24, 16);
setF32(LANE0_OFFSET + 32, 1.0);
setU32(LANE0_OFFSET + 36, 1);
setF32(LANE0_OFFSET + 44, 60.0);
setF32(LANE0_OFFSET + 48, 0.8);
setF32(LANE0_OFFSET + 52, 0.1);
setF32(LANE0_OFFSET + 56, 0.35);
setF32(LANE0_OFFSET + 60, 0.45);
setF32(LANE0_OFFSET + 64, 0.75);
setU32(LANE0_OFFSET + 68, LANE_SEED);
setU32(LANE0_OFFSET + 80, 0x0f);
setU32(RNG_SEED_OFFSET, RNG_SEED);
setU32(RNG_STATE_OFFSET, RNG_SEED);
setF32(EVOLUTION_AMOUNT_OFFSET, EVOLUTION_AMOUNT);
setU32(EVOLUTION_STATE_OFFSET, EVOLUTION_STATE);

const loadResult = loadSnapshot(engine, snapshotPtr, SNAPSHOT_SIZE);
copyTelemetry(engine, telemetryPtr);
view = new DataView(wasm.memory.buffer);
const lastErrorCode = view.getInt32(telemetryPtr + 108, true);
assert(loadResult === 1, `WASM deterministic timeline snapshot load failed: result ${loadResult}, last_error_code ${lastErrorCode}`);
const count = debugRenderEvents(engine, eventsPtr, 8, 18001);
assert(count === 4, `WASM deterministic timeline event count mismatch: ${count}`);

view = new DataView(wasm.memory.buffer);
const expected = [
  { sample: 0, step: 0, midi: 60.0 },
  { sample: 6000, step: 1, midi: 62.0 },
  { sample: 12000, step: 2, midi: 64.0 },
  { sample: 18000, step: 3, midi: 65.0 },
];
for (const event of expected) {
  event.velocity = expectedEvolvedLaneValue(event.step, event.sample, 2, 0.8, 0.25, 0, 1);
  event.morph = expectedEvolvedLaneValue(event.step, event.sample, 3, 0.35, 0.35, 0, 1);
  event.distance = expectedEvolvedLaneValue(event.step, event.sample, 4, 0.45, 0.35, 0, 1);
  event.expression = expectedEvolvedLaneValue(event.step, event.sample, 5, 0.75, 0.25, 0, 1);
}

for (let index = 0; index < expected.length; index += 1) {
  const event = eventsPtr + index * SEQUENCER_EVENT_SIZE;
  assert(view.getUint32(event, true) === expected[index].sample, `WASM timeline sample mismatch at event ${index}`);
  assert(view.getUint16(event + 4, true) === 1, `WASM timeline source mismatch at event ${index}`);
  assert(view.getUint16(event + 6, true) === 0, `WASM timeline lane mismatch at event ${index}`);
  assert(view.getUint16(event + 8, true) === expected[index].step, `WASM timeline step mismatch at event ${index}`);
  assert(Math.abs(view.getFloat32(event + 16, true) - expected[index].midi) < 0.001, `WASM timeline midi mismatch at event ${index}`);
  const actualVelocity = view.getFloat32(event + 20, true);
  const actualMorph = view.getFloat32(event + 28, true);
  const actualDistance = view.getFloat32(event + 32, true);
  const actualExpression = view.getFloat32(event + 36, true);
  assert(Math.abs(actualVelocity - expected[index].velocity) < 0.001, `WASM timeline velocity mismatch at event ${index}: ${actualVelocity} !== ${expected[index].velocity}`);
  assert(Math.abs(actualMorph - expected[index].morph) < 0.001, `WASM timeline morph mismatch at event ${index}: ${actualMorph} !== ${expected[index].morph}`);
  assert(Math.abs(actualDistance - expected[index].distance) < 0.001, `WASM timeline distance mismatch at event ${index}: ${actualDistance} !== ${expected[index].distance}`);
  assert(Math.abs(actualExpression - expected[index].expression) < 0.001, `WASM timeline expression mismatch at event ${index}: ${actualExpression} !== ${expected[index].expression}`);
}

destroy(engine);
free(snapshotPtr);
free(eventsPtr);
free(telemetryPtr);

console.log('Kessho Product deterministic music checks passed');
