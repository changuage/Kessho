#import <AVFoundation/AVFoundation.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <map>
#include <memory>
#include <utility>
#include <vector>

#include "KesshoCore/KesshoAppleProductAudioRenderer.h"
#include "../../KesshoProductEngineInternal.h"
#include "../KesshoNativeProductRuntime.h"

namespace {

NSString* const KesshoAppleProductAudioRendererErrorDomain = @"KesshoAppleProductAudioRenderer";

void setRendererError(NSError** error, NSInteger code, NSString* description) {
  if (error == nullptr) {
    return;
  }
  *error = [NSError errorWithDomain:KesshoAppleProductAudioRendererErrorDomain
                               code:code
                           userInfo:@{NSLocalizedDescriptionKey: description}];
}

struct OwnedDecodedAsset {
  uint32_t frame_count = 0;
  double sample_rate = 0.0;
  uint32_t flags = 0;
  std::vector<std::vector<float>> channels;
  std::vector<const float*> channel_ptrs;

  void refreshChannelPointers() {
    channel_ptrs.resize(channels.size());
    for (size_t channel_index = 0; channel_index < channels.size(); ++channel_index) {
      channel_ptrs[channel_index] = channels[channel_index].data();
    }
  }
};

float finiteSample(float sample) {
  return std::isfinite(sample) ? sample : 0.0f;
}

void copyChannel(
    const float* input,
    uint32_t input_frame_count,
    std::vector<float>& output) {
  output.resize(input_frame_count);
  for (uint32_t frame = 0; frame < input_frame_count; ++frame) {
    output[frame] = finiteSample(input[frame]);
  }
}

void resampleChannelLinear(
    const float* input,
    uint32_t input_frame_count,
    std::vector<float>& output) {
  if (input_frame_count == 1u) {
    std::fill(output.begin(), output.end(), finiteSample(input[0]));
    return;
  }
  if (output.size() == 1u) {
    output[0] = finiteSample(input[0]);
    return;
  }
  const double source_max = static_cast<double>(input_frame_count - 1u);
  const double output_max = static_cast<double>(output.size() - 1u);
  for (size_t frame = 0; frame < output.size(); ++frame) {
    const double position = (static_cast<double>(frame) * source_max) / output_max;
    const uint32_t index = static_cast<uint32_t>(position);
    const uint32_t next = std::min<uint32_t>(index + 1u, input_frame_count - 1u);
    const float frac = static_cast<float>(position - static_cast<double>(index));
    const float a = finiteSample(input[index]);
    const float b = finiteSample(input[next]);
    output[frame] = a + (b - a) * frac;
  }
}

bool buildOwnedDecodedAsset(
    const float* const* channels,
    uint32_t channel_count,
    uint32_t frame_count,
    double input_sample_rate,
    double output_sample_rate,
    uint32_t flags,
    OwnedDecodedAsset& asset) {
  if (channels == nullptr || channel_count == 0u || channel_count > 2u ||
      frame_count == 0u || input_sample_rate <= 0.0 || output_sample_rate <= 0.0) {
    return false;
  }
  for (uint32_t channel_index = 0; channel_index < channel_count; ++channel_index) {
    if (channels[channel_index] == nullptr) {
      return false;
    }
  }
  const double ratio = output_sample_rate / input_sample_rate;
  const uint32_t output_frame_count = std::max<uint32_t>(
      1u,
      static_cast<uint32_t>(std::llround(static_cast<double>(frame_count) * ratio)));
  asset.frame_count = output_frame_count;
  asset.sample_rate = output_sample_rate;
  asset.flags = flags;
  asset.channels.resize(channel_count);
  const bool needs_resample = std::fabs(input_sample_rate - output_sample_rate) > 0.001;
  for (uint32_t channel_index = 0; channel_index < channel_count; ++channel_index) {
    if (needs_resample) {
      asset.channels[channel_index].resize(output_frame_count);
      resampleChannelLinear(channels[channel_index], frame_count, asset.channels[channel_index]);
    } else {
      copyChannel(channels[channel_index], frame_count, asset.channels[channel_index]);
    }
  }
  asset.refreshChannelPointers();
  return true;
}

void applyDiagnosticSourcePreset(KesshoProductSnapshotV2& snapshot, uint32_t source_id, uint32_t preset_id) {
  using namespace kessho::product::internal;
  if (source_id < 1u || source_id > kSourceCount) {
    return;
  }
  KesshoProductSourceSnapshot& source = snapshot.sources[source_id - 1u];
  source.source_id = source_id;
  source.preset_id = preset_id;
  const auto* preset = findSourcePreset(preset_id);
  if (!sourcePresetMatchesSource(source_id, preset)) {
    return;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_PAD1 || source_id == KESSHO_PRODUCT_SOURCE_PAD2 ||
      source_id == KESSHO_PRODUCT_SOURCE_LEAD1 || source_id == KESSHO_PRODUCT_SOURCE_LEAD2) {
    source.source_preset_a_id = preset_id;
    source.source_preset_b_id = preset_id;
  }
  if (source_id == KESSHO_PRODUCT_SOURCE_DRUM) {
    for (const auto& voice : kessho::product::generated::KESSHO_PRODUCT_DRUM_VOICES) {
      if (voice.index >= kessho::product::generated::KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT) {
        continue;
      }
      const auto* default_preset = defaultDrumVoicePreset(voice.index);
      if (default_preset != nullptr) {
        source.drum_voice_preset_a_ids[voice.index] = default_preset->id;
        source.drum_voice_preset_b_ids[voice.index] = default_preset->id;
      }
    }
  }
}

KesshoProductSnapshotV2 makeDiagnosticOutputSnapshot() {
  KesshoProductSnapshotV2 snapshot{};
  snapshot.version = KESSHO_PRODUCT_SNAPSHOT_VERSION;
  snapshot.schema_hash = KESSHO_PRODUCT_SNAPSHOT_SCHEMA_HASH;
  snapshot.transport.bpm = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BPM;
  snapshot.transport.beats_per_bar = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR;
  snapshot.transport.bars_per_phrase = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE;
  snapshot.master.gain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_MASTER_GAIN;
  snapshot.rng.seed = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  snapshot.rng.state = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_RNG_SEED;
  for (uint32_t index = 0; index < kessho::product::internal::kSourceCount; ++index) {
    const uint32_t source_id = index + 1u;
    KesshoProductSourceSnapshot& source = snapshot.sources[index];
    source.source_id = source_id;
    source.enabled = source_id == KESSHO_PRODUCT_SOURCE_PAD1 ? 1u : 0u;
    source.level = 0.9f;
    source.dry_gain = 1.0f;
    source.expression = 0.85f;
    source.post_lpf_hz = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ;
    source.stereo_width = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH;
    source.attack_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS;
    source.decay_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS;
    source.sustain = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN;
    source.hold_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS;
    source.release_seconds = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS;
    applyDiagnosticSourcePreset(snapshot, source_id, kessho::product::internal::defaultSourcePresetId(source_id));
  }
  return snapshot;
}

KesshoProductEvent makeDiagnosticStartEvent() {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
  return event;
}

KesshoProductEvent makeDiagnosticPadNoteEvent() {
  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON;
  event.target_id = KESSHO_PRODUCT_SOURCE_PAD1;
  event.value = 60.0f;
  event.value2 = 0.75f;
  event.value3 = 0.45f;
  return event;
}

void silenceAudioBufferList(AudioBufferList* output_data, AVAudioFrameCount frame_count) {
  if (output_data == nullptr) {
    return;
  }
  for (uint32_t buffer_index = 0; buffer_index < output_data->mNumberBuffers; ++buffer_index) {
    AudioBuffer& buffer = output_data->mBuffers[buffer_index];
    const uint32_t channels = buffer.mNumberChannels == 0 ? 1u : buffer.mNumberChannels;
    const size_t bytes = static_cast<size_t>(frame_count) * channels * sizeof(float);
    if (buffer.mData != nullptr) {
      std::memset(buffer.mData, 0, bytes);
    }
  }
}

OSStatus renderProductCoreToAudioBufferList(
    kessho::product::native::NativeProductRuntime* runtime,
    const std::atomic<uint32_t>* interrupted,
    AVAudioFrameCount frame_count,
    AudioBufferList* output_data) {
  if (runtime == nullptr || output_data == nullptr || output_data->mNumberBuffers < 2) {
    return kAudio_ParamError;
  }
  if (interrupted != nullptr && interrupted->load(std::memory_order_acquire) != 0u) {
    silenceAudioBufferList(output_data, frame_count);
    return noErr;
  }
  float* left = static_cast<float*>(output_data->mBuffers[0].mData);
  float* right = static_cast<float*>(output_data->mBuffers[1].mData);
  if (left == nullptr || right == nullptr || frame_count == 0u ||
      frame_count > UINT32_MAX || runtime->maxBlockSize() == 0u) {
    return kAudio_ParamError;
  }
  uint32_t rendered_frames = 0u;
  const uint32_t frames = static_cast<uint32_t>(frame_count);
  while (rendered_frames < frames) {
    const uint32_t block_frames = std::min(
        frames - rendered_frames,
        runtime->maxBlockSize());
    const int32_t status = runtime->renderCallback(
        left + rendered_frames,
        right + rendered_frames,
        block_frames);
    if (status != KESSHO_PRODUCT_OK) {
      return kAudio_ParamError;
    }
    rendered_frames += block_frames;
  }
  return noErr;
}

} // namespace

@implementation KesshoAppleProductAudioRenderer {
  std::unique_ptr<kessho::product::native::NativeProductRuntime> _runtime;
  std::map<uint32_t, OwnedDecodedAsset> _ownedAssets;
  AVAudioSourceNode* _sourceNode;
  double _sampleRate;
  std::atomic<uint32_t> _interrupted;
  std::atomic<uint32_t> _routeChangeCount;
  std::atomic<uint32_t> _interruptionBeginCount;
  std::atomic<uint32_t> _interruptionEndCount;
  std::atomic<uint32_t> _mediaServicesResetCount;
}

- (instancetype)initWithSampleRate:(double)sampleRate maxBlockSize:(uint32_t)maxBlockSize {
  self = [super init];
  if (self == nil) {
    return nil;
  }
  kessho::product::native::NativeProductRuntimeConfig config{};
  config.sample_rate = sampleRate;
  config.max_block_size = maxBlockSize;
  _runtime = std::make_unique<kessho::product::native::NativeProductRuntime>(config);
  _sampleRate = sampleRate;
  _interrupted.store(0, std::memory_order_release);
  _routeChangeCount.store(0, std::memory_order_release);
  _interruptionBeginCount.store(0, std::memory_order_release);
  _interruptionEndCount.store(0, std::memory_order_release);
  _mediaServicesResetCount.store(0, std::memory_order_release);
  return self;
}

- (BOOL)isValid {
  return _runtime != nullptr && _runtime->valid();
}

- (BOOL)reset {
  if (_runtime == nullptr) {
    return NO;
  }
  return _runtime->reset() == KESSHO_PRODUCT_OK;
}

- (BOOL)loadSnapshot:(const KesshoProductSnapshotV2*)snapshot {
  if (_runtime == nullptr || snapshot == nullptr) {
    return NO;
  }
  return _runtime->loadSnapshot(*snapshot) == KESSHO_PRODUCT_OK;
}

- (BOOL)enqueueEvent:(const KesshoProductEvent*)event {
  if (_runtime == nullptr || event == nullptr) {
    return NO;
  }
  return _runtime->enqueueEvent(*event) == KESSHO_PRODUCT_OK;
}

- (BOOL)copyTelemetry:(KesshoProductTelemetry*)telemetry {
  if (_runtime == nullptr || telemetry == nullptr) {
    return NO;
  }
  return _runtime->copyTelemetry(*telemetry) == KESSHO_PRODUCT_OK;
}

- (BOOL)setInteractionDemandMask:(uint32_t)demandMask sourceMask:(uint32_t)sourceMask {
  if (_runtime == nullptr) {
    return NO;
  }
  return _runtime->setInteractionDemand(demandMask, sourceMask) == KESSHO_PRODUCT_OK;
}

- (BOOL)copyInteractionSignals:(KesshoProductInteractionSignalSnapshot*)signals {
  if (_runtime == nullptr || signals == nullptr) {
    return NO;
  }
  return _runtime->copyInteractionSignals(*signals) == KESSHO_PRODUCT_OK;
}

- (uint32_t)drainInteractionEvents:(KesshoProductInteractionEvent*)events
                     maxEventCount:(uint32_t)maxEventCount
                     overflowCount:(uint32_t*)overflowCount {
  if (_runtime == nullptr) {
    if (overflowCount != nullptr) *overflowCount = 0u;
    return 0u;
  }
  return _runtime->drainInteractionEvents(events, maxEventCount, overflowCount);
}

- (BOOL)registerDecodedAssetWithId:(uint32_t)assetId
                           channels:(const float* _Nonnull const* _Nonnull)channels
                       channelCount:(uint32_t)channelCount
                         frameCount:(uint32_t)frameCount
                         sampleRate:(double)sampleRate
                              flags:(uint32_t)flags {
  if (_runtime == nullptr) {
    return NO;
  }
  OwnedDecodedAsset asset{};
  if (!buildOwnedDecodedAsset(channels, channelCount, frameCount, sampleRate, _sampleRate, flags, asset)) {
    return NO;
  }
  auto insert_result = _ownedAssets.insert_or_assign(assetId, std::move(asset));
  OwnedDecodedAsset& stored_asset = insert_result.first->second;
  stored_asset.refreshChannelPointers();
  const int32_t result = _runtime->registerAssetBuffer(
      assetId,
      stored_asset.channel_ptrs.data(),
      static_cast<uint32_t>(stored_asset.channel_ptrs.size()),
      stored_asset.frame_count,
      stored_asset.sample_rate,
      stored_asset.flags);
  if (result != KESSHO_PRODUCT_OK) {
    _ownedAssets.erase(assetId);
    return NO;
  }
  return YES;
}

- (BOOL)registerAudioFileAssetWithId:(uint32_t)assetId
                                  URL:(NSURL*)url
                                flags:(uint32_t)flags
                                error:(NSError* _Nullable* _Nullable)error {
  if (url == nil) {
    setRendererError(error, 1, @"missing audio file URL");
    return NO;
  }
  NSError* read_error = nil;
  AVAudioFile* file = [[AVAudioFile alloc] initForReading:url error:&read_error];
  if (file == nil) {
    if (error != nullptr) {
      *error = read_error;
    }
    return NO;
  }
  const AVAudioFramePosition file_length = file.length;
  if (file_length <= 0 || file_length > static_cast<AVAudioFramePosition>(UINT32_MAX)) {
    setRendererError(error, 2, @"unsupported audio file length");
    return NO;
  }
  AVAudioPCMBuffer* buffer = [[AVAudioPCMBuffer alloc]
      initWithPCMFormat:file.processingFormat
          frameCapacity:static_cast<AVAudioFrameCount>(file_length)];
  if (buffer == nil) {
    setRendererError(error, 3, @"failed to allocate audio file decode buffer");
    return NO;
  }
  if (![file readIntoBuffer:buffer error:&read_error]) {
    if (error != nullptr) {
      *error = read_error;
    }
    return NO;
  }
  if (buffer.floatChannelData == nullptr || buffer.frameLength == 0u) {
    setRendererError(error, 4, @"audio file did not decode to float PCM");
    return NO;
  }
  const uint32_t channel_count = file.processingFormat.channelCount;
  if (channel_count == 0u || channel_count > 2u) {
    setRendererError(error, 5, @"unsupported audio file channel count");
    return NO;
  }
  const float* channel_ptrs[2] = {
    buffer.floatChannelData[0],
    channel_count > 1u ? buffer.floatChannelData[1] : buffer.floatChannelData[0],
  };
  if (![self registerDecodedAssetWithId:assetId
                               channels:channel_ptrs
                           channelCount:channel_count
                             frameCount:buffer.frameLength
                             sampleRate:file.processingFormat.sampleRate
                                  flags:flags]) {
    setRendererError(error, 6, @"failed to register decoded audio file asset");
    return NO;
  }
  return YES;
}

- (BOOL)unregisterAssetWithId:(uint32_t)assetId {
  if (_runtime == nullptr) {
    return NO;
  }
  const int32_t result = _runtime->unregisterAssetBuffer(assetId);
  if (result == KESSHO_PRODUCT_OK) {
    _ownedAssets.erase(assetId);
    return YES;
  }
  return NO;
}

- (uint32_t)registeredAssetFrameCountWithId:(uint32_t)assetId {
  const auto asset = _ownedAssets.find(assetId);
  return asset == _ownedAssets.end() ? 0u : asset->second.frame_count;
}

- (double)registeredAssetSampleRateWithId:(uint32_t)assetId {
  const auto asset = _ownedAssets.find(assetId);
  return asset == _ownedAssets.end() ? 0.0 : asset->second.sample_rate;
}

- (void)handleRouteChange {
  _routeChangeCount.fetch_add(1u, std::memory_order_acq_rel);
}

- (void)handleInterruptionBegan {
  _interruptionBeginCount.fetch_add(1u, std::memory_order_acq_rel);
  _interrupted.store(1u, std::memory_order_release);
}

- (void)handleInterruptionEndedShouldResume:(BOOL)shouldResume {
  (void)shouldResume;
  _interruptionEndCount.fetch_add(1u, std::memory_order_acq_rel);
  _interrupted.store(0u, std::memory_order_release);
}

- (void)handleMediaServicesReset {
  _mediaServicesResetCount.fetch_add(1u, std::memory_order_acq_rel);
  _interrupted.store(0u, std::memory_order_release);
  _sourceNode = nil;
}

- (uint32_t)routeChangeCount {
  return _routeChangeCount.load(std::memory_order_acquire);
}

- (uint32_t)interruptionBeginCount {
  return _interruptionBeginCount.load(std::memory_order_acquire);
}

- (uint32_t)interruptionEndCount {
  return _interruptionEndCount.load(std::memory_order_acquire);
}

- (uint32_t)mediaServicesResetCount {
  return _mediaServicesResetCount.load(std::memory_order_acquire);
}

- (BOOL)primeDiagnosticOutputAndReturnError:(NSError* _Nullable* _Nullable)error {
  if (_runtime == nullptr) {
    setRendererError(error, 7, @"Product Core runtime unavailable");
    return NO;
  }
  const KesshoProductSnapshotV2 snapshot = makeDiagnosticOutputSnapshot();
  if (_runtime->reset() != KESSHO_PRODUCT_OK || _runtime->loadSnapshot(snapshot) != KESSHO_PRODUCT_OK) {
    setRendererError(error, 8, @"failed to load native Product Core diagnostic snapshot");
    return NO;
  }
  const KesshoProductEvent events[] = {
      makeDiagnosticStartEvent(),
      makeDiagnosticPadNoteEvent(),
  };
  if (_runtime->enqueueEvents(events, 2u) != KESSHO_PRODUCT_OK) {
    setRendererError(error, 9, @"failed to enqueue native Product Core diagnostic events");
    return NO;
  }
  return YES;
}

- (NSDictionary<NSString*, NSNumber*>* _Nullable)runOfflineOutputProbeAndReturnError:(NSError* _Nullable* _Nullable)error {
  if (![self primeDiagnosticOutputAndReturnError:error]) {
    return nil;
  }
  constexpr AVAudioFrameCount kProbeBlockFrames = 128;
  constexpr uint32_t kProbeBlocks = 64;
  float left[kProbeBlockFrames] = {};
  float right[kProbeBlockFrames] = {};
  struct StereoAudioBufferList {
    AudioBufferList list;
    AudioBuffer extra;
  } buffers{};
  buffers.list.mNumberBuffers = 2;
  buffers.list.mBuffers[0].mNumberChannels = 1;
  buffers.list.mBuffers[0].mDataByteSize = sizeof(left);
  buffers.list.mBuffers[0].mData = left;
  buffers.list.mBuffers[1].mNumberChannels = 1;
  buffers.list.mBuffers[1].mDataByteSize = sizeof(right);
  buffers.list.mBuffers[1].mData = right;

  float peak = 0.0f;
  double sum_squares = 0.0;
  uint32_t rendered_frames = 0;
  for (uint32_t block = 0; block < kProbeBlocks; ++block) {
    std::fill(left, left + kProbeBlockFrames, 0.0f);
    std::fill(right, right + kProbeBlockFrames, 0.0f);
    const OSStatus status = renderProductCoreToAudioBufferList(_runtime.get(), &_interrupted, kProbeBlockFrames, &buffers.list);
    if (status != noErr) {
      setRendererError(error, 10, @"native Product Core offline output probe render failed");
      return nil;
    }
    for (uint32_t frame = 0; frame < kProbeBlockFrames; ++frame) {
      if (!std::isfinite(left[frame]) || !std::isfinite(right[frame])) {
        setRendererError(error, 11, @"native Product Core offline output probe produced non-finite samples");
        return nil;
      }
      peak = std::max(peak, std::max(std::fabs(left[frame]), std::fabs(right[frame])));
      sum_squares += static_cast<double>(left[frame]) * static_cast<double>(left[frame]);
      sum_squares += static_cast<double>(right[frame]) * static_cast<double>(right[frame]);
    }
    rendered_frames += kProbeBlockFrames;
  }
  const double rms = std::sqrt(sum_squares / static_cast<double>(rendered_frames * 2u));
  if (peak <= 0.00001f || rms <= 0.000001) {
    setRendererError(error, 12, @"native Product Core offline output probe stayed silent");
    return nil;
  }
  return @{
    @"peak": @(peak),
    @"rms": @(rms),
    @"renderedFrames": @(rendered_frames),
    @"sampleRate": @(_sampleRate)
  };
}

- (OSStatus)renderOfflineFrames:(AVAudioFrameCount)frameCount audioBufferList:(AudioBufferList*)outputData {
  if (_runtime == nullptr) {
    return kAudio_ParamError;
  }
  return renderProductCoreToAudioBufferList(_runtime.get(), &_interrupted, frameCount, outputData);
}

- (AVAudioSourceNode*)makeSourceNode {
  if (_sourceNode != nil) {
    return _sourceNode;
  }
  kessho::product::native::NativeProductRuntime* runtime = _runtime.get();
  const std::atomic<uint32_t>* interrupted = &_interrupted;
  _sourceNode = [[AVAudioSourceNode alloc]
      initWithRenderBlock:^OSStatus(
          BOOL* isSilence,
          const AudioTimeStamp* timestamp,
          AVAudioFrameCount frameCount,
          AudioBufferList* outputData) {
        (void)timestamp;
        if (isSilence != nullptr) {
          *isSilence = NO;
        }
        return renderProductCoreToAudioBufferList(runtime, interrupted, frameCount, outputData);
      }];
  return _sourceNode;
}

@end
