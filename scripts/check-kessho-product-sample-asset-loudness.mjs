#!/usr/bin/env node

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const samplesRoot = path.join(publicRoot, 'samples');
const reportPath = path.join(root, 'docs', 'reports', 'kessho-product-sample-asset-loudness-latest.json');
const config = Object.freeze({
  sampleRate: 48000,
  loudnessWindowFrames: 19200,
  loudnessHopFrames: 4800,
  activeThresholdDbfs: -60,
  loudnessOffsetLufs: -0.691,
  absoluteGateLufs: -70,
  relativeGateOffsetLu: -10,
});
const natureCatalog = Object.freeze({
  'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg': { id: 'ghetary-waves', assetId: 7101, key: 'ocean', name: 'Waves Ghetary', legacyLevel: 1 },
  'Alps Birds 2_noiseremoval_441_m.ogg': { id: 'birds-alps', assetId: 7102, key: 'birds', name: 'Birds Alps', legacyLevel: 0.6 },
  'Fujian Birds 2_441_m_normalized.ogg': { id: 'birds-fujian', assetId: 7105, key: 'birds2', name: 'Birds Fujian', legacyLevel: 0.52 },
  'Fujian_Frogs_m_441_normalized.ogg': { id: 'frogs-fujian', assetId: 7103, key: 'frogs', name: 'Frogs Fujian', legacyLevel: 0.5 },
  'Ghetary-Waves-Rocks_cl-normalized.ogg': { id: 'legacy-water', assetId: 7104, key: 'water', name: 'Waves Ghetary (legacy water)', legacyLevel: 1 },
  'Alps Birds_441_m_normalized.ogg': { id: 'legacy-insects', assetId: 7106, key: 'insects', name: 'Birds Alps (legacy insects)', legacyLevel: 1 },
});

const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const round = (value, digits = 5) => Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;

async function walk(directory) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function classify(paths) {
  const byPath = new Map();
  const manifests = (await walk(samplesRoot)).filter((file) => path.basename(file) === 'manifest.json');
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const libraryKey = text(manifest.library?.key, path.basename(path.dirname(manifestPath)));
    const libraryName = text(manifest.library?.name, libraryKey);
    for (const sample of manifest.samples ?? []) {
      byPath.set(sample.path, {
        group: 'sample-library', libraryKey, libraryName,
        assetId: number(sample.assetId), sampleId: text(sample.key, sample.path), assetPath: sample.path,
        rootMidi: number(sample.rootMidi), role: text(sample.role, 'unspecified'),
        articulation: text(sample.articulation, 'unspecified'), dynamic: text(sample.dynamic, 'unspecified'),
      });
    }
  }
  for (const assetPath of paths) {
    if (byPath.has(assetPath)) continue;
    const nature = assetPath.includes('/') ? null : natureCatalog[assetPath];
    if (nature) {
      byPath.set(assetPath, {
        group: 'nature', libraryKey: 'nature-soundscape', libraryName: 'Nature / Soundscape',
        assetId: nature.assetId, sampleId: nature.id, assetPath, rootMidi: null,
        role: 'soundscape', articulation: nature.key, dynamic: 'continuous', nature,
      });
      continue;
    }
    const piano = assetPath.match(/^Piano\/piano(?: |_)(short_)?(\d{2})\.ogg$/);
    if (piano) {
      const variant = piano[1] ? 'short' : 'regular';
      const index = Number(piano[2]);
      byPath.set(assetPath, {
        group: 'sample-library', libraryKey: 'piano', libraryName: 'Legacy Keys',
        assetId: (variant === 'short' ? 7264 : 7200) + index,
        sampleId: `piano:${variant}:${20 + index}`, assetPath, rootMidi: 20 + index,
        role: variant, articulation: 'unspecified', dynamic: variant,
      });
    }
  }
  const missing = paths.filter((assetPath) => !byPath.has(assetPath));
  if (missing.length) throw new Error(`Unclassified OGGs (${missing.length}): ${missing.slice(0, 8).join(', ')}`);
  return paths.map((assetPath) => byPath.get(assetPath));
}

function staticServer() {
  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>sample asset loudness</title>');
      return;
    }
    const relative = pathname.replace(/^\/+/, '');
    const absolute = path.resolve(publicRoot, relative);
    if (absolute !== publicRoot && !absolute.startsWith(`${publicRoot}${path.sep}`)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      response.writeHead(200, { 'Content-Type': 'audio/ogg', 'Cache-Control': 'no-store' });
      response.end(await readFile(absolute));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
}

function browserMeasurementSource() {
  const factory = function (cfg) {
    const shelf = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585];
    const rlb = [1, -2, 1, -1.99004745483398, 0.990072250366005];
    const filter = (input, state, coefficients) => {
      const output = coefficients[0] * input + state.z1;
      state.z1 = coefficients[1] * input - coefficients[3] * output + state.z2;
      state.z2 = coefficients[2] * input - coefficients[4] * output;
      return output;
    };
    const lufs = (energy) => energy > 0 ? cfg.loudnessOffsetLufs + 10 * Math.log10(energy) : -Infinity;
    return async function measure(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      const context = globalThis.__sampleAssetLoudnessContext ??= new OfflineAudioContext(2, 1, cfg.sampleRate);
      const decoded = await context.decodeAudioData(bytes);
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
      let peak = 0;
      for (let frame = 0; frame < decoded.length; frame += 1) {
        for (const channel of channels) peak = Math.max(peak, Math.abs(channel[frame]));
      }
      const threshold = Math.max(1e-5, peak * (10 ** (cfg.activeThresholdDbfs / 20)));
      let activeBegin = decoded.length;
      let activeEnd = 0;
      for (let frame = 0; frame < decoded.length; frame += 1) {
        let framePeak = 0;
        for (const channel of channels) framePeak = Math.max(framePeak, Math.abs(channel[frame]));
        if (framePeak >= threshold) {
          activeBegin = Math.min(activeBegin, frame);
          activeEnd = frame + 1;
        }
      }
      if (activeBegin === decoded.length) activeBegin = activeEnd = 0;
      const activeFrames = activeEnd - activeBegin;
      let activeEnergy = 0;
      for (let frame = activeBegin; frame < activeEnd; frame += 1) {
        for (const channel of channels) activeEnergy += channel[frame] ** 2;
      }
      const activeRms = activeFrames && channels.length ? Math.sqrt(activeEnergy / (activeFrames * channels.length)) : 0;

      const states = channels.map(() => ({ shelf: { z1: 0, z2: 0 }, rlb: { z1: 0, z2: 0 } }));
      const ring = new Float64Array(cfg.loudnessWindowFrames);
      const blocks = [];
      let ringSum = 0;
      for (let frame = 0; frame < decoded.length; frame += 1) {
        let weightedEnergy = 0;
        for (let index = 0; index < channels.length; index += 1) {
          const state = states[index];
          weightedEnergy += filter(filter(channels[index][frame], state.shelf, shelf), state.rlb, rlb) ** 2;
        }
        if (frame < activeBegin || frame >= activeEnd) continue;
        const offset = frame - activeBegin;
        const ringIndex = offset % cfg.loudnessWindowFrames;
        if (offset >= cfg.loudnessWindowFrames) ringSum -= ring[ringIndex];
        ring[ringIndex] = weightedEnergy;
        ringSum += weightedEnergy;
        const length = offset + 1;
        if (length >= cfg.loudnessWindowFrames && (length - cfg.loudnessWindowFrames) % cfg.loudnessHopFrames === 0) {
          blocks.push(ringSum / cfg.loudnessWindowFrames);
        }
      }
      const ungated = blocks.length ? lufs(blocks.reduce((sum, energy) => sum + energy, 0) / blocks.length) : -Infinity;
      const absolute = blocks.filter((energy) => lufs(energy) > cfg.absoluteGateLufs);
      const absoluteLufs = absolute.length ? lufs(absolute.reduce((sum, energy) => sum + energy, 0) / absolute.length) : -Infinity;
      const relativeGate = absoluteLufs + cfg.relativeGateOffsetLu;
      const relative = absolute.filter((energy) => lufs(energy) > relativeGate);
      const integrated = relative.length ? lufs(relative.reduce((sum, energy) => sum + energy, 0) / relative.length) : -Infinity;
      return {
        sampleRate: decoded.sampleRate,
        channelCount: decoded.numberOfChannels,
        frames: decoded.length,
        durationSeconds: decoded.duration,
        activeBegin, activeEnd, activeFrames, activeDurationSeconds: activeFrames / decoded.sampleRate,
        activeRms, peak, activeThreshold: threshold,
        analyzedBlocks: blocks.length, absoluteGatedBlocks: absolute.length, relativeGatedBlocks: relative.length,
        ungatedLufs: ungated, absoluteGatedLufs: absoluteLufs, relativeGateLufs: relativeGate, integratedLufs: integrated,
      };
    };
  };
  return `(${factory.toString()})(${JSON.stringify(config)})`;
}

async function decodeRows(rows, serverPort) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const output = [];
  const errors = [];
  try {
    const base = `http://127.0.0.1:${serverPort}`;
    await page.goto(`${base}/`);
    await page.evaluate((source) => { globalThis.__sampleAssetLoudnessMeasure = eval(source); }, browserMeasurementSource());
    const size = 16;
    for (let offset = 0; offset < rows.length; offset += size) {
      const chunk = rows.slice(offset, offset + size);
      const measured = await page.evaluate(async (items) => Promise.all(items.map(async (item) => {
        try {
          const url = '/samples/' + item.assetPath.split('/').map(encodeURIComponent).join('/');
          return { assetPath: item.assetPath, metrics: await globalThis.__sampleAssetLoudnessMeasure(url) };
        } catch (error) {
          return { assetPath: item.assetPath, error: error instanceof Error ? error.message : String(error) };
        }
      })), chunk);
      for (const result of measured) {
        const row = rows.find((candidate) => candidate.assetPath === result.assetPath);
        if (result.error) {
          errors.push({ assetPath: result.assetPath, error: result.error });
          output.push({ ...row, decodeError: result.error });
        } else output.push({ ...row, ...result.metrics });
      }
      process.stdout.write(`Measured ${Math.min(offset + chunk.length, rows.length)}/${rows.length}\n`);
    }
    return { rows: output, errors };
  } finally {
    await browser.close();
  }
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = (sorted.length - 1) * 0.5;
  const low = Math.floor(middle);
  return sorted[low] + (sorted[Math.ceil(middle)] - sorted[low]) * (middle - low);
}

function assetPathSha256(assetPaths) {
  // Hash the sorted relative paths exactly as newline-joined text, without a
  // trailing newline, so corpus membership is portable and deterministic.
  return createHash('sha256').update(assetPaths.join('\n'), 'utf8').digest('hex');
}

function metricStats(rows) {
  const active = rows.map((row) => row.activeRms > 0 ? 20 * Math.log10(row.activeRms) : null).filter(Number.isFinite);
  const loudness = rows.map((row) => row.integratedLufs).filter(Number.isFinite);
  const peaks = rows.map((row) => row.peak > 0 ? 20 * Math.log10(row.peak) : null).filter(Number.isFinite);
  return {
    assets: rows.length,
    integratedLufs: { count: loudness.length, median: round(median(loudness)), p10: round(median(loudness.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(loudness.length * 0.1))))) },
    activeRmsDbfs: { count: active.length, median: round(median(active)), p10: round(median(active.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(active.length * 0.1))))), p90: round(median(active.slice().sort((a, b) => a - b).slice(Math.floor(active.length * 0.9)))) },
    samplePeakDbfs: { count: peaks.length, median: round(median(peaks)), p10: round(median(peaks.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(peaks.length * 0.1))))), p90: round(median(peaks.slice().sort((a, b) => a - b).slice(Math.floor(peaks.length * 0.9)))) },
    completeLufsBlockAssets: rows.filter((row) => row.analyzedBlocks > 0).length,
  };
}

function grouped(rows, key) {
  const result = {};
  for (const row of rows) (result[key(row)] ??= []).push(row);
  return Object.fromEntries(Object.keys(result).sort().map((name) => [name, metricStats(result[name])]));
}

function gainGroups(rows, target, key) {
  const groups = {};
  for (const row of rows) (groups[key(row)] ??= []).push(row);
  return Object.fromEntries(Object.keys(groups).sort().map((name) => {
    const values = groups[name].map((row) => row.activeRms > 0 ? 20 * Math.log10(row.activeRms) : null);
    const value = median(values);
    const delta = value === null || target === null ? null : target - value;
    const absolute = values.filter(Number.isFinite).map((item) => Math.abs(item - value));
    const mad = median(absolute);
    const measurementStable = groups[name].length >= 3 && Number.isFinite(delta) && Math.abs(delta) >= 3 && mad <= 2.5;
    return [name, {
      assets: groups[name].length,
      medianActiveRmsDbfs: round(value),
      madDb: round(mad),
      proposedGainDeltaDb: round(delta),
      measurementStable,
      recommendation: measurementStable
        ? (delta < 0 ? 'measurement-only; manual-review trim candidate' : 'measurement-only; manual-review boost candidate')
        : 'measurement-only; no manual-review candidate',
    }];
  }));
}

function natureAdvice(rows, effectiveTargetLufs) {
  return rows.filter((row) => row.nature && row.nature.assetId !== 7104 && row.nature.assetId !== 7106).map((row) => {
    const rawLufs = row.integratedLufs;
    const legacyLevel = row.nature.legacyLevel;
    const existingEffectiveLufs = Number.isFinite(rawLufs) && legacyLevel > 0
      ? rawLufs + 20 * Math.log10(legacyLevel)
      : null;
    const lufsDelta = Number.isFinite(rawLufs) && Number.isFinite(effectiveTargetLufs)
      ? effectiveTargetLufs - rawLufs
      : null;
    const requiredLevel = lufsDelta === null ? null : 10 ** (lufsDelta / 20);
    const adjustedLevel = requiredLevel === null ? null : Math.max(0, Math.min(2, requiredLevel));
    const adjustedEffectiveLufs = Number.isFinite(rawLufs) && adjustedLevel > 0
      ? rawLufs + 20 * Math.log10(adjustedLevel)
      : null;
    return {
      id: row.nature.id, displayName: row.nature.name, assetId: row.assetId, assetPath: row.assetPath,
      rawIntegratedLufs: round(rawLufs),
      activeRmsDbfs: round(row.activeRms > 0 ? 20 * Math.log10(row.activeRms) : null),
      legacyAssetRefLevel: legacyLevel,
      existingEffectiveIntegratedLufs: round(existingEffectiveLufs),
      natureEffectiveTargetIntegratedLufs: round(effectiveTargetLufs),
      requiredAssetRefLevelForTarget: round(requiredLevel),
      adjustedAssetRefLevel: round(adjustedLevel),
      adjustedEffectiveIntegratedLufs: round(adjustedEffectiveLufs),
      assetRefLevelBounds: [0, 2],
      withinAssetRefLevelRange: requiredLevel !== null && requiredLevel <= 2,
      recommendation: 'measurement-only; manual review required; preserve dynamic-layer intent',
    };
  });
}

function assetOutput(row) {
  return {
    libraryKey: row.libraryKey, libraryName: row.libraryName, group: row.group, assetId: row.assetId,
    sampleId: row.sampleId, assetPath: row.assetPath, rootMidi: row.rootMidi, role: row.role,
    articulation: row.articulation, dynamic: row.dynamic, natureCatalogId: row.nature?.id ?? null,
    sampleRate: row.sampleRate ?? null, channelCount: row.channelCount ?? null, frames: row.frames ?? null,
    durationSeconds: round(row.durationSeconds), activeBegin: row.activeBegin ?? null, activeEnd: row.activeEnd ?? null,
    activeFrames: row.activeFrames ?? null, activeDurationSeconds: round(row.activeDurationSeconds), activeRms: round(row.activeRms),
    activeRmsDbfs: round(row.activeRms > 0 ? 20 * Math.log10(row.activeRms) : null), samplePeak: round(row.peak),
    samplePeakDbfs: round(row.peak > 0 ? 20 * Math.log10(row.peak) : null), analyzedBlocks: row.analyzedBlocks ?? null,
    absoluteGatedBlocks: row.absoluteGatedBlocks ?? null, relativeGatedBlocks: row.relativeGatedBlocks ?? null,
    ungatedLufs: round(row.ungatedLufs), absoluteGatedLufs: round(row.absoluteGatedLufs), relativeGateLufs: round(row.relativeGateLufs),
    integratedLufs: round(row.integratedLufs), decodeError: row.decodeError ?? null,
  };
}

async function main() {
  const assetPaths = (await walk(samplesRoot)).filter((file) => file.toLowerCase().endsWith('.ogg'))
    .map((file) => path.relative(samplesRoot, file).split(path.sep).join('/')).sort();
  const assetPathDigest = assetPathSha256(assetPaths);
  const classified = await classify(assetPaths);
  const server = staticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const measured = await decodeRows(classified, port);
  await new Promise((resolve) => server.close(resolve));

  const rows = measured.rows;
  const generated = rows.filter((row) => row.group === 'sample-library');
  const nature = rows.filter((row) => row.group === 'nature');
  const activeValue = (row) => row.activeRms > 0 ? 20 * Math.log10(row.activeRms) : null;
  const generatedTarget = median(generated.map(activeValue));
  const catalogNature = nature.filter((row) => row.nature && row.nature.assetId !== 7104 && row.nature.assetId !== 7106);
  const effectiveNatureLufs = (row) => row.nature?.legacyLevel > 0 && Number.isFinite(row.integratedLufs)
    ? row.integratedLufs + 20 * Math.log10(row.nature.legacyLevel)
    : null;
  const natureEffectiveTarget = median(catalogNature.map(effectiveNatureLufs));
  const libraryGains = gainGroups(generated, generatedTarget, (row) => row.libraryKey);
  const classGains = gainGroups(generated, generatedTarget, (row) => `${row.libraryKey}::${row.role}::${row.articulation}::${row.dynamic}`);
  const libraryDynamicGains = gainGroups(generated, generatedTarget, (row) => `${row.libraryKey}::${row.dynamic}`);
  const manualReviewCandidates = (groups) => Object.values(groups).filter((item) => item.measurementStable).length;
  const report = {
    schema: 'kessho-sample-asset-loudness-v1',
    corpus: { root: 'public/samples', discoveredUniqueOggCount: assetPaths.length, oggAssetPathSha256: assetPathDigest },
    measurement: { decoder: 'Playwright Chromium OfflineAudioContext.decodeAudioData', decodedSampleRate: config.sampleRate, decodedAssetCount: rows.filter((row) => !row.decodeError).length, decodeErrorCount: measured.errors.length, decodedAllAssets: measured.errors.length === 0 && rows.length === assetPaths.length, activeWindow: `frames from first to last sample at or above ${config.activeThresholdDbfs} dBFS relative to each asset peak (with absolute floor)`, activeRms: 'channel-averaged RMS over active window', samplePeak: 'maximum absolute decoded PCM sample', integratedLufs: '48 kHz BS.1770-style K-weighting; 400 ms blocks/100 ms hops; -70 LUFS absolute and -10 LU relative gates', shortAssetPolicy: 'integratedLufs is null when no complete 400 ms block exists; RMS/peak remain available' },
    focus: { natureEffectiveTargetIntegratedLufs: round(natureEffectiveTarget), catalogNatureAssets: natureAdvice(nature, natureEffectiveTarget), otherSoundscapeAssets: nature.filter((row) => row.nature && row.nature.assetId !== 7101 && row.nature.assetId !== 7102 && row.nature.assetId !== 7103 && row.nature.assetId !== 7105).map(assetOutput) },
    statistics: { allGeneratedLibraries: metricStats(generated), allCatalogNature: metricStats(catalogNature), libraries: Object.fromEntries(Object.keys(grouped(generated, (row) => row.libraryKey)).sort().map((key) => [key, { ...grouped(generated.filter((row) => row.libraryKey === key), (row) => row.libraryKey)[key], articulations: grouped(generated.filter((row) => row.libraryKey === key), (row) => row.articulation), dynamics: grouped(generated.filter((row) => row.libraryKey === key), (row) => row.dynamic) }])), articulations: grouped(generated, (row) => row.articulation), dynamics: grouped(generated, (row) => row.dynamic) },
    proposedGainDeltas: { basis: 'activeRmsDbfs medians; positive means boost, negative means trim', generatedLibraryTargetActiveRmsDbfs: round(generatedTarget), byLibrary: libraryGains, byLibraryDynamic: libraryDynamicGains, byClass: classGains, decision: { automaticRuntimeAction: 'none', reviewOnly: true, manualReviewLibraryCandidateCount: manualReviewCandidates(libraryGains), manualReviewDynamicCandidateCount: manualReviewCandidates(libraryDynamicGains), manualReviewClassCandidateCount: manualReviewCandidates(classGains), preserveDynamicLayerIntent: true, rule: 'A measurement-stable delta is only a manual-review candidate: >=3 dB magnitude, >=3 assets, and <=2.5 dB MAD. No runtime trim/boost is automatically justified.' } },
    errors: measured.errors,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, reportPath)} (${rows.length} assets, ${measured.errors.length} decode errors).`);
  if (measured.errors.length) process.exitCode = 1;
}

await main();
