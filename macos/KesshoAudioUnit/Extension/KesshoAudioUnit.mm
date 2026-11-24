#import "KesshoAudioUnit.h"
#import <AVFoundation/AVFoundation.h>

#include <KesshoCore/KesshoProductCore.h>
#include <KesshoCore/KesshoProductDefaults.h>
#include <KesshoCore/KesshoProductParamIds.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <vector>

namespace {

constexpr AUAudioFrameCount kMaximumFrames = 4096;
constexpr uint32_t kOutputBusCount = 10;
constexpr double kMaxExactSample = 9007199254740992.0;
constexpr float kSourceLevel = kessho::product::generated::KESSHO_PRODUCT_DEFAULT_SOURCE_LEVEL;

struct ParameterSpec {
  NSString* identifier;
  NSString* name;
  AudioUnitParameterUnit unit;
  AUValue minimum;
  AUValue maximum;
  AUValue initial;
  uint32_t productParameter = 0;
  uint32_t target = 0;
  uint8_t midiCC = 0;
};

// Addresses are indexes into this table. Append new controls to preserve project automation.
const std::array<ParameterSpec, KesshoParameterCount> kParameters = {{
    {@"masterGain", @"Master Gain", kAudioUnitParameterUnit_LinearGain, 0.0f, 1.25f, 0.8f,
        KESSHO_PRODUCT_PARAM_MASTER_GAIN_ID, 0, 20},
    {@"midiTarget", @"MIDI Target", kAudioUnitParameterUnit_Indexed, 1.0f, 5.0f, 1.0f},
    {@"hostSync", @"Host Sync", kAudioUnitParameterUnit_Boolean, 0.0f, 1.0f, 1.0f},
    {@"pad1Level", @"Pad 1 Level", kAudioUnitParameterUnit_LinearGain, 0.0f, 1.5f, kSourceLevel,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, KESSHO_PRODUCT_SOURCE_PAD1, 21},
    {@"pad2Level", @"Pad 2 Level", kAudioUnitParameterUnit_LinearGain, 0.0f, 1.5f, kSourceLevel,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, KESSHO_PRODUCT_SOURCE_PAD2, 22},
    {@"lead1Level", @"Lead 1 Level", kAudioUnitParameterUnit_LinearGain, 0.0f, 1.5f, kSourceLevel,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, KESSHO_PRODUCT_SOURCE_LEAD1, 23},
    {@"lead2Level", @"Lead 2 Level", kAudioUnitParameterUnit_LinearGain, 0.0f, 1.5f, kSourceLevel,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, KESSHO_PRODUCT_SOURCE_LEAD2, 24},
    {@"drumLevel", @"Drum Level", kAudioUnitParameterUnit_LinearGain, 0.0f, 1.5f, kSourceLevel,
        KESSHO_PRODUCT_PARAM_SOURCE_LEVEL_ID, KESSHO_PRODUCT_SOURCE_DRUM, 25},
    {@"reverbMix", @"Reverb Mix", kAudioUnitParameterUnit_Generic, 0.0f, 1.0f, 0.12f,
        KESSHO_PRODUCT_PARAM_FX_REVERB_MIX_ID, 0, 91},
    {@"padPattern", @"Pad Pattern", kAudioUnitParameterUnit_Boolean, 0.0f, 1.0f, 1.0f,
        KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID, KESSHO_PRODUCT_SEQUENCER_SYNTH},
    {@"drumPattern", @"Drum Pattern", kAudioUnitParameterUnit_Boolean, 0.0f, 1.0f, 1.0f,
        KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_ENABLED_ID, KESSHO_PRODUCT_SEQUENCER_DRUM},
}};

static_assert(std::atomic<AUValue>::is_always_lock_free);

AUValue normalizedParameter(const ParameterSpec& spec, AUValue value) noexcept {
  const AUValue clamped = std::clamp(value, spec.minimum, spec.maximum);
  return spec.unit == kAudioUnitParameterUnit_Indexed || spec.unit == kAudioUnitParameterUnit_Boolean
      ? std::round(clamped)
      : clamped;
}

NSString* stateKey(AUParameterAddress address) {
  switch (address) {
    case KesshoParameterMasterGain: return @"MasterGain";
    case KesshoParameterMidiTarget: return @"MidiTarget";
    case KesshoParameterHostSync: return @"HostSync";
    default: return kParameters[address].identifier;
  }
}

const std::array<NSString*, kOutputBusCount> kBusNames = {
    @"Master", @"Pad 1", @"Pad 2", @"Lead 1", @"Lead 2",
    @"Drums", @"Piano", @"Earth", @"Sample 2", @"FX"};

uint32_t sampleOffset(const AURenderEvent* event, const AudioTimeStamp* timestamp,
                      AUAudioFrameCount frameCount) noexcept {
  if (event == nullptr || timestamp == nullptr || frameCount == 0) return 0;
  const AUEventSampleTime eventTime = event->head.eventSampleTime;
  if ((timestamp->mFlags & kAudioTimeStampSampleTimeValid) == 0 ||
      !std::isfinite(timestamp->mSampleTime)) return 0;
  const double offset = static_cast<double>(eventTime) - timestamp->mSampleTime;
  return static_cast<uint32_t>(std::clamp(offset, 0.0, static_cast<double>(frameCount - 1)));
}

bool supportsRenderFormat(AVAudioFormat* format) noexcept {
  if (format == nil || format.streamDescription == nullptr) return false;
  const AudioStreamBasicDescription& description = *format.streamDescription;
  return description.mFormatID == kAudioFormatLinearPCM &&
      (description.mFormatFlags & kAudioFormatFlagIsFloat) != 0u &&
      (description.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0u &&
      description.mBitsPerChannel == 32u &&
      description.mBytesPerFrame == sizeof(float) &&
      description.mFramesPerPacket == 1u &&
      description.mChannelsPerFrame == 2u &&
      std::isfinite(description.mSampleRate) && description.mSampleRate > 0.0;
}

}  // namespace

@implementation KesshoAudioUnit {
  AUAudioUnitBusArray* _outputBusses;
  AUParameterTree* _parameterTree;
  AUHostMusicalContextBlock _cachedMusicalContextBlock;
  AUHostTransportStateBlock _cachedTransportStateBlock;

  KesshoProductEngine* _engine;
  std::array<std::vector<float>, kOutputBusCount * 2> _renderCache;
  std::array<std::atomic<AUValue>, KesshoParameterCount> _parameterValues;
  std::array<AUValue, KesshoParameterCount> _appliedParameters;
  std::atomic_flag _renderLock;
  std::array<std::array<uint8_t, 128>, 16> _midiNoteTargets;
  std::array<uint8_t, 16> _midiSustainTargetMasks;
  std::array<bool, 16> _midiSustainDown;

  AUEventSampleTime _cachedSampleTime;
  AUAudioFrameCount _cachedFrameCount;
  double _lastTempo;
  double _lastBeatsPerBar;
  double _expectedHostSamplePosition;
  bool _transportMoving;
  bool _freeRunStarted;
}

- (instancetype)initWithComponentDescription:(AudioComponentDescription)componentDescription
                                      options:(AudioComponentInstantiationOptions)options
                                        error:(NSError**)outError {
  self = [super initWithComponentDescription:componentDescription options:options error:outError];
  if (self == nil) return nil;

  _renderLock.clear(std::memory_order_relaxed);
  self.maximumFramesToRender = kMaximumFrames;

  AVAudioFormat* format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:48000.0 channels:2];
  NSMutableArray<AUAudioUnitBus*>* busses = [NSMutableArray arrayWithCapacity:kOutputBusCount];
  for (uint32_t index = 0; index < kOutputBusCount; ++index) {
    AUAudioUnitBus* bus = [[AUAudioUnitBus alloc] initWithFormat:format error:outError];
    if (bus == nil) return nil;
    bus.name = kBusNames[index];
    bus.supportedChannelCounts = @[@2];
    [busses addObject:bus];
  }
  _outputBusses = [[AUAudioUnitBusArray alloc] initWithAudioUnit:self
                                                        busType:AUAudioUnitBusTypeOutput
                                                         busses:busses];

  NSMutableArray<AUParameter*>* parameters = [NSMutableArray arrayWithCapacity:kParameters.size()];
  for (AUParameterAddress address = 0; address < kParameters.size(); ++address) {
    const ParameterSpec& spec = kParameters[address];
    NSArray<NSString*>* values = nil;
    AudioUnitParameterOptions flags = kAudioUnitParameterFlag_IsReadable | kAudioUnitParameterFlag_IsWritable;
    if (address == KesshoParameterMidiTarget) {
      values = @[@"Pad 1", @"Pad 2", @"Lead 1", @"Lead 2", @"Drums"];
    } else if (spec.unit == kAudioUnitParameterUnit_Boolean) {
      values = @[@"Off", @"On"];
    } else {
      flags |= kAudioUnitParameterFlag_IsHighResolution;
    }
    _parameterValues[address].store(spec.initial, std::memory_order_relaxed);
    AUParameter* parameter = [AUParameterTree createParameterWithIdentifier:spec.identifier
        name:spec.name address:address min:spec.minimum max:spec.maximum unit:spec.unit unitName:nil
        flags:flags valueStrings:values dependentParameters:nil];
    parameter.value = spec.initial;
    [parameters addObject:parameter];
  }
  _parameterTree = [AUParameterTree createTreeWithChildren:parameters];

  __weak KesshoAudioUnit* weakUnit = self;
  _parameterTree.implementorValueProvider = ^AUValue(AUParameter* parameter) {
    KesshoAudioUnit* unit = weakUnit;
    return unit != nil && parameter.address < kParameters.size()
        ? unit->_parameterValues[parameter.address].load(std::memory_order_relaxed)
        : 0.0f;
  };
  _parameterTree.implementorValueObserver = ^(AUParameter* parameter, AUValue value) {
    KesshoAudioUnit* unit = weakUnit;
    const AUParameterAddress address = parameter.address;
    if (unit == nil || address >= kParameters.size() || !std::isfinite(value)) return;
    unit->_parameterValues[address].store(normalizedParameter(kParameters[address], value),
                                           std::memory_order_relaxed);
  };
  return self;
}

- (void)dealloc {
  if (_engine != nullptr) kessho_product_destroy(_engine);
}

- (AUAudioUnitBusArray*)outputBusses { return _outputBusses; }
- (AUParameterTree*)parameterTree { return _parameterTree; }
- (BOOL)canProcessInPlace { return NO; }

- (BOOL)shouldChangeToFormat:(AVAudioFormat*)format forBus:(AUAudioUnitBus*)bus {
  if (self.renderResourcesAllocated || !supportsRenderFormat(format)) return NO;
  for (AUAudioUnitBus* outputBus in _outputBusses) {
    if (outputBus == bus) return YES;
  }
  return NO;
}

- (NSDictionary<NSString*, id>*)fullState {
  NSMutableDictionary<NSString*, id>* state = [[super fullState] mutableCopy] ?: [NSMutableDictionary dictionary];
  state[@"KesshoStateVersion"] = @2;
  for (AUParameterAddress address = 0; address < kParameters.size(); ++address) {
    state[stateKey(address)] = @(_parameterValues[address].load(std::memory_order_relaxed));
  }
  return state;
}

- (void)setFullState:(NSDictionary<NSString*, id>*)fullState {
  [super setFullState:fullState];
  id version = fullState[@"KesshoStateVersion"];
  const bool legacy = [version isKindOfClass:NSNumber.class] && [version integerValue] == 1;
  for (AUParameter* parameter in _parameterTree.allParameters) {
    const AUParameterAddress address = parameter.address;
    const ParameterSpec& spec = kParameters[address];
    id value = fullState[stateKey(address)];
    AUValue restored;
    if ([value isKindOfClass:NSNumber.class] && std::isfinite([value floatValue])) {
      restored = normalizedParameter(spec, [value floatValue]);
    } else if (legacy && address >= KesshoParameterPad1Level) {
      restored = spec.initial;
    } else {
      continue;
    }
    parameter.value = restored;
    _parameterValues[address].store(restored, std::memory_order_relaxed);
  }
}

- (BOOL)allocateRenderResourcesAndReturnError:(NSError**)outError {
  double sampleRate = 0.0;
  for (AUAudioUnitBus* bus in _outputBusses) {
    if (!bus.enabled) continue;
    if (!supportsRenderFormat(bus.format) ||
        (sampleRate > 0.0 && std::fabs(bus.format.sampleRate - sampleRate) > 0.0001)) {
      if (outError != nullptr) {
        *outError = [NSError errorWithDomain:@"app.kessho.audio-unit"
                                        code:2
                                    userInfo:@{NSLocalizedDescriptionKey:
                                        @"All active Kessho outputs must use the same stereo, non-interleaved Float32 format."}];
      }
      return NO;
    }
    sampleRate = bus.format.sampleRate;
  }
  if (sampleRate <= 0.0) sampleRate = _outputBusses[0].format.sampleRate;
  if (![super allocateRenderResourcesAndReturnError:outError]) return NO;
  if (_engine != nullptr) {
    kessho_product_destroy(_engine);
    _engine = nullptr;
  }

  _engine = kessho_product_create(sampleRate, kMaximumFrames, 0);
  if (_engine == nullptr) {
    if (outError != nullptr) {
      *outError = [NSError errorWithDomain:@"app.kessho.audio-unit"
                                      code:1
                                  userInfo:@{NSLocalizedDescriptionKey: @"Product Core could not be created."}];
    }
    [super deallocateRenderResources];
    return NO;
  }

  for (auto& channel : _renderCache) channel.assign(kMaximumFrames, 0.0f);
  _cachedMusicalContextBlock = [self.musicalContextBlock copy];
  _cachedTransportStateBlock = [self.transportStateBlock copy];
  [self resetEngineState];
  return YES;
}

- (void)resetEngineState {
  if (_engine == nullptr) return;
  kessho_product_reset(_engine);
  (void)kessho_product_set_stems_enabled(_engine, 1);
  for (uint32_t source = KESSHO_PRODUCT_SOURCE_PAD1; source <= KESSHO_PRODUCT_SOURCE_DRUM; ++source) {
    KesshoProductEvent event{};
    event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_SOURCE_ENABLED;
    event.target_id = source;
    event.value = 1.0f;
    event.flags = KESSHO_PRODUCT_SOURCE_ENABLE_IMMEDIATE;
    (void)kessho_product_enqueue_event(_engine, &event);
  }
  _appliedParameters.fill(std::numeric_limits<AUValue>::quiet_NaN());
  _cachedSampleTime = std::numeric_limits<AUEventSampleTime>::min();
  _cachedFrameCount = 0;
  _lastTempo = 0.0;
  _lastBeatsPerBar = 4.0;
  _expectedHostSamplePosition = std::numeric_limits<double>::quiet_NaN();
  _transportMoving = false;
  _freeRunStarted = false;
  for (auto& channel : _midiNoteTargets) channel.fill(0u);
  _midiSustainTargetMasks.fill(0u);
  _midiSustainDown.fill(false);
}

- (void)reset {
  [super reset];
  [self resetEngineState];
}

- (void)deallocateRenderResources {
  if (_engine != nullptr) {
    kessho_product_destroy(_engine);
    _engine = nullptr;
  }
  for (auto& channel : _renderCache) channel.clear();
  _cachedMusicalContextBlock = nil;
  _cachedTransportStateBlock = nil;
  [super deallocateRenderResources];
}

- (void)syncHostForFrameCount:(AUAudioFrameCount)frameCount {
  const double unknown = std::numeric_limits<double>::quiet_NaN();
  double hostTempo = unknown;
  double numerator = unknown;
  NSInteger denominator = 0;
  double beatPosition = unknown;
  double measureDownbeat = unknown;
  const bool hasContext = _cachedMusicalContextBlock != nil &&
      _cachedMusicalContextBlock(&hostTempo, &numerator, &denominator, &beatPosition, nullptr, &measureDownbeat);
  const float tempo = hasContext && std::isfinite(hostTempo) && hostTempo > 0.0
      ? static_cast<float>(std::clamp(hostTempo, 1.0, 400.0))
      : static_cast<float>(_lastTempo > 0.0 ? _lastTempo : 120.0);
  const double reportedMeter = hasContext && denominator > 0 ? numerator * 4.0 / denominator : 0.0;
  const double beatsPerBar = reportedMeter >= 0.125 && reportedMeter <= 32.0
      ? reportedMeter
      : _lastBeatsPerBar;
  const bool meterChanged = beatsPerBar != _lastBeatsPerBar;
  AUHostTransportStateFlags flags = 0;
  double hostSamplePosition = unknown;
  if (_cachedTransportStateBlock != nil &&
      _cachedTransportStateBlock(&flags, &hostSamplePosition, nullptr, nullptr) &&
      std::fabs(hostSamplePosition) <= kMaxExactSample) {
    const bool moving = (flags & AUHostTransportStateMoving) != 0;
    const bool needsAnchor = !std::isfinite(_expectedHostSamplePosition) ||
        std::fabs(hostSamplePosition - _expectedHostSamplePosition) > 0.5 ||
        moving != _transportMoving || (flags & AUHostTransportStateChanged) != 0 || meterChanged;
    _expectedHostSamplePosition = hostSamplePosition + (moving ? frameCount : 0);
    if (needsAnchor) {
      if (!hasContext || !(std::fabs(beatPosition) <= kMaxExactSample)) beatPosition = 0.0;
      const double beatInBar = beatPosition - measureDownbeat;
      if (!hasContext || !(beatInBar >= -1e-6 && beatInBar <= beatsPerBar + 1e-6)) {
        measureDownbeat = std::floor(beatPosition / beatsPerBar) * beatsPerBar;
      }
      const uint64_t sample = static_cast<uint64_t>(std::max(0.0, hostSamplePosition));
      if (kessho_product_set_host_position(
              _engine, sample, beatPosition, beatsPerBar, measureDownbeat, tempo, moving) == KESSHO_PRODUCT_OK) {
        _lastTempo = tempo;
        _lastBeatsPerBar = beatsPerBar;
        _transportMoving = moving;
        return;
      }
      _expectedHostSamplePosition = unknown;
    }
  }
  if (std::fabs(tempo - _lastTempo) <= 0.0001 && !meterChanged) return;

  KesshoProductEvent event{};
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_TRANSPORT;
  event.value = tempo;
  event.value2 = static_cast<float>(beatsPerBar);
  if (kessho_product_enqueue_event(_engine, &event) == KESSHO_PRODUCT_OK) {
    _lastTempo = tempo;
    _lastBeatsPerBar = beatsPerBar;
  }
}

- (BOOL)enqueueParameter:(AUParameterAddress)address value:(AUValue)value offset:(uint32_t)offset {
  const ParameterSpec& spec = kParameters[address];
  if (spec.productParameter == 0u || _appliedParameters[address] == value) return YES;

  KesshoProductEvent event{};
  event.sample_offset = offset;
  event.event_kind = KESSHO_PRODUCT_EVENT_KIND_SET_PARAM;
  event.param_id = spec.productParameter;
  event.target_id = spec.target;
  event.value = value;
  if (kessho_product_enqueue_event(_engine, &event) != KESSHO_PRODUCT_OK) return NO;
  _appliedParameters[address] = value;
  return YES;
}

- (BOOL)enqueueRealtimeEvents:(const AURenderEvent*)events
                    timestamp:(const AudioTimeStamp*)timestamp
                   frameCount:(AUAudioFrameCount)frameCount
                      hostSync:(BOOL)hostSync {
  const auto targetBit = [](uint32_t target) noexcept -> uint8_t {
    return target >= KESSHO_PRODUCT_SOURCE_PAD1 && target <= KESSHO_PRODUCT_SOURCE_DRUM
        ? static_cast<uint8_t>(1u << (target - KESSHO_PRODUCT_SOURCE_PAD1))
        : 0u;
  };
  const auto enqueueMidi = [&](uint32_t offset, uint32_t target, uint8_t status,
                               uint8_t data1, uint8_t data2) noexcept {
    KesshoProductEvent productEvent{};
    productEvent.sample_offset = offset;
    productEvent.event_kind = KESSHO_PRODUCT_EVENT_KIND_MIDI_EVENT;
    productEvent.target_id = target;
    productEvent.index = status & 0x0fu;
    productEvent.value = static_cast<float>(status);
    productEvent.value2 = static_cast<float>(data1);
    productEvent.value3 = static_cast<float>(data2);
    (void)kessho_product_enqueue_event(_engine, &productEvent);
  };
  const auto enqueueForMask = [&](uint8_t mask, uint32_t offset, uint8_t status,
                                  uint8_t data1, uint8_t data2) noexcept {
    for (uint32_t target = KESSHO_PRODUCT_SOURCE_PAD1;
         target <= KESSHO_PRODUCT_SOURCE_DRUM; ++target) {
      if ((mask & targetBit(target)) != 0u) enqueueMidi(offset, target, status, data1, data2);
    }
  };

  for (const AURenderEvent* event = events; event != nullptr; event = event->head.next) {
    if (event->head.eventType == AURenderEventParameter ||
        event->head.eventType == AURenderEventParameterRamp) {
      const AUParameterAddress address = event->parameter.parameterAddress;
      if (address >= kParameters.size() || !std::isfinite(event->parameter.value)) continue;
      const AUValue value = normalizedParameter(kParameters[address], event->parameter.value);
      const uint32_t offset = sampleOffset(event, timestamp, frameCount);
      if ([self enqueueParameter:address value:value offset:offset]) {
        _parameterValues[address].store(value, std::memory_order_relaxed);
        // shortcut: mid-block Host Sync changes apply at the next boundary, until mode changes can split renders.
        if (address == KesshoParameterHostSync && offset == 0u) {
          hostSync = value != 0.0f;
        }
      }
      continue;
    }
    if (event->head.eventType != AURenderEventMIDI || event->MIDI.length == 0) continue;
    const uint8_t* data = event->MIDI.data;
    const uint8_t status = data[0];
    const uint8_t command = status & 0xf0u;
    const uint8_t expectedLength = (command == 0xc0u || command == 0xd0u) ? 2u : 3u;
    if (status < 0x80u || status >= 0xf0u || event->MIDI.length < expectedLength) continue;

    const uint32_t offset = sampleOffset(event, timestamp, frameCount);
    const uint8_t channel = status & 0x0fu;
    const uint8_t data1 = data[1];
    const uint8_t data2 = expectedLength == 3u ? data[2] : 0u;
    if (data1 > 127u || data2 > 127u) continue;
    if (command == 0xb0u && ((data1 >= 20u && data1 <= 25u) || data1 == 91u)) {
      for (AUParameterAddress address = 0; address < kParameters.size(); ++address) {
        const ParameterSpec& spec = kParameters[address];
        if (spec.midiCC != data1) continue;
        const AUValue value = spec.minimum + (spec.maximum - spec.minimum) * (data2 / 127.0f);
        if ([self enqueueParameter:address value:value offset:offset]) {
          _parameterValues[address].store(value, std::memory_order_relaxed);
        }
        break;
      }
      continue;
    }
    const uint32_t currentTarget = static_cast<uint32_t>(
        _parameterValues[KesshoParameterMidiTarget].load(std::memory_order_relaxed));

    if (command == 0x90u && data2 != 0u) {
      const uint32_t previousTarget = _midiNoteTargets[channel][data1];
      if (previousTarget != 0u && previousTarget != currentTarget) {
        enqueueMidi(offset, previousTarget, static_cast<uint8_t>(0x80u | channel), data1, 0u);
      }
      if (_midiSustainDown[channel] &&
          (_midiSustainTargetMasks[channel] & targetBit(currentTarget)) == 0u) {
        enqueueMidi(offset, currentTarget, static_cast<uint8_t>(0xb0u | channel), 64u, 127u);
        _midiSustainTargetMasks[channel] |= targetBit(currentTarget);
      }
      _midiNoteTargets[channel][data1] = static_cast<uint8_t>(currentTarget);
      enqueueMidi(offset, currentTarget, status, data1, data2);
      continue;
    }
    if (command == 0x80u || (command == 0x90u && data2 == 0u)) {
      const uint32_t noteTarget = _midiNoteTargets[channel][data1];
      const uint32_t resolvedTarget = noteTarget != 0u ? noteTarget : currentTarget;
      if (_midiSustainDown[channel]) {
        _midiSustainTargetMasks[channel] |= targetBit(resolvedTarget);
      }
      _midiNoteTargets[channel][data1] = 0u;
      enqueueMidi(offset, resolvedTarget, status, data1, data2);
      continue;
    }
    if (command == 0xb0u && data1 == 64u) {
      if (data2 >= 64u) {
        _midiSustainDown[channel] = true;
        uint8_t targetMask = targetBit(currentTarget);
        for (uint8_t target : _midiNoteTargets[channel]) targetMask |= targetBit(target);
        _midiSustainTargetMasks[channel] |= targetMask;
        enqueueForMask(targetMask, offset, status, data1, data2);
      } else {
        uint8_t targetMask = _midiSustainTargetMasks[channel] | targetBit(currentTarget);
        for (uint8_t target : _midiNoteTargets[channel]) targetMask |= targetBit(target);
        enqueueForMask(targetMask, offset, status, data1, data2);
        _midiSustainTargetMasks[channel] = 0u;
        _midiSustainDown[channel] = false;
      }
      continue;
    }
    if (command == 0xb0u && (data1 == 120u || data1 == 123u)) {
      uint8_t targetMask = _midiSustainTargetMasks[channel] | targetBit(currentTarget);
      for (uint8_t target : _midiNoteTargets[channel]) targetMask |= targetBit(target);
      enqueueForMask(targetMask, offset, status, data1, data2);
      _midiNoteTargets[channel].fill(0u);
      _midiSustainTargetMasks[channel] = 0u;
      _midiSustainDown[channel] = false;
      continue;
    }
    enqueueMidi(offset, currentTarget, status, data1, data2);
  }
  return hostSync;
}

- (AUAudioUnitStatus)renderFrameCount:(AUAudioFrameCount)frameCount
                      outputBusNumber:(NSInteger)outputBusNumber
                           outputData:(AudioBufferList*)outputData
                            timestamp:(const AudioTimeStamp*)timestamp
                               events:(const AURenderEvent*)events {
  if (_engine == nullptr) return kAudioUnitErr_Uninitialized;
  if (frameCount == 0 || frameCount > kMaximumFrames) return kAudioUnitErr_TooManyFramesToProcess;
  if (outputBusNumber < 0 || outputBusNumber >= kOutputBusCount ||
      outputData == nullptr || outputData->mNumberBuffers != 2) {
    return kAudio_ParamError;
  }
  const uint32_t bytes = frameCount * sizeof(float);
  for (uint32_t channel = 0; channel < 2; ++channel) {
    const AudioBuffer& buffer = outputData->mBuffers[channel];
    if (buffer.mData != nullptr && buffer.mDataByteSize < bytes) return kAudio_ParamError;
  }
  // shortcut: bus pulls are serialized, concurrent pulls need a shared render cache protocol.
  if (_renderLock.test_and_set(std::memory_order_acquire)) return kAudioUnitErr_CannotDoInCurrentContext;

  const AUEventSampleTime sampleTime = (timestamp != nullptr &&
      (timestamp->mFlags & kAudioTimeStampSampleTimeValid) != 0 &&
      std::fabs(timestamp->mSampleTime) <= kMaxExactSample)
      ? static_cast<AUEventSampleTime>(timestamp->mSampleTime)
      : _cachedSampleTime + static_cast<AUEventSampleTime>(_cachedFrameCount);
  if (sampleTime != _cachedSampleTime || frameCount != _cachedFrameCount) {
    for (AUParameterAddress address = 0; address < kParameters.size(); ++address) {
      if (kParameters[address].productParameter == 0u) continue;
      const AUValue value = _parameterValues[address].load(std::memory_order_relaxed);
      if (value != _appliedParameters[address]) [self enqueueParameter:address value:value offset:0u];
    }
    BOOL hostSync = _parameterValues[KesshoParameterHostSync].load(std::memory_order_relaxed) != 0.0f;
    if (events != nullptr) {
      hostSync = [self enqueueRealtimeEvents:events timestamp:timestamp frameCount:frameCount hostSync:hostSync];
    }
    if (hostSync) {
      _freeRunStarted = false;
      [self syncHostForFrameCount:frameCount];
    } else if (!_freeRunStarted) {
      KesshoProductEvent event{};
      event.event_kind = KESSHO_PRODUCT_EVENT_KIND_START;
      _freeRunStarted = kessho_product_enqueue_event(_engine, &event) == KESSHO_PRODUCT_OK;
      _expectedHostSamplePosition = std::numeric_limits<double>::quiet_NaN();
    }
    float* masterLeft = _renderCache[0].data();
    float* masterRight = _renderCache[1].data();
    kessho_product_render(_engine, masterLeft, masterRight, frameCount);
    _cachedSampleTime = sampleTime;
    _cachedFrameCount = frameCount;
  }

  const size_t cacheIndex = static_cast<size_t>(outputBusNumber) * 2;
  for (uint32_t channel = 0; channel < 2; ++channel) {
    AudioBuffer& buffer = outputData->mBuffers[channel];
    float* storage = _renderCache[cacheIndex + channel].data();
    if (buffer.mData == nullptr) buffer.mData = storage;
    if (outputBusNumber == 0 && buffer.mData != storage) std::memcpy(buffer.mData, storage, bytes);
    buffer.mDataByteSize = bytes;
  }

  AUAudioUnitStatus status = noErr;
  if (outputBusNumber > 0 &&
      kessho_product_get_stem(_engine, static_cast<uint32_t>(outputBusNumber),
          static_cast<float*>(outputData->mBuffers[0].mData),
          static_cast<float*>(outputData->mBuffers[1].mData), frameCount) != KESSHO_PRODUCT_OK) {
    status = kAudio_ParamError;
  }
  _renderLock.clear(std::memory_order_release);
  return status;
}

- (AUInternalRenderBlock)internalRenderBlock {
  __unsafe_unretained KesshoAudioUnit* unit = self;
  return ^AUAudioUnitStatus(AudioUnitRenderActionFlags* actionFlags,
                           const AudioTimeStamp* timestamp,
                           AUAudioFrameCount frameCount,
                           NSInteger outputBusNumber,
                           AudioBufferList* outputData,
                           const AURenderEvent* realtimeEventListHead,
                           AURenderPullInputBlock pullInputBlock) {
    (void)actionFlags;
    (void)pullInputBlock;
    return [unit renderFrameCount:frameCount
                  outputBusNumber:outputBusNumber
                       outputData:outputData
                        timestamp:timestamp
                           events:realtimeEventListHead];
  };
}

@end

