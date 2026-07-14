import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/kessho-ios-live-note-latency-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertIncludes(source, token, label, failures) {
  if (!source.includes(token)) failures.push(`${label} missing ${token}`);
}

const failures = [];
const queuePath = 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSRealtimeEventQueue.swift';
const rendererPath = 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSProductAudioRenderer.swift';
const queue = read(queuePath);
const renderer = read(rendererPath);
const pluginPath = 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift';
const midiPath = 'plugins/kessho-capacitor-midi-routing/ios/Sources/KesshoMIDIRouting/KesshoMidiRoutingPlugin.swift';
const plugin = read(pluginPath);
const midi = read(midiPath);

for (const token of [
  'IOSRealtimeEventQueueEvent',
  'receivedHostTime',
  'enqueuedHostTime',
  'targetSampleTime',
  'droppedEventCount',
  'enqueue',
  'drain',
  'telemetry',
]) {
  assertIncludes(queue, token, queuePath, failures);
}

for (const token of [
  'droppedMidiEventCount',
  'underrunCount',
  'enqueueProductEvent',
]) {
  assertIncludes(renderer, token, rendererPath, failures);
}

const report = {
  platform: 'ios',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'prep-only' : 'fail',
  device: 'unknown',
  sampleRate: 0,
  bufferSizeFrames: 0,
  actualBufferDurationMs: 0,
  eventCount: 0,
  medianEventToRenderMs: 0,
  p95EventToRenderMs: 0,
  maxEventToRenderMs: 0,
  droppedMidiEventCount: 0,
  underrunCount: 0,
  evidenceMode: 'static',
  physicalDeviceEvidenceClaimed: false,
  productionNativePlaybackWired:
    !plugin.includes('React/WebAudio engine owns sound generation') &&
    renderer.includes('engine?.renderer.enqueueEvent'),
  nativeMidiDirectToProductCore:
    plugin.includes('IOSRealtimeEventQueue') &&
    midi.includes('IOSRealtimeEventQueue'),
  blockers: [
    'Production playback remains WebAudio-owned.',
    'The timestamped iOS queue is not connected to the CoreMIDI input or Product Core renderer.',
    'No physical-device event-to-render measurements have been recorded.',
  ],
  checkedFiles: [queuePath, rendererPath, pluginPath, midiPath],
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Kessho iOS live-note latency prep is present; production wiring and device measurements are pending');
