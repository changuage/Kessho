#import <AVFoundation/AVFoundation.h>
#import <CoreAudioKit/AUViewController.h>

#import "../Extension/KesshoAudioUnit.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {

constexpr AUAudioFrameCount kFrames = 256;
constexpr NSInteger kMasterBus = 0;
constexpr NSInteger kPad1Bus = 1;

void require(bool condition, NSString* message) {
  if (condition) return;
  std::fprintf(stderr, "Kessho AU smoke test: %s\n", message.UTF8String);
  std::exit(1);
}

void waitForHostReply(BOOL* finished) {
  NSDate* deadline = [NSDate dateWithTimeIntervalSinceNow:10.0];
  while (!*finished && deadline.timeIntervalSinceNow > 0.0) {
    [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
  }
  require(*finished, @"Audio Unit host timed out");
}

float peak(AVAudioPCMBuffer* buffer, uint32_t start = 0, uint32_t end = kFrames) {
  float value = 0.0f;
  for (uint32_t channel = 0; channel < 2; ++channel) {
    for (uint32_t frame = start; frame < end; ++frame) {
      const float sample = buffer.floatChannelData[channel][frame];
      require(std::isfinite(sample), @"rendered a non-finite sample");
      value = std::max(value, std::fabs(sample));
    }
  }
  return value;
}

}  // namespace

int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
    AudioComponentDescription description{ kAudioUnitType_MusicDevice, 'Ksho', 'Ksho', 0, 0 };
    __block AUAudioUnit* unit = nil;
    __block NSError* openError = nil;
    __block BOOL opened = NO;
    [AUAudioUnit instantiateWithComponentDescription:description
        options:kAudioComponentInstantiation_LoadOutOfProcess
        completionHandler:^(AUAudioUnit* result, NSError* error) {
          dispatch_async(dispatch_get_main_queue(), ^{
            unit = result;
            openError = error;
            opened = YES;
          });
        }];
    waitForHostReply(&opened);
    require(unit != nil, openError.localizedDescription ?: @"could not instantiate Kessho");
    require(unit.outputBusses.count == 10, @"the ten stereo outputs were not published");

    AUParameterTree* tree = unit.parameterTree;
    require(tree.allParameters.count == KesshoParameterCount, @"published parameter count is wrong");
    AUParameter* pad = [tree parameterWithAddress:KesshoParameterPad1Level];
    require([pad.identifier isEqualToString:@"pad1Level"], @"Pad 1 level automation ID is wrong");

    pad.value = 0.3f;
    [tree parameterWithAddress:KesshoParameterReverbMix].value = 0.25f;
    [tree parameterWithAddress:KesshoParameterPadPattern].value = 0.0f;
    NSDictionary* saved = unit.fullStateForDocument;
    pad.value = 1.0f;
    [tree parameterWithAddress:KesshoParameterReverbMix].value = 0.0f;
    [tree parameterWithAddress:KesshoParameterPadPattern].value = 1.0f;
    unit.fullStateForDocument = saved;
    require(std::fabs(pad.value - 0.3f) < 1e-5f &&
        [tree parameterWithAddress:KesshoParameterReverbMix].value == 0.25f &&
        [tree parameterWithAddress:KesshoParameterPadPattern].value == 0.0f,
        @"mixer and pattern settings did not survive project recall");

    NSMutableDictionary* legacy = [saved mutableCopy];
    [legacy addEntriesFromDictionary:@{@"KesshoStateVersion": @1, @"MasterGain": @0.7f,
                                       @"MidiTarget": @1, @"HostSync": @1}];
    for (AUParameter* parameter in tree.allParameters) {
      if (parameter.address >= KesshoParameterPad1Level) [legacy removeObjectForKey:parameter.identifier];
    }
    unit.fullState = legacy;
    NSDictionary* migrated = unit.fullState;
    require(std::fabs([migrated[@"MasterGain"] floatValue] - 0.7f) < 1e-5f &&
        [migrated[@"pad1Level"] floatValue] == 0.75f && [migrated[@"padPattern"] floatValue] == 1.0f,
        @"v0.1 project settings did not migrate to the new defaults");

    [tree parameterWithAddress:KesshoParameterPadPattern].value = 0.0f;
    [tree parameterWithAddress:KesshoParameterDrumPattern].value = 0.0f;
    __block double hostSample = 0.0;
    unit.musicalContextBlock = ^BOOL(double* bpm, double* numerator, NSInteger* denominator,
        double* beat, NSInteger* nextBeat, double* downbeat) {
      if (bpm) *bpm = 120.0;
      if (numerator) *numerator = 7.0;
      if (denominator) *denominator = 8;
      if (beat) *beat = hostSample / 24000.0;
      if (nextBeat) *nextBeat = 0;
      if (downbeat) *downbeat = std::floor(hostSample / 84000.0) * 3.5;
      return YES;
    };
    unit.transportStateBlock = ^BOOL(AUHostTransportStateFlags* flags, double* sample,
        double* cycleStart, double* cycleEnd) {
      if (flags) *flags = AUHostTransportStateMoving;
      if (sample) *sample = hostSample;
      if (cycleStart) *cycleStart = 0.0;
      if (cycleEnd) *cycleEnd = 0.0;
      return YES;
    };
    NSError* allocateError = nil;
    const BOOL allocated = [unit allocateRenderResourcesAndReturnError:&allocateError];
    require(allocated, allocateError.localizedDescription ?: @"could not allocate render resources");

    AURenderBlock render = unit.renderBlock;
    AUScheduleMIDIEventBlock midi = unit.scheduleMIDIEventBlock;
    AUScheduleParameterBlock automation = unit.scheduleParameterBlock;
    require(midi != nil && automation != nil, @"missing host scheduling callbacks");
    AVAudioFormat* format = unit.outputBusses[kMasterBus].format;
    AVAudioPCMBuffer* first = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:kFrames];
    AVAudioPCMBuffer* second = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:kFrames];
    const auto pull = ^(NSInteger bus, AVAudioPCMBuffer* destination) {
      AudioTimeStamp timestamp{};
      timestamp.mFlags = kAudioTimeStampSampleTimeValid;
      timestamp.mSampleTime = hostSample;
      AudioUnitRenderActionFlags flags = 0;
      destination.frameLength = kFrames;
      const AUAudioUnitStatus status = render(&flags, &timestamp, kFrames, bus, destination.mutableAudioBufferList, nil);
      require(status == noErr, [NSString stringWithFormat:@"bus %ld render failed (%d)", (long)bus, status]);
    };

    pull(kMasterBus, first);
    require(peak(first) == 0.0f, @"disabled patterns generated sound");
    hostSample += kFrames;
    const uint8_t noteOn[]{ 0x90, 60, 100 };
    midi(AUEventSampleTimeImmediate, 0, sizeof(noteOn), noteOn);
    for (int block = 0; block < 32; ++block) {
      pull(kMasterBus, first);
      hostSample += kFrames;
    }
    pull(kMasterBus, first);
    require(peak(first) > 1e-5f, @"MIDI note did not reach the master output");
    pull(kPad1Bus, first);
    pull(kPad1Bus, second);
    require(peak(first) > 1e-5f, @"MIDI note did not reach the Pad 1 stem");
    for (uint32_t channel = 0; channel < 2; ++channel) {
      require(std::memcmp(first.floatChannelData[channel], second.floatChannelData[channel],
                         kFrames * sizeof(float)) == 0, @"the same timestamp rendered twice");
    }

    hostSample += kFrames;
    automation(AUEventSampleTimeImmediate + kFrames / 2, 0, KesshoParameterPad1Level, 0.0f);
    pull(kMasterBus, second);
    pull(kPad1Bus, first);
    require(peak(first, 0, kFrames / 2) > 1e-5f && peak(first, kFrames / 2) < 1e-7f,
        @"scheduled fader change missed its sample offset");

    hostSample += kFrames;
    const uint8_t mixerCC[]{ 0xb0, 21, 127 };
    midi(AUEventSampleTimeImmediate, 0, sizeof(mixerCC), mixerCC);
    pull(kMasterBus, second);
    pull(kPad1Bus, first);
    require(peak(first) > 1e-5f, @"MIDI CC 21 did not restore the Pad 1 level");
    require([unit.fullStateForDocument[@"pad1Level"] floatValue] == 1.5f,
        @"MIDI fader change was missing from the project state");

    [unit reset];
    hostSample += kFrames;
    pull(kMasterBus, first);
    require(peak(first) < 1e-7f, @"reset left active notes or effects");
    [unit deallocateRenderResources];

    __block BOOL viewRequested = NO;
    __block NSViewController* editor = nil;
    [unit requestViewControllerWithCompletionHandler:^(NSViewController* controller) {
      dispatch_async(dispatch_get_main_queue(), ^{
        editor = controller;
        viewRequested = YES;
      });
    }];
    waitForHostReply(&viewRequested);
    require(editor.view != nil, @"the host did not receive a native editor");
    std::puts("Kessho AU smoke test passed: project recall, MIDI, sample-offset automation, repeated stems, reset and editor.");
  }
}
