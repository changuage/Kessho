#pragma once

#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

#include "KesshoCore/KesshoProductCore.h"
#include "KesshoCore/KesshoProductGeneratedSequencerCapture.h"
#include "KesshoCore/KesshoProductSequencerVariations.h"

NS_ASSUME_NONNULL_BEGIN

@interface KesshoAppleProductAudioRenderer : NSObject
- (instancetype)initWithSampleRate:(double)sampleRate maxBlockSize:(uint32_t)maxBlockSize;
- (BOOL)isValid;
- (BOOL)reset;
- (BOOL)loadSnapshot:(const KesshoProductSnapshotV2*)snapshot;
- (BOOL)enqueueEvent:(const KesshoProductEvent*)event;
- (BOOL)copyCaptureClock:(KesshoProductCaptureClock*)clock;
- (int32_t)setSequencerVariationBank:(uint32_t)sequencerId
                            laneIndex:(uint32_t)laneIndex
                                bank:(const KesshoProductSequencerVariationBank*)bank
                      nativeRevision:(uint64_t*)nativeRevision;
- (int32_t)selectSequencerVariation:(uint32_t)sequencerId
                          laneIndex:(uint32_t)laneIndex
                    variationIndex:(uint32_t)variationIndex;
- (BOOL)copySequencerVariationRuntime:(uint32_t)sequencerId
                             laneIndex:(uint32_t)laneIndex
                              runtime:(KesshoProductSequencerVariationRuntime*)runtime;
- (BOOL)setRecordedCaptureEnabled:(BOOL)enabled
                 sourceLaneIndex:(uint32_t)sourceLaneIndex
                 targetLaneIndex:(uint32_t)targetLaneIndex
                       sourceMode:(uint32_t)sourceMode
                    durationBeats:(double)durationBeats;
- (NSData* _Nullable)copyRecordedCaptureEventsDataWithOverflowCount:(uint32_t*)overflowCount;
- (BOOL)isRecordedCaptureActive;
- (BOOL)copyRecordedCaptureOriginSample:(uint64_t*)sample beat:(double*)beat;
- (BOOL)copyTelemetry:(KesshoProductTelemetry*)telemetry;
- (BOOL)setInteractionDemandMask:(uint32_t)demandMask sourceMask:(uint32_t)sourceMask;
- (BOOL)copyInteractionSignals:(KesshoProductInteractionSignalSnapshot*)signals;
- (uint32_t)drainInteractionEvents:(KesshoProductInteractionEvent*)events
                     maxEventCount:(uint32_t)maxEventCount
                     overflowCount:(uint32_t*)overflowCount;
- (BOOL)registerDecodedAssetWithId:(uint32_t)assetId
                           channels:(const float* _Nonnull const* _Nonnull)channels
                       channelCount:(uint32_t)channelCount
                         frameCount:(uint32_t)frameCount
                         sampleRate:(double)sampleRate
                              flags:(uint32_t)flags;
- (BOOL)registerAudioFileAssetWithId:(uint32_t)assetId
                                  URL:(NSURL*)url
                                flags:(uint32_t)flags
                                error:(NSError* _Nullable* _Nullable)error;
- (BOOL)unregisterAssetWithId:(uint32_t)assetId;
- (uint32_t)registeredAssetFrameCountWithId:(uint32_t)assetId;
- (double)registeredAssetSampleRateWithId:(uint32_t)assetId;
- (void)handleRouteChange;
- (void)handleInterruptionBegan;
- (void)handleInterruptionEndedShouldResume:(BOOL)shouldResume;
- (void)handleMediaServicesReset;
- (uint32_t)routeChangeCount;
- (uint32_t)interruptionBeginCount;
- (uint32_t)interruptionEndCount;
- (uint32_t)mediaServicesResetCount;
- (BOOL)primeDiagnosticOutputAndReturnError:(NSError* _Nullable* _Nullable)error;
- (NSDictionary<NSString*, NSNumber*>* _Nullable)runOfflineOutputProbeAndReturnError:(NSError* _Nullable* _Nullable)error;
- (OSStatus)renderOfflineFrames:(AVAudioFrameCount)frameCount audioBufferList:(AudioBufferList*)outputData;
- (AVAudioSourceNode*)makeSourceNode;
@end

NS_ASSUME_NONNULL_END
