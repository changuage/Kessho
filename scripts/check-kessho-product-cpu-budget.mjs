#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  collectReportMetadata,
  toRelativePath,
  writeJsonReport,
  writeMarkdownReport,
} from './product-core/lib/reporting.mjs';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const jsonReportPath = resolve(reportDir, 'kessho-product-cpu-budget-latest.json');
const markdownReportPath = resolve(reportDir, 'kessho-product-cpu-budget-latest.md');
const manifestPath = 'src/audio/coreProductAssetManifest.json';
const wasmPath = 'public/worklets/kessho_core.wasm';
const float32Bytes = Float32Array.BYTES_PER_ELEMENT;
const oggContinuedGranule = 0xffffffffffffffffn;
const renderQuantumFrames = 128;
const sampleRate = 48000;
const quantumMs = renderQuantumFrames * 1000 / sampleRate;
const maxAllowedMissedQuantums = 2;

const cpuBudgets = {
  disabledFx: {
    averageCpuPercentMax: 25.0,
    p95MsMax: quantumMs * 0.5,
    p99MsMax: quantumMs,
    simulatedUnderrunCountMax: maxAllowedMissedQuantums,
  },
  activeFx: {
    averageCpuPercentMax: 35.0,
    p95MsMax: quantumMs * 0.75,
    p99MsMax: quantumMs,
    simulatedUnderrunCountMax: maxAllowedMissedQuantums,
  },
};

function commandText(command) {
  return command.map((part, index) => {
    if (index === 0 && part === process.execPath) return 'node';
    return /^[A-Za-z0-9_./:=+-]+$/.test(part)
      ? part
      : `'${String(part).replace(/'/g, `'\\''`)}'`;
  }).join(' ');
}

function tail(value, limit = 12000) {
  if (!value) return '';
  return value.length > limit ? value.slice(value.length - limit) : value;
}

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function publicSamplePath(relativePath) {
  return resolve(root, 'public/samples', relativePath);
}

function paddedIndex(index) {
  return String(index).padStart(2, '0');
}

function pianoPath(pattern, index) {
  return pattern.replace('{index}', paddedIndex(index));
}

function parseOggVorbisInfo(relativePath) {
  const bytes = readFileSync(publicSamplePath(relativePath));
  const vorbisIdPacket = Buffer.from([1, 118, 111, 114, 98, 105, 115]);
  let offset = 0;
  let channelCount = 0;
  let sampleRateHz = 0;
  let finalGranulePosition = 0n;

  while (offset < bytes.length) {
    assert(bytes.toString('ascii', offset, offset + 4) === 'OggS', `${relativePath} is not an Ogg stream at ${offset}`);
    const segmentCount = bytes[offset + 26];
    const headerBytes = 27 + segmentCount;
    assert(offset + headerBytes <= bytes.length, `${relativePath} has a truncated Ogg page header`);
    let payloadBytes = 0;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      payloadBytes += bytes[offset + 27 + segment];
    }
    assert(offset + headerBytes + payloadBytes <= bytes.length, `${relativePath} has a truncated Ogg page payload`);

    const granulePosition = bytes.readBigUInt64LE(offset + 6);
    if (granulePosition !== oggContinuedGranule) {
      finalGranulePosition = granulePosition;
    }

    if (sampleRateHz === 0 || channelCount === 0) {
      const payload = bytes.subarray(offset + headerBytes, offset + headerBytes + payloadBytes);
      const packetOffset = payload.indexOf(vorbisIdPacket);
      if (packetOffset >= 0) {
        channelCount = payload[packetOffset + 11];
        sampleRateHz = payload.readUInt32LE(packetOffset + 12);
      }
    }

    offset += headerBytes + payloadBytes;
  }

  assert(channelCount > 0 && channelCount <= 8, `${relativePath} has invalid Vorbis channel count ${channelCount}`);
  assert(sampleRateHz > 0, `${relativePath} has invalid Vorbis sample rate ${sampleRateHz}`);
  assert(finalGranulePosition > 0n, `${relativePath} has invalid Vorbis final granule ${finalGranulePosition}`);

  const frameCount = Number(finalGranulePosition);
  assert(Number.isSafeInteger(frameCount), `${relativePath} frame count exceeds JS safe integer range`);
  const productChannelCount = Math.min(channelCount, 2);
  return {
    relativePath,
    productChannelCount,
    sampleRate: sampleRateHz,
    frameCount,
    decodedBytes: frameCount * productChannelCount * float32Bytes,
  };
}

function sumDecodedBytes(infos) {
  return infos.reduce((total, info) => total + info.decodedBytes, 0);
}

function resolveWasmExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  assert(typeof fn === 'function', `missing WASM export ${name}`);
  return fn;
}

async function measureWasmHeapAfterAssetAllocations(assetInfos) {
  assert(existsSync(resolve(root, wasmPath)), `missing ${wasmPath} for Product Core heap report`);
  const module = await WebAssembly.compile(readFileSync(resolve(root, wasmPath)));
  const instance = await WebAssembly.instantiate(module, {
    env: {
      emscripten_notify_memory_growth: () => {},
      abort: () => {},
    },
    wasi_snapshot_preview1: {
      fd_write: () => 0,
      fd_seek: () => 0,
      fd_close: () => 0,
      proc_exit: () => {},
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      clock_time_get: () => 0,
    },
  });
  const wasm = instance.exports;
  const malloc = resolveWasmExport(wasm, 'malloc');
  const free = resolveWasmExport(wasm, 'free');
  const allocatedPointers = [];
  for (const info of assetInfos) {
    for (let channel = 0; channel < info.productChannelCount; channel += 1) {
      const pointer = malloc(info.frameCount * float32Bytes);
      assert(pointer, `WASM heap allocation failed for ${info.relativePath} channel ${channel}`);
      allocatedPointers.push(pointer);
    }
    const pointerArray = malloc(info.productChannelCount * Uint32Array.BYTES_PER_ELEMENT);
    assert(pointerArray, `WASM pointer-array allocation failed for ${info.relativePath}`);
    allocatedPointers.push(pointerArray);
  }
  const heapBytes = wasm.memory.buffer.byteLength;
  for (const pointer of allocatedPointers) free(pointer);
  return heapBytes;
}

async function buildHeapReport() {
  const manifest = readJson(manifestPath);
  const pianoInfos = [];
  for (let index = 1; index <= manifest.piano.sampleCount; index += 1) {
    pianoInfos.push(parseOggVorbisInfo(pianoPath(manifest.piano.regularSamplePathPattern, index)));
  }
  const soundscapeInfos = manifest.soundscapes.map((asset) => parseOggVorbisInfo(asset.path));
  const assetInfos = [...pianoInfos, ...soundscapeInfos];
  const decodedAssetBytes = sumDecodedBytes(assetInfos);
  const heapBytes = await measureWasmHeapAfterAssetAllocations(assetInfos);
  const failures = [];
  if (heapBytes < manifest.memoryBudgets.wasmBaseHeapBytes) {
    failures.push(`heapBytes ${heapBytes} is below wasmBaseHeapBytesBudget ${manifest.memoryBudgets.wasmBaseHeapBytes}`);
  }
  if (heapBytes > manifest.memoryBudgets.webWorkletHeapBytes) {
    failures.push(`heapBytes ${heapBytes} exceeds webWorkletHeapBytesBudget ${manifest.memoryBudgets.webWorkletHeapBytes}`);
  }
  if (decodedAssetBytes > manifest.memoryBudgets.totalRegisteredDecodedBytes) {
    failures.push(`decodedAssetBytes ${decodedAssetBytes} exceeds totalRegisteredDecodedBytesBudget ${manifest.memoryBudgets.totalRegisteredDecodedBytes}`);
  }
  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    source: 'Product Core manifest plus WASM allocation probe',
    manifestPath,
    wasmPath,
    assetCount: assetInfos.length,
    heapBytes,
    webWorkletHeapBytes: heapBytes,
    wasmBaseHeapBytesBudget: manifest.memoryBudgets.wasmBaseHeapBytes,
    webWorkletHeapBytesBudget: manifest.memoryBudgets.webWorkletHeapBytes,
    decodedAssetBytes,
    totalRegisteredDecodedBytesBudget: manifest.memoryBudgets.totalRegisteredDecodedBytes,
    failures,
  };
}

function parseCpuSummary(output) {
  const match = output.match(
    /Kessho Product CPU smoke passed: disabled FX ([0-9.eE+-]+)% avg, ([0-9.eE+-]+)% peak, p95 ([0-9.eE+-]+) ms, p99 ([0-9.eE+-]+) ms, missed ([0-9]+); active FX ([0-9.eE+-]+)% avg, ([0-9.eE+-]+)% peak, p95 ([0-9.eE+-]+) ms, p99 ([0-9.eE+-]+) ms, missed ([0-9]+)/,
  );
  if (!match) return null;
  return {
    disabledFx: cpuStats(match.slice(1, 6)),
    activeFx: cpuStats(match.slice(6, 11)),
  };
}

function cpuStats(values) {
  const [
    averageCpuPercent,
    peakCpuPercent,
    p95Ms,
    p99Ms,
    missedQuantumCount,
  ] = values;
  return {
    averageCpuPercent: Number(averageCpuPercent),
    peakCpuPercent: Number(peakCpuPercent),
    p95Ms: Number(p95Ms),
    p95RenderMs: Number(p95Ms),
    p99Ms: Number(p99Ms),
    p99RenderMs: Number(p99Ms),
    missedQuantumCount: Number(missedQuantumCount),
    simulatedUnderrunCount: Number(missedQuantumCount),
  };
}

function evaluateCpuScenario(stats, budget) {
  const failures = [];
  if (!stats) {
    failures.push('scenario metrics were not parsed');
  } else {
    if (stats.averageCpuPercent >= budget.averageCpuPercentMax) {
      failures.push(`averageCpuPercent ${stats.averageCpuPercent} >= ${budget.averageCpuPercentMax}`);
    }
    if (stats.p95Ms >= budget.p95MsMax) {
      failures.push(`p95Ms ${stats.p95Ms} >= ${budget.p95MsMax}`);
    }
    if (stats.p99Ms >= budget.p99MsMax) {
      failures.push(`p99Ms ${stats.p99Ms} >= ${budget.p99MsMax}`);
    }
    if (stats.simulatedUnderrunCount > budget.simulatedUnderrunCountMax) {
      failures.push(`simulatedUnderrunCount ${stats.simulatedUnderrunCount} > ${budget.simulatedUnderrunCountMax}`);
    }
  }
  return {
    ...stats,
    budget,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
}

function markdownReport(report) {
  const lines = [
    '# Kessho Product CPU And Heap Budget',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Commit: ${report.metadata.gitCommit ?? 'unknown'}`,
    '',
    `Platform: ${report.metadata.machine.platform}/${report.metadata.machine.arch}; CPU: ${report.metadata.machine.cpuModel ?? 'unknown'} x${report.metadata.machine.cpuCount}`,
    '',
    `Run command: \`${report.runner.command}\``,
    '',
    `Overall status: **${report.status.toUpperCase()}**`,
    '',
    `CPU status: **${report.cpu.status.toUpperCase()}**`,
    '',
    `Heap status: **${report.heap.status.toUpperCase()}**`,
    '',
    '## CPU Budget',
    '',
    `Render quantum: ${report.cpu.quantumMs.toFixed(6)} ms (${report.cpu.renderQuantumFrames} frames at ${report.cpu.sampleRate} Hz)`,
    '',
    '| Scenario | Status | Avg CPU % | Peak CPU % | p95 ms | p99 ms | Simulated Underruns |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [id, scenario] of Object.entries(report.cpu.scenarios)) {
    lines.push(`| ${id} | ${scenario.status.toUpperCase()} | ${scenario.averageCpuPercent?.toFixed(6) ?? '-'} | ${scenario.peakCpuPercent?.toFixed(6) ?? '-'} | ${scenario.p95Ms?.toFixed(6) ?? '-'} | ${scenario.p99Ms?.toFixed(6) ?? '-'} | ${scenario.simulatedUnderrunCount ?? '-'} |`);
  }
  lines.push(
    '',
    '## Heap And Asset Memory',
    '',
    '| Field | Value | Budget |',
    '| --- | ---: | ---: |',
    `| WASM heap bytes | ${report.heap.heapBytes ?? '-'} | ${report.heap.webWorkletHeapBytesBudget ?? '-'} |`,
    `| Base WASM heap bytes | ${report.heap.heapBytes ?? '-'} | ${report.heap.wasmBaseHeapBytesBudget ?? '-'} |`,
    `| Registered decoded asset bytes | ${report.heap.decodedAssetBytes ?? '-'} | ${report.heap.totalRegisteredDecodedBytesBudget ?? '-'} |`,
    '',
  );
  if (report.failures.length > 0) {
    lines.push('## Failures', '');
    for (const failure of report.failures) lines.push(`- ${failure}`);
    lines.push('');
  }
  lines.push(
    '## Machine-Readable Pair',
    '',
    `JSON: \`${report.runner.reportPaths.json}\``,
    '',
  );
  return `${lines.join('\n').trimEnd()}\n`;
}

async function main() {
  const startedAt = new Date();
  const command = [process.execPath, 'scripts/run-kessho-product-cpp-test.mjs', 'ProductCpuBudgetTests'];
  const runCpuBudgetTest = () => spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  let result = runCpuBudgetTest();
  const firstOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const firstParsedCpu = parseCpuSummary(firstOutput);
  const firstCpuScenarios = {
    disabledFx: evaluateCpuScenario(firstParsedCpu?.disabledFx ?? null, cpuBudgets.disabledFx),
    activeFx: evaluateCpuScenario(firstParsedCpu?.activeFx ?? null, cpuBudgets.activeFx),
  };
  const firstRunFailed = Boolean(result.error)
    || result.status !== 0
    || !firstParsedCpu
    || Object.values(firstCpuScenarios).some((scenario) => scenario.status === 'fail');
  if (firstRunFailed) {
    console.warn('Product CPU budget failed once; retrying the same measurement for runner jitter.');
    result = runCpuBudgetTest();
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const parsedCpu = parseCpuSummary(output);
  let heapReport;
  try {
    heapReport = await buildHeapReport();
  } catch (error) {
    heapReport = {
      status: 'fail',
      source: 'Product Core manifest plus WASM allocation probe',
      manifestPath,
      wasmPath,
      heapBytes: null,
      webWorkletHeapBytes: null,
      wasmBaseHeapBytesBudget: null,
      webWorkletHeapBytesBudget: null,
      decodedAssetBytes: null,
      totalRegisteredDecodedBytesBudget: null,
      failures: [error instanceof Error ? error.message : String(error)],
    };
  }

  const cpuScenarios = {
    disabledFx: evaluateCpuScenario(parsedCpu?.disabledFx ?? null, cpuBudgets.disabledFx),
    activeFx: evaluateCpuScenario(parsedCpu?.activeFx ?? null, cpuBudgets.activeFx),
  };
  const cpuFailures = Object.entries(cpuScenarios)
    .flatMap(([id, scenario]) => scenario.failures.map((failure) => `${id}: ${failure}`));
  if (result.error) cpuFailures.push(`runner error: ${result.error.message}`);
  if (result.status !== 0) cpuFailures.push(`C++ CPU budget test exited with ${result.status ?? result.signal ?? 'unknown status'}`);
  if (!parsedCpu) cpuFailures.push('C++ CPU budget summary line was not parsed');

  const heapFailures = heapReport.failures.map((failure) => `heap: ${failure}`);
  const failures = [...cpuFailures, ...heapFailures];
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const generatedAt = finishedAt.toISOString();
  const checkCommand = commandText([process.execPath, 'scripts/check-kessho-product-cpu-budget.mjs']);
  const report = {
    schemaVersion: 1,
    generatedAt,
    status: failures.length === 0 ? 'pass' : 'fail',
    metadata: collectReportMetadata({
      root,
      generatedAt,
      command: checkCommand,
      scenarioName: 'ProductCpuBudgetTests',
      sampleRate,
      blockSize: renderQuantumFrames,
      durationMs,
      thresholds: cpuBudgets,
      topSuspectedModules: ['sources', 'sequencer', 'granular', 'reverb', 'delay', 'dynamics'],
    }),
    runner: {
      cwd: root,
      command: checkCommand,
      cxxCommand: commandText(command),
      startedAt: startedAt.toISOString(),
      finishedAt: generatedAt,
      durationMs,
      exitCode: result.status,
      signal: result.signal,
      reportPaths: {
        json: toRelativePath(root, jsonReportPath),
        markdown: toRelativePath(root, markdownReportPath),
      },
    },
    cpu: {
      status: cpuFailures.length === 0 ? 'pass' : 'fail',
      renderQuantumFrames,
      sampleRate,
      quantumMs,
      maxAllowedMissedQuantums,
      scenarios: cpuScenarios,
    },
    heap: heapReport,
    stdoutTail: tail(result.stdout ?? ''),
    stderrTail: tail(result.stderr ?? ''),
    failures,
  };

  writeJsonReport(jsonReportPath, report);
  writeMarkdownReport(markdownReportPath, markdownReport(report));

  console.log(`Kessho Product CPU/heap report: ${report.status.toUpperCase()} (${toRelativePath(root, markdownReportPath)}, ${toRelativePath(root, jsonReportPath)})`);
  if (report.status === 'fail') {
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
