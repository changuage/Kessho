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
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
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
    std::array<float, digitone::kNumOperators> levels{{1.0f, 1.0f, 1.0f, 1.0f}};
    std::array<digitone::EnvelopeParams, digitone::kNumOperators> operatorEnvelopes{};
    float gain = 0.25f;
    float drive = 0.0f;
    float filterCutoffHz = 12000.0f;
    float filterQ = 0.7f;
    float filterEnvDepth = 0.0f;
    digitone::LfoParams lfo1{};
    digitone::LfoParams lfo2{};
    bool dumpParameters = false;
    bool hasUnmappedRouting = false;
};

void usage(const char* program) {
    std::cout
        << "Usage: " << program << " [flags]\n"
        << "  --output FILE             PCM16 stereo WAV (default digitone-reference.wav)\n"
        << "  --sample-rate HZ          sample rate (default 48000)\n"
        << "  --duration SEC            render length; otherwise sequence end + release\n"
        << "  --algorithm 1..8          Digitone routing algorithm\n"
        << "  --ratio C,A,B1,B2         operator ratios\n"
        << "  --harm VALUE              bipolar HARM approximation (-1..1)\n"
        << "  --feedback VALUE          feedback amount (0..1)\n"
        << "  --mix VALUE               X/Y crossfade (0=X, 1=Y)\n"
        << "  --attack SEC --decay SEC --sustain LEVEL --release SEC\n"
        << "  --sequence SPEC           e.g. '60@0:0.5,64@0.5:0.5:0.8'\n"
        << "  --notes SPEC              alias for --sequence\n"
        << "  --midi-sequence FILE|SPEC alias for --sequence (file contents accepted)\n"
        << "  --sequence-json JSON|FILE list of {note,start,duration,velocity}\n"
        << "  --input JSON              optional canonical parameter JSON override\n"
        << "  --dump-parameters         print effective parameters as JSON and exit\n";
}

bool parseFloat(const std::string& text, float& value) {
    char* end = nullptr;
    const float parsed = std::strtof(text.c_str(), &end);
    if (end == text.c_str() || *end != '\0' || !std::isfinite(parsed)) return false;
    value = parsed;
    return true;
}

bool parseDouble(const std::string& text, double& value) {
    char* end = nullptr;
    const double parsed = std::strtod(text.c_str(), &end);
    if (end == text.c_str() || *end != '\0' || !std::isfinite(parsed)) return false;
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
        else return false;
        return true;
    }
    std::string lower;
    lower.reserve(text.size());
    for (char c : text) lower.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    for (std::size_t i = 0; i < digitone::allAlgorithmSpecs().size(); ++i) {
        std::string name = digitone::allAlgorithmSpecs()[i].name;
        for (char& c : name) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        const std::string number = std::to_string(i + 1u);
        if (lower == name || lower == ("algo" + number) ||
            lower == ("algorithm" + number) || lower == ("algorithm " + number)) {
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
    char* noteEnd = nullptr;
    const long parsedNote = std::strtol(noteText.c_str(), &noteEnd, 10);
    if (noteEnd == noteText.c_str() || *noteEnd != '\0') return false;
    note.midi = static_cast<int>(parsedNote);
    if (at == std::string::npos && colon == std::string::npos) {
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

struct JsonValue {
    enum class Type { Null, Boolean, Number, String, Object, Array };
    Type type = Type::Null;
    bool boolean = false;
    double number = 0.0;
    std::string string;
    std::map<std::string, JsonValue> object;
    std::vector<JsonValue> array;
};

class JsonParser {
public:
    explicit JsonParser(const std::string& text) : text_(text) {}

    JsonValue parse() {
        JsonValue value = parseValue();
        skipSpace();
        if (cursor_ != text_.size()) fail("trailing data");
        return value;
    }

private:
    [[noreturn]] void fail(const char* message) const {
        throw std::runtime_error(std::string(message) + " at byte " + std::to_string(cursor_));
    }

    void skipSpace() {
        while (cursor_ < text_.size() &&
               std::isspace(static_cast<unsigned char>(text_[cursor_]))) ++cursor_;
    }

    bool consume(char expected) {
        skipSpace();
        if (cursor_ >= text_.size() || text_[cursor_] != expected) return false;
        ++cursor_;
        return true;
    }

    JsonValue parseValue() {
        skipSpace();
        if (cursor_ >= text_.size()) fail("unexpected end of JSON");
        const char c = text_[cursor_];
        if (c == '{') return parseObject();
        if (c == '[') return parseArray();
        if (c == '"') { JsonValue v; v.type = JsonValue::Type::String; v.string = parseString(); return v; }
        if (c == '-' || std::isdigit(static_cast<unsigned char>(c))) return parseNumber();
        if (text_.compare(cursor_, 4, "true") == 0) {
            cursor_ += 4; JsonValue v; v.type = JsonValue::Type::Boolean; v.boolean = true; return v;
        }
        if (text_.compare(cursor_, 5, "false") == 0) {
            cursor_ += 5; JsonValue v; v.type = JsonValue::Type::Boolean; return v;
        }
        if (text_.compare(cursor_, 4, "null") == 0) { cursor_ += 4; return {}; }
        fail("invalid JSON value");
    }

    JsonValue parseObject() {
        JsonValue value; value.type = JsonValue::Type::Object; consume('{');
        if (consume('}')) return value;
        while (true) {
            skipSpace();
            if (cursor_ >= text_.size() || text_[cursor_] != '"') fail("expected object key");
            const std::string key = parseString();
            if (!consume(':')) fail("expected colon");
            JsonValue member = parseValue();
            if (!value.object.emplace(key, std::move(member)).second) fail("duplicate object key");
            if (consume('}')) return value;
            if (!consume(',')) fail("expected comma");
        }
    }

    JsonValue parseArray() {
        JsonValue value; value.type = JsonValue::Type::Array; consume('[');
        if (consume(']')) return value;
        while (true) {
            value.array.push_back(parseValue());
            if (consume(']')) return value;
            if (!consume(',')) fail("expected comma");
        }
    }

    std::string parseString() {
        if (!consume('"')) fail("expected string");
        std::string result;
        while (cursor_ < text_.size()) {
            char c = text_[cursor_++];
            if (c == '"') return result;
            if (static_cast<unsigned char>(c) < 0x20u) fail("control byte in string");
            if (c != '\\') { result.push_back(c); continue; }
            if (cursor_ >= text_.size()) fail("truncated escape");
            const char escaped = text_[cursor_++];
            switch (escaped) {
            case '"': case '\\': case '/': result.push_back(escaped); break;
            case 'b': result.push_back('\b'); break;
            case 'f': result.push_back('\f'); break;
            case 'n': result.push_back('\n'); break;
            case 'r': result.push_back('\r'); break;
            case 't': result.push_back('\t'); break;
            case 'u':
                if (cursor_ + 4u > text_.size()) fail("truncated unicode escape");
                for (int i = 0; i < 4; ++i) {
                    if (!std::isxdigit(static_cast<unsigned char>(text_[cursor_ + i])))
                        fail("invalid unicode escape");
                }
                cursor_ += 4u;
                result.push_back('?');
                break;
            default: fail("invalid string escape");
            }
        }
        fail("unterminated string");
    }

    JsonValue parseNumber() {
        const std::size_t start = cursor_;
        if (text_[cursor_] == '-') ++cursor_;
        if (cursor_ >= text_.size()) fail("truncated number");
        if (text_[cursor_] == '0') ++cursor_;
        else {
            if (!std::isdigit(static_cast<unsigned char>(text_[cursor_]))) fail("invalid number");
            while (cursor_ < text_.size() && std::isdigit(static_cast<unsigned char>(text_[cursor_]))) ++cursor_;
        }
        if (cursor_ < text_.size() && text_[cursor_] == '.') {
            ++cursor_;
            if (cursor_ >= text_.size() || !std::isdigit(static_cast<unsigned char>(text_[cursor_]))) fail("invalid fraction");
            while (cursor_ < text_.size() && std::isdigit(static_cast<unsigned char>(text_[cursor_]))) ++cursor_;
        }
        if (cursor_ < text_.size() && (text_[cursor_] == 'e' || text_[cursor_] == 'E')) {
            ++cursor_;
            if (cursor_ < text_.size() && (text_[cursor_] == '+' || text_[cursor_] == '-')) ++cursor_;
            if (cursor_ >= text_.size() || !std::isdigit(static_cast<unsigned char>(text_[cursor_]))) fail("invalid exponent");
            while (cursor_ < text_.size() && std::isdigit(static_cast<unsigned char>(text_[cursor_]))) ++cursor_;
        }
        JsonValue value; value.type = JsonValue::Type::Number;
        value.number = std::strtod(text_.c_str() + start, nullptr);
        if (!std::isfinite(value.number)) fail("non-finite number");
        return value;
    }

    const std::string& text_;
    std::size_t cursor_ = 0;
};

const JsonValue* jsonAt(const JsonValue& root, std::initializer_list<const char*> path) {
    const JsonValue* value = &root;
    for (const char* key : path) {
        if (value->type != JsonValue::Type::Object) return nullptr;
        const auto found = value->object.find(key);
        if (found == value->object.end()) return nullptr;
        value = &found->second;
    }
    return value;
}

bool jsonNumber(const JsonValue& root, std::initializer_list<const char*> path, float& out) {
    const JsonValue* value = jsonAt(root, path);
    if (value == nullptr || value->type != JsonValue::Type::Number) return false;
    out = static_cast<float>(value->number);
    return std::isfinite(out);
}

float normalizedField(const JsonValue& root, std::initializer_list<const char*> path,
                      float fallback) {
    const JsonValue* value = jsonAt(root, path);
    if (value == nullptr) return fallback;
    if (value->type == JsonValue::Type::Number)
        return std::max(0.0f, std::min(1.0f, static_cast<float>(value->number)));
    if (value->type != JsonValue::Type::Object) return fallback;
    const auto number = [&](const char* key, float scale, float& result) {
        const auto found = value->object.find(key);
        if (found == value->object.end() || found->second.type != JsonValue::Type::Number) return false;
        result = static_cast<float>(found->second.number) * scale;
        return true;
    };
    float result = fallback;
    if (number("normalized", 1.0f, result) || number("normalized_crossfade", 1.0f, result) ||
        number("raw", 1.0f / 127.0f, result) || number("value", 1.0f / 127.0f, result))
        return std::max(0.0f, std::min(1.0f, result));
    return fallback;
}

float signedField(const JsonValue& root, std::initializer_list<const char*> path,
                 float fallback, float range) {
    const JsonValue* value = jsonAt(root, path);
    if (value == nullptr || value->type != JsonValue::Type::Object) return fallback;
    const auto found = value->object.find("value");
    if (found == value->object.end() || found->second.type != JsonValue::Type::Number) return fallback;
    return std::max(-1.0f, std::min(1.0f, static_cast<float>(found->second.number) / range));
}

bool parseSequenceJson(const std::string& json, std::vector<NoteSpec>& notes, std::string& error) {
    try {
        const JsonValue root = JsonParser(json).parse();
        if (root.type != JsonValue::Type::Array) throw std::runtime_error("sequence root must be an array");
        for (const JsonValue& item : root.array) {
            if (item.type != JsonValue::Type::Object) throw std::runtime_error("sequence events must be objects");
            float value = 0.0f;
            NoteSpec note;
            if (!(jsonNumber(item, {"note"}, value) || jsonNumber(item, {"midi"}, value)) ||
                value != std::floor(value)) throw std::runtime_error("sequence event requires an integer note");
            note.midi = static_cast<int>(value);
            if (jsonNumber(item, {"start"}, value)) note.startSeconds = value;
            if (jsonNumber(item, {"duration"}, value)) note.durationSeconds = value;
            if (jsonNumber(item, {"velocity"}, value)) note.velocity = value;
            if (note.midi < 0 || note.midi > 127 || note.startSeconds < 0.0 ||
                note.durationSeconds <= 0.0) throw std::runtime_error("sequence event values are out of range");
            notes.push_back(note);
        }
        std::sort(notes.begin(), notes.end(), [](const NoteSpec& a, const NoteSpec& b) {
            return a.startSeconds < b.startSeconds;
        });
        return true;
    } catch (const std::exception& exception) {
        error = exception.what();
        return false;
    }
}

bool readJsonOverride(const std::string& path, Options& options, std::string& error) {
    std::ifstream file(path);
    if (!file) { error = "unable to read canonical JSON: " + path; return false; }
    const std::string json((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    try {
        const JsonValue root = JsonParser(json).parse();
        if (root.type != JsonValue::Type::Object) throw std::runtime_error("canonical JSON root must be an object");
        float value = 0.0f;
        if (jsonNumber(root, {"sample_rate"}, value)) options.sampleRate = value;
        if (jsonNumber(root, {"duration"}, value)) options.durationSeconds = value;
        const JsonValue* algorithm = jsonAt(root, {"algorithm"});
        if (algorithm != nullptr) {
            if (algorithm->type == JsonValue::Type::Number) {
                if (algorithm->number != std::floor(algorithm->number))
                    throw std::runtime_error("algorithm must be an integer from 1..8");
                const int raw = static_cast<int>(algorithm->number);
                if (raw >= 1 && raw <= 8) options.algorithm = raw - 1;
                else throw std::runtime_error("algorithm must be 1..8");
            } else if (algorithm->type == JsonValue::Type::String &&
                       !parseAlgorithm(algorithm->string, options.algorithm)) {
                throw std::runtime_error("invalid algorithm name");
            }
        }
        options.harm = signedField(root, {"harm"}, options.harm, 26.0f);
        if (jsonNumber(root, {"harm", "normalized"}, value)) options.harm = value;
        options.feedback = normalizedField(root, {"feedback"}, options.feedback);
        options.mix = normalizedField(root, {"mix"}, options.mix);
        const char* roles[] = {"c", "a", "b1", "b2"};
        for (std::size_t i = 0; i < 4u; ++i) {
            if (jsonNumber(root, {"ratios", roles[i], "ratio"}, value)) options.ratios[i] = value;
        }
        options.levels[1] = normalizedField(root, {"envelopes", "a", "level"}, options.levels[1]);
        options.bLevel = normalizedField(root, {"envelopes", "b", "level"}, options.bLevel);
        const auto mapEnvelope = [&](const char* group, std::size_t first, std::size_t last) {
            if (jsonAt(root, {"envelopes", group}) == nullptr) return;
            const float attack = digitone::envelopeSecondsFromNormalized(
                normalizedField(root, {"envelopes", group, "attack"}, 0.0f));
            const float decay = digitone::envelopeSecondsFromNormalized(
                normalizedField(root, {"envelopes", group, "decay"}, 0.0f));
            const float sustain = normalizedField(root, {"envelopes", group, "end"}, 1.0f);
            for (std::size_t i = first; i <= last; ++i) {
                options.operatorEnvelopes[i].attackSeconds = attack;
                options.operatorEnvelopes[i].decaySeconds = decay;
                options.operatorEnvelopes[i].sustain = sustain;
            }
        };
        mapEnvelope("a", 1u, 1u);
        mapEnvelope("b", 2u, 3u);
        if (jsonAt(root, {"amp", "amp_attack"}) != nullptr)
            options.attack = digitone::envelopeSecondsFromNormalized(
                normalizedField(root, {"amp", "amp_attack"}, 0.0f));
        if (jsonAt(root, {"amp", "amp_decay"}) != nullptr)
            options.decay = digitone::envelopeSecondsFromNormalized(
                normalizedField(root, {"amp", "amp_decay"}, 0.0f));
        if (jsonAt(root, {"amp", "amp_sustain"}) != nullptr)
            options.sustain = normalizedField(root, {"amp", "amp_sustain"}, options.sustain);
        if (jsonAt(root, {"amp", "amp_release"}) != nullptr)
            options.release = digitone::envelopeSecondsFromNormalized(
                normalizedField(root, {"amp", "amp_release"}, 0.0f));
        options.gain = normalizedField(root, {"amp", "vol"}, options.gain);
        options.drive = normalizedField(root, {"amp", "drive"}, options.drive);
        if (jsonAt(root, {"filter", "filt1_freq"}) != nullptr)
            options.filterCutoffHz = digitone::filterCutoffFromNormalized(
                normalizedField(root, {"filter", "filt1_freq"}, 0.75f));
        if (jsonAt(root, {"filter", "filt1_reso"}) != nullptr)
            options.filterQ = digitone::filterQFromNormalized(
                normalizedField(root, {"filter", "filt1_reso"}, 0.01f));
        if (jsonAt(root, {"filter", "filt_env"}) != nullptr)
            options.filterEnvDepth = signedField(root, {"filter", "filt_env"}, 0.0f, 64.0f) * 10000.0f;
        const auto mapLfo = [&](std::size_t index, digitone::LfoParams& lfo) {
            const JsonValue* list = jsonAt(root, {"lfos"});
            if (list == nullptr || list->type != JsonValue::Type::Array || index >= list->array.size()) return;
            const JsonValue& item = list->array[index];
            lfo.rateHz = digitone::lfoRateFromNormalized(std::fabs(
                signedField(item, {"speed"}, 0.0f, 64.0f)));
            lfo.depth = std::fabs(signedField(item, {"depth"}, 0.0f, 64.0f));
            if (jsonNumber(item, {"waveform", "raw"}, value))
                lfo.waveform = (static_cast<int>(value) & 1) != 0
                    ? digitone::LfoWaveform::Triangle : digitone::LfoWaveform::Sine;
        };
        mapLfo(0u, options.lfo1);
        mapLfo(1u, options.lfo2);
        const JsonValue* routing = jsonAt(root, {"routing"});
        options.hasUnmappedRouting = routing != nullptr &&
            routing->type == JsonValue::Type::Object && !routing->object.empty();
        return true;
    } catch (const std::exception& exception) {
        error = "invalid canonical JSON: " + std::string(exception.what());
        return false;
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

void dumpParameters(const digitone::Parameters& params, float sampleRate) {
    std::cout << "{\"sample_rate\":" << sampleRate
              << ",\"algorithm\":" << (static_cast<int>(params.algorithm) + 1)
              << ",\"harm\":" << params.harm
              << ",\"feedback\":";
    const auto feedbackMask = digitone::algorithmSpec(params.algorithm).feedbackMask;
    float feedback = 0.0f;
    for (std::size_t i = 0; i < digitone::kNumOperators; ++i)
        if ((feedbackMask & (1u << i)) != 0u) feedback = params.operators[i].feedback;
    std::cout << feedback << ",\"mix\":" << params.mix
              << ",\"b_level\":" << params.bLevel
              << ",\"gain\":" << params.gain
              << ",\"drive\":" << params.drive
              << ",\"filter_cutoff_hz\":" << params.filterCutoffHz
              << ",\"filter_q\":" << params.filterQ
              << ",\"ratios\":[";
    for (std::size_t i = 0; i < digitone::kNumOperators; ++i) {
        if (i != 0u) std::cout << ',';
        std::cout << params.operators[i].ratio;
    }
    std::cout << "],\"levels\":[";
    for (std::size_t i = 0; i < digitone::kNumOperators; ++i) {
        if (i != 0u) std::cout << ',';
        std::cout << params.operators[i].level;
    }
    std::cout << "],\"amp_envelope\":{"
              << "\"attack\":" << params.ampEnvelope.attackSeconds
              << ",\"decay\":" << params.ampEnvelope.decaySeconds
              << ",\"sustain\":" << params.ampEnvelope.sustain
              << ",\"release\":" << params.ampEnvelope.releaseSeconds
              << "}}\n";
}

} // namespace

int main(int argc, char** argv) {
    Options options;
    for (int i = 1; i < argc; ++i) {
        const std::string flag = argv[i];
        if (flag == "--help" || flag == "-h") { usage(argv[0]); return 0; }
        if (flag == "--dump-parameters") { options.dumpParameters = true; continue; }
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
    std::string jsonError;
    if (!options.input.empty() && !readJsonOverride(options.input, options, jsonError)) {
        std::cerr << jsonError << "\n";
        return 2;
    }
    if (options.hasUnmappedRouting) {
        std::cerr << "warning: canonical modulation destination IDs are preserved but not "
                     "mapped until hardware calibration establishes their semantics\n";
    }
    options.sampleRate = std::max(1000.0f, std::min(384000.0f, options.sampleRate));
    std::vector<NoteSpec> notes;
    if (!options.sequenceJson.empty()) {
        std::ifstream sequenceFile(options.sequenceJson);
        if (sequenceFile) options.sequenceJson.assign((std::istreambuf_iterator<char>(sequenceFile)),
                                                       std::istreambuf_iterator<char>());
        if (!parseSequenceJson(options.sequenceJson, notes, jsonError)) {
            std::cerr << "Invalid sequence JSON: " << jsonError << "\n";
            return 2;
        }
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
    const double requestedFrames = options.durationSeconds * options.sampleRate;
    const double maximumFrames = static_cast<double>(
        std::numeric_limits<std::uint32_t>::max() / 4u);
    if (!std::isfinite(requestedFrames) || requestedFrames <= 0.0 || requestedFrames > maximumFrames) {
        std::cerr << "Requested WAV is too large\n"; return 2;
    }
    const std::size_t frames = static_cast<std::size_t>(std::max(1.0, requestedFrames));

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
    params.gain = options.gain;
    params.drive = options.drive;
    params.filterCutoffHz = options.filterCutoffHz;
    params.filterQ = options.filterQ;
    params.filterEnvDepth = options.filterEnvDepth;
    params.lfo1 = options.lfo1;
    params.lfo2 = options.lfo2;
    for (std::size_t i = 0; i < digitone::kNumOperators; ++i) {
        params.operators[i].ratio = options.ratios[i];
        params.operatorRatios[i] = options.ratios[i];
        params.operators[i].level = options.levels[i];
        params.operators[i].envelope = options.operatorEnvelopes[i];
    }
    const auto feedbackMask = digitone::algorithmSpec(params.algorithm).feedbackMask;
    for (std::size_t i = 0; i < digitone::kNumOperators; ++i) {
        if ((feedbackMask & (1u << i)) != 0u) params.operators[i].feedback = options.feedback;
    }
    engine.setParameters(params);
    if (options.dumpParameters) {
        dumpParameters(engine.parameters(), options.sampleRate);
        return 0;
    }

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
