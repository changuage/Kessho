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

export type CoreProductSequencerLaneUiState = {
  enabled: boolean;
  targetSourceId: number;
  stepCount: number;
  fillCount: number;
  rotation: number;
  clockDivision: number;
  mutationFlags: number;
  triggerToggles: [number, boolean][];
  probabilityOverrideSetLow?: number;
  probabilityOverrideSetHigh?: number;
  ratchetOverrideSetLow?: number;
  ratchetOverrideSetHigh?: number;
  trigConditionOverrideSetLow?: number;
  trigConditionOverrideSetHigh?: number;
  midiNoteOverrideSetLow?: number;
  midiNoteOverrideSetHigh?: number;
  expressionOverrideSetLow?: number;
  expressionOverrideSetHigh?: number;
  morphOverrideSetLow?: number;
  morphOverrideSetHigh?: number;
  distanceOverrideSetLow?: number;
  distanceOverrideSetHigh?: number;
  expressionRangeSetLow?: number;
  expressionRangeSetHigh?: number;
  morphRangeSetLow?: number;
  morphRangeSetHigh?: number;
  distanceRangeSetLow?: number;
  distanceRangeSetHigh?: number;
  stepValueConfigEnabledMask?: number;
  stepValueConfigSteps?: number[];
  stepValueConfigDirections?: number[];
  probability: number[] | null;
  ratchet: number[] | null;
  trigCondition: [number, number][] | null;
  midiNote: number[] | null;
  expression: number[] | null;
  morph: number[] | null;
  distance: number[] | null;
  expressionRangeMaxes?: number[] | null;
  morphRangeMaxes?: number[] | null;
  distanceRangeMaxes?: number[] | null;
};

export type CoreProductSequencerUiState = {
  schemaHash: number;
  revision: number;
  synthLaneCount: number;
  drumLaneCount: number;
  evolutionAmount: number;
  evolutionState: number;
  lastChangedTargetId: number;
  lastChangedLaneIndex: number;
  lastChangeKind: number;
  synthLanes: CoreProductSequencerLaneUiState[];
  drumLanes: CoreProductSequencerLaneUiState[];
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
  wasmHeapBudgetBytes?: number;
  decodedAssetBytes?: number;
  decodedAssetBudgetBytes?: number;
  assetAllocationBytes?: number;
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
  masterInputPeak?: number;
  masterOutputPeak?: number;
  masterOutputRms?: number;
  masterLimiterGainReductionDb?: number;
  dynamicsSaturationDrive?: number;
  masterTruePeak?: number;
  masterTruePeakDbtp?: number;
  masterIntegratedLufs?: number;
  sequencerUiStateRevision?: number;
  sequencerUiState?: CoreProductSequencerUiState | null;
  sequencerUiChangeDice?: number;
  sequencerUiChangeResetHome?: number;
  sequencerUiChangeEvolution?: number;
  dirtyDiffCount?: number;
  fullSnapshotReloadCount?: number;
  unsupportedControlCount?: number;
  unsupportedGetterCount?: number;
  lastUnsupportedMethod?: string | null;
  lastUnsupportedMethodClass?: string | null;
  runtimeFallbackDiagnosticCount?: number;
  audioCriticalFallbackCount?: number;
  snapshotReloadCpuMs?: number;
  lastSnapshotReloadReason?: string;
  workletOutputPeak?: number;
  workletStemPeaks?: number[];
  workletGraphTapPeaks?: number[];
  workletMasterStemPeak?: number;
  workletPadStemPeak?: number;
  workletLeadStemPeak?: number;
  workletFxStemPeak?: number;
  granularWriteHeadPosition?: number;
  granularVoicePositions?: [number, number, number, number];
  pad1FilterFreq?: number;
  pad1Lfo1Value?: number;
  pad2FilterFreq?: number;
  pad2Lfo1Value?: number;
  synthSequencerHitCounts?: number[];
  drumSequencerHitCounts?: number[];
  synthSequencerCurrentSteps?: number[];
  drumSequencerCurrentSteps?: number[];
};

export type CoreProductVisualTelemetrySnapshot = Pick<
  CoreProductTelemetrySnapshot,
  | 'schemaHash'
  | 'transportRunning'
  | 'absoluteSampleTime'
  | 'activeGrains'
  | 'runtimeWalkCount'
  | 'runtimeWalkValues'
  | 'masterInputPeak'
  | 'masterOutputPeak'
  | 'masterOutputRms'
  | 'masterTruePeak'
  | 'dynamicsSaturationDrive'
  | 'granularWriteHeadPosition'
  | 'granularVoicePositions'
  | 'pad1FilterFreq'
  | 'pad1Lfo1Value'
  | 'pad2FilterFreq'
  | 'pad2Lfo1Value'
  | 'synthSequencerHitCounts'
  | 'drumSequencerHitCounts'
  | 'synthSequencerCurrentSteps'
  | 'drumSequencerCurrentSteps'
  | 'workletOutputPeak'
  | 'workletStemPeaks'
  | 'workletMasterStemPeak'
  | 'workletPadStemPeak'
  | 'workletLeadStemPeak'
  | 'workletFxStemPeak'
>;

export const initialCoreProductCapabilityReport: CoreProductCapabilityReport = {
  engineMode: 'core-product',
  supportsFullProductGraph: true,
  supportsSynthSequencer: true,
  supportsDrumSequencer: true,
  supportsJourneyMorphClock: true,
  supportsHarmonyCore: true,
  supportsCoreAssetRendering: true,
  supportsNativeBridge: false,
  supportsRecordableStems: true,
  supportsCpuTelemetry: true,
  unsupportedMethods: ['native-bridge'],
  legacyFallbacks: [],
};
