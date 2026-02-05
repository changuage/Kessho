import AVFoundation
import Foundation

/// Stem types for recording
enum RecordingStem: String, CaseIterable, Identifiable {
    case synth = "synth"
    case lead = "lead"
    case drums = "drums"
    case waves = "waves"
    case granular = "granular"
    case reverb = "reverb"
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .synth: return "Synth"
        case .lead: return "Lead"
        case .drums: return "Drums"
        case .waves: return "Waves"
        case .granular: return "Granular"
        case .reverb: return "Reverb"
        }
    }
}

/// Recording state
enum RecordingState {
    case idle
    case armed
    case recording
}

/// Audio recorder for capturing main mix and individual stems
class AudioRecorder {
    // MARK: - Properties
    
    private weak var engine: AVAudioEngine?
    private var masterMixer: AVAudioMixerNode?
    private var stemMixers: [RecordingStem: AVAudioMixerNode] = [:]
    
    // Recording files
    private var mainRecordingFile: AVAudioFile?
    private var stemRecordingFiles: [RecordingStem: AVAudioFile] = [:]
    
    // Recording state
    private(set) var state: RecordingState = .idle
    private(set) var recordingDuration: TimeInterval = 0
    private var recordingStartTime: Date?
    
    // Settings
    var enabledStems: Set<RecordingStem> = []
    var recordMain: Bool = true
    
    // Format
    private let sampleRate: Double = 48000
    private let bitDepth: Int = 24
    
    // Callback for state changes
    var onStateChange: ((RecordingState) -> Void)?
    var onDurationUpdate: ((TimeInterval) -> Void)?
    
    // Timer for duration updates
    private var durationTimer: Timer?
    
    // MARK: - Initialization
    
    init() {}
    
    /// Configure the recorder with audio engine and mixer nodes
    func configure(
        engine: AVAudioEngine,
        masterMixer: AVAudioMixerNode,
        synthMixer: AVAudioMixerNode,
        leadMixer: AVAudioMixerNode,
        drumMixer: AVAudioMixerNode,
        oceanMixer: AVAudioMixerNode,
        granularMixer: AVAudioMixerNode,
        reverbNode: AVAudioNode?
    ) {
        self.engine = engine
        self.masterMixer = masterMixer
        
        stemMixers[.synth] = synthMixer
        stemMixers[.lead] = leadMixer
        stemMixers[.drums] = drumMixer
        stemMixers[.waves] = oceanMixer
        stemMixers[.granular] = granularMixer
        
        // Reverb is a special case - we'd need the reverb output node
        // For now, we'll skip reverb stem if node is not a mixer
        if let reverbMixer = reverbNode as? AVAudioMixerNode {
            stemMixers[.reverb] = reverbMixer
        }
    }
    
    // MARK: - Recording Control
    
    /// Arm recording - prepares but doesn't start
    func arm() {
        guard state == .idle else { return }
        state = .armed
        onStateChange?(state)
    }
    
    /// Disarm recording
    func disarm() {
        guard state == .armed else { return }
        state = .idle
        onStateChange?(state)
    }
    
    /// Start recording
    func startRecording() -> Bool {
        guard state == .armed || state == .idle else { return false }
        guard let engine = engine else {
            print("AudioRecorder: No engine configured")
            return false
        }
        
        // Create output directory in Documents
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let recordingsPath = documentsPath.appendingPathComponent("Recordings", isDirectory: true)
        
        // Create recordings directory if needed
        try? FileManager.default.createDirectory(at: recordingsPath, withIntermediateDirectories: true)
        
        // Generate timestamp for filenames
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyyMMdd-HHmmss"
        let timestamp = dateFormatter.string(from: Date())
        
        // Get audio format (stereo, 48kHz, 24-bit)
        guard let format = createRecordingFormat() else {
            print("AudioRecorder: Failed to create recording format")
            return false
        }
        
        // Setup main recording
        if recordMain, let masterMixer = masterMixer {
            let mainURL = recordingsPath.appendingPathComponent("kessho-\(timestamp).wav")
            do {
                mainRecordingFile = try AVAudioFile(
                    forWriting: mainURL,
                    settings: format.settings
                )
                
                // Install tap on master mixer
                masterMixer.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
                    self?.writeBuffer(buffer, to: self?.mainRecordingFile)
                }
                
                print("AudioRecorder: Recording main mix to \(mainURL.path)")
            } catch {
                print("AudioRecorder: Failed to create main recording file: \(error)")
            }
        }
        
        // Setup stem recordings
        for stem in enabledStems {
            guard let mixer = stemMixers[stem] else { continue }
            
            let stemURL = recordingsPath.appendingPathComponent("kessho-\(timestamp)-\(stem.rawValue).wav")
            do {
                let stemFile = try AVAudioFile(
                    forWriting: stemURL,
                    settings: format.settings
                )
                stemRecordingFiles[stem] = stemFile
                
                // Install tap on stem mixer
                mixer.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
                    self?.writeBuffer(buffer, to: self?.stemRecordingFiles[stem])
                }
                
                print("AudioRecorder: Recording stem '\(stem.rawValue)' to \(stemURL.path)")
            } catch {
                print("AudioRecorder: Failed to create stem recording file for \(stem.rawValue): \(error)")
            }
        }
        
        // Start duration timer
        recordingStartTime = Date()
        recordingDuration = 0
        durationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let startTime = self.recordingStartTime else { return }
            self.recordingDuration = Date().timeIntervalSince(startTime)
            self.onDurationUpdate?(self.recordingDuration)
        }
        
        state = .recording
        onStateChange?(state)
        
        let stemCount = enabledStems.count
        print("AudioRecorder: Started recording (main: \(recordMain), stems: \(stemCount))")
        
        return true
    }
    
    /// Stop recording and save files
    func stopRecording() -> [URL] {
        guard state == .recording else { return [] }
        
        var savedURLs: [URL] = []
        
        // Stop duration timer
        durationTimer?.invalidate()
        durationTimer = nil
        
        // Remove taps and close files
        if recordMain, let masterMixer = masterMixer {
            masterMixer.removeTap(onBus: 0)
            if let file = mainRecordingFile {
                savedURLs.append(file.url)
                print("AudioRecorder: Saved main recording: \(file.url.lastPathComponent)")
            }
            mainRecordingFile = nil
        }
        
        for stem in enabledStems {
            if let mixer = stemMixers[stem] {
                mixer.removeTap(onBus: 0)
            }
            if let file = stemRecordingFiles[stem] {
                savedURLs.append(file.url)
                print("AudioRecorder: Saved stem recording: \(file.url.lastPathComponent)")
            }
        }
        stemRecordingFiles.removeAll()
        
        state = .idle
        onStateChange?(state)
        
        print("AudioRecorder: Stopped recording. Saved \(savedURLs.count) files.")
        
        return savedURLs
    }
    
    // MARK: - Private Methods
    
    /// Create recording format (stereo, 48kHz, 24-bit linear PCM)
    private func createRecordingFormat() -> AVAudioFormat? {
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 2,
            AVLinearPCMBitDepthKey: bitDepth,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
        return AVAudioFormat(settings: settings)
    }
    
    /// Write audio buffer to file
    private func writeBuffer(_ buffer: AVAudioPCMBuffer, to file: AVAudioFile?) {
        guard let file = file else { return }
        do {
            try file.write(from: buffer)
        } catch {
            print("AudioRecorder: Failed to write buffer: \(error)")
        }
    }
    
    // MARK: - Utility
    
    /// Format duration as MM:SS
    static func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
    
    /// Get list of saved recordings
    func getSavedRecordings() -> [URL] {
        let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let recordingsPath = documentsPath.appendingPathComponent("Recordings", isDirectory: true)
        
        do {
            let files = try FileManager.default.contentsOfDirectory(
                at: recordingsPath,
                includingPropertiesForKeys: [.creationDateKey],
                options: [.skipsHiddenFiles]
            )
            return files.filter { $0.pathExtension == "wav" }.sorted { url1, url2 in
                let date1 = (try? url1.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? Date.distantPast
                let date2 = (try? url2.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? Date.distantPast
                return date1 > date2
            }
        } catch {
            return []
        }
    }
}
