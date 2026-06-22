export interface ProductRecordingBridge {
  readonly available: boolean;
  startMixRecording(): Promise<void>;
  stopMixRecording(): Promise<Blob>;
}

export const unavailableProductRecordingBridge: ProductRecordingBridge = {
  available: false,
  async startMixRecording() {
    throw new Error('Product recording bridge is not implemented yet.');
  },
  async stopMixRecording() {
    throw new Error('Product recording bridge is not implemented yet.');
  },
};
