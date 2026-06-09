const KESSHO_MODULE_REVERB = 3;
const KESSHO_MODULE_GRANULAR = 4;
const KESSHO_MODULE_SPECTRAL_FREEZE = 5;
const KESSHO_MODULE_LEAD_FM = 6;
const KESSHO_MODULE_PAD = 7;
const KESSHO_MODULE_DRUM = 8;
const KESSHO_MODULE_SOUNDSCAPES = 9;
const KESSHO_MODULE_DELAY_A = 10;
const KESSHO_MODULE_DELAY_B = 11;
const KESSHO_DRUM_PARAM_TRIGGER = 117;
const KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT = 6;
const KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT = 5;
const KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT = 5;
const KESSHO_MODULE_TAP_PREFADER_PAD1 = 2;
const KESSHO_MODULE_TAP_PREFADER_PAD2 = 3;
const KESSHO_MODULE_TAP_POSTFADER_PAD1 = 4;
const KESSHO_MODULE_TAP_POSTFADER_PAD2 = 5;
const KESSHO_MODULE_DELAY_A_TAP_MAIN = 0;
const KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND = 1;
const KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND = 2;
const KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND = 3;
const KESSHO_MODULE_DELAY_B_TAP_MAIN = 0;
const KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND = 1;
const KESSHO_MODULE_DELAY_B_TAP_DELAY_A_SEND = 2;
const KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND = 3;
const KESSHO_PAD_VOICE_COUNT = 6;
const KESSHO_CORE_INPUT_REVERB = 0;
const KESSHO_CORE_INPUT_DELAY_A = 1;
const KESSHO_CORE_INPUT_DELAY_B = 2;
const KESSHO_CORE_INPUT_GRANULAR = 3;
const KESSHO_CORE_REVERB_BUS = 6;
const KESSHO_CORE_DELAY_A_BUS = 7;
const KESSHO_CORE_MIXER_INPUT_BUS_COUNT = 8;
const KESSHO_AUX_SOURCE_SLOT_IDS = ['lead', 'drum', 'soundscapes'];
const KESSHO_CORE_LEAD_RECORDABLE_TRIM_COMPENSATION = 2.0;
const MIXER_ROUTE_BYTES = 20;
const UINT32_BYTES = 4;
const WEB_AUDIO_LOW_PASS_Q_0_7 = Math.pow(10, 0.7 / 20);
const KESSHO_CORE_SOFT_STOP_FADE_SECONDS = 0.18;

class KesshoCoreProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();

    this.ready = false;
    this.engine = 0;
    this.exports = null;
    this.api = null;
    this.heap = null;
    this.view = null;
    this.leftPtr = 0;
    this.rightPtr = 0;
    this.mixLeftPtr = 0;
    this.mixRightPtr = 0;
    this.mixerInputLPtrsPtr = 0;
    this.mixerInputRPtrsPtr = 0;
    this.mixerOutputLPtrsPtr = 0;
    this.mixerOutputRPtrsPtr = 0;
    this.mixerRoutePtr = 0;
    this.snapshotPtr = 0;
    this.paramEventPtr = 0;
    this.midiEventPtr = 0;
    this.transportEventPtr = 0;
    this.mixer = 0;
    this.dynamicsModule = 0;
    this.reverbModule = 0;
    this.reverbParamCount = 0;
    this.reverbPad1SendGain = 0;
    this.reverbPad2SendGain = 0;
    this.reverbInputMakeupGain = 1;
    this.reverbPreComp = this.createReverbPreCompressor();
    this.reverbInputLookaheadSamples = 0;
    this.reverbInputDelayLeft = new Float32Array(Math.max(1, this.reverbInputLookaheadSamples));
    this.reverbInputDelayRight = new Float32Array(Math.max(1, this.reverbInputLookaheadSamples));
    this.reverbInputDelayIndex = 0;
    this.reverbResetOnNextInput = false;
    this.reverbDelayedInputLeft = 0;
    this.reverbDelayedInputRight = 0;
    this.reverbReturnGain = 0;
    this.delayAModule = 0;
    this.delayAParamCount = 0;
    this.delayAPad1SendGain = 0;
    this.delayAPad2SendGain = 0;
    this.delayALead1SendGain = 0;
    this.delayALead2SendGain = 0;
    this.delayADrumSendGain = 0;
    this.delayASoundscapeSendGain = 0;
    this.delayAInputLeftPtr = 0;
    this.delayAInputRightPtr = 0;
    this.delayATapLPtrsPtr = 0;
    this.delayATapRPtrsPtr = 0;
    this.delayATapLeftPtrs = [];
    this.delayATapRightPtrs = [];
    this.delayADeferredInputLeftPtr = 0;
    this.delayADeferredInputRightPtr = 0;
    this.delayBModule = 0;
    this.delayBParamCount = 0;
    this.delayBPad1SendGain = 0;
    this.delayBPad2SendGain = 0;
    this.delayBLead1SendGain = 0;
    this.delayBLead2SendGain = 0;
    this.delayBDrumSendGain = 0;
    this.delayBSoundscapeSendGain = 0;
    this.delayBGranularInputGain = 0;
    this.delayBInputLeftPtr = 0;
    this.delayBInputRightPtr = 0;
    this.delayBTapLPtrsPtr = 0;
    this.delayBTapRPtrsPtr = 0;
    this.delayBTapLeftPtrs = [];
    this.delayBTapRightPtrs = [];
    this.granularModule = 0;
    this.granularParamCount = 0;
    this.granularPad1SendGain = 0;
    this.granularPad2SendGain = 0;
    this.granularLead1SendGain = 0;
    this.granularLead2SendGain = 0;
    this.granularDrumSendGain = 0;
    this.granularSoundscapeSendGain = 0;
    this.granularDelayASendGain = 0;
    this.granularOutputGain = 0;
    this.granularReverbSendGain = 0;
    this.granularDelayAOutputSendGain = 0;
    this.granularInputLeftPtr = 0;
    this.granularInputRightPtr = 0;
    this.granularOutputLeftPtr = 0;
    this.granularOutputRightPtr = 0;
    this.granularPostChain = this.createPadPostChain();
    this.spectralFreezeModule = 0;
    this.spectralFreezeParamCount = 0;
    this.spectralFreezeRouting = 'pre';
    this.spectralFreezeReverbCrossfade = 0.5;
    this.spectralFreezeOutputLeftPtr = 0;
    this.spectralFreezeOutputRightPtr = 0;
    this.reverbInputLeftPtr = 0;
    this.reverbInputRightPtr = 0;
    this.reverbOutputLeftPtr = 0;
    this.reverbOutputRightPtr = 0;
    this.sourceModule = 0;
    this.sourceModuleType = 0;
    this.sourceModuleTapCount = 0;
    this.sourceKind = '';
    this.sourceDryGain = 1;
    this.sourceReverbSendGain = 0;
    this.sourceDelayASendGain = 0;
    this.sourceDelayBSendGain = 0;
    this.sourceGranularSendGain = 0;
    this.sourceDryGainTarget = 1;
    this.sourceReverbSendGainTarget = 0;
    this.sourceDelayASendGainTarget = 0;
    this.sourceDelayBSendGainTarget = 0;
    this.sourceGranularSendGainTarget = 0;
    this.sourceGainRampRemainingSamples = 0;
    this.sourceLeadIndex = 0;
    this.sourceBaseParams = [];
    this.sourceNoteKey = '';
    this.sourceChordSets = [];
    this.sourceChordIndex = 0;
    this.sourceChordIntervalSamples = 0;
    this.sourceSamplesUntilChord = 0;
    this.sourcePendingNotes = [];
    this.sourcePendingNoteOffs = [];
    this.sourceTapLeftPtrs = [];
    this.sourceTapRightPtrs = [];
    this.noteParamsOverrideActiveByModule = new Map();
    this.externalReverbInputActive = false;
    this.externalDelayAInputActive = false;
    this.externalDelayBInputActive = false;
    this.externalGranularInputActive = false;
    this.auxSourceSlots = KESSHO_AUX_SOURCE_SLOT_IDS.map((slotId) => this.createSourceSlot(slotId));
    this.padPostChains = [
      this.createPadPostChain(),
      this.createPadPostChain(),
    ];
    this.left = null;
    this.right = null;
    this.mixLeft = null;
    this.mixRight = null;
    this.mixerMode = '';
    this.frames = 128;
    this.renderMode = 0;
    this.smokeFrequency = 220;
    this.smokeAmplitude = 0.125;
    this.perfEnabled = false;
    this.perfBlocks = 0;
    this.perfSumMs = 0;
    this.perfPeakMs = 0;
    this.perfMisses = 0;

    this.port.onmessage = (event) => this.handleMessage(event.data);
    this.load(options.processorOptions?.wasmBinary, options.processorOptions?.wasmUrl || 'kessho_core.wasm');
  }

  normalizeWasmBinary(wasmBinary) {
    if (wasmBinary instanceof ArrayBuffer) return wasmBinary;
    if (ArrayBuffer.isView(wasmBinary)) {
      return wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength);
    }
    return null;
  }

  async fetchWasmBinary(wasmUrl) {
    if (typeof fetch !== 'function') {
      throw new Error('Missing KesshoCore WASM binary');
    }

    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`KesshoCore WASM fetch failed: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  async load(wasmBinary, wasmUrl) {
    try {
      const bytes = this.normalizeWasmBinary(wasmBinary) || await this.fetchWasmBinary(wasmUrl);
      const importObject = {
        env: {
          emscripten_notify_memory_growth: () => {},
          abort: () => {},
        },
        wasi_snapshot_preview1: {
          fd_write: () => 0,
          fd_seek: () => 0,
          fd_close: () => 0,
          proc_exit: () => {},
          environ_get: () => 0,
          environ_sizes_get: () => 0,
          clock_time_get: () => 0,
        },
      };

      const { instance } = await WebAssembly.instantiate(bytes, importObject);
      this.exports = instance.exports;
      this.api = {
        malloc: this.resolve('malloc'),
        create: this.resolve('kessho_create'),
        start: this.resolve('kessho_start'),
        stop: this.resolve('kessho_stop'),
        render: this.resolve('kessho_render'),
        applySnapshot: this.resolve('kessho_apply_snapshot_v1'),
        setRenderMode: this.resolve('kessho_set_render_mode'),
        setSmokeTone: this.resolve('kessho_set_smoke_tone'),
        pushParamEvent: this.resolve('kessho_push_param_event'),
        pushMidiEvent: this.resolve('kessho_push_midi_event'),
        pushTransportEvent: this.resolve('kessho_push_transport_event'),
        getEventQueueDepth: this.resolve('kessho_get_event_queue_depth'),
        moduleCreate: this.resolve('kessho_module_create'),
        moduleDestroy: this.resolve('kessho_module_destroy'),
        moduleReset: this.resolve('kessho_module_reset'),
        moduleGetParamsPtr: this.resolve('kessho_module_get_params_ptr'),
        moduleGetParamCount: this.resolve('kessho_module_get_param_count'),
        moduleGetOutputTapCount: this.resolve('kessho_module_get_output_tap_count'),
        moduleCommitParams: this.resolve('kessho_module_commit_params'),
        moduleNoteOn: this.resolve('kessho_module_note_on'),
        moduleNoteOff: this.resolve('kessho_module_note_off'),
        moduleKillVoice: this.resolve('kessho_module_kill_voice'),
        moduleAllNotesOff: this.resolve('kessho_module_all_notes_off'),
        moduleProcessInterleaved: this.resolve('kessho_module_process_interleaved'),
        moduleProcessPlanarStereo: this.resolve('kessho_module_process_planar_stereo'),
        moduleProcessPlanarStereoTaps: this.resolve('kessho_module_process_planar_stereo_taps'),
        mixerCreate: this.resolve('kessho_mixer_create'),
        mixerSetRoute: this.resolve('kessho_mixer_set_route'),
        mixerProcessPlanarStereo: this.resolve('kessho_mixer_process_planar_stereo'),
      };

      this.leftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.rightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.mixLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.mixRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.mixerInputLPtrsPtr = this.api.malloc(KESSHO_CORE_MIXER_INPUT_BUS_COUNT * UINT32_BYTES);
      this.mixerInputRPtrsPtr = this.api.malloc(KESSHO_CORE_MIXER_INPUT_BUS_COUNT * UINT32_BYTES);
      this.mixerOutputLPtrsPtr = this.api.malloc(UINT32_BYTES);
      this.mixerOutputRPtrsPtr = this.api.malloc(UINT32_BYTES);
      this.mixerRoutePtr = this.api.malloc(MIXER_ROUTE_BYTES);
      this.snapshotPtr = this.api.malloc(48);
      this.paramEventPtr = this.api.malloc(16);
      this.midiEventPtr = this.api.malloc(36);
      this.transportEventPtr = this.api.malloc(8);
      this.delayAInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.delayAInputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.delayATapLPtrsPtr = this.api.malloc(KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT * UINT32_BYTES);
      this.delayATapRPtrsPtr = this.api.malloc(KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT * UINT32_BYTES);
      this.delayATapLeftPtrs = Array.from(
        { length: KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT },
        () => this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT),
      );
      this.delayATapRightPtrs = Array.from(
        { length: KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT },
        () => this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT),
      );
      this.delayADeferredInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.delayADeferredInputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.delayBInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.delayBInputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.delayBTapLPtrsPtr = this.api.malloc(KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT * UINT32_BYTES);
      this.delayBTapRPtrsPtr = this.api.malloc(KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT * UINT32_BYTES);
      this.delayBTapLeftPtrs = Array.from(
        { length: KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT },
        () => this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT),
      );
      this.delayBTapRightPtrs = Array.from(
        { length: KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT },
        () => this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT),
      );
      this.granularInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.granularInputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.granularOutputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.granularOutputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.spectralFreezeOutputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.spectralFreezeOutputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.reverbInputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.reverbInputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.reverbOutputLeftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.reverbOutputRightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      this.sourceTapLeftPtrs = Array.from(
        { length: KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT },
        () => this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT),
      );
      this.sourceTapRightPtrs = Array.from(
        { length: KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT },
        () => this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT),
      );
      for (const slot of this.auxSourceSlots) {
        slot.leftPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
        slot.rightPtr = this.api.malloc(this.frames * Float32Array.BYTES_PER_ELEMENT);
      }
      this.engine = this.api.create(sampleRate, this.frames);
      this.mixer = this.api.mixerCreate();
      if (
        !this.leftPtr ||
        !this.rightPtr ||
        !this.mixLeftPtr ||
        !this.mixRightPtr ||
        !this.mixerInputLPtrsPtr ||
        !this.mixerInputRPtrsPtr ||
        !this.mixerOutputLPtrsPtr ||
        !this.mixerOutputRPtrsPtr ||
        !this.mixerRoutePtr ||
        !this.snapshotPtr ||
        !this.paramEventPtr ||
        !this.midiEventPtr ||
        !this.transportEventPtr ||
        !this.delayAInputLeftPtr ||
        !this.delayAInputRightPtr ||
        !this.delayATapLPtrsPtr ||
        !this.delayATapRPtrsPtr ||
        this.delayATapLeftPtrs.some((ptr) => !ptr) ||
        this.delayATapRightPtrs.some((ptr) => !ptr) ||
        !this.delayADeferredInputLeftPtr ||
        !this.delayADeferredInputRightPtr ||
        !this.delayBInputLeftPtr ||
        !this.delayBInputRightPtr ||
        !this.delayBTapLPtrsPtr ||
        !this.delayBTapRPtrsPtr ||
        this.delayBTapLeftPtrs.some((ptr) => !ptr) ||
        this.delayBTapRightPtrs.some((ptr) => !ptr) ||
        !this.granularInputLeftPtr ||
        !this.granularInputRightPtr ||
        !this.granularOutputLeftPtr ||
        !this.granularOutputRightPtr ||
        !this.spectralFreezeOutputLeftPtr ||
        !this.spectralFreezeOutputRightPtr ||
        !this.reverbInputLeftPtr ||
        !this.reverbInputRightPtr ||
        !this.reverbOutputLeftPtr ||
        !this.reverbOutputRightPtr ||
        this.sourceTapLeftPtrs.some((ptr) => !ptr) ||
        this.sourceTapRightPtrs.some((ptr) => !ptr) ||
        this.auxSourceSlots.some((slot) => !slot.leftPtr || !slot.rightPtr) ||
        !this.engine ||
        !this.mixer
      ) {
        throw new Error('Failed to allocate KesshoCore worklet state');
      }

      this.heap = new Float32Array(this.exports.memory.buffer);
      this.view = new DataView(this.exports.memory.buffer);
      this.heap.fill(0, this.delayADeferredInputLeftPtr >> 2, (this.delayADeferredInputLeftPtr >> 2) + this.frames);
      this.heap.fill(0, this.delayADeferredInputRightPtr >> 2, (this.delayADeferredInputRightPtr >> 2) + this.frames);
      this.configureMixerMainRoute();
      this.left = new Float32Array(this.exports.memory.buffer, this.leftPtr, this.frames);
      this.right = new Float32Array(this.exports.memory.buffer, this.rightPtr, this.frames);
      this.mixLeft = new Float32Array(this.exports.memory.buffer, this.mixLeftPtr, this.frames);
      this.mixRight = new Float32Array(this.exports.memory.buffer, this.mixRightPtr, this.frames);
      for (const slot of this.auxSourceSlots) {
        slot.left = new Float32Array(this.exports.memory.buffer, slot.leftPtr, this.frames);
        slot.right = new Float32Array(this.exports.memory.buffer, slot.rightPtr, this.frames);
      }

      this.api.setRenderMode(this.engine, this.renderMode);
      this.api.setSmokeTone(this.engine, this.smokeFrequency, this.smokeAmplitude);
      this.api.start(this.engine);
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  resolve(name) {
    const direct = this.exports?.[name];
    const underscored = this.exports?.[`_${name}`];
    const fn = direct || underscored;
    if (typeof fn !== 'function') {
      throw new Error(`Missing KesshoCore export: ${name}`);
    }

    return fn;
  }

  refreshMemoryViews() {
    const buffer = this.exports?.memory?.buffer;
    if (!buffer) return;
    if (this.heap?.buffer === buffer && this.view?.buffer === buffer) return;

    this.heap = new Float32Array(buffer);
    this.view = new DataView(buffer);
    if (this.leftPtr) this.left = new Float32Array(buffer, this.leftPtr, this.frames);
    if (this.rightPtr) this.right = new Float32Array(buffer, this.rightPtr, this.frames);
    if (this.mixLeftPtr) this.mixLeft = new Float32Array(buffer, this.mixLeftPtr, this.frames);
    if (this.mixRightPtr) this.mixRight = new Float32Array(buffer, this.mixRightPtr, this.frames);
    for (const slot of this.auxSourceSlots || []) {
      if (slot.leftPtr) slot.left = new Float32Array(buffer, slot.leftPtr, this.frames);
      if (slot.rightPtr) slot.right = new Float32Array(buffer, slot.rightPtr, this.frames);
    }
  }

  createSourceSlot(slotId) {
    return {
      slotId,
      module: 0,
      moduleType: 0,
      moduleTapCount: 0,
      kind: '',
      dryGain: 1,
      reverbSendGain: 0,
      delayASendGain: 0,
      delayBSendGain: 0,
      granularSendGain: 0,
      dryGainTarget: 1,
      reverbSendGainTarget: 0,
      delayASendGainTarget: 0,
      delayBSendGainTarget: 0,
      granularSendGainTarget: 0,
      sendsPreDry: true,
      gainRampRemainingSamples: 0,
      leadIndex: 0,
      baseParams: [],
      noteKey: '',
      chordSets: [],
      chordIndex: 0,
      chordIntervalSamples: 0,
      samplesUntilChord: 0,
      pendingNotes: [],
      pendingNoteOffs: [],
      leftPtr: 0,
      rightPtr: 0,
      left: null,
      right: null,
      postChain: this.createPadPostChain(),
    };
  }

  createPadPostChain() {
    return {
      postLpfHz: 18000,
      stereoWidth: 1,
      coeffKey: '',
      b0: 1,
      b1: 0,
      b2: 0,
      a1: 0,
      a2: 0,
      stages: 1,
      left: { x1: 0, x2: 0, y1: 0, y2: 0 },
      right: { x1: 0, x2: 0, y1: 0, y2: 0 },
      left2: { x1: 0, x2: 0, y1: 0, y2: 0 },
      right2: { x1: 0, x2: 0, y1: 0, y2: 0 },
    };
  }

  configurePadPostChain(chain, postLpfHz, stereoWidth, postLpfStages = 1) {
    const nextPostLpfHz = Number(postLpfHz);
    const nextStereoWidth = Number(stereoWidth);
    const nextStages = Math.round(Number(postLpfStages) || 1);
    chain.postLpfHz = Number.isFinite(nextPostLpfHz)
      ? Math.max(20, Math.min(20000, nextPostLpfHz))
      : chain.postLpfHz;
    chain.stereoWidth = Number.isFinite(nextStereoWidth)
      ? Math.max(0, Math.min(1, nextStereoWidth))
      : chain.stereoWidth;
    chain.stages = Math.max(1, Math.min(2, nextStages));
    this.updatePadPostLpfCoefficients(chain);
  }

  updatePadPostLpfCoefficients(chain) {
    const cutoff = Math.max(20, Math.min(sampleRate * 0.499, Number(chain.postLpfHz) || 18000));
    const key = cutoff.toFixed(3);
    if (chain.coeffKey === key) return;

    const omega = (2 * Math.PI * cutoff) / sampleRate;
    const sin = Math.sin(omega);
    const cos = Math.cos(omega);
    const alpha = sin / (2 * WEB_AUDIO_LOW_PASS_Q_0_7);
    const a0 = 1 + alpha;
    chain.b0 = ((1 - cos) * 0.5) / a0;
    chain.b1 = (1 - cos) / a0;
    chain.b2 = ((1 - cos) * 0.5) / a0;
    chain.a1 = (-2 * cos) / a0;
    chain.a2 = (1 - alpha) / a0;
    chain.coeffKey = key;
  }

  processPadPostLpfSample(chain, state, input) {
    const y =
      chain.b0 * input +
      chain.b1 * state.x1 +
      chain.b2 * state.x2 -
      chain.a1 * state.y1 -
      chain.a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = input;
    state.y2 = state.y1;
    state.y1 = Number.isFinite(y) ? y : 0;
    return state.y1;
  }

  processPostChain(chain, leftPtr, rightPtr, frames) {
    if (!chain || !leftPtr || !rightPtr) return;
    this.updatePadPostLpfCoefficients(chain);
    const direct = 0.5 * (1 + chain.stereoWidth);
    const cross = 0.5 * (1 - chain.stereoWidth);
    const leftOffset = leftPtr >> 2;
    const rightOffset = rightPtr >> 2;

    for (let i = 0; i < frames; i += 1) {
      let filteredLeft = this.processPadPostLpfSample(chain, chain.left, this.heap[leftOffset + i]);
      let filteredRight = this.processPadPostLpfSample(chain, chain.right, this.heap[rightOffset + i]);
      if ((chain.stages || 1) > 1) {
        filteredLeft = this.processPadPostLpfSample(chain, chain.left2, filteredLeft);
        filteredRight = this.processPadPostLpfSample(chain, chain.right2, filteredRight);
      }
      this.heap[leftOffset + i] = filteredLeft * direct + filteredRight * cross;
      this.heap[rightOffset + i] = filteredLeft * cross + filteredRight * direct;
    }
  }

  processPadPostChain(padIndex, leftPtr, rightPtr, frames) {
    this.processPostChain(this.padPostChains[padIndex], leftPtr, rightPtr, frames);
  }

  createReverbPreCompressor() {
    return {
      thresholdDb: -36,
      kneeDb: 20,
      ratio: 5,
      attackMs: 0.7,
      releaseMs: 700,
      gain: 1,
      attackCoeff: 0,
      releaseCoeff: 0,
      nativeAutoMakeup: 1,
    };
  }

  configureReverbPreCompressor(thresholdDb, kneeDb, ratio, attackMs, releaseMs) {
    const comp = this.reverbPreComp;
    comp.thresholdDb = Number.isFinite(Number(thresholdDb))
      ? Math.max(-60, Math.min(0, Number(thresholdDb)))
      : comp.thresholdDb;
    comp.kneeDb = Number.isFinite(Number(kneeDb))
      ? Math.max(0, Math.min(40, Number(kneeDb)))
      : comp.kneeDb;
    comp.ratio = Number.isFinite(Number(ratio))
      ? Math.max(1, Math.min(20, Number(ratio)))
      : comp.ratio;
    comp.attackMs = Number.isFinite(Number(attackMs))
      ? Math.max(0.1, Math.min(30, Number(attackMs)))
      : comp.attackMs;
    comp.releaseMs = Number.isFinite(Number(releaseMs))
      ? Math.max(20, Math.min(1000, Number(releaseMs)))
      : comp.releaseMs;
    comp.attackCoeff = Math.exp(-1 / Math.max(1, (comp.attackMs / 1000) * sampleRate));
    comp.releaseCoeff = Math.exp(-1 / Math.max(1, (comp.releaseMs / 1000) * sampleRate));
    const ratioDepth = Math.max(0, Math.min(1, (comp.ratio - 1) / 4));
    comp.nativeAutoMakeup = 1 + ratioDepth * 0.18;
  }

  compressorGainDbForLevel(levelDb) {
    const comp = this.reverbPreComp;
    const threshold = comp.thresholdDb;
    const knee = comp.kneeDb;
    const ratio = comp.ratio;
    if (ratio <= 1) return 0;
    const strength = 0.04;
    if (knee <= 0) {
      if (levelDb <= threshold) return 0;
      return ((threshold + (levelDb - threshold) / ratio) - levelDb) * strength;
    }

    const lower = threshold - knee * 0.5;
    const upper = threshold + knee * 0.5;
    if (levelDb <= lower) return 0;
    if (levelDb >= upper) {
      return ((threshold + (levelDb - threshold) / ratio) - levelDb) * strength;
    }

    const x = levelDb - lower;
    return ((1 / ratio) - 1) * x * x / (2 * knee) * strength;
  }

  processReverbPreCompressorSample(left, right) {
    const comp = this.reverbPreComp;
    const detector = Math.max(Math.abs(left), Math.abs(right), 1e-9);
    const levelDb = 20 * Math.log10(detector);
    const targetGain = Math.pow(10, this.compressorGainDbForLevel(levelDb) / 20);
    const coeff = targetGain < comp.gain ? comp.attackCoeff : comp.releaseCoeff;
    comp.gain = targetGain + (comp.gain - targetGain) * coeff;
    return comp.gain * comp.nativeAutoMakeup;
  }

  softLimitReverbFeedSample(value) {
    const limit = 1.047;
    const abs = Math.abs(value);
    if (abs <= limit) return value;
    return Math.sign(value) * (limit + Math.tanh((abs - limit) * 6) * 0.005);
  }

  clearReverbInputDelay() {
    this.reverbInputDelayLeft.fill(0);
    this.reverbInputDelayRight.fill(0);
    this.reverbInputDelayIndex = 0;
    this.reverbDelayedInputLeft = 0;
    this.reverbDelayedInputRight = 0;
  }

  processReverbInputDelaySample(left, right) {
    const delaySamples = this.reverbInputLookaheadSamples;
    if (delaySamples <= 0) {
      this.reverbDelayedInputLeft = left;
      this.reverbDelayedInputRight = right;
      return;
    }

    const index = this.reverbInputDelayIndex;
    this.reverbDelayedInputLeft = this.reverbInputDelayLeft[index] || 0;
    this.reverbDelayedInputRight = this.reverbInputDelayRight[index] || 0;
    this.reverbInputDelayLeft[index] = left;
    this.reverbInputDelayRight[index] = right;
    this.reverbInputDelayIndex = (index + 1) % delaySamples;
  }

  setMixerInputBus(bus, leftPtr, rightPtr) {
    const offset = bus * UINT32_BYTES;
    this.view.setUint32(this.mixerInputLPtrsPtr + offset, leftPtr, true);
    this.view.setUint32(this.mixerInputRPtrsPtr + offset, rightPtr, true);
  }

  setMixerRoute(routeIndex, sourceBus, targetBus, gainL, gainR, enabled) {
    this.view.setUint32(this.mixerRoutePtr, sourceBus, true);
    this.view.setUint32(this.mixerRoutePtr + 4, targetBus, true);
    this.view.setFloat32(this.mixerRoutePtr + 8, gainL, true);
    this.view.setFloat32(this.mixerRoutePtr + 12, gainR, true);
    this.view.setUint32(this.mixerRoutePtr + 16, enabled ? 1 : 0, true);
    return this.api.mixerSetRoute(this.mixer, routeIndex, this.mixerRoutePtr) === 1;
  }

  configureMixerMainRoute() {
    this.setMixerInputBus(0, this.leftPtr, this.rightPtr);
    this.view.setUint32(this.mixerOutputLPtrsPtr, this.mixLeftPtr, true);
    this.view.setUint32(this.mixerOutputRPtrsPtr, this.mixRightPtr, true);
    const routeOk = this.setMixerRoute(0, 0, 0, 1.0, 1.0, true) &&
      this.setMixerRoute(1, 0, 0, 0.0, 0.0, false) &&
      this.setMixerRoute(2, 0, 0, 0.0, 0.0, false) &&
      this.setMixerRoute(3, 0, 0, 0.0, 0.0, false);
    if (!routeOk) {
      throw new Error('Failed to configure KesshoCore mixer route');
    }
    this.mixerMode = 'main';
  }

  configureMixerPadRoutes() {
    for (let bus = 0; bus < KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT; bus += 1) {
      this.setMixerInputBus(bus, this.sourceTapLeftPtrs[bus], this.sourceTapRightPtrs[bus]);
    }
    this.setMixerInputBus(KESSHO_CORE_REVERB_BUS, this.reverbOutputLeftPtr, this.reverbOutputRightPtr);
    this.setMixerInputBus(
      KESSHO_CORE_DELAY_A_BUS,
      this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN],
      this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN],
    );
    this.view.setUint32(this.mixerOutputLPtrsPtr, this.mixLeftPtr, true);
    this.view.setUint32(this.mixerOutputRPtrsPtr, this.mixRightPtr, true);
    const routeOk = this.setMixerRoute(0, KESSHO_MODULE_TAP_POSTFADER_PAD1, 0, 1.0, 1.0, true) &&
      this.setMixerRoute(1, KESSHO_MODULE_TAP_POSTFADER_PAD2, 0, 1.0, 1.0, true) &&
      this.setMixerRoute(
        2,
        KESSHO_CORE_REVERB_BUS,
        0,
        this.reverbReturnGain,
        this.reverbReturnGain,
        this.reverbModule && this.reverbReturnGain > 0.0001,
      ) &&
      this.setMixerRoute(
        3,
        KESSHO_CORE_DELAY_A_BUS,
        0,
        1.0,
        1.0,
        this.delayAModule,
      );
    if (!routeOk) {
      throw new Error('Failed to configure KesshoCore pad tap mixer routes');
    }
    this.mixerMode = 'pad';
  }

  configureMixerLeadRoutes() {
    this.setMixerInputBus(0, this.leftPtr, this.rightPtr);
    this.setMixerInputBus(KESSHO_CORE_REVERB_BUS, this.reverbOutputLeftPtr, this.reverbOutputRightPtr);
    this.setMixerInputBus(
      KESSHO_CORE_DELAY_A_BUS,
      this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN],
      this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN],
    );
    this.view.setUint32(this.mixerOutputLPtrsPtr, this.mixLeftPtr, true);
    this.view.setUint32(this.mixerOutputRPtrsPtr, this.mixRightPtr, true);
    const routeOk = this.setMixerRoute(0, 0, 0, 1.0, 1.0, true) &&
      this.setMixerRoute(1, 0, 0, 0.0, 0.0, false) &&
      this.setMixerRoute(
        2,
        KESSHO_CORE_REVERB_BUS,
        0,
        this.reverbReturnGain,
        this.reverbReturnGain,
        this.reverbModule && this.reverbReturnGain > 0.0001,
      ) &&
      this.setMixerRoute(
        3,
        KESSHO_CORE_DELAY_A_BUS,
        0,
        1.0,
        1.0,
        this.delayAModule,
      );
    if (!routeOk) {
      throw new Error('Failed to configure KesshoCore lead mixer routes');
    }
    this.mixerMode = 'lead';
  }

  ensureMixerMode(mode) {
    if (this.mixerMode === mode) {
      return true;
    }

    try {
      if (mode === 'pad') {
        this.configureMixerPadRoutes();
      } else if (mode === 'lead') {
        this.configureMixerLeadRoutes();
      } else {
        this.configureMixerMainRoute();
      }
      return true;
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  processMixerRoute(frames, inputBusCount) {
    return this.api.mixerProcessPlanarStereo(
      this.mixer,
      this.mixerInputLPtrsPtr,
      this.mixerInputRPtrsPtr,
      inputBusCount,
      this.mixerOutputLPtrsPtr,
      this.mixerOutputRPtrsPtr,
      1,
      frames,
    ) === 1;
  }

  clearOutput(output, frames) {
    if (!output || output.length === 0) return;
    const left = output[0];
    const right = output[1] || output[0];
    if (left) left.fill(0, 0, frames);
    if (right && right !== left) right.fill(0, 0, frames);
  }

  copyPlanarPtrsToOutput(output, leftPtr, rightPtr, frames, gain = 1) {
    if (!output || output.length === 0 || !leftPtr || !rightPtr || !this.heap) return;
    const left = output[0];
    const right = output[1] || output[0];
    if (!left) return;
    const leftOffset = leftPtr >> 2;
    const rightOffset = rightPtr >> 2;
    const safeGain = Number.isFinite(gain) ? gain : 1;
    for (let i = 0; i < frames; i += 1) {
      left[i] = (this.heap[leftOffset + i] || 0) * safeGain;
      if (right !== left) right[i] = (this.heap[rightOffset + i] || 0) * safeGain;
    }
  }

  sampleOffset(value) {
    const offset = Number(value);
    return Number.isFinite(offset) && offset > 0 ? Math.min(0x3fffffff, Math.floor(offset)) : 0;
  }

  writeParamEvent(sampleOffset, paramId, value, rampFrames = 0) {
    this.view.setUint32(this.paramEventPtr, this.sampleOffset(sampleOffset), true);
    this.view.setUint32(this.paramEventPtr + 4, paramId, true);
    this.view.setFloat32(this.paramEventPtr + 8, Number(value) || 0, true);
    this.view.setUint32(this.paramEventPtr + 12, this.sampleOffset(rampFrames), true);
    return this.api.pushParamEvent(this.engine, this.paramEventPtr) === 1;
  }

  writeTransportEvent(sampleOffset, command) {
    this.view.setUint32(this.transportEventPtr, this.sampleOffset(sampleOffset), true);
    this.view.setUint32(this.transportEventPtr + 4, command, true);
    return this.api.pushTransportEvent(this.engine, this.transportEventPtr) === 1;
  }

  writeMidiEvent(event) {
    if (!event || typeof event !== 'object') return false;
    const rawBytes = Array.isArray(event.rawBytes) ? event.rawBytes.slice(0, 16) : [];
    this.view.setUint32(this.midiEventPtr, this.sampleOffset(event.sampleOffset), true);
    this.view.setUint32(this.midiEventPtr + 4, Number(event.sourceId) >>> 0, true);
    this.view.setUint8(this.midiEventPtr + 8, Number(event.status) & 0xff);
    this.view.setUint8(this.midiEventPtr + 9, Number(event.channel) & 0xff);
    this.view.setUint8(this.midiEventPtr + 10, Number(event.data1) & 0xff);
    this.view.setUint8(this.midiEventPtr + 11, Number(event.data2) & 0xff);
    this.view.setFloat32(this.midiEventPtr + 12, Number(event.normalizedValue) || 0, true);
    this.view.setUint8(this.midiEventPtr + 16, rawBytes.length);
    for (let i = 0; i < 16; i += 1) {
      this.view.setUint8(this.midiEventPtr + 17 + i, Number(rawBytes[i]) & 0xff);
    }
    return this.api.pushMidiEvent(this.engine, this.midiEventPtr) === 1;
  }

  writeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    this.view.setUint32(this.snapshotPtr, Number(snapshot.version) || 0, true);
    this.view.setUint32(this.snapshotPtr + 4, Number(snapshot.schemaHash) || 0, true);
    this.view.setFloat32(this.snapshotPtr + 8, Number(snapshot.bpm) || 120, true);
    this.view.setFloat32(this.snapshotPtr + 12, Number(snapshot.masterGain) || 0, true);
    this.view.setInt32(this.snapshotPtr + 16, Number(snapshot.renderMode) || 0, true);
    this.view.setFloat32(this.snapshotPtr + 20, Number(snapshot.smokeFrequencyHz) || 0, true);
    this.view.setFloat32(this.snapshotPtr + 24, Number(snapshot.smokeAmplitude) || 0, true);
    this.view.setUint32(this.snapshotPtr + 28, Number(snapshot.flags) || 0, true);
    this.view.setUint32(this.snapshotPtr + 32, Number(snapshot.beatsPerBar) || 4, true);
    this.view.setUint32(this.snapshotPtr + 36, Number(snapshot.barsPerPhrase) || 4, true);
    this.view.setUint32(this.snapshotPtr + 40, Number(snapshot.seed) || 1, true);
    this.view.setUint32(this.snapshotPtr + 44, Number(snapshot.reserved0) || 0, true);
    return this.api.applySnapshot(this.engine, this.snapshotPtr) === 1;
  }

  postQueueFailure(kind) {
    this.port.postMessage({ type: 'queue-error', kind });
  }

  configureDynamicsModule(message) {
    const enabled = Boolean(message.enabled);
    if (!enabled) {
      if (this.dynamicsModule) {
        this.api.moduleDestroy(this.dynamicsModule);
        this.dynamicsModule = 0;
      }
      return;
    }

    if (!this.dynamicsModule) {
      this.dynamicsModule = this.api.moduleCreate(1, sampleRate, this.frames);
      if (!this.dynamicsModule) {
        this.postQueueFailure('dynamicsModule');
        return;
      }
      this.refreshMemoryViews();
    }

    const paramsPtr = this.api.moduleGetParamsPtr(this.dynamicsModule);
    if (!paramsPtr) {
      this.postQueueFailure('dynamicsModuleParams');
      return;
    }

    const offset = paramsPtr >> 2;
    const params = Array.isArray(message.params) ? message.params : [];
    for (let i = 0; i < 82; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    this.api.moduleCommitParams(this.dynamicsModule);
  }

  configureReverbModule(message) {
    const enabled = Boolean(message.enabled);
    this.reverbPad1SendGain = Number(message.pad1SendGain) || 0;
    this.reverbPad2SendGain = Number(message.pad2SendGain) || 0;
    this.reverbInputMakeupGain = Number.isFinite(Number(message.inputMakeupGain))
      ? Math.max(0, Number(message.inputMakeupGain))
      : 1;
    this.configureReverbPreCompressor(
      message.preCompThresholdDb,
      message.preCompKneeDb,
      message.preCompRatio,
      message.preCompAttackMs,
      message.preCompReleaseMs,
    );
    this.reverbReturnGain = Number(message.returnGain) || 0;
    this.mixerMode = '';

    if (!enabled) {
      if (this.reverbModule) {
        this.api.moduleDestroy(this.reverbModule);
        this.reverbModule = 0;
      }
      this.reverbParamCount = 0;
      this.clearReverbInputDelay();
      return;
    }

    if (!this.reverbModule) {
      this.reverbModule = this.api.moduleCreate(KESSHO_MODULE_REVERB, sampleRate, this.frames);
      if (!this.reverbModule) {
        this.postQueueFailure('reverbModule');
        return;
      }
      this.refreshMemoryViews();
      this.reverbParamCount = this.api.moduleGetParamCount(this.reverbModule);
      this.clearReverbInputDelay();
    }

    const paramsPtr = this.api.moduleGetParamsPtr(this.reverbModule);
    if (!paramsPtr || this.reverbParamCount <= 0) {
      this.postQueueFailure('reverbModuleParams');
      return;
    }

    const params = Array.isArray(message.params) ? message.params : [];
    const offset = paramsPtr >> 2;
    const count = Math.min(this.reverbParamCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < this.reverbParamCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    this.api.moduleCommitParams(this.reverbModule);
  }

  configureDelayAModule(message) {
    const enabled = Boolean(message.enabled);
    this.delayAPad1SendGain = Number(message.pad1SendGain) || 0;
    this.delayAPad2SendGain = Number(message.pad2SendGain) || 0;
    this.delayALead1SendGain = Number(message.lead1SendGain) || 0;
    this.delayALead2SendGain = Number(message.lead2SendGain) || 0;
    this.delayADrumSendGain = Number(message.drumSendGain) || 0;
    this.delayASoundscapeSendGain = Number(message.soundscapeSendGain) || 0;
    this.mixerMode = '';

    if (!enabled) {
      if (this.delayAModule) {
        this.api.moduleDestroy(this.delayAModule);
        this.delayAModule = 0;
      }
      this.delayAParamCount = 0;
      return;
    }

    if (!this.delayAModule) {
      this.delayAModule = this.api.moduleCreate(KESSHO_MODULE_DELAY_A, sampleRate, this.frames);
      if (!this.delayAModule) {
        this.postQueueFailure('delayAModule');
        return;
      }
      this.refreshMemoryViews();
      this.delayAParamCount = this.api.moduleGetParamCount(this.delayAModule);
      if (this.api.moduleGetOutputTapCount(this.delayAModule) < KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT) {
        this.postQueueFailure('delayAModuleTaps');
        this.api.moduleDestroy(this.delayAModule);
        this.delayAModule = 0;
        this.delayAParamCount = 0;
        return;
      }
    }

    const paramsPtr = this.api.moduleGetParamsPtr(this.delayAModule);
    if (!paramsPtr || this.delayAParamCount <= 0) {
      this.postQueueFailure('delayAModuleParams');
      return;
    }

    const params = Array.isArray(message.params) ? message.params : [];
    const offset = paramsPtr >> 2;
    const count = Math.min(this.delayAParamCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < this.delayAParamCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    this.api.moduleCommitParams(this.delayAModule);
  }

  configureDelayBModule(message) {
    const enabled = Boolean(message.enabled);
    this.delayBPad1SendGain = Number(message.pad1SendGain) || 0;
    this.delayBPad2SendGain = Number(message.pad2SendGain) || 0;
    this.delayBLead1SendGain = Number(message.lead1SendGain) || 0;
    this.delayBLead2SendGain = Number(message.lead2SendGain) || 0;
    this.delayBDrumSendGain = Number(message.drumSendGain) || 0;
    this.delayBSoundscapeSendGain = Number(message.soundscapeSendGain) || 0;
    this.delayBGranularInputGain = Number(message.granularInputGain) || 0;

    if (!enabled) {
      if (this.delayBModule) {
        this.api.moduleDestroy(this.delayBModule);
        this.delayBModule = 0;
      }
      this.delayBParamCount = 0;
      return;
    }

    if (!this.delayBModule) {
      this.delayBModule = this.api.moduleCreate(KESSHO_MODULE_DELAY_B, sampleRate, this.frames);
      if (!this.delayBModule) {
        this.postQueueFailure('delayBModule');
        return;
      }
      this.refreshMemoryViews();
      this.delayBParamCount = this.api.moduleGetParamCount(this.delayBModule);
      if (this.api.moduleGetOutputTapCount(this.delayBModule) < KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT) {
        this.postQueueFailure('delayBModuleTaps');
        this.api.moduleDestroy(this.delayBModule);
        this.delayBModule = 0;
        this.delayBParamCount = 0;
        return;
      }
    }

    const paramsPtr = this.api.moduleGetParamsPtr(this.delayBModule);
    if (!paramsPtr || this.delayBParamCount <= 0) {
      this.postQueueFailure('delayBModuleParams');
      return;
    }

    const params = Array.isArray(message.params) ? message.params : [];
    const offset = paramsPtr >> 2;
    const count = Math.min(this.delayBParamCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < this.delayBParamCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    this.api.moduleCommitParams(this.delayBModule);
  }

  configureGranularModule(message) {
    const enabled = Boolean(message.enabled);
    this.granularPad1SendGain = Number(message.pad1SendGain) || 0;
    this.granularPad2SendGain = Number(message.pad2SendGain) || 0;
    this.granularLead1SendGain = Number(message.lead1SendGain) || 0;
    this.granularLead2SendGain = Number(message.lead2SendGain) || 0;
    this.granularDrumSendGain = Number(message.drumSendGain) || 0;
    this.granularSoundscapeSendGain = Number(message.soundscapeSendGain) || 0;
    this.granularDelayASendGain = Number(message.delayASendGain) || 0;
    this.granularOutputGain = Number(message.outputGain) || 0;
    this.granularReverbSendGain = Number(message.reverbSendGain) || 0;
    this.granularDelayAOutputSendGain = Number(message.delayAOutputSendGain) || 0;
    this.configurePadPostChain(this.granularPostChain, message.outputLpfHz, 1);

    if (!enabled) {
      if (this.granularModule) {
        this.api.moduleDestroy(this.granularModule);
        this.granularModule = 0;
      }
      this.granularParamCount = 0;
      return;
    }

    if (!this.granularModule) {
      this.granularModule = this.api.moduleCreate(KESSHO_MODULE_GRANULAR, sampleRate, this.frames);
      if (!this.granularModule) {
        this.postQueueFailure('granularModule');
        return;
      }
      this.refreshMemoryViews();
      this.granularParamCount = this.api.moduleGetParamCount(this.granularModule);
    }

    const paramsPtr = this.api.moduleGetParamsPtr(this.granularModule);
    if (!paramsPtr || this.granularParamCount <= 0) {
      this.postQueueFailure('granularModuleParams');
      return;
    }

    const params = Array.isArray(message.params) ? message.params : [];
    const offset = paramsPtr >> 2;
    const count = Math.min(this.granularParamCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < this.granularParamCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    this.api.moduleCommitParams(this.granularModule);
  }

  configureSpectralFreezeModule(message) {
    const enabled = Boolean(message.enabled);
    this.spectralFreezeRouting = message.routing === 'post' ? 'post' : 'pre';
    this.spectralFreezeReverbCrossfade = Number.isFinite(Number(message.reverbCrossfade))
      ? Math.max(0, Math.min(1, Number(message.reverbCrossfade)))
      : 0.5;

    if (!enabled) {
      if (this.spectralFreezeModule) {
        this.api.moduleDestroy(this.spectralFreezeModule);
        this.spectralFreezeModule = 0;
      }
      this.spectralFreezeParamCount = 0;
      return;
    }

    if (!this.spectralFreezeModule) {
      this.spectralFreezeModule = this.api.moduleCreate(KESSHO_MODULE_SPECTRAL_FREEZE, sampleRate, this.frames);
      if (!this.spectralFreezeModule) {
        this.postQueueFailure('spectralFreezeModule');
        return;
      }
      this.refreshMemoryViews();
      this.spectralFreezeParamCount = this.api.moduleGetParamCount(this.spectralFreezeModule);
    }

    const paramsPtr = this.api.moduleGetParamsPtr(this.spectralFreezeModule);
    if (!paramsPtr || this.spectralFreezeParamCount <= 0) {
      this.postQueueFailure('spectralFreezeModuleParams');
      return;
    }

    const params = Array.isArray(message.params) ? message.params : [];
    const offset = paramsPtr >> 2;
    const count = Math.min(this.spectralFreezeParamCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < this.spectralFreezeParamCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    this.api.moduleCommitParams(this.spectralFreezeModule);
  }

  resetParityFx() {
    if (this.reverbModule) {
      this.api.moduleReset(this.reverbModule);
      this.reverbResetOnNextInput = true;
    }
    if (this.spectralFreezeModule) {
      this.api.moduleReset(this.spectralFreezeModule);
    }
    this.reverbPreComp.gain = 1;
    this.clearReverbInputDelay();
  }

  sourceKindFromMessage(message) {
    return message.source === 'lead-fm'
      ? 'lead-fm'
      : message.source === 'drum'
        ? 'drum'
        : message.source === 'soundscapes'
          ? 'soundscapes'
          : message.source === 'pad'
            ? 'pad'
            : '';
  }

  moduleTypeForSourceKind(sourceKind) {
    return sourceKind === 'lead-fm'
      ? KESSHO_MODULE_LEAD_FM
      : sourceKind === 'drum'
        ? KESSHO_MODULE_DRUM
        : sourceKind === 'soundscapes'
          ? KESSHO_MODULE_SOUNDSCAPES
          : KESSHO_MODULE_PAD;
  }

  getAuxSourceSlot(slotId) {
    return this.auxSourceSlots.find((slot) => slot.slotId === slotId) || null;
  }

  destroySourceSlot(slot) {
    if (!slot) return;
    if (slot.module) {
      this.noteParamsOverrideActiveByModule?.delete?.(slot.module);
      this.api.moduleDestroy(slot.module);
    }
    slot.module = 0;
    slot.moduleType = 0;
    slot.moduleTapCount = 0;
    slot.kind = '';
    slot.dryGain = 1;
    slot.reverbSendGain = 0;
    slot.delayASendGain = 0;
    slot.delayBSendGain = 0;
    slot.granularSendGain = 0;
    slot.dryGainTarget = 1;
    slot.reverbSendGainTarget = 0;
    slot.delayASendGainTarget = 0;
    slot.delayBSendGainTarget = 0;
    slot.granularSendGainTarget = 0;
    slot.sendsPreDry = true;
    slot.gainRampRemainingSamples = 0;
    slot.leadIndex = 0;
    slot.baseParams = [];
    slot.noteKey = '';
    slot.chordSets = [];
    slot.chordIndex = 0;
    slot.chordIntervalSamples = 0;
    slot.samplesUntilChord = 0;
    slot.pendingNotes = [];
    slot.pendingNoteOffs = [];
  }

  destroySourceModule() {
    if (this.sourceModule) {
      this.noteParamsOverrideActiveByModule?.delete?.(this.sourceModule);
      this.api.moduleDestroy(this.sourceModule);
    }
    this.sourceModule = 0;
    this.sourceModuleType = 0;
    this.sourceModuleTapCount = 0;
    this.sourceKind = '';
    this.sourceDryGain = 1;
    this.sourceReverbSendGain = 0;
    this.sourceDelayASendGain = 0;
    this.sourceDelayBSendGain = 0;
    this.sourceGranularSendGain = 0;
    this.sourceDryGainTarget = 1;
    this.sourceReverbSendGainTarget = 0;
    this.sourceDelayASendGainTarget = 0;
    this.sourceDelayBSendGainTarget = 0;
    this.sourceGranularSendGainTarget = 0;
    this.sourceGainRampRemainingSamples = 0;
    this.sourceLeadIndex = 0;
    this.sourceBaseParams = [];
    this.sourceNoteKey = '';
    this.sourceChordSets = [];
    this.sourceChordIndex = 0;
    this.sourceChordIntervalSamples = 0;
    this.sourceSamplesUntilChord = 0;
    this.sourcePendingNotes = [];
    this.sourcePendingNoteOffs = [];
  }

  setSourceGains(dryGain, reverbSendGain, delayASendGain, delayBSendGain, granularSendGain) {
    this.sourceDryGain = dryGain;
    this.sourceReverbSendGain = reverbSendGain;
    this.sourceDelayASendGain = delayASendGain;
    this.sourceDelayBSendGain = delayBSendGain;
    this.sourceGranularSendGain = granularSendGain;
    this.sourceDryGainTarget = dryGain;
    this.sourceReverbSendGainTarget = reverbSendGain;
    this.sourceDelayASendGainTarget = delayASendGain;
    this.sourceDelayBSendGainTarget = delayBSendGain;
    this.sourceGranularSendGainTarget = granularSendGain;
    this.sourceGainRampRemainingSamples = 0;
  }

  setSlotGains(slot, dryGain, reverbSendGain, delayASendGain, delayBSendGain, granularSendGain) {
    if (!slot) return;
    slot.dryGain = dryGain;
    slot.reverbSendGain = reverbSendGain;
    slot.delayASendGain = delayASendGain;
    slot.delayBSendGain = delayBSendGain;
    slot.granularSendGain = granularSendGain;
    slot.dryGainTarget = dryGain;
    slot.reverbSendGainTarget = reverbSendGain;
    slot.delayASendGainTarget = delayASendGain;
    slot.delayBSendGainTarget = delayBSendGain;
    slot.granularSendGainTarget = granularSendGain;
    slot.gainRampRemainingSamples = 0;
  }

  scheduleSourceGainFade(dryGain, reverbSendGain, delayASendGain, delayBSendGain, granularSendGain, fadeSeconds = KESSHO_CORE_SOFT_STOP_FADE_SECONDS) {
    const fadeSamples = Math.max(this.frames, Math.floor(Math.max(0.01, Number(fadeSeconds) || KESSHO_CORE_SOFT_STOP_FADE_SECONDS) * sampleRate));
    this.sourceDryGainTarget = dryGain;
    this.sourceReverbSendGainTarget = reverbSendGain;
    this.sourceDelayASendGainTarget = delayASendGain;
    this.sourceDelayBSendGainTarget = delayBSendGain;
    this.sourceGranularSendGainTarget = granularSendGain;
    this.sourceGainRampRemainingSamples = fadeSamples;
  }

  scheduleSlotGainFade(slot, dryGain, reverbSendGain, delayASendGain, delayBSendGain, granularSendGain, fadeSeconds = KESSHO_CORE_SOFT_STOP_FADE_SECONDS) {
    if (!slot) return;
    const fadeSamples = Math.max(this.frames, Math.floor(Math.max(0.01, Number(fadeSeconds) || KESSHO_CORE_SOFT_STOP_FADE_SECONDS) * sampleRate));
    slot.dryGainTarget = dryGain;
    slot.reverbSendGainTarget = reverbSendGain;
    slot.delayASendGainTarget = delayASendGain;
    slot.delayBSendGainTarget = delayBSendGain;
    slot.granularSendGainTarget = granularSendGain;
    slot.gainRampRemainingSamples = fadeSamples;
  }

  stepSourceGainRamp(frames) {
    const remainingSamples = Number.isFinite(this.sourceGainRampRemainingSamples)
      ? this.sourceGainRampRemainingSamples
      : 0;
    if (remainingSamples <= 0) return;
    const progress = Math.min(1, frames / remainingSamples);
    this.sourceDryGain += (this.sourceDryGainTarget - this.sourceDryGain) * progress;
    this.sourceReverbSendGain += (this.sourceReverbSendGainTarget - this.sourceReverbSendGain) * progress;
    this.sourceDelayASendGain += (this.sourceDelayASendGainTarget - this.sourceDelayASendGain) * progress;
    this.sourceDelayBSendGain += (this.sourceDelayBSendGainTarget - this.sourceDelayBSendGain) * progress;
    this.sourceGranularSendGain += (this.sourceGranularSendGainTarget - this.sourceGranularSendGain) * progress;
    this.sourceGainRampRemainingSamples = Math.max(0, this.sourceGainRampRemainingSamples - frames);
    if (this.sourceGainRampRemainingSamples <= 0) {
      this.sourceDryGain = this.sourceDryGainTarget;
      this.sourceReverbSendGain = this.sourceReverbSendGainTarget;
      this.sourceDelayASendGain = this.sourceDelayASendGainTarget;
      this.sourceDelayBSendGain = this.sourceDelayBSendGainTarget;
      this.sourceGranularSendGain = this.sourceGranularSendGainTarget;
    }
  }

  stepSlotGainRamp(slot, frames) {
    if (!slot) return;
    const remainingSamples = Number.isFinite(slot.gainRampRemainingSamples)
      ? slot.gainRampRemainingSamples
      : 0;
    if (remainingSamples <= 0) return;
    const progress = Math.min(1, frames / remainingSamples);
    slot.dryGain += (slot.dryGainTarget - slot.dryGain) * progress;
    slot.reverbSendGain += (slot.reverbSendGainTarget - slot.reverbSendGain) * progress;
    slot.delayASendGain += (slot.delayASendGainTarget - slot.delayASendGain) * progress;
    slot.delayBSendGain += (slot.delayBSendGainTarget - slot.delayBSendGain) * progress;
    slot.granularSendGain += (slot.granularSendGainTarget - slot.granularSendGain) * progress;
    slot.gainRampRemainingSamples = Math.max(0, slot.gainRampRemainingSamples - frames);
    if (slot.gainRampRemainingSamples <= 0) {
      slot.dryGain = slot.dryGainTarget;
      slot.reverbSendGain = slot.reverbSendGainTarget;
      slot.delayASendGain = slot.delayASendGainTarget;
      slot.delayBSendGain = slot.delayBSendGainTarget;
      slot.granularSendGain = slot.granularSendGainTarget;
    }
  }

  releasePrimarySourceVoices() {
    if (!this.sourceModule) return;
    this.sourcePendingNotes = [];
    this.sourcePendingNoteOffs = [];
    if (this.sourceModuleType === KESSHO_MODULE_PAD) {
      for (let voiceIndex = 0; voiceIndex < KESSHO_PAD_VOICE_COUNT; voiceIndex += 1) {
        this.api.moduleNoteOff(this.sourceModule, voiceIndex);
      }
      return;
    }
    this.api.moduleAllNotesOff(this.sourceModule);
  }

  releaseSourceSlotVoices(slot) {
    if (!slot?.module) return;
    slot.pendingNotes = [];
    slot.pendingNoteOffs = [];
    this.api.moduleAllNotesOff(slot.module);
  }

  softStopPrimarySource(fadeSeconds = KESSHO_CORE_SOFT_STOP_FADE_SECONDS) {
    if (!this.sourceModule) return;
    this.releasePrimarySourceVoices();
    this.sourceChordSets = [];
    this.sourceChordIndex = 0;
    this.sourceChordIntervalSamples = 0;
    this.sourceSamplesUntilChord = 0;
    this.sourceNoteKey = '';
    this.scheduleSourceGainFade(0, 0, 0, 0, 0, fadeSeconds);
  }

  softStopSourceSlot(slot, fadeSeconds = KESSHO_CORE_SOFT_STOP_FADE_SECONDS) {
    if (!slot?.module) return;
    this.releaseSourceSlotVoices(slot);
    slot.chordSets = [];
    slot.chordIndex = 0;
    slot.chordIntervalSamples = 0;
    slot.samplesUntilChord = 0;
    slot.noteKey = '';
    this.scheduleSlotGainFade(slot, 0, 0, 0, 0, 0, fadeSeconds);
  }

  softStopSources(message) {
    const fadeSeconds = Number.isFinite(Number(message.fadeSeconds))
      ? Math.max(0.01, Number(message.fadeSeconds))
      : KESSHO_CORE_SOFT_STOP_FADE_SECONDS;
    const queued = this.writeTransportEvent(message.sampleOffset, 0);
    if (!queued) this.postQueueFailure('softStop');
    this.softStopPrimarySource(fadeSeconds);
    for (const slot of (this.auxSourceSlots || [])) {
      this.softStopSourceSlot(slot, fadeSeconds);
    }
  }

  killSourceVoices() {
    if (!this.sourceModule) return;
    this.sourcePendingNotes = [];
    this.sourcePendingNoteOffs = [];
    if (
      this.sourceModuleType === KESSHO_MODULE_LEAD_FM ||
      this.sourceModuleType === KESSHO_MODULE_DRUM ||
      this.sourceModuleType === KESSHO_MODULE_SOUNDSCAPES
    ) {
      this.api.moduleAllNotesOff(this.sourceModule);
      return;
    }
    for (let voiceIndex = 0; voiceIndex < KESSHO_PAD_VOICE_COUNT; voiceIndex += 1) {
      const ok = this.api.moduleKillVoice(this.sourceModule, voiceIndex) === 1;
      if (!ok) this.postQueueFailure('sourceModuleKillVoice');
    }
  }

  applyNoteParamsOverride(module, moduleType, note, baseParams) {
    if (
      !module ||
      !note ||
      typeof note !== 'object' ||
      (moduleType !== KESSHO_MODULE_LEAD_FM && moduleType !== KESSHO_MODULE_PAD)
    ) {
      return;
    }
    const override = Array.isArray(note.paramsOverride) ? note.paramsOverride : null;
    this.noteParamsOverrideActiveByModule = this.noteParamsOverrideActiveByModule || new Map();
    const wasActive = this.noteParamsOverrideActiveByModule.get(module) === true;
    if (!override && !wasActive) return;
    const params = override || (Array.isArray(baseParams) ? baseParams : null);
    if (!params) return;
    const paramsPtr = this.api.moduleGetParamsPtr(module);
    const paramCount = this.api.moduleGetParamCount(module);
    if (!paramsPtr || paramCount <= 0) return;
    const offset = paramsPtr >> 2;
    const count = Math.min(paramCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < paramCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    this.api.moduleCommitParams(module);
    this.noteParamsOverrideActiveByModule.set(module, Boolean(override));
  }

  applyDrumNoteOverrides(module, moduleType, note) {
    if (moduleType !== KESSHO_MODULE_DRUM || !module || !note || typeof note !== 'object') return;
    const paramsPtr = this.api.moduleGetParamsPtr(module);
    const paramCount = this.api.moduleGetParamCount(module);
    if (!paramsPtr || paramCount <= KESSHO_DRUM_PARAM_TRIGGER + 4) return;

    const offset = paramsPtr >> 2;
    const morph = note.morphOverride;
    const distance = note.distanceOverride;
    const pitch = note.pitchOverride;
    const ratchetDecayCap = note.ratchetDecayCap;
    const ratchetAttackCap = note.ratchetAttackCap;
    const hasOverride = morph !== null && morph !== undefined ||
      distance !== null && distance !== undefined ||
      pitch !== null && pitch !== undefined ||
      ratchetDecayCap !== null && ratchetDecayCap !== undefined ||
      ratchetAttackCap !== null && ratchetAttackCap !== undefined;
    this.drumNoteOverrideActiveByModule = this.drumNoteOverrideActiveByModule || new Map();
    const wasActive = this.drumNoteOverrideActiveByModule.get(module) === true;
    if (!hasOverride && !wasActive) return;

    this.heap[offset + KESSHO_DRUM_PARAM_TRIGGER + 0] = morph === null || morph === undefined ? -1 : Number(morph) || 0;
    this.heap[offset + KESSHO_DRUM_PARAM_TRIGGER + 1] = distance === null || distance === undefined ? -1 : Number(distance) || 0;
    this.heap[offset + KESSHO_DRUM_PARAM_TRIGGER + 2] = pitch === null || pitch === undefined ? 0 : Number(pitch) || 0;
    this.heap[offset + KESSHO_DRUM_PARAM_TRIGGER + 3] = Number.isFinite(Number(ratchetDecayCap)) ? Number(ratchetDecayCap) : 1.0e10;
    this.heap[offset + KESSHO_DRUM_PARAM_TRIGGER + 4] = Number.isFinite(Number(ratchetAttackCap)) ? Number(ratchetAttackCap) : 1.0e10;
    this.api.moduleCommitParams(module);
    this.drumNoteOverrideActiveByModule.set(module, hasOverride);
  }

  triggerSourceNote(note) {
    if (!this.sourceModule) return;
    if (!note || typeof note !== 'object') return;
    this.applyNoteParamsOverride(this.sourceModule, this.sourceModuleType, note, this.sourceBaseParams);
    this.applyDrumNoteOverrides(this.sourceModule, this.sourceModuleType, note);
    const ok = this.api.moduleNoteOn(
      this.sourceModule,
      Number(note.frequency) || 0,
      Number(note.velocity) || 0,
      Number(note.holdSeconds) || 0,
      Number(note.route) || 0,
    ) === 1;
    if (!ok) this.postQueueFailure('sourceModuleNote');
    const holdSamples = Math.max(0, Math.floor((Number(note.holdSeconds) || 0) * sampleRate));
    if (ok && holdSamples > 0 && this.sourceModuleType === KESSHO_MODULE_PAD) {
      const voiceIndex = Math.max(0, Math.floor(Number(note.route) || 0)) % KESSHO_PAD_VOICE_COUNT;
      this.sourcePendingNoteOffs = this.sourcePendingNoteOffs.filter((pending) => pending.voiceIndex !== voiceIndex);
      this.sourcePendingNoteOffs.push({ samplesUntil: holdSamples, voiceIndex });
    }
  }

  scheduleSourceChord(chord, startDelaySamples = 0) {
    if (!this.sourceModule) return;
    this.sourcePendingNotes = [];
    this.sourcePendingNoteOffs = [];
    if (this.sourceModuleType !== KESSHO_MODULE_DRUM) {
      this.api.moduleAllNotesOff(this.sourceModule);
    }
    const notes = Array.isArray(chord) ? chord : [];
    const startDelay = Math.max(0, Math.floor(Number(startDelaySamples) || 0));
    for (const note of notes) {
      if (!note || typeof note !== 'object') continue;
      const delaySamples = startDelay + Math.max(0, Math.floor((Number(note.delaySeconds) || 0) * sampleRate));
      if (delaySamples <= 0) {
        this.triggerSourceNote(note);
      } else {
        this.sourcePendingNotes.push({ samplesUntil: delaySamples, note });
      }
    }
  }

  triggerSourceChord(chord) {
    this.scheduleSourceChord(chord, 0);
  }

  advanceSourcePendingNotes(frames) {
    if (!this.sourceModule || this.sourcePendingNotes.length === 0) return;
    const remaining = [];
    for (const pending of this.sourcePendingNotes) {
      pending.samplesUntil -= frames;
      if (pending.samplesUntil <= 0) {
        this.triggerSourceNote(pending.note);
      } else {
        remaining.push(pending);
      }
    }
    this.sourcePendingNotes = remaining;
  }

  advanceSourcePendingNoteOffs(frames) {
    if (!this.sourceModule || this.sourcePendingNoteOffs.length === 0) return;
    const remaining = [];
    for (const pending of this.sourcePendingNoteOffs) {
      pending.samplesUntil -= frames;
      if (pending.samplesUntil <= 0) {
        this.api.moduleNoteOff(this.sourceModule, pending.voiceIndex);
      } else {
        remaining.push(pending);
      }
    }
    this.sourcePendingNoteOffs = remaining;
  }

  advanceSourceSequencer(frames) {
    this.advanceSourcePendingNotes(frames);
    this.advanceSourcePendingNoteOffs(frames);
    if (!this.sourceModule || this.sourceChordSets.length < 2 || this.sourceChordIntervalSamples <= 0) return;
    this.sourceSamplesUntilChord -= frames;
    if (this.sourceSamplesUntilChord > 0) return;

    this.sourceChordIndex = (this.sourceChordIndex + 1) % this.sourceChordSets.length;
    this.triggerSourceChord(this.sourceChordSets[this.sourceChordIndex]);
    this.sourceSamplesUntilChord += this.sourceChordIntervalSamples;
    if (this.sourceSamplesUntilChord <= 0) {
      this.sourceSamplesUntilChord = this.sourceChordIntervalSamples;
    }
  }

  triggerSlotNote(slot, note) {
    if (!slot?.module) return;
    if (!note || typeof note !== 'object') return;
    this.applyNoteParamsOverride(slot.module, slot.moduleType, note, slot.baseParams);
    this.applyDrumNoteOverrides(slot.module, slot.moduleType, note);
    const ok = this.api.moduleNoteOn(
      slot.module,
      Number(note.frequency) || 0,
      Number(note.velocity) || 0,
      Number(note.holdSeconds) || 0,
      Number(note.route) || 0,
    ) === 1;
    if (!ok) this.postQueueFailure(`${slot.slotId}SourceNote`);
  }

  scheduleSlotChord(slot, chord, startDelaySamples = 0) {
    if (!slot?.module) return;
    slot.pendingNotes = [];
    slot.pendingNoteOffs = [];
    if (slot.moduleType !== KESSHO_MODULE_DRUM) {
      this.api.moduleAllNotesOff(slot.module);
    }
    const notes = Array.isArray(chord) ? chord : [];
    const startDelay = Math.max(0, Math.floor(Number(startDelaySamples) || 0));
    for (const note of notes) {
      if (!note || typeof note !== 'object') continue;
      const delaySamples = startDelay + Math.max(0, Math.floor((Number(note.delaySeconds) || 0) * sampleRate));
      if (delaySamples <= 0) {
        this.triggerSlotNote(slot, note);
      } else {
        slot.pendingNotes.push({ samplesUntil: delaySamples, note });
      }
    }
  }

  triggerSlotChord(slot, chord) {
    this.scheduleSlotChord(slot, chord, 0);
  }

  advanceSlotPendingNotes(slot, frames) {
    if (!slot?.module || slot.pendingNotes.length === 0) return;
    const remaining = [];
    for (const pending of slot.pendingNotes) {
      pending.samplesUntil -= frames;
      if (pending.samplesUntil <= 0) {
        this.triggerSlotNote(slot, pending.note);
      } else {
        remaining.push(pending);
      }
    }
    slot.pendingNotes = remaining;
  }

  advanceSlotSequencer(slot, frames) {
    this.advanceSlotPendingNotes(slot, frames);
    if (!slot?.module || slot.chordSets.length < 2 || slot.chordIntervalSamples <= 0) return;
    slot.samplesUntilChord -= frames;
    if (slot.samplesUntilChord > 0) return;

    slot.chordIndex = (slot.chordIndex + 1) % slot.chordSets.length;
    this.triggerSlotChord(slot, slot.chordSets[slot.chordIndex]);
    slot.samplesUntilChord += slot.chordIntervalSamples;
    if (slot.samplesUntilChord <= 0) {
      slot.samplesUntilChord = slot.chordIntervalSamples;
    }
  }

  triggerAuxSourceNote(message) {
    const slot = this.getAuxSourceSlot(message.slot);
    this.triggerSlotNote(slot, message.note);
  }

  configureSourceModule(message) {
    const enabled = Boolean(message.enabled);
    if (!enabled) {
      this.destroySourceModule();
      return;
    }

    const sourceKind = this.sourceKindFromMessage(message);
    if (!sourceKind) {
      this.destroySourceModule();
      return;
    }

    const moduleType = this.moduleTypeForSourceKind(sourceKind);
    if (!this.sourceModule || this.sourceModuleType !== moduleType) {
      this.destroySourceModule();
      this.sourceModule = this.api.moduleCreate(moduleType, sampleRate, this.frames);
      this.sourceModuleType = moduleType;
      this.sourceKind = sourceKind;
      this.refreshMemoryViews();
      this.sourceModuleTapCount = this.sourceModule
        ? this.api.moduleGetOutputTapCount(this.sourceModule)
        : 0;
      if (!this.sourceModule) {
        this.postQueueFailure('sourceModule');
        return;
      }
      if (sourceKind === 'pad' && this.sourceModuleTapCount < KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT) {
        this.postQueueFailure('sourceModuleTaps');
        this.destroySourceModule();
        return;
      }
    } else {
      this.sourceKind = sourceKind;
    }

    const paramsPtr = this.api.moduleGetParamsPtr(this.sourceModule);
    const paramCount = this.api.moduleGetParamCount(this.sourceModule);
    if (!paramsPtr || paramCount <= 0) {
      this.postQueueFailure('sourceModuleParams');
      return;
    }

    const params = Array.isArray(message.params) ? message.params : [];
    const offset = paramsPtr >> 2;
    const count = Math.min(paramCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < paramCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    this.sourceBaseParams = Array.from({ length: paramCount }, (_, index) =>
      index < count ? (Number(params[index]) || 0) : 0,
    );
    this.noteParamsOverrideActiveByModule = this.noteParamsOverrideActiveByModule || new Map();
    this.noteParamsOverrideActiveByModule.set(this.sourceModule, false);
    this.api.moduleCommitParams(this.sourceModule);
    this.setSourceGains(
      Number.isFinite(Number(message.dryGain))
        ? Math.max(0, Math.min(2, Number(message.dryGain)))
        : 1,
      Number.isFinite(Number(message.reverbSendGain))
        ? Math.max(0, Math.min(2, Number(message.reverbSendGain)))
        : 0,
      Number.isFinite(Number(message.delayASendGain))
        ? Math.max(0, Math.min(2, Number(message.delayASendGain)))
        : sourceKind === 'lead-fm'
          ? (Number(message.leadIndex) > 0 ? this.delayALead2SendGain : this.delayALead1SendGain)
          : 0,
      Number.isFinite(Number(message.delayBSendGain))
        ? Math.max(0, Math.min(2, Number(message.delayBSendGain)))
        : sourceKind === 'lead-fm'
          ? (Number(message.leadIndex) > 0 ? this.delayBLead2SendGain : this.delayBLead1SendGain)
          : 0,
      Number.isFinite(Number(message.granularSendGain))
        ? Math.max(0, Math.min(2, Number(message.granularSendGain)))
        : 0,
    );
    this.sourceLeadIndex = Number(message.leadIndex) > 0 ? 1 : 0;
    this.configurePadPostChain(
      this.padPostChains[0],
      message.pad1PostLpfHz,
      message.pad1StereoWidth,
      message.postLpfStages,
    );
    this.configurePadPostChain(
      this.padPostChains[1],
      message.pad2PostLpfHz,
      message.pad2StereoWidth,
      message.postLpfStages,
    );

    const noteKey = typeof message.noteKey === 'string' ? message.noteKey : '';
    if (sourceKind === 'soundscapes') {
      this.sourcePendingNotes = [];
      this.sourcePendingNoteOffs = [];
      this.sourceChordSets = [];
      this.sourceChordIndex = 0;
      this.sourceChordIntervalSamples = 0;
      this.sourceSamplesUntilChord = 0;
      this.sourceNoteKey = noteKey;
      return;
    }
    if (noteKey !== this.sourceNoteKey) {
      const chords = Array.isArray(message.chords) && message.chords.length > 0
        ? message.chords
        : [Array.isArray(message.notes) ? message.notes : []];
      this.sourceChordSets = chords;
      this.sourceChordIndex = 0;
      this.sourceChordIntervalSamples = Math.max(
        this.frames,
        Math.floor((Number(message.chordSeconds) || 8) * sampleRate),
      );
      const initialChordLeadSamples = Math.max(
        0,
        Math.floor((Number(message.initialChordLeadSeconds) || 0) * sampleRate),
      );
      const initialStartDelaySamples = Math.max(
        0,
        Math.floor((Number(message.initialStartDelaySeconds) || 0) * sampleRate),
      );
      this.sourceSamplesUntilChord = initialStartDelaySamples + Math.max(this.frames, this.sourceChordIntervalSamples - initialChordLeadSamples);
      if (message.triggerInitial === false) {
        const nextIsManual = noteKey.startsWith('manual:');
        const previousWasManual = this.sourceNoteKey.startsWith('manual:');
        if (nextIsManual && previousWasManual) {
          this.sourcePendingNotes = [];
        } else {
          this.killSourceVoices();
        }
      } else {
        this.scheduleSourceChord(this.sourceChordSets[0], initialStartDelaySamples);
      }
      this.sourceNoteKey = noteKey;
    }
  }

  configureAuxSourceModule(message) {
    const slot = this.getAuxSourceSlot(message.slot);
    if (!slot) return;

    const enabled = Boolean(message.enabled);
    if (!enabled) {
      this.destroySourceSlot(slot);
      return;
    }

    const sourceKind = this.sourceKindFromMessage(message);
    const slotMatchesSource =
      (slot.slotId === 'lead' && sourceKind === 'lead-fm') ||
      (slot.slotId === 'drum' && sourceKind === 'drum') ||
      (slot.slotId === 'soundscapes' && sourceKind === 'soundscapes');
    if (!slotMatchesSource) {
      this.destroySourceSlot(slot);
      return;
    }

    const moduleType = this.moduleTypeForSourceKind(sourceKind);
    if (!slot.module || slot.moduleType !== moduleType) {
      this.destroySourceSlot(slot);
      slot.module = this.api.moduleCreate(moduleType, sampleRate, this.frames);
      slot.moduleType = moduleType;
      slot.kind = sourceKind;
      this.refreshMemoryViews();
      slot.moduleTapCount = slot.module
        ? this.api.moduleGetOutputTapCount(slot.module)
        : 0;
      if (!slot.module) {
        this.postQueueFailure(`${slot.slotId}SourceModule`);
        return;
      }
    } else {
      slot.kind = sourceKind;
    }

    const paramsPtr = this.api.moduleGetParamsPtr(slot.module);
    const paramCount = this.api.moduleGetParamCount(slot.module);
    if (!paramsPtr || paramCount <= 0) {
      this.postQueueFailure(`${slot.slotId}SourceParams`);
      return;
    }

    const params = Array.isArray(message.params) ? message.params : [];
    const offset = paramsPtr >> 2;
    const count = Math.min(paramCount, params.length);
    for (let i = 0; i < count; i += 1) {
      this.heap[offset + i] = Number(params[i]) || 0;
    }
    for (let i = count; i < paramCount; i += 1) {
      this.heap[offset + i] = 0;
    }
    slot.baseParams = Array.from({ length: paramCount }, (_, index) =>
      index < count ? (Number(params[index]) || 0) : 0,
    );
    this.noteParamsOverrideActiveByModule = this.noteParamsOverrideActiveByModule || new Map();
    this.noteParamsOverrideActiveByModule.set(slot.module, false);
    this.api.moduleCommitParams(slot.module);

    slot.leadIndex = Number(message.leadIndex) > 0 ? 1 : 0;
    slot.sendsPreDry = true;
    this.setSlotGains(
      slot,
      Number.isFinite(Number(message.dryGain))
        ? Math.max(0, Math.min(2, Number(message.dryGain)))
        : 1,
      Number.isFinite(Number(message.reverbSendGain))
        ? Math.max(0, Math.min(2, Number(message.reverbSendGain)))
        : 0,
      Number.isFinite(Number(message.delayASendGain))
        ? Math.max(0, Math.min(2, Number(message.delayASendGain)))
        : sourceKind === 'lead-fm'
          ? (slot.leadIndex > 0 ? this.delayALead2SendGain : this.delayALead1SendGain)
          : sourceKind === 'drum'
            ? this.delayADrumSendGain
            : this.delayASoundscapeSendGain,
      Number.isFinite(Number(message.delayBSendGain))
        ? Math.max(0, Math.min(2, Number(message.delayBSendGain)))
        : sourceKind === 'lead-fm'
          ? (slot.leadIndex > 0 ? this.delayBLead2SendGain : this.delayBLead1SendGain)
          : sourceKind === 'drum'
            ? this.delayBDrumSendGain
            : this.delayBSoundscapeSendGain,
      Number.isFinite(Number(message.granularSendGain))
        ? Math.max(0, Math.min(2, Number(message.granularSendGain)))
        : sourceKind === 'lead-fm'
          ? (slot.leadIndex > 0 ? this.granularLead2SendGain : this.granularLead1SendGain)
          : sourceKind === 'drum'
            ? this.granularDrumSendGain
            : this.granularSoundscapeSendGain,
    );

    this.configurePadPostChain(
      slot.postChain,
      message.pad1PostLpfHz,
      message.pad1StereoWidth,
      message.postLpfStages,
    );

    const noteKey = typeof message.noteKey === 'string' ? message.noteKey : '';
    if (sourceKind === 'soundscapes') {
      slot.pendingNotes = [];
      slot.pendingNoteOffs = [];
      slot.chordSets = [];
      slot.chordIndex = 0;
      slot.chordIntervalSamples = 0;
      slot.samplesUntilChord = 0;
      slot.noteKey = noteKey;
      return;
    }
    if (noteKey !== slot.noteKey) {
      const chords = Array.isArray(message.chords) && message.chords.length > 0
        ? message.chords
        : [Array.isArray(message.notes) ? message.notes : []];
      slot.chordSets = chords;
      slot.chordIndex = 0;
      slot.chordIntervalSamples = Math.max(
        this.frames,
        Math.floor((Number(message.chordSeconds) || 8) * sampleRate),
      );
      const initialChordLeadSamples = Math.max(
        0,
        Math.floor((Number(message.initialChordLeadSeconds) || 0) * sampleRate),
      );
      const initialStartDelaySamples = Math.max(
        0,
        Math.floor((Number(message.initialStartDelaySeconds) || 0) * sampleRate),
      );
      slot.samplesUntilChord = initialStartDelaySamples + Math.max(this.frames, slot.chordIntervalSamples - initialChordLeadSamples);
      if (message.triggerInitial === false) {
        const nextIsManual = noteKey.startsWith('manual:');
        const previousWasManual = slot.noteKey.startsWith('manual:');
        if (nextIsManual && previousWasManual) {
          slot.pendingNotes = [];
        } else {
          this.api.moduleAllNotesOff(slot.module);
          slot.pendingNotes = [];
          slot.pendingNoteOffs = [];
        }
      } else {
        this.scheduleSlotChord(slot, slot.chordSets[0], initialStartDelaySamples);
      }
      slot.noteKey = noteKey;
    }
  }

  handleMessage(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'setRenderMode') {
      this.renderMode = Number(message.renderMode) || 0;
      if (this.ready) {
        const queued = this.writeParamEvent(message.sampleOffset, 2, this.renderMode, 0);
        if (!queued) this.postQueueFailure('renderMode');
      }
    }

    if (message.type === 'setSmokeTone') {
      this.smokeFrequency = Number(message.frequencyHz) || 220;
      this.smokeAmplitude = Number(message.amplitude) || 0.125;
      if (this.ready) {
        const rampFrames = this.sampleOffset(message.rampFrames);
        const frequencyQueued = this.writeParamEvent(message.sampleOffset, 3, this.smokeFrequency, 0);
        const amplitudeQueued = this.writeParamEvent(message.sampleOffset, 4, this.smokeAmplitude, rampFrames);
        if (!frequencyQueued || !amplitudeQueued) this.postQueueFailure('smokeTone');
      }
    }

    if (message.type === 'start' && this.ready) {
      const queued = this.writeTransportEvent(message.sampleOffset, 1);
      if (!queued) this.postQueueFailure('start');
    }

    if (message.type === 'stop' && this.ready) {
      const queued = this.writeTransportEvent(message.sampleOffset, 0);
      if (!queued) this.postQueueFailure('stop');
    }

    if (message.type === 'softStop' && this.ready) {
      this.softStopSources(message);
    }

    if (message.type === 'configureExternalInputs') {
      this.externalReverbInputActive = Boolean(message.reverbActive);
      this.externalDelayAInputActive = Boolean(message.delayAActive);
      this.externalDelayBInputActive = Boolean(message.delayBActive);
      this.externalGranularInputActive = Boolean(message.granularActive);
    }

    if (message.type === 'enablePerf') {
      this.perfEnabled = Boolean(message.enabled);
      this.perfBlocks = 0;
      this.perfSumMs = 0;
      this.perfPeakMs = 0;
      this.perfMisses = 0;
    }

    if (message.type === 'applySnapshot' && this.ready) {
      const applied = this.writeSnapshot(message.snapshot);
      if (!applied) this.postQueueFailure('snapshot');
    }

    if (message.type === 'midiEvent' && this.ready) {
      const queued = this.writeMidiEvent(message.event);
      if (!queued) this.postQueueFailure('midi');
    }

    if (message.type === 'configureModule' && this.ready) {
      if (message.module === 'dynamics-drift') {
        this.configureDynamicsModule(message);
      } else if (message.module === 'reverb') {
        this.configureReverbModule(message);
      } else if (message.module === 'delay-a') {
        this.configureDelayAModule(message);
      } else if (message.module === 'delay-b') {
        this.configureDelayBModule(message);
      } else if (message.module === 'granular') {
        this.configureGranularModule(message);
      } else if (message.module === 'spectral-freeze') {
        this.configureSpectralFreezeModule(message);
      }
    }

    if (message.type === 'resetParityFx' && this.ready) {
      this.resetParityFx();
    }

    if (message.type === 'configureSource' && this.ready) {
      this.configureSourceModule(message);
    }

    if (message.type === 'configureAuxSource' && this.ready) {
      this.configureAuxSourceModule(message);
    }

    if (message.type === 'triggerSourceNote' && this.ready) {
      this.triggerSourceNote(message.note);
    }

    if (message.type === 'triggerAuxSourceNote' && this.ready) {
      this.triggerAuxSourceNote(message);
    }
  }

  hasActiveAuxSources() {
    return (this.auxSourceSlots || []).some((slot) => slot.module);
  }

  activeAuxSourceCount() {
    return (this.auxSourceSlots || []).reduce((count, slot) => count + (slot.module ? 1 : 0), 0);
  }

  processAuxSources(frames) {
    const active = [];
    for (const slot of (this.auxSourceSlots || [])) {
      if (!slot.module) continue;
      this.advanceSlotSequencer(slot, frames);
      slot.left.fill(0, 0, frames);
      slot.right.fill(0, 0, frames);
      const ok = this.api.moduleProcessPlanarStereo(
        slot.module,
        slot.leftPtr,
        slot.rightPtr,
        slot.leftPtr,
        slot.rightPtr,
        frames,
      ) === 1;
      if (!ok) {
        this.postQueueFailure(`${slot.slotId}SourceProcess`);
      }
      this.processPostChain(slot.postChain, slot.leftPtr, slot.rightPtr, frames);
      this.stepSlotGainRamp(slot, frames);
      active.push(slot);
    }
    return active;
  }

  auxSendDryMultiplier(slot) {
    if (slot?.sendsPreDry) return 1;
    return Number.isFinite(slot?.dryGain) ? slot.dryGain : 1;
  }

  addAuxDelaySendsToInput(activeAuxSlots, frames) {
    if (!this.delayAModule || activeAuxSlots.length === 0) return;
    const delayInputLeftOffset = this.delayAInputLeftPtr >> 2;
    const delayInputRightOffset = this.delayAInputRightPtr >> 2;
    for (const slot of activeAuxSlots) {
      const sendGain = Number.isFinite(slot.delayASendGain) ? slot.delayASendGain : 0;
      if (sendGain <= 0.0001) continue;
      const sourceGain = this.auxSendDryMultiplier(slot);
      for (let i = 0; i < frames; i += 1) {
        this.heap[delayInputLeftOffset + i] += slot.left[i] * sendGain * sourceGain;
        this.heap[delayInputRightOffset + i] += slot.right[i] * sendGain * sourceGain;
      }
    }
  }

  addAuxDelayBSendsToInput(activeAuxSlots, frames) {
    if (!this.delayBModule || activeAuxSlots.length === 0) return;
    const delayInputLeftOffset = this.delayBInputLeftPtr >> 2;
    const delayInputRightOffset = this.delayBInputRightPtr >> 2;
    for (const slot of activeAuxSlots) {
      const sendGain = Number.isFinite(slot.delayBSendGain) ? slot.delayBSendGain : 0;
      if (sendGain <= 0.0001) continue;
      const sourceGain = this.auxSendDryMultiplier(slot);
      for (let i = 0; i < frames; i += 1) {
        this.heap[delayInputLeftOffset + i] += slot.left[i] * sendGain * sourceGain;
        this.heap[delayInputRightOffset + i] += slot.right[i] * sendGain * sourceGain;
      }
    }
  }

  auxReverbInputSample(activeAuxSlots, index, channel) {
    let value = 0;
    for (const slot of activeAuxSlots) {
      const sendGain = Number.isFinite(slot.reverbSendGain) ? slot.reverbSendGain : 0;
      if (sendGain <= 0.0001) continue;
      value += (channel === 'left' ? slot.left[index] : slot.right[index]) * sendGain * this.auxSendDryMultiplier(slot);
    }
    return value;
  }

  auxGranularInputSample(activeAuxSlots, index, channel) {
    let value = 0;
    for (const slot of activeAuxSlots) {
      const sendGain = Number.isFinite(slot.granularSendGain) ? slot.granularSendGain : 0;
      if (sendGain <= 0.0001) continue;
      value += (channel === 'left' ? slot.left[index] : slot.right[index]) * sendGain * this.auxSendDryMultiplier(slot);
    }
    return value;
  }

  hasActiveExternalInputs() {
    return this.externalReverbInputActive ||
      this.externalDelayAInputActive ||
      this.externalDelayBInputActive ||
      this.externalGranularInputActive;
  }

  externalInputSample(inputs, inputIndex, index, channel) {
    const input = inputs[inputIndex];
    if (!input || input.length === 0) return 0;
    const left = input[0];
    const right = input[1] || input[0];
    const source = channel === 'left' ? left : right;
    return source && index < source.length ? source[index] : 0;
  }

  addExternalInputToPlanarInput(inputs, inputIndex, leftPtr, rightPtr, frames) {
    const input = inputs[inputIndex];
    if (!input || input.length === 0) return;
    const inputLeft = input[0];
    const inputRight = input[1] || input[0];
    if (!inputLeft) return;
    const leftOffset = leftPtr >> 2;
    const rightOffset = rightPtr >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.heap[leftOffset + i] += inputLeft[i] || 0;
      this.heap[rightOffset + i] += (inputRight?.[i] ?? inputLeft[i]) || 0;
    }
  }

  addExternalDelayAInput(inputs, frames) {
    if (!this.delayAModule || !this.externalDelayAInputActive) return;
    this.addExternalInputToPlanarInput(
      inputs,
      KESSHO_CORE_INPUT_DELAY_A,
      this.delayAInputLeftPtr,
      this.delayAInputRightPtr,
      frames,
    );
  }

  addExternalDelayBInput(inputs, frames) {
    if (!this.delayBModule || !this.externalDelayBInputActive) return;
    this.addExternalInputToPlanarInput(
      inputs,
      KESSHO_CORE_INPUT_DELAY_B,
      this.delayBInputLeftPtr,
      this.delayBInputRightPtr,
      frames,
    );
  }

  addAuxDryToMix(activeAuxSlots, frames) {
    if (activeAuxSlots.length === 0) return;
    for (const slot of activeAuxSlots) {
      const dryGain = Number.isFinite(slot.dryGain) ? slot.dryGain : 1;
      for (let i = 0; i < frames; i += 1) {
        this.mixLeft[i] += slot.left[i] * dryGain;
        this.mixRight[i] += slot.right[i] * dryGain;
      }
    }
  }

  addGranularDryToMix(frames) {
    if (!this.granularModule || this.granularOutputGain <= 0.0001) return;
    const outputLeftOffset = this.granularOutputLeftPtr >> 2;
    const outputRightOffset = this.granularOutputRightPtr >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.mixLeft[i] += this.heap[outputLeftOffset + i] * this.granularOutputGain;
      this.mixRight[i] += this.heap[outputRightOffset + i] * this.granularOutputGain;
    }
  }

  addDelayBDryToMix(frames) {
    if (!this.delayBModule) return;
    const outputLeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_MAIN] >> 2;
    const outputRightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_MAIN] >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.mixLeft[i] += this.heap[outputLeftOffset + i];
      this.mixRight[i] += this.heap[outputRightOffset + i];
    }
  }

  addDelayADryToMix(frames) {
    if (!this.delayAModule) return;
    const outputLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN] >> 2;
    const outputRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN] >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.mixLeft[i] += this.heap[outputLeftOffset + i];
      this.mixRight[i] += this.heap[outputRightOffset + i];
    }
  }

  processDelayAReturn(frames) {
    for (let bus = 0; bus < KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT; bus += 1) {
      this.view.setUint32(this.delayATapLPtrsPtr + bus * UINT32_BYTES, this.delayATapLeftPtrs[bus], true);
      this.view.setUint32(this.delayATapRPtrsPtr + bus * UINT32_BYTES, this.delayATapRightPtrs[bus], true);
    }
    const delayAOk = this.api.moduleProcessPlanarStereoTaps(
      this.delayAModule,
      this.delayAInputLeftPtr,
      this.delayAInputRightPtr,
      this.delayATapLPtrsPtr,
      this.delayATapRPtrsPtr,
      KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT,
      frames,
    ) === 1;
    if (!delayAOk) {
      this.postQueueFailure('delayAModuleProcess');
    }
  }

  addDelayAToDelayBInput(frames) {
    if (!this.delayBModule || !this.delayAModule) return;
    const delayBInputLeftOffset = this.delayBInputLeftPtr >> 2;
    const delayBInputRightOffset = this.delayBInputRightPtr >> 2;
    const delayAToBLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND] >> 2;
    const delayAToBRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_DELAY_B_SEND] >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.heap[delayBInputLeftOffset + i] += this.heap[delayAToBLeftOffset + i];
      this.heap[delayBInputRightOffset + i] += this.heap[delayAToBRightOffset + i];
    }
  }

  addDeferredDelayAInput(frames) {
    if (!this.delayAModule || !this.delayADeferredInputLeftPtr || !this.delayADeferredInputRightPtr) return;
    const delayAInputLeftOffset = this.delayAInputLeftPtr >> 2;
    const delayAInputRightOffset = this.delayAInputRightPtr >> 2;
    const deferredLeftOffset = this.delayADeferredInputLeftPtr >> 2;
    const deferredRightOffset = this.delayADeferredInputRightPtr >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.heap[delayAInputLeftOffset + i] += this.heap[deferredLeftOffset + i];
      this.heap[delayAInputRightOffset + i] += this.heap[deferredRightOffset + i];
      this.heap[deferredLeftOffset + i] = 0;
      this.heap[deferredRightOffset + i] = 0;
    }
  }

  storeDeferredDelayAInput(frames) {
    if (!this.delayADeferredInputLeftPtr || !this.delayADeferredInputRightPtr) return;
    const deferredLeftOffset = this.delayADeferredInputLeftPtr >> 2;
    const deferredRightOffset = this.delayADeferredInputRightPtr >> 2;
    const granularLeftOffset = this.granularOutputLeftPtr >> 2;
    const granularRightOffset = this.granularOutputRightPtr >> 2;
    const delayBToALeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_DELAY_A_SEND] >> 2;
    const delayBToARightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_DELAY_A_SEND] >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.heap[deferredLeftOffset + i] = 0;
      this.heap[deferredRightOffset + i] = 0;
      if (this.delayAModule && this.granularModule && this.granularDelayAOutputSendGain > 0.0001) {
        this.heap[deferredLeftOffset + i] += this.heap[granularLeftOffset + i] * this.granularDelayAOutputSendGain;
        this.heap[deferredRightOffset + i] += this.heap[granularRightOffset + i] * this.granularDelayAOutputSendGain;
      }
      if (this.delayAModule && this.delayBModule) {
        this.heap[deferredLeftOffset + i] += this.heap[delayBToALeftOffset + i];
        this.heap[deferredRightOffset + i] += this.heap[delayBToARightOffset + i];
      }
    }
  }

  addGranularToDelayBInput(frames) {
    if (!this.delayBModule || !this.granularModule || this.delayBGranularInputGain <= 0.0001) return;
    const delayBInputLeftOffset = this.delayBInputLeftPtr >> 2;
    const delayBInputRightOffset = this.delayBInputRightPtr >> 2;
    const granularOutputLeftOffset = this.granularOutputLeftPtr >> 2;
    const granularOutputRightOffset = this.granularOutputRightPtr >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.heap[delayBInputLeftOffset + i] += this.heap[granularOutputLeftOffset + i] * this.delayBGranularInputGain;
      this.heap[delayBInputRightOffset + i] += this.heap[granularOutputRightOffset + i] * this.delayBGranularInputGain;
    }
  }

  processDelayBReturn(frames) {
    for (let bus = 0; bus < KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT; bus += 1) {
      this.view.setUint32(this.delayBTapLPtrsPtr + bus * UINT32_BYTES, this.delayBTapLeftPtrs[bus], true);
      this.view.setUint32(this.delayBTapRPtrsPtr + bus * UINT32_BYTES, this.delayBTapRightPtrs[bus], true);
    }
    const delayBOk = this.api.moduleProcessPlanarStereoTaps(
      this.delayBModule,
      this.delayBInputLeftPtr,
      this.delayBInputRightPtr,
      this.delayBTapLPtrsPtr,
      this.delayBTapRPtrsPtr,
      KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT,
      frames,
    ) === 1;
    if (!delayBOk) {
      this.postQueueFailure('delayBModuleProcess');
    }
  }

  processGranularReturn(frames) {
    if (!this.granularModule) return;
    const ok = this.api.moduleProcessPlanarStereo(
      this.granularModule,
      this.granularInputLeftPtr,
      this.granularInputRightPtr,
      this.granularOutputLeftPtr,
      this.granularOutputRightPtr,
      frames,
    ) === 1;
    if (!ok) {
      this.postQueueFailure('granularModuleProcess');
    }
    this.processPostChain(this.granularPostChain, this.granularOutputLeftPtr, this.granularOutputRightPtr, frames);
  }

  processSpectralFreeze(inputLeftPtr, inputRightPtr, frames) {
    if (!this.spectralFreezeModule) return false;
    const ok = this.api.moduleProcessPlanarStereo(
      this.spectralFreezeModule,
      inputLeftPtr,
      inputRightPtr,
      this.spectralFreezeOutputLeftPtr,
      this.spectralFreezeOutputRightPtr,
      frames,
    ) === 1;
    if (!ok) {
      this.postQueueFailure('spectralFreezeModuleProcess');
    }
    return ok;
  }

  processSpectralFreezePreReverb(frames, fallbackPeak) {
    if (!this.spectralFreezeModule || this.spectralFreezeRouting !== 'pre') return fallbackPeak;
    if (!this.processSpectralFreeze(this.reverbInputLeftPtr, this.reverbInputRightPtr, frames)) return fallbackPeak;
    const inputLeftOffset = this.reverbInputLeftPtr >> 2;
    const inputRightOffset = this.reverbInputRightPtr >> 2;
    const freezeLeftOffset = this.spectralFreezeOutputLeftPtr >> 2;
    const freezeRightOffset = this.spectralFreezeOutputRightPtr >> 2;
    const liveGain = 1 - this.spectralFreezeReverbCrossfade;
    let peak = 0;
    for (let i = 0; i < frames; i += 1) {
      const left = this.heap[freezeLeftOffset + i] + this.heap[inputLeftOffset + i] * liveGain;
      const right = this.heap[freezeRightOffset + i] + this.heap[inputRightOffset + i] * liveGain;
      this.heap[inputLeftOffset + i] = left;
      this.heap[inputRightOffset + i] = right;
      peak = Math.max(peak, Math.abs(left), Math.abs(right));
    }
    return peak;
  }

  processSpectralFreezePostReverb(frames) {
    if (!this.spectralFreezeModule || this.spectralFreezeRouting !== 'post') return;
    if (!this.processSpectralFreeze(this.reverbOutputLeftPtr, this.reverbOutputRightPtr, frames)) return;
    const outputLeftOffset = this.reverbOutputLeftPtr >> 2;
    const outputRightOffset = this.reverbOutputRightPtr >> 2;
    const freezeLeftOffset = this.spectralFreezeOutputLeftPtr >> 2;
    const freezeRightOffset = this.spectralFreezeOutputRightPtr >> 2;
    for (let i = 0; i < frames; i += 1) {
      this.heap[outputLeftOffset + i] = this.heap[freezeLeftOffset + i];
      this.heap[outputRightOffset + i] = this.heap[freezeRightOffset + i];
    }
  }

  processPreparedReverb(frames, reverbInputPeak) {
    if (this.reverbResetOnNextInput && reverbInputPeak <= 1e-7) {
      this.heap.fill(0, this.reverbOutputLeftPtr >> 2, (this.reverbOutputLeftPtr >> 2) + frames);
      this.heap.fill(0, this.reverbOutputRightPtr >> 2, (this.reverbOutputRightPtr >> 2) + frames);
      return;
    }
    if (this.reverbResetOnNextInput) {
      this.api.moduleReset(this.reverbModule);
      this.reverbResetOnNextInput = false;
    }
    const reverbOk = this.api.moduleProcessPlanarStereo(
      this.reverbModule,
      this.reverbInputLeftPtr,
      this.reverbInputRightPtr,
      this.reverbOutputLeftPtr,
      this.reverbOutputRightPtr,
      frames,
    ) === 1;
    if (!reverbOk) {
      this.postQueueFailure('reverbModuleProcess');
    }
  }

  process(_inputs, outputs) {
    const inputs = Array.isArray(_inputs) ? _inputs : [];
    const output = outputs[0];
    const reverbStemOutput = outputs[1];
    const delayAStemOutput = outputs[2];
    const pad1StemOutput = outputs[3];
    const pad2StemOutput = outputs[4];
    const pad1PreStemOutput = outputs[5];
    const reverbFeedStemOutput = outputs[6];
    const lead1StemOutput = outputs[7];
    const lead2StemOutput = outputs[8];
    if (!output || output.length === 0) {
      return true;
    }

    const left = output[0];
    const right = output[1] || output[0];
    const frames = left.length;

    if (this.ready && frames <= this.frames) {
      const startMs = globalThis.performance?.now?.() ?? 0;
      let mixerInputBusCount = 1;
      let activeAuxSlots = [];
      const hasConfiguredSources = this.sourceModule || this.hasActiveAuxSources() || this.hasActiveExternalInputs();
      if (hasConfiguredSources) {
        if (this.sourceModule) {
          this.advanceSourceSequencer(frames);
        }
        const sourceIsPad = this.sourceModuleType === KESSHO_MODULE_PAD;
        this.left.fill(0, 0, frames);
        this.right.fill(0, 0, frames);
        for (let tap = 0; tap < KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT; tap += 1) {
          this.heap.fill(
            0,
            this.sourceTapLeftPtrs[tap] >> 2,
            (this.sourceTapLeftPtrs[tap] >> 2) + frames,
          );
          this.heap.fill(
            0,
            this.sourceTapRightPtrs[tap] >> 2,
            (this.sourceTapRightPtrs[tap] >> 2) + frames,
          );
        }
        this.heap.fill(0, this.delayAInputLeftPtr >> 2, (this.delayAInputLeftPtr >> 2) + frames);
        this.heap.fill(0, this.delayAInputRightPtr >> 2, (this.delayAInputRightPtr >> 2) + frames);
        this.heap.fill(0, this.delayBInputLeftPtr >> 2, (this.delayBInputLeftPtr >> 2) + frames);
        this.heap.fill(0, this.delayBInputRightPtr >> 2, (this.delayBInputRightPtr >> 2) + frames);
        for (let tap = 0; tap < KESSHO_MODULE_DELAY_A_OUTPUT_TAP_COUNT; tap += 1) {
          this.heap.fill(
            0,
            this.delayATapLeftPtrs[tap] >> 2,
            (this.delayATapLeftPtrs[tap] >> 2) + frames,
          );
          this.heap.fill(
            0,
            this.delayATapRightPtrs[tap] >> 2,
            (this.delayATapRightPtrs[tap] >> 2) + frames,
          );
        }
        for (let tap = 0; tap < KESSHO_MODULE_DELAY_B_OUTPUT_TAP_COUNT; tap += 1) {
          this.heap.fill(
            0,
            this.delayBTapLeftPtrs[tap] >> 2,
            (this.delayBTapLeftPtrs[tap] >> 2) + frames,
          );
          this.heap.fill(
            0,
            this.delayBTapRightPtrs[tap] >> 2,
            (this.delayBTapRightPtrs[tap] >> 2) + frames,
          );
        }
        this.heap.fill(0, this.reverbInputLeftPtr >> 2, (this.reverbInputLeftPtr >> 2) + frames);
        this.heap.fill(0, this.reverbInputRightPtr >> 2, (this.reverbInputRightPtr >> 2) + frames);
        this.heap.fill(0, this.reverbOutputLeftPtr >> 2, (this.reverbOutputLeftPtr >> 2) + frames);
        this.heap.fill(0, this.reverbOutputRightPtr >> 2, (this.reverbOutputRightPtr >> 2) + frames);
        this.heap.fill(0, this.granularInputLeftPtr >> 2, (this.granularInputLeftPtr >> 2) + frames);
        this.heap.fill(0, this.granularInputRightPtr >> 2, (this.granularInputRightPtr >> 2) + frames);
        this.heap.fill(0, this.granularOutputLeftPtr >> 2, (this.granularOutputLeftPtr >> 2) + frames);
        this.heap.fill(0, this.granularOutputRightPtr >> 2, (this.granularOutputRightPtr >> 2) + frames);
        this.heap.fill(0, this.spectralFreezeOutputLeftPtr >> 2, (this.spectralFreezeOutputLeftPtr >> 2) + frames);
        this.heap.fill(0, this.spectralFreezeOutputRightPtr >> 2, (this.spectralFreezeOutputRightPtr >> 2) + frames);
        activeAuxSlots = this.processAuxSources(frames);
        if (!this.sourceModule) {
          if (!this.ensureMixerMode('lead')) {
            this.mixLeft.fill(0, 0, frames);
            this.mixRight.fill(0, 0, frames);
          }
          if (this.delayAModule) {
            this.addAuxDelaySendsToInput(activeAuxSlots, frames);
            this.addExternalDelayAInput(inputs, frames);
            this.addDeferredDelayAInput(frames);
            this.processDelayAReturn(frames);
          }
          if (this.delayBModule) {
            this.addAuxDelayBSendsToInput(activeAuxSlots, frames);
            this.addExternalDelayBInput(inputs, frames);
            this.addDelayAToDelayBInput(frames);
            if (this.delayBGranularInputGain <= 0.0001) {
              this.processDelayBReturn(frames);
            }
          }
          if (this.granularModule) {
            const granularInputLeftOffset = this.granularInputLeftPtr >> 2;
            const granularInputRightOffset = this.granularInputRightPtr >> 2;
            const delayAGranularLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND] >> 2;
            const delayAGranularRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND] >> 2;
            const delayBGranularLeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND] >> 2;
            const delayBGranularRightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND] >> 2;
            for (let i = 0; i < frames; i += 1) {
              this.heap[granularInputLeftOffset + i] =
                this.auxGranularInputSample(activeAuxSlots, i, 'left') +
                (this.externalGranularInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_GRANULAR, i, 'left') : 0) +
                (this.delayAModule ? this.heap[delayAGranularLeftOffset + i] * this.granularDelayASendGain : 0) +
                (this.delayBModule ? this.heap[delayBGranularLeftOffset + i] : 0);
              this.heap[granularInputRightOffset + i] =
                this.auxGranularInputSample(activeAuxSlots, i, 'right') +
                (this.externalGranularInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_GRANULAR, i, 'right') : 0) +
                (this.delayAModule ? this.heap[delayAGranularRightOffset + i] * this.granularDelayASendGain : 0) +
                (this.delayBModule ? this.heap[delayBGranularRightOffset + i] : 0);
            }
            this.processGranularReturn(frames);
          }
          if (this.delayBModule && this.delayBGranularInputGain > 0.0001) {
            this.addGranularToDelayBInput(frames);
            this.processDelayBReturn(frames);
          }
          if (this.reverbModule) {
            const reverbInputLeftOffset = this.reverbInputLeftPtr >> 2;
            const reverbInputRightOffset = this.reverbInputRightPtr >> 2;
            const delayAReverbLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND] >> 2;
            const delayAReverbRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND] >> 2;
            const delayBReverbLeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND] >> 2;
            const delayBReverbRightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND] >> 2;
            const granularOutputLeftOffset = this.granularOutputLeftPtr >> 2;
            const granularOutputRightOffset = this.granularOutputRightPtr >> 2;
            let reverbInputPeak = 0;
            for (let i = 0; i < frames; i += 1) {
              const reverbInLeft =
                this.auxReverbInputSample(activeAuxSlots, i, 'left') +
                (this.externalReverbInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_REVERB, i, 'left') : 0) +
                (this.granularModule ? this.heap[granularOutputLeftOffset + i] * this.granularReverbSendGain : 0) +
                (this.delayAModule ? this.heap[delayAReverbLeftOffset + i] : 0) +
                (this.delayBModule ? this.heap[delayBReverbLeftOffset + i] : 0);
              const reverbInRight =
                this.auxReverbInputSample(activeAuxSlots, i, 'right') +
                (this.externalReverbInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_REVERB, i, 'right') : 0) +
                (this.granularModule ? this.heap[granularOutputRightOffset + i] * this.granularReverbSendGain : 0) +
                (this.delayAModule ? this.heap[delayAReverbRightOffset + i] : 0) +
                (this.delayBModule ? this.heap[delayBReverbRightOffset + i] : 0);
              const preCompGain = this.processReverbPreCompressorSample(reverbInLeft, reverbInRight);
              const conditionedReverbLeft = reverbInLeft * preCompGain * this.reverbInputMakeupGain;
              const conditionedReverbRight = reverbInRight * preCompGain * this.reverbInputMakeupGain;
              const limitedReverbLeft = this.softLimitReverbFeedSample(conditionedReverbLeft);
              const limitedReverbRight = this.softLimitReverbFeedSample(conditionedReverbRight);
              this.processReverbInputDelaySample(limitedReverbLeft, limitedReverbRight);
              this.heap[reverbInputLeftOffset + i] = this.reverbDelayedInputLeft;
              this.heap[reverbInputRightOffset + i] = this.reverbDelayedInputRight;
              reverbInputPeak = Math.max(
                reverbInputPeak,
                Math.abs(this.reverbDelayedInputLeft),
                Math.abs(this.reverbDelayedInputRight),
              );
            }
            const preparedReverbPeak = this.processSpectralFreezePreReverb(frames, reverbInputPeak);
            this.processPreparedReverb(frames, preparedReverbPeak);
            this.processSpectralFreezePostReverb(frames);
          }
          mixerInputBusCount = KESSHO_CORE_MIXER_INPUT_BUS_COUNT;
        } else if (sourceIsPad) {
        if (!this.ensureMixerMode('pad')) {
          this.mixLeft.fill(0, 0, frames);
          this.mixRight.fill(0, 0, frames);
        }
        const ok = this.api.moduleProcessPlanarStereoTaps(
          this.sourceModule,
          this.leftPtr,
          this.rightPtr,
          this.mixerInputLPtrsPtr,
          this.mixerInputRPtrsPtr,
          KESSHO_MODULE_PAD_OUTPUT_TAP_COUNT,
          frames,
        ) === 1;
        if (!ok) {
          this.postQueueFailure('sourceModuleTapProcess');
        }
        this.processPadPostChain(
          0,
          this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD1],
          this.sourceTapRightPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD1],
          frames,
        );
        this.processPadPostChain(
          1,
          this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD2],
          this.sourceTapRightPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD2],
          frames,
        );
        if (this.delayAModule) {
          const delayInputLeftOffset = this.delayAInputLeftPtr >> 2;
          const delayInputRightOffset = this.delayAInputRightPtr >> 2;
          const pad1LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad1RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad2LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          const pad2RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          for (let i = 0; i < frames; i += 1) {
            this.heap[delayInputLeftOffset + i] =
              this.heap[pad1LeftOffset + i] * this.delayAPad1SendGain +
              this.heap[pad2LeftOffset + i] * this.delayAPad2SendGain;
            this.heap[delayInputRightOffset + i] =
              this.heap[pad1RightOffset + i] * this.delayAPad1SendGain +
              this.heap[pad2RightOffset + i] * this.delayAPad2SendGain;
          }
          this.addAuxDelaySendsToInput(activeAuxSlots, frames);
          this.addExternalDelayAInput(inputs, frames);
          this.addDeferredDelayAInput(frames);
          this.processDelayAReturn(frames);
        }
        if (this.delayBModule) {
          const delayBInputLeftOffset = this.delayBInputLeftPtr >> 2;
          const delayBInputRightOffset = this.delayBInputRightPtr >> 2;
          const pad1LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad1RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad2LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          const pad2RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          for (let i = 0; i < frames; i += 1) {
            this.heap[delayBInputLeftOffset + i] =
              this.heap[pad1LeftOffset + i] * this.delayBPad1SendGain +
              this.heap[pad2LeftOffset + i] * this.delayBPad2SendGain;
            this.heap[delayBInputRightOffset + i] =
              this.heap[pad1RightOffset + i] * this.delayBPad1SendGain +
              this.heap[pad2RightOffset + i] * this.delayBPad2SendGain;
          }
          this.addAuxDelayBSendsToInput(activeAuxSlots, frames);
          this.addExternalDelayBInput(inputs, frames);
          this.addDelayAToDelayBInput(frames);
          if (this.delayBGranularInputGain <= 0.0001) {
            this.processDelayBReturn(frames);
          }
        }
        if (this.granularModule) {
          const granularInputLeftOffset = this.granularInputLeftPtr >> 2;
          const granularInputRightOffset = this.granularInputRightPtr >> 2;
          const pad1LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad1RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad2LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          const pad2RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          const delayAGranularLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND] >> 2;
          const delayAGranularRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND] >> 2;
          const delayBGranularLeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND] >> 2;
          const delayBGranularRightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND] >> 2;
          for (let i = 0; i < frames; i += 1) {
            this.heap[granularInputLeftOffset + i] =
              this.heap[pad1LeftOffset + i] * this.granularPad1SendGain +
              this.heap[pad2LeftOffset + i] * this.granularPad2SendGain +
              this.auxGranularInputSample(activeAuxSlots, i, 'left') +
              (this.externalGranularInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_GRANULAR, i, 'left') : 0) +
              (this.delayAModule ? this.heap[delayAGranularLeftOffset + i] * this.granularDelayASendGain : 0) +
              (this.delayBModule ? this.heap[delayBGranularLeftOffset + i] : 0);
            this.heap[granularInputRightOffset + i] =
              this.heap[pad1RightOffset + i] * this.granularPad1SendGain +
              this.heap[pad2RightOffset + i] * this.granularPad2SendGain +
              this.auxGranularInputSample(activeAuxSlots, i, 'right') +
              (this.externalGranularInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_GRANULAR, i, 'right') : 0) +
              (this.delayAModule ? this.heap[delayAGranularRightOffset + i] * this.granularDelayASendGain : 0) +
              (this.delayBModule ? this.heap[delayBGranularRightOffset + i] : 0);
          }
          this.processGranularReturn(frames);
        }
        if (this.delayBModule && this.delayBGranularInputGain > 0.0001) {
          this.addGranularToDelayBInput(frames);
          this.processDelayBReturn(frames);
        }
        if (this.reverbModule) {
          const reverbInputLeftOffset = this.reverbInputLeftPtr >> 2;
          const reverbInputRightOffset = this.reverbInputRightPtr >> 2;
          const pad1LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad1RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1] >> 2;
          const pad2LeftOffset = this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          const pad2RightOffset = this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD2] >> 2;
          const delayAReverbLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND] >> 2;
          const delayAReverbRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND] >> 2;
          const delayBReverbLeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND] >> 2;
          const delayBReverbRightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND] >> 2;
          const granularOutputLeftOffset = this.granularOutputLeftPtr >> 2;
          const granularOutputRightOffset = this.granularOutputRightPtr >> 2;
          let reverbInputPeak = 0;
          for (let i = 0; i < frames; i += 1) {
            const reverbInLeft =
              this.heap[pad1LeftOffset + i] * this.reverbPad1SendGain +
              this.heap[pad2LeftOffset + i] * this.reverbPad2SendGain +
              this.auxReverbInputSample(activeAuxSlots, i, 'left') +
              (this.externalReverbInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_REVERB, i, 'left') : 0) +
              (this.granularModule ? this.heap[granularOutputLeftOffset + i] * this.granularReverbSendGain : 0) +
              (this.delayAModule ? this.heap[delayAReverbLeftOffset + i] : 0) +
              (this.delayBModule ? this.heap[delayBReverbLeftOffset + i] : 0);
            const reverbInRight =
              this.heap[pad1RightOffset + i] * this.reverbPad1SendGain +
              this.heap[pad2RightOffset + i] * this.reverbPad2SendGain +
              this.auxReverbInputSample(activeAuxSlots, i, 'right') +
              (this.externalReverbInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_REVERB, i, 'right') : 0) +
              (this.granularModule ? this.heap[granularOutputRightOffset + i] * this.granularReverbSendGain : 0) +
              (this.delayAModule ? this.heap[delayAReverbRightOffset + i] : 0) +
              (this.delayBModule ? this.heap[delayBReverbRightOffset + i] : 0);
            const preCompGain = this.processReverbPreCompressorSample(reverbInLeft, reverbInRight);
            const conditionedReverbLeft = reverbInLeft * preCompGain * this.reverbInputMakeupGain;
            const conditionedReverbRight = reverbInRight * preCompGain * this.reverbInputMakeupGain;
            const limitedReverbLeft = this.softLimitReverbFeedSample(conditionedReverbLeft);
            const limitedReverbRight = this.softLimitReverbFeedSample(conditionedReverbRight);
            this.processReverbInputDelaySample(limitedReverbLeft, limitedReverbRight);
            this.heap[reverbInputLeftOffset + i] = this.reverbDelayedInputLeft;
            this.heap[reverbInputRightOffset + i] = this.reverbDelayedInputRight;
            reverbInputPeak = Math.max(
              reverbInputPeak,
              Math.abs(this.reverbDelayedInputLeft),
              Math.abs(this.reverbDelayedInputRight),
            );
          }
          const preparedReverbPeak = this.processSpectralFreezePreReverb(frames, reverbInputPeak);
          this.processPreparedReverb(frames, preparedReverbPeak);
          this.processSpectralFreezePostReverb(frames);
        }
        mixerInputBusCount = KESSHO_CORE_MIXER_INPUT_BUS_COUNT;
        } else {
          if (!this.ensureMixerMode('lead')) {
            this.mixLeft.fill(0, 0, frames);
            this.mixRight.fill(0, 0, frames);
          }
          const ok = this.api.moduleProcessPlanarStereo(
            this.sourceModule,
            this.leftPtr,
            this.rightPtr,
            this.leftPtr,
            this.rightPtr,
            frames,
          ) === 1;
          if (!ok) {
            this.postQueueFailure('sourceModuleProcess');
          }
          this.stepSourceGainRamp(frames);
          if (this.delayAModule) {
            const delayInputLeftOffset = this.delayAInputLeftPtr >> 2;
            const delayInputRightOffset = this.delayAInputRightPtr >> 2;
            const sourceDelaySendGain = Number.isFinite(this.sourceDelayASendGain)
              ? this.sourceDelayASendGain
              : (this.sourceLeadIndex > 0 ? this.delayALead2SendGain : this.delayALead1SendGain);
            for (let i = 0; i < frames; i += 1) {
              this.heap[delayInputLeftOffset + i] = this.left[i] * sourceDelaySendGain;
              this.heap[delayInputRightOffset + i] = this.right[i] * sourceDelaySendGain;
            }
            this.addAuxDelaySendsToInput(activeAuxSlots, frames);
            this.addExternalDelayAInput(inputs, frames);
            this.addDeferredDelayAInput(frames);
            this.processDelayAReturn(frames);
          }
          if (this.delayBModule) {
            const delayBInputLeftOffset = this.delayBInputLeftPtr >> 2;
            const delayBInputRightOffset = this.delayBInputRightPtr >> 2;
            const sourceDelayBSendGain = Number.isFinite(this.sourceDelayBSendGain)
              ? this.sourceDelayBSendGain
              : (this.sourceLeadIndex > 0 ? this.delayBLead2SendGain : this.delayBLead1SendGain);
            for (let i = 0; i < frames; i += 1) {
              this.heap[delayBInputLeftOffset + i] = this.left[i] * sourceDelayBSendGain;
              this.heap[delayBInputRightOffset + i] = this.right[i] * sourceDelayBSendGain;
            }
            this.addAuxDelayBSendsToInput(activeAuxSlots, frames);
            this.addExternalDelayBInput(inputs, frames);
            this.addDelayAToDelayBInput(frames);
            if (this.delayBGranularInputGain <= 0.0001) {
              this.processDelayBReturn(frames);
            }
          }
          if (this.granularModule) {
            const granularInputLeftOffset = this.granularInputLeftPtr >> 2;
            const granularInputRightOffset = this.granularInputRightPtr >> 2;
            const delayAGranularLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND] >> 2;
            const delayAGranularRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_GRANULAR_SEND] >> 2;
            const delayBGranularLeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND] >> 2;
            const delayBGranularRightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_GRANULAR_SEND] >> 2;
            const sourceGranularSendGain = Number.isFinite(this.sourceGranularSendGain)
              ? this.sourceGranularSendGain
              : 0;
            for (let i = 0; i < frames; i += 1) {
              this.heap[granularInputLeftOffset + i] =
                this.left[i] * sourceGranularSendGain +
                this.auxGranularInputSample(activeAuxSlots, i, 'left') +
                (this.externalGranularInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_GRANULAR, i, 'left') : 0) +
                (this.delayAModule ? this.heap[delayAGranularLeftOffset + i] * this.granularDelayASendGain : 0) +
                (this.delayBModule ? this.heap[delayBGranularLeftOffset + i] : 0);
              this.heap[granularInputRightOffset + i] =
                this.right[i] * sourceGranularSendGain +
                this.auxGranularInputSample(activeAuxSlots, i, 'right') +
                (this.externalGranularInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_GRANULAR, i, 'right') : 0) +
                (this.delayAModule ? this.heap[delayAGranularRightOffset + i] * this.granularDelayASendGain : 0) +
                (this.delayBModule ? this.heap[delayBGranularRightOffset + i] : 0);
            }
            this.processGranularReturn(frames);
          }
          if (this.delayBModule && this.delayBGranularInputGain > 0.0001) {
            this.addGranularToDelayBInput(frames);
            this.processDelayBReturn(frames);
          }
          if (this.reverbModule) {
            const reverbInputLeftOffset = this.reverbInputLeftPtr >> 2;
            const reverbInputRightOffset = this.reverbInputRightPtr >> 2;
            const delayAReverbLeftOffset = this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND] >> 2;
            const delayAReverbRightOffset = this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_REVERB_SEND] >> 2;
            const delayBReverbLeftOffset = this.delayBTapLeftPtrs[KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND] >> 2;
            const delayBReverbRightOffset = this.delayBTapRightPtrs[KESSHO_MODULE_DELAY_B_TAP_REVERB_SEND] >> 2;
            const granularOutputLeftOffset = this.granularOutputLeftPtr >> 2;
            const granularOutputRightOffset = this.granularOutputRightPtr >> 2;
            const sourceReverbSendGain = Number.isFinite(this.sourceReverbSendGain)
              ? this.sourceReverbSendGain
              : 0;
            let reverbInputPeak = 0;
            for (let i = 0; i < frames; i += 1) {
              const reverbInLeft =
                this.left[i] * sourceReverbSendGain +
                this.auxReverbInputSample(activeAuxSlots, i, 'left') +
                (this.externalReverbInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_REVERB, i, 'left') : 0) +
                (this.granularModule ? this.heap[granularOutputLeftOffset + i] * this.granularReverbSendGain : 0) +
                (this.delayAModule ? this.heap[delayAReverbLeftOffset + i] : 0) +
                (this.delayBModule ? this.heap[delayBReverbLeftOffset + i] : 0);
              const reverbInRight =
                this.right[i] * sourceReverbSendGain +
                this.auxReverbInputSample(activeAuxSlots, i, 'right') +
                (this.externalReverbInputActive ? this.externalInputSample(inputs, KESSHO_CORE_INPUT_REVERB, i, 'right') : 0) +
                (this.granularModule ? this.heap[granularOutputRightOffset + i] * this.granularReverbSendGain : 0) +
                (this.delayAModule ? this.heap[delayAReverbRightOffset + i] : 0) +
                (this.delayBModule ? this.heap[delayBReverbRightOffset + i] : 0);
              const preCompGain = this.processReverbPreCompressorSample(reverbInLeft, reverbInRight);
              const conditionedReverbLeft = reverbInLeft * preCompGain * this.reverbInputMakeupGain;
              const conditionedReverbRight = reverbInRight * preCompGain * this.reverbInputMakeupGain;
              const limitedReverbLeft = this.softLimitReverbFeedSample(conditionedReverbLeft);
              const limitedReverbRight = this.softLimitReverbFeedSample(conditionedReverbRight);
              this.processReverbInputDelaySample(limitedReverbLeft, limitedReverbRight);
              this.heap[reverbInputLeftOffset + i] = this.reverbDelayedInputLeft;
              this.heap[reverbInputRightOffset + i] = this.reverbDelayedInputRight;
              reverbInputPeak = Math.max(
                reverbInputPeak,
                Math.abs(this.reverbDelayedInputLeft),
                Math.abs(this.reverbDelayedInputRight),
              );
            }
            const preparedReverbPeak = this.processSpectralFreezePreReverb(frames, reverbInputPeak);
            this.processPreparedReverb(frames, preparedReverbPeak);
            this.processSpectralFreezePostReverb(frames);
          }
          this.processPadPostChain(0, this.leftPtr, this.rightPtr, frames);
          const dryGain = Number.isFinite(this.sourceDryGain) ? this.sourceDryGain : 1;
          if (Math.abs(dryGain - 1) > 1e-7) {
            for (let i = 0; i < frames; i += 1) {
              this.left[i] *= dryGain;
              this.right[i] *= dryGain;
            }
          }
          mixerInputBusCount = KESSHO_CORE_MIXER_INPUT_BUS_COUNT;
        }
      } else {
        this.ensureMixerMode('main');
        this.api.render(this.engine, this.leftPtr, this.rightPtr, frames);
      }
      this.storeDeferredDelayAInput(frames);
      if (!this.processMixerRoute(frames, mixerInputBusCount)) {
        this.postQueueFailure('mixerProcess');
        this.mixLeft.fill(0, 0, frames);
        this.mixRight.fill(0, 0, frames);
      }
      this.addAuxDryToMix(activeAuxSlots, frames);
      if (!this.sourceModule && activeAuxSlots.length > 0) {
        this.addDelayADryToMix(frames);
      }
      this.addGranularDryToMix(frames);
      this.addDelayBDryToMix(frames);
      if (this.dynamicsModule) {
        const ok = this.api.moduleProcessPlanarStereo(
          this.dynamicsModule,
          this.mixLeftPtr,
          this.mixRightPtr,
          this.mixLeftPtr,
          this.mixRightPtr,
          frames,
        ) === 1;
        if (!ok) {
          this.postQueueFailure('dynamicsModuleProcess');
        }
      }
      for (let i = 0; i < frames; i += 1) {
        left[i] = this.mixLeft[i];
        right[i] = this.mixRight[i];
      }
      if (this.sourceModule && this.sourceModuleType === KESSHO_MODULE_PAD) {
        this.copyPlanarPtrsToOutput(
          pad1StemOutput,
          this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD1],
          this.sourceTapRightPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD1],
          frames,
        );
        this.copyPlanarPtrsToOutput(
          pad1PreStemOutput,
          this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1],
          this.sourceTapRightPtrs[KESSHO_MODULE_TAP_PREFADER_PAD1],
          frames,
        );
        this.copyPlanarPtrsToOutput(
          pad2StemOutput,
          this.sourceTapLeftPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD2],
          this.sourceTapRightPtrs[KESSHO_MODULE_TAP_POSTFADER_PAD2],
          frames,
        );
      } else {
        this.clearOutput(pad1StemOutput, frames);
        this.clearOutput(pad2StemOutput, frames);
        this.clearOutput(pad1PreStemOutput, frames);
      }
      let copiedLead1Stem = false;
      let copiedLead2Stem = false;
      if (this.sourceModule && this.sourceModuleType === KESSHO_MODULE_LEAD_FM) {
        this.copyPlanarPtrsToOutput(
          this.sourceLeadIndex > 0 ? lead2StemOutput : lead1StemOutput,
          this.leftPtr,
          this.rightPtr,
          frames,
          KESSHO_CORE_LEAD_RECORDABLE_TRIM_COMPENSATION,
        );
        copiedLead1Stem = this.sourceLeadIndex <= 0;
        copiedLead2Stem = this.sourceLeadIndex > 0;
      }
      for (const slot of activeAuxSlots) {
        if (slot.kind !== 'lead-fm') continue;
        this.copyPlanarPtrsToOutput(
          slot.leadIndex > 0 ? lead2StemOutput : lead1StemOutput,
          slot.leftPtr,
          slot.rightPtr,
          frames,
          (Number.isFinite(slot.dryGain) ? slot.dryGain : 1) * KESSHO_CORE_LEAD_RECORDABLE_TRIM_COMPENSATION,
        );
        if (slot.leadIndex > 0) copiedLead2Stem = true;
        else copiedLead1Stem = true;
      }
      if (!copiedLead1Stem) this.clearOutput(lead1StemOutput, frames);
      if (!copiedLead2Stem) this.clearOutput(lead2StemOutput, frames);
      if (this.reverbModule && this.reverbReturnGain > 0.0001) {
        this.copyPlanarPtrsToOutput(
          reverbStemOutput,
          this.reverbOutputLeftPtr,
          this.reverbOutputRightPtr,
          frames,
          this.reverbReturnGain,
        );
      } else {
        this.clearOutput(reverbStemOutput, frames);
      }
      if (this.reverbModule) {
        this.copyPlanarPtrsToOutput(
          reverbFeedStemOutput,
          this.reverbInputLeftPtr,
          this.reverbInputRightPtr,
          frames,
        );
      } else {
        this.clearOutput(reverbFeedStemOutput, frames);
      }
      if (this.delayAModule) {
        this.copyPlanarPtrsToOutput(
          delayAStemOutput,
          this.delayATapLeftPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN],
          this.delayATapRightPtrs[KESSHO_MODULE_DELAY_A_TAP_MAIN],
          frames,
        );
      } else {
        this.clearOutput(delayAStemOutput, frames);
      }
      this.recordPerf(startMs, frames);
      return true;
    }

    for (let i = 0; i < frames; i += 1) {
      left[i] = 0;
      right[i] = 0;
    }
    this.clearOutput(reverbStemOutput, frames);
    this.clearOutput(delayAStemOutput, frames);
    this.clearOutput(pad1StemOutput, frames);
    this.clearOutput(pad2StemOutput, frames);
    this.clearOutput(pad1PreStemOutput, frames);
    this.clearOutput(reverbFeedStemOutput, frames);
    this.clearOutput(lead1StemOutput, frames);
    this.clearOutput(lead2StemOutput, frames);
    return true;
  }

  recordPerf(startMs, frames) {
    if (!this.perfEnabled || !startMs) return;
    const endMs = globalThis.performance?.now?.() ?? startMs;
    const elapsedMs = Math.max(0, endMs - startMs);
    const budgetMs = (frames / sampleRate) * 1000;
    this.perfBlocks += 1;
    this.perfSumMs += elapsedMs;
    this.perfPeakMs = Math.max(this.perfPeakMs, elapsedMs);
    if (elapsedMs > budgetMs) this.perfMisses += 1;

    if (this.perfBlocks < 60) return;

    const avgMs = this.perfSumMs / this.perfBlocks;
    this.port.postMessage({
      type: 'perf',
      name: 'kessho-core',
      cpuPercent: budgetMs > 0 ? (avgMs / budgetMs) * 100 : 0,
      peakPercent: budgetMs > 0 ? (this.perfPeakMs / budgetMs) * 100 : 0,
      missPercent: (this.perfMisses / this.perfBlocks) * 100,
      activeModules: (this.sourceModule ? 1 : (this.renderMode === 1 ? 1 : 0)) +
        this.activeAuxSourceCount() +
        (this.granularModule ? 1 : 0) +
        (this.spectralFreezeModule ? 1 : 0) +
        (this.reverbModule ? 1 : 0) +
        (this.delayAModule ? 1 : 0) +
        (this.delayBModule ? 1 : 0) +
        (this.dynamicsModule ? 1 : 0),
      eventQueueDepth: this.api.getEventQueueDepth(this.engine),
      midiQueueDepth: 0,
    });
    this.perfBlocks = 0;
    this.perfSumMs = 0;
    this.perfPeakMs = 0;
    this.perfMisses = 0;
  }
}

registerProcessor('kessho-core', KesshoCoreProcessor);
