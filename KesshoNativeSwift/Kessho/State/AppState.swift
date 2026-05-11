import Foundation
import Combine

enum NativeSliderMode: String, Codable, Equatable {
    case single
    case walk
    case sampleHold
}

enum JourneyPosition: String, CaseIterable, Identifiable, Codable, Equatable {
    case center
    case top
    case right
    case bottom
    case left

    var id: String { rawValue }

    static let cardinalCases: [JourneyPosition] = [.left, .top, .right, .bottom]

    var title: String {
        switch self {
        case .center: return "Start"
        case .top: return "Top"
        case .right: return "Right"
        case .bottom: return "Bottom"
        case .left: return "Left"
        }
    }
}

enum JourneyPhase: String, Codable, Equatable {
    case idle
    case playing
    case morphing
    case selfLoop
    case ending
    case ended

    var displayName: String {
        switch self {
        case .idle: return "Idle"
        case .playing: return "Playing"
        case .morphing: return "Morphing"
        case .selfLoop: return "Loop"
        case .ending: return "Ending"
        case .ended: return "Ended"
        }
    }

    var isActive: Bool {
        switch self {
        case .playing, .morphing, .selfLoop, .ending:
            return true
        case .idle, .ended:
            return false
        }
    }
}

enum NativeGranularScene: String, CaseIterable, Identifiable {
    case air
    case swarm
    case wash
    case shards

    var id: String { rawValue }

    var title: String {
        switch self {
        case .air: return "Air"
        case .swarm: return "Swarm"
        case .wash: return "Wash"
        case .shards: return "Shards"
        }
    }

    var symbol: String {
        switch self {
        case .air: return "wind"
        case .swarm: return "circle.grid.3x3"
        case .wash: return "water.waves"
        case .shards: return "sparkles"
        }
    }
}

enum NativeAudioRuntimeMode: String {
    case legacySwift
    case coreProduct

    static func fromEnvironment() -> NativeAudioRuntimeMode {
        let requested = ProcessInfo.processInfo.environment["KESSHO_NATIVE_AUDIO_ENGINE"]?.lowercased()
        switch requested {
        case "legacy-swift", "legacy", "swift":
            return .legacySwift
        case "core-product", nil, "":
            return .coreProduct
        default:
            print("AppState: unknown KESSHO_NATIVE_AUDIO_ENGINE '\(requested ?? "")', using core-product")
            return .coreProduct
        }
    }
}

struct JourneyNode: Identifiable, Codable, Equatable {
    let id: String
    var position: JourneyPosition
    var presetID: String
    var presetName: String
    var phraseLength: Double
    var phraseLengthMax: Double?
    var colorIndex: Int

    var hasPreset: Bool { !presetName.isEmpty }
}

struct JourneyConnection: Identifiable, Codable, Equatable {
    let id: String
    var fromNodeID: String
    var toNodeID: String
    var morphDuration: Double
    var morphDurationMax: Double?
    var probability: Double
}

/// Main application state - observable for SwiftUI
@MainActor
class AppState: ObservableObject {
    // MARK: - Published State
    @Published var state: SliderState = .default
    @Published var isPlaying: Bool = false
    @Published var savedPresets: [SavedPreset] = []
    @Published var cloudPresets: [SavedPreset] = []
    @Published var cloudPresetsLoading: Bool = false
    @Published var cloudPresetError: String?
    @Published var showPresetList: Bool = false

    // Dual slider ranges - matches web app's dualRanges object
    // Key: parameter name, Value: (min, max) range
    @Published var dualRanges: [String: DualRange] = [:]

    // Current random walk values (interpolated between min/max)
    @Published var randomWalkValues: [String: Double] = [:]
    @Published var sliderModes: [String: NativeSliderMode] = [:]

    // Random walk animation phases (0-2π for each dual slider)
    private var walkPhases: [String: Double] = [:]
    private var sampleHoldTicks: [String: Int] = [:]

    // Engine state
    @Published var currentSeed: Int = 0
    @Published var currentBucket: String = ""
    @Published var cofCurrentStep: Int = 0
    @Published var currentFilterFreq: Double = 1000

    // Harmony state (from engine)
    @Published var currentChordDegrees: [Int] = []
    @Published var currentScaleName: String = ""

    // Morph state (matching web app)
    @Published var morphPresetA: SavedPreset?
    @Published var morphPresetB: SavedPreset?
    @Published var morphPosition: Double = 0  // 0-100
    @Published var morphMode: String = "manual"  // "manual", "auto"
    @Published var autoMorphEnabled: Bool = false
    @Published var autoMorphPhrasesRemaining: Int = 0
    @Published var morphPlayPhrases: Int = 16     // How long to stay at each preset
    @Published var morphTransitionPhrases: Int = 8  // How long the transition takes
    @Published var morphPhase: String = ""        // "Playing A", "Morphing to B", etc.

    // Recording state
    @Published var recordingState: RecordingState = .idle
    @Published var recordingDuration: TimeInterval = 0
    @Published var recordMain: Bool = true
    @Published var recordingEnabledStems: Set<RecordingStem> = []
    @Published var showRecordingSettings: Bool = false
    @Published var lastRecordedFiles: [URL] = []
    @Published var lastMIDIMessage: MIDIMessage?
    @Published var midiErrorMessage: String?
    @Published var playbackTimerEnabled: Bool = false
    @Published var playbackTimerMinutes: Int = 30
    @Published var playbackTimerRemaining: Int?
    @Published var journeyNodes: [JourneyNode] = AppState.makeDefaultJourneyNodes()
    @Published var journeyConnections: [JourneyConnection] = []
    @Published var journeyPhase: JourneyPhase = .idle
    @Published var journeyCurrentNodeID: String?
    @Published var journeyNextNodeID: String?
    @Published var journeyPlannedNextNodeID: String?
    @Published var journeyPhraseProgress: Double = 0
    @Published var journeyMorphProgress: Double = 0
    @Published var journeyElapsedTime: TimeInterval = 0
    @Published var journeyResolvedPhraseDuration: Double = 1
    @Published var journeyResolvedMorphDuration: Double = 0.5
    @Published var journeySelectedNodeID: String?
    @Published var journeySelectedConnectionID: String?
    @Published var journeyConnectionSourceID: String?

    // Auto-morph timer
    private var autoMorphTimer: DispatchSourceTimer?
    private var autoMorphCurrentPhase: AutoMorphPhase = .playingA
    private var phrasesInCurrentPhase: Int = 0

    private enum AutoMorphPhase {
        case playingA
        case morphingToB
        case playingB
        case morphingToA
    }

    // Random walk timer for dual sliders
    private var randomWalkTimer: DispatchSourceTimer?
    private var playbackTimer: DispatchSourceTimer?
    private var playbackTimerTargetTime: Date?
    private var journeyTimer: DispatchSourceTimer?
    private var journeyStartedAt: Date?
    private var journeyPhaseStartedAt: Date?
    private var journeyMorphFromPreset: SavedPreset?
    private var journeyMorphToPreset: SavedPreset?

    // Track last state for detecting changes at morph endpoints
    private var lastStateSnapshot: SliderState?

    // Track manual overrides during mid-morph (key -> (value, morphPosition))
    private var morphManualOverrides: [String: (value: Double, morphPosition: Double)] = [:]
    private var morphDirection: String = "toB"  // "toA" or "toB"
    private var lastMorphEndpoint: Double = 0  // 0 or 100
    private var shouldResumeAfterInterruption: Bool = false

    // MARK: - Audio Engine
    private let audioRuntimeMode = NativeAudioRuntimeMode.fromEnvironment()
    let audioEngine = AudioEngine()
    private var productCoreAudioEngine: KesshoProductCoreAudioEngine?
    let audioSessionManager = AudioSessionManager.shared
    let nowPlayingManager = NowPlayingManager.shared

    // MARK: - Audio Recorder
    let audioRecorder = AudioRecorder()

    // MARK: - Preset Manager
    let presetManager = PresetManager()
    let supabaseService = SupabaseService()

    // MARK: - MIDI
    let midiManager = MIDIManager(autoStart: false)
    let midiMapStore = MidiMapStore()

    private var cancellables = Set<AnyCancellable>()
    private let audioUpdateInterval: TimeInterval = 1.0 / 45.0
    private var pendingAudioState: SliderState?
    private var audioUpdateScheduled = false
    private var audioUpdateGeneration = 0
    private var lastAudioUpdateTime: TimeInterval = 0
    private var lastNowPlayingTitle: String?
    private var lastNowPlayingAlbum: String?
    private var lastNowPlayingIsPlaying: Bool?

    init() {
        setupServices()
        setupBindings()
        setupRecorder()
        loadPresets()
        setupMIDI()
    }

    deinit {
        randomWalkTimer?.setEventHandler {}
        randomWalkTimer?.cancel()
        autoMorphTimer?.setEventHandler {}
        autoMorphTimer?.cancel()
        playbackTimer?.setEventHandler {}
        playbackTimer?.cancel()
        journeyTimer?.setEventHandler {}
        journeyTimer?.cancel()
    }

    private func setupServices() {
        do {
            try audioSessionManager.configureForPlayback(
                preferredSampleRate: 44_100,
                preferredIOBufferDuration: 256.0 / 44_100.0
            )
        } catch {
            print("AppState: failed to configure audio session: \(error)")
        }

        nowPlayingManager.configureRemoteCommands(
            onPlay: { [weak self] in
                Task { @MainActor in
                    self?.start()
                }
            },
            onPause: { [weak self] in
                Task { @MainActor in
                    self?.stop()
                }
            },
            onTogglePlayPause: { [weak self] in
                Task { @MainActor in
                    self?.togglePlayback()
                }
            }
        )

        NotificationCenter.default.publisher(for: AudioServiceNotification.interruptionBegan)
            .sink { [weak self] _ in
                guard let self else { return }
                shouldResumeAfterInterruption = isPlaying
                if isPlaying {
                    stopActiveAudioEngine()
                    isPlaying = false
                    updatePlaybackTimer()
                    nowPlayingManager.setPlaybackState(isPlaying: false)
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: AudioServiceNotification.interruptionEnded)
            .sink { [weak self] _ in
                guard let self else { return }
                if shouldResumeAfterInterruption {
                    shouldResumeAfterInterruption = false
                    start()
                }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: AudioServiceNotification.routeChanged)
            .sink { [weak self] _ in
                guard let self else { return }
                if isPlaying {
                    updateNowPlayingInfo(force: true)
                }
            }
            .store(in: &cancellables)
    }

    private func setupBindings() {
        // Sync state changes to audio engine
        $state
            .dropFirst()
            .sink { [weak self] newState in
                self?.scheduleAudioEngineUpdate(newState)
            }
            .store(in: &cancellables)

        // Listen to engine state updates
        audioEngine.onStateChange = { [weak self] engineState in
            Task { @MainActor in
                self?.cofCurrentStep = engineState.cofCurrentStep
                self?.currentSeed = engineState.currentSeed
                self?.currentBucket = engineState.currentBucket
                self?.currentFilterFreq = engineState.currentFilterFreq
                if let harmony = engineState.harmonyState {
                    self?.currentChordDegrees = harmony.chordDegrees
                    self?.currentScaleName = harmony.scaleName
                }
                if self?.isPlaying == true {
                    self?.updateNowPlayingInfo()
                }
            }
        }
    }

    private func scheduleAudioEngineUpdate(_ newState: SliderState) {
        guard isPlaying else {
            pendingAudioState = nil
            return
        }

        pendingAudioState = newState
        guard !audioUpdateScheduled else { return }

        audioUpdateScheduled = true
        let generation = audioUpdateGeneration
        let now = Date().timeIntervalSinceReferenceDate
        let delay = max(0, lastAudioUpdateTime + audioUpdateInterval - now)

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self,
                  self.audioUpdateScheduled,
                  self.audioUpdateGeneration == generation else { return }

            self.audioUpdateScheduled = false
            guard let state = self.pendingAudioState else { return }
            self.pendingAudioState = nil
            self.lastAudioUpdateTime = Date().timeIntervalSinceReferenceDate
            self.updateActiveAudioEngine(state)
        }
    }

    private func cancelPendingAudioEngineUpdate() {
        audioUpdateGeneration += 1
        audioUpdateScheduled = false
        pendingAudioState = nil
    }

    private func updateNowPlayingInfo(force: Bool = false) {
        let title = currentScaleName.isEmpty ? "Generative Ambient" : currentScaleName
        let album = currentBucket.isEmpty ? "Kessho" : currentBucket
        guard force ||
                title != lastNowPlayingTitle ||
                album != lastNowPlayingAlbum ||
                isPlaying != lastNowPlayingIsPlaying else {
            return
        }

        lastNowPlayingTitle = title
        lastNowPlayingAlbum = album
        lastNowPlayingIsPlaying = isPlaying
        nowPlayingManager.updateNowPlayingInfo(
            title: title,
            artist: "Kessho",
            album: album,
            isLiveStream: true,
            isPlaying: isPlaying
        )
    }

    private func setupMIDI() {
        midiManager.$lastErrorMessage
            .receive(on: RunLoop.main)
            .sink { [weak self] message in
                self?.midiErrorMessage = message
            }
            .store(in: &cancellables)

        midiManager.events
            .receive(on: RunLoop.main)
            .sink { [weak self] message in
                self?.lastMIDIMessage = message
                self?.handleMIDIMessage(message)
            }
            .store(in: &cancellables)

        midiManager.$connectedInputIDs
            .dropFirst()
            .receive(on: RunLoop.main)
            .sink { [weak self] connectedIDs in
                guard let self else { return }
                midiMapStore.setConnectedInputIDs(Array(connectedIDs))
                midiMapStore.save()
            }
            .store(in: &cancellables)

        do {
            try midiManager.start()
            let savedInputIDs = Set(midiMapStore.profile.connectedInputIDs)
            if !savedInputIDs.isEmpty {
                midiManager.setConnectedInputs(savedInputIDs)
            } else {
                midiManager.refreshAvailableInputs()
            }
        } catch {
            midiErrorMessage = error.localizedDescription
        }
    }

    var latestMIDISummary: String {
        guard let message = lastMIDIMessage else {
            return midiManager.connectedInputIDs.isEmpty ? "No MIDI inputs connected" : "Listening for MIDI input"
        }

        let endpointName = message.endpointName ?? "MIDI Input"
        let channelDescription = message.channel.map { "ch \($0 + 1)" } ?? "system"
        let data1 = message.data1.map(String.init) ?? "-"
        let data2 = message.data2.map(String.init) ?? "-"
        return "\(endpointName): \(message.kind.rawValue) \(channelDescription) \(data1)/\(data2)"
    }

    // MARK: - Journey Graph

    private static func makeDefaultJourneyNodes() -> [JourneyNode] {
        JourneyPosition.allCases.enumerated().map { index, position in
            JourneyNode(
                id: "journey-\(position.rawValue)",
                position: position,
                presetID: "",
                presetName: "",
                phraseLength: position == .center ? 0 : 1,
                phraseLengthMax: nil,
                colorIndex: index
            )
        }
    }

    var journeyCurrentNodeName: String {
        guard let currentNode = journeyNode(id: journeyCurrentNodeID), currentNode.hasPreset else {
            return "--"
        }
        return currentNode.presetName.replacingOccurrences(of: "_", with: " ")
    }

    var journeyNextNodeName: String {
        guard let nextNode = journeyNode(id: journeyNextNodeID ?? journeyPlannedNextNodeID), nextNode.hasPreset else {
            return "--"
        }
        return nextNode.presetName.replacingOccurrences(of: "_", with: " ")
    }

    func journeyNode(id: String?) -> JourneyNode? {
        guard let id else { return nil }
        return journeyNodes.first { $0.id == id }
    }

    func journeyNode(position: JourneyPosition) -> JourneyNode? {
        journeyNodes.first { $0.position == position }
    }

    func assignJourneyPreset(_ preset: SavedPreset, to position: JourneyPosition) {
        guard position != .center,
              let index = journeyNodes.firstIndex(where: { $0.position == position }) else { return }

        journeyNodes[index].presetID = preset.id
        journeyNodes[index].presetName = preset.name
        journeyNodes[index].colorIndex = colorIndex(for: position)

        if journeyConnections.isEmpty,
           let centerID = journeyNode(position: .center)?.id {
            addJourneyConnection(from: centerID, to: journeyNodes[index].id)
        }
    }

    func clearJourneyNode(_ id: String) {
        guard let index = journeyNodes.firstIndex(where: { $0.id == id }),
              journeyNodes[index].position != .center else { return }

        if journeyCurrentNodeID == id || journeyNextNodeID == id {
            stopJourney()
        }

        journeyNodes[index].presetID = ""
        journeyNodes[index].presetName = ""
        journeyConnections.removeAll { $0.fromNodeID == id || $0.toNodeID == id }
        if journeySelectedNodeID == id {
            journeySelectedNodeID = nil
        }
    }

    func beginJourneyConnection(from id: String) {
        guard journeyNode(id: id) != nil else { return }
        journeyConnectionSourceID = id
        journeySelectedNodeID = id
        journeySelectedConnectionID = nil
    }

    func finishJourneyConnection(to id: String) {
        guard let sourceID = journeyConnectionSourceID else { return }
        addJourneyConnection(from: sourceID, to: id)
        journeyConnectionSourceID = nil
        journeySelectedNodeID = id
    }

    func addJourneyConnection(from fromID: String, to toID: String) {
        guard journeyNode(id: fromID) != nil,
              journeyNode(id: toID) != nil else { return }

        if journeyConnections.contains(where: { $0.fromNodeID == fromID && $0.toNodeID == toID }) {
            return
        }

        if journeyNode(id: fromID)?.position == .center {
            journeyConnections.removeAll { connection in
                journeyNode(id: connection.fromNodeID)?.position == .center
            }
        }

        journeyConnections.append(
            JourneyConnection(
                id: "journey-connection-\(UUID().uuidString)",
                fromNodeID: fromID,
                toNodeID: toID,
                morphDuration: 0.5,
                morphDurationMax: nil,
                probability: 1
            )
        )
    }

    func removeJourneyConnection(_ id: String) {
        journeyConnections.removeAll { $0.id == id }
        if journeySelectedConnectionID == id {
            journeySelectedConnectionID = nil
        }
    }

    func connectJourneyClockwise() {
        let filledNodes = JourneyPosition.cardinalCases.compactMap { position in
            journeyNode(position: position).flatMap { $0.hasPreset ? $0 : nil }
        }
        guard let firstNode = filledNodes.first,
              let centerID = journeyNode(position: .center)?.id else { return }

        journeyConnections.removeAll()
        addJourneyConnection(from: centerID, to: firstNode.id)

        guard filledNodes.count > 1 else {
            addJourneyConnection(from: firstNode.id, to: firstNode.id)
            return
        }

        for index in filledNodes.indices {
            let fromNode = filledNodes[index]
            let toNode = filledNodes[(index + 1) % filledNodes.count]
            addJourneyConnection(from: fromNode.id, to: toNode.id)
        }
    }

    func setJourneyNodePhraseMin(_ id: String, _ value: Double) {
        guard let index = journeyNodes.firstIndex(where: { $0.id == id }) else { return }
        let nextValue = min(max(value, 1), 100)
        if let maxValue = journeyNodes[index].phraseLengthMax {
            journeyNodes[index].phraseLength = min(nextValue, maxValue)
        } else {
            journeyNodes[index].phraseLength = nextValue
        }
    }

    func setJourneyNodePhraseMax(_ id: String, _ value: Double) {
        guard let index = journeyNodes.firstIndex(where: { $0.id == id }) else { return }
        journeyNodes[index].phraseLengthMax = max(journeyNodes[index].phraseLength, min(max(value, 1), 100))
    }

    func toggleJourneyNodePhraseRange(_ id: String) {
        guard let index = journeyNodes.firstIndex(where: { $0.id == id }) else { return }
        if let maxValue = journeyNodes[index].phraseLengthMax {
            journeyNodes[index].phraseLength = (journeyNodes[index].phraseLength + maxValue) / 2
            journeyNodes[index].phraseLengthMax = nil
        } else {
            journeyNodes[index].phraseLengthMax = journeyNodes[index].phraseLength
        }
    }

    func setJourneyConnectionDurationMin(_ id: String, _ value: Double) {
        guard let index = journeyConnections.firstIndex(where: { $0.id == id }) else { return }
        let nextValue = min(max(value, 0.25), 64)
        if let maxValue = journeyConnections[index].morphDurationMax {
            journeyConnections[index].morphDuration = min(nextValue, maxValue)
        } else {
            journeyConnections[index].morphDuration = nextValue
        }
    }

    func setJourneyConnectionDurationMax(_ id: String, _ value: Double) {
        guard let index = journeyConnections.firstIndex(where: { $0.id == id }) else { return }
        journeyConnections[index].morphDurationMax = max(journeyConnections[index].morphDuration, min(max(value, 0.25), 64))
    }

    func toggleJourneyConnectionDurationRange(_ id: String) {
        guard let index = journeyConnections.firstIndex(where: { $0.id == id }) else { return }
        if let maxValue = journeyConnections[index].morphDurationMax {
            journeyConnections[index].morphDuration = (journeyConnections[index].morphDuration + maxValue) / 2
            journeyConnections[index].morphDurationMax = nil
        } else {
            journeyConnections[index].morphDurationMax = journeyConnections[index].morphDuration
        }
    }

    func setJourneyConnectionProbability(_ id: String, _ probability: Double) {
        guard let index = journeyConnections.firstIndex(where: { $0.id == id }) else { return }
        journeyConnections[index].probability = min(max(probability, 0), 1)
    }

    func toggleJourneyPlayback() {
        if journeyPhase.isActive {
            stopJourney()
        } else {
            playJourney()
        }
    }

    func playJourney() {
        guard let startNode = journeyStartNode(),
              let startPreset = preset(for: startNode) else { return }

        if autoMorphEnabled {
            toggleAutoMorph()
        }

        morphPresetB = nil
        morphPosition = 0
        loadPreset(startPreset)
        if !isPlaying {
            start()
        }

        journeyStartedAt = Date()
        beginJourneyPlaying(startNode)
        startJourneyTimer()
    }

    func stopJourney(stopAudio: Bool = true) {
        journeyTimer?.setEventHandler {}
        journeyTimer?.cancel()
        journeyTimer = nil
        journeyStartedAt = nil
        journeyPhaseStartedAt = nil
        journeyMorphFromPreset = nil
        journeyMorphToPreset = nil
        journeyPhase = .idle
        journeyCurrentNodeID = nil
        journeyNextNodeID = nil
        journeyPlannedNextNodeID = nil
        journeyPhraseProgress = 0
        journeyMorphProgress = 0
        journeyElapsedTime = 0
        if stopAudio, isPlaying {
            stop()
        }
    }

    private func startJourneyTimer() {
        guard journeyTimer == nil else { return }

        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + 0.1, repeating: 0.1, leeway: .milliseconds(60))
        timer.setEventHandler { [weak self] in
            Task { @MainActor in
                self?.tickJourney()
            }
        }
        journeyTimer = timer
        timer.resume()
    }

    private func tickJourney() {
        guard journeyPhase.isActive else { return }
        let now = Date()
        if let journeyStartedAt {
            journeyElapsedTime = now.timeIntervalSince(journeyStartedAt)
        }

        switch journeyPhase {
        case .playing:
            tickJourneyPlaying(now: now)
        case .morphing:
            tickJourneyMorphing(now: now)
        case .selfLoop:
            tickJourneySelfLoop(now: now)
        case .ending:
            tickJourneyEnding(now: now)
        case .idle, .ended:
            break
        }
    }

    private func tickJourneyPlaying(now: Date) {
        guard let startedAt = journeyPhaseStartedAt else { return }
        let duration = max(0.1, journeyResolvedPhraseDuration * state.effectivePhraseLength)
        let progress = min(1, now.timeIntervalSince(startedAt) / duration)
        journeyPhraseProgress = progress
        guard progress >= 1,
              let currentNode = journeyNode(id: journeyCurrentNodeID) else { return }

        guard let connection = selectNextJourneyConnection(from: currentNode) else {
            journeyPhase = .ended
            stopJourney()
            return
        }

        startJourneyTransition(connection)
    }

    private func tickJourneyMorphing(now: Date) {
        guard let startedAt = journeyPhaseStartedAt else { return }
        let duration = max(0.1, journeyResolvedMorphDuration * state.effectivePhraseLength)
        let progress = min(1, now.timeIntervalSince(startedAt) / duration)
        journeyMorphProgress = progress
        setMorphPosition(progress * 100)

        guard progress >= 1,
              let nextNode = journeyNode(id: journeyNextNodeID) else { return }

        setMorphPosition(100)
        beginJourneyPlaying(nextNode)
    }

    private func tickJourneySelfLoop(now: Date) {
        guard let startedAt = journeyPhaseStartedAt else { return }
        let duration = max(0.1, journeyResolvedMorphDuration * state.effectivePhraseLength)
        journeyMorphProgress = min(1, now.timeIntervalSince(startedAt) / duration)
        guard journeyMorphProgress >= 1,
              let currentNode = journeyNode(id: journeyCurrentNodeID) else { return }

        beginJourneyPlaying(currentNode)
    }

    private func tickJourneyEnding(now: Date) {
        guard let startedAt = journeyPhaseStartedAt else { return }
        let duration = max(0.1, journeyResolvedMorphDuration * state.effectivePhraseLength)
        journeyMorphProgress = min(1, now.timeIntervalSince(startedAt) / duration)
        guard journeyMorphProgress >= 1 else { return }
        journeyPhase = .ended
        stopJourney()
    }

    private func beginJourneyPlaying(_ node: JourneyNode) {
        journeyPhase = .playing
        journeyCurrentNodeID = node.id
        journeyNextNodeID = nil
        journeyPhraseProgress = 0
        journeyMorphProgress = 0
        journeyPhaseStartedAt = Date()
        journeyResolvedPhraseDuration = resolveJourneyDuration(min: node.phraseLength, max: node.phraseLengthMax)
        journeyPlannedNextNodeID = selectNextJourneyConnection(from: node)?.toNodeID
    }

    private func startJourneyTransition(_ connection: JourneyConnection) {
        guard let fromNode = journeyNode(id: connection.fromNodeID),
              let toNode = journeyNode(id: connection.toNodeID) else { return }

        journeyNextNodeID = toNode.id
        journeyPlannedNextNodeID = toNode.id
        journeyMorphProgress = 0
        journeyPhaseStartedAt = Date()
        journeyResolvedMorphDuration = resolveJourneyDuration(
            min: connection.morphDuration,
            max: connection.morphDurationMax
        )

        if toNode.position == .center {
            journeyPhase = .ending
            return
        }

        if fromNode.id == toNode.id {
            journeyPhase = .selfLoop
            return
        }

        guard let fromPreset = preset(for: fromNode),
              let toPreset = preset(for: toNode) else {
            beginJourneyPlaying(fromNode)
            return
        }

        journeyMorphFromPreset = fromPreset
        journeyMorphToPreset = toPreset
        morphPresetA = fromPreset
        morphPresetB = toPreset
        morphPosition = 0
        journeyPhase = .morphing
    }

    private func journeyStartNode() -> JourneyNode? {
        if let centerID = journeyNode(position: .center)?.id,
           let startConnection = journeyConnections.first(where: { $0.fromNodeID == centerID }),
           let node = journeyNode(id: startConnection.toNodeID),
           node.hasPreset {
            return node
        }

        return JourneyPosition.cardinalCases
            .compactMap { journeyNode(position: $0) }
            .first { $0.hasPreset }
    }

    private func selectNextJourneyConnection(from node: JourneyNode) -> JourneyConnection? {
        let eligibleConnections = journeyConnections.filter { connection in
            connection.fromNodeID == node.id && isJourneyDestinationPlayable(connection.toNodeID)
        }
        guard !eligibleConnections.isEmpty else { return nil }

        let totalProbability = eligibleConnections.reduce(0) { $0 + max($1.probability, 0) }
        guard totalProbability > 0 else { return eligibleConnections.first }

        var threshold = Double.random(in: 0...totalProbability)
        for connection in eligibleConnections {
            threshold -= max(connection.probability, 0)
            if threshold <= 0 {
                return connection
            }
        }
        return eligibleConnections.last
    }

    private func isJourneyDestinationPlayable(_ nodeID: String) -> Bool {
        guard let node = journeyNode(id: nodeID) else { return false }
        return node.position == .center || node.hasPreset
    }

    private func preset(for node: JourneyNode) -> SavedPreset? {
        savedPresets.first { preset in
            preset.id == node.presetID || preset.name == node.presetName
        }
    }

    private func resolveJourneyDuration(min: Double, max: Double?) -> Double {
        guard let max, max > min else { return min }
        return Double.random(in: min...max)
    }

    private func colorIndex(for position: JourneyPosition) -> Int {
        switch position {
        case .center: return 0
        case .left: return 1
        case .top: return 2
        case .right: return 3
        case .bottom: return 4
        }
    }

    // MARK: - Playback Timer

    var formattedPlaybackTimerRemaining: String {
        guard let playbackTimerRemaining else {
            return "\(playbackTimerMinutes)m"
        }
        return Self.formatClock(seconds: playbackTimerRemaining)
    }

    func setPlaybackTimerEnabled(_ enabled: Bool) {
        guard playbackTimerEnabled != enabled else { return }
        playbackTimerEnabled = enabled
        updatePlaybackTimer()
    }

    func setPlaybackTimerMinutes(_ minutes: Int) {
        playbackTimerMinutes = min(max(minutes, 1), 480)
        if playbackTimerEnabled && isPlaying {
            resetPlaybackTimer()
        } else {
            playbackTimerRemaining = nil
        }
    }

    func resetPlaybackTimer() {
        let seconds = playbackTimerMinutes * 60
        playbackTimerTargetTime = Date().addingTimeInterval(TimeInterval(seconds))
        playbackTimerRemaining = seconds
        updatePlaybackTimer()
    }

    private func updatePlaybackTimer() {
        guard playbackTimerEnabled, isPlaying else {
            stopPlaybackTimer(resetRemaining: !isPlaying || !playbackTimerEnabled)
            return
        }

        if playbackTimerTargetTime == nil {
            let seconds = playbackTimerRemaining ?? playbackTimerMinutes * 60
            playbackTimerTargetTime = Date().addingTimeInterval(TimeInterval(seconds))
            playbackTimerRemaining = seconds
        }
        startPlaybackTimer()
        tickPlaybackTimer()
    }

    private func startPlaybackTimer() {
        guard playbackTimer == nil else { return }

        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + 1.0, repeating: 1.0, leeway: .milliseconds(250))
        timer.setEventHandler { [weak self] in
            Task { @MainActor in
                self?.tickPlaybackTimer()
            }
        }
        playbackTimer = timer
        timer.resume()
    }

    private func stopPlaybackTimer(resetRemaining: Bool) {
        playbackTimer?.setEventHandler {}
        playbackTimer?.cancel()
        playbackTimer = nil
        playbackTimerTargetTime = nil
        if resetRemaining {
            playbackTimerRemaining = nil
        }
    }

    private func tickPlaybackTimer() {
        guard playbackTimerEnabled, isPlaying, let targetTime = playbackTimerTargetTime else {
            stopPlaybackTimer(resetRemaining: !isPlaying || !playbackTimerEnabled)
            return
        }

        let secondsRemaining = Int(ceil(targetTime.timeIntervalSinceNow))
        guard secondsRemaining > 0 else {
            playbackTimerRemaining = nil
            playbackTimerTargetTime = nil
            stop()
            return
        }

        if playbackTimerRemaining != secondsRemaining {
            playbackTimerRemaining = secondsRemaining
        }
    }

    private static func formatClock(seconds: Int) -> String {
        let clamped = max(0, seconds)
        let hours = clamped / 3600
        let minutes = (clamped % 3600) / 60
        let seconds = clamped % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%d:%02d", minutes, seconds)
    }

    // MARK: - Random Walk Timer

    /// Start the random walk timer that animates dual slider values
    private func startRandomWalkTimer() {
        guard randomWalkTimer == nil else { return }

        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + 0.1, repeating: 0.1, leeway: .milliseconds(40))
        timer.setEventHandler { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                guard !self.dualRanges.isEmpty else {
                    self.stopRandomWalkTimer()
                    return
                }
                self.tickRandomWalk()
            }
        }
        randomWalkTimer = timer
        timer.resume()
    }

    private func stopRandomWalkTimer() {
        randomWalkTimer?.setEventHandler {}
        randomWalkTimer?.cancel()
        randomWalkTimer = nil
    }

    private func updateRandomWalkTimer() {
        if dualRanges.isEmpty || !isPlaying {
            stopRandomWalkTimer()
        } else {
            startRandomWalkTimer()
        }
    }

    /// Tick the random walk - update values for all active dual sliders
    private func tickRandomWalk() {
        guard !dualRanges.isEmpty else { return }

        // Use randomWalkSpeed from state (0.1 to 5.0)
        let walkSpeed = state.randomWalkSpeed * 0.02  // Base speed ~2% per tick
        var nextState = state

        for (key, range) in dualRanges {
            let rangeWidth = range.max - range.min
            guard rangeWidth > 0.001 else {
                randomWalkValues[key] = range.min
                updateSliderStateValue(&nextState, key: key, value: range.min)
                continue
            }

            let mode = sliderModes[key] ?? .walk
            let value: Double
            switch mode {
            case .single:
                continue
            case .walk:
                // Get or initialize phase for this slider
                var phase = walkPhases[key] ?? Double.random(in: 0...(.pi * 2))
                phase += walkSpeed
                if phase > .pi * 2 { phase -= .pi * 2 }
                walkPhases[key] = phase

                // Use sine wave for smooth oscillation
                let normalized = (sin(phase) + 1) / 2  // 0 to 1
                value = range.min + normalized * rangeWidth
            case .sampleHold:
                let ticksRemaining = sampleHoldTicks[key] ?? 0
                if ticksRemaining <= 0 || randomWalkValues[key] == nil {
                    value = Double.random(in: range.min...range.max)
                    let holdTicks = max(2, Int((14 / max(0.1, state.randomWalkSpeed)).rounded()))
                    sampleHoldTicks[key] = holdTicks
                } else {
                    value = randomWalkValues[key] ?? ((range.min + range.max) / 2)
                    sampleHoldTicks[key] = ticksRemaining - 1
                }
            }
            randomWalkValues[key] = value
            updateSliderStateValue(&nextState, key: key, value: value)
        }

        if nextState != state {
            state = nextState
        }
    }

    // MARK: - Dual Slider Management

    /// Enable dual mode for a parameter
    func enableDualMode(for key: String, currentValue: Double, rangeMin: Double, rangeMax: Double) {
        // Initialize with 20% spread around current value
        let spread = (rangeMax - rangeMin) * 0.2
        let min = Swift.max(rangeMin, currentValue - spread)
        let max = Swift.min(rangeMax, currentValue + spread)
        dualRanges[key] = DualRange(min: min, max: max)
        randomWalkValues[key] = currentValue
        sliderModes[key] = .walk
        walkPhases[key] = 0
        sampleHoldTicks[key] = 0
        updateRandomWalkTimer()

        // Check if this is a drum parameter
        if getDrumVoice(for: key) != nil {
            handleDrumDualSliderChange(
                key: key,
                isDualMode: true,
                value: currentValue,
                range: (min: min, max: max)
            )
        } else {
            // Update morph preset dualRanges at endpoints (Rule 2)
            updateMorphPresetDualRange(key: key, range: DualRange(min: min, max: max))
        }
    }

    /// Disable dual mode for a parameter
    func disableDualMode(for key: String) {
        dualRanges.removeValue(forKey: key)
        randomWalkValues.removeValue(forKey: key)
        sliderModes.removeValue(forKey: key)
        walkPhases.removeValue(forKey: key)
        sampleHoldTicks.removeValue(forKey: key)
        updateRandomWalkTimer()

        // Check if this is a drum parameter
        if getDrumVoice(for: key) != nil {
            handleDrumDualSliderChange(
                key: key,
                isDualMode: false,
                value: 0,
                range: nil
            )
        } else {
            // Update morph preset dualRanges at endpoints (Rule 2)
            removeMorphPresetDualRange(key: key)
        }
    }

    /// Toggle dual mode for a parameter
    func toggleDualMode(for key: String, currentValue: Double, rangeMin: Double, rangeMax: Double) {
        if dualRanges[key] != nil {
            disableDualMode(for: key)
        } else {
            enableDualMode(for: key, currentValue: currentValue, rangeMin: rangeMin, rangeMax: rangeMax)
        }
    }

    func cycleSliderMode(for key: String, currentValue: Double, rangeMin: Double, rangeMax: Double) {
        switch sliderModes[key] ?? .single {
        case .single:
            enableDualMode(for: key, currentValue: currentValue, rangeMin: rangeMin, rangeMax: rangeMax)
            sliderModes[key] = .walk
        case .walk:
            sliderModes[key] = .sampleHold
            sampleHoldTicks[key] = 0
            updateRandomWalkTimer()
        case .sampleHold:
            disableDualMode(for: key)
        }
    }

    /// Update dual range min/max
    func updateDualRange(for key: String, min: Double, max: Double) {
        dualRanges[key] = DualRange(min: min, max: max)
        if sliderModes[key] == nil {
            sliderModes[key] = .walk
        }
        updateRandomWalkTimer()

        // Check if this is a drum parameter
        if getDrumVoice(for: key) != nil {
            handleDrumDualSliderChange(
                key: key,
                isDualMode: true,
                value: (min + max) / 2,
                range: (min: min, max: max)
            )
        } else {
            // Update morph preset dualRanges at endpoints (Rule 2)
            updateMorphPresetDualRange(key: key, range: DualRange(min: min, max: max))
        }
    }

    /// Update morph preset's dualRanges at endpoints
    private func updateMorphPresetDualRange(key: String, range: DualRange) {
        let isMorphActive = morphPresetA != nil || morphPresetB != nil
        guard isMorphActive else { return }

        if morphPosition == 0, let presetA = morphPresetA {
            var dualRanges = presetA.dualRanges ?? [:]
            dualRanges[key] = range
            morphPresetA = SavedPreset(
                name: presetA.name,
                timestamp: presetA.timestamp,
                state: presetA.state,
                dualRanges: dualRanges
            )
        } else if morphPosition == 100, let presetB = morphPresetB {
            var dualRanges = presetB.dualRanges ?? [:]
            dualRanges[key] = range
            morphPresetB = SavedPreset(
                name: presetB.name,
                timestamp: presetB.timestamp,
                state: presetB.state,
                dualRanges: dualRanges
            )
        }
    }

    /// Remove key from morph preset's dualRanges at endpoints
    private func removeMorphPresetDualRange(key: String) {
        let isMorphActive = morphPresetA != nil || morphPresetB != nil
        guard isMorphActive else { return }

        if morphPosition == 0, let presetA = morphPresetA {
            var dualRanges = presetA.dualRanges ?? [:]
            dualRanges.removeValue(forKey: key)
            morphPresetA = SavedPreset(
                name: presetA.name,
                timestamp: presetA.timestamp,
                state: presetA.state,
                dualRanges: dualRanges.isEmpty ? nil : dualRanges
            )
        } else if morphPosition == 100, let presetB = morphPresetB {
            var dualRanges = presetB.dualRanges ?? [:]
            dualRanges.removeValue(forKey: key)
            morphPresetB = SavedPreset(
                name: presetB.name,
                timestamp: presetB.timestamp,
                state: presetB.state,
                dualRanges: dualRanges.isEmpty ? nil : dualRanges
            )
        }
    }

    // MARK: - Slider Change Handling for Morph

    /// Call this when a slider value changes to handle morph preset updates
    /// Rule 1: Mid-morph changes are temporary overrides
    /// Rule 2: Endpoint changes (0% or 100%) update the respective preset permanently
    func handleSliderChange(key: String, value: Double) {
        // Check if this is a drum parameter and handle with drum morph system
        if getDrumVoice(for: key) != nil {
            handleDrumSliderChange(key: key, value: value)
            return
        }

        let isMorphActive = morphPresetA != nil || morphPresetB != nil
        guard isMorphActive else { return }

        if morphPosition == 0, let presetA = morphPresetA {
            // At endpoint A: update preset A permanently
            var newState = presetA.state
            updateSliderStateValue(&newState, key: key, value: value)
            morphPresetA = SavedPreset(
                name: presetA.name,
                timestamp: presetA.timestamp,
                state: newState,
                dualRanges: presetA.dualRanges
            )
        } else if morphPosition == 100, let presetB = morphPresetB {
            // At endpoint B: update preset B permanently
            var newState = presetB.state
            updateSliderStateValue(&newState, key: key, value: value)
            morphPresetB = SavedPreset(
                name: presetB.name,
                timestamp: presetB.timestamp,
                state: newState,
                dualRanges: presetB.dualRanges
            )
        } else {
            // Mid-morph: store as temporary override
            morphManualOverrides[key] = (value: value, morphPosition: morphPosition)
        }
    }

    /// Commit a slider value to the live state, then mirror the edit into the morph system when needed.
    func setSliderValue(key: String, value: Double) {
        var newState = state
        updateSliderStateValue(&newState, key: key, value: value)

        if newState != state {
            state = newState
        }

        handleSliderChange(key: key, value: value)
    }

    // MARK: - Drum Morph Override Handling

    /// Map of drum param prefix to voice type
    private static let drumParamPrefixes: [String: DrumVoiceType] = [
        "drumSub": .sub, "drumKick": .kick, "drumClick": .click,
        "drumBeepHi": .beepHi, "drumBeepLo": .beepLo, "drumNoise": .noise
    ]

    /// Map of drum preset keys to voice type
    private static let drumPresetVoiceMap: [String: DrumVoiceType] = [
        "drumSubPresetA": .sub, "drumSubPresetB": .sub,
        "drumKickPresetA": .kick, "drumKickPresetB": .kick,
        "drumClickPresetA": .click, "drumClickPresetB": .click,
        "drumBeepHiPresetA": .beepHi, "drumBeepHiPresetB": .beepHi,
        "drumBeepLoPresetA": .beepLo, "drumBeepLoPresetB": .beepLo,
        "drumNoisePresetA": .noise, "drumNoisePresetB": .noise
    ]

    /// Get the voice type for a drum parameter key
    private func getDrumVoice(for key: String) -> DrumVoiceType? {
        for (prefix, voice) in Self.drumParamPrefixes {
            if key.hasPrefix(prefix) && !key.contains("Morph") && !key.contains("Preset") {
                return voice
            }
        }
        return nil
    }

    /// Get the morph position for a drum voice
    private func getDrumMorphPosition(for voice: DrumVoiceType) -> Double {
        switch voice {
        case .sub: return state.drumSubMorph
        case .kick: return state.drumKickMorph
        case .click: return state.drumClickMorph
        case .beepHi: return state.drumBeepHiMorph
        case .beepLo: return state.drumBeepLoMorph
        case .noise: return state.drumNoiseMorph
        }
    }

    /// Handle drum synth slider changes for morph override tracking
    func handleDrumSliderChange(key: String, value: Double) {
        guard let voice = getDrumVoice(for: key) else { return }

        let morphPosition = getDrumMorphPosition(for: voice)
        setDrumMorphOverride(voice: voice, param: key, value: value, morphPosition: morphPosition)
    }

    /// Handle drum preset changes - clear appropriate endpoint overrides
    func handleDrumPresetChange(key: String) {
        guard let voice = Self.drumPresetVoiceMap[key] else { return }

        let isPresetA = key.contains("PresetA")
        let morphPosition = getDrumMorphPosition(for: voice)

        // Only reset dual modes if the preset change affects current position
        let atEndpoint0 = morphPosition < 0.01
        let atEndpoint1 = morphPosition > 0.99

        if isPresetA {
            // Clear endpoint 0 overrides
            clearDrumMorphEndpointOverrides(voice: voice, endpoint: 0)

            // Only reset dual modes if not at endpoint 1
            if !atEndpoint1 {
                clearDrumDualModesForVoice(voice)
            }
        } else {
            // Clear endpoint 1 overrides
            clearDrumMorphEndpointOverrides(voice: voice, endpoint: 1)

            // Only reset dual modes if not at endpoint 0
            if !atEndpoint0 {
                clearDrumDualModesForVoice(voice)
            }
        }
    }

    /// Handle drum morph position changes - clear mid-morph overrides at endpoints
    func handleDrumMorphChange(voice: DrumVoiceType, morphValue: Double) {
        let atEndpoint = morphValue < 0.01 || morphValue > 0.99
        if atEndpoint {
            clearMidMorphOverrides(voice: voice)
        }
    }

    /// Clear dual modes for a drum voice's parameters
    private func clearDrumDualModesForVoice(_ voice: DrumVoiceType) {
        let prefix: String
        switch voice {
        case .sub: prefix = "drumSub"
        case .kick: prefix = "drumKick"
        case .click: prefix = "drumClick"
        case .beepHi: prefix = "drumBeepHi"
        case .beepLo: prefix = "drumBeepLo"
        case .noise: prefix = "drumNoise"
        }

        // Remove dual ranges for this voice
        dualRanges = dualRanges.filter { key, _ in
            !(key.hasPrefix(prefix) && !key.contains("Morph") && !key.contains("Preset"))
        }
        updateRandomWalkTimer()
    }

    /// Handle dual slider changes for drum morph
    func handleDrumDualSliderChange(
        key: String,
        isDualMode: Bool,
        value: Double,
        range: (min: Double, max: Double)?
    ) {
        guard let voice = getDrumVoice(for: key) else { return }

        let morphPosition = getDrumMorphPosition(for: voice)
        setDrumMorphDualRangeOverride(
            voice: voice,
            param: key,
            isDualMode: isDualMode,
            value: value,
            range: range,
            morphPosition: morphPosition
        )
    }

    /// Helper to update a SliderState property by key
    private func updateSliderStateValue(_ state: inout SliderState, key: String, value: Double) {
        switch key {
        case "masterVolume": state.masterVolume = value
        case "synthLevel": state.synthLevel = value
        case "granularLevel": state.granularLevel = value
        case "synthReverbSend":
            state.synthReverbSend = value
            state.pad1ReverbSend = value
        case "granularReverbSend": state.granularReverbSend = value
        case "granularDelayASend": state.granularDelayASend = value
        case "granularDelayBSend": state.granularDelayBSend = value
        case "leadReverbSend":
            state.leadReverbSend = value
            state.lead1ReverbSend = value
        case "lead2Level": state.lead2Level = value
        case "lead2ReverbSend": state.lead2ReverbSend = value
        case "pianoLevel": state.pianoLevel = value
        case "pianoReverbSend": state.pianoReverbSend = value
        case "leadDelayReverbSend": state.leadDelayReverbSend = value
        case "delayAReverbSend": state.delayAReverbSend = value
        case "reverbLevel": state.reverbLevel = value
        case "earthLevel": state.earthLevel = value
        case "pad1DelayASend": state.pad1DelayASend = value
        case "pad1DelayBSend": state.pad1DelayBSend = value
        case "pad2DelayASend": state.pad2DelayASend = value
        case "pad2DelayBSend": state.pad2DelayBSend = value
        case "lead1DelayASend": state.lead1DelayASend = value
        case "lead1DelayBSend": state.lead1DelayBSend = value
        case "lead2DelayASend": state.lead2DelayASend = value
        case "lead2DelayBSend": state.lead2DelayBSend = value
        case "pianoDelayASend": state.pianoDelayASend = value
        case "pianoDelayBSend": state.pianoDelayBSend = value
        case "drumDelayASend": state.drumDelayASend = value
        case "drumDelayBSend": state.drumDelayBSend = value
        case "drumReverbSend": state.drumReverbSend = value
        case "drumDelayFeedback": state.drumDelayFeedback = value
        case "drumDelayMix": state.drumDelayMix = value
        case "randomness": state.randomness = value
        case "tension": state.tension = value
        case "phraseLength": state.phraseLength = value
        case "sequencerMasterBPM":
            state.sequencerMasterBPM = value
            state.drumEuclidBaseBPM = value
        case "transportBarsPerPhrase": state.transportBarsPerPhrase = Int(value.rounded())
        case "transportBeatsPerBar": state.transportBeatsPerBar = Int(value.rounded())
        case "cofDriftRate": state.cofDriftRate = Int(value.rounded())
        case "cofDriftRange": state.cofDriftRange = Int(value.rounded())
        case "chordRate": state.chordRate = Int(value.rounded())
        case "voicingSpread": state.voicingSpread = value
        case "chordProgressionSteps":
            let steps = max(1, min(8, Int(value.rounded())))
            state.chordProgressionSteps = steps
            while state.chordProgressionPattern.count < steps {
                state.chordProgressionPattern.append(0)
            }
            if state.chordProgressionPattern.count > steps {
                state.chordProgressionPattern = Array(state.chordProgressionPattern.prefix(steps))
            }
            while state.chordProgressionStepEnabled.count < steps {
                state.chordProgressionStepEnabled.append(true)
            }
            if state.chordProgressionStepEnabled.count > steps {
                state.chordProgressionStepEnabled = Array(state.chordProgressionStepEnabled.prefix(steps))
            }
        case "chordProgressionPhraseMultiplier":
            let allowed = [1, 2, 4, 8]
            state.chordProgressionPhraseMultiplier = allowed.min(by: { abs($0 - Int(value.rounded())) < abs($1 - Int(value.rounded())) }) ?? 1
        case "waveSpread": state.waveSpread = value
        case "detune": state.detune = value
        case "synthOctave": state.synthOctave = Int(value)
        case "synthVoiceMask": state.synthVoiceMask = max(1, Int(value.rounded()))
        case "synthAttack": state.synthAttack = value
        case "synthDecay": state.synthDecay = value
        case "synthSustain": state.synthSustain = value
        case "synthRelease": state.synthRelease = value
        case "hardness": state.hardness = value
        case "brightness", "oscBrightness":
            state.brightness = value
            state.oscBrightness = Int(value.rounded())
        case "filterCutoffMin": state.filterCutoffMin = value
        case "filterCutoffMax": state.filterCutoffMax = value
        case "filterModSpeed": state.filterModSpeed = value
        case "filterResonance": state.filterResonance = value
        case "filterQ": state.filterQ = value
        case "warmth": state.warmth = value
        case "presence": state.presence = value
        case "air", "airNoise": state.airNoise = value
        case "reverbDecay": state.reverbDecay = value
        case "reverbSize": state.reverbSize = value
        case "reverbDiffusion": state.reverbDiffusion = value
        case "reverbModulation": state.reverbModulation = value
        case "reverbPredelay", "predelay": state.predelay = value
        case "reverbDamping", "damping": state.damping = value
        case "reverbWidth", "width": state.width = value
        case "reverbShimmer": state.reverbShimmer = value
        case "reverbShimmerPitch": state.reverbShimmerPitch = value
        case "reverbSlowModRate": state.reverbSlowModRate = value
        case "reverbSlowModDepth": state.reverbSlowModDepth = value
        case "reverbReverse": state.reverbReverse = value
        case "reverbReverseLength": state.reverbReverseLength = value
        case "reverbChorusRate": state.reverbChorusRate = value
        case "reverbChorusDepth": state.reverbChorusDepth = value
        case "reverbDampLow": state.reverbDampLow = value
        case "reverbDampHigh": state.reverbDampHigh = value
        case "reverbCrossoverFreq": state.reverbCrossoverFreq = value
        case "reverbInputTone": state.reverbInputTone = value
        case "reverbShimmerFeedback": state.reverbShimmerFeedback = value
        case "reverbWarp": state.reverbWarp = value
        case "reverbCrossFeed": state.reverbCrossFeed = value
        case "reverbEarlyReflections": state.reverbEarlyReflections = value
        case "reverbAirAbsorption": state.reverbAirAbsorption = value
        case "reverbTransientSmooth": state.reverbTransientSmooth = value
        case "reverbErLpFreq": state.reverbErLpFreq = value
        case "spectralFreezeSpeed": state.spectralFreezeSpeed = value
        case "spectralFreezeMix": state.spectralFreezeMix = value
        case "spectralFreezeDecay": state.spectralFreezeDecay = value
        case "spectralFreezePhaseJitter": state.spectralFreezePhaseJitter = value
        case "spectralFreezeReverbCrossfade": state.spectralFreezeReverbCrossfade = value
        case "characterMix": state.characterMix = value
        case "dynamicsSaturationDrive": state.dynamicsSaturationDrive = value
        case "dynamicsSaturationTone": state.dynamicsSaturationTone = value
        case "dynamicsSaturationBias": state.dynamicsSaturationBias = value
        case "characterAge": state.characterAge = value
        case "characterDepth": state.characterDepth = value
        case "characterRate": state.characterRate = value
        case "characterDamp": state.characterDamp = value
        case "characterEnvFollow": state.characterEnvFollow = value
        case "characterStereo": state.characterStereo = value
        case "characterResonance": state.characterResonance = value
        case "degradeMix": state.degradeMix = value
        case "degradeAge": state.degradeAge = value
        case "degradeGeneration": state.degradeGeneration = value
        case "degradeAlias": state.degradeAlias = value
        case "degradeWow": state.degradeWow = value
        case "degradeFlutter": state.degradeFlutter = value
        case "degradeDrift": state.degradeDrift = value
        case "degradeWobbleSpeed": state.degradeWobbleSpeed = value
        case "degradeTone": state.degradeTone = value
        case "degradeHp": state.degradeHp = value
        case "degradeLp": state.degradeLp = value
        case "degradeNoise": state.degradeNoise = value
        case "degradeSaturation": state.degradeSaturation = value
        case "degradeCorrosion": state.degradeCorrosion = value
        case "endCompThreshold": state.endCompThreshold = value
        case "endCompKnee": state.endCompKnee = value
        case "endCompRatio": state.endCompRatio = value
        case "endCompAttackMs": state.endCompAttackMs = value
        case "endCompReleaseMs": state.endCompReleaseMs = value
        case "endCompMakeup": state.endCompMakeup = value
        case "endCompMix": state.endCompMix = value
        case "endCompDetectorHp": state.endCompDetectorHp = value
        case "endCompDetectorTilt": state.endCompDetectorTilt = value
        case "endCompAutoMakeup": state.endCompAutoMakeup = value
        case "endCompProgramRelease": state.endCompProgramRelease = value
        case "sidechainKeyAWeight": state.sidechainKeyAWeight = value
        case "sidechainKeyBWeight": state.sidechainKeyBWeight = value
        case "sidechainAmount": state.sidechainAmount = value
        case "sidechainThreshold": state.sidechainThreshold = value
        case "sidechainRatio": state.sidechainRatio = value
        case "sidechainKnee": state.sidechainKnee = value
        case "sidechainAttackMs": state.sidechainAttackMs = value
        case "sidechainHoldMs": state.sidechainHoldMs = value
        case "sidechainReleaseMs": state.sidechainReleaseMs = value
        case "sidechainMakeup": state.sidechainMakeup = value
        case "sidechainMix": state.sidechainMix = value
        case "sidechainCurve": state.sidechainCurve = value
        case "sidechainDetectorHp": state.sidechainDetectorHp = value
        case "sidechainDetectorLp": state.sidechainDetectorLp = value
        case "sidechainPad1Target": state.sidechainPad1Target = value
        case "sidechainPad2Target": state.sidechainPad2Target = value
        case "sidechainLead1Target": state.sidechainLead1Target = value
        case "sidechainLead2Target": state.sidechainLead2Target = value
        case "sidechainPianoTarget": state.sidechainPianoTarget = value
        case "sidechainGranularTarget": state.sidechainGranularTarget = value
        case "sidechainDelayATarget": state.sidechainDelayATarget = value
        case "sidechainDelayBTarget": state.sidechainDelayBTarget = value
        case "sidechainReverbTarget": state.sidechainReverbTarget = value
        case "granularDiffusion": state.granularDiffusion = value
        case "granularMacroActivity": state.granularMacroActivity = value
        case "granularMacroTexture": state.granularMacroTexture = value
        case "granularMacroComplexity": state.granularMacroComplexity = value
        case "granularMacroDarkness": state.granularMacroDarkness = value
        case "granularMacroChaos": state.granularMacroChaos = value
        case "granularChordBias": state.granularChordBias = value
        case "granularFeedback": state.granularFeedback = value
        case "granularReverbLPF": state.granularReverbLPF = value
        case "granularOutputLPF": state.granularOutputLPF = value
        case "granularV1Slice": state.granularV1Slice = value
        case "granularV1Speed": state.granularV1Speed = value
        case "granularV1ScanRate": state.granularV1ScanRate = value
        case "granularV1Pitch": state.granularV1Pitch = value
        case "granularV1Attack": state.granularV1Attack = value
        case "granularV1Decay": state.granularV1Decay = value
        case "granularV1Blur": state.granularV1Blur = value
        case "granularV1GrainOct": state.granularV1GrainOct = value
        case "granularV1Spray": state.granularV1Spray = value
        case "granularV1Density": state.granularV1Density = value
        case "granularV1GrainSize": state.granularV1GrainSize = value
        case "granularV1Pan": state.granularV1Pan = value
        case "granularV1Gain": state.granularV1Gain = value
        case "granularV1PosLFORate": state.granularV1PosLFORate = value
        case "granularV1PosLFODepth": state.granularV1PosLFODepth = value
        case "granularV1PanLFORate": state.granularV1PanLFORate = value
        case "granularV1StereoSpread": state.granularV1StereoSpread = value
        case "granularV1ReverseLFORate": state.granularV1ReverseLFORate = value
        case "granularV1WriteFollow": state.granularV1WriteFollow = value
        case "granularV1RecordLFORate": state.granularV1RecordLFORate = value
        case "granularV2Slice": state.granularV2Slice = value
        case "granularV2Speed": state.granularV2Speed = value
        case "granularV2ScanRate": state.granularV2ScanRate = value
        case "granularV2Pitch": state.granularV2Pitch = value
        case "granularV2Attack": state.granularV2Attack = value
        case "granularV2Decay": state.granularV2Decay = value
        case "granularV2Blur": state.granularV2Blur = value
        case "granularV2GrainOct": state.granularV2GrainOct = value
        case "granularV2Spray": state.granularV2Spray = value
        case "granularV2Density": state.granularV2Density = value
        case "granularV2GrainSize": state.granularV2GrainSize = value
        case "granularV2Pan": state.granularV2Pan = value
        case "granularV2Gain": state.granularV2Gain = value
        case "granularV2PosLFORate": state.granularV2PosLFORate = value
        case "granularV2PosLFODepth": state.granularV2PosLFODepth = value
        case "granularV2PanLFORate": state.granularV2PanLFORate = value
        case "granularV2StereoSpread": state.granularV2StereoSpread = value
        case "granularV2ReverseLFORate": state.granularV2ReverseLFORate = value
        case "granularV2WriteFollow": state.granularV2WriteFollow = value
        case "granularV2RecordLFORate": state.granularV2RecordLFORate = value
        case "granularV3Slice": state.granularV3Slice = value
        case "granularV3Speed": state.granularV3Speed = value
        case "granularV3ScanRate": state.granularV3ScanRate = value
        case "granularV3Pitch": state.granularV3Pitch = value
        case "granularV3Attack": state.granularV3Attack = value
        case "granularV3Decay": state.granularV3Decay = value
        case "granularV3Blur": state.granularV3Blur = value
        case "granularV3GrainOct": state.granularV3GrainOct = value
        case "granularV3Spray": state.granularV3Spray = value
        case "granularV3Density": state.granularV3Density = value
        case "granularV3GrainSize": state.granularV3GrainSize = value
        case "granularV3Pan": state.granularV3Pan = value
        case "granularV3Gain": state.granularV3Gain = value
        case "granularV3PosLFORate": state.granularV3PosLFORate = value
        case "granularV3PosLFODepth": state.granularV3PosLFODepth = value
        case "granularV3PanLFORate": state.granularV3PanLFORate = value
        case "granularV3StereoSpread": state.granularV3StereoSpread = value
        case "granularV3ReverseLFORate": state.granularV3ReverseLFORate = value
        case "granularV3WriteFollow": state.granularV3WriteFollow = value
        case "granularV3RecordLFORate": state.granularV3RecordLFORate = value
        case "granularV4Slice": state.granularV4Slice = value
        case "granularV4Speed": state.granularV4Speed = value
        case "granularV4ScanRate": state.granularV4ScanRate = value
        case "granularV4Pitch": state.granularV4Pitch = value
        case "granularV4Attack": state.granularV4Attack = value
        case "granularV4Decay": state.granularV4Decay = value
        case "granularV4Blur": state.granularV4Blur = value
        case "granularV4GrainOct": state.granularV4GrainOct = value
        case "granularV4Spray": state.granularV4Spray = value
        case "granularV4Density": state.granularV4Density = value
        case "granularV4GrainSize": state.granularV4GrainSize = value
        case "granularV4Pan": state.granularV4Pan = value
        case "granularV4Gain": state.granularV4Gain = value
        case "granularV4PosLFORate": state.granularV4PosLFORate = value
        case "granularV4PosLFODepth": state.granularV4PosLFODepth = value
        case "granularV4PanLFORate": state.granularV4PanLFORate = value
        case "granularV4StereoSpread": state.granularV4StereoSpread = value
        case "granularV4ReverseLFORate": state.granularV4ReverseLFORate = value
        case "granularV4WriteFollow": state.granularV4WriteFollow = value
        case "granularV4RecordLFORate": state.granularV4RecordLFORate = value
        case "granularProbability", "grainProbability": state.grainProbability = value
        case "maxGrains": state.maxGrains = value
        case "granularSizeMin", "grainSizeMin": state.grainSizeMin = value
        case "granularSizeMax", "grainSizeMax": state.grainSizeMax = value
        case "granularDensity", "density": state.density = value
        case "granularSpray", "spray": state.spray = value
        case "granularJitter", "jitter": state.jitter = value
        case "granularPitchSpread", "pitchSpread": state.pitchSpread = value
        case "granularStereoSpread", "stereoSpread": state.stereoSpread = value
        case "feedback": state.feedback = value
        case "granularFeedbackLPF": state.granularFeedbackLPF = value
        case "granularBufferSeconds": state.granularBufferSeconds = value
        case "granularWetHPF", "wetHPF": state.wetHPF = value
        case "granularWetLPF", "wetLPF": state.wetLPF = value
        case "pad1ReverbSend":
            state.pad1ReverbSend = value
            state.synthReverbSend = value
        case "pad2Level": state.pad2Level = value
        case "pad2Attack": state.pad2Attack = value
        case "pad2Decay": state.pad2Decay = value
        case "pad2Sustain": state.pad2Sustain = value
        case "pad2Release": state.pad2Release = value
        case "pad2Hardness": state.pad2Hardness = value
        case "pad2Warmth": state.pad2Warmth = value
        case "pad2Presence": state.pad2Presence = value
        case "pad2FoldAmount": state.pad2FoldAmount = value
        case "pad2OscMix": state.pad2OscMix = value
        case "pad2FilterCutoffMin": state.pad2FilterCutoffMin = value
        case "pad2FilterCutoffMax": state.pad2FilterCutoffMax = value
        case "pad2FilterResonance": state.pad2FilterResonance = value
        case "pad2FilterQ": state.pad2FilterQ = value
        case "pad2FilterSlope": state.pad2FilterSlope = value
        case "pad2FilterKeyTracking": state.pad2FilterKeyTracking = value
        case "pad2FilterBCutoff": state.pad2FilterBCutoff = value
        case "pad2FilterBResonance": state.pad2FilterBResonance = value
        case "pad2FilterBQ": state.pad2FilterBQ = value
        case "pad2OscAOctave": state.pad2OscAOctave = value
        case "pad2OscADetune": state.pad2OscADetune = value
        case "pad2OscALevel": state.pad2OscALevel = value
        case "pad2OscBOctave": state.pad2OscBOctave = value
        case "pad2OscBDetune": state.pad2OscBDetune = value
        case "pad2OscBLevel": state.pad2OscBLevel = value
        case "pad2SubOctave": state.pad2SubOctave = value
        case "pad2SubLevel": state.pad2SubLevel = value
        case "pad2NoiseLevel": state.pad2NoiseLevel = value
        case "pad2Lfo1Rate": state.pad2Lfo1Rate = value
        case "pad2Lfo1Depth": state.pad2Lfo1Depth = value
        case "pad2Lfo2Rate": state.pad2Lfo2Rate = value
        case "pad2Lfo2Depth": state.pad2Lfo2Depth = value
        case "pad2ModEnvAttack": state.pad2ModEnvAttack = value
        case "pad2ModEnvDecay": state.pad2ModEnvDecay = value
        case "pad2ModEnvSustain": state.pad2ModEnvSustain = value
        case "pad2ModEnvRelease": state.pad2ModEnvRelease = value
        case "pad2ModEnvDepth": state.pad2ModEnvDepth = value
        case "pad2Morph": state.pad2Morph = value
        case "pad2MorphSpeed": state.pad2MorphSpeed = value
        case "pad2Distance": state.pad2Distance = value
        case "pad2PostLPF": state.pad2PostLPF = value
        case "pad2StereoWidth": state.pad2StereoWidth = value
        case "pad2DiffuseSend": state.pad2DiffuseSend = value
        case "pad2ReverbSend": state.pad2ReverbSend = value
        case "filterSlope": state.filterSlope = value
        case "filterKeyTracking": state.filterKeyTracking = value
        case "padDistance": state.padDistance = value
        case "padPostLPF": state.padPostLPF = value
        case "padStereoWidth": state.padStereoWidth = value
        case "padDiffuseSend": state.padDiffuseSend = value
        case "padFoldAmount": state.padFoldAmount = value
        case "padOscMix": state.padOscMix = value
        case "padOscAOctave": state.padOscAOctave = value
        case "padOscADetune": state.padOscADetune = value
        case "padOscALevel": state.padOscALevel = value
        case "padOscBOctave": state.padOscBOctave = value
        case "padOscBDetune": state.padOscBDetune = value
        case "padOscBLevel": state.padOscBLevel = value
        case "padSubOctave": state.padSubOctave = value
        case "padSubLevel": state.padSubLevel = value
        case "padNoiseLevel": state.padNoiseLevel = value
        case "padLfo1Rate": state.padLfo1Rate = value
        case "padLfo1Depth": state.padLfo1Depth = value
        case "padLfo2Rate": state.padLfo2Rate = value
        case "padLfo2Depth": state.padLfo2Depth = value
        case "padModEnvAttack": state.padModEnvAttack = value
        case "padModEnvDecay": state.padModEnvDecay = value
        case "padModEnvSustain": state.padModEnvSustain = value
        case "padModEnvRelease": state.padModEnvRelease = value
        case "padModEnvDepth": state.padModEnvDepth = value
        case "padMorph": state.padMorph = value
        case "padMorphSpeed": state.padMorphSpeed = value
        case "lead1Level", "leadLevel":
            state.lead1Level = value
            state.leadLevel = value
        case "lead1Attack", "leadAttack":
            state.lead1Attack = value
            state.leadAttack = value
        case "lead1Decay", "leadDecay":
            state.lead1Decay = value
            state.leadDecay = value
        case "lead1Sustain", "leadSustain":
            state.lead1Sustain = value
            state.leadSustain = value
        case "lead1Hold", "leadHold":
            state.lead1Hold = value
            state.leadHold = value
        case "lead1Release", "leadRelease":
            state.lead1Release = value
            state.leadRelease = value
        case "lead1Density", "leadDensity":
            state.lead1Density = value
            state.leadDensity = value
        case "lead1Octave", "leadOctave":
            state.lead1Octave = value
            state.leadOctave = Int(value)
        case "lead1OctaveRange", "leadOctaveRange":
            state.lead1OctaveRange = value
            state.leadOctaveRange = Int(value)
        case "lead1ReverbSend":
            state.lead1ReverbSend = value
            state.leadReverbSend = value
        case "lead1Morph": state.lead1Morph = value
        case "lead1MorphSpeed": state.lead1MorphSpeed = value
        case "lead1Distance": state.lead1Distance = value
        case "lead1PostLPF": state.lead1PostLPF = value
        case "lead1PostLPFKeyTracking": state.lead1PostLPFKeyTracking = value
        case "lead1StereoWidth": state.lead1StereoWidth = value
        case "lead1DiffuseSend": state.lead1DiffuseSend = value
        case "leadTimbreMin": state.leadTimbreMin = value
        case "leadTimbreMax": state.leadTimbreMax = value
        case "leadVibratoDepth":
            state.leadVibratoDepth = value
            state.leadVibratoDepthMin = value
            state.leadVibratoDepthMax = value
        case "leadVibratoDepthMin": state.leadVibratoDepthMin = value
        case "leadVibratoDepthMax": state.leadVibratoDepthMax = value
        case "leadVibratoRate":
            state.leadVibratoRate = value
            state.leadVibratoRateMin = value
            state.leadVibratoRateMax = value
        case "leadVibratoRateMin": state.leadVibratoRateMin = value
        case "leadVibratoRateMax": state.leadVibratoRateMax = value
        case "leadGlide":
            state.leadGlide = value
            state.leadGlideMin = value
            state.leadGlideMax = value
        case "leadGlideMin": state.leadGlideMin = value
        case "leadGlideMax": state.leadGlideMax = value
        case "lead2Attack": state.lead2Attack = value
        case "lead2Decay": state.lead2Decay = value
        case "lead2Sustain": state.lead2Sustain = value
        case "lead2Hold": state.lead2Hold = value
        case "lead2Release": state.lead2Release = value
        case "lead2Morph": state.lead2Morph = value
        case "lead2MorphSpeed": state.lead2MorphSpeed = value
        case "lead2Density": state.lead2Density = value
        case "lead2Octave": state.lead2Octave = Int(value)
        case "lead2OctaveRange": state.lead2OctaveRange = Int(value)
        case "lead2PostLPF": state.lead2PostLPF = value
        case "lead2StereoWidth": state.lead2StereoWidth = value
        case "lead2DiffuseSend": state.lead2DiffuseSend = value
        case "pianoAttack": state.pianoAttack = value
        case "pianoDecay": state.pianoDecay = value
        case "pianoSustain": state.pianoSustain = value
        case "pianoHold": state.pianoHold = value
        case "pianoRelease": state.pianoRelease = value
        case "pianoPostLPF": state.pianoPostLPF = value
        case "pianoStereoWidth": state.pianoStereoWidth = value
        case "pianoDiffuseSend": state.pianoDiffuseSend = value
        case "delayATime": state.delayATime = value
        case "delayAFeedback": state.delayAFeedback = value
        case "delayAMix": state.delayAMix = value
        case "delayASpread": state.delayASpread = value
        case "delayAFilter": state.delayAFilter = value
        case "delayASend": state.delayASend = value
        case "delayAToBSend": state.delayAToBSend = value
        case "delayAGranularSend": state.delayAGranularSend = value
        case "delayBGranularSend": state.delayBGranularSend = value
        case "delayAModRate": state.delayAModRate = value
        case "delayAModDepth": state.delayAModDepth = value
        case "delayADuck": state.delayADuck = value
        case "delayAWidth": state.delayAWidth = value
        case "delayBWarpIntensity": state.delayBWarpIntensity = value
        case "delayBSpread": state.delayBSpread = value
        case "delayBToASend": state.delayBToASend = value
        case "delayACrossFeedFilter": state.delayACrossFeedFilter = value
        case "synthEuclideanTempo": state.synthEuclideanTempo = value
        case "granularDelayActivity": state.granularDelayActivity = value
        case "granularDelayRepeats": state.granularDelayRepeats = value
        case "granularDelayFilter": state.granularDelayFilter = value
        case "granularDelayVibrato": state.granularDelayVibrato = value
        case "granularDelayMix": state.granularDelayMix = value
        case "granularDelayReverbSend": state.granularDelayReverbSend = value
        case "granularPad1Send": state.granularPad1Send = value
        case "granularPad2Send": state.granularPad2Send = value
        case "granularLead1Send": state.granularLead1Send = value
        case "granularLead2Send": state.granularLead2Send = value
        case "granularPianoSend": state.granularPianoSend = value
        case "granularDrumSend": state.granularDrumSend = value
        case "granularWavesSend": state.granularWavesSend = value
        case "granularNatureSend": state.granularNatureSend = value
        case "granularWaterSend": state.granularWaterSend = value
        case "granularInsectsSend": state.granularInsectsSend = value
        case "leadDelayTime", "leadDelayTimeMin", "leadDelayTimeMax":
            state.leadDelayTime = value
            state.leadDelayTimeMin = value
            state.leadDelayTimeMax = value
        case "leadDelayFeedback", "leadDelayFeedbackMin", "leadDelayFeedbackMax":
            state.leadDelayFeedback = value
            state.leadDelayFeedbackMin = value
            state.leadDelayFeedbackMax = value
        case "leadDelayMix", "leadDelayMixMin", "leadDelayMixMax":
            state.leadDelayMix = value
            state.leadDelayMixMin = value
            state.leadDelayMixMax = value
        case "oceanSampleLevel": state.oceanSampleLevel = value
        case "oceanReverbSend": state.oceanReverbSend = value
        case "oceanDelayASend": state.oceanDelayASend = value
        case "oceanDelayBSend": state.oceanDelayBSend = value
        case "oceanSliceDuration": state.oceanSliceDuration = value
        case "oceanSliceDensity": state.oceanSliceDensity = value
        case "oceanSynthLevel", "oceanWaveSynthLevel": state.oceanWaveSynthLevel = value
        case "oceanFilterCutoff": state.oceanFilterCutoff = value
        case "oceanFilterResonance": state.oceanFilterResonance = value
        case "oceanDurationMin": state.oceanDurationMin = value
        case "oceanDurationMax": state.oceanDurationMax = value
        case "oceanIntervalMin": state.oceanIntervalMin = value
        case "oceanIntervalMax": state.oceanIntervalMax = value
        case "oceanFoamMin": state.oceanFoamMin = value
        case "oceanFoamMax": state.oceanFoamMax = value
        case "oceanDepthMin": state.oceanDepthMin = value
        case "oceanDepthMax": state.oceanDepthMax = value
        case "birdsLevel": state.birdsLevel = value
        case "birdsReverbSend": state.birdsReverbSend = value
        case "birdsDelayASend": state.birdsDelayASend = value
        case "birdsDelayBSend": state.birdsDelayBSend = value
        case "birdsSliceDuration": state.birdsSliceDuration = value
        case "birdsSliceDensity": state.birdsSliceDensity = value
        case "birds2Level": state.birds2Level = value
        case "birds2ReverbSend": state.birds2ReverbSend = value
        case "birds2DelayASend": state.birds2DelayASend = value
        case "birds2DelayBSend": state.birds2DelayBSend = value
        case "birds2SliceDuration": state.birds2SliceDuration = value
        case "birds2SliceDensity": state.birds2SliceDensity = value
        case "frogsLevel": state.frogsLevel = value
        case "frogsReverbSend": state.frogsReverbSend = value
        case "frogsDelayASend": state.frogsDelayASend = value
        case "frogsDelayBSend": state.frogsDelayBSend = value
        case "frogsSliceDuration": state.frogsSliceDuration = value
        case "frogsSliceDensity": state.frogsSliceDensity = value
        case "natureLevel": state.natureLevel = value
        case "natureReverbSend": state.natureReverbSend = value
        case "natureDelayASend": state.natureDelayASend = value
        case "natureDelayBSend": state.natureDelayBSend = value
        case "waterIntensity": state.waterIntensity = value
        case "waterReverbSend": state.waterReverbSend = value
        case "waterDelayASend": state.waterDelayASend = value
        case "waterDelayBSend": state.waterDelayBSend = value
        case "waterLevel": state.waterLevel = value
        case "waterLayerHardDrops": state.waterLayerHardDrops = value
        case "waterLayerWaterDrops": state.waterLayerWaterDrops = value
        case "waterLayerTurbulence": state.waterLayerTurbulence = value
        case "waterLayerBubbling": state.waterLayerBubbling = value
        case "waterLayerSurf": state.waterLayerSurf = value
        case "waterLayerChannels": state.waterLayerChannels = value
        case "waterDistance": state.waterDistance = value
        case "waterBaseFreq": state.waterBaseFreq = value
        case "waterDropSize": state.waterDropSize = value
        case "waterHardness": state.waterHardness = value
        case "waterGlassThickness": state.waterGlassThickness = value
        case "waterHardDropBaseFreq": state.waterHardDropBaseFreq = value
        case "waterHardDropRate": state.waterHardDropRate = value
        case "waterHardDropLPF": state.waterHardDropLPF = value
        case "waterHardDropTone": state.waterHardDropTone = value
        case "waterWaterDropBaseFreq": state.waterWaterDropBaseFreq = value
        case "waterWaterDropRate": state.waterWaterDropRate = value
        case "waterWaterDropLPF": state.waterWaterDropLPF = value
        case "waterBubblingRate": state.waterBubblingRate = value
        case "waterBubblingLPF": state.waterBubblingLPF = value
        case "waterSurfDuration": state.waterSurfDuration = value
        case "waterSurfInterval": state.waterSurfInterval = value
        case "waterSurfFoam": state.waterSurfFoam = value
        case "waterSurfFoamBright": state.waterSurfFoamBright = value
        case "waterSurfProximity": state.waterSurfProximity = value
        case "waterSurfDepth": state.waterSurfDepth = value
        case "waterSurfBody": state.waterSurfBody = value
        case "waterSurfSpray": state.waterSurfSpray = value
        case "waterDensityHardSend": state.waterDensityHardSend = value
        case "waterDensityWaterSend": state.waterDensityWaterSend = value
        case "waterDensityBubbleSend": state.waterDensityBubbleSend = value
        case "waterDensityFeedback": state.waterDensityFeedback = value
        case "waterDensityTone": state.waterDensityTone = value
        case "waterDensityRing": state.waterDensityRing = value
        case "waterDensityWet": state.waterDensityWet = value
        case "waterChannelsMorph": state.waterChannelsMorph = value
        case "waterChannelsSpeed": state.waterChannelsSpeed = value
        case "insectsDensity": state.insectsDensity = value
        case "insectsTemperature": state.insectsTemperature = value
        case "insectsDistance": state.insectsDistance = value
        case "insectsProximity": state.insectsProximity = value
        case "insectsAntiphony": state.insectsAntiphony = value
        case "insectsClickRate": state.insectsClickRate = value
        case "insectsMotion": state.insectsMotion = value
        case "insectsLevel": state.insectsLevel = value
        case "insectsSharedLevel": state.insectsSharedLevel = value
        case "insectsReverbSend": state.insectsReverbSend = value
        case "insDelayASend": state.insDelayASend = value
        case "insDelayBSend": state.insDelayBSend = value
        case "insects2Density": state.insects2Density = value
        case "insects2Temperature": state.insects2Temperature = value
        case "insects2Distance": state.insects2Distance = value
        case "insects2Proximity": state.insects2Proximity = value
        case "insects2Antiphony": state.insects2Antiphony = value
        case "insects2ClickRate": state.insects2ClickRate = value
        case "insects2Motion": state.insects2Motion = value
        case "insects2Level": state.insects2Level = value
        case "drumLevel": state.drumLevel = value
        case "drumDelayFilter": state.drumDelayFilter = value
        case "drumSubDelaySend": state.drumSubDelaySend = value
        case "drumKickDelaySend": state.drumKickDelaySend = value
        case "drumClickDelaySend": state.drumClickDelaySend = value
        case "drumBeepHiDelaySend": state.drumBeepHiDelaySend = value
        case "drumBeepLoDelaySend": state.drumBeepLoDelaySend = value
        case "drumNoiseDelaySend": state.drumNoiseDelaySend = value
        case "drumSubFreq": state.drumSubFreq = value
        case "drumSubDecay": state.drumSubDecay = value
        case "drumSubLevel": state.drumSubLevel = value
        case "drumSubTone": state.drumSubTone = value
        case "drumSubShape": state.drumSubShape = value
        case "drumSubPitchEnv": state.drumSubPitchEnv = value
        case "drumSubPitchDecay": state.drumSubPitchDecay = value
        case "drumSubDrive": state.drumSubDrive = value
        case "drumSubSub": state.drumSubSub = value
        case "drumKickFreq": state.drumKickFreq = value
        case "drumKickPitchEnv": state.drumKickPitchEnv = value
        case "drumKickPitchDecay": state.drumKickPitchDecay = value
        case "drumKickDecay": state.drumKickDecay = value
        case "drumKickLevel": state.drumKickLevel = value
        case "drumKickClick": state.drumKickClick = value
        case "drumKickBody": state.drumKickBody = value
        case "drumKickPunch": state.drumKickPunch = value
        case "drumKickTail": state.drumKickTail = value
        case "drumKickTone": state.drumKickTone = value
        case "drumClickDecay": state.drumClickDecay = value
        case "drumClickFilter": state.drumClickFilter = value
        case "drumClickTone": state.drumClickTone = value
        case "drumClickLevel": state.drumClickLevel = value
        case "drumClickResonance": state.drumClickResonance = value
        case "drumClickPitch": state.drumClickPitch = value
        case "drumClickPitchEnv": state.drumClickPitchEnv = value
        case "drumClickGrainSpread": state.drumClickGrainSpread = value
        case "drumClickStereoWidth": state.drumClickStereoWidth = value
        case "drumBeepHiFreq": state.drumBeepHiFreq = value
        case "drumBeepHiAttack": state.drumBeepHiAttack = value
        case "drumBeepHiDecay": state.drumBeepHiDecay = value
        case "drumBeepHiLevel": state.drumBeepHiLevel = value
        case "drumBeepHiTone": state.drumBeepHiTone = value
        case "drumBeepHiInharmonic": state.drumBeepHiInharmonic = value
        case "drumBeepHiShimmer": state.drumBeepHiShimmer = value
        case "drumBeepHiShimmerRate": state.drumBeepHiShimmerRate = value
        case "drumBeepHiBrightness": state.drumBeepHiBrightness = value
        case "drumBeepLoFreq": state.drumBeepLoFreq = value
        case "drumBeepLoAttack": state.drumBeepLoAttack = value
        case "drumBeepLoDecay": state.drumBeepLoDecay = value
        case "drumBeepLoLevel": state.drumBeepLoLevel = value
        case "drumBeepLoTone": state.drumBeepLoTone = value
        case "drumBeepLoPitchEnv": state.drumBeepLoPitchEnv = value
        case "drumBeepLoPitchDecay": state.drumBeepLoPitchDecay = value
        case "drumBeepLoBody": state.drumBeepLoBody = value
        case "drumBeepLoPluck": state.drumBeepLoPluck = value
        case "drumBeepLoPluckDamp": state.drumBeepLoPluckDamp = value
        case "drumNoiseFilterFreq": state.drumNoiseFilterFreq = value
        case "drumNoiseFilterQ": state.drumNoiseFilterQ = value
        case "drumNoiseDecay": state.drumNoiseDecay = value
        case "drumNoiseLevel": state.drumNoiseLevel = value
        case "drumNoiseAttack": state.drumNoiseAttack = value
        case "drumNoiseFormant": state.drumNoiseFormant = value
        case "drumNoiseBreath": state.drumNoiseBreath = value
        case "drumNoiseFilterEnv": state.drumNoiseFilterEnv = value
        case "drumNoiseFilterEnvDecay": state.drumNoiseFilterEnvDecay = value
        case "drumNoiseDensity": state.drumNoiseDensity = value
        case "drumNoiseColorLFO": state.drumNoiseColorLFO = value
        case "drumRandomDensity": state.drumRandomDensity = value
        case "drumRandomSubProb": state.drumRandomSubProb = value
        case "drumRandomKickProb": state.drumRandomKickProb = value
        case "drumRandomClickProb": state.drumRandomClickProb = value
        case "drumRandomBeepHiProb": state.drumRandomBeepHiProb = value
        case "drumRandomBeepLoProb": state.drumRandomBeepLoProb = value
        case "drumRandomNoiseProb": state.drumRandomNoiseProb = value
        case "drumRandomMinInterval": state.drumRandomMinInterval = value
        case "drumRandomMaxInterval": state.drumRandomMaxInterval = value
        case "drumSubMorph": state.drumSubMorph = value
        case "drumKickMorph": state.drumKickMorph = value
        case "drumClickMorph": state.drumClickMorph = value
        case "drumBeepHiMorph": state.drumBeepHiMorph = value
        case "drumBeepLoMorph": state.drumBeepLoMorph = value
        case "drumNoiseMorph": state.drumNoiseMorph = value
        case "drumSubMorphSpeed": state.drumSubMorphSpeed = value
        case "drumKickMorphSpeed": state.drumKickMorphSpeed = value
        case "drumClickMorphSpeed": state.drumClickMorphSpeed = value
        case "drumBeepHiMorphSpeed": state.drumBeepHiMorphSpeed = value
        case "drumBeepLoMorphSpeed": state.drumBeepLoMorphSpeed = value
        case "drumNoiseMorphSpeed": state.drumNoiseMorphSpeed = value
        case "drumEuclidBaseBPM": state.drumEuclidBaseBPM = value
        case "drumEuclidTempo": state.drumEuclidTempo = value
        case "drumEuclidSwing": state.drumEuclidSwing = value
        case "drumEuclidDivision": state.drumEuclidDivision = Int(value.rounded())
        case "drumEuclid1Steps": state.drumEuclid1Steps = Int(value.rounded())
        case "drumEuclid1Hits": state.drumEuclid1Hits = Int(value.rounded())
        case "drumEuclid1Rotation": state.drumEuclid1Rotation = Int(value.rounded())
        case "drumEuclid1Probability": state.drumEuclid1Probability = value
        case "drumEuclid1VelocityMin": state.drumEuclid1VelocityMin = value
        case "drumEuclid1VelocityMax": state.drumEuclid1VelocityMax = value
        case "drumEuclid1Level": state.drumEuclid1Level = value
        case "drumEuclid2Steps": state.drumEuclid2Steps = Int(value.rounded())
        case "drumEuclid2Hits": state.drumEuclid2Hits = Int(value.rounded())
        case "drumEuclid2Rotation": state.drumEuclid2Rotation = Int(value.rounded())
        case "drumEuclid2Probability": state.drumEuclid2Probability = value
        case "drumEuclid2VelocityMin": state.drumEuclid2VelocityMin = value
        case "drumEuclid2VelocityMax": state.drumEuclid2VelocityMax = value
        case "drumEuclid2Level": state.drumEuclid2Level = value
        case "drumEuclid3Steps": state.drumEuclid3Steps = Int(value.rounded())
        case "drumEuclid3Hits": state.drumEuclid3Hits = Int(value.rounded())
        case "drumEuclid3Rotation": state.drumEuclid3Rotation = Int(value.rounded())
        case "drumEuclid3Probability": state.drumEuclid3Probability = value
        case "drumEuclid3VelocityMin": state.drumEuclid3VelocityMin = value
        case "drumEuclid3VelocityMax": state.drumEuclid3VelocityMax = value
        case "drumEuclid3Level": state.drumEuclid3Level = value
        case "drumEuclid4Steps": state.drumEuclid4Steps = Int(value.rounded())
        case "drumEuclid4Hits": state.drumEuclid4Hits = Int(value.rounded())
        case "drumEuclid4Rotation": state.drumEuclid4Rotation = Int(value.rounded())
        case "drumEuclid4Probability": state.drumEuclid4Probability = value
        case "drumEuclid4VelocityMin": state.drumEuclid4VelocityMin = value
        case "drumEuclid4VelocityMax": state.drumEuclid4VelocityMax = value
        case "drumEuclid4Level": state.drumEuclid4Level = value
        case "randomWalkSpeed": state.randomWalkSpeed = value
        default: break
        }
    }

    private func loadPresets() {
        savedPresets = presetManager.loadBundledPresets()
    }

    var isSupabaseConfigured: Bool {
        supabaseService.isConfigured
    }

    func refreshCloudPresetsIfNeeded() async {
        guard cloudPresets.isEmpty, !cloudPresetsLoading else { return }
        await refreshCloudPresets()
    }

    func refreshCloudPresets() async {
        guard isSupabaseConfigured else {
            cloudPresets = []
            cloudPresetError = nil
            return
        }

        cloudPresetsLoading = true
        cloudPresetError = nil
        defer { cloudPresetsLoading = false }

        do {
            cloudPresets = try await supabaseService.fetchCloudStatePresets(limit: 60)
        } catch {
            cloudPresetError = error.localizedDescription
        }
    }

    func refreshMIDIInputs() {
        do {
            if !midiManager.isStarted {
                try midiManager.start()
            }
            midiManager.refreshAvailableInputs()
        } catch {
            midiErrorMessage = error.localizedDescription
        }
    }

    func setMIDIInputConnected(_ uniqueID: Int32, isConnected: Bool) {
        do {
            if !midiManager.isStarted {
                try midiManager.start()
            }

            if isConnected {
                try midiManager.connectInput(uniqueID: uniqueID)
            } else {
                midiManager.disconnectInput(uniqueID: uniqueID)
            }
        } catch {
            midiErrorMessage = error.localizedDescription
        }
    }

    private func handleMIDIMessage(_ message: MIDIMessage) {
        guard let binding = midiMapStore.binding(matching: message) else { return }

        switch binding.target.kind {
        case .parameter:
            guard let normalizedValue = normalizedMIDIValue(for: message) else { return }
            applyMappedParameter(binding, normalizedValue: normalizedValue)

        case .transport, .action, .preset:
            guard shouldTriggerMIDIAction(for: message) else { return }
            applyMIDITrigger(binding.target)

        case .macro, .unknown:
            break
        }
    }

    private func applyMappedParameter(_ binding: MIDIControlBinding, normalizedValue: Double) {
        let mappedValue = curveMappedValue(normalizedValue, binding: binding)
        var updatedState = state
        updateSliderStateValue(&updatedState, key: binding.target.identifier, value: mappedValue)
        state = updatedState
    }

    private func applyMIDITrigger(_ target: MIDIMapTarget) {
        switch target.kind {
        case .transport:
            switch target.identifier {
            case "play":
                start()
            case "pause", "stop":
                stop()
            case "toggle", "togglePlayback", "togglePlayPause":
                togglePlayback()
            default:
                break
            }

        case .action:
            switch target.identifier {
            case "toggleAutoMorph":
                toggleAutoMorph()
            case "toggleRecording":
                toggleRecording()
            case "armRecording":
                armRecording()
            case "disarmRecording":
                disarmRecording()
            default:
                break
            }

        case .preset:
            guard let preset = savedPresets.first(where: { $0.name == target.identifier || $0.id == target.identifier }) else {
                return
            }
            loadPreset(preset)

        case .parameter, .macro, .unknown:
            break
        }
    }

    private func normalizedMIDIValue(for message: MIDIMessage) -> Double? {
        switch message.kind {
        case .controlChange, .noteOn, .noteOff:
            guard let value = message.data2 ?? message.data1 else { return nil }
            return Double(value) / 127.0

        case .programChange, .channelPressure, .polyPressure:
            guard let value = message.data1 else { return nil }
            return Double(value) / 127.0

        case .pitchBend:
            guard let lsb = message.data1, let msb = message.data2 else { return nil }
            let rawValue = (Int(msb) << 7) | Int(lsb)
            return Double(rawValue) / 16383.0

        case .systemExclusive, .unknown:
            return nil
        }
    }

    private func curveMappedValue(_ normalizedValue: Double, binding: MIDIControlBinding) -> Double {
        let clampedValue = min(max(normalizedValue, 0), 1)
        let curvedValue: Double

        switch binding.curve {
        case .linear:
            curvedValue = clampedValue
        case .exponential:
            curvedValue = pow(clampedValue, 2)
        case .logarithmic:
            curvedValue = log10(1 + (9 * clampedValue))
        case .stepped:
            curvedValue = (clampedValue * 7).rounded() / 7
        }

        return binding.minimumValue + ((binding.maximumValue - binding.minimumValue) * curvedValue)
    }

    private func shouldTriggerMIDIAction(for message: MIDIMessage) -> Bool {
        switch message.kind {
        case .noteOn:
            return (message.data2 ?? 0) > 0
        case .controlChange, .channelPressure, .polyPressure:
            return (message.data2 ?? message.data1 ?? 0) >= 64
        case .programChange:
            return true
        case .noteOff, .pitchBend, .systemExclusive, .unknown:
            return false
        }
    }

    private func ensureProductCoreAudioEngine() throws -> KesshoProductCoreAudioEngine {
        if let productCoreAudioEngine {
            return productCoreAudioEngine
        }
        let created = try KesshoProductCoreAudioEngine(sampleRate: 44_100, maxBlockSize: 512)
        productCoreAudioEngine = created
        created.configureRecorder(audioRecorder)
        return created
    }

    private func preloadProductCoreStartupAssets(_ productEngine: KesshoProductCoreAudioEngine) {
        let report = productEngine.preloadStartupAssets()
        guard report.hasFailures else { return }

        let failureSummary = report.failures
            .map { "\($0.asset.relativePath) [\($0.asset.id)]: \($0.reason)" }
            .joined(separator: "; ")
        print("AppState: native Product Core asset preload incomplete: \(failureSummary)")
    }

    @discardableResult
    private func startProductCoreAudio() -> Bool {
        do {
            let productEngine = try ensureProductCoreAudioEngine()
            if productEngine.isRunning {
                let result = productEngine.loadSnapshot(state: state, running: true)
                if result != 1 {
                    print("AppState: failed to update Product Core snapshot before start: \(result)")
                    return false
                }
                return true
            }
            preloadProductCoreStartupAssets(productEngine)
            try productEngine.start(state: state)
            return true
        } catch {
            print("AppState: failed to start native Product Core audio: \(error)")
            return false
        }
    }

    private func stopActiveAudioEngine() {
        if audioRuntimeMode == .coreProduct {
            productCoreAudioEngine?.stop()
        } else {
            audioEngine.stop()
        }
    }

    private func updateActiveAudioEngine(_ newState: SliderState) {
        if audioRuntimeMode == .coreProduct {
            do {
                let productEngine = try ensureProductCoreAudioEngine()
                let result = productEngine.loadSnapshot(state: newState, running: isPlaying)
                if result != 1 {
                    print("AppState: failed to update Product Core snapshot: \(result)")
                }
            } catch {
                print("AppState: failed to update native Product Core audio: \(error)")
            }
        } else {
            audioEngine.updateParams(newState)
        }
    }

    // MARK: - Playback Control

    func start() {
        cancelPendingAudioEngineUpdate()
        do {
            if !audioSessionManager.isConfigured {
                try audioSessionManager.configureForPlayback(
                    preferredSampleRate: 44_100,
                    preferredIOBufferDuration: 256.0 / 44_100.0
                )
            }
            if !audioSessionManager.isActive {
                try audioSessionManager.activate()
            }
        } catch {
            print("AppState: failed to activate audio session: \(error)")
        }
        let didStart: Bool
        if audioRuntimeMode == .coreProduct {
            didStart = startProductCoreAudio()
        } else {
            audioEngine.start(with: state)
            didStart = true
        }
        guard didStart else { return }
        isPlaying = true
        if recordingState == .armed {
            startRecording()
        }
        updateRandomWalkTimer()
        updatePlaybackTimer()
        updateNowPlayingInfo()
    }

    func stop() {
        cancelPendingAudioEngineUpdate()
        stopActiveAudioEngine()
        isPlaying = false
        if journeyPhase.isActive {
            stopJourney(stopAudio: false)
        }
        updateRandomWalkTimer()
        updatePlaybackTimer()
        shouldResumeAfterInterruption = false
        lastNowPlayingIsPlaying = false
        nowPlayingManager.setPlaybackState(isPlaying: false)
    }

    func togglePlayback() {
        if isPlaying {
            stop()
        } else {
            start()
        }
    }

    func auditionMelodicSource(_ source: String, midiNote: Int) {
        var newState = state
        switch source {
        case "lead", "lead1":
            newState.leadEnabled = true
            if newState.leadLevel < 0.05 { newState.leadLevel = 0.45 }
        case "lead2":
            newState.lead2Enabled = true
            if newState.lead2Level < 0.05 { newState.lead2Level = 0.45 }
        case "piano":
            newState.pianoEnabled = true
            if newState.pianoLevel < 0.05 { newState.pianoLevel = 0.65 }
        default:
            break
        }

        if newState != state {
            state = newState
            if isPlaying {
                scheduleAudioEngineUpdate(newState)
            }
        }

        if !isPlaying {
            start()
        }
        if audioRuntimeMode == .coreProduct {
            productCoreAudioEngine?.manualNoteOn(
                sourceName: source,
                midiNote: Float(midiNote),
                velocity: 0.72,
                holdSeconds: 0.2
            )
        } else {
            audioEngine.triggerMelodicSource(source, midiNote: midiNote)
        }
    }

    func applyGranularScene(_ scene: NativeGranularScene) {
        var newState = state
        newState.granularEnabled = true
        if newState.granularLevel < 0.05 {
            newState.granularLevel = 0.45
        }

        switch scene {
        case .air:
            newState.grainProbability = 0.46
            newState.density = 14
            newState.spray = 320
            newState.grainSizeMin = 18
            newState.grainSizeMax = 95
            newState.jitter = 24
            newState.pitchSpread = 7
            newState.stereoSpread = 0.88
            newState.feedback = 0.06
            newState.wetHPF = 900
            newState.wetLPF = 11_000
        case .swarm:
            newState.grainProbability = 0.92
            newState.density = 58
            newState.spray = 140
            newState.grainSizeMin = 8
            newState.grainSizeMax = 34
            newState.jitter = 45
            newState.pitchSpread = 12
            newState.stereoSpread = 0.72
            newState.feedback = 0.22
            newState.wetHPF = 420
            newState.wetLPF = 9_000
        case .wash:
            newState.grainProbability = 0.8
            newState.density = 28
            newState.spray = 260
            newState.grainSizeMin = 65
            newState.grainSizeMax = 180
            newState.jitter = 18
            newState.pitchSpread = 4
            newState.stereoSpread = 1
            newState.feedback = 0.34
            newState.wetHPF = 240
            newState.wetLPF = 7_500
        case .shards:
            newState.grainProbability = 0.68
            newState.density = 36
            newState.spray = 70
            newState.grainSizeMin = 5
            newState.grainSizeMax = 22
            newState.jitter = 72
            newState.pitchSpread = 19
            newState.stereoSpread = 0.64
            newState.feedback = 0.12
            newState.wetHPF = 1_200
            newState.wetLPF = 15_000
        }

        state = newState
    }

    // MARK: - Recording Control

    /// Set up the audio recorder with engine nodes
    private func setupRecorder() {
        if audioRuntimeMode == .legacySwift {
            audioEngine.configureRecorder(audioRecorder)
        }

        audioRecorder.onStateChange = { [weak self] state in
            Task { @MainActor in
                self?.recordingState = state
            }
        }

        audioRecorder.onDurationUpdate = { [weak self] duration in
            Task { @MainActor in
                self?.recordingDuration = duration
            }
        }
    }

    /// Arm recording - prepares to record on next play
    func armRecording() {
        if audioRuntimeMode == .coreProduct {
            do {
                _ = try ensureProductCoreAudioEngine()
            } catch {
                print("AppState: failed to prepare Product Core recorder: \(error)")
                return
            }
        }
        audioRecorder.enabledStems = recordingEnabledStems
        audioRecorder.recordMain = recordMain
        audioRecorder.arm()
    }

    /// Disarm recording
    func disarmRecording() {
        audioRecorder.disarm()
    }

    /// Start recording immediately
    func startRecording() {
        if audioRuntimeMode == .coreProduct {
            do {
                _ = try ensureProductCoreAudioEngine()
            } catch {
                print("AppState: failed to prepare Product Core recorder: \(error)")
                return
            }
        }
        guard recordMain || !recordingEnabledStems.isEmpty else { return }
        audioRecorder.enabledStems = recordingEnabledStems
        audioRecorder.recordMain = recordMain
        _ = audioRecorder.startRecording()
    }

    /// Stop recording and save files
    func stopRecording() {
        lastRecordedFiles = audioRecorder.stopRecording()
    }

    /// Toggle recording state
    func toggleRecording() {
        switch recordingState {
        case .idle:
            if isPlaying {
                startRecording()
            } else {
                armRecording()
            }
        case .armed:
            if isPlaying {
                startRecording()
            } else {
                disarmRecording()
            }
        case .recording:
            stopRecording()
        }
    }

    /// Toggle stem enabled for recording
    func toggleStemRecording(_ stem: RecordingStem) {
        if recordingEnabledStems.contains(stem) {
            recordingEnabledStems.remove(stem)
        } else {
            recordingEnabledStems.insert(stem)
        }
    }

    /// Get formatted recording duration string
    var formattedRecordingDuration: String {
        AudioRecorder.formatDuration(recordingDuration)
    }

    /// Get list of saved recordings
    var savedRecordings: [URL] {
        audioRecorder.getSavedRecordings()
    }

    // MARK: - Preset Management

    func loadPreset(_ preset: SavedPreset) {
        // Check if we should apply preset A values directly:
        // - Only apply if we're at endpoint 0 (near position 0)
        // - OR if no preset B is loaded yet (not in morph mode)
        // At endpoint 1 (position ~100), we should keep the current B values
        let atEndpoint0 = morphPosition <= 1
        let shouldApplyPresetA = atEndpoint0 || morphPresetB == nil

        // Always update the morph slot
        morphPresetA = preset

        if shouldApplyPresetA {
            // Preserve user preference keys (like reverbQuality) that shouldn't change with presets
            let savedReverbQuality = state.reverbQuality

            state = preset.state

            // Restore user preferences
            state.reverbQuality = savedReverbQuality

            if audioRuntimeMode == .coreProduct {
                scheduleAudioEngineUpdate(state)
            } else {
                audioEngine.resetCofDrift()
            }
            morphPosition = 0

            // Load dual ranges from preset (if any)
            dualRanges = preset.dualRanges ?? [:]
            randomWalkValues.removeAll()
            sliderModes = dualRanges.keys.reduce(into: [:]) { modes, key in
                modes[key] = .walk
            }
            sampleHoldTicks.removeAll()

            // Initialize walk values for loaded dual ranges
            for (key, range) in dualRanges {
                randomWalkValues[key] = (range.min + range.max) / 2
            }
            updateRandomWalkTimer()
        }
        // If at endpoint B or mid-morph, just update morphPresetA
        // The setMorphPosition will recalculate if user moves the slider
    }

    func loadCloudPreset(_ preset: SavedPreset) {
        loadPreset(preset)
        guard let remoteID = preset.remoteID else { return }
        Task {
            await supabaseService.incrementPresetPlays(remoteID: remoteID)
        }
    }

    func saveCurrentAsPreset(name: String) {
        let preset = SavedPreset(
            name: name,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            state: state,
            dualRanges: dualRanges.isEmpty ? nil : dualRanges
        )
        savedPresets.append(preset)
        presetManager.savePreset(preset)
    }

    func saveCurrentAsCloudPreset(name: String, visibility: String = "private") async {
        let preset = SavedPreset(
            name: name,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            state: state,
            dualRanges: dualRanges.isEmpty ? nil : dualRanges,
            library: "cloud"
        )

        do {
            try await supabaseService.saveLegacyStatePreset(preset, visibility: visibility)
            await refreshCloudPresets()
        } catch {
            cloudPresetError = error.localizedDescription
        }
    }

    // MARK: - Morph

    func setMorphPosition(_ position: Double) {
        morphPosition = position

        guard let presetA = morphPresetA, let presetB = morphPresetB else { return }

        // Preserve user preference keys before morphing
        let savedReverbQuality = state.reverbQuality

        let t = position / 100.0
        var morphedState = lerpPresets(presetA.state, presetB.state, t: t)
        morphedState.reverbQuality = savedReverbQuality
        state = morphedState

        // Morph dual ranges between presets
        dualRanges = lerpDualRanges(
            presetA.dualRanges ?? [:],
            presetB.dualRanges ?? [:],
            stateA: presetA.state,
            stateB: presetB.state,
            t: t
        )
        sliderModes = dualRanges.keys.reduce(into: sliderModes) { modes, key in
            if modes[key] == nil || modes[key] == .single {
                modes[key] = .walk
            }
        }
        sliderModes = sliderModes.filter { entry in
            entry.value != .single && dualRanges[entry.key] != nil
        }
        sampleHoldTicks = sampleHoldTicks.filter { entry in dualRanges[entry.key] != nil }
    }

    /// Lerp dual ranges between presets - handles all cases:
    /// - Single → Single: No dual range needed
    /// - Single → Dual: Creates dual slider with values converging from single to range
    /// - Dual → Single: Range converges to single value
    /// - Dual → Dual: Both min and max lerp independently
    private func lerpDualRanges(
        _ a: [String: DualRange],
        _ b: [String: DualRange],
        stateA: SliderState,
        stateB: SliderState,
        t: Double
    ) -> [String: DualRange] {
        var result: [String: DualRange] = [:]

        // Get all keys that have dual ranges in either preset
        let allKeys = Set(a.keys).union(Set(b.keys))

        for key in allKeys {
            let rangeA = a[key]
            let rangeB = b[key]

            switch (rangeA, rangeB) {
            case let (aRange?, bRange?):
                // Dual → Dual: Lerp min and max independently
                result[key] = DualRange(
                    min: lerp(aRange.min, bRange.min, t),
                    max: lerp(aRange.max, bRange.max, t)
                )

            case let (aRange?, nil):
                // Dual → Single: Converge range to single value
                // Get single value from B's state (we'd need to reflect on the key)
                let singleValue = aRange.min + (aRange.max - aRange.min) / 2  // Fallback to center
                if t < 1.0 {
                    result[key] = DualRange(
                        min: lerp(aRange.min, singleValue, t),
                        max: lerp(aRange.max, singleValue, t)
                    )
                }
                // At t=1.0, don't include (becomes single slider)

            case let (nil, bRange?):
                // Single → Dual: Expand from single value to range
                let singleValue = bRange.min + (bRange.max - bRange.min) / 2  // Fallback to center
                result[key] = DualRange(
                    min: lerp(singleValue, bRange.min, t),
                    max: lerp(singleValue, bRange.max, t)
                )

            case (nil, nil):
                break // Neither has dual range
            }
        }

        return result
    }

    private func lerpPresets(_ a: SliderState, _ b: SliderState, t: Double) -> SliderState {
        var result = a

        // === Master Mixer ===
        result.masterVolume = lerp(a.masterVolume, b.masterVolume, t)
        result.synthLevel = lerp(a.synthLevel, b.synthLevel, t)
        result.granularLevel = lerp(a.granularLevel, b.granularLevel, t)
        result.synthReverbSend = lerp(a.synthReverbSend, b.synthReverbSend, t)
        result.granularReverbSend = lerp(a.granularReverbSend, b.granularReverbSend, t)
        result.granularDelayASend = lerp(a.granularDelayASend, b.granularDelayASend, t)
        result.granularDelayBSend = lerp(a.granularDelayBSend, b.granularDelayBSend, t)
        result.leadReverbSend = lerp(a.leadReverbSend, b.leadReverbSend, t)
        result.lead2Level = lerp(a.lead2Level, b.lead2Level, t)
        result.lead2ReverbSend = lerp(a.lead2ReverbSend, b.lead2ReverbSend, t)
        result.pianoLevel = lerp(a.pianoLevel, b.pianoLevel, t)
        result.pianoReverbSend = lerp(a.pianoReverbSend, b.pianoReverbSend, t)
        result.leadDelayReverbSend = lerp(a.leadDelayReverbSend, b.leadDelayReverbSend, t)
        result.delayAReverbSend = lerp(a.delayAReverbSend, b.delayAReverbSend, t)
        result.reverbLevel = lerp(a.reverbLevel, b.reverbLevel, t)
        result.earthLevel = lerp(a.earthLevel, b.earthLevel, t)
        result.pad1DelayASend = lerp(a.pad1DelayASend, b.pad1DelayASend, t)
        result.pad1DelayBSend = lerp(a.pad1DelayBSend, b.pad1DelayBSend, t)
        result.lead1DelayASend = lerp(a.lead1DelayASend, b.lead1DelayASend, t)
        result.lead1DelayBSend = lerp(a.lead1DelayBSend, b.lead1DelayBSend, t)
        result.lead2DelayASend = lerp(a.lead2DelayASend, b.lead2DelayASend, t)
        result.lead2DelayBSend = lerp(a.lead2DelayBSend, b.lead2DelayBSend, t)
        result.pianoDelayASend = lerp(a.pianoDelayASend, b.pianoDelayASend, t)
        result.pianoDelayBSend = lerp(a.pianoDelayBSend, b.pianoDelayBSend, t)
        result.drumDelayASend = lerp(a.drumDelayASend, b.drumDelayASend, t)
        result.drumDelayBSend = lerp(a.drumDelayBSend, b.drumDelayBSend, t)

        // === Global ===
        result.randomness = lerp(a.randomness, b.randomness, t)
        result.phraseLength = lerp(a.phraseLength, b.phraseLength, t)
        result.sequencerMasterBPM = lerp(a.sequencerMasterBPM, b.sequencerMasterBPM, t)
        result.transportBarsPerPhrase = lerpInt(a.transportBarsPerPhrase, b.transportBarsPerPhrase, t)
        result.transportBeatsPerBar = lerpInt(a.transportBeatsPerBar, b.transportBeatsPerBar, t)

        // === Circle of Fifths Drift ===
        result.cofDriftRate = lerpInt(a.cofDriftRate, b.cofDriftRate, t)
        result.cofDriftRange = lerpInt(a.cofDriftRange, b.cofDriftRange, t)

        // === Harmony ===
        result.tension = lerp(a.tension, b.tension, t)
        result.chordRate = lerpInt(a.chordRate, b.chordRate, t)
        result.voicingSpread = lerp(a.voicingSpread, b.voicingSpread, t)
        result.chordProgressionSteps = lerpInt(a.chordProgressionSteps, b.chordProgressionSteps, t)
        result.chordProgressionPhraseMultiplier = t < 0.5 ? a.chordProgressionPhraseMultiplier : b.chordProgressionPhraseMultiplier

        // === Synth Oscillator ===
        result.waveSpread = lerp(a.waveSpread, b.waveSpread, t)
        result.detune = lerp(a.detune, b.detune, t)
        result.synthAttack = lerp(a.synthAttack, b.synthAttack, t)
        result.synthDecay = lerp(a.synthDecay, b.synthDecay, t)
        result.synthSustain = lerp(a.synthSustain, b.synthSustain, t)
        result.synthRelease = lerp(a.synthRelease, b.synthRelease, t)
        result.synthVoiceMask = lerpInt(a.synthVoiceMask, b.synthVoiceMask, t)
        result.synthOctave = lerpInt(a.synthOctave, b.synthOctave, t)

        // === Synth Timbre ===
        result.hardness = lerp(a.hardness, b.hardness, t)
        result.oscBrightness = lerpInt(a.oscBrightness, b.oscBrightness, t)
        result.filterCutoffMin = lerp(a.filterCutoffMin, b.filterCutoffMin, t)
        result.filterCutoffMax = lerp(a.filterCutoffMax, b.filterCutoffMax, t)
        result.filterModSpeed = lerp(a.filterModSpeed, b.filterModSpeed, t)
        result.filterResonance = lerp(a.filterResonance, b.filterResonance, t)
        result.filterQ = lerp(a.filterQ, b.filterQ, t)
        result.warmth = lerp(a.warmth, b.warmth, t)
        result.presence = lerp(a.presence, b.presence, t)
        result.airNoise = lerp(a.airNoise, b.airNoise, t)

        // === Reverb ===
        result.reverbDecay = lerp(a.reverbDecay, b.reverbDecay, t)
        result.reverbSize = lerp(a.reverbSize, b.reverbSize, t)
        result.reverbDiffusion = lerp(a.reverbDiffusion, b.reverbDiffusion, t)
        result.reverbModulation = lerp(a.reverbModulation, b.reverbModulation, t)
        result.predelay = lerp(a.predelay, b.predelay, t)
        result.damping = lerp(a.damping, b.damping, t)
        result.width = lerp(a.width, b.width, t)
        result.reverbShimmer = lerp(a.reverbShimmer, b.reverbShimmer, t)
        result.reverbShimmerPitch = lerp(a.reverbShimmerPitch, b.reverbShimmerPitch, t)
        result.reverbSlowModRate = lerp(a.reverbSlowModRate, b.reverbSlowModRate, t)
        result.reverbSlowModDepth = lerp(a.reverbSlowModDepth, b.reverbSlowModDepth, t)
        result.reverbReverse = lerp(a.reverbReverse, b.reverbReverse, t)
        result.reverbReverseLength = lerp(a.reverbReverseLength, b.reverbReverseLength, t)
        result.reverbChorusRate = lerp(a.reverbChorusRate, b.reverbChorusRate, t)
        result.reverbChorusDepth = lerp(a.reverbChorusDepth, b.reverbChorusDepth, t)
        result.reverbDampLow = lerp(a.reverbDampLow, b.reverbDampLow, t)
        result.reverbDampHigh = lerp(a.reverbDampHigh, b.reverbDampHigh, t)
        result.reverbCrossoverFreq = lerp(a.reverbCrossoverFreq, b.reverbCrossoverFreq, t)
        result.reverbInputTone = lerp(a.reverbInputTone, b.reverbInputTone, t)
        result.reverbShimmerFeedback = lerp(a.reverbShimmerFeedback, b.reverbShimmerFeedback, t)
        result.reverbWarp = lerp(a.reverbWarp, b.reverbWarp, t)
        result.reverbCrossFeed = lerp(a.reverbCrossFeed, b.reverbCrossFeed, t)
        result.reverbEarlyReflections = lerp(a.reverbEarlyReflections, b.reverbEarlyReflections, t)
        result.reverbAirAbsorption = lerp(a.reverbAirAbsorption, b.reverbAirAbsorption, t)
        result.reverbTransientSmooth = lerp(a.reverbTransientSmooth, b.reverbTransientSmooth, t)
        result.reverbErLpFreq = lerp(a.reverbErLpFreq, b.reverbErLpFreq, t)
        result.spectralFreezeSpeed = lerp(a.spectralFreezeSpeed, b.spectralFreezeSpeed, t)
        result.spectralFreezeMix = lerp(a.spectralFreezeMix, b.spectralFreezeMix, t)
        result.spectralFreezeDecay = lerp(a.spectralFreezeDecay, b.spectralFreezeDecay, t)
        result.spectralFreezePhaseJitter = lerp(a.spectralFreezePhaseJitter, b.spectralFreezePhaseJitter, t)
        result.spectralFreezeReverbCrossfade = lerp(a.spectralFreezeReverbCrossfade, b.spectralFreezeReverbCrossfade, t)
        result.dynamicsSaturationDrive = lerp(a.dynamicsSaturationDrive, b.dynamicsSaturationDrive, t)
        result.dynamicsSaturationTone = lerp(a.dynamicsSaturationTone, b.dynamicsSaturationTone, t)
        result.dynamicsSaturationBias = lerp(a.dynamicsSaturationBias, b.dynamicsSaturationBias, t)

        // === Dynamics Character ===
        result.characterMix = lerp(a.characterMix, b.characterMix, t)
        result.characterAge = lerp(a.characterAge, b.characterAge, t)
        result.characterDepth = lerp(a.characterDepth, b.characterDepth, t)
        result.characterRate = lerp(a.characterRate, b.characterRate, t)
        result.characterDamp = lerp(a.characterDamp, b.characterDamp, t)
        result.characterEnvFollow = lerp(a.characterEnvFollow, b.characterEnvFollow, t)
        result.characterStereo = lerp(a.characterStereo, b.characterStereo, t)
        result.characterResonance = lerp(a.characterResonance, b.characterResonance, t)
        result.degradeMix = lerp(a.degradeMix, b.degradeMix, t)
        result.degradeAge = lerp(a.degradeAge, b.degradeAge, t)
        result.degradeGeneration = lerp(a.degradeGeneration, b.degradeGeneration, t)
        result.degradeAlias = lerp(a.degradeAlias, b.degradeAlias, t)
        result.degradeWow = lerp(a.degradeWow, b.degradeWow, t)
        result.degradeFlutter = lerp(a.degradeFlutter, b.degradeFlutter, t)
        result.degradeDrift = lerp(a.degradeDrift, b.degradeDrift, t)
        result.degradeWobbleSpeed = lerp(a.degradeWobbleSpeed, b.degradeWobbleSpeed, t)
        result.degradeTone = lerp(a.degradeTone, b.degradeTone, t)
        result.degradeHp = lerp(a.degradeHp, b.degradeHp, t)
        result.degradeLp = lerp(a.degradeLp, b.degradeLp, t)
        result.degradeNoise = lerp(a.degradeNoise, b.degradeNoise, t)
        result.degradeSaturation = lerp(a.degradeSaturation, b.degradeSaturation, t)
        result.degradeCorrosion = lerp(a.degradeCorrosion, b.degradeCorrosion, t)
        result.endCompThreshold = lerp(a.endCompThreshold, b.endCompThreshold, t)
        result.endCompKnee = lerp(a.endCompKnee, b.endCompKnee, t)
        result.endCompRatio = lerp(a.endCompRatio, b.endCompRatio, t)
        result.endCompAttackMs = lerp(a.endCompAttackMs, b.endCompAttackMs, t)
        result.endCompReleaseMs = lerp(a.endCompReleaseMs, b.endCompReleaseMs, t)
        result.endCompMakeup = lerp(a.endCompMakeup, b.endCompMakeup, t)
        result.endCompMix = lerp(a.endCompMix, b.endCompMix, t)
        result.endCompDetectorHp = lerp(a.endCompDetectorHp, b.endCompDetectorHp, t)
        result.endCompDetectorTilt = lerp(a.endCompDetectorTilt, b.endCompDetectorTilt, t)
        result.endCompAutoMakeup = lerp(a.endCompAutoMakeup, b.endCompAutoMakeup, t)
        result.endCompProgramRelease = lerp(a.endCompProgramRelease, b.endCompProgramRelease, t)

        // === Granular ===
        result.maxGrains = lerp(a.maxGrains, b.maxGrains, t)
        result.grainProbability = lerp(a.grainProbability, b.grainProbability, t)
        result.grainSizeMin = lerp(a.grainSizeMin, b.grainSizeMin, t)
        result.grainSizeMax = lerp(a.grainSizeMax, b.grainSizeMax, t)
        result.density = lerp(a.density, b.density, t)
        result.spray = lerp(a.spray, b.spray, t)
        result.jitter = lerp(a.jitter, b.jitter, t)
        result.pitchSpread = lerp(a.pitchSpread, b.pitchSpread, t)
        result.stereoSpread = lerp(a.stereoSpread, b.stereoSpread, t)
        result.feedback = lerp(a.feedback, b.feedback, t)
        result.granularFeedbackLPF = lerp(a.granularFeedbackLPF, b.granularFeedbackLPF, t)
        result.granularBufferSeconds = lerp(a.granularBufferSeconds, b.granularBufferSeconds, t)
        result.wetHPF = lerp(a.wetHPF, b.wetHPF, t)
        result.wetLPF = lerp(a.wetLPF, b.wetLPF, t)

        // === Lead Synth ===
        result.leadLevel = lerp(a.leadLevel, b.leadLevel, t)
        result.leadAttack = lerp(a.leadAttack, b.leadAttack, t)
        result.leadDecay = lerp(a.leadDecay, b.leadDecay, t)
        result.leadSustain = lerp(a.leadSustain, b.leadSustain, t)
        result.leadRelease = lerp(a.leadRelease, b.leadRelease, t)
        result.leadDelayTimeMin = lerp(a.leadDelayTimeMin, b.leadDelayTimeMin, t)
        result.leadDelayTimeMax = lerp(a.leadDelayTimeMax, b.leadDelayTimeMax, t)
        result.leadDelayFeedbackMin = lerp(a.leadDelayFeedbackMin, b.leadDelayFeedbackMin, t)
        result.leadDelayFeedbackMax = lerp(a.leadDelayFeedbackMax, b.leadDelayFeedbackMax, t)
        result.leadDelayMixMin = lerp(a.leadDelayMixMin, b.leadDelayMixMin, t)
        result.leadDelayMixMax = lerp(a.leadDelayMixMax, b.leadDelayMixMax, t)
        result.leadDensity = lerp(a.leadDensity, b.leadDensity, t)
        result.leadOctave = lerpInt(a.leadOctave, b.leadOctave, t)
        result.leadOctaveRange = lerpInt(a.leadOctaveRange, b.leadOctaveRange, t)
        result.leadTimbreMin = lerp(a.leadTimbreMin, b.leadTimbreMin, t)
        result.leadTimbreMax = lerp(a.leadTimbreMax, b.leadTimbreMax, t)
        result.leadVibratoDepthMin = lerp(a.leadVibratoDepthMin, b.leadVibratoDepthMin, t)
        result.leadVibratoDepthMax = lerp(a.leadVibratoDepthMax, b.leadVibratoDepthMax, t)
        result.leadVibratoRateMin = lerp(a.leadVibratoRateMin, b.leadVibratoRateMin, t)
        result.leadVibratoRateMax = lerp(a.leadVibratoRateMax, b.leadVibratoRateMax, t)
        result.leadGlideMin = lerp(a.leadGlideMin, b.leadGlideMin, t)
        result.leadGlideMax = lerp(a.leadGlideMax, b.leadGlideMax, t)
        result.lead2Attack = lerp(a.lead2Attack, b.lead2Attack, t)
        result.lead2Decay = lerp(a.lead2Decay, b.lead2Decay, t)
        result.lead2Sustain = lerp(a.lead2Sustain, b.lead2Sustain, t)
        result.lead2Hold = lerp(a.lead2Hold, b.lead2Hold, t)
        result.lead2Release = lerp(a.lead2Release, b.lead2Release, t)
        result.lead2Morph = lerp(a.lead2Morph, b.lead2Morph, t)
        result.lead2Density = lerp(a.lead2Density, b.lead2Density, t)
        result.lead2Octave = lerpInt(a.lead2Octave, b.lead2Octave, t)
        result.lead2OctaveRange = lerpInt(a.lead2OctaveRange, b.lead2OctaveRange, t)
        result.lead2PostLPF = lerp(a.lead2PostLPF, b.lead2PostLPF, t)
        result.lead2StereoWidth = lerp(a.lead2StereoWidth, b.lead2StereoWidth, t)
        result.lead2DiffuseSend = lerp(a.lead2DiffuseSend, b.lead2DiffuseSend, t)
        result.pianoAttack = lerp(a.pianoAttack, b.pianoAttack, t)
        result.pianoDecay = lerp(a.pianoDecay, b.pianoDecay, t)
        result.pianoSustain = lerp(a.pianoSustain, b.pianoSustain, t)
        result.pianoHold = lerp(a.pianoHold, b.pianoHold, t)
        result.pianoRelease = lerp(a.pianoRelease, b.pianoRelease, t)
        result.pianoPostLPF = lerp(a.pianoPostLPF, b.pianoPostLPF, t)
        result.pianoStereoWidth = lerp(a.pianoStereoWidth, b.pianoStereoWidth, t)
        result.pianoDiffuseSend = lerp(a.pianoDiffuseSend, b.pianoDiffuseSend, t)
        result.delayATime = lerp(a.delayATime, b.delayATime, t)
        result.delayAFeedback = lerp(a.delayAFeedback, b.delayAFeedback, t)
        result.delayAMix = lerp(a.delayAMix, b.delayAMix, t)
        result.delayASpread = lerp(a.delayASpread, b.delayASpread, t)
        result.delayAFilter = lerp(a.delayAFilter, b.delayAFilter, t)
        result.delayASend = lerp(a.delayASend, b.delayASend, t)
        result.delayAToBSend = lerp(a.delayAToBSend, b.delayAToBSend, t)
        result.delayAGranularSend = lerp(a.delayAGranularSend, b.delayAGranularSend, t)
        result.delayBGranularSend = lerp(a.delayBGranularSend, b.delayBGranularSend, t)
        result.delayAModRate = lerp(a.delayAModRate, b.delayAModRate, t)
        result.delayAModDepth = lerp(a.delayAModDepth, b.delayAModDepth, t)
        result.delayADuck = lerp(a.delayADuck, b.delayADuck, t)
        result.delayAWidth = lerp(a.delayAWidth, b.delayAWidth, t)
        result.delayBWarpIntensity = lerp(a.delayBWarpIntensity, b.delayBWarpIntensity, t)
        result.delayBSpread = lerp(a.delayBSpread, b.delayBSpread, t)
        result.delayBToASend = lerp(a.delayBToASend, b.delayBToASend, t)
        result.delayACrossFeedFilter = lerp(a.delayACrossFeedFilter, b.delayACrossFeedFilter, t)
        result.granularDelayActivity = lerp(a.granularDelayActivity, b.granularDelayActivity, t)
        result.granularDelayRepeats = lerp(a.granularDelayRepeats, b.granularDelayRepeats, t)
        result.granularDelayFilter = lerp(a.granularDelayFilter, b.granularDelayFilter, t)
        result.granularDelayVibrato = lerp(a.granularDelayVibrato, b.granularDelayVibrato, t)
        result.granularDelayMix = lerp(a.granularDelayMix, b.granularDelayMix, t)
        result.granularDelayReverbSend = lerp(a.granularDelayReverbSend, b.granularDelayReverbSend, t)

        // === Euclidean Sequencer ===
        result.synthEuclideanTempo = lerp(a.synthEuclideanTempo, b.synthEuclideanTempo, t)
        // Lane 1
        result.synthEuclid1Steps = lerpInt(a.synthEuclid1Steps, b.synthEuclid1Steps, t)
        result.synthEuclid1Hits = lerpInt(a.synthEuclid1Hits, b.synthEuclid1Hits, t)
        result.synthEuclid1Rotation = lerpInt(a.synthEuclid1Rotation, b.synthEuclid1Rotation, t)
        result.synthEuclid1NoteMin = lerpInt(a.synthEuclid1NoteMin, b.synthEuclid1NoteMin, t)
        result.synthEuclid1NoteMax = lerpInt(a.synthEuclid1NoteMax, b.synthEuclid1NoteMax, t)
        result.synthEuclid1Level = lerp(a.synthEuclid1Level, b.synthEuclid1Level, t)
        // Lane 2
        result.synthEuclid2Steps = lerpInt(a.synthEuclid2Steps, b.synthEuclid2Steps, t)
        result.synthEuclid2Hits = lerpInt(a.synthEuclid2Hits, b.synthEuclid2Hits, t)
        result.synthEuclid2Rotation = lerpInt(a.synthEuclid2Rotation, b.synthEuclid2Rotation, t)
        result.synthEuclid2NoteMin = lerpInt(a.synthEuclid2NoteMin, b.synthEuclid2NoteMin, t)
        result.synthEuclid2NoteMax = lerpInt(a.synthEuclid2NoteMax, b.synthEuclid2NoteMax, t)
        result.synthEuclid2Level = lerp(a.synthEuclid2Level, b.synthEuclid2Level, t)
        // Lane 3
        result.synthEuclid3Steps = lerpInt(a.synthEuclid3Steps, b.synthEuclid3Steps, t)
        result.synthEuclid3Hits = lerpInt(a.synthEuclid3Hits, b.synthEuclid3Hits, t)
        result.synthEuclid3Rotation = lerpInt(a.synthEuclid3Rotation, b.synthEuclid3Rotation, t)
        result.synthEuclid3NoteMin = lerpInt(a.synthEuclid3NoteMin, b.synthEuclid3NoteMin, t)
        result.synthEuclid3NoteMax = lerpInt(a.synthEuclid3NoteMax, b.synthEuclid3NoteMax, t)
        result.synthEuclid3Level = lerp(a.synthEuclid3Level, b.synthEuclid3Level, t)
        // Lane 4
        result.synthEuclid4Steps = lerpInt(a.synthEuclid4Steps, b.synthEuclid4Steps, t)
        result.synthEuclid4Hits = lerpInt(a.synthEuclid4Hits, b.synthEuclid4Hits, t)
        result.synthEuclid4Rotation = lerpInt(a.synthEuclid4Rotation, b.synthEuclid4Rotation, t)
        result.synthEuclid4NoteMin = lerpInt(a.synthEuclid4NoteMin, b.synthEuclid4NoteMin, t)
        result.synthEuclid4NoteMax = lerpInt(a.synthEuclid4NoteMax, b.synthEuclid4NoteMax, t)
        result.synthEuclid4Level = lerp(a.synthEuclid4Level, b.synthEuclid4Level, t)

        // Euclidean probability (lerp)
        result.synthEuclid1Probability = lerp(a.synthEuclid1Probability, b.synthEuclid1Probability, t)
        result.synthEuclid2Probability = lerp(a.synthEuclid2Probability, b.synthEuclid2Probability, t)
        result.synthEuclid3Probability = lerp(a.synthEuclid3Probability, b.synthEuclid3Probability, t)
        result.synthEuclid4Probability = lerp(a.synthEuclid4Probability, b.synthEuclid4Probability, t)

        // === Ocean ===
        result.oceanSampleLevel = lerp(a.oceanSampleLevel, b.oceanSampleLevel, t)
        result.oceanReverbSend = lerp(a.oceanReverbSend, b.oceanReverbSend, t)
        result.oceanDelayASend = lerp(a.oceanDelayASend, b.oceanDelayASend, t)
        result.oceanDelayBSend = lerp(a.oceanDelayBSend, b.oceanDelayBSend, t)
        result.oceanSliceDuration = lerp(a.oceanSliceDuration, b.oceanSliceDuration, t)
        result.oceanSliceDensity = lerp(a.oceanSliceDensity, b.oceanSliceDensity, t)
        result.oceanWaveSynthLevel = lerp(a.oceanWaveSynthLevel, b.oceanWaveSynthLevel, t)
        result.oceanFilterCutoff = lerp(a.oceanFilterCutoff, b.oceanFilterCutoff, t)
        result.oceanFilterResonance = lerp(a.oceanFilterResonance, b.oceanFilterResonance, t)
        result.oceanDurationMin = lerp(a.oceanDurationMin, b.oceanDurationMin, t)
        result.oceanDurationMax = lerp(a.oceanDurationMax, b.oceanDurationMax, t)
        result.oceanIntervalMin = lerp(a.oceanIntervalMin, b.oceanIntervalMin, t)
        result.oceanIntervalMax = lerp(a.oceanIntervalMax, b.oceanIntervalMax, t)
        result.oceanFoamMin = lerp(a.oceanFoamMin, b.oceanFoamMin, t)
        result.oceanFoamMax = lerp(a.oceanFoamMax, b.oceanFoamMax, t)
        result.oceanDepthMin = lerp(a.oceanDepthMin, b.oceanDepthMin, t)
        result.oceanDepthMax = lerp(a.oceanDepthMax, b.oceanDepthMax, t)
        result.birdsLevel = lerp(a.birdsLevel, b.birdsLevel, t)
        result.birds2Level = lerp(a.birds2Level, b.birds2Level, t)
        result.frogsLevel = lerp(a.frogsLevel, b.frogsLevel, t)
        result.natureLevel = lerp(a.natureLevel, b.natureLevel, t)
        result.natureReverbSend = lerp(a.natureReverbSend, b.natureReverbSend, t)
        result.natureDelayASend = lerp(a.natureDelayASend, b.natureDelayASend, t)
        result.natureDelayBSend = lerp(a.natureDelayBSend, b.natureDelayBSend, t)
        result.waterIntensity = lerp(a.waterIntensity, b.waterIntensity, t)
        result.waterReverbSend = lerp(a.waterReverbSend, b.waterReverbSend, t)
        result.waterDelayASend = lerp(a.waterDelayASend, b.waterDelayASend, t)
        result.waterDelayBSend = lerp(a.waterDelayBSend, b.waterDelayBSend, t)
        result.waterLevel = lerp(a.waterLevel, b.waterLevel, t)
        result.waterLayerHardDrops = lerp(a.waterLayerHardDrops, b.waterLayerHardDrops, t)
        result.waterLayerWaterDrops = lerp(a.waterLayerWaterDrops, b.waterLayerWaterDrops, t)
        result.waterLayerTurbulence = lerp(a.waterLayerTurbulence, b.waterLayerTurbulence, t)
        result.waterLayerBubbling = lerp(a.waterLayerBubbling, b.waterLayerBubbling, t)
        result.waterLayerSurf = lerp(a.waterLayerSurf, b.waterLayerSurf, t)
        result.insectsDensity = lerp(a.insectsDensity, b.insectsDensity, t)
        result.insectsTemperature = lerp(a.insectsTemperature, b.insectsTemperature, t)
        result.insectsLevel = lerp(a.insectsLevel, b.insectsLevel, t)
        result.insectsSharedLevel = lerp(a.insectsSharedLevel, b.insectsSharedLevel, t)
        result.insectsReverbSend = lerp(a.insectsReverbSend, b.insectsReverbSend, t)
        result.insDelayASend = lerp(a.insDelayASend, b.insDelayASend, t)
        result.insDelayBSend = lerp(a.insDelayBSend, b.insDelayBSend, t)
        result.insects2Density = lerp(a.insects2Density, b.insects2Density, t)
        result.insects2Temperature = lerp(a.insects2Temperature, b.insects2Temperature, t)
        result.insects2Level = lerp(a.insects2Level, b.insects2Level, t)

        // === Random Walk ===
        result.randomWalkSpeed = lerp(a.randomWalkSpeed, b.randomWalkSpeed, t)

        // === Drum System ===
        result.drumLevel = lerp(a.drumLevel, b.drumLevel, t)
        result.drumReverbSend = lerp(a.drumReverbSend, b.drumReverbSend, t)
        result.drumDelayFeedback = lerp(a.drumDelayFeedback, b.drumDelayFeedback, t)
        result.drumDelayMix = lerp(a.drumDelayMix, b.drumDelayMix, t)
        result.drumDelayFilter = lerp(a.drumDelayFilter, b.drumDelayFilter, t)
        // Delay sends
        result.drumSubDelaySend = lerp(a.drumSubDelaySend, b.drumSubDelaySend, t)
        result.drumKickDelaySend = lerp(a.drumKickDelaySend, b.drumKickDelaySend, t)
        result.drumClickDelaySend = lerp(a.drumClickDelaySend, b.drumClickDelaySend, t)
        result.drumBeepHiDelaySend = lerp(a.drumBeepHiDelaySend, b.drumBeepHiDelaySend, t)
        result.drumBeepLoDelaySend = lerp(a.drumBeepLoDelaySend, b.drumBeepLoDelaySend, t)
        result.drumNoiseDelaySend = lerp(a.drumNoiseDelaySend, b.drumNoiseDelaySend, t)

        // Drum voice morph positions (interpolate during master morph)
        result.drumSubMorph = lerp(a.drumSubMorph, b.drumSubMorph, t)
        result.drumKickMorph = lerp(a.drumKickMorph, b.drumKickMorph, t)
        result.drumClickMorph = lerp(a.drumClickMorph, b.drumClickMorph, t)
        result.drumBeepHiMorph = lerp(a.drumBeepHiMorph, b.drumBeepHiMorph, t)
        result.drumBeepLoMorph = lerp(a.drumBeepLoMorph, b.drumBeepLoMorph, t)
        result.drumNoiseMorph = lerp(a.drumNoiseMorph, b.drumNoiseMorph, t)
        result.drumSubMorphSpeed = lerp(a.drumSubMorphSpeed, b.drumSubMorphSpeed, t)
        result.drumKickMorphSpeed = lerp(a.drumKickMorphSpeed, b.drumKickMorphSpeed, t)
        result.drumClickMorphSpeed = lerp(a.drumClickMorphSpeed, b.drumClickMorphSpeed, t)
        result.drumBeepHiMorphSpeed = lerp(a.drumBeepHiMorphSpeed, b.drumBeepHiMorphSpeed, t)
        result.drumBeepLoMorphSpeed = lerp(a.drumBeepLoMorphSpeed, b.drumBeepLoMorphSpeed, t)
        result.drumNoiseMorphSpeed = lerp(a.drumNoiseMorphSpeed, b.drumNoiseMorphSpeed, t)

        // Drum voice params (Sub)
        result.drumSubFreq = lerp(a.drumSubFreq, b.drumSubFreq, t)
        result.drumSubDecay = lerp(a.drumSubDecay, b.drumSubDecay, t)
        result.drumSubLevel = lerp(a.drumSubLevel, b.drumSubLevel, t)
        result.drumSubTone = lerp(a.drumSubTone, b.drumSubTone, t)
        result.drumSubShape = lerp(a.drumSubShape, b.drumSubShape, t)
        result.drumSubPitchEnv = lerp(a.drumSubPitchEnv, b.drumSubPitchEnv, t)
        result.drumSubPitchDecay = lerp(a.drumSubPitchDecay, b.drumSubPitchDecay, t)
        result.drumSubDrive = lerp(a.drumSubDrive, b.drumSubDrive, t)
        result.drumSubSub = lerp(a.drumSubSub, b.drumSubSub, t)

        // Drum voice params (Kick)
        result.drumKickFreq = lerp(a.drumKickFreq, b.drumKickFreq, t)
        result.drumKickPitchEnv = lerp(a.drumKickPitchEnv, b.drumKickPitchEnv, t)
        result.drumKickPitchDecay = lerp(a.drumKickPitchDecay, b.drumKickPitchDecay, t)
        result.drumKickDecay = lerp(a.drumKickDecay, b.drumKickDecay, t)
        result.drumKickLevel = lerp(a.drumKickLevel, b.drumKickLevel, t)
        result.drumKickClick = lerp(a.drumKickClick, b.drumKickClick, t)
        result.drumKickBody = lerp(a.drumKickBody, b.drumKickBody, t)
        result.drumKickPunch = lerp(a.drumKickPunch, b.drumKickPunch, t)
        result.drumKickTail = lerp(a.drumKickTail, b.drumKickTail, t)
        result.drumKickTone = lerp(a.drumKickTone, b.drumKickTone, t)

        // Drum voice params (Click)
        result.drumClickDecay = lerp(a.drumClickDecay, b.drumClickDecay, t)
        result.drumClickFilter = lerp(a.drumClickFilter, b.drumClickFilter, t)
        result.drumClickTone = lerp(a.drumClickTone, b.drumClickTone, t)
        result.drumClickLevel = lerp(a.drumClickLevel, b.drumClickLevel, t)
        result.drumClickResonance = lerp(a.drumClickResonance, b.drumClickResonance, t)
        result.drumClickPitch = lerp(a.drumClickPitch, b.drumClickPitch, t)
        result.drumClickPitchEnv = lerp(a.drumClickPitchEnv, b.drumClickPitchEnv, t)
        result.drumClickGrainCount = lerpInt(a.drumClickGrainCount, b.drumClickGrainCount, t)
        result.drumClickGrainSpread = lerp(a.drumClickGrainSpread, b.drumClickGrainSpread, t)
        result.drumClickStereoWidth = lerp(a.drumClickStereoWidth, b.drumClickStereoWidth, t)

        // Drum voice params (BeepHi)
        result.drumBeepHiFreq = lerp(a.drumBeepHiFreq, b.drumBeepHiFreq, t)
        result.drumBeepHiAttack = lerp(a.drumBeepHiAttack, b.drumBeepHiAttack, t)
        result.drumBeepHiDecay = lerp(a.drumBeepHiDecay, b.drumBeepHiDecay, t)
        result.drumBeepHiLevel = lerp(a.drumBeepHiLevel, b.drumBeepHiLevel, t)
        result.drumBeepHiTone = lerp(a.drumBeepHiTone, b.drumBeepHiTone, t)
        result.drumBeepHiInharmonic = lerp(a.drumBeepHiInharmonic, b.drumBeepHiInharmonic, t)
        result.drumBeepHiPartials = lerpInt(a.drumBeepHiPartials, b.drumBeepHiPartials, t)
        result.drumBeepHiShimmer = lerp(a.drumBeepHiShimmer, b.drumBeepHiShimmer, t)
        result.drumBeepHiShimmerRate = lerp(a.drumBeepHiShimmerRate, b.drumBeepHiShimmerRate, t)
        result.drumBeepHiBrightness = lerp(a.drumBeepHiBrightness, b.drumBeepHiBrightness, t)

        // Drum voice params (BeepLo)
        result.drumBeepLoFreq = lerp(a.drumBeepLoFreq, b.drumBeepLoFreq, t)
        result.drumBeepLoAttack = lerp(a.drumBeepLoAttack, b.drumBeepLoAttack, t)
        result.drumBeepLoDecay = lerp(a.drumBeepLoDecay, b.drumBeepLoDecay, t)
        result.drumBeepLoLevel = lerp(a.drumBeepLoLevel, b.drumBeepLoLevel, t)
        result.drumBeepLoTone = lerp(a.drumBeepLoTone, b.drumBeepLoTone, t)
        result.drumBeepLoPitchEnv = lerp(a.drumBeepLoPitchEnv, b.drumBeepLoPitchEnv, t)
        result.drumBeepLoPitchDecay = lerp(a.drumBeepLoPitchDecay, b.drumBeepLoPitchDecay, t)
        result.drumBeepLoBody = lerp(a.drumBeepLoBody, b.drumBeepLoBody, t)
        result.drumBeepLoPluck = lerp(a.drumBeepLoPluck, b.drumBeepLoPluck, t)
        result.drumBeepLoPluckDamp = lerp(a.drumBeepLoPluckDamp, b.drumBeepLoPluckDamp, t)

        // Drum voice params (Noise)
        result.drumNoiseFilterFreq = lerp(a.drumNoiseFilterFreq, b.drumNoiseFilterFreq, t)
        result.drumNoiseFilterQ = lerp(a.drumNoiseFilterQ, b.drumNoiseFilterQ, t)
        result.drumNoiseDecay = lerp(a.drumNoiseDecay, b.drumNoiseDecay, t)
        result.drumNoiseLevel = lerp(a.drumNoiseLevel, b.drumNoiseLevel, t)
        result.drumNoiseAttack = lerp(a.drumNoiseAttack, b.drumNoiseAttack, t)
        result.drumNoiseFormant = lerp(a.drumNoiseFormant, b.drumNoiseFormant, t)
        result.drumNoiseBreath = lerp(a.drumNoiseBreath, b.drumNoiseBreath, t)
        result.drumNoiseFilterEnv = lerp(a.drumNoiseFilterEnv, b.drumNoiseFilterEnv, t)
        result.drumNoiseFilterEnvDecay = lerp(a.drumNoiseFilterEnvDecay, b.drumNoiseFilterEnvDecay, t)
        result.drumNoiseDensity = lerp(a.drumNoiseDensity, b.drumNoiseDensity, t)
        result.drumNoiseColorLFO = lerp(a.drumNoiseColorLFO, b.drumNoiseColorLFO, t)

        // Random trigger probabilities
        result.drumRandomDensity = lerp(a.drumRandomDensity, b.drumRandomDensity, t)
        result.drumRandomSubProb = lerp(a.drumRandomSubProb, b.drumRandomSubProb, t)
        result.drumRandomKickProb = lerp(a.drumRandomKickProb, b.drumRandomKickProb, t)
        result.drumRandomClickProb = lerp(a.drumRandomClickProb, b.drumRandomClickProb, t)
        result.drumRandomBeepHiProb = lerp(a.drumRandomBeepHiProb, b.drumRandomBeepHiProb, t)
        result.drumRandomBeepLoProb = lerp(a.drumRandomBeepLoProb, b.drumRandomBeepLoProb, t)
        result.drumRandomNoiseProb = lerp(a.drumRandomNoiseProb, b.drumRandomNoiseProb, t)

        // === Snap discrete values at 50% (Issue 7 fix: include all discrete params) ===
        if t >= 0.5 {
            // Global
            result.seedWindow = b.seedWindow
            result.transportPrimaryClock = b.transportPrimaryClock
            result.harmonyClockSource = b.harmonyClockSource
            result.chordProgressionEnabled = b.chordProgressionEnabled
            result.chordProgressionPattern = b.chordProgressionPattern
            result.chordProgressionStepEnabled = b.chordProgressionStepEnabled
            result.chordProgressionClockSource = b.chordProgressionClockSource
            // Circle of Fifths
            result.cofDriftEnabled = b.cofDriftEnabled
            result.cofDriftDirection = b.cofDriftDirection
            // Harmony
            result.scaleMode = b.scaleMode
            result.manualScale = b.manualScale
            // Synth
            result.filterType = b.filterType
            // Reverb - note: reverbQuality is a user preference, not morphed
            result.reverbEnabled = b.reverbEnabled
            result.reverbEngine = b.reverbEngine
            result.reverbType = b.reverbType
            result.reverbModCharacter = b.reverbModCharacter
            result.reverbSaturationMode = b.reverbSaturationMode
            result.spectralFreezeEnabled = b.spectralFreezeEnabled
            result.spectralFreezeActive = b.spectralFreezeActive
            result.spectralFreezeSlushy = b.spectralFreezeSlushy
            result.spectralFreezeRouting = b.spectralFreezeRouting
            // reverbQuality excluded - preserved from current state in setMorphPosition
            // Dynamics Character
            result.dynamicsEnabled = b.dynamicsEnabled
            result.dynamicsSaturationEnabled = b.dynamicsSaturationEnabled
            result.dynamicsSaturationMode = b.dynamicsSaturationMode
            result.characterEnabled = b.characterEnabled
            result.characterMode = b.characterMode
            result.degradeEnabled = b.degradeEnabled
            result.endCompEnabled = b.endCompEnabled
            // Granular
            result.granularEnabled = b.granularEnabled
            result.granularFreeze = b.granularFreeze
            result.grainPitchMode = b.grainPitchMode
            // Lead
            result.leadEnabled = b.leadEnabled
            result.lead2Enabled = b.lead2Enabled
            result.lead2PresetC = b.lead2PresetC
            result.lead2PresetD = b.lead2PresetD
            result.lead2MorphAuto = b.lead2MorphAuto
            result.lead2MorphMode = b.lead2MorphMode
            result.lead2AlgorithmMode = b.lead2AlgorithmMode
            result.lead2UseCustomAdsr = b.lead2UseCustomAdsr
            result.pianoEnabled = b.pianoEnabled
            result.delayAEnabled = b.delayAEnabled
            result.delayAPingPong = b.delayAPingPong
            result.delayAFilterType = b.delayAFilterType
            result.delayBPattern = b.delayBPattern
            result.delayBWarp = b.delayBWarp
            result.granularDelayEnabled = b.granularDelayEnabled
            result.granularDelayTime = b.granularDelayTime
            result.synthEuclideanMasterEnabled = b.synthEuclideanMasterEnabled
            result.synthEuclid1Enabled = b.synthEuclid1Enabled
            result.synthEuclid1Preset = b.synthEuclid1Preset
            result.synthEuclid2Enabled = b.synthEuclid2Enabled
            result.synthEuclid2Preset = b.synthEuclid2Preset
            result.synthEuclid3Enabled = b.synthEuclid3Enabled
            result.synthEuclid3Preset = b.synthEuclid3Preset
            result.synthEuclid4Enabled = b.synthEuclid4Enabled
            result.synthEuclid4Preset = b.synthEuclid4Preset
            // Euclidean sources (discrete)
            result.synthEuclid1Source = b.synthEuclid1Source
            result.synthEuclid2Source = b.synthEuclid2Source
            result.synthEuclid3Source = b.synthEuclid3Source
            result.synthEuclid4Source = b.synthEuclid4Source
            // Synth chord sequencer
            result.synthChordSequencerEnabled = b.synthChordSequencerEnabled
            // Ocean
            result.oceanSampleEnabled = b.oceanSampleEnabled
            result.oceanWaveSynthEnabled = b.oceanWaveSynthEnabled
            result.oceanFilterType = b.oceanFilterType
            result.birdsEnabled = b.birdsEnabled
            result.birds2Enabled = b.birds2Enabled
            result.frogsEnabled = b.frogsEnabled
            result.waterEnabled = b.waterEnabled
            result.waterPreset = b.waterPreset
            result.waterMorphA = b.waterMorphA
            result.waterMorphB = b.waterMorphB
            result.insectsEnabled = b.insectsEnabled
            result.insectsEngine = b.insectsEngine
            result.insects2Enabled = b.insects2Enabled
            result.insects2Engine = b.insects2Engine
            // Drum (booleans)
            result.drumEnabled = b.drumEnabled
            result.drumDelayEnabled = b.drumDelayEnabled
            result.drumRandomEnabled = b.drumRandomEnabled
            result.drumRandomMorphUpdate = b.drumRandomMorphUpdate
            result.drumSubMorphAuto = b.drumSubMorphAuto
            result.drumKickMorphAuto = b.drumKickMorphAuto
            result.drumClickMorphAuto = b.drumClickMorphAuto
            result.drumBeepHiMorphAuto = b.drumBeepHiMorphAuto
            result.drumBeepLoMorphAuto = b.drumBeepLoMorphAuto
            result.drumNoiseMorphAuto = b.drumNoiseMorphAuto
            // Drum (preset names)
            result.drumSubPresetA = b.drumSubPresetA
            result.drumSubPresetB = b.drumSubPresetB
            result.drumKickPresetA = b.drumKickPresetA
            result.drumKickPresetB = b.drumKickPresetB
            result.drumClickPresetA = b.drumClickPresetA
            result.drumClickPresetB = b.drumClickPresetB
            result.drumBeepHiPresetA = b.drumBeepHiPresetA
            result.drumBeepHiPresetB = b.drumBeepHiPresetB
            result.drumBeepLoPresetA = b.drumBeepLoPresetA
            result.drumBeepLoPresetB = b.drumBeepLoPresetB
            result.drumNoisePresetA = b.drumNoisePresetA
            result.drumNoisePresetB = b.drumNoisePresetB
            // Drum (other discrete)
            result.drumDelayNoteL = b.drumDelayNoteL
            result.drumDelayNoteR = b.drumDelayNoteR
            result.drumSubMorphMode = b.drumSubMorphMode
            result.drumKickMorphMode = b.drumKickMorphMode
            result.drumClickMorphMode = b.drumClickMorphMode
            result.drumBeepHiMorphMode = b.drumBeepHiMorphMode
            result.drumBeepLoMorphMode = b.drumBeepLoMorphMode
            result.drumNoiseMorphMode = b.drumNoiseMorphMode
            result.drumClickMode = b.drumClickMode
            result.drumNoiseFilterType = b.drumNoiseFilterType
        }

        // Handle root note via Circle of Fifths path walking
        // Walk from A to B through the CoF (shortest path)
        result.rootNote = interpolateRootNoteViaCoF(from: a.rootNote, to: b.rootNote, t: t)

        return result
    }

    /// Lerp helper for Int values
    private func lerpInt(_ a: Int, _ b: Int, _ t: Double) -> Int {
        return Int(round(Double(a) + Double(b - a) * t))
    }

    /// Interpolate root note by walking the Circle of Fifths
    /// This finds the shortest path on the CoF and walks through intermediate keys
    private func interpolateRootNoteViaCoF(from aNote: Int, to bNote: Int, t: Double) -> Int {
        // Find positions on Circle of Fifths
        guard let aIndex = COF_SEMITONES.firstIndex(of: aNote),
              let bIndex = COF_SEMITONES.firstIndex(of: bNote) else {
            // Fallback to snap at 50% if notes aren't in CoF (shouldn't happen)
            return t < 0.5 ? aNote : bNote
        }

        if aIndex == bIndex {
            return aNote
        }

        // Calculate clockwise and counter-clockwise distances
        let cwDistance = (bIndex - aIndex + 12) % 12
        let ccwDistance = (aIndex - bIndex + 12) % 12

        // Choose shorter path (prefer clockwise on tie)
        let (direction, distance): (Int, Int) = cwDistance <= ccwDistance ? (1, cwDistance) : (-1, ccwDistance)

        // Calculate current step along the path
        let steps = Double(distance) * t
        let currentStep = Int(steps.rounded())

        // Get the intermediate position on CoF
        let intermediateIndex = ((aIndex + direction * currentStep) % 12 + 12) % 12

        // Return the semitone value at that position
        return COF_SEMITONES[intermediateIndex]
    }

    private func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        return a + (b - a) * t
    }

    // MARK: - Auto-Morph Cycle (matching web app's play/morph cycle)

    /// Start automatic morphing cycle between presets
    func startAutoMorph() {
        guard savedPresets.count >= 2 else { return }

        autoMorphEnabled = true
        autoMorphCurrentPhase = .playingA
        phrasesInCurrentPhase = 0
        autoMorphPhrasesRemaining = morphPlayPhrases
        morphPhase = "Playing \(morphPresetA?.name ?? "A")"

        // Pick initial presets if not set
        if morphPresetA == nil {
            morphPresetA = savedPresets.randomElement()
        }
        if morphPresetB == nil {
            morphPresetB = savedPresets.filter { $0.id != morphPresetA?.id }.randomElement()
        }

        // Start timer - tick every effective phrase.
        autoMorphTimer?.setEventHandler {}
        autoMorphTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: .main)
        let phraseSeconds = max(0.001, state.effectivePhraseLength)
        timer.schedule(deadline: .now() + phraseSeconds, repeating: phraseSeconds, leeway: .milliseconds(250))
        timer.setEventHandler { [weak self] in
            Task { @MainActor in
                self?.tickAutoMorphPhrase()
            }
        }
        autoMorphTimer = timer
        timer.resume()
    }

    /// Stop automatic morphing
    func stopAutoMorph() {
        autoMorphEnabled = false
        autoMorphTimer?.setEventHandler {}
        autoMorphTimer?.cancel()
        autoMorphTimer = nil
        morphPhase = ""
    }

    private func tickAutoMorphPhrase() {
        guard autoMorphEnabled else { return }

        phrasesInCurrentPhase += 1

        switch autoMorphCurrentPhase {
        case .playingA:
            autoMorphPhrasesRemaining = morphPlayPhrases - phrasesInCurrentPhase
            if phrasesInCurrentPhase >= morphPlayPhrases {
                // Start morphing to B
                autoMorphCurrentPhase = .morphingToB
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphTransitionPhrases
                morphPhase = "Morphing to \(morphPresetB?.name ?? "B")"
            }

        case .morphingToB:
            autoMorphPhrasesRemaining = morphTransitionPhrases - phrasesInCurrentPhase
            // Smoothly increase morph position
            let progress = Double(phrasesInCurrentPhase) / Double(morphTransitionPhrases)
            morphPosition = progress * 100.0
            applyMorphedState()

            if phrasesInCurrentPhase >= morphTransitionPhrases {
                morphPosition = 100.0
                autoMorphCurrentPhase = .playingB
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphPlayPhrases
                morphPhase = "Playing \(morphPresetB?.name ?? "B")"
            }

        case .playingB:
            autoMorphPhrasesRemaining = morphPlayPhrases - phrasesInCurrentPhase
            if phrasesInCurrentPhase >= morphPlayPhrases {
                // Pick new target preset and start morphing back
                morphPresetA = morphPresetB
                morphPresetB = savedPresets.filter { $0.id != morphPresetA?.id }.randomElement()
                autoMorphCurrentPhase = .morphingToA
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphTransitionPhrases
                morphPhase = "Morphing to \(morphPresetB?.name ?? "next")"
            }

        case .morphingToA:
            autoMorphPhrasesRemaining = morphTransitionPhrases - phrasesInCurrentPhase
            // Smoothly increase morph position (now going 0 → 100 to new B)
            let progress = Double(phrasesInCurrentPhase) / Double(morphTransitionPhrases)
            morphPosition = progress * 100.0
            applyMorphedState()

            if phrasesInCurrentPhase >= morphTransitionPhrases {
                morphPosition = 100.0
                autoMorphCurrentPhase = .playingB
                phrasesInCurrentPhase = 0
                autoMorphPhrasesRemaining = morphPlayPhrases
                morphPhase = "Playing \(morphPresetB?.name ?? "B")"
                // Swap A and B for next cycle
                morphPresetA = morphPresetB
            }
        }
    }

    private func applyMorphedState() {
        guard let presetA = morphPresetA, let presetB = morphPresetB else { return }
        let morphedState = lerpPresets(presetA.state, presetB.state, t: morphPosition / 100.0)
        state = morphedState
    }

    /// Toggle auto-morph on/off
    func toggleAutoMorph() {
        if autoMorphEnabled {
            stopAutoMorph()
        } else {
            startAutoMorph()
        }
    }
}
