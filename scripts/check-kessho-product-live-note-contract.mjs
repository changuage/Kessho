import fs from 'node:fs';

const contract = fs.readFileSync('src/audio/product/liveNoteEvents.ts', 'utf8');
const adapter = fs.readFileSync('src/native/midi/midiLiveNoteAdapter.ts', 'utf8');
const port = fs.readFileSync('src/audio/product/ports/ProductCommandPort.ts', 'utf8');
const webEngine = fs.readFileSync('src/audio/product/WebProductEngine.ts', 'utf8');
const runtimeHostPort = fs.readFileSync('src/audio/product/host/CoreProductRuntimeHostPort.ts', 'utf8');
const selectedRuntime = fs.readFileSync('src/audio/product/SelectedProductRuntime.ts', 'utf8');
const provider = fs.readFileSync('src/ui/midiLearn/MidiLearnProvider.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const liveNoteInput = fs.readFileSync('src/ui/keyboard/liveNoteInput.ts', 'utf8');
const host = fs.readFileSync('src/audio/coreProductEngineHost.ts', 'utf8');
const coreHostMidi = fs.readFileSync('src/audio/CoreProductHostMidi.ts', 'utf8');
const manualTriggers = fs.readFileSync('src/ui/useProductRuntimeManualTriggers.ts', 'utf8');
const checks = {
  contract: contract.includes('ProductLiveNoteEvent') && contract.includes('live-note-on') && contract.includes('live-note-off'),
  adapter: adapter.includes('midiMessageToProductLiveNoteEvent'),
  channelRoutingPreserved: adapter.includes('midiChannelToProductLiveNoteInstrument') &&
    adapter.includes("case 5: return null") && adapter.includes("case 9: return 'drum'"),
  port: port.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent)') && !port.includes('enqueueLiveNoteEvent?'),
  webEngine: webEngine.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void') &&
    webEngine.includes('coreProductRuntimeHostPort.enqueueLiveNoteEvent(event);'),
  runtimeHostPort: runtimeHostPort.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void') &&
    runtimeHostPort.includes("callCoreProductHost<void>('enqueueLiveNoteEvent', event);"),
  selectedRuntime: selectedRuntime.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void | Promise<void>;'),
  ownedLiveNotesBypassRawMidi: provider.includes('let liveNoteHandled = false;') &&
    provider.includes('if (!liveNoteHandled) onMidiMessageRef.current?.(message);'),
  lazyLiveNoteAllocation: provider.includes('const liveNoteHandler = onLiveNoteEventRef.current;') &&
    provider.includes('if (liveNoteHandler) {') &&
    provider.includes('const liveNoteEvent = midiMessageToProductLiveNoteEvent(message);') &&
    provider.includes('const inputId = midiLiveNoteInputId(message);'),
  appOwnsMidiLifecycle: app.includes('onLiveNoteEvent={handleMidiLiveNoteEvent}') &&
    app.includes('const midiLiveNoteInput = useLiveNoteInput({') &&
    app.includes("source: 'midi'") &&
    liveNoteInput.includes('timestampHostTime: descriptor.timestampHostTime'),
  liveNoteBeforeMonitor: provider.indexOf('const isLiveNoteMessage =') >= 0 &&
    provider.indexOf('const isLiveNoteMessage =') < provider.indexOf('const now = performance.now();') &&
    provider.indexOf('if (isLiveNoteMessage) return;') > provider.indexOf('setActivity((current) =>'),
  directRunningPost: host.includes("this.realtimeInputBootstrap.postWhenReady(productEvent, 'live-note');"),
  coreLiveNoteEvent: coreHostMidi.includes('createCoreProductLiveNoteEvent') &&
    coreHostMidi.includes('createCoreProductMidiEvent') &&
    coreHostMidi.includes('targetId: liveNoteSourceId(event.instrument)') &&
    coreHostMidi.includes("event.kind === 'live-note-off'") &&
    host.includes('enqueueLiveNoteEvent(event: ProductLiveNoteEvent)') &&
    host.includes('createCoreProductLiveNoteEvent(event'),
  noRunningSnapshot: !adapter.includes('Snapshot') && !contract.includes('Snapshot') &&
    !coreHostMidi.includes('Snapshot') && (() => {
      const liveNoteTrigger = manualTriggers.slice(
        manualTriggers.indexOf('const startSynthLiveNote'),
        manualTriggers.indexOf('const stopSynthLiveNote'),
      );
      return liveNoteTrigger.includes("getLifecycleState() !== 'running'") &&
        liveNoteTrigger.includes('manualTriggerCommitOptions(false)') &&
        !liveNoteTrigger.includes('shouldWaitForManualTriggerSnapshot()');
    })(),
};
const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`live note contract check failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('live note contract check passed');
