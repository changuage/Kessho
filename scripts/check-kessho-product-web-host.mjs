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
const hostRuntimeGuards = read('src/audio/CoreProductHostRuntimeGuards.ts');
const runtimeAdapter = read('src/audio/CoreProductRuntimeAdapter.ts');
const runtime = read('src/audio/coreProductRuntime.ts');
const appRuntime = read('src/audio/runtime.ts');
const app = read('src/App.tsx');
const events = read('src/audio/coreProductEvents.ts');
const snapshot = read('src/audio/coreProductSnapshot.ts');
const snapshotTypes = read('src/audio/coreProductSnapshotTypes.ts');
const arrangementScheduler = read('src/audio/coreProductArrangementScheduler.ts');
const snapshotEncoder = read('src/audio/coreProductSnapshotEncoder.ts');
const legacyPresetCompat = read('src/audio/CoreProductLegacyPresetCompat.ts');
const telemetryTypes = read('src/audio/coreProductTelemetry.ts');
const synthPage = read('src/ui/synth/SynthPage.tsx');
const filterLfoViz = read('src/ui/synth/FilterLfoViz.tsx');
const assets = `${read('src/audio/coreProductAssets.ts')}\n${read('src/audio/coreProductAssetManifest.json')}`;
const generatedSchema = read('src/audio/generated/kesshoProductSchema.ts');
const worklet = read('public/worklets/kessho-core-product.worklet.js');
const manifest = read('scripts/kessho-core-build-manifest.mjs');
const hostSurface = `${host}\n${hostSequencerAdapter}\n${hostRuntimeGuards}`;
const snapshotSurface = `${snapshotTypes}\n${snapshot}\n${snapshotEncoder}`;

const lineCount = (source) => source.split('\n').length;
assert(lineCount(host) <= 1550, `coreProductEngineHost.ts exceeds cleanup size cap (${lineCount(host)} lines)`);
assert(lineCount(assetAdapter) <= 220, `CoreProductAssetAdapter.ts exceeds cleanup size cap (${lineCount(assetAdapter)} lines)`);
assert(lineCount(hostSequencerAdapter) <= 320, `CoreProductHostSequencerAdapter.ts exceeds cleanup size cap (${lineCount(hostSequencerAdapter)} lines)`);
assert(lineCount(hostRuntimeGuards) <= 180, `CoreProductHostRuntimeGuards.ts exceeds cleanup size cap (${lineCount(hostRuntimeGuards)} lines)`);
assert(lineCount(runtimeAdapter) <= 650, `CoreProductRuntimeAdapter.ts exceeds cleanup size cap (${lineCount(runtimeAdapter)} lines)`);
assert(lineCount(arrangementScheduler) <= 520, `coreProductArrangementScheduler.ts exceeds cleanup size cap (${lineCount(arrangementScheduler)} lines)`);
assert(lineCount(snapshot) <= 1240, `coreProductSnapshot.ts exceeds cleanup size cap (${lineCount(snapshot)} lines)`);
assert(lineCount(snapshotEncoder) <= 520, `coreProductSnapshotEncoder.ts exceeds cleanup size cap (${lineCount(snapshotEncoder)} lines)`);
assert(lineCount(legacyPresetCompat) <= 420, `CoreProductLegacyPresetCompat.ts exceeds cleanup size cap (${lineCount(legacyPresetCompat)} lines)`);
assert(
  fallbackDiagnostics.includes('classifyCoreProductRuntimeFallback') &&
    fallbackDiagnostics.includes('CORE_PRODUCT_GETTER_POLICIES'),
  'CoreProductFallbackDiagnostics.ts must own fallback classification and Product Core getter policy data',
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
  'this.assetAdapter.hasMissingDefaultAssetsForState()',
  'this.assetAdapter.ensureDefaultAssetsForState()',
  'this.assetAdapter.ensurePianoAssetForNote(note.midi, note.velocity)',
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
  'coreProductRangeValueContext',
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
  'hasMissingDefaultAssetsForState(): boolean',
  'ensureDefaultAssetsForState(): Promise<void>',
  'ensureDefaultPianoAsset(): Promise<void>',
  'ensurePianoAssetsForState(): Promise<void>',
  'ensurePianoAssetForMidi(midiNote: number, variant',
  'ensurePianoAssetForNote(midiNote: number, velocity: number): Promise<void>',
  'choosePianoSampleVariant',
  'getCoreProductPianoPreloadAssetDescriptors(this.readSliderState())',
  'getCoreProductPianoAssetIdForMidiVariant(midiNote, variant)',
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
  app.includes('const dualModeSupported = !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);'),
  'App sliderProps must keep dual-slider UI state available for every non-single-only key',
);
assert(
  !app.includes('const dualModeSupported = coreProductRuntimeRangeSupported && !SINGLE_ONLY_SLIDER_KEYS.has(keyStr);'),
  'App sliderProps must not hide dual-slider UI state behind native Product Core range support',
);

assert(
  /private patchAdapterState[\s\S]*if \(loadSnapshot\) \{\s*this\.applyLatestSnapshotUpdate\(\);/.test(host),
  'core-product host adapter patches must use the dirty snapshot diff path',
);

for (const token of [
  'class CoreProductArrangementScheduler',
  'createSchedulerHarmonyState',
  'scheduleHarmonyTicks',
  'scheduleNextHarmonyTick',
  'onHarmonyTick(isPhraseBoundary',
  'triggerPadChord',
  'startLeadMelody',
  'scheduleLeadPhrase',
  'getTimeUntilNextBoundaryWall',
  'getCurrentClockIndexWall',
  'updateHarmonyState',
  'getScaleNotesInRange',
  'createCoreProductManualNoteEvent',
  "boundedNumber(this.state, 'lead1Density', 0.5, 0.1, 12)",
  'const timingSeconds = (this.rng() * phraseMs) / 1000;',
  'pickChordWeightedNote(this.rng, availableNotes',
  'this.scheduleNote(delaySeconds',
]) {
  assert(arrangementScheduler.includes(token), `Product arrangement scheduler must preserve web timing/music intent: missing ${token}`);
}

assert(
  !snapshot.includes('appendCoreProductArrangementLanes') && !snapshot.includes('arrangementStepValues'),
  'Product chord/random arrangement must not be flattened into hidden snapshot lanes',
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
  'const SNAPSHOT_BYTES = 12700',
  'const SOURCE_BYTES = 1204',
  'KESSHO_PRODUCT_DRUM_PARAM_COUNT',
  'KESSHO_PRODUCT_DRUM_VOICE_COUNT',
  'drumDelayFilterHz',
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
  'function exactDrumParamsFromState(state?: Record<string, unknown>): number[]',
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
  'granularFeedback',
  'FxGranularFeedback',
  'granularFeedbackLPF',
  'FxGranularFeedbackLpfHz',
  'granularDiffusion',
  'FxGranularBusDiffusion',
  'granularLegacyJitter',
  'FxGranularLegacyJitterMs',
  'granularMacroActivity',
  'granularMacroVoiceTargets',
  'computeGranularMacroModel',
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
  'degradeWobbleSpeed',
  'degradeCorrosion',
  'degradeModSlowWow',
  'FxDynamicsModSlowWow',
  'degradeModNoiseAlias',
  'dynamicsSaturationBias',
  'endCompProgramRelease',
  'sidechainPad1Target',
  'CORE_PRODUCT_DRUM_RUNTIME_PARAM_ID_BASE',
  'coreProductDrumRuntimeParamId(paramIndex:',
  'resolveCoreProductDrumRuntimeRangeTargets',
  'KESSHO_PRODUCT_DRUM_PARAM_SPECS',
  'drumExactTarget(voiceIndex:',
  'drumDelayFeedback',
  'normalizedToDrumDelayFilterHz',
  'isCoreProductRangeKeySupported(key: string)',
]) {
  assert(events.includes(token), `core-product events are missing ${token}`);
}
assert(
  events.includes('context.randomWalkSpeed ?? context.speed ?? 1') &&
    events.includes('context.randomWalkMode ?? context.mode'),
  'core-product random-walk flags must accept the host runtime walk speed/mode context aliases',
);
assert(
  hostRuntimeGuards.includes('randomWalkSpeed: walk.speed') &&
    hostRuntimeGuards.includes('randomWalkMode: walk.mode'),
  'CoreProductHostRuntimeGuards must pass explicit random-walk speed/mode aliases into range events',
);

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
  "type: 'visual-telemetry'",
  'CORE_PRODUCT_VISUAL_TELEMETRY_INTERVAL_MS',
  "type: 'telemetry'",
  'get outputNode(): AudioNode | null',
  'context.createGain()',
  'setTelemetryCallback(callback:',
  'setVisualTelemetryActive(active:',
  'dispose(): void',
  'window.clearInterval(this.telemetryTimer)',
  'window.clearInterval(this.visualTelemetryTimer)',
  'void context.close();',
]) {
  assert(runtime.includes(token), `core-product runtime is missing ${token}`);
}

for (const token of [
  'Math.abs(prev.pad1FilterFreq - next.pad1FilterFreq) < 0.01',
  'Math.abs(prev.pad1LfoValue - next.pad1LfoValue) < 0.00001',
  "useRuntimeSliderPosition('padPostLPF'",
  'postLpfHz={livePad1PostLpf}',
  'pad1FilterModEnvActive',
  'pad2FilterModEnvActive',
  'return hasAnimatedFilterView ? 50 : 180;',
  'useVisibleInterval(updateLiveFilterViz, synthLivePollMs',
]) {
  assert(synthPage.includes(token), `Synth live filter visualizer must stay responsive in Product Core: missing ${token}`);
}
assert(
  !synthPage.includes('window.setInterval(poll, 50)'),
  'Synth live filter visualizer must use one visible interval instead of duplicate Product Core polling loops',
);

for (const token of [
  'displayedCutoffRef',
  'lastDrawMsRef',
  '1 - Math.exp(-elapsedMs / 80)',
  'postLpfHz?: number',
  'postLpfDominant',
  'drawCombinedResponseCurve',
  "filterGain(freq, postLpfCutoff, 0, 0.7, 'lowpass', 0, 12)",
  'Engine telemetry owns live cutoff, including LFO and mod-envelope motion.',
  'const hasFilterTelemetryMotion = props.isRunning',
  "props.lfoDest !== 'none' || hasFilterModEnvelopeMotion(props)",
]) {
  assert(filterLfoViz.includes(token), `FilterLfoViz must smooth live Product Core telemetry between polling ticks: missing ${token}`);
}
assert(
  !filterLfoViz.includes('loopingModEnvValue') &&
    !filterLfoViz.includes('filterEnv * (props.filterCutoffMax - props.filterCutoffMin)'),
  'FilterLfoViz must not locally synthesize live filter cutoff on top of Product Core telemetry',
);
assert(
  !filterLfoViz.includes('Hz audible'),
  'FilterLfoViz must not present the pad source post-LPF as a hard audible ceiling',
);

for (const token of [
  'applyPadDistanceToState',
  "exactPadParamsFromState(distanceAdjustedPadExactState(state, 'pad1'), 0)",
  "exactPadParamsFromState(distanceAdjustedPadExactState(state, 'pad2'), 1)",
]) {
  assert(snapshot.includes(token), `Product Core Pad snapshot must apply distance to exact Pad params for web parity: missing ${token}`);
}

for (const token of [
  'mapPadExactValueForDistance',
  'productParamTarget(coreProductPadRuntimeParamId(0, spec.index), key, (value, context)',
  'productParamTarget(coreProductPadRuntimeParamId(1, spec.index), key, (value, context)',
]) {
  assert(events.includes(token), `Product Core Pad runtime ranges must apply distance mapping for web parity: missing ${token}`);
}

for (const token of [
  'wasmHeapBudgetBytes?: number',
  'decodedAssetBytes?: number',
  'decodedAssetBudgetBytes?: number',
  'assetAllocationBytes?: number',
  'workletLeadStemPeak?: number',
  'workletGraphTapPeaks?: number[]',
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
  "message.type === 'request-visual-telemetry'",
  "this.port.postMessage({ type: 'telemetry', telemetry });",
  "this.port.postMessage({ type: 'visual-telemetry', telemetry });",
  'readVisualTelemetry()',
  'this.heapF32.buffer !== this.exports.memory.buffer',
  'workletOutputPeak: this.lastOutputPeak',
  'wasmHeapBytes: this.exports.memory.buffer.byteLength',
  'decodedAssetBytes: this.assetDecodedBytes',
  'assetAllocationBytes: this.assetAllocationBytes',
  "getStem: this.resolve('kessho_product_get_stem')",
  "getGraphTap: this.resolve('kessho_product_get_graph_tap')",
  'workletStemPeaks: this.lastStemPeaks',
  'workletGraphTapPeaks: this.lastGraphTapPeaks',
  'workletPadStemPeak: this.lastStemPeaks[1] || 0',
  'workletLeadStemPeak: Math.max(this.lastStemPeaks[3] || 0, this.lastStemPeaks[4] || 0)',
  'runtimeWalkValues[controlId] = value;',
  'const TELEMETRY_BYTES = 1040;',
  'rngSeed: this.view.getUint32(ptr + 928, true)',
  'rngState: this.view.getUint32(ptr + 932, true)',
  'sourcePresetIds.push(this.view.getUint32(ptr + 936 + index * 4, true));',
  'masterOutputPeak: this.view.getFloat32(ptr + 968, true)',
  'masterLimiterGainReductionDb: this.view.getFloat32(ptr + 976, true)',
  'const sequencerUiStateRevision = this.view.getUint32(ptr + 988, true);',
  'masterTruePeak: this.view.getFloat32(ptr + 992, true)',
  'masterTruePeakDbtp: this.view.getFloat32(ptr + 996, true)',
  'masterIntegratedLufs: this.view.getFloat32(ptr + 1000, true)',
  'granularWriteHeadPosition: this.view.getFloat32(ptr + 1004, true)',
  'granularVoicePositions: [',
  'pad1FilterFreq: this.view.getFloat32(ptr + 1024, true)',
  'pad1Lfo1Value: this.view.getFloat32(ptr + 1028, true)',
  'pad2FilterFreq: this.view.getFloat32(ptr + 1032, true)',
  'pad2Lfo1Value: this.view.getFloat32(ptr + 1036, true)',
  'sequencerUiState,',
]) {
  assert(worklet.includes(token), `core-product worklet is missing ${token}`);
}

assert(
  manifest.includes("'kessho_product_copy_telemetry'") &&
    manifest.includes("'kessho_product_copy_sequencer_ui_state'") &&
    manifest.includes("'kessho_product_get_graph_tap'"),
  'WASM manifest must export Product Core telemetry, sequencer UI state, and graph tap APIs',
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
  "const delayAEnabled =",
  "const delayBEnabled =",
  "const spectralFreezeEnabled = booleanFromState(sliderState, 'spectralFreezeEnabled', false)",
  "const dynamicsEnabled = booleanFromState(sliderState, 'dynamicsEnabled', false)",
  "granularMix: granularEnabled",
  "delayATimeLeftMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteL', '1/8d', transport.bpm), 10, 5000)",
  "delayATimeRightMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteR', '1/4', transport.bpm), 10, 5000)",
  "delayAFeedback: clamp(numberFromState(sliderState, booleanFromState(sliderState, 'drumDelayEnabled', false) ? 'drumDelayFeedback' : 'delayAFeedback', 0.4), 0, 0.95)",
  "delayAMix: delayAEnabled",
  "delayAFilterHz: booleanFromState(sliderState, 'drumDelayEnabled', false)",
  "delayBMix: delayBEnabled",
  "delayBPattern: delayBPatternId(sliderState?.delayBPattern)",
  "reverbType: reverbTypeId(sliderState?.reverbType)",
  "reverbQuality: reverbQualityId(shouldUseMobileReverbQualityOverride(sliderState) ? 'balanced' : sliderState?.reverbQuality)",
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
  'getPrimaryCoreProductSoundscapeAssetIdForState(state)',
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
assert(appRuntime.includes("case 'core-smoke':"), 'runtime must keep the Core smoke renderer explicitly selectable');
assert(!appRuntime.includes('isLegacyCoreBridgeOptInEnabled'), 'runtime must not hide the verified Core bridge behind a transitional opt-in');
assert(!appRuntime.includes('legacyCoreBridge'), 'runtime must not require a legacy bridge query/storage escape hatch');
assert(appRuntime.includes("if (typeof window === 'undefined') return 'core-product';"), 'runtime must default SSR to Product Core');
assert(appRuntime.includes("'core-product'"), 'runtime must default browsers to Product Core');
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
  '../platform',
  './CoreProductLegacyPresetCompat',
  './coreProductAssets',
  './coreProductEvents',
  './coreProductSoundscapesSnapshot',
  './coreProductSnapshotEncoder',
  './coreProductSnapshotTypes',
  './distanceMacro',
  './generated/kesshoProductSchema',
  './granularMacroCore',
  './harmony',
  './outputTrims',
  './rng',
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
  './CoreProductHostRuntimeGuards',
  './CoreProductLegacyPresetCompat',
  './CoreProductRuntimeAdapter',
  './coreMidiEvents',
  './coreProductArrangementScheduler',
  './coreProductAssets',
  './CoreProductFallbackDiagnostics',
  './coreProductEvents',
  './coreProductGraphTaps',
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
