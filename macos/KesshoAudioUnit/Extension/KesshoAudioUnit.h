#pragma once

#import <AudioToolbox/AudioToolbox.h>

typedef NS_ENUM(AUParameterAddress, KesshoParameterAddress) {
  KesshoParameterMasterGain = 0,
  KesshoParameterMidiTarget = 1,
  KesshoParameterHostSync = 2,
  KesshoParameterPad1Level = 3,
  KesshoParameterPad2Level = 4,
  KesshoParameterLead1Level = 5,
  KesshoParameterLead2Level = 6,
  KesshoParameterDrumLevel = 7,
  KesshoParameterReverbMix = 8,
  KesshoParameterPadPattern = 9,
  KesshoParameterDrumPattern = 10,
  KesshoParameterCount
};

@interface KesshoAudioUnit : AUAudioUnit
@end

