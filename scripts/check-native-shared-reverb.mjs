import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageManifest = read('KesshoiOS/Package.swift');
const dspHeader = read('KesshoiOS/NativeDSP/include/KesshoDSP/KesshoDSP.h');
const nativeBridge = read('KesshoiOS/NativeDSP/kessho_reverb_unified.cpp');
const nativeWrapper = read('KesshoiOS/Kessho/Audio/ReverbNativeDSP.swift');
const nativeProcessor = read('KesshoiOS/Kessho/Audio/ReverbProcessor.swift');
const xcodeProject = read('KesshoiOS/Kessho.xcodeproj/project.pbxproj');

assert(
  packageManifest.includes('"kessho_reverb_unified.cpp"'),
  'KesshoDSP SwiftPM target must compile the shared C++ reverb bridge'
);

assert(
  dspHeader.includes('wasm/reverb/kessho_reverb.h'),
  'KesshoDSP umbrella header must expose the shared reverb C API'
);

assert(
  nativeBridge.includes('../../wasm/reverb/kessho_reverb.cpp'),
  'Native reverb bridge must include the web/WASM C++ reverb implementation'
);

for (const symbol of [
  'reverb_init',
  'reverb_get_input_ptr',
  'reverb_get_output_ptr',
  'reverb_process_block',
  'reverb_set_params',
  'reverb_set_shimmer_feedback',
]) {
  assert(
    nativeWrapper.includes(symbol),
    `ReverbNativeDSP must call ${symbol}`
  );
}

assert(
  nativeProcessor.includes('renderNativeDSPBlock') &&
    nativeProcessor.includes('ReverbNativeDSP.maxBlockSize') &&
    nativeProcessor.includes('nativeDSP.process') &&
    nativeProcessor.includes('ReverbNativeDSP.shared'),
  'ReverbProcessor must route custom native reverb through the shared C++ DSP block path'
);

assert(
  nativeWrapper.includes('static let shared = ReverbNativeDSP()') &&
    nativeWrapper.includes('private init()') &&
    nativeWrapper.includes('func reset(sampleRate: Float)'),
  'ReverbNativeDSP must be a singleton owner because the current C++ reverb API uses process-global state'
);

assert(
  xcodeProject.includes('ReverbNativeDSP.swift in Sources') &&
    xcodeProject.includes('kessho_reverb_unified.cpp in Sources'),
  'iOS Xcode target must compile the shared reverb wrapper and C++ bridge'
);

console.log('Native shared reverb checks passed');
