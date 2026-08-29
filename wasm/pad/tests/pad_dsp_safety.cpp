#include "kessho_pad.h"

#include <algorithm>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <string_view>
#include <vector>

namespace {

double g_clean_basic_p99_ms[3] = {0.0, 0.0, 0.0};

void requireCheck(bool condition, const char* message) {
  if (condition) return;
  std::fprintf(stderr, "pad_dsp_safety: %s\n", message);
  std::abort();
}

void requireCpuBudget(bool condition, const char* caseName, int voices, double p99Ratio, double limit) {
  if (condition) return;
  std::fprintf(stderr,
               "pad_dsp_safety: CPU p99 deadline ratio exceeded case=%s voices=%d ratio=%.4f limit=%.4f\n",
               caseName, voices, p99Ratio, limit);
  std::abort();
}

void configure(KesshoPadInstance* pad, int voices, float sampleRate) {
  (void)sampleRate;
  for (int p = 0; p < PAD_NUM_PADS; ++p) {
    pad_instance_set_osc_a_wave(pad, p, PAD_WAVE_COMPLEX_TRIANGLE);
    pad_instance_set_osc_a_position(pad, p, 0.63f);
    pad_instance_set_osc_a_phase_distortion(pad, p, 0.37f);
    pad_instance_set_osc_a_pitch(pad, p, -7.25f);
    pad_instance_set_osc_a_hz_offset(pad, p, -4.5f);
    pad_instance_set_osc_a_level(pad, p, 0.8f);
    pad_instance_set_osc_b_wave(pad, p, PAD_WAVE_HARMONIC);
    pad_instance_set_osc_b_position(pad, p, 0.41f);
    pad_instance_set_osc_b_phase_distortion(pad, p, -0.21f);
    pad_instance_set_osc_b_pitch(pad, p, 7.08f);
    pad_instance_set_osc_b_hz_offset(pad, p, 2.0f);
    pad_instance_set_osc_b_level(pad, p, 0.7f);
    pad_instance_set_osc_mix(pad, p, 0.5f);
    pad_instance_set_drift(pad, p, 0.42f);
    pad_instance_set_phase_reset(pad, p, PAD_PHASE_RESET_RANDOM);
    pad_instance_set_sub_enabled(pad, p, 1);
    pad_instance_set_sub_octave(pad, p, -1);
    pad_instance_set_sub_wave(pad, p, PAD_WAVE_SAWTOOTH);
    pad_instance_set_sub_level(pad, p, 0.15f);
    pad_instance_set_hardness(pad, p, 0.62f);
    pad_instance_set_warmth(pad, p, 0.58f);
    pad_instance_set_presence(pad, p, 0.42f);
    pad_instance_set_fold_amount(pad, p, 0.35f);
    pad_instance_set_fold_mode(pad, p, PAD_FOLD_SERGE);
    pad_instance_set_filter_type(pad, p, PAD_FILTER_LADDER_LP);
    pad_instance_set_filter_cutoff(pad, p, 1200.0f);
    pad_instance_set_filter_resonance(pad, p, 0.72f);
    pad_instance_set_filter_q(pad, p, 0.7f);
    pad_instance_set_filter_b_enabled(pad, p, 1);
    pad_instance_set_filter_b_type(pad, p, PAD_FILTER_LP);
    pad_instance_set_filter_b_cutoff(pad, p, 2600.0f);
    pad_instance_set_filter_b_resonance(pad, p, 0.55f);
    pad_instance_set_filter_b_q(pad, p, 0.8f);
    pad_instance_set_filter_routing(pad, p, PAD_ROUTE_SERIES);
    pad_instance_set_lfo1_rate(pad, p, 1.7f);
    pad_instance_set_lfo1_depth(pad, p, 0.4f);
    pad_instance_set_lfo1_wave(pad, p, PAD_LFO_SINE);
    pad_instance_set_lfo1_dest(pad, p, PAD_DEST_OSC_A_POSITION);
    pad_instance_set_lfo2_rate(pad, p, 2.3f);
    pad_instance_set_lfo2_depth(pad, p, 0.25f);
    pad_instance_set_lfo2_wave(pad, p, PAD_LFO_TRIANGLE);
    pad_instance_set_lfo2_dest(pad, p, PAD_DEST_FILTER_RESONANCE);
    pad_instance_set_level(pad, p, 0.8f);
  }
  for (int voice = 0; voice < voices; ++voice) {
    pad_instance_set_voice_pad(pad, voice, voice & 1);
    pad_instance_note_on(pad, voice, 55.0f + static_cast<float>(voice) * 13.0f, 0.7f);
  }
}

void assertFiniteBlock(KesshoPadInstance* pad, int frames) {
  const float* output = pad_instance_get_output_ptr(pad);
  for (int i = 0; i < frames * 2; ++i) {
    assert(std::isfinite(output[i]));
    assert(std::fabs(output[i]) <= 1.01f);
  }
}

void configurePure(KesshoPadInstance* pad, float sampleRate, int phaseReset,
                   int waveA = PAD_WAVE_SINE, int waveB = PAD_WAVE_SINE,
                   float mix = 0.0f, float frequency = 440.0f) {
  (void)sampleRate;
  for (int p = 0; p < PAD_NUM_PADS; ++p) {
    pad_instance_set_osc_a_wave(pad, p, waveA);
    pad_instance_set_osc_a_position(pad, p, 0.0f);
    pad_instance_set_osc_a_phase_distortion(pad, p, 0.0f);
    pad_instance_set_osc_a_pitch(pad, p, 0.0f);
    pad_instance_set_osc_a_hz_offset(pad, p, 0.0f);
    pad_instance_set_osc_a_level(pad, p, 1.0f);
    pad_instance_set_osc_b_wave(pad, p, waveB);
    pad_instance_set_osc_b_position(pad, p, 0.0f);
    pad_instance_set_osc_b_phase_distortion(pad, p, 0.0f);
    pad_instance_set_osc_b_pitch(pad, p, 0.0f);
    pad_instance_set_osc_b_hz_offset(pad, p, 0.0f);
    pad_instance_set_osc_b_level(pad, p, 0.0f);
    pad_instance_set_osc_mix(pad, p, mix);
    pad_instance_set_drift(pad, p, 0.0f);
    pad_instance_set_phase_reset(pad, p, phaseReset);
    pad_instance_set_sub_enabled(pad, p, 0);
    pad_instance_set_noise_level(pad, p, 0.0f);
    pad_instance_set_hardness(pad, p, 0.0f);
    pad_instance_set_warmth(pad, p, 0.5f);
    pad_instance_set_presence(pad, p, 0.5f);
    pad_instance_set_fold_amount(pad, p, 0.0f);
    pad_instance_set_filter_type(pad, p, PAD_FILTER_LP);
    pad_instance_set_filter_cutoff(pad, p, 18000.0f);
    pad_instance_set_filter_resonance(pad, p, 0.0f);
    pad_instance_set_filter_q(pad, p, 0.05f);
    pad_instance_set_filter_slope(pad, p, 12.0f);
    pad_instance_set_filter_key_tracking(pad, p, 0.0f);
    pad_instance_set_filter_b_enabled(pad, p, 0);
    pad_instance_set_attack(pad, p, 0.001f);
    pad_instance_set_decay(pad, p, 0.001f);
    pad_instance_set_sustain(pad, p, 1.0f);
    pad_instance_set_release(pad, p, 0.01f);
    pad_instance_set_level(pad, p, 1.0f);
  }
  pad_instance_set_voice_pad(pad, 0, 0);
  pad_instance_note_on(pad, 0, frequency, 1.0f);
}

std::vector<float> renderMono(KesshoPadInstance* pad, int frames, int warmupBlocks = 8) {
  for (int i = 0; i < warmupBlocks; ++i) {
    pad_instance_process_block(pad, 128);
    assertFiniteBlock(pad, 128);
  }
  std::vector<float> output;
  output.reserve(static_cast<size_t>(frames));
  for (int offset = 0; offset < frames; offset += 128) {
    const int block = std::min(128, frames - offset);
    pad_instance_process_block(pad, block);
    assertFiniteBlock(pad, block);
    const float* interleaved = pad_instance_get_output_ptr(pad);
    for (int i = 0; i < block; ++i) output.push_back(interleaved[i * 2]);
  }
  return output;
}

double rms(const std::vector<float>& samples) {
  double sum = 0.0;
  for (float sample : samples) sum += static_cast<double>(sample) * sample;
  return std::sqrt(sum / std::max<size_t>(1, samples.size()));
}

double meanValue(const std::vector<float>& samples) {
  double sum = 0.0;
  for (float sample : samples) sum += sample;
  return sum / static_cast<double>(std::max<size_t>(1, samples.size()));
}

double maxDifference(const std::vector<float>& a, const std::vector<float>& b) {
  requireCheck(a.size() == b.size(), "behavior vectors have different lengths");
  double result = 0.0;
  for (size_t i = 0; i < a.size(); ++i) result = std::max(result, std::fabs(static_cast<double>(a[i]) - b[i]));
  return result;
}

double estimateFrequency(const std::vector<float>& samples, float sampleRate) {
  std::vector<double> crossings;
  crossings.reserve(samples.size() / 8);
  for (size_t i = 1; i < samples.size(); ++i) {
    if (samples[i - 1] <= 0.0f && samples[i] > 0.0f) {
      const double a = samples[i - 1];
      const double b = samples[i];
      const double fraction = b == a ? 0.0 : -a / (b - a);
      crossings.push_back(static_cast<double>(i - 1) + fraction);
    }
  }
  requireCheck(crossings.size() >= 8, "frequency probe found too few zero crossings");
  std::vector<double> periods;
  periods.reserve(crossings.size() - 1);
  for (size_t i = 1; i < crossings.size(); ++i) periods.push_back(crossings[i] - crossings[i - 1]);
  std::sort(periods.begin(), periods.end());
  const double period = periods[periods.size() / 2];
  return static_cast<double>(sampleRate) / period;
}

double sineFitR2(const std::vector<float>& samples, float sampleRate, float frequency) {
  const double omega = 2.0 * 3.14159265358979323846 * frequency / sampleRate;
  double ss = 0.0, cc = 0.0, sc = 0.0, ys = 0.0, yc = 0.0, yy = 0.0;
  for (size_t i = 0; i < samples.size(); ++i) {
    const double s = std::sin(omega * static_cast<double>(i));
    const double c = std::cos(omega * static_cast<double>(i));
    const double y = samples[i];
    ss += s * s; cc += c * c; sc += s * c; ys += y * s; yc += y * c; yy += y * y;
  }
  const double determinant = ss * cc - sc * sc;
  if (determinant <= std::numeric_limits<double>::epsilon() || yy <= std::numeric_limits<double>::epsilon()) return 0.0;
  const double sine = (ys * cc - yc * sc) / determinant;
  const double cosine = (yc * ss - ys * sc) / determinant;
  return std::max(0.0, std::min(1.0, (sine * ys + cosine * yc) / yy));
}

double spectralBandRms(const std::vector<float>& samples, float sampleRate, float lowHz, float highHz) {
  const size_t n = std::min<size_t>(4096, samples.size());
  if (n < 32) return 0.0;
  const size_t first = samples.size() - n;
  double power = 0.0;
  for (size_t bin = 1; bin < n / 2; ++bin) {
    const double frequency = static_cast<double>(bin) * sampleRate / static_cast<double>(n);
    if (frequency < lowHz || frequency > highHz) continue;
    double real = 0.0;
    double imag = 0.0;
    for (size_t i = 0; i < n; ++i) {
      const double angle = 2.0 * 3.14159265358979323846 * static_cast<double>(bin * i) / static_cast<double>(n);
      real += samples[first + i] * std::cos(angle);
      imag -= samples[first + i] * std::sin(angle);
    }
    power += (real * real + imag * imag) / static_cast<double>(n * n);
  }
  return std::sqrt(std::max(0.0, power));
}

void safetyAndDeterminism(float sampleRate) {
  KesshoPadInstance* a = pad_instance_create(sampleRate);
  KesshoPadInstance* b = pad_instance_create(sampleRate);
  assert(a && b);
  configure(a, PAD_NUM_VOICES, sampleRate);
  configure(b, PAD_NUM_VOICES, sampleRate);
  for (int frames : {1, 7, 32, 128}) {
    pad_instance_process_block(a, frames);
    pad_instance_process_block(b, frames);
    assertFiniteBlock(a, frames);
    assertFiniteBlock(b, frames);
    const float* outA = pad_instance_get_output_ptr(a);
    const float* outB = pad_instance_get_output_ptr(b);
    for (int i = 0; i < frames * 2; ++i) assert(std::fabs(outA[i] - outB[i]) < 1e-6f);
  }
  pad_instance_destroy(a);
  pad_instance_destroy(b);
}

void pitchAndDriftChecks() {
  auto measure = [](float frequency) {
    KesshoPadInstance* pad = pad_instance_create(48000.0f);
    requireCheck(pad != nullptr, "pitch probe instance allocation failed");
    configurePure(pad, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, frequency);
    const std::vector<float> samples = renderMono(pad, 8192, 8);
    const double measured = estimateFrequency(samples, 48000.0f);
    pad_instance_destroy(pad);
    return measured;
  };
  const double hz110 = measure(110.0f);
  const double hz112 = measure(112.0f);
  const double hz440 = measure(440.0f);
  std::printf("pad_behavior pitch hz110=%.4f hz112=%.4f delta=%.4f hz440=%.4f\n", hz110, hz112, hz112 - hz110, hz440);
  requireCheck(std::fabs(hz110 - 110.0) < 0.35, "110 Hz pitch probe drifted");
  requireCheck(std::fabs(hz112 - 112.0) < 0.35, "112 Hz pitch probe drifted");
  requireCheck(std::fabs((hz112 - hz110) - 2.0) < 0.15, "linear 2 Hz pitch change is not preserved");
  requireCheck(std::fabs(hz440 - 440.0) < 0.5, "zero-drift 440 Hz pitch is not transparent");

  KesshoPadInstance* boundary = pad_instance_create(48000.0f);
  requireCheck(boundary != nullptr, "pitch boundary probe allocation failed");
  configurePure(boundary, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  pad_instance_set_osc_a_pitch(boundary, 0, 24.0f);
  pad_instance_set_lfo1_rate(boundary, 0, 0.1f);
  pad_instance_set_lfo1_depth(boundary, 0, 1.0f);
  pad_instance_set_lfo1_wave(boundary, 0, PAD_LFO_SQUARE);
  pad_instance_set_lfo1_dest(boundary, 0, PAD_DEST_PITCH);
  const std::vector<float> boundarySamples = renderMono(boundary, 8192, 16);
  const double boundaryHz = estimateFrequency(boundarySamples, 48000.0f);
  const double expectedBoundaryHz = 440.0 * std::exp2(26.0 / 12.0);
  std::printf("pad_behavior pitch_boundary measured=%.4f expected=%.4f\n", boundaryHz, expectedBoundaryHz);
  requireCheck(std::fabs(boundaryHz - expectedBoundaryHz) < 8.0,
               "pitch+modulation boundary did not reach the finite summed Hz formula");
  pad_instance_destroy(boundary);

  KesshoPadInstance* driftA = pad_instance_create(48000.0f);
  KesshoPadInstance* driftB = pad_instance_create(48000.0f);
  requireCheck(driftA && driftB, "drift probe instance allocation failed");
  configurePure(driftA, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  configurePure(driftB, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  for (int i = 0; i < 64; ++i) {
    pad_instance_set_drift(driftA, 0, 0.0f);
    pad_instance_set_drift(driftB, 0, 0.0f);
    pad_instance_process_block(driftA, 128);
    pad_instance_process_block(driftB, 128);
    const float* a = pad_instance_get_output_ptr(driftA);
    const float* b = pad_instance_get_output_ptr(driftB);
    for (int n = 0; n < 256; ++n) requireCheck(std::fabs(a[n] - b[n]) < 1e-6f, "Drift=0 is not deterministic/transparent");
  }
  pad_instance_destroy(driftA);
  pad_instance_destroy(driftB);
}

void phaseResetChecks() {
  auto firstBlock = [](KesshoPadInstance* pad) {
    pad_instance_process_block(pad, 128);
    assertFiniteBlock(pad, 128);
    const float* output = pad_instance_get_output_ptr(pad);
    return std::vector<float>(output, output + 256);
  };

  KesshoPadInstance* onA = pad_instance_create(48000.0f);
  KesshoPadInstance* onB = pad_instance_create(48000.0f);
  requireCheck(onA && onB, "phase On instance allocation failed");
  configurePure(onA, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  configurePure(onB, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  (void)firstBlock(onA); (void)firstBlock(onB);
  pad_instance_note_off(onA, 0); pad_instance_note_off(onB, 0);
  for (int i = 0; i < 16; ++i) { pad_instance_process_block(onA, 128); pad_instance_process_block(onB, 128); }
  pad_instance_note_on(onA, 0, 440.0f, 1.0f); pad_instance_note_on(onB, 0, 440.0f, 1.0f);
  const std::vector<float> onRetriggerA = firstBlock(onA);
  const std::vector<float> onRetriggerB = firstBlock(onB);
  requireCheck(maxDifference(onRetriggerA, onRetriggerB) < 1e-6, "Phase Reset On is not repeatable");
  pad_instance_destroy(onA); pad_instance_destroy(onB);

  KesshoPadInstance* randomA = pad_instance_create(48000.0f);
  KesshoPadInstance* randomB = pad_instance_create(48000.0f);
  KesshoPadInstance* onReference = pad_instance_create(48000.0f);
  requireCheck(randomA && randomB && onReference, "phase Random instance allocation failed");
  configurePure(randomA, 48000.0f, PAD_PHASE_RESET_RANDOM, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  configurePure(randomB, 48000.0f, PAD_PHASE_RESET_RANDOM, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  configurePure(onReference, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  const std::vector<float> randomFirstA = firstBlock(randomA);
  const std::vector<float> randomFirstB = firstBlock(randomB);
  const std::vector<float> onFirst = firstBlock(onReference);
  requireCheck(maxDifference(randomFirstA, randomFirstB) < 1e-6, "Phase Reset Random is not deterministic under fixed seed");
  requireCheck(maxDifference(randomFirstA, onFirst) > 1e-4, "Phase Reset Random does not randomize phase");
  pad_instance_destroy(randomA); pad_instance_destroy(randomB); pad_instance_destroy(onReference);

  KesshoPadInstance* freeRun = pad_instance_create(48000.0f);
  KesshoPadInstance* immediate = pad_instance_create(48000.0f);
  requireCheck(freeRun && immediate, "phase Off instance allocation failed");
  configurePure(freeRun, 48000.0f, PAD_PHASE_RESET_OFF, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  configurePure(immediate, 48000.0f, PAD_PHASE_RESET_OFF, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 440.0f);
  (void)firstBlock(freeRun); (void)firstBlock(immediate);
  pad_instance_note_off(freeRun, 0); pad_instance_note_off(immediate, 0);
  for (int i = 0; i < 32; ++i) pad_instance_process_block(freeRun, 128);
  pad_instance_note_on(freeRun, 0, 440.0f, 1.0f);
  pad_instance_note_on(immediate, 0, 440.0f, 1.0f);
  const std::vector<float> freeRunFirst = firstBlock(freeRun);
  const std::vector<float> immediateFirst = firstBlock(immediate);
  requireCheck(maxDifference(freeRunFirst, immediateFirst) > 1e-4, "Phase Reset Off did not lazily free-run during inactivity");
  pad_instance_destroy(freeRun); pad_instance_destroy(immediate);
  std::puts("pad_behavior phase_reset=ok");
}

void oscillatorIndependenceChecks() {
  auto render = [](int waveA, int waveB, float positionA, float positionB,
                   float pdA, float pdB, float mix, float levelA, float levelB) {
    KesshoPadInstance* pad = pad_instance_create(48000.0f);
    requireCheck(pad != nullptr, "oscillator independence allocation failed");
    configurePure(pad, 48000.0f, PAD_PHASE_RESET_ON, waveA, waveB, mix, 440.0f);
    pad_instance_set_osc_a_position(pad, 0, positionA);
    pad_instance_set_osc_b_position(pad, 0, positionB);
    pad_instance_set_osc_a_phase_distortion(pad, 0, pdA);
    pad_instance_set_osc_b_phase_distortion(pad, 0, pdB);
    pad_instance_set_osc_a_level(pad, 0, levelA);
    pad_instance_set_osc_b_level(pad, 0, levelB);
    const std::vector<float> output = renderMono(pad, 2048, 8);
    pad_instance_destroy(pad);
    return output;
  };
  const std::vector<float> aPosition0 = render(PAD_WAVE_HARMONIC, PAD_WAVE_SINE, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f);
  const std::vector<float> aPosition1 = render(PAD_WAVE_HARMONIC, PAD_WAVE_SINE, 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f);
  const std::vector<float> bPosition0 = render(PAD_WAVE_SINE, PAD_WAVE_HARMONIC, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 1.0f);
  const std::vector<float> bPosition1 = render(PAD_WAVE_SINE, PAD_WAVE_HARMONIC, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 1.0f);
  const std::vector<float> aPd0 = render(PAD_WAVE_SAWTOOTH, PAD_WAVE_SINE, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f);
  const std::vector<float> aPd1 = render(PAD_WAVE_SAWTOOTH, PAD_WAVE_SINE, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f);
  const std::vector<float> bPd0 = render(PAD_WAVE_SINE, PAD_WAVE_SQUARE, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 1.0f);
  const std::vector<float> bPd1 = render(PAD_WAVE_SINE, PAD_WAVE_SQUARE, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 0.0f, 1.0f);
  const std::vector<float> sinePd0 = render(PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f);
  const std::vector<float> sinePd1 = render(PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f);
  requireCheck(maxDifference(aPosition0, aPosition1) > 1e-4, "Osc A Position has no audible effect");
  requireCheck(maxDifference(bPosition0, bPosition1) > 1e-4, "Osc B Position has no audible effect");
  requireCheck(maxDifference(aPd0, aPd1) > 1e-4, "Osc A Phase Distortion has no audible effect");
  requireCheck(maxDifference(bPd0, bPd1) > 1e-4, "Osc B Phase Distortion has no audible effect");
  requireCheck(sineFitR2(sinePd0, 48000.0f, 440.0f) > 0.985, "PD=0 does not preserve the sine source");
  requireCheck(sineFitR2(sinePd1, 48000.0f, 440.0f) < sineFitR2(sinePd0, 48000.0f, 440.0f) - 0.01,
               "non-zero PD did not depart from the transparent source");
  std::puts("pad_behavior oscillator_position_pd=ok");
}

void squareSpectralChecks() {
  auto renderSquare = [](float pd) {
    KesshoPadInstance* pad = pad_instance_create(48000.0f);
    requireCheck(pad != nullptr, "square spectral probe allocation failed");
    configurePure(pad, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SQUARE, PAD_WAVE_SINE, 0.0f, 7000.0f);
    pad_instance_set_osc_a_phase_distortion(pad, 0, pd);
    pad_instance_set_filter_cutoff(pad, 0, 18000.0f);
    const std::vector<float> output = renderMono(pad, 8192, 16);
    pad_instance_destroy(pad);
    return output;
  };
  const std::vector<float> centered = renderSquare(0.0f);
  const std::vector<float> narrow = renderSquare(0.9f);
  const double centeredFundamental = spectralBandRms(centered, 48000.0f, 6800.0f, 7200.0f);
  const double centeredHigh = spectralBandRms(centered, 48000.0f, 19000.0f, 23900.0f);
  const double narrowFundamental = spectralBandRms(narrow, 48000.0f, 6800.0f, 7200.0f);
  std::printf("pad_behavior square_spectrum fundamental=%.6f high_band=%.6f narrow_fundamental=%.6f\n",
              centeredFundamental, centeredHigh, narrowFundamental);
  requireCheck(std::isfinite(centeredFundamental) && std::isfinite(centeredHigh) && std::isfinite(narrowFundamental),
               "square spectral probe produced non-finite energy");
  requireCheck(centeredFundamental > centeredHigh * 0.35, "square PolyBLEP high-band energy is excessive");
  requireCheck(std::fabs(narrowFundamental - centeredFundamental) > 1e-4,
               "square variable duty did not change the fundamental spectrum");
}

void filterAndLadderChecks() {
  auto renderFilterB = [](float resonance) {
    KesshoPadInstance* pad = pad_instance_create(48000.0f);
    requireCheck(pad != nullptr, "Filter B probe allocation failed");
    configurePure(pad, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 1.0f, 440.0f);
    pad_instance_set_osc_a_level(pad, 0, 0.0f);
    pad_instance_set_osc_b_level(pad, 0, 1.0f);
    pad_instance_set_filter_b_enabled(pad, 0, 1);
    pad_instance_set_filter_routing(pad, 0, PAD_ROUTE_B_ONLY);
    pad_instance_set_filter_b_cutoff(pad, 0, 500.0f);
    pad_instance_set_filter_b_q(pad, 0, 0.7f);
    pad_instance_set_filter_b_resonance(pad, 0, resonance);
    const std::vector<float> output = renderMono(pad, 4096, 16);
    pad_instance_destroy(pad);
    return output;
  };
  const std::vector<float> filterBFlat = renderFilterB(0.0f);
  const std::vector<float> filterBResonant = renderFilterB(0.95f);
  std::printf("pad_behavior filter_b_rms flat=%.6f resonant=%.6f\n", rms(filterBFlat), rms(filterBResonant));
  requireCheck(maxDifference(filterBFlat, filterBResonant) > 1e-4, "Filter B Resonance is inaudible");

  for (float resonance : {0.0f, 0.5f, 1.0f}) {
    for (float hardness : {0.0f, 0.5f, 1.0f}) {
      for (float level : {0.25f, 1.0f}) {
        KesshoPadInstance* pad = pad_instance_create(48000.0f);
        requireCheck(pad != nullptr, "ladder sweep allocation failed");
        configurePure(pad, 48000.0f, PAD_PHASE_RESET_ON, PAD_WAVE_SAWTOOTH, PAD_WAVE_SAWTOOTH, 0.5f, 55.0f);
        pad_instance_set_osc_a_level(pad, 0, level);
        pad_instance_set_osc_b_level(pad, 0, level);
        pad_instance_set_filter_type(pad, 0, PAD_FILTER_LADDER_LP);
        pad_instance_set_filter_cutoff(pad, 0, 1200.0f);
        pad_instance_set_filter_resonance(pad, 0, resonance);
        pad_instance_set_hardness(pad, 0, hardness);
        const std::vector<float> output = renderMono(pad, 1024, 4);
        for (float sample : output) requireCheck(std::isfinite(sample) && std::fabs(sample) <= 1.01f, "ladder sweep became unstable");
        pad_instance_destroy(pad);
      }
    }
  }

  auto renderLadder = [](float sampleRate, float frequency, float cutoff, float resonance, float hardness, float level) {
    KesshoPadInstance* pad = pad_instance_create(sampleRate);
    requireCheck(pad != nullptr, "ladder response allocation failed");
    configurePure(pad, sampleRate, PAD_PHASE_RESET_ON, PAD_WAVE_SINE, PAD_WAVE_SINE, 0.0f, frequency);
    pad_instance_set_osc_a_level(pad, 0, level);
    pad_instance_set_filter_type(pad, 0, PAD_FILTER_LADDER_LP);
    pad_instance_set_filter_cutoff(pad, 0, cutoff);
    pad_instance_set_filter_resonance(pad, 0, resonance);
    pad_instance_set_hardness(pad, 0, hardness);
    const std::vector<float> output = renderMono(pad, 8192, 16);
    pad_instance_destroy(pad);
    return output;
  };

  const std::vector<float> cutoffLow = renderLadder(48000.0f, 1000.0f, 180.0f, 0.0f, 0.0f, 1.0f);
  const std::vector<float> cutoffHigh = renderLadder(48000.0f, 1000.0f, 5000.0f, 0.0f, 0.0f, 1.0f);
  const double cutoffLowRms = rms(cutoffLow);
  const double cutoffHighRms = rms(cutoffHigh);
  std::printf("pad_behavior ladder_response low_rms=%.6f high_rms=%.6f\n", cutoffLowRms, cutoffHighRms);
  requireCheck(cutoffHighRms > cutoffLowRms * 1.20, "ladder cutoff response did not attenuate above-cutoff input");

  const std::vector<float> resonanceFlat = renderLadder(48000.0f, 1200.0f, 1200.0f, 0.0f, 0.0f, 1.0f);
  const std::vector<float> resonancePeak = renderLadder(48000.0f, 1200.0f, 1200.0f, 0.9f, 0.0f, 1.0f);
  const double resonanceFlatBand = spectralBandRms(resonanceFlat, 48000.0f, 1100.0f, 1300.0f);
  const double resonancePeakBand = spectralBandRms(resonancePeak, 48000.0f, 1100.0f, 1300.0f);
  const double resonanceDelta = maxDifference(resonanceFlat, resonancePeak);
  std::printf("pad_behavior ladder_resonance flat_band=%.6f resonant_band=%.6f delta=%.6f\n",
              resonanceFlatBand, resonancePeakBand, resonanceDelta);
  requireCheck(resonancePeakBand > resonanceFlatBand * 1.01 && resonanceDelta > 1e-4,
               "ladder resonance did not increase cutoff-band energy");

  const std::vector<float> bass = renderLadder(48000.0f, 55.0f, 300.0f, 0.5f, 0.2f, 1.0f);
  const double bassRms = rms(bass);
  const double bassDc = std::fabs(meanValue(bass));
  std::printf("pad_behavior ladder_bass rms=%.6f dc=%.6f\n", bassRms, bassDc);
  requireCheck(bassRms > 0.01 && bassDc < 0.08, "ladder lost bass weight or developed excessive DC");

  const std::vector<float> hardnessFlat = renderLadder(48000.0f, 220.0f, 3000.0f, 0.25f, 0.0f, 1.0f);
  const std::vector<float> hardnessDriven = renderLadder(48000.0f, 220.0f, 3000.0f, 0.25f, 1.0f, 1.0f);
  requireCheck(maxDifference(hardnessFlat, hardnessDriven) > 1e-4, "ladder Hardness drive did not change the signal");

  for (float sampleRate : {44100.0f, 48000.0f, 96000.0f}) {
    for (float cutoff : {20.0f, 80.0f, 800.0f, sampleRate * 0.45f}) {
      for (float resonance : {0.0f, 0.95f}) {
        for (float hardness : {0.0f, 0.9f}) {
          const std::vector<float> output = renderLadder(sampleRate, 55.0f, cutoff, resonance, hardness, 1.0f);
          const double mean = std::fabs(meanValue(output));
          requireCheck(std::isfinite(mean) && mean < 0.35, "ladder cutoff/resonance sweep developed DC runaway");
          for (float sample : output) requireCheck(std::isfinite(sample) && std::fabs(sample) <= 1.01f,
                                                   "ladder cutoff/resonance sweep became unstable");
        }
      }
    }
  }
  std::puts("pad_behavior ladder_sweeps=ok");
}

void aliasReferenceCheck() {
  auto renderExtreme = [](float sampleRate, int frames, int warmupBlocks) {
    KesshoPadInstance* pad = pad_instance_create(sampleRate);
    requireCheck(pad != nullptr, "4x alias reference allocation failed");
    configurePure(pad, sampleRate, PAD_PHASE_RESET_ON, PAD_WAVE_COMPLEX_SINE, PAD_WAVE_SINE, 0.0f, 12000.0f);
    pad_instance_set_osc_a_position(pad, 0, 0.92f);
    pad_instance_set_osc_a_phase_distortion(pad, 0, 1.0f);
    pad_instance_set_filter_cutoff(pad, 0, 18000.0f);
    const std::vector<float> result = renderMono(pad, frames, warmupBlocks);
    pad_instance_destroy(pad);
    return result;
  };
  const std::vector<float> base = renderExtreme(48000.0f, 4096, 32);
  const std::vector<float> oversampled = renderExtreme(192000.0f, 16384, 128);
  requireCheck(oversampled.size() >= base.size() * 4, "4x alias reference is too short");
  double error = 0.0;
  double reference = 0.0;
  for (size_t i = 0; i < base.size(); ++i) {
    const double high = oversampled[i * 4];
    const double low = base[i];
    const double difference = low - high;
    error += difference * difference;
    reference += high * high;
  }
  const double ratio = std::sqrt(error / std::max(1e-12, reference));
  std::printf("pad_behavior alias_4x case=complex_extreme_pd sample_rate=48000 reference_rate=192000 rmse_ratio=%.6f\n", ratio);
  requireCheck(std::isfinite(ratio) && ratio < 0.80, "high-note extreme-PD 4x alias comparison exceeded gate");
}

void applyBenchmarkCase(KesshoPadInstance* pad, const char* name) {
  const std::string_view caseName(name);
  if (caseName == "CLEAN_BASIC") {
    for (int p = 0; p < PAD_NUM_PADS; ++p) {
      pad_instance_set_osc_a_wave(pad, p, PAD_WAVE_SAWTOOTH);
      pad_instance_set_osc_b_wave(pad, p, PAD_WAVE_SAWTOOTH);
      pad_instance_set_osc_a_position(pad, p, 0.0f);
      pad_instance_set_osc_b_position(pad, p, 0.0f);
      pad_instance_set_osc_a_phase_distortion(pad, p, 0.0f);
      pad_instance_set_osc_b_phase_distortion(pad, p, 0.0f);
      pad_instance_set_fold_amount(pad, p, 0.0f);
      pad_instance_set_filter_type(pad, p, PAD_FILTER_LP);
      pad_instance_set_filter_b_enabled(pad, p, 0);
      pad_instance_set_lfo1_dest(pad, p, PAD_DEST_NONE);
      pad_instance_set_lfo2_dest(pad, p, PAD_DEST_NONE);
    }
  } else if (caseName == "HARMONIC") {
    for (int p = 0; p < PAD_NUM_PADS; ++p) {
      pad_instance_set_osc_a_wave(pad, p, PAD_WAVE_HARMONIC);
      pad_instance_set_osc_b_wave(pad, p, PAD_WAVE_HARMONIC);
      pad_instance_set_osc_a_position(pad, p, 0.3f);
      pad_instance_set_osc_b_position(pad, p, 0.78f);
      pad_instance_set_lfo1_dest(pad, p, PAD_DEST_OSC_A_POSITION);
      pad_instance_set_lfo2_dest(pad, p, PAD_DEST_OSC_B_POSITION);
      pad_instance_set_fold_amount(pad, p, 0.0f);
    }
  } else if (caseName == "COMPLEX") {
    for (int p = 0; p < PAD_NUM_PADS; ++p) {
      pad_instance_set_osc_a_wave(pad, p, PAD_WAVE_COMPLEX_TRIANGLE);
      pad_instance_set_osc_b_wave(pad, p, PAD_WAVE_COMPLEX_SINE);
      pad_instance_set_osc_a_position(pad, p, 0.62f);
      pad_instance_set_osc_b_position(pad, p, 0.44f);
      pad_instance_set_osc_a_phase_distortion(pad, p, 0.28f);
      pad_instance_set_osc_b_phase_distortion(pad, p, -0.24f);
      pad_instance_set_lfo1_dest(pad, p, PAD_DEST_OSC_A_POSITION);
      pad_instance_set_lfo2_dest(pad, p, PAD_DEST_OSC_B_PHASE_DISTORTION);
    }
  } else if (caseName == "MOOG") {
    for (int p = 0; p < PAD_NUM_PADS; ++p) {
      pad_instance_set_osc_a_wave(pad, p, PAD_WAVE_SAWTOOTH);
      pad_instance_set_osc_b_wave(pad, p, PAD_WAVE_SAWTOOTH);
      pad_instance_set_osc_a_pitch(pad, p, 0.0f);
      pad_instance_set_osc_b_pitch(pad, p, -12.0f);
      pad_instance_set_osc_b_hz_offset(pad, p, 1.5f);
      pad_instance_set_osc_a_phase_distortion(pad, p, 0.0f);
      pad_instance_set_osc_b_phase_distortion(pad, p, 0.0f);
      pad_instance_set_sub_enabled(pad, p, 1);
      pad_instance_set_sub_level(pad, p, 0.12f);
      pad_instance_set_drift(pad, p, 0.12f);
      pad_instance_set_fold_amount(pad, p, 0.0f);
      pad_instance_set_filter_type(pad, p, PAD_FILTER_LADDER_LP);
      pad_instance_set_filter_resonance(pad, p, 0.55f);
      pad_instance_set_hardness(pad, p, 0.42f);
      pad_instance_set_lfo1_dest(pad, p, PAD_DEST_FILTER_CUTOFF);
    }
  }
}

void benchmark(float sampleRate, int voices, const char* name) {
  KesshoPadInstance* pad = pad_instance_create(sampleRate);
  assert(pad);
  configure(pad, voices, sampleRate);
  applyBenchmarkCase(pad, name);
  constexpr int blocks = 1024;
  constexpr int frames = 128;
  for (int i = 0; i < 32; ++i) pad_instance_process_block(pad, frames);
  std::vector<double> elapsed;
  elapsed.reserve(blocks);
  for (int i = 0; i < blocks; ++i) {
    const auto start = std::chrono::steady_clock::now();
    pad_instance_process_block(pad, frames);
    elapsed.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count());
    assertFiniteBlock(pad, frames);
  }
  std::sort(elapsed.begin(), elapsed.end());
  const auto percentile = [&](double fraction) { return elapsed[static_cast<size_t>(fraction * (elapsed.size() - 1))]; };
  const double deadline = static_cast<double>(frames) / sampleRate * 1000.0;
  int underruns = 0;
  for (double value : elapsed) if (value > deadline) ++underruns;
  double mean = 0.0;
  for (double value : elapsed) mean += value;
  mean /= static_cast<double>(elapsed.size());
  const double p99Ratio = percentile(0.99) / deadline;
  // Hosted runners can preempt a handful of blocks; the larger p99 window
  // still rejects sustained CPU load while reducing sensitivity to scheduler spikes.
  requireCpuBudget(p99Ratio < 1.0, name, voices, p99Ratio, 1.0);
  const int voiceSlot = voices == 1 ? 0 : (voices == 8 ? 1 : 2);
  const double cleanBasicRatio = std::string_view(name) == "CLEAN_BASIC"
      ? (g_clean_basic_p99_ms[voiceSlot] = percentile(0.99), 1.0)
      : (g_clean_basic_p99_ms[voiceSlot] > 0.0 ? percentile(0.99) / g_clean_basic_p99_ms[voiceSlot] : 0.0);
  if (voices == 16) requireCpuBudget(p99Ratio < 0.50, name, voices, p99Ratio, 0.50);
  std::printf("pad_cpu case=%s sr=%.0f voices=%d mean_ms=%.5f p50_ms=%.5f p95_ms=%.5f p99_ms=%.5f max_ms=%.5f deadline_ratio_p99=%.4f deadline_ratio_max=%.4f clean_basic_ratio=%.4f underruns=%d\n",
      name, sampleRate, voices, mean, percentile(0.50), percentile(0.95), percentile(0.99), elapsed.back(),
      p99Ratio, elapsed.back() / deadline, cleanBasicRatio, underruns);
  pad_instance_destroy(pad);
}

} // namespace

int main() {
  for (float sampleRate : {44100.0f, 48000.0f, 96000.0f}) safetyAndDeterminism(sampleRate);
  pitchAndDriftChecks();
  phaseResetChecks();
  oscillatorIndependenceChecks();
  squareSpectralChecks();
  filterAndLadderChecks();
  aliasReferenceCheck();
  for (const char* name : {"CLEAN_BASIC", "HARMONIC", "COMPLEX", "MOOG", "WORST_NORMAL_USE"}) {
    for (int voices : {1, 8, 16}) benchmark(48000.0f, voices, name);
  }
  std::puts("pad_dsp_safety: ok");
  return 0;
}