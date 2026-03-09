/**
 * Spectral Freeze WASM Worklet Processor
 *
 * AudioWorkletProcessor shell for kessho_spectral_freeze.wasm.
 * Provides STFT-based solid and slushy spectral freeze (inspired by
 * Chase Bliss × Goodhertz Lossy).
 *
 * Message types received:
 *   'wasmBinary' – ArrayBuffer of compiled WASM module
 *   'params'     – spectral freeze parameter object
 *   'enablePerf' – toggle CPU measurement
 *
 * Message types sent:
 *   'perf'       – CPU usage stats
 *   'wasmReady'  – emitted once WASM is loaded and initialized
 */

const _perfNow = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

class SpectralFreezeWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.wasm = null;
    this.heap = new Float32Array(0);
    this.inputPtr = 0;
    this.outputPtr = 0;
    this.ready = false;

    // Perf measurement
    this.perfEnabled = false;
    this.perfTotalTime = 0;
    this.perfCount = 0;
    this.perfSamplesSinceReport = 0;
    this.perfReportInterval = Math.floor(sampleRate * 0.5);

    // Buffer params that arrive before WASM is ready
    this.pendingParams = null;

    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  async initWasm(wasmBinary) {
    const module = await WebAssembly.compile(wasmBinary);
    const wasiStubs = {
      wasi_snapshot_preview1: {
        fd_write: () => 0,
        fd_seek: () => 0,
        fd_close: () => 0,
        proc_exit: () => {},
        environ_get: () => 0,
        environ_sizes_get: () => 0,
        clock_time_get: () => 0,
      },
      env: {
        emscripten_notify_memory_growth: () => {},
      },
    };
    const instance = await WebAssembly.instantiate(module, wasiStubs);
    const exports = instance.exports;
    this.wasm = exports;

    // Initialize spectral freeze engine at current sample rate
    const result = exports.spectral_freeze_init(sampleRate);
    if (result !== 0) {
      console.error('[SpectralFreeze-WASM] Init failed:', result);
      return;
    }

    // Cache buffer pointers
    this.inputPtr = exports.spectral_freeze_get_input_ptr();
    this.outputPtr = exports.spectral_freeze_get_output_ptr();

    this.ready = true;
    this.port.postMessage({ type: 'wasmReady' });

    // Apply any params that arrived before WASM was ready
    if (this.pendingParams) {
      this.applyParams(this.pendingParams);
      this.pendingParams = null;
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'wasmBinary':
        this.initWasm(data.binary);
        break;

      case 'params':
        if (this.ready) {
          this.applyParams(data.params);
        } else {
          this.pendingParams = Object.assign(this.pendingParams || {}, data.params);
        }
        break;

      case 'enablePerf':
        this.perfEnabled = data.enabled;
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
        break;

      case 'destroy':
        if (this.wasm && this.ready) {
          try { this.wasm.spectral_freeze_destroy(); } catch (e) { /* */ }
        }
        this.ready = false;
        this.wasm = null;
        break;
    }
  }

  /** Translate spectral freeze params → C API calls */
  applyParams(p) {
    const w = this.wasm;

    if (p.freeze !== undefined) {
      w.spectral_freeze_set_freeze(p.freeze ? 1 : 0);
    }
    if (p.slushy !== undefined) {
      w.spectral_freeze_set_slushy(p.slushy ? 1 : 0);
    }
    if (p.speed !== undefined) {
      w.spectral_freeze_set_speed(p.speed);
    }
    if (p.mix !== undefined) {
      w.spectral_freeze_set_mix(p.mix);
    }
    if (p.decay !== undefined) {
      w.spectral_freeze_set_decay(p.decay);
    }
    if (p.phaseJitter !== undefined) {
      w.spectral_freeze_set_phase_jitter(p.phaseJitter);
    }
  }

  /** Get Float32Array view of WASM heap (refreshed on each access since memory can grow) */
  getHeapF32() {
    const buf = this.wasm.memory.buffer;
    if (this.heap.buffer !== buf) {
      this.heap = new Float32Array(buf);
    }
    return this.heap;
  }

  process(inputs, outputs, _params) {
    if (!this.ready || !this.wasm) {
      // Pass-through when not ready
      const input = inputs[0];
      const output = outputs[0];
      if (input && output) {
        for (let ch = 0; ch < output.length; ch++) {
          if (input[ch]) {
            output[ch].set(input[ch]);
          }
        }
      }
      return true;
    }

    const perfStart = this.perfEnabled ? _perfNow() : 0;
    const input = inputs[0];
    const output = outputs[0];
    const blockSize = output[0]?.length || 128;
    const heap = this.getHeapF32();

    // ── Copy input to WASM (interleaved stereo) ──
    const inOffset = this.inputPtr >> 2;
    const inL = input?.[0];
    const inR = input?.[1] || inL;
    if (inL) {
      for (let i = 0; i < blockSize; i++) {
        heap[inOffset + i * 2] = inL[i];
        heap[inOffset + i * 2 + 1] = inR ? inR[i] : inL[i];
      }
    } else {
      for (let i = 0; i < blockSize * 2; i++) {
        heap[inOffset + i] = 0;
      }
    }

    // ── Process ──
    this.wasm.spectral_freeze_process_block(blockSize);

    // ── Copy output from WASM (deinterleave) ──
    const outOffset = this.outputPtr >> 2;
    const outL = output[0];
    const outR = output[1] || outL;
    for (let i = 0; i < blockSize; i++) {
      outL[i] = heap[outOffset + i * 2];
      if (outR !== outL) outR[i] = heap[outOffset + i * 2 + 1];
    }

    // ── Perf reporting ──
    if (this.perfEnabled) {
      const elapsed = _perfNow() - perfStart;
      this.perfTotalTime += elapsed;
      this.perfCount++;
      this.perfSamplesSinceReport += blockSize;

      if (this.perfSamplesSinceReport >= this.perfReportInterval && this.perfCount > 0) {
        const avgMs = this.perfTotalTime / this.perfCount;
        const budgetMs = (blockSize / sampleRate) * 1000;
        this.port.postMessage({
          type: 'perf',
          name: 'spectral-freeze-wasm',
          cpuPercent: (avgMs / budgetMs) * 100,
          avgTimeMs: avgMs,
        });
        this.perfTotalTime = 0;
        this.perfCount = 0;
        this.perfSamplesSinceReport = 0;
      }
    }

    return true;
  }
}

registerProcessor('spectral-freeze-wasm', SpectralFreezeWasmProcessor);
