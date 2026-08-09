#include "digitone/Engine.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <initializer_list>
#include <iterator>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

namespace {

struct NoteSpec {
    int midi = 60;
    double startSeconds = 0.0;
    double durationSeconds = 0.5;
    float velocity = 1.0f;
};

struct Options {
    std::string output = "digitone-reference.wav";
    std::string input;
    std::string sequence;
    std::string sequenceJson;
    float sampleRate = 48000.0f;
    double durationSeconds = 0.0;
    int algorithm = 0;
    std::array<float, digitone::kNumOperators> ratios{{1.0f, 1.0f, 1.0f, 1.0f}};
    float harm = 0.0f;
    float feedback = 0.0f;
    float mix = 0.5f;
    float bLevel = 1.0f;
    float attack = 0.005f;
    float decay = 0.35f;
    float sustain = 0.75f;
    float release = 0.45f;
};

void usage(const char* program) {
    std::cout
        << "Usage: " << program << " [flags]\n"
        << "  --output FILE             PCM16 stereo WAV (default digitone-reference.wav)\n"
        << "  --sample-rate HZ          sample rate (default 48000)\n"
        << "  --duration SEC            render length; otherwise sequence end + release\n"
        << "  --algorithm 1..8|0..7     Digitone routing algorithm\n"
        << "  --ratio C,A,B1,B2         operator ratios\n"
        << "  --harm VALUE              bipolar HARM approximation (-1..1)\n"
        << "  --feedback VALUE          feedback amount (0..1)\n"
        << "  --mix VALUE               X/Y crossfade (0=X, 1=Y)\n"
        << "  --attack SEC --decay SEC --sustain LEVEL --release SEC\n"
        << "  --sequence SPEC           e.g. '60@0:0.5,64@0.5:0.5:0.8'\n"
        << "  --notes SPEC              alias for --sequence\n"
        << "  --midi-sequence FILE|SPEC alias for --sequence (file contents accepted)\n"
        << "  --sequence-json JSON|FILE list of {note,start,duration,velocity}\n"
        << "  --input JSON              optional canonical parameter JSON override\n";
}

bool parseFloat(const std::string& text, float& value) {
    char* end = nullptr;
    const float parsed = std::strtof(text.c_str(), &end);
    if (end == text.c_str() || *end != '\0') return false;
    value = parsed;
    return true;
}

bool parseDouble(const std::string& text, double& value) {
    char* end = nullptr;
    const double parsed = std::strtod(text.c_str(), &end);
    if (end == text.c_str() || *end != '\0') return false;
    value = parsed;
    return true;
}

std::vector<std::string> split(const std::string& text, char separator) {
    std::vector<std::string> result;
    std::string item;
    std::istringstream stream(text);
    while (std::getline(stream, item, separator)) {
        if (!item.empty()) result.push_back(item);
    }
    return result;
}

bool parseRatios(const std::string& text, Options& options) {
    const auto parts = split(text, ',');
    if (parts.size() != digitone::kNumOperators) return false;
    for (std::size_t i = 0; i < parts.size(); ++i) {
        if (!parseFloat(parts[i], options.ratios[i])) return false;
    }
    return true;
}

bool parseAlgorithm(const std::string& text, int& algorithm) {
    char* end = nullptr;
    const long parsed = std::strtol(text.c_str(), &end, 10);
    if (end != text.c_str() && *end == '\0') {
        if (parsed >= 1 && parsed <= 8) algorithm = static_cast<int>(parsed - 1);
        else if (parsed >= 0 && parsed < 8) algorithm = static_cast<int>(parsed);
        else return false;
        return true;
    }
    std::string lower;
    lower.reserve(text.size());
    for (char c : text) lower.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    for (std::size_t i = 0; i < digitone::allAlgorithmSpecs().size(); ++i) {
        std::string name = digitone::allAlgorithmSpecs()[i].name;
        for (char& c : name) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        if (lower == name || lower == ("algo" + std::to_string(i + 1u))) {
            algorithm = static_cast<int>(i);
            return true;
        }
    }
    return false;
}

bool parseNoteToken(const std::string& token, NoteSpec& note, double& sequentialStart) {
    if (token.empty()) return false;
    const auto at = token.find('@');
    const auto colon = token.find(':');
    std::string noteText = token.substr(0, std::min(at, colon));
    if (at == std::string::npos && colon == std::string::npos) {
        note.midi = std::atoi(noteText.c_str());
        note.startSeconds = sequentialStart;
        sequentialStart += note.durationSeconds + 0.05;
        return note.midi >= 0 && note.midi <= 127;
    }
    std::string timing = at != std::string::npos ? token.substr(at + 1) : token.substr(colon + 1);
    if (at != std::string::npos && colon != std::string::npos && colon < at) {
        noteText = token.substr(0, colon);
        timing = token.substr(colon + 1);
    }
    const auto fields = split(timing, ':');
    if (fields.size() < 2u || fields.size() > 3u) return false;
    note.midi = std::atoi(noteText.c_str());
    if (!parseDouble(fields[0], note.startSeconds) ||
        !parseDouble(fields[1], note.durationSeconds)) return false;
    if (fields.size() == 3u && !parseFloat(fields[2], note.velocity)) return false;
    sequentialStart = std::max(sequentialStart, note.startSeconds + note.durationSeconds + 0.05);
    return note.midi >= 0 && note.midi <= 127 && note.startSeconds >= 0.0 &&
           note.durationSeconds > 0.0;
}

std::vector<NoteSpec> parseSequence(const std::string& text) {
    std::vector<NoteSpec> notes;
    double sequentialStart = 0.0;
    std::string normalized = text;
    std::replace(normalized.begin(), normalized.end(), ';', ',');
    for (const auto& token : split(normalized, ',')) {
        NoteSpec note;
        if (parseNoteToken(token, note, sequentialStart)) notes.push_back(note);
    }
    std::sort(notes.begin(), notes.end(), [](const NoteSpec& a, const NoteSpec& b) {
        return a.startSeconds < b.startSeconds;
    });
    return notes;
}

bool readJsonNumber(const std::string& json, const std::string& key, float& value) {
    const std::string quoted = "\"" + key + "\"";
    const auto position = json.find(quoted);
    if (position == std::string::npos) return false;
    const auto colon = json.find(':', position + quoted.size());
    if (colon == std::string::npos) return false;
    std::size_t start = colon + 1u;
    while (start < json.size() && (json[start] == ' ' || json[start] == '\n' || json[start] == '\r' || json[start] == '\t')) ++start;
    std::size_t end = start;
    while (end < json.size() && (std::isdigit(static_cast<unsigned char>(json[end])) ||
                                 json[end] == '-' || json[end] == '+' || json[end] == '.' ||
                                 json[end] == 'e' || json[end] == 'E')) ++end;
    return start < end && parseFloat(json.substr(start, end - start), value);
}

std::vector<NoteSpec> parseSequenceJson(const std::string& json) {
    std::vector<NoteSpec> notes;
    std::size_t cursor = 0;
    while (cursor < json.size()) {
        const auto begin = json.find('{', cursor);
        if (begin == std::string::npos) break;
        const auto end = json.find('}', begin + 1u);
        if (end == std::string::npos) break;
        const std::string object = json.substr(begin, end - begin + 1u);
        float value = 0.0f;
        NoteSpec note;
        if (readJsonNumber(object, "note", value) || readJsonNumber(object, "midi", value)) {
            note.midi = static_cast<int>(value);
            if (readJsonNumber(object, "start", value)) note.startSeconds = value;
            if (readJsonNumber(object, "duration", value)) note.durationSeconds = value;
            if (readJsonNumber(object, "velocity", value)) note.velocity = value;
            if (note.midi >= 0 && note.midi <= 127 && note.durationSeconds > 0.0) {
                notes.push_back(note);
            }
        }
        cursor = end + 1u;
    }
    std::sort(notes.begin(), notes.end(), [](const NoteSpec& a, const NoteSpec& b) {
        return a.startSeconds < b.startSeconds;
    });
    return notes;
}

bool readJsonNestedNumber(const std::string& json, const std::string& parent,
                          const std::string& child, float& value) {
    const std::string quotedParent = "\"" + parent + "\"";
    const auto parentPosition = json.find(quotedParent);
    if (parentPosition == std::string::npos) return false;
    const auto childPosition = json.find("\"" + child + "\"", parentPosition + quotedParent.size());
    if (childPosition == std::string::npos || childPosition > parentPosition + 512u) return false;
    const auto colon = json.find(':', childPosition);
    if (colon == std::string::npos) return false;
    std::size_t start = colon + 1u;
    while (start < json.size() && std::isspace(static_cast<unsigned char>(json[start]))) ++start;
    std::size_t end = start;
    while (end < json.size() && (std::isdigit(static_cast<unsigned char>(json[end])) ||
                                 json[end] == '-' || json[end] == '+' || json[end] == '.' ||
                                 json[end] == 'e' || json[end] == 'E')) ++end;
    return start < end && parseFloat(json.substr(start, end - start), value);
}

bool readJsonPathNumber(const std::string& json,
                        std::initializer_list<const char*> path,
                        float& value) {
    std::size_t cursor = 0;
    for (const char* key : path) {
        const std::string quoted = "\"" + std::string(key) + "\"";
        const auto position = json.find(quoted, cursor);
        if (position == std::string::npos || position > cursor + 2048u) return false;
        cursor = position + quoted.size();
    }
    const auto colon = json.find(':', cursor);
    if (colon == std::string::npos) return false;
    std::size_t start = colon + 1u;
    while (start < json.size() && std::isspace(static_cast<unsigned char>(json[start]))) ++start;
    std::size_t end = start;
    while (end < json.size() && (std::isdigit(static_cast<unsigned char>(json[end])) ||
                                 json[end] == '-' || json[end] == '+' || json[end] == '.' ||
                                 json[end] == 'e' || json[end] == 'E')) ++end;
    return start < end && parseFloat(json.substr(start, end - start), value);
}

void readJsonOverride(const std::string& path, Options& options) {
    std::ifstream file(path);
    if (!file) return;
    const std::string json((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    float value = 0.0f;
    if (readJsonNumber(json, "sample_rate", value)) options.sampleRate = value;
    if (readJsonNumber(json, "duration", value)) options.durationSeconds = value;
    if (readJsonNumber(json, "algorithm", value)) {
        options.algorithm = value >= 1.0f && value <= 8.0f
            ? static_cast<int>(value) - 1 : static_cast<int>(value);
    }
    if (readJsonNumber(json, "harm", value)) options.harm = value;
    if (readJsonPathNumber(json, {"harm", "normalized"}, value)) options.harm = value;
    else if (readJsonPathNumber(json, {"harm", "value"}, value)) {
        options.harm = std::fabs(value) > 1.0f ? value / 26.0f : value;
    }
    if (readJsonNumber(json, "feedback", value)) options.feedback = value;
    if (readJsonPathNumber(json, {"feedback", "normalized"}, value)) options.feedback = value;
    else if (readJsonPathNumber(json, {"feedback", "raw"}, value)) options.feedback = value / 127.0f;
    if (readJsonNumber(json, "mix", value)) options.mix = std::fabs(value) > 1.0f ? value / 127.0f : value;
    if (readJsonPathNumber(json, {"mix", "normalized"}, value)) options.mix = value;
    else if (readJsonPathNumber(json, {"mix", "value"}, value)) options.mix =
        std::fabs(value) > 1.0f ? (value + 64.0f) / 127.0f : value;
    else if (readJsonPathNumber(json, {"mix", "raw"}, value)) options.mix = value / 127.0f;
    if (readJsonNumber(json, "ratio_c", value)) options.ratios[0] = value;
    if (readJsonNumber(json, "ratio_a", value)) options.ratios[1] = value;
    if (readJsonNumber(json, "ratio_b1", value)) options.ratios[2] = value;
    if (readJsonNumber(json, "ratio_b2", value)) options.ratios[3] = value;
    const char* parents[] = {"c", "a", "b1", "b2"};
    for (std::size_t i = 0; i < 4u; ++i) {
        if (readJsonNestedNumber(json, parents[i], "ratio", value)) options.ratios[i] = value;
    }
    if (readJsonPathNumber(json, {"envelopes", "b", "level", "normalized"}, value)) {
        options.bLevel = value;
    }
}

template <typename T>
void writeLittle(std::ofstream& out, T value) {
    for (std::size_t i = 0; i < sizeof(T); ++i) {
        out.put(static_cast<char>((static_cast<std::uint64_t>(value) >> (i * 8u)) & 0xffu));
    }
}

bool writeWav(const std::string& path, const std::vector<float>& audio, std::uint32_t sampleRate) {
    std::ofstream out(path, std::ios::binary);
    if (!out) return false;
    const std::uint32_t dataBytes = static_cast<std::uint32_t>(audio.size() * sizeof(std::int16_t));
    const std::uint32_t riffBytes = 36u + dataBytes;
    out.write("RIFF", 4); writeLittle(out, riffBytes); out.write("WAVE", 4);
    out.write("fmt ", 4); writeLittle(out, std::uint32_t{16}); writeLittle(out, std::uint16_t{1});
    writeLittle(out, std::uint16_t{2}); writeLittle(out, sampleRate);
    writeLittle(out, sampleRate * 4u); writeLittle(out, std::uint16_t{4});
    writeLittle(out, std::uint16_t{16}); out.write("data", 4); writeLittle(out, dataBytes);
    for (float sample : audio) {
        const float clamped = std::max(-1.0f, std::min(1.0f, sample));
        const auto pcm = static_cast<std::int16_t>(clamped * 32767.0f);
        writeLittle(out, static_cast<std::uint16_t>(pcm));
    }
    return static_cast<bool>(out);
}

} // namespace

int main(int argc, char** argv) {
    Options options;
    for (int i = 1; i < argc; ++i) {
        const std::string flag = argv[i];
        if (flag == "--help" || flag == "-h") { usage(argv[0]); return 0; }
        if (i + 1 >= argc) { std::cerr << "Missing value for " << flag << "\n"; return 2; }
        const std::string value = argv[++i];
        float parsed = 0.0f;
        if (flag == "--output") options.output = value;
        else if (flag == "--input") options.input = value;
        else if (flag == "--sequence" || flag == "--notes" || flag == "--midi-sequence") options.sequence = value;
        else if (flag == "--sequence-json") options.sequenceJson = value;
        else if (flag == "--sample-rate" && parseFloat(value, parsed)) options.sampleRate = parsed;
        else if (flag == "--duration" && parseDouble(value, options.durationSeconds)) {}
        else if (flag == "--algorithm" && parseAlgorithm(value, options.algorithm)) {}
        else if (flag == "--ratio" && parseRatios(value, options)) {}
        else if (flag == "--harm" && parseFloat(value, options.harm)) {}
        else if (flag == "--feedback" && parseFloat(value, options.feedback)) {}
        else if (flag == "--mix" && parseFloat(value, options.mix)) {}
        else if (flag == "--attack" && parseFloat(value, options.attack)) {}
        else if (flag == "--decay" && parseFloat(value, options.decay)) {}
        else if (flag == "--sustain" && parseFloat(value, options.sustain)) {}
        else if (flag == "--release" && parseFloat(value, options.release)) {}
        else { std::cerr << "Invalid flag/value: " << flag << " " << value << "\n"; return 2; }
    }
    if (!options.input.empty()) readJsonOverride(options.input, options);
    options.sampleRate = std::max(1000.0f, std::min(384000.0f, options.sampleRate));
    std::vector<NoteSpec> notes;
    if (!options.sequenceJson.empty()) {
        std::ifstream sequenceFile(options.sequenceJson);
        if (sequenceFile) options.sequenceJson.assign((std::istreambuf_iterator<char>(sequenceFile)),
                                                       std::istreambuf_iterator<char>());
        notes = parseSequenceJson(options.sequenceJson);
    }
    if (notes.empty() && !options.sequence.empty() &&
        options.sequence.find_first_of("@:,;") == std::string::npos) {
        std::ifstream sequenceFile(options.sequence);
        if (sequenceFile) options.sequence.assign((std::istreambuf_iterator<char>(sequenceFile)),
                                                   std::istreambuf_iterator<char>());
    }
    if (notes.empty()) notes = parseSequence(options.sequence.empty() ? "60@0:0.5" : options.sequence);
    if (notes.empty()) { std::cerr << "No valid notes in sequence\n"; return 2; }
    double inferredDuration = 0.0;
    for (const auto& note : notes) inferredDuration = std::max(
        inferredDuration, note.startSeconds + note.durationSeconds + options.release + 0.05);
    if (options.durationSeconds <= 0.0) options.durationSeconds = inferredDuration;
    const std::size_t frames = static_cast<std::size_t>(
        std::max(1.0, options.durationSeconds * options.sampleRate));
    if (frames > static_cast<std::size_t>(std::numeric_limits<std::uint32_t>::max() / 4u)) {
        std::cerr << "Requested WAV is too large\n"; return 2;
    }

    digitone::Engine engine(options.sampleRate);
    digitone::Parameters params = engine.parameters();
    params.algorithm = static_cast<digitone::AlgorithmId>(options.algorithm);
    params.mix = options.mix;
    params.bLevel = options.bLevel;
    params.harm = options.harm;
    params.ampEnvelope.attackSeconds = options.attack;
    params.ampEnvelope.decaySeconds = options.decay;
    params.ampEnvelope.sustain = options.sustain;
    params.ampEnvelope.releaseSeconds = options.release;
    for (std::size_t i = 0; i < digitone::kNumOperators; ++i) {
        params.operators[i].ratio = options.ratios[i];
        params.operatorRatios[i] = options.ratios[i];
    }
    const auto feedbackMask = digitone::algorithmSpec(params.algorithm).feedbackMask;
    for (std::size_t i = 0; i < digitone::kNumOperators; ++i) {
        if ((feedbackMask & (1u << i)) != 0u) params.operators[i].feedback = options.feedback;
    }
    engine.setParameters(params);

    std::vector<float> audio(frames * 2u, 0.0f);
    std::vector<digitone::Event> events;
    events.reserve(notes.size() * 2u);
    for (const auto& note : notes) {
        events.push_back({static_cast<std::size_t>(note.startSeconds * options.sampleRate),
                          digitone::EventType::NoteOn, note.midi, note.velocity});
        events.push_back({static_cast<std::size_t>((note.startSeconds + note.durationSeconds) *
                                                   options.sampleRate),
                          digitone::EventType::NoteOff, note.midi, 0.0f});
    }
    std::sort(events.begin(), events.end(), [](const digitone::Event& a, const digitone::Event& b) {
        if (a.frame != b.frame) return a.frame < b.frame;
        return a.type == digitone::EventType::NoteOff && b.type == digitone::EventType::NoteOn;
    });
    engine.process(events.data(), events.size(), audio.data(), frames);
    if (!writeWav(options.output, audio, static_cast<std::uint32_t>(options.sampleRate))) {
        std::cerr << "Unable to write " << options.output << "\n"; return 1;
    }
    std::cout << options.output << " " << frames << " frames, algorithm "
              << (options.algorithm + 1) << "\n";
    return 0;
}
