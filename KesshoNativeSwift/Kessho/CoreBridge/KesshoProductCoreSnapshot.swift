import Foundation

#if canImport(KesshoProductSchema)
import KesshoProductSchema
#endif

public enum KesshoProductCoreSnapshotEncoder {
    public static let byteCount = 12644
    public static let sourceByteCount = 1200

    private static let laneByteCount = 84
    private static let sequencerByteCount = 4 + 16 * laneByteCount

    public static func encode(_ state: SliderState = .defaultState, running: Bool = false) -> Data {
        var writer = SnapshotWriter(capacity: byteCount)
        let snapshot = makeSnapshot(from: state, running: running)

        writer.u32(KesshoProductSchema.version)
        writer.u32(KesshoProductSchema.hash)
        writer.u32(snapshot.transport.running ? 1 : 0)
        writer.f32(snapshot.transport.bpm)
        writer.u32(snapshot.transport.beatsPerBar)
        writer.u32(snapshot.transport.barsPerPhrase)
        writer.f32(snapshot.transport.swing)
        writer.u32(0)
        writer.f32(snapshot.harmony.rootMidi)
        writer.u32(snapshot.harmony.scaleId)
        writer.f32(snapshot.harmony.tension)
        writer.u32(snapshot.harmony.chordMode)
        writer.u32(snapshot.harmony.voicingMode)
        writer.u32(0)

        for source in snapshot.sources {
            writer.u32(source.enabled ? 1 : 0)
            writer.u32(source.sourceId)
            writer.u32(source.presetId)
            writer.u32(source.assetId)
            writer.f32(source.level)
            writer.f32(source.morph)
            writer.f32(source.distance)
            writer.f32(source.expression)
            writer.f32(source.dryGain)
            writer.f32(source.reverbSend)
            writer.f32(source.delayASend)
            writer.f32(source.delayBSend)
            writer.f32(source.granularSend)
            writer.f32(source.postLpfHz)
            writer.f32(source.stereoWidth)
            writer.f32(source.postLpfKeyTracking)
            // PATCH_BRIDGE_RETIREMENT: exact Pad/Lead/Drum arrays are serialized only for ABI compatibility.
            writer.u32(min(source.exactPadParamCount, KesshoProductSchema.padParamCount))
            for index in 0..<Int(KesshoProductSchema.padParamCount) {
                writer.f32(index < source.exactPadParams.count ? source.exactPadParams[index] : 0)
            }
            writer.u32(min(source.exactLeadParamCount, KesshoProductSchema.leadParamCount))
            for index in 0..<Int(KesshoProductSchema.leadParamCount) {
                writer.f32(index < source.exactLeadParams.count ? source.exactLeadParams[index] : 0)
            }
            writer.u32(min(source.exactDrumParamCount, KesshoProductSchema.drumParamCount))
            for index in 0..<Int(KesshoProductSchema.drumParamCount) {
                writer.f32(index < source.exactDrumParams.count ? source.exactDrumParams[index] : 0)
            }
            for index in 0..<Int(KesshoProductSchema.drumVoiceCount) {
                writer.u32(index < source.drumVoicePresetAIds.count ? source.drumVoicePresetAIds[index] : 0)
            }
            for index in 0..<Int(KesshoProductSchema.drumVoiceCount) {
                writer.u32(index < source.drumVoicePresetBIds.count ? source.drumVoicePresetBIds[index] : 0)
            }
            for index in 0..<Int(KesshoProductSchema.drumVoiceCount) {
                writer.f32(index < source.drumVoiceMorphs.count ? min(max(source.drumVoiceMorphs[index], 0), 1) : 0)
            }
            writer.f32(source.holdSeconds)
        }

        writeSequencer(snapshot.synthLanes, writer: &writer)
        writeSequencer(snapshot.drumLanes, writer: &writer)

        writer.u32(snapshot.journey.enabled ? 1 : 0)
        writer.f32(snapshot.journey.morphPhase)
        writer.f32(snapshot.journey.morphRateBars)
        writer.u32(0)
        writer.f32(snapshot.fx.granularMix)
        writer.u32(snapshot.fx.granularEnabled ? 1 : 0)
        writer.u32(snapshot.fx.granularFreeze ? 1 : 0)
        writer.u32(snapshot.fx.granularFreezeWithFeedback ? 1 : 0)
        writer.f32(snapshot.fx.granularFeedback)
        writer.f32(snapshot.fx.granularFeedbackLpfHz)
        writer.f32(snapshot.fx.granularBufferSeconds)
        writer.u32(snapshot.fx.granularGrainShape)
        writer.f32(snapshot.fx.granularBusDiffusion)
        writer.f32(snapshot.fx.granularTimingRandomness)
        writer.f32(snapshot.fx.granularChordBias)
        writer.f32(snapshot.fx.granularLegacyJitterMs)
        writer.f32(snapshot.fx.granularLegacyProbability)
        writer.u32(snapshot.fx.granularLegacyPitchMode)
        writer.f32(snapshot.fx.granularLegacyPitchSpread)
        writer.u32(snapshot.fx.granularLegacyMaxGrains)
        writer.f32(snapshot.fx.granularLegacyFeedback)
        for index in 0..<4 {
            let voice = index < snapshot.fx.granularVoices.count
                ? snapshot.fx.granularVoices[index]
                : granularVoice(index + 1, state: .defaultState)
            writeGranularVoice(voice, writer: &writer)
        }
        writer.u32(snapshot.fx.delayAEnabled ? 1 : 0)
        writer.f32(snapshot.fx.delayATimeLeftMs)
        writer.f32(snapshot.fx.delayATimeRightMs)
        writer.f32(snapshot.fx.delayAFeedback)
        writer.f32(snapshot.fx.delayAMix)
        writer.f32(snapshot.fx.delayAFilterHz)
        writer.u32(snapshot.fx.delayAFilterType)
        writer.f32(snapshot.fx.delayAModRateHz)
        writer.f32(snapshot.fx.delayAModDepthMs)
        writer.u32(snapshot.fx.delayAPingPong ? 1 : 0)
        writer.f32(snapshot.fx.delayADuck)
        writer.f32(snapshot.fx.delayAWidth)
        writer.f32(snapshot.fx.delayACrossFeedFilterHz)
        writer.u32(snapshot.fx.delayBEnabled ? 1 : 0)
        writer.f32(snapshot.fx.delayBActivity)
        writer.f32(snapshot.fx.delayBRepeats)
        writer.f32(snapshot.fx.delayBBaseTimeMs)
        writer.f32(snapshot.fx.delayBTone)
        writer.f32(snapshot.fx.delayBVibrato)
        writer.f32(snapshot.fx.delayBMix)
        writer.u32(snapshot.fx.delayBSpaceMode)
        writer.u32(snapshot.fx.delayBPattern)
        writer.u32(snapshot.fx.delayBWarp)
        writer.f32(snapshot.fx.delayBWarpIntensity)
        writer.f32(snapshot.fx.delayBSpread)
        writer.f32(snapshot.fx.reverbMix)
        writer.u32(snapshot.fx.reverbType)
        writer.u32(snapshot.fx.reverbQuality)
        writer.f32(snapshot.fx.reverbDecay)
        writer.f32(snapshot.fx.reverbSize)
        writer.f32(snapshot.fx.reverbDamping)
        writer.f32(snapshot.fx.reverbDiffusion)
        writer.f32(snapshot.fx.reverbModulation)
        writer.f32(snapshot.fx.reverbPredelayMs)
        writer.f32(snapshot.fx.reverbWidth)
        writer.f32(snapshot.fx.reverbShimmerAmount)
        writer.f32(snapshot.fx.reverbShimmerPitch)
        writer.f32(snapshot.fx.reverbSlowRateHz)
        writer.f32(snapshot.fx.reverbSlowDepth)
        writer.f32(snapshot.fx.reverbReverseAmount)
        writer.f32(snapshot.fx.reverbReverseLengthSec)
        writer.f32(snapshot.fx.reverbChorusRateHz)
        writer.f32(snapshot.fx.reverbChorusDepth)
        writer.u32(snapshot.fx.reverbModCharacter)
        writer.f32(snapshot.fx.reverbDampLow)
        writer.f32(snapshot.fx.reverbDampHigh)
        writer.f32(snapshot.fx.reverbCrossoverHz)
        writer.f32(snapshot.fx.reverbInputTone)
        writer.f32(snapshot.fx.reverbShimmerFeedback)
        writer.f32(snapshot.fx.reverbWarp)
        writer.f32(snapshot.fx.reverbCrossFeed)
        writer.f32(snapshot.fx.reverbEarlyReflections)
        writer.f32(snapshot.fx.reverbAirAbsorption)
        writer.u32(snapshot.fx.reverbSaturationMode)
        writer.f32(snapshot.fx.reverbTransientSmooth)
        writer.f32(snapshot.fx.reverbErLpFreq)
        writer.f32(snapshot.fx.reverbPreCompThreshold)
        writer.f32(snapshot.fx.reverbPreCompKnee)
        writer.f32(snapshot.fx.reverbPreCompRatio)
        writer.f32(snapshot.fx.reverbPreCompAttackMs)
        writer.f32(snapshot.fx.reverbPreCompReleaseMs)
        writer.f32(snapshot.fx.reverbPreCompMakeup)
        writer.f32(snapshot.fx.spectralFreezeMix)
        writer.u32(snapshot.fx.spectralFreezeEnabled ? 1 : 0)
        writer.u32(snapshot.fx.spectralFreezeActive ? 1 : 0)
        writer.u32(snapshot.fx.spectralFreezeSlushy ? 1 : 0)
        writer.f32(snapshot.fx.spectralFreezeSpeed)
        writer.f32(snapshot.fx.spectralFreezeDecay)
        writer.f32(snapshot.fx.spectralFreezePhaseJitter)
        writer.f32(snapshot.fx.dynamicsDrive)
        writer.u32(snapshot.fx.dynamicsEnabled ? 1 : 0)
        writer.u32(snapshot.fx.dynamicsCharacterEnabled ? 1 : 0)
        writer.u32(snapshot.fx.dynamicsCharacterMode)
        writer.f32(snapshot.fx.dynamicsCharacterMix)
        writer.f32(snapshot.fx.dynamicsCharacterAge)
        writer.f32(snapshot.fx.dynamicsCharacterBias)
        writer.f32(snapshot.fx.dynamicsCharacterLpgAmount)
        writer.f32(snapshot.fx.dynamicsCharacterResonance)
        writer.f32(snapshot.fx.dynamicsCharacterStereo)
        writer.f32(snapshot.fx.dynamicsCharacterEnvFollow)
        writer.f32(snapshot.fx.dynamicsCharacterDepth)
        writer.f32(snapshot.fx.dynamicsCharacterRate)
        writer.f32(snapshot.fx.dynamicsCharacterDamp)
        writer.u32(snapshot.fx.dynamicsDegradeEnabled ? 1 : 0)
        writer.f32(snapshot.fx.dynamicsDegradeMix)
        writer.f32(snapshot.fx.dynamicsDegradeAge)
        writer.f32(snapshot.fx.dynamicsDegradeGeneration)
        writer.f32(snapshot.fx.dynamicsDegradeAlias)
        writer.f32(snapshot.fx.dynamicsDegradeWow)
        writer.f32(snapshot.fx.dynamicsDegradeFlutter)
        writer.f32(snapshot.fx.dynamicsDegradeDrift)
        writer.f32(snapshot.fx.dynamicsDegradeWobbleSpeed)
        writer.f32(snapshot.fx.dynamicsDegradeTone)
        writer.f32(snapshot.fx.dynamicsDegradeHp)
        writer.f32(snapshot.fx.dynamicsDegradeLp)
        writer.f32(snapshot.fx.dynamicsDegradeNoise)
        writer.f32(snapshot.fx.dynamicsDegradeSaturation)
        writer.f32(snapshot.fx.dynamicsDegradeCorrosion)
        writer.f32(snapshot.fx.dynamicsModSlowWow)
        writer.f32(snapshot.fx.dynamicsModSlowFlutter)
        writer.f32(snapshot.fx.dynamicsModSlowLp)
        writer.f32(snapshot.fx.dynamicsModSlowWet)
        writer.f32(snapshot.fx.dynamicsModSlowDropout)
        writer.f32(snapshot.fx.dynamicsModSlowAlias)
        writer.f32(snapshot.fx.dynamicsModFlutterWow)
        writer.f32(snapshot.fx.dynamicsModFlutterFlutter)
        writer.f32(snapshot.fx.dynamicsModFlutterLp)
        writer.f32(snapshot.fx.dynamicsModFlutterWet)
        writer.f32(snapshot.fx.dynamicsModFlutterDropout)
        writer.f32(snapshot.fx.dynamicsModFlutterAlias)
        writer.f32(snapshot.fx.dynamicsModRandomWow)
        writer.f32(snapshot.fx.dynamicsModRandomFlutter)
        writer.f32(snapshot.fx.dynamicsModRandomLp)
        writer.f32(snapshot.fx.dynamicsModRandomWet)
        writer.f32(snapshot.fx.dynamicsModRandomDropout)
        writer.f32(snapshot.fx.dynamicsModRandomAlias)
        writer.f32(snapshot.fx.dynamicsModEnvWow)
        writer.f32(snapshot.fx.dynamicsModEnvFlutter)
        writer.f32(snapshot.fx.dynamicsModEnvLp)
        writer.f32(snapshot.fx.dynamicsModEnvWet)
        writer.f32(snapshot.fx.dynamicsModEnvDropout)
        writer.f32(snapshot.fx.dynamicsModEnvAlias)
        writer.f32(snapshot.fx.dynamicsModNoiseWow)
        writer.f32(snapshot.fx.dynamicsModNoiseFlutter)
        writer.f32(snapshot.fx.dynamicsModNoiseLp)
        writer.f32(snapshot.fx.dynamicsModNoiseWet)
        writer.f32(snapshot.fx.dynamicsModNoiseDropout)
        writer.f32(snapshot.fx.dynamicsModNoiseAlias)
        writer.u32(snapshot.fx.dynamicsSaturationEnabled ? 1 : 0)
        writer.u32(snapshot.fx.dynamicsSaturationMode)
        writer.f32(snapshot.fx.dynamicsSaturationDrive)
        writer.f32(snapshot.fx.dynamicsSaturationTone)
        writer.f32(snapshot.fx.dynamicsSaturationBias)
        writer.u32(snapshot.fx.dynamicsEndCompEnabled ? 1 : 0)
        writer.f32(snapshot.fx.dynamicsEndCompThreshold)
        writer.f32(snapshot.fx.dynamicsEndCompKnee)
        writer.f32(snapshot.fx.dynamicsEndCompRatio)
        writer.f32(snapshot.fx.dynamicsEndCompAttackMs)
        writer.f32(snapshot.fx.dynamicsEndCompReleaseMs)
        writer.f32(snapshot.fx.dynamicsEndCompMakeup)
        writer.f32(snapshot.fx.dynamicsEndCompMix)
        writer.f32(snapshot.fx.dynamicsEndCompDetectorHp)
        writer.f32(snapshot.fx.dynamicsEndCompDetectorTilt)
        writer.f32(snapshot.fx.dynamicsEndCompAutoMakeup)
        writer.f32(snapshot.fx.dynamicsEndCompProgramRelease)
        writer.u32(snapshot.fx.sidechainEnabled ? 1 : 0)
        writer.u32(snapshot.fx.sidechainKeyA)
        writer.u32(snapshot.fx.sidechainKeyB)
        writer.f32(snapshot.fx.sidechainKeyAWeight)
        writer.f32(snapshot.fx.sidechainKeyBWeight)
        writer.f32(snapshot.fx.sidechainAmount)
        writer.f32(snapshot.fx.sidechainThreshold)
        writer.f32(snapshot.fx.sidechainRatio)
        writer.f32(snapshot.fx.sidechainKnee)
        writer.f32(snapshot.fx.sidechainAttackMs)
        writer.f32(snapshot.fx.sidechainHoldMs)
        writer.f32(snapshot.fx.sidechainReleaseMs)
        writer.f32(snapshot.fx.sidechainMakeup)
        writer.f32(snapshot.fx.sidechainMix)
        writer.f32(snapshot.fx.sidechainCurve)
        writer.f32(snapshot.fx.sidechainDetectorHp)
        writer.f32(snapshot.fx.sidechainDetectorLp)
        writer.f32(snapshot.fx.sidechainPad1Target)
        writer.f32(snapshot.fx.sidechainPad2Target)
        writer.f32(snapshot.fx.sidechainLead1Target)
        writer.f32(snapshot.fx.sidechainLead2Target)
        writer.f32(snapshot.fx.sidechainPianoTarget)
        writer.f32(snapshot.fx.sidechainGranularTarget)
        writer.f32(snapshot.fx.sidechainDelayATarget)
        writer.f32(snapshot.fx.sidechainDelayBTarget)
        writer.f32(snapshot.fx.sidechainReverbTarget)
        writer.f32(snapshot.routing.delayAToDelayB)
        writer.f32(snapshot.routing.delayBToDelayA)
        writer.f32(snapshot.routing.delayToReverb)
        writer.f32(snapshot.routing.granularToReverb)
        writer.f32(snapshot.routing.delayAToGranular)
        writer.f32(snapshot.routing.delayBToGranular)
        writer.f32(snapshot.routing.delayBToReverb)
        writer.f32(0)
        writer.f32(snapshot.master.gain)
        writer.f32(snapshot.master.limiterCeilingDb)
        writer.u32(snapshot.master.saturationMode)
        writer.f32(snapshot.master.saturationDrive)
        writer.f32(snapshot.master.saturationTone)
        writer.u32(snapshot.rng.seed)
        writer.u32(snapshot.rng.state)
        writer.f32(snapshot.evolution.amount)
        writer.u32(snapshot.evolution.state)

        for index in 0..<32 {
            writer.u32(index < snapshot.assetRefs.count ? snapshot.assetRefs[index] : 0)
        }
        for _ in 0..<32 {
            writer.u32(0)
        }

        precondition(writer.count == byteCount, "Kessho Product snapshot encoder wrote \(writer.count) bytes; expected \(byteCount)")
        return writer.data
    }

    public static func validateEncodedSnapshot(_ data: Data) -> Bool {
        guard data.count == byteCount else {
            return false
        }
        return data.withUnsafeBytes { rawBuffer in
            guard let base = rawBuffer.baseAddress else {
                return false
            }
            let version = base.loadUnaligned(fromByteOffset: 0, as: UInt32.self).littleEndian
            let hash = base.loadUnaligned(fromByteOffset: 4, as: UInt32.self).littleEndian
            return version == KesshoProductSchema.version && hash == KesshoProductSchema.hash
        }
    }

    private static func makeSnapshot(from state: SliderState, running: Bool) -> ProductSnapshot {
        let sources = sourceOrder.map { sourceFromState($0, state: state) }
        let delayBSendActive = sources.contains { $0.delayBSend > 0.0001 }
        let tension = clamp(state.tension, 0, 1)
        let bpm = state.transportPrimaryClock == "bpm"
            ? max(1, state.sequencerMasterBPM)
            : state.equivalentBPMFromPhraseClock

        let rngSeed = rngSeed(from: state)

        return ProductSnapshot(
            transport: ProductTransportSnapshot(
                running: running,
                bpm: Float(max(1, bpm)),
                beatsPerBar: UInt32(clampInt(state.transportBeatsPerBar, min: 1, max: 16)),
                barsPerPhrase: UInt32(clampInt(state.transportBarsPerPhrase, min: 1, max: 64)),
                swing: 0
            ),
            harmony: ProductHarmonySnapshot(
                rootMidi: Float(rootMidi(from: state)),
                scaleId: UInt32(scaleId(from: state, tension: tension)),
                tension: Float(tension),
                chordMode: UInt32(clampInt(state.chordProgressionEnabled ? 1 : 0, min: 0, max: 8)),
                voicingMode: UInt32(clampInt(Int((state.voicingSpread * 4).rounded()), min: 0, max: 8))
            ),
            sources: sources,
            synthLanes: synthLanes(from: state),
            drumLanes: drumLanes(from: state),
            journey: ProductJourneySnapshot(
                enabled: state.journeyEnabled,
                morphPhase: Float(clamp(state.journeyMorphPhase, 0, 1)),
                morphRateBars: Float(clamp(state.journeyMorphRateBars, 0.25, 128))
            ),
            fx: ProductFxSnapshot(
                granularMix: Float(state.granularEnabled ? clamp(state.granularLevel, 0, 1) : 0),
                granularEnabled: state.granularEnabled,
                granularFreeze: state.granularFreeze,
                granularFreezeWithFeedback: false,
                granularFeedback: Float(clamp(state.granularFeedback, 0, 0.85)),
                granularFeedbackLpfHz: Float(clamp(state.granularFeedbackLPF, 200, 12000)),
                granularBufferSeconds: Float(clamp(state.granularBufferSeconds, 1, 32)),
                granularGrainShape: granularShapeId(state.granularShape),
                granularBusDiffusion: Float(clamp(state.granularDiffusion, 0, 1)),
                granularTimingRandomness: Float(clamp(state.granularMacroChaos, 0, 1)),
                granularChordBias: Float(clamp(state.granularChordBias, 0, 1)),
                granularLegacyJitterMs: Float(clamp(state.granularLegacyJitter, 0, 30)),
                granularLegacyProbability: Float(clamp(state.granularLegacyProbability, 0, 1)),
                granularLegacyPitchMode: granularLegacyPitchModeId(state.granularLegacyPitchMode),
                granularLegacyPitchSpread: Float(clamp(state.granularLegacyPitchSpread, 0, 12)),
                granularLegacyMaxGrains: UInt32(clampInt(Int(state.granularLegacyMaxGrains.rounded()), min: 0, max: 128)),
                granularLegacyFeedback: Float(clamp(state.granularLegacyFeedback, 0, 0.35)),
                granularVoices: (1...4).map { granularVoice($0, state: state) },
                delayAEnabled: state.delayAEnabled,
                delayATimeLeftMs: Float(clamp(delayDivisionMs(state.drumDelayNoteL, bpm: bpm), 10, 5000)),
                delayATimeRightMs: Float(clamp(delayDivisionMs(state.drumDelayNoteR, bpm: bpm), 10, 5000)),
                delayAFeedback: Float(clamp(state.delayAFeedback, 0, 0.95)),
                delayAMix: Float(state.delayAEnabled ? clamp(state.delayAMix, 0, 1) : 0),
                delayAFilterHz: Float(clamp(state.delayAFilter, 200, 12000)),
                delayAFilterType: delayAFilterTypeId(state.delayAFilterType),
                delayAModRateHz: Float(clamp(state.delayAModRate * 5, 0, 5)),
                delayAModDepthMs: Float(clamp(state.delayAModDepth * 50, 0, 50)),
                delayAPingPong: state.delayAPingPong,
                delayADuck: Float(clamp(state.delayADuck, 0, 1)),
                delayAWidth: Float(clamp(state.delayAWidth, 0, 1)),
                delayACrossFeedFilterHz: Float(200 + clamp(state.delayACrossFeedFilter, 0, 1) * 7800),
                delayBEnabled: state.granularDelayEnabled,
                delayBActivity: Float(clamp(state.granularDelayActivity, 0, 1)),
                delayBRepeats: Float(clamp(state.granularDelayRepeats, 0, 0.85)),
                delayBBaseTimeMs: Float(clamp(delayDivisionMs(state.granularDelayTime, bpm: bpm), 20, 5000)),
                delayBTone: Float(clamp(state.granularDelayFilter, 0, 1)),
                delayBVibrato: Float(clamp(state.granularDelayVibrato, 0, 1)),
                delayBMix: Float(state.granularDelayEnabled ? clamp(state.granularDelayMix, 0, 1) : (delayBSendActive ? 1 : 0)),
                delayBSpaceMode: state.granularSpaceMode == "diffuse" ? 1 : 0,
                delayBPattern: delayBPatternId(state.delayBPattern),
                delayBWarp: delayBWarpId(state.delayBWarp),
                delayBWarpIntensity: Float(clamp(state.delayBWarpIntensity, 0, 1)),
                delayBSpread: Float(clamp(state.delayBSpread, 0, 1)),
                reverbMix: Float(state.reverbEnabled ? clamp(state.reverbLevel, 0, 1) : 0),
                reverbType: reverbTypeId(state.reverbType),
                reverbQuality: reverbQualityId(state.reverbQuality),
                reverbDecay: Float(clamp(state.reverbDecay, 0, 1)),
                reverbSize: Float(clamp(state.reverbSize, 0.5, 10)),
                reverbDamping: Float(clamp(state.damping, 0, 1)),
                reverbDiffusion: Float(clamp(state.reverbDiffusion, 0, 1)),
                reverbModulation: Float(clamp(state.reverbModulation, 0, 1)),
                reverbPredelayMs: Float(clamp(state.predelay, 0, 100)),
                reverbWidth: Float(clamp(state.width, 0, 1)),
                reverbShimmerAmount: Float(clamp(state.reverbShimmer, 0, 1)),
                reverbShimmerPitch: Float(clamp(state.reverbShimmerPitch, -24, 24)),
                reverbSlowRateHz: Float(clamp(state.reverbSlowModRate, 0.01, 0.2)),
                reverbSlowDepth: Float(clamp(state.reverbSlowModDepth, 0, 1)),
                reverbReverseAmount: Float(clamp(state.reverbReverse, 0, 1)),
                reverbReverseLengthSec: Float(clamp(state.reverbReverseLength, 0.5, 16)),
                reverbChorusRateHz: Float(clamp(state.reverbChorusRate, 0.05, 2)),
                reverbChorusDepth: Float(clamp(state.reverbChorusDepth, 0, 40)),
                reverbModCharacter: reverbModCharacterId(state.reverbModCharacter),
                reverbDampLow: Float(clamp(state.reverbDampLow, 0, 1)),
                reverbDampHigh: Float(clamp(state.reverbDampHigh, 0, 1)),
                reverbCrossoverHz: Float(clamp(state.reverbCrossoverFreq, 100, 6000)),
                reverbInputTone: Float(clamp(state.reverbInputTone, -1, 1)),
                reverbShimmerFeedback: Float(clamp(state.reverbShimmerFeedback, 0, 1)),
                reverbWarp: Float(clamp(state.reverbWarp, 0, 1)),
                reverbCrossFeed: Float(clamp(state.reverbCrossFeed, 0, 1)),
                reverbEarlyReflections: Float(clamp(state.reverbEarlyReflections, 0, 1)),
                reverbAirAbsorption: Float(clamp(state.reverbAirAbsorption, 0, 1)),
                reverbSaturationMode: reverbSaturationModeId(state.reverbSaturationMode),
                reverbTransientSmooth: Float(clamp(state.reverbTransientSmooth, 0, 1)),
                reverbErLpFreq: Float(clamp(state.reverbErLpFreq, 200, 12000)),
                reverbPreCompThreshold: Float(clamp(state.reverbPreCompThreshold, -60, 0)),
                reverbPreCompKnee: Float(clamp(state.reverbPreCompKnee, 0, 40)),
                reverbPreCompRatio: Float(clamp(state.reverbPreCompRatio, 1, 20)),
                reverbPreCompAttackMs: Float(clamp(state.reverbPreCompAttackMs, 0.1, 30)),
                reverbPreCompReleaseMs: Float(clamp(state.reverbPreCompReleaseMs, 20, 1000)),
                reverbPreCompMakeup: Float(clamp(state.reverbPreCompMakeup, 0.5, 4)),
                spectralFreezeMix: Float(clamp(state.spectralFreezeMix, 0, 1)),
                spectralFreezeEnabled: state.spectralFreezeEnabled,
                spectralFreezeActive: state.spectralFreezeActive,
                spectralFreezeSlushy: state.spectralFreezeSlushy,
                spectralFreezeSpeed: Float(clamp(state.spectralFreezeSpeed, 0, 1)),
                spectralFreezeDecay: Float(clamp(state.spectralFreezeDecay, 0, 1)),
                spectralFreezePhaseJitter: Float(clamp(state.spectralFreezePhaseJitter, 0, 1)),
                dynamicsDrive: state.dynamicsEnabled ? Float(clamp(state.dynamicsSaturationDrive, 0, 1)) : 0,
                dynamicsEnabled: state.dynamicsEnabled,
                dynamicsCharacterEnabled: state.dynamicsEnabled && state.characterEnabled,
                dynamicsCharacterMode: dynamicsCharacterModeId(state.characterMode),
                dynamicsCharacterMix: Float(clamp(state.characterMix, 0, 1)),
                dynamicsCharacterAge: Float(clamp(state.characterAge, 0, 1)),
                dynamicsCharacterBias: 0.5,
                dynamicsCharacterLpgAmount: 0.5,
                dynamicsCharacterResonance: Float(clamp(state.characterResonance, 0, 1)),
                dynamicsCharacterStereo: Float(clamp(state.characterStereo, 0, 1)),
                dynamicsCharacterEnvFollow: Float(clamp(state.characterEnvFollow, 0, 1)),
                dynamicsCharacterDepth: Float(clamp(state.characterDepth, 0, 1)),
                dynamicsCharacterRate: Float(clamp(state.characterRate, 0, 1)),
                dynamicsCharacterDamp: Float(clamp(state.characterDamp, 0, 1)),
                dynamicsDegradeEnabled: state.dynamicsEnabled && state.degradeEnabled,
                dynamicsDegradeMix: Float(clamp(state.degradeMix, 0, 1)),
                dynamicsDegradeAge: Float(clamp(state.degradeAge, 0, 1)),
                dynamicsDegradeGeneration: Float(clamp(state.degradeGeneration, 0, 1)),
                dynamicsDegradeAlias: Float(clamp(state.degradeAlias, 0, 1)),
                dynamicsDegradeWow: Float(clamp(state.degradeWow, 0, 1)),
                dynamicsDegradeFlutter: Float(clamp(state.degradeFlutter, 0, 1)),
                dynamicsDegradeDrift: Float(clamp(state.degradeDrift, 0, 1)),
                dynamicsDegradeWobbleSpeed: Float(clamp(state.degradeWobbleSpeed, 0, 1)),
                dynamicsDegradeTone: Float(clamp(state.degradeTone, 0, 1)),
                dynamicsDegradeHp: Float(clamp(state.degradeHp, 0, 1)),
                dynamicsDegradeLp: Float(clamp(state.degradeLp, 0, 1)),
                dynamicsDegradeNoise: Float(clamp(state.degradeNoise, 0, 1)),
                dynamicsDegradeSaturation: Float(clamp(state.degradeSaturation, 0, 1)),
                dynamicsDegradeCorrosion: Float(clamp(state.degradeCorrosion, 0, 1)),
                dynamicsModSlowWow: Float(clamp(state.degradeModSlowWow, 0, 1)),
                dynamicsModSlowFlutter: Float(clamp(state.degradeModSlowFlutter, 0, 1)),
                dynamicsModSlowLp: Float(clamp(state.degradeModSlowLp, 0, 1)),
                dynamicsModSlowWet: Float(clamp(state.degradeModSlowWet, 0, 1)),
                dynamicsModSlowDropout: Float(clamp(state.degradeModSlowDropout, 0, 1)),
                dynamicsModSlowAlias: Float(clamp(state.degradeModSlowAlias, 0, 1)),
                dynamicsModFlutterWow: Float(clamp(state.degradeModFlutterWow, 0, 1)),
                dynamicsModFlutterFlutter: Float(clamp(state.degradeModFlutterFlutter, 0, 1)),
                dynamicsModFlutterLp: Float(clamp(state.degradeModFlutterLp, 0, 1)),
                dynamicsModFlutterWet: Float(clamp(state.degradeModFlutterWet, 0, 1)),
                dynamicsModFlutterDropout: Float(clamp(state.degradeModFlutterDropout, 0, 1)),
                dynamicsModFlutterAlias: Float(clamp(state.degradeModFlutterAlias, 0, 1)),
                dynamicsModRandomWow: Float(clamp(state.degradeModRandomWow, 0, 1)),
                dynamicsModRandomFlutter: Float(clamp(state.degradeModRandomFlutter, 0, 1)),
                dynamicsModRandomLp: Float(clamp(state.degradeModRandomLp, 0, 1)),
                dynamicsModRandomWet: Float(clamp(state.degradeModRandomWet, 0, 1)),
                dynamicsModRandomDropout: Float(clamp(state.degradeModRandomDropout, 0, 1)),
                dynamicsModRandomAlias: Float(clamp(state.degradeModRandomAlias, 0, 1)),
                dynamicsModEnvWow: Float(clamp(state.degradeModEnvWow, 0, 1)),
                dynamicsModEnvFlutter: Float(clamp(state.degradeModEnvFlutter, 0, 1)),
                dynamicsModEnvLp: Float(clamp(state.degradeModEnvLp, 0, 1)),
                dynamicsModEnvWet: Float(clamp(state.degradeModEnvWet, 0, 1)),
                dynamicsModEnvDropout: Float(clamp(state.degradeModEnvDropout, 0, 1)),
                dynamicsModEnvAlias: Float(clamp(state.degradeModEnvAlias, 0, 1)),
                dynamicsModNoiseWow: Float(clamp(state.degradeModNoiseWow, 0, 1)),
                dynamicsModNoiseFlutter: Float(clamp(state.degradeModNoiseFlutter, 0, 1)),
                dynamicsModNoiseLp: Float(clamp(state.degradeModNoiseLp, 0, 1)),
                dynamicsModNoiseWet: Float(clamp(state.degradeModNoiseWet, 0, 1)),
                dynamicsModNoiseDropout: Float(clamp(state.degradeModNoiseDropout, 0, 1)),
                dynamicsModNoiseAlias: Float(clamp(state.degradeModNoiseAlias, 0, 1)),
                dynamicsSaturationEnabled: state.dynamicsEnabled && state.dynamicsSaturationEnabled,
                dynamicsSaturationMode: dynamicsSaturationModeId(state.dynamicsSaturationMode),
                dynamicsSaturationDrive: Float(clamp(state.dynamicsSaturationDrive, 0, 1)),
                dynamicsSaturationTone: Float(clamp(state.dynamicsSaturationTone, 0, 1)),
                dynamicsSaturationBias: Float(clamp(state.dynamicsSaturationBias, 0, 1)),
                dynamicsEndCompEnabled: state.dynamicsEnabled && state.endCompEnabled,
                dynamicsEndCompThreshold: Float(clamp(state.endCompThreshold, -60, 0)),
                dynamicsEndCompKnee: Float(clamp(state.endCompKnee, 0, 40)),
                dynamicsEndCompRatio: Float(clamp(state.endCompRatio, 1, 20)),
                dynamicsEndCompAttackMs: Float(clamp(state.endCompAttackMs, 0.1, 100)),
                dynamicsEndCompReleaseMs: Float(clamp(state.endCompReleaseMs, 20, 1500)),
                dynamicsEndCompMakeup: Float(clamp(state.endCompMakeup, 0.25, 4)),
                dynamicsEndCompMix: Float(clamp(state.endCompMix, 0, 1)),
                dynamicsEndCompDetectorHp: Float(clamp(state.endCompDetectorHp, 0, 1)),
                dynamicsEndCompDetectorTilt: Float(clamp(state.endCompDetectorTilt, 0, 1)),
                dynamicsEndCompAutoMakeup: Float(clamp(state.endCompAutoMakeup, 0, 1)),
                dynamicsEndCompProgramRelease: Float(clamp(state.endCompProgramRelease, 0, 1)),
                sidechainEnabled: state.sidechainEnabled,
                sidechainKeyA: sidechainKeyId(state.sidechainKeyA),
                sidechainKeyB: sidechainKeyId(state.sidechainKeyB),
                sidechainKeyAWeight: Float(clamp(state.sidechainKeyAWeight, 0, 1)),
                sidechainKeyBWeight: Float(clamp(state.sidechainKeyBWeight, 0, 1)),
                sidechainAmount: Float(clamp(state.sidechainAmount, 0, 1)),
                sidechainThreshold: Float(clamp(state.sidechainThreshold, -60, 0)),
                sidechainRatio: Float(clamp(state.sidechainRatio, 1, 20)),
                sidechainKnee: Float(clamp(state.sidechainKnee, 0, 40)),
                sidechainAttackMs: Float(clamp(state.sidechainAttackMs, 0.1, 100)),
                sidechainHoldMs: Float(clamp(state.sidechainHoldMs, 0, 250)),
                sidechainReleaseMs: Float(clamp(state.sidechainReleaseMs, 20, 1500)),
                sidechainMakeup: Float(clamp(state.sidechainMakeup, 0.25, 4)),
                sidechainMix: Float(clamp(state.sidechainMix, 0, 1)),
                sidechainCurve: Float(clamp(state.sidechainCurve, 0, 1)),
                sidechainDetectorHp: Float(clamp(state.sidechainDetectorHp, 0, 1)),
                sidechainDetectorLp: Float(clamp(state.sidechainDetectorLp, 0, 1)),
                sidechainPad1Target: Float(clamp(state.sidechainPad1Target, 0, 1)),
                sidechainPad2Target: Float(clamp(state.sidechainPad2Target, 0, 1)),
                sidechainLead1Target: Float(clamp(state.sidechainLead1Target, 0, 1)),
                sidechainLead2Target: Float(clamp(state.sidechainLead2Target, 0, 1)),
                sidechainPianoTarget: Float(clamp(state.sidechainPianoTarget, 0, 1)),
                sidechainGranularTarget: Float(clamp(state.sidechainGranularTarget, 0, 1)),
                sidechainDelayATarget: Float(clamp(state.sidechainDelayATarget, 0, 1)),
                sidechainDelayBTarget: Float(clamp(state.sidechainDelayBTarget, 0, 1)),
                sidechainReverbTarget: Float(clamp(state.sidechainReverbTarget, 0, 1))
            ),
            routing: ProductRoutingSnapshot(
                delayAToDelayB: Float(clamp(state.delayAToBSend, 0, 1)),
                delayBToDelayA: Float(clamp(state.delayBToASend, 0, 1)),
                delayToReverb: Float(clamp(state.delayAReverbSend, 0, 1)),
                granularToReverb: Float(clamp(state.granularDelayReverbSend, 0, 1)),
                delayAToGranular: Float(clamp(state.delayAGranularSend, 0, 1)),
                delayBToGranular: Float(clamp(state.delayBGranularSend, 0, 1)),
                delayBToReverb: Float(clamp(state.granularDelayReverbSend, 0, 1))
            ),
            master: ProductMasterSnapshot(
                gain: Float(clamp(state.masterVolume, 0, 1.5)),
                limiterCeilingDb: -0.5,
                saturationMode: dynamicsSaturationModeId(state.masterSatMode),
                saturationDrive: Float(clamp(state.masterSatDrive, 0, 1)),
                saturationTone: Float(clamp(state.masterSatTone, 0, 1))
            ),
            rng: ProductRngSnapshot(
                seed: rngSeed,
                state: state.rngState == 0 ? rngSeed : state.rngState
            ),
            evolution: ProductEvolutionSnapshot(amount: 0, state: 1),
            assetRefs: soundscapeAssetIds(from: state)
        )
    }

    private static func rngSeed(from state: SliderState) -> UInt32 {
        if state.rngSeed != 0 {
            return state.rngSeed
        }
        let material = "\(state.seedWindow):\(String(format: "%.4f", state.randomness)):\(state.rootNote)"
        var hash: UInt32 = 2_166_136_261
        for byte in material.utf8 {
            hash ^= UInt32(byte)
            hash = hash &* 16_777_619
        }
        return hash == 0 ? 1 : hash
    }

    private static func sourcePresetId(source: String, key: String, fallbackKey: String = "default") -> UInt32 {
        let normalized = normalizePresetKey(key, fallbackKey: fallbackKey)
        let fallback = normalizePresetKey(fallbackKey, fallbackKey: fallbackKey)
        if let preset = KesshoProductSchema.sourcePresets.first(where: { $0.source == source && $0.key == normalized }) {
            return preset.id
        }
        if let preset = KesshoProductSchema.sourcePresets.first(where: { $0.source == source && $0.key == fallback }) {
            return preset.id
        }
        return 0
    }

    private static func normalizePresetKey(_ key: String, fallbackKey: String) -> String {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return fallbackKey
        }
        var result = ""
        var previousWasLowercaseOrDigit = false
        for scalar in trimmed.unicodeScalars {
            if CharacterSet.uppercaseLetters.contains(scalar), previousWasLowercaseOrDigit {
                result.append("_")
            }
            let character = Character(scalar)
            if character == "-" || character == " " {
                result.append("_")
                previousWasLowercaseOrDigit = false
            } else {
                result.append(character)
                previousWasLowercaseOrDigit = CharacterSet.lowercaseLetters.contains(scalar) ||
                    CharacterSet.decimalDigits.contains(scalar)
            }
        }
        return result.lowercased()
    }

    private static func endpointPresetId(source: String, morph: Double, a: String, b: String, fallbackKey: String) -> UInt32 {
        sourcePresetId(source: source, key: clamp(morph, 0, 1) >= 0.5 ? b : a, fallbackKey: fallbackKey)
    }

    private static func defaultPresetId(for sourceId: UInt32) -> UInt32 {
        switch sourceId {
        case KesshoProductSourceId.pad1.rawValue, KesshoProductSourceId.pad2.rawValue:
            return KesshoProductSourcePresetId.padInit.rawValue
        case KesshoProductSourceId.lead1.rawValue, KesshoProductSourceId.lead2.rawValue:
            return KesshoProductSourcePresetId.leadSoftRhodes.rawValue
        case KesshoProductSourceId.drum.rawValue:
            return KesshoProductSourcePresetId.drumDefault.rawValue
        case KesshoProductSourceId.piano.rawValue:
            return KesshoProductSourcePresetId.pianoDefault.rawValue
        case KesshoProductSourceId.soundscape.rawValue:
            return KesshoProductSourcePresetId.soundscapeOceanSample.rawValue
        default:
            return 0
        }
    }

    private static func waterPresetKey(from state: SliderState) -> String {
        let selected = clamp(state.waterMorph, 0, 1) < 0.5 ? state.waterMorphA : state.waterMorphB
        return "water_\(clampInt(selected, min: 0, max: 7))"
    }

    private static func soundscapePresetId(from state: SliderState) -> UInt32 {
        if state.oceanSampleEnabled {
            return sourcePresetId(source: "soundscape", key: "ocean_sample", fallbackKey: "ocean_sample")
        }
        if state.waterEnabled {
            return sourcePresetId(source: "soundscape", key: waterPresetKey(from: state), fallbackKey: "ocean_sample")
        }
        if state.birds2Enabled {
            return sourcePresetId(source: "soundscape", key: "birds2", fallbackKey: "ocean_sample")
        }
        if state.birdsEnabled {
            return sourcePresetId(source: "soundscape", key: "birds", fallbackKey: "ocean_sample")
        }
        if state.frogsEnabled {
            return sourcePresetId(source: "soundscape", key: "frogs", fallbackKey: "ocean_sample")
        }
        if state.insects2Enabled {
            return sourcePresetId(source: "soundscape", key: "insects2", fallbackKey: "ocean_sample")
        }
        if state.insectsEnabled {
            return sourcePresetId(source: "soundscape", key: "insects", fallbackKey: "ocean_sample")
        }
        return sourcePresetId(source: "soundscape", key: "ocean_sample", fallbackKey: "ocean_sample")
    }

    private static func sourceFromState(_ sourceId: UInt32, state: SliderState) -> ProductSourceSnapshot {
        var source = sourceDefaults(sourceId)
        switch sourceId {
        case KesshoProductSourceId.pad1.rawValue:
            source.enabled = state.padEnabled
            source.level = Float(state.synthLevel)
            source.morph = Float(state.padMorph)
            source.distance = Float(state.padDistance)
            source.reverbSend = Float(state.pad1ReverbSend)
            source.delayASend = Float(state.pad1DelayASend)
            source.delayBSend = Float(state.pad1DelayBSend)
            source.granularSend = Float(state.granularPad1Send)
            source.postLpfHz = Float(state.padPostLPF)
            source.stereoWidth = Float(state.padStereoWidth)
            source.presetId = endpointPresetId(source: "pad", morph: state.padMorph, a: state.padPresetA, b: state.padPresetB, fallbackKey: "init")
        case KesshoProductSourceId.pad2.rawValue:
            source.enabled = state.pad2Enabled
            source.level = Float(state.pad2Level)
            source.morph = Float(state.pad2Morph)
            source.distance = Float(state.pad2Distance)
            source.reverbSend = Float(state.pad2ReverbSend)
            source.delayASend = Float(state.pad2DelayASend)
            source.delayBSend = Float(state.pad2DelayBSend)
            source.granularSend = Float(state.granularPad2Send)
            source.postLpfHz = Float(state.pad2PostLPF)
            source.stereoWidth = Float(state.pad2StereoWidth)
            source.presetId = endpointPresetId(source: "pad", morph: state.pad2Morph, a: state.pad2PresetA, b: state.pad2PresetB, fallbackKey: "init")
        case KesshoProductSourceId.lead1.rawValue:
            source.enabled = state.leadEnabled
            source.level = Float(state.lead1Level)
            source.morph = Float(state.lead1Morph)
            source.distance = Float(state.lead1Distance)
            source.holdSeconds = Float(state.lead1Hold)
            source.reverbSend = Float(state.lead1ReverbSend)
            source.delayASend = Float(state.lead1DelayASend)
            source.delayBSend = Float(state.lead1DelayBSend)
            source.granularSend = Float(state.granularLead1Send)
            source.postLpfHz = Float(state.lead1PostLPF)
            source.stereoWidth = Float(state.lead1StereoWidth)
            source.postLpfKeyTracking = Float(state.lead1PostLPFKeyTracking)
            source.presetId = endpointPresetId(source: "lead", morph: state.lead1Morph, a: state.lead1PresetA, b: state.lead1PresetB, fallbackKey: "soft_rhodes")
        case KesshoProductSourceId.lead2.rawValue:
            source.enabled = state.lead2Enabled
            source.level = Float(state.lead2Level)
            source.morph = Float(state.lead2Morph)
            source.distance = Float(state.lead2Distance)
            source.holdSeconds = Float(state.lead2Hold)
            source.reverbSend = Float(state.lead2ReverbSend)
            source.delayASend = Float(state.lead2DelayASend)
            source.delayBSend = Float(state.lead2DelayBSend)
            source.granularSend = Float(state.granularLead2Send)
            source.postLpfHz = Float(state.lead2PostLPF)
            source.stereoWidth = Float(state.lead2StereoWidth)
            source.postLpfKeyTracking = Float(state.lead2PostLPFKeyTracking)
            source.presetId = endpointPresetId(source: "lead", morph: state.lead2Morph, a: state.lead2PresetC, b: state.lead2PresetD, fallbackKey: "soft_rhodes")
        case KesshoProductSourceId.drum.rawValue:
            source.enabled = state.drumEnabled
            source.level = Float(state.drumLevel)
            source.reverbSend = Float(state.drumReverbSend)
            source.delayASend = Float(state.drumDelayASend)
            source.delayBSend = Float(state.drumDelayBSend)
            source.granularSend = Float(state.granularDrumSend)
            source.presetId = sourcePresetId(source: "drum", key: "default", fallbackKey: "default")
        case KesshoProductSourceId.piano.rawValue:
            source.enabled = state.pianoEnabled
            source.assetId = KesshoProductAssetIDs.defaultPiano
            source.level = Float(state.pianoLevel)
            source.distance = Float(state.pianoDistance)
            source.reverbSend = Float(state.pianoReverbSend)
            source.delayASend = Float(state.pianoDelayASend)
            source.delayBSend = Float(state.pianoDelayBSend)
            source.granularSend = Float(state.granularPianoSend)
            source.postLpfHz = Float(state.pianoPostLPF)
            source.stereoWidth = Float(state.pianoStereoWidth)
            source.presetId = sourcePresetId(source: "piano", key: "default", fallbackKey: "default")
        case KesshoProductSourceId.soundscape.rawValue:
            source.enabled = state.oceanSampleEnabled || state.waterEnabled || state.insectsEnabled ||
                state.insects2Enabled || state.birdsEnabled || state.birds2Enabled || state.frogsEnabled
            source.assetId = soundscapeAssetId(from: state)
            source.level = Float(state.natureLevel)
            source.reverbSend = Float(state.natureReverbSend)
            source.delayASend = Float(state.natureDelayASend)
            source.delayBSend = Float(state.natureDelayBSend)
            source.granularSend = Float(state.granularNatureSend)
            source.presetId = soundscapePresetId(from: state)
        default:
            break
        }
        source.level = Float(clamp(Double(source.level), 0, 1.5))
        source.morph = Float(clamp(Double(source.morph), 0, 1))
        source.distance = Float(clamp(Double(source.distance), 0, 1))
        source.reverbSend = Float(clamp(Double(source.reverbSend), 0, 2))
        source.delayASend = Float(clamp(Double(source.delayASend), 0, 2))
        source.delayBSend = Float(clamp(Double(source.delayBSend), 0, 2))
        source.granularSend = Float(clamp(Double(source.granularSend), 0, 2))
        source.postLpfHz = Float(clamp(Double(source.postLpfHz), 20, 20_000))
        source.stereoWidth = Float(clamp(Double(source.stereoWidth), 0, 1))
        source.postLpfKeyTracking = Float(clamp(Double(source.postLpfKeyTracking), 0, 1))
        return source
    }

    private static func synthLanes(from state: SliderState) -> [ProductLaneSnapshot] {
        [
            synthLane(
                laneNumber: 1,
                enabled: state.synthEuclid1Enabled,
                steps: state.synthEuclid1Steps,
                hits: state.synthEuclid1Hits,
                rotation: state.synthEuclid1Rotation,
                noteMin: state.synthEuclid1NoteMin,
                noteMax: state.synthEuclid1NoteMax,
                level: state.synthEuclid1Level,
                probability: state.synthEuclid1Probability,
                source: state.synthEuclid1Source,
                state: state
            ),
            synthLane(
                laneNumber: 2,
                enabled: state.synthEuclid2Enabled,
                steps: state.synthEuclid2Steps,
                hits: state.synthEuclid2Hits,
                rotation: state.synthEuclid2Rotation,
                noteMin: state.synthEuclid2NoteMin,
                noteMax: state.synthEuclid2NoteMax,
                level: state.synthEuclid2Level,
                probability: state.synthEuclid2Probability,
                source: state.synthEuclid2Source,
                state: state
            ),
            synthLane(
                laneNumber: 3,
                enabled: state.synthEuclid3Enabled,
                steps: state.synthEuclid3Steps,
                hits: state.synthEuclid3Hits,
                rotation: state.synthEuclid3Rotation,
                noteMin: state.synthEuclid3NoteMin,
                noteMax: state.synthEuclid3NoteMax,
                level: state.synthEuclid3Level,
                probability: state.synthEuclid3Probability,
                source: state.synthEuclid3Source,
                state: state
            ),
            synthLane(
                laneNumber: 4,
                enabled: state.synthEuclid4Enabled,
                steps: state.synthEuclid4Steps,
                hits: state.synthEuclid4Hits,
                rotation: state.synthEuclid4Rotation,
                noteMin: state.synthEuclid4NoteMin,
                noteMax: state.synthEuclid4NoteMax,
                level: state.synthEuclid4Level,
                probability: state.synthEuclid4Probability,
                source: state.synthEuclid4Source,
                state: state
            ),
        ]
    }

    private static func synthLane(
        laneNumber: UInt32,
        enabled: Bool,
        steps: Int,
        hits: Int,
        rotation: Int,
        noteMin: Int,
        noteMax: Int,
        level: Double,
        probability: Double,
        source: String,
        state: SliderState
    ) -> ProductLaneSnapshot {
        var lane = laneDefaults(targetSourceId: synthSourceId(from: source), midiNote: 60)
        lane.enabled = state.synthEuclideanMasterEnabled && enabled
        lane.stepCount = UInt32(clampInt(steps, min: 1, max: 64))
        lane.fillCount = UInt32(clampInt(hits, min: 0, max: Int(lane.stepCount)))
        lane.rotation = Int32(rotation)
        lane.clockDivision = 16
        lane.probability = Float(clamp(probability, 0, 1))
        lane.velocity = Float(clamp(level, 0, 1.5))
        lane.midiNote = Float(clamp((Double(noteMin) + Double(noteMax)) * 0.5, 0, 127))
        lane.seed = 1000 + laneNumber
        return lane
    }

    private static func drumLanes(from state: SliderState) -> [ProductLaneSnapshot] {
        var lanes: [ProductLaneSnapshot] = []
        appendDrumLanes(
            to: &lanes,
            laneNumber: 1,
            enabled: state.drumEuclid1Enabled,
            steps: state.drumEuclid1Steps,
            hits: state.drumEuclid1Hits,
            rotation: state.drumEuclid1Rotation,
            probability: state.drumEuclid1Probability,
            level: state.drumEuclid1Level,
            targets: [
                (state.drumEuclid1TargetSub, 0),
                (state.drumEuclid1TargetKick, 1),
                (state.drumEuclid1TargetClick, 2),
                (state.drumEuclid1TargetBeepHi, 3),
                (state.drumEuclid1TargetBeepLo, 4),
                (state.drumEuclid1TargetNoise, 5),
                (state.drumEuclid1TargetMembrane, 6),
            ],
            state: state
        )
        appendDrumLanes(
            to: &lanes,
            laneNumber: 2,
            enabled: state.drumEuclid2Enabled,
            steps: state.drumEuclid2Steps,
            hits: state.drumEuclid2Hits,
            rotation: state.drumEuclid2Rotation,
            probability: state.drumEuclid2Probability,
            level: state.drumEuclid2Level,
            targets: [
                (state.drumEuclid2TargetSub, 0),
                (state.drumEuclid2TargetKick, 1),
                (state.drumEuclid2TargetClick, 2),
                (state.drumEuclid2TargetBeepHi, 3),
                (state.drumEuclid2TargetBeepLo, 4),
                (state.drumEuclid2TargetNoise, 5),
                (state.drumEuclid2TargetMembrane, 6),
            ],
            state: state
        )
        appendDrumLanes(
            to: &lanes,
            laneNumber: 3,
            enabled: state.drumEuclid3Enabled,
            steps: state.drumEuclid3Steps,
            hits: state.drumEuclid3Hits,
            rotation: state.drumEuclid3Rotation,
            probability: state.drumEuclid3Probability,
            level: state.drumEuclid3Level,
            targets: [
                (state.drumEuclid3TargetSub, 0),
                (state.drumEuclid3TargetKick, 1),
                (state.drumEuclid3TargetClick, 2),
                (state.drumEuclid3TargetBeepHi, 3),
                (state.drumEuclid3TargetBeepLo, 4),
                (state.drumEuclid3TargetNoise, 5),
                (state.drumEuclid3TargetMembrane, 6),
            ],
            state: state
        )
        appendDrumLanes(
            to: &lanes,
            laneNumber: 4,
            enabled: state.drumEuclid4Enabled,
            steps: state.drumEuclid4Steps,
            hits: state.drumEuclid4Hits,
            rotation: state.drumEuclid4Rotation,
            probability: state.drumEuclid4Probability,
            level: state.drumEuclid4Level,
            targets: [
                (state.drumEuclid4TargetSub, 0),
                (state.drumEuclid4TargetKick, 1),
                (state.drumEuclid4TargetClick, 2),
                (state.drumEuclid4TargetBeepHi, 3),
                (state.drumEuclid4TargetBeepLo, 4),
                (state.drumEuclid4TargetNoise, 5),
                (state.drumEuclid4TargetMembrane, 6),
            ],
            state: state
        )
        return Array(lanes.prefix(16))
    }

    private static func appendDrumLanes(
        to lanes: inout [ProductLaneSnapshot],
        laneNumber: UInt32,
        enabled: Bool,
        steps: Int,
        hits: Int,
        rotation: Int,
        probability: Double,
        level: Double,
        targets: [(Bool, Int)],
        state: SliderState
    ) {
        let selectedTargets = targets.filter { $0.0 }.map { $0.1 }
        let voiceIndices = selectedTargets.isEmpty ? [1] : selectedTargets
        for voiceIndex in voiceIndices where lanes.count < 16 {
            var lane = laneDefaults(targetSourceId: KesshoProductSourceId.drum.rawValue, midiNote: Float(36 + voiceIndex))
            lane.enabled = state.drumEnabled && state.drumEuclidMasterEnabled && enabled
            lane.stepCount = UInt32(clampInt(steps, min: 1, max: 64))
            lane.fillCount = UInt32(clampInt(hits, min: 0, max: Int(lane.stepCount)))
            lane.rotation = Int32(rotation)
            lane.clockDivision = UInt32(clampInt(state.drumEuclidDivision, min: 1, max: 128))
            lane.swing = Float(clamp(state.drumEuclidSwing / 100, -1, 1))
            lane.probability = Float(clamp(probability, 0, 1))
            lane.velocity = Float(clamp(level, 0, 1.5))
            lane.holdSeconds = 0.08
            lane.seed = 2000 + laneNumber * 31 + UInt32(voiceIndex)
            lanes.append(lane)
        }
    }

    private static func writeSequencer(_ lanes: [ProductLaneSnapshot], writer: inout SnapshotWriter) {
        let start = writer.count
        writer.u32(UInt32(min(lanes.count, 16)))
        for index in 0..<16 {
            let lane = index < lanes.count ? lanes[index] : laneDefaults(targetSourceId: KesshoProductSourceId.pad1.rawValue, midiNote: 60)
            writer.u32(lane.enabled ? 1 : 0)
            writer.u32(lane.targetSourceId)
            writer.u32(lane.stepCount)
            writer.u32(lane.fillCount)
            writer.i32(lane.rotation)
            writer.u32(lane.clockDivision)
            writer.f32(lane.swing)
            writer.f32(lane.probability)
            writer.u32(lane.ratchet)
            writer.u32(lane.trigCondition)
            writer.f32(lane.midiNote)
            writer.f32(lane.velocity)
            writer.f32(lane.holdSeconds)
            writer.f32(lane.morph)
            writer.f32(lane.distance)
            writer.f32(lane.expression)
            writer.u32(lane.seed)
            writer.u32(lane.barReset ? 1 : 0)
            writer.u32(lane.phraseReset ? 1 : 0)
            writer.u32(lane.manualStepMaskLow)
            writer.u32(lane.manualStepMaskHigh)
        }
        precondition(writer.count == start + sequencerByteCount)
    }

    private static func writeGranularVoice(_ voice: ProductGranularVoiceSnapshot, writer: inout SnapshotWriter) {
        writer.u32(voice.enabled ? 1 : 0)
        writer.u32(voice.mode)
        writer.u32(voice.slice)
        writer.f32(voice.speed)
        writer.f32(voice.scanRate)
        writer.u32(voice.reverse ? 1 : 0)
        writer.f32(voice.pitch)
        writer.f32(voice.writeFollow)
        writer.f32(voice.density)
        writer.f32(voice.grainSizeMs)
        writer.f32(voice.spray)
        writer.f32(voice.grainOctaveProbability)
        writer.f32(voice.attackSeconds)
        writer.f32(voice.decaySeconds)
        writer.f32(voice.gain)
        writer.f32(voice.pan)
        writer.f32(voice.blur)
        writer.f32(voice.stereoSpread)
        writer.f32(voice.positionLfoRate)
        writer.f32(voice.positionLfoDepth)
        writer.f32(voice.panLfoRate)
        writer.f32(voice.reverseLfoRate)
        writer.f32(voice.recordLfoRate)
        writer.u32(voice.euclidGated ? 1 : 0)
        writer.u32(voice.euclidMuted ? 1 : 0)
    }

    private static var sourceOrder: [UInt32] {
        [
            KesshoProductSourceId.pad1.rawValue,
            KesshoProductSourceId.pad2.rawValue,
            KesshoProductSourceId.lead1.rawValue,
            KesshoProductSourceId.lead2.rawValue,
            KesshoProductSourceId.drum.rawValue,
            KesshoProductSourceId.piano.rawValue,
            KesshoProductSourceId.soundscape.rawValue,
        ]
    }

    private static func sourceDefaults(_ sourceId: UInt32) -> ProductSourceSnapshot {
        ProductSourceSnapshot(
            enabled: true,
            sourceId: sourceId,
            presetId: defaultPresetId(for: sourceId),
            assetId: 0,
            level: 0.75,
            morph: 0,
            distance: 0,
            expression: 0.75,
            dryGain: 1,
            reverbSend: 0.12,
            delayASend: 0,
            delayBSend: 0,
            granularSend: 0,
            postLpfHz: KesshoProductSchema.sourcePostLpfHz,
            stereoWidth: KesshoProductSchema.sourceStereoWidth,
            postLpfKeyTracking: KesshoProductSchema.sourcePostLpfKeyTracking,
            exactPadParamCount: 0,
            exactPadParams: Array(repeating: 0, count: Int(KesshoProductSchema.padParamCount)),
            exactLeadParamCount: 0,
            exactLeadParams: Array(repeating: 0, count: Int(KesshoProductSchema.leadParamCount)),
            exactDrumParamCount: 0,
            exactDrumParams: Array(repeating: 0, count: Int(KesshoProductSchema.drumParamCount)),
            drumVoicePresetAIds: Array(repeating: 0, count: Int(KesshoProductSchema.drumVoiceCount)),
            drumVoicePresetBIds: Array(repeating: 0, count: Int(KesshoProductSchema.drumVoiceCount)),
            drumVoiceMorphs: Array(repeating: 0, count: Int(KesshoProductSchema.drumVoiceCount)),
            holdSeconds: KesshoProductSchema.sourceHoldSeconds
        )
    }

    private static func laneDefaults(targetSourceId: UInt32, midiNote: Float) -> ProductLaneSnapshot {
        ProductLaneSnapshot(
            enabled: false,
            targetSourceId: targetSourceId,
            stepCount: 16,
            fillCount: 4,
            rotation: 0,
            clockDivision: 16,
            swing: 0,
            probability: 1,
            ratchet: 1,
            trigCondition: 0,
            midiNote: midiNote,
            velocity: 0.75,
            holdSeconds: 0.18,
            morph: 0,
            distance: 0,
            expression: 0.75,
            seed: 1,
            barReset: true,
            phraseReset: false,
            manualStepMaskLow: 0,
            manualStepMaskHigh: 0
        )
    }

    private static func rootMidi(from state: SliderState) -> Double {
        let pitchClass = ((state.rootNote % 12) + 12) % 12
        return 60 + Double(pitchClass)
    }

    private static func scaleId(from state: SliderState, tension: Double) -> Int {
        if state.scaleMode == "manual" {
            let normalized = state.manualScale.lowercased()
            if normalized.contains("octatonic") || normalized.contains("phrygian") || normalized.contains("hirajoshi") {
                return 4
            }
            if normalized.contains("minor") || normalized.contains("dorian") || normalized.contains("aeolian") {
                return 2
            }
            if normalized.contains("pentatonic") {
                return 3
            }
            return 1
        }
        if tension < 0.2 {
            return 3
        }
        if tension < 0.55 {
            return 1
        }
        if tension < 0.82 {
            return 2
        }
        return 4
    }

    private static func synthSourceId(from source: String) -> UInt32 {
        let normalized = source.lowercased()
        if normalized == "lead2" {
            return KesshoProductSourceId.lead2.rawValue
        }
        if normalized == "piano" {
            return KesshoProductSourceId.piano.rawValue
        }
        if normalized == "synth4" || normalized == "synth5" || normalized == "synth6" {
            return KesshoProductSourceId.pad2.rawValue
        }
        if normalized.hasPrefix("synth") {
            return KesshoProductSourceId.pad1.rawValue
        }
        return KesshoProductSourceId.lead1.rawValue
    }

    private static func soundscapeAssetId(from state: SliderState) -> UInt32 {
        if state.frogsEnabled {
            return KesshoProductAssetIDs.frogsSoundscape
        }
        if state.insectsEnabled {
            return KesshoProductAssetIDs.insectsSoundscape
        }
        if state.birds2Enabled {
            return KesshoProductAssetIDs.birds2Soundscape
        }
        if state.birdsEnabled {
            return KesshoProductAssetIDs.birdsSoundscape
        }
        if state.waterEnabled {
            return KesshoProductAssetIDs.waterSoundscape
        }
        return KesshoProductAssetIDs.defaultSoundscape
    }

    private static func soundscapeAssetIds(from state: SliderState) -> [UInt32] {
        var ids: [UInt32] = []
        if state.oceanSampleEnabled {
            ids.append(KesshoProductAssetIDs.defaultSoundscape)
        }
        if state.waterEnabled {
            ids.append(KesshoProductAssetIDs.waterSoundscape)
        }
        if state.birdsEnabled {
            ids.append(KesshoProductAssetIDs.birdsSoundscape)
        }
        if state.birds2Enabled {
            ids.append(KesshoProductAssetIDs.birds2Soundscape)
        }
        if state.frogsEnabled {
            ids.append(KesshoProductAssetIDs.frogsSoundscape)
        }
        if state.insectsEnabled || state.insects2Enabled {
            ids.append(KesshoProductAssetIDs.insectsSoundscape)
        }
        var uniqueIds: [UInt32] = []
        for id in ids where !uniqueIds.contains(id) {
            uniqueIds.append(id)
        }
        return uniqueIds
    }

    private static func delayDivisionMs(_ note: String, bpm: Double) -> Double {
        let beats: Double
        switch note {
        case "1/1": beats = 4
        case "1/2": beats = 2
        case "1/2d": beats = 3
        case "1/4": beats = 1
        case "1/4d": beats = 1.5
        case "1/4t": beats = 2.0 / 3.0
        case "1/8": beats = 0.5
        case "1/8d": beats = 0.75
        case "1/8t": beats = 1.0 / 3.0
        case "1/16": beats = 0.25
        case "1/16d": beats = 0.375
        case "1/16t": beats = 1.0 / 6.0
        case "1/32": beats = 0.125
        default: beats = 0.5
        }
        return (60.0 / max(1.0, bpm)) * beats * 1000.0
    }

    private static func delayAFilterTypeId(_ value: String) -> UInt32 {
        switch value {
        case "highpass":
            return 1
        case "bandpass":
            return 2
        default:
            return 0
        }
    }

    private static func delayBPatternId(_ value: String) -> UInt32 {
        switch value {
        case "golden":
            return 1
        case "mirror":
            return 2
        case "dotted":
            return 3
        default:
            return 0
        }
    }

    private static func delayBWarpId(_ value: String) -> UInt32 {
        switch value {
        case "filterSweep":
            return 1
        case "pitchDrift":
            return 2
        case "grainCrossfade":
            return 3
        default:
            return 0
        }
    }

    private static func reverbTypeId(_ value: String) -> UInt32 {
        switch value {
        case "plate":
            return 0
        case "hall":
            return 1
        case "darkHall":
            return 3
        case "dattorroPlate":
            return 4
        case "dattorroShimmer":
            return 5
        default:
            return 2
        }
    }

    private static func reverbQualityId(_ value: String) -> UInt32 {
        switch value {
        case "ultra":
            return 0
        case "lite":
            return 2
        default:
            return 1
        }
    }

    private static func reverbModCharacterId(_ value: String) -> UInt32 {
        switch value {
        case "sine":
            return 0
        case "drift":
            return 1
        default:
            return 2
        }
    }

    private static func reverbSaturationModeId(_ value: String) -> UInt32 {
        switch value {
        case "tape":
            return 1
        case "tube":
            return 2
        default:
            return 0
        }
    }

    private static func dynamicsCharacterModeId(_ value: String) -> UInt32 {
        switch value {
        case "abyssWater":
            return 1
        case "shallowWater":
            return 2
        default:
            return 0
        }
    }

    private static func dynamicsSaturationModeId(_ value: String) -> UInt32 {
        switch value {
        case "tape":
            return 1
        case "tube":
            return 2
        case "diode":
            return 3
        case "fold":
            return 4
        default:
            return 0
        }
    }

    private static func sidechainKeyId(_ value: String) -> UInt32 {
        switch value {
        case "sub":
            return 1
        case "kick":
            return 2
        case "click":
            return 3
        case "beepHi":
            return 4
        case "beepLo":
            return 5
        case "noise":
            return 6
        case "membrane":
            return 7
        default:
            return 0
        }
    }

    private static func granularShapeId(_ value: String) -> UInt32 {
        switch value {
        case "sawUp":
            return 1
        case "sawDown":
            return 2
        case "square":
            return 3
        default:
            return 0
        }
    }

    private static func granularVoiceModeId(_ value: String) -> UInt32 {
        switch value {
        case "clean":
            return 0
        case "legacy":
            return 2
        default:
            return 1
        }
    }

    private static func granularLegacyPitchModeId(_ value: String) -> UInt32 {
        value == "random" ? 0 : 1
    }

    private static func granularVoice(_ voice: Int, state: SliderState) -> ProductGranularVoiceSnapshot {
        let raw: (
            enabled: Bool,
            mode: String,
            slice: Double,
            speed: Double,
            scanRate: Double,
            reverse: Bool,
            pitch: Double,
            attack: Double,
            decay: Double,
            blur: Double,
            grainOct: Double,
            spray: Double,
            density: Double,
            tempoSync: Bool,
            grainSize: Double,
            pan: Double,
            gain: Double,
            posLfoRate: Double,
            posLfoDepth: Double,
            panLfoRate: Double,
            stereoSpread: Double,
            reverseLfoRate: Double,
            writeFollow: Double,
            recordLfoRate: Double
        )
        switch voice {
        case 2:
            raw = (
                state.granularV2Enabled, state.granularV2Mode, state.granularV2Slice,
                state.granularV2Speed, state.granularV2ScanRate, state.granularV2Reverse,
                state.granularV2Pitch, state.granularV2Attack, state.granularV2Decay,
                state.granularV2Blur, state.granularV2GrainOct, state.granularV2Spray,
                state.granularV2Density, state.granularV2TempoSync, state.granularV2GrainSize,
                state.granularV2Pan, state.granularV2Gain, state.granularV2PosLFORate,
                state.granularV2PosLFODepth, state.granularV2PanLFORate, state.granularV2StereoSpread,
                state.granularV2ReverseLFORate, state.granularV2WriteFollow, state.granularV2RecordLFORate
            )
        case 3:
            raw = (
                state.granularV3Enabled, state.granularV3Mode, state.granularV3Slice,
                state.granularV3Speed, state.granularV3ScanRate, state.granularV3Reverse,
                state.granularV3Pitch, state.granularV3Attack, state.granularV3Decay,
                state.granularV3Blur, state.granularV3GrainOct, state.granularV3Spray,
                state.granularV3Density, state.granularV3TempoSync, state.granularV3GrainSize,
                state.granularV3Pan, state.granularV3Gain, state.granularV3PosLFORate,
                state.granularV3PosLFODepth, state.granularV3PanLFORate, state.granularV3StereoSpread,
                state.granularV3ReverseLFORate, state.granularV3WriteFollow, state.granularV3RecordLFORate
            )
        case 4:
            raw = (
                state.granularV4Enabled, state.granularV4Mode, state.granularV4Slice,
                state.granularV4Speed, state.granularV4ScanRate, state.granularV4Reverse,
                state.granularV4Pitch, state.granularV4Attack, state.granularV4Decay,
                state.granularV4Blur, state.granularV4GrainOct, state.granularV4Spray,
                state.granularV4Density, state.granularV4TempoSync, state.granularV4GrainSize,
                state.granularV4Pan, state.granularV4Gain, state.granularV4PosLFORate,
                state.granularV4PosLFODepth, state.granularV4PanLFORate, state.granularV4StereoSpread,
                state.granularV4ReverseLFORate, state.granularV4WriteFollow, state.granularV4RecordLFORate
            )
        default:
            raw = (
                state.granularV1Enabled, state.granularV1Mode, state.granularV1Slice,
                state.granularV1Speed, state.granularV1ScanRate, state.granularV1Reverse,
                state.granularV1Pitch, state.granularV1Attack, state.granularV1Decay,
                state.granularV1Blur, state.granularV1GrainOct, state.granularV1Spray,
                state.granularV1Density, state.granularV1TempoSync, state.granularV1GrainSize,
                state.granularV1Pan, state.granularV1Gain, state.granularV1PosLFORate,
                state.granularV1PosLFODepth, state.granularV1PanLFORate, state.granularV1StereoSpread,
                state.granularV1ReverseLFORate, state.granularV1WriteFollow, state.granularV1RecordLFORate
            )
        }

        return ProductGranularVoiceSnapshot(
            enabled: raw.enabled,
            mode: granularVoiceModeId(raw.mode),
            slice: UInt32(clampInt(Int(raw.slice.rounded()), min: 0, max: 15)),
            speed: Float(clamp(raw.speed, 0, 4)),
            scanRate: Float(clamp(raw.scanRate, 0.25, 4)),
            reverse: raw.reverse,
            pitch: Float(clamp(raw.pitch, -24, 24)),
            writeFollow: Float(clamp(raw.writeFollow, 0, 1)),
            density: Float(clamp(raw.density, 1, 64)),
            grainSizeMs: Float(clamp(raw.grainSize, 10, 500)),
            spray: Float(clamp(raw.spray, 0, 1)),
            grainOctaveProbability: Float(clamp(raw.grainOct, 0, 1)),
            attackSeconds: Float(clamp(raw.attack, 0.001, 0.5)),
            decaySeconds: Float(clamp(raw.decay, 0.01, 4)),
            gain: Float(clamp(raw.gain, 0, 1)),
            pan: Float(clamp(raw.pan, -1, 1)),
            blur: Float(clamp(raw.blur, 0, 1)),
            stereoSpread: Float(clamp(raw.stereoSpread, 0, 1)),
            positionLfoRate: Float(clamp(raw.posLfoRate, 0, 1)),
            positionLfoDepth: Float(clamp(raw.posLfoDepth, 0, 1)),
            panLfoRate: Float(clamp(raw.panLfoRate, 0, 1)),
            reverseLfoRate: Float(clamp(raw.reverseLfoRate, 0, 1)),
            recordLfoRate: Float(clamp(raw.recordLfoRate, 0, 1)),
            euclidGated: raw.tempoSync,
            euclidMuted: false
        )
    }

    private static func clamp(_ value: Double, _ minValue: Double, _ maxValue: Double) -> Double {
        min(max(value, minValue), maxValue)
    }

    private static func clampInt(_ value: Int, min minValue: Int, max maxValue: Int) -> Int {
        min(max(value, minValue), maxValue)
    }
}

public extension KesshoProductCore {
    @discardableResult
    func loadSnapshot(state: SliderState, running: Bool = false) -> Int32 {
        loadSnapshot(KesshoProductCoreSnapshotEncoder.encode(state, running: running))
    }
}

public extension KesshoProductCoreAudioEngine {
    @discardableResult
    func loadSnapshot(state: SliderState, running: Bool = false) -> Int32 {
        loadSnapshot(KesshoProductCoreSnapshotEncoder.encode(state, running: running))
    }

    func start(state: SliderState) throws {
        try start(snapshotBytes: KesshoProductCoreSnapshotEncoder.encode(state, running: false))
    }
}

private struct ProductSnapshot {
    var transport: ProductTransportSnapshot
    var harmony: ProductHarmonySnapshot
    var sources: [ProductSourceSnapshot]
    var synthLanes: [ProductLaneSnapshot]
    var drumLanes: [ProductLaneSnapshot]
    var journey: ProductJourneySnapshot
    var fx: ProductFxSnapshot
    var routing: ProductRoutingSnapshot
    var master: ProductMasterSnapshot
    var rng: ProductRngSnapshot
    var evolution: ProductEvolutionSnapshot
    var assetRefs: [UInt32]
}

private struct ProductTransportSnapshot {
    var running: Bool
    var bpm: Float
    var beatsPerBar: UInt32
    var barsPerPhrase: UInt32
    var swing: Float
}

private struct ProductHarmonySnapshot {
    var rootMidi: Float
    var scaleId: UInt32
    var tension: Float
    var chordMode: UInt32
    var voicingMode: UInt32
}

private struct ProductSourceSnapshot {
    var enabled: Bool
    var sourceId: UInt32
    var presetId: UInt32
    var assetId: UInt32
    var level: Float
    var morph: Float
    var distance: Float
    var expression: Float
    var dryGain: Float
    var reverbSend: Float
    var delayASend: Float
    var delayBSend: Float
    var granularSend: Float
    var postLpfHz: Float
    var stereoWidth: Float
    var postLpfKeyTracking: Float
    var exactPadParamCount: UInt32
    var exactPadParams: [Float]
    var exactLeadParamCount: UInt32
    var exactLeadParams: [Float]
    var exactDrumParamCount: UInt32
    var exactDrumParams: [Float]
    var drumVoicePresetAIds: [UInt32]
    var drumVoicePresetBIds: [UInt32]
    var drumVoiceMorphs: [Float]
    var holdSeconds: Float
}

private struct ProductLaneSnapshot {
    var enabled: Bool
    var targetSourceId: UInt32
    var stepCount: UInt32
    var fillCount: UInt32
    var rotation: Int32
    var clockDivision: UInt32
    var swing: Float
    var probability: Float
    var ratchet: UInt32
    var trigCondition: UInt32
    var midiNote: Float
    var velocity: Float
    var holdSeconds: Float
    var morph: Float
    var distance: Float
    var expression: Float
    var seed: UInt32
    var barReset: Bool
    var phraseReset: Bool
    var manualStepMaskLow: UInt32
    var manualStepMaskHigh: UInt32
}

private struct ProductJourneySnapshot {
    var enabled: Bool
    var morphPhase: Float
    var morphRateBars: Float
}

private struct ProductFxSnapshot {
    var granularMix: Float
    var granularEnabled: Bool
    var granularFreeze: Bool
    var granularFreezeWithFeedback: Bool
    var granularFeedback: Float
    var granularFeedbackLpfHz: Float
    var granularBufferSeconds: Float
    var granularGrainShape: UInt32
    var granularBusDiffusion: Float
    var granularTimingRandomness: Float
    var granularChordBias: Float
    var granularLegacyJitterMs: Float
    var granularLegacyProbability: Float
    var granularLegacyPitchMode: UInt32
    var granularLegacyPitchSpread: Float
    var granularLegacyMaxGrains: UInt32
    var granularLegacyFeedback: Float
    var granularVoices: [ProductGranularVoiceSnapshot]
    var delayAEnabled: Bool
    var delayATimeLeftMs: Float
    var delayATimeRightMs: Float
    var delayAFeedback: Float
    var delayAMix: Float
    var delayAFilterHz: Float
    var delayAFilterType: UInt32
    var delayAModRateHz: Float
    var delayAModDepthMs: Float
    var delayAPingPong: Bool
    var delayADuck: Float
    var delayAWidth: Float
    var delayACrossFeedFilterHz: Float
    var delayBEnabled: Bool
    var delayBActivity: Float
    var delayBRepeats: Float
    var delayBBaseTimeMs: Float
    var delayBTone: Float
    var delayBVibrato: Float
    var delayBMix: Float
    var delayBSpaceMode: UInt32
    var delayBPattern: UInt32
    var delayBWarp: UInt32
    var delayBWarpIntensity: Float
    var delayBSpread: Float
    var reverbMix: Float
    var reverbType: UInt32
    var reverbQuality: UInt32
    var reverbDecay: Float
    var reverbSize: Float
    var reverbDamping: Float
    var reverbDiffusion: Float
    var reverbModulation: Float
    var reverbPredelayMs: Float
    var reverbWidth: Float
    var reverbShimmerAmount: Float
    var reverbShimmerPitch: Float
    var reverbSlowRateHz: Float
    var reverbSlowDepth: Float
    var reverbReverseAmount: Float
    var reverbReverseLengthSec: Float
    var reverbChorusRateHz: Float
    var reverbChorusDepth: Float
    var reverbModCharacter: UInt32
    var reverbDampLow: Float
    var reverbDampHigh: Float
    var reverbCrossoverHz: Float
    var reverbInputTone: Float
    var reverbShimmerFeedback: Float
    var reverbWarp: Float
    var reverbCrossFeed: Float
    var reverbEarlyReflections: Float
    var reverbAirAbsorption: Float
    var reverbSaturationMode: UInt32
    var reverbTransientSmooth: Float
    var reverbErLpFreq: Float
    var reverbPreCompThreshold: Float
    var reverbPreCompKnee: Float
    var reverbPreCompRatio: Float
    var reverbPreCompAttackMs: Float
    var reverbPreCompReleaseMs: Float
    var reverbPreCompMakeup: Float
    var spectralFreezeMix: Float
    var spectralFreezeEnabled: Bool
    var spectralFreezeActive: Bool
    var spectralFreezeSlushy: Bool
    var spectralFreezeSpeed: Float
    var spectralFreezeDecay: Float
    var spectralFreezePhaseJitter: Float
    var dynamicsDrive: Float
    var dynamicsEnabled: Bool
    var dynamicsCharacterEnabled: Bool
    var dynamicsCharacterMode: UInt32
    var dynamicsCharacterMix: Float
    var dynamicsCharacterAge: Float
    var dynamicsCharacterBias: Float
    var dynamicsCharacterLpgAmount: Float
    var dynamicsCharacterResonance: Float
    var dynamicsCharacterStereo: Float
    var dynamicsCharacterEnvFollow: Float
    var dynamicsCharacterDepth: Float
    var dynamicsCharacterRate: Float
    var dynamicsCharacterDamp: Float
    var dynamicsDegradeEnabled: Bool
    var dynamicsDegradeMix: Float
    var dynamicsDegradeAge: Float
    var dynamicsDegradeGeneration: Float
    var dynamicsDegradeAlias: Float
    var dynamicsDegradeWow: Float
    var dynamicsDegradeFlutter: Float
    var dynamicsDegradeDrift: Float
    var dynamicsDegradeWobbleSpeed: Float
    var dynamicsDegradeTone: Float
    var dynamicsDegradeHp: Float
    var dynamicsDegradeLp: Float
    var dynamicsDegradeNoise: Float
    var dynamicsDegradeSaturation: Float
    var dynamicsDegradeCorrosion: Float
    var dynamicsModSlowWow: Float
    var dynamicsModSlowFlutter: Float
    var dynamicsModSlowLp: Float
    var dynamicsModSlowWet: Float
    var dynamicsModSlowDropout: Float
    var dynamicsModSlowAlias: Float
    var dynamicsModFlutterWow: Float
    var dynamicsModFlutterFlutter: Float
    var dynamicsModFlutterLp: Float
    var dynamicsModFlutterWet: Float
    var dynamicsModFlutterDropout: Float
    var dynamicsModFlutterAlias: Float
    var dynamicsModRandomWow: Float
    var dynamicsModRandomFlutter: Float
    var dynamicsModRandomLp: Float
    var dynamicsModRandomWet: Float
    var dynamicsModRandomDropout: Float
    var dynamicsModRandomAlias: Float
    var dynamicsModEnvWow: Float
    var dynamicsModEnvFlutter: Float
    var dynamicsModEnvLp: Float
    var dynamicsModEnvWet: Float
    var dynamicsModEnvDropout: Float
    var dynamicsModEnvAlias: Float
    var dynamicsModNoiseWow: Float
    var dynamicsModNoiseFlutter: Float
    var dynamicsModNoiseLp: Float
    var dynamicsModNoiseWet: Float
    var dynamicsModNoiseDropout: Float
    var dynamicsModNoiseAlias: Float
    var dynamicsSaturationEnabled: Bool
    var dynamicsSaturationMode: UInt32
    var dynamicsSaturationDrive: Float
    var dynamicsSaturationTone: Float
    var dynamicsSaturationBias: Float
    var dynamicsEndCompEnabled: Bool
    var dynamicsEndCompThreshold: Float
    var dynamicsEndCompKnee: Float
    var dynamicsEndCompRatio: Float
    var dynamicsEndCompAttackMs: Float
    var dynamicsEndCompReleaseMs: Float
    var dynamicsEndCompMakeup: Float
    var dynamicsEndCompMix: Float
    var dynamicsEndCompDetectorHp: Float
    var dynamicsEndCompDetectorTilt: Float
    var dynamicsEndCompAutoMakeup: Float
    var dynamicsEndCompProgramRelease: Float
    var sidechainEnabled: Bool
    var sidechainKeyA: UInt32
    var sidechainKeyB: UInt32
    var sidechainKeyAWeight: Float
    var sidechainKeyBWeight: Float
    var sidechainAmount: Float
    var sidechainThreshold: Float
    var sidechainRatio: Float
    var sidechainKnee: Float
    var sidechainAttackMs: Float
    var sidechainHoldMs: Float
    var sidechainReleaseMs: Float
    var sidechainMakeup: Float
    var sidechainMix: Float
    var sidechainCurve: Float
    var sidechainDetectorHp: Float
    var sidechainDetectorLp: Float
    var sidechainPad1Target: Float
    var sidechainPad2Target: Float
    var sidechainLead1Target: Float
    var sidechainLead2Target: Float
    var sidechainPianoTarget: Float
    var sidechainGranularTarget: Float
    var sidechainDelayATarget: Float
    var sidechainDelayBTarget: Float
    var sidechainReverbTarget: Float
}

private struct ProductGranularVoiceSnapshot {
    var enabled: Bool
    var mode: UInt32
    var slice: UInt32
    var speed: Float
    var scanRate: Float
    var reverse: Bool
    var pitch: Float
    var writeFollow: Float
    var density: Float
    var grainSizeMs: Float
    var spray: Float
    var grainOctaveProbability: Float
    var attackSeconds: Float
    var decaySeconds: Float
    var gain: Float
    var pan: Float
    var blur: Float
    var stereoSpread: Float
    var positionLfoRate: Float
    var positionLfoDepth: Float
    var panLfoRate: Float
    var reverseLfoRate: Float
    var recordLfoRate: Float
    var euclidGated: Bool
    var euclidMuted: Bool
}

private struct ProductRoutingSnapshot {
    var delayAToDelayB: Float
    var delayBToDelayA: Float
    var delayToReverb: Float
    var granularToReverb: Float
    var delayAToGranular: Float
    var delayBToGranular: Float
    var delayBToReverb: Float
}

private struct ProductMasterSnapshot {
    var gain: Float
    var limiterCeilingDb: Float
    var saturationMode: UInt32
    var saturationDrive: Float
    var saturationTone: Float
}

private struct ProductRngSnapshot {
    var seed: UInt32
    var state: UInt32
}

private struct ProductEvolutionSnapshot {
    var amount: Float
    var state: UInt32
}

private struct SnapshotWriter {
    private(set) var data: Data

    init(capacity: Int) {
        data = Data()
        data.reserveCapacity(capacity)
    }

    var count: Int {
        data.count
    }

    mutating func u32(_ value: UInt32) {
        var littleEndian = value.littleEndian
        withUnsafeBytes(of: &littleEndian) { bytes in
            data.append(contentsOf: bytes)
        }
    }

    mutating func i32(_ value: Int32) {
        var littleEndian = value.littleEndian
        withUnsafeBytes(of: &littleEndian) { bytes in
            data.append(contentsOf: bytes)
        }
    }

    mutating func f32(_ value: Float) {
        let finite = value.isFinite ? value : 0
        var littleEndian = finite.bitPattern.littleEndian
        withUnsafeBytes(of: &littleEndian) { bytes in
            data.append(contentsOf: bytes)
        }
    }
}
