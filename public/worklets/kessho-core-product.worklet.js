const EVENT_BYTES = 40;
const TELEMETRY_BYTES = 7728;
const SNAPSHOT_SCHEMA_HASH_OFFSET = 4;
const EXPECTED_PRODUCT_SCHEMA_HASH = 0xe91058d7;
const SEQUENCER_UI_STATE_LANES = 16;
const SEQUENCER_UI_STATE_STEPS = 64;
const SEQUENCER_UI_LANE_BYTES = 3024;
const SEQUENCER_UI_STATE_BYTES = 96804;
const SEQUENCER_UI_SYNTH_LANES_OFFSET = 36;
const SEQUENCER_UI_DRUM_LANES_OFFSET =
  SEQUENCER_UI_SYNTH_LANES_OFFSET + SEQUENCER_UI_STATE_LANES * SEQUENCER_UI_LANE_BYTES;
const SEQUENCER_UI_CHANGE_DICE = 3;
const SEQUENCER_UI_CHANGE_RESET_HOME = 4;
const SEQUENCER_UI_CHANGE_EVOLUTION = 5;
const PRODUCT_EVENT_IDS = Object.freeze({
  SetParam: 1,
  SetTransport: 2,
  Start: 3,
  Stop: 4,
  ResetTransport: 5,
  SetSequencerStep: 7,
  SetSequencerLane: 8,
  SetSourceEnabled: 11,
  SetSourcePreset: 12,
  SetJourneyState: 13,
  ManualNoteOn: 14,
  ManualNoteOff: 15,
  MidiEvent: 16,
  TriggerDrumVoice: 17,
  StartJourneyMorphClock: 21,
  StopJourneyMorphClock: 22,
  SetHarmonyRoot: 23,
  SetScale: 24,
  SetSeed: 25,
  ResetRng: 26,
  SetModulationRange: 27,
  ResetSequencerLaneHome: 28,
  DiceSequencerLane: 29,
  SetSourceOverride: 30,
});
const PRODUCT_EVENT_ID_SET = new Set(Object.values(PRODUCT_EVENT_IDS));
const PRODUCT_SOURCE_IDS = new Set([1, 2, 3, 4, 5, 6, 7]);
const PRODUCT_SEQUENCER_IDS = new Set([1, 2]);
const PRODUCT_DRUM_VOICE_COUNT = 7;
const PRODUCT_GRAPH_TAP_COUNT = 110;
const DAW_OUTPUT_MAX_CHANNELS = 32;
const STEM_PEAK_COUNT = 9;
const EARTH_TEXTURE_CAPACITY = 4;
const MODULATION_DEBUG_CAPACITY = 96;
const TELEMETRY_EARTH_OFFSET = 1292;
const TELEMETRY_MODULATION_DEBUG_COUNT_OFFSET = 1580;
const TELEMETRY_MODULATION_DEBUG_OFFSET = 1584;
const TELEMETRY_MODULATION_DEBUG_LAST_TRIGGER_FRAME_OFFSET = 6960;
const STEM_PEAK_PROBE_INTERVAL_BLOCKS = 64;
const GRAPH_TAP_IDLE_DISABLE_SECONDS = 0.05;
const GRANULAR_WAVEFORM_BINS = 512;
const GRANULAR_WAVEFORM_BYTES = GRANULAR_WAVEFORM_BINS * Float32Array.BYTES_PER_ELEMENT;
const GRANULAR_WAVEFORM_SKIP = 15;
const STEP_TOGGLE_CLEAR_LANE = 2;
const STEP_FIELD_MASK = 15 << 8;
const STEP_FIELD_SUBLANE_CONFIG = 8 << 8;

class KesshoCoreProductProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.ready = false;
    this.engine = 0;
    this.exports = null;
    this.api = null;
    this.leftPtr = 0;
    this.rightPtr = 0;
    this.eventPtr = 0;
    this.snapshotPtr = 0;
    this.telemetryPtr = 0;
    this.granularWaveformPtr = 0;
    this.granularWaveformReportCounter = 0;
    this.sequencerUiStatePtr = 0;
    this.lastSequencerUiStateRevision = 0;
    this.lastSequencerUiState = null;
    this.assetAllocations = new Map();
    this.assetDecodedBytes = 0;
    this.assetAllocationBytes = 0;
    this.frames = 128;
    this.lastOutputPeak = 0;
    this.outputPeakWindow = 0;
    this.lastStemPeaks = new Array(STEM_PEAK_COUNT).fill(0);
    this.stemPeakWindow = new Array(STEM_PEAK_COUNT).fill(0);
    this.stemPeakProbeCountdown = 0;
    this.lastGraphTapPeaks = new Array(PRODUCT_GRAPH_TAP_COUNT).fill(0);
    this.graphTapCaptures = new Map();
    this.coreGraphTapsEnabled = null;
    this.graphTapDisableCountdownBlocks = 0;
    this.dawOutputRouting = { enabled: false, channelCount: 2, routes: [] };
    this.dawOutputClearMarks = new Uint8Array(DAW_OUTPUT_MAX_CHANNELS);
    this.dawOutputClearToken = 1;
    this.perfEnabled = false;
    this.perfTotalMs = 0;
    this.perfCount = 0;
    this.perfPeakMs = 0;
    this.perfMissedQuantumCount = 0;
    this.perfBlockMs = [];
    this.lastRenderCpuPercent = 0;
    this.lastRenderCpuPeakPercent = 0;
    this.lastRenderP95Ms = 0;
    this.lastRenderP99Ms = 0;
    this.lastMissedQuantumCount = 0;
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
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Kessho Product Core WASM fetch failed: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  resolve(name) {
    const direct = this.exports[name];
    const underscored = this.exports[`_${name}`];
    const fn = direct || underscored;
    if (typeof fn !== 'function') {
      throw new Error(`Missing Kessho Product Core WASM export: ${name}`);
    }
    return fn;
  }

  formatSchemaHash(schemaHash) {
    return `0x${(schemaHash >>> 0).toString(16).padStart(8, '0')}`;
  }

  assertSchemaHash(label, schemaHash) {
    if ((schemaHash >>> 0) !== EXPECTED_PRODUCT_SCHEMA_HASH) {
      throw new Error(
        `Kessho Product Core ${label} schema hash mismatch: expected ` +
          `${this.formatSchemaHash(EXPECTED_PRODUCT_SCHEMA_HASH)}, got ${this.formatSchemaHash(schemaHash)}`,
      );
    }
  }

  validateSnapshotBytes(bytes) {
    if (bytes.byteLength < SNAPSHOT_SCHEMA_HASH_OFFSET + 4) {
      throw new Error(`Kessho Product Core snapshot too small: ${bytes.byteLength} bytes`);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.assertSchemaHash('snapshot', view.getUint32(SNAPSHOT_SCHEMA_HASH_OFFSET, true));
  }

  refreshViews() {
    this.heapF32 = new Float32Array(this.exports.memory.buffer);
    this.heapU8 = new Uint8Array(this.exports.memory.buffer);
    this.view = new DataView(this.exports.memory.buffer);
  }

  async load(wasmBinary, wasmUrl) {
    try {
      const bytes = this.normalizeWasmBinary(wasmBinary) || await this.fetchWasmBinary(wasmUrl);
      const { instance } = await WebAssembly.instantiate(bytes, {
        env: {
          emscripten_notify_memory_growth: () => this.refreshViews(),
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
      });
      this.exports = instance.exports;
      this.refreshViews();
      this.api = {
        malloc: this.resolve('malloc'),
        free: this.resolve('free'),
        create: this.resolve('kessho_product_create'),
        reset: this.resolve('kessho_product_reset'),
        resetParityFx: this.resolve('kessho_product_reset_parity_fx'),
        render: this.resolve('kessho_product_render'),
        getStem: this.resolve('kessho_product_get_stem'),
        getGraphTap: this.resolve('kessho_product_get_graph_tap'),
        setGraphTapsEnabled: this.resolve('kessho_product_set_graph_taps_enabled'),
        loadSnapshot: this.resolve('kessho_product_load_snapshot_v2'),
        enqueueEvent: this.resolve('kessho_product_enqueue_event'),
        copyTelemetry: this.resolve('kessho_product_copy_telemetry'),
        copyGranularWaveform: this.resolve('kessho_product_copy_granular_waveform'),
        copySequencerUiState: this.resolve('kessho_product_copy_sequencer_ui_state'),
        registerAsset: this.resolve('kessho_product_register_asset_buffer'),
        unregisterAsset: this.resolve('kessho_product_unregister_asset_buffer'),
      };
      const bytesPerFrame = this.frames * Float32Array.BYTES_PER_ELEMENT;
      this.leftPtr = this.api.malloc(bytesPerFrame);
      this.rightPtr = this.api.malloc(bytesPerFrame);
      this.eventPtr = this.api.malloc(EVENT_BYTES);
      this.telemetryPtr = this.api.malloc(TELEMETRY_BYTES);
      this.granularWaveformPtr = this.api.malloc(GRANULAR_WAVEFORM_BYTES);
      this.sequencerUiStatePtr = this.api.malloc(SEQUENCER_UI_STATE_BYTES);
      this.engine = this.api.create(sampleRate, this.frames, 0);
      if (!this.engine || !this.leftPtr || !this.rightPtr || !this.eventPtr || !this.telemetryPtr || !this.granularWaveformPtr || !this.sequencerUiStatePtr) {
        throw new Error('Failed to allocate Kessho Product Core worklet state');
      }
      if (this.api.copyTelemetry(this.engine, this.telemetryPtr) !== 1) {
        throw new Error('Kessho Product Core WASM telemetry schema probe failed');
      }
      this.assertSchemaHash('WASM telemetry', this.view.getUint32(this.telemetryPtr, true));
      this.setCoreGraphTapsEnabled(false);
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  handleMessage(message) {
    if (!message) return;
    if (message.type === 'enablePerf') {
      this.setPerfEnabled(Boolean(message.enabled));
      return;
    }
    if (!this.ready) return;
    try {
      if (message.type === 'event') {
        this.enqueueEvent(message.event);
        return;
      }
      if (message.type === 'snapshot') {
        this.loadSnapshot(message.snapshot);
        return;
      }
      if (message.type === 'reset') {
        this.api.reset(this.engine);
        return;
      }
      if (message.type === 'reset-parity-fx') {
        this.api.resetParityFx(this.engine);
        return;
      }
      if (message.type === 'register-asset') {
        this.registerAsset(message);
        return;
      }
      if (message.type === 'unregister-asset') {
        this.unregisterAsset(message.assetId);
        return;
      }
      if (message.type === 'request-telemetry') {
        this.postTelemetry();
        return;
      }
      if (message.type === 'request-visual-telemetry') {
        this.postVisualTelemetry(Boolean(message.includeGranularWaveform));
        return;
      }
      if (message.type === 'daw-output-routing') {
        this.setDawOutputRouting(message.config);
        return;
      }
      if (message.type === 'graph-capture-start') {
        this.startGraphTapCapture(message);
        return;
      }
      if (message.type === 'graph-capture-flush') {
        this.flushGraphTapCapture(message.tapId, false);
        return;
      }
      if (message.type === 'graph-capture-stop') {
        this.flushGraphTapCapture(message.tapId, true);
        return;
      }
      throw new Error(`Unknown Kessho Product Core worklet message: ${String(message.type)}`);
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return typeof Date !== 'undefined' && typeof Date.now === 'function'
      ? Date.now()
      : 0;
  }

  setPerfEnabled(enabled) {
    this.perfEnabled = enabled;
    this.resetPerfWindow();
    this.lastRenderCpuPercent = 0;
    this.lastRenderCpuPeakPercent = 0;
    this.lastRenderP95Ms = 0;
    this.lastRenderP99Ms = 0;
    this.lastMissedQuantumCount = 0;
  }

  resetPerfWindow() {
    this.perfTotalMs = 0;
    this.perfCount = 0;
    this.perfPeakMs = 0;
    this.perfMissedQuantumCount = 0;
    this.perfBlockMs.length = 0;
  }

  recordPerfBlock(startMs, frames) {
    if (!this.perfEnabled || startMs <= 0) return;
    const elapsedMs = Math.max(0, this.nowMs() - startMs);
    const budgetMs = sampleRate > 0 ? (frames * 1000) / sampleRate : 0;
    this.perfTotalMs += elapsedMs;
    this.perfCount += 1;
    this.perfPeakMs = Math.max(this.perfPeakMs, elapsedMs);
    if (budgetMs > 0 && elapsedMs > budgetMs) {
      this.perfMissedQuantumCount += 1;
    }
    this.perfBlockMs.push(elapsedMs);
    if (this.perfBlockMs.length > 2048) {
      this.perfBlockMs.shift();
    }
  }

  percentile(values, percentileValue) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const rank = percentileValue * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return sorted[lo];
    const t = rank - lo;
    return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
  }

  flushPerfWindow() {
    if (!this.perfEnabled || this.perfCount === 0) return;
    const budgetMs = sampleRate > 0 ? (this.frames * 1000) / sampleRate : 0;
    const averageMs = this.perfTotalMs / this.perfCount;
    this.lastRenderCpuPercent = budgetMs > 0 ? (averageMs / budgetMs) * 100 : 0;
    this.lastRenderCpuPeakPercent = budgetMs > 0 ? (this.perfPeakMs / budgetMs) * 100 : 0;
    this.lastRenderP95Ms = this.percentile(this.perfBlockMs, 0.95);
    this.lastRenderP99Ms = this.percentile(this.perfBlockMs, 0.99);
    this.lastMissedQuantumCount = this.perfMissedQuantumCount;
    this.resetPerfWindow();
  }

  setCoreGraphTapsEnabled(enabled) {
    if (!this.api?.setGraphTapsEnabled || !this.engine) return;
    if (this.coreGraphTapsEnabled === enabled) return;
    const result = this.api.setGraphTapsEnabled(this.engine, enabled ? 1 : 0);
    if (result !== 1) {
      throw new Error(`Kessho Product Core graph tap mode update failed: ${result}`);
    }
    this.coreGraphTapsEnabled = enabled;
  }

  scheduleGraphTapIdleDisable() {
    this.graphTapDisableCountdownBlocks = Math.max(
      1,
      Math.ceil((sampleRate * GRAPH_TAP_IDLE_DISABLE_SECONDS) / this.frames),
    );
  }

  maintainGraphTapMode() {
    if (!this.coreGraphTapsEnabled || this.graphTapCaptures.size > 0 || this.hasActiveDawOutputRoutes()) return;
    if (this.graphTapDisableCountdownBlocks <= 0) return;
    this.graphTapDisableCountdownBlocks -= 1;
    if (this.graphTapDisableCountdownBlocks === 0) {
      this.setCoreGraphTapsEnabled(false);
    }
  }

  normalizeDawOutputChannelCount(rawChannelCount) {
    const channelCount = Math.trunc(Number(rawChannelCount));
    if (!Number.isFinite(channelCount)) return 2;
    const clamped = Math.max(2, Math.min(DAW_OUTPUT_MAX_CHANNELS, channelCount));
    return clamped % 2 === 0 ? clamped : Math.max(2, clamped - 1);
  }

  normalizeDawOutputChannel(rawChannel, channelCount) {
    const raw = Math.trunc(Number(rawChannel));
    if (!Number.isFinite(raw)) return null;
    const channel = raw % 2 === 0 ? raw - 1 : raw;
    if (channel < 3 || channel + 1 > channelCount) return null;
    return channel;
  }

  normalizeDawOutputRouting(rawConfig) {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return { enabled: false, channelCount: 2, routes: [] };
    }
    const channelCount = this.normalizeDawOutputChannelCount(rawConfig.channelCount);
    const routes = [];
    if (Array.isArray(rawConfig.routes)) {
      for (const rawRoute of rawConfig.routes) {
        if (!rawRoute || typeof rawRoute !== 'object') continue;
        const tapId = this.normalizeGraphTapId(rawRoute.tapId);
        const channel = this.normalizeDawOutputChannel(rawRoute.channel, channelCount);
        if (channel === null) continue;
        routes.push({ tapId, channel });
      }
    }
    return {
      enabled: Boolean(rawConfig.enabled),
      channelCount,
      routes,
    };
  }

  hasActiveDawOutputRoutes() {
    return Boolean(this.dawOutputRouting.enabled && this.dawOutputRouting.routes.length > 0);
  }

  setDawOutputRouting(rawConfig) {
    const hadRoutes = this.hasActiveDawOutputRoutes();
    this.dawOutputRouting = this.normalizeDawOutputRouting(rawConfig);
    if (this.hasActiveDawOutputRoutes()) {
      this.setCoreGraphTapsEnabled(true);
      this.graphTapDisableCountdownBlocks = 0;
      return;
    }
    if (hadRoutes && this.graphTapCaptures.size === 0) {
      this.scheduleGraphTapIdleDisable();
    }
  }

  normalizeGraphTapId(rawTapId) {
    const tapId = Math.trunc(Number(rawTapId));
    if (!Number.isFinite(tapId) || tapId < 0 || tapId >= PRODUCT_GRAPH_TAP_COUNT) {
      throw new Error(`Invalid Kessho Product Core graph tap id: ${String(rawTapId)}`);
    }
    return tapId;
  }

  startGraphTapCapture(message) {
    const tapId = this.normalizeGraphTapId(message.tapId);
    const chunkFrames = Math.max(128, Math.round(Number(message.chunkFrames) || 4096));
    if (this.graphTapCaptures.size === 0) {
      this.setCoreGraphTapsEnabled(true);
    }
    this.graphTapDisableCountdownBlocks = 0;
    this.lastGraphTapPeaks[tapId] = 0;
    this.graphTapCaptures.set(tapId, {
      tapId,
      chunkFrames,
      leftChunk: new Float32Array(chunkFrames),
      rightChunk: new Float32Array(chunkFrames),
      writeIndex: 0,
    });
  }

  emitGraphTapCaptureChunk(capture, frameCount) {
    if (frameCount <= 0) return;
    const left = capture.leftChunk.slice(0, frameCount);
    const right = capture.rightChunk.slice(0, frameCount);
    this.port.postMessage(
      {
        type: 'graph-capture-chunk',
        tapId: capture.tapId,
        frameCount,
        left,
        right,
      },
      [left.buffer, right.buffer],
    );
  }

  resetGraphTapCaptureBuffers(capture) {
    capture.leftChunk = new Float32Array(capture.chunkFrames);
    capture.rightChunk = new Float32Array(capture.chunkFrames);
    capture.writeIndex = 0;
  }

  appendGraphTapCapture(capture, leftIndex, rightIndex, frames) {
    let offset = 0;
    while (offset < frames) {
      const available = capture.chunkFrames - capture.writeIndex;
      const copyCount = Math.min(available, frames - offset);
      for (let i = 0; i < copyCount; i += 1) {
        capture.leftChunk[capture.writeIndex + i] = this.heapF32[leftIndex + offset + i] || 0;
        capture.rightChunk[capture.writeIndex + i] = this.heapF32[rightIndex + offset + i] || 0;
      }
      capture.writeIndex += copyCount;
      offset += copyCount;
      if (capture.writeIndex >= capture.chunkFrames) {
        this.emitGraphTapCaptureChunk(capture, capture.chunkFrames);
        this.resetGraphTapCaptureBuffers(capture);
      }
    }
  }

  flushGraphTapCapture(rawTapId, stopped) {
    const tapId = this.normalizeGraphTapId(rawTapId);
    const capture = this.graphTapCaptures.get(tapId);
    if (capture) {
      if (capture.writeIndex > 0) {
        this.emitGraphTapCaptureChunk(capture, capture.writeIndex);
      }
      if (stopped) {
        this.graphTapCaptures.delete(tapId);
        if (this.graphTapCaptures.size === 0) {
          this.scheduleGraphTapIdleDisable();
        }
      } else {
        this.resetGraphTapCaptureBuffers(capture);
      }
    }
    this.port.postMessage({ type: 'graph-capture-flushed', tapId, stopped: Boolean(stopped) });
  }

  shouldSampleStemPeaks() {
    if (this.stemPeakProbeCountdown <= 0) {
      this.stemPeakProbeCountdown = STEM_PEAK_PROBE_INTERVAL_BLOCKS - 1;
      return true;
    }
    this.stemPeakProbeCountdown -= 1;
    return false;
  }

  resetStemPeakWindow() {
    this.stemPeakWindow.fill(0);
  }

  sampleOutputPeak(left, right, frames) {
    let peak = 0;
    for (let i = 0; i < frames; i += 1) {
      peak = Math.max(peak, Math.abs(left[i] || 0), Math.abs(right[i] || 0));
    }
    this.outputPeakWindow = Math.max(this.outputPeakWindow || 0, peak);
  }

  flushOutputPeakWindow() {
    this.lastOutputPeak = this.outputPeakWindow || 0;
    this.outputPeakWindow = 0;
  }

  sampleStemPeaks(frames) {
    const leftIndex = this.leftPtr >> 2;
    const rightIndex = this.rightPtr >> 2;
    for (let stem = 0; stem < STEM_PEAK_COUNT; stem += 1) {
      let stemPeak = 0;
      if (this.api.getStem(this.engine, stem, this.leftPtr, this.rightPtr, frames) === 1) {
        for (let i = 0; i < frames; i += 1) {
          stemPeak = Math.max(
            stemPeak,
            Math.abs(this.heapF32[leftIndex + i] || 0),
            Math.abs(this.heapF32[rightIndex + i] || 0),
          );
        }
      }
      this.stemPeakWindow[stem] = Math.max(this.stemPeakWindow[stem] || 0, stemPeak);
    }
  }

  flushStemPeakWindow() {
    this.lastStemPeaks = this.stemPeakWindow.slice(0, STEM_PEAK_COUNT);
    this.resetStemPeakWindow();
  }

  processActiveGraphTapCaptures(frames) {
    if (this.graphTapCaptures.size === 0) return;
    const leftIndex = this.leftPtr >> 2;
    const rightIndex = this.rightPtr >> 2;
    for (const [tap, capture] of this.graphTapCaptures) {
      let tapPeak = 0;
      if (this.api.getGraphTap(this.engine, tap, this.leftPtr, this.rightPtr, frames) === 1) {
        for (let i = 0; i < frames; i += 1) {
          tapPeak = Math.max(
            tapPeak,
            Math.abs(this.heapF32[leftIndex + i] || 0),
            Math.abs(this.heapF32[rightIndex + i] || 0),
          );
        }
        this.appendGraphTapCapture(capture, leftIndex, rightIndex, frames);
      }
      this.lastGraphTapPeaks[tap] = Math.max(this.lastGraphTapPeaks[tap] || 0, tapPeak);
    }
  }

  clearDawOutputChannel(output, channelIndex) {
    const channel = output?.[channelIndex];
    if (!channel) return null;
    if (this.dawOutputClearMarks[channelIndex] !== this.dawOutputClearToken) {
      channel.fill(0);
      this.dawOutputClearMarks[channelIndex] = this.dawOutputClearToken;
    }
    return channel;
  }

  renderDawOutputChannels(output, frames) {
    if (!this.hasActiveDawOutputRoutes()) return;
    if (!output || output.length <= 2) return;
    this.dawOutputClearToken = (this.dawOutputClearToken % 255) + 1;
    if (this.dawOutputClearToken === 1) {
      this.dawOutputClearMarks.fill(0);
    }

    const leftIndex = this.leftPtr >> 2;
    const rightIndex = this.rightPtr >> 2;
    for (const route of this.dawOutputRouting.routes) {
      const leftOutputIndex = route.channel - 1;
      const rightOutputIndex = route.channel;
      if (leftOutputIndex < 2 || rightOutputIndex >= output.length) continue;
      if (this.api.getGraphTap(this.engine, route.tapId, this.leftPtr, this.rightPtr, frames) !== 1) continue;
      const outLeft = this.clearDawOutputChannel(output, leftOutputIndex);
      const outRight = this.clearDawOutputChannel(output, rightOutputIndex);
      if (!outLeft || !outRight) continue;
      for (let i = 0; i < frames; i += 1) {
        outLeft[i] += this.heapF32[leftIndex + i] || 0;
        outRight[i] += this.heapF32[rightIndex + i] || 0;
      }
    }
  }

  hasField(event, field) {
    return event && Object.prototype.hasOwnProperty.call(event, field);
  }

  requireUint(event, field, min, max) {
    if (!this.hasField(event, field)) {
      throw new Error(`Kessho Product Core event missing required field: ${field}`);
    }
    const value = event[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Kessho Product Core event field ${field} must be an integer in [${min}, ${max}]`);
    }
    return value >>> 0;
  }

  requireFloat(event, field, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
    if (!this.hasField(event, field)) {
      throw new Error(`Kessho Product Core event missing required field: ${field}`);
    }
    const value = event[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Kessho Product Core event field ${field} must be a finite number in [${min}, ${max}]`);
    }
    return value;
  }

  optionalUint(event, field, fallback, min, max) {
    if (!this.hasField(event, field)) return fallback >>> 0;
    return this.requireUint(event, field, min, max);
  }

  optionalFloat(event, field, fallback, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
    if (!this.hasField(event, field)) return fallback;
    return this.requireFloat(event, field, min, max);
  }

  requireSourceId(value, field) {
    if (!PRODUCT_SOURCE_IDS.has(value)) {
      throw new Error(`Kessho Product Core event field ${field} has unknown source id: ${value}`);
    }
    return value;
  }

  requireSequencerId(value, field) {
    if (!PRODUCT_SEQUENCER_IDS.has(value)) {
      throw new Error(`Kessho Product Core event field ${field} has unknown sequencer id: ${value}`);
    }
    return value;
  }

  normalizeEvent(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('Kessho Product Core event must be an object');
    }
    const eventKind = this.requireUint(event, 'eventKind', 1, 30);
    if (!PRODUCT_EVENT_ID_SET.has(eventKind)) {
      throw new Error(`Unknown Kessho Product Core event kind: ${eventKind}`);
    }
    const normalized = {
      sampleOffset: this.optionalUint(event, 'sampleOffset', 0, 0, 0xffffffff),
      eventKind,
      targetId: 0,
      index: 0,
      paramId: 0,
      value: 0,
      value2: 0,
      value3: 0,
      value4: 0,
      flags: 0,
    };
    switch (eventKind) {
      case PRODUCT_EVENT_IDS.Start:
      case PRODUCT_EVENT_IDS.Stop:
      case PRODUCT_EVENT_IDS.ResetTransport:
      case PRODUCT_EVENT_IDS.ResetRng:
      case PRODUCT_EVENT_IDS.StartJourneyMorphClock:
      case PRODUCT_EVENT_IDS.StopJourneyMorphClock:
        return normalized;
      case PRODUCT_EVENT_IDS.SetParam:
        normalized.targetId = this.requireUint(event, 'targetId', 0, 0xffffffff);
        normalized.index = this.requireUint(event, 'index', 0, 0xffffffff);
        normalized.paramId = this.requireUint(event, 'paramId', 1, 0xffffffff);
        normalized.value = this.requireFloat(event, 'value');
        return normalized;
      case PRODUCT_EVENT_IDS.SetSourceEnabled:
        normalized.targetId = this.requireSourceId(this.requireUint(event, 'targetId', 1, 7), 'targetId');
        normalized.value = this.requireFloat(event, 'value', 0, 1);
        return normalized;
      case PRODUCT_EVENT_IDS.SetSourcePreset:
        normalized.targetId = this.requireSourceId(this.requireUint(event, 'targetId', 1, 7), 'targetId');
        normalized.index = this.optionalUint(event, 'index', 0, 0xffffffff);
        normalized.value = this.requireFloat(event, 'value', Number.MIN_VALUE);
        normalized.value2 = this.optionalFloat(event, 'value2', 0, 0, 1);
        normalized.flags = this.optionalUint(event, 'flags', 0, 0xffffffff);
        return normalized;
      case PRODUCT_EVENT_IDS.SetSourceOverride:
        normalized.targetId = this.requireSourceId(this.requireUint(event, 'targetId', 1, 7), 'targetId');
        normalized.index = this.optionalUint(event, 'index', 0, 0xffffffff);
        normalized.paramId = this.optionalUint(event, 'paramId', 0, 0xffffffff);
        normalized.value = this.optionalFloat(event, 'value', 0);
        normalized.flags = this.requireUint(event, 'flags', 1, 0xffffffff);
        return normalized;
      case PRODUCT_EVENT_IDS.ManualNoteOn:
        normalized.targetId = this.requireSourceId(this.requireUint(event, 'targetId', 1, 7), 'targetId');
        normalized.value = this.requireFloat(event, 'value', 0, 127);
        normalized.value2 = this.requireFloat(event, 'value2', Number.MIN_VALUE, 1);
        normalized.value3 = this.requireFloat(event, 'value3', Number.MIN_VALUE);
        normalized.value4 = this.optionalFloat(event, 'value4', 0);
        normalized.flags = this.optionalUint(event, 'flags', 0, 0, 0xffffffff);
        return normalized;
      case PRODUCT_EVENT_IDS.ManualNoteOff:
        normalized.targetId = this.requireSourceId(this.requireUint(event, 'targetId', 1, 7), 'targetId');
        return normalized;
      case PRODUCT_EVENT_IDS.TriggerDrumVoice:
        normalized.targetId = this.requireUint(event, 'targetId', 0, PRODUCT_DRUM_VOICE_COUNT - 1);
        normalized.value = this.requireFloat(event, 'value', Number.MIN_VALUE, 1);
        return normalized;
      case PRODUCT_EVENT_IDS.MidiEvent:
        normalized.targetId = this.optionalUint(event, 'targetId', 0, 0, 7);
        if (normalized.targetId !== 0) this.requireSourceId(normalized.targetId, 'targetId');
        normalized.index = this.requireUint(event, 'index', 0, 15);
        normalized.value = this.requireFloat(event, 'value', 0, 255);
        normalized.value2 = this.requireFloat(event, 'value2', 0, 127);
        normalized.value3 = this.requireFloat(event, 'value3', 0, 127);
        normalized.value4 = this.optionalFloat(event, 'value4', 0, 0, 1);
        normalized.flags = this.optionalUint(event, 'flags', 0, 0, 16);
        return normalized;
      case PRODUCT_EVENT_IDS.SetSequencerStep:
        normalized.targetId = this.requireSequencerId(this.requireUint(event, 'targetId', 1, 2), 'targetId');
        normalized.index = this.requireUint(event, 'index', 0, SEQUENCER_UI_STATE_LANES - 1);
        normalized.flags = this.requireUint(event, 'flags', 0, 0xffffffff);
        if ((normalized.flags & STEP_TOGGLE_CLEAR_LANE) === 0) {
          normalized.paramId = this.requireUint(event, 'paramId', 0, 63);
          normalized.value = this.requireFloat(event, 'value');
          normalized.value2 = this.optionalFloat(event, 'value2', 0);
          normalized.value3 = this.optionalFloat(event, 'value3', 0);
        }
        if ((normalized.flags & STEP_FIELD_MASK) === STEP_FIELD_SUBLANE_CONFIG) {
          normalized.value2 = this.requireFloat(event, 'value2', 1, 64);
          normalized.value3 = this.requireFloat(event, 'value3', 0, 2);
        }
        return normalized;
      case PRODUCT_EVENT_IDS.SetSequencerLane:
        normalized.targetId = this.requireSequencerId(this.requireUint(event, 'targetId', 1, 2), 'targetId');
        normalized.index = this.requireUint(event, 'index', 0, SEQUENCER_UI_STATE_LANES - 1);
        normalized.paramId = this.requireUint(event, 'paramId', 1, 0xffffffff);
        normalized.value = this.requireFloat(event, 'value');
        return normalized;
      case PRODUCT_EVENT_IDS.SetJourneyState:
        normalized.value = this.requireFloat(event, 'value', 0, 1);
        normalized.value2 = this.requireFloat(event, 'value2', 0, 1);
        normalized.value3 = this.requireFloat(event, 'value3', Number.MIN_VALUE);
        return normalized;
      case PRODUCT_EVENT_IDS.SetHarmonyRoot:
      case PRODUCT_EVENT_IDS.SetTransport:
        normalized.value = this.requireFloat(event, 'value');
        return normalized;
      case PRODUCT_EVENT_IDS.SetScale:
      case PRODUCT_EVENT_IDS.SetSeed:
        normalized.targetId = this.requireUint(event, 'targetId', 1, 0xffffffff);
        return normalized;
      case PRODUCT_EVENT_IDS.SetModulationRange:
        normalized.targetId = this.requireUint(event, 'targetId', 0, 0xffffffff);
        normalized.index = this.requireUint(event, 'index', 1, 0xffffffff);
        normalized.paramId = this.requireUint(event, 'paramId', 1, 0xffffffff);
        normalized.value = this.requireFloat(event, 'value');
        normalized.value2 = this.requireFloat(event, 'value2');
        normalized.value3 = this.requireFloat(event, 'value3', 0, 2);
        normalized.value4 = this.requireFloat(event, 'value4');
        normalized.flags = this.requireUint(event, 'flags', 0, 0xffffffff);
        return normalized;
      case PRODUCT_EVENT_IDS.ResetSequencerLaneHome:
        normalized.targetId = this.requireSequencerId(this.requireUint(event, 'targetId', 1, 2), 'targetId');
        normalized.index = this.requireUint(event, 'index', 0, SEQUENCER_UI_STATE_LANES - 1);
        return normalized;
      case PRODUCT_EVENT_IDS.DiceSequencerLane:
        normalized.targetId = this.requireSequencerId(this.requireUint(event, 'targetId', 1, 2), 'targetId');
        normalized.index = this.requireUint(event, 'index', 0, SEQUENCER_UI_STATE_LANES - 1);
        normalized.paramId = this.optionalUint(event, 'paramId', 0, 0, 0xffffffff);
        normalized.value = this.optionalFloat(event, 'value', 0);
        normalized.value2 = this.optionalFloat(event, 'value2', 0);
        normalized.value3 = this.optionalFloat(event, 'value3', 0);
        normalized.value4 = this.optionalFloat(event, 'value4', 0);
        normalized.flags = this.requireUint(event, 'flags', 0, 0xffffffff);
        return normalized;
      default:
        throw new Error(`Unhandled Kessho Product Core event kind: ${eventKind}`);
    }
  }

  writeEvent(event) {
    const normalized = this.normalizeEvent(event);
    const ptr = this.eventPtr;
    this.view.setUint32(ptr, normalized.sampleOffset, true);
    this.view.setUint32(ptr + 4, normalized.eventKind, true);
    this.view.setUint32(ptr + 8, normalized.targetId, true);
    this.view.setUint32(ptr + 12, normalized.index, true);
    this.view.setUint32(ptr + 16, normalized.paramId, true);
    this.view.setFloat32(ptr + 20, normalized.value, true);
    this.view.setFloat32(ptr + 24, normalized.value2, true);
    this.view.setFloat32(ptr + 28, normalized.value3, true);
    this.view.setFloat32(ptr + 32, normalized.value4, true);
    this.view.setUint32(ptr + 36, normalized.flags, true);
  }

  enqueueEvent(event) {
    this.writeEvent(event);
    const result = this.api.enqueueEvent(this.engine, this.eventPtr);
    if (result !== 1) {
      throw new Error(`Kessho Product Core event enqueue failed: ${result}`);
    }
  }

  loadSnapshot(snapshot) {
    const bytes = snapshot instanceof ArrayBuffer
      ? new Uint8Array(snapshot)
      : ArrayBuffer.isView(snapshot)
        ? new Uint8Array(snapshot.buffer, snapshot.byteOffset, snapshot.byteLength)
        : null;
    if (!bytes) {
      throw new Error('Kessho Product Core snapshot message missing snapshot bytes');
    }
    this.validateSnapshotBytes(bytes);
    if (this.snapshotPtr) {
      this.api.free(this.snapshotPtr);
      this.snapshotPtr = 0;
    }
    this.snapshotPtr = this.api.malloc(bytes.byteLength);
    this.heapU8.set(bytes, this.snapshotPtr);
    const result = this.api.loadSnapshot(this.engine, this.snapshotPtr, bytes.byteLength);
    if (result !== 1) {
      throw new Error(`Kessho Product Core snapshot load failed: ${result}`);
    }
  }

  registerAsset(message) {
    const channels = Array.isArray(message.channels) ? message.channels : [];
    if (!Number.isInteger(message.assetId) || message.assetId <= 0) {
      throw new Error('Kessho Product Core asset registration missing required assetId');
    }
    if (!channels.length) {
      throw new Error(`Kessho Product Core asset ${message.assetId} has no channels`);
    }
    if (typeof message.sampleRate !== 'number' || !Number.isFinite(message.sampleRate) || message.sampleRate <= 0) {
      throw new Error(`Kessho Product Core asset ${message.assetId} missing required sampleRate`);
    }
    if (!Number.isInteger(message.flags) || message.flags < 0) {
      throw new Error(`Kessho Product Core asset ${message.assetId} missing required flags`);
    }
    const old = this.assetAllocations.get(message.assetId);
    if (old) {
      this.api.unregisterAsset(this.engine, message.assetId);
      old.ptrs.forEach((ptr) => this.api.free(ptr));
      this.api.free(old.ptrArray);
      this.assetDecodedBytes -= old.decodedBytes || 0;
      this.assetAllocationBytes -= old.allocationBytes || 0;
    }
    let decodedBytes = 0;
    const ptrs = channels.slice(0, 2).map((channel) => {
      const data = channel instanceof Float32Array ? channel : new Float32Array(channel);
      const byteLength = data.length * Float32Array.BYTES_PER_ELEMENT;
      decodedBytes += byteLength;
      const ptr = this.api.malloc(byteLength);
      if (!ptr) {
        throw new Error(`Kessho Product Core asset allocation failed for asset ${message.assetId}`);
      }
      this.heapF32.set(data, ptr >> 2);
      return ptr;
    });
    const ptrArrayBytes = ptrs.length * Uint32Array.BYTES_PER_ELEMENT;
    const ptrArray = this.api.malloc(ptrArrayBytes);
    if (!ptrArray) {
      ptrs.forEach((ptr) => this.api.free(ptr));
      throw new Error(`Kessho Product Core asset pointer allocation failed for asset ${message.assetId}`);
    }
    for (let i = 0; i < ptrs.length; i += 1) {
      this.view.setUint32(ptrArray + i * 4, ptrs[i], true);
    }
    const allocationBytes = decodedBytes + ptrArrayBytes;
    this.assetAllocations.set(message.assetId, { ptrs, ptrArray, decodedBytes, allocationBytes });
    this.assetDecodedBytes += decodedBytes;
    this.assetAllocationBytes += allocationBytes;
    const result = this.api.registerAsset(
      this.engine,
      message.assetId,
      ptrArray,
      ptrs.length,
      channels[0].length,
      message.sampleRate,
      message.flags,
    );
    if (result !== 1) {
      this.assetAllocations.delete(message.assetId);
      this.assetDecodedBytes -= decodedBytes;
      this.assetAllocationBytes -= allocationBytes;
      ptrs.forEach((ptr) => this.api.free(ptr));
      this.api.free(ptrArray);
      throw new Error(`Kessho Product Core asset registration failed for asset ${message.assetId}: ${result}`);
    }
  }

  unregisterAsset(assetId) {
    if (!Number.isInteger(assetId) || assetId <= 0) {
      throw new Error('Kessho Product Core asset unregistration missing required assetId');
    }
    const old = this.assetAllocations.get(assetId);
    if (!old) return;
    this.api.unregisterAsset(this.engine, assetId);
    old.ptrs.forEach((ptr) => this.api.free(ptr));
    this.api.free(old.ptrArray);
    this.assetAllocations.delete(assetId);
    this.assetDecodedBytes -= old.decodedBytes || 0;
    this.assetAllocationBytes -= old.allocationBytes || 0;
  }

  readUint64Number(byteOffset) {
    const low = this.view.getUint32(byteOffset, true);
    const high = this.view.getUint32(byteOffset + 4, true);
    return high * 4294967296 + low;
  }

  maskHas(low, high, step) {
    if (step < 32) return (low & (1 << step)) !== 0;
    return (high & (1 << (step - 32))) !== 0;
  }

  highestMaskStep(low, high) {
    for (let step = SEQUENCER_UI_STATE_STEPS - 1; step >= 0; step -= 1) {
      if (this.maskHas(low, high, step)) return step;
    }
    return -1;
  }

  readToggleOverrides(ptr, setLow, setHigh, valueLow, valueHigh) {
    const toggles = [];
    for (let step = 0; step < SEQUENCER_UI_STATE_STEPS; step += 1) {
      if (this.maskHas(setLow, setHigh, step)) {
        toggles.push([step, this.maskHas(valueLow, valueHigh, step)]);
      }
    }
    return toggles;
  }

  readFloatOverrides(ptr, setLow, setHigh, valuesOffset) {
    const lastStep = this.highestMaskStep(setLow, setHigh);
    if (lastStep < 0) return null;
    const values = [];
    for (let step = 0; step <= lastStep; step += 1) {
      values.push(this.view.getFloat32(ptr + valuesOffset + step * 4, true));
    }
    return values;
  }

  readUintOverrides(ptr, setLow, setHigh, valuesOffset) {
    const lastStep = this.highestMaskStep(setLow, setHigh);
    if (lastStep < 0) return null;
    const values = [];
    for (let step = 0; step <= lastStep; step += 1) {
      values.push(this.view.getUint32(ptr + valuesOffset + step * 4, true));
    }
    return values;
  }

  readTrigConditionOverrides(ptr, setLow, setHigh) {
    const lastStep = this.highestMaskStep(setLow, setHigh);
    if (lastStep < 0) return null;
    const values = [];
    for (let step = 0; step <= lastStep; step += 1) {
      values.push([
        this.view.getUint32(ptr + 680 + step * 4, true),
        this.view.getUint32(ptr + 936 + step * 4, true),
      ]);
    }
    return values;
  }

  readUint32Array(ptr, valuesOffset, count) {
    const values = [];
    for (let index = 0; index < count; index += 1) {
      values.push(this.view.getUint32(ptr + valuesOffset + index * 4, true));
    }
    return values;
  }

  readSequencerLaneUiState(ptr) {
    const stepSetLow = this.view.getUint32(ptr + 28, true);
    const stepSetHigh = this.view.getUint32(ptr + 32, true);
    return {
      enabled: this.view.getUint32(ptr, true) !== 0,
      targetSourceId: this.view.getUint32(ptr + 4, true),
      stepCount: this.view.getUint32(ptr + 8, true),
      fillCount: this.view.getUint32(ptr + 12, true),
      rotation: this.view.getInt32(ptr + 16, true),
      clockDivision: this.view.getUint32(ptr + 20, true),
      mutationFlags: this.view.getUint32(ptr + 24, true),
      triggerToggles: this.readToggleOverrides(
        ptr,
        stepSetLow,
        stepSetHigh,
        this.view.getUint32(ptr + 36, true),
        this.view.getUint32(ptr + 40, true),
      ),
      probabilityOverrideSetLow: this.view.getUint32(ptr + 44, true),
      probabilityOverrideSetHigh: this.view.getUint32(ptr + 48, true),
      ratchetOverrideSetLow: this.view.getUint32(ptr + 52, true),
      ratchetOverrideSetHigh: this.view.getUint32(ptr + 56, true),
      trigConditionOverrideSetLow: this.view.getUint32(ptr + 60, true),
      trigConditionOverrideSetHigh: this.view.getUint32(ptr + 64, true),
      midiNoteOverrideSetLow: this.view.getUint32(ptr + 68, true),
      midiNoteOverrideSetHigh: this.view.getUint32(ptr + 72, true),
      expressionOverrideSetLow: this.view.getUint32(ptr + 76, true),
      expressionOverrideSetHigh: this.view.getUint32(ptr + 80, true),
      morphOverrideSetLow: this.view.getUint32(ptr + 84, true),
      morphOverrideSetHigh: this.view.getUint32(ptr + 88, true),
      distanceOverrideSetLow: this.view.getUint32(ptr + 92, true),
      distanceOverrideSetHigh: this.view.getUint32(ptr + 96, true),
      stepValueConfigEnabledMask: this.view.getUint32(ptr + 100, true),
      stepValueConfigSteps: this.readUint32Array(ptr, 104, 8),
      stepValueConfigDirections: this.readUint32Array(ptr, 136, 8),
      expressionRangeSetLow: this.view.getUint32(ptr + 2216, true),
      expressionRangeSetHigh: this.view.getUint32(ptr + 2220, true),
      morphRangeSetLow: this.view.getUint32(ptr + 2224, true),
      morphRangeSetHigh: this.view.getUint32(ptr + 2228, true),
      distanceRangeSetLow: this.view.getUint32(ptr + 2232, true),
      distanceRangeSetHigh: this.view.getUint32(ptr + 2236, true),
      probability: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 44, true),
        this.view.getUint32(ptr + 48, true),
        168,
      ),
      ratchet: this.readUintOverrides(
        ptr,
        this.view.getUint32(ptr + 52, true),
        this.view.getUint32(ptr + 56, true),
        424,
      ),
      trigCondition: this.readTrigConditionOverrides(
        ptr,
        this.view.getUint32(ptr + 60, true),
        this.view.getUint32(ptr + 64, true),
      ),
      midiNote: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 68, true),
        this.view.getUint32(ptr + 72, true),
        1192,
      ),
      expression: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 76, true),
        this.view.getUint32(ptr + 80, true),
        1448,
      ),
      morph: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 84, true),
        this.view.getUint32(ptr + 88, true),
        1704,
      ),
      distance: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 92, true),
        this.view.getUint32(ptr + 96, true),
        1960,
      ),
      expressionRangeMaxes: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 2216, true),
        this.view.getUint32(ptr + 2220, true),
        2240,
      ),
      morphRangeMaxes: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 2224, true),
        this.view.getUint32(ptr + 2228, true),
        2496,
      ),
      distanceRangeMaxes: this.readFloatOverrides(
        ptr,
        this.view.getUint32(ptr + 2232, true),
        this.view.getUint32(ptr + 2236, true),
        2752,
      ),
      swing: this.view.getFloat32(ptr + 3008, true),
      baseMidiNote: this.view.getFloat32(ptr + 3012, true),
      noteRangeMin: this.view.getFloat32(ptr + 3016, true),
      noteRangeMax: this.view.getFloat32(ptr + 3020, true),
    };
  }

  readSequencerUiState(revision) {
    if (!this.sequencerUiStatePtr || this.api.copySequencerUiState(this.engine, this.sequencerUiStatePtr) !== 1) {
      return this.lastSequencerUiState;
    }
    const ptr = this.sequencerUiStatePtr;
    const synthLanes = [];
    const drumLanes = [];
    for (let lane = 0; lane < SEQUENCER_UI_STATE_LANES; lane += 1) {
      synthLanes.push(this.readSequencerLaneUiState(ptr + SEQUENCER_UI_SYNTH_LANES_OFFSET + lane * SEQUENCER_UI_LANE_BYTES));
      drumLanes.push(this.readSequencerLaneUiState(ptr + SEQUENCER_UI_DRUM_LANES_OFFSET + lane * SEQUENCER_UI_LANE_BYTES));
    }
    this.lastSequencerUiStateRevision = revision;
    this.lastSequencerUiState = {
      schemaHash: this.view.getUint32(ptr, true),
      revision: this.view.getUint32(ptr + 4, true),
      synthLaneCount: this.view.getUint32(ptr + 8, true),
      drumLaneCount: this.view.getUint32(ptr + 12, true),
      evolutionAmount: this.view.getFloat32(ptr + 16, true),
      evolutionState: this.view.getUint32(ptr + 20, true),
      lastChangedTargetId: this.view.getUint32(ptr + 24, true),
      lastChangedLaneIndex: this.view.getUint32(ptr + 28, true),
      lastChangeKind: this.view.getUint32(ptr + 32, true),
      synthLanes,
      drumLanes,
    };
    return this.lastSequencerUiState;
  }

  readTelemetry() {
    if (!this.telemetryPtr || this.api.copyTelemetry(this.engine, this.telemetryPtr) !== 1) {
      return null;
    }
    this.flushPerfWindow();
    this.flushOutputPeakWindow();
    this.flushStemPeakWindow();
    const ptr = this.telemetryPtr;
    const runtimeWalkValues = {};
    const runtimeWalkCount = Math.min(this.view.getUint32(ptr + 156, true), 96);
    for (let index = 0; index < runtimeWalkCount; index += 1) {
      const controlId = this.view.getUint32(ptr + 160 + index * 4, true);
      const value = this.view.getFloat32(ptr + 544 + index * 4, true);
      if (controlId !== 0) {
        runtimeWalkValues[controlId] = value;
      }
    }
    const sourcePresetIds = [];
    for (let index = 0; index < 7; index += 1) {
      sourcePresetIds.push(this.view.getUint32(ptr + 936 + index * 4, true));
    }
    const synthSequencerHitCounts = [];
    const drumSequencerHitCounts = [];
    const synthSequencerCurrentSteps = [];
    const drumSequencerCurrentSteps = [];
    for (let index = 0; index < 16; index += 1) {
      synthSequencerHitCounts.push(this.view.getUint32(ptr + 1036 + index * 4, true));
      drumSequencerHitCounts.push(this.view.getUint32(ptr + 1100 + index * 4, true));
      synthSequencerCurrentSteps.push(this.view.getUint32(ptr + 1164 + index * 4, true));
      drumSequencerCurrentSteps.push(this.view.getUint32(ptr + 1228 + index * 4, true));
    }
    const sequencerUiStateRevision = this.view.getUint32(ptr + 984, true);
    const sequencerUiState =
      sequencerUiStateRevision !== 0 && sequencerUiStateRevision !== this.lastSequencerUiStateRevision
        ? this.readSequencerUiState(sequencerUiStateRevision)
        : null;
    const earthTextureDebugState = this.readEarthTextureDebugState(ptr);
    const productModulationDebug = this.readProductModulationDebug(ptr);
    return {
      schemaHash: this.view.getUint32(ptr, true),
      sampleRate: this.view.getFloat64(ptr + 8, true),
      blockSize: this.view.getUint32(ptr + 16, true),
      transportRunning: this.view.getUint32(ptr + 20, true) !== 0,
      absoluteSampleTime: this.readUint64Number(ptr + 24),
      beatPosition: this.view.getFloat64(ptr + 32, true),
      barIndex: this.readUint64Number(ptr + 40),
      phraseIndex: this.readUint64Number(ptr + 48),
      activeSources: this.view.getUint32(ptr + 56, true),
      activeVoices: this.view.getUint32(ptr + 60, true),
      activeAssets: this.view.getUint32(ptr + 64, true),
      activeGrains: this.view.getUint32(ptr + 68, true),
      renderCpuPercent: this.perfEnabled ? this.lastRenderCpuPercent : this.view.getFloat32(ptr + 72, true),
      renderCpuPeakPercent: this.perfEnabled ? this.lastRenderCpuPeakPercent : this.view.getFloat32(ptr + 76, true),
      renderP95Ms: this.perfEnabled ? this.lastRenderP95Ms : this.view.getFloat32(ptr + 80, true),
      renderP99Ms: this.perfEnabled ? this.lastRenderP99Ms : this.view.getFloat32(ptr + 84, true),
      missedQuantumCount: this.perfEnabled ? this.lastMissedQuantumCount : this.view.getUint32(ptr + 88, true),
      wasmHeapBytes: this.exports.memory.buffer.byteLength,
      decodedAssetBytes: this.assetDecodedBytes,
      assetAllocationBytes: this.assetAllocationBytes,
      sequencerEventCount: this.view.getUint32(ptr + 96, true),
      controlQueueDepth: this.view.getUint32(ptr + 100, true),
      assetMissingCount: this.view.getUint32(ptr + 104, true),
      lastErrorCode: this.view.getInt32(ptr + 108, true),
      journeyMorphRunning: this.view.getUint32(ptr + 112, true) !== 0,
      journeyMorphPhase: this.view.getFloat32(ptr + 116, true),
      harmonyRootMidi: this.view.getFloat32(ptr + 120, true),
      harmonyScaleId: this.view.getUint32(ptr + 124, true),
      harmonyTension: this.view.getFloat32(ptr + 128, true),
      harmonyChordDegree: this.view.getUint32(ptr + 132, true),
      harmonyChordMidi: [
        this.view.getFloat32(ptr + 136, true),
        this.view.getFloat32(ptr + 140, true),
        this.view.getFloat32(ptr + 144, true),
        this.view.getFloat32(ptr + 148, true),
      ],
      modulationRangeCount: this.view.getUint32(ptr + 152, true),
      runtimeWalkCount,
      runtimeWalkValues,
      earthTextureDebugState,
      productModulationDebug,
      rngSeed: this.view.getUint32(ptr + 928, true),
      rngState: this.view.getUint32(ptr + 932, true),
      sourcePresetIds,
      masterInputPeak: this.view.getFloat32(ptr + 964, true),
      masterOutputPeak: this.view.getFloat32(ptr + 968, true),
      masterOutputRms: this.view.getFloat32(ptr + 972, true),
      masterLimiterGainReductionDb: this.view.getFloat32(ptr + 976, true),
      dynamicsSaturationDrive: this.view.getFloat32(ptr + 980, true),
      sequencerUiStateRevision,
      masterTruePeak: this.view.getFloat32(ptr + 988, true),
      masterTruePeakDbtp: this.view.getFloat32(ptr + 992, true),
      masterIntegratedLufs: this.view.getFloat32(ptr + 996, true),
      granularWriteHeadPosition: this.view.getFloat32(ptr + 1000, true),
      granularVoicePositions: [
        this.view.getFloat32(ptr + 1004, true),
        this.view.getFloat32(ptr + 1008, true),
        this.view.getFloat32(ptr + 1012, true),
        this.view.getFloat32(ptr + 1016, true),
      ],
      pad1FilterFreq: this.view.getFloat32(ptr + 1020, true),
      pad1Lfo1Value: this.view.getFloat32(ptr + 1024, true),
      pad2FilterFreq: this.view.getFloat32(ptr + 1028, true),
      pad2Lfo1Value: this.view.getFloat32(ptr + 1032, true),
      synthSequencerHitCounts,
      drumSequencerHitCounts,
      synthSequencerCurrentSteps,
      drumSequencerCurrentSteps,
      sequencerUiState,
      sequencerUiChangeDice: SEQUENCER_UI_CHANGE_DICE,
      sequencerUiChangeResetHome: SEQUENCER_UI_CHANGE_RESET_HOME,
      sequencerUiChangeEvolution: SEQUENCER_UI_CHANGE_EVOLUTION,
      workletOutputPeak: this.lastOutputPeak,
      workletStemPeaks: this.lastStemPeaks,
      workletGraphTapPeaks: this.lastGraphTapPeaks,
      workletMasterStemPeak: this.lastStemPeaks[0] || 0,
      workletPadStemPeak: this.lastStemPeaks[1] || 0,
      workletLeadStemPeak: Math.max(this.lastStemPeaks[3] || 0, this.lastStemPeaks[4] || 0),
      workletFxStemPeak: this.lastStemPeaks[8] || 0,
    };
  }

  readEarthTextureDebugState(ptr) {
    const keys = ['waves', 'birds', 'birds2', 'frogs'];
    const state = {};
    for (let index = 0; index < EARTH_TEXTURE_CAPACITY; index += 1) {
      const base = ptr + TELEMETRY_EARTH_OFFSET;
      const assetId = this.view.getUint32(base + index * 4, true);
      const flags = this.view.getUint32(base + 16 + index * 4, true);
      const inactiveReasonCode = this.view.getUint32(base + 32 + index * 4, true);
      const activeSliceCount = this.view.getUint32(base + 48 + index * 4, true);
      const playingSliceCount = this.view.getUint32(base + 64 + index * 4, true);
      const lastSliceId = this.view.getUint32(base + 80 + index * 4, true);
      const seed = this.view.getUint32(base + 96 + index * 4, true);
      const offset = this.view.getFloat32(base + 112 + index * 4, true);
      const startTime = this.view.getFloat32(base + 128 + index * 4, true);
      const sliceDuration = this.view.getFloat32(base + 144 + index * 4, true);
      const outputDuration = this.view.getFloat32(base + 160 + index * 4, true);
      const detuneCents = this.view.getFloat32(base + 176 + index * 4, true);
      const speedMultiplier = this.view.getFloat32(base + 192 + index * 4, true);
      const totalRate = this.view.getFloat32(base + 208 + index * 4, true);
      const density = this.view.getFloat32(base + 224 + index * 4, true);
      const fadeTime = this.view.getFloat32(base + 240 + index * 4, true);
      const assetDuration = this.view.getFloat32(base + 256 + index * 4, true);
      const maxOffset = this.view.getFloat32(base + 272 + index * 4, true);
      const active = (flags & 1) !== 0;
      const key = keys[index];
      state[key] = {
        fileName: this.earthTextureAssetLabel(assetId),
        assetId,
        active,
        inactiveReason: active ? null : this.earthTextureInactiveReason(inactiveReasonCode),
        parityFixture: (flags & 2) !== 0,
        textureParamsAvailable: (flags & 4) !== 0,
        assetDuration,
        maxOffset,
        seed,
        sliceDuration,
        fadeTime,
        density,
        strideSeconds: 0,
        nowTime: this.view.getFloat64(ptr + 8, true) > 0
          ? this.readUint64Number(ptr + 24) / this.view.getFloat64(ptr + 8, true)
          : 0,
        activeSliceCount,
        playingSliceCount,
        activeSlices: lastSliceId === 0 ? [] : [{
          id: lastSliceId,
          startTime,
          endTime: startTime + Math.max(0, outputDuration),
          offset,
          bufferDuration: assetDuration,
          outputDuration,
          detuneCents,
          speedMultiplier,
          totalRate,
          isPlaying: playingSliceCount > 0,
        }],
      };
    }
    return state;
  }

  earthTextureAssetLabel(assetId) {
    switch (assetId) {
      case 7101: return 'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg';
      case 7102: return 'Alps Birds_441_m_normalized.ogg';
      case 7105: return 'Fujian Birds 2_441_m_normalized.ogg';
      case 7103: return 'Fujian_Frogs_m_441_normalized.ogg';
      default: return assetId ? `asset:${assetId}` : 'unassigned';
    }
  }

  earthTextureInactiveReason(code) {
    switch (code) {
      case 0: return null;
      case 1: return 'texture params missing';
      case 2: return 'parity fixture enabled';
      case 3: return 'asset not registered';
      case 4: return 'asset not found';
      case 5: return 'asset too short for offset variation';
      case 6: return 'source disabled';
      case 7: return 'slot muted';
      case 8: return 'density zero';
      case 9: return 'voice budget exceeded';
      default: return `inactive reason ${code}`;
    }
  }

  readProductModulationDebug(ptr) {
    const count = Math.min(this.view.getUint32(ptr + TELEMETRY_MODULATION_DEBUG_COUNT_OFFSET, true), MODULATION_DEBUG_CAPACITY);
    const randomWalk = [];
    const sampleHold = [];
    const uintBase = ptr + TELEMETRY_MODULATION_DEBUG_OFFSET;
    const floatBase = uintBase + MODULATION_DEBUG_CAPACITY * 9 * 4;
    const triggerFrameBase = ptr + TELEMETRY_MODULATION_DEBUG_LAST_TRIGGER_FRAME_OFFSET;
    for (let index = 0; index < count; index += 1) {
      const modeId = this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 3 * 4 + index * 4, true);
      const entry = {
        controlId: this.view.getUint32(uintBase + index * 4, true),
        targetId: this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 4 + index * 4, true),
        paramId: this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 2 * 4 + index * 4, true),
        mode: modeId === 2 ? 'randomWalk' : modeId === 1 ? 'sampleHold' : modeId === 0 ? 'off' : `mode:${modeId}`,
        triggerBus: this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 4 * 4 + index * 4, true),
        triggerCounter: this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 5 * 4 + index * 4, true),
        seed: this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 6 * 4 + index * 4, true),
        randomWalkGlobal: this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 7 * 4 + index * 4, true) !== 0,
        lastTriggerSource: this.view.getUint32(uintBase + MODULATION_DEBUG_CAPACITY * 8 * 4 + index * 4, true),
        min: this.view.getFloat32(floatBase + index * 4, true),
        max: this.view.getFloat32(floatBase + MODULATION_DEBUG_CAPACITY * 4 + index * 4, true),
        currentValue: this.view.getFloat32(floatBase + MODULATION_DEBUG_CAPACITY * 2 * 4 + index * 4, true),
        normalizedPosition: this.view.getFloat32(floatBase + MODULATION_DEBUG_CAPACITY * 3 * 4 + index * 4, true),
        speed: this.view.getFloat32(floatBase + MODULATION_DEBUG_CAPACITY * 4 * 4 + index * 4, true),
        lastTriggerFrame: this.readUint64Number(triggerFrameBase + index * 8),
      };
      if (entry.mode === 'randomWalk') randomWalk.push(entry);
      if (entry.mode === 'sampleHold') sampleHold.push(entry);
    }
    return { randomWalk, sampleHold };
  }

  readGranularWaveform(includeGranularWaveform) {
    if (!includeGranularWaveform || !this.granularWaveformPtr || !this.api.copyGranularWaveform) {
      this.granularWaveformReportCounter = 0;
      return null;
    }
    this.granularWaveformReportCounter += 1;
    if (this.granularWaveformReportCounter < GRANULAR_WAVEFORM_SKIP) {
      return null;
    }
    this.granularWaveformReportCounter = 0;
    if (this.api.copyGranularWaveform(this.engine, this.granularWaveformPtr, GRANULAR_WAVEFORM_BINS) !== 1) {
      return null;
    }
    const start = this.granularWaveformPtr >> 2;
    return new Float32Array(this.heapF32.subarray(start, start + GRANULAR_WAVEFORM_BINS));
  }

  readVisualTelemetry(includeGranularWaveform = false) {
    if (!this.telemetryPtr || this.api.copyTelemetry(this.engine, this.telemetryPtr) !== 1) {
      return null;
    }
    const ptr = this.telemetryPtr;
    const runtimeWalkValues = {};
    const runtimeWalkCount = Math.min(this.view.getUint32(ptr + 156, true), 96);
    for (let index = 0; index < runtimeWalkCount; index += 1) {
      const controlId = this.view.getUint32(ptr + 160 + index * 4, true);
      const value = this.view.getFloat32(ptr + 544 + index * 4, true);
      if (controlId !== 0) {
        runtimeWalkValues[controlId] = value;
      }
    }
    const synthSequencerHitCounts = [];
    const drumSequencerHitCounts = [];
    const synthSequencerCurrentSteps = [];
    const drumSequencerCurrentSteps = [];
    for (let index = 0; index < 16; index += 1) {
      synthSequencerHitCounts.push(this.view.getUint32(ptr + 1036 + index * 4, true));
      drumSequencerHitCounts.push(this.view.getUint32(ptr + 1100 + index * 4, true));
      synthSequencerCurrentSteps.push(this.view.getUint32(ptr + 1164 + index * 4, true));
      drumSequencerCurrentSteps.push(this.view.getUint32(ptr + 1228 + index * 4, true));
    }
    const telemetry = {
      schemaHash: this.view.getUint32(ptr, true),
      transportRunning: this.view.getUint32(ptr + 20, true) !== 0,
      absoluteSampleTime: this.readUint64Number(ptr + 24),
      activeGrains: this.view.getUint32(ptr + 68, true),
      runtimeWalkCount,
      runtimeWalkValues,
      masterInputPeak: this.view.getFloat32(ptr + 964, true),
      masterOutputPeak: this.view.getFloat32(ptr + 968, true),
      masterOutputRms: this.view.getFloat32(ptr + 972, true),
      dynamicsSaturationDrive: this.view.getFloat32(ptr + 980, true),
      masterTruePeak: this.view.getFloat32(ptr + 988, true),
      granularWriteHeadPosition: this.view.getFloat32(ptr + 1000, true),
      granularVoicePositions: [
        this.view.getFloat32(ptr + 1004, true),
        this.view.getFloat32(ptr + 1008, true),
        this.view.getFloat32(ptr + 1012, true),
        this.view.getFloat32(ptr + 1016, true),
      ],
      pad1FilterFreq: this.view.getFloat32(ptr + 1020, true),
      pad1Lfo1Value: this.view.getFloat32(ptr + 1024, true),
      pad2FilterFreq: this.view.getFloat32(ptr + 1028, true),
      pad2Lfo1Value: this.view.getFloat32(ptr + 1032, true),
      synthSequencerHitCounts,
      drumSequencerHitCounts,
      synthSequencerCurrentSteps,
      drumSequencerCurrentSteps,
      workletOutputPeak: this.lastOutputPeak,
      workletStemPeaks: this.lastStemPeaks,
      workletMasterStemPeak: this.lastStemPeaks[0] || 0,
      workletPadStemPeak: this.lastStemPeaks[1] || 0,
      workletLeadStemPeak: Math.max(this.lastStemPeaks[3] || 0, this.lastStemPeaks[4] || 0),
      workletFxStemPeak: this.lastStemPeaks[8] || 0,
    };
    const granularBufferWaveform = this.readGranularWaveform(includeGranularWaveform);
    if (granularBufferWaveform) {
      telemetry.granularBufferWaveform = granularBufferWaveform;
    }
    return telemetry;
  }

  postTelemetry() {
    try {
      const telemetry = this.readTelemetry();
      if (telemetry) {
        this.port.postMessage({ type: 'telemetry', telemetry });
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  postVisualTelemetry(includeGranularWaveform = false) {
    try {
      const telemetry = this.readVisualTelemetry(includeGranularWaveform);
      if (telemetry) {
        const transfer = telemetry.granularBufferWaveform
          ? [telemetry.granularBufferWaveform.buffer]
          : undefined;
        this.port.postMessage({ type: 'visual-telemetry', telemetry }, transfer);
      }
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output?.[0];
    const right = output?.[1] || left;
    if (!left || !right) return true;
    if (!this.ready) {
      for (const channel of output || []) {
        channel.fill(0);
      }
      return true;
    }
    const perfStartMs = this.perfEnabled ? this.nowMs() : 0;
    const frames = left.length;
    this.api.render(this.engine, this.leftPtr, this.rightPtr, frames);
    if (this.heapF32.buffer !== this.exports.memory.buffer) {
      this.refreshViews();
    }
    left.set(this.heapF32.subarray(this.leftPtr >> 2, (this.leftPtr >> 2) + frames));
    right.set(this.heapF32.subarray(this.rightPtr >> 2, (this.rightPtr >> 2) + frames));
    if (this.shouldSampleStemPeaks()) {
      this.sampleOutputPeak(left, right, frames);
      this.sampleStemPeaks(frames);
    }
    this.processActiveGraphTapCaptures(frames);
    this.renderDawOutputChannels(output, frames);
    this.maintainGraphTapMode();
    this.recordPerfBlock(perfStartMs, frames);
    return true;
  }
}

registerProcessor('kessho-core-product', KesshoCoreProductProcessor);
