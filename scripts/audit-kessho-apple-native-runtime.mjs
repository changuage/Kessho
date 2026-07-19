import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const reportPath = resolve(root, 'docs/reports/kessho-apple-native-runtime-code-audit-latest.json');

const paths = {
  capability: 'cpp/KesshoCore/src/product/KesshoProductApi.cpp',
  eventTypes: 'cpp/KesshoCore/include/KesshoCore/KesshoProductEvents.h',
  abiTests: 'cpp/KesshoCore/tests/ProductAbiLayoutTests.cpp',
  nativeRuntime: 'cpp/KesshoCore/src/product/native/KesshoNativeProductRuntime.cpp',
  appleRenderer: 'cpp/KesshoCore/src/product/native/apple/KesshoAppleProductAudioRenderer.mm',
  appleEngine: 'cpp/KesshoCore/src/product/native/apple/KesshoAppleProductAudioEngine.mm',
  bridgePolicy: 'native/KesshoNativeBridge/Sources/KesshoNativeBridge/KesshoNativeBridge.swift',
  iosPlugin: 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift',
  iosSession: 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSAudioSessionCoordinator.swift',
  iosRenderer: 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSProductAudioRenderer.swift',
  iosRealtimeQueue: 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSRealtimeEventQueue.swift',
  iosMidi: 'plugins/kessho-capacitor-midi-routing/ios/Sources/KesshoMIDIRouting/KesshoMidiRoutingPlugin.swift',
  macApp: 'CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift',
  macBuild: 'scripts/build-capacitor-mac.mjs',
  capacitorConfig: 'capacitor.config.ts',
  webEngine: 'src/audio/product/WebProductEngine.ts',
  webRuntime: 'src/audio/coreProductRuntime.ts',
  eventBatcher: 'src/audio/product/host/CoreProductRuntimeEventBatcher.ts',
  statePatchQueue: 'src/audio/product/host/CoreProductStatePatchQueue.ts',
  telemetryRates: 'src/ui/productRuntimeTelemetryRateLimits.ts',
  productRender: 'cpp/KesshoCore/src/product/KesshoProductRender.cpp',
  productAssets: 'src/audio/coreProductAssets.ts',
  assetRegistrar: 'src/audio/product/host/CoreProductAssetRegistrar.ts',
  browserAudioSession: 'src/audio/product/browser/ProductBrowserAudioSession.ts',
  arrangementScheduler: 'src/audio/product/host/CoreProductArrangementProjection.ts',
  journeyClock: 'src/audio/product/host/CoreProductJourneyMorphClock.ts',
  journeySurface: 'src/ui/useJourneyMorphRuntimeSurface.ts',
  backgroundSupport: 'src/ui/useProductRuntimeBackgroundAudioSupport.ts',
};

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, read(path)]));

function has(key, ...tokens) {
  return tokens.every((token) => source[key].includes(token));
}

function lineOf(key, token) {
  const index = source[key].indexOf(token);
  if (index < 0) return null;
  return source[key].slice(0, index).split('\n').length;
}

function evidence(key, token, note) {
  return {
    path: paths[key],
    line: lineOf(key, token),
    note,
  };
}

const nativeRenderCoreCompiled =
  has('nativeRuntime', 'NativeProductRuntime::renderCallback', 'kessho_product_render') &&
  has('appleRenderer', 'AVAudioSourceNode', 'runtime->renderCallback') &&
  has('appleEngine', 'AVAudioEngine', 'startAndReturnError');

const webEventBatchingWired =
  has('webEngine', 'PRODUCT_EVENT_BATCH_SIZE', 'postEvents(events)') &&
  has('eventBatcher', 'RUNTIME_EVENT_BATCH_SIZE', 'postManyNow') &&
  has('statePatchQueue', 'requestAnimationFrame', 'pendingPatch');

const webTelemetryThrottlingWired =
  has('webRuntime', 'setTelemetryPollingEnabled', 'setVisualTelemetryActive', 'document.visibilityState', "type: 'host-visibility'");
const productTelemetryGeneratedEveryBlock = has('productRender', 'updateTelemetry(frames);');
const productStemsOptIn = has(
  'productRender',
  'if (captureStems()) {',
  'if (captureStems() && voice.source_id < kStemCount)',
);
const desktopWorkletAlwaysRequestsMaxChannels = has(
  'webRuntime',
  'outputChannelCount: [DAW_OUTPUT_MAX_CHANNELS]',
  'channelCount: DAW_OUTPUT_MAX_CHANNELS',
);
const decodedAssetsClonedBeforeTransfer = has(
  'productAssets',
  'cloneDecodedCoreProductAssetForTransfer',
  'new Float32Array(channel)',
);
const mobileDecodedAssetsTransferOwnership = has(
  'assetRegistrar',
  "const ownership: AssetTransferOwnership = this.mobile ? 'transfer' : 'retain-host-copy';",
  'this.sampleAssetCache.take(asset.assetId)',
);

const capabilityDisabled = has('capability', 'report.supports_native_bridge = 0;');
const iosExplicitlyWebAudioOwned = has('iosPlugin', 'React/WebAudio engine owns sound generation');
const iosDiagnosticOnly = has('iosPlugin', 'startNativeProductRendererForDiagnostics');
const macDiagnosticOnly = has('macApp', 'startNativeProductRendererForDiagnostics');
const bridgeHasProductionControlPlane = has(
  'bridgePolicy',
  'loadProductSnapshot',
  'enqueueProductEvents',
  'registerProductAsset',
);
const iosSnapshotStubbed = has('iosRenderer', 'snapshot loading requires shared Product snapshot contract');
const iosEventStubbed =
  has('iosRenderer', 'func enqueueProductEvent') &&
  !has('iosRenderer', 'engine?.renderer.enqueueEvent');
const nativeAssetsCompiled = has(
  'appleRenderer',
  'registerAudioFileAssetWithId',
  'registerDecodedAssetWithId',
  'registerAssetBuffer',
);
const nativeAssetsWiredToApp =
  has('iosPlugin', 'registerAudioFileAssetWithId') ||
  has('macApp', 'registerAudioFileAssetWithId');
const iosRealtimeQueueUseCount = (source.iosPlugin.match(/IOSRealtimeEventQueue/g) ?? []).length +
  (source.iosRenderer.match(/IOSRealtimeEventQueue/g) ?? []).length +
  (source.iosMidi.match(/IOSRealtimeEventQueue/g) ?? []).length;
const iosMidiDirectToCore = iosRealtimeQueueUseCount > 0 && has('iosRenderer', 'targetSampleTime', 'enqueueEvent');
const macMidiDirectToCore = has('macApp', 'KesshoProductEvent', 'enqueueEvent');
const nativeFeatureSurfacesWired = has(
  'bridgePolicy',
  'startRecording',
  'captureStem',
  'startGraphTapCapture',
  'setDawOutputRouting',
);
const snapshotBytes = 153_044;
const audioSessionBridgeLimitBytes = 8 * 1024;
const snapshotFitsCurrentBridge = snapshotBytes <= audioSessionBridgeLimitBytes;
const nativeControlMutatesEngineDirectly = has(
  'nativeRuntime',
  'kessho_product_load_snapshot_v2(engine_',
  'kessho_product_register_asset_buffer(',
  'kessho_product_unregister_asset_buffer(',
);
const nativeTelemetryCopiedEveryBlock = has(
  'nativeRuntime',
  'kessho_product_render(engine_',
  'publishTelemetryOnRenderThread();',
  'kessho_product_copy_telemetry(engine_',
);
const callbackDiscardsAudioTimestamp = has('appleRenderer', '(void)timestamp;');
const eventSupportsSampleOffset = has('eventTypes', 'uint32_t sample_offset;');
const jsArrangementSchedulingActive = has(
  'arrangementScheduler',
  'window.setTimeout',
  'scheduleHarmonyTicks',
  'startLeadMelody',
);
const jsJourneySoundAuthorityActive =
  has('journeyClock', 'window.requestAnimationFrame', 'this.options.invoke(now)') &&
  has('journeySurface', "reason: 'journey-morph-change'", 'startJourneyMorphClock');
const iosCreatesDuplicateNativeEngines = has(
  'iosPlugin',
  'private var nativeProductEngine',
  'private var iosProductAudioRendererPrep',
);
const nativeRendererUsesFixedStereo = has(
  'appleEngine',
  'initStandardFormatWithSampleRate:_sampleRate channels:2',
);
const nativeRendererExposesStems = has('appleRenderer', 'kessho_product_get_stem');
const nativeRendererExposesGraphTaps = has('appleRenderer', 'kessho_product_get_graph_tap');
const nativeRenderCpuMeasured =
  /mach_absolute_time|CACurrentMediaTime/.test(source.appleRenderer) &&
  /render_cpu_percent|renderCpuPercent/.test(source.appleRenderer + source.iosPlugin + source.macApp);
const iosUnderrunCounterUpdated = /underrunCount\s*\+=/.test(source.iosRenderer);
const nativeAssetDecodeIsWholeFileLinear = has(
  'appleRenderer',
  'AVAudioPCMBuffer',
  'file.length',
  'resampleChannelLinear',
);
const iosRemotePlayBody = source.iosPlugin.match(/private func handleRemotePlay\(\)[\s\S]*?\n    }/)?.[0] ?? '';
const iosRemotePauseBody = source.iosPlugin.match(/private func handleRemotePause\(\)[\s\S]*?\n    }/)?.[0] ?? '';
const iosRemoteCommandsDriveNativeEngine =
  iosRemotePlayBody.includes('nativeProductEngine') &&
  iosRemotePauseBody.includes('nativeProductEngine');
const macObservesCoreAudioRouteChanges = has('macApp', 'AudioObjectAddPropertyListener');
const webUsesPlaybackAudioSession =
  /audioSession/.test(source.browserAudioSession) &&
  has('browserAudioSession', "this.session.type = requested ? 'playback' : 'auto'", "this.session?.addEventListener('statechange'");
const webHasLifecycleResume = has(
  'backgroundSupport',
  'visibilitychange',
  'attemptGracefulResume',
  'pagehide',
  'pageshow',
);
const iosUsesMediaElementCarrier = has(
  'webRuntime',
  'createMediaStreamDestination',
  'audio.srcObject = destination.stream',
);

const legacyRuntimeFiles = [
  'public/worklets/kessho-core.worklet.js',
  'public/worklets/kessho_drum.wasm',
  'public/worklets/kessho_granular.wasm',
  'public/worklets/kessho_lead_fm.wasm',
  'public/worklets/kessho_pad.wasm',
  'public/worklets/kessho_reverb.wasm',
  'public/worklets/kessho_soundscapes.wasm',
  'public/worklets/kessho_spectral_freeze.wasm',
].filter((path) => {
  try {
    readFileSync(resolve(root, path));
    return true;
  } catch {
    return false;
  }
});
const macCopiesWholeWebBuild = has('macBuild', 'cpSync(distDir', "resolve(resourcesDir, 'WebApp')");
const iosCopiesWholeWebBuild = has('capacitorConfig', "webDir: 'dist'");
const releaseBundleNativeAssetFiltering =
  legacyRuntimeFiles.length === 0 || (!macCopiesWholeWebBuild && !iosCopiesWholeWebBuild);

const hardwareMetricsCaptured =
  /thermalState|MetricKit|MXMetricManager|batteryLevel|isLowPowerModeEnabled/.test(source.iosPlugin) ||
  /thermalState|MetricKit|MXMetricManager|batteryLevel|isLowPowerModeEnabled/.test(source.macApp);

const findings = [
  {
    id: 'shared-product-core-native-renderer',
    status: nativeRenderCoreCompiled ? 'compiled-capability' : 'missing',
    productionReady: false,
    summary: 'Product Core can render through AVAudioSourceNode, but this is not the app playback path.',
    evidence: [
      evidence('nativeRuntime', 'NativeProductRuntime::renderCallback', 'C++ native render callback exists.'),
      evidence('appleRenderer', 'AVAudioSourceNode', 'Apple renderer owns an AVAudioSourceNode.'),
      evidence('iosPlugin', 'startNativeProductRendererForDiagnostics', 'iOS exposes the renderer as diagnostics.'),
      evidence('macApp', 'startNativeProductRendererForDiagnostics', 'macOS exposes the renderer as diagnostics.'),
    ],
  },
  {
    id: 'shared-snapshot-event-batching',
    status: webEventBatchingWired ? 'wired-web' : 'partial',
    productionReady: webEventBatchingWired,
    summary: 'Web Product Core already batches event arrays and coalesces ordinary state patches; native transport is absent.',
    evidence: [
      evidence('eventBatcher', 'RUNTIME_EVENT_BATCH_SIZE', 'Runtime events are sent in bounded batches.'),
      evidence('statePatchQueue', 'requestAnimationFrame', 'Noncritical state patches coalesce by animation frame.'),
    ],
  },
  {
    id: 'shared-telemetry-throttling',
    status: webTelemetryThrottlingWired && !productTelemetryGeneratedEveryBlock
      ? 'demand-driven'
      : webTelemetryThrottlingWired ? 'transport-throttled-render-eager' : 'partial',
    productionReady: webTelemetryThrottlingWired && !productTelemetryGeneratedEveryBlock,
    summary: productTelemetryGeneratedEveryBlock
      ? 'Web telemetry messages are visibility- and consumer-gated, but Product Core still rebuilds the large telemetry state every render block.'
      : 'Product telemetry refresh and meter work are demand-driven, and hidden hosts disable telemetry publication.',
    evidence: [
      evidence('webRuntime', 'setVisualTelemetryActive', 'Visual telemetry is explicitly activated by consumers.'),
      evidence('webRuntime', "type: 'host-visibility'", 'Host visibility disables hidden diagnostic publication.'),
      evidence('productRender', 'finishRealtimeTelemetryBlock(frames);', 'The render path updates only bounded realtime counters.'),
    ],
  },
  {
    id: 'shared-opt-in-stem-rendering',
    status: productStemsOptIn ? 'demand-driven' : 'partial',
    productionReady: productStemsOptIn,
    summary: productStemsOptIn
      ? 'Stem buffers are cleared and populated only for explicit stem or graph-tap demand.'
      : 'Stem capture demand could not be proven from the render path.',
    evidence: [
      evidence('productRender', 'if (captureStems()) {', 'Stem clear and finalization are demand-gated.'),
      evidence('productRender', 'if (captureStems() && voice.source_id < kStemCount)', 'Source accumulation is demand-gated.'),
    ],
  },
  {
    id: 'shared-default-output-channel-count',
    status: desktopWorkletAlwaysRequestsMaxChannels ? 'max-channels-by-default' : 'partial',
    productionReady: !desktopWorkletAlwaysRequestsMaxChannels,
    summary: 'Desktop web and the current macOS app request a 32-channel AudioWorklet even when DAW output is disabled; stereo should be the default node shape.',
    evidence: [
      evidence('webRuntime', 'outputChannelCount: [DAW_OUTPUT_MAX_CHANNELS]', 'Non-iOS Product runtime creates the maximum-channel worklet.'),
    ],
  },
  {
    id: 'shared-decoded-asset-transfer-copy',
    status: mobileDecodedAssetsTransferOwnership
      ? 'mobile-transfer-owned'
      : decodedAssetsClonedBeforeTransfer ? 'full-copy-before-transfer' : 'partial',
    productionReady: mobileDecodedAssetsTransferOwnership,
    summary: mobileDecodedAssetsTransferOwnership
      ? 'Mobile registration transfers the owned decoded buffers directly; desktop may retain and clone its host cache copy.'
      : 'Decoded sample channels are fully cloned before transfer to the worklet, increasing preset-load CPU and peak memory, especially on iOS.',
    evidence: [
      evidence('assetRegistrar', "this.mobile ? 'transfer' : 'retain-host-copy'", 'Mobile and desktop use explicit transfer ownership policies.'),
      evidence('assetRegistrar', 'this.sampleAssetCache.take(asset.assetId)', 'Mobile removes the host cache entry before transferring ownership.'),
    ],
  },
  {
    id: 'ios-browser-background-best-effort',
    status: webHasLifecycleResume && iosUsesMediaElementCarrier && !webUsesPlaybackAudioSession
      ? 'partial-missing-audio-session'
      : webUsesPlaybackAudioSession ? 'partial-unmeasured' : 'missing',
    productionReady: false,
    summary: webUsesPlaybackAudioSession
      ? 'The browser runtime has a media-element carrier, foreground recovery, playback Audio Session ownership, and one-shot interruption recovery; physical-device behavior remains unmeasured.'
      : 'The web runtime has an iOS media-element carrier and foreground recovery, but does not request playback Audio Session mode or track Audio Session interruptions.',
    evidence: [
      evidence('webRuntime', 'createMediaStreamDestination', 'iOS WebAudio is routed through an HTML media-element carrier.'),
      evidence('backgroundSupport', 'attemptGracefulResume', 'The UI attempts idempotent recovery after lifecycle changes.'),
      evidence('browserAudioSession', "requested ? 'playback' : 'auto'", 'Browser Audio Session type follows requested playback.'),
    ],
  },
  {
    id: 'production-native-audio-routing',
    status: capabilityDisabled && iosExplicitlyWebAudioOwned && iosDiagnosticOnly && macDiagnosticOnly
      ? 'diagnostic-only'
      : 'partial',
    productionReady: false,
    summary: 'Both apps still use the WebAudio Product runtime for production sound generation.',
    evidence: [
      evidence('capability', 'report.supports_native_bridge = 0;', 'The Product capability report disables native bridge support.'),
      evidence('iosPlugin', 'React/WebAudio engine owns sound generation', 'iOS explicitly assigns sound generation to WebAudio.'),
    ],
  },
  {
    id: 'native-snapshot-event-control-plane',
    status: bridgeHasProductionControlPlane || (!iosSnapshotStubbed && !iosEventStubbed) ? 'partial' : 'missing',
    productionReady: bridgeHasProductionControlPlane && !iosSnapshotStubbed && !iosEventStubbed,
    summary: 'No production bridge contract loads Product snapshots or event batches into the native renderer.',
    evidence: [
      evidence('bridgePolicy', 'startNativeRendererForDiagnostics', 'The allowlist exposes diagnostics but no Product state methods.'),
      evidence('iosRenderer', 'snapshot loading requires shared Product snapshot contract', 'iOS snapshot loading is an explicit stub.'),
      evidence('iosRenderer', 'func enqueueProductEvent', 'The iOS event method does not forward into the native engine.'),
    ],
  },
  {
    id: 'native-bridge-payload-contract',
    status: snapshotFitsCurrentBridge ? 'partial' : 'incompatible',
    productionReady: snapshotFitsCurrentBridge && bridgeHasProductionControlPlane,
    summary: `The ${snapshotBytes}-byte Product snapshot cannot fit the current ${audioSessionBridgeLimitBytes}-byte audio-session options limit. A binary/chunked contract is required.`,
    evidence: [
      evidence('abiTests', 'sizeof(KesshoProductSnapshotV2) == 153044', 'The native snapshot ABI is 153,044 bytes.'),
      evidence('bridgePolicy', 'startPlayback", maxOptionsBytes: 8 * 1024', 'The current playback request permits 8 KiB of JSON options.'),
    ],
  },
  {
    id: 'native-control-realtime-safety',
    status: nativeControlMutatesEngineDirectly ? 'blocked-before-production-wiring' : 'partial',
    productionReady: !nativeControlMutatesEngineDirectly,
    summary: 'Snapshot load, reset, asset registration, and asset removal call directly into the render engine. They need a render-boundary command protocol and asset lifetime handoff before concurrent app use.',
    evidence: [
      evidence('nativeRuntime', 'kessho_product_load_snapshot_v2(engine_', 'Snapshot state is mutated directly on the caller thread.'),
      evidence('nativeRuntime', 'kessho_product_register_asset_buffer(', 'Asset state is mutated directly on the caller thread.'),
      evidence('nativeRuntime', 'kessho_product_unregister_asset_buffer(', 'Asset lifetime can be ended directly by the caller thread.'),
    ],
  },
  {
    id: 'native-event-timestamp-mapping',
    status: eventSupportsSampleOffset && callbackDiscardsAudioTimestamp ? 'missing-host-time-mapper' : 'partial',
    productionReady: eventSupportsSampleOffset && !callbackDiscardsAudioTimestamp,
    summary: 'The event ABI supports per-block sample offsets, but the Apple callback discards its AudioTimeStamp, so CoreMIDI host time cannot yet be mapped to the rendered block.',
    evidence: [
      evidence('eventTypes', 'uint32_t sample_offset;', 'Product events can be sample-offset scheduled.'),
      evidence('appleRenderer', '(void)timestamp;', 'The Apple render callback discards hardware timeline information.'),
    ],
  },
  {
    id: 'native-event-producer-model',
    status: 'single-producer-only',
    productionReady: false,
    summary: 'The atomic ring is a single-producer/single-consumer design. JavaScript control and CoreMIDI must be serialized through one producer or use a proven multi-producer queue.',
    evidence: [
      evidence('nativeRuntime', 'event_write_index_.load(std::memory_order_relaxed)', 'Enqueue assumes one writer owns the write index.'),
    ],
  },
  {
    id: 'native-asset-path',
    status: nativeAssetsCompiled && !nativeAssetsWiredToApp ? 'compiled-not-wired' : nativeAssetsWiredToApp ? 'partial' : 'missing',
    productionReady: nativeAssetsCompiled && nativeAssetsWiredToApp,
    summary: 'Native decode/register code exists, but app bridges cannot invoke it; the current implementation also decodes whole files and performs synchronous linear resampling.',
    evidence: [
      evidence('appleRenderer', 'registerAudioFileAssetWithId', 'AVAudioFile decode and registration are implemented.'),
      evidence('bridgePolicy', 'KesshoAudioSession', 'The bridge allowlist has no native asset registration methods.'),
    ],
  },
  {
    id: 'native-background-scheduler-independence',
    status: jsArrangementSchedulingActive || jsJourneySoundAuthorityActive ? 'host-dependent' : 'sample-frame-owned',
    productionReady: !jsArrangementSchedulingActive && !jsJourneySoundAuthorityActive,
    summary: jsArrangementSchedulingActive || jsJourneySoundAuthorityActive
      ? 'JavaScript still owns audible arrangement or Journey state changes. Native audio can keep rendering while musical behavior stalls when the WebView is suspended.'
      : 'Production host arrangement behavior is projection-only; Product Core owns ongoing harmony, chord, lead, and note scheduling on sample frames.',
    evidence: [
      evidence('arrangementScheduler', 'CoreProductArrangementProjection', 'The production host retains UI/debug projection only and owns no musical timer.'),
      evidence('journeySurface', "reason: 'journey-morph-change'", 'The visibility-driven Journey callback uploads audible morph state and is therefore sound-authoritative.'),
    ],
  },
  {
    id: 'native-midi-timing',
    status: iosMidiDirectToCore || macMidiDirectToCore ? 'partial' : 'collected-to-js-only',
    productionReady: iosMidiDirectToCore && macMidiDirectToCore,
    summary: 'CoreMIDI timestamps are collected, but neither app schedules those events directly into Product Core.',
    evidence: [
      evidence('iosMidi', 'timeStamp', 'iOS captures CoreMIDI packet timestamps.'),
      evidence('iosRealtimeQueue', 'targetSampleTime', 'A timestamped queue type exists but has no production consumer.'),
      evidence('macApp', 'timestampHostTime', 'macOS captures host timestamps and forwards MIDI through the app bridge.'),
    ],
  },
  {
    id: 'native-feature-parity',
    status: nativeFeatureSurfacesWired ? 'partial' : 'missing',
    productionReady: nativeFeatureSurfacesWired,
    summary: 'Recording, stems, graph taps, DAW routing, and equivalent debug surfaces are not exposed by the native bridge.',
    evidence: [
      evidence('bridgePolicy', 'KesshoAudioSession', 'Native audio bridge methods are session and diagnostic methods only.'),
    ],
  },
  {
    id: 'native-output-and-capture-topology',
    status: nativeRendererUsesFixedStereo && !nativeRendererExposesStems && !nativeRendererExposesGraphTaps
      ? 'stereo-master-only'
      : 'partial',
    productionReady: !nativeRendererUsesFixedStereo && nativeRendererExposesStems && nativeRendererExposesGraphTaps,
    summary: 'Product Core exposes stems and graph taps at the C ABI, but the Apple renderer exposes only a fixed stereo master source node.',
    evidence: [
      evidence('capability', 'report.supports_recordable_stems = 1;', 'The core C ABI advertises stem capability.'),
      evidence('appleEngine', 'channels:2', 'The Apple engine graph is fixed to stereo.'),
    ],
  },
  {
    id: 'native-render-telemetry-integrity',
    status: nativeTelemetryCopiedEveryBlock && !nativeRenderCpuMeasured && !iosUnderrunCounterUpdated
      ? 'misleading-and-overactive'
      : 'partial',
    productionReady: nativeRenderCpuMeasured && iosUnderrunCounterUpdated,
    summary: 'The native audio thread copies 15,168 bytes of telemetry every block, yet native render CPU is not timed and the published iOS underrun counter is never updated.',
    evidence: [
      evidence('nativeRuntime', 'publishTelemetryOnRenderThread();', 'Full telemetry is published after every render callback.'),
      evidence('abiTests', 'sizeof(KesshoProductTelemetry) == 15448', 'Each telemetry snapshot is 15,448 bytes.'),
      evidence('iosRenderer', 'private(set) var underrunCount = 0', 'The iOS counter exists without an increment path.'),
    ],
  },
  {
    id: 'ios-native-renderer-ownership',
    status: iosCreatesDuplicateNativeEngines ? 'duplicated-diagnostic-state' : 'partial',
    productionReady: !iosCreatesDuplicateNativeEngines,
    summary: 'The iOS host creates one native engine for diagnostics and another inside IOSProductAudioRenderer; lifecycle and telemetry can describe different engines.',
    evidence: [
      evidence('iosPlugin', 'private var nativeProductEngine', 'Primary diagnostic engine.'),
      evidence('iosPlugin', 'private var iosProductAudioRendererPrep', 'Second wrapper creates its own engine.'),
    ],
  },
  {
    id: 'native-block-size-sample-rate-lifecycle',
    status: 'unverified',
    productionReady: false,
    summary: 'Render blocks larger than the configured maximum fail, and the Apple engine is not rebuilt from actual device format after route/sample-rate changes.',
    evidence: [
      evidence('nativeRuntime', 'frames > max_block_size_', 'Oversized hardware callbacks return an error.'),
      evidence('appleEngine', '_sampleRate = sampleRate;', 'The engine keeps its construction-time sample rate.'),
      evidence('iosSession', 'actualSampleRate = session.sampleRate', 'Actual device format is observed separately but not used to rebuild the native engine.'),
    ],
  },
  {
    id: 'native-remote-command-authority',
    status: iosRemoteCommandsDriveNativeEngine ? 'partial' : 'js-dependent',
    productionReady: iosRemoteCommandsDriveNativeEngine,
    summary: 'iOS Control Center commands update session state and notify JavaScript; they do not directly start or stop the native renderer when the WebView is unavailable.',
    evidence: [
      evidence('iosPlugin', 'private func handleRemotePlay()', 'Remote play delegates to session state and a JavaScript listener.'),
      evidence('iosPlugin', 'private func handleRemotePause()', 'Remote pause does not stop the native Product engine.'),
    ],
  },
  {
    id: 'macos-output-route-observation',
    status: macObservesCoreAudioRouteChanges ? 'partial' : 'missing',
    productionReady: macObservesCoreAudioRouteChanges,
    summary: 'macOS can inspect the current output device but does not subscribe to CoreAudio device/format changes; app-hidden notifications are counted as route changes instead.',
    evidence: [
      evidence('macApp', 'defaultOutputDeviceID()', 'The shell can query the current default output.'),
      evidence('macApp', 'handleRouteChange(reason: "appHidden")', 'App hiding is used as diagnostic route-change evidence.'),
    ],
  },
  {
    id: 'native-sonic-parity-evidence',
    status: 'smoke-only',
    productionReady: false,
    summary: 'Native tests prove non-silent finite output, not equality or perceptual parity against the WebAudio/WASM Product runtime across the acceptance corpus.',
    evidence: [],
  },
  {
    id: 'native-release-bundle-filtering',
    status: releaseBundleNativeAssetFiltering ? 'implemented' : 'missing',
    productionReady: releaseBundleNativeAssetFiltering,
    summary: 'Native package flows copy the complete web build, including unreachable legacy/reference WASM assets.',
    evidence: [
      evidence('macBuild', 'cpSync(distDir', 'macOS copies the entire dist directory into the app.'),
      evidence('capacitorConfig', "webDir: 'dist'", 'iOS sync uses the complete dist directory.'),
    ],
    legacyRuntimeFiles,
  },
  {
    id: 'apple-device-cpu-thermal-evidence',
    status: hardwareMetricsCaptured ? 'partial' : 'unmeasured',
    productionReady: false,
    summary: 'No in-app CPU, thermal, battery, or low-power instrumentation validates the proposed percentage gains.',
    evidence: [],
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  evidencePolicy: {
    sourceOnly: true,
    documentationUsedAsInput: false,
    levels: ['missing', 'diagnostic-only', 'compiled-capability', 'compiled-not-wired', 'wired-web', 'blocked-before-production-wiring', 'measured-device'],
    rule: 'Source presence is not production readiness; percentages require before/after device measurements.',
  },
  overallStatus: findings.every((finding) => finding.productionReady)
    ? 'production-ready'
    : 'scaffolded-not-production-ready',
  findings,
  cpuClaims: [
    {
      workstream: 'production native audio routing plus native runtime integration',
      priorEstimate: '5-18% lower audio CPU, with 5-15% fewer spikes',
      auditStatus: 'unmeasured-hypothesis',
      correction: 'Treat as one combined A/B result; routing and runtime integration overlap and must not be added together.',
    },
    {
      workstream: 'release-bundle native asset path',
      priorEstimate: '0-2% steady CPU, with 5-20% lower load/decode spikes',
      auditStatus: 'unmeasured-hypothesis',
      correction: 'Measure startup and preset-load latency separately from steady-state render CPU.',
    },
  ],
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Apple native runtime code audit: ${report.overallStatus}`);
for (const finding of findings) {
  console.log(`- ${finding.id}: ${finding.status}`);
}

if (strict && report.overallStatus !== 'production-ready') {
  console.error('Apple native runtime strict audit failed: production readiness is not established.');
  process.exitCode = 1;
}
