import AVFoundation
import Foundation
import Combine

/// Engine state update callback data
struct EngineStateUpdate {
    var cofCurrentStep: Int
    var currentSeed: Int
    var currentBucket: String
    var currentFilterFreq: Double
    var harmonyState: (chordDegrees: [Int], scaleName: String)?
}

/// Main audio engine using AVAudioEngine
public final class AudioEngine {
    
    // MARK: - AVAudioEngine Components
    private let engine = AVAudioEngine()
    private var synthVoices: [SynthVoice] = []
    private var granularProcessor: GranularProcessor?
    private var reverbProcessor: ReverbProcessor?
    private var dynamicsCharacterProcessor: DynamicsCharacterProcessor?
    private var leadSynth: LeadSynth?
    private var oceanSynth: OceanSynth?
    private var oceanSamplePlayer: OceanSamplePlayer?
    private var drumSynth: DrumSynth?
    
    // Euclidean sequencer for lead
    private var euclideanSequencer: EuclideanSequencer?
    private var euclideanTimer: Timer?
    
    // Pre-scheduled Euclidean notes (matching web's precise scheduling)
    private var scheduledEuclideanNotes: [DispatchWorkItem] = []
    
    // Lead melody scheduling (pre-scheduled per phrase like web)
    private var scheduledLeadNotes: [DispatchWorkItem] = []
    
    // Mixer nodes
    private let synthMixer = AVAudioMixerNode()
    private let granularMixer = AVAudioMixerNode()
    private let leadMixer = AVAudioMixerNode()
    private let oceanMixer = AVAudioMixerNode()
    private let drumMixer = AVAudioMixerNode()
    private let synthLevelMixer = AVAudioMixerNode()
    private let granularLevelMixer = AVAudioMixerNode()
    private let leadLevelMixer = AVAudioMixerNode()
    private let drumLevelMixer = AVAudioMixerNode()
    private let synthReverbSendMixer = AVAudioMixerNode()
    private let granularReverbSendMixer = AVAudioMixerNode()
    private let leadReverbSendMixer = AVAudioMixerNode()
    private let drumReverbSendMixer = AVAudioMixerNode()
    private let oceanReverbSendMixer = AVAudioMixerNode()
    private let drumDelaySendMixer = AVAudioMixerNode()  // Delay send from drums
    private let drumDelayMixer = AVAudioMixerNode()      // Delay wet output
    private var drumDelayL: AVAudioUnitDelay?            // Left channel delay
    private var drumDelayR: AVAudioUnitDelay?            // Right channel delay
    private let dryMixer = AVAudioMixerNode()
    private let reverbSend = AVAudioMixerNode()
    private let masterMixer = AVAudioMixerNode()
    private let dynamicsBypassMixer = AVAudioMixerNode()
    private let outputBridgeMixer = AVAudioMixerNode()
    
    // MARK: - State
    private(set) var isRunning = false
    private var currentParams: SliderState = .default
    private var renderSampleRate: Double = 44_100
    private var harmonyState: HarmonyState?
    private var cofState = CircleOfFifthsState()
    private var currentBucket: String = ""
    private var currentSeed: Int = 0
    private var lastAppliedReverbEnabled: Bool = SliderState.default.reverbEnabled
    
    // Scheduling
    private var phraseTimer: Timer?
    private var noteTimer: Timer?
    
    // Dedicated queue for audio scheduling (avoids main thread jitter)
    private let audioSchedulingQueue = DispatchQueue(label: "com.kessho.audioScheduling", qos: .userInteractive)
    private var phraseTimerSource: DispatchSourceTimer?
    private var noteTimerSource: DispatchSourceTimer?
    private var filterModTimerSource: DispatchSourceTimer?
    
    // Filter modulation - random walk (matching web app)
    private var filterModValue: Double = 0.5  // 0-1, current position
    private var filterModVelocity: Double = 0  // Current velocity for momentum
    
    // Callback for state updates
    var onStateChange: ((EngineStateUpdate) -> Void)?
    
    // Callback for drum morph triggers (for UI visualization)
    var onDrumMorphTrigger: ((DrumVoiceType, Float) -> Void)?
    
    // Callback for drum triggers (for UI visualization)
    var onDrumTrigger: ((DrumVoiceType, Float) -> Void)?

    // Lightweight mixer signal diagnostics for device debugging.
    private var signalDebugCounters: [String: Int] = [:]
    private var signalDebugPeaks: [String: Float] = [:]
    
    // MARK: - Initialization

    public init() {
        setupAudioGraph()
    }
    
    private func setupAudioGraph() {
        let outputNode = engine.outputNode
        let outputFormat = outputNode.inputFormat(forBus: 0)
        renderSampleRate = outputFormat.sampleRate > 1_000 ? outputFormat.sampleRate : 44_100
        let format = AVAudioFormat(standardFormatWithSampleRate: renderSampleRate, channels: 2)!

        // AVAudioEngine requires both ends of a connection to be attached first.
        // Attach the shared routing mixers up front before connecting any sources.
        engine.attach(synthMixer)
        engine.attach(granularMixer)
        engine.attach(leadMixer)
        engine.attach(oceanMixer)
        engine.attach(drumMixer)
        engine.attach(synthLevelMixer)
        engine.attach(granularLevelMixer)
        engine.attach(leadLevelMixer)
        engine.attach(drumLevelMixer)
        engine.attach(synthReverbSendMixer)
        engine.attach(granularReverbSendMixer)
        engine.attach(leadReverbSendMixer)
        engine.attach(drumReverbSendMixer)
        engine.attach(oceanReverbSendMixer)
        engine.attach(drumDelaySendMixer)
        engine.attach(drumDelayMixer)
        engine.attach(dryMixer)
        engine.attach(reverbSend)
        engine.attach(masterMixer)
        engine.attach(dynamicsBypassMixer)
        engine.attach(outputBridgeMixer)

        // Create synth voices
        for _ in 0..<VOICE_COUNT {
            let voice = SynthVoice(sampleRate: Float(renderSampleRate))
            synthVoices.append(voice)
            engine.attach(voice.node)
            engine.connect(voice.node, to: synthMixer, format: format)
        }

        // Create processors
        granularProcessor = GranularProcessor(sampleRate: Float(renderSampleRate))
        if let granular = granularProcessor {
            engine.attach(granular.node)
            engine.connect(granular.node, to: granularMixer, format: format)
        }

        reverbProcessor = ReverbProcessor(sampleRate: Float(renderSampleRate))
        dynamicsCharacterProcessor = DynamicsCharacterProcessor(sampleRate: Float(renderSampleRate))
        leadSynth = LeadSynth(sampleRate: Float(renderSampleRate))
        oceanSynth = OceanSynth(sampleRate: Float(renderSampleRate))
        
        // Create Euclidean sequencer for lead
        euclideanSequencer = EuclideanSequencer()
        
        if let lead = leadSynth {
            engine.attach(lead.node)
            engine.connect(lead.node, to: leadMixer, format: format)
        }

        // Connect ocean synth after its destination mixer is attached
        if let ocean = oceanSynth {
            engine.attach(ocean.node)
            engine.connect(ocean.node, to: oceanMixer, format: format)
        }

        // Create ocean sample player and connect to ocean mixer
        oceanSamplePlayer = OceanSamplePlayer()
        oceanSamplePlayer?.setupConnections(engine: engine, outputMixer: oceanMixer)

        // Setup drum stereo ping-pong delay
        setupDrumDelay(format: format)
        
        // Connect dry path through dedicated level mixers so reverb sends can stay pre-fader.
        engine.connect(synthMixer, to: synthLevelMixer, format: format)
        engine.connect(synthLevelMixer, to: dryMixer, format: format)
        engine.connect(granularMixer, to: granularLevelMixer, format: format)
        engine.connect(granularLevelMixer, to: dryMixer, format: format)
        engine.connect(leadMixer, to: leadLevelMixer, format: format)
        engine.connect(leadLevelMixer, to: dryMixer, format: format)
        engine.connect(oceanMixer, to: dryMixer, format: format)
        engine.connect(drumMixer, to: drumLevelMixer, format: format)
        engine.connect(drumLevelMixer, to: dryMixer, format: format)
        engine.connect(drumDelayMixer, to: dryMixer, format: format)  // Delay wet goes to dry path

        // Setup reverb
        if let reverb = reverbProcessor {
            reverb.setSampleRate(Float(format.sampleRate))
            engine.attach(reverb.customNode)
            engine.attach(reverb.liteNode)
            engine.attach(reverb.customReturnMixer)
            engine.attach(reverb.liteReturnMixer)
            engine.attach(reverb.node)

            // Dedicated send taps preserve independent aux levels for each source.
            engine.connect(synthMixer, to: synthReverbSendMixer, format: format)
            engine.connect(synthReverbSendMixer, to: reverbSend, format: format)
            engine.connect(granularMixer, to: granularReverbSendMixer, format: format)
            engine.connect(granularReverbSendMixer, to: reverbSend, format: format)
            engine.connect(leadMixer, to: leadReverbSendMixer, format: format)
            engine.connect(leadReverbSendMixer, to: reverbSend, format: format)
            engine.connect(drumMixer, to: drumReverbSendMixer, format: format)
            engine.connect(drumReverbSendMixer, to: reverbSend, format: format)
            engine.connect(oceanMixer, to: oceanReverbSendMixer, format: format)
            engine.connect(oceanReverbSendMixer, to: reverbSend, format: format)

            // Lite mode stays available through Apple reverb, but custom FDN now has
            // its own live source node and return bus for parity-oriented presets.
            engine.connect(reverbSend, to: reverb.liteNode, format: format)
            engine.connect(reverb.customNode, to: reverb.customReturnMixer, format: format)
            engine.connect(reverb.customReturnMixer, to: reverb.node, format: format)
            engine.connect(reverb.liteNode, to: reverb.liteReturnMixer, format: format)
            engine.connect(reverb.liteReturnMixer, to: reverb.node, format: format)

            // Reverb output to master
            engine.connect(reverb.node, to: masterMixer, format: format)
        }
        
        // Dry to master
        engine.connect(dryMixer, to: masterMixer, format: format)

        // Use an explicit final bridge into the hardware output instead of
        // relying on AVAudioEngine's implicit main-mixer handoff.
        outputBridgeMixer.outputVolume = 1.0
        dynamicsBypassMixer.outputVolume = 1.0
        if let character = dynamicsCharacterProcessor {
            engine.attach(character.node)
            engine.connect(character.node, to: outputBridgeMixer, format: format)
        }
        engine.connect(masterMixer, to: dynamicsBypassMixer, format: format)
        engine.connect(dynamicsBypassMixer, to: outputBridgeMixer, format: format)
        engine.connect(outputBridgeMixer, to: outputNode, format: outputFormat)

        #if DEBUG
        installSignalDebugTap(on: leadLevelMixer, label: "lead")
        #endif

        // Setup tap on synth mixer for granular live input
        setupGranularInputTap(format: format)
        setupReverbInputTap(format: format)
        setupDynamicsCharacterInputTap(format: format)
        
        // Prepare engine
        engine.prepare()
    }

    private func installSignalDebugTap(on node: AVAudioMixerNode, label: String) {
        let format = node.outputFormat(forBus: 0)
        node.removeTap(onBus: 0)
        node.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let self,
                  let channelData = buffer.floatChannelData,
                  buffer.frameLength > 0 else { return }

            let samples = channelData[0]
            let frameCount = Int(buffer.frameLength)
            var peak: Float = 0
            for frame in 0..<frameCount {
                peak = max(peak, abs(samples[frame]))
            }

            let nextCount = (self.signalDebugCounters[label] ?? 0) + 1
            self.signalDebugCounters[label] = nextCount
            self.signalDebugPeaks[label] = max(self.signalDebugPeaks[label] ?? 0, peak)

            if nextCount >= 24 {
                let loggedPeak = self.signalDebugPeaks[label] ?? 0
                self.signalDebugCounters[label] = 0
                self.signalDebugPeaks[label] = 0
                DispatchQueue.main.async {
                    print("AudioEngine signal \(label): peak=\(loggedPeak)")
                }
            }
        }
    }
    
    /// Install a tap on synth mixer to feed audio to granular processor
    private func setupGranularInputTap(format: AVAudioFormat) {
        // Match the preferred IO buffer size more closely so granular input stays
        // phase-aligned with the native render callback instead of arriving in
        // large snapshots.
        synthMixer.installTap(onBus: 0, bufferSize: 256, format: format) { [weak self] buffer, _ in
            guard let self, self.currentParams.granularEnabled else { return }
            self.processGranularInput(buffer: buffer)
        }
    }

    /// Feed the parity-oriented custom reverb from the shared aux input bus.
    private func setupReverbInputTap(format: AVAudioFormat) {
        reverbSend.removeTap(onBus: 0)
        reverbSend.installTap(onBus: 0, bufferSize: 256, format: format) { [weak self] buffer, _ in
            guard let self, self.currentParams.reverbEnabled else { return }
            self.reverbProcessor?.writeInput(buffer: buffer)
        }
    }

    private func setupDynamicsCharacterInputTap(format: AVAudioFormat) {
        masterMixer.removeTap(onBus: 0)
        masterMixer.installTap(onBus: 0, bufferSize: 128, format: format) { [weak self] buffer, _ in
            guard let self,
                  self.currentParams.dynamicsEnabled,
                  self.currentParams.characterEnabled || self.currentParams.degradeEnabled || self.currentParams.endCompEnabled
            else { return }
            self.dynamicsCharacterProcessor?.writeInput(buffer: buffer)
        }
    }

    /// Process incoming synth audio and send to granular processor
    private func processGranularInput(buffer: AVAudioPCMBuffer) {
        granularProcessor?.writeInput(buffer: buffer)
    }
    
    // MARK: - Playback Control
    
    public func start(with params: SliderState) {
        guard !isRunning else { return }

        currentParams = params
        print(
            "AudioEngine start state:",
            "master=\(currentParams.masterVolume)",
            "synth=\(currentParams.synthLevel)",
            "granularEnabled=\(currentParams.granularEnabled)",
            "granular=\(currentParams.granularLevel)",
            "leadEnabled=\(currentParams.leadEnabled)",
            "lead=\(currentParams.leadLevel)",
            "euclidMaster=\(currentParams.synthEuclideanMasterEnabled)",
            "chordSeq=\(currentParams.synthChordSequencerEnabled)",
            "bridgeFormat=\(outputBridgeMixer.outputFormat(forBus: 0))",
            "outputFormat=\(engine.outputNode.inputFormat(forBus: 0))"
        )
        updateBucket()
        initializeHarmony()
        updateEuclideanSequencer()
        
        // Create DrumSynth AFTER initializeHarmony sets up RNG
        // This is a critical learning from the web implementation!
        createDrumSynth()
        
        do {
            // Apply startup state before the render thread begins touching DSP state.
            sendGranulatorRandomSequence()
            applyParams()

            engine.prepare()
            try engine.start()
            isRunning = true

            // Kick off the currently selected musical state immediately so native
            // playback is audible on first tap instead of waiting for the next phrase boundary.
            if let harmony = harmonyState {
                triggerChord(harmony.currentChord)
            }
            if currentParams.synthEuclideanMasterEnabled {
                scheduleEuclideanPhrase()
            } else if currentParams.leadEnabled {
                triggerImmediateLeadNote()
                scheduleRandomLeadPhrase()
            }

            // Start scheduling
            startPhraseScheduler()
            startNoteScheduler()
            startFilterModulation()
            startEuclideanScheduler()
            
            // Start ocean sample if enabled
            if currentParams.oceanSampleEnabled {
                oceanSamplePlayer?.startPlayback()
            }
            
            // Start drum synth if enabled
            drumSynth?.start()

        } catch {
            print("Failed to start audio engine: \(error)")
        }
    }

    private func triggerImmediateLeadNote() {
        guard currentParams.leadEnabled,
              !currentParams.synthEuclideanMasterEnabled,
              let harmony = harmonyState else { return }

        let baseOctaveOffset = currentParams.leadOctave
        let octaveRange = currentParams.leadOctaveRange
        let baseLow = 64 + (baseOctaveOffset * 12)
        let baseHigh = baseLow + max(12, octaveRange * 12)
        let scaleNotes = getScaleNotesInRange(
            scale: harmony.scaleFamily,
            lowMidi: max(24, baseLow),
            highMidi: min(108, baseHigh),
            rootNote: cofState.effectiveRoot
        )

        guard !scaleNotes.isEmpty else { return }

        let noteIndex = min(scaleNotes.count - 1, max(0, scaleNotes.count / 2))
        let midiNote = scaleNotes[noteIndex]
        let rng = createRng("\(currentBucket)|\(currentSeed)|lead|immediate")

        leadSynth?.randomizeTimbre(rng)
        leadSynth?.randomizeExpression(rng)
        leadSynth?.randomizeDelay(rng)
        leadSynth?.playNote(midiNote: midiNote, velocity: 0.72)

        print("AudioEngine immediate lead note:", midiNote)
    }
    
    /// Create DrumSynth after harmony is initialized (provides RNG)
    /// This must be called AFTER initializeHarmony() - critical learning from web implementation!
    private func createDrumSynth() {
        let format = AVAudioFormat(standardFormatWithSampleRate: renderSampleRate, channels: 2)!

        // Set up seeded RNG for deterministic randomness
        let rng = createRng("\(currentBucket)|\(currentSeed)|drum")

        if let existingDrumSynth = drumSynth {
            existingDrumSynth.stop()
            existingDrumSynth.setRng(rng)
            existingDrumSynth.onDrumTrigger = { [weak self] voiceType, velocity in
                self?.onDrumTrigger?(voiceType, velocity)
            }
            existingDrumSynth.onMorphTrigger = { [weak self] voiceType, morphValue in
                self?.onDrumMorphTrigger?(voiceType, Float(morphValue))
            }
            existingDrumSynth.updateParams(currentParams)
            return
        }

        let newDrumSynth = DrumSynth(sampleRate: Float(renderSampleRate))
        drumSynth = newDrumSynth
        newDrumSynth.setRng(rng)

        // Wire up drum trigger callback for UI visualization
        newDrumSynth.onDrumTrigger = { [weak self] voiceType, velocity in
            self?.onDrumTrigger?(voiceType, velocity)
        }

        // Wire up morph trigger callback for UI visualization
        newDrumSynth.onMorphTrigger = { [weak self] voiceType, morphValue in
            self?.onDrumMorphTrigger?(voiceType, Float(morphValue))
        }

        // Attach and connect to drum mixer
        engine.attach(newDrumSynth.node)
        engine.connect(newDrumSynth.node, to: drumMixer, format: format)
        // Also connect to delay send
        engine.connect(newDrumSynth.node, to: drumDelaySendMixer, format: format)

        // Set initial parameters
        newDrumSynth.updateParams(currentParams)
    }
    
    // Note division to beat fraction mapping (matching web app)
    private let noteDivisions: [String: Double] = [
        "1/1": 4.0,       // Whole note (4 beats)
        "1/2": 2.0,       // Half note
        "1/2d": 3.0,      // Dotted half
        "1/4": 1.0,       // Quarter note
        "1/4d": 1.5,      // Dotted quarter
        "1/4t": 2.0/3.0,  // Quarter triplet
        "1/8": 0.5,       // Eighth note
        "1/8d": 0.75,     // Dotted eighth
        "1/8t": 1.0/3.0,  // Eighth triplet
        "1/16": 0.25,     // Sixteenth
        "1/16d": 0.375,   // Dotted sixteenth
        "1/16t": 1.0/6.0, // Sixteenth triplet
        "1/32": 0.125     // Thirty-second
    ]
    
    /// Convert note division string to time in seconds based on BPM
    private func noteToSeconds(_ note: String, bpm: Double) -> Double {
        let beats = noteDivisions[note] ?? 0.5  // Default to 1/8
        return (60.0 / bpm) * beats
    }
    
    /// Setup stereo ping-pong delay for drum synth
    private func setupDrumDelay(format: AVAudioFormat) {
        // Create left and right delays
        drumDelayL = AVAudioUnitDelay()
        drumDelayR = AVAudioUnitDelay()
        
        guard let delayL = drumDelayL, let delayR = drumDelayR else { return }
        
        // Configure delays with initial values
        let bpm = currentParams.drumEuclidBaseBPM
        delayL.delayTime = noteToSeconds(currentParams.drumDelayNoteL, bpm: bpm)
        delayR.delayTime = noteToSeconds(currentParams.drumDelayNoteR, bpm: bpm)
        delayL.feedback = Float(currentParams.drumDelayFeedback * 50)  // AVAudioUnitDelay uses 0-100 scale
        delayR.feedback = Float(currentParams.drumDelayFeedback * 50)
        delayL.wetDryMix = 100  // Fully wet, we'll control mix with mixer volume
        delayR.wetDryMix = 100
        delayL.lowPassCutoff = Float(500 * pow(32, currentParams.drumDelayFilter))
        delayR.lowPassCutoff = Float(500 * pow(32, currentParams.drumDelayFilter))
        
        // Attach delays
        engine.attach(delayL)
        engine.attach(delayR)
        
        // Create stereo splitter for ping-pong effect
        // Input -> both delays -> panned outputs
        engine.connect(drumDelaySendMixer, to: delayL, format: format)
        engine.connect(drumDelaySendMixer, to: delayR, format: format)
        
        // Create panners for stereo positioning
        let pannerL = AVAudioMixerNode()
        let pannerR = AVAudioMixerNode()
        engine.attach(pannerL)
        engine.attach(pannerR)
        pannerL.pan = -0.8  // Hard left
        pannerR.pan = 0.8   // Hard right
        
        // Connect delays through panners to output
        engine.connect(delayL, to: pannerL, format: format)
        engine.connect(delayR, to: pannerR, format: format)
        engine.connect(pannerL, to: drumDelayMixer, format: format)
        engine.connect(pannerR, to: drumDelayMixer, format: format)
        
        // Set initial mix level (disabled by default)
        drumDelayMixer.outputVolume = currentParams.drumDelayEnabled ? Float(currentParams.drumDelayMix) : 0
        drumDelaySendMixer.outputVolume = 0.5  // Moderate send level
    }
    
    /// Update drum delay parameters
    private func updateDrumDelay() {
        let bpm = currentParams.drumEuclidBaseBPM
        
        if let delayL = drumDelayL {
            delayL.delayTime = noteToSeconds(currentParams.drumDelayNoteL, bpm: bpm)
            delayL.feedback = Float(min(currentParams.drumDelayFeedback * 50, 95))  // Cap at 95%
            delayL.lowPassCutoff = Float(500 * pow(32, currentParams.drumDelayFilter))
        }
        
        if let delayR = drumDelayR {
            delayR.delayTime = noteToSeconds(currentParams.drumDelayNoteR, bpm: bpm)
            delayR.feedback = Float(min(currentParams.drumDelayFeedback * 50, 95))
            delayR.lowPassCutoff = Float(500 * pow(32, currentParams.drumDelayFilter))
        }
        
        // Update mix level
        drumDelayMixer.outputVolume = currentParams.drumDelayEnabled ? Float(currentParams.drumDelayMix) : 0
    }

    public func stop(fadeOut: Bool = true) {
        guard isRunning else { return }
        
        // Cancel old Timer-based timers (if any)
        phraseTimer?.invalidate()
        noteTimer?.invalidate()
        euclideanTimer?.invalidate()
        phraseTimer = nil
        noteTimer = nil
        euclideanTimer = nil
        
        // Cancel DispatchSource timers
        phraseTimerSource?.cancel()
        noteTimerSource?.cancel()
        filterModTimerSource?.cancel()
        phraseTimerSource = nil
        noteTimerSource = nil
        filterModTimerSource = nil
        
        // Cancel all pre-scheduled notes
        for item in scheduledEuclideanNotes {
            item.cancel()
        }
        scheduledEuclideanNotes.removeAll()
        
        for item in scheduledLeadNotes {
            item.cancel()
        }
        scheduledLeadNotes.removeAll()
        
        if !fadeOut {
            oceanSamplePlayer?.stopPlayback()
            drumSynth?.stop()
            granularProcessor?.hardReset()
            reverbProcessor?.hardReset()
            dynamicsCharacterProcessor?.hardReset()
            oceanSynth?.hardReset()
            leadSynth?.hardReset()
            for voice in synthVoices {
                voice.hardReset()
            }
            synthLevelMixer.outputVolume = 0
            granularLevelMixer.outputVolume = 0
            leadLevelMixer.outputVolume = 0
            oceanMixer.outputVolume = 0
            drumLevelMixer.outputVolume = 0
            synthReverbSendMixer.outputVolume = 0
            granularReverbSendMixer.outputVolume = 0
            leadReverbSendMixer.outputVolume = 0
            drumReverbSendMixer.outputVolume = 0
            oceanReverbSendMixer.outputVolume = 0
            drumDelaySendMixer.outputVolume = 0
            drumDelayMixer.outputVolume = 0
            dryMixer.outputVolume = 0
            reverbSend.outputVolume = 0
            masterMixer.outputVolume = 0
            dynamicsBypassMixer.outputVolume = 0
            outputBridgeMixer.outputVolume = 0
            engine.pause()
            engine.stop()
            engine.reset()
            isRunning = false
            return
        }

        // Stop ocean sample
        oceanSamplePlayer?.stopPlayback()

        // Stop drum synth
        drumSynth?.stop()

        // Fade out voices
        for voice in synthVoices {
            voice.releaseNote()
        }
        leadSynth?.releaseNote()

        audioSchedulingQueue.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.engine.stop()
            self?.isRunning = false
        }
    }

    public func updateParams(_ params: SliderState) {
        currentParams = params
        
        // Update CoF state
        cofState.homeRoot = params.rootNote
        cofState.driftEnabled = params.cofDriftEnabled
        cofState.driftRate = params.cofDriftRate
        cofState.driftDirection = params.cofDriftDirection
        cofState.driftRange = params.cofDriftRange
        
        if isRunning {
            applyParams()
        }
    }
    
    public func resetCofDrift() {
        cofState.resetDrift()
        notifyStateChange()
    }
    
    /// Trigger a drum voice manually for sound design testing
    func triggerDrumVoice(_ type: DrumVoiceType, velocity: Float = 0.8) {
        // Ensure engine is initialized even if not running
        if drumSynth == nil {
            // Try to start the engine briefly to create drum synth
            do {
                if !engine.isRunning {
                    try engine.start()
                }
                createDrumSynth()
            } catch {
                print("Failed to start engine for drum test: \(error)")
                return
            }
        }
        drumSynth?.triggerVoice(type, velocity: velocity)
    }
    
    /// Set morph range for a drum voice (for randomization during playback)
    /// - Parameters:
    ///   - voiceType: The drum voice to set morph range for
    ///   - range: Tuple of (min, max) morph values (0-1), or nil to disable
    func setDrumMorphRange(_ voiceType: DrumVoiceType, range: (min: Double, max: Double)?) {
        drumSynth?.setMorphRange(voiceType, range: range)
    }
    
    /// Get the current morph manager for external access
    func getDrumMorphManager() -> DrumMorphManager? {
        return drumSynth?.morphManager
    }
    
    // MARK: - Internal Methods
    
    private func updateBucket() {
        currentBucket = getUtcBucket(currentParams.seedWindow)
        
        // Compute seed from bucket and params hash
        if let jsonData = try? JSONEncoder().encode(currentParams),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            currentSeed = Int(computeSeed(bucket: currentBucket, sliderStateJson: jsonString))
        }
    }
    
    private func initializeHarmony() {
        let effectiveRoot = cofState.effectiveRoot
        
        harmonyState = createHarmonyState(
            seedMaterial: "\(currentBucket)|\(currentSeed)",
            tension: currentParams.tension,
            chordRate: Double(currentParams.chordRate),
            voicingSpread: currentParams.waveSpread,
            detuneCents: currentParams.detune,
            scaleMode: currentParams.scaleMode,
            manualScaleName: currentParams.manualScale,
            rootNote: effectiveRoot
        )
        
        notifyStateChange()
    }
    
    private func applyParams() {
        // Master volume
        masterMixer.outputVolume = Float(currentParams.masterVolume)
        dryMixer.outputVolume = 1
        reverbSend.outputVolume = 1
        outputBridgeMixer.outputVolume = 1
        dynamicsCharacterProcessor?.setParameters(from: currentParams)
        dynamicsBypassMixer.outputVolume = (dynamicsCharacterProcessor?.isAudible ?? false) ? 0 : 1
        oceanMixer.outputVolume = 1
        drumDelaySendMixer.outputVolume = 0.5

        // Source dry levels live on dedicated mixers so reverb sends stay pre-fader.
        synthLevelMixer.outputVolume = Float(currentParams.synthLevel)
        granularLevelMixer.outputVolume = Float(currentParams.granularEnabled ? currentParams.granularLevel : 0)
        leadLevelMixer.outputVolume = Float(currentParams.leadEnabled ? currentParams.leadLevel : 0)
        drumLevelMixer.outputVolume = Float(currentParams.drumEnabled ? currentParams.drumLevel : 0)

        // Reverb sends stay independent of dry faders like the web graph.
        let reverbEnabled = currentParams.reverbEnabled
        synthReverbSendMixer.outputVolume = reverbEnabled ? Float(currentParams.synthReverbSend) : 0
        granularReverbSendMixer.outputVolume = (reverbEnabled && currentParams.granularEnabled) ? Float(currentParams.granularReverbSend) : 0
        leadReverbSendMixer.outputVolume = (reverbEnabled && currentParams.leadEnabled) ? Float(currentParams.leadReverbSend) : 0
        drumReverbSendMixer.outputVolume = (reverbEnabled && currentParams.drumEnabled) ? Float(currentParams.drumReverbSend) : 0
        let oceanActive = currentParams.oceanSampleEnabled || currentParams.oceanWaveSynthEnabled
        oceanReverbSendMixer.outputVolume = (reverbEnabled && oceanActive) ? Float(currentParams.oceanReverbSend) : 0

        // Update reverb quality mode
        if let quality = ReverbQuality(rawValue: currentParams.reverbQuality.capitalized) {
            reverbProcessor?.setQuality(quality)
        } else if currentParams.reverbQuality == "ultra" {
            reverbProcessor?.setQuality(.ultra)
        } else if currentParams.reverbQuality == "balanced" {
            reverbProcessor?.setQuality(.balanced)
        } else if currentParams.reverbQuality == "lite" {
            reverbProcessor?.setQuality(.lite)
        }
        
        // Update reverb type (preset)
        reverbProcessor?.setType(currentParams.reverbType)
        
        // Update reverb with all parameters
        reverbProcessor?.setParameters(
            decay: Float(currentParams.reverbDecay),
            mix: reverbEnabled ? Float(currentParams.reverbLevel * 100) : 0,
            size: Float(currentParams.reverbSize),
            diffusion: Float(currentParams.reverbDiffusion),
            modulation: Float(currentParams.reverbModulation),
            predelay: Float(currentParams.predelay / 1000.0),  // Convert ms to seconds
            width: Float(currentParams.width),
            damping: Float(currentParams.damping)
        )
        if !reverbEnabled && lastAppliedReverbEnabled {
            reverbProcessor?.hardReset()
        }
        lastAppliedReverbEnabled = reverbEnabled
        
        // Update granular with all parameters
        granularProcessor?.setDensity(Float(currentParams.density / 100.0))  // Normalize to 0-1
        granularProcessor?.setGrainSize(
            min: Float(currentParams.grainSizeMin / 1000.0),  // Convert ms to seconds
            max: Float(currentParams.grainSizeMax / 1000.0)
        )
        granularProcessor?.setMaxGrains(Int(currentParams.maxGrains))
        granularProcessor?.setSpray(Float(currentParams.spray / 1000.0))  // Convert ms to seconds
        granularProcessor?.setJitter(Float(currentParams.jitter / 100.0))  // Normalize
        granularProcessor?.setFeedback(Float(currentParams.feedback))
        granularProcessor?.setPitchMode(currentParams.grainPitchMode == "harmonic" ? 1 : 0)
        granularProcessor?.setProbability(Float(currentParams.grainProbability))
        granularProcessor?.setStereoSpread(Float(currentParams.stereoSpread))
        granularProcessor?.setPitchSpread(Float(currentParams.pitchSpread))
        granularProcessor?.setWetFilters(
            hpf: Float(currentParams.wetHPF),
            lpf: Float(currentParams.wetLPF)
        )
        
        // Update synth voices with all parameters
        let voiceMask = currentParams.synthVoiceMask
        for (i, voice) in synthVoices.enumerated() {
            // Apply voice mask (enable/disable individual voices)
            let isEnabled = (voiceMask >> i) & 1 == 1
            voice.setEnabled(isEnabled)
            
            voice.setADSR(
                attack: Float(currentParams.synthAttack),
                decay: Float(currentParams.synthDecay),
                sustain: Float(currentParams.synthSustain),
                release: Float(currentParams.synthRelease)
            )
            voice.setHardness(Float(currentParams.hardness))
            voice.setOscBrightness(Int(currentParams.oscBrightness))
            voice.setDetune(Float(currentParams.detune))
            // Convert filterType string to int: lowpass=0, highpass=1, bandpass=2, notch=3
            let filterTypeInt: Int
            switch currentParams.filterType {
            case "highpass": filterTypeInt = 1
            case "bandpass": filterTypeInt = 2
            case "notch": filterTypeInt = 3
            default: filterTypeInt = 0  // lowpass
            }
            voice.setFilterType(filterTypeInt)
            voice.setToneShaping(
                warmth: Float(currentParams.warmth),
                presence: Float(currentParams.presence),
                airNoise: Float(currentParams.airNoise)
            )
            voice.setOctaveShift(currentParams.synthOctave)
            voice.setFilterParams(
                cutoff: Float(currentParams.filterCutoffMin),
                resonance: Float(currentParams.filterResonance),
                q: Float(currentParams.filterQ)
            )
        }
        
        // Update lead synth with all parameters
        leadSynth?.setEnabled(currentParams.leadEnabled)
        leadSynth?.setADSR(
            attack: Float(currentParams.leadAttack),
            decay: Float(currentParams.leadDecay),
            sustain: Float(currentParams.leadSustain),
            hold: Float(currentParams.leadHold),
            release: Float(currentParams.leadRelease)
        )
        leadSynth?.setTimbreRange(
            min: Float(currentParams.leadTimbreMin),
            max: Float(currentParams.leadTimbreMax)
        )
        leadSynth?.setDelayRange(
            timeMin: Float(currentParams.leadDelayTimeMin / 1000.0),  // Convert ms to seconds
            timeMax: Float(currentParams.leadDelayTimeMax / 1000.0),
            feedbackMin: Float(currentParams.leadDelayFeedbackMin),
            feedbackMax: Float(currentParams.leadDelayFeedbackMax),
            mixMin: Float(currentParams.leadDelayMixMin),
            mixMax: Float(currentParams.leadDelayMixMax)
        )
        leadSynth?.setGlideRange(
            min: Float(currentParams.leadGlideMin),
            max: Float(currentParams.leadGlideMax)
        )
        leadSynth?.setVibratoRange(
            depthMin: Float(currentParams.leadVibratoDepthMin * 0.5),  // 0-0.5 semitones
            depthMax: Float(currentParams.leadVibratoDepthMax * 0.5),
            rateMin: Float(2 + currentParams.leadVibratoRateMin * 6),  // 2-8 Hz
            rateMax: Float(2 + currentParams.leadVibratoRateMax * 6)
        )
        // Note: leadOctave/leadOctaveRange are used directly in scheduleLeadMelodyPhrase()
        // to calculate note range, not passed to the synth
        
        // Update Euclidean sequencer
        updateEuclideanSequencer()
        
        // Update ocean wave synth with proper min/max ranges (not averaged values)
        oceanSynth?.setEnabled(currentParams.oceanWaveSynthEnabled)
        oceanSynth?.setLevel(Float(currentParams.oceanWaveSynthLevel))
        oceanSynth?.setSeed(currentSeed)  // Set seeded RNG for deterministic wave generation
        oceanSynth?.setWaveDuration(
            min: Float(currentParams.oceanDurationMin),
            max: Float(currentParams.oceanDurationMax)
        )
        oceanSynth?.setWaveInterval(
            min: Float(currentParams.oceanIntervalMin),
            max: Float(currentParams.oceanIntervalMax)
        )
        oceanSynth?.setFoam(
            min: Float(currentParams.oceanFoamMin),
            max: Float(currentParams.oceanFoamMax)
        )
        oceanSynth?.setDepth(
            min: Float(currentParams.oceanDepthMin),
            max: Float(currentParams.oceanDepthMax)
        )
        
        // Update ocean sample player
        oceanSamplePlayer?.setEnabled(currentParams.oceanSampleEnabled)
        oceanSamplePlayer?.setLevel(Float(currentParams.oceanSampleLevel))
        oceanSamplePlayer?.setFilter(
            cutoff: Float(currentParams.oceanFilterCutoff),
            resonance: Float(currentParams.oceanFilterResonance)
        )
        
        // Update drum synth
        drumSynth?.updateParams(currentParams)
        
        // Update drum delay
        updateDrumDelay()
    }
    
    /// Update Euclidean sequencer lanes from current parameters
    private func updateEuclideanSequencer() {
        guard let seq = euclideanSequencer else { return }
        
        seq.masterEnabled = currentParams.synthEuclideanMasterEnabled
        seq.tempo = currentParams.synthEuclideanTempo
        
        // Lane 1
        seq.lanes[0].enabled = currentParams.synthEuclid1Enabled
        seq.lanes[0].steps = currentParams.synthEuclid1Steps
        seq.lanes[0].hits = currentParams.synthEuclid1Hits
        seq.lanes[0].rotation = currentParams.synthEuclid1Rotation
        seq.lanes[0].noteMin = currentParams.synthEuclid1NoteMin
        seq.lanes[0].noteMax = currentParams.synthEuclid1NoteMax
        seq.lanes[0].level = Float(currentParams.synthEuclid1Level)
        seq.lanes[0].regeneratePattern()
        
        // Lane 2
        seq.lanes[1].enabled = currentParams.synthEuclid2Enabled
        seq.lanes[1].steps = currentParams.synthEuclid2Steps
        seq.lanes[1].hits = currentParams.synthEuclid2Hits
        seq.lanes[1].rotation = currentParams.synthEuclid2Rotation
        seq.lanes[1].noteMin = currentParams.synthEuclid2NoteMin
        seq.lanes[1].noteMax = currentParams.synthEuclid2NoteMax
        seq.lanes[1].level = Float(currentParams.synthEuclid2Level)
        seq.lanes[1].regeneratePattern()
        
        // Lane 3
        seq.lanes[2].enabled = currentParams.synthEuclid3Enabled
        seq.lanes[2].steps = currentParams.synthEuclid3Steps
        seq.lanes[2].hits = currentParams.synthEuclid3Hits
        seq.lanes[2].rotation = currentParams.synthEuclid3Rotation
        seq.lanes[2].noteMin = currentParams.synthEuclid3NoteMin
        seq.lanes[2].noteMax = currentParams.synthEuclid3NoteMax
        seq.lanes[2].level = Float(currentParams.synthEuclid3Level)
        seq.lanes[2].regeneratePattern()
        
        // Lane 4
        seq.lanes[3].enabled = currentParams.synthEuclid4Enabled
        seq.lanes[3].steps = currentParams.synthEuclid4Steps
        seq.lanes[3].hits = currentParams.synthEuclid4Hits
        seq.lanes[3].rotation = currentParams.synthEuclid4Rotation
        seq.lanes[3].noteMin = currentParams.synthEuclid4NoteMin
        seq.lanes[3].noteMax = currentParams.synthEuclid4NoteMax
        seq.lanes[3].level = Float(currentParams.synthEuclid4Level)
        seq.lanes[3].regeneratePattern()
    }
    
    /// Send pre-seeded random sequence to granular processor for deterministic synthesis (matching web app)
    private func sendGranulatorRandomSequence() {
        let rng = createRng("\(currentBucket)|\(currentSeed)|granular")
        let sequence = generateRandomSequence(rng, count: 10000)
        granularProcessor?.setRandomSequence(sequence)
    }
    
    // MARK: - Scheduling
    
    private func startPhraseScheduler() {
        // Schedule at phrase boundaries using dedicated queue (avoids main thread jitter)
        let timeUntilNext = getTimeUntilNextPhrase()
        
        phraseTimerSource?.cancel()
        phraseTimerSource = DispatchSource.makeTimerSource(queue: audioSchedulingQueue)
        
        // Initial one-shot to align with phrase boundary, then repeating
        phraseTimerSource?.schedule(deadline: .now() + timeUntilNext)
        phraseTimerSource?.setEventHandler { [weak self] in
            guard let self = self, self.isRunning else { return }
            self.onPhraseBoundary()
            
            // Switch to repeating timer after initial alignment
            self.phraseTimerSource?.schedule(deadline: .now() + PHRASE_LENGTH, repeating: PHRASE_LENGTH)
        }
        phraseTimerSource?.resume()
    }
    
    private func onPhraseBoundary() {
        // Update bucket (in case hour/day changed)
        updateBucket()
        
        // Update Circle of Fifths
        let rng = createRng("\(currentBucket)|\(currentSeed)|cof")
        _ = cofState.updateAtPhraseBoundary(rng: rng)
        
        // Reseed granular processor for this phrase
        sendGranulatorRandomSequence()
        
        // Update harmony
        if let state = harmonyState {
            let effectiveRoot = cofState.effectiveRoot
            let phraseIndex = getCurrentPhraseIndex()
            
            harmonyState = updateHarmonyState(
                state: state,
                seedMaterial: "\(currentBucket)|\(currentSeed)",
                phraseIndex: phraseIndex,
                tension: currentParams.tension,
                chordRate: Double(currentParams.chordRate),
                voicingSpread: currentParams.waveSpread,
                detuneCents: currentParams.detune,
                scaleMode: currentParams.scaleMode,
                manualScaleName: currentParams.manualScale,
                rootNote: effectiveRoot
            )
            
            // Trigger new chord notes
            if let harmony = harmonyState {
                triggerChord(harmony.currentChord)
            }
        }
        
        // Check if Euclidean has any synth-source lanes enabled (independent of leadEnabled)
        let euclideanSynthLanesEnabled = currentParams.synthEuclideanMasterEnabled && (
            (currentParams.synthEuclid1Enabled && currentParams.synthEuclid1Source != "lead") ||
            (currentParams.synthEuclid2Enabled && currentParams.synthEuclid2Source != "lead") ||
            (currentParams.synthEuclid3Enabled && currentParams.synthEuclid3Source != "lead") ||
            (currentParams.synthEuclid4Enabled && currentParams.synthEuclid4Source != "lead")
        )
        
        // Pre-schedule notes for this phrase (matching web's precise scheduling)
        if currentParams.leadEnabled || euclideanSynthLanesEnabled {
            if currentParams.synthEuclideanMasterEnabled {
                scheduleEuclideanPhrase()
            } else if currentParams.leadEnabled {
                scheduleRandomLeadPhrase()
            }
        }
        
        notifyStateChange()
    }
    
    private func startNoteScheduler() {
        // Schedule note events at regular intervals using dedicated queue
        noteTimerSource?.cancel()
        noteTimerSource = DispatchSource.makeTimerSource(queue: audioSchedulingQueue)
        noteTimerSource?.schedule(deadline: .now(), repeating: 0.5)
        noteTimerSource?.setEventHandler { [weak self] in
            guard let self = self, self.isRunning else { return }
            self.onNoteEvent()
        }
        noteTimerSource?.resume()
    }
    
    private func onNoteEvent() {
        guard let harmony = harmonyState else { return }
        
        let rng = createRng("\(currentBucket)|\(currentSeed)|note|\(Date().timeIntervalSince1970)")
        
        // Occasional note retriggers based on randomness
        if rng() < currentParams.randomness * 0.3 {
            let voiceIndex = rngInt(rng, min: 0, max: synthVoices.count - 1)
            if voiceIndex < harmony.currentChord.frequencies.count {
                let freq = harmony.currentChord.frequencies[voiceIndex]
                synthVoices[voiceIndex].trigger(frequency: Float(freq), velocity: Float(rng() * 0.3 + 0.4))
            }
        }
        
        // Lead melody is now handled by scheduleRandomLeadPhrase() at phrase boundaries
        // for deterministic pre-scheduling like the web app
    }
    
    /// Pre-schedule random lead notes for the phrase (matching web's deterministic scheduling)
    private func scheduleRandomLeadPhrase() {
        // Cancel any existing scheduled notes
        for item in scheduledLeadNotes {
            item.cancel()
        }
        scheduledLeadNotes.removeAll()
        
        guard currentParams.leadEnabled,
              !currentParams.synthEuclideanMasterEnabled,
              let harmony = harmonyState else { return }
        
        let phraseDuration = PHRASE_LENGTH  // 16 seconds in ms
        let density = currentParams.leadDensity
        let scale = harmony.scaleFamily
        let effectiveRoot = cofState.effectiveRoot
        
        // Create deterministic RNG for this phrase
        let phraseIndex = getCurrentPhraseIndex()
        let rng = createRng("\(currentBucket)|\(currentSeed)|lead|\(phraseIndex)")
        
        // Calculate number of notes this phrase (matching web: density * 3 + random 0-2)
        let notesThisPhrase = max(1, Int(density * 3 + rng() * 2))
        
        // Get note range based on octave settings
        let baseOctaveOffset = currentParams.leadOctave
        let octaveRange = currentParams.leadOctaveRange
        let baseLow = 64 + (baseOctaveOffset * 12)
        let baseHigh = baseLow + (octaveRange * 12)
        
        // Get scale notes in range
        let scaleNotes = getScaleNotesInRange(
            scale: scale,
            lowMidi: max(24, baseLow),
            highMidi: min(108, baseHigh),
            rootNote: effectiveRoot
        )
        
        guard !scaleNotes.isEmpty else { return }
        
        // Schedule notes at random times within the phrase
        for noteIndex in 0..<notesThisPhrase {
            let timing = rng() * phraseDuration
            let velocity = Float(rng() * 0.4 + 0.3)
            
            // Pick a note from scale using seeded RNG (not .randomElement())
            let noteIdx = Int(rng() * Double(scaleNotes.count)) % scaleNotes.count
            let note = scaleNotes[noteIdx]
            
            // Create per-note RNG for timbre/expression/delay randomization
            let noteRng = createRng("\(currentBucket)|\(currentSeed)|lead|\(phraseIndex)|\(noteIndex)")
            
            let workItem = DispatchWorkItem { [weak self] in
                guard let self = self, self.isRunning else { return }
                self.leadSynth?.randomizeTimbre(noteRng)
                self.leadSynth?.randomizeExpression(noteRng)
                self.leadSynth?.randomizeDelay(noteRng)
                self.leadSynth?.playNote(midiNote: note, velocity: velocity)
            }
            
            scheduledLeadNotes.append(workItem)
            audioSchedulingQueue.asyncAfter(deadline: .now() + timing, execute: workItem)
        }
    }
    
    // MARK: - Euclidean Sequencer (Pre-Scheduled like Web)
    
    private func startEuclideanScheduler() {
        // Instead of timer ticks, schedule all notes for the phrase at phrase boundary
        // Initial scheduling happens when lead is enabled and euclidean is on
        scheduleEuclideanPhrase()
    }
    
    /// Pre-schedule all Euclidean notes for the current phrase (matching web's precise timing)
    private func scheduleEuclideanPhrase() {
        // Cancel any existing scheduled notes
        for item in scheduledEuclideanNotes {
            item.cancel()
        }
        scheduledEuclideanNotes.removeAll()
        
        guard currentParams.synthEuclideanMasterEnabled,
              let harmony = harmonyState else { return }
        
        // Check if any synth-source lanes are enabled (independent of leadEnabled)
        let euclideanSynthLanesEnabled = 
            (currentParams.synthEuclid1Enabled && currentParams.synthEuclid1Source != "lead") ||
            (currentParams.synthEuclid2Enabled && currentParams.synthEuclid2Source != "lead") ||
            (currentParams.synthEuclid3Enabled && currentParams.synthEuclid3Source != "lead") ||
            (currentParams.synthEuclid4Enabled && currentParams.synthEuclid4Source != "lead")
        
        // Only proceed if lead is enabled OR synth lanes are active
        guard currentParams.leadEnabled || euclideanSynthLanesEnabled else { return }
        
        let phraseDuration = PHRASE_LENGTH  // 16 seconds
        let tempo = currentParams.synthEuclideanTempo
        let scale = harmony.scaleFamily
        let effectiveRoot = cofState.effectiveRoot
        
        // Collect all scheduled notes with timing
        struct ScheduledNote {
            let timing: TimeInterval
            let noteMin: Int
            let noteMax: Int
            let level: Float
            let probability: Double
            let source: String
        }
        var scheduledNotes: [ScheduledNote] = []
        
        // Process each lane (matching web exactly)
        let lanes = [
            (enabled: currentParams.synthEuclid1Enabled, preset: currentParams.synthEuclid1Preset,
             steps: currentParams.synthEuclid1Steps, hits: currentParams.synthEuclid1Hits,
             rotation: currentParams.synthEuclid1Rotation, noteMin: currentParams.synthEuclid1NoteMin,
             noteMax: currentParams.synthEuclid1NoteMax, level: Float(currentParams.synthEuclid1Level),
             probability: currentParams.synthEuclid1Probability, source: currentParams.synthEuclid1Source),
            (enabled: currentParams.synthEuclid2Enabled, preset: currentParams.synthEuclid2Preset,
             steps: currentParams.synthEuclid2Steps, hits: currentParams.synthEuclid2Hits,
             rotation: currentParams.synthEuclid2Rotation, noteMin: currentParams.synthEuclid2NoteMin,
             noteMax: currentParams.synthEuclid2NoteMax, level: Float(currentParams.synthEuclid2Level),
             probability: currentParams.synthEuclid2Probability, source: currentParams.synthEuclid2Source),
            (enabled: currentParams.synthEuclid3Enabled, preset: currentParams.synthEuclid3Preset,
             steps: currentParams.synthEuclid3Steps, hits: currentParams.synthEuclid3Hits,
             rotation: currentParams.synthEuclid3Rotation, noteMin: currentParams.synthEuclid3NoteMin,
             noteMax: currentParams.synthEuclid3NoteMax, level: Float(currentParams.synthEuclid3Level),
             probability: currentParams.synthEuclid3Probability, source: currentParams.synthEuclid3Source),
            (enabled: currentParams.synthEuclid4Enabled, preset: currentParams.synthEuclid4Preset,
             steps: currentParams.synthEuclid4Steps, hits: currentParams.synthEuclid4Hits,
             rotation: currentParams.synthEuclid4Rotation, noteMin: currentParams.synthEuclid4NoteMin,
             noteMax: currentParams.synthEuclid4NoteMax, level: Float(currentParams.synthEuclid4Level),
             probability: currentParams.synthEuclid4Probability, source: currentParams.synthEuclid4Source)
        ]
        
        for lane in lanes {
            guard lane.enabled else { continue }
            
            // Get pattern parameters from preset or custom
            let steps: Int
            let hits: Int
            let rotation: Int
            
            if lane.preset == "custom" {
                steps = lane.steps
                hits = lane.hits
                rotation = lane.rotation
            } else if let preset = EUCLIDEAN_PRESETS[lane.preset] {
                steps = preset.steps
                hits = preset.hits
                // User rotation is additive to preset's base rotation
                rotation = (preset.rotation + lane.rotation) % steps
            } else {
                // Fallback to lancaran
                steps = 16
                hits = 4
                rotation = lane.rotation % 16
            }
            
            // Generate pattern for this lane
            var pattern = euclidean(hits: hits, steps: steps)
            
            // Apply rotation
            if rotation > 0 && !pattern.isEmpty {
                let rot = rotation % pattern.count
                pattern = Array(pattern.suffix(pattern.count - rot) + pattern.prefix(rot))
            }
            
            let patternDuration = phraseDuration / tempo
            let stepDuration = patternDuration / Double(steps)
            let cycles = Int(ceil(tempo))
            
            for cycle in 0..<cycles {
                let cycleOffset = Double(cycle) * patternDuration
                for (i, isHit) in pattern.enumerated() {
                    if isHit {
                        let timing = cycleOffset + (Double(i) * stepDuration)
                        if timing < phraseDuration {
                            scheduledNotes.append(ScheduledNote(
                                timing: timing,
                                noteMin: lane.noteMin,
                                noteMax: lane.noteMax,
                                level: lane.level,
                                probability: lane.probability,
                                source: lane.source
                            ))
                        }
                    }
                }
            }
        }
        
        // Check if any enabled lane uses "lead" as source
        let anyLaneUsesLead = lanes.contains { $0.enabled && $0.source == "lead" }
        
        // If no lanes use lead AND lead is enabled, add random lead notes as well
        // (matching web app behavior)
        if !anyLaneUsesLead && currentParams.leadEnabled {
            let density = currentParams.leadDensity
            let baseOctaveOffset = currentParams.leadOctave
            let octaveRange = currentParams.leadOctaveRange
            let baseLow = 64 + (baseOctaveOffset * 12)
            let baseHigh = baseLow + (octaveRange * 12)
            
            let phraseIdx = getCurrentPhraseIndex()
            let rng = createRng("\(currentBucket)|\(currentSeed)|lead|\(phraseIdx)")
            let notesThisPhrase = max(1, Int(density * 3 + rng() * 2))
            
            for _ in 0..<notesThisPhrase {
                let timing = rng() * phraseDuration
                scheduledNotes.append(ScheduledNote(
                    timing: timing,
                    noteMin: baseLow,
                    noteMax: baseHigh,
                    level: 1.0,
                    probability: 1.0,
                    source: "lead"
                ))
            }
        }
        
        // Sort by timing
        scheduledNotes.sort { $0.timing < $1.timing }
        
        // Get scale notes for quantization
        let scaleNotes = getScaleNotesInRange(scale: scale, lowMidi: 24, highMidi: 108, rootNote: effectiveRoot)
        
        // Get phrase index for deterministic RNG
        let phraseIndex = getCurrentPhraseIndex()
        
        // Schedule each note using DispatchQueue for precise timing
        for (noteIndex, note) in scheduledNotes.enumerated() {
            // Create per-note RNG for deterministic note selection and randomization
            let noteRng = createRng("\(currentBucket)|\(currentSeed)|euclid|\(phraseIndex)|\(noteIndex)")
            
            // Probability check - skip note if random value exceeds probability
            if noteRng() > note.probability {
                continue
            }
            
            // Pick note from scale in range using seeded RNG (not .randomElement())
            let availableNotes = scaleNotes.filter { $0 >= note.noteMin && $0 <= note.noteMax }
            let midiNote: Int
            if !availableNotes.isEmpty {
                let idx = Int(noteRng() * Double(availableNotes.count)) % availableNotes.count
                midiNote = availableNotes[idx]
            } else if let first = scaleNotes.first {
                midiNote = first
            } else {
                continue
            }
            
            // Capture source for closure
            let noteSource = note.source
            let noteLevel = note.level
            let frequency = midiToFreq(midiNote)
            
            // Calculate synth note duration based on ADSR
            let synthAttack = currentParams.synthAttack
            let synthDecay = currentParams.synthDecay
            let noteDuration = synthAttack + synthDecay + max(0.3, synthAttack + synthDecay)
            
            let workItem = DispatchWorkItem { [weak self] in
                guard let self = self, self.isRunning else { return }
                
                // Route to appropriate sound source
                if noteSource == "lead" {
                    self.leadSynth?.randomizeTimbre(noteRng)
                    self.leadSynth?.randomizeExpression(noteRng)
                    self.leadSynth?.randomizeDelay(noteRng)
                    self.leadSynth?.playNote(midiNote: midiNote, velocity: noteLevel)
                } else if noteSource.hasPrefix("synth") {
                    // Parse synth voice index from source (e.g., "synth1" -> 0)
                    if let voiceNumber = Int(noteSource.replacingOccurrences(of: "synth", with: "")) {
                        let voiceIndex = voiceNumber - 1
                        self.triggerSynthVoice(voiceIndex: voiceIndex, frequency: Float(frequency), velocity: noteLevel, noteDuration: noteDuration)
                    }
                }
            }
            
            scheduledEuclideanNotes.append(workItem)
            audioSchedulingQueue.asyncAfter(deadline: .now() + note.timing, execute: workItem)
        }
    }
    
    private func startFilterModulation() {
        // Filter modulation runs at 100ms intervals using dedicated queue
        filterModTimerSource?.cancel()
        filterModTimerSource = DispatchSource.makeTimerSource(queue: audioSchedulingQueue)
        filterModTimerSource?.schedule(deadline: .now(), repeating: 0.1)
        filterModTimerSource?.setEventHandler { [weak self] in
            guard let self = self, self.isRunning else { return }
            self.updateFilterModulation()
        }
        filterModTimerSource?.resume()
    }
    
    /// Random walk filter modulation aligned with the current web behavior.
    private func updateFilterModulation() {
        // Calculate speed factor based on mod speed setting
        // Higher modSpeed = slower movement (more phrases per wander)
        let baseSpeed: Double = 0.02
        let speedFactor = currentParams.filterModSpeed > 0
            ? baseSpeed / currentParams.filterModSpeed
            : 0
        
        // Random walk with momentum
        // Add random acceleration
        let randomAccel = (Double.random(in: 0...1) - 0.5) * speedFactor * 2
        filterModVelocity += randomAccel
        
        // Dampen velocity to prevent wild swings
        filterModVelocity *= 0.92
        
        // Clamp velocity
        let maxVelocity = speedFactor * 4
        filterModVelocity = max(-maxVelocity, min(maxVelocity, filterModVelocity))
        
        // Apply velocity to position
        filterModValue += filterModVelocity
        
        // Hard clamp to valid range
        filterModValue = max(0, min(1, filterModValue))
        
        // Calculate filter frequency (logarithmic interpolation for natural sweep)
        let minCutoff = currentParams.filterCutoffMin
        let maxCutoff = currentParams.filterCutoffMax
        let logMin = log(max(minCutoff, 20))
        let logMax = log(max(maxCutoff, 21))
        let filterFreq = exp(logMin + (logMax - logMin) * filterModValue)
        
        // Apply Q boost at low cutoffs (matching web app)
        let baseQ = currentParams.filterQ
        let qBoost = filterFreq < 200 ? (200 - filterFreq) / 200 * 4 : 0
        let finalQ = min(baseQ + qBoost, 15)
        
        // Apply to voices
        for voice in synthVoices {
            voice.setFilterCutoff(Float(filterFreq))
            voice.setFilterParams(resonance: Float(currentParams.filterResonance), q: Float(finalQ))
        }
        
        // Notify UI
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.onStateChange?(EngineStateUpdate(
                cofCurrentStep: self.cofState.currentStep,
                currentSeed: self.currentSeed,
                currentBucket: self.currentBucket,
                currentFilterFreq: filterFreq,
                harmonyState: self.harmonyState.map {
                    (chordDegrees: $0.chordDegrees, scaleName: $0.scaleFamily.name)
                }
            ))
        }
    }
    
    private func triggerChord(_ chord: ChordVoicing) {
        // Check if chord sequencer is enabled
        guard currentParams.synthChordSequencerEnabled else { return }
        
        for (i, freq) in chord.frequencies.enumerated() where i < synthVoices.count {
            let rng = createRng("\(currentSeed)|voice|\(i)")
            let velocity = Float(rngFloat(rng, min: 0.5, max: 0.8))
            synthVoices[i].trigger(frequency: Float(freq), velocity: velocity)
        }
    }
    
    /// Trigger a single synth voice for Euclidean sequencing
    /// - Parameters:
    ///   - voiceIndex: Which voice (0-5) to trigger
    ///   - frequency: Note frequency in Hz
    ///   - velocity: Volume/intensity (0-1)
    ///   - noteDuration: How long before release (seconds)
    private func triggerSynthVoice(voiceIndex: Int, frequency: Float, velocity: Float, noteDuration: TimeInterval) {
        guard voiceIndex >= 0 && voiceIndex < synthVoices.count else { return }
        
        let voice = synthVoices[voiceIndex]
        voice.trigger(frequency: frequency, velocity: velocity)
        
        // Schedule release after duration
        audioSchedulingQueue.asyncAfter(deadline: .now() + noteDuration) { [weak voice] in
            voice?.releaseNote()
        }
    }
    
    private func notifyStateChange() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.onStateChange?(EngineStateUpdate(
                cofCurrentStep: self.cofState.currentStep,
                currentSeed: self.currentSeed,
                currentBucket: self.currentBucket,
                currentFilterFreq: 1000,
                harmonyState: self.harmonyState.map {
                    (chordDegrees: $0.chordDegrees, scaleName: $0.scaleFamily.name)
                }
            ))
        }
    }
    
    // MARK: - Recording Support
    
    /// Get the underlying AVAudioEngine for recording
    func getEngine() -> AVAudioEngine {
        return engine
    }
    
    /// Get the master mixer node for main recording
    func getMasterMixer() -> AVAudioMixerNode {
        return outputBridgeMixer
    }
    
    /// Get the synth mixer node for stem recording
    func getSynthMixer() -> AVAudioMixerNode {
        return synthLevelMixer
    }

    /// Get the lead mixer node for stem recording
    func getLeadMixer() -> AVAudioMixerNode {
        return leadLevelMixer
    }

    /// Get the drum mixer node for stem recording
    func getDrumMixer() -> AVAudioMixerNode {
        return drumLevelMixer
    }
    
    /// Get the ocean/waves mixer node for stem recording
    func getOceanMixer() -> AVAudioMixerNode {
        return oceanMixer
    }
    
    /// Get the granular mixer node for stem recording
    func getGranularMixer() -> AVAudioMixerNode {
        return granularLevelMixer
    }
    
    /// Get the reverb send mixer node for stem recording
    func getReverbSend() -> AVAudioMixerNode {
        return reverbSend
    }
    
    /// Get the reverb processor node for stem recording (if available)
    func getReverbNode() -> AVAudioNode? {
        return reverbProcessor?.node
    }
    
    /// Configure an AudioRecorder with all necessary nodes
    func configureRecorder(_ recorder: AudioRecorder) {
        recorder.configure(
            engine: engine,
            masterMixer: outputBridgeMixer,
            synthMixer: synthLevelMixer,
            leadMixer: leadLevelMixer,
            drumMixer: drumLevelMixer,
            oceanMixer: oceanMixer,
            granularMixer: granularLevelMixer,
            reverbNode: reverbProcessor?.node
        )
    }
}
