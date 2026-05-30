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
- (void)handleRouteChange;
- (void)handleInterruptionBegan;
- (BOOL)handleInterruptionEndedShouldResume:(BOOL)shouldResume error:(NSError* _Nullable* _Nullable)error;
- (BOOL)handleMediaServicesResetAndReturnError:(NSError* _Nullable* _Nullable)error;
- (BOOL)primeDiagnosticOutputAndReturnError:(NSError* _Nullable* _Nullable)error;
- (NSDictionary<NSString*, NSNumber*>* _Nullable)runOfflineOutputProbeAndReturnError:(NSError* _Nullable* _Nullable)error;
@end

NS_ASSUME_NONNULL_END
