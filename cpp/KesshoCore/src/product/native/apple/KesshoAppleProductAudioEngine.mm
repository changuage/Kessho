#import <AVFoundation/AVFoundation.h>

#include "KesshoCore/KesshoAppleProductAudioEngine.h"

@implementation KesshoAppleProductAudioEngine {
  KesshoAppleProductAudioRenderer* _renderer;
  AVAudioEngine* _engine;
  AVAudioSourceNode* _sourceNode;
  double _sampleRate;
  uint32_t _maxBlockSize;
  BOOL _wasRunningBeforeInterruption;
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

- (void)handleRouteChange {
  [_renderer handleRouteChange];
  if (_engine.isRunning) {
    [_engine pause];
    [_engine prepare];
    NSError* error = nil;
    (void)[_engine startAndReturnError:&error];
  }
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
