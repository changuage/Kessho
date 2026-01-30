/// <reference types="vite/client" />

declare module '*.worklet.ts' {
  const url: string;
  export default url;
}

declare module '*.worker.ts' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

// AudioWorklet globals
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}
