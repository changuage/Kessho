// Arrangement event statistics (M1 fixture).
//
// Renders real String Waves snapshots (exported by
// scripts/m1/export-arrangement-snapshots.ts) through the native engine and
// summarizes what the two arrangement generators emit: Random Chords (the
// chord generator) and Random Notes (lead random). The summary is compared to
// cpp/KesshoCore/tests/fixtures/arrangement-statistics.json with tolerances,
// so the later per-slot-stream refactor is judged by statistics, not by exact
// events.
//
// Record: KESSHO_M1_RECORD=1  Fixture dir override: KESSHO_M1_FIXTURE_DIR.
//
// Discriminator: arrangement events are queued with lane_id == 0xfffe and
// event_kind MANUAL_NOTE_ON. The chord generator and lead random write to the
// engine with source_id taken from the snapshot's
// arrangement.chord_generator_source_id / lead_random_source_id (String Waves:
// pad1 vs lead1), so source_id is the discriminator. If both generators were
// ever routed to the same source this test would need a different key (the
// fixture cases never do that); chord pad-split mode (which fans a chord out
// over several sources) is not used by these cases.
//
// Chord grouping: a chord trigger emits all voices from one tick with voice
// delays inside the spread window, so chord note-ons are grouped by
// floor(onset / chord_interval_seconds), i.e. by the chord slot they belong to.

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "KesshoCore/KesshoProductCore.h"

namespace {

// Tolerances for check mode. M3 (per-slot random streams) relies on these:
// the refactor may change exact events but must stay inside these bands.
constexpr double kCountRelativeTolerance = 0.15;      // events per phrase, voices per chord
constexpr double kCountAbsoluteFloor = 1.0;           // min/max counts are small integers
constexpr double kVelocityTolerance = 0.05;           // velocity min/max/mean
constexpr double kPitchToleranceSemitones = 2.0;      // pitch min/max/mean
constexpr double kHistogramL1Tolerance = 0.25;        // onset histogram L1 distance
constexpr double kSpreadRelativeTolerance = 0.20;     // voice-entry spread mean/max
constexpr uint32_t kChunkFrames = 4096u;
constexpr uint32_t kMaxEventsPerChunk = 4096u;
constexpr double kSampleRate = 48000.0;
constexpr uint32_t kHistogramBins = 8u;
constexpr uint16_t kArrangementLane = 0xfffeu;

using Metrics = std::vector<std::pair<std::string, std::vector<double>>>;

[[noreturn]] void fail(const std::string& message) {
  std::cerr << "Kessho Product Arrangement Statistics test failed: " << message << "\n";
  std::exit(1);
}

void require(bool condition, const std::string& message) {
  if (!condition) fail(message);
}

struct NoteOn {
  double seconds;
  float midi;
  float velocity;
};

struct CaseSpec {
  std::string name;
  double render_seconds = 0.0;
};

std::string readFile(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  require(in.good(), "cannot read " + path);
  std::ostringstream buffer;
  buffer << in.rdbuf();
  return buffer.str();
}

// Minimal parser for cases.json produced by the exporter.
std::vector<CaseSpec> parseCases(const std::string& text) {
  std::vector<CaseSpec> cases;
  size_t pos = 0;
  while ((pos = text.find("\"name\"", pos)) != std::string::npos) {
    const size_t q1 = text.find('"', text.find(':', pos) + 1);
    const size_t q2 = text.find('"', q1 + 1);
    CaseSpec spec;
    spec.name = text.substr(q1 + 1, q2 - q1 - 1);
    const size_t key = text.find("\"renderSeconds\"", q2);
    require(key != std::string::npos, "cases.json missing renderSeconds");
    spec.render_seconds = std::strtod(text.c_str() + text.find(':', key) + 1, nullptr);
    cases.push_back(spec);
    pos = q2;
  }
  require(!cases.empty(), "cases.json lists no cases");
  return cases;
}

struct GeneratorEvents {
  std::vector<NoteOn> notes;
};

struct RenderResult {
  GeneratorEvents chords;
  GeneratorEvents leads;
  double chord_phrase_seconds = 0.0;
  double chord_interval_seconds = 0.0;
  double lead_phrase_seconds = 0.0;
};

RenderResult renderCase(const std::string& dir, const CaseSpec& spec) {
  const std::string bytes = readFile(dir + "/" + spec.name + ".snapshot.bin");
  require(bytes.size() == sizeof(KesshoProductSnapshotV2),
          spec.name + ": snapshot size " + std::to_string(bytes.size()) + " != sizeof(KesshoProductSnapshotV2) " +
              std::to_string(sizeof(KesshoProductSnapshotV2)));
  KesshoProductSnapshotV2 snapshot{};
  std::copy(bytes.begin(), bytes.end(), reinterpret_cast<char*>(&snapshot));
  require(snapshot.transport.running != 0u, spec.name + ": snapshot transport is not running");

  KesshoProductEngine* engine = kessho_product_create(kSampleRate, 128, 0);
  require(engine != nullptr, "engine create failed");
  require(kessho_product_load_snapshot_v2(engine, bytes.data(), bytes.size()) == KESSHO_PRODUCT_OK,
          spec.name + ": snapshot load failed");

  RenderResult result;
  // The chord generator ticks once per chord interval (equal to the phrase
  // length unless the harmony clock is beat based), so that is its phrase.
  result.chord_interval_seconds = snapshot.harmony.chord_interval_seconds > 0.0f
      ? snapshot.harmony.chord_interval_seconds
      : snapshot.harmony.phrase_length_seconds;
  result.chord_phrase_seconds = result.chord_interval_seconds;
  result.lead_phrase_seconds = snapshot.arrangement.lead_phrase_seconds;
  const uint32_t chord_source = snapshot.arrangement.chord_generator_source_id;
  const uint32_t lead_source = snapshot.arrangement.lead_random_source_id;
  require(chord_source != lead_source, spec.name + ": chord and lead share a source id; discriminator invalid");

  std::vector<KesshoSequencerEvent> events(kMaxEventsPerChunk);
  const uint64_t total_frames = static_cast<uint64_t>(std::llround(spec.render_seconds * kSampleRate));
  for (uint64_t start = 0; start < total_frames; start += kChunkFrames) {
    const uint32_t frames = static_cast<uint32_t>(std::min<uint64_t>(kChunkFrames, total_frames - start));
    const int32_t count = kessho_product_debug_render_events(engine, events.data(), kMaxEventsPerChunk, frames);
    require(count >= 0, spec.name + ": debug_render_events failed");
    require(static_cast<uint32_t>(count) < kMaxEventsPerChunk, spec.name + ": event buffer filled, events may be lost");
    for (int32_t i = 0; i < count; ++i) {
      const KesshoSequencerEvent& e = events[static_cast<size_t>(i)];
      if (e.lane_id != kArrangementLane) continue;
      if (e.event_kind != KESSHO_PRODUCT_EVENT_KIND_MANUAL_NOTE_ON) continue;
      const NoteOn note{static_cast<double>(start + e.sample_offset) / kSampleRate, e.midi_note, e.velocity};
      if (e.source_id == chord_source) result.chords.notes.push_back(note);
      else if (e.source_id == lead_source) result.leads.notes.push_back(note);
    }
  }
  kessho_product_destroy(engine);
  return result;
}

double mean(const std::vector<double>& v) {
  if (v.empty()) return 0.0;
  double sum = 0.0;
  for (double x : v) sum += x;
  return sum / static_cast<double>(v.size());
}
double minOf(const std::vector<double>& v) { return v.empty() ? 0.0 : *std::min_element(v.begin(), v.end()); }
double maxOf(const std::vector<double>& v) { return v.empty() ? 0.0 : *std::max_element(v.begin(), v.end()); }

double round4(double v) {
  const double r = std::round(v * 10000.0) / 10000.0;
  return r == 0.0 ? 0.0 : r;
}

void addStats(Metrics& m, const std::string& prefix, const std::vector<double>& v) {
  m.push_back({prefix + ".min", {minOf(v)}});
  m.push_back({prefix + ".max", {maxOf(v)}});
  m.push_back({prefix + ".mean", {mean(v)}});
}

Metrics summarize(const GeneratorEvents& gen, double phrase_seconds, double render_seconds, bool chords, double chord_interval) {
  Metrics m;
  const size_t phrase_count = std::max<size_t>(1u, static_cast<size_t>(std::llround(render_seconds / phrase_seconds)));
  std::vector<double> per_phrase(phrase_count, 0.0);
  std::vector<double> histogram(kHistogramBins, 0.0);
  std::vector<double> velocity;
  std::vector<double> pitch;
  for (const NoteOn& n : gen.notes) {
    const size_t phrase = std::min<size_t>(phrase_count - 1u, static_cast<size_t>(n.seconds / phrase_seconds + 1e-9));
    per_phrase[phrase] += 1.0;
    const double phase = std::fmod(n.seconds, phrase_seconds) / phrase_seconds;
    histogram[std::min<size_t>(kHistogramBins - 1u, static_cast<size_t>(phase * kHistogramBins))] += 1.0;
    velocity.push_back(n.velocity);
    pitch.push_back(n.midi);
  }
  const double total = static_cast<double>(gen.notes.size());
  if (total > 0.0) for (double& bin : histogram) bin /= total;

  m.push_back({"eventsPerPhrase.mean", {mean(per_phrase)}});
  m.push_back({"eventsPerPhrase.min", {minOf(per_phrase)}});
  m.push_back({"eventsPerPhrase.max", {maxOf(per_phrase)}});
  m.push_back({"onsetHistogram", histogram});
  addStats(m, "velocity", velocity);
  addStats(m, "pitch", pitch);

  if (chords) {
    std::map<int64_t, std::vector<double>> groups;
    for (const NoteOn& n : gen.notes) groups[static_cast<int64_t>(std::floor(n.seconds / chord_interval + 1e-6))].push_back(n.seconds);
    std::vector<double> spreads;
    std::vector<double> voices;
    for (const auto& group : groups) {
      spreads.push_back(maxOf(group.second) - minOf(group.second));
      voices.push_back(static_cast<double>(group.second.size()));
    }
    m.push_back({"voiceEntrySpreadSeconds.mean", {mean(spreads)}});
    m.push_back({"voiceEntrySpreadSeconds.max", {maxOf(spreads)}});
    m.push_back({"voicesPerChord.mean", {mean(voices)}});
    m.push_back({"voicesPerChord.max", {maxOf(voices)}});
  }
  for (auto& entry : m) for (double& v : entry.second) v = round4(v);
  return m;
}

// ---- Fixture emit: {"cases": {"<case>": {"chords": {...}, "notes": {...}}}} ----

std::string number(double v) {
  char buffer[64];
  std::snprintf(buffer, sizeof(buffer), "%.4f", v);
  std::string s = buffer;
  while (s.size() > 1 && s.back() == '0') s.pop_back();
  if (!s.empty() && s.back() == '.') s.push_back('0');
  return s == "-0.0" ? "0.0" : s;
}

std::string emitMetrics(const Metrics& m, const std::string& indent) {
  std::ostringstream out;
  // Metric names are "group.leaf" or just "name"; emit grouped objects in insertion order.
  std::vector<std::string> groups;
  for (const auto& e : m) {
    const size_t dot = e.first.find('.');
    const std::string group = dot == std::string::npos ? e.first : e.first.substr(0, dot);
    if (std::find(groups.begin(), groups.end(), group) == groups.end()) groups.push_back(group);
  }
  for (size_t g = 0; g < groups.size(); ++g) {
    out << indent << "\"" << groups[g] << "\": ";
    const auto direct = std::find_if(m.begin(), m.end(), [&](const auto& e) { return e.first == groups[g]; });
    if (direct != m.end()) {
      out << "[";
      for (size_t i = 0; i < direct->second.size(); ++i) out << (i ? ", " : "") << number(direct->second[i]);
      out << "]";
    } else {
      out << "{";
      bool first = true;
      for (const auto& e : m) {
        if (e.first.compare(0, groups[g].size() + 1, groups[g] + ".") != 0) continue;
        out << (first ? "" : ", ") << "\"" << e.first.substr(groups[g].size() + 1) << "\": " << number(e.second[0]);
        first = false;
      }
      out << "}";
    }
    out << (g + 1 < groups.size() ? ",\n" : "\n");
  }
  return out.str();
}

using Stats = std::vector<std::pair<std::string, Metrics>>;  // "<case>.<generator>" -> metrics

std::string emitFixture(const Stats& stats) {
  std::ostringstream out;
  out << "{\n  \"cases\": {\n";
  for (size_t i = 0; i < stats.size(); i += 2) {
    const std::string name = stats[i].first.substr(0, stats[i].first.find('.'));
    out << "    \"" << name << "\": {\n";
    for (size_t k = 0; k < 2; ++k) {
      const std::string gen = stats[i + k].first.substr(stats[i + k].first.find('.') + 1);
      out << "      \"" << gen << "\": {\n" << emitMetrics(stats[i + k].second, "        ")
          << "      }" << (k == 0 ? ",\n" : "\n");
    }
    out << "    }" << (i + 2 < stats.size() ? ",\n" : "\n");
  }
  out << "  }\n}\n";
  return out.str();
}

// ---- Minimal parser for the fixture's own format: flattens to "path" -> numbers ----

struct Parser {
  const std::string& s;
  size_t p = 0;
  std::map<std::string, std::vector<double>> flat;
  void ws() { while (p < s.size() && std::isspace(static_cast<unsigned char>(s[p]))) ++p; }
  std::string str() {
    ws(); require(s[p] == '"', "fixture parse: expected string"); ++p;
    const size_t end = s.find('"', p);
    std::string out = s.substr(p, end - p); p = end + 1; return out;
  }
  void value(const std::string& path) {
    ws();
    if (s[p] == '{') {
      ++p;
      for (;;) {
        ws();
        if (s[p] == '}') { ++p; return; }
        const std::string key = str();
        ws(); require(s[p] == ':', "fixture parse: expected ':'"); ++p;
        value(path.empty() ? key : path + "." + key);
        ws(); if (s[p] == ',') ++p;
      }
    } else if (s[p] == '[') {
      ++p;
      std::vector<double> values;
      for (;;) {
        ws();
        if (s[p] == ']') { ++p; break; }
        char* end = nullptr;
        values.push_back(std::strtod(s.c_str() + p, &end));
        p = static_cast<size_t>(end - s.c_str());
        ws(); if (s[p] == ',') ++p;
      }
      flat[path] = values;
    } else {
      char* end = nullptr;
      flat[path] = {std::strtod(s.c_str() + p, &end)};
      p = static_cast<size_t>(end - s.c_str());
    }
  }
};

bool within(double actual, double expected, double abs_tol, double rel_tol, double floor) {
  return std::fabs(actual - expected) <= std::max(abs_tol, std::max(rel_tol * std::fabs(expected), floor));
}

int checkAgainstFixture(const Stats& stats, const std::string& fixture_text) {
  Parser parser{fixture_text, 0u, {}};
  parser.value("");
  int failures = 0;
  const auto report = [&](const std::string& path, const std::string& detail) {
    std::cerr << "DRIFT " << path << ": " << detail << "\n";
    ++failures;
  };
  for (const auto& entry : stats) {
    const std::string base = "cases." + entry.first;
    for (const auto& metric : entry.second) {
      const std::string path = base + "." + metric.first;
      const auto it = parser.flat.find(path);
      if (it == parser.flat.end() || it->second.size() != metric.second.size()) {
        report(path, "missing in fixture (re-record with KESSHO_M1_RECORD=1)");
        continue;
      }
      const std::vector<double>& expected = it->second;
      const std::vector<double>& actual = metric.second;
      const std::string name = metric.first;
      std::ostringstream detail;
      detail << "actual " << number(actual[0]) << " expected " << number(expected[0]);
      bool ok = true;
      if (name == "onsetHistogram") {
        double l1 = 0.0;
        for (size_t i = 0; i < actual.size(); ++i) l1 += std::fabs(actual[i] - expected[i]);
        ok = l1 <= kHistogramL1Tolerance;
        detail.str(""); detail << "L1 distance " << number(l1) << " > " << kHistogramL1Tolerance;
      } else if (name.rfind("velocity.", 0) == 0) {
        ok = within(actual[0], expected[0], kVelocityTolerance, 0.0, 0.0);
      } else if (name.rfind("pitch.", 0) == 0) {
        ok = within(actual[0], expected[0], kPitchToleranceSemitones, 0.0, 0.0);
      } else if (name.rfind("voiceEntrySpreadSeconds.", 0) == 0) {
        ok = within(actual[0], expected[0], 0.0, kSpreadRelativeTolerance, 0.0);
      } else {  // eventsPerPhrase.*, voicesPerChord.*
        const bool is_extreme = name.size() > 4 && (name.compare(name.size() - 3, 3, "min") == 0 || name.compare(name.size() - 3, 3, "max") == 0);
        ok = within(actual[0], expected[0], 0.0, kCountRelativeTolerance, is_extreme ? kCountAbsoluteFloor : 0.0);
      }
      if (!ok) report(path, detail.str());
    }
  }
  return failures;
}

}  // namespace

int main() {
  const char* dir_env = std::getenv("KESSHO_M1_FIXTURE_DIR");
  const std::string dir = dir_env != nullptr && dir_env[0] != '\0' ? dir_env : "build/m1-fixtures";
  const std::string fixture_path = "cpp/KesshoCore/tests/fixtures/arrangement-statistics.json";
  const char* record_env = std::getenv("KESSHO_M1_RECORD");
  const bool record = record_env != nullptr && std::string(record_env) == "1";

  Stats stats;
  for (const CaseSpec& spec : parseCases(readFile(dir + "/cases.json"))) {
    const RenderResult r = renderCase(dir, spec);
    stats.push_back({spec.name + ".chords", summarize(r.chords, r.chord_phrase_seconds, spec.render_seconds, true, r.chord_interval_seconds)});
    stats.push_back({spec.name + ".notes", summarize(r.leads, r.lead_phrase_seconds, spec.render_seconds, false, 0.0)});
    std::cout << spec.name << ": chord note-ons " << r.chords.notes.size() << ", lead note-ons " << r.leads.notes.size() << "\n";
  }

  if (record) {
    std::ofstream out(fixture_path, std::ios::binary | std::ios::trunc);
    require(out.good(), "cannot write " + fixture_path);
    out << emitFixture(stats);
    std::cout << "Recorded " << fixture_path << "\n";
    return 0;
  }
  const int failures = checkAgainstFixture(stats, readFile(fixture_path));
  if (failures != 0) fail(std::to_string(failures) + " metric(s) drifted from " + fixture_path);
  std::cout << "Kessho Product Arrangement Statistics tests passed\n";
  return 0;
}
