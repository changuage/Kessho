import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/kessho-ios-midi-routing-smoke-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertIncludes(source, token, label, failures) {
  if (!source.includes(token)) failures.push(`${label} missing ${token}`);
}

const failures = [];
const swiftPath = 'plugins/kessho-capacitor-midi-routing/ios/Sources/KesshoMIDIRouting/KesshoMidiRoutingPlugin.swift';
const tsPath = 'src/native/capacitorMidiRouting.ts';
const adapterPath = 'src/native/midi/nativeMidiAdapter.ios.ts';
const swift = read(swiftPath);
const ts = read(tsPath);
const adapter = read(adapterPath);

for (const token of [
  'import CoreMIDI',
  'kMIDIPropertyTransportType',
  'kMIDITransportType_USB',
  'kMIDITransportType_Bluetooth',
  'persistentIdentity',
  'fallbackEndpointID',
  'hotplugEventCount',
  'reconnectAttemptCount',
  'timestampHostTime',
  'timestampMs',
  'noteOff',
  'midiActivity',
  'droppedActivityEventCount',
]) {
  assertIncludes(swift, token, swiftPath, failures);
}

for (const token of [
  'displayName?: string',
  "transport?: 'usb' | 'bluetooth'",
  'timestampHostTime?: number',
  'addCapacitorMidiActivityListener',
  'hotplugEventCount?: number',
  'droppedActivityEventCount?: number',
]) {
  assertIncludes(ts, token, tsPath, failures);
}

for (const token of [
  'export interface NativeMidiAdapter',
  "platform: 'ios'",
  'refreshInputs',
  'setConnectedInputs',
  'addActivityListener',
  'stopCapacitorMidiRouting',
]) {
  assertIncludes(adapter, token, adapterPath, failures);
}

const report = {
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  evidenceMode: 'static',
  physicalDeviceEvidenceClaimed: false,
  checkedFiles: [swiftPath, tsPath, adapterPath],
  capabilities: {
    coreMidiDiscovery: swift.includes('MIDIGetNumberOfSources()'),
    usbMidiMetadata: swift.includes('kMIDITransportType_USB'),
    bluetoothMidiMetadata: swift.includes('kMIDITransportType_Bluetooth'),
    hotplugRefresh: swift.includes('notifyProc'),
    runtimeReconnectBookkeeping: swift.includes('desiredConnectionsByID'),
    hostTimeTimestamps: swift.includes('timestampHostTime'),
    throttledActivityEvents: swift.includes('midiActivity'),
  },
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Kessho iOS MIDI routing smoke check passed (static)');
