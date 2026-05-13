import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

const runtime = read('src/audio/runtime.ts');
const host = read('src/audio/coreEngineHost.ts');
const engine = read('src/audio/engine.ts');
const outputTrims = read('src/audio/outputTrims.ts');
const dynamicsParams = read('src/audio/dynamicsCharacterParams.ts');
const presetUtils = read('src/ui/presetUtils.ts');
const workletSource = read('cpp/KesshoCore/adapters/wasm/kessho-core.worklet.js');
const publicWorklet = read('public/worklets/kessho-core.worklet.js');
const dynamicsCharacterWorklet = read('public/worklets/dynamics-character.worklet.js');

function readStringArray(source, name) {
  const pattern = new RegExp(`(?:const|export const) ${name} = \\[([\\s\\S]*?)\\]`);
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not read ${name}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function readBraceBody(source, signature, label) {
  const signatureIndex = source.indexOf(signature);
  assert(signatureIndex !== -1, `${label} is missing ${signature}`);
  const openIndex = source.indexOf('{', signatureIndex);
  assert(openIndex !== -1, `${label} is missing an opening brace for ${signature}`);
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  throw new Error(`${label} is missing a closing brace for ${signature}`);
}

function readMethodBody(source, name, label) {
  return readBraceBody(source, `${name}(`, label);
}

function readFunctionBody(source, name, label) {
  return readBraceBody(source, `function ${name}(`, label);
}

function assertOrdered(source, label, tokens) {
  let cursor = 0;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor);
    assert(index !== -1, `${label} is missing ordered token ${token}`);
    cursor = index + token.length;
  }
}

function assertWorkletFxRoutingContract(source, label) {
  const mixerBody = readMethodBody(source, 'configureMixerPadRoutes', `${label} configureMixerPadRoutes`);
  assertOrdered(mixerBody, `${label} mixer pad routes`, [
    'this.setMixerInputBus(KESSHO_CORE_REVERB_BUS, this.reverbOutputLeftPtr, this.reverbOutputRightPtr);',
    'KESSHO_CORE_DELAY_A_BUS',
    'this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN]',
    'this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN]',
    'this.setMixerRoute(0, KESSHO_MODULE_TAP_POSTFADER_PAD1, 0, 1.0, 1.0, true)',
    'this.setMixerRoute(1, KESSHO_MODULE_TAP_POSTFADER_PAD2, 0, 1.0, 1.0, true)',
    'KESSHO_CORE_REVERB_BUS',
    'this.reverbReturnGain',
    'KESSHO_CORE_DELAY_A_BUS',
  ]);

  const processBody = readMethodBody(source, 'process', `${label} process`);
  for (const token of [
    'const reverbStemOutput = outputs[1];',
    'const delayAStemOutput = outputs[2];',
    'const pad1StemOutput = outputs[3];',
    'const pad2StemOutput = outputs[4];',
    'const pad1PreStemOutput = outputs[5];',
    'const reverbFeedStemOutput = outputs[6];',
    'const lead1StemOutput = outputs[7];',
    'const lead2StemOutput = outputs[8];',
    'this.copyPlanarPtrsToOutput(',
    'this.reverbReturnGain,',
    'this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN]',
    'this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD1]',
    'this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD2]',
    'this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1]',
    'KESSHO_CORE_LEAD_RECORDABLE_TRIM_COMPENSATION',
    'slot.kind !== \'lead-fm\'',
    'slot.leadIndex > 0 ? lead2StemOutput : lead1StemOutput',
    'this.reverbInputLeftPtr',
  ]) {
    assert(processBody.includes(token), `${label} must expose pad, lead, reverb, and Delay A recordable stem outputs`);
  }
  const delayStart = processBody.indexOf('const pad1LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;');
  const delayEnd = processBody.indexOf('if (this.reverbModule) {', delayStart);
  assert(delayStart !== -1 && delayEnd !== -1, `${label} must keep Delay A routing before reverb routing`);
  const delayRouting = processBody.slice(delayStart, delayEnd);
  for (const token of [
    'this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1]',
    'this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1]',
    'this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2]',
    'this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2]',
    'this.heap[pad1LeftOffset + i] * this.delayAPad1SendGain',
    'this.heap[pad2LeftOffset + i] * this.delayAPad2SendGain',
    'this.addAuxDelaySendsToInput(activeAuxSlots, frames);',
    'this.processDelayAReturn(frames);',
  ]) {
    assert(delayRouting.includes(token), `${label} Delay A input must use prefader pad send token ${token}`);
  }
  assert(!delayRouting.includes('KESSHO_MODULE_TAP_POSTFADER'), `${label} Delay A input must not use postfader pad taps`);
  const delayReturnBody = readMethodBody(source, 'processDelayAReturn', `${label} processDelayAReturn`);
  for (const token of [
    'this.delayATapLeftPtrs[bus]',
    'this.api.moduleProcessPlanarStereoTaps(',
    'KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT',
  ]) {
    assert(delayReturnBody.includes(token), `${label} Delay A return helper must preserve ${token}`);
  }

  const reverbStart = delayEnd;
  const reverbEnd = processBody.indexOf('const preparedReverbPeak = this.processSpectralFreezePreReverb(frames, reverbInputPeak);', reverbStart);
  assert(reverbEnd !== -1, `${label} reverb routing must feed the prepared reverb helper`);
  const reverbRouting = processBody.slice(reverbStart, reverbEnd);
  for (const token of [
    'this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1]',
    'this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1]',
    'this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2]',
    'this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2]',
    'this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND]',
    'this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND]',
	    'this.heap[pad1LeftOffset + i] * this.reverbPad1SendGain',
	    'this.heap[pad2LeftOffset + i] * this.reverbPad2SendGain',
	    '(this.delayAModule ? this.heap[delayAReverbLeftOffset + i] : 0)',
	    'const preCompGain = this.processReverbPreCompressorSample(reverbInLeft, reverbInRight);',
	    'const conditionedReverbLeft = reverbInLeft * preCompGain * this.reverbInputMakeupGain;',
	    'const conditionedReverbRight = reverbInRight * preCompGain * this.reverbInputMakeupGain;',
	    'const limitedReverbLeft = this.softLimitReverbFeedSample(conditionedReverbLeft);',
	    'const limitedReverbRight = this.softLimitReverbFeedSample(conditionedReverbRight);',
	    'this.processReverbInputDelaySample(limitedReverbLeft, limitedReverbRight);',
	    'this.reverbDelayedInputLeft',
	    'this.reverbDelayedInputRight',
  ]) {
    assert(reverbRouting.includes(token), `${label} reverb input must include routed send token ${token}`);
  }
  for (const token of [
    'const preparedReverbPeak = this.processSpectralFreezePreReverb(frames, reverbInputPeak);',
    'this.processPreparedReverb(frames, preparedReverbPeak);',
    'this.processSpectralFreezePostReverb(frames);',
  ]) {
    assert(processBody.includes(token), `${label} reverb path must include spectral-freeze route token ${token}`);
  }
  assert(!reverbRouting.includes('KESSHO_MODULE_TAP_POSTFADER'), `${label} reverb input must not use postfader pad taps`);
}

function assertCoreHostFxConfigContract(source) {
  for (const token of [
    'numberOfOutputs: 9',
    'outputChannelCount: [2, 2, 2, 2, 2, 2, 2, 2, 2]',
    'pad1: { node: this.node, outputIndex: 3 }',
    'pad2: { node: this.node, outputIndex: 4 }',
    'pad1Pre: { node: this.node, outputIndex: 5 }',
    'reverbFeed: { node: this.node, outputIndex: 6 }',
    'lead1: { node: this.node, outputIndex: 7 }',
    'lead2: { node: this.node, outputIndex: 8 }',
    'piano: { node: this.hostPianoOutput }',
    'reverb: { node: this.node, outputIndex: 1 }',
    'delayAOut: { node: this.node, outputIndex: 2 }',
    'dynamics: { node: this.masterGain }',
  ]) {
    assert(source.includes(token), `CoreEngineHost must preserve ${token}`);
  }

  const reverbConfig = readFunctionBody(source, 'createReverbModuleConfig', 'CoreEngineHost reverb config');
  for (const token of [
    'const pad1Active = booleanValue(state.padEnabled, true) || coreEuclideanUsesPadSource(state);',
    'const pad1SendGain = reverbEnabled && pad1Active',
    'boundedNumber(state.pad1ReverbSend ?? state.synthReverbSend, 0.7, 0, 1)',
    'const pad2SendGain = reverbEnabled && pad2Active',
    'boundedNumber(state.pad2ReverbSend ?? state.synthReverbSend, 0.7, 0, 1)',
    'const spectralFreezeEnabled = booleanValue(state.spectralFreezeEnabled, false)',
    'const reverbReturnEnabled = reverbEnabled || spectralFreezeEnabled',
    'boundedNumber(state.reverbLevel, 0.5, 0, 1) * ENGINE_TRIMS.reverb',
    'boundedNumber(state.reverbPreCompThreshold, DEFAULT_REVERB_PRE_COMP.threshold, -60, 0)',
    'boundedNumber(state.reverbPreCompRatio, DEFAULT_REVERB_PRE_COMP.ratio, 1, 20)',
    'const enabled = reverbReturnEnabled;',
  ]) {
    assert(reverbConfig.includes(token), `CoreEngineHost reverb config must preserve ${token}`);
  }
  for (const forbidden of [
    'hasPadFeed',
    'hasDelayAFeed',
    'reverbEnabled && returnGain > 0.0001',
  ]) {
    assert(!reverbConfig.includes(forbidden), `CoreEngineHost reverb config must not gate tail lifetime on ${forbidden}`);
  }

  const delayAConfig = readFunctionBody(source, 'createDelayAModuleConfig', 'CoreEngineHost Delay A config');
  for (const token of [
    'const pad1SendGain = (booleanValue(state.padEnabled, true) || coreEuclideanUsesPadSource(state))',
    'boundedNumber(state.pad1DelayASend ?? state.padDelayASend, 0, 0, 1)',
    'const pad2SendGain = booleanValue(state.pad2Enabled, false)',
    'boundedNumber(state.pad2DelayASend ?? state.padDelayASend, 0, 0, 1)',
    'const lead1SendGain = coreIsLead1RouteActive(state)',
    'boundedNumber(state.lead1DelayASend, 0, 0, 1)',
    'const lead2SendGain = coreIsLead2RouteActive(state)',
    'boundedNumber(state.lead2DelayASend, 0, 0, 1)',
    'drumSendGain > 0.0001',
    'soundscapeSendGain > 0.0001',
    'const granularDelayASend = booleanValue(state.granularEnabled, false)',
    'granularDelayASend > 0.0001',
    'boundedNumber(state.delayBToASend, 0, 0, 1) > 0.0001',
    'params[7] = booleanValue(state.reverbEnabled, true)',
    'boundedNumber(state.delayAReverbSend, 0.4, 0, 1)',
  ]) {
    assert(delayAConfig.includes(token), `CoreEngineHost Delay A config must preserve ${token}`);
  }

  for (const token of [
    'coreEuclideanUsesPianoSource',
    'playHostPianoNote',
    'configureHostPianoEuclid',
    "note.source === 'piano'",
    'HOST_PIANO_SAMPLE_CACHE_LIMIT_PER_VARIANT',
  ]) {
    assert(source.includes(token), `CoreEngineHost must preserve host piano parity support: ${token}`);
  }

  for (const token of [
    'setSynthStepOverrides(',
    'setSynthEuclidEvolveConfigs(',
    'setSynthSubLaneEnabled(',
    'setSynthEuclidEvolveTriggerCallback(',
    'setSynthEvolveOverridesChangedCallback(',
    'setSynthPitchSettings(',
    'setSynthPitchBindingModes(',
    'setSynthNoteRangeEvolvedCallback(',
    'resetSynthEuclidLaneHome(',
    'diceSynthEuclidLane(',
    'seqLaneIndex(',
    'triggerToggles',
    'distanceOverride',
    'note.distanceOverride ?? null',
  ]) {
    assert(source.includes(token), `CoreEngineHost must preserve Synth Euclid parity support: ${token}`);
  }

  for (const token of [
    'getCoreHarmonyPreviewTickCount',
    'advanceCorePreviewHarmonyState',
    'getCoreHarmonyTickSeconds(sliderState)',
    'getCoreHarmonyInitialChordLeadSeconds',
    'createLeadRandomPreview',
    'createHostPianoPreview',
    'coreIsLeadRandomSourceEnabled',
    'leadRandom.leadChords',
    'leadRandom.pianoChords',
  ]) {
    assert(source.includes(token), `CoreEngineHost must preserve live scheduling parity support: ${token}`);
  }

  const leadRandomPreview = readFunctionBody(source, 'createLeadRandomPreview', 'CoreEngineHost lead random preview');
  assert(
    leadRandomPreview.includes("`lead-random:${randomSource}:${phraseClock}:${sliderState.leadRandomSyncPolicy ?? 'nextPhrase'}:${phraseSeconds.toFixed(4)}:${noteKey}`"),
    'CoreEngineHost lead random key must include stable clock/sync timing metadata',
  );
  assert(
    !leadRandomPreview.includes('initialStartDelaySeconds.toFixed(4)'),
    'CoreEngineHost lead random key must not include the live boundary countdown',
  );

  const leadPreviewSource = readFunctionBody(source, 'createLeadEuclidPreviewSource', 'CoreEngineHost lead preview source');
  assert(
    leadPreviewSource.includes('const sourceNoteKey = `lead-preview:${leadRandom.noteKey}:${synthEuclid.noteKey}:${noteKey}`;'),
    'CoreEngineHost lead preview source must keep random and Euclid timing in the note key',
  );
  assert(
    !leadPreviewSource.includes('initialStartDelaySeconds.toFixed(4)'),
    'CoreEngineHost lead preview config must not churn on the live boundary countdown',
  );

  const padPreviewSource = readFunctionBody(source, 'createPadPreviewSource', 'CoreEngineHost pad preview source');
  for (const token of [
    'const harmonyTimingKey = `harmony:${sliderState.harmonyClockSource ?? \'globalPhrase\'}:${sliderState.harmonySyncPolicy ?? \'nextPhrase\'}:${chordSeconds.toFixed(4)}`;',
    'initialStartDelaySeconds: padEuclidNotes.length > 0',
    'initialChordLeadSeconds: padEuclidNotes.length > 0',
    'getCoreHarmonyInitialChordLeadSeconds(sliderState, anchors)',
  ]) {
    assert(padPreviewSource.includes(token), `CoreEngineHost pad preview source must preserve scheduled chord timing token ${token}`);
  }

  const drumPreviewSource = readFunctionBody(source, 'createDrumPreviewSource', 'CoreEngineHost drum preview source');
  for (const token of [
    'const initialStartDelaySeconds = getCoreDrumInitialStartDelaySeconds(sliderState, runtime, anchors);',
    'const sourceNoteKey = `${drumTimingKey}:${noteKey}`;',
    'triggerInitial: true',
    'initialStartDelaySeconds,',
  ]) {
    assert(drumPreviewSource.includes(token), `CoreEngineHost drum preview source must preserve continuous first-cycle scheduling token ${token}`);
  }

  const hostPianoEuclid = readMethodBody(source, 'configureHostPianoEuclid', 'CoreEngineHost host piano scheduler');
  assert(
    !hostPianoEuclid.includes('hostPiano.initialStartDelaySeconds.toFixed(4)'),
    'CoreEngineHost host piano timer key must not churn on the live boundary countdown',
  );
}

function loadWorkletProcessor(source, label) {
  let Processor = null;
  const context = {
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { onmessage: null, postMessage: () => {} };
      }
    },
    registerProcessor: (name, processor) => {
      if (name === 'kessho-core') Processor = processor;
    },
    console,
    performance: { now: () => 0 },
    sampleRate: 48000,
  };
  context.globalThis = context;
  runInNewContext(source, context, { filename: label });
  assert(Processor, `${label} did not register kessho-core processor`);
  return Processor;
}

function assertArrayClose(actual, expected, label) {
  assert(actual.length === expected.length, `${label} length mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    const diff = Math.abs(actual[i] - expected[i]);
    assert(diff <= 1.0e-6, `${label}[${i}] expected ${expected[i]}, got ${actual[i]}`);
  }
}

function assertRoute(route, expected, label) {
  assert(route, `${label} route was not configured`);
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === 'number') {
      assert(Math.abs(route[key] - value) <= 1.0e-6, `${label}.${key} expected ${value}, got ${route[key]}`);
    } else {
      assert(route[key] === value, `${label}.${key} expected ${value}, got ${route[key]}`);
    }
  }
}

function assertWorkletFxRoutingBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const frames = 4;
  const buffer = new ArrayBuffer(65536);
  const heap = new Float32Array(buffer);
  const view = new DataView(buffer);
  let nextPtr = 4;
  const allocBytes = (byteLength) => {
    const ptr = nextPtr;
    nextPtr += Math.ceil(byteLength / 4) * 4;
    return ptr;
  };
  const allocFrames = () => allocBytes(frames * Float32Array.BYTES_PER_ELEMENT);
  const allocPtrTable = (count) => allocBytes(count * Uint32Array.BYTES_PER_ELEMENT);

  const sourceModule = 101;
  const delayAModule = 202;
  const reverbModule = 303;
  const sourceTapCount = 6;
  const delayATapCount = 4;
  const prefaderPad1 = 2;
  const prefaderPad2 = 3;
  const postfaderPad1 = 4;
  const postfaderPad2 = 5;
  const delayATapMain = 0;
  const delayATapReverbSend = 1;
  const reverbBus = 6;
  const delayABus = 7;

  const sourceTapLeftPtrs = Array.from({ length: sourceTapCount }, allocFrames);
  const sourceTapRightPtrs = Array.from({ length: sourceTapCount }, allocFrames);
  const delayATapLeftPtrs = Array.from({ length: delayATapCount }, allocFrames);
  const delayATapRightPtrs = Array.from({ length: delayATapCount }, allocFrames);

  const sourceLeft = [
    [0.01, 0.02, 0.03, 0.04],
    [700, 701, 702, 703],
    [1.0, -2.0, 0.5, 3.0],
    [4.0, 0.25, -3.0, 2.0],
    [40.0, 41.0, 42.0, 43.0],
    [-30.0, -31.0, -32.0, -33.0],
  ];
  const sourceRight = [
    [-0.01, -0.02, -0.03, -0.04],
    [-700, -701, -702, -703],
    [-1.5, 2.5, -0.75, 1.25],
    [2.0, -4.0, 1.5, -0.5],
    [140.0, 141.0, 142.0, 143.0],
    [-130.0, -131.0, -132.0, -133.0],
  ];
  const delayAReverbLeft = [0.125, -0.2, 0.4, -0.3];
  const delayAReverbRight = [0.5, -0.25, 0.75, -0.6];
  const delayAPad1SendGain = 0.25;
  const delayAPad2SendGain = 0.5;
  const reverbPad1SendGain = 0.3;
  const reverbPad2SendGain = 0.4;
  const reverbInputMakeupGain = 1.75;
  const reverbReturnGain = 0.63;
  const expectedDelayInputLeft = sourceLeft[prefaderPad1].map((value, i) =>
    value * delayAPad1SendGain + sourceLeft[prefaderPad2][i] * delayAPad2SendGain,
  );
  const expectedDelayInputRight = sourceRight[prefaderPad1].map((value, i) =>
    value * delayAPad1SendGain + sourceRight[prefaderPad2][i] * delayAPad2SendGain,
  );
  const softLimitReverbFeedSample = (value) => {
    const limit = 1.047;
    const abs = Math.abs(value);
    if (abs <= limit) return value;
    return Math.sign(value) * (limit + Math.tanh((abs - limit) * 6) * 0.005);
  };
  const expectedReverbInputLeft = sourceLeft[prefaderPad1].map((value, i) =>
    softLimitReverbFeedSample(
      (value * reverbPad1SendGain + sourceLeft[prefaderPad2][i] * reverbPad2SendGain + delayAReverbLeft[i]) *
        reverbInputMakeupGain,
    ),
  );
  const expectedReverbInputRight = sourceRight[prefaderPad1].map((value, i) =>
    softLimitReverbFeedSample(
      (value * reverbPad1SendGain + sourceRight[prefaderPad2][i] * reverbPad2SendGain + delayAReverbRight[i]) *
        reverbInputMakeupGain,
    ),
  );

  const processor = Object.create(Processor.prototype);
  const routeCalls = [];
  const postMessages = [];
  let reverbProcessCalls = 0;
  Object.assign(processor, {
    ready: true,
    engine: 1,
    exports: { memory: { buffer } },
    api: null,
    heap,
    view,
    leftPtr: allocFrames(),
    rightPtr: allocFrames(),
    mixLeftPtr: allocFrames(),
    mixRightPtr: allocFrames(),
    mixerInputLPtrsPtr: allocPtrTable(8),
    mixerInputRPtrsPtr: allocPtrTable(8),
    mixerOutputLPtrsPtr: allocPtrTable(1),
    mixerOutputRPtrsPtr: allocPtrTable(1),
    mixerRoutePtr: allocBytes(20),
    mixer: 1,
    dynamicsModule: 0,
    granularModule: 0,
    reverbModule,
    reverbPad1SendGain,
    reverbPad2SendGain,
	    reverbPreComp: {
	      ...Processor.prototype.createReverbPreCompressor.call(processor),
	      ratio: 1,
	      attackCoeff: 0,
	      releaseCoeff: 0,
	    },
	    reverbInputLookaheadSamples: 0,
	    reverbInputDelayLeft: new Float32Array(1),
	    reverbInputDelayRight: new Float32Array(1),
	    reverbInputDelayIndex: 0,
	    reverbDelayedInputLeft: 0,
	    reverbDelayedInputRight: 0,
    reverbInputMakeupGain,
    reverbReturnGain,
    delayAModule,
    delayAPad1SendGain,
    delayAPad2SendGain,
    delayAInputLeftPtr: allocFrames(),
    delayAInputRightPtr: allocFrames(),
    delayATapLPtrsPtr: allocPtrTable(delayATapCount),
    delayATapRPtrsPtr: allocPtrTable(delayATapCount),
    delayATapLeftPtrs,
    delayATapRightPtrs,
    delayBModule: 0,
    delayBInputLeftPtr: allocFrames(),
    delayBInputRightPtr: allocFrames(),
    delayBTapLPtrsPtr: allocPtrTable(4),
    delayBTapRPtrsPtr: allocPtrTable(4),
    delayBTapLeftPtrs: Array.from({ length: 4 }, allocFrames),
    delayBTapRightPtrs: Array.from({ length: 4 }, allocFrames),
    granularInputLeftPtr: allocFrames(),
    granularInputRightPtr: allocFrames(),
    granularOutputLeftPtr: allocFrames(),
    granularOutputRightPtr: allocFrames(),
    spectralFreezeModule: 0,
    spectralFreezeOutputLeftPtr: allocFrames(),
    spectralFreezeOutputRightPtr: allocFrames(),
    reverbInputLeftPtr: allocFrames(),
    reverbInputRightPtr: allocFrames(),
    reverbOutputLeftPtr: allocFrames(),
    reverbOutputRightPtr: allocFrames(),
    sourceModule,
    sourceModuleType: 7,
    sourceKind: 'pad',
    sourceDryGain: 1,
    sourceChordSets: [],
    sourcePendingNotes: [],
    sourcePendingNoteOffs: [],
    sourceTapLeftPtrs,
    sourceTapRightPtrs,
    padPostChains: [
      Processor.prototype.createPadPostChain.call(processor),
      Processor.prototype.createPadPostChain.call(processor),
    ],
    left: null,
    right: null,
    mixLeft: null,
    mixRight: null,
    mixerMode: '',
    frames,
    perfEnabled: false,
    port: { postMessage: (message) => postMessages.push(message) },
  });
  processor.left = new Float32Array(buffer, processor.leftPtr, frames);
  processor.right = new Float32Array(buffer, processor.rightPtr, frames);
  processor.mixLeft = new Float32Array(buffer, processor.mixLeftPtr, frames);
  processor.mixRight = new Float32Array(buffer, processor.mixRightPtr, frames);

  const readPlanar = (ptr) => Array.from(heap.subarray(ptr >> 2, (ptr >> 2) + frames));
  const writePlanar = (ptr, values) => {
    heap.set(values, ptr >> 2);
  };
  const readTapPtr = (ptrTable, bus) => view.getUint32(ptrTable + bus * Uint32Array.BYTES_PER_ELEMENT, true);
  processor.api = {
    moduleProcessPlanarStereoTaps: (module, inputLPtr, inputRPtr, tapLPtrsPtr, tapRPtrsPtr, tapCount) => {
      if (module === sourceModule) {
        assert(tapCount === sourceTapCount, `${label} source tap count mismatch`);
        for (let bus = 0; bus < sourceTapCount; bus += 1) {
          writePlanar(readTapPtr(tapLPtrsPtr, bus), sourceLeft[bus]);
          writePlanar(readTapPtr(tapRPtrsPtr, bus), sourceRight[bus]);
        }
        return 1;
      }
      if (module === delayAModule) {
        assert(tapCount === delayATapCount, `${label} Delay A tap count mismatch`);
        assertArrayClose(readPlanar(inputLPtr), expectedDelayInputLeft, `${label} Delay A input L`);
        assertArrayClose(readPlanar(inputRPtr), expectedDelayInputRight, `${label} Delay A input R`);
        writePlanar(readTapPtr(tapLPtrsPtr, delayATapMain), [0.05, 0.06, 0.07, 0.08]);
        writePlanar(readTapPtr(tapRPtrsPtr, delayATapMain), [-0.05, -0.06, -0.07, -0.08]);
        writePlanar(readTapPtr(tapLPtrsPtr, delayATapReverbSend), delayAReverbLeft);
        writePlanar(readTapPtr(tapRPtrsPtr, delayATapReverbSend), delayAReverbRight);
        return 1;
      }
      throw new Error(`${label} unexpected tap module ${module}`);
    },
    moduleProcessPlanarStereo: (module, inputLPtr, inputRPtr, outputLPtr, outputRPtr) => {
      assert(module === reverbModule, `${label} unexpected planar module ${module}`);
      reverbProcessCalls += 1;
      assertArrayClose(readPlanar(inputLPtr), expectedReverbInputLeft, `${label} reverb input L`);
      assertArrayClose(readPlanar(inputRPtr), expectedReverbInputRight, `${label} reverb input R`);
      writePlanar(outputLPtr, readPlanar(inputLPtr).map((value) => value * 0.1));
      writePlanar(outputRPtr, readPlanar(inputRPtr).map((value) => value * 0.1));
      return 1;
    },
    mixerSetRoute: (_mixer, routeIndex, routePtr) => {
      routeCalls[routeIndex] = {
        sourceBus: view.getUint32(routePtr, true),
        targetBus: view.getUint32(routePtr + 4, true),
        gainL: view.getFloat32(routePtr + 8, true),
        gainR: view.getFloat32(routePtr + 12, true),
        enabled: view.getUint32(routePtr + 16, true),
      };
      return 1;
    },
    mixerProcessPlanarStereo: (_mixer, _inputLPtrsPtr, _inputRPtrsPtr, inputBusCount) => {
      assert(inputBusCount === 8, `${label} mixer must process all pad FX buses`);
      return 1;
    },
    moduleNoteOff: () => {},
  };

  const makeStereoOutput = () => [new Float32Array(frames), new Float32Array(frames)];
  const outputs = [
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
  ];
  assert(Processor.prototype.process.call(processor, [], outputs) === true, `${label} process returned false`);
  assert(postMessages.length === 0, `${label} emitted unexpected worklet messages: ${JSON.stringify(postMessages)}`);
  assertArrayClose(Array.from(outputs[1][0]), readPlanar(processor.reverbOutputLeftPtr).map((value) => value * reverbReturnGain), `${label} reverb stem L`);
  assertArrayClose(Array.from(outputs[1][1]), readPlanar(processor.reverbOutputRightPtr).map((value) => value * reverbReturnGain), `${label} reverb stem R`);
  assertArrayClose(Array.from(outputs[2][0]), readPlanar(delayATapLeftPtrs[delayATapMain]), `${label} Delay A stem L`);
  assertArrayClose(Array.from(outputs[2][1]), readPlanar(delayATapRightPtrs[delayATapMain]), `${label} Delay A stem R`);
  assertArrayClose(Array.from(outputs[3][0]), readPlanar(sourceTapLeftPtrs[postfaderPad1]), `${label} pad1 stem L`);
  assertArrayClose(Array.from(outputs[3][1]), readPlanar(sourceTapRightPtrs[postfaderPad1]), `${label} pad1 stem R`);
  assertArrayClose(Array.from(outputs[4][0]), readPlanar(sourceTapLeftPtrs[postfaderPad2]), `${label} pad2 stem L`);
  assertArrayClose(Array.from(outputs[4][1]), readPlanar(sourceTapRightPtrs[postfaderPad2]), `${label} pad2 stem R`);
  assertArrayClose(Array.from(outputs[5][0]), readPlanar(sourceTapLeftPtrs[prefaderPad1]), `${label} pad1 prefader stem L`);
  assertArrayClose(Array.from(outputs[5][1]), readPlanar(sourceTapRightPtrs[prefaderPad1]), `${label} pad1 prefader stem R`);
  assertArrayClose(Array.from(outputs[6][0]), readPlanar(processor.reverbInputLeftPtr), `${label} reverb feed stem L`);
  assertArrayClose(Array.from(outputs[6][1]), readPlanar(processor.reverbInputRightPtr), `${label} reverb feed stem R`);
  assertRoute(routeCalls[0], { sourceBus: postfaderPad1, targetBus: 0, gainL: 1, gainR: 1, enabled: 1 }, `${label} pad1 dry route`);
  assertRoute(routeCalls[1], { sourceBus: postfaderPad2, targetBus: 0, gainL: 1, gainR: 1, enabled: 1 }, `${label} pad2 dry route`);
  assertRoute(routeCalls[2], { sourceBus: reverbBus, targetBus: 0, gainL: reverbReturnGain, gainR: reverbReturnGain, enabled: 1 }, `${label} reverb return route`);
  assertRoute(routeCalls[3], { sourceBus: delayABus, targetBus: 0, gainL: 1, gainR: 1, enabled: 1 }, `${label} Delay A return route`);

  processor.reverbReturnGain = 0;
  processor.mixerMode = '';
  routeCalls.length = 0;
  postMessages.length = 0;
  reverbProcessCalls = 0;
  const zeroReturnOutputs = [
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
  ];
  assert(Processor.prototype.process.call(processor, [], zeroReturnOutputs) === true, `${label} zero-return process returned false`);
  assert(postMessages.length === 0, `${label} zero-return emitted unexpected worklet messages: ${JSON.stringify(postMessages)}`);
  assert(reverbProcessCalls === 1, `${label} reverb module must keep processing with a zero return gain to preserve tails`);
  assertRoute(routeCalls[2], { sourceBus: reverbBus, targetBus: 0, gainL: 0, gainR: 0, enabled: 0 }, `${label} zero-return reverb route`);
  assertArrayClose(Array.from(zeroReturnOutputs[1][0]), [0, 0, 0, 0], `${label} zero-return reverb stem L`);
  assertArrayClose(Array.from(zeroReturnOutputs[1][1]), [0, 0, 0, 0], `${label} zero-return reverb stem R`);
  assertArrayClose(Array.from(zeroReturnOutputs[5][0]), readPlanar(sourceTapLeftPtrs[prefaderPad1]), `${label} zero-return pad1 prefader stem L`);
  assertArrayClose(Array.from(zeroReturnOutputs[5][1]), readPlanar(sourceTapRightPtrs[prefaderPad1]), `${label} zero-return pad1 prefader stem R`);
  assertArrayClose(Array.from(zeroReturnOutputs[6][0]), readPlanar(processor.reverbInputLeftPtr), `${label} zero-return reverb feed stem L`);
  assertArrayClose(Array.from(zeroReturnOutputs[6][1]), readPlanar(processor.reverbInputRightPtr), `${label} zero-return reverb feed stem R`);
}

function assertWorkletManualTriggerBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const buffer = new ArrayBuffer(8192);
  const heap = new Float32Array(buffer);
  const killedVoices = [];
  const noteOns = [];
  let allNotesOffCalls = 0;
  const processor = Object.create(Processor.prototype);
  Object.assign(processor, {
    sourceModule: 101,
    sourceModuleType: 7,
    sourceModuleTapCount: 6,
    sourceNoteKey: 'preview',
    sourceChordSets: [[{ route: 0 }]],
    sourcePendingNotes: [{ samplesUntil: 128, note: { route: 0 } }],
    sourcePendingNoteOffs: [{ samplesUntil: 256, voiceIndex: 0 }],
    sourceChordIndex: 0,
    sourceChordIntervalSamples: 0,
    sourceSamplesUntilChord: 0,
    heap,
    padPostChains: [
      Processor.prototype.createPadPostChain.call(processor),
      Processor.prototype.createPadPostChain.call(processor),
    ],
    port: { postMessage: () => {} },
    api: {
      moduleGetParamsPtr: () => 4,
      moduleGetParamCount: () => 108,
      moduleCommitParams: () => {},
      moduleNoteOn: (_module, frequency, velocity, holdSeconds, route) => {
        noteOns.push({ frequency, velocity, holdSeconds, route });
        return 1;
      },
      moduleKillVoice: (_module, voiceIndex) => {
        killedVoices.push(voiceIndex);
        return 1;
      },
      moduleAllNotesOff: () => {
        allNotesOffCalls += 1;
        return 1;
      },
    },
  });

  Processor.prototype.configureSourceModule.call(processor, {
    enabled: true,
    source: 'pad',
    params: Array.from({ length: 108 }, () => 0),
    pad1PostLpfHz: 18000,
    pad1StereoWidth: 1,
    pad2PostLpfHz: 18000,
    pad2StereoWidth: 1,
    chords: [[]],
    chordSeconds: 3600,
    noteKey: 'manual:pad1:0',
    triggerInitial: false,
  });

  assert(
    JSON.stringify(killedVoices) === JSON.stringify([0, 1, 2, 3, 4, 5]),
    `${label} manual triggerInitial=false must hard-kill all pad voices, got ${JSON.stringify(killedVoices)}`,
  );
  assert(allNotesOffCalls === 0, `${label} manual triggerInitial=false must not leave release tails via allNotesOff`);
  assert(processor.sourcePendingNotes.length === 0, `${label} manual trigger must clear pending note-ons`);
  assert(processor.sourcePendingNoteOffs.length === 0, `${label} manual trigger must clear pending note-offs`);

  Processor.prototype.triggerSourceNote.call(processor, {
    frequency: 261.625565,
    velocity: 0.78,
    holdSeconds: 0.9,
    route: 7,
  });
  assert(noteOns.length === 1, `${label} pad2 manual route must trigger exactly one source note`);
  assert(noteOns[0].route === 7, `${label} pad2 manual route must be forwarded with pad bank offset`);
  assert(processor.sourcePendingNoteOffs.length === 1, `${label} pad2 manual release must schedule one note-off`);
  assert(processor.sourcePendingNoteOffs[0].voiceIndex === 1, `${label} pad2 manual note-off must use voice index modulo the pad bank offset`);

  processor.sourcePendingNoteOffs = [{ samplesUntil: 512, voiceIndex: 0 }];
  Processor.prototype.configureSourceModule.call(processor, {
    enabled: true,
    source: 'pad',
    params: Array.from({ length: 108 }, () => 0),
    pad1PostLpfHz: 18000,
    pad1StereoWidth: 1,
    pad2PostLpfHz: 18000,
    pad2StereoWidth: 1,
    chords: [[]],
    chordSeconds: 3600,
    noteKey: 'manual:pad1:1',
    triggerInitial: false,
  });

  assert(killedVoices.length === 6, `${label} manual note-to-note config must preserve active manual voices`);
  assert(processor.sourcePendingNoteOffs.length === 1, `${label} manual note-to-note config must preserve pending note-offs`);
}

function assertWorkletLeadSourceBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const frames = 4;
  const buffer = new ArrayBuffer(32768);
  const heap = new Float32Array(buffer);
  const view = new DataView(buffer);
  let nextPtr = 4;
  const allocBytes = (byteLength) => {
    const ptr = nextPtr;
    nextPtr += Math.ceil(byteLength / 4) * 4;
    return ptr;
  };
  const allocFrames = () => allocBytes(frames * Float32Array.BYTES_PER_ELEMENT);
  const allocPtrTable = (count) => allocBytes(count * Uint32Array.BYTES_PER_ELEMENT);
  const readPlanar = (ptr) => Array.from(heap.subarray(ptr >> 2, (ptr >> 2) + frames));
  const writePlanar = (ptr, values) => {
    heap.set(values, ptr >> 2);
  };

  const leadModule = 404;
  const leadLeft = [0.2, -0.1, 0.05, -0.025];
  const leadRight = [-0.15, 0.12, -0.06, 0.03];
  let createdModuleType = 0;
  let commitCalls = 0;
  const configurePostMessages = [];
  const configureProcessor = Object.create(Processor.prototype);
  Object.assign(configureProcessor, {
    sourceModule: 0,
    sourceModuleType: 0,
    sourceModuleTapCount: 0,
    sourceKind: '',
    sourceDryGain: 1,
    sourceNoteKey: '',
    sourceChordSets: [],
    sourcePendingNotes: [],
    sourcePendingNoteOffs: [],
    heap,
    padPostChains: [
      Processor.prototype.createPadPostChain.call(configureProcessor),
      Processor.prototype.createPadPostChain.call(configureProcessor),
    ],
    port: { postMessage: (message) => configurePostMessages.push(message) },
    api: {
      moduleCreate: (moduleType) => {
        createdModuleType = moduleType;
        return leadModule;
      },
      moduleDestroy: () => {},
      moduleGetOutputTapCount: () => 1,
      moduleGetParamsPtr: () => 4,
      moduleGetParamCount: () => 80,
      moduleCommitParams: () => {
        commitCalls += 1;
      },
      moduleAllNotesOff: () => 1,
    },
  });
  Processor.prototype.configureSourceModule.call(configureProcessor, {
    enabled: true,
    source: 'lead-fm',
    params: Array.from({ length: 80 }, (_, index) => index / 10),
    pad1PostLpfHz: 12000,
    pad1StereoWidth: 0.75,
    pad2PostLpfHz: 12000,
    pad2StereoWidth: 0.75,
    dryGain: 0.42,
    chords: [[]],
    chordSeconds: 3600,
    noteKey: 'manual:lead1:72',
    triggerInitial: false,
  });
  assert(createdModuleType === 6, `${label} configureSource lead-fm must create module type 6`);
  assert(configureProcessor.sourceModuleType === 6, `${label} configureSource lead-fm must store module type 6`);
  assert(configureProcessor.sourceKind === 'lead-fm', `${label} configureSource lead-fm must store source kind`);
  assert(Math.abs(configureProcessor.sourceDryGain - 0.42) <= 1.0e-6, `${label} configureSource lead-fm must store dry gain`);
  assert(commitCalls === 1, `${label} configureSource lead-fm must commit params`);
  assert(Math.abs(heap[1] - 0) <= 1.0e-6 && Math.abs(heap[2] - 0.1) <= 1.0e-6, `${label} configureSource lead-fm must write param payload`);
  assert(configurePostMessages.length === 0, `${label} configureSource lead-fm emitted unexpected messages: ${JSON.stringify(configurePostMessages)}`);

  const sourceTapLeftPtrs = Array.from({ length: 6 }, allocFrames);
  const sourceTapRightPtrs = Array.from({ length: 6 }, allocFrames);
  const delayATapLeftPtrs = Array.from({ length: 4 }, allocFrames);
  const delayATapRightPtrs = Array.from({ length: 4 }, allocFrames);
  const postMessages = [];
  const noteOns = [];
  const killedVoices = [];
  let allNotesOffCalls = 0;

  const processor = Object.create(Processor.prototype);
  Object.assign(processor, {
    ready: true,
    engine: 1,
    exports: { memory: { buffer } },
    heap,
    view,
    leftPtr: allocFrames(),
    rightPtr: allocFrames(),
    mixLeftPtr: allocFrames(),
    mixRightPtr: allocFrames(),
    mixerInputLPtrsPtr: allocPtrTable(8),
    mixerInputRPtrsPtr: allocPtrTable(8),
    mixerOutputLPtrsPtr: allocPtrTable(1),
    mixerOutputRPtrsPtr: allocPtrTable(1),
    mixerRoutePtr: allocBytes(20),
    mixer: 1,
    dynamicsModule: 0,
    reverbModule: 0,
    reverbReturnGain: 0,
    delayAModule: 0,
    granularModule: 0,
    delayAInputLeftPtr: allocFrames(),
    delayAInputRightPtr: allocFrames(),
    delayATapLPtrsPtr: allocPtrTable(4),
    delayATapRPtrsPtr: allocPtrTable(4),
    delayATapLeftPtrs,
    delayATapRightPtrs,
    delayBModule: 0,
    delayBInputLeftPtr: allocFrames(),
    delayBInputRightPtr: allocFrames(),
    delayBTapLPtrsPtr: allocPtrTable(4),
    delayBTapRPtrsPtr: allocPtrTable(4),
    delayBTapLeftPtrs: Array.from({ length: 4 }, allocFrames),
    delayBTapRightPtrs: Array.from({ length: 4 }, allocFrames),
    granularInputLeftPtr: allocFrames(),
    granularInputRightPtr: allocFrames(),
    granularOutputLeftPtr: allocFrames(),
    granularOutputRightPtr: allocFrames(),
    spectralFreezeModule: 0,
    spectralFreezeOutputLeftPtr: allocFrames(),
    spectralFreezeOutputRightPtr: allocFrames(),
    reverbInputLeftPtr: allocFrames(),
    reverbInputRightPtr: allocFrames(),
    reverbOutputLeftPtr: allocFrames(),
    reverbOutputRightPtr: allocFrames(),
    sourceModule: leadModule,
    sourceModuleType: 6,
    sourceKind: 'lead-fm',
    sourceDryGain: 0.5,
    sourceChordSets: [],
    sourcePendingNotes: [],
    sourcePendingNoteOffs: [],
    sourceTapLeftPtrs,
    sourceTapRightPtrs,
    padPostChains: [
      Processor.prototype.createPadPostChain.call(processor),
      Processor.prototype.createPadPostChain.call(processor),
    ],
    left: null,
    right: null,
    mixLeft: null,
    mixRight: null,
    mixerMode: '',
    frames,
    perfEnabled: false,
    port: { postMessage: (message) => postMessages.push(message) },
  });
  processor.left = new Float32Array(buffer, processor.leftPtr, frames);
  processor.right = new Float32Array(buffer, processor.rightPtr, frames);
  processor.mixLeft = new Float32Array(buffer, processor.mixLeftPtr, frames);
  processor.mixRight = new Float32Array(buffer, processor.mixRightPtr, frames);
  processor.processPadPostChain = () => {};

  processor.api = {
    moduleProcessPlanarStereo: (module, _inputLPtr, _inputRPtr, outputLPtr, outputRPtr) => {
      assert(module === leadModule, `${label} lead source must process the lead module`);
      writePlanar(outputLPtr, leadLeft);
      writePlanar(outputRPtr, leadRight);
      return 1;
    },
    mixerSetRoute: () => 1,
    mixerProcessPlanarStereo: (_mixer, inputLPtrsPtr, inputRPtrsPtr, inputBusCount) => {
      assert(inputBusCount === 8, `${label} lead source must keep the FX-capable mixer bus set`);
      assert(view.getUint32(inputLPtrsPtr, true) === processor.leftPtr, `${label} lead source left bus must use main left buffer`);
      assert(view.getUint32(inputRPtrsPtr, true) === processor.rightPtr, `${label} lead source right bus must use main right buffer`);
      writePlanar(processor.mixLeftPtr, readPlanar(processor.leftPtr));
      writePlanar(processor.mixRightPtr, readPlanar(processor.rightPtr));
      return 1;
    },
    moduleNoteOn: (_module, frequency, velocity, holdSeconds, route) => {
      noteOns.push({ frequency, velocity, holdSeconds, route });
      return 1;
    },
    moduleNoteOff: () => {
      throw new Error(`${label} lead source must not schedule pad-style note-offs`);
    },
    moduleKillVoice: (_module, voiceIndex) => {
      killedVoices.push(voiceIndex);
      return 1;
    },
    moduleAllNotesOff: () => {
      allNotesOffCalls += 1;
      return 1;
    },
  };

  Processor.prototype.triggerSourceNote.call(processor, {
    frequency: 523.251,
    velocity: 0.82,
    holdSeconds: 0.5,
    route: 1,
  });
  assert(noteOns.length === 1, `${label} lead source note-on must be forwarded`);
  assert(noteOns[0].route === 1, `${label} lead2 route must select lead output 2`);
  assert(processor.sourcePendingNoteOffs.length === 0, `${label} lead source must rely on module hold time instead of scheduling pad note-offs`);

  Processor.prototype.killSourceVoices.call(processor);
  assert(allNotesOffCalls === 1, `${label} lead source kill must use allNotesOff`);
  assert(killedVoices.length === 0, `${label} lead source kill must not call pad voice kill`);

  const makeStereoOutput = () => [new Float32Array(frames), new Float32Array(frames)];
  const outputs = [
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
  ];
  assert(Processor.prototype.process.call(processor, [], outputs) === true, `${label} lead source process returned false`);
  assert(postMessages.length === 0, `${label} lead source emitted unexpected worklet messages: ${JSON.stringify(postMessages)}`);
  assertArrayClose(Array.from(outputs[0][0]), leadLeft.map((value) => value * 0.5), `${label} lead source mix L`);
  assertArrayClose(Array.from(outputs[0][1]), leadRight.map((value) => value * 0.5), `${label} lead source mix R`);
  for (const outputIndex of [1, 2, 3, 4, 5, 6]) {
    assertArrayClose(Array.from(outputs[outputIndex][0]), [0, 0, 0, 0], `${label} lead source stem ${outputIndex} L`);
    assertArrayClose(Array.from(outputs[outputIndex][1]), [0, 0, 0, 0], `${label} lead source stem ${outputIndex} R`);
  }
}

function assertWorkletDrumAndSoundscapesSourceBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const buffer = new ArrayBuffer(8192);
  const heap = new Float32Array(buffer);
  const createdModuleTypes = [];
  let commitCalls = 0;
  let allNotesOffCalls = 0;
  const killedVoices = [];
  const postMessages = [];
  const processor = Object.create(Processor.prototype);
  Object.assign(processor, {
    sourceModule: 0,
    sourceModuleType: 0,
    sourceModuleTapCount: 0,
    sourceKind: '',
    sourceDryGain: 1,
    sourceNoteKey: '',
    sourceChordSets: [],
    sourcePendingNotes: [],
    sourcePendingNoteOffs: [],
    heap,
    padPostChains: [
      Processor.prototype.createPadPostChain.call(processor),
      Processor.prototype.createPadPostChain.call(processor),
    ],
    port: { postMessage: (message) => postMessages.push(message) },
    api: {
      moduleCreate: (moduleType) => {
        createdModuleTypes.push(moduleType);
        return 900 + moduleType;
      },
      moduleDestroy: () => {},
      moduleGetOutputTapCount: () => 1,
      moduleGetParamsPtr: () => 4,
      moduleGetParamCount: (module) => module === 908 ? 126 : 96,
      moduleCommitParams: () => {
        commitCalls += 1;
      },
      moduleAllNotesOff: () => {
        allNotesOffCalls += 1;
        return 1;
      },
      moduleKillVoice: (_module, voiceIndex) => {
        killedVoices.push(voiceIndex);
        return 1;
      },
      moduleNoteOn: () => 1,
    },
  });

  Processor.prototype.configureSourceModule.call(processor, {
    enabled: true,
    source: 'drum',
    params: Array.from({ length: 126 }, (_, index) => index / 100),
    pad1PostLpfHz: 18000,
    pad1StereoWidth: 1,
    pad2PostLpfHz: 18000,
    pad2StereoWidth: 1,
    dryGain: 1,
    reverbSendGain: 0.2,
    delayASendGain: 0.4,
    chords: [[
      { route: 1, velocity: 0.8, delaySeconds: 0 },
      { route: 3, velocity: 0.6, delaySeconds: 0.125 },
    ]],
    chordSeconds: 2,
    noteKey: 'drum:loop',
  });
  assert(createdModuleTypes[0] === 8, `${label} configureSource drum must create module type 8`);
  assert(processor.sourceKind === 'drum', `${label} configureSource drum must store source kind`);
  assert(processor.sourceModuleType === 8, `${label} configureSource drum must store module type`);
  assert(commitCalls === 1, `${label} configureSource drum must commit params`);
  assert(allNotesOffCalls === 0, `${label} drum loop config must not reset voices/tails on triggerSourceChord`);

  Processor.prototype.killSourceVoices.call(processor);
  assert(allNotesOffCalls === 1, `${label} drum source kill must use allNotesOff`);
  assert(killedVoices.length === 0, `${label} drum source kill must not call pad voice kill`);

  Processor.prototype.configureSourceModule.call(processor, {
    enabled: true,
    source: 'soundscapes',
    params: Array.from({ length: 96 }, (_, index) => index / 100),
    pad1PostLpfHz: 18000,
    pad1StereoWidth: 1,
    pad2PostLpfHz: 18000,
    pad2StereoWidth: 1,
    dryGain: 0.7,
    reverbSendGain: 0.3,
    delayASendGain: 0.1,
    chords: [[]],
    chordSeconds: 3600,
    noteKey: 'soundscapes:water',
    triggerInitial: false,
  });
  assert(createdModuleTypes[1] === 9, `${label} configureSource soundscapes must create module type 9`);
  assert(processor.sourceKind === 'soundscapes', `${label} configureSource soundscapes must store source kind`);
  assert(processor.sourceModuleType === 9, `${label} configureSource soundscapes must store module type`);
  assert(commitCalls === 2, `${label} configureSource soundscapes must commit params`);
  assert(allNotesOffCalls === 1, `${label} soundscapes configure must not stop continuous layers after commit`);
  assert(postMessages.length === 0, `${label} drum/soundscapes source emitted unexpected messages: ${JSON.stringify(postMessages)}`);
}

function assertWorkletAuxSourceLayeringBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const frames = 4;
  const buffer = new ArrayBuffer(32768);
  const heap = new Float32Array(buffer);
  const view = new DataView(buffer);
  let nextPtr = 4;
  const allocBytes = (byteLength) => {
    const ptr = nextPtr;
    nextPtr += Math.ceil(byteLength / 4) * 4;
    return ptr;
  };
  const allocFrames = () => allocBytes(frames * Float32Array.BYTES_PER_ELEMENT);
  const allocPtrTable = (count) => allocBytes(count * Uint32Array.BYTES_PER_ELEMENT);
  const readPlanar = (ptr) => Array.from(heap.subarray(ptr >> 2, (ptr >> 2) + frames));
  const writePlanar = (ptr, values) => {
    heap.set(values, ptr >> 2);
  };

  const leadModule = 601;
  const drumModule = 602;
  const soundscapesModule = 603;
  const leadLeft = [0.2, -0.1, 0.05, -0.025];
  const leadRight = [-0.15, 0.12, -0.06, 0.03];
  const drumLeft = [0.08, 0.04, -0.02, 0.01];
  const drumRight = [0.07, -0.03, 0.015, -0.005];
  const soundscapesLeft = [0.04, -0.02, 0.03, -0.01];
  const soundscapesRight = [-0.03, 0.025, -0.015, 0.02];
  const postMessages = [];
  const makeSlot = (slotId, module, dryGain, granularSendGain = 0) => ({
    slotId,
    module,
    moduleType: slotId === 'drum' ? 8 : slotId === 'soundscapes' ? 9 : 6,
    moduleTapCount: 1,
    kind: slotId === 'drum' ? 'drum' : slotId === 'soundscapes' ? 'soundscapes' : 'lead-fm',
    dryGain,
    reverbSendGain: 0,
    delayASendGain: 0,
    granularSendGain,
    sendsPreDry: true,
    leadIndex: 0,
    noteKey: '',
    chordSets: [],
    chordIndex: 0,
    chordIntervalSamples: 0,
    samplesUntilChord: 0,
    pendingNotes: [],
    pendingNoteOffs: [],
    leftPtr: allocFrames(),
    rightPtr: allocFrames(),
    left: null,
    right: null,
    postChain: Processor.prototype.createPadPostChain.call(processor),
  });

  const processor = Object.create(Processor.prototype);
  const granularModule = 703;
  const leadSlot = makeSlot('lead', leadModule, 0.5, 0.25);
  const drumSlot = makeSlot('drum', drumModule, 0.4, 0.35);
  const soundscapesSlot = makeSlot('soundscapes', soundscapesModule, 0.2, 0.3);
  const expectedGranularLeft = leadLeft.map((value, index) =>
    value * 0.25 + drumLeft[index] * 0.35 + soundscapesLeft[index] * 0.3,
  );
  const expectedGranularRight = leadRight.map((value, index) =>
    value * 0.25 + drumRight[index] * 0.35 + soundscapesRight[index] * 0.3,
  );
  Object.assign(processor, {
    ready: true,
    engine: 1,
    exports: { memory: { buffer } },
    heap,
    view,
    leftPtr: allocFrames(),
    rightPtr: allocFrames(),
    mixLeftPtr: allocFrames(),
    mixRightPtr: allocFrames(),
    mixerInputLPtrsPtr: allocPtrTable(8),
    mixerInputRPtrsPtr: allocPtrTable(8),
    mixerOutputLPtrsPtr: allocPtrTable(1),
    mixerOutputRPtrsPtr: allocPtrTable(1),
    mixerRoutePtr: allocBytes(20),
    mixer: 1,
    dynamicsModule: 0,
    reverbModule: 0,
    reverbReturnGain: 0,
    delayAModule: 0,
    granularModule,
    granularOutputGain: 0.75,
    granularReverbSendGain: 0,
    granularDelayASendGain: 0,
    delayAInputLeftPtr: allocFrames(),
    delayAInputRightPtr: allocFrames(),
    delayATapLPtrsPtr: allocPtrTable(4),
    delayATapRPtrsPtr: allocPtrTable(4),
    delayATapLeftPtrs: Array.from({ length: 4 }, allocFrames),
    delayATapRightPtrs: Array.from({ length: 4 }, allocFrames),
    delayBModule: 0,
    delayBInputLeftPtr: allocFrames(),
    delayBInputRightPtr: allocFrames(),
    delayBTapLPtrsPtr: allocPtrTable(4),
    delayBTapRPtrsPtr: allocPtrTable(4),
    delayBTapLeftPtrs: Array.from({ length: 4 }, allocFrames),
    delayBTapRightPtrs: Array.from({ length: 4 }, allocFrames),
    reverbInputLeftPtr: allocFrames(),
    reverbInputRightPtr: allocFrames(),
    reverbOutputLeftPtr: allocFrames(),
    reverbOutputRightPtr: allocFrames(),
    granularInputLeftPtr: allocFrames(),
    granularInputRightPtr: allocFrames(),
    granularOutputLeftPtr: allocFrames(),
    granularOutputRightPtr: allocFrames(),
    spectralFreezeModule: 0,
    spectralFreezeOutputLeftPtr: allocFrames(),
    spectralFreezeOutputRightPtr: allocFrames(),
    sourceModule: 0,
    sourceModuleType: 0,
    sourceKind: '',
    sourceDryGain: 1,
    sourceChordSets: [],
    sourcePendingNotes: [],
    sourcePendingNoteOffs: [],
    sourceTapLeftPtrs: Array.from({ length: 6 }, allocFrames),
    sourceTapRightPtrs: Array.from({ length: 6 }, allocFrames),
    auxSourceSlots: [leadSlot, drumSlot, soundscapesSlot],
    padPostChains: [
      Processor.prototype.createPadPostChain.call(processor),
      Processor.prototype.createPadPostChain.call(processor),
    ],
    left: null,
    right: null,
    mixLeft: null,
    mixRight: null,
    mixerMode: '',
    frames,
    perfEnabled: false,
    port: { postMessage: (message) => postMessages.push(message) },
  });
  processor.left = new Float32Array(buffer, processor.leftPtr, frames);
  processor.right = new Float32Array(buffer, processor.rightPtr, frames);
  processor.mixLeft = new Float32Array(buffer, processor.mixLeftPtr, frames);
  processor.mixRight = new Float32Array(buffer, processor.mixRightPtr, frames);
  for (const slot of processor.auxSourceSlots) {
    slot.left = new Float32Array(buffer, slot.leftPtr, frames);
    slot.right = new Float32Array(buffer, slot.rightPtr, frames);
  }
  processor.processPostChain = () => {};

  processor.api = {
    moduleProcessPlanarStereo: (module, _inputLPtr, _inputRPtr, outputLPtr, outputRPtr) => {
      if (module === leadModule) {
        writePlanar(outputLPtr, leadLeft);
        writePlanar(outputRPtr, leadRight);
        return 1;
      }
      if (module === drumModule) {
        writePlanar(outputLPtr, drumLeft);
        writePlanar(outputRPtr, drumRight);
        return 1;
      }
      if (module === soundscapesModule) {
        writePlanar(outputLPtr, soundscapesLeft);
        writePlanar(outputRPtr, soundscapesRight);
        return 1;
      }
      if (module === granularModule) {
        assertArrayClose(
          readPlanar(_inputLPtr),
          expectedGranularLeft,
          `${label} granular aux input L`,
        );
        assertArrayClose(
          readPlanar(_inputRPtr),
          expectedGranularRight,
          `${label} granular aux input R`,
        );
        writePlanar(outputLPtr, readPlanar(_inputLPtr).map((value) => value * 2));
        writePlanar(outputRPtr, readPlanar(_inputRPtr).map((value) => value * 2));
        return 1;
      }
      throw new Error(`${label} unexpected aux planar module ${module}`);
    },
    mixerSetRoute: () => 1,
    mixerProcessPlanarStereo: (_mixer, _inputLPtrsPtr, _inputRPtrsPtr, inputBusCount) => {
      assert(inputBusCount === 8, `${label} aux-only source path must keep the FX-capable mixer bus set`);
      writePlanar(processor.mixLeftPtr, [0, 0, 0, 0]);
      writePlanar(processor.mixRightPtr, [0, 0, 0, 0]);
      return 1;
    },
  };

  const makeStereoOutput = () => [new Float32Array(frames), new Float32Array(frames)];
  const outputs = [
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
    makeStereoOutput(),
  ];
  assert(Processor.prototype.process.call(processor, [], outputs) === true, `${label} aux source process returned false`);
  assert(postMessages.length === 0, `${label} aux source emitted unexpected messages: ${JSON.stringify(postMessages)}`);
  assertArrayClose(
    Array.from(outputs[0][0]),
    leadLeft.map((value, index) =>
      value * 0.5 +
      drumLeft[index] * 0.4 +
      soundscapesLeft[index] * 0.2 +
      expectedGranularLeft[index] * 2 * 0.75,
    ),
    `${label} aux dry mix L`,
  );
  assertArrayClose(
    Array.from(outputs[0][1]),
    leadRight.map((value, index) =>
      value * 0.5 +
      drumRight[index] * 0.4 +
      soundscapesRight[index] * 0.2 +
      expectedGranularRight[index] * 2 * 0.75,
    ),
    `${label} aux dry mix R`,
  );
  for (const outputIndex of [1, 2, 3, 4, 5, 6]) {
    assertArrayClose(Array.from(outputs[outputIndex][0]), [0, 0, 0, 0], `${label} aux stem ${outputIndex} L`);
    assertArrayClose(Array.from(outputs[outputIndex][1]), [0, 0, 0, 0], `${label} aux stem ${outputIndex} R`);
  }
  assertArrayClose(readPlanar(leadSlot.leftPtr), leadLeft, `${label} aux lead slot L`);
  assertArrayClose(readPlanar(drumSlot.leftPtr), drumLeft, `${label} aux drum slot L`);
  assertArrayClose(readPlanar(soundscapesSlot.leftPtr), soundscapesLeft, `${label} aux soundscapes slot L`);
}

function assertWorkletSpectralFreezeRoutingBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const frames = 4;
  const buffer = new ArrayBuffer(16384);
  const heap = new Float32Array(buffer);
  let nextPtr = 4;
  const allocBytes = (byteLength) => {
    const ptr = nextPtr;
    nextPtr += Math.ceil(byteLength / 4) * 4;
    return ptr;
  };
  const allocFrames = () => allocBytes(frames * Float32Array.BYTES_PER_ELEMENT);
  const readPlanar = (ptr) => Array.from(heap.subarray(ptr >> 2, (ptr >> 2) + frames));
  const writePlanar = (ptr, values) => {
    heap.set(values, ptr >> 2);
  };

  const spectralModule = 805;
  const paramsPtr = allocBytes(6 * Float32Array.BYTES_PER_ELEMENT);
  const postMessages = [];
  const createdModuleTypes = [];
  let destroyCalls = 0;
  let resetCalls = 0;
  let commitCalls = 0;
  const processor = Object.create(Processor.prototype);
  Object.assign(processor, {
    heap,
    reverbModule: 0,
    delayAModule: 0,
    reverbPreComp: { gain: 0 },
    reverbInputDelayLeft: new Float32Array(1),
    reverbInputDelayRight: new Float32Array(1),
    reverbInputDelayIndex: 0,
    reverbDelayedInputLeft: 0,
    reverbDelayedInputRight: 0,
    spectralFreezeModule: 0,
    spectralFreezeParamCount: 0,
    spectralFreezeRouting: 'pre',
    spectralFreezeReverbCrossfade: 0.5,
    spectralFreezeOutputLeftPtr: allocFrames(),
    spectralFreezeOutputRightPtr: allocFrames(),
    reverbInputLeftPtr: allocFrames(),
    reverbInputRightPtr: allocFrames(),
    reverbOutputLeftPtr: allocFrames(),
    reverbOutputRightPtr: allocFrames(),
    port: { postMessage: (message) => postMessages.push(message) },
  });
  processor.api = {
    moduleCreate: (moduleType) => {
      createdModuleTypes.push(moduleType);
      return spectralModule;
    },
    moduleDestroy: () => {
      destroyCalls += 1;
    },
    moduleReset: () => {
      resetCalls += 1;
    },
    moduleGetParamsPtr: () => paramsPtr,
    moduleGetParamCount: () => 6,
    moduleCommitParams: () => {
      commitCalls += 1;
    },
    moduleProcessPlanarStereo: (module, inputLPtr, inputRPtr, outputLPtr, outputRPtr) => {
      assert(module === spectralModule, `${label} spectral freeze must process module type 5 instance`);
      writePlanar(outputLPtr, readPlanar(inputLPtr).map((value) => value * 2));
      writePlanar(outputRPtr, readPlanar(inputRPtr).map((value) => value * -2));
      return 1;
    },
  };

  Processor.prototype.configureSpectralFreezeModule.call(processor, {
    enabled: true,
    routing: 'pre',
    reverbCrossfade: 0.25,
    params: [1, 0, 0.25, 0.75, 0.2, 0.1],
  });
  assert(createdModuleTypes[0] === 5, `${label} spectral freeze config must create module type 5`);
  assert(processor.spectralFreezeModule === spectralModule, `${label} spectral freeze module id must be stored`);
  assert(processor.spectralFreezeRouting === 'pre', `${label} spectral freeze routing must be stored`);
  assert(Math.abs(processor.spectralFreezeReverbCrossfade - 0.25) <= 1.0e-6, `${label} spectral crossfade must be stored`);
  assertArrayClose(readPlanar(paramsPtr), [1, 0, 0.25, 0.75], `${label} spectral params prefix`);
  assert(commitCalls === 1, `${label} spectral freeze config must commit params`);

  const inputLeft = [0.1, -0.2, 0.05, -0.025];
  const inputRight = [-0.12, 0.18, -0.04, 0.02];
  writePlanar(processor.reverbInputLeftPtr, inputLeft);
  writePlanar(processor.reverbInputRightPtr, inputRight);
  const peak = Processor.prototype.processSpectralFreezePreReverb.call(processor, frames, 0.01);
  assertArrayClose(
    readPlanar(processor.reverbInputLeftPtr),
    inputLeft.map((value) => value * 2 + value * 0.75),
    `${label} spectral pre routing L`,
  );
  assertArrayClose(
    readPlanar(processor.reverbInputRightPtr),
    inputRight.map((value) => value * -2 + value * 0.75),
    `${label} spectral pre routing R`,
  );
  assert(peak > 0.2, `${label} spectral pre routing must recompute reverb input peak`);

  processor.spectralFreezeRouting = 'post';
  const reverbOutLeft = [0.3, -0.1, 0.2, -0.05];
  const reverbOutRight = [0.15, -0.25, 0.08, -0.04];
  writePlanar(processor.reverbOutputLeftPtr, reverbOutLeft);
  writePlanar(processor.reverbOutputRightPtr, reverbOutRight);
  Processor.prototype.processSpectralFreezePostReverb.call(processor, frames);
  assertArrayClose(
    readPlanar(processor.reverbOutputLeftPtr),
    reverbOutLeft.map((value) => value * 2),
    `${label} spectral post routing L`,
  );
  assertArrayClose(
    readPlanar(processor.reverbOutputRightPtr),
    reverbOutRight.map((value) => value * -2),
    `${label} spectral post routing R`,
  );

  Processor.prototype.resetParityFx.call(processor);
  assert(resetCalls === 1, `${label} resetParityFx must reset spectral freeze`);
  Processor.prototype.configureSpectralFreezeModule.call(processor, { enabled: false });
  assert(destroyCalls === 1, `${label} disabling spectral freeze must destroy the module`);
  assert(processor.spectralFreezeModule === 0, `${label} disabling spectral freeze must clear the module id`);
  assert(postMessages.length === 0, `${label} spectral freeze emitted unexpected messages: ${JSON.stringify(postMessages)}`);
}

function assertWorkletDelayBFacadeBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const frames = 4;
  const buffer = new ArrayBuffer(32768);
  const heap = new Float32Array(buffer);
  const view = new DataView(buffer);
  let nextPtr = 4;
  const allocBytes = (byteLength) => {
    const ptr = nextPtr;
    nextPtr += Math.ceil(byteLength / 4) * 4;
    return ptr;
  };
  const allocFrames = () => allocBytes(frames * Float32Array.BYTES_PER_ELEMENT);
  const allocPtrTable = (count) => allocBytes(count * Uint32Array.BYTES_PER_ELEMENT);
  const readPlanar = (ptr) => Array.from(heap.subarray(ptr >> 2, (ptr >> 2) + frames));
  const writePlanar = (ptr, values) => {
    heap.set(values, ptr >> 2);
  };
  const readTapPtr = (ptrTable, bus) => view.getUint32(ptrTable + bus * Uint32Array.BYTES_PER_ELEMENT, true);

  const delayBModule = 901;
  const paramsPtr = allocBytes(16 * Float32Array.BYTES_PER_ELEMENT);
  const auxSlot = {
    delayBSendGain: 0.5,
    leftPtr: allocFrames(),
    rightPtr: allocFrames(),
    left: null,
    right: null,
  };
  const auxLeft = [0.2, -0.1, 0.05, -0.025];
  const auxRight = [-0.15, 0.12, -0.06, 0.03];
  auxSlot.left = new Float32Array(buffer, auxSlot.leftPtr, frames);
  auxSlot.right = new Float32Array(buffer, auxSlot.rightPtr, frames);
  auxSlot.left.set(auxLeft);
  auxSlot.right.set(auxRight);

  const delayAToBLeft = [0.01, 0.02, -0.03, 0.04];
  const delayAToBRight = [-0.02, 0.03, -0.04, 0.05];
  const postMessages = [];
  const createdModuleTypes = [];
  const processor = Object.create(Processor.prototype);
  Object.assign(processor, {
    heap,
    view,
    delayAModule: 100,
    delayATapLeftPtrs: Array.from({ length: 4 }, allocFrames),
    delayATapRightPtrs: Array.from({ length: 4 }, allocFrames),
    delayBModule: 0,
    delayBParamCount: 0,
    delayBInputLeftPtr: allocFrames(),
    delayBInputRightPtr: allocFrames(),
    delayBTapLPtrsPtr: allocPtrTable(4),
    delayBTapRPtrsPtr: allocPtrTable(4),
    delayBTapLeftPtrs: Array.from({ length: 4 }, allocFrames),
    delayBTapRightPtrs: Array.from({ length: 4 }, allocFrames),
    mixLeftPtr: allocFrames(),
    mixRightPtr: allocFrames(),
    mixLeft: null,
    mixRight: null,
    port: { postMessage: (message) => postMessages.push(message) },
  });
  processor.mixLeft = new Float32Array(buffer, processor.mixLeftPtr, frames);
  processor.mixRight = new Float32Array(buffer, processor.mixRightPtr, frames);
  writePlanar(processor.delayATapLeftPtrs[2], delayAToBLeft);
  writePlanar(processor.delayATapRightPtrs[2], delayAToBRight);

  processor.api = {
    moduleCreate: (moduleType) => {
      createdModuleTypes.push(moduleType);
      return delayBModule;
    },
    moduleDestroy: () => {},
    moduleGetOutputTapCount: () => 4,
    moduleGetParamsPtr: () => paramsPtr,
    moduleGetParamCount: () => 16,
    moduleCommitParams: () => {},
    moduleProcessPlanarStereoTaps: (module, inputLPtr, inputRPtr, tapLPtrsPtr, tapRPtrsPtr, tapCount) => {
      assert(module === delayBModule, `${label} Delay B facade must process its own module`);
      assert(tapCount === 4, `${label} Delay B facade tap count mismatch`);
      assertArrayClose(
        readPlanar(inputLPtr),
        auxLeft.map((value, index) => value * 0.5 + delayAToBLeft[index]),
        `${label} Delay B input L`,
      );
      assertArrayClose(
        readPlanar(inputRPtr),
        auxRight.map((value, index) => value * 0.5 + delayAToBRight[index]),
        `${label} Delay B input R`,
      );
      writePlanar(readTapPtr(tapLPtrsPtr, 0), [0.3, 0.2, -0.1, 0.05]);
      writePlanar(readTapPtr(tapRPtrsPtr, 0), [-0.25, 0.15, -0.05, 0.02]);
      writePlanar(readTapPtr(tapLPtrsPtr, 1), [0.03, 0.02, -0.01, 0.005]);
      writePlanar(readTapPtr(tapRPtrsPtr, 1), [-0.025, 0.015, -0.005, 0.002]);
      writePlanar(readTapPtr(tapLPtrsPtr, 3), [0.06, 0.04, -0.02, 0.01]);
      writePlanar(readTapPtr(tapRPtrsPtr, 3), [-0.05, 0.03, -0.01, 0.004]);
      return 1;
    },
  };

  Processor.prototype.configureDelayBModule.call(processor, {
    enabled: true,
    params: [1, 250, 375, 0.35, 0.5, 3000, 0, 0.2, 0, 0, 1, 0, 0.75, 0, 8000, 0.25],
    pad1SendGain: 0,
    pad2SendGain: 0,
    lead1SendGain: 0,
    lead2SendGain: 0,
    drumSendGain: 0,
    soundscapeSendGain: 0,
    granularInputGain: 0,
  });
  assert(createdModuleTypes[0] === 11, `${label} Delay B facade must use the native Delay B module type`);
  assert(processor.delayBModule === delayBModule, `${label} Delay B module id must be stored`);
  assertArrayClose(readPlanar(paramsPtr), [1, 250, 375, 0.35], `${label} Delay B params prefix`);

  Processor.prototype.addAuxDelayBSendsToInput.call(processor, [auxSlot], frames);
  Processor.prototype.addDelayAToDelayBInput.call(processor, frames);
  Processor.prototype.processDelayBReturn.call(processor, frames);
  Processor.prototype.addDelayBDryToMix.call(processor, frames);
  assertArrayClose(readPlanar(processor.mixLeftPtr), [0.3, 0.2, -0.1, 0.05], `${label} Delay B dry mix L`);
  assertArrayClose(readPlanar(processor.mixRightPtr), [-0.25, 0.15, -0.05, 0.02], `${label} Delay B dry mix R`);
  assert(postMessages.length === 0, `${label} Delay B facade emitted unexpected messages: ${JSON.stringify(postMessages)}`);
}

function assertWorkletDelayADeferredInputBehavior(source, label) {
  const Processor = loadWorkletProcessor(source, label);
  const frames = 4;
  const buffer = new ArrayBuffer(32768);
  const heap = new Float32Array(buffer);
  let nextPtr = 4;
  const allocBytes = (byteLength) => {
    const ptr = nextPtr;
    nextPtr += Math.ceil(byteLength / 4) * 4;
    return ptr;
  };
  const allocFrames = () => allocBytes(frames * Float32Array.BYTES_PER_ELEMENT);
  const readPlanar = (ptr) => Array.from(heap.subarray(ptr >> 2, (ptr >> 2) + frames));
  const writePlanar = (ptr, values) => {
    heap.set(values, ptr >> 2);
  };

  const processor = Object.create(Processor.prototype);
  Object.assign(processor, {
    heap,
    delayAModule: 100,
    delayBModule: 200,
    granularModule: 300,
    granularDelayAOutputSendGain: 0.25,
    delayAInputLeftPtr: allocFrames(),
    delayAInputRightPtr: allocFrames(),
    delayADeferredInputLeftPtr: allocFrames(),
    delayADeferredInputRightPtr: allocFrames(),
    granularOutputLeftPtr: allocFrames(),
    granularOutputRightPtr: allocFrames(),
    delayBTapLeftPtrs: Array.from({ length: 4 }, allocFrames),
    delayBTapRightPtrs: Array.from({ length: 4 }, allocFrames),
  });

  writePlanar(processor.delayAInputLeftPtr, [0.1, 0.2, -0.3, 0.4]);
  writePlanar(processor.delayAInputRightPtr, [-0.4, 0.3, -0.2, 0.1]);
  writePlanar(processor.delayADeferredInputLeftPtr, [0.01, 0.02, 0.03, 0.04]);
  writePlanar(processor.delayADeferredInputRightPtr, [-0.01, -0.02, -0.03, -0.04]);

  Processor.prototype.addDeferredDelayAInput.call(processor, frames);
  assertArrayClose(readPlanar(processor.delayAInputLeftPtr), [0.11, 0.22, -0.27, 0.44], `${label} deferred Delay A input L`);
  assertArrayClose(readPlanar(processor.delayAInputRightPtr), [-0.41, 0.28, -0.23, 0.06], `${label} deferred Delay A input R`);
  assertArrayClose(readPlanar(processor.delayADeferredInputLeftPtr), [0, 0, 0, 0], `${label} deferred Delay A buffer L cleared`);
  assertArrayClose(readPlanar(processor.delayADeferredInputRightPtr), [0, 0, 0, 0], `${label} deferred Delay A buffer R cleared`);

  writePlanar(processor.granularOutputLeftPtr, [0.4, -0.2, 0.1, -0.05]);
  writePlanar(processor.granularOutputRightPtr, [-0.3, 0.15, -0.075, 0.025]);
  writePlanar(processor.delayBTapLeftPtrs[2], [0.02, 0.03, -0.04, 0.05]);
  writePlanar(processor.delayBTapRightPtrs[2], [-0.01, 0.02, -0.03, 0.04]);

  Processor.prototype.storeDeferredDelayAInput.call(processor, frames);
  assertArrayClose(
    readPlanar(processor.delayADeferredInputLeftPtr),
    [0.12, -0.02, -0.015, 0.0375],
    `${label} stores granular and Delay B cross-feed into Delay A L`,
  );
  assertArrayClose(
    readPlanar(processor.delayADeferredInputRightPtr),
    [-0.085, 0.0575, -0.04875, 0.04625],
    `${label} stores granular and Delay B cross-feed into Delay A R`,
  );
}

function assertWorkletMixerContract(source, label) {
  for (const token of [
    'const KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT = 6;',
    'const KESSHO_MODULE_GRANULAR = 4;',
    'const KESSHO_MODULE_SPECTRAL_FREEZE = 5;',
    'const KESSHO_MODULE_LEAD_FM = 6;',
    'const KESSHO_MODULE_DRUM = 8;',
    'const KESSHO_MODULE_SOUNDSCAPES = 9;',
    'const KESSHO_MODULE_REVERB = 3;',
    'const KESSHO_MODULE_DELAY_A = 10;',
    'const KESSHO_MODULE_DELAY_B = 11;',
    'const KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT = 4;',
    'const KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT = 4;',
    'const KESSHO_MODULE_TAP_PREFADER_PAD1 = 2;',
    'const KESSHO_MODULE_TAP_PREFADER_PAD2 = 3;',
    'const KESSHO_MODULE_TAP_POSTFADER_PAD1 = 4;',
    'const KESSHO_MODULE_TAP_POSTFADER_PAD2 = 5;',
    'const KESSHO_MODULE_DELAY_A_TAP_MAIN = 0;',
    'const KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND = 1;',
    'const KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND = 2;',
    'const KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND = 3;',
    'const KESSHO_CORE_REVERB_BUS = 6;',
    'const KESSHO_CORE_DELAY_A_BUS = 7;',
    "moduleGetOutputTapCount: this.resolve('kessho_module_get_output_tap_count')",
    "moduleProcessPlanarStereoTaps: this.resolve('kessho_module_process_planar_stereo_taps')",
    "moduleKillVoice: this.resolve('kessho_module_kill_voice')",
    "mixerCreate: this.resolve('kessho_mixer_create')",
    "mixerSetRoute: this.resolve('kessho_mixer_set_route')",
    "mixerProcessPlanarStereo: this.resolve('kessho_mixer_process_planar_stereo')",
  ]) {
    assert(source.includes(token), `${label} must resolve mixer export ${token}`);
  }

  for (const token of [
    'this.mixLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.mixRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.mixerInputLPtrsPtr = this.api.malloc(KESSHO_CORE_MIXER_INPUT_BUS_COUNT * UINT32_BYTES);',
    'this.reverbInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.reverbOutputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.delayAInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.delayADeferredInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.delayBInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.delayBTapLPtrsPtr = this.api.malloc(KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT * UINT32_BYTES);',
    'this.granularInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.granularOutputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.spectralFreezeOutputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);',
    'this.delayATapLPtrsPtr = this.api.malloc(KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT * UINT32_BYTES);',
    'this.delayATapLeftPtrs = Array.from(',
    'this.delayATapRightPtrs = Array.from(',
    'this.sourceTapLeftPtrs = Array.from(',
    'this.sourceTapRightPtrs = Array.from(',
    'this.sourceDryGain = 1;',
    'this.mixLeft = new Float32Array(this.exports.memory.buffer, this.mixLeftPtr, this.frames);',
    'this.mixRight = new Float32Array(this.exports.memory.buffer, this.mixRightPtr, this.frames);',
    '!this.mixLeftPtr',
    '!this.mixRightPtr',
    'this.sourceTapLeftPtrs.some((ptr) => !ptr)',
    'this.sourceTapRightPtrs.some((ptr) => !ptr)',
    'this.delayATapLeftPtrs.some((ptr) => !ptr)',
    'this.delayATapRightPtrs.some((ptr) => !ptr)',
    '!this.delayADeferredInputLeftPtr',
    'this.delayBTapLeftPtrs.some((ptr) => !ptr)',
    '!this.spectralFreezeOutputLeftPtr',
  ]) {
    assert(source.includes(token), `${label} must allocate separate mixer output buffers`);
  }

  for (const token of [
    'configureMixerMainRoute()',
    'configureMixerPadRoutes()',
    'configureMixerLeadRoutes()',
    'ensureMixerMode(mode)',
    'this.configureMixerMainRoute();',
    'this.setMixerInputBus(0, this.leftPtr, this.rightPtr);',
    'this.setMixerInputBus(KESSHO_CORE_REVERB_BUS, this.reverbOutputLeftPtr, this.reverbOutputRightPtr);',
    'this.view.setUint32(this.mixerOutputLPtrsPtr, this.mixLeftPtr, true);',
    'this.view.setUint32(this.mixerOutputRPtrsPtr, this.mixRightPtr, true);',
    'this.setMixerRoute(0, KESSHO_MODULE_TAP_POSTFADER_PAD1, 0, 1.0, 1.0, true)',
    'this.setMixerRoute(1, KESSHO_MODULE_TAP_POSTFADER_PAD2, 0, 1.0, 1.0, true)',
    'this.setMixerInputBus(',
    'KESSHO_CORE_DELAY_A_BUS',
    'this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN]',
    'this.setMixerRoute(',
    'this.reverbReturnGain',
    "throw new Error('Failed to configure KesshoCore mixer route');",
    "throw new Error('Failed to configure KesshoCore pad tap mixer routes');",
    "throw new Error('Failed to configure KesshoCore lead mixer routes');",
  ]) {
    assert(source.includes(token), `${label} must configure main and pad tap mixer routes`);
  }

	  for (const token of [
    'processMixerRoute(frames, inputBusCount)',
    'return this.api.mixerProcessPlanarStereo(',
    'this.mixerInputLPtrsPtr',
    'this.mixerInputRPtrsPtr',
    'this.mixerOutputLPtrsPtr',
    'this.mixerOutputRPtrsPtr',
    'this.api.moduleProcessPlanarStereoTaps(',
    'KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT,',
    "this.postQueueFailure('sourceModuleTapProcess');",
    "this.ensureMixerMode('pad')",
    "this.ensureMixerMode('main')",
    "message.source === 'lead-fm'",
    "message.source === 'drum'",
    "message.source === 'soundscapes'",
    'KESSHO_MODULE_DRUM',
    'KESSHO_MODULE_SOUNDSCAPES',
    'this.sourceModuleType === KESSHO_MODULE_PAD',
    "this.postQueueFailure('sourceModuleProcess');",
    'this.sourceDryGain',
    'this.sourceReverbSendGain',
    'this.sourceDelayASendGain',
    'this.left[i] * sourceDelaySendGain',
    'this.left[i] * sourceReverbSendGain',
    'this.processMixerRoute(frames, mixerInputBusCount)',
    'this.configureReverbModule(message);',
    'this.api.moduleCreate(KESSHO_MODULE_REVERB, sampleRate, this.frames)',
    'this.reverbPad1SendGain',
    'configureDelayAModule(message)',
    'configureDelayBModule(message)',
    'configureGranularModule(message)',
    'configureSpectralFreezeModule(message)',
    'this.api.moduleCreate(KESSHO_MODULE_DELAY_A, sampleRate, this.frames)',
    'this.api.moduleCreate(KESSHO_MODULE_DELAY_B, sampleRate, this.frames)',
    'this.api.moduleCreate(KESSHO_MODULE_GRANULAR, sampleRate, this.frames)',
    'this.api.moduleCreate(KESSHO_MODULE_SPECTRAL_FREEZE, sampleRate, this.frames)',
    'this.delayAPad1SendGain',
    'this.delayBPad1SendGain',
    'this.granularPad1SendGain',
    'this.granularOutputGain',
    'this.processSpectralFreezePreReverb(frames, reverbInputPeak)',
    'this.processSpectralFreezePostReverb(frames)',
    'killSourceVoices()',
    "this.postQueueFailure('sourceModuleKillVoice');",
    'this.killSourceVoices();',
    "noteKey.startsWith('manual:')",
    'this.api.moduleGetOutputTapCount(this.delayAModule) < KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT',
    'this.api.moduleProcessPlanarStereo(',
    'this.reverbModule,',
    'this.reverbInputLeftPtr,',
    'this.reverbOutputLeftPtr,',
    'this.delayAInputLeftPtr,',
    'this.delayBInputLeftPtr,',
    'this.granularInputLeftPtr,',
    'this.granularOutputLeftPtr,',
    'this.spectralFreezeOutputLeftPtr,',
    'this.delayATapLPtrsPtr,',
    'KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT,',
    'this.addDeferredDelayAInput(frames);',
    'this.storeDeferredDelayAInput(frames);',
    'this.granularDelayAOutputSendGain',
    'KESSHO_MODULE_DELAY_B_TAP_DELAY_A_SEND',
    "this.postQueueFailure('delayAModuleProcess');",
    "this.postQueueFailure('delayBModuleProcess');",
    'KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND',
    "this.postQueueFailure('mixerProcess');",
    'this.mixLeft.fill(0, 0, frames);',
    'this.mixRight.fill(0, 0, frames);',
    'this.dynamicsModule,',
    'this.mixLeftPtr,',
    'this.mixRightPtr,',
    'left[i] = this.mixLeft[i];',
    'right[i] = this.mixRight[i];',
  ]) {
    assert(source.includes(token), `${label} must process pad taps through the mixer route`);
  }

  assertWorkletFxRoutingContract(source, label);
  assertWorkletFxRoutingBehavior(source, label);
  assertWorkletManualTriggerBehavior(source, label);
  assertWorkletLeadSourceBehavior(source, label);
  assertWorkletDrumAndSoundscapesSourceBehavior(source, label);
  assertWorkletAuxSourceLayeringBehavior(source, label);
  assertWorkletSpectralFreezeRoutingBehavior(source, label);
  assertWorkletDelayBFacadeBehavior(source, label);
  assertWorkletDelayADeferredInputBehavior(source, label);
}

assert(runtime.includes("case 'core-wasm':"), 'runtime must preserve ?engine=core-wasm as a legacy core-bridge alias');
assert(!runtime.includes('isLegacyCoreBridgeOptInEnabled'), 'runtime must not hide the verified Core bridge behind a transitional opt-in');
assert(!runtime.includes('legacyCoreBridge'), 'runtime must not require a legacy bridge query/storage escape hatch');
assert(runtime.includes("if (typeof window === 'undefined') return 'core-bridge';"), 'runtime must default SSR to the verified Core bridge path');
assert(runtime.includes("resolvedRuntimeMode = 'core-bridge';"), 'runtime must default browsers to the verified Core bridge path');
assert(runtime.includes("engineMode === 'core-bridge'"), 'runtime must gate the core host behind core-bridge mode');
assert(runtime.includes("engineMode === 'core-product'"), 'runtime must keep core-product separate from the transitional core host');
assert(runtime.includes("import('./coreEngineHost')"), 'runtime must dynamically load CoreEngineHost');
assert(runtime.includes("import('./coreProductEngineHost')"), 'runtime must dynamically load CoreProductEngineHost');
assert(runtime.includes("import('./engine')"), 'runtime must keep the existing web engine fallback');

for (const token of [
  'class CoreEngineHost',
  'async start(sliderState: SliderState, options?: CoreEngineHostUpdateOptions)',
  'updateParams(sliderState: SliderState, options?: CoreEngineHostUpdateOptions)',
  'setPerfUpdateCallback',
  'setPerfMonitorEnabled',
  'pushMidiMessage(message',
  'createKesshoEngineSnapshot',
  'toKesshoCorePresetPreviewScalarsV1',
  'applyPadDistanceToState',
  'createEarthTextureSeed',
  "randomSeed: this.createEarthTextureSeed('ocean'",
  'resolveDynamicsTargets',
  'toDynamicsCharacterParamArray',
  'getPadPreset',
  'morphPadPresets',
  'morphPresets',
  'DEFAULT_SOFT_RHODES',
  'createManualLeadSourceConfig',
  'snapshotOptions',
  'lastDynamicsModuleConfigKey',
  'lastPreviewSourceConfigKey',
  'lastReverbModuleConfigKey',
  'lastDelayBModuleConfigKey',
  'lastSpectralFreezeModuleConfigKey',
  'paramConfigKey',
  'DYNAMICS_CHARACTER_DISABLED_CONFIG_KEY',
  'private configurePreviewSource(config: PreviewSourceConfig | null)',
  "type: 'configureSource'",
  'private configureDynamicsModule(targets: ReturnType<typeof resolveDynamicsTargets>)',
  'private configureReverbModule(config: ReverbModuleConfig)',
  'private configureDelayBModule(config: DelayBModuleConfig)',
  'private configureSpectralFreezeModule(config: SpectralFreezeModuleConfig)',
  'if (this.lastDynamicsModuleConfigKey === configKey) return;',
  "type: 'configureModule'",
  "module: 'dynamics-character'",
  "module: 'reverb'",
  'toKesshoCoreMidiEventPayload',
  "type: 'applySnapshot'",
]) {
  assert(host.includes(token), `CoreEngineHost is missing ${token}`);
}

for (const token of [
  'export const ENGINE_TRIMS',
  'export const DEFAULT_MASTER_VOLUME = 0.85;',
  'export const MASTER_OUTPUT_TRIM = 1.18;',
]) {
  assert(outputTrims.includes(token), `output trim helper is missing ${token}`);
}

for (const token of [
  "import { DEFAULT_MASTER_VOLUME, ENGINE_TRIMS, MASTER_OUTPUT_TRIM } from './outputTrims'",
  '* ENGINE_TRIMS.pad',
  'finiteNumber(state.masterVolume, DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM',
  'getEffectivePadState(sliderState)',
  'const runtimeSliderState = this.getEffectiveRuntimeRandomWalkState(this.getEffectiveDualRangeState(sliderState));',
  'const padState = getEffectivePadState(runtimeSliderState);',
  'createCorePreviewSourceGroup(padState, {',
  'CORE_DRUM_EUCLID_CLOCK_DIVS',
  'setDrumEuclidClockDivs',
  'setDrumStepOverrides',
  'setDrumSubLaneEnabled',
  'diceDrumEuclidLane',
  'triggerDrumVoice',
  'CORE_SYNTH_EUCLID_CLOCK_DIVS',
  'createSynthEuclidPreview',
  'createLeadEuclidPreviewSource',
  'setSynthEuclidClockDivs',
  'setSynthEuclidSwings',
  'this.synthEuclidClockDivs',
  'this.synthEuclidSwings',
  'coreEuclideanUsesPadSource',
  'coreIsLead1RouteActive',
  'coreIsLead2RouteActive',
  'configurePreviewSources(previewSources)',
  "type: 'configureAuxSource'",
  "type: 'triggerAuxSourceNote'",
  'createReverbModuleConfig(padState)',
  'createDelayAModuleConfig(padState)',
  'createDelayBModuleConfig(padState)',
  'manualPadVoiceCursor',
  'getManualPadVoicePool(source, sliderState)',
  'this.manualPadVoiceCursor[source] = (cursor + 1) % pool.length;',
  'this.pickManualPadVoice(source, getEffectivePadState(sliderState))',
  'createManualPadSourceConfig(sliderState, source, note, voiceIndex)',
  'pad1PostLpfHz',
  'pad1StereoWidth',
  'pad2PostLpfHz',
  'pad2StereoWidth',
  'renderMode: 0',
  'smokeAmplitude: 0',
  'createPadPreviewChords(sliderState, 1)',
  'const PAD_VOICE_COUNT = 6;',
  "route: source === 'pad2' ? voiceIndex + PAD_VOICE_COUNT : voiceIndex",
  "source: 'lead-fm'",
  'LEAD_FM_MODULE_PARAM_COUNT = 80',
  'LEAD_FM_ALGORITHM_VALUES',
  'applyLeadDistanceEnvelope',
  'applyLeadDistanceTimbre',
  "note.source === 'lead2'",
  "note.source === 'lead1'",
  'createManualLeadSourceConfig(sliderState, source, note)',
  'lead1SendGain',
  'lead2SendGain',
  'drumSendGain',
  'soundscapeSendGain',
  'lead1DelayASend',
  'lead2DelayASend',
  'drumDelayASend',
  'waterDelayASend',
  'oceanDelayASend',
  'insDelayASend',
  'birdsDelayASend',
  'birds2DelayASend',
  'frogsDelayASend',
  'reverbSendGain',
  'delayASendGain',
  'DRUM_MODULE_PARAM_COUNT = 126',
  'SOUNDSCAPES_MODULE_PARAM_COUNT = 96',
  'createDrumPreviewSource',
  'DRUM_DELAY_SEND_KEYS',
  'getCoreDrumDelaySendProfile',
  'createSoundscapesPreviewSource',
  'EarthTexturePlayer',
  'hostEarthTextures',
  'configureHostEarthTextures',
  'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg',
  'Alps Birds 2_noiseremoval_441_m.ogg',
  'Fujian Birds 2_441_m_normalized.ogg',
  'Fujian_Frogs_m_441_normalized.ogg',
  'createCoreHostHaasWidenedBus',
  'boundedNumber(state.granularWavesSend, 0, 0, 1)',
  'createGranularModuleConfig',
  'computeGranularMacroModel',
  'GRANULAR_MODULE_PARAM_COUNT = 143',
  'createSpectralFreezeModuleConfig',
  'SPECTRAL_FREEZE_MODULE_PARAM_COUNT = 6',
  'spectralFreezeReverbCrossfade',
  'spectralFreezeRouting',
  'spectralFreezePhaseJitter',
  'resolveDrumEuclidPatternParams',
  'seqEuclidean',
  'morphWaterPresets',
  'REVERB_MODULE_PARAM_COUNT = 30',
  'DELAY_A_MODULE_PARAM_COUNT = 16',
  'DELAY_B_MODULE_PARAM_COUNT = 16',
  'DELAY_A_FILTER_TYPE_VALUES',
  '* ENGINE_TRIMS.reverb',
  'delayNoteToSeconds(delayNoteL, bpm) * 1000',
  'getEffectiveSequencerBpm(sliderState)',
  "module: 'reverb'",
  "module: 'delay-a'",
  "module: 'delay-b'",
  "module: 'granular'",
  "module: 'spectral-freeze'",
]) {
  assert(host.includes(token), `CoreEngineHost parity alignment is missing ${token}`);
}

assertCoreHostFxConfigContract(host);

for (const token of [
  'softenPadPreviewTimbre',
  'PAD_PREVIEW_TRIM',
  'audibleFallbackLevel',
  'Math.min(pad1Level',
  'Math.min(pad2Level',
]) {
  assert(!host.includes(token), `CoreEngineHost must not retain preview-only parity delta ${token}`);
}

for (const token of [
  'audioEngine.updateParams(newState, {',
  'presetId: migrated.name',
  'presetName: migrated.name',
]) {
  assert(presetUtils.includes(token), `preset loader is missing ${token}`);
}

assert(
  runtime.includes('if (candidate !== undefined) return candidate;') &&
    runtime.includes('return createMethodProxy(property as EngineMethod);'),
  'runtime proxy must keep getter/no-op fallbacks after an engine is loaded',
);

for (const token of [
  'toDynamicsCharacterParamObject',
  'toDynamicsCharacterParamArray',
  'DYNAMICS_CHARACTER_PARAM_ORDER',
  'endCompProgramRelease',
]) {
  assert(dynamicsParams.includes(token), `dynamics character param helper is missing ${token}`);
}

for (const token of [
  "import { toDynamicsCharacterParamObject } from './dynamicsCharacterParams'",
  'const params = toDynamicsCharacterParamObject(targets);',
]) {
  assert(engine.includes(token), `AudioEngine dynamics worklet mapping is missing ${token}`);
}

assert(
  JSON.stringify(readStringArray(dynamicsParams, 'DYNAMICS_CHARACTER_PARAM_ORDER')) ===
    JSON.stringify(readStringArray(dynamicsCharacterWorklet, 'PARAM_ORDER')),
  'Core/legacy dynamics-character param orders must stay identical',
);

for (const token of [
  "this.resolve('kessho_push_param_event')",
  "this.resolve('kessho_push_midi_event')",
  "this.resolve('kessho_push_transport_event')",
  "this.resolve('kessho_apply_snapshot_v1')",
  "this.resolve('kessho_module_create')",
  "this.resolve('kessho_module_note_on')",
  "this.resolve('kessho_module_all_notes_off')",
  "this.resolve('kessho_module_process_planar_stereo')",
  'moduleProcessPlanarStereo',
  "message.type === 'applySnapshot'",
  "message.type === 'configureModule'",
  "message.module === 'spectral-freeze'",
  "message.module === 'delay-b'",
  "message.type === 'configureSource'",
  'configureSourceModule',
  'sourceModule',
  'configureDynamicsModule',
  'configureDelayBModule',
  'configureSpectralFreezeModule',
  'createPadPostChain()',
  'configurePadPostChain(chain, postLpfHz, stereoWidth, postLpfStages = 1)',
  'updatePadPostLpfCoefficients(chain)',
  'message.postLpfStages',
  'processPadPostChain(padIndex, leftPtr, rightPtr, frames)',
  'this.processPadPostChain(',
  "noteKey.startsWith('manual:')",
  'KESSHO_MODULE_TAP_POSTFADER_PAD1',
  'KESSHO_MODULE_TAP_POSTFADER_PAD2',
  "message.type === 'midiEvent'",
  "message.type === 'enablePerf'",
  "type: 'perf'",
  "eventQueueDepth",
]) {
  assert(workletSource.includes(token), `core worklet is missing ${token}`);
}

assertWorkletMixerContract(workletSource, 'source core worklet');
assertWorkletMixerContract(publicWorklet, 'public core worklet');
assert(workletSource === publicWorklet, 'public core worklet must match the source adapter');

console.log('KesshoCore host switch checks passed');
