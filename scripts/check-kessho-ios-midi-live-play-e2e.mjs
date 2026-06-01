import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/kessho-ios-midi-live-play-e2e-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const files = {
  midi: 'plugins/kessho-capacitor-midi-routing/ios/Sources/KesshoMIDIRouting/KesshoMidiRoutingPlugin.swift',
  audio: 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift',
  queue: 'plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/IOSRealtimeEventQueue.swift',
  touch: 'src/ui/midiLearn/iosTouchLearnGuards.ts',
  capability: 'cpp/KesshoCore/src/product/KesshoProductApi.cpp',
};

const sources = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));
const failures = [];

if (!sources.midi.includes('midiMessage')) failures.push('iOS MIDI plugin missing raw MIDI message listener path');
if (!sources.midi.includes('midiActivity')) failures.push('iOS MIDI plugin missing throttled activity path');
if (!sources.audio.includes('iosAudioSessionTelemetry')) failures.push('iOS audio session telemetry missing');
if (!sources.queue.includes('IOSRealtimeEventQueue')) failures.push('iOS realtime event queue missing');
if (!sources.touch.includes('value-change-drag')) failures.push('iOS touch learn guard missing value-changing drag rule');
if (!sources.capability.includes('report.supports_native_bridge = 0;')) failures.push('native bridge capability was unexpectedly enabled');

const scenario = [
  'build-ios-app',
  'launch-physical-device',
  'start-product-runtime',
  'start-sequencer',
  'connect-midi-input',
  'tap-midi-learn',
  'move-hardware-cc',
  'drag-slider-to-assign',
  'move-cc-update-product-param-without-full-snapshot',
  'send-note-on-while-sequencer-runs',
  'verify-live-note-telemetry',
  'send-note-off',
  'verify-no-transport-reset',
  'record-actual-device-latency',
].map((step) => ({
  step,
  status: 'manual-pending',
  evidenceMode: 'physical-controller-required',
}));

const report = {
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  releaseReady: false,
  physicalDeviceEvidenceClaimed: false,
  scenario,
  staticPrep: {
    midiRouting: sources.midi.includes('midiMessage'),
    audioSessionTelemetry: sources.audio.includes('iosAudioSessionTelemetry'),
    realtimeQueue: sources.queue.includes('IOSRealtimeEventQueue'),
    touchLearnGuard: sources.touch.includes('value-change-drag'),
    nativeBridgeStillDisabled: sources.capability.includes('report.supports_native_bridge = 0;'),
  },
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Kessho iOS MIDI live-play E2E scaffold passed (physical evidence pending)');
