import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/kessho-ios-background-audio-evidence-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const requiredRows = [
  'ios-native-foreground',
  'ios-screen-lock',
  'ios-app-background',
  'ios-control-center-now-playing',
  'ios-route-change',
  'ios-interruption-begin-end',
  'ios-bluetooth-midi-disconnect-reconnect',
  'ios-usb-midi-hotplug',
];

const infoPlist = read('ios/App/App/Info.plist');
const audioSession = read('plugins/kessho-capacitor-audio-session/ios/Sources/KesshoAudioSession/KesshoAudioSessionPlugin.swift');
const midiRouting = read('plugins/kessho-capacitor-midi-routing/ios/Sources/KesshoMIDIRouting/KesshoMidiRoutingPlugin.swift');
const capabilityApi = read('cpp/KesshoCore/src/product/KesshoProductApi.cpp');

const failures = [];
if (!/<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*<string>audio<\/string>[\s\S]*<\/array>/.test(infoPlist)) {
  failures.push('ios/App/App/Info.plist missing UIBackgroundModes audio');
}
if (!audioSession.includes('MPRemoteCommandCenter.shared()')) {
  failures.push('audio session plugin missing Control Center remote command prep');
}
if (!audioSession.includes('iosAudioSessionTelemetry')) {
  failures.push('audio session plugin missing iOS telemetry payload');
}
for (const token of [
  'endpointTransportName(for:',
  'kMIDIPropertyDisplayName',
  'kMIDIPropertyManufacturer',
  'hints.contains("bluetooth")',
  'hints.contains("usb")',
]) {
  if (!midiRouting.includes(token)) {
    failures.push(`MIDI plugin missing transport metadata token ${token}`);
  }
}
if (!capabilityApi.includes('report.supports_native_bridge = 0;')) {
  failures.push('native bridge capability was unexpectedly enabled');
}

const rows = requiredRows.map((id) => ({
  id,
  status: 'manual-pending',
  evidenceMode: 'static',
  physicalDeviceRequired: true,
  tester: null,
  date: null,
  device: null,
  iosVersion: null,
}));

const report = {
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  releaseReady: false,
  physicalDeviceEvidenceClaimed: false,
  reason: 'iOS lifecycle evidence rows require physical device execution before release claims.',
  requiredRows,
  rows,
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Kessho iOS background audio evidence scaffold passed (releaseReady=false)');
