import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = 'src/audio/coreProductAssetManifest.json';
const wasmPath = 'public/worklets/kessho_core.wasm';
const oggContinuedGranule = 0xffffffffffffffffn;
const float32Bytes = Float32Array.BYTES_PER_ELEMENT;

function escapeGithubAnnotation(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function reportFailure(error) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const message = error instanceof Error ? error.message : error;
    console.error(`::error title=Product asset manifest gate failed::${escapeGithubAnnotation(message)}`);
  }
}

process.on('uncaughtException', (error) => {
  reportFailure(error);
  console.error(error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  reportFailure(error);
  console.error(error);
  process.exit(1);
});

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function publicSamplePath(relativePath) {
  return resolve(root, 'public/samples', relativePath);
}

function parseOggVorbisInfo(relativePath) {
  const bytes = readFileSync(publicSamplePath(relativePath));
  const vorbisIdPacket = Buffer.from([1, 118, 111, 114, 98, 105, 115]);
  let offset = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let finalGranulePosition = 0n;

  while (offset < bytes.length) {
    assert(bytes.toString('ascii', offset, offset + 4) === 'OggS', `${relativePath} is not an Ogg stream at ${offset}`);
    const segmentCount = bytes[offset + 26];
    const headerBytes = 27 + segmentCount;
    assert(offset + headerBytes <= bytes.length, `${relativePath} has a truncated Ogg page header`);
    let payloadBytes = 0;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      payloadBytes += bytes[offset + 27 + segment];
    }
    assert(offset + headerBytes + payloadBytes <= bytes.length, `${relativePath} has a truncated Ogg page payload`);

    const granulePosition = bytes.readBigUInt64LE(offset + 6);
    if (granulePosition !== oggContinuedGranule) {
      finalGranulePosition = granulePosition;
    }

    if (sampleRate === 0 || channelCount === 0) {
      const payload = bytes.subarray(offset + headerBytes, offset + headerBytes + payloadBytes);
      const packetOffset = payload.indexOf(vorbisIdPacket);
      if (packetOffset >= 0) {
        channelCount = payload[packetOffset + 11];
        sampleRate = payload.readUInt32LE(packetOffset + 12);
      }
    }

    offset += headerBytes + payloadBytes;
  }

  assert(offset === bytes.length, `${relativePath} Ogg parse ended at ${offset}, expected ${bytes.length}`);
  assert(channelCount > 0 && channelCount <= 8, `${relativePath} has invalid Vorbis channel count ${channelCount}`);
  assert(sampleRate > 0, `${relativePath} has invalid Vorbis sample rate ${sampleRate}`);
  assert(finalGranulePosition > 0n, `${relativePath} has invalid Vorbis final granule ${finalGranulePosition}`);

  const frameCount = Number(finalGranulePosition);
  assert(Number.isSafeInteger(frameCount), `${relativePath} frame count exceeds JS safe integer range`);
  const productChannelCount = Math.min(channelCount, 2);
  return {
    relativePath,
    channelCount,
    productChannelCount,
    sampleRate,
    frameCount,
    compressedBytes: bytes.length,
    decodedBytes: frameCount * productChannelCount * float32Bytes,
  };
}

function maxDecodedBytes(infos) {
  return infos.reduce((max, info) => Math.max(max, info.decodedBytes), 0);
}

function sumDecodedBytes(infos) {
  return infos.reduce((total, info) => total + info.decodedBytes, 0);
}

function nearestPianoSampleIndex(midiNote) {
  return Math.max(1, Math.min(manifest.piano.sampleCount, Math.round(midiNote - manifest.piano.baseMidi + 1)));
}

function resolveWasmExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  assert(typeof fn === 'function', `missing WASM export ${name}`);
  return fn;
}

async function measureWasmHeapAfterAssetAllocations(assetInfos) {
  assert(existsSync(resolve(root, wasmPath)), 'missing public/worklets/kessho_core.wasm for asset heap gate');
  const module = await WebAssembly.compile(readFileSync(resolve(root, wasmPath)));
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
  const malloc = resolveWasmExport(wasm, 'malloc');
  const free = resolveWasmExport(wasm, 'free');
  const allocatedPointers = [];
  for (const info of assetInfos) {
    for (let channel = 0; channel < info.productChannelCount; channel += 1) {
      const pointer = malloc(info.frameCount * float32Bytes);
      assert(pointer, `WASM heap allocation failed for ${info.relativePath} channel ${channel}`);
      allocatedPointers.push(pointer);
    }
    const pointerArray = malloc(info.productChannelCount * Uint32Array.BYTES_PER_ELEMENT);
    assert(pointerArray, `WASM pointer-array allocation failed for ${info.relativePath}`);
    allocatedPointers.push(pointerArray);
  }
  const heapBytes = wasm.memory.buffer.byteLength;
  for (const pointer of allocatedPointers) {
    free(pointer);
  }
  return heapBytes;
}

function paddedIndex(index) {
  return String(index).padStart(2, '0');
}

function pianoPath(pattern, index) {
  return pattern.replace('{index}', paddedIndex(index));
}

const manifest = readJson(manifestPath);
const webAssets = read('src/audio/coreProductAssets.ts');
const swiftAssets = read('KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreAssets.swift');
const productAssetTests = read('cpp/KesshoCore/tests/ProductAssetTests.cpp');
const doc = read('docs/kessho-product-asset-manifest-decode-matrix.md');
const statusDoc = read('docs/kessho-product-core-migration-status.md');
const wasmBuildScript = read('scripts/build-kessho-core-wasm.mjs');

assert(manifest.schema === 'kessho-product-assets-v1', 'asset manifest schema mismatch');
assert(manifest.version === 1, 'asset manifest version mismatch');
assert(manifest.assetBasePath === 'samples', 'asset manifest base path mismatch');
assert(manifest.flags.loop === 1 && manifest.flags.piano === 2 && manifest.flags.soundscape === 4, 'asset flag ABI mismatch');

assert(manifest.piano.baseAssetId === 7200, 'piano asset base mismatch');
assert(manifest.piano.baseMidi === 21, 'piano base MIDI mismatch');
assert(manifest.piano.sampleCount === 64, 'piano sample count mismatch');
assert(manifest.piano.defaultMidi === 60, 'piano default MIDI mismatch');
assert(manifest.piano.preloadMidiNotes.length === 13, 'piano preload set must stay bounded');
assert(manifest.piano.preloadMidiNotes.includes(60), 'piano preload set must include default MIDI');
assert(new Set(manifest.piano.preloadMidiNotes).size === manifest.piano.preloadMidiNotes.length, 'piano preload set has duplicates');

const pianoRegularInfos = [];
const pianoShortInfos = [];
for (let index = 1; index <= manifest.piano.sampleCount; index += 1) {
  for (const variant of ['regularSamplePathPattern', 'shortSamplePathPattern']) {
    const path = pianoPath(manifest.piano[variant], index);
    assert(existsSync(publicSamplePath(path)), `missing piano sample: ${path}`);
    const info = parseOggVorbisInfo(path);
    if (variant === 'regularSamplePathPattern') {
      pianoRegularInfos.push(info);
    } else {
      pianoShortInfos.push(info);
    }
  }
}

const expectedSoundscapeKeys = ['ocean', 'water', 'birds', 'birds2', 'frogs', 'insects'];
assert(manifest.soundscapes.length === expectedSoundscapeKeys.length, 'soundscape manifest count mismatch');
const soundscapeIds = new Set();
const soundscapeKeys = new Set();
const soundscapeInfos = [];
for (const asset of manifest.soundscapes) {
  assert(expectedSoundscapeKeys.includes(asset.key), `unknown soundscape key ${asset.key}`);
  assert(!soundscapeKeys.has(asset.key), `duplicate soundscape key ${asset.key}`);
  soundscapeKeys.add(asset.key);
  assert(!soundscapeIds.has(asset.assetId), `duplicate soundscape asset ID ${asset.assetId}`);
  soundscapeIds.add(asset.assetId);
  assert(asset.assetId >= 7101 && asset.assetId <= 7106, `unexpected soundscape asset ID ${asset.assetId}`);
  assert(asset.loop === true, `soundscape ${asset.key} must be looped`);
  assert(asset.startupPreload === true, `soundscape ${asset.key} must be part of startup preload`);
  assert(existsSync(publicSamplePath(asset.path)), `missing soundscape sample: ${asset.path}`);
  const info = parseOggVorbisInfo(asset.path);
  assert(info.productChannelCount <= 2, `soundscape ${asset.key} must stay bounded to two Product Core channels`);
  soundscapeInfos.push({ ...info, key: asset.key });
}

const decodeRuntimes = new Set(manifest.decodeMatrix.map((entry) => entry.runtime));
for (const runtime of ['web', 'ios', 'macos']) {
  assert(decodeRuntimes.has(runtime), `decode matrix missing ${runtime}`);
}
for (const entry of manifest.decodeMatrix) {
  assert(entry.sourceFormats.includes('ogg/vorbis'), `${entry.runtime} decode matrix must name ogg/vorbis`);
  assert(entry.decoder && entry.bundlePath && entry.fallback && entry.releaseStatus, `${entry.runtime} decode matrix is incomplete`);
}
assert(
  manifest.decodeMatrix.some((entry) => entry.runtime === 'ios' && entry.releaseStatus === 'needs-device-format-proof'),
  'iOS decode matrix must keep device-format proof blocker explicit',
);
assert(
  manifest.decodeMatrix.some((entry) => entry.runtime === 'macos' && entry.releaseStatus === 'needs-release-bundle-proof'),
  'macOS decode matrix must keep release-bundle proof blocker explicit',
);

for (const [key, value] of Object.entries(manifest.memoryBudgets)) {
  assert(Number.isInteger(value) && value > 0, `memory budget ${key} must be a positive integer`);
}
assert(manifest.memoryBudgets.startupPreloadDecodedBytes <= 256 * 1024 * 1024, 'startup decoded budget exceeds 256 MiB');
assert(manifest.memoryBudgets.totalRegisteredDecodedBytes <= 384 * 1024 * 1024, 'registered decoded budget exceeds 384 MiB');
assert(manifest.memoryBudgets.webWorkletHeapBytes <= 384 * 1024 * 1024, 'web worklet heap budget exceeds 384 MiB');
assert(manifest.memoryBudgets.wasmBaseHeapBytes <= manifest.memoryBudgets.webWorkletHeapBytes, 'base WASM heap budget exceeds web worklet heap budget');
assert(
  wasmBuildScript.includes(`'-sMAXIMUM_MEMORY=${manifest.memoryBudgets.webWorkletHeapBytes}'`),
  'WASM maximum memory must match the Product Core web worklet heap budget',
);

const preloadPianoIndexes = new Set(manifest.piano.preloadMidiNotes.map(nearestPianoSampleIndex));
const preloadPianoInfos = pianoRegularInfos.filter((_info, index) => preloadPianoIndexes.has(index + 1));
const startupDecodedBytes = sumDecodedBytes(preloadPianoInfos) +
  sumDecodedBytes(soundscapeInfos.filter((info) => manifest.soundscapes.some((asset) => asset.path === info.relativePath && asset.startupPreload)));
const totalRegisteredDecodedBytes = sumDecodedBytes(pianoRegularInfos) + sumDecodedBytes(soundscapeInfos);
const maxPianoDecodedBytes = Math.max(maxDecodedBytes(pianoRegularInfos), maxDecodedBytes(pianoShortInfos));
const maxSoundscapeDecodedBytes = maxDecodedBytes(soundscapeInfos);
assert(startupDecodedBytes <= manifest.memoryBudgets.startupPreloadDecodedBytes, `startup decoded bytes ${startupDecodedBytes} exceed budget ${manifest.memoryBudgets.startupPreloadDecodedBytes}`);
assert(totalRegisteredDecodedBytes <= manifest.memoryBudgets.totalRegisteredDecodedBytes, `registered decoded bytes ${totalRegisteredDecodedBytes} exceed budget ${manifest.memoryBudgets.totalRegisteredDecodedBytes}`);
assert(maxPianoDecodedBytes <= manifest.memoryBudgets.singlePianoAssetDecodedBytes, `single piano decoded bytes ${maxPianoDecodedBytes} exceed budget ${manifest.memoryBudgets.singlePianoAssetDecodedBytes}`);
assert(maxSoundscapeDecodedBytes <= manifest.memoryBudgets.singleSoundscapeAssetDecodedBytes, `single soundscape decoded bytes ${maxSoundscapeDecodedBytes} exceed budget ${manifest.memoryBudgets.singleSoundscapeAssetDecodedBytes}`);
const webWorkletHeapBytes = await measureWasmHeapAfterAssetAllocations([...pianoRegularInfos, ...soundscapeInfos]);
assert(webWorkletHeapBytes >= manifest.memoryBudgets.wasmBaseHeapBytes, `web worklet heap ${webWorkletHeapBytes} is below base heap budget ${manifest.memoryBudgets.wasmBaseHeapBytes}`);
assert(webWorkletHeapBytes <= manifest.memoryBudgets.webWorkletHeapBytes, `web worklet heap ${webWorkletHeapBytes} exceeds budget ${manifest.memoryBudgets.webWorkletHeapBytes}`);

let startupCompressedBytes = 0;
for (const midiNote of manifest.piano.preloadMidiNotes) {
  const index = Math.max(1, Math.min(manifest.piano.sampleCount, Math.round(midiNote - manifest.piano.baseMidi + 1)));
  startupCompressedBytes += statSync(publicSamplePath(pianoPath(manifest.piano.regularSamplePathPattern, index))).size;
}
for (const asset of manifest.soundscapes) {
  startupCompressedBytes += statSync(publicSamplePath(asset.path)).size;
}
assert(startupCompressedBytes > 0, 'startup compressed asset budget fixture stayed empty');

for (const token of [
  "import coreProductAssetManifest from './coreProductAssetManifest.json';",
  'CORE_PRODUCT_ASSET_MANIFEST_VERSION',
  'CORE_PRODUCT_ASSET_BASE_PATH',
  'CORE_PRODUCT_MEMORY_BUDGETS',
  'getDecodedCoreProductAssetByteLength',
  'coreProductAssetManifest.piano.preloadMidiNotes',
  'coreProductAssetManifest.soundscapes.map',
  'getManifestPianoSamplePath',
  'decodeCoreProductAsset',
]) {
  assert(webAssets.includes(token), `web Product asset helper is missing ${token}`);
}

for (const asset of manifest.soundscapes) {
  const swiftIdName = asset.key === 'ocean' ? 'defaultSoundscape' : `${asset.key}Soundscape`;
  assert(swiftAssets.includes(`id: KesshoProductAssetIDs.${swiftIdName}`), `Swift manifest ID for ${asset.key} is missing`);
  assert(swiftAssets.includes(`relativePath: "${asset.path}"`), `Swift manifest path for ${asset.key} is missing`);
}
for (const token of [
  'KESSHO_PRODUCT_ASSET_ROOT',
  'KESSHO_PRODUCT_ASSET_DOWNLOAD_ROOT',
  'downloadedAssetSearchRoots',
  'applicationSupportDirectory',
  'cachesDirectory',
  'AVAudioFile(forReading:',
  'preloadStartupAssets',
]) {
  assert(swiftAssets.includes(token), `native asset fallback/decode path is missing ${token}`);
}

for (const token of [
  'missing piano asset should not fake host playback',
  'missing soundscape asset should not fake host playback',
  'soundscape loop seam was not crossfaded toward loop start',
  'soundscape layer did not start at the deterministic randomized asset offset',
  'birds soundscape policy should render wider C++-owned stereo spread than water',
]) {
  assert(productAssetTests.includes(token), `Product asset tests are missing ${token}`);
}

for (const token of [
  'Kessho Product Asset Manifest And Decode Matrix',
  'Manifest V1',
  'Nature Scene Policy',
  'Decode Matrix',
  'Memory Budgets',
  'Measured Decoded Bytes',
  'WASM heap after allocating every Product Core registered asset',
  'needs-device-format-proof',
  'needs-release-bundle-proof',
]) {
  assert(doc.includes(token), `asset manifest decode matrix doc is missing ${token}`);
}
for (const token of [
  'versioned Product Core asset manifest',
  'decode matrix',
  'asset memory budgets',
  'hard decoded-byte accounting',
]) {
  assert(statusDoc.includes(token), `migration status doc is missing asset manifest token ${token}`);
}

console.log(
  `Kessho Product asset manifest checks passed (${startupCompressedBytes} compressed startup bytes, ` +
    `${startupDecodedBytes} decoded startup bytes, ${totalRegisteredDecodedBytes} registered decoded bytes, ` +
    `${webWorkletHeapBytes} WASM heap bytes)`,
);
