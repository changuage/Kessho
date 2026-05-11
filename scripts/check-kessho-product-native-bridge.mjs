import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { kesshoCoreIncludeArgs } from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const buildDir = resolve(root, 'build/kessho-core/native-bridge');
const tempDir = mkdtempSync(resolve(tmpdir(), 'kessho-native-product-'));
const testSource = resolve(tempDir, 'KesshoProductNativeBridgeSmoke.mm');
const testBinary = resolve(buildDir, 'KesshoProductNativeBridgeSmoke');

const coreBridgeDir = resolve(root, 'KesshoNativeSwift/CoreBridge');
const bridgeSources = readdirSync(coreBridgeDir)
  .filter((file) => file === 'KesshoProductCoreBridge.mm' || /^kessho_product_core_.*\.cpp$/.test(file))
  .sort()
  .map((file) => resolve(coreBridgeDir, file));

const nativeDspSources = [
  resolve(root, 'KesshoNativeSwift/NativeDSP/kessho_reverb_unified.cpp'),
  resolve(root, 'KesshoNativeSwift/NativeDSP/kessho_dynamics_character_unified.cpp'),
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const swiftAssetProvider = readFileSync(
  resolve(root, 'KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreAssets.swift'),
  'utf8',
);
const swiftSnapshotEncoder = readFileSync(
  resolve(root, 'KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreSnapshot.swift'),
  'utf8',
);
const swiftSnapshotSmoke = readFileSync(
  resolve(root, 'KesshoNativeSwift/KesshoProductSnapshotSmoke/main.swift'),
  'utf8',
);
const swiftProductAudioEngine = readFileSync(
  resolve(root, 'KesshoNativeSwift/Kessho/CoreBridge/KesshoProductCoreAudioEngine.swift'),
  'utf8',
);
const swiftGeneratedSchema = readFileSync(resolve(root, 'KesshoNativeSwift/Generated/KesshoProductSchema.swift'), 'utf8');
const swiftAudioRecorder = readFileSync(resolve(root, 'KesshoNativeSwift/Kessho/Audio/AudioRecorder.swift'), 'utf8');
const swiftAppState = readFileSync(resolve(root, 'KesshoNativeSwift/Kessho/State/AppState.swift'), 'utf8');
const packageSwift = readFileSync(resolve(root, 'KesshoNativeSwift/Package.swift'), 'utf8');
const xcodeProject = readFileSync(resolve(root, 'KesshoNativeSwift/Kessho.xcodeproj/project.pbxproj'), 'utf8');
const nativeBridgeHeader = readFileSync(
  resolve(root, 'KesshoNativeSwift/CoreBridge/include/KesshoProductCoreBridge/KesshoProductCoreBridge.h'),
  'utf8',
);
const nativeBridgeImpl = readFileSync(resolve(root, 'KesshoNativeSwift/CoreBridge/KesshoProductCoreBridge.mm'), 'utf8');

for (const token of [
  'KesshoProductAssetFlags',
  'KesshoProductAssetIDs',
  'KesshoProductCoreAssetManifest',
  'KESSHO_PRODUCT_ASSET_ROOT',
  'startupAssets',
  'assetURL(relativePath:',
  'pianoAssetId(forMidi',
  'Piano/piano_',
  'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg',
  'AVAudioPCMBuffer',
  'AVAudioFile(forReading:',
  'registerDecodedAsset',
  'preloadStartupAssets',
  'pianoPreloadDescriptors',
  'soundscapeAssets',
  'KesshoProductCoreAssetProvider.decodedAsset',
  'Alps Birds_441_m_normalized.ogg',
  'Fujian Birds 2_441_m_normalized.ogg',
  'Alps Birds 2_noiseremoval_441_m.ogg',
  'Ghetary-Waves-Rocks_cl-normalized.ogg',
]) {
  assert(swiftAssetProvider.includes(token), `native Product Core asset provider is missing ${token}`);
}

for (const token of [
  'KesshoProductCoreSnapshotEncoder',
  'public static let byteCount = 3708',
  'KesshoProductSchema.version',
  'KesshoProductSchema.hash',
  'validateEncodedSnapshot',
  'delayATimeLeftMs',
  'delayBPatternId',
  'reverbTypeId',
  'reverbQualityId',
  'reverbErLpFreq',
  'writer.u32(snapshot.fx.reverbType)',
  'delayBToReverb',
  'KesshoProductSourceId.pad1.rawValue',
  'KesshoProductSourceId.piano.rawValue',
  'KesshoProductAssetIDs.defaultPiano',
  'KesshoProductAssetIDs.defaultSoundscape',
  'KesshoProductAssetIDs.waterSoundscape',
  'KesshoProductAssetIDs.birds2Soundscape',
  'KesshoProductAssetIDs.insectsSoundscape',
  'assetRefs: soundscapeAssetIds(from: state)',
  'writer.u32(index < snapshot.assetRefs.count ? snapshot.assetRefs[index] : 0)',
  'private static func soundscapeAssetIds(from state: SliderState)',
  'enabled: state.journeyEnabled',
  'morphPhase: Float(clamp(state.journeyMorphPhase, 0, 1))',
  'morphRateBars: Float(clamp(state.journeyMorphRateBars, 0.25, 128))',
  'limiterCeilingDb: -0.5',
  'writer.f32(snapshot.master.limiterCeilingDb)',
  'private static func rngSeed(from state: SliderState)',
  'state.rngState == 0 ? rngSeed : state.rngState',
  'KesshoProductSourcePresetId',
  'sourcePresetId(source:',
  'soundscapePresetId(from: state)',
  'source.presetId =',
  'state.synthEuclideanMasterEnabled',
  'state.drumEuclidMasterEnabled',
  'func loadSnapshot(state: SliderState',
  'func start(state: SliderState)',
]) {
  assert(swiftSnapshotEncoder.includes(token), `native Product Core snapshot encoder is missing ${token}`);
}

for (const token of [
  'sourceName: String',
  'KesshoProductSourceId.pad1.rawValue',
  'KesshoProductSourceId.piano.rawValue',
  'sourceId(for sourceName:',
  'registeredAssetIds',
  'isAssetRegistered',
  'markAssetRegistered',
  'StemRenderState',
  'recordingStemNodes',
  'recordingStemMixers',
  'configureRecorder(_ recorder: AudioRecorder)',
  'productCore.getStem(',
  'recordingStemMap()',
  'stemMixer.outputVolume = 0',
  'kAudioUnitErr_CannotDoInCurrentContext',
]) {
  assert(swiftProductAudioEngine.includes(token), `native Product Core audio engine is missing ${token}`);
}

for (const token of [
  'private var masterNode: AVAudioNode?',
  'private var stemNodes: [RecordingStem: AVAudioNode]',
  'func configureProductCore(',
  'masterNode.installTap',
  'node.installTap',
  'node.removeTap',
]) {
  assert(swiftAudioRecorder.includes(token), `native AudioRecorder Product Core path is missing ${token}`);
}

for (const token of [
  'NativeAudioRuntimeMode',
  'KESSHO_NATIVE_AUDIO_ENGINE',
  'case "legacy-swift", "legacy", "swift":',
  'case "core-product", nil, "":',
  'using core-product',
  'private var productCoreAudioEngine: KesshoProductCoreAudioEngine?',
  'startProductCoreAudio()',
  'stopActiveAudioEngine()',
  'updateActiveAudioEngine(_ newState: SliderState)',
  'productEngine.loadSnapshot(state: newState, running: isPlaying)',
  'productCoreAudioEngine?.manualNoteOn(',
  'preloadProductCoreStartupAssets',
  'productEngine.preloadStartupAssets()',
  'created.configureRecorder(audioRecorder)',
  '_ = try ensureProductCoreAudioEngine()',
]) {
  assert(swiftAppState.includes(token), `native AppState Product Core runtime path is missing ${token}`);
}

assert(
  !swiftAppState.includes('? .coreProduct : .legacySwift'),
  'native Product Core must be the default runtime path, with legacy Swift selected explicitly only',
);

for (const token of [
  'Product Core stem recording is not wired',
  'Product Core recording is not wired',
]) {
  assert(!swiftAppState.includes(token), `native AppState still blocks Product Core recording with: ${token}`);
}

assert(
  xcodeProject.includes('KesshoProductCoreSnapshot.swift in Sources'),
  'Xcode app target must compile KesshoProductCoreSnapshot.swift',
);
assert(
  packageSwift.includes('KesshoProductSnapshotSmoke') &&
    swiftSnapshotSmoke.includes('KesshoProductCoreSnapshotEncoder.encode') &&
    swiftSnapshotSmoke.includes('core.loadSnapshot(snapshot)') &&
    swiftSnapshotSmoke.includes('core.render(left:'),
  'SwiftPM must include a Product Core snapshot smoke executable that loads encoded state through C++',
);

assert(
  nativeBridgeHeader.includes('source_preset_ids[7]') &&
    nativeBridgeImpl.includes('native.source_preset_ids[i] = telemetry.source_preset_ids[i];'),
  'native bridge telemetry must expose Product Core source preset IDs',
);

for (const token of [
  'public let macroMorph: Float',
  'public let macroDistance: Float',
  'public let macroExpression: Float',
  'public let profileTone: Float',
  'public let profileBrightness: Float',
  'public let profileTexture: Float',
  'public let profileMotion: Float',
  'public let profileAttack: Float',
  'public let profileRelease: Float',
  'public let profileBody: Float',
  'public let profileTransient: Float',
  'profileTone:',
  'profileTransient:',
]) {
  assert(swiftGeneratedSchema.includes(token), `generated Swift Product Core source preset schema is missing ${token}`);
}

writeFileSync(
  testSource,
  `#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <vector>

#include "KesshoProductCoreBridge/KesshoProductCoreBridge.h"
#include "KesshoCore/KesshoProductCore.h"
#include "KesshoProductSchema.h"

namespace {

bool hasSignal(const std::vector<float>& left, const std::vector<float>& right) {
  float peak = 0.0f;
  for (size_t i = 0; i < left.size(); ++i) {
    peak = std::max(peak, std::fabs(left[i]));
    peak = std::max(peak, std::fabs(right[i]));
  }
  return peak > 0.0001f;
}

KesshoProductSnapshotV2 makeSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.bpm = 120.0f;
  snapshot.transport.beats_per_bar = 4;
  snapshot.transport.bars_per_phrase = 4;
  snapshot.master.gain = 1.0f;
  snapshot.rng.seed = 99;
  snapshot.rng.state = 99;
  snapshot.harmony.root_midi = 60.0f;
  snapshot.harmony.scale_id = 1;
  for (uint32_t i = 0; i < 7; ++i) {
    snapshot.sources[i].enabled = 1;
    snapshot.sources[i].source_id = i + 1;
    snapshot.sources[i].level = 0.9f;
    snapshot.sources[i].expression = 0.8f;
    snapshot.sources[i].dry_gain = 1.0f;
  }
  snapshot.sources[KESSHO_PRODUCT_SOURCE_PAD1 - 1u].preset_id =
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER;
  return snapshot;
}

} // namespace

int main() {
  KesshoNativeProductCapabilityReport caps = kessho_native_product_get_capability_report();
  if (caps.supports_native_bridge != 1u || caps.schema_hash != KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH) {
    return 2;
  }

  KesshoNativeProductCoreHandle engine = kessho_native_product_create(48000.0, 128, 0);
  if (engine == nullptr) {
    return 3;
  }

  KesshoProductSnapshotV2 snapshot = makeSnapshot();
  if (kessho_native_product_load_snapshot(engine, &snapshot, sizeof(snapshot)) != KESSHO_PRODUCT_OK) {
    return 4;
  }

  if (kessho_native_product_enqueue_event(
          engine,
          0,
          KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON,
          KESSHO_PRODUCT_SOURCE_PAD1,
          0,
          0,
          60.0f,
          0.85f,
          0.2f,
          0.0f,
          0) != KESSHO_PRODUCT_OK) {
    return 5;
  }

  std::vector<float> left(128);
  std::vector<float> right(128);
  if (kessho_native_product_render(engine, left.data(), right.data(), 128) != KESSHO_PRODUCT_OK) {
    return 6;
  }
  if (!hasSignal(left, right)) {
    return 7;
  }

  std::vector<float> stemLeft(128);
  std::vector<float> stemRight(128);
  if (kessho_native_product_get_stem(
          engine,
          KESSHO_PRODUCT_STEM_PAD1,
          stemLeft.data(),
          stemRight.data(),
          128) != KESSHO_PRODUCT_OK) {
    return 8;
  }
  if (!hasSignal(stemLeft, stemRight)) {
    return 9;
  }

  std::vector<float> decodedPiano(64 * 2, 0.125f);
  if (kessho_native_product_register_interleaved_asset(
          engine,
          22,
          decodedPiano.data(),
          64,
          2,
          48000.0,
          KESSHO_PRODUCT_ASSET_PIANO) != KESSHO_PRODUCT_OK) {
    return 10;
  }

  KesshoNativeProductTelemetry telemetry = kessho_native_product_get_telemetry(engine);
  if (telemetry.active_assets != 1u || telemetry.schema_hash != KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH) {
    return 11;
  }
  if (telemetry.rng_seed != 99u || telemetry.rng_state != 99u) {
    return 13;
  }
  if (telemetry.source_preset_ids[KESSHO_PRODUCT_SOURCE_PAD1 - 1u] !=
      kessho::product::generated::KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER) {
    return 14;
  }

  if (kessho_native_product_unregister_asset(engine, 22) != KESSHO_PRODUCT_OK) {
    return 12;
  }

  kessho_native_product_destroy(engine);
  std::cout << "Kessho Product native bridge smoke passed\\n";
  return 0;
}
`,
);

mkdirSync(buildDir, { recursive: true });

const args = [
  '-std=c++17',
  '-O2',
  '-Wall',
  '-Wextra',
  '-Werror',
  `-I${resolve(root, 'KesshoNativeSwift/CoreBridge/include')}`,
  ...kesshoCoreIncludeArgs(root),
  testSource,
  ...bridgeSources,
  ...nativeDspSources,
  '-o',
  testBinary,
];

console.log(`> /usr/bin/clang++ ${args.join(' ')}`);
execFileSync('/usr/bin/clang++', args, { cwd: root, stdio: 'inherit' });
execFileSync(testBinary, [], { cwd: root, stdio: 'inherit' });
execFileSync('/usr/bin/swift', ['run', '--package-path', 'KesshoNativeSwift', 'KesshoProductSnapshotSmoke'], {
  cwd: root,
  stdio: 'inherit',
});
