import AVFoundation

/// Ocean sample player - plays and loops a recorded ocean sample
class OceanSamplePlayer {
    private var playerNode: AVAudioPlayerNode?
    private var audioFile: AVAudioFile?
    private var audioBuffer: AVAudioPCMBuffer?
    
    private var enabled: Bool = false
    private var level: Float = 0.5
    
    // Filter for ocean sound shaping
    private var filterNode: AVAudioUnitEQ?
    
    /// The mixer node to connect to the audio graph
    let mixerNode = AVAudioMixerNode()
    
    init() {
        playerNode = AVAudioPlayerNode()
        
        // Create EQ for ocean filtering
        filterNode = AVAudioUnitEQ(numberOfBands: 2)
        if let eq = filterNode {
            // Low-pass band
            eq.bands[0].filterType = .lowPass
            eq.bands[0].frequency = 8000
            eq.bands[0].bandwidth = 1.0
            eq.bands[0].bypass = false
            
            // High-pass band (remove rumble)
            eq.bands[1].filterType = .highPass
            eq.bands[1].frequency = 40
            eq.bands[1].bandwidth = 1.0
            eq.bands[1].bypass = false
        }
    }
    
    /// Setup the audio graph connections
    /// Call this after attaching nodes to the engine
    func setupConnections(engine: AVAudioEngine, outputMixer: AVAudioMixerNode) {
        guard let player = playerNode, let filter = filterNode else { return }
        
        // Attach nodes
        engine.attach(player)
        engine.attach(filter)
        engine.attach(mixerNode)
        
        // Load the sample
        loadSample()
        
        // Connect: Player -> Filter -> Mixer -> Output
        if let buffer = audioBuffer {
            let format = buffer.format
            engine.connect(player, to: filter, format: format)
            engine.connect(filter, to: mixerNode, format: format)
            engine.connect(mixerNode, to: outputMixer, format: format)
        }
        
        // Set initial level
        mixerNode.outputVolume = 0
    }
    
    /// Load the ocean sample from the app bundle
    private func loadSample() {
        // Try multiple possible filenames
        let sampleNames = [
            "Ghetary-Waves-Rocks_cl-normalized",
            "ocean-waves",
            "ocean_sample"
        ]
        
        let extensions = ["m4a", "caf", "wav", "aif", "mp3"]
        
        var loadedFile: AVAudioFile?
        
        for name in sampleNames {
            for ext in extensions {
                if let url = Bundle.main.url(forResource: name, withExtension: ext) {
                    do {
                        loadedFile = try AVAudioFile(forReading: url)
                        print("Ocean sample loaded: \(name).\(ext)")
                        break
                    } catch {
                        continue
                    }
                }
            }
            if loadedFile != nil { break }
        }
        
        guard let file = loadedFile else {
            print("Ocean sample not found in bundle - sample playback disabled")
            return
        }
        
        audioFile = file
        
        // Read entire file into buffer
        let frameCount = AVAudioFrameCount(file.length)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frameCount) else {
            print("Failed to create buffer for ocean sample")
            return
        }
        
        do {
            try file.read(into: buffer)
            audioBuffer = buffer
            print("Ocean sample ready: \(Float(frameCount) / Float(file.processingFormat.sampleRate))s")
        } catch {
            print("Failed to read ocean sample: \(error)")
        }
    }
    
    /// Start playback (looped)
    func startPlayback() {
        guard let player = playerNode, let buffer = audioBuffer else { return }
        
        // Stop if already playing
        player.stop()
        
        // Schedule looping playback
        player.scheduleBuffer(buffer, at: nil, options: .loops) { [weak self] in
            // Buffer finished (won't happen with .loops)
            print("Ocean sample playback ended")
        }
        
        player.play()
        
        // Apply current level
        mixerNode.outputVolume = enabled ? level : 0
    }
    
    /// Stop playback
    func stopPlayback() {
        playerNode?.stop()
    }
    
    // MARK: - Public Interface
    
    func setEnabled(_ enabled: Bool) {
        self.enabled = enabled
        mixerNode.outputVolume = enabled ? level : 0
        
        if enabled && playerNode?.isPlaying != true {
            startPlayback()
        }
    }
    
    func setLevel(_ level: Float) {
        self.level = min(max(level, 0), 1)
        if enabled {
            mixerNode.outputVolume = self.level
        }
    }
    
    func setFilter(cutoff: Float, resonance: Float) {
        if let eq = filterNode {
            eq.bands[0].frequency = cutoff
            eq.bands[0].bandwidth = 1.0 + resonance * 2
        }
    }
    
    var isPlaying: Bool {
        return playerNode?.isPlaying ?? false
    }
    
    var hasLoadedSample: Bool {
        return audioBuffer != nil
    }
}
