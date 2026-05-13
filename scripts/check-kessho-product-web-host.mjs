import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const host = read('src/audio/coreProductEngineHost.ts');
const assetAdapter = read('src/audio/CoreProductAssetAdapter.ts');
const fallbackDiagnostics = read('src/audio/CoreProductFallbackDiagnostics.ts');
const hostSequencerAdapter = read('src/audio/CoreProductHostSequencerAdapter.ts');
const runtimeAdapter = read('src/audio/CoreProductRuntimeAdapter.ts');
const runtime = read('src/audio/coreProductRuntime.ts');
const appRuntime = read('src/audio/runtime.ts');
const app = read('src/App.tsx');
const events = read('src/audio/coreProductEvents.ts');
const snapshot = read('src/audio/coreProductSnapshot.ts');
const snapshotEncoder = read('src/audio/coreProductSnapshotEncoder.ts');
const legacyPresetCompat = read('src/audio/CoreProductLegacyPresetCompat.ts');
const telemetryTypes = read('src/audio/coreProductTelemetry.ts');
const assets = `${read('src/audio/coreProductAssets.ts')}\n${read('src/audio/coreProductAssetManifest.json')}`;
const generatedSchema = read('src/audio/generated/kesshoProductSchema.ts');
const worklet = read('public/worklets/kessho-core-product.worklet.js');
const manifest = read('scripts/kessho-core-build-manifest.mjs');
const hostSurface = `${host}\n${hostSequencerAdapter}`;
const snapshotSurface = `${snapshot}\n${snapshotEncoder}`;

const lineCount = (source) => source.split('\n').length;
assert(lineCount(host) <= 1550, `coreProductEngineHost.ts exceeds cleanup size cap (${lineCount(host)} lines)`);
assert(lineCount(assetAdapter) <= 220, `CoreProductAssetAdapter.ts exceeds cleanup size cap (${lineCount(assetAdapter)} lines)`);
assert(lineCount(hostSequencerAdapter) <= 320, `CoreProductHostSequencerAdapter.ts exceeds cleanup size cap (${lineCount(hostSequencerAdapter)} lines)`);
assert(lineCount(runtimeAdapter) <= 650, `CoreProductRuntimeAdapter.ts exceeds cleanup size cap (${lineCount(runtimeAdapter)} lines)`);
assert(lineCount(snapshot) <= 1200, `coreProductSnapshot.ts exceeds cleanup size cap (${lineCount(snapshot)} lines)`);
assert(lineCount(snapshotEncoder) <= 520, `coreProductSnapshotEncoder.ts exceeds cleanup size cap (${lineCount(snapshotEncoder)} lines)`);
assert(lineCount(legacyPresetCompat) <= 420, `CoreProductLegacyPresetCompat.ts exceeds cleanup size cap (${lineCount(legacyPresetCompat)} lines)`);
assert(
  fallbackDiagnostics.includes('classifyCoreProductRuntimeFallback') &&
    fallbackDiagnostics.includes('CORE_PRODUCT_PLACEHOLDER_GETTER_CLASSIFICATIONS'),
  'CoreProductFallbackDiagnostics.ts must own fallback and placeholder classification data',
);

for (const token of [
  'updateParams(sliderState: Record<string, unknown>): void',
  'this.runtime.loadSnapshot(encodeCoreProductSnapshot(snapshot));',
  'latestProductSnapshot: CoreProductSnapshot | null',
  'applyLatestSnapshotUpdate(reason: SnapshotReloadReason = \'adapter-update\'): void',
  'applySnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot): boolean',
  'dirtyDiffCount',
  'fullSnapshotReloadCount',
  'unsupportedControlCount',
  'snapshotReloadCpuMs',
  'lastSnapshotReloadReason',
  'private readonly assetAdapter = new CoreProductAssetAdapter',
  'buildCoreProductSnapshotDiff(previous, next',
  'shouldForwardCoreProductRngDiffs(this.latestSliderState, this.latestTelemetry)',
  'registerAsset(asset: DecodedCoreProductAsset): void',
  'this.assetAdapter.registerAsset(asset)',
  'this.assetAdapter.clear()',
  'this.assetAdapter.shouldUseDefaultAssets()',
  'this.assetAdapter.ensureDefaultAssetsForState()',
  'this.assetAdapter.ensurePianoAssetForMidi(note.midi)',
  'this.assetAdapter.registeredDecodedAssetByteLength()',
  'CORE_PRODUCT_MEMORY_BUDGETS.totalRegisteredDecodedBytes',
  "if (property === 'then') return undefined;",
  'setJourneyMorphClockCallback(callback:',
  'journeyMorphClockRunning',
  'createCoreProductJourneyStateEvent(',
  'setRuntimeWalkPositionsCallback(callback:',
  'setDrumMorphRange(voice:',
  'setDrumParamSHRange(key:',
  'setDualRanges(ranges:',
  'setRuntimeWalkRanges(ranges:',
  'pushMidiMessage(message:',
  'getState(): EngineState',
  'getAllStemNodes(): Record<string, RecordableTrackSource>',
  'getLimiterNode(): AudioNode | null',
  'return this.runtime.outputNode;',
  'getSonicParityDebugState(): Record<string, unknown>',
  'stop(): void',
  'dispose(): void',
  'ensureDrumSynth(sliderState?: Record<string, unknown>): void',
  'resetCofDrift(): void',
  'resetSonicParityFx(): void',
  'setSeedLocked(locked: boolean): void',
  'triggerSynthVoice(',
  'midiFromFrequency(frequency: number)',
  'loadLeadPreset(slot: unknown, presetId: unknown): Promise<void>',
  'resetSynthEuclidLaneHome(laneIndex: number): void',
  'diceSynthEuclidLane(laneIndex: number, intensity: number = 1): void',
  'resetDrumEuclidLaneHome(laneIndex: number): void',
  'diceDrumEuclidLane(laneIndex: number, intensity: number = 1): void',
  'postSequencerControlEvent(event: CoreProductEvent): void',
  'syncSequencerLaneParams(',
  'createCoreProductSequencerLaneParamEvent(',
  'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision',
  'KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing',
  'normalizeClockDivisionValue(value, 16)',
  'setSynthEuclidEvolveConfigs(configs: unknown[]): void',
  'setDrumEuclidEvolveConfigs(configs: unknown[]): void',
  'setSynthSubLaneEnabled(states: Record<string, boolean>[]): void',
  'setDrumSubLaneEnabled(states: Record<string, boolean>[]): void',
  'setSynthPitchSettings(settings: unknown[]): void',
  'setSynthPitchBindingModes(modes: unknown[]): void',
  'setSynthStepOverrides(overrides: unknown): void',
  'setDrumStepOverrides(overrides: unknown): void',
  'normalizeSubLaneEnabledStates(states: unknown)',
  'normalizeSequencerStepToggleOverrides(',
  'normalizeSequencerStepValueOverrides(',
  'normalizeSequencerStepValueConfigs(',
  'normalizeSubLaneDirection(',
  'stepValueFieldEnabled(',
  'collectNumericStepValues(',
  'collectTrigConditionStepValues(',
  "this.syncSequencerStepToggles('synth', true);",
  "this.syncSequencerStepToggles('drum', true);",
  'this.flushSequencerStepToggles();',
  'synthEuclidEvolveConfigs: normalizeEvolveConfigs(configs)',
  'drumEuclidEvolveConfigs: normalizeEvolveConfigs(configs)',
  'createCoreProductModulationRangeEvent(',
  'createCoreProductSequencerStepEvent(',
  'createCoreProductSequencerStepValueEvent(',
  'createCoreProductSequencerSubLaneConfigEvent(',
  'createCoreProductSequencerClearStepsEvent(',
  'createCoreProductSequencerResetHomeEvent(',
  'createCoreProductSequencerDiceEvent(',
  'createCoreProductMidiEvent({',
  'resolveCoreProductRangeTargets(key)',
  'setDrumTriggerCallback(callback:',
  'setTelemetryCallback((telemetry) => this.handleTelemetry(telemetry));',
  'reconcileSequencerUiState(telemetry:',
  'reconcileSynthSequencerLane(',
  'reconcileDrumSequencerLane(',
  'synthEvolvePayloadFromLane(',
  'drumEvolvePayloadFromLane(',
  'createPerfSnapshot(telemetry:',
  'telemetryRngState',
  'rngSeed: this.latestTelemetry.rngSeed',
  'rngState: this.latestTelemetry.rngState',
  'currentRangeValueContext',
]) {
  assert(hostSurface.includes(token), `core-product host/sequencer adapter is missing ${token}`);
}

for (const token of [
  'MAX_SNAPSHOT_DIFF_EVENTS',
  'buildSnapshotDiff(',
  'assetRefsChanged(previous.assetRefs, next.assetRefs)',
  'appendSourceParamDiffs(events, previous.sources, next.sources)',
  "appendSequencerLaneDiffs(events, 'synth', previous.synthLanes, next.synthLanes)",
  'createCoreProductParamEvent(',
  'createCoreProductSourcePresetEvent(',
  'KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowWow',
  'KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseAlias',
  'shouldForwardCoreProductRngDiffs(',
  'dirty-diff-event-budget',
]) {
  assert(runtimeAdapter.includes(token), `CoreProductRuntimeAdapter is missing ${token}`);
}

for (const token of [
  'class CoreProductAssetAdapter',
  'registeredAssetIds',
  'pianoAssetPromises',
  'defaultSoundscapeAssetPromises',
  'registeredAssetDecodedBytes',
  'registerAsset(asset: DecodedCoreProductAsset): void',
  'getDecodedCoreProductAssetByteLength(asset)',
  'registeredDecodedAssetByteLength(): number',
  'shouldUseDefaultAssets(): boolean',
  'ensureDefaultAssetsForState(): Promise<void>',
  'ensureDefaultPianoAsset(): Promise<void>',
  'ensurePianoAssetsForState(): Promise<void>',
  'ensurePianoAssetForMidi(midiNote: number): Promise<void>',
  'getCoreProductPianoPreloadAssetDescriptors(this.readSliderState())',
  'getCoreProductPianoAssetIdForMidi(midiNote)',
  'ensureDefaultSoundscapeAsset(): Promise<void>',
  'ensureSoundscapeAssetsForState(): Promise<void>',
  'getCoreProductSoundscapeAssetDescriptorsForState(this.readSliderState())',
  'decodeCoreProductAsset(',
  'birds2Enabled',
  'insects2Enabled',
  'CORE_PRODUCT_ASSET_FLAGS.piano',
  'CORE_PRODUCT_ASSET_FLAGS.loop | CORE_PRODUCT_ASSET_FLAGS.soundscape',
]) {
  assert(assetAdapter.includes(token), `CoreProductAssetAdapter is missing ${token}`);
}

for (const token of [
  'import { isCoreProductRangeKeySupported }',
  'coreProductSupportsRuntimeRangeKey(key',
  "audioEngineRuntimeMode === 'core-product' && !coreProductSupportsRuntimeRangeKey(keyStr)",
  "audioEngineRuntimeMode === 'core-product' && !coreProductSupportsRuntimeRangeKey(key)",
  'dualModeSupported',
]) {
  assert(app.includes(token), `App core-product unsupported-control gating is missing ${token}`);
}

assert(
  /private patchAdapterState[\s\S]*if \(loadSnapshot\) \{\s*this\.applyLatestSnapshotUpdate\(\);/.test(host),
  'core-product host adapter patches must use the dirty snapshot diff path',
);

for (const token of [
  'CORE_PRODUCT_PIANO_PRELOAD_MIDI_NOTES',
  'CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID',
  'getCoreProductPianoPreloadAssetDescriptors',
  'getCoreProductSoundscapeAssetDescriptorsForState',
  'Alps Birds_441_m_normalized.ogg',
  'Fujian Birds 2_441_m_normalized.ogg',
  'Alps Birds 2_noiseremoval_441_m.ogg',
  'Ghetary-Waves-Rocks_cl-normalized.ogg',
  "state?.birds2Enabled === true",
  "state?.insectsEnabled === true || state?.insects2Enabled === true",
]) {
  assert(assets.includes(token), `core-product assets are missing ${token}`);
}

for (const token of [
  'const SNAPSHOT_BYTES = 12644',
  'const SOURCE_BYTES = 1200',
  'KESSHO_PRODUCT_DRUM_PARAM_COUNT',
  'KESSHO_PRODUCT_DRUM_VOICE_COUNT',
  'assetRefs: number[]',
  'exactDrumParamCount: number',
  'exactDrumParams: number[]',
  'drumVoicePresetAIds: number[]',
  'drumVoicePresetBIds: number[]',
  'drumVoiceMorphs: number[]',
  'const soundscapeAssets = soundscapeSource?.enabled',
  'getCoreProductSoundscapeAssetDescriptorsForState(sliderState)',
  'assetRefs: soundscapeAssets.map((asset) => asset.assetId)',
  'assetRefLevels',
  'u32(snapshot.assetRefs[i] ?? 0)',
  'getTransportMetrics',
  'rngSeedFromState',
  'rngStateFromState',
  'hashSeedMaterial',
  'sourcePresetId',
  'soundscapePresetIdFromState',
  'endpointPresetId',
  'source.presetId =',
  'ProductGranularVoiceSnapshot',
  'granularVoiceFromState',
  'granularLegacyPitchModeId',
  'granularVoices: [1, 2, 3, 4].map',
  'u32(bool(snapshot.fx.granularEnabled))',
  'f32(snapshot.fx.granularFeedback)',
  'f32(snapshot.fx.granularTimingRandomness)',
  'spectralFreezeEnabled: boolean',
  'spectralFreezeActive: boolean',
  'spectralFreezePhaseJitter: number',
  'dynamicsEnabled: boolean',
  'dynamicsCharacterMix: number',
  'dynamicsModSlowWow: number',
  'dynamicsEndCompProgramRelease: number',
  'sidechainEnabled: boolean',
  'sidechainPad1Target: number',
  'saturationDrive: number',
  'u32(bool(snapshot.fx.spectralFreezeEnabled))',
  'f32(snapshot.fx.spectralFreezePhaseJitter)',
  'u32(bool(snapshot.fx.dynamicsEnabled))',
  'f32(snapshot.fx.dynamicsEndCompProgramRelease)',
  'f32(snapshot.fx.dynamicsModNoiseAlias)',
  'u32(bool(snapshot.fx.sidechainEnabled))',
  'f32(snapshot.fx.sidechainReverbTarget)',
  'f32(snapshot.master.saturationDrive)',
]) {
  assert(snapshotSurface.includes(token), `core-product snapshot/encoder is missing ${token}`);
}

for (const token of [
  'SNAPSHOT_AUTHORITY: LEGACY_PRESET_KEY_TO_GENERATED_ID',
  'SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE',
  'KESSHO_PRODUCT_SOURCE_PRESETS',
  'KESSHO_PRODUCT_DRUM_VOICE_PRESETS',
  'function drumVoicePresetId(voiceIndex: number, presetName: unknown): number',
  'function drumVoicePresetIdsFromState(state: Record<string, unknown> | undefined, endpoint:',
  'function exactPadParamsFromState(state: Record<string, unknown> | undefined, padIndex: 0 | 1): number[]',
  'function exactLeadParamsFromState(state: Record<string, unknown> | undefined, leadIndex: 0 | 1): number[]',
  'function exactDrumParamsFromState(): number[]',
]) {
  assert(legacyPresetCompat.includes(token), `CoreProductLegacyPresetCompat is missing ${token}`);
}

for (const token of [
  'macroMorph',
  'macroDistance',
  'macroExpression',
  '"profile"',
  '"tone"',
  '"brightness"',
  '"texture"',
  '"motion"',
  '"attack"',
  '"release"',
  '"body"',
  '"transient"',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING',
  'KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS',
]) {
  assert(generatedSchema.includes(token), `generated Product Core source preset schema is missing ${token}`);
}

for (const token of [
  'createCoreProductStartEvent',
  'createCoreProductStopEvent',
  'createCoreProductManualNoteEvent',
  'createCoreProductDrumTriggerEvent',
  'createCoreProductSourcePresetEvent',
  'createCoreProductJourneyEvent',
  'createCoreProductJourneyStateEvent',
  'createCoreProductParamEvent',
  'createCoreProductModulationRangeEvent',
  'createCoreProductSequencerLaneParamEvent',
  'createCoreProductSequencerStepEvent',
  'createCoreProductSequencerStepValueEvent',
  'createCoreProductSequencerClearStepsEvent',
  'createCoreProductSequencerResetHomeEvent',
  'createCoreProductSequencerDiceEvent',
  'ResetSequencerLaneHome',
  'DiceSequencerLane',
  'CORE_PRODUCT_SEQUENCER_IDS',
  'CORE_PRODUCT_STEP_TOGGLE_FLAGS',
  'CORE_PRODUCT_STEP_VALUE_FIELDS',
  'CORE_PRODUCT_SUBLANE_DIRECTIONS',
  'createCoreProductSequencerSubLaneConfigEvent',
  'createCoreProductMidiEvent',
  'resolveCoreProductDrumMorphRangeTarget',
  'mapValue?: (value: number, context: CoreProductRangeValueContext) => number',
  'GRANULAR_VOICE_RANGE_PARAM_SUFFIXES',
  'granularVoiceRangeTargets',
  'drumDelayNoteL',
  'FxDelayATimeLeftMs',
  'drumDelayNoteR',
  'FxDelayATimeRightMs',
  'granularDelayTime',
  'FxDelayBBaseTimeMs',
  'indexedDelayDivisionMs',
  'pad1DelayASend',
  'SourceDelayASend',
  'lead2DelayBSend',
  'SourceDelayBSend',
  'granularPianoSend',
  'SourceGranularSend',
  'padPostLPF',
  'SourcePostLpfHz',
  'padStereoWidth',
  'SourceStereoWidth',
  'lead1PostLPFKeyTracking',
  'SourcePostLpfKeyTracking',
  'masterLimiterCeilingDb',
  'delayAFeedback',
  'FxDelayAFeedback',
  'delayAModRate',
  'normalizedToDelayAModRateHz',
  'delayAModDepth',
  'normalizedToDelayAModDepthMs',
  'delayACrossFeedFilter',
  'normalizedToDelayACrossFeedFilterHz',
  'granularDelayMix',
  'granularDelayActivity',
  'delayAToBSend',
  'reverbDecay',
  'FxReverbDecay',
  'spectralFreezePhaseJitter',
  'characterResonance',
  'degradeCorrosion',
  'degradeModSlowWow',
  'FxDynamicsModSlowWow',
  'degradeModNoiseAlias',
  'dynamicsSaturationBias',
  'endCompProgramRelease',
  'sidechainPad1Target',
  'resolveCoreProductDrumRuntimeRangeTargets',
  'isCoreProductRangeKeySupported(key: string)',
]) {
  assert(events.includes(token), `core-product events are missing ${token}`);
}

const granularVoiceRangeSuffixes = [
  ['Speed', 'Speed'],
  ['Pitch', 'Pitch'],
  ['WriteFollow', 'WriteFollow'],
  ['Density', 'Density'],
  ['GrainSize', 'GrainSizeMs'],
  ['Spray', 'Spray'],
  ['GrainOct', 'GrainOctaveProbability'],
  ['Gain', 'Gain'],
  ['Pan', 'Pan'],
  ['Blur', 'Blur'],
  ['PosLFODepth', 'PositionLfoDepth'],
  ['PanLFORate', 'PanLfoRate'],
];

for (const [stateSuffix, paramSuffix] of granularVoiceRangeSuffixes) {
  assert(
    events.includes(`['${stateSuffix}', '${paramSuffix}']`),
    `core-product events are missing granular voice ${stateSuffix} -> ${paramSuffix} range mapping`,
  );
}

for (const token of [
  'for (const voiceNumber of [1, 2, 3, 4] as const)',
  '`granularV${voiceNumber}${stateSuffix}`',
  '`FxGranularV${voiceNumber}${paramSuffix}`',
]) {
  assert(events.includes(token), `core-product events are missing generated granular voice range token ${token}`);
}

for (const token of [
  "type: 'snapshot'",
  "type: 'register-asset'",
  "type: 'request-telemetry'",
  "type: 'telemetry'",
  'get outputNode(): AudioNode | null',
  'context.createGain()',
  'setTelemetryCallback(callback:',
  'dispose(): void',
  'window.clearInterval(this.telemetryTimer)',
  'void context.close();',
]) {
  assert(runtime.includes(token), `core-product runtime is missing ${token}`);
}

for (const token of [
  'wasmHeapBudgetBytes?: number',
  'decodedAssetBytes?: number',
  'decodedAssetBudgetBytes?: number',
  'assetAllocationBytes?: number',
]) {
  assert(telemetryTypes.includes(token), `core-product telemetry type is missing ${token}`);
}

for (const token of [
  "this.resolve('kessho_product_copy_telemetry')",
  "this.resolve('kessho_product_copy_sequencer_ui_state')",
  'copyTelemetry(this.engine, this.telemetryPtr) !== 1',
  'copySequencerUiState(this.engine, this.sequencerUiStatePtr)',
  'const SEQUENCER_UI_STATE_BYTES = 70948;',
  "message.type === 'request-telemetry'",
  "this.port.postMessage({ type: 'telemetry', telemetry });",
  'this.heapF32.buffer !== this.exports.memory.buffer',
  'workletOutputPeak: this.lastOutputPeak',
  'wasmHeapBytes: this.exports.memory.buffer.byteLength',
  'decodedAssetBytes: this.assetDecodedBytes',
  'assetAllocationBytes: this.assetAllocationBytes',
  "getStem: this.resolve('kessho_product_get_stem')",
  'workletStemPeaks: this.lastStemPeaks',
  'workletPadStemPeak: this.lastStemPeaks[1] || 0',
  'runtimeWalkValues[controlId] = value;',
  'const TELEMETRY_BYTES = 368;',
  'rngSeed: this.view.getUint32(ptr + 288, true)',
  'rngState: this.view.getUint32(ptr + 292, true)',
  'sourcePresetIds.push(this.view.getUint32(ptr + 296 + index * 4, true));',
  'masterOutputPeak: this.view.getFloat32(ptr + 328, true)',
  'masterLimiterGainReductionDb: this.view.getFloat32(ptr + 336, true)',
  'const sequencerUiStateRevision = this.view.getUint32(ptr + 348, true);',
  'masterTruePeak: this.view.getFloat32(ptr + 352, true)',
  'masterTruePeakDbtp: this.view.getFloat32(ptr + 356, true)',
  'masterIntegratedLufs: this.view.getFloat32(ptr + 360, true)',
  'sequencerUiState,',
]) {
  assert(worklet.includes(token), `core-product worklet is missing ${token}`);
}

assert(
  manifest.includes("'kessho_product_copy_telemetry'") &&
    manifest.includes("'kessho_product_copy_sequencer_ui_state'"),
  'WASM manifest must export Product Core telemetry and sequencer UI state copy APIs',
);

for (const token of [
  'transport',
  'harmony',
  'sources',
  'synthLanes',
  'drumLanes',
  'journey',
  "booleanFromState(sliderState, 'journeyEnabled', false)",
  "numberFromState(sliderState, 'journeyMorphPhase', 0)",
  "numberFromState(sliderState, 'journeyMorphRateBars', 8)",
  'fx',
  "const granularEnabled = booleanFromState(sliderState, 'granularEnabled', false)",
  "const delayAEnabled = booleanFromState(sliderState, 'delayAEnabled', true)",
  "const delayBEnabled = booleanFromState(sliderState, 'granularDelayEnabled', false)",
  "const spectralFreezeEnabled = booleanFromState(sliderState, 'spectralFreezeEnabled', false)",
  "const dynamicsEnabled = booleanFromState(sliderState, 'dynamicsEnabled', false)",
  "granularMix: granularEnabled ?",
  "delayATimeLeftMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteL', '1/8d', transport.bpm), 10, 5000)",
  "delayATimeRightMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteR', '1/4', transport.bpm), 10, 5000)",
  "delayAFeedback: clamp(numberFromState(sliderState, 'delayAFeedback', 0.4), 0, 0.95)",
  "delayAMix: delayAEnabled ?",
  "delayBMix: delayBEnabled",
  "delayBPattern: delayBPatternId(sliderState?.delayBPattern)",
  "reverbType: reverbTypeId(sliderState?.reverbType)",
  "reverbQuality: reverbQualityId(sliderState?.reverbQuality)",
  "reverbErLpFreq: clamp(numberFromState(sliderState, 'reverbErLpFreq', 2500), 200, 12000)",
  "delayBToReverb: clamp(numberFromState(sliderState, 'granularDelayReverbSend', 0.4), 0, 1)",
  "spectralFreezeMix: clamp(numberFromState(sliderState, 'spectralFreezeMix', 1), 0, 1)",
  "spectralFreezeEnabled,",
  "dynamicsDrive: dynamicsEnabled",
  "dynamicsCharacterMode: dynamicsCharacterModeId(sliderState?.characterMode)",
  "dynamicsDegradeMix: clamp(numberFromState(sliderState, 'degradeMix', 0), 0, 1)",
  "dynamicsModSlowWow: clamp(numberFromState(sliderState, 'degradeModSlowWow', 0.18), 0, 1)",
  "dynamicsModNoiseAlias: clamp(numberFromState(sliderState, 'degradeModNoiseAlias', 0.02), 0, 1)",
  "dynamicsSaturationDrive: clamp(numberFromState(sliderState, 'dynamicsSaturationDrive', 0), 0, 1)",
  "dynamicsEndCompThreshold: clamp(numberFromState(sliderState, 'endCompThreshold', -18), -60, 0)",
  "sidechainKeyA: sidechainKeyId(sliderState?.sidechainKeyA)",
  "sidechainPad1Target: clamp(numberFromState(sliderState, 'sidechainPad1Target', 0), 0, 1)",
  'routing',
  'master',
  'limiterCeilingDb',
  "numberFromState(sliderState, 'masterLimiterCeilingDb', -0.5)",
  "saturationMode: dynamicsSaturationModeId(sliderState?.masterSatMode)",
  "saturationDrive: clamp(numberFromState(sliderState, 'masterSatDrive', 0), 0, 1)",
  'f32(snapshot.master.limiterCeilingDb)',
  'u32(snapshot.master.saturationMode)',
  'rng',
  'evolution',
  'evolutionAmountFromState',
  'snapshot.evolution.amount',
  'snapshot.evolution.state',
  'synthLanesFromState',
  'drumLanesFromState',
  'synthSourceIdFromState',
  'drumTargetVoiceIndices',
  'CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID',
  'getDefaultCoreProductSoundscapeAssetId(state)',
  'sourcePresetId',
  'soundscapePresetIdFromState',
  'u32(snapshot.fx.reverbType >>> 0)',
  'f32(snapshot.fx.reverbErLpFreq)',
]) {
  assert(snapshotSurface.includes(token), `core-product snapshot/encoder is missing ${token}`);
}

for (const forbidden of [
  'setInterval(',
  'setTimeout(',
  'AudioBufferSourceNode',
  'createBufferSource(',
  'missingNoopMethods',
]) {
  assert(!host.includes(forbidden), `core-product host must not schedule/render product audio with ${forbidden}`);
}

assert(!appRuntime.includes('missingNoopMethods'), 'runtime must not keep audio-critical missing-method no-op fallbacks');
assert(appRuntime.includes("case 'core-product':"), 'runtime must keep Product Core selectable');
assert(appRuntime.includes("case 'core-bridge':"), 'runtime must keep Core bridge selectable');
assert(!appRuntime.includes('isLegacyCoreBridgeOptInEnabled'), 'runtime must not hide the verified Core bridge behind a transitional opt-in');
assert(!appRuntime.includes('legacyCoreBridge'), 'runtime must not require a legacy bridge query/storage escape hatch');
assert(appRuntime.includes("if (typeof window === 'undefined') return 'core-bridge';"), 'runtime must default SSR to the verified Core bridge path');
assert(appRuntime.includes("resolvedRuntimeMode = 'core-bridge';"), 'runtime must default browsers to the verified Core bridge path');
assert(appRuntime.includes("'startJourneyMorphClock'"), 'runtime must eagerly load startJourneyMorphClock');
assert(appRuntime.includes("'stopJourneyMorphClock'"), 'runtime must eagerly load stopJourneyMorphClock');

const appCalledAudioMethods = new Set(
  Array.from(app.matchAll(/\baudioEngine\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g), (match) => match[1]),
);
for (const method of appCalledAudioMethods) {
  assert(
    new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?${method}\\s*\\(`).test(host),
    `core-product host must explicitly implement app-called audioEngine.${method}()`,
  );
}

function importSpecifiers(source) {
  return Array.from(source.matchAll(/from ['"]([^'"]+)['"]/g), (match) => match[1]).sort();
}

const snapshotImportAllowlist = new Set([
  '../ui/state',
  './CoreProductLegacyPresetCompat',
  './coreProductAssets',
  './coreProductEvents',
  './coreProductSnapshotEncoder',
  './generated/kesshoProductSchema',
  './outputTrims',
  './transport',
]);
for (const specifier of importSpecifiers(snapshot)) {
  assert(
    snapshotImportAllowlist.has(specifier),
    `core-product snapshot adapter import is not classified: ${specifier}`,
  );
}

const hostImportAllowlist = new Set([
  '../native/capacitorMidiRouting',
  './CoreProductAssetAdapter',
  './CoreProductHostSequencerAdapter',
  './CoreProductRuntimeAdapter',
  './coreMidiEvents',
  './coreProductAssets',
  './CoreProductFallbackDiagnostics',
  './coreProductEvents',
  './coreProductRuntime',
  './coreProductSnapshot',
  './coreProductTelemetry',
  './engine',
  './generated/kesshoProductParams',
  './transport',
]);
for (const specifier of importSpecifiers(host)) {
  assert(
    hostImportAllowlist.has(specifier),
    `core-product host import is not classified: ${specifier}`,
  );
}

console.log('Kessho Product web host checks passed');
