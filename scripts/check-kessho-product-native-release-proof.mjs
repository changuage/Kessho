import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = 'docs/reports/kessho-product-native-release-proof-latest.json';

const nativeBlockers = [
  {
    id: 'needs-device-cpu-proof',
    area: 'device-cpu',
    requiredProof: 'physical iOS and signed macOS CPU captures with render p95/p99 and underrun counters',
    status: 'deferred',
  },
  {
    id: 'needs-battery-thermal-proof',
    area: 'battery-thermal',
    requiredProof: 'battery drain and thermal-state captures during sustained foreground playback',
    status: 'deferred',
  },
  {
    id: 'needs-screen-off-background-proof',
    area: 'screen-off-background',
    requiredProof: 'screen-off, lock-screen, background, and foreground-resume playback behavior',
    status: 'deferred',
  },
  {
    id: 'needs-route-change-proof',
    area: 'route-changes',
    requiredProof: 'speaker, wired headphone, Bluetooth, AirPlay if supported, sample-rate, and buffer-size route transitions',
    status: 'deferred',
  },
  {
    id: 'needs-interruption-proof',
    area: 'interruptions',
    requiredProof: 'call, Siri, alarm, ducking, and media-services-reset interruption/resume behavior',
    status: 'deferred',
  },
  {
    id: 'needs-release-bundle-decode-proof',
    area: 'release-bundle-decode',
    requiredProof: 'TestFlight/App Store-style iOS and signed macOS bundle asset decode/register proof',
    status: 'deferred',
  },
  {
    id: 'needs-native-ogg-coverage-proof',
    area: 'ogg-coverage',
    requiredProof: 'every committed piano and soundscape Ogg/Vorbis asset decodes through native AVAudioFile on target OS/device combinations',
    status: 'deferred',
  },
  {
    id: 'needs-native-avsource-hardware-timing-proof',
    area: 'avaudiosourcenode-timing',
    requiredProof: 'AVAudioSourceNode master callback timing under live hardware IO',
    status: 'deferred',
  },
  {
    id: 'needs-live-stem-timing-proof',
    area: 'stem-timing',
    requiredProof: 'master and stem taps remain sample-aligned under live-device playback and recording',
    status: 'deferred',
  },
  {
    id: 'needs-native-asset-eviction-memory-pressure-proof',
    area: 'eviction-memory-pressure',
    requiredProof: 'decoded asset cache behavior under memory pressure, warnings, eviction, and re-registration',
    status: 'deferred',
  },
];

const nativeDeferral = {
  id: 'native-default-deferred',
  owner: 'native-release-owner',
  reason: 'live-device CPU, battery, thermal, route, interruption, background, release-bundle decode, Ogg, AVAudioSourceNode timing, stem timing, and memory-pressure proof is absent',
  signOffStatus: 'signed-for-deferral-only',
  targetFollowUp: 'native-release-device-proof',
};

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function writeJsonReport(path, payload) {
  const absolute = resolve(root, path);
  mkdirSync(resolve(absolute, '..'), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`);
}

function sourceSlice(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0, `missing start token ${startToken}`);
  assert(end > start, `missing end token ${endToken}`);
  return source.slice(start, end);
}

const packageSwift = read('KesshoNativeSwift/Package.swift');
const nativeReleaseSmoke = read('KesshoNativeSwift/KesshoProductNativeReleaseSmoke/main.swift');
const productAudioEngine = read('KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreAudioEngine.swift');
const assetProvider = read('KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreAssets.swift');
const audioSession = read('KesshoNativeSwift/Kessho/Services/AudioSessionManager.swift');
const appState = read('KesshoNativeSwift/Kessho/State/AppState.swift');
const recorder = read('KesshoNativeSwift/Kessho/Audio/AudioRecorder.swift');
const doc = read('docs/kessho-product-native-release-proof.md');
const statusDoc = read('docs/kessho-product-core-migration-status.md');

assert(
  packageSwift.includes('KesshoProductNativeReleaseSmoke') &&
    packageSwift.includes('path: "KesshoProductNativeReleaseSmoke"'),
  'SwiftPM must expose the native release smoke executable',
);

for (const token of [
  'expectedHash: UInt64 = 2_228_222_591_653_782_738',
  'expectedPeak: Float = 0.008_095_407',
  'expectedRms: Float = 0.003_726_907_5',
  'expectedStemPeak: Float = 0.009_092_237',
  'renderScenario()',
  'KesshoProductCoreSnapshotEncoder.encode(.defaultState, running: true)',
  'core.manualNoteOn(sourceId: sourcePad1',
  'core.getStem(stemId: stemPad1',
  'first.firstAudibleMasterBlock == first.firstAudibleStemBlock',
]) {
  assert(nativeReleaseSmoke.includes(token), `native release smoke is missing ${token}`);
}

const masterCallback = sourceSlice(productAudioEngine, 'sourceNode = AVAudioSourceNode(format: format) {', 'engine.attach(sourceNode)');
const stemCallback = sourceSlice(
  productAudioEngine,
  'private static func makeStemSourceNode(',
  'private static func recordingStemMap()',
);

for (const [label, callback] of [
  ['master AVAudioSourceNode callback', masterCallback],
  ['stem AVAudioSourceNode callback', stemCallback],
]) {
  for (const token of [
    'AVAudioFile',
    'FileManager',
    'URLSession',
    'NotificationCenter',
    'DispatchQueue',
    'Data(',
    'JSON',
    '.lock(',
    'NSLock',
    'allocate(capacity:',
  ]) {
    assert(!callback.includes(token), `${label} contains forbidden render-callback token ${token}`);
  }
}

for (const token of [
  'frameCount <= localMaxBlockSize',
  'localProductCore.render(',
  'kAudioUnitErr_TooManyFramesToProcess',
  'kAudioUnitErr_CannotDoInCurrentContext',
  'outputBuffers[0].mData?.assumingMemoryBound(to: Float.self)',
]) {
  assert(masterCallback.includes(token), `master AVAudioSourceNode callback is missing ${token}`);
}

for (const token of [
  'frameCount <= maxBlockSize',
  'productCore.getStem(',
  'state.left[frame] += state.scratchLeft[frame]',
  'kAudioUnitErr_TooManyFramesToProcess',
  'kAudioUnitErr_CannotDoInCurrentContext',
]) {
  assert(stemCallback.includes(token), `stem AVAudioSourceNode callback is missing ${token}`);
}

for (const token of [
  'StemRenderState',
  'recordingStemMap()',
  'stemMixer.outputVolume = 0',
  'configureRecorder(_ recorder: AudioRecorder)',
]) {
  assert(productAudioEngine.includes(token), `native Product Core audio engine is missing ${token}`);
}

for (const token of [
  'KESSHO_PRODUCT_ASSET_ROOT',
  'KESSHO_PRODUCT_ASSET_DOWNLOAD_ROOT',
  'downloadedAssetSearchRoots',
  'applicationSupportDirectory',
  'cachesDirectory',
  'developmentSearchRoots',
  'AVAudioFile(forReading:',
  'preloadStartupAssets',
]) {
  assert(assetProvider.includes(token), `native asset provider is missing ${token}`);
}

for (const token of [
  'AVAudioSession.interruptionNotification',
  'AVAudioSession.routeChangeNotification',
  'handleInterruption',
  'handleRouteChange',
  'reconfigureForPlayback',
  'preferredIOBufferDuration',
]) {
  assert(audioSession.includes(token), `audio session manager is missing ${token}`);
}

for (const token of [
  'case "legacy-swift", "legacy", "swift":',
  'case "core-product", nil, "":',
  'using core-product',
  'private var productCoreAudioEngine: KesshoProductCoreAudioEngine?',
  'created.configureRecorder(audioRecorder)',
  'productEngine.preloadStartupAssets()',
  'productEngine.start(state: state)',
  'productEngine.loadSnapshot(state: newState, running: isPlaying)',
]) {
  assert(appState.includes(token), `native AppState runtime path is missing ${token}`);
}
assert(
  !appState.includes('? .coreProduct : .legacySwift'),
  'native default must not be selected by a legacy-preferred ternary',
);

for (const token of [
  'func configureProductCore(',
  'masterNode.installTap',
  'node.installTap',
  'node.removeTap',
]) {
  assert(recorder.includes(token), `AudioRecorder Product Core stem path is missing ${token}`);
}

for (const token of [
  'Kessho Product Native Release Proof',
  'Locally Proven',
  'Hardware/Release Blockers',
  'native-default-deferred',
  'Native Default Deferral Mapping',
  'owner: native-release-owner',
  'reason: live-device CPU, battery, thermal, route, interruption, background, release-bundle decode, Ogg, AVAudioSourceNode timing, stem timing, and memory-pressure proof is absent',
  'signOffStatus: signed-for-deferral-only',
  'targetFollowUp: native-release-device-proof',
]) {
  assert(doc.includes(token), `native release proof doc is missing ${token}`);
}
for (const blocker of nativeBlockers) {
  assert(doc.includes(blocker.id), `native release proof doc is missing blocker ${blocker.id}`);
}
for (const token of [
  'needs-device-cpu-battery-thermal-proof',
  'needs-route-change-session-proof',
]) {
  assert(doc.includes(token), `native release proof doc is missing compatibility blocker ${token}`);
}
for (const token of [
  'native release proof',
  'native-default-deferred',
  'device CPU, battery/thermal',
  'screen-off/background',
  'memory-pressure/eviction',
]) {
  assert(statusDoc.includes(token), `migration status doc is missing native release token ${token}`);
}

writeJsonReport(reportPath, {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'deferred',
  nativeDecision: nativeDeferral.id,
  reportPath,
  localProof: {
    smokeExecutable: 'KesshoProductNativeReleaseSmoke',
    command: 'npm run core:product:native-release-smoke',
    scope: [
      'offline Swift bridge render golden',
      'non-silent finite render',
      'first audible master/stem block alignment',
      'static AVAudioSourceNode callback boundary audit',
      'native asset provider search-root coverage',
    ],
  },
  deferral: nativeDeferral,
  blockers: nativeBlockers,
  releaseGatePolicy: 'core:product:native-release may pass with deferred blockers; native default release approval remains blocked until signed-off live-device and release-bundle evidence exists',
});

console.log(`Kessho Product native release proof checks passed (report: ${reportPath})`);
