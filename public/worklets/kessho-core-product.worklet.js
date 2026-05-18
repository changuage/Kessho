const EVENT_BYTES = 40;
const TELEMETRY_BYTES = 368;
const SNAPSHOT_SCHEMA_HASH_OFFSET = 4;
const EXPECTED_PRODUCT_SCHEMA_HASH = 0x3573d8e2;
const SEQUENCER_UI_STATE_LANES = 16;
const SEQUENCER_UI_STATE_STEPS = 64;
const SEQUENCER_UI_LANE_BYTES = 2216;
const SEQUENCER_UI_STATE_BYTES = 70948;
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
});
const PRODUCT_EVENT_ID_SET = new Set(Object.values(PRODUCT_EVENT_IDS));
const PRODUCT_SOURCE_IDS = new Set([1, 2, 3, 4, 5, 6, 7]);
const PRODUCT_SEQUENCER_IDS = new Set([1, 2]);
const PRODUCT_DRUM_VOICE_COUNT = 7;
const PRODUCT_GRAPH_TAP_COUNT = 110;
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
    this.sequencerUiStatePtr = 0;
    this.lastSequencerUiStateRevision = 0;
    this.lastSequencerUiState = null;
    this.assetAllocations = new Map();
    this.assetDecodedBytes = 0;
    this.assetAllocationBytes = 0;
    this.frames = 128;
    this.lastOutputPeak = 0;
    this.lastStemPeaks = [];
    this.lastGraphTapPeaks = [];
    this.graphTapCaptures = new Map();
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
        loadSnapshot: this.resolve('kessho_product_load_snapshot_v2'),
        enqueueEvent: this.resolve('kessho_product_enqueue_event'),
        copyTelemetry: this.resolve('kessho_product_copy_telemetry'),
        copySequencerUiState: this.resolve('kessho_product_copy_sequencer_ui_state'),
        registerAsset: this.resolve('kessho_product_register_asset_buffer'),
        unregisterAsset: this.resolve('kessho_product_unregister_asset_buffer'),
      };
      const bytesPerFrame = this.frames * Float32Array.BYTES_PER_ELEMENT;
      this.leftPtr = this.api.malloc(bytesPerFrame);
      this.rightPtr = this.api.malloc(bytesPerFrame);
      this.eventPtr = this.api.malloc(EVENT_BYTES);
      this.telemetryPtr = this.api.malloc(TELEMETRY_BYTES);
      this.sequencerUiStatePtr = this.api.malloc(SEQUENCER_UI_STATE_BYTES);
      this.engine = this.api.create(sampleRate, this.frames, 0);
      if (!this.engine || !this.leftPtr || !this.rightPtr || !this.eventPtr || !this.telemetryPtr || !this.sequencerUiStatePtr) {
        throw new Error('Failed to allocate Kessho Product Core worklet state');
      }
      if (this.api.copyTelemetry(this.engine, this.telemetryPtr) !== 1) {
        throw new Error('Kessho Product Core WASM telemetry schema probe failed');
      }
      this.assertSchemaHash('WASM telemetry', this.view.getUint32(this.telemetryPtr, true));
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  handleMessage(message) {
    if (!message || !this.ready) return;
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
      if (message.type === 'request-telemetry') {
        this.postTelemetry();
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
      } else {
        this.resetGraphTapCaptureBuffers(capture);
      }
    }
    this.port.postMessage({ type: 'graph-capture-flushed', tapId, stopped: Boolean(stopped) });
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
    const eventKind = this.requireUint(event, 'eventKind', 1, 29);
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
        normalized.value = this.requireFloat(event, 'value', Number.MIN_VALUE);
        return normalized;
      case PRODUCT_EVENT_IDS.ManualNoteOn:
        normalized.targetId = this.requireSourceId(this.requireUint(event, 'targetId', 1, 7), 'targetId');
        normalized.value = this.requireFloat(event, 'value', 0, 127);
        normalized.value2 = this.requireFloat(event, 'value2', Number.MIN_VALUE, 1);
        normalized.value3 = this.requireFloat(event, 'value3', Number.MIN_VALUE);
        normalized.value4 = this.optionalFloat(event, 'value4', 0);
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
      case PRODUCT_EVENT_IDS.DiceSequencerLane:
        normalized.targetId = this.requireSequencerId(this.requireUint(event, 'targetId', 1, 2), 'targetId');
        normalized.index = this.requireUint(event, 'index', 0, SEQUENCER_UI_STATE_LANES - 1);
        normalized.value = this.optionalFloat(event, 'value', 0);
        normalized.value2 = this.optionalFloat(event, 'value2', 0);
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

  readUint64Number(byteOffset) {
    const low = this.view.getUint32(byteOffset, true);
    const high = this.view.getUint32(byteOffset + 4, true);
    return high * 4294967296 + low;
  }

  maskHas(low, high, step) {
    if (step < 32) return (low & (1 << step)) !== 0;
    return (high & (1 << (step - 32))) !== 0;
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
    if (setLow === 0 && setHigh === 0) return null;
    const values = [];
    for (let step = 0; step < SEQUENCER_UI_STATE_STEPS; step += 1) {
      values.push(this.view.getFloat32(ptr + valuesOffset + step * 4, true));
    }
    return values;
  }

  readUintOverrides(ptr, setLow, setHigh, valuesOffset) {
    if (setLow === 0 && setHigh === 0) return null;
    const values = [];
    for (let step = 0; step < SEQUENCER_UI_STATE_STEPS; step += 1) {
      values.push(this.view.getUint32(ptr + valuesOffset + step * 4, true));
    }
    return values;
  }

  readTrigConditionOverrides(ptr, setLow, setHigh) {
    if (setLow === 0 && setHigh === 0) return null;
    const values = [];
    for (let step = 0; step < SEQUENCER_UI_STATE_STEPS; step += 1) {
      values.push([
        this.view.getUint32(ptr + 680 + step * 4, true),
        this.view.getUint32(ptr + 936 + step * 4, true),
      ]);
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
    const ptr = this.telemetryPtr;
    const runtimeWalkValues = {};
    const runtimeWalkCount = Math.min(this.view.getUint32(ptr + 156, true), 16);
    for (let index = 0; index < runtimeWalkCount; index += 1) {
      const controlId = this.view.getUint32(ptr + 160 + index * 4, true);
      const value = this.view.getFloat32(ptr + 224 + index * 4, true);
      if (controlId !== 0) {
        runtimeWalkValues[controlId] = value;
      }
    }
    const sourcePresetIds = [];
    for (let index = 0; index < 7; index += 1) {
      sourcePresetIds.push(this.view.getUint32(ptr + 296 + index * 4, true));
    }
    const sequencerUiStateRevision = this.view.getUint32(ptr + 348, true);
    const sequencerUiState =
      sequencerUiStateRevision !== 0 && sequencerUiStateRevision !== this.lastSequencerUiStateRevision
        ? this.readSequencerUiState(sequencerUiStateRevision)
        : null;
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
      renderCpuPercent: this.view.getFloat32(ptr + 72, true),
      renderCpuPeakPercent: this.view.getFloat32(ptr + 76, true),
      renderP95Ms: this.view.getFloat32(ptr + 80, true),
      renderP99Ms: this.view.getFloat32(ptr + 84, true),
      missedQuantumCount: this.view.getUint32(ptr + 88, true),
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
      rngSeed: this.view.getUint32(ptr + 288, true),
      rngState: this.view.getUint32(ptr + 292, true),
      sourcePresetIds,
      masterInputPeak: this.view.getFloat32(ptr + 324, true),
      masterOutputPeak: this.view.getFloat32(ptr + 328, true),
      masterOutputRms: this.view.getFloat32(ptr + 332, true),
      masterLimiterGainReductionDb: this.view.getFloat32(ptr + 336, true),
      masterSaturationDrive: this.view.getFloat32(ptr + 340, true),
      dynamicsSaturationDrive: this.view.getFloat32(ptr + 344, true),
      sequencerUiStateRevision,
      masterTruePeak: this.view.getFloat32(ptr + 352, true),
      masterTruePeakDbtp: this.view.getFloat32(ptr + 356, true),
      masterIntegratedLufs: this.view.getFloat32(ptr + 360, true),
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

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output?.[0];
    const right = output?.[1] || left;
    if (!left || !right) return true;
    if (!this.ready) {
      left.fill(0);
      right.fill(0);
      return true;
    }
    const frames = left.length;
    this.api.render(this.engine, this.leftPtr, this.rightPtr, frames);
    if (this.heapF32.buffer !== this.exports.memory.buffer) {
      this.refreshViews();
    }
    left.set(this.heapF32.subarray(this.leftPtr >> 2, (this.leftPtr >> 2) + frames));
    right.set(this.heapF32.subarray(this.rightPtr >> 2, (this.rightPtr >> 2) + frames));
    let peak = 0;
    for (let i = 0; i < frames; i += 1) {
      peak = Math.max(peak, Math.abs(left[i] || 0), Math.abs(right[i] || 0));
    }
    this.lastOutputPeak = peak;
    const stemPeaks = [];
    for (let stem = 0; stem <= 8; stem += 1) {
      let stemPeak = 0;
      if (this.api.getStem(this.engine, stem, this.leftPtr, this.rightPtr, frames) === 1) {
        const leftIndex = this.leftPtr >> 2;
        const rightIndex = this.rightPtr >> 2;
        for (let i = 0; i < frames; i += 1) {
          stemPeak = Math.max(
            stemPeak,
            Math.abs(this.heapF32[leftIndex + i] || 0),
            Math.abs(this.heapF32[rightIndex + i] || 0),
          );
        }
      }
      stemPeaks.push(stemPeak);
    }
    this.lastStemPeaks = stemPeaks;
    const graphTapPeaks = [];
    for (let tap = 0; tap < PRODUCT_GRAPH_TAP_COUNT; tap += 1) {
      let tapPeak = 0;
      if (this.api.getGraphTap(this.engine, tap, this.leftPtr, this.rightPtr, frames) === 1) {
        const leftIndex = this.leftPtr >> 2;
        const rightIndex = this.rightPtr >> 2;
        for (let i = 0; i < frames; i += 1) {
          tapPeak = Math.max(
            tapPeak,
            Math.abs(this.heapF32[leftIndex + i] || 0),
            Math.abs(this.heapF32[rightIndex + i] || 0),
          );
        }
        const capture = this.graphTapCaptures.get(tap);
        if (capture) {
          this.appendGraphTapCapture(capture, leftIndex, rightIndex, frames);
        }
      }
      graphTapPeaks.push(tapPeak);
    }
    this.lastGraphTapPeaks = graphTapPeaks;
    return true;
  }
}

registerProcessor('kessho-core-product', KesshoCoreProductProcessor);
