export type CoreProductCapabilityReport = {
  engineMode: 'core-product';
  supportsFullProductGraph: boolean;
  supportsSynthSequencer: boolean;
  supportsDrumSequencer: boolean;
  supportsJourneyMorphClock: boolean;
  supportsHarmonyCore: boolean;
  supportsCoreAssetRendering: boolean;
  supportsNativeBridge: boolean;
  supportsRecordableStems: boolean;
  supportsCpuTelemetry: boolean;
  unsupportedMethods: string[];
  legacyFallbacks: string[];
};

export type CoreProductTelemetrySnapshot = {
  schemaHash: number;
  sampleRate?: number;
  blockSize?: number;
  transportRunning: boolean;
  absoluteSampleTime?: number;
  beatPosition?: number;
  barIndex?: number;
  phraseIndex?: number;
  activeSources: number;
  activeVoices: number;
  activeAssets: number;
  activeGrains?: number;
  renderCpuPercent?: number;
  renderCpuPeakPercent?: number;
  renderP95Ms?: number;
  renderP99Ms?: number;
  missedQuantumCount?: number;
  wasmHeapBytes?: number;
  sequencerEventCount: number;
  controlQueueDepth: number;
  assetMissingCount: number;
  lastErrorCode: number;
  journeyMorphRunning?: boolean;
  journeyMorphPhase?: number;
  harmonyRootMidi?: number;
  harmonyScaleId?: number;
  harmonyTension?: number;
  harmonyChordDegree?: number;
  harmonyChordMidi?: number[];
  modulationRangeCount?: number;
  runtimeWalkCount?: number;
  runtimeWalkValues?: Record<number, number>;
  rngSeed?: number;
  rngState?: number;
  sourcePresetIds?: number[];
  workletOutputPeak?: number;
  workletStemPeaks?: number[];
  workletMasterStemPeak?: number;
  workletPadStemPeak?: number;
  workletFxStemPeak?: number;
};

export const initialCoreProductCapabilityReport: CoreProductCapabilityReport = {
  engineMode: 'core-product',
  supportsFullProductGraph: false,
  supportsSynthSequencer: true,
  supportsDrumSequencer: true,
  supportsJourneyMorphClock: true,
  supportsHarmonyCore: true,
  supportsCoreAssetRendering: true,
  supportsNativeBridge: false,
  supportsRecordableStems: true,
  supportsCpuTelemetry: true,
  unsupportedMethods: ['full-fx-graph', 'native-bridge'],
  legacyFallbacks: [],
};
