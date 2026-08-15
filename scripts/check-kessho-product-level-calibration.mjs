#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const contractPath = resolve(reportDir, 'kessho-product-level-calibration-contract.json');
const jsonPath = resolve(reportDir, 'kessho-product-level-calibration-latest.json');
const markdownPath = resolve(reportDir, 'kessho-product-level-calibration-latest.md');
const sampleAssetReportPath = resolve(reportDir, 'kessho-product-sample-asset-loudness-latest.json');
const binaryPath = resolve(root, 'build/kessho-core/product-tests/ProductGainStagingValidationTests');
const calibrationCommand = [process.execPath, 'scripts/run-kessho-product-cpp-test.mjs', 'ProductGainStagingValidationTests'];
const sampleAssetCommand = [process.execPath, 'scripts/check-kessho-product-sample-asset-loudness.mjs'];
const productFxLoudnessCommand = [process.execPath, 'scripts/run-kessho-product-cpp-test.mjs', 'ProductFxLoudnessMeasurementTests'];
// Keep checked-in evidence portable: execution uses absolute paths internally, but
// reports must be reproducible from any checkout rather than naming this host.
const calibrationDisplayCommand = 'node scripts/run-kessho-product-cpp-test.mjs ProductGainStagingValidationTests';
const sampleAssetDisplayCommand = 'node scripts/check-kessho-product-sample-asset-loudness.mjs';
const productFxLoudnessDisplayCommand = 'node scripts/run-kessho-product-cpp-test.mjs ProductFxLoudnessMeasurementTests';
const repeatDisplayCommand = './build/kessho-core/product-tests/ProductGainStagingValidationTests';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return { status: result.status, output };
}

function portableOutput(output) {
  return output.replaceAll(root, '.').replaceAll(process.execPath, 'node');
}

function parseFixture(output, label) {
  const match = output.match(/KESSHO_PRODUCT_LEVEL_CALIBRATION_JSON=(\{[^\n]+\})/);
  if (!match) throw new Error(`${label} did not emit KESSHO_PRODUCT_LEVEL_CALIBRATION_JSON`);
  return JSON.parse(match[1]);
}

function parseProductFxLoudness(output, label) {
  const match = output.match(/KESSHO_PRODUCT_FX_LOUDNESS_JSON=(\{[^\n]+\})/);
  if (!match) throw new Error(`${label} did not emit KESSHO_PRODUCT_FX_LOUDNESS_JSON`);
  return JSON.parse(match[1]);
}

function finitePositive(value, label, failures) {
  if (!Number.isFinite(value) || value <= 0) failures.push(`${label} must be finite and positive (got ${value})`);
}

function signalAt(fixture, path) {
  if (fixture.fx?.[path]) return fixture.fx[path];
  if (fixture.fxLoudness?.[path]) return fixture.fxLoudness[path];
  const source = fixture.sources?.find((entry) => entry.name === path);
  if (source) return source;
  const parts = path.split('.');
  let value = fixture;
  for (const part of parts) value = value?.[part];
  return value;
}

function rmsAt(fixture, path) {
  return signalAt(fixture, path)?.rms;
}

function lufsAt(fixture, path) {
  const value = signalAt(fixture, path);
  return typeof value === 'number' ? value : value?.lufs;
}

function hashes(fixture) {
  const entries = [];
  const add = (path, value) => entries.push([path, value]);
  for (const source of fixture.sources) add(`sources.${source.name}`, source.hash);
  for (const path of ['drums.master', 'drums.dry', 'drums.pre_limiter', 'earth.master', 'earth.water_dry', 'headroom.pre_limiter', 'headroom.output']) {
    add(path, path.split('.').reduce((value, part) => value?.[part], fixture)?.hash);
  }
  for (const name of Object.keys(fixture.fx)) add(`fx.${name}`, fixture.fx[name].hash);
  return Object.fromEntries(entries);
}

function dbDelta(actual, expected) {
  return 20 * Math.log10(actual / expected);
}

function checkRms(fixture, expected, toleranceDb, group, failures) {
  for (const [path, target] of Object.entries(expected)) {
    const actual = rmsAt(fixture, path);
    finitePositive(actual, `${group} ${path} RMS`, failures);
    finitePositive(target, `${group} ${path} contract RMS`, failures);
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(target) || target <= 0) continue;
    const delta = dbDelta(actual, target);
    if (Math.abs(delta) > toleranceDb) {
      failures.push(`${group} ${path} is ${delta.toFixed(3)} dB from contract (limit ±${toleranceDb} dB)`);
    }
  }
}

function checkLufs(fixture, expected, toleranceLufs, group, failures) {
  for (const [path, target] of Object.entries(expected ?? {})) {
    const actual = lufsAt(fixture, path);
    if (!Number.isFinite(actual) || !Number.isFinite(target)) {
      failures.push(`${group} ${path} LUFS must be finite (got ${actual}; contract ${target})`);
      continue;
    }
    if (Math.abs(actual - target) > toleranceLufs) {
      failures.push(`${group} ${path} is ${(actual - target).toFixed(3)} LU from contract (limit ±${toleranceLufs} LU)`);
    }
  }
}

function checkSourceLoudness(fixture, expected, failures) {
  const tolerance = expected?.toleranceLufs ?? 1;
  for (const [path, baseline] of Object.entries(expected?.signals ?? {})) {
    const signal = signalAt(fixture, path);
    const actual = signal?.lufs;
    if (!Number.isFinite(actual) || !Number.isFinite(baseline.lufs)) {
      failures.push(`source loudness ${path} LUFS must be finite (got ${actual}; contract ${baseline.lufs})`);
      continue;
    }
    if (Math.abs(actual - baseline.lufs) > tolerance) {
      failures.push(`source loudness ${path} is ${(actual - baseline.lufs).toFixed(3)} LU from contract (limit ±${tolerance} LU)`);
    }
    if (baseline.mode && signal?.lufs_mode !== baseline.mode) {
      failures.push(`source loudness ${path} mode ${signal?.lufs_mode} does not match contract ${baseline.mode}`);
    }
  }
}

function checkProductFxLoudness(measurement, expected, failures) {
  if (measurement?.schema !== expected?.schema) failures.push(`unexpected Product FX loudness schema ${measurement?.schema}`);
  if (measurement?.sample_rate !== expected?.sampleRate || measurement?.block_size !== expected?.blockSize) {
    failures.push(`Product FX loudness format ${measurement?.sample_rate}/${measurement?.block_size} does not match contract ${expected?.sampleRate}/${expected?.blockSize}`);
  }
  const expectedNames = Object.keys(expected?.fixtures ?? {});
  const actualFixtures = Array.isArray(measurement?.fixtures) ? measurement.fixtures : [];
  const actualNames = actualFixtures.map((fixture) => fixture.name);
  const actualByName = new Map(actualFixtures.map((fixture) => [fixture.name, fixture]));
  const missing = expectedNames.filter((name) => !actualByName.has(name));
  const unexpected = actualNames.filter((name) => !expectedNames.includes(name));
  if (missing.length) failures.push(`Product FX loudness fixtures missing: ${missing.join(', ')}`);
  if (unexpected.length) failures.push(`Product FX loudness fixtures unexpected: ${unexpected.join(', ')}`);
  if (new Set(actualNames).size !== actualNames.length) failures.push('Product FX loudness fixture names are not unique');
  if (!expectedNames.includes('creative_saturation_controlled')) failures.push('Product FX loudness contract must include creative_saturation_controlled');
  const tolerance = expected?.deltaLuTolerance ?? 1;
  for (const [name, baseline] of Object.entries(expected?.fixtures ?? {})) {
    const actual = actualByName.get(name)?.delta_lu;
    if (!Number.isFinite(actual) || !Number.isFinite(baseline.deltaLu)) {
      failures.push(`Product FX loudness ${name} delta LU must be finite (got ${actual}; contract ${baseline.deltaLu})`);
      continue;
    }
    if (Math.abs(actual - baseline.deltaLu) > tolerance) {
      failures.push(`Product FX loudness ${name} delta LU is ${(actual - baseline.deltaLu).toFixed(3)} LU from contract (limit ±${tolerance} LU)`);
    }
  }
}

function runCalibration() {
  const first = run(calibrationCommand[0], calibrationCommand.slice(1));
  if (first.status !== 0) throw new Error(`calibration fixture command failed:\n${portableOutput(first.output.slice(-12000))}`);
  const firstFixture = parseFixture(first.output, 'calibration fixture');
  if (!existsSync(binaryPath)) throw new Error(`calibration binary was not produced: ${repeatDisplayCommand}`);
  const second = run(binaryPath, []);
  if (second.status !== 0) throw new Error(`calibration repeat command failed:\n${portableOutput(second.output.slice(-12000))}`);
  return {
    fixture: firstFixture,
    repeat: parseFixture(second.output, 'calibration repeat'),
    output: first.output,
    repeatOutput: second.output,
  };
}

function runProductFxLoudness() {
  const result = run(productFxLoudnessCommand[0], productFxLoudnessCommand.slice(1));
  if (result.status !== 0) throw new Error(`Product FX loudness command failed:\n${portableOutput(result.output.slice(-12000))}`);
  return {
    measurement: parseProductFxLoudness(result.output, 'Product FX loudness'),
    output: result.output,
  };
}

function runSampleAssetLoudness() {
  const result = run(sampleAssetCommand[0], sampleAssetCommand.slice(1));
  if (result.status !== 0) throw new Error(`sample asset loudness command failed:\n${portableOutput(result.output.slice(-12000))}`);
  try {
    return {
      report: JSON.parse(readFileSync(sampleAssetReportPath, 'utf8')),
      output: result.output,
    };
  } catch (error) {
    throw new Error(`sample asset loudness report could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkSampleAssetLoudness(report, expected, failures) {
  if (report?.schema !== 'kessho-sample-asset-loudness-v1') {
    failures.push(`unexpected sample asset loudness schema ${report?.schema}`);
    return;
  }
  const corpus = report.corpus ?? {};
  if (corpus.discoveredUniqueOggCount !== expected.expectedOggCount) {
    failures.push(`sample corpus OGG count ${corpus.discoveredUniqueOggCount} does not match ${expected.expectedOggCount}`);
  }
  if (corpus.oggAssetPathSha256 !== expected.oggAssetPathSha256) {
    failures.push(`sample corpus OGG path SHA-256 ${corpus.oggAssetPathSha256} does not match ${expected.oggAssetPathSha256}`);
  }
  const measurement = report.measurement ?? {};
  if (measurement.decodedAssetCount !== expected.expectedDecodedAssetCount) {
    failures.push(`sample corpus decoded count ${measurement.decodedAssetCount} does not match ${expected.expectedDecodedAssetCount}`);
  }
  if (measurement.decodeErrorCount !== expected.expectedDecodeErrorCount || !Array.isArray(report.errors) || report.errors.length !== expected.expectedDecodeErrorCount) {
    failures.push(`sample corpus decode errors ${measurement.decodeErrorCount}/${Array.isArray(report.errors) ? report.errors.length : 'missing'} do not match ${expected.expectedDecodeErrorCount}`);
  }

  const nature = Object.fromEntries((report.focus?.catalogNatureAssets ?? []).map((row) => [row.id, row]));
  for (const [id, baseline] of Object.entries(expected.nature ?? {})) {
    const row = nature[id];
    if (!row) {
      failures.push(`sample nature baseline missing ${id}`);
      continue;
    }
    for (const [field, target] of Object.entries(baseline)) {
      const actual = row[field];
      if (!Number.isFinite(actual) || Math.abs(actual - target) > expected.natureToleranceLufs) {
        failures.push(`sample nature ${id} ${field} ${actual} differs from ${target} by more than ±${expected.natureToleranceLufs} LU`);
      }
    }
  }

  const generatedMedian = report.statistics?.allGeneratedLibraries?.activeRmsDbfs?.median;
  if (!Number.isFinite(generatedMedian) || Math.abs(generatedMedian - expected.generatedLibraryMedianActiveRmsDbfs) > expected.generatedLibraryMedianActiveRmsDbfsToleranceDb) {
    failures.push(`generated sample-library median active RMS ${generatedMedian} differs from ${expected.generatedLibraryMedianActiveRmsDbfs} by more than ±${expected.generatedLibraryMedianActiveRmsDbfsToleranceDb} dB`);
  }

  const expectedLibraries = expected.generatedLibraryMediansActiveRmsDbfs ?? {};
  const actualLibraries = report.statistics?.libraries ?? {};
  const missingLibraries = Object.keys(expectedLibraries).filter((name) => !Object.hasOwn(actualLibraries, name));
  const unexpectedLibraries = Object.keys(actualLibraries).filter((name) => !Object.hasOwn(expectedLibraries, name));
  if (missingLibraries.length) failures.push(`generated library medians missing: ${missingLibraries.join(', ')}`);
  if (unexpectedLibraries.length) failures.push(`generated library medians unexpected: ${unexpectedLibraries.join(', ')}`);
  for (const [library, target] of Object.entries(expectedLibraries)) {
    const actual = actualLibraries[library]?.activeRmsDbfs?.median;
    if (!Number.isFinite(actual) || !Number.isFinite(target)) {
      failures.push(`generated library ${library} median active RMS must be finite (got ${actual}; contract ${target})`);
      continue;
    }
    if (Math.abs(actual - target) > expected.generatedLibraryMedianActiveRmsDbfsToleranceDb) {
      failures.push(`generated library ${library} median active RMS ${actual} differs from ${target} by more than ±${expected.generatedLibraryMedianActiveRmsDbfsToleranceDb} dB`);
    }
  }
}

const failures = [];
let contract;
let calibration;
let sampleAsset;
let productFxLoudness;
try {
  contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  sampleAsset = runSampleAssetLoudness();
  if (!contract.sampleAssetLoudness) failures.push('sampleAssetLoudness section is missing from the level calibration contract');
  else checkSampleAssetLoudness(sampleAsset.report, contract.sampleAssetLoudness, failures);
  productFxLoudness = runProductFxLoudness();
  if (!contract.productFxLoudness) failures.push('productFxLoudness section is missing from the level calibration contract');
  else checkProductFxLoudness(productFxLoudness.measurement, contract.productFxLoudness, failures);
  calibration = runCalibration();
  const fixture = calibration.fixture;
  if (fixture.schema !== 'kessho-product-level-calibration-v1') failures.push(`unexpected fixture schema ${fixture.schema}`);
  if (fixture.sample_rate !== contract.sampleRate || fixture.block_size !== contract.blockSize) {
    failures.push(`fixture format ${fixture.sample_rate}/${fixture.block_size} does not match contract ${contract.sampleRate}/${contract.blockSize}`);
  }
  if (fixture.source_tolerance_db !== contract.sourceToleranceDb || fixture.fx_structural_tolerance_db !== contract.fxStructuralToleranceDb) {
    failures.push('fixture-declared tolerances do not match the checked-in contract');
  }
  if (fixture.pre_limiter_peak_ceiling !== contract.preLimiterPeakCeiling ||
      fixture.limiter_inactivity_epsilon_db !== contract.limiterInactivityEpsilonDb) {
    failures.push('fixture-declared headroom thresholds do not match the checked-in contract');
  }
  checkRms(fixture, contract.sourceRms, contract.sourceToleranceDb, 'source', failures);
  checkRms(fixture, contract.fxRms, contract.fxStructuralToleranceDb, 'FX structural', failures);
  checkLufs(fixture, contract.fxLoudness?.lufs, contract.fxLoudness?.toleranceLufs ?? 1, 'FX loudness', failures);
  checkSourceLoudness(fixture, contract.sourceLoudness, failures);
  const fixtureHashes = hashes(fixture);
  const repeatHashes = hashes(calibration.repeat);
  for (const [path, hash] of Object.entries(fixtureHashes)) {
    if (typeof hash !== 'string' || typeof repeatHashes[path] !== 'string') {
      failures.push(`determinism hash missing for ${path}`);
      continue;
    }
    if (repeatHashes[path] !== hash) failures.push(`determinism hash changed for ${path}`);
  }
  const headroom = fixture.headroom;
  if (!Number.isFinite(headroom.pre_limiter.peak) || headroom.pre_limiter.peak > contract.preLimiterPeakCeiling) {
    failures.push(`headroom pre-limiter peak ${headroom.pre_limiter.peak} exceeds ${contract.preLimiterPeakCeiling}`);
  }
  if (!Number.isFinite(headroom.max_limiter_gain_reduction_db) || headroom.max_limiter_gain_reduction_db > contract.limiterInactivityEpsilonDb) {
    failures.push(`headroom limiter reduction ${headroom.max_limiter_gain_reduction_db} dB exceeds ${contract.limiterInactivityEpsilonDb} dB epsilon`);
  }
  if (!Number.isFinite(fixture.drums.pre_limiter.peak) || fixture.drums.pre_limiter.peak > contract.preLimiterPeakCeiling) {
    failures.push(`drum nominal pre-limiter peak ${fixture.drums.pre_limiter.peak} (RMS ${fixture.drums.pre_limiter.rms}, limiter GR ${fixture.drums.max_limiter_gain_reduction_db} dB) exceeds ${contract.preLimiterPeakCeiling}`);
  }
  if (!Number.isFinite(fixture.drums.max_limiter_gain_reduction_db) || fixture.drums.max_limiter_gain_reduction_db > contract.limiterInactivityEpsilonDb) {
    failures.push(`drum limiter reduction ${fixture.drums.max_limiter_gain_reduction_db} dB exceeds ${contract.limiterInactivityEpsilonDb} dB epsilon`);
  }
  if (!Number.isFinite(fixture.earth.max_limiter_gain_reduction_db) || fixture.earth.max_limiter_gain_reduction_db > contract.limiterInactivityEpsilonDb) {
    failures.push(`Earth limiter reduction ${fixture.earth.max_limiter_gain_reduction_db} dB exceeds ${contract.limiterInactivityEpsilonDb} dB epsilon`);
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

const report = {
  schema: 'kessho-product-level-calibration-report-v1',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  contract: contract ?? null,
  fixture: calibration?.fixture ?? null,
  repeatFixture: calibration?.repeat ?? null,
  sampleAssetLoudness: sampleAsset ? {
    reportPath: 'docs/reports/kessho-product-sample-asset-loudness-latest.json',
    schema: sampleAsset.report.schema,
    corpus: sampleAsset.report.corpus,
    measurement: sampleAsset.report.measurement,
    focus: sampleAsset.report.focus,
    generatedLibraryMedianActiveRmsDbfs: sampleAsset.report.statistics?.allGeneratedLibraries?.activeRmsDbfs?.median ?? null,
  } : null,
  productFxLoudness: productFxLoudness ? {
    schema: productFxLoudness.measurement.schema,
    sample_rate: productFxLoudness.measurement.sample_rate,
    block_size: productFxLoudness.measurement.block_size,
    fixtures: productFxLoudness.measurement.fixtures.map(
      ({ name, input_lufs, output_lufs, delta_lu, tail_lufs }) =>
        ({ name, input_lufs, output_lufs, delta_lu, tail_lufs })),
  } : null,
  deterministicHashes: calibration ? hashes(calibration.fixture) : null,
  commands: {
    calibration: calibrationDisplayCommand,
    sampleAssetLoudness: sampleAssetDisplayCommand,
    productFxLoudness: productFxLoudnessDisplayCommand,
    repeat: repeatDisplayCommand,
  },
  failures,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const fixture = report.fixture;
const lines = [
  '# Kessho Product Level Calibration',
  '',
  `Status: **${report.status.toUpperCase()}**`,
  '',
  'Commands:',
  '',
  `- \`${calibrationDisplayCommand}\` (build + deterministic fixture)`,
  `- \`${sampleAssetDisplayCommand}\` (decode and measure all checked-in OGG assets; compact report: \`docs/reports/kessho-product-sample-asset-loudness-latest.json\`)`,
  `- \`${productFxLoudnessDisplayCommand}\` (Product FX loudness fixture set and delta-LU contract)`,
  `- \`${repeatDisplayCommand}\` (same binary, repeat/hash check)`,
  '- CI integration: `core:product:level-calibration` is a prerequisite in `scripts/run-kessho-product-ci.mjs`, reached by `.github/workflows/product-core-ci.yml` through `npm run core:product:ci:prereqs`.',
  '',
  'Thresholds:',
  '',
  `- Source RMS tolerance: ±${contract?.sourceToleranceDb ?? '?'} dB against the checked-in representative fixtures (Pad, Lead, fixed-asset Piano, two-bar drums, and Soundscape/Earth).`,
  `- FX structural tolerance: ±${contract?.fxStructuralToleranceDb ?? '?'} dB for the measured fixed-input Delay A/B, Granular, and Reverb branches; focused FX routing tests cover the other nodes.`,
  `- Product FX loudness delta tolerance: ±${contract?.productFxLoudness?.deltaLuTolerance ?? '?'} LU; spectral differences are intentionally not compared across engines.`,
  `- Source loudness tolerance: ±${contract?.sourceLoudness?.toleranceLufs ?? '?'} LU; Earth uses the explicit active_window_ungated mode.`,
  `- Pre-limiter peak ceiling: ${contract?.preLimiterPeakCeiling ?? '?'} linear; limiter inactivity epsilon: ${contract?.limiterInactivityEpsilonDb ?? '?'} dB.`,
  '- The two-bar drum fixture is nominal-level evidence: its pre-limiter peak and limiter reduction are checked independently, so a clipped/baseline-locked drum pattern cannot pass.',
  '- CPU regression is enforced by the adjacent `core:product:cpu` prerequisite in the same Product CI graph; this standalone level gate does not duplicate that compilation/run.',
  '',
];
if (fixture) {
  lines.push('| Fixture | RMS | Peak |');
  lines.push('| --- | ---: | ---: |');
  for (const source of fixture.sources) lines.push(`| ${source.name} | ${source.rms.toExponential(6)} | ${source.peak.toExponential(6)} |`);
  for (const path of ['drums.master', 'drums.dry', 'drums.pre_limiter', 'earth.master', 'earth.water_dry']) {
    const value = path.split('.').reduce((entry, part) => entry?.[part], fixture);
    lines.push(`| ${path} | ${value.rms.toExponential(6)} | ${value.peak.toExponential(6)} |`);
  }
  lines.push('', '| FX branch | RMS | Peak |', '| --- | ---: | ---: |');
  for (const [name, value] of Object.entries(fixture.fx)) lines.push(`| ${name} | ${value.rms.toExponential(6)} | ${value.peak.toExponential(6)} |`);
  if (productFxLoudness?.measurement?.fixtures) {
    lines.push('', '| Product FX loudness fixture | Delta LU | Output LUFS |', '| --- | ---: | ---: |');
    for (const value of productFxLoudness.measurement.fixtures) lines.push(`| ${value.name} | ${Number(value.delta_lu).toFixed(6)} | ${Number(value.output_lufs).toFixed(6)} |`);
  }
  if (contract?.sourceLoudness?.signals) {
    lines.push('', '| Source loudness fixture | LUFS | Mode |', '| --- | ---: | --- |');
    for (const path of Object.keys(contract.sourceLoudness.signals)) {
      const value = signalAt(fixture, path);
      lines.push(`| ${path} | ${Number(value?.lufs).toFixed(6)} | ${value?.lufs_mode ?? ''} |`);
    }
  }
  lines.push('', `Drum pre-limiter peak: ${fixture.drums.pre_limiter.peak.toExponential(6)}; drum limiter reduction: ${fixture.drums.max_limiter_gain_reduction_db.toFixed(6)} dB.`);
  lines.push(`Headroom pre-limiter peak: ${fixture.headroom.pre_limiter.peak.toExponential(6)}; limiter reduction: ${fixture.headroom.max_limiter_gain_reduction_db.toFixed(6)} dB.`);
}
if (failures.length > 0) lines.push('', 'Failures:', '', ...failures.map((failure) => `- ${failure}`));
writeFileSync(markdownPath, `${lines.join('\n')}\n`);

if (failures.length > 0) {
  console.error(`Kessho Product level calibration failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('Kessho Product level calibration passed (contract, deterministic hashes, headroom, limiter epsilon)');
