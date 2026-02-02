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
class AudioEngine {
    
    // MARK: - AVAudioEngine Components
    private let engine = AVAudioEngine()
    private var synthVoices: [SynthVoice] = []
    private var granularProcessor: GranularProcessor?
    private var reverbProcessor: ReverbProcessor?
    private var leadSynth: LeadSynth?
    private var oceanSynth: OceanSynth?
    private var oceanSamplePlayer: OceanSamplePlayer?
    
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
    private let dryMixer = AVAudioMixerNode()
    private let reverbSend = AVAudioMixerNode()
    private let masterMixer = AVAudioMixerNode()
    
    // Master limiter (prevents clipping)
    private var masterLimiter: AVAudioUnitDynamicsProcessor?
    
    // Granular input tap for live synth processing
    private var granularInputBuffer: AVAudioPCMBuffer?
    private var granularInputWriteIndex: Int = 0
    
    // MARK: - State
    private var isRunning = false
    private var currentParams: SliderState = .default
    private var harmonyState: HarmonyState?
    private var cofState = CircleOfFifthsState()
    private var currentBucket: String = ""
    private var currentSeed: Int = 0
    
    // Scheduling
    private var phraseTimer: Timer?
    private var noteTimer: Timer?
    
    // Filter modulation - random walk (matching web app)
    private var filterModValue: Double = 0.5  // 0-1, current position
    private var filterModVelocity: Double = 0  // Current velocity for momentum
    
    // Callback for state updates
    var onStateChange: ((EngineStateUpdate) -> Void)?
    
    // MARK: - Initialization
    
    init() {
        setupAudioSession()
        setupAudioGraph()
    }
    
    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("Failed to setup audio session: \(error)")
        }
    }
    
    private func setupAudioGraph() {
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        
        // Create synth voices
        for _ in 0..<VOICE_COUNT {
            let voice = SynthVoice()
            synthVoices.append(voice)
            engine.attach(voice.node)
            engine.connect(voice.node, to: synthMixer, format: format)
        }
        
        // Create processors
        granularProcessor = GranularProcessor()
        if let granular = granularProcessor {
            engine.attach(granular.node)
            engine.connect(granular.node, to: granularMixer, format: format)
        }
        
        reverbProcessor = ReverbProcessor()
        leadSynth = LeadSynth()
        oceanSynth = OceanSynth()
        
        // Create Euclidean sequencer for lead
        euclideanSequencer = EuclideanSequencer()
        
        if let lead = leadSynth {
            engine.attach(lead.node)
            engine.connect(lead.node, to: leadMixer, format: format)
        }
        
        // Attach ocean mixer and connect ocean synth
        engine.attach(oceanMixer)
        if let ocean = oceanSynth {
            engine.attach(ocean.node)
            engine.connect(ocean.node, to: oceanMixer, format: format)
        }
        
        // Create ocean sample player and connect to ocean mixer
        oceanSamplePlayer = OceanSamplePlayer()
        oceanSamplePlayer?.setupConnections(engine: engine, outputMixer: oceanMixer)
        
        // Attach mixers
        engine.attach(synthMixer)
        engine.attach(granularMixer)
        engine.attach(leadMixer)
        engine.attach(dryMixer)
        engine.attach(reverbSend)
        engine.attach(masterMixer)
        
        // Connect dry path
        engine.connect(synthMixer, to: dryMixer, format: format)
        engine.connect(granularMixer, to: dryMixer, format: format)
        engine.connect(leadMixer, to: dryMixer, format: format)
        engine.connect(oceanMixer, to: dryMixer, format: format)
        
        // Setup reverb
        if let reverb = reverbProcessor {
            engine.attach(reverb.node)
            
            // Send from mixers to reverb
            engine.connect(synthMixer, to: reverbSend, format: format)
            engine.connect(granularMixer, to: reverbSend, format: format)
            engine.connect(leadMixer, to: reverbSend, format: format)
            engine.connect(reverbSend, to: reverb.node, format: format)
            
            // Reverb output to master
            engine.connect(reverb.node, to: masterMixer, format: format)
        }
        
        // Dry to master
        engine.connect(dryMixer, to: masterMixer, format: format)
        
        // Setup master limiter (prevents clipping)
        masterLimiter = AVAudioUnitDynamicsProcessor()
        if let limiter = masterLimiter {
            engine.attach(limiter)
            
            // Configure as limiter: threshold=-3dB, knee=0, ratio=20, fast attack/release
            limiter.threshold = -3.0
            limiter.headRoom = 0.0
            limiter.attackTime = 0.001
            limiter.releaseTime = 0.1
            
            // Route: masterMixer -> limiter -> mainMixerNode
            engine.connect(masterMixer, to: limiter, format: format)
            engine.connect(limiter, to: engine.mainMixerNode, format: format)
        } else {
            // Fallback: direct connection if limiter fails
            engine.connect(masterMixer, to: engine.mainMixerNode, format: format)
        }
        
        // Setup tap on synth mixer for granular live input
        setupGranularInputTap(format: format)
        
        // Prepare engine
        engine.prepare()
    }
    
    /// Install a tap on synth mixer to feed audio to granular processor
    private func setupGranularInputTap(format: AVAudioFormat) {
        // Create buffer for storing synth audio (4 seconds)
        let bufferSize = AVAudioFrameCount(format.sampleRate * 4)
        granularInputBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: bufferSize)
        granularInputBuffer?.frameLength = bufferSize
        
        // Install tap to capture synth output
        synthMixer.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, time in
            self?.processGranularInput(buffer: buffer)
        }
    }
    
    /// Process incoming synth audio and send to granular processor
    private func processGranularInput(buffer: AVAudioPCMBuffer) {
        guard let inputBuffer = granularInputBuffer,
              let granular = granularProcessor,
              let inputData = buffer.floatChannelData?[0],
              let outputData = inputBuffer.floatChannelData?[0] else { return }
        
        let frameCount = Int(buffer.frameLength)
        let bufferCapacity = Int(inputBuffer.frameCapacity)
        
        // Copy samples to circular buffer
        for i in 0..<frameCount {
            outputData[granularInputWriteIndex] = inputData[i]
            granularInputWriteIndex = (granularInputWriteIndex + 1) % bufferCapacity
        }
        
        // Periodically update granular processor with new audio
        // Only update when we've accumulated enough samples
        if granularInputWriteIndex % 4410 == 0 {  // Every ~100ms
            var samples = [Float](repeating: 0, count: bufferCapacity)
            for i in 0..<bufferCapacity {
                samples[i] = outputData[i]
            }
            granular.loadSample(samples, sampleRate: Float(inputBuffer.format.sampleRate))
        }
    }
    
    // MARK: - Playback Control
    
    func start(with params: SliderState) {
        guard !isRunning else { return }
        
        currentParams = params
        updateBucket()
        initializeHarmony()
        updateEuclideanSequencer()
        
        do {
            try engine.start()
            isRunning = true
            
            // Send initial random sequence to granular processor
            sendGranulatorRandomSequence()
            
            // Start scheduling
            startPhraseScheduler()
            startNoteScheduler()
            startFilterModulation()
            startEuclideanScheduler()
            
            // Start ocean sample if enabled
            if currentParams.oceanSampleEnabled {
                oceanSamplePlayer?.startPlayback()
            }
            
            // Apply initial parameters
            applyParams()
            
        } catch {
            print("Failed to start audio engine: \(error)")
        }
    }
    
    func stop() {
        guard isRunning else { return }
        
        phraseTimer?.invalidate()
        noteTimer?.invalidate()
        euclideanTimer?.invalidate()
        phraseTimer = nil
        noteTimer = nil
        euclideanTimer = nil
        
        // Cancel all pre-scheduled notes
        for item in scheduledEuclideanNotes {
            item.cancel()
        }
        scheduledEuclideanNotes.removeAll()
        
        for item in scheduledLeadNotes {
            item.cancel()
        }
        scheduledLeadNotes.removeAll()
        
        // Stop ocean sample
        oceanSamplePlayer?.stopPlayback()
        
        // Fade out voices
        for voice in synthVoices {
            voice.release()
        }
        leadSynth?.release()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.engine.stop()
            self?.isRunning = false
        }
    }
    
    func updateParams(_ params: SliderState) {
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
    
    func resetCofDrift() {
        cofState.resetDrift()
        notifyStateChange()
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
            chordRate: currentParams.chordRate,
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
        
        // Synth level
        synthMixer.outputVolume = Float(currentParams.synthLevel)
        
        // Granular level
        granularMixer.outputVolume = Float(currentParams.granularEnabled ? currentParams.granularLevel : 0)
        
        // Lead level
        leadMixer.outputVolume = Float(currentParams.leadEnabled ? currentParams.leadLevel : 0)
        
        // Reverb sends
        let synthReverbAmount = Float(currentParams.synthReverbSend * currentParams.reverbLevel)
        let granularReverbAmount = Float(currentParams.granularReverbSend * currentParams.reverbLevel)
        let leadReverbAmount = Float(currentParams.leadReverbSend * currentParams.reverbLevel)
        
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
            mix: Float(currentParams.reverbLevel * 100),
            size: Float(currentParams.reverbSize),
            diffusion: Float(currentParams.reverbDiffusion),
            modulation: Float(currentParams.reverbModulation),
            predelay: Float(currentParams.predelay / 1000.0),  // Convert ms to seconds
            width: Float(currentParams.width),
            damping: Float(currentParams.damping)
        )
        
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
        leadSynth?.setOctave(
            shift: currentParams.leadOctave,
            range: currentParams.leadOctaveRange
        )
        
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
    }
    
    /// Update Euclidean sequencer lanes from current parameters
    private func updateEuclideanSequencer() {
        guard let seq = euclideanSequencer else { return }
        
        seq.masterEnabled = currentParams.leadEuclideanMasterEnabled
        seq.tempo = currentParams.leadEuclideanTempo
        
        // Lane 1
        seq.lanes[0].enabled = currentParams.leadEuclid1Enabled
        seq.lanes[0].steps = currentParams.leadEuclid1Steps
        seq.lanes[0].hits = currentParams.leadEuclid1Hits
        seq.lanes[0].rotation = currentParams.leadEuclid1Rotation
        seq.lanes[0].noteMin = currentParams.leadEuclid1NoteMin
        seq.lanes[0].noteMax = currentParams.leadEuclid1NoteMax
        seq.lanes[0].level = Float(currentParams.leadEuclid1Level)
        seq.lanes[0].regeneratePattern()
        
        // Lane 2
        seq.lanes[1].enabled = currentParams.leadEuclid2Enabled
        seq.lanes[1].steps = currentParams.leadEuclid2Steps
        seq.lanes[1].hits = currentParams.leadEuclid2Hits
        seq.lanes[1].rotation = currentParams.leadEuclid2Rotation
        seq.lanes[1].noteMin = currentParams.leadEuclid2NoteMin
        seq.lanes[1].noteMax = currentParams.leadEuclid2NoteMax
        seq.lanes[1].level = Float(currentParams.leadEuclid2Level)
        seq.lanes[1].regeneratePattern()
        
        // Lane 3
        seq.lanes[2].enabled = currentParams.leadEuclid3Enabled
        seq.lanes[2].steps = currentParams.leadEuclid3Steps
        seq.lanes[2].hits = currentParams.leadEuclid3Hits
        seq.lanes[2].rotation = currentParams.leadEuclid3Rotation
        seq.lanes[2].noteMin = currentParams.leadEuclid3NoteMin
        seq.lanes[2].noteMax = currentParams.leadEuclid3NoteMax
        seq.lanes[2].level = Float(currentParams.leadEuclid3Level)
        seq.lanes[2].regeneratePattern()
        
        // Lane 4
        seq.lanes[3].enabled = currentParams.leadEuclid4Enabled
        seq.lanes[3].steps = currentParams.leadEuclid4Steps
        seq.lanes[3].hits = currentParams.leadEuclid4Hits
        seq.lanes[3].rotation = currentParams.leadEuclid4Rotation
        seq.lanes[3].noteMin = currentParams.leadEuclid4NoteMin
        seq.lanes[3].noteMax = currentParams.leadEuclid4NoteMax
        seq.lanes[3].level = Float(currentParams.leadEuclid4Level)
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
        // Schedule at phrase boundaries
        let timeUntilNext = getTimeUntilNextPhrase()
        
        phraseTimer = Timer.scheduledTimer(withTimeInterval: timeUntilNext, repeats: false) { [weak self] _ in
            self?.onPhraseBoundary()
            
            // Start repeating timer
            self?.phraseTimer = Timer.scheduledTimer(withTimeInterval: PHRASE_LENGTH, repeats: true) { [weak self] _ in
                self?.onPhraseBoundary()
            }
        }
    }
    
    private func onPhraseBoundary() {
        // Update bucket (in case hour/day changed)
        updateBucket()
        
        // Update Circle of Fifths
        let rng = createRng("\(currentBucket)|\(currentSeed)|cof")
        let didDrift = cofState.updateAtPhraseBoundary(rng: rng)
        
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
                chordRate: currentParams.chordRate,
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
        
        // Pre-schedule notes for this phrase (matching web's precise scheduling)
        if currentParams.leadEnabled {
            if currentParams.leadEuclideanMasterEnabled {
                scheduleEuclideanPhrase()
            } else {
                scheduleRandomLeadPhrase()
            }
        }
        
        notifyStateChange()
    }
    
    private func startNoteScheduler() {
        // Schedule note events at regular intervals
        noteTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.onNoteEvent()
        }
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
              !currentParams.leadEuclideanMasterEnabled,
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
            DispatchQueue.main.asyncAfter(deadline: .now() + timing, execute: workItem)
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
        
        guard currentParams.leadEnabled,
              currentParams.leadEuclideanMasterEnabled,
              let harmony = harmonyState else { return }
        
        let phraseDuration = PHRASE_LENGTH  // 16 seconds
        let tempo = currentParams.leadEuclideanTempo
        let scale = harmony.scaleFamily
        let effectiveRoot = cofState.effectiveRoot
        
        // Collect all scheduled notes with timing
        struct ScheduledNote {
            let timing: TimeInterval
            let noteMin: Int
            let noteMax: Int
            let level: Float
        }
        var scheduledNotes: [ScheduledNote] = []
        
        // Process each lane (matching web exactly)
        let lanes = [
            (enabled: currentParams.leadEuclid1Enabled, preset: currentParams.leadEuclid1Preset,
             steps: currentParams.leadEuclid1Steps, hits: currentParams.leadEuclid1Hits,
             rotation: currentParams.leadEuclid1Rotation, noteMin: currentParams.leadEuclid1NoteMin,
             noteMax: currentParams.leadEuclid1NoteMax, level: Float(currentParams.leadEuclid1Level)),
            (enabled: currentParams.leadEuclid2Enabled, preset: currentParams.leadEuclid2Preset,
             steps: currentParams.leadEuclid2Steps, hits: currentParams.leadEuclid2Hits,
             rotation: currentParams.leadEuclid2Rotation, noteMin: currentParams.leadEuclid2NoteMin,
             noteMax: currentParams.leadEuclid2NoteMax, level: Float(currentParams.leadEuclid2Level)),
            (enabled: currentParams.leadEuclid3Enabled, preset: currentParams.leadEuclid3Preset,
             steps: currentParams.leadEuclid3Steps, hits: currentParams.leadEuclid3Hits,
             rotation: currentParams.leadEuclid3Rotation, noteMin: currentParams.leadEuclid3NoteMin,
             noteMax: currentParams.leadEuclid3NoteMax, level: Float(currentParams.leadEuclid3Level)),
            (enabled: currentParams.leadEuclid4Enabled, preset: currentParams.leadEuclid4Preset,
             steps: currentParams.leadEuclid4Steps, hits: currentParams.leadEuclid4Hits,
             rotation: currentParams.leadEuclid4Rotation, noteMin: currentParams.leadEuclid4NoteMin,
             noteMax: currentParams.leadEuclid4NoteMax, level: Float(currentParams.leadEuclid4Level))
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
                                level: lane.level
                            ))
                        }
                    }
                }
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
            
            let workItem = DispatchWorkItem { [weak self] in
                guard let self = self, self.isRunning else { return }
                self.leadSynth?.randomizeTimbre(noteRng)
                self.leadSynth?.randomizeExpression(noteRng)
                self.leadSynth?.randomizeDelay(noteRng)
                self.leadSynth?.playNote(midiNote: midiNote, velocity: note.level)
            }
            
            scheduledEuclideanNotes.append(workItem)
            DispatchQueue.main.asyncAfter(deadline: .now() + note.timing, execute: workItem)
        }
    }
    
    /// Legacy tick method - no longer used for timing, kept for reference
    private func onEuclideanTick() {
        // Replaced by scheduleEuclideanPhrase() for precise pre-scheduling
    }
    
    private func startFilterModulation() {
        // Filter modulation runs at 100ms intervals (matching web app)
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            guard let self = self, self.isRunning else {
                timer.invalidate()
                return
            }
            self.updateFilterModulation()
        }
    }
    
    /// Random walk filter modulation (matching web app exactly)
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
        for (i, freq) in chord.frequencies.enumerated() where i < synthVoices.count {
            let rng = createRng("\(currentSeed)|voice|\(i)")
            let velocity = Float(rngFloat(rng, min: 0.5, max: 0.8))
            synthVoices[i].trigger(frequency: Float(freq), velocity: velocity)
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
}
