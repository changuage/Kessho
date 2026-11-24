#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <initializer_list>
#include <vector>

#include "../src/product/music/ChordResolver.h"

using namespace kessho::product::music;

static_assert(sizeof(KesshoProductChordNote) == 20, "chord note wire size");
static_assert(sizeof(KesshoProductChordIntent) == 36, "chord intent wire size");

namespace {

void require(bool ok, const char* msg) {
  if (!ok) {
    std::fprintf(stderr, "FAIL: %s\n", msg);
    std::exit(1);
  }
}

std::vector<float> resolve(const KesshoProductChordIntent& i, float root = 60.0f, uint32_t scale = 0u,
                           const ChordResolveOptions& o = {}) {
  KesshoProductChordNote out[16];
  const uint32_t n = resolveChord(i, nullptr, 0u, ChordFrame{root, scale}, o, out, 16u);
  std::vector<float> r;
  for (uint32_t k = 0u; k < n; ++k) r.push_back(out[k].midi);
  return r;
}

void expect(const std::vector<float>& got, std::initializer_list<float> want, const char* msg) {
  bool ok = got.size() == want.size();
  if (ok) {
    size_t k = 0;
    for (float w : want) ok = ok && got[k++] == w;
  }
  if (!ok) {
    std::fprintf(stderr, "got:");
    for (float g : got) std::fprintf(stderr, " %g", g);
    std::fprintf(stderr, "\n");
  }
  require(ok, msg);
}

KesshoProductChordIntent make(int32_t degree = 0, uint32_t quality = 0u, uint32_t ext = 0u) {
  KesshoProductChordIntent i{};
  i.degree = degree;
  i.quality = quality;
  i.extensions = ext;
  return i;
}

float costOf(const std::vector<float>& v, const KesshoProductChordNote* prev, uint32_t pn) {
  float c = 0.0f;
  for (float m : v) {
    float b = 1e9f;
    for (uint32_t p = 0; p < pn; ++p) b = std::fmin(b, std::fabs(m - prev[p].midi));
    c += b;
  }
  return c;
}

} // namespace

int main() {
  expect(resolve(KesshoProductChordIntent{}), {60, 64, 67}, "zero intent is C major");
  expect(resolve(make(1)), {62, 65, 69}, "D minor");
  expect(resolve(make(4, 0, KESSHO_PRODUCT_CHORD_EXT_SEVENTH)), {67, 71, 74, 77}, "G7");
  expect(resolve(make(6)), {71, 74, 77}, "B dim");
  expect(resolve(make(-1)), {59, 62, 65}, "degree -1");
  expect(resolve(make(7)), {72, 76, 79}, "degree 7");
  expect(resolve(make(0, 0, KESSHO_PRODUCT_CHORD_EXT_SEVENTH), 57.0f, 2u), {57, 60, 64, 67}, "Am7");
  expect(resolve(make(0), 62.0f, 8u), {62, 65, 69}, "D dorian is Dm");

  expect(resolve(make(0, KESSHO_PRODUCT_CHORD_QUALITY_MAJOR,
                      KESSHO_PRODUCT_CHORD_EXT_SEVENTH | KESSHO_PRODUCT_CHORD_EXT_DOMINANT)),
         {60, 64, 67, 70}, "dominant 7");
  expect(resolve(make(0, KESSHO_PRODUCT_CHORD_QUALITY_SUS4)), {60, 65, 67}, "sus4");
  expect(resolve(make(0, KESSHO_PRODUCT_CHORD_QUALITY_DIMINISHED, KESSHO_PRODUCT_CHORD_EXT_SEVENTH)),
         {60, 63, 66, 69}, "dim7");

  auto inv = make();
  inv.inversion = 1;
  expect(resolve(inv), {64, 67, 72}, "inversion 1");
  inv.inversion = 2;
  expect(resolve(inv), {67, 72, 76}, "inversion 2");
  inv.inversion = 3;
  expect(resolve(inv), {60, 64, 67}, "inversion 3 wraps");

  auto sp = make(0, 0, KESSHO_PRODUCT_CHORD_EXT_SEVENTH);
  sp.spread = 1.0f;
  expect(resolve(sp), {60, 67, 71, 76}, "spread 1");
  sp.spread = 0.0f;
  expect(resolve(sp), {60, 64, 67, 71}, "spread 0");

  auto reg = make();
  reg.register_octave = -1;
  expect(resolve(reg), {48, 52, 55}, "register -1");

  auto bass = make();
  bass.inversion = 1;
  bass.bass_mode = KESSHO_PRODUCT_CHORD_BASS_ROOT;
  expect(resolve(bass), {60, 64, 67, 72}, "bass root under inversion 1");
  bass = make();
  bass.bass_mode = KESSHO_PRODUCT_CHORD_BASS_PITCH_CLASS;
  bass.bass_pitch_class = 7u;
  expect(resolve(bass), {55, 60, 64, 67}, "bass pitch class 7");

  {
    KesshoProductChordNote fx[2] = {{61.5f, 0.5f, 1.5f, 0.25f, 7u}, {130.0f, 0.8f, 0.0f, 0.0f, 0u}};
    KesshoProductChordIntent fi{};
    fi.behavior = KESSHO_PRODUCT_CHORD_BEHAVIOR_FIXED;
    KesshoProductChordNote out[4];
    require(resolveChord(fi, fx, 2u, ChordFrame{}, ChordResolveOptions{}, out, 4u) == 2u, "fixed count");
    require(out[0].midi == 61.5f && out[0].velocity == 0.5f && out[0].gate_beats == 1.5f &&
                out[0].offset_beats == 0.25f && out[0].destination_source_id == 7u,
            "fixed passthrough");
    require(out[1].midi == 118.0f, "fixed folds 130 to 118");
  }

  {
    const KesshoProductChordNote prev[4] = {{60, 1, 0, 0, 0}, {64, 1, 0, 0, 0}, {67, 1, 0, 0, 0}, {71, 1, 0, 0, 0}};
    auto am7 = make(5, 0, KESSHO_PRODUCT_CHORD_EXT_SEVENTH);
    ChordResolveOptions o;
    o.smooth = true;
    o.previous = prev;
    o.previous_count = 4u;
    const auto smooth = resolve(am7, 60.0f, 0u, o);
    const auto plain = resolve(am7);
    int shared = 0;
    for (float m : smooth)
      for (float p : {60.0f, 64.0f, 67.0f}) shared += (m == p) ? 1 : 0;
    expect(smooth, {60, 64, 67, 69}, "smooth Am7 voicing");
    require(shared >= 3, "smooth keeps common tones");
    require(costOf(smooth, prev, 4u) <= costOf(plain, prev, 4u), "smooth cost <= plain");
    o.previous_count = 0u;
    require(resolve(am7, 60.0f, 0u, o) == plain, "smooth without previous equals plain");
  }

  {
    KesshoProductChordNote out[4];
    const KesshoProductChordIntent c{};
    require(resolveChord(c, nullptr, 0u, ChordFrame{}, ChordResolveOptions{}, out, 2u) == 2u, "capacity 2");
    require(out[0].midi == 60.0f && out[1].midi == 64.0f, "capacity keeps lowest");
    require(resolveChord(c, nullptr, 0u, ChordFrame{}, ChordResolveOptions{}, nullptr, 4u) == 0u, "null out");
    require(resolveChord(c, nullptr, 0u, ChordFrame{}, ChordResolveOptions{}, out, 0u) == 0u, "zero capacity");
  }

  std::puts("ProductChordResolverTests passed");
  return 0;
}
