const EVENT_BYTES = 40;
const TELEMETRY_BYTES = 324;

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
    this.assetAllocations = new Map();
    this.frames = 128;
    this.lastOutputPeak = 0;
    this.lastStemPeaks = [];
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
        render: this.resolve('kessho_product_render'),
        getStem: this.resolve('kessho_product_get_stem'),
        loadSnapshot: this.resolve('kessho_product_load_snapshot_v2'),
        enqueueEvent: this.resolve('kessho_product_enqueue_event'),
        copyTelemetry: this.resolve('kessho_product_copy_telemetry'),
        registerAsset: this.resolve('kessho_product_register_asset_buffer'),
        unregisterAsset: this.resolve('kessho_product_unregister_asset_buffer'),
      };
      const bytesPerFrame = this.frames * Float32Array.BYTES_PER_ELEMENT;
      this.leftPtr = this.api.malloc(bytesPerFrame);
      this.rightPtr = this.api.malloc(bytesPerFrame);
      this.eventPtr = this.api.malloc(EVENT_BYTES);
      this.telemetryPtr = this.api.malloc(TELEMETRY_BYTES);
      this.engine = this.api.create(sampleRate, this.frames, 0);
      if (!this.engine || !this.leftPtr || !this.rightPtr || !this.eventPtr || !this.telemetryPtr) {
        throw new Error('Failed to allocate Kessho Product Core worklet state');
      }
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    } catch (error) {
      this.port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  handleMessage(message) {
    if (!message || !this.ready) return;
    if (message.type === 'event') {
      this.enqueueEvent(message.event || {});
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
    if (message.type === 'register-asset') {
      this.registerAsset(message);
      return;
    }
    if (message.type === 'request-telemetry') {
      this.postTelemetry();
    }
  }

  writeEvent(event) {
    const ptr = this.eventPtr;
    this.view.setUint32(ptr, event.sampleOffset || 0, true);
    this.view.setUint32(ptr + 4, event.eventKind || 0, true);
    this.view.setUint32(ptr + 8, event.targetId || 0, true);
    this.view.setUint32(ptr + 12, event.index || 0, true);
    this.view.setUint32(ptr + 16, event.paramId || 0, true);
    this.view.setFloat32(ptr + 20, event.value || 0, true);
    this.view.setFloat32(ptr + 24, event.value2 || 0, true);
    this.view.setFloat32(ptr + 28, event.value3 || 0, true);
    this.view.setFloat32(ptr + 32, event.value4 || 0, true);
    this.view.setUint32(ptr + 36, event.flags || 0, true);
  }

  enqueueEvent(event) {
    this.writeEvent(event);
    this.api.enqueueEvent(this.engine, this.eventPtr);
  }

  loadSnapshot(snapshot) {
    const bytes = snapshot instanceof ArrayBuffer
      ? new Uint8Array(snapshot)
      : ArrayBuffer.isView(snapshot)
        ? new Uint8Array(snapshot.buffer, snapshot.byteOffset, snapshot.byteLength)
        : null;
    if (!bytes) return;
    if (this.snapshotPtr) {
      this.api.free(this.snapshotPtr);
      this.snapshotPtr = 0;
    }
    this.snapshotPtr = this.api.malloc(bytes.byteLength);
    this.heapU8.set(bytes, this.snapshotPtr);
    this.api.loadSnapshot(this.engine, this.snapshotPtr, bytes.byteLength);
  }

  registerAsset(message) {
    const channels = Array.isArray(message.channels) ? message.channels : [];
    if (!channels.length) return;
    const old = this.assetAllocations.get(message.assetId);
    if (old) {
      this.api.unregisterAsset(this.engine, message.assetId);
      old.ptrs.forEach((ptr) => this.api.free(ptr));
      this.api.free(old.ptrArray);
    }
    const ptrs = channels.slice(0, 2).map((channel) => {
      const data = channel instanceof Float32Array ? channel : new Float32Array(channel);
      const ptr = this.api.malloc(data.length * Float32Array.BYTES_PER_ELEMENT);
      if (!ptr) {
        throw new Error(`Kessho Product Core asset allocation failed for asset ${message.assetId}`);
      }
      this.heapF32.set(data, ptr >> 2);
      return ptr;
    });
    const ptrArray = this.api.malloc(ptrs.length * Uint32Array.BYTES_PER_ELEMENT);
    if (!ptrArray) {
      ptrs.forEach((ptr) => this.api.free(ptr));
      throw new Error(`Kessho Product Core asset pointer allocation failed for asset ${message.assetId}`);
    }
    for (let i = 0; i < ptrs.length; i += 1) {
      this.view.setUint32(ptrArray + i * 4, ptrs[i], true);
    }
    this.assetAllocations.set(message.assetId, { ptrs, ptrArray });
    const result = this.api.registerAsset(
      this.engine,
      message.assetId,
      ptrArray,
      ptrs.length,
      channels[0].length,
      message.sampleRate || sampleRate,
      message.flags || 0,
    );
    if (result !== 1) {
      this.assetAllocations.delete(message.assetId);
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
      wasmHeapBytes: this.view.getUint32(ptr + 92, true),
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
      workletOutputPeak: this.lastOutputPeak,
      workletStemPeaks: this.lastStemPeaks,
      workletMasterStemPeak: this.lastStemPeaks[0] || 0,
      workletPadStemPeak: this.lastStemPeaks[1] || 0,
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
    return true;
  }
}

registerProcessor('kessho-core-product', KesshoCoreProductProcessor);
