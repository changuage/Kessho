#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const jsonReportPath = resolve(reportDir, 'kessho-core-architecture-parity-latest.json');
const markdownReportPath = resolve(reportDir, 'kessho-core-architecture-parity-latest.md');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function has(source, token) {
  return source.includes(token);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function row({ id, area, status, priority, evidence, description, next }) {
  return {
    id,
    area,
    status,
    priority,
    evidence,
    description,
    next: next ?? '',
  };
}

function statusRank(status) {
  if (status === 'fail') return 0;
  if (status === 'debt') return 1;
  if (status === 'host-shim') return 2;
  if (status === 'surrogate') return 3;
  return 4;
}

function passWhen(condition, debtWhenFalse = false) {
  if (condition) return 'pass';
  return debtWhenFalse ? 'debt' : 'fail';
}

function getAppAudioEngineCalls(source) {
  return [...source.matchAll(/audioEngine\.([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1])
    .filter(Boolean)
    .sort();
}

function coreHostHasMethod(source, name) {
  return new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?${name}\\s*\\(`).test(source);
}

function makeReport() {
  const app = read('src/App.tsx');
  const coreHost = read('src/audio/coreEngineHost.ts');
  const coreWorklet = read('public/worklets/kessho-core.worklet.js');
  const webEngine = read('src/audio/engine.ts');
  const state = read('src/ui/state.ts');
  const corpus = read('scripts/profile-kessho-core-acceptance-corpus.mjs');
  const readiness = read('scripts/check-kessho-core-parity-readiness.mjs');
  const nativeState = read('KesshoNativeSwift/Kessho/State/SliderState.swift');
  const nativeEngine = read('KesshoNativeSwift/Kessho/Audio/AudioEngine.swift');
  const nativeHotpaths = read('scripts/check-native-swift-mobile-audio-hotpaths.mjs');

  const rows = [];
  const uniqueAppAudioEngineCalls = [...new Set(getAppAudioEngineCalls(app))];
  const missingCoreHostMethods = uniqueAppAudioEngineCalls.filter((name) => !coreHostHasMethod(coreHost, name));

  rows.push(row({
    id: 'webapp-core-host-control-surface',
    area: 'runtime',
    status: passWhen(missingCoreHostMethods.length === 0),
    priority: 'required',
    evidence: [`${uniqueAppAudioEngineCalls.length} App audioEngine call sites audited`, 'CoreEngineHost method surface'],
    description: missingCoreHostMethods.length === 0
      ? 'CoreHost now owns every audioEngine method the Webapp calls, so Core mode no longer depends on runtime proxy fallbacks for app-level controls.'
      : `CoreHost is missing Webapp audioEngine methods: ${missingCoreHostMethods.join(', ')}.`,
  }));

  rows.push(row({
    id: 'pad-source-core',
    area: 'source',
    status: passWhen(
      has(coreHost, "source: 'pad'") &&
      has(coreHost, 'writePadParamsForPad') &&
      has(corpus, "'default-pad-dry'") &&
      has(corpus, "'default-pad2-dry'"),
    ),
    priority: 'required',
    evidence: ['Core pad module', 'Pad 1/2 corpus cases'],
    description: 'Pad and Pad 2 have native Core module routing and browser acceptance coverage.',
  }));

  rows.push(row({
    id: 'lead-source-core',
    area: 'source',
    status: passWhen(
      has(coreHost, "source: 'lead-fm'") &&
      has(coreHost, 'createManualLeadSourceConfig') &&
      has(coreHost, 'createLeadEuclidPreviewSource') &&
      has(corpus, "'lead-manual-dry'") &&
      has(corpus, "'lead1-gamelan-dry'") &&
      has(corpus, "'lead1-soft-rhodes-dry'") &&
      has(corpus, "'lead2-gamelan-dry'") &&
      has(corpus, "'lead2-soft-rhodes-dry'") &&
      has(corpus, "'synth-euclid-lead-grid'"),
    ),
    priority: 'required',
    evidence: ['Core Lead FM aux slot', 'Lead 1/2 manual and Euclid corpus cases'],
    description: 'Lead 1/2 use the Core Lead FM module for manual and synth-Euclid preview paths.',
  }));

  rows.push(row({
    id: 'piano-source-host',
    area: 'source',
    status: passWhen(
      has(coreHost, "note.source === 'piano'") &&
      has(coreHost, 'playHostPianoNote') &&
      has(coreHost, 'configureHostPianoEuclid') &&
      has(coreHost, 'piano: { node: this.hostPianoOutput }') &&
      has(corpus, "'piano-manual-dry'"),
      true,
    ),
    priority: 'required',
    evidence: ['Host sampled piano bridge', 'piano stem', 'manual piano corpus case'],
    description: 'Sampled piano stays host-side for CPU and sample-decode safety, but Core mode now triggers it instead of going silent.',
  }));

  rows.push(row({
    id: 'drum-source-core',
    area: 'source',
    status: passWhen(
      has(coreHost, "source: 'drum'") &&
      has(coreHost, 'createDrumPreviewSource') &&
      has(coreHost, 'setDrumStepOverrides(') &&
      has(coreHost, 'setDrumSubLaneEnabled(') &&
      has(coreHost, 'diceDrumEuclidLane(') &&
      has(coreHost, 'triggerDrumVoice(') &&
      has(coreHost, 'morphOverride') &&
      has(coreHost, 'pitchOverride') &&
      has(coreWorklet, 'KESSHO_DRUM_PARAM_TRIGGER') &&
      has(corpus, "'drum-euclid-tight'") &&
      has(readiness, 'drum-module-parity'),
    ),
    priority: 'required',
    evidence: ['Core drum aux slot', 'drum module parity', 'drum corpus cases', 'Drum Euclid Core control API'],
    description: 'Drum source has native Core module coverage, browser acceptance gates, Webapp control methods, and Core preview playback for clock/swing/trigger/probability/trig/ratchet/expression/morph/distance/pitch overrides.',
  }));

  rows.push(row({
    id: 'soundscapes-source-core',
    area: 'source',
    status: passWhen(
      has(coreHost, "source: 'soundscapes'") &&
      has(coreHost, 'createSoundscapesPreviewSource') &&
      has(corpus, "'earth-water-only'") &&
      has(corpus, "'soundscape-ocean-pad'"),
    ),
    priority: 'required',
    evidence: ['Core soundscapes aux slot', 'earth/soundscape corpus cases'],
    description: 'Water/nature soundscape paths route through the Core soundscapes module for browser parity.',
  }));

  rows.push(row({
    id: 'synth-euclid-source-map',
    area: 'sequencer',
    status: passWhen(
      has(state, "export type SynthEuclidSource = 'lead' | 'lead1' | 'lead2' | 'piano'") &&
      has(coreHost, "source !== 'lead2' && source !== 'piano'") &&
      has(webEngine, "noteSource === 'piano'") &&
      has(coreHost, 'coreEuclideanUsesPianoSource'),
    ),
    priority: 'required',
    evidence: ['Web/Core source enum', 'Core host piano Euclid scheduler'],
    description: 'Core mode recognizes the same synth-Euclid source family as the Webapp, including piano and pad voice lanes.',
  }));

  rows.push(row({
    id: 'synth-euclid-evolve-sublanes',
    area: 'sequencer',
    status: passWhen(has(webEngine, 'evolveSynthLane(') &&
      has(coreHost, 'setSynthStepOverrides(') &&
      has(coreHost, 'setSynthSubLaneEnabled(') &&
      has(coreHost, 'setSynthPitchSettings(') &&
      has(coreHost, 'setSynthPitchBindingModes(') &&
      has(coreHost, 'setSynthEuclidEvolveConfigs(') &&
      has(coreHost, 'syncSynthEuclidLiveEvolve(') &&
      has(coreHost, 'evolveSynthEuclidLaneAtBoundary(') &&
      has(coreHost, 'resetSynthEuclidLaneHome(') &&
      has(coreHost, 'diceSynthEuclidLane(') &&
      has(coreHost, 'triggerToggles') &&
      has(coreHost, 'seqLaneIndex(') &&
      has(coreHost, 'distanceOverride') &&
      has(coreHost, 'paramsOverride') &&
      has(coreWorklet, 'applyNoteParamsOverride(')),
    priority: 'required',
    evidence: ['Webapp live evolve/sub-lane scheduler', 'Core host Synth Euclid API bridge', 'Core live evolve timer', 'per-note Core paramsOverride playback'],
    description: 'CoreHost exposes the Webapp Synth Euclid control API, runs bar-boundary live evolve, and applies trigger, pitch, expression, probability, trig, ratchet, piano distance, and per-note lead/pad morph-distance overrides in Core preview playback.',
  }));

  rows.push(row({
    id: 'pad-chord-live-sequencer',
    area: 'sequencer',
    status: passWhen(
      has(webEngine, 'schedulePhraseUpdates()') &&
      has(webEngine, 'onHarmonyTick(') &&
      has(coreHost, 'getCoreHarmonyPreviewTickCount') &&
      has(coreHost, 'advanceCorePreviewHarmonyState') &&
      has(coreHost, 'getCoreHarmonyTickSeconds(sliderState)') &&
      has(coreHost, 'padChordSets.map((chordSet) => [...chordSet, ...clonePreviewNotes(padEuclidNotes)])'),
    ),
    priority: 'required',
    evidence: ['Web phrase/sub-phrase harmony scheduler', 'Core generated harmony tick chord sets'],
    description: 'Core pad chord playback now advances through generated harmony tick chord sets instead of duplicating one frozen startup chord.',
  }));

  rows.push(row({
    id: 'lead-random-phrase-scheduler',
    area: 'sequencer',
    status: passWhen(
      has(webEngine, 'scheduleLeadMelody()') &&
      has(webEngine, 'leadRandomClockSource') &&
      has(coreHost, 'createLeadRandomPreview') &&
      has(coreHost, 'coreIsLeadRandomSourceEnabled') &&
      has(coreHost, 'leadRandom.leadChords') &&
      has(coreHost, 'leadRandom.pianoChords') &&
      has(coreHost, 'leadRandomSyncPolicy'),
    ),
    priority: 'required',
    evidence: ['Web random lead phrase scheduler', 'Core lead/piano random preview sequence'],
    description: 'Core mode now schedules Random Timing phrase notes for Lead 1, Lead 2, and Piano instead of only exposing Euclidean lead playback.',
  }));

  rows.push(row({
    id: 'shared-fx-core-routing',
    area: 'fx',
    status: passWhen(
      has(coreHost, 'createReverbModuleConfig') &&
      has(coreHost, 'createDelayAModuleConfig') &&
      has(coreHost, 'createDelayBModuleConfig') &&
      has(coreHost, 'createGranularModuleConfig') &&
      has(corpus, "'pad-delay-pingpong'") &&
      has(corpus, "'granular-delay-return'"),
    ),
    priority: 'required',
    evidence: ['Core shared FX modules', 'FX slice corpus cases'],
    description: 'Pad, lead, drum, soundscape, Delay A/B, granular, reverb, spectral freeze, dynamics paths are covered by module and corpus gates.',
  }));

  rows.push(row({
    id: 'piano-shared-fx-routing',
    area: 'fx',
    status: passWhen(
      has(coreHost, 'playHostPianoNote') &&
      has(coreHost, 'numberOfInputs: 4') &&
      has(coreHost, 'configureHostPianoFxSends(') &&
      has(coreHost, 'hostPianoReverbSend') &&
      has(coreHost, 'hostPianoDelayASend') &&
      has(coreHost, 'hostPianoDelayBSend') &&
      has(coreHost, 'hostPianoGranularSend') &&
      has(coreHost, 'pianoSendGain') &&
      has(coreWorklet, 'configureExternalInputs') &&
      has(coreWorklet, 'KESSHO_CORE_INPUT_REVERB') &&
      has(coreWorklet, 'addExternalDelayAInput(') &&
      has(coreWorklet, 'addExternalDelayBInput(') &&
      has(coreWorklet, 'externalGranularInputActive'),
      true,
    ),
    priority: 'required',
    evidence: ['Host sampled piano bridge', 'Core worklet external FX input buses', 'piano wet send gain routing'],
    description: 'Sampled host piano now keeps its dry bridge and routes wet sends through Core worklet reverb, Delay A, Delay B, and granular input buses.',
  }));

  rows.push(row({
    id: 'earth-sample-texture-policy',
    area: 'source',
    status: passWhen(
      has(coreHost, "from './earthTexturePlayer'") &&
      has(coreHost, 'hostEarthTextures') &&
      has(coreHost, 'configureHostEarthTextures(') &&
      has(coreHost, 'createHostEarthTextureRuntime(') &&
      has(coreHost, 'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg') &&
      has(coreHost, 'Alps Birds 2_noiseremoval_441_m.ogg') &&
      has(coreHost, 'Fujian Birds 2_441_m_normalized.ogg') &&
      has(coreHost, 'Fujian_Frogs_m_441_normalized.ogg') &&
      has(coreHost, 'getEarthTextureDebugState(): EarthTextureDebugState') &&
      has(coreHost, 'createCoreHostHaasWidenedBus(') &&
      has(coreWorklet, 'configureExternalInputs') &&
      has(coreWorklet, 'KESSHO_CORE_INPUT_GRANULAR'),
      true,
    ),
    priority: 'required',
    evidence: ['Core host EarthTexturePlayer bridge', 'Web OGG sample assets', 'Core worklet external FX input buses'],
    description: 'Core mode now plays the same waves, birds, and frogs OGG texture assets as the Webapp through host-side sample players, with dry output and shared Core reverb, Delay A/B, and granular routing.',
  }));

  rows.push(row({
    id: 'cpu-browser-core',
    area: 'cpu',
    status: passWhen(
      has(coreHost, 'type: \'perf\'') &&
      has(coreHost, 'enablePerf') &&
      has(coreHost, 'HOST_PIANO_SAMPLE_CACHE_LIMIT_PER_VARIANT') &&
      countMatches(coreHost, /new Set<number>\(\)/g) >= 1,
    ),
    priority: 'required',
    evidence: ['Core worklet perf messages', 'bounded host piano sample cache', 'no idle piano scheduler without notes'],
    description: 'Browser Core mode exposes worklet CPU telemetry and bounds host piano sample memory/CPU work to active piano paths.',
  }));

  rows.push(row({
    id: 'cpu-native-hotpaths',
    area: 'cpu',
    status: passWhen(
      has(nativeHotpaths, 'ProcessInfo.processInfo.thermalState') &&
      has(nativeHotpaths, 'updateConditionalInputTaps') &&
      has(nativeHotpaths, 'DispatchSourceTimer') &&
      has(nativeEngine, 'mobilePerformanceProfile'),
    ),
    priority: 'required',
    evidence: ['Native mobile hotpath audit'],
    description: 'Native CPU-sensitive paths are guarded by the existing mobile audio hotpath audit.',
  }));

  rows.push(row({
    id: 'native-state-coverage',
    area: 'native',
    status: passWhen(
      has(nativeState, 'var pianoEnabled: Bool') &&
      has(nativeState, 'var synthEuclid1Source: String') &&
      has(nativeEngine, 'SharedDelayProcessor') &&
      has(readiness, 'engine-host-contract'),
    ),
    priority: 'required',
    evidence: ['Native SliderState', 'Native audio engine', 'Core host contract'],
    description: 'Native state and audio graph contain the current parity-critical source, sequencer, and shared-delay surfaces.',
  }));

  rows.sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.id.localeCompare(right.id));

  const failed = rows.filter((entry) => entry.status === 'fail');
  const debt = rows.filter((entry) => entry.status === 'debt');
  const surrogate = rows.filter((entry) => entry.status === 'surrogate');
  const pass = rows.filter((entry) => entry.status === 'pass' || entry.status === 'host-shim');

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: failed.length === 0 ? 'pass' : 'fail',
    summary: {
      pass: pass.length,
      debt: debt.length,
      surrogate: surrogate.length,
      fail: failed.length,
      total: rows.length,
    },
    rows,
  };
}

function renderMarkdown(report) {
  const statusIcon = {
    pass: 'PASS',
    fail: 'FAIL',
    debt: 'DEBT',
    surrogate: 'SURROGATE',
    'host-shim': 'HOST',
  };
  const lines = [
    '# Kessho Core Architecture Parity Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Overall status: ${report.overallStatus.toUpperCase()}`,
    '',
    `Summary: ${report.summary.pass} pass, ${report.summary.debt} debt, ${report.summary.surrogate} surrogate, ${report.summary.fail} fail, ${report.summary.total} total.`,
    '',
    '| Status | Priority | Area | ID | Description |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const entry of report.rows) {
    lines.push(`| ${statusIcon[entry.status] ?? entry.status} | ${entry.priority} | ${entry.area} | ${entry.id} | ${entry.description.replace(/\|/g, '\\|')} |`);
  }

  const followUps = report.rows.filter((entry) => entry.next);
  if (followUps.length > 0) {
    lines.push('', '## Follow-up Decisions', '');
    for (const entry of followUps) {
      lines.push(`- ${entry.id}: ${entry.next}`);
    }
  }

  lines.push('', '## Evidence', '');
  for (const entry of report.rows) {
    lines.push(`- ${entry.id}: ${entry.evidence.join('; ')}`);
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const report = makeReport();
  if (!args.has('--no-write')) {
    if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
    writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdownReportPath, renderMarkdown(report));
  }

  console.log(`Kessho Core architecture parity audit: ${report.overallStatus.toUpperCase()}`);
  console.log(`Rows: ${report.summary.pass} pass, ${report.summary.debt} debt, ${report.summary.surrogate} surrogate, ${report.summary.fail} fail`);
  if (report.summary.fail > 0) {
    for (const entry of report.rows.filter((row) => row.status === 'fail')) {
      console.error(`FAIL ${entry.id}: ${entry.description}`);
    }
    process.exit(1);
  }
}

main();
