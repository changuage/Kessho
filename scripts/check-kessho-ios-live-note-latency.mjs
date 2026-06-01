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
  status: failures.length === 0 ? 'pass' : 'fail',
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
  checkedFiles: [queuePath, rendererPath],
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Kessho iOS live-note latency check passed (static)');
