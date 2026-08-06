import { type SliderMode, type SliderState } from '../state';

/**
 * The mode surface exposed by a shared Slider.  Keep this table static: it is
 * read from pointer handlers and React render paths, so lookups must stay O(1)
 * and must not enumerate the state object.
 */
export type SliderCapability = 'single' | 'walk-only' | 'dual';

const WALK_ONLY_KEYS = [
  'waterIntensity', 'waterDistance', 'waterHardDropBaseFreq', 'waterWaterDropBaseFreq',
  'waterDropSize', 'waterHardness', 'waterGlassThickness', 'waterHardDropRate',
  'waterHardDropLPF', 'waterHardDropTone', 'waterWaterDropRate', 'waterWaterDropLPF',
  'waterBubblingRate', 'waterBubblingLPF', 'waterLayerHardDrops', 'waterLayerWaterDrops',
  'waterLayerTurbulence', 'waterLayerBubbling', 'waterLayerSurf', 'waterLayerChannels',
  'waterDensityHardSend', 'waterDensityWaterSend', 'waterDensityBubbleSend',
  'waterDensityFeedback', 'waterDensityTone', 'waterDensityRing', 'waterDensityWet',
  'waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfFoamBright',
  'waterSurfProximity', 'waterSurfDepth', 'waterSurfBody', 'waterSurfSpray',
  'waterChannelsMorph', 'waterChannelsSpeed', 'insectsDensity', 'insectsTemperature',
  'insectsDistance', 'insectsProximity', 'insectsAntiphony', 'insectsClickRate',
  'insectsMotion', 'insects2Density', 'insects2Temperature', 'insects2Distance',
  'insects2Proximity', 'insects2Antiphony', 'insects2ClickRate', 'insects2Motion',
] as const satisfies readonly (keyof SliderState)[];

/** Intentionally scalar controls and controls without a Product range target. */
const SINGLE_ONLY_KEYS = [
  'lead1MorphSpeed', 'lead2MorphSpeed', 'pad2MorphSpeed', 'padMorphSpeed', 'phraseLength',
  'randomWalkSpeed', 'randomness', 'sequencerMasterBPM',
  'transportBarsPerPhrase', 'transportBeatsPerBar',
] as const satisfies readonly (keyof SliderState)[];

/** Shared literal Slider keys with continuously variable Product ranges. */
const DUAL_KEYS = [
  'chordRate', 'damping', 'delayACrossFeedFilter', 'delayADuck', 'delayAFeedback',
  'delayAFilter', 'delayAGranularSend', 'delayAMix', 'delayAModDepth', 'delayAModRate',
  'delayAReverbSend', 'delayAToBSend', 'delayAWidth', 'delayBGranularSend', 'delayBSpread',
  'delayBTapeHead1Level', 'delayBTapeHead1Pan', 'delayBTapeHead2Level', 'delayBTapeHead2Pan',
  'delayBTapeHead3Level', 'delayBTapeHead3Pan', 'delayBTapeHead4Level', 'delayBTapeHead4Pan',
  'delayBToASend', 'delayBWarpIntensity', 'degradeSample1Send', 'degradeSample2Send',
  'detune', 'drumDelayBSend', 'drumDelayNoteL',
  'drumDelayNoteR', 'drumLevel', 'drumReverbSend', 'filterCutoff', 'filterKeyTracking',
  'filterQ', 'filterResonance', 'filterSlope', 'granularDelayActivity', 'granularDelayFilter',
  'granularDelayMix', 'granularDelayRepeats', 'granularDelayReverbSend', 'granularDelayTime',
  'granularDelayVibrato', 'granularLevel', 'granularReverbSend', 'hardness', 'lead1DelayASend',
  'granularChordBias', 'granularCloudMacro', 'granularDelayBSend', 'granularDiffusion',
  'granularDrumSend', 'granularFeedback', 'granularFeedbackLPF', 'granularInsectsSend',
  'granularLead1Send', 'granularLead2Send', 'granularMacroActivity', 'granularMacroChaos',
  'granularMacroComplexity', 'granularMacroDarkness', 'granularMacroTexture', 'granularMaxGrains',
  'granularOutputLPF', 'granularPad1Send', 'granularPad2Send', 'granularPitchMacro',
  'granularSample1Send', 'granularSample2Send',
  'granularReverbLPF', 'granularSprayMacro', 'granularWaterSend', 'granularWavesSend',
  'granularNatureSend',
  'lead1Density', 'lead1DiffuseSend', 'lead1Distance', 'lead1Level', 'lead1Morph', 'lead1Octave',
  'lead1OctaveRange', 'lead1PostLPF', 'lead1PostLPFKeyTracking', 'lead1ReverbSend',
  'lead1StereoWidth', 'lead1VibratoDepth', 'lead1VibratoRate', 'lead1Glide',
  'lead2DelayASend', 'lead2DiffuseSend', 'lead2Distance', 'lead2Level',
  'lead2Morph', 'lead2PostLPF', 'lead2PostLPFKeyTracking', 'lead2ReverbSend', 'lead2StereoWidth',
  'lead2VibratoDepth', 'lead2VibratoRate', 'lead2Glide',
  'leadGlide', 'leadVibratoDepth', 'leadVibratoRate', 'masterVolume', 'pad1ReverbSend',
  'pad2Attack', 'pad2Decay', 'pad2DiffuseSend', 'pad2Distance', 'pad2FilterBCutoff', 'pad2FilterBQ',
  'pad2FilterBResonance', 'pad2FilterCutoff', 'pad2FilterKeyTracking', 'pad2FilterQ',
  'pad2FilterResonance', 'pad2FilterSlope', 'pad2FoldAmount', 'pad2Hardness', 'pad2Level',
  'pad2Lfo1Depth', 'pad2Lfo1Rate', 'pad2Lfo2Depth', 'pad2Lfo2Rate', 'pad2ModEnvAttack',
  'pad2ModEnvDecay', 'pad2ModEnvDepth', 'pad2ModEnvRelease', 'pad2ModEnvSustain', 'pad2Morph',
  'pad2NoiseLevel', 'pad2OscADetune', 'pad2OscALevel', 'pad2OscAOctave', 'pad2OscBDetune',
  'pad2OscBLevel', 'pad2OscBOctave', 'pad2OscMix', 'pad2PostLPF', 'pad2Presence', 'pad2Release',
  'pad2ReverbSend', 'pad2StereoWidth', 'pad2SubLevel', 'pad2SubOctave', 'pad2Sustain', 'pad2Warmth', 'pad2Hold',
  'padDiffuseSend', 'padDistance', 'padFilterBCutoff', 'padFilterBQ', 'padFilterBResonance',
  'padFoldAmount', 'padLfo1Depth', 'padLfo1Rate', 'padLfo2Depth', 'padLfo2Rate', 'padModEnvAttack',
  'padModEnvDecay', 'padModEnvDepth', 'padModEnvRelease', 'padModEnvSustain', 'padMorph',
  'padNoiseLevel', 'padOscADetune', 'padOscALevel', 'padOscAOctave', 'padOscBDetune', 'padOscBLevel',
  'padOscBOctave', 'padOscMix', 'padPostLPF', 'padStereoWidth', 'padSubLevel', 'padSubOctave',
  'predelay', 'presence', 'reverbAirAbsorption', 'reverbBloom', 'reverbChorusDepth',
  'reverbChorusRate', 'reverbCrossFeed', 'reverbCrossoverFreq', 'reverbDampHigh', 'reverbDampLow',
  'reverbDecay', 'reverbDiffusion', 'reverbEarlyReflections', 'reverbErLpFreq', 'reverbInputTone',
  'reverbLevel', 'reverbModulation', 'reverbPreCompAttackMs', 'reverbPreCompKnee',
  'reverbPreCompMakeup', 'reverbPreCompRatio', 'reverbPreCompReleaseMs', 'reverbPreCompThreshold',
  'reverbReverse', 'reverbReverseLength', 'reverbShimmer', 'reverbShimmerFeedback', 'reverbShimmerPitch',
  'reverbSize', 'reverbSlowModDepth', 'reverbSlowModRate', 'reverbTransientSmooth', 'reverbWarp',
  'spectralFreezeDiffusion', 'spectralFreezeInputSensitivity', 'spectralFreezeMix',
  'spectralFreezePosition', 'spectralFreezeRefresh', 'spectralFreezeReverbCrossfade',
  'spectralFreezeStretchSpeed', 'spectralFreezeSustain', 'spectralFreezeTone',
  'spectralFreezeWidth', 'synthHold', 'synthAttack', 'synthDecay', 'synthLevel',
  'synthOctave', 'synthRelease', 'synthSustain', 'voicingSpread', 'warmth', 'waveSpread', 'width',
] as const satisfies readonly (keyof SliderState)[];

const EXPLICIT_CAPABILITIES: Record<string, SliderCapability> = Object.freeze({
  ...Object.fromEntries(WALK_ONLY_KEYS.map((key) => [key, 'walk-only'])),
  ...Object.fromEntries(SINGLE_ONLY_KEYS.map((key) => [key, 'single'])),
  ...Object.fromEntries(DUAL_KEYS.map((key) => [key, 'dual'])),
}) as Record<string, SliderCapability>;

const DYNAMIC_SINGLE_KEYS = new Set<string>([
  'sample1MaxVoices', 'sample2MaxVoices',
  'granularV1Slice', 'granularV2Slice', 'granularV3Slice', 'granularV4Slice',
  'oceanSliceDuration', 'oceanSliceDensity', 'oceanFilterCutoff', 'oceanFilterResonance',
  'birdsSliceDuration', 'birdsSliceDensity', 'birds2SliceDuration', 'birds2SliceDensity',
  'frogsSliceDuration', 'frogsSliceDensity',
  'padTensionValue', 'leadTensionValue', 'synthEuclidTensionValue',
  'granularTensionValue', 'reverbTensionValue', 'drumTensionValue',
]);

const WALK_ONLY_KEY_SET = new Set<string>(WALK_ONLY_KEYS);

/**
 * O(1) capability lookup. Dynamic Slider families are intentionally matched
 * only after the static map, keeping normal literal paths to one Map lookup.
 * Unknown parameters stay scalar until the generated inventory gives them an
 * explicit entry or a bounded family rule.
 */
export function getSliderCapability(key: string): SliderCapability | undefined {
  const explicit = EXPLICIT_CAPABILITIES[key];
  if (explicit) return explicit;
  if (DYNAMIC_SINGLE_KEYS.has(key)) return 'single';
  if (WALK_ONLY_KEY_SET.has(key)) return 'walk-only';
  if (/^dynamicsSample[12]Bus$/.test(key)) return 'single';
  if (/^drum(?:Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)MorphSpeed$/.test(key)) return 'single';
  // Euclidean lane policy/range fields use the sequencer-content architecture,
  // not generic Product parameter automation.
  if (/^drumEuclid/.test(key)) return 'single';
  if (/^lead[12](?:Attack|Decay|Sustain|Hold|Release)$/.test(key)) return 'dual';
  // Earth/water/nature/insect pages use generated key arrays rather than
  // literal sliderProps calls. Their non-walk controls are Product ranges.
  if (/^(?:earth|ocean|birds2?|frogs|nature(?:[1-4])?|water|insects)/.test(key)) return 'dual';
  if (/^sample[12](?:AttackMs|DecayMs|Sustain|HoldMs|ReleaseMs|Level|Distance|PostLPF|StereoWidth|DiffuseSend|ReverbSend|DelayASend|DelayBSend)$/.test(key)) return 'dual';
  if (/^granularV[1-4](?:Speed|ScanRate|Pitch|Attack|Decay|Blur|GrainOct|Spray|PositionSpray|TimingSpray|Lookback|WriteGuard|PitchSpread|PitchJitter|PitchQuantize|ReverseChance|Bloom|Glide|LoopCrossfade|Density|GrainSize|Pan|Gain|PosLFORate|PosLFODepth|PanLFORate|StereoSpread|ReverseLFORate|WriteFollow|RecordLFORate)$/.test(key)) return 'dual';
  // Drum voice and generated Dynamics schemas are all continuous Product keys.
  if (/^(?:drum|dynamics)[A-Za-z0-9]+$/.test(key)) return 'dual';
  // Unknown keys fail the generated audit and are rendered as scalar controls
  // by callers until they receive an explicit registry entry.
  return undefined;
}

export function isSliderModeAllowed(key: string, mode: SliderMode): boolean {
  const capability = getSliderCapability(key);
  if (capability === 'single') return mode === 'single';
  if (capability === 'walk-only') return mode === 'single' || mode === 'walk';
  if (capability === 'dual') return true;
  return mode === 'single';
}

export function normalizeSliderMode(key: string, mode?: SliderMode): SliderMode | undefined {
  if (!mode || mode === 'single') return mode;
  const capability = getSliderCapability(key);
  if (!capability) return undefined;
  if (capability === 'single') return undefined;
  if (capability === 'walk-only' && mode === 'sampleHold') return 'walk';
  return mode;
}

export function isSliderRangeCapable(key: keyof SliderState | string): boolean {
  const capability = getSliderCapability(String(key));
  return capability === 'dual' || capability === 'walk-only';
}

export const SINGLE_ONLY_SLIDER_KEYS: ReadonlySet<string> = new Set(SINGLE_ONLY_KEYS);
export const WALK_ONLY_DUAL_KEYS: ReadonlySet<string> = new Set(WALK_ONLY_KEYS);
export const SLIDER_CAPABILITIES: Readonly<Record<string, SliderCapability>> = EXPLICIT_CAPABILITIES;
