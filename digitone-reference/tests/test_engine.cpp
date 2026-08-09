#include "digitone/Engine.h"

#include <cmath>
#include <cstdio>
#include <vector>

namespace {

using digitone::AlgorithmId;
using digitone::OperatorIndex;

struct TopologyExpectation {
    std::uint8_t x;
    std::uint8_t y;
    std::uint8_t feedback;
    std::uint8_t envelopes;
    std::vector<std::pair<OperatorIndex, OperatorIndex>> edges;
};

bool check(bool condition, const char* message) {
    if (!condition) std::fprintf(stderr, "FAIL: %s\n", message);
    return condition;
}

bool testTopologies() {
    using O = OperatorIndex;
    const std::array<TopologyExpectation, 8> expected{{
        {1u << 0, 1u << 2, 1u << 1, 0, {{O::A, O::C}, {O::B1, O::C}, {O::B2, O::B1}}},
        {1u << 0, 1u << 2, 1u << 3, 0, {{O::A, O::C}, {O::B2, O::B1}}},
        {(1u << 0) | (1u << 3), 1u << 2, 1u << 1, 0,
         {{O::A, O::C}, {O::A, O::B2}, {O::A, O::B1}}},
        {1u << 0, 1u << 2, 1u << 3, 0,
         {{O::B2, O::B1}, {O::B1, O::A}, {O::A, O::C}}},
        {1u << 0, 1u << 1, 1u << 2, 0,
         {{O::B1, O::A}, {O::B2, O::A}, {O::A, O::C}}},
        {1u << 0, 1u << 2, 1u << 1, 0,
         {{O::A, O::B1}, {O::B2, O::C}}},
        {(1u << 0) | (1u << 1), (1u << 2) | (1u << 3), 1u << 1,
         (1u << 1) | (1u << 3), {{O::A, O::C}, {O::B2, O::B1}}},
        {(1u << 0) | (1u << 3), 1u << 2, 1u << 2,
         (1u << 2) | (1u << 3), {{O::A, O::C}}},
    }};
    bool ok = true;
    for (std::size_t i = 0; i < expected.size(); ++i) {
        const auto& spec = digitone::algorithmSpec(static_cast<AlgorithmId>(i));
        ok &= check(spec.xMask == expected[i].x && spec.yMask == expected[i].y,
                    "algorithm X/Y carrier masks");
        ok &= check(spec.feedbackMask == expected[i].feedback &&
                    spec.envelopeCarrierMask == expected[i].envelopes,
                    "algorithm feedback/envelope masks");
        for (std::size_t source = 0; source < digitone::kNumOperators; ++source) {
            for (std::size_t destination = 0; destination < digitone::kNumOperators; ++destination) {
                bool shouldExist = false;
                for (const auto& edge : expected[i].edges) {
                    shouldExist |= static_cast<std::size_t>(edge.first) == source &&
                                   static_cast<std::size_t>(edge.second) == destination;
                }
                const bool exists = spec.modulation[source][destination] != 0.0f;
                ok &= check(exists == shouldExist, "algorithm modulation matrix");
            }
        }
    }
    return ok;
}

digitone::Parameters testParameters() {
    digitone::Parameters p;
    p.algorithm = AlgorithmId::Algorithm1;
    p.mix = 0.45f;
    p.gain = 0.45f;
    p.ampEnvelope = {0.001f, 0.05f, 0.7f, 0.04f};
    p.filterCutoffHz = 18000.0f;
    for (auto& op : p.operators) {
        op.index = 1.7f;
        op.level = 0.9f;
        op.envelope = {0.001f, 0.08f, 0.8f, 0.03f};
    }
    p.operators[0].ratio = 1.0f;
    p.operators[1].ratio = 1.5f;
    p.operators[2].ratio = 2.0f;
    p.operators[3].ratio = 2.5f;
    p.operatorRatios = {{1.0f, 1.5f, 2.0f, 2.5f}};
    return p;
}

std::vector<float> render(const digitone::Parameters& parameters, std::size_t frames = 1024) {
    digitone::Engine engine(48000.0f);
    engine.setParameters(parameters);
    engine.noteOn(60, 0.8f);
    std::vector<float> output(frames * 2u, 0.0f);
    engine.processInterleaved(output.data(), frames);
    return output;
}

bool finiteAudio(const std::vector<float>& audio) {
    for (float sample : audio) if (!std::isfinite(sample)) return false;
    return true;
}

bool testDeterminismAndAlgorithms() {
    const auto parameters = testParameters();
    const auto first = render(parameters);
    const auto second = render(parameters);
    bool ok = check(first == second, "same seed/state must render identical samples");
    ok &= check(finiteAudio(first), "rendered audio must be finite");

    std::vector<float> fingerprints;
    for (std::size_t algorithm = 0; algorithm < 8; ++algorithm) {
        auto p = parameters;
        p.algorithm = static_cast<AlgorithmId>(algorithm);
        const auto audio = render(p, 512);
        ok &= check(finiteAudio(audio), "algorithm output must stay finite");
        float fingerprint = 0.0f;
        for (std::size_t i = 0; i < audio.size(); i += 17u) fingerprint += audio[i];
        fingerprints.push_back(fingerprint);
    }
    std::size_t distinct = 0;
    for (std::size_t i = 0; i < fingerprints.size(); ++i) {
        bool unique = true;
        for (std::size_t j = 0; j < i; ++j) unique &= std::fabs(fingerprints[i] - fingerprints[j]) > 0.0001f;
        distinct += unique ? 1u : 0u;
    }
    ok &= check(distinct >= 5u, "algorithm topologies should produce distinct references");
    return ok;
}

bool testGroupedB() {
    auto low = testParameters();
    low.algorithm = AlgorithmId::Algorithm2;
    low.groupedB = true;
    low.bLevel = 43.0f / 127.0f;
    auto high = low;
    high.bLevel = 85.0f / 127.0f;
    const auto lowAudio = render(low, 1024);
    const auto highAudio = render(high, 1024);
    bool different = false;
    for (std::size_t i = 0; i < lowAudio.size(); ++i) {
        if (std::fabs(lowAudio[i] - highAudio[i]) > 0.0001f) { different = true; break; }
    }
    bool ok = check(different, "grouped B macro must alter B1/B2 influence");
    ok &= check(std::fabs(digitone::b1LevelMacro(43.0f / 127.0f) - 1.0f) < 0.00001f,
                "B1 macro knot at 43");
    ok &= check(std::fabs(digitone::b1LevelMacro(85.0f / 127.0f)) < 0.00001f,
                "B1 macro knot at 85");
    ok &= check(std::fabs(digitone::b2LevelMacro(43.0f / 127.0f)) < 0.00001f,
                "B2 macro knot at 43");
    ok &= check(std::fabs(digitone::b2LevelMacro(85.0f / 127.0f) - 1.0f) < 0.00001f,
                "B2 macro knot at 85");
    return ok;
}

bool testCalibrationCurves() {
    bool ok = check(digitone::envelopeSecondsFromNormalized(0.0f) == 0.0f,
                    "zero envelope time");
    ok &= check(std::fabs(digitone::filterCutoffFromNormalized(0.0f) - 20.0f) < 0.001f,
                "filter cutoff lower knot");
    ok &= check(std::fabs(digitone::filterCutoffFromNormalized(1.0f) - 20000.0f) < 0.1f,
                "filter cutoff upper knot");
    ok &= check(digitone::lfoRateFromNormalized(1.0f) >
                digitone::lfoRateFromNormalized(0.5f), "LFO rate curve");
    return ok;
}

bool testOverlappingSameNoteReleaseOrder() {
    auto p = testParameters();
    p.ampEnvelope.releaseSeconds = 0.001f;
    for (auto& op : p.operators) op.envelope.releaseSeconds = 0.001f;
    digitone::Engine engine(48000.0f);
    engine.setParameters(p);
    engine.noteOn(60);
    engine.noteOn(60);
    engine.noteOff(60);
    std::vector<float> firstTail(512u * 2u, 0.0f);
    engine.processInterleaved(firstTail.data(), 512u);
    bool ok = check(engine.activeVoiceCount() == 1u,
                    "one note-off must release one overlapping voice");
    engine.noteOff(60);
    std::vector<float> secondTail(512u * 2u, 0.0f);
    engine.processInterleaved(secondTail.data(), 512u);
    ok &= check(engine.activeVoiceCount() == 0u,
                "second note-off must release the remaining voice");
    return ok;
}

bool testReleaseAndController() {
    auto p = testParameters();
    p.ampEnvelope.releaseSeconds = 0.005f;
    p.routeCount = 1;
    p.routes[0] = {digitone::ModSource::ModWheel, digitone::ModTarget::Amplitude, 0.7f};
    digitone::Engine engine(48000.0f);
    engine.setParameters(p);
    engine.noteOn(60);
    std::vector<float> before(256u * 2u, 0.0f);
    engine.processInterleaved(before.data(), 256u);
    engine.setController(1, 1.0f);
    std::vector<float> changed(256u * 2u, 0.0f);
    engine.processInterleaved(changed.data(), 256u);
    bool controllerChanged = before != changed;
    engine.noteOff(60);
    std::vector<float> tail(2048u * 2u, 0.0f);
    engine.processInterleaved(tail.data(), 2048u);
    bool ok = check(controllerChanged, "controller route should affect active voice");
    ok &= check(engine.activeVoiceCount() == 0u, "released voice should become inactive");
    ok &= check(finiteAudio(tail), "release tail must remain finite");
    float finalEnergy = 0.0f;
    for (std::size_t i = tail.size() > 512u ? tail.size() - 512u : 0u; i < tail.size(); ++i) {
        finalEnergy += std::fabs(tail[i]);
    }
    ok &= check(finalEnergy < 0.05f, "release should settle near silence");
    return ok;
}

} // namespace

int main() {
    bool ok = true;
    ok &= testTopologies();
    ok &= testDeterminismAndAlgorithms();
    ok &= testGroupedB();
    ok &= testCalibrationCurves();
    ok &= testOverlappingSameNoteReleaseOrder();
    ok &= testReleaseAndController();
    if (!ok) return 1;
    std::puts("digitone engine tests: ok");
    return 0;
}
