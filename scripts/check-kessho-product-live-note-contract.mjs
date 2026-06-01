import fs from 'node:fs';

const contract = fs.readFileSync('src/audio/product/liveNoteEvents.ts', 'utf8');
const adapter = fs.readFileSync('src/native/midi/midiLiveNoteAdapter.ts', 'utf8');
const port = fs.readFileSync('src/audio/product/ProductEnginePort.ts', 'utf8');
const webEngine = fs.readFileSync('src/audio/product/WebProductEngine.ts', 'utf8');
const runtimeHostPort = fs.readFileSync('src/audio/product/host/CoreProductRuntimeHostPort.ts', 'utf8');
const selectedRuntime = fs.readFileSync('src/audio/product/SelectedProductRuntime.ts', 'utf8');
const provider = fs.readFileSync('src/ui/midiLearn/MidiLearnProvider.tsx', 'utf8');
const host = fs.readFileSync('src/audio/coreProductEngineHost.ts', 'utf8');
const coreHostMidi = fs.readFileSync('src/audio/CoreProductHostMidi.ts', 'utf8');
const checks = {
  contract: contract.includes('ProductLiveNoteEvent') && contract.includes('live-note-on') && contract.includes('live-note-off'),
  adapter: adapter.includes('midiMessageToProductLiveNoteEvent'),
  port: port.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent)') && !port.includes('enqueueLiveNoteEvent?'),
  webEngine: webEngine.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void') &&
    webEngine.includes('coreProductRuntimeHostPort.enqueueLiveNoteEvent(event);'),
  runtimeHostPort: runtimeHostPort.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void') &&
    runtimeHostPort.includes("callCoreProductHost<void>('enqueueLiveNoteEvent', event);"),
  selectedRuntime: selectedRuntime.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void | Promise<void>;'),
  rawMidiFirst: provider.indexOf('onMidiMessageRef.current?.(message);') >= 0 &&
    provider.indexOf('onMidiMessageRef.current?.(message);') < provider.indexOf('const isLiveNoteMessage ='),
  lazyLiveNoteAllocation: provider.includes('const liveNoteHandler = onLiveNoteEventRef.current;') &&
    provider.includes('if (liveNoteHandler) {') &&
    provider.includes('const liveNoteEvent = midiMessageToProductLiveNoteEvent(message);'),
  liveNoteBeforeMonitor: provider.indexOf('const isLiveNoteMessage =') >= 0 &&
    provider.indexOf('const isLiveNoteMessage =') < provider.indexOf('const now = performance.now();') &&
    provider.indexOf('if (isLiveNoteMessage) return;') > provider.indexOf('setActivity((current) =>'),
  directRunningPost: /if \(this\.runtimeReady\) \{\s*if \(this\.runtime\.audioContext\?\.state === 'running'\) \{\s*post\(\);\s*return;\s*\}/.test(host),
  coreLiveNoteEvent: coreHostMidi.includes('createCoreProductLiveNoteEvent') &&
    coreHostMidi.includes('createCoreProductMidiEvent') &&
    coreHostMidi.includes('targetId: liveNoteSourceId(event.instrument)') &&
    coreHostMidi.includes("event.kind === 'live-note-off'") &&
    host.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent)') &&
    host.includes('createCoreProductLiveNoteEvent(event'),
  noSnapshot: !adapter.includes('Snapshot') && !contract.includes('Snapshot') && !coreHostMidi.includes('Snapshot'),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`live note contract check failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('live note contract check passed');
