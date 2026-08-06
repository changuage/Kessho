#!/usr/bin/env node
import { resolve } from 'node:path';
import { assertPackageScript } from './product-core/lib/packageScripts.mjs';
import {
  collectReportMetadata,
  writeJsonReport,
  writeMarkdownReport,
} from './product-core/lib/reporting.mjs';
import { assertToken } from './product-core/lib/sourceTokens.mjs';
import {
  KESSHO_RENDER_QUANTUM_MS,
  KESSHO_RENDER_BLOCK_FRAMES,
  KESSHO_RENDER_SAMPLE_RATE,
  assertMetric,
  blockRms,
  createKesshoModuleHarness,
  maxBlockEdge,
  percentile,
  roundMetric,
  sampleStats,
} from './lib/kesshoWasmRenderMetrics.mjs';

const root = process.cwd();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-reverb-render-metrics-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-reverb-render-metrics-latest.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireTokens(path, tokens) {
  for (const token of tokens) {
    assertToken(root, path, token);
  }
}

const reverbParam = {
  type: 0,
  quality: 1,
  decay: 2,
  size: 3,
  damping: 4,
  diffusion: 5,
  modulation: 6,
  predelay: 7,
  width: 8,
  shimmerAmount: 9,
  shimmerPitch: 10,
  slowRate: 11,
  slowDepth: 12,
  reverseAmount: 13,
  reverseLength: 14,
  chorusRate: 15,
  chorusDepth: 16,
  modCharacter: 17,
  dampLow: 18,
  dampHigh: 19,
  crossover: 20,
  inputTone: 21,
  shimmerFeedback: 22,
  warp: 23,
  crossFeed: 24,
  earlyReflections: 25,
  airAbsorption: 26,
  saturationMode: 27,
  transientSmooth: 28,
  erLpFreq: 29,
  bloom: 30,
};

function configureAmbientReverb(harness, overrides = {}) {
  const params = {
    [reverbParam.type]: 1,
    [reverbParam.quality]: 1,
    [reverbParam.decay]: 0.92,
    [reverbParam.size]: 4.0,
    [reverbParam.damping]: 0.25,
    [reverbParam.diffusion]: 0.9,
    [reverbParam.modulation]: 0.45,
    [reverbParam.predelay]: 20,
    [reverbParam.width]: 0.95,
    [reverbParam.shimmerAmount]: 0.25,
    [reverbParam.shimmerPitch]: 12,
    [reverbParam.slowRate]: 0.04,
    [reverbParam.slowDepth]: 0.3,
    [reverbParam.reverseAmount]: 0.18,
    [reverbParam.reverseLength]: 4,
    [reverbParam.chorusRate]: 0.35,
    [reverbParam.chorusDepth]: 12,
    [reverbParam.modCharacter]: 2,
    [reverbParam.dampLow]: 0.05,
    [reverbParam.dampHigh]: 0.35,
    [reverbParam.crossover]: 900,
    [reverbParam.inputTone]: 0,
    [reverbParam.shimmerFeedback]: 0.25,
    [reverbParam.warp]: 0.25,
    [reverbParam.crossFeed]: 0.2,
    [reverbParam.earlyReflections]: 0.35,
    [reverbParam.airAbsorption]: 0.25,
    [reverbParam.saturationMode]: 1,
    [reverbParam.transientSmooth]: 0.6,
    [reverbParam.erLpFreq]: 2500,
    [reverbParam.bloom]: 0.4,
    ...overrides,
  };
  for (const [index, value] of Object.entries(params)) {
    harness.setParam(Number(index), value);
  }
  harness.commitParams();
}

function fillReverbTone(harness, block, gain = 0.12) {
  harness.fillInput((frame) => {
    const t = (block * harness.frames + frame) / harness.sampleRate;
    return [
      (Math.sin(2 * Math.PI * 146.83 * t) + Math.sin(2 * Math.PI * 440 * t) * 0.3) * gain,
      (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 554.37 * t) * 0.24) * gain * 0.82,
    ];
  });
}

async function renderTailMetrics() {
  const harness = await createKesshoModuleHarness(root, 3);
  try {
    assertMetric(harness.paramCount === 31, `reverb module param count changed: ${harness.paramCount}`);
    configureAmbientReverb(harness);

    const samples = [];
    const blockRmsValues = [];
    const renderTimesMs = [];
    for (let block = 0; block < 640; block += 1) {
      harness.fillInput((frame) => (block === 0 && frame === 0 ? [0.8, 0.55] : [0, 0]));
      harness.clearOutput();
      renderTimesMs.push(harness.processInterleaved());
      const blockSamples = harness.outputSamples();
      samples.push(...blockSamples);
      blockRmsValues.push(blockRms(blockSamples));
    }

    const stats = sampleStats(samples, { silenceThreshold: 1e-7 });
    const nonZeroRms = blockRmsValues.filter((value) => value > 1e-9);
    const maxRms = Math.max(...blockRmsValues);
    const lateRms = blockRmsValues.slice(Math.floor(blockRmsValues.length * 0.75));
    const lateMeanRms = lateRms.reduce((sum, value) => sum + value, 0) / Math.max(1, lateRms.length);
    let maxRmsStep = 0;
    for (let index = 1; index < blockRmsValues.length; index += 1) {
      maxRmsStep = Math.max(maxRmsStep, Math.abs(blockRmsValues[index] - blockRmsValues[index - 1]));
    }
    const averageBlockMs = renderTimesMs.reduce((sum, value) => sum + value, 0) / Math.max(1, renderTimesMs.length);
    const p95BlockMs = percentile(renderTimesMs, 0.95) ?? 0;
    return {
      status:
        stats.nonFiniteCount === 0 &&
        stats.denormalCount === 0 &&
        stats.peak > 1e-5 &&
        stats.peak < 1.25 &&
        stats.meanAbs < 0.01 &&
        maxRms > 1e-6 &&
        lateMeanRms < maxRms * 1.5 &&
        maxRmsStep < 0.01 &&
        p95BlockMs < KESSHO_RENDER_QUANTUM_MS
          ? 'pass'
          : 'fail',
      peak: roundMetric(stats.peak, 9),
      rms: roundMetric(stats.rms, 9),
      meanAbs: roundMetric(stats.meanAbs, 9),
      nonFiniteCount: stats.nonFiniteCount,
      denormalCount: stats.denormalCount,
      maxSampleDelta: roundMetric(stats.maxFrameDelta, 9),
      maxRms: roundMetric(maxRms, 9),
      lateMeanRms: roundMetric(lateMeanRms, 9),
      maxRmsStep: roundMetric(maxRmsStep, 9),
      nonZeroBlockCount: nonZeroRms.length,
      tailRmsCurve: blockRmsValues
        .filter((_, index) => index % 40 === 0)
        .map((value) => roundMetric(value, 9)),
      averageBlockMs: roundMetric(averageBlockMs),
      p95BlockMs: roundMetric(p95BlockMs),
      estimatedCpuPercent: roundMetric((averageBlockMs / KESSHO_RENDER_QUANTUM_MS) * 100),
    };
  } finally {
    harness.destroy();
  }
}

async function renderTransitionMetrics() {
  const harness = await createKesshoModuleHarness(root, 3);
  try {
    configureAmbientReverb(harness);
    const samples = [];
    const renderTimesMs = [];
    const transitionEdges = {};
    let previousBlock = null;
    let pendingTransition = null;

    for (let block = 0; block < 384; block += 1) {
      if (block === 96) {
        configureAmbientReverb(harness, {
          [reverbParam.type]: 4,
          [reverbParam.quality]: 2,
          [reverbParam.size]: 5.5,
        });
        pendingTransition = 'modeQuality';
      } else if (block === 160) {
        configureAmbientReverb(harness, {
          [reverbParam.type]: 4,
          [reverbParam.quality]: 0,
          [reverbParam.shimmerAmount]: 0.45,
          [reverbParam.shimmerFeedback]: 0.35,
          [reverbParam.bloom]: 0.55,
        });
        pendingTransition = 'shimmerBloom';
      } else if (block === 224) {
        configureAmbientReverb(harness, {
          [reverbParam.decay]: 0.99,
          [reverbParam.size]: 7.0,
          [reverbParam.reverseAmount]: 0.35,
          [reverbParam.reverseLength]: 6.0,
        });
        pendingTransition = 'infiniteDecayReverse';
      }

      fillReverbTone(harness, block);
      harness.clearOutput();
      renderTimesMs.push(harness.processInterleaved());
      const blockSamples = harness.outputSamples();
      if (pendingTransition) {
        transitionEdges[pendingTransition] = roundMetric(maxBlockEdge(previousBlock, blockSamples), 9);
        pendingTransition = null;
      }
      if (block > 20) samples.push(...blockSamples);
      previousBlock = blockSamples;
    }

    const stats = sampleStats(samples, { silenceThreshold: 1e-7 });
    const averageBlockMs = renderTimesMs.reduce((sum, value) => sum + value, 0) / Math.max(1, renderTimesMs.length);
    const p95BlockMs = percentile(renderTimesMs, 0.95) ?? 0;
    const maxTransitionEdge = Math.max(0, ...Object.values(transitionEdges).filter(Number.isFinite));
    return {
      status:
        stats.nonFiniteCount === 0 &&
        stats.denormalCount === 0 &&
        stats.peak < 1.25 &&
        stats.meanAbs < 0.05 &&
        stats.maxFrameDelta < 0.2 &&
        maxTransitionEdge < 0.08 &&
        p95BlockMs < KESSHO_RENDER_QUANTUM_MS
          ? 'pass'
          : 'fail',
      peak: roundMetric(stats.peak, 9),
      rms: roundMetric(stats.rms, 9),
      meanAbs: roundMetric(stats.meanAbs, 9),
      nonFiniteCount: stats.nonFiniteCount,
      denormalCount: stats.denormalCount,
      maxSampleDelta: roundMetric(stats.maxFrameDelta, 9),
      transitionEdges,
      maxTransitionEdge: roundMetric(maxTransitionEdge, 9),
      averageBlockMs: roundMetric(averageBlockMs),
      p95BlockMs: roundMetric(p95BlockMs),
      estimatedCpuPercent: roundMetric((averageBlockMs / KESSHO_RENDER_QUANTUM_MS) * 100),
    };
  } finally {
    harness.destroy();
  }
}

async function renderCpuCase(id, paramOverrides) {
  const harness = await createKesshoModuleHarness(root, 3);
  try {
    configureAmbientReverb(harness, paramOverrides);
    const renderTimesMs = [];
    const samples = [];
    for (let block = 0; block < 256; block += 1) {
      fillReverbTone(harness, block, 0.08);
      harness.clearOutput();
      renderTimesMs.push(harness.processInterleaved());
      if (block > 20) samples.push(...harness.outputSamples());
    }
    const stats = sampleStats(samples, { silenceThreshold: 1e-7 });
    const averageBlockMs = renderTimesMs.reduce((sum, value) => sum + value, 0) / Math.max(1, renderTimesMs.length);
    const p95BlockMs = percentile(renderTimesMs, 0.95) ?? 0;
    return {
      id,
      status: stats.nonFiniteCount === 0 && stats.denormalCount === 0 && p95BlockMs < KESSHO_RENDER_QUANTUM_MS ? 'pass' : 'fail',
      averageBlockMs: roundMetric(averageBlockMs),
      p95BlockMs: roundMetric(p95BlockMs),
      estimatedCpuPercent: roundMetric((averageBlockMs / KESSHO_RENDER_QUANTUM_MS) * 100),
      rms: roundMetric(stats.rms, 9),
      peak: roundMetric(stats.peak, 9),
      nonFiniteCount: stats.nonFiniteCount,
      denormalCount: stats.denormalCount,
    };
  } finally {
    harness.destroy();
  }
}

async function runReverbRenderMetrics() {
  const tail = await renderTailMetrics();
  const transitions = await renderTransitionMetrics();
  const cpuCases = [
    await renderCpuCase('hall-balanced', {
      [reverbParam.type]: 1,
      [reverbParam.quality]: 1,
      [reverbParam.shimmerAmount]: 0,
      [reverbParam.reverseAmount]: 0,
      [reverbParam.bloom]: 0,
    }),
    await renderCpuCase('cathedral-ultra-shimmer', {
      [reverbParam.type]: 4,
      [reverbParam.quality]: 0,
      [reverbParam.decay]: 0.96,
      [reverbParam.size]: 6,
      [reverbParam.shimmerAmount]: 0.45,
      [reverbParam.shimmerFeedback]: 0.4,
      [reverbParam.bloom]: 0.55,
    }),
    await renderCpuCase('reverse-infinite-bloom', {
      [reverbParam.type]: 2,
      [reverbParam.quality]: 2,
      [reverbParam.decay]: 0.99,
      [reverbParam.reverseAmount]: 0.4,
      [reverbParam.reverseLength]: 6,
      [reverbParam.bloom]: 0.5,
    }),
  ];

  const generatedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    generatedAt,
    status:
      tail.status === 'pass' &&
      transitions.status === 'pass' &&
      cpuCases.every((entry) => entry.status === 'pass')
        ? 'pass'
        : 'fail',
    metadata: collectReportMetadata({
      root,
      generatedAt,
      command: process.argv.map(String).join(' '),
      scenarioName: 'reverb-render-metrics',
      sampleRate: KESSHO_RENDER_SAMPLE_RATE,
      blockSize: KESSHO_RENDER_BLOCK_FRAMES,
      durationMs: 640 * KESSHO_RENDER_QUANTUM_MS,
      thresholds: {
        tailPeakMin: 1e-5,
        outputPeakMax: 1.25,
        maxTailRmsStep: 0.01,
        maxTransitionEdge: 0.08,
        maxTransitionSampleDelta: 0.2,
        p95BlockMsMax: roundMetric(KESSHO_RENDER_QUANTUM_MS),
      },
      topSuspectedModules: ['reverb', 'spectral-freeze', 'worklet-messaging'],
    }),
    thresholds: {
      tailPeakMin: 1e-5,
      outputPeakMax: 1.25,
      maxTailRmsStep: 0.01,
      maxTransitionEdge: 0.08,
      maxTransitionSampleDelta: 0.2,
      p95BlockMsMax: roundMetric(KESSHO_RENDER_QUANTUM_MS),
    },
    cases: {
      impulseTail: tail,
      parameterTransitions: transitions,
      cpuByMode: cpuCases,
    },
  };

  writeJsonReport(reportJsonPath, report);

  const lines = [
    '# Kessho Product Reverb Render Metrics',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    '| Case | Status | RMS | Peak | Max Delta | Non-finite | CPU |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    `| Impulse tail | ${tail.status.toUpperCase()} | ${tail.rms} | ${tail.peak} | ${tail.maxSampleDelta} | ${tail.nonFiniteCount} | ${tail.estimatedCpuPercent}% avg / ${tail.p95BlockMs} ms p95 |`,
    `| Parameter transitions | ${transitions.status.toUpperCase()} | ${transitions.rms} | ${transitions.peak} | ${transitions.maxSampleDelta} | ${transitions.nonFiniteCount} | ${transitions.estimatedCpuPercent}% avg / ${transitions.p95BlockMs} ms p95 |`,
    '',
    '## CPU By Mode',
    '',
    '| Mode | Status | CPU % | p95 ms | RMS | Peak |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...cpuCases.map((entry) => `| ${entry.id} | ${entry.status.toUpperCase()} | ${entry.estimatedCpuPercent} | ${entry.p95BlockMs} | ${entry.rms} | ${entry.peak} |`),
    '',
    '## Transition Edges',
    '',
    ...Object.entries(transitions.transitionEdges).map(([name, value]) => `- ${name}: ${value}`),
    '',
  ];
  writeMarkdownReport(reportMarkdownPath, lines);

  assert(report.status === 'pass', `reverb render metrics failed; see ${reportJsonPath}`);
  return report;
}

requireTokens('cpp/KesshoCore/src/product/fx/ProductReverb.cpp', [
  'resetReverbHarmonyCoupling',
  'advanceReverbHarmonyCoupling',
  'reverb_wash_boost',
  'reverb_bloom_boost',
  'configureReverbModule()',
  'spectral_freeze_enabled',
  'spectral_freeze_reverb_crossfade',
  'reverb_module->processPlanarStereo',
  'routeTerminalSample(routing.dynamics_routes[kDynamicsRouteReverb], out_l, out_r, frame, left, right)',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductReverbPreconditioner.cpp', [
  'reverbPreCompressorGainDbForLevel',
  'reverbPreconditionerSoftLimit',
  'processReverbPreconditioner',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductReverbModuleConfig.cpp', [
  'params[0] = static_cast<float>(clampU32(fx.reverb_type, 0u, 5u))',
  'params[1] = static_cast<float>(clampU32(fx.reverb_quality, 0u, 2u))',
  'params[2] = effective_decay',
  'params[3] = clampFloat(fx.reverb_size, 0.5f, 10.0f)',
  'params[4] = clampFloat(fx.reverb_damping, 0.0f, 1.0f)',
  'params[6] = clampFloat(fx.reverb_modulation, 0.0f, 1.0f)',
  'params[9] = effective_shimmer',
  'params[13] = clampFloat(fx.reverb_reverse_amount, 0.0f, 1.0f)',
  'params[22] = clampFloat(fx.reverb_shimmer_feedback, 0.0f, 1.0f)',
  'params[28] = clampFloat(fx.reverb_transient_smooth, 0.0f, 1.0f)',
]);

requireTokens('cpp/KesshoCore/src/modules/KesshoReverbModule.cpp', [
  'reverb_instance_set_quality',
  'reverb_instance_set_shimmer',
  'reverb_instance_set_reverse',
  'reverb_instance_set_shimmer_feedback',
  'reverb_instance_set_transient_smooth',
]);

requireTokens('scripts/test-kessho-core.mjs', [
  'WASM reverb interleaved module should produce a non-zero tail',
  'WASM reverb planar module should produce a non-zero tail',
  'moduleGetParamCount(reverbModule) === 31',
  'reverbParamsPtr !== reverbParamsPtrB',
]);

requireTokens('scripts/lib/kesshoProductWebGraphSmokeCases.mjs', [
  'manual-pad-delay-a-reverb-send',
  'manual-pad-delay-b-reverb-send',
  'manual-drum-reverb-send',
  'manual-pad-sidechain-reverb-output',
  'spectral-freeze-reverb-return',
]);

requireTokens('scripts/check-kessho-product-page-cpu-comparison.mjs', [
  'reverbPatch()',
  "'reverb'",
  "'algorithmic reverb'",
  "'shimmer'",
  "'reverse'",
  "'spectral freeze'",
]);

assertPackageScript('core:product:reverb-tail-quality', 'node scripts/check-kessho-product-reverb-tail-quality.mjs', root);

const renderReport = await runReverbRenderMetrics();

console.log(
  `Kessho Product reverb tail-quality checks passed ` +
    `(tail peak ${renderReport.cases.impulseTail.peak}, ` +
    `${renderReport.cases.cpuByMode.length} CPU mode rows)`,
);
