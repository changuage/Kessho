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
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-granular-render-metrics-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-granular-render-metrics-latest.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireTokens(path, tokens) {
  for (const token of tokens) {
    assertToken(root, path, token);
  }
}

const granularParam = {
  enabled: 0,
  freeze: 1,
  dryWet: 3,
  feedback: 4,
  feedbackLpf: 5,
  bufferSeconds: 6,
  busDiffusion: 8,
  timingRandomness: 9,
  voiceStart: 10,
  voiceStride: 25,
};

const granularVoiceParam = {
  enabled: 0,
  mode: 1,
  speed: 3,
  scanRate: 4,
  pitch: 6,
  density: 8,
  grainSize: 9,
  spray: 10,
  attack: 12,
  decay: 13,
  gain: 14,
  pan: 15,
  stereoSpread: 17,
};

function fillGranularInput(harness, block, gain = 0.34) {
  harness.fillInput((frame) => {
    const t = (block * harness.frames + frame) / harness.sampleRate;
    return [
      Math.sin(2 * Math.PI * 220 * t) * gain + Math.sin(2 * Math.PI * 660 * t) * gain * 0.18,
      Math.sin(2 * Math.PI * 330 * t) * gain * 0.72,
    ];
  });
}

function configureDenseGranular(harness) {
  harness.setParam(granularParam.enabled, 1);
  harness.setParam(granularParam.freeze, 0);
  harness.setParam(granularParam.dryWet, 1);
  harness.setParam(granularParam.feedback, 0.18);
  harness.setParam(granularParam.feedbackLpf, 6500);
  harness.setParam(granularParam.bufferSeconds, 8);
  harness.setParam(granularParam.busDiffusion, 0.3);
  harness.setParam(granularParam.timingRandomness, 0.2);

  const densities = [48, 40, 36, 52];
  const grainSizes = [80, 140, 200, 110];
  const gains = [0.42, 0.35, 0.32, 0.38];
  const pans = [-0.25, 0.25, -0.1, 0.1];
  for (let voice = 0; voice < 4; voice += 1) {
    const base = granularParam.voiceStart + voice * granularParam.voiceStride;
    harness.setParam(base + granularVoiceParam.enabled, 1);
    harness.setParam(base + granularVoiceParam.mode, voice === 1 ? 1 : 0);
    harness.setParam(base + granularVoiceParam.speed, voice === 2 ? 0 : 1);
    harness.setParam(base + granularVoiceParam.scanRate, voice === 2 ? 0.8 : 1);
    harness.setParam(base + granularVoiceParam.pitch, voice === 3 ? -12 : voice === 1 ? 7 : 0);
    harness.setParam(base + granularVoiceParam.density, densities[voice]);
    harness.setParam(base + granularVoiceParam.grainSize, grainSizes[voice]);
    harness.setParam(base + granularVoiceParam.spray, 0.2);
    harness.setParam(base + granularVoiceParam.attack, 0.003);
    harness.setParam(base + granularVoiceParam.decay, 0.4);
    harness.setParam(base + granularVoiceParam.gain, gains[voice]);
    harness.setParam(base + granularVoiceParam.pan, pans[voice]);
    harness.setParam(base + granularVoiceParam.stereoSpread, 0.65);
  }
  harness.commitParams();
}

async function runGranularRenderMetrics() {
  const disabledHarness = await createKesshoModuleHarness(root, 4);
  let disabledReport;
  try {
    assertMetric(disabledHarness.paramCount === 199, `granular module param count changed: ${disabledHarness.paramCount}`);
    disabledHarness.setParam(granularParam.enabled, 0);
    disabledHarness.commitParams();
    fillGranularInput(disabledHarness, 0, 0.2);
    const input = disabledHarness.inputSamples();
    disabledHarness.clearOutput();
    const elapsedMs = disabledHarness.processInterleaved();
    const output = disabledHarness.outputSamples();
    let maxDryThroughDelta = 0;
    for (let index = 0; index < output.length; index += 1) {
      maxDryThroughDelta = Math.max(maxDryThroughDelta, Math.abs(output[index] - input[index]));
    }
    const stats = sampleStats(output);
    disabledReport = {
      status: stats.nonFiniteCount === 0 && maxDryThroughDelta < 1e-6 ? 'pass' : 'fail',
      maxDryThroughDelta: roundMetric(maxDryThroughDelta, 9),
      nonFiniteCount: stats.nonFiniteCount,
      elapsedMs: roundMetric(elapsedMs),
    };
  } finally {
    disabledHarness.destroy();
  }

  const denseHarness = await createKesshoModuleHarness(root, 4);
  let denseReport;
  try {
    configureDenseGranular(denseHarness);
    const samples = [];
    const blockRmsValues = [];
    const renderTimesMs = [];
    const transitionEdges = {};
    let previousBlock = null;
    let pendingTransition = null;

    for (let block = 0; block < 384; block += 1) {
      if (block === 96) {
        denseHarness.setParam(granularParam.freeze, 1);
        denseHarness.commitParams();
        pendingTransition = 'freezeOn';
      } else if (block === 144) {
        denseHarness.setParam(granularParam.freeze, 0);
        denseHarness.commitParams();
        pendingTransition = 'freezeOff';
      } else if (block === 192) {
        denseHarness.setParam(granularParam.bufferSeconds, 16);
        denseHarness.commitParams();
        pendingTransition = 'bufferResize';
      } else if (block === 240) {
        denseHarness.reset();
        configureDenseGranular(denseHarness);
        pendingTransition = 'resetWhileActive';
      }

      fillGranularInput(denseHarness, block);
      denseHarness.clearOutput();
      renderTimesMs.push(denseHarness.processInterleaved());
      const blockSamples = denseHarness.outputSamples();
      if (pendingTransition) {
        transitionEdges[pendingTransition] = roundMetric(maxBlockEdge(previousBlock, blockSamples));
        pendingTransition = null;
      }
      if (block > 20) {
        samples.push(...blockSamples);
        blockRmsValues.push(blockRms(blockSamples));
      }
      previousBlock = blockSamples;
    }

    const stats = sampleStats(samples, { silenceThreshold: 1e-5 });
    const averageBlockMs = renderTimesMs.reduce((sum, value) => sum + value, 0) / Math.max(1, renderTimesMs.length);
    const p95BlockMs = percentile(renderTimesMs, 0.95) ?? 0;
    const estimatedCpuPercent = (averageBlockMs / KESSHO_RENDER_QUANTUM_MS) * 100;
    const maxTransitionEdge = Math.max(0, ...Object.values(transitionEdges).filter(Number.isFinite));
    const rmsMin = Math.min(...blockRmsValues);
    const rmsMax = Math.max(...blockRmsValues);
    denseReport = {
      status:
        stats.nonFiniteCount === 0 &&
        stats.denormalCount === 0 &&
        stats.rms > 0.002 &&
        stats.peak < 1.25 &&
        stats.maxFrameDelta < 0.45 &&
        stats.maxSilentRunFrames < 256 &&
        maxTransitionEdge < 0.2 &&
        p95BlockMs < KESSHO_RENDER_QUANTUM_MS
          ? 'pass'
          : 'fail',
      rms: roundMetric(stats.rms),
      peak: roundMetric(stats.peak),
      nonFiniteCount: stats.nonFiniteCount,
      denormalCount: stats.denormalCount,
      maxSampleDelta: roundMetric(stats.maxFrameDelta),
      maxSilentRunFrames: stats.maxSilentRunFrames,
      transitionEdges,
      maxTransitionEdge: roundMetric(maxTransitionEdge),
      blockRmsRange: [roundMetric(rmsMin), roundMetric(rmsMax)],
      averageBlockMs: roundMetric(averageBlockMs),
      p95BlockMs: roundMetric(p95BlockMs),
      estimatedCpuPercent: roundMetric(estimatedCpuPercent),
    };
  } finally {
    denseHarness.destroy();
  }

  const generatedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    generatedAt,
    status: disabledReport.status === 'pass' && denseReport.status === 'pass' ? 'pass' : 'fail',
    metadata: collectReportMetadata({
      root,
      generatedAt,
      command: process.argv.map(String).join(' '),
      scenarioName: 'granular-render-metrics',
      sampleRate: KESSHO_RENDER_SAMPLE_RATE,
      blockSize: KESSHO_RENDER_BLOCK_FRAMES,
      durationMs: 384 * KESSHO_RENDER_QUANTUM_MS,
      thresholds: {
        maxDryThroughDelta: 1e-6,
        denseRmsMin: 0.002,
        densePeakMax: 1.25,
        maxSampleDelta: 0.45,
        maxSilentRunFrames: 256,
        maxTransitionEdge: 0.2,
        p95BlockMsMax: roundMetric(KESSHO_RENDER_QUANTUM_MS),
      },
      topSuspectedModules: ['granular', 'worklet-messaging'],
    }),
    thresholds: {
      maxDryThroughDelta: 1e-6,
      denseRmsMin: 0.002,
      densePeakMax: 1.25,
      maxSampleDelta: 0.45,
      maxSilentRunFrames: 256,
      maxTransitionEdge: 0.2,
      p95BlockMsMax: roundMetric(KESSHO_RENDER_QUANTUM_MS),
    },
    cases: {
      disabledDryThrough: disabledReport,
      denseGrainTransition: denseReport,
    },
  };

  writeJsonReport(reportJsonPath, report);

  const lines = [
    '# Kessho Product Granular Render Metrics',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    '| Case | Status | RMS | Peak | Max Delta | Non-finite | Silent Run | CPU |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| Disabled dry-through | ${disabledReport.status.toUpperCase()} | - | - | ${disabledReport.maxDryThroughDelta} | ${disabledReport.nonFiniteCount} | - | ${disabledReport.elapsedMs} ms |`,
    `| Dense grains + transitions | ${denseReport.status.toUpperCase()} | ${denseReport.rms} | ${denseReport.peak} | ${denseReport.maxSampleDelta} | ${denseReport.nonFiniteCount} | ${denseReport.maxSilentRunFrames} | ${denseReport.estimatedCpuPercent}% avg / ${denseReport.p95BlockMs} ms p95 |`,
    '',
    '## Transition Edges',
    '',
    ...Object.entries(denseReport.transitionEdges).map(([name, value]) => `- ${name}: ${value}`),
    '',
  ];
  writeMarkdownReport(reportMarkdownPath, lines);

  assert(report.status === 'pass', `granular render metrics failed; see ${reportJsonPath}`);
  return report;
}

requireTokens('cpp/KesshoCore/src/product/fx/ProductGranularRuntime.cpp', [
  'kGranularControlSmoothSeconds',
  'smoothedGranularControlCached',
  'updateGranularControlSmoothCoeff',
  'std::isfinite(target)',
  'granularSendGainForFrame',
  'advanceGranularReturnGains',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductGranularPhraseRuntime.cpp', [
  'advanceGranularPhraseReseed',
  'granular_module->setRandomSeed(rng_state)',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductGranular.cpp', [
  'renderGranular',
  'fx.granular_enabled',
  'updateProductBiquadCoefficients(granular_output_lpf',
  'updateProductBiquadCoefficients(granular_reverb_lpf',
  'updateGranularReverbCompressorCoeffs',
  'granular_reverb_comp_attack_coeff',
  'granular_reverb_comp_release_coeff',
  'advanceGranularReturnGains(transport.sample_frame + i)',
  'routeTerminalSample(routing.dynamics_routes[kDynamicsRouteGranular]',
]);

requireTokens('cpp/KesshoCore/src/product/KesshoProductRender.cpp', [
  'updateProductBiquadCoefficients(',
  'processProductBiquadSample(',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductFxModules.cpp', [
  'params[1] = fx.granular_freeze ? 1.0f : 0.0f',
  'params[2] = fx.granular_freeze_with_feedback ? 1.0f : 0.0f',
  'clampFloat(fx.granular_feedback, 0.0f, 0.85f)',
  'clampFloat(fx.granular_buffer_seconds, 1.0f, 32.0f)',
  'clampFloat(voice.density, 1.0f, 64.0f)',
  'clampFloat(voice.grain_size_ms, 10.0f, 500.0f)',
  'clampFloat(voice.attack_seconds, 0.001f, 0.5f)',
  'clampFloat(voice.decay_seconds, 0.01f, 4.0f)',
]);

requireTokens('scripts/test-kessho-core.mjs', [
  'const granularParamCount = 199',
  'WASM granular disabled module should pass input',
  'WASM granular disabled planar module process failed',
  'WASM granular active module should produce non-zero output',
  'moduleGetParamCount(granularModule) === granularParamCount',
  'granularParamsPtr !== granularParamsPtrB',
]);

requireTokens('scripts/lib/kesshoProductWebGraphSmokeCases.mjs', [
  'manual-pad-granular-output-clean-direct',
  'manual-pad-granular-output-two-voice-clean',
  'manual-pad-granular-output-modulated-clean',
  'manual-pad-granular-output-feedback-clean',
  'manual-pad-granular-output-delayed-freeze-clean',
  'granularFreeze: true',
  'manual-pad-granular-reverb-send-clean',
  'manual-pad-granular-to-delay-a-send-clean',
  'manual-pad-granular-to-delay-b-send-clean',
]);

requireTokens('src/audio/coreProductTelemetry.ts', [
  'activeGrains',
  'granularWriteHeadPosition',
  'granularVoicePositions',
  'granularBufferWaveform',
]);

requireTokens('public/worklets/kessho-core-product.worklet.js', [
  'GRANULAR_WAVEFORM_BINS',
  "this.resolve('kessho_product_copy_granular_waveform')",
  'readGranularWaveform(includeGranularWaveform)',
  'telemetry.granularBufferWaveform = granularBufferWaveform',
]);

requireTokens('cpp/KesshoCore/src/modules/KesshoGranularModule.cpp', [
  'copyGranularWaveform',
  'granular_instance_get_buffer_ptr_l',
  'kSamplesPerBin',
]);

requireTokens('cpp/KesshoCore/src/product/KesshoProductApi.cpp', [
  'kessho_product_copy_granular_waveform',
]);

requireTokens('scripts/check-kessho-product-page-cpu-comparison.mjs', [
  'granularPatch()',
  "'granular'",
  "'4 granular voices'",
  "'legacy voice'",
  "'clean voice'",
]);

assertPackageScript('core:product:granular-artifacts', 'node scripts/check-kessho-product-granular-artifacts.mjs', root);

const renderReport = await runGranularRenderMetrics();

console.log(
  `Kessho Product granular artifact checks passed ` +
    `(render metrics: ${renderReport.cases.denseGrainTransition.estimatedCpuPercent}% avg CPU, ` +
    `${renderReport.cases.denseGrainTransition.p95BlockMs} ms p95 block)`,
);
