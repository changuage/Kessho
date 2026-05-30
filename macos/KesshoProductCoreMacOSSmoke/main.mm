#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iostream>

#import <Foundation/Foundation.h>

#include "KesshoCore/KesshoAppleProductAudioEngine.h"
#include "KesshoCore/KesshoAppleProductAudioRenderer.h"

namespace {

bool finiteBlock(const float* left, const float* right, uint32_t frames) {
  for (uint32_t frame = 0; frame < frames; ++frame) {
    if (!std::isfinite(left[frame]) || !std::isfinite(right[frame])) {
      return false;
    }
  }
  return true;
}

float peakBlock(const float* left, const float* right, uint32_t frames) {
  float peak = 0.0f;
  for (uint32_t frame = 0; frame < frames; ++frame) {
    peak = std::max(peak, std::max(std::fabs(left[frame]), std::fabs(right[frame])));
  }
  return peak;
}

} // namespace

int main() {
  @autoreleasepool {
    constexpr uint32_t kBlockFrames = 128;
    KesshoAppleProductAudioEngine* audio_engine =
        [[KesshoAppleProductAudioEngine alloc] initWithSampleRate:48000.0 maxBlockSize:kBlockFrames];
    KesshoAppleProductAudioRenderer* renderer = [audio_engine renderer];
    if (renderer == nil || ![renderer isValid]) {
      std::cerr << "failed to create macOS Product Core renderer\n";
      return 1;
    }
    AVAudioSourceNode* source_node = [renderer makeSourceNode];
    if (source_node == nil) {
      std::cerr << "failed to create macOS Product Core source node\n";
      return 1;
    }
    float asset_left[256] = {};
    float asset_right[256] = {};
    for (uint32_t frame = 0; frame < 256; ++frame) {
      asset_left[frame] = std::sin(static_cast<float>(frame) * 0.03f) * 0.2f;
      asset_right[frame] = std::cos(static_cast<float>(frame) * 0.03f) * 0.2f;
    }
    const float* asset_channels[] = {asset_left, asset_right};
    if (![renderer registerDecodedAssetWithId:9001
                                      channels:asset_channels
                                  channelCount:2
                                    frameCount:256
                                    sampleRate:24000.0
                                         flags:0]) {
      std::cerr << "failed to register macOS Product Core decoded asset\n";
      return 1;
    }
    if ([renderer registeredAssetFrameCountWithId:9001] != 512u ||
        [renderer registeredAssetSampleRateWithId:9001] != 48000.0) {
      std::cerr << "macOS Product Core decoded asset resample mismatch\n";
      return 1;
    }
    if (![renderer unregisterAssetWithId:9001]) {
      std::cerr << "failed to unregister macOS Product Core decoded asset\n";
      return 1;
    }
    AVAudioFormat* file_format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:24000.0 channels:2];
    AVAudioPCMBuffer* file_buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:file_format frameCapacity:256];
    if (file_format == nil || file_buffer == nil || file_buffer.floatChannelData == nullptr) {
      std::cerr << "failed to create macOS Product Core file decode fixture\n";
      return 1;
    }
    file_buffer.frameLength = 256;
    for (uint32_t frame = 0; frame < 256; ++frame) {
      file_buffer.floatChannelData[0][frame] = std::sin(static_cast<float>(frame) * 0.05f) * 0.2f;
      file_buffer.floatChannelData[1][frame] = std::cos(static_cast<float>(frame) * 0.05f) * 0.2f;
    }
    NSString* fixture_path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"kessho-product-core-native-smoke.caf"];
    NSURL* fixture_url = [NSURL fileURLWithPath:fixture_path];
    [[NSFileManager defaultManager] removeItemAtURL:fixture_url error:nil];
    NSError* fixture_error = nil;
    NSMutableDictionary<NSString*, id>* file_settings = [file_format.settings mutableCopy];
    file_settings[AVLinearPCMIsNonInterleaved] = @NO;
    AVAudioFile* fixture_file = [[AVAudioFile alloc] initForWriting:fixture_url
                                                           settings:file_settings
                                                              error:&fixture_error];
    if (fixture_file == nil || ![fixture_file writeFromBuffer:file_buffer error:&fixture_error]) {
      std::cerr << "failed to write macOS Product Core file decode fixture\n";
      return 1;
    }
    NSError* decode_error = nil;
    if (![renderer registerAudioFileAssetWithId:9002 URL:fixture_url flags:0 error:&decode_error]) {
      std::cerr << "failed to decode/register macOS Product Core audio file asset\n";
      return 1;
    }
    if ([renderer registeredAssetFrameCountWithId:9002] != 512u ||
        [renderer registeredAssetSampleRateWithId:9002] != 48000.0) {
      std::cerr << "macOS Product Core decoded file asset resample mismatch\n";
      return 1;
    }
    if (![renderer unregisterAssetWithId:9002]) {
      std::cerr << "failed to unregister macOS Product Core audio file asset\n";
      return 1;
    }
    [[NSFileManager defaultManager] removeItemAtURL:fixture_url error:nil];
    AudioBufferList* buffers = static_cast<AudioBufferList*>(
        std::calloc(1, sizeof(AudioBufferList) + sizeof(AudioBuffer)));
    if (buffers == nullptr) {
      std::cerr << "failed to allocate macOS Product Core smoke buffers\n";
      return 1;
    }
    float left[kBlockFrames] = {};
    float right[kBlockFrames] = {};
    buffers->mNumberBuffers = 2;
    buffers->mBuffers[0].mNumberChannels = 1;
    buffers->mBuffers[0].mDataByteSize = sizeof(left);
    buffers->mBuffers[0].mData = left;
    buffers->mBuffers[1].mNumberChannels = 1;
    buffers->mBuffers[1].mDataByteSize = sizeof(right);
    buffers->mBuffers[1].mData = right;
    const OSStatus render_status = [renderer renderOfflineFrames:kBlockFrames audioBufferList:buffers];
    std::free(buffers);
    if (render_status != noErr) {
      std::cerr << "failed to render macOS Product Core source node block\n";
      return 1;
    }
    if (!finiteBlock(left, right, kBlockFrames)) {
      std::cerr << "macOS Product Core source node produced non-finite samples\n";
      return 1;
    }
    NSError* probe_error = nil;
    NSDictionary<NSString*, NSNumber*>* probe = [audio_engine runOfflineOutputProbeAndReturnError:&probe_error];
    if (probe == nil || [probe[@"peak"] floatValue] <= 0.00001f || [probe[@"rms"] doubleValue] <= 0.000001) {
      std::cerr << "macOS Product Core offline output probe stayed silent\n";
      return 1;
    }
    NSError* engine_error = nil;
    if (![audio_engine primeDiagnosticOutputAndReturnError:&engine_error]) {
      std::cerr << "failed to prime macOS Product Core diagnostic output\n";
      return 1;
    }
    if (![audio_engine startAndReturnError:&engine_error] || ![audio_engine isRunning]) {
      std::cerr << "failed to start macOS Product Core AVAudioEngine\n";
      return 1;
    }
    [audio_engine handleRouteChange];
    if ([renderer routeChangeCount] != 1u) {
      std::cerr << "macOS Product Core route change count mismatch\n";
      return 1;
    }
    [audio_engine handleInterruptionBegan];
    if ([renderer interruptionBeginCount] != 1u) {
      std::cerr << "macOS Product Core interruption begin count mismatch\n";
      return 1;
    }
    left[0] = 1.0f;
    right[0] = 1.0f;
    buffers = static_cast<AudioBufferList*>(std::calloc(1, sizeof(AudioBufferList) + sizeof(AudioBuffer)));
    if (buffers == nullptr) {
      std::cerr << "failed to allocate macOS Product Core interruption smoke buffers\n";
      return 1;
    }
    buffers->mNumberBuffers = 2;
    buffers->mBuffers[0].mNumberChannels = 1;
    buffers->mBuffers[0].mDataByteSize = sizeof(left);
    buffers->mBuffers[0].mData = left;
    buffers->mBuffers[1].mNumberChannels = 1;
    buffers->mBuffers[1].mDataByteSize = sizeof(right);
    buffers->mBuffers[1].mData = right;
    const OSStatus interrupted_status = [renderer renderOfflineFrames:kBlockFrames audioBufferList:buffers];
    std::free(buffers);
    if (interrupted_status != noErr || peakBlock(left, right, kBlockFrames) != 0.0f) {
      std::cerr << "macOS Product Core interruption silence failed\n";
      return 1;
    }
    if (![audio_engine handleInterruptionEndedShouldResume:YES error:&engine_error]) {
      std::cerr << "macOS Product Core interruption resume failed\n";
      return 1;
    }
    if ([renderer interruptionEndCount] != 1u) {
      std::cerr << "macOS Product Core interruption end count mismatch\n";
      return 1;
    }
    if (![audio_engine handleMediaServicesResetAndReturnError:&engine_error]) {
      std::cerr << "macOS Product Core media services reset recovery failed\n";
      return 1;
    }
    if ([renderer mediaServicesResetCount] != 1u) {
      std::cerr << "macOS Product Core media services reset count mismatch\n";
      return 1;
    }
    KesshoProductTelemetry telemetry{};
    if (![renderer copyTelemetry:&telemetry]) {
      std::cerr << "failed to copy macOS Product Core telemetry\n";
      return 1;
    }
    if (telemetry.sample_rate != 48000.0 || telemetry.block_size != kBlockFrames) {
      std::cerr << "macOS Product Core telemetry mismatch\n";
      return 1;
    }
    [audio_engine stop];
    std::cout << "Kessho Product Core macOS target smoke passed\n";
    return 0;
  }
}
