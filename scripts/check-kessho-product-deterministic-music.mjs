import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');

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
function snapshotConstNumber(name) {
  const match = snapshotEncoderSource.match(new RegExp(`const ${name} = ([0-9]+);`));
  assert(match, `snapshot encoder is missing ${name}`);
  return Number(match[1]);
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

assert(existsSync(wasmPath), 'Missing public/worklets/kessho_core.wasm; run npm run core:build:wasm first.');

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
const debugRenderEvents = resolveExport(wasm, 'kessho_product_debug_render_events');

const SNAPSHOT_SIZE = snapshotConstNumber('SNAPSHOT_BYTES');
const SOURCE_SIZE = snapshotConstNumber('SOURCE_BYTES');
const SOURCE_COUNT = 7;
const SOURCE_OFFSET = 56;
const SYNTH_OFFSET = SOURCE_OFFSET + SOURCE_SIZE * SOURCE_COUNT;
const LANE_SIZE = snapshotConstNumber('LANE_BYTES');
const LANE0_OFFSET = SYNTH_OFFSET + 4;
const SEQUENCER_EVENT_SIZE = 60;
const SCHEMA_HASH = generatedConstNumber('KESSHO_PRODUCT_SCHEMA_HASH');
const DEFAULT_SOURCE_PRESET_IDS = [1001, 1001, 2001, 2001, 3001, 4001, 5001];
const PAD_PARAM_COUNT = generatedConstNumber('KESSHO_PRODUCT_PAD_PARAM_COUNT');
const LEAD_PARAM_COUNT = generatedConstNumber('KESSHO_PRODUCT_LEAD_PARAM_COUNT');

const snapshotPtr = malloc(SNAPSHOT_SIZE);
const eventsPtr = malloc(SEQUENCER_EVENT_SIZE * 8);
const engine = create(48000, 128, 0);
assert(snapshotPtr && eventsPtr && engine, 'WASM deterministic timeline allocation failed');

const bytes = new Uint8Array(wasm.memory.buffer, snapshotPtr, SNAPSHOT_SIZE);
bytes.fill(0);
let view = new DataView(wasm.memory.buffer);
const setU32 = (offset, value) => view.setUint32(snapshotPtr + offset, value, true);
const setF32 = (offset, value) => view.setFloat32(snapshotPtr + offset, value, true);

setU32(0, 2);
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
  setF32(source + 16, 0.8);
  setF32(source + 28, 0.8);
  setF32(source + 32, 1.0);
  setF32(source + 56, 18000.0);
  setF32(source + 60, 1.0);
  if (index === 0 || index === 1) {
    setU32(source + 68, PAD_PARAM_COUNT);
  }
  if (index === 2 || index === 3) {
    setU32(source + 284, LEAD_PARAM_COUNT);
  }
}

setU32(SYNTH_OFFSET, 1);
setU32(LANE0_OFFSET, 1);
setU32(LANE0_OFFSET + 4, 1);
setU32(LANE0_OFFSET + 8, 4);
setU32(LANE0_OFFSET + 12, 4);
setU32(LANE0_OFFSET + 20, 16);
setF32(LANE0_OFFSET + 28, 1.0);
setU32(LANE0_OFFSET + 32, 1);
setF32(LANE0_OFFSET + 40, 60.0);
setF32(LANE0_OFFSET + 44, 0.8);
setF32(LANE0_OFFSET + 48, 0.1);
setF32(LANE0_OFFSET + 52, 0.35);
setF32(LANE0_OFFSET + 56, 0.45);
setF32(LANE0_OFFSET + 60, 0.75);
setU32(LANE0_OFFSET + 64, 120);
setU32(LANE0_OFFSET + 76, 0x0f);

assert(loadSnapshot(engine, snapshotPtr, SNAPSHOT_SIZE) === 1, 'WASM deterministic timeline snapshot load failed');
const count = debugRenderEvents(engine, eventsPtr, 8, 18001);
assert(count === 4, `WASM deterministic timeline event count mismatch: ${count}`);

view = new DataView(wasm.memory.buffer);
const expected = [
  { sample: 0, step: 0, midi: 60.0 },
  { sample: 6000, step: 1, midi: 62.0 },
  { sample: 12000, step: 2, midi: 64.0 },
  { sample: 18000, step: 3, midi: 65.0 },
];

for (let index = 0; index < expected.length; index += 1) {
  const event = eventsPtr + index * SEQUENCER_EVENT_SIZE;
  assert(view.getUint32(event, true) === expected[index].sample, `WASM timeline sample mismatch at event ${index}`);
  assert(view.getUint16(event + 4, true) === 1, `WASM timeline source mismatch at event ${index}`);
  assert(view.getUint16(event + 6, true) === 0, `WASM timeline lane mismatch at event ${index}`);
  assert(view.getUint16(event + 8, true) === expected[index].step, `WASM timeline step mismatch at event ${index}`);
  assert(Math.abs(view.getFloat32(event + 16, true) - expected[index].midi) < 0.001, `WASM timeline midi mismatch at event ${index}`);
  assert(Math.abs(view.getFloat32(event + 20, true) - 0.8) < 0.001, `WASM timeline velocity mismatch at event ${index}`);
  assert(Math.abs(view.getFloat32(event + 28, true) - 0.35) < 0.001, `WASM timeline morph mismatch at event ${index}`);
  assert(Math.abs(view.getFloat32(event + 32, true) - 0.45) < 0.001, `WASM timeline distance mismatch at event ${index}`);
  assert(Math.abs(view.getFloat32(event + 36, true) - 0.75) < 0.001, `WASM timeline expression mismatch at event ${index}`);
}

destroy(engine);
free(snapshotPtr);
free(eventsPtr);

console.log('Kessho Product deterministic music checks passed');
