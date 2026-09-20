import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const nativeTestPath = 'cpp/KesshoCore/tests/ProductNativeRenderPathTests.cpp';
const nativeRuntimeHeaderPath = 'cpp/KesshoCore/src/product/native/KesshoNativeProductRuntime.h';
const appleRendererHeaderPath = 'cpp/KesshoCore/include/KesshoCore/KesshoAppleProductAudioRenderer.h';
const appleEngineHeaderPath = 'cpp/KesshoCore/include/KesshoCore/KesshoAppleProductAudioEngine.h';
const nativeRuntimeImplPath = 'cpp/KesshoCore/src/product/native/KesshoNativeProductRuntime.cpp';
const appleRendererPath = 'cpp/KesshoCore/src/product/native/apple/KesshoAppleProductAudioRenderer.mm';
const appleEnginePath = 'cpp/KesshoCore/src/product/native/apple/KesshoAppleProductAudioEngine.mm';
const nativeTest = read(nativeTestPath);
const nativeRuntimeHeader = read(nativeRuntimeHeaderPath);
const appleRendererHeader = read(appleRendererHeaderPath);
const appleEngineHeader = read(appleEngineHeaderPath);
const nativeRuntimeImpl = read(nativeRuntimeImplPath);
const appleRenderer = read(appleRendererPath);
const appleEngine = read(appleEnginePath);
const capabilityApi = read('cpp/KesshoCore/src/product/KesshoProductApi.cpp');
const backgroundDoc = read('docs/product-core/background-audio.md');
const rootPackage = read('Package.swift');
const iosAppPackage = read('ios/App/CapApp-SPM/Package.swift');
const iosAudioSessionPackage = read('plugins/kessho-capacitor-audio-session/Package.swift');
const macosSmoke = read('macos/KesshoProductCoreMacOSSmoke/main.mm');
const macosAppPackage = read('CapacitorMac/Package.swift');
const macosApp = read('CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift');
const iosAudioSession = read('plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift');

for (const token of [
  'class NativeProductEngine',
  'kessho_product_create',
  'kessho_product_load_snapshot_v2',
  'kessho_product_enqueue_events',
  'kessho_product_render',
  'kessho_product_copy_telemetry',
  'kessho_product_register_asset_buffer',
  'kessho_product_unregister_asset_buffer',
  'renderPeak',
  'supports_native_bridge == 0',
]) {
  assert(nativeTest.includes(token), `${nativeTestPath} must include ${token}`);
}

for (const token of [
  'class NativeProductRuntime',
  'kNativeProductEventQueueCapacity',
  'std::atomic<uint32_t> event_write_index_',
  'std::array<KesshoProductTelemetry, 2> telemetry_buffers_',
  'renderCallback',
  'renderIntoPreallocatedBuffers',
  'reset',
  'registerAssetBuffer',
]) {
  assert(nativeRuntimeHeader.includes(token), `${nativeRuntimeHeaderPath} must include ${token}`);
}

for (const token of [
  'drainQueuedEventsOnRenderThread',
  'kessho_product_reset(engine_)',
  'kessho_product_render(engine_, out_l, out_r, frames)',
  'publishTelemetryOnRenderThread',
  'active_telemetry_index_.store',
  'kessho_product_register_asset_buffer',
  'KESSHO_PRODUCT_ERROR_EVENT_QUEUE_FULL',
]) {
  assert(nativeRuntimeImpl.includes(token), `${nativeRuntimeImplPath} must include ${token}`);
}

const renderCallbackMatch = nativeRuntimeImpl.match(/int32_t NativeProductRuntime::renderCallback[\s\S]*?\n}\n/);
assert(renderCallbackMatch, `${nativeRuntimeImplPath} must define NativeProductRuntime::renderCallback`);
for (const forbidden of ['new ', 'delete ', 'std::vector', 'std::mutex', 'lock_guard', 'Capacitor', 'JavaScript', 'AudioWorklet']) {
  assert(!renderCallbackMatch[0].includes(forbidden), `${nativeRuntimeImplPath} render callback must not use ${forbidden}`);
}

for (const source of [nativeTest, nativeRuntimeHeader, nativeRuntimeImpl]) {
  for (const forbidden of ['Capacitor', 'JavaScript', 'JS bridge', 'AudioWorklet']) {
    assert(!source.includes(forbidden), `native render path must not depend on ${forbidden}`);
  }
}

for (const token of [
  'KesshoAppleProductAudioRenderer.h',
  'AVAudioSourceNode',
  'initWithRenderBlock',
  'renderProductCoreToAudioBufferList',
  'runtime->renderCallback',
  'runtime->maxBlockSize()',
  'while (rendered_frames < frames)',
  'OwnedDecodedAsset',
  'buildOwnedDecodedAsset',
  'resampleChannelLinear',
  'registerAudioFileAssetWithId',
  '_ownedAssets',
  'registerDecodedAssetWithId',
  'registeredAssetFrameCountWithId',
  'reset',
  'loadSnapshot',
  'enqueueEvent',
  'copyTelemetry',
  'renderOfflineFrames',
]) {
  assert(appleRenderer.includes(token), `${appleRendererPath} must include ${token}`);
}

for (const token of [
  '@interface KesshoAppleProductAudioRenderer : NSObject',
  'initWithSampleRate:(double)sampleRate maxBlockSize:(uint32_t)maxBlockSize',
  'loadSnapshot:(const KesshoProductSnapshotV2*)snapshot',
  'enqueueEvent:(const KesshoProductEvent*)event',
  'copyTelemetry:(KesshoProductTelemetry*)telemetry',
  'registerDecodedAssetWithId:(uint32_t)assetId',
  'registerAudioFileAssetWithId:(uint32_t)assetId',
  'unregisterAssetWithId:(uint32_t)assetId',
  'registeredAssetFrameCountWithId:(uint32_t)assetId',
  'registeredAssetSampleRateWithId:(uint32_t)assetId',
  'handleRouteChange',
  'handleInterruptionBegan',
  'handleInterruptionEndedShouldResume:(BOOL)shouldResume',
  'handleMediaServicesReset',
  'primeDiagnosticOutputAndReturnError',
  'runOfflineOutputProbeAndReturnError',
  'routeChangeCount',
  'interruptionBeginCount',
  'interruptionEndCount',
  'mediaServicesResetCount',
  'renderOfflineFrames:(AVAudioFrameCount)frameCount audioBufferList:(AudioBufferList*)outputData',
  'AVAudioSourceNode',
]) {
  assert(appleRendererHeader.includes(token), `${appleRendererHeaderPath} must expose Swift/ObjC bridge token ${token}`);
}

for (const token of [
  '@interface KesshoAppleProductAudioEngine : NSObject',
  'KesshoAppleProductAudioRenderer*)renderer',
  'startAndReturnError',
  'stop',
  'handleRouteChange',
  'handleInterruptionBegan',
  'handleInterruptionEndedShouldResume',
  'handleMediaServicesResetAndReturnError',
  'primeDiagnosticOutputAndReturnError',
  'runOfflineOutputProbeAndReturnError',
]) {
  assert(appleEngineHeader.includes(token), `${appleEngineHeaderPath} must expose AVAudioEngine lifecycle token ${token}`);
}

for (const token of [
  'AVAudioEngine',
  'attachNode',
  'connect:_sourceNode to:_engine.mainMixerNode',
  'startAndReturnError',
  'handleRouteChange',
  'handleInterruptionBegan',
  'handleInterruptionEndedShouldResume',
  'handleMediaServicesResetAndReturnError',
  'primeDiagnosticOutputAndReturnError',
  'runOfflineOutputProbeAndReturnError',
]) {
  assert(appleEngine.includes(token), `${appleEnginePath} must implement native lifecycle token ${token}`);
}

const appleRenderCallbackMatch = appleRenderer.match(/OSStatus renderProductCoreToAudioBufferList[\s\S]*?\n}\n/);
assert(appleRenderCallbackMatch, `${appleRendererPath} must define renderProductCoreToAudioBufferList`);
for (const forbidden of ['new ', 'delete ', 'std::vector', 'std::mutex', 'lock_guard', 'dispatch_', 'notifyListeners', 'Capacitor', 'JavaScript', 'AudioWorklet', 'malloc']) {
  assert(!appleRenderCallbackMatch[0].includes(forbidden), `${appleRendererPath} render callback must not use ${forbidden}`);
}

assert(capabilityApi.includes('report.supports_native_bridge = 0;'), 'Product C ABI capability must keep supports_native_bridge disabled before BG3');
assert(backgroundDoc.includes('No realtime audio buffers pass through JS or the Capacitor bridge'), 'background audio doc must keep native realtime bridge rule');

for (const token of [
  'name: "KesshoProductCore"',
  '.iOS(.v15)',
  '.macOS(.v12)',
  '.library(',
  'targets: ["KesshoProductCore"]',
  'name: "KesshoProductCoreMacOSSmoke"',
  '.executableTarget(',
  'sources: ["main.mm"]',
  'cpp/KesshoCore/src',
  'wasm/soundscapes/kessho_soundscapes.cpp',
  'publicHeadersPath: "cpp/KesshoCore/include"',
  'cSettings: [',
  '.linkedFramework("AVFoundation")',
  '.linkedFramework("Foundation")',
  '.linkedLibrary("objc")',
]) {
  assert(rootPackage.includes(token), `Package.swift must include native product-core target token ${token}`);
}

for (const token of [
  '.package(name: "KesshoCapacitorAudioSession", path: "../../../plugins/kessho-capacitor-audio-session")',
  '.product(name: "KesshoCapacitorAudioSession", package: "KesshoCapacitorAudioSession")',
]) {
  assert(iosAppPackage.includes(token), `iOS app SwiftPM package must link managed plugin dependency ${token}`);
}

for (const token of [
  '.macOS(.v12)',
  '.package(name: "KesshoProductCore", path: "../..")',
  '.product(name: "KesshoProductCore", package: "KesshoProductCore")',
]) {
  assert(iosAudioSessionPackage.includes(token), `iOS audio-session package must link ${token}`);
}

for (const token of [
  'KesshoAppleProductAudioRenderer',
  'KesshoAppleProductAudioEngine',
  'makeSourceNode',
  'startAndReturnError',
  'isRunning',
  'handleMediaServicesResetAndReturnError',
  'registerDecodedAssetWithId',
  'registerAudioFileAssetWithId:9002',
  'registeredAssetFrameCountWithId:9001',
  'registeredAssetFrameCountWithId:9002',
  'registeredAssetSampleRateWithId:9001',
  'unregisterAssetWithId',
  'handleRouteChange',
  'handleInterruptionBegan',
  'handleInterruptionEndedShouldResume',
  'handleMediaServicesReset',
  'primeDiagnosticOutputAndReturnError',
  'runOfflineOutputProbeAndReturnError',
  'renderOfflineFrames',
  'kLargeCallbackFrames',
  'copyTelemetry',
  'probe[@"peak"]',
  'primeDiagnosticOutputAndReturnError',
  'Kessho Product Core macOS target smoke passed',
]) {
  assert(macosSmoke.includes(token), `macOS native smoke target must include ${token}`);
}

for (const token of [
  '.package(name: "KesshoProductCore", path: "..")',
  '.product(name: "KesshoProductCore", package: "KesshoProductCore")',
  'name: "KesshoCapacitorMac"',
]) {
  assert(macosAppPackage.includes(token), `macOS app package must link native product-core library token ${token}`);
}

for (const token of [
  'import KesshoProductCore',
  'private let audioSessionHost = KesshoMacAudioSessionHost()',
  'case "KesshoAudioSession":',
  'KesshoAppleProductAudioEngine',
  'startNativeProductRendererForDiagnostics',
  'stopNativeRendererForDiagnostics',
  'probeNativeRendererForDiagnostics',
  '--native-product-diagnostics-smoke',
  '--native-product-background-smoke',
  'KesshoMacNativeDiagnosticsSmoke',
  'Kessho Capacitor macOS native Product Core diagnostics smoke passed',
  'Kessho Capacitor macOS native Product Core background smoke passed',
  'recordSleepBeganForDiagnostics',
  'recordWakeEndedForDiagnostics',
  'primeDiagnosticOutput',
  'runOfflineOutputProbe',
  'nativeProductEngine?.recoverAfterRouteChange',
  'nativeProductEngine?.handleInterruptionBegan',
  'nativeProductEngine?.handleInterruptionEndedShouldResume',
  'NSWorkspace.willSleepNotification',
  'NSWorkspace.didWakeNotification',
  'handleOutputDeviceChange',
  'emitCurrentStatusForDiagnostics',
  'AudioObjectAddPropertyListenerBlock',
  'kAudioHardwarePropertyDevices',
  'KesshoAudioSession',
  'nativeProductRendererProbePeak',
  'audioSessionEvent',
]) {
  assert(macosApp.includes(token), `macOS app native bridge must include ${token}`);
}

for (const token of [
  'import KesshoProductCore',
  'KesshoAppleProductAudioEngine',
  'nativeProductRendererPrepared',
  'nativeProductRendererRunning',
  'nativeProductRendererStartCount',
  'nativeProductRendererProbePeak',
  'probeNativeRendererForDiagnostics',
  'primeDiagnosticOutput',
  'runOfflineOutputProbe',
  'startNativeProductRendererForDiagnostics',
  'stopNativeProductRendererForDiagnostics',
  'nativeProductEngine?.handleRouteChange',
  'nativeProductEngine?.handleInterruptionBegan',
  'nativeProductEngine?.handleInterruptionEndedShouldResume',
  'nativeProductEngine?.handleMediaServicesReset',
  'AVAudioSession.routeChangeNotification',
  'AVAudioSession.interruptionNotification',
  'AVAudioSession.mediaServicesWereResetNotification',
  'routeChangeCount',
  'interruptionBeginCount',
  'interruptionEndCount',
  'mediaServicesResetCount',
  'audioSessionEvent',
]) {
  assert(iosAudioSession.includes(token), 'iOS audio session host must expose route/interruption diagnostics');
}

execFileSync(process.execPath, [
  'scripts/run-kessho-product-cpp-test.mjs',
  'ProductNativeRenderPathTests',
  'cpp/KesshoCore/src/product/native/KesshoNativeProductRuntime.cpp',
], {
  cwd: root,
  stdio: 'inherit',
});

for (const { sdk, deploymentTarget } of [
  { sdk: 'macosx', deploymentTarget: '-mmacosx-version-min=12.0' },
  { sdk: 'iphonesimulator', deploymentTarget: '-mios-simulator-version-min=15.0' },
]) {
  execFileSync('/usr/bin/xcrun', [
    '--sdk',
    sdk,
    'clang++',
    '-x',
    'objective-c++',
    '-std=c++17',
    '-fobjc-arc',
    '-fsyntax-only',
    deploymentTarget,
    '-Icpp/KesshoCore/include',
    '-Icpp/KesshoCore/generated',
    '-Icpp/KesshoCore/src/product',
    '-Iwasm/dynamics-drift',
    '-Iwasm/dynamics-degrade',
    '-Iwasm/reverb',
    '-Iwasm/granular-fx',
    '-Iwasm/spectral-freeze',
    '-Iwasm/lead-fm',
    '-Iwasm/pad',
    '-Iwasm/drum',
    '-Iwasm/soundscapes',
    appleRendererPath,
  ], {
    cwd: root,
    stdio: 'inherit',
  });
}

console.log('Kessho Product native render path checks passed');
