#include "digitone/Engine.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace digitone {
namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;
constexpr float kMinSampleRate = 1000.0f;
constexpr float kMaxSampleRate = 384000.0f;

float clampUnit(float value) noexcept {
    return std::max(0.0f, std::min(1.0f, value));
}

float clampSigned(float value, float limit) noexcept {
    return std::max(-limit, std::min(limit, value));
}

float midiFrequency(int midiNote) noexcept {
    const float note = static_cast<float>(std::max(0, std::min(127, midiNote)));
    return 440.0f * std::exp2((note - 69.0f) / 12.0f);
}

float finiteOr(float value, float fallback) noexcept {
    return std::isfinite(value) ? value : fallback;
}

} // namespace

void Engine::triggerEnvelope(EnvelopeState& envelope) noexcept {
    envelope.value = 0.0f;
    envelope.stage = 0;
}

void Engine::releaseEnvelope(EnvelopeState& envelope) noexcept {
    if (envelope.stage != 4) envelope.stage = 3;
}

float Engine::advanceEnvelope(EnvelopeState& envelope,
                              const EnvelopeParams& params,
                              bool released,
                              float sampleRate,
                              float timeScale) noexcept {
    if (released && envelope.stage != 4) envelope.stage = 3;
    const float dt = 1.0f / std::max(kMinSampleRate, sampleRate);
    const float scale = std::max(0.001f, finiteOr(timeScale, 1.0f));
    const float attack = std::max(0.0f, finiteOr(params.attackSeconds, 0.0f)) * scale;
    const float decay = std::max(0.0f, finiteOr(params.decaySeconds, 0.0f)) * scale;
    const float release = std::max(0.0f, finiteOr(params.releaseSeconds, 0.0f)) * scale;
    const float sustain = clampUnit(finiteOr(params.sustain, 0.0f));

    switch (envelope.stage) {
    case 0: // attack
        if (attack <= dt) {
            envelope.value = 1.0f;
            envelope.stage = 1;
        } else {
            envelope.value += dt / attack;
            if (envelope.value >= 1.0f) {
                envelope.value = 1.0f;
                envelope.stage = 1;
            }
        }
        break;
    case 1: // decay
        if (decay <= dt) {
            envelope.value = sustain;
            envelope.stage = 2;
        } else {
            envelope.value += (sustain - envelope.value) * (dt / decay);
            if (std::fabs(envelope.value - sustain) < 0.00001f) {
                envelope.value = sustain;
                envelope.stage = 2;
            }
        }
        break;
    case 2: // sustain
        envelope.value = sustain;
        break;
    case 3: // release
        if (release <= dt) {
            envelope.value = 0.0f;
            envelope.stage = 4;
        } else {
            envelope.value -= dt / release;
            if (envelope.value <= 0.000001f) {
                envelope.value = 0.0f;
                envelope.stage = 4;
            }
        }
        break;
    default:
        envelope.value = 0.0f;
        envelope.stage = 4;
        break;
    }
    envelope.value = clampUnit(finiteOr(envelope.value, 0.0f));
    return envelope.value;
}

namespace {

float lfoValue(float phase, LfoWaveform waveform,
               const std::array<float, 2049>& sineTable) noexcept {
    const float p = phase - std::floor(phase);
    if (waveform == LfoWaveform::Triangle) {
        return 1.0f - 4.0f * std::fabs(p - 0.5f);
    }
    const float position = p * 2048.0f;
    const std::size_t index = std::min<std::size_t>(2048u,
        static_cast<std::size_t>(position));
    const float fraction = position - static_cast<float>(index);
    return sineTable[index] +
        (sineTable[std::min<std::size_t>(2048u, index + 1u)] - sineTable[index]) * fraction;
}

void addEdge(AlgorithmSpec& spec, OperatorIndex source, OperatorIndex destination) noexcept {
    spec.modulation[static_cast<std::size_t>(source)]
                   [static_cast<std::size_t>(destination)] = 1.0f;
}

AlgorithmSpec makeSpec(const char* name,
                       std::uint8_t xMask,
                       std::uint8_t yMask,
                       std::uint8_t feedbackMask,
                       std::uint8_t envelopeCarrierMask) noexcept {
    AlgorithmSpec spec{};
    spec.name = name;
    spec.xMask = xMask;
    spec.yMask = yMask;
    spec.carrierMask = static_cast<std::uint8_t>(xMask | yMask);
    spec.feedbackMask = feedbackMask;
    spec.envelopeCarrierMask = envelopeCarrierMask;
    return spec;
}

const std::array<AlgorithmSpec, 8> kAlgorithmSpecs = [] {
    // Bit order is C, A, B1, B2.  The table mirrors the public manual's
    // diagrams; envelopeCarrierMask separates filled and dotted output taps.
    std::array<AlgorithmSpec, 8> table{};

    table[0] = makeSpec("A-C + B2-B1-C", 1u << 0, 1u << 2, 1u << 1, 0);
    addEdge(table[0], OperatorIndex::A, OperatorIndex::C);
    addEdge(table[0], OperatorIndex::B1, OperatorIndex::C);
    addEdge(table[0], OperatorIndex::B2, OperatorIndex::B1);

    table[1] = makeSpec("A-C + B2-B1", 1u << 0, 1u << 2, 1u << 3, 0);
    addEdge(table[1], OperatorIndex::A, OperatorIndex::C);
    addEdge(table[1], OperatorIndex::B2, OperatorIndex::B1);

    table[2] = makeSpec("A root: C + B2 + B1", (1u << 0) | (1u << 3), 1u << 2,
                        1u << 1, 0);
    addEdge(table[2], OperatorIndex::A, OperatorIndex::C);
    addEdge(table[2], OperatorIndex::A, OperatorIndex::B2);
    addEdge(table[2], OperatorIndex::A, OperatorIndex::B1);

    table[3] = makeSpec("B2-B1-A-C", 1u << 0, 1u << 2, 1u << 3, 0);
    addEdge(table[3], OperatorIndex::B2, OperatorIndex::B1);
    addEdge(table[3], OperatorIndex::B1, OperatorIndex::A);
    addEdge(table[3], OperatorIndex::A, OperatorIndex::C);

    table[4] = makeSpec("B1 + B2 -> A -> C", 1u << 0, 1u << 1, 1u << 2, 0);
    addEdge(table[4], OperatorIndex::B1, OperatorIndex::A);
    addEdge(table[4], OperatorIndex::B2, OperatorIndex::A);
    addEdge(table[4], OperatorIndex::A, OperatorIndex::C);

    table[5] = makeSpec("cross A-B1 / B2-C", 1u << 0, 1u << 2, 1u << 1, 0);
    addEdge(table[5], OperatorIndex::A, OperatorIndex::B1);
    addEdge(table[5], OperatorIndex::B2, OperatorIndex::C);

    table[6] = makeSpec("A-C + B2-B1 (carrier taps)", (1u << 0) | (1u << 1),
                        (1u << 2) | (1u << 3), 1u << 1,
                        (1u << 1) | (1u << 3));
    addEdge(table[6], OperatorIndex::A, OperatorIndex::C);
    addEdge(table[6], OperatorIndex::B2, OperatorIndex::B1);

    table[7] = makeSpec("A-C + B2 + B1", (1u << 0) | (1u << 3), 1u << 2,
                        1u << 2, (1u << 3) | (1u << 2));
    addEdge(table[7], OperatorIndex::A, OperatorIndex::C);
    return table;
}();

} // namespace

const AlgorithmSpec& algorithmSpec(AlgorithmId algorithm) noexcept {
    const auto index = std::min<std::size_t>(7u, static_cast<std::size_t>(algorithm));
    return kAlgorithmSpecs[index];
}

const std::array<AlgorithmSpec, 8>& allAlgorithmSpecs() noexcept {
    return kAlgorithmSpecs;
}

Engine::Engine() noexcept {
    prepare(sampleRate_);
}

Engine::Engine(float sampleRate) noexcept {
    prepare(sampleRate);
}

void Engine::prepare(float sampleRate) noexcept {
    sampleRate_ = std::max(kMinSampleRate, std::min(kMaxSampleRate,
                                                       finiteOr(sampleRate, 48000.0f)));
    for (std::size_t i = 0; i < sineTable_.size(); ++i) {
        const float phase = static_cast<float>(i) / 2048.0f;
        sineTable_[i] = std::sin(kTwoPi * phase);
        harmonicTable_[i] = calibratedHarmonic(phase, 1.0f, calibration_);
    }
    reset();
}

void Engine::reset() noexcept {
    for (auto& voice : voices_) voice = Voice{};
    controllers_.fill(0.0f);
    serial_ = 0;
}

void Engine::setCalibration(const Calibration& calibration) noexcept {
    calibration_ = calibration;
    for (auto& weight : calibration_.harmonicWeights) {
        weight = std::max(-4.0f, std::min(4.0f, finiteOr(weight, 0.0f)));
    }
    calibration_.harmonicMix = std::max(0.0f, std::min(2.0f,
        finiteOr(calibration_.harmonicMix, 0.85f)));
    calibration_.feedbackScale = std::max(0.0f, std::min(4.0f,
        finiteOr(calibration_.feedbackScale, 0.50f)));
    calibration_.fmIndexScale = std::max(0.0f, std::min(4.0f,
        finiteOr(calibration_.fmIndexScale, 0.50f)));
    calibration_.envelopeTimeScale = std::max(0.001f, std::min(16.0f,
        finiteOr(calibration_.envelopeTimeScale, 1.0f)));
    calibration_.filterQScale = std::max(0.01f, std::min(16.0f,
        finiteOr(calibration_.filterQScale, 1.0f)));
    for (std::size_t i = 0; i < harmonicTable_.size(); ++i) {
        const float phase = static_cast<float>(i) / 2048.0f;
        harmonicTable_[i] = calibratedHarmonic(phase, 1.0f, calibration_);
    }
}

void Engine::setParameters(const Parameters& parameters) noexcept {
    parameters_ = parameters;
    parameters_.routeCount = std::min(parameters_.routeCount, kMaxModRoutes);
    parameters_.algorithm = static_cast<AlgorithmId>(std::min<std::size_t>(
        7u, static_cast<std::size_t>(parameters_.algorithm)));
    for (std::size_t i = 0; i < kNumOperators; ++i) {
        float ratio = finiteOr(parameters_.operators[i].ratio, 1.0f);
        // Accept a serializer that filled the named ratio mirror while leaving
        // the operator records at their defaults.
        if (std::fabs(ratio - 1.0f) < 0.000001f &&
            std::fabs(parameters_.operatorRatios[i] - 1.0f) > 0.000001f) {
            ratio = parameters_.operatorRatios[i];
        }
        parameters_.operators[i].ratio = std::max(0.001f, std::min(64.0f, ratio));
        parameters_.operatorRatios[i] = parameters_.operators[i].ratio;
        parameters_.operators[i].index = std::max(0.0f,
            std::min(64.0f, finiteOr(parameters_.operators[i].index, 1.0f)));
        parameters_.operators[i].level = std::max(0.0f,
            std::min(2.0f, finiteOr(parameters_.operators[i].level, 1.0f)));
        parameters_.operators[i].feedback = std::max(0.0f,
            std::min(1.0f, finiteOr(parameters_.operators[i].feedback, 0.0f)));
    }
    parameters_.bLevel = clampUnit(finiteOr(parameters_.bLevel, 1.0f));
    parameters_.harm = clampSigned(finiteOr(parameters_.harm, 0.0f), 1.0f);
    parameters_.mix = clampUnit(finiteOr(parameters_.mix, 0.5f));
    parameters_.xLevel = std::max(0.0f, std::min(2.0f, finiteOr(parameters_.xLevel, 1.0f)));
    parameters_.yLevel = std::max(0.0f, std::min(2.0f, finiteOr(parameters_.yLevel, 1.0f)));
    parameters_.stereoWidth = clampUnit(finiteOr(parameters_.stereoWidth, 0.8f));
    parameters_.gain = std::max(0.0f, std::min(4.0f, finiteOr(parameters_.gain, 0.25f)));
}

void Engine::setAlgorithm(AlgorithmId algorithm) noexcept {
    parameters_.algorithm = static_cast<AlgorithmId>(std::min<std::size_t>(
        7u, static_cast<std::size_t>(algorithm)));
}

void Engine::setRatio(OperatorIndex operatorIndex, float ratio) noexcept {
    const auto i = std::min<std::size_t>(kNumOperators - 1u,
                                         static_cast<std::size_t>(operatorIndex));
    const float value = std::max(0.001f, std::min(64.0f, finiteOr(ratio, 1.0f)));
    parameters_.operators[i].ratio = value;
    parameters_.operatorRatios[i] = value;
}

void Engine::setController(int controller, float normalizedValue) noexcept {
    if (controller < 0 || controller >= static_cast<int>(controllers_.size())) return;
    controllers_[static_cast<std::size_t>(controller)] = clampUnit(
        finiteOr(normalizedValue, 0.0f));
    for (auto& voice : voices_) {
        if (voice.active) {
            voice.controllers[static_cast<std::size_t>(controller)] =
                controllers_[static_cast<std::size_t>(controller)];
        }
    }
}

void Engine::controller(int controller, float normalizedValue) noexcept {
    setController(controller, normalizedValue);
}

void Engine::startVoice(Voice& voice, float frequencyHz, float velocity,
                        int midiNote, std::uint64_t serial) noexcept {
    voice = Voice{};
    voice.active = true;
    voice.midiNote = midiNote;
    voice.frequencyHz = std::max(0.1f, std::min(20000.0f,
        finiteOr(frequencyHz, 440.0f)));
    voice.velocity = clampUnit(finiteOr(velocity, 1.0f));
    voice.serial = serial;
    voice.params = parameters_;
    voice.controllers = controllers_;
    if (voice.params.groupedB) {
        voice.params.operators[static_cast<std::size_t>(OperatorIndex::B1)].level *=
            b1LevelMacro(voice.params.bLevel);
        voice.params.operators[static_cast<std::size_t>(OperatorIndex::B2)].level *=
            b2LevelMacro(voice.params.bLevel);
    }
    for (std::size_t i = 0; i < kNumOperators; ++i) {
        const auto& op = voice.params.operators[i];
        const float detune = std::exp2(clampSigned(op.detuneCents, 2400.0f) / 1200.0f);
        const float keyTrack = std::max(0.0f, std::min(2.0f,
            finiteOr(op.keyTracking, 1.0f)));
        const float ratio = std::max(0.001f, std::min(64.0f, finiteOr(op.ratio, 1.0f)));
        voice.basePhaseIncrements[i] = voice.frequencyHz * ratio * detune *
            (0.25f + 0.75f * keyTrack) / sampleRate_;
    }
    const float mix = clampUnit(voice.params.mix);
    voice.xGain = std::sqrt(1.0f - mix) * voice.params.xLevel;
    voice.yGain = std::sqrt(mix) * voice.params.yLevel;
    bool hasFilterRoute = false;
    for (std::size_t i = 0; i < voice.params.routeCount; ++i) {
        if (voice.params.routes[i].target == ModTarget::FilterCutoff) {
            hasFilterRoute = true;
            break;
        }
    }
    voice.filterCoefficientStatic = !hasFilterRoute &&
        std::fabs(voice.params.filterEnvDepth) <= 0.000001f;
    if (voice.filterCoefficientStatic) {
        const float cutoff = std::max(20.0f, std::min(0.49f * sampleRate_,
            finiteOr(voice.params.filterCutoffHz, 12000.0f)));
        const float q = std::max(0.05f, std::min(20.0f,
            finiteOr(voice.params.filterQ, 0.7f) * calibration_.filterQScale));
        voice.baseFilterCoefficient = std::max(0.0001f, std::min(1.0f,
            (1.0f - std::exp(-kTwoPi * cutoff / sampleRate_)) *
            (0.5f + 0.5f / q)));
    }
    for (auto& envelope : voice.operatorEnvelopes) triggerEnvelope(envelope);
    triggerEnvelope(voice.ampEnvelope);
}

int Engine::noteOn(int midiNote, float velocity) noexcept {
    std::size_t slot = 0;
    bool foundInactive = false;
    std::uint64_t oldest = std::numeric_limits<std::uint64_t>::max();
    for (std::size_t i = 0; i < voices_.size(); ++i) {
        if (!voices_[i].active) {
            slot = i;
            foundInactive = true;
            break;
        }
        if (voices_[i].serial < oldest) {
            oldest = voices_[i].serial;
            slot = i;
        }
    }
    (void)foundInactive;
    startVoice(voices_[slot], midiFrequency(midiNote), velocity,
               std::max(0, std::min(127, midiNote)), ++serial_);
    return static_cast<int>(slot);
}

int Engine::noteOnFrequency(float frequencyHz, float velocity) noexcept {
    std::size_t slot = 0;
    std::uint64_t oldest = std::numeric_limits<std::uint64_t>::max();
    for (std::size_t i = 0; i < voices_.size(); ++i) {
        if (!voices_[i].active) {
            slot = i;
            oldest = 0;
            break;
        }
        if (voices_[i].serial < oldest) {
            oldest = voices_[i].serial;
            slot = i;
        }
    }
    startVoice(voices_[slot], frequencyHz, velocity, -1, ++serial_);
    return static_cast<int>(slot);
}

void Engine::noteOff(int midiNote) noexcept {
    for (auto& voice : voices_) {
        if (voice.active && voice.midiNote == midiNote) {
            voice.released = true;
            releaseEnvelope(voice.ampEnvelope);
            for (auto& envelope : voice.operatorEnvelopes) releaseEnvelope(envelope);
        }
    }
}

void Engine::noteOffVoice(int voiceIndex) noexcept {
    if (voiceIndex < 0 || voiceIndex >= static_cast<int>(voices_.size())) return;
    auto& voice = voices_[static_cast<std::size_t>(voiceIndex)];
    if (!voice.active) return;
    voice.released = true;
    releaseEnvelope(voice.ampEnvelope);
    for (auto& envelope : voice.operatorEnvelopes) releaseEnvelope(envelope);
}

void Engine::allNotesOff() noexcept {
    for (std::size_t i = 0; i < voices_.size(); ++i) noteOffVoice(static_cast<int>(i));
}

float Engine::sampleWave(float phase, Waveform waveform,
                         float harmonicAmount) const noexcept {
    float p = phase - std::floor(phase);
    if (p < 0.0f) p += 1.0f;
    const float position = p * 2048.0f;
    const std::size_t index = std::min<std::size_t>(2048u,
        static_cast<std::size_t>(position));
    const float fraction = position - static_cast<float>(index);
    const float sine = sineTable_[index] +
        (sineTable_[std::min<std::size_t>(2048u, index + 1u)] - sineTable_[index]) * fraction;
    if (waveform != Waveform::Harm && harmonicAmount <= 0.000001f) return sine;
    const float harmonic = harmonicTable_[index] +
        (harmonicTable_[std::min<std::size_t>(2048u, index + 1u)] - harmonicTable_[index]) * fraction;
    const float amount = clampUnit(waveform == Waveform::Harm
        ? std::max(0.75f, harmonicAmount) : harmonicAmount);
    return sine * (1.0f - amount) + harmonic * amount;
}

float Engine::renderOperator(Voice& voice, std::size_t operatorIndex,
                             std::array<float, kNumOperators>& values,
                             std::uint8_t& done, std::uint8_t& visiting,
                             float pitchScale,
                             const std::array<float, kNumOperators>& indexScales) noexcept {
    const std::uint8_t bit = static_cast<std::uint8_t>(1u << operatorIndex);
    if ((done & bit) != 0u) return values[operatorIndex];
    // No shipped algorithm has a graph cycle; this guard makes malformed future
    // calibration tables finite while retaining deterministic output.
    if ((visiting & bit) != 0u) return 0.0f;
    visiting = static_cast<std::uint8_t>(visiting | bit);

    const auto& params = voice.params;
    const auto& spec = algorithmSpec(params.algorithm);
    const auto& op = params.operators[operatorIndex];
    float phaseOffset = 0.0f;
    for (std::size_t source = 0; source < kNumOperators; ++source) {
        const float edge = spec.modulation[source][operatorIndex];
        if (edge == 0.0f) continue;
        const float sourceValue = renderOperator(voice, source, values, done, visiting,
                                                 pitchScale, indexScales);
        const auto& sourceParams = params.operators[source];
        phaseOffset += sourceValue * sourceParams.level * sourceParams.index *
                       edge * calibration_.fmIndexScale * indexScales[source];
    }
    if ((spec.feedbackMask & bit) != 0u) {
        phaseOffset += voice.feedback[operatorIndex] * op.feedback * calibration_.feedbackScale;
    }

    const float harmAmount =
        (params.harm < 0.0f && operatorIndex == static_cast<std::size_t>(OperatorIndex::C))
            ? -params.harm
            : ((params.harm > 0.0f &&
                (operatorIndex == static_cast<std::size_t>(OperatorIndex::A) ||
                 operatorIndex == static_cast<std::size_t>(OperatorIndex::B1)))
                   ? params.harm
                   : (op.waveform == Waveform::Harm ? 0.75f : 0.0f));
    const float phase = voice.phases[operatorIndex] + phaseOffset;
    const float oscillator = sampleWave(phase, op.waveform, harmAmount);
    const float envelope = advanceEnvelope(voice.operatorEnvelopes[operatorIndex],
                                           op.envelope, voice.released,
                                           sampleRate_, calibration_.envelopeTimeScale);
    values[operatorIndex] = oscillator * envelope;
    voice.rawOperators[operatorIndex] = oscillator;
    voice.feedback[operatorIndex] = values[operatorIndex];

    const float increment = voice.basePhaseIncrements[operatorIndex] * pitchScale;
    voice.phases[operatorIndex] += increment;
    voice.phases[operatorIndex] -= std::floor(voice.phases[operatorIndex]);

    visiting = static_cast<std::uint8_t>(visiting & static_cast<std::uint8_t>(~bit));
    done = static_cast<std::uint8_t>(done | bit);
    return values[operatorIndex];
}

void Engine::renderFrame(float& left, float& right) noexcept {
    left = 0.0f;
    right = 0.0f;
    const float dt = 1.0f / sampleRate_;

    for (auto& voice : voices_) {
        if (!voice.active) continue;
        const auto& params = voice.params;
        const auto& spec = algorithmSpec(params.algorithm);
        const float lfo1 = (params.lfo1.rateHz > 0.0f && params.lfo1.depth > 0.0f)
            ? lfoValue(voice.lfo1Phase, params.lfo1.waveform, sineTable_) * clampUnit(params.lfo1.depth)
            : 0.0f;
        const float lfo2 = (params.lfo2.rateHz > 0.0f && params.lfo2.depth > 0.0f)
            ? lfoValue(voice.lfo2Phase, params.lfo2.waveform, sineTable_) * clampUnit(params.lfo2.depth)
            : 0.0f;
        float pitchSemitones = 0.0f;
        float amplitudeMod = 0.0f;
        float filterMod = 0.0f;
        float panMod = 0.0f;
        std::array<float, kNumOperators> indexScales{{1.0f, 1.0f, 1.0f, 1.0f}};
        const std::size_t routeCount = std::min(params.routeCount, kMaxModRoutes);
        for (std::size_t routeIndex = 0; routeIndex < routeCount; ++routeIndex) {
            const auto& route = params.routes[routeIndex];
            float source = 0.0f;
            switch (route.source) {
            case ModSource::Lfo1: source = lfo1; break;
            case ModSource::Lfo2: source = lfo2; break;
            case ModSource::Velocity: source = voice.velocity; break;
            case ModSource::ModWheel: source = voice.controllers[1]; break;
            case ModSource::Aftertouch: source = voice.controllers[16]; break;
            case ModSource::PitchBend: source = voice.controllers[14]; break;
            }
            const float amount = finiteOr(route.amount, 0.0f);
            switch (route.target) {
            case ModTarget::PitchSemitones: pitchSemitones += source * amount; break;
            case ModTarget::Amplitude: amplitudeMod += source * amount; break;
            case ModTarget::FilterCutoff: filterMod += source * amount; break;
            case ModTarget::Pan: panMod += source * amount; break;
            case ModTarget::OperatorCIndex:
                indexScales[0] *= std::max(0.0f, 1.0f + source * amount); break;
            case ModTarget::OperatorAIndex:
                indexScales[1] *= std::max(0.0f, 1.0f + source * amount); break;
            case ModTarget::OperatorB1Index:
                indexScales[2] *= std::max(0.0f, 1.0f + source * amount); break;
            case ModTarget::OperatorB2Index:
                indexScales[3] *= std::max(0.0f, 1.0f + source * amount); break;
            }
        }

        const float pitchScale = std::fabs(pitchSemitones) <= 0.000001f
            ? 1.0f : std::exp2(clampSigned(pitchSemitones, 48.0f) / 12.0f);
        std::array<float, kNumOperators> values{};
        std::uint8_t done = 0;
        std::uint8_t visiting = 0;
        for (std::size_t op = 0; op < kNumOperators; ++op) {
            if ((spec.carrierMask & static_cast<std::uint8_t>(1u << op)) != 0u ||
                spec.modulation[op][0] != 0.0f || spec.modulation[op][1] != 0.0f ||
                spec.modulation[op][2] != 0.0f || spec.modulation[op][3] != 0.0f) {
                renderOperator(voice, op, values, done, visiting, pitchScale, indexScales);
            }
        }

        float x = 0.0f;
        float y = 0.0f;
        for (std::size_t op = 0; op < kNumOperators; ++op) {
            const std::uint8_t bit = static_cast<std::uint8_t>(1u << op);
            const float directOrEnvelope =
                (spec.envelopeCarrierMask & bit) != 0u ? values[op] : voice.rawOperators[op];
            if ((spec.xMask & bit) != 0u) x += directOrEnvelope * params.operators[op].level;
            if ((spec.yMask & bit) != 0u) y += directOrEnvelope * params.operators[op].level;
        }
        const float xBus = x * voice.xGain;
        const float yBus = y * voice.yGain;
        const float pan = clampSigned(panMod, 1.0f);
        float mono = (xBus + yBus) * (1.0f + clampSigned(amplitudeMod, 1.0f));
        const float amp = advanceEnvelope(voice.ampEnvelope, params.ampEnvelope,
                                          voice.released, sampleRate_,
                                          calibration_.envelopeTimeScale);
        mono *= amp * voice.velocity * params.gain;

        float coefficient = voice.baseFilterCoefficient;
        if (!voice.filterCoefficientStatic) {
            const float envCutoff = params.filterCutoffHz *
                ((std::fabs(filterMod) <= 0.000001f) ? 1.0f :
                 std::exp2(clampSigned(filterMod, 12.0f))) +
                params.filterEnvDepth * amp;
            const float cutoff = std::max(20.0f, std::min(0.49f * sampleRate_,
                finiteOr(envCutoff, 12000.0f)));
            const float q = std::max(0.05f, std::min(20.0f,
                finiteOr(params.filterQ, 0.7f) * calibration_.filterQScale));
            coefficient = std::max(0.0001f, std::min(1.0f,
                (1.0f - std::exp(-kTwoPi * cutoff / sampleRate_)) *
                (0.5f + 0.5f / q)));
        }
        voice.filterState += coefficient * (mono - voice.filterState);
        const float filtered = finiteOr(voice.filterState, 0.0f);

        const float stereoPan = clampSigned(pan * 0.5f * params.stereoWidth, 1.0f);
        left += filtered * (0.5f * (1.0f - stereoPan));
        right += filtered * (0.5f * (1.0f + stereoPan));

        if (params.lfo1.rateHz > 0.0f) {
            voice.lfo1Phase += params.lfo1.rateHz * dt;
            voice.lfo1Phase -= std::floor(voice.lfo1Phase);
        }
        if (params.lfo2.rateHz > 0.0f) {
            voice.lfo2Phase += params.lfo2.rateHz * dt;
            voice.lfo2Phase -= std::floor(voice.lfo2Phase);
        }
        voice.ageSeconds += dt;

        if (voice.ampEnvelope.stage == 4 ||
            (voice.released && voice.ampEnvelope.value <= 0.000001f)) {
            voice.active = false;
        }
    }
    left = finiteOr(left, 0.0f);
    right = finiteOr(right, 0.0f);
    left = std::max(-4.0f, std::min(4.0f, left));
    right = std::max(-4.0f, std::min(4.0f, right));
}

void Engine::processInterleaved(float* stereo, std::size_t frames) noexcept {
    if (stereo == nullptr) return;
    for (std::size_t frame = 0; frame < frames; ++frame) {
        float left = 0.0f;
        float right = 0.0f;
        renderFrame(left, right);
        stereo[frame * 2u] = left;
        stereo[frame * 2u + 1u] = right;
    }
}

void Engine::processStereo(float* left, float* right, std::size_t frames) noexcept {
    if (left == nullptr || right == nullptr) return;
    for (std::size_t frame = 0; frame < frames; ++frame) {
        float l = 0.0f;
        float r = 0.0f;
        renderFrame(l, r);
        left[frame] = l;
        right[frame] = r;
    }
}

void Engine::process(float* interleaved, std::size_t frames) noexcept {
    processInterleaved(interleaved, frames);
}

void Engine::process(float* left, float* right, std::size_t frames) noexcept {
    processStereo(left, right, frames);
}

void Engine::process(const Event* events, std::size_t eventCount,
                    float* interleaved, std::size_t frames) noexcept {
    if (interleaved == nullptr) return;
    if (eventCount > 0u && events == nullptr) {
        processInterleaved(interleaved, frames);
        return;
    }
    std::size_t cursor = 0;
    for (std::size_t i = 0; i < eventCount; ++i) {
        const Event& event = events[i];
        const std::size_t target = std::min(frames, event.frame);
        if (target > cursor) {
            processInterleaved(interleaved + cursor * 2u, target - cursor);
            cursor = target;
        }
        switch (event.type) {
        case EventType::NoteOn: noteOn(event.note, event.value); break;
        case EventType::NoteOff: noteOff(event.note); break;
        case EventType::Controller: setController(event.note, event.value); break;
        case EventType::Reset: reset(); break;
        }
    }
    if (cursor < frames) processInterleaved(interleaved + cursor * 2u, frames - cursor);
}

std::size_t Engine::activeVoiceCount() const noexcept {
    std::size_t count = 0;
    for (const auto& voice : voices_) count += voice.active ? 1u : 0u;
    return count;
}

} // namespace digitone
