#pragma once

#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

#include "KesshoCore/KesshoAppleProductAudioRenderer.h"

NS_ASSUME_NONNULL_BEGIN

@interface KesshoAppleProductAudioEngine : NSObject
- (instancetype)initWithSampleRate:(double)sampleRate maxBlockSize:(uint32_t)maxBlockSize;
- (KesshoAppleProductAudioRenderer*)renderer;
- (BOOL)isRunning;
- (BOOL)startAndReturnError:(NSError* _Nullable* _Nullable)error;
- (void)stop;
- (BOOL)resetRenderer;
- (BOOL)loadSnapshotData:(NSData*)data;
- (BOOL)enqueueEventsData:(NSData*)data;
- (NSData* _Nullable)copyCaptureClockData;
- (NSDictionary<NSString*, NSNumber*>*)setSynthSequenceVariationBankData:(NSData*)data
                                                                  laneIndex:(uint32_t)laneIndex;
- (BOOL)selectSynthSequenceVariation:(uint32_t)variationIndex
                            laneIndex:(uint32_t)laneIndex;
- (NSData* _Nullable)copySynthSequenceVariationRuntimeDataForLane:(uint32_t)laneIndex;
- (BOOL)setRecordedCaptureEnabled:(BOOL)enabled
                 sourceLaneIndex:(uint32_t)sourceLaneIndex
                 targetLaneIndex:(uint32_t)targetLaneIndex
                       sourceMode:(uint32_t)sourceMode
                    durationBeats:(double)durationBeats;
- (NSData* _Nullable)copyRecordedCaptureEventsDataWithOverflowCount:(uint32_t*)overflowCount;
- (BOOL)isRecordedCaptureActive;
- (BOOL)copyRecordedCaptureOriginSample:(uint64_t*)sample beat:(double*)beat;
- (BOOL)registerAudioFileAssetWithId:(uint32_t)assetId
                                  URL:(NSURL*)url
                                flags:(uint32_t)flags
                                error:(NSError* _Nullable* _Nullable)error;
- (BOOL)registerDecodedAssetWithId:(uint32_t)assetId
                          channels:(NSArray<NSData*>*)channels
                        sampleRate:(double)sampleRate
                             flags:(uint32_t)flags;
- (BOOL)unregisterAssetWithId:(uint32_t)assetId;
- (NSData* _Nullable)copyTelemetryData;
- (BOOL)setInteractionDemandMask:(uint32_t)demandMask sourceMask:(uint32_t)sourceMask;
- (NSData* _Nullable)copyInteractionSignalsData;
- (NSData*)copyInteractionEventsData;
- (uint32_t)interactionEventOverflowCount;
- (void)handleRouteChange;
- (BOOL)recoverAfterRouteChangeAndReturnError:(NSError* _Nullable* _Nullable)error;
- (void)handleInterruptionBegan;
- (BOOL)handleInterruptionEndedShouldResume:(BOOL)shouldResume error:(NSError* _Nullable* _Nullable)error;
- (BOOL)handleMediaServicesResetAndReturnError:(NSError* _Nullable* _Nullable)error;
- (BOOL)primeDiagnosticOutputAndReturnError:(NSError* _Nullable* _Nullable)error;
- (NSDictionary<NSString*, NSNumber*>* _Nullable)runOfflineOutputProbeAndReturnError:(NSError* _Nullable* _Nullable)error;
@end

NS_ASSUME_NONNULL_END
