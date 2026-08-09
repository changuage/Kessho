#pragma once

#include "digitone/Calibration.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace digitone {

constexpr std::size_t kNumOperators = 4;
constexpr std::size_t kNumAlgorithms = 8;
constexpr std::size_t kMaxVoices = 16;
constexpr std::size_t kMaxModRoutes = 8;
inline constexpr std::uint32_t kApiVersion = 1u;

enum class OperatorIndex : std::uint8_t {
    C = 0,
    A = 1,
    B1 = 2,
    B2 = 3,
};

using Operator = OperatorIndex;

enum class Waveform : std::uint8_t {
    Sine = 0,
    Harm = 1,
};

enum class AlgorithmId : std::uint8_t {
    Algorithm1 = 0,
    Algorithm2 = 1,
    Algorithm3 = 2,
    Algorithm4 = 3,
    Algorithm5 = 4,
    Algorithm6 = 5,
    Algorithm7 = 6,
    Algorithm8 = 7,
    One = Algorithm1,
    Two = Algorithm2,
    Three = Algorithm3,
    Four = Algorithm4,
    Five = Algorithm5,
    Six = Algorithm6,
    Seven = Algorithm7,
    Eight = Algorithm8,
    A1 = Algorithm1,
    A2 = Algorithm2,
    A3 = Algorithm3,
    A4 = Algorithm4,
    A5 = Algorithm5,
    A6 = Algorithm6,
    A7 = Algorithm7,
    A8 = Algorithm8,
};

using Algorithm = AlgorithmId;

// modulation[source][destination] is 1 when source phase-modulates destination.
// A non-binary value is reserved for future calibrated routings.
struct AlgorithmSpec {
    const char* name = "Algorithm 1";
    std::array<std::array<float, kNumOperators>, kNumOperators> modulation{};
    std::uint8_t carrierMask = 0;
    std::uint8_t xMask = 0;
    std::uint8_t yMask = 0;
    std::uint8_t feedbackMask = 0;
    // Filled output lines in the manual carry the operator envelope; dotted
    // lines are direct carrier taps.  This is exposed so calibration can refine
    // the distinction without changing the routing graph.
    std::uint8_t envelopeCarrierMask = 0;

    constexpr bool hasEdge(OperatorIndex source, OperatorIndex destination) const noexcept {
        const auto sourceIndex = static_cast<std::size_t>(source);
        const auto destinationIndex = static_cast<std::size_t>(destination);
        return sourceIndex < kNumOperators && destinationIndex < kNumOperators &&
               modulation[sourceIndex][destinationIndex] != 0.0f;
    }
};

const AlgorithmSpec& algorithmSpec(AlgorithmId algorithm) noexcept;
const std::array<AlgorithmSpec, 8>& allAlgorithmSpecs() noexcept;

struct EnvelopeParams {
    float attackSeconds = 0.005f;
    float decaySeconds = 0.35f;
    float sustain = 0.75f;
    float releaseSeconds = 0.45f;
};

struct OperatorParams {
    float ratio = 1.0f;
    float index = 1.0f;
    float level = 1.0f;
    float detuneCents = 0.0f;
    float feedback = 0.0f;
    float keyTracking = 1.0f;
    Waveform waveform = Waveform::Sine;
    EnvelopeParams envelope{};
};

enum class LfoWaveform : std::uint8_t {
    Sine = 0,
    Triangle = 1,
};

struct LfoParams {
    float rateHz = 0.0f;
    float depth = 0.0f;
    LfoWaveform waveform = LfoWaveform::Sine;
};

enum class ModSource : std::uint8_t {
    Lfo1 = 0,
    Lfo2 = 1,
    Velocity = 2,
    ModWheel = 3,
    Aftertouch = 4,
    PitchBend = 5,
};

enum class ModTarget : std::uint8_t {
    PitchSemitones = 0,
    Amplitude = 1,
    FilterCutoff = 2,
    Pan = 3,
    OperatorCIndex = 4,
    OperatorAIndex = 5,
    OperatorB1Index = 6,
    OperatorB2Index = 7,
};

struct ModRoute {
    ModSource source = ModSource::Lfo1;
    ModTarget target = ModTarget::Amplitude;
    float amount = 0.0f;
};

struct Parameters {
    AlgorithmId algorithm = AlgorithmId::Algorithm1;
    std::array<OperatorParams, kNumOperators> operators{};

    // The Digitone exposes C/A/B1/B2 ratios as four related controls.
    // `operators[i].ratio` is the canonical value; this named mirror is useful
    // to serializers and is kept in sync by Engine::setRatio().
    std::array<float, kNumOperators> operatorRatios{{1.0f, 1.0f, 1.0f, 1.0f}};
    bool groupedB = true;
    float bLevel = 1.0f;

    // HARM is bipolar: negative values shape C; positive values shape A/B1.
    float harm = 0.0f;
    float mix = 0.5f;       // crossfade X (0) to Y (1)
    float xLevel = 1.0f;
    float yLevel = 1.0f;
    float stereoWidth = 0.8f;
    float gain = 0.25f;
    float drive = 0.0f;      // bounded, replaceable amp-stage approximation

    float filterCutoffHz = 12000.0f;
    float filterQ = 0.7f;
    float filterEnvDepth = 0.0f;
    EnvelopeParams ampEnvelope{0.005f, 0.35f, 0.75f, 0.45f};

    LfoParams lfo1{};
    LfoParams lfo2{};
    std::array<ModRoute, kMaxModRoutes> routes{};
    std::size_t routeCount = 0;
};

using EngineParameters = Parameters;

enum class EventType : std::uint8_t {
    NoteOn,
    NoteOff,
    Controller,
    Reset,
};

struct Event {
    std::size_t frame = 0;
    EventType type = EventType::NoteOn;
    int note = 60;
    float value = 1.0f;
};

class Engine final {
public:
    using Params = Parameters;
    Engine() noexcept;
    explicit Engine(float sampleRate) noexcept;

    // prepare() is the only setup call that initializes tables/state.  Process
    // never allocates and is safe to call with interleaved or split stereo data.
    void prepare(float sampleRate) noexcept;
    void reset() noexcept;

    float sampleRate() const noexcept { return sampleRate_; }
    void setCalibration(const Calibration& calibration) noexcept;
    const Calibration& calibration() const noexcept { return calibration_; }

    void setParameters(const Parameters& parameters) noexcept;
    const Parameters& parameters() const noexcept { return parameters_; }
    void setAlgorithm(AlgorithmId algorithm) noexcept;
    void setRatio(OperatorIndex operatorIndex, float ratio) noexcept;
    void setController(int controller, float normalizedValue) noexcept;
    void controller(int controller, float normalizedValue) noexcept;

    // noteOn snapshots Parameters and the current controller state into its
    // voice.  Later setController() calls update active routed voices without
    // changing their synthesis parameter snapshot.  The returned index is
    // stable until that voice is stolen or released.
    int noteOn(int midiNote, float velocity = 1.0f) noexcept;
    int noteOnFrequency(float frequencyHz, float velocity = 1.0f) noexcept;
    void noteOff(int midiNote) noexcept;
    void noteOffVoice(int voiceIndex) noexcept;
    void allNotesOff() noexcept;

    void processInterleaved(float* stereo, std::size_t frames) noexcept;
    void processStereo(float* left, float* right, std::size_t frames) noexcept;
    void process(float* interleaved, std::size_t frames) noexcept;
    void process(float* left, float* right, std::size_t frames) noexcept;
    // Events must be ordered by nondecreasing frame offset. Events beyond the
    // current block are applied at its end, so callers should retain them for
    // a later block instead of passing them early.
    void process(const Event* events, std::size_t eventCount,
                float* interleaved, std::size_t frames) noexcept;

    std::size_t activeVoiceCount() const noexcept;

private:
    struct EnvelopeState {
        float value = 0.0f;
        std::uint8_t stage = 0; // 0 attack, 1 decay, 2 sustain, 3 release, 4 off
    };

    struct Voice {
        bool active = false;
        bool released = false;
        int midiNote = -1;
        float frequencyHz = 440.0f;
        float velocity = 1.0f;
        std::uint64_t serial = 0;
        std::array<float, kNumOperators> phases{};
        std::array<float, kNumOperators> basePhaseIncrements{};
        std::array<float, kNumOperators> feedback{};
        std::array<float, kNumOperators> rawOperators{};
        std::array<EnvelopeState, kNumOperators> operatorEnvelopes{};
        EnvelopeState ampEnvelope{};
        std::array<float, 128> controllers{};
        float lfo1Phase = 0.0f;
        float lfo2Phase = 0.0f;
        float filterState = 0.0f;
        float xGain = 1.0f;
        float yGain = 1.0f;
        float baseFilterCoefficient = 0.5f;
        bool filterCoefficientStatic = false;
        float ageSeconds = 0.0f;
        Parameters params{};
    };

    static void triggerEnvelope(EnvelopeState& envelope) noexcept;
    static void releaseEnvelope(EnvelopeState& envelope) noexcept;
    static float advanceEnvelope(EnvelopeState& envelope,
                                 const EnvelopeParams& params,
                                 bool released,
                                 float sampleRate,
                                 float timeScale) noexcept;
    float sampleWave(float phase, Waveform waveform, float harmonicAmount) const noexcept;
    float renderOperator(Voice& voice, std::size_t operatorIndex,
                         std::array<float, kNumOperators>& values,
                         std::uint8_t& done, std::uint8_t& visiting,
                         float pitchScale,
                         const std::array<float, kNumOperators>& indexScales) noexcept;
    void renderFrame(float& left, float& right) noexcept;
    void startVoice(Voice& voice, float frequencyHz, float velocity,
                    int midiNote, std::uint64_t serial) noexcept;

    float sampleRate_ = 48000.0f;
    Calibration calibration_{};
    Parameters parameters_{};
    std::array<float, 2049> sineTable_{};
    std::array<float, 2049> harmonicTable_{};
    std::array<float, 128> controllers_{};
    std::array<Voice, kMaxVoices> voices_{};
    std::uint64_t serial_ = 0;
};

} // namespace digitone
