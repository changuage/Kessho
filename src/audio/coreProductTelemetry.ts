import type { GeneratedSequencerCaptureEvent } from './coreProductGeneratedSequencerCaptureTypes';

export type CoreProductSimpleSequencerVisualEvent = {
  eventId: number;
  absoluteSample: number;
  phraseStartSample: number;
  phraseIndex: number;
  kind: 'padChord' | 'randomTiming';
  targetSourceId: number;
  midiNote: number;
  velocity: number;
  gateSeconds: number;
  voiceIndex: number;
  phraseSeconds: number;
  triggerIntervalSeconds: number;
};

export type CoreProductSequencerLaneUiState = {
  enabled: boolean;
  targetSourceId: number;
  stepCount: number;
  fillCount: number;
  rotation: number;
  clockDivision: number;
  mutationFlags: number;
  swing: number;
  baseMidiNote: number;
  noteRangeMin: number;
  noteRangeMax: number;
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
  nudgeOverrideSetLow?: number;
  nudgeOverrideSetHigh?: number;
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
  nudge?: number[] | null;
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

export type CoreProductOrbitVisualLaneState = {
  noteCount: number;
  baseAngle: number;
  noteAngles: number[];
  noteFlashes: number[];
};

export type CoreProductAnchorWalkerBoundaryEvent =
  | 'none'
  | 'foldTop'
  | 'foldBottom'
  | 'wrapTop'
  | 'wrapBottom'
  | 'clampTop'
  | 'clampBottom';

export type CoreProductAnchorWalkerOutputState = {
  slotIndex: number;
  midi: number;
  velocity: number;
};

export type CoreProductAnchorWalkerVisualLaneState = {
  enabled: boolean;
  gestureHeld: boolean;
  cursorValid: boolean;
  anchorValid: boolean;
  walking: boolean;
  cursorDegree: number;
  lastGestureDelta: number;
  boundaryEvent: CoreProductAnchorWalkerBoundaryEvent;
  anchorMidi: number;
  cursorMidi: number;
  previousCursorMidi: number;
  outputMidis: CoreProductAnchorWalkerOutputState[];
};

export type CoreProductGranularVisualEvent = {
  position: number;
  pan: number;
  pitch: number;
  gain: number;
  lengthMs: number;
  voice: number;
  flags: number;
  cloudStyle: number;
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
  transportBpm?: number;
  transportBeatsPerBar?: number;
  transportBarsPerPhrase?: number;
  transportPhraseSeconds?: number;
  transportTransitionPending?: boolean;
  transportPendingBpm?: number;
  transportPendingBeatsPerBar?: number;
  transportPendingBarsPerPhrase?: number;
  transportPendingPhraseSeconds?: number;
  transportPendingApplyFrame?: number;
  transportTransitionRevision?: number;
  transportPhraseProgress?: number;
  sourceMorphAutomationEnabledMask?: number;
  sourceMorphValues?: number[];
  autoStopEnabled?: boolean;
  autoStopTargetSampleFrame?: number;
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
  hostDecodedBytes?: number;
  inFlightDecodedBytes?: number;
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
  harmonyPlayDispatchCount?: number;
  harmonyPlayLastDispatchFrame?: number;
  harmonyPlayDispatchLatencyMs?: number;
  harmonyActiveSource?: number;
  harmonyActiveSlotId?: number;
  harmonyActiveStepIndex?: number;
  harmonyManualControlAvailable?: boolean;
  harmonyNotePoolMidi?: number[];
  harmonyNextNotePoolMidi?: number[];
  harmonyNextSource?: number;
  harmonyNextStepIndex?: number;
  modulationRangeCount?: number;
  runtimeWalkCount?: number;
  runtimeWalkValues?: Record<number, number>;
  fxRouteEffectiveAmounts?: number[];
  earthTextureDebugState?: import('./engineSharedTypes').EarthTextureDebugState;
  productModulationDebug?: CoreProductModulationDebugSnapshot;
  runtimeWalkDebug?: import('./product/host/CoreProductRuntimeWalkDebug').CoreProductRuntimeWalkDebugState;
  sampleHoldDebug?: import('./product/host/CoreProductSampleHoldFeedbackBridge').CoreProductSampleHoldDebugState;
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
  snapshotReloadReasons?: readonly string[];
  workletOutputPeak?: number;
  workletStemPeaks?: number[];
  workletGraphTapPeaks?: number[];
  workletMasterStemPeak?: number;
  workletPadStemPeak?: number;
  workletLeadStemPeak?: number;
  workletDrumStemPeak?: number;
  workletSampleStemPeak?: number;
  workletEarthStemPeak?: number;
  workletFxStemPeak?: number;
  granularWriteHeadPosition?: number;
  granularVoicePositions?: [number, number, number, number];
  granularBufferWaveform?: Float32Array | null;
  granularVisualEvents?: CoreProductGranularVisualEvent[];
  pad1FilterFreq?: number;
  pad1Lfo1Value?: number;
  pad2FilterFreq?: number;
  pad2Lfo1Value?: number;
  synthSequencerHitCounts?: number[];
  drumSequencerHitCounts?: number[];
  synthSequencerCurrentSteps?: number[];
  drumSequencerCurrentSteps?: number[];
  synthArpCurrentSteps?: number[];
  synthArpCurrentMidis?: number[];
  scatterCurrentPhraseId?: number;
  scatterCurrentVoice?: number;
  scatterCurrentStep?: number;
  scatterPulseCount?: number;
  sceneProgramRevision?: number;
  scenePosition?: number;
  routingMuteGroupRevision?: number;
  routingMuteGroupActiveSlot?: number;
  routingMuteGroupNextSlot?: number;
  routingMuteGroupMask?: number;
  routingMuteGroupNextChangeFrame?: number;
  routingMuteGroupTransitionProgress?: number;
  routingMuteGroupsEnabled?: boolean;
  routingMuteGroupTraceRevision?: number;
  autoCycleRevision?: number;
  autoCyclePhase?: number;
  autoCyclePosition?: number;
  autoCyclePhaseStartFrame?: number;
  autoCyclePhaseEndFrame?: number;
  autoCycleTransitionCount?: number;
  autoCycleEnabled?: boolean;
  journeyScheduleRevision?: number;
  journeySchedulePhase?: number;
  journeyCurrentNodeIndex?: number;
  journeyNextNodeIndex?: number;
  journeyScheduleIndex?: number;
  journeyLoopIndex?: number;
  journeyHoldProgress?: number;
  journeyMorphProgress?: number;
  journeyPreparedTotalFrames?: number;
  journeyTransitionCount?: number;
  journeyScheduleRunning?: boolean;
  journeyRngStateAfterPlan?: number;
  journeyScheduleEntryCount?: number;
  sonicAutonomyRevision?: number;
  sonicAutonomyFingerprint?: string;
  synthOrbitVisualLanes?: Array<CoreProductOrbitVisualLaneState | null>;
  synthAnchorWalkerVisualLanes?: Array<CoreProductAnchorWalkerVisualLaneState | null>;
  generatedSequencerCaptureEvents?: GeneratedSequencerCaptureEvent[];
  generatedSequencerCaptureOverflowCount?: number;
  simpleSequencerVisualEvents?: CoreProductSimpleSequencerVisualEvent[];
  simpleSequencerVisualOverflowCount?: number;
};

export type CoreProductModulationDebugEntry = {
  controlId: number;
  controlName?: string;
  targetId: number;
  paramId: number;
  mode: 'randomWalk' | 'sampleHold' | 'off' | `mode:${number}`;
  min: number;
  max: number;
  currentValue: number;
  normalizedPosition: number;
  speed: number;
  randomWalkGlobal: boolean;
  triggerBus: number;
  triggerCounter: number;
  lastTriggerFrame: number;
  lastTriggerSource: number;
  seed: number;
};

export type CoreProductModulationDebugSnapshot = {
  randomWalk: CoreProductModulationDebugEntry[];
  sampleHold: CoreProductModulationDebugEntry[];
};

export type CoreProductVisualTelemetrySnapshot = Pick<
  CoreProductTelemetrySnapshot,
  | 'schemaHash'
  | 'transportRunning'
  | 'absoluteSampleTime'
  | 'transportBpm'
  | 'transportBeatsPerBar'
  | 'transportBarsPerPhrase'
  | 'transportPhraseSeconds'
  | 'transportTransitionPending'
  | 'transportPendingBpm'
  | 'transportPendingBeatsPerBar'
  | 'transportPendingBarsPerPhrase'
  | 'transportPendingPhraseSeconds'
  | 'transportPendingApplyFrame'
  | 'transportTransitionRevision'
  | 'transportPhraseProgress'
  | 'activeGrains'
  | 'runtimeWalkCount'
  | 'runtimeWalkValues'
  | 'fxRouteEffectiveAmounts'
  | 'productModulationDebug'
  | 'masterInputPeak'
  | 'masterOutputPeak'
  | 'masterOutputRms'
  | 'masterTruePeak'
  | 'dynamicsSaturationDrive'
  | 'granularWriteHeadPosition'
  | 'granularVoicePositions'
  | 'granularBufferWaveform'
  | 'granularVisualEvents'
  | 'pad1FilterFreq'
  | 'pad1Lfo1Value'
  | 'pad2FilterFreq'
  | 'pad2Lfo1Value'
  | 'synthSequencerHitCounts'
  | 'drumSequencerHitCounts'
  | 'synthSequencerCurrentSteps'
  | 'drumSequencerCurrentSteps'
  | 'synthArpCurrentSteps'
  | 'synthArpCurrentMidis'
  | 'scatterCurrentPhraseId'
  | 'scatterCurrentVoice'
  | 'scatterCurrentStep'
  | 'scatterPulseCount'
  | 'sceneProgramRevision'
  | 'scenePosition'
  | 'routingMuteGroupRevision'
  | 'routingMuteGroupActiveSlot'
  | 'routingMuteGroupNextSlot'
  | 'routingMuteGroupMask'
  | 'routingMuteGroupNextChangeFrame'
  | 'routingMuteGroupTransitionProgress'
  | 'routingMuteGroupsEnabled'
  | 'routingMuteGroupTraceRevision'
  | 'journeyScheduleRevision'
  | 'journeySchedulePhase'
  | 'journeyCurrentNodeIndex'
  | 'journeyNextNodeIndex'
  | 'journeyScheduleIndex'
  | 'journeyLoopIndex'
  | 'journeyHoldProgress'
  | 'journeyMorphProgress'
  | 'journeyPreparedTotalFrames'
  | 'journeyTransitionCount'
  | 'journeyScheduleRunning'
  | 'journeyRngStateAfterPlan'
  | 'journeyScheduleEntryCount'
  | 'synthOrbitVisualLanes'
  | 'synthAnchorWalkerVisualLanes'
  | 'workletOutputPeak'
  | 'workletStemPeaks'
  | 'workletMasterStemPeak'
  | 'workletPadStemPeak'
  | 'workletLeadStemPeak'
  | 'workletDrumStemPeak'
  | 'workletSampleStemPeak'
  | 'workletEarthStemPeak'
  | 'workletFxStemPeak'
>;
