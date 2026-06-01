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

function assertIncludes(source, token, label) {
  assert(source.includes(token), `${label} must include ${token}`);
}

const supportHookPath = 'src/ui/useProductRuntimeBackgroundAudioSupport.ts';
const mediaSessionPath = 'src/ui/audioEngineMediaSession.ts';
const coreProductRuntimePath = 'src/audio/coreProductRuntime.ts';
const playbackAdapterPath = 'src/ui/useProductRuntimePlaybackAdapter.ts';
const capacitorAudioSessionPath = 'src/native/capacitorAudioSession.ts';
const capacitorDiagnosticsPath = 'src/ui/useCapacitorAudioSessionDiagnostics.ts';
const appPath = 'src/App.tsx';
const requirementsPath = 'docs/product-core/background-audio.md';
const matrixPath = 'docs/product-core/background-audio-test-matrix.md';
const evidencePath = 'docs/product-core/background-audio-device-evidence.md';
const iosInfoPlistPath = 'ios/App/App/Info.plist';
const macosAppPackagePath = 'CapacitorMac/Package.swift';
const macosAppPath = 'CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift';
const packagePath = 'package.json';

const supportHook = read(supportHookPath);
const mediaSession = read(mediaSessionPath);
const coreProductRuntime = read(coreProductRuntimePath);
const playbackAdapter = read(playbackAdapterPath);
const capacitorAudioSession = read(capacitorAudioSessionPath);
const capacitorDiagnostics = read(capacitorDiagnosticsPath);
const app = read(appPath);
const requirements = read(requirementsPath);
const matrix = read(matrixPath);
const evidence = read(evidencePath);
const iosInfoPlist = read(iosInfoPlistPath);
const macosAppPackage = read(macosAppPackagePath);
const macosApp = read(macosAppPath);
const packageJson = JSON.parse(read(packagePath));

for (const token of [
  'ProductRuntimeBackgroundAudioStatus',
  'visibilitychange',
  'pagehide',
  'pageshow',
  "'freeze'",
  "'resume'",
  'requestVisiblePageWakeLock',
  'releaseVisiblePageWakeLock',
  'attemptGracefulResume',
  'resumeProductRuntimeRef.current()',
  'productEngine.getLifecycleState()',
  'Browser/mobile background audio is best-effort; screen lock and app switch playback are not guaranteed.',
]) {
  assertIncludes(supportHook, token, supportHookPath);
}

for (const token of [
  "audioEngineRuntimeMode !== 'core-product' && isIOSLikeDevice()",
  "navigator.mediaSession.setActionHandler('play'",
  "navigator.mediaSession.setActionHandler('pause'",
  "navigator.mediaSession.setActionHandler('stop'",
  'if (useMediaStreamCarrier) void mediaSessionAudio?.play();',
  'if (useMediaStreamCarrier) mediaSessionAudio?.pause();',
  "if (audioEngineRuntimeMode === 'core-product') return;",
]) {
  assertIncludes(mediaSession, token, mediaSessionPath);
}

assert(
  !mediaSession.includes('if (!mediaSessionAudio) {\n    mediaSessionAudio = new Audio();'),
  `${mediaSessionPath} must not create the reference MediaStream carrier for core-product`,
);

for (const token of [
  'createProductAudioContext',
  'webkitAudioContext',
  "latencyHint: 'playback'",
  'prepareMediaSessionPlayback',
  'connectMediaSessionPlayback',
  'disconnectMediaSessionPlayback',
  'context.createMediaStreamDestination()',
  'connectOutputToBrowserSink',
  'output.connect(destination)',
  'audio.play().catch',
  'isIOSLikeDevice()',
]) {
  assertIncludes(coreProductRuntime, token, coreProductRuntimePath);
}

for (const token of [
  'useProductRuntimeBackgroundAudioSupport',
  'browserPlaybackActive',
  'setBrowserPlaybackActive(true)',
  'setBrowserPlaybackActive(false)',
  'backgroundAudioStatus',
  'requestVisiblePageWakeLock',
  'releaseVisiblePageWakeLock',
]) {
  assertIncludes(playbackAdapter, token, playbackAdapterPath);
}

for (const token of [
  'KesshoNativeProductRendererProbeStatus',
  'KesshoAudioSessionEventPayload',
  'shouldUseNativeProductRendererDiagnostics',
  'addCapacitorAudioSessionEventListener',
  'probeNativeProductRendererForDiagnostics',
  'startNativeRendererForDiagnostics?.()',
  'stopNativeRendererForDiagnostics?.()',
  "nativeProductMode === 'diagnostic'",
]) {
  assertIncludes(capacitorAudioSession, token, capacitorAudioSessionPath);
}

for (const token of [
  'shouldUseNativeProductRendererDiagnostics',
  'probeNativeProductRendererForDiagnostics',
  'NativeProductRendererDiagnosticStatus',
  'addCapacitorAudioSessionEventListener',
  'applyAudioSessionEvent',
  'routeChangeCount',
  'interruptionBeginCount',
  'mediaServicesResetCount',
  'lastRemoteCommand',
  'remoteCommandCount',
  'Native Product Core renderer probe',
]) {
  assertIncludes(capacitorDiagnostics, token, capacitorDiagnosticsPath);
}

for (const token of [
  'renderBackgroundAudioStatusPill',
  'backgroundAudioStatus.limitation',
  'Browser background audio status',
  'Visible-page Wake Lock. Browser/mobile lock-screen and app-background playback remain best-effort.',
  'nativeProductRendererDiagnosticStatus',
  'nativeProductRendererDiagnosticStatus.routeChangeCount',
  'nativeProductRendererDiagnosticStatus.interruptionBeginCount',
  'nativeProductRendererDiagnosticStatus.mediaServicesResetCount',
  'nativeProductRendererDiagnosticStatus.remoteCommandCount',
  'backgroundAudioStatus.pageStatus',
  'backgroundAudioStatus.lifecycleEvent',
  'backgroundAudioStatus.productLifecycleState',
  'backgroundAudioStatus.wakeLockStatus',
  'backgroundAudioStatus.mediaSessionStatus',
]) {
  assertIncludes(app, token, appPath);
}

for (const token of [
  'Browser/mobile web must never be presented as guaranteed background playback',
  'visible-page Wake Lock mode',
  'Media Session metadata',
  'Page Visibility diagnostics',
  'Page Lifecycle diagnostics',
  'graceful resume after suspension',
  '`AVAudioSession` is configured for playback/background audio integration on iOS',
]) {
  assertIncludes(requirements, token, requirementsPath);
}

assert(
  /<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*<string>audio<\/string>[\s\S]*<\/array>/.test(iosInfoPlist),
  `${iosInfoPlistPath} must declare UIBackgroundModes audio for native background audio diagnostics`,
);

for (const token of [
  '.package(name: "KesshoProductCore", path: "..")',
  '.product(name: "KesshoProductCore", package: "KesshoProductCore")',
]) {
  assertIncludes(macosAppPackage, token, macosAppPackagePath);
}

for (const token of [
  'import KesshoProductCore',
  'KesshoMacAudioSessionHost',
  'case "KesshoAudioSession":',
  'startNativeRendererForDiagnostics',
  'stopNativeRendererForDiagnostics',
  'probeNativeRendererForDiagnostics',
  '--native-product-diagnostics-smoke',
  '--native-product-background-smoke',
  'KesshoMacNativeDiagnosticsSmoke',
  'recordAppHiddenForDiagnostics',
  'recordSleepBeganForDiagnostics',
  'recordWakeEndedForDiagnostics',
  'KesshoAppleProductAudioEngine',
  'NSWorkspace.willSleepNotification',
  'NSWorkspace.didWakeNotification',
  'audioSessionEvent',
]) {
  assertIncludes(macosApp, token, macosAppPath);
}

for (const token of [
  '| iOS Safari | screen lock | best-effort / not guaranteed | todo |',
  '| iOS Safari | app switch | best-effort / not guaranteed | todo |',
  '| Android Chrome | screen lock | best-effort / not guaranteed | todo |',
  'manual/ear test',
]) {
  assertIncludes(matrix, token, matrixPath);
}

for (const token of [
  'ios-native-foreground',
  'ios-native-screen-lock',
  'ios-native-app-background',
  'ios-native-control-center',
  'ios-native-route-change',
  'macos-native-hidden',
  'macos-native-sleep-wake',
]) {
  assertIncludes(evidence, token, evidencePath);
}

assert(
  packageJson.scripts?.['core:product:background-audio'] === 'node scripts/check-kessho-product-background-audio-support.mjs',
  'package.json must expose core:product:background-audio',
);
assert(
  packageJson.scripts?.['core:product:background-audio-device-evidence'] === 'node scripts/check-kessho-product-background-audio-device-evidence.mjs',
  'package.json must expose core:product:background-audio-device-evidence',
);
assert(
  packageJson.scripts?.['core:product:macos-app-native-smoke'] === 'swift run --package-path CapacitorMac KesshoCapacitorMac --native-product-diagnostics-smoke',
  'package.json must expose core:product:macos-app-native-smoke',
);
assert(
  packageJson.scripts?.['core:product:macos-app-background-smoke'] === 'swift run --package-path CapacitorMac KesshoCapacitorMac --native-product-background-smoke',
  'package.json must expose core:product:macos-app-background-smoke',
);
assert(
  packageJson.scripts?.['core:product:native-background-smoke'] === 'npm run core:product:macos-app-background-smoke',
  'package.json must expose core:product:native-background-smoke as the plan-level native background alias',
);

console.log('Kessho Product background audio support checks passed');
