class RecorderTapProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options?.processorOptions ?? {};
    this.trackId = processorOptions.trackId ?? 'mix';
    this.chunkFrames = Math.max(512, Math.round(processorOptions.chunkFrames ?? 4096));
    this.leftChunk = new Float32Array(this.chunkFrames);
    this.rightChunk = new Float32Array(this.chunkFrames);
    this.writeIndex = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'flush') {
        this.flush();
        this.port.postMessage({ type: 'flushed', trackId: this.trackId });
      } else if (event.data?.type === 'destroy') {
        this.flush();
        this.port.postMessage({ type: 'flushed', trackId: this.trackId });
        try { this.port.close(); } catch {}
      }
    };
  }

  emitChunk(frameCount) {
    if (frameCount <= 0) return;
    const left = this.leftChunk.slice(0, frameCount);
    const right = this.rightChunk.slice(0, frameCount);
    this.port.postMessage(
      {
        type: 'chunk',
        trackId: this.trackId,
        frameCount,
        left,
        right,
      },
      [left.buffer, right.buffer],
    );
  }

  flush() {
    if (this.writeIndex <= 0) return;
    this.emitChunk(this.writeIndex);
    this.leftChunk = new Float32Array(this.chunkFrames);
    this.rightChunk = new Float32Array(this.chunkFrames);
    this.writeIndex = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const leftIn = input?.[0];
    const rightIn = input?.[1] ?? leftIn;
    const frameCount = leftIn?.length ?? rightIn?.length ?? 0;

    if (output) {
      const outputLeft = output[0];
      const outputRight = output[1] ?? outputLeft;
      if (outputLeft) {
        if (leftIn) outputLeft.set(leftIn);
        else outputLeft.fill(0);
      }
      if (outputRight) {
        if (rightIn) outputRight.set(rightIn);
        else outputRight.fill(0);
      }
    }

    if (!frameCount) return true;

    let offset = 0;
    while (offset < frameCount) {
      const available = this.chunkFrames - this.writeIndex;
      const copyCount = Math.min(available, frameCount - offset);
      const leftSlice = leftIn ? leftIn.subarray(offset, offset + copyCount) : null;
      const rightSlice = rightIn ? rightIn.subarray(offset, offset + copyCount) : leftSlice;

      if (leftSlice) {
        this.leftChunk.set(leftSlice, this.writeIndex);
      } else {
        this.leftChunk.fill(0, this.writeIndex, this.writeIndex + copyCount);
      }
      if (rightSlice) {
        this.rightChunk.set(rightSlice, this.writeIndex);
      } else {
        this.rightChunk.fill(0, this.writeIndex, this.writeIndex + copyCount);
      }

      this.writeIndex += copyCount;
      offset += copyCount;

      if (this.writeIndex >= this.chunkFrames) {
        this.emitChunk(this.chunkFrames);
        this.leftChunk = new Float32Array(this.chunkFrames);
        this.rightChunk = new Float32Array(this.chunkFrames);
        this.writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('kessho-recorder-tap', RecorderTapProcessor);
