import fs from 'node:fs';

const swift = fs.readFileSync('CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift', 'utf8');
const provider = fs.readFileSync('src/ui/midiLearn/MidiLearnProvider.tsx', 'utf8');
const checks = {
  coreMidi: swift.includes('import CoreMIDI'),
  hotplug: swift.includes('MIDINotifyProc') && swift.includes('refreshAvailableInputs'),
  endpointIDs: swift.includes('kMIDIPropertyUniqueID'),
  names: swift.includes('kMIDIPropertyName') && swift.includes('kMIDIPropertyManufacturer'),
  normalizedMessages: swift.includes('controlChange') && swift.includes('noteOff') && swift.includes('pitchBend'),
  throttledMonitor: provider.includes('MONITOR_THROTTLE_MS'),
};
const report = { generatedAt: new Date().toISOString(), checks };
fs.mkdirSync('docs/reports', { recursive: true });
fs.writeFileSync('docs/reports/kessho-macos-midi-routing-smoke-latest.json', `${JSON.stringify(report, null, 2)}\n`);

const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`macos midi routing smoke failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('macos midi routing smoke passed');
