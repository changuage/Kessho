#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const buildDir = resolve(root, 'build/kessho-reverb-before-after');
const reportDir = process.env.KESSHO_REVERB_BENCH_ARTIFACT_DIR
  ? resolve(root, process.env.KESSHO_REVERB_BENCH_ARTIFACT_DIR)
  : resolve(root, 'docs/reports');
const reportJson = resolve(reportDir, 'kessho-reverb-before-after-latest.json');
const reportMd = resolve(reportDir, 'kessho-reverb-before-after-latest.md');
const baselineSourceOverride = process.env.KESSHO_REVERB_BENCH_BASELINE_SOURCE;
const currentSourceOverride = process.env.KESSHO_REVERB_BENCH_CURRENT_SOURCE;
const headerSourceOverride = process.env.KESSHO_REVERB_BENCH_HEADER_SOURCE;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 32,
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed with ${result.status}`,
      result.stdout,
      result.stderr,
    ].join('\n'));
  }
  return result.stdout;
}

function gitShow(path) {
  return run('git', ['show', `HEAD:${path}`]);
}

function writeSources() {
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(resolve(buildDir, 'current'), { recursive: true });
  mkdirSync(resolve(buildDir, 'baseline'), { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  const currentSource = currentSourceOverride
    ? readFileSync(resolve(root, currentSourceOverride))
    : readFileSync(resolve(root, 'wasm/reverb/kessho_reverb.cpp'));
  const baselineSource = baselineSourceOverride
    ? readFileSync(resolve(root, baselineSourceOverride))
    : gitShow('wasm/reverb/kessho_reverb.cpp');
  const baselineHeaderSource = headerSourceOverride
    ? readFileSync(resolve(root, headerSourceOverride))
    : gitShow('wasm/reverb/kessho_reverb.h');
  const currentHeaderSource = headerSourceOverride
    ? baselineHeaderSource
    : readFileSync(resolve(root, 'wasm/reverb/kessho_reverb.h'));
  writeFileSync(resolve(buildDir, 'current/kessho_reverb.cpp'), currentSource);
  writeFileSync(resolve(buildDir, 'current/kessho_reverb.h'), currentHeaderSource);
  writeFileSync(resolve(buildDir, 'baseline/kessho_reverb.cpp'), baselineSource);
  writeFileSync(resolve(buildDir, 'baseline/kessho_reverb.h'), baselineHeaderSource);
  writeFileSync(resolve(buildDir, 'bench.cpp'), benchmarkSource);
}

function compileOne(label, hasBloom) {
  const sourceDir = resolve(buildDir, label);
  const source = resolve(sourceDir, 'kessho_reverb.cpp');
  const header = resolve(sourceDir, 'kessho_reverb.h');
  const binary = resolve(buildDir, `${label}_bench`);
  run('/usr/bin/clang++', [
    '-std=c++17',
    '-O3',
    '-DNDEBUG',
    '-I',
    sourceDir,
    ...(hasBloom || process.env.KESSHO_REVERB_BENCH_HAS_BLOOM === '1' ? ['-DHAS_BLOOM=1'] : []),
    `-DKESSHO_REVERB_HEADER="${header}"`,
    resolve(buildDir, 'bench.cpp'),
    source,
    '-o',
    binary,
  ]);
  return binary;
}

function runBench(binary, label) {
  const stdout = run(binary, []);
  return stdout.trim().split(/\n+/).filter(Boolean).map((line) => {
    const [
      tag,
      scenario,
      repeat,
      processMs,
      cpuPercent,
      medianBlockMs,
      p95BlockMs,
      rms,
      peak,
      missedQuantums,
    ] = line.trim().split(/\s+/);
    if (tag !== 'RESULT') throw new Error(`Unexpected benchmark line: ${line}`);
    return {
      variant: label,
      scenario,
      repeat: Number(repeat),
      processMs: Number(processMs),
      cpuPercent: Number(cpuPercent),
      medianBlockMs: Number(medianBlockMs),
      p95BlockMs: Number(p95BlockMs),
      rms: Number(rms),
      peak: Number(peak),
      missedQuantums: Number(missedQuantums),
    };
  });
}

function runInterleaved(baselineBinary, currentBinary) {
  const trials = Math.max(1, Number(process.env.KESSHO_REVERB_BENCH_INTERLEAVED_TRIALS ?? 3));
  const results = [];
  for (let trial = 0; trial < trials; trial += 1) {
    results.push(...runBench(baselineBinary, 'baseline-head'));
    results.push(...runBench(currentBinary, 'current-worktree'));
  }
  return results;
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function summarize(results, variant, scenario) {
  const rows = results.filter((row) => row.variant === variant && row.scenario === scenario);
  return {
    variant,
    scenario,
    repeats: rows.length,
    medianCpuPercent: quantile(rows.map((row) => row.cpuPercent), 0.5),
    p95CpuPercent: quantile(rows.map((row) => row.cpuPercent), 0.95),
    medianBlockMs: quantile(rows.map((row) => row.medianBlockMs), 0.5),
    p95BlockMs: quantile(rows.map((row) => row.p95BlockMs), 0.95),
    medianRms: quantile(rows.map((row) => row.rms), 0.5),
    medianPeak: quantile(rows.map((row) => row.peak), 0.5),
    totalMissedQuantums: rows.reduce((sum, row) => sum + row.missedQuantums, 0),
  };
}

function pctSaved(baselineCpu, currentCpu) {
  return baselineCpu > 0 ? ((baselineCpu - currentCpu) / baselineCpu) * 100 : 0;
}

function rmsToLufsEstimate(rms) {
  return rms > 0 ? 20 * Math.log10(rms) - 0.691 : -Infinity;
}

function describeSource(sourcePath, fallbackDescription) {
  return sourcePath ? `preserved source ${sourcePath}` : fallbackDescription;
}

function makeReport(results) {
  const scenarios = ['hall_ultra', 'hall_balanced', 'blackhole_tail', 'supermassive_tail'];
  const summaries = scenarios.map((scenario) => {
    const baseline = summarize(results, 'baseline-head', scenario);
    const current = summarize(results, 'current-worktree', scenario);
    return {
      scenario,
      baseline,
      current,
      medianCpuSavedPercent: pctSaved(baseline.medianCpuPercent, current.medianCpuPercent),
      p95CpuSavedPercent: pctSaved(baseline.p95CpuPercent, current.p95CpuPercent),
      rmsRatioCurrentOverBaseline: baseline.medianRms > 0 ? current.medianRms / baseline.medianRms : null,
      peakRatioCurrentOverBaseline: baseline.medianPeak > 0 ? current.medianPeak / baseline.medianPeak : null,
      baselineLufsEstimate: rmsToLufsEstimate(baseline.medianRms),
      currentLufsEstimate: rmsToLufsEstimate(current.medianRms),
      lufsEstimateDelta: rmsToLufsEstimate(current.medianRms) - rmsToLufsEstimate(baseline.medianRms),
      passed: current.p95BlockMs < 2.6666666666666665 && current.medianCpuPercent <= baseline.medianCpuPercent,
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: summaries.every((summary) => summary.passed) ? 'pass' : 'fail',
    methodology: {
      baseline: `${describeSource(
        baselineSourceOverride,
        'git HEAD wasm/reverb/kessho_reverb.cpp',
      )}; header ${describeSource(
        headerSourceOverride,
        'git HEAD wasm/reverb/kessho_reverb.h',
      )}; compiled as a native benchmark binary`,
      current: `${describeSource(
        currentSourceOverride,
        'current worktree wasm/reverb/kessho_reverb.cpp',
      )}; header ${describeSource(
        headerSourceOverride,
        'current worktree wasm/reverb/kessho_reverb.h',
      )}; compiled as a native benchmark binary`,
      sampleRate: 48000,
      blockFrames: 128,
      durationSecondsPerRepeat: 12,
      repeats: Math.max(1, Number(process.env.KESSHO_REVERB_BENCH_REPEATS ?? 9)),
      warmupRepeats: Math.max(0, Number(process.env.KESSHO_REVERB_BENCH_WARMUP ?? 0)),
      interleavedTrials: process.env.KESSHO_REVERB_BENCH_INTERLEAVED === '1'
        ? Math.max(1, Number(process.env.KESSHO_REVERB_BENCH_INTERLEAVED_TRIALS ?? 3))
        : null,
      graphTaps: 'not applicable to standalone reverb benchmark; Product Core graph taps are disabled in CPU comparison scripts',
      parityNote: 'Each variant receives the same deterministic stereo input and parameter set. RMS, peak, and an unweighted LUFS estimate from RMS are reported so CPU comparisons can be read with output-level context.',
      timingNote: 'CPU percentage uses process CPU time. Per-block wall-time outliers are reported as scheduler diagnostics; Product Core CPU tests provide the zero missed-quantum realtime gate. Timed renders do not write output files unless an explicit output path is supplied.',
    },
    summaries,
    rawResults: results,
  };
}

function writeReport(report) {
  writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    '# Kessho Reverb Before/After Benchmark',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    '',
    `Native standalone reverb benchmark, 48 kHz, 128-frame blocks, 12 seconds per repeat, ${report.methodology.repeats} measured repeats after ${report.methodology.warmupRepeats} warmup repeats${report.methodology.interleavedTrials == null ? '' : `, ${report.methodology.interleavedTrials} interleaved trials`}.`,
    `Baseline: ${report.methodology.baseline}. Current: ${report.methodology.current}. Each row reports median repeat CPU and the p95 repeat CPU.`,
    '',
    '| Scenario | Baseline median CPU | Current median CPU | Saved | Current p95 CPU | Scheduler outliers | RMS ratio | LUFS est delta |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.summaries.map((summary) => `${[
      `| ${summary.scenario}`,
      `${summary.baseline.medianCpuPercent.toFixed(4)}%`,
      `${summary.current.medianCpuPercent.toFixed(4)}%`,
      `${summary.medianCpuSavedPercent.toFixed(2)}%`,
      `${summary.current.p95CpuPercent.toFixed(4)}%`,
      `${summary.current.totalMissedQuantums}`,
      summary.rmsRatioCurrentOverBaseline == null ? 'n/a' : summary.rmsRatioCurrentOverBaseline.toFixed(4),
      Number.isFinite(summary.lufsEstimateDelta) ? `${summary.lufsEstimateDelta.toFixed(2)} dB` : 'n/a',
    ].join(' | ')} |`),
    '',
    'RMS/peak and an unweighted LUFS estimate are included in the JSON report for output-level context. CPU pass/fail uses current median CPU <= baseline median CPU and current p95 block time below one 128-frame quantum.',
  ];
  writeFileSync(reportMd, `${lines.join('\n')}\n`);
}

const benchmarkSource = String.raw`
#include KESSHO_REVERB_HEADER

#include <algorithm>
#include <chrono>
#include <ctime>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

struct Scenario {
  const char* name;
  int type;
  int quality;
  float decay;
  float size;
  float damping;
  float diffusion;
  float modulation;
  float predelay;
  float width;
  float shimmerAmount;
  float shimmerPitch;
  float slowRate;
  float slowDepth;
  float reverseAmount;
  float reverseLength;
  float chorusRate;
  float chorusDepth;
  int modCharacter;
  float dampLow;
  float dampHigh;
  float crossover;
  float inputTone;
  float shimmerFeedback;
  float warp;
  float crossFeed;
  float earlyReflections;
  float airAbsorption;
  int saturationMode;
  float transientSmooth;
  float erLpFreq;
  float bloom;
};

static uint32_t xorshift(uint32_t& state) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return state;
}

static std::vector<float> makeInput(int frames) {
  std::vector<float> input(static_cast<size_t>(frames) * 2u, 0.0f);
  uint32_t rng = 0x6d2b79f5u;
  for (int i = 0; i < frames; ++i) {
    const float noise = (static_cast<float>(xorshift(rng) & 0xffffu) / 32768.0f - 1.0f) * 0.015f;
    const float tone = std::sin(static_cast<float>(i) * 0.0131f) * 0.035f;
    const float impulse = (i % 9600 == 0) ? 0.35f : 0.0f;
    input[static_cast<size_t>(i) * 2u] = tone + noise + impulse;
    input[static_cast<size_t>(i) * 2u + 1u] = tone * 0.72f - noise * 0.4f + impulse * 0.8f;
  }
  return input;
}

static void configure(const Scenario& s) {
  reverb_set_type(s.type);
  reverb_set_quality(s.quality);
  reverb_set_params(s.decay, s.size, s.damping, s.diffusion, s.modulation, s.predelay, s.width);
  reverb_set_shimmer(s.shimmerAmount, s.shimmerPitch);
  reverb_set_slow_mod(s.slowRate, s.slowDepth);
  reverb_set_reverse(s.reverseAmount, s.reverseLength);
  reverb_set_chorus(s.chorusRate, s.chorusDepth);
  reverb_set_mod_character(s.modCharacter);
  reverb_set_multiband_damp(s.dampLow, s.dampHigh, s.crossover);
  reverb_set_input_tone(s.inputTone);
  reverb_set_shimmer_feedback(s.shimmerFeedback);
  reverb_set_warp(s.warp);
  reverb_set_cross_feed(s.crossFeed);
  reverb_set_early_reflections(s.earlyReflections);
  reverb_set_air_absorption(s.airAbsorption);
  reverb_set_saturation_mode(s.saturationMode);
  reverb_set_transient_smooth(s.transientSmooth);
  reverb_set_er_lp_freq(s.erLpFreq);
#ifdef HAS_BLOOM
  reverb_set_bloom(s.bloom);
#endif
}

static int envInt(const char* name, int fallback) {
  const char* value = std::getenv(name);
  if (value == nullptr || *value == '\0') return fallback;
  const int parsed = std::atoi(value);
  return parsed >= 0 ? parsed : fallback;
}

int main() {
  constexpr int sampleRate = 48000;
  constexpr int blockFrames = 128;
  constexpr int seconds = 12;
  constexpr int frames = sampleRate * seconds;
  constexpr int blocks = frames / blockFrames;
  constexpr double audioMs = static_cast<double>(blocks * blockFrames) * 1000.0 / sampleRate;
  constexpr double quantumMs = static_cast<double>(blockFrames) * 1000.0 / sampleRate;
  const int warmupRepeats = envInt("KESSHO_REVERB_BENCH_WARMUP", 0);
  const int measuredRepeats = std::max(1, envInt("KESSHO_REVERB_BENCH_REPEATS", 9));

  const Scenario scenarios[] = {
    {"hall_ultra", 1, 0, 0.80f, 1.50f, 0.50f, 0.80f, 0.30f, 20.0f, 0.80f, 0.0f, 12.0f, 0.05f, 0.0f, 0.0f, 2.0f, 0.50f, 12.0f, 2, 0.10f, 0.30f, 800.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.30f, 0.20f, 0, 0.0f, 2500.0f, 0.0f},
    {"hall_balanced", 1, 1, 0.80f, 1.50f, 0.50f, 0.80f, 0.30f, 20.0f, 0.80f, 0.0f, 12.0f, 0.05f, 0.0f, 0.0f, 2.0f, 0.50f, 12.0f, 2, 0.10f, 0.30f, 800.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.30f, 0.20f, 0, 0.0f, 2500.0f, 0.0f},
    {"blackhole_tail", 3, 0, 0.96f, 2.85f, 0.72f, 0.96f, 0.42f, 38.0f, 0.96f, 0.08f, 12.0f, 0.03f, 0.12f, 0.48f, 3.2f, 0.18f, 18.0f, 2, 0.45f, 0.78f, 650.0f, -0.28f, 0.03f, 0.82f, 0.62f, 0.0f, 0.55f, 1, 0.12f, 1600.0f, -0.82f},
    {"supermassive_tail", 2, 0, 0.94f, 2.65f, 0.62f, 0.94f, 0.35f, 25.0f, 0.98f, 0.05f, 12.0f, 0.025f, 0.10f, 0.15f, 2.6f, 0.12f, 16.0f, 2, 0.35f, 0.68f, 720.0f, -0.18f, 0.02f, 0.70f, 0.58f, 0.02f, 0.42f, 1, 0.08f, 1800.0f, -0.20f},
  };

  const std::vector<float> input = makeInput(frames);
  for (const Scenario& scenario : scenarios) {
    for (int repeat = 0; repeat < warmupRepeats + measuredRepeats; ++repeat) {
      const bool warmup = repeat < warmupRepeats;
      if (reverb_init(static_cast<float>(sampleRate)) != 0) return 2;
      configure(scenario);
      std::vector<double> blockMs;
      blockMs.reserve(blocks);
      double sumSquares = 0.0;
      double peak = 0.0;
      int missed = 0;
      const std::clock_t cpuStart = std::clock();
      for (int block = 0; block < blocks; ++block) {
        float* in = reverb_get_input_ptr();
        const int inputOffset = block * blockFrames * 2;
        std::copy(input.begin() + inputOffset, input.begin() + inputOffset + blockFrames * 2, in);
        const auto blockStart = std::chrono::steady_clock::now();
        reverb_process_block(blockFrames);
        const auto blockEnd = std::chrono::steady_clock::now();
        const double elapsedMs = std::chrono::duration<double, std::milli>(blockEnd - blockStart).count();
        blockMs.push_back(elapsedMs);
        if (elapsedMs > quantumMs) ++missed;
        const float* out = reverb_get_output_ptr();
        for (int i = 0; i < blockFrames * 2; ++i) {
          const double sample = out[i];
          sumSquares += sample * sample;
          peak = std::max(peak, std::abs(sample));
        }
      }
      const std::clock_t cpuEnd = std::clock();
      const double processMs = static_cast<double>(cpuEnd - cpuStart) * 1000.0 / static_cast<double>(CLOCKS_PER_SEC);
      std::sort(blockMs.begin(), blockMs.end());
      const double medianBlockMs = blockMs[blockMs.size() / 2u];
      const double p95BlockMs = blockMs[static_cast<size_t>(std::ceil(blockMs.size() * 0.95)) - 1u];
      const double rms = std::sqrt(sumSquares / static_cast<double>(blocks * blockFrames * 2));
      const double cpuPercent = processMs / audioMs * 100.0;
      if (!warmup) {
        std::printf("RESULT %s %d %.6f %.6f %.6f %.6f %.9f %.9f %d\n",
            scenario.name,
            repeat - warmupRepeats + 1,
            processMs,
            cpuPercent,
            medianBlockMs,
            p95BlockMs,
            rms,
            peak,
            missed);
      }
      reverb_destroy();
    }
  }
  return 0;
}
`;

writeSources();
const baselineBinary = compileOne('baseline', false);
const currentBinary = compileOne('current', true);
const results = process.env.KESSHO_REVERB_BENCH_INTERLEAVED === '1'
  ? runInterleaved(baselineBinary, currentBinary)
  : [
      ...runBench(baselineBinary, 'baseline-head'),
      ...runBench(currentBinary, 'current-worktree'),
    ];
const report = makeReport(results);
writeReport(report);
console.log(`Kessho Reverb before/after benchmark ${report.status}: ${reportMd}, ${reportJson}`);
if (report.status !== 'pass') {
  if (process.env.KESSHO_REVERB_BENCH_NO_GATE !== '1') process.exitCode = 1;
}
