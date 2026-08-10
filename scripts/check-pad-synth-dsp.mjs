#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const output = path.join(os.tmpdir(), `kessho-pad-dsp-${process.pid}`);
const baselineReport = path.join(root, 'docs/reports/pad-synth-dsp-baseline-2026-08-09.md');
const compilerVersion = execFileSync('clang++', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim();
const cpuModel = os.cpus()[0]?.model || 'unknown';
console.log(`pad_cpu_meta platform=${process.platform} arch=${process.arch} cpu=${JSON.stringify(cpuModel)} compiler=${JSON.stringify(compilerVersion)} node=${process.version} sample_rate=48000 block_size=128`);
if (fs.existsSync(baselineReport)) {
  const report = fs.readFileSync(baselineReport, 'utf8');
  for (const marker of ['Run timestamp:', 'Host:', 'Compiler:', 'Native build:', 'git HEAD', 'Current', 'Underruns']) {
    if (!report.includes(marker)) throw new Error(`baseline report is missing required marker: ${marker}`);
  }
  if (!/\| Current \| (?:1|8|16) \|/.test(report) || !/\| git HEAD \| (?:1|8|16) \|/.test(report)) {
    throw new Error('baseline report is missing current/git-HEAD percentile rows');
  }
  const ratioStart = report.indexOf('Current CLEAN_BASIC p99 divided by git-HEAD p99 is');
  const ratioEnd = report.indexOf('Equivalently, git HEAD divided', ratioStart);
  const ratioSection = ratioStart >= 0 && ratioEnd > ratioStart ? report.slice(ratioStart, ratioEnd) : '';
  const ratios = [...ratioSection.matchAll(/`([^`]+)`/g)].map((match) => Number(match[1]));
  if (ratios.length !== 3 || ratios.some((ratio) => ratio <= 0 || ratio > 1.30)) {
    throw new Error('baseline report has invalid current-vs-HEAD p99 ratios');
  }
  console.log('pad_cpu_baseline_report=present stable_schema=ok');
  console.log(`pad_cpu_baseline_ratios current_over_head_p99=1:${ratios[0].toFixed(4)},8:${ratios[1].toFixed(4)},16:${ratios[2].toFixed(4)}`);
} else {
  throw new Error(`pad_cpu_baseline_report=missing path=${path.relative(root, baselineReport)}`);
}
const sourceFiles = [
  'wasm/pad/kessho_pad.cpp',
  'wasm/pad/kessho_pad.h',
  'wasm/pad/build.sh',
  'wasm/pad/build_pad.ps1',
  'public/worklets/pad-synth-wasm.worklet.js',
];
const source = sourceFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
if (/\b(?:osc_a2|oscA2|oscillatorA2|osc_a_octave|osc_b_octave|osc_a_detune|osc_b_detune)\b/i.test(source)) {
  throw new Error('removed A2/octave/detune oscillator symbols remain in the Pad runtime surface');
}
const cpp = fs.readFileSync(path.join(root, 'wasm/pad/kessho_pad.cpp'), 'utf8');
const oscillatorACalls = cpp.match(/generateOscillator\(voice\.osc_a/g) || [];
const oscillatorBCalls = cpp.match(/generateOscillator\(voice\.osc_b/g) || [];
if (oscillatorACalls.length !== 1 || oscillatorBCalls.length !== 1) {
  throw new Error(`expected one main Osc A/B evaluation, got A=${oscillatorACalls.length} B=${oscillatorBCalls.length}`);
}
const worklet = fs.readFileSync(path.join(root, 'public/worklets/pad-synth-wasm.worklet.js'), 'utf8');
const filterMaxMatch = worklet.match(/const FILTER_TYPE_MAX = (\d+);/);
if (!filterMaxMatch || Number(filterMaxMatch[1]) !== 4
    || !/filterType:\s*\[0,\s*FILTER_TYPE_MAX\]/.test(worklet)
    || !/pad2FilterType:\s*\[0,\s*FILTER_TYPE_MAX\]/.test(worklet)
    || !/ladderLP:\s*FILTER_TYPE_MAX/.test(worklet)) {
  throw new Error('Pad 1/Pad 2 filter type mapping is not parity-safe through ladder LP (4)');
}
const maxNoteOffMatch = worklet.match(/const MAX_SCHEDULED_NOTE_OFFS = (\d+);/);
if (!maxNoteOffMatch) throw new Error('scheduled note-off capacity is not statically declared');
const maxScheduledNoteOffs = Number(maxNoteOffMatch[1]);
const advanceStart = worklet.indexOf('advanceScheduledNoteOffs(frames)');
const processStart = worklet.indexOf('process(_inputs, outputs, _params)');
if (advanceStart < 0 || processStart <= advanceStart) throw new Error('scheduled note-off process path is missing');
const advanceSource = worklet.slice(advanceStart, processStart);
if (/pendingNoteOffs|\.filter\(|\.push\(|\bnew\s+/.test(advanceSource)) {
  throw new Error('scheduled note-off process path allocates or rebuilds a collection');
}
if (!worklet.includes('pendingNoteOffActive') || !worklet.includes('pendingNoteOffSamples')) {
  throw new Error('scheduled note-off process path is not backed by fixed typed arrays');
}
const processEnd = worklet.indexOf('\n  }\n}\n\nregisterProcessor', processStart);
if (processEnd <= processStart) throw new Error('process callback boundary is not statically discoverable');
const processSource = worklet.slice(processStart, processEnd);
if (/\bnew\s+|postMessage\s*\(\s*\{|\b(?:const|let|var)\s+\w+\s*=\s*[\[{]/.test(processSource)) {
  throw new Error('process callback contains a heap allocation (new/object/array literal)');
}
// Deterministic held-note stress model: every voice is repeatedly re-held and
// retired in blocks. The fixed-slot contract must never grow or underflow.
const active = new Uint8Array(maxScheduledNoteOffs);
const samples = new Int32Array(maxScheduledNoteOffs);
let activeCount = 0;
let retired = 0;
for (let cycle = 0; cycle < 512; cycle += 1) {
  for (let voice = 0; voice < maxScheduledNoteOffs; voice += 1) {
    if ((cycle + voice) % 3 !== 0) continue;
    if (!active[voice]) { active[voice] = 1; activeCount += 1; }
    samples[voice] = 128 + ((cycle * 17 + voice * 31) % 4096);
  }
  for (let voice = 0; voice < maxScheduledNoteOffs; voice += 1) {
    if (!active[voice]) continue;
    samples[voice] -= 128;
    if (samples[voice] <= 0) { active[voice] = 0; activeCount -= 1; retired += 1; }
  }
  let counted = 0;
  for (const slot of active) counted += slot;
  if (counted !== activeCount || activeCount < 0 || activeCount > maxScheduledNoteOffs) {
    throw new Error(`held-note stress count invariant failed at cycle ${cycle}`);
  }
}
if (retired === 0) throw new Error('held-note stress did not retire any scheduled note-offs');
console.log(`pad_worklet note_off_slots=${maxScheduledNoteOffs} held_note_stress=ok retired=${retired}`);
const args = [
  '-std=c++17', '-O2', '-Iwasm/pad', '-Iwasm/common',
  'wasm/pad/kessho_pad.cpp', 'wasm/pad/tests/pad_dsp_safety.cpp', '-o', output,
];
try {
  execFileSync('clang++', args, { cwd: root, stdio: 'inherit' });
  execFileSync(output, [], { cwd: root, stdio: 'inherit' });
} finally {
  try { fs.unlinkSync(output); } catch {}
}
