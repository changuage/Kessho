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
const runtime = read('src/audio/coreProductRuntime.ts');
const appRuntime = read('src/audio/runtime.ts');
const events = read('src/audio/coreProductEvents.ts');
const snapshot = read('src/audio/coreProductSnapshot.ts');
const assets = read('src/audio/coreProductAssets.ts');
const generatedSchema = read('src/audio/generated/kesshoProductSchema.ts');
const worklet = read('public/worklets/kessho-core-product.worklet.js');
const manifest = read('scripts/kessho-core-build-manifest.mjs');

for (const token of [
  'updateParams(sliderState: Record<string, unknown>): void',
  'this.runtime.loadSnapshot(encodeCoreProductSnapshot(snapshot));',
  'latestProductSnapshot: CoreProductSnapshot | null',
  'applyLatestSnapshotUpdate(): void',
  'applySnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot): boolean',
  'MAX_SNAPSHOT_DIFF_EVENTS',
  'assetRefsChanged(previous.assetRefs, next.assetRefs)',
  'appendSourceParamDiffs(events, previous.sources, next.sources)',
  'appendSequencerLaneDiffs(events, \'synth\', previous.synthLanes, next.synthLanes)',
  'createCoreProductParamEvent(',
  'createCoreProductSourcePresetEvent(',
  'registerAsset(asset: DecodedCoreProductAsset): void',
  'ensureDefaultPianoAsset(): Promise<void>',
  'ensurePianoAssetsForState(): Promise<void>',
  'ensurePianoAssetForMidi(midiNote: number): Promise<void>',
  'getCoreProductPianoPreloadAssetDescriptors(this.latestSliderState)',
  'getCoreProductPianoAssetIdForMidi(midiNote)',
  'ensureDefaultSoundscapeAsset(): Promise<void>',
  'ensureSoundscapeAssetsForState(): Promise<void>',
  'getCoreProductSoundscapeAssetDescriptorsForState(this.latestSliderState)',
  'ensureDefaultAssetsForState(): Promise<void>',
  'decodeCoreProductAsset(',
  'birds2Enabled',
  'insects2Enabled',
  'CORE_PRODUCT_ASSET_FLAGS.piano',
  'CORE_PRODUCT_ASSET_FLAGS.loop | CORE_PRODUCT_ASSET_FLAGS.soundscape',
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
  'synthEuclidEvolveConfigs: this.normalizeEvolveConfigs(configs)',
  'drumEuclidEvolveConfigs: this.normalizeEvolveConfigs(configs)',
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
  'createPerfSnapshot(telemetry:',
  'telemetryRngState',
  'rngSeed: this.latestTelemetry.rngSeed',
  'rngState: this.latestTelemetry.rngState',
]) {
  assert(host.includes(token), `core-product host is missing ${token}`);
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
  'assetRefs: number[]',
  'getCoreProductSoundscapeAssetDescriptorsForState(sliderState).map((asset) => asset.assetId)',
  'u32(snapshot.assetRefs[i] ?? 0)',
  'getTransportMetrics',
  'rngSeedFromState',
  'rngStateFromState',
  'hashSeedMaterial',
  'KESSHO_PRODUCT_SOURCE_PRESETS',
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
  'dynamicsEndCompProgramRelease: number',
  'sidechainEnabled: boolean',
  'sidechainPad1Target: number',
  'saturationDrive: number',
  'u32(bool(snapshot.fx.spectralFreezeEnabled))',
  'f32(snapshot.fx.spectralFreezePhaseJitter)',
  'u32(bool(snapshot.fx.dynamicsEnabled))',
  'f32(snapshot.fx.dynamicsEndCompProgramRelease)',
  'u32(bool(snapshot.fx.sidechainEnabled))',
  'f32(snapshot.fx.sidechainReverbTarget)',
  'f32(snapshot.master.saturationDrive)',
]) {
  assert(snapshot.includes(token), `core-product snapshot is missing ${token}`);
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
]) {
  assert(events.includes(token), `core-product events are missing ${token}`);
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
  "this.resolve('kessho_product_copy_telemetry')",
  'copyTelemetry(this.engine, this.telemetryPtr) !== 1',
  "message.type === 'request-telemetry'",
  "this.port.postMessage({ type: 'telemetry', telemetry });",
  'this.heapF32.buffer !== this.exports.memory.buffer',
  'workletOutputPeak: this.lastOutputPeak',
  "getStem: this.resolve('kessho_product_get_stem')",
  'workletStemPeaks: this.lastStemPeaks',
  'workletPadStemPeak: this.lastStemPeaks[1] || 0',
  'runtimeWalkValues[controlId] = value;',
  'const TELEMETRY_BYTES = 324;',
  'rngSeed: this.view.getUint32(ptr + 288, true)',
  'rngState: this.view.getUint32(ptr + 292, true)',
  'sourcePresetIds.push(this.view.getUint32(ptr + 296 + index * 4, true));',
]) {
  assert(worklet.includes(token), `core-product worklet is missing ${token}`);
}

assert(
  manifest.includes("'kessho_product_copy_telemetry'"),
  'WASM manifest must export kessho_product_copy_telemetry',
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
  "delayATimeLeftMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteL', '1/4', transport.bpm), 10, 5000)",
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
  assert(snapshot.includes(token), `core-product snapshot is missing ${token}`);
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

console.log('Kessho Product web host checks passed');
