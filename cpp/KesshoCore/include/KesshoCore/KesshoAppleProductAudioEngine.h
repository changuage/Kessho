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
