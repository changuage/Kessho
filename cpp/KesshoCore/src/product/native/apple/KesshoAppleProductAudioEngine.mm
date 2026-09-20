#import <AVFoundation/AVFoundation.h>

#include <array>
#include "KesshoCore/KesshoAppleProductAudioEngine.h"

@implementation KesshoAppleProductAudioEngine {
  KesshoAppleProductAudioRenderer* _renderer;
  AVAudioEngine* _engine;
  AVAudioSourceNode* _sourceNode;
  double _sampleRate;
  uint32_t _maxBlockSize;
  BOOL _wasRunningBeforeInterruption;
  uint32_t _interactionEventOverflowCount;
}

- (instancetype)initWithSampleRate:(double)sampleRate maxBlockSize:(uint32_t)maxBlockSize {
  self = [super init];
  if (self == nil) {
    return nil;
  }
  _sampleRate = sampleRate;
  _maxBlockSize = maxBlockSize;
  _renderer = [[KesshoAppleProductAudioRenderer alloc] initWithSampleRate:sampleRate maxBlockSize:maxBlockSize];
  _engine = [[AVAudioEngine alloc] init];
  _wasRunningBeforeInterruption = NO;
  _interactionEventOverflowCount = 0u;
  return self;
}

- (KesshoAppleProductAudioRenderer*)renderer {
  return _renderer;
}

- (BOOL)isRunning {
  return _engine.isRunning;
}

- (BOOL)configureGraphIfNeeded {
  if (_renderer == nil || ![_renderer isValid] || _engine == nil) {
    return NO;
  }
  if (_sourceNode != nil && _sourceNode.engine == _engine) {
    return YES;
  }
  _sourceNode = [_renderer makeSourceNode];
  if (_sourceNode == nil) {
    return NO;
  }
  if (_sourceNode.engine != _engine) {
    [_engine attachNode:_sourceNode];
  }
  AVAudioFormat* format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:_sampleRate channels:2];
  [_engine connect:_sourceNode to:_engine.mainMixerNode format:format];
  [_engine prepare];
  return YES;
}

- (BOOL)startAndReturnError:(NSError* _Nullable* _Nullable)error {
  if (![self configureGraphIfNeeded]) {
    if (error != nullptr) {
      *error = [NSError errorWithDomain:@"KesshoAppleProductAudioEngine"
                                   code:1
                               userInfo:@{NSLocalizedDescriptionKey: @"failed to configure Product Core audio graph"}];
    }
    return NO;
  }
  if (_engine.isRunning) {
    return YES;
  }
  return [_engine startAndReturnError:error];
}

- (void)stop {
  _wasRunningBeforeInterruption = NO;
  [_engine stop];
}

- (BOOL)resetRenderer {
  return [_renderer reset];
}

- (BOOL)loadSnapshotData:(NSData*)data {
  if (data.length != sizeof(KesshoProductSnapshotV2)) {
    return NO;
  }
  return [_renderer loadSnapshot:static_cast<const KesshoProductSnapshotV2*>(data.bytes)];
}

- (BOOL)enqueueEventsData:(NSData*)data {
  if (data.length == 0 || data.length % sizeof(KesshoProductEvent) != 0) {
    return NO;
  }
  const auto* events = static_cast<const KesshoProductEvent*>(data.bytes);
  const NSUInteger count = data.length / sizeof(KesshoProductEvent);
  for (NSUInteger index = 0; index < count; ++index) {
    if (![_renderer enqueueEvent:&events[index]]) {
      return NO;
    }
  }
  return YES;
}

- (BOOL)registerAudioFileAssetWithId:(uint32_t)assetId
                                  URL:(NSURL*)url
                                flags:(uint32_t)flags
                                error:(NSError* _Nullable* _Nullable)error {
  return [_renderer registerAudioFileAssetWithId:assetId URL:url flags:flags error:error];
}

- (BOOL)registerDecodedAssetWithId:(uint32_t)assetId
                          channels:(NSArray<NSData*>*)channels
                        sampleRate:(double)sampleRate
                             flags:(uint32_t)flags {
  if (channels.count == 0 || channels.count > 2 || sampleRate <= 0.0) {
    return NO;
  }
  const NSUInteger byteLength = channels.firstObject.length;
  if (byteLength == 0 || byteLength % sizeof(float) != 0) {
    return NO;
  }
  std::array<const float*, 2> pointers{};
  for (NSUInteger index = 0; index < channels.count; ++index) {
    if (channels[index].length != byteLength) {
      return NO;
    }
    pointers[index] = static_cast<const float*>(channels[index].bytes);
  }
  return [_renderer registerDecodedAssetWithId:assetId
                                       channels:pointers.data()
                                   channelCount:static_cast<uint32_t>(channels.count)
                                     frameCount:static_cast<uint32_t>(byteLength / sizeof(float))
                                     sampleRate:sampleRate
                                          flags:flags];
}

- (BOOL)unregisterAssetWithId:(uint32_t)assetId {
  return [_renderer unregisterAssetWithId:assetId];
}

- (NSData* _Nullable)copyTelemetryData {
  KesshoProductTelemetry telemetry{};
  if (![_renderer copyTelemetry:&telemetry]) {
    return nil;
  }
  return [NSData dataWithBytes:&telemetry length:sizeof(telemetry)];
}

- (BOOL)setInteractionDemandMask:(uint32_t)demandMask sourceMask:(uint32_t)sourceMask {
  return [_renderer setInteractionDemandMask:demandMask sourceMask:sourceMask];
}

- (NSData* _Nullable)copyInteractionSignalsData {
  KesshoProductInteractionSignalSnapshot signals{};
  if (![_renderer copyInteractionSignals:&signals]) {
    return nil;
  }
  return [NSData dataWithBytes:&signals length:sizeof(signals)];
}

- (NSData*)copyInteractionEventsData {
  std::array<KesshoProductInteractionEvent, KESSHO_PRODUCT_INTERACTION_EVENT_CAPACITY> events{};
  const uint32_t count = [_renderer drainInteractionEvents:events.data()
                                               maxEventCount:static_cast<uint32_t>(events.size())
                                               overflowCount:&_interactionEventOverflowCount];
  return [NSData dataWithBytes:events.data() length:count * sizeof(KesshoProductInteractionEvent)];
}

- (uint32_t)interactionEventOverflowCount {
  return _interactionEventOverflowCount;
}

- (void)handleRouteChange {
  (void)[self recoverAfterRouteChangeAndReturnError:nil];
}

- (BOOL)recoverAfterRouteChangeAndReturnError:(NSError* _Nullable* _Nullable)error {
  [_renderer handleRouteChange];
  if (_engine.isRunning) {
    [_engine pause];
    [_engine prepare];
    return [_engine startAndReturnError:error];
  }
  return YES;
}

- (void)handleInterruptionBegan {
  _wasRunningBeforeInterruption = _engine.isRunning;
  [_renderer handleInterruptionBegan];
  [_engine pause];
}

- (BOOL)handleInterruptionEndedShouldResume:(BOOL)shouldResume error:(NSError* _Nullable* _Nullable)error {
  [_renderer handleInterruptionEndedShouldResume:shouldResume];
  if (!shouldResume || !_wasRunningBeforeInterruption) {
    _wasRunningBeforeInterruption = NO;
    return YES;
  }
  _wasRunningBeforeInterruption = NO;
  return [self startAndReturnError:error];
}

- (BOOL)handleMediaServicesResetAndReturnError:(NSError* _Nullable* _Nullable)error {
  const BOOL shouldRestart = _engine.isRunning || _wasRunningBeforeInterruption;
  [_engine stop];
  _engine = [[AVAudioEngine alloc] init];
  _sourceNode = nil;
  [_renderer handleMediaServicesReset];
  _wasRunningBeforeInterruption = NO;
  if (!shouldRestart) {
    return YES;
  }
  return [self startAndReturnError:error];
}

- (BOOL)primeDiagnosticOutputAndReturnError:(NSError* _Nullable* _Nullable)error {
  return [_renderer primeDiagnosticOutputAndReturnError:error];
}

- (NSDictionary<NSString*, NSNumber*>* _Nullable)runOfflineOutputProbeAndReturnError:(NSError* _Nullable* _Nullable)error {
  return [_renderer runOfflineOutputProbeAndReturnError:error];
}

@end
