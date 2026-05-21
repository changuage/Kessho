import SwiftUI

/// Tab options for the Advanced UI panels
enum AdvancedTab: String, CaseIterable {
    case global = "Global"
    case synth = "Synth"
    case drums = "Drum Synth"
    case fx = "FX"

    var icon: String {
        switch self {
        case .global: return "◎"
        case .synth: return "∿"
        case .drums: return "⋮⋮"
        case .fx: return "◈"
        }
    }
}

/// Slider controls view with all parameters organized by section
struct SliderControlsView: View {
    @EnvironmentObject var appState: AppState
    @State private var expandedSections: Set<String> = ["Levels", "Character"]
    @State private var activeTab: AdvancedTab = .global

    /// Description text for current reverb quality mode
    private var reverbQualityDescription: String {
        switch appState.state.reverbQuality {
        case "ultra":
            return "32 stages • Best sound • Higher battery usage"
        case "balanced":
            return "16 stages • Good sound • Moderate battery"
        case "lite":
            return "Apple Reverb • Basic sound • Best battery"
        default:
            return ""
        }
    }

    /// Check if current reverb type is compatible with web app
    private var isReverbTypeWebAppCompatible: Bool {
        let webAppCompatibleTypes = ["plate", "hall", "cathedral", "darkHall"]
        return webAppCompatibleTypes.contains(appState.state.reverbType)
    }

    private var progressionStepCount: Int {
        max(1, min(8, appState.state.chordProgressionSteps))
    }

    private static let progressionDegreeLabels = ["I", "ii", "iii", "IV", "V", "vi", "VII", "I+"]
    private static let progressionPresets: [(label: String, pattern: [Int])] = [
        ("I - IV - V - I", [0, 3, 4, 0]),
        ("I - vi - IV - V", [0, 5, 3, 4]),
        ("ii - V - I - I", [1, 4, 0, 0]),
        ("I - iii - vi - IV", [0, 2, 5, 3]),
        ("I - V - vi - IV", [0, 4, 5, 3]),
        ("I - IV - ii - V", [0, 3, 1, 4]),
        ("i - VII - VI - VII", [0, 6, 5, 6]),
        ("I - VII - IV - I", [0, 6, 3, 0]),
    ]

    private func setProgressionSteps(_ steps: Int) {
        let safeSteps = max(1, min(8, steps))
        appState.state.chordProgressionSteps = safeSteps
        while appState.state.chordProgressionPattern.count < safeSteps {
            appState.state.chordProgressionPattern.append(0)
        }
        if appState.state.chordProgressionPattern.count > safeSteps {
            appState.state.chordProgressionPattern = Array(appState.state.chordProgressionPattern.prefix(safeSteps))
        }
        while appState.state.chordProgressionStepEnabled.count < safeSteps {
            appState.state.chordProgressionStepEnabled.append(true)
        }
        if appState.state.chordProgressionStepEnabled.count > safeSteps {
            appState.state.chordProgressionStepEnabled = Array(appState.state.chordProgressionStepEnabled.prefix(safeSteps))
        }
    }

    private func applyProgressionPreset(_ pattern: [Int]) {
        appState.state.chordProgressionPattern = pattern
        appState.state.chordProgressionSteps = pattern.count
        appState.state.chordProgressionStepEnabled = Array(repeating: true, count: pattern.count)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Tab Bar
            HStack(spacing: 4) {
                ForEach(AdvancedTab.allCases, id: \.self) { tab in
                    Button(action: { activeTab = tab }) {
                        VStack(spacing: 2) {
                            Text(tab.icon)
                                .font(.system(size: 16))
                            Text(tab.rawValue)
                                .font(.caption2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(activeTab == tab ? Color.purple.opacity(0.2) : Color.clear)
                        .foregroundColor(activeTab == tab ? .purple : .white.opacity(0.6))
                        .cornerRadius(8)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.3))

            ScrollView {
                VStack(spacing: 16) {
                    // MARK: - GLOBAL TAB
                    if activeTab == .global {
                    // MARK: - Levels Section
                    CollapsibleSection(title: "Levels", icon: "speaker.wave.3", expanded: $expandedSections) {
                        ParameterSlider(
                            label: "Master",
                            key: "masterVolume",
                            value: $appState.state.masterVolume,
                            range: 0...1,
                            icon: "speaker.wave.3"
                    )

                    ParameterSlider(
                        label: "Synth",
                        key: "synthLevel",
                        value: $appState.state.synthLevel,
                        range: 0...1,
                        icon: "waveform"
                    )

                    ParameterSlider(
                        label: "Granular",
                        key: "granularLevel",
                        value: $appState.state.granularLevel,
                        range: 0...2,
                        icon: "sparkles"
                    )

                    ParameterSlider(
                        label: "Lead",
                        key: "leadLevel",
                        value: $appState.state.leadLevel,
                        range: 0...1,
                        icon: "music.note"
                    )

                    ParameterSlider(
                        label: "Lead 2",
                        key: "lead2Level",
                        value: $appState.state.lead2Level,
                        range: 0...1,
                        icon: "music.note.list"
                    )

                    ParameterSlider(
                        label: "Piano",
                        key: "pianoLevel",
                        value: $appState.state.pianoLevel,
                        range: 0...1,
                        icon: "pianokeys"
                    )

                    ParameterSlider(
                        label: "Ocean",
                        key: "oceanSampleLevel",
                        value: $appState.state.oceanSampleLevel,
                        range: 0...1,
                        icon: "water.waves"
                    )

                    ParameterSlider(
                        label: "Earth",
                        key: "earthLevel",
                        value: $appState.state.earthLevel,
                        range: 0...1,
                        icon: "leaf"
                    )

                    ParameterSlider(
                        label: "Drums",
                        key: "drumLevel",
                        value: $appState.state.drumLevel,
                        range: 0...1,
                        icon: "circle.hexagonpath"
                    )

                    ParameterSlider(
                        label: "Reverb",
                        key: "reverbLevel",
                        value: $appState.state.reverbLevel,
                        range: 0...2,
                        icon: "waveform.path"
                    )
                }

                // MARK: - Harmony Section (matching web app's Harmony / Pitch panel)
                CollapsibleSection(title: "Harmony", icon: "music.quarternote.3", expanded: $expandedSections) {
                    // Root Note picker (0-11 semitones)
                    HStack {
                        Image(systemName: "tuningfork")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Root Note")
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Root Note", selection: $appState.state.rootNote) {
                            ForEach(0..<12, id: \.self) { semitone in
                                Text(NOTE_NAMES[semitone]).tag(semitone)
                            }
                        }
                        .pickerStyle(.menu)
                        .accentColor(.white)
                    }
                    .padding(.vertical, 4)

                    // Scale Mode picker (auto/manual)
                    HStack {
                        Image(systemName: "slider.horizontal.3")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Scale Mode")
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Scale Mode", selection: $appState.state.scaleMode) {
                            Text("Auto").tag("auto")
                            Text("Manual").tag("manual")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 150)
                    }
                    .padding(.vertical, 4)

                    // Manual scale family picker (only shown when scaleMode is "manual")
                    if appState.state.scaleMode == "manual" {
                        HStack {
                            Image(systemName: "music.note.list")
                                .foregroundColor(.white.opacity(0.5))
                                .frame(width: 20)
                            Text("Scale Family")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.8))
                            Spacer()
                            Picker("Scale Family", selection: $appState.state.manualScale) {
                                ForEach(SCALE_FAMILIES, id: \.name) { scale in
                                    Text("\(NOTE_NAMES[appState.state.rootNote]) \(scale.name)")
                                        .tag(scale.name)
                                }
                            }
                            .pickerStyle(.menu)
                            .accentColor(.white)
                        }
                        .padding(.vertical, 4)
                    }
                }

                // MARK: - Transport Section
                CollapsibleSection(title: "Transport + Sync", icon: "metronome", expanded: $expandedSections) {
                    HStack {
                        Image(systemName: "clock")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Primary Clock")
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Primary Clock", selection: $appState.state.transportPrimaryClock) {
                            Text("Phrase").tag("seconds")
                            Text("BPM").tag("bpm")
                            Text("Free").tag("decoupled")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 190)
                    }
                    .padding(.vertical, 4)

                    ParameterSlider(
                        label: "Phrase Seconds",
                        key: "phraseLength",
                        value: $appState.state.phraseLength,
                        range: 4...128,
                        unit: "s",
                        icon: "timer"
                    )

                    ParameterSlider(
                        label: "Shared BPM",
                        key: "sequencerMasterBPM",
                        value: $appState.state.sequencerMasterBPM,
                        range: 40...300,
                        unit: " BPM",
                        icon: "metronome"
                    )

                    HStack(spacing: 12) {
                        Stepper("Bars: \(appState.state.transportBarsPerPhrase)", value: $appState.state.transportBarsPerPhrase, in: 1...16)
                            .foregroundColor(.white.opacity(0.8))
                        Stepper("Beats: \(appState.state.transportBeatsPerBar)", value: $appState.state.transportBeatsPerBar, in: 2...12)
                            .foregroundColor(.white.opacity(0.8))
                    }

                    HStack {
                        Image(systemName: "point.3.connected.trianglepath.dotted")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Harmony Clock")
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Harmony Clock", selection: $appState.state.harmonyClockSource) {
                            Text("Global Phrase").tag("globalPhrase")
                            Text("Local Phrase").tag("localPhrase")
                            Text("Global Beat").tag("globalBeat")
                            Text("Local Beat").tag("localBeat")
                        }
                        .pickerStyle(.menu)
                        .accentColor(.white)
                    }
                    .padding(.vertical, 4)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Effective phrase \(String(format: "%.2f", appState.state.effectivePhraseLength))s")
                        Text("Beat phrase \(String(format: "%.2f", appState.state.phraseDurationFromBeatClock))s • equivalent \(String(format: "%.1f", appState.state.equivalentBPMFromPhraseClock)) BPM")
                    }
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.5))
                }

                // MARK: - Chord Progression Section
                CollapsibleSection(title: "Chord Progression", icon: "square.grid.3x3", expanded: $expandedSections) {
                    Toggle("Progression", isOn: $appState.state.chordProgressionEnabled)
                        .foregroundColor(.white)

                    if appState.state.chordProgressionEnabled {
                        HStack {
                            Image(systemName: "clock.arrow.2.circlepath")
                                .foregroundColor(.white.opacity(0.5))
                                .frame(width: 20)
                            Text("Clock")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.8))
                            Spacer()
                            Picker("Clock", selection: $appState.state.chordProgressionClockSource) {
                                Text("Harmony").tag("harmony")
                                Text("Global Phrase").tag("globalPhrase")
                                Text("Local Phrase").tag("localPhrase")
                            }
                            .pickerStyle(.menu)
                            .accentColor(.white)
                        }

                        Picker("Step Length", selection: $appState.state.chordProgressionPhraseMultiplier) {
                            Text("1 Phrase").tag(1)
                            Text("2 Phrases").tag(2)
                            Text("4 Phrases").tag(4)
                            Text("8 Phrases").tag(8)
                        }
                        .pickerStyle(.segmented)

                        Stepper("Pattern Length: \(progressionStepCount)", value: Binding(
                            get: { appState.state.chordProgressionSteps },
                            set: { setProgressionSteps($0) }
                        ), in: 2...8)
                        .foregroundColor(.white.opacity(0.8))

                        Menu {
                            ForEach(Self.progressionPresets.indices, id: \.self) { index in
                                let preset = Self.progressionPresets[index]
                                Button(preset.label) {
                                    applyProgressionPreset(preset.pattern)
                                }
                            }
                        } label: {
                            Label("Preset", systemImage: "music.note.list")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.85))
                        }

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            ForEach(0..<progressionStepCount, id: \.self) { index in
                                let degree = index < appState.state.chordProgressionPattern.count ? appState.state.chordProgressionPattern[index] : 0
                                let isOn = index < appState.state.chordProgressionStepEnabled.count ? appState.state.chordProgressionStepEnabled[index] : true

                                VStack(alignment: .leading, spacing: 6) {
                                    HStack {
                                        Text("Step \(index + 1)")
                                            .font(.caption2)
                                            .foregroundColor(.white.opacity(0.5))
                                        Spacer()
                                        Button(action: {
                                            while appState.state.chordProgressionStepEnabled.count <= index {
                                                appState.state.chordProgressionStepEnabled.append(true)
                                            }
                                            appState.state.chordProgressionStepEnabled[index].toggle()
                                        }) {
                                            Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                                                .foregroundColor(isOn ? .green : .white.opacity(0.35))
                                        }
                                    }
                                    Picker("Degree", selection: Binding(
                                        get: { degree },
                                        set: { newValue in
                                            while appState.state.chordProgressionPattern.count <= index {
                                                appState.state.chordProgressionPattern.append(0)
                                            }
                                            appState.state.chordProgressionPattern[index] = newValue
                                        }
                                    )) {
                                        ForEach(Self.progressionDegreeLabels.indices, id: \.self) { degreeIndex in
                                            Text(Self.progressionDegreeLabels[degreeIndex]).tag(degreeIndex)
                                        }
                                    }
                                    .pickerStyle(.menu)
                                }
                                .padding(8)
                                .background(isOn ? Color.purple.opacity(0.18) : Color.white.opacity(0.06))
                                .cornerRadius(8)
                            }
                        }
                    }
                }

                // MARK: - Character Section
                CollapsibleSection(title: "Character", icon: "paintpalette", expanded: $expandedSections) {
                    ParameterSlider(
                        label: "Tension",
                        key: "tension",
                        value: $appState.state.tension,
                        range: 0...1,
                        icon: "gauge.medium"
                    )

                    ParameterSlider(
                        label: "Randomness",
                        key: "randomness",
                        value: $appState.state.randomness,
                        range: 0...1,
                        icon: "dice"
                    )

                    ParameterSlider(
                        label: "Walk Speed",
                        key: "randomWalkSpeed",
                        value: $appState.state.randomWalkSpeed,
                        range: 0.1...5,
                        icon: "figure.walk"
                    )

                    ParameterSlider(
                        label: "Chord Rate",
                        key: "chordRate",
                        value: Binding(
                            get: { Double(appState.state.chordRate) },
                            set: { appState.state.chordRate = Int($0) }
                        ),
                        range: 8...64,
                        unit: "s",
                        icon: "clock"
                    )

                    ParameterSlider(
                        label: "Voicing Spread",
                        key: "voicingSpread",
                        value: $appState.state.voicingSpread,
                        range: 0...1,
                        icon: "arrow.up.and.down"
                    )

                    // Synth Chord Sequencer Toggle
                    Toggle("Synth Chord Sequencer", isOn: $appState.state.synthChordSequencerEnabled)
                        .foregroundColor(.white)

                    Text("When off, synth voices only play from Euclidean triggers")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.4))
                }
                } // End Global Tab

                // MARK: - SYNTH TAB
                if activeTab == .synth {
                // MARK: - Synth Oscillator Section
                CollapsibleSection(title: "Pad Synth", icon: "waveform", expanded: $expandedSections) {
                    // Oscillator Brightness (0-3)
                    ParameterSlider(
                        label: "Brightness",
                        key: "oscBrightness",
                        value: $appState.state.oscBrightness,
                        range: 0...3,
                        icon: "sun.max"
                    )

                    ParameterSlider(
                        label: "Wave Spread",
                        key: "waveSpread",
                        value: $appState.state.waveSpread,
                        range: 0...30,
                        icon: "water.waves"
                    )

                    ParameterSlider(
                        label: "Detune",
                        key: "detune",
                        value: $appState.state.detune,
                        range: 0...25,
                        unit: "¢",
                        icon: "tuningfork"
                    )

                    ParameterSlider(
                        label: "Hardness",
                        key: "hardness",
                        value: $appState.state.hardness,
                        range: 0...1,
                        icon: "diamond"
                    )

                    // Voice Mask (1-63 bitmask for 6 voices)
                    VoiceMaskControl(voiceMask: $appState.state.synthVoiceMask)

                    // Octave Shift (-2 to +2)
                    HStack {
                        Image(systemName: "arrow.up.arrow.down")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Octave")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Octave", selection: $appState.state.synthOctave) {
                            Text("-2").tag(-2)
                            Text("-1").tag(-1)
                            Text("0").tag(0)
                            Text("+1").tag(1)
                            Text("+2").tag(2)
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 200)
                    }
                }

                // MARK: - Synth Timbre Section
                CollapsibleSection(title: "Pad Timbre", icon: "slider.horizontal.3", expanded: $expandedSections) {
                    ParameterSlider(
                        label: "Warmth",
                        key: "warmth",
                        value: $appState.state.warmth,
                        range: 0...1,
                        icon: "flame"
                    )

                    ParameterSlider(
                        label: "Presence",
                        key: "presence",
                        value: $appState.state.presence,
                        range: 0...1,
                        icon: "waveform.badge.plus"
                    )

                    ParameterSlider(
                        label: "Air/Noise",
                        key: "airNoise",
                        value: $appState.state.airNoise,
                        range: 0...1,
                        icon: "wind"
                    )
                }

                // MARK: - Envelope Section
                CollapsibleSection(title: "Envelope", icon: "chart.xyaxis.line", expanded: $expandedSections) {
                    // ADSR Visualization
                    ADSRVisualization(
                        attack: appState.state.synthAttack,
                        decay: appState.state.synthDecay,
                        sustain: appState.state.synthSustain,
                        release: appState.state.synthRelease
                    )
                    .frame(height: 80)
                    .padding(.bottom, 8)

                    ParameterSlider(
                        label: "Attack",
                        key: "synthAttack",
                        value: $appState.state.synthAttack,
                        range: 0.01...16,
                        unit: "s",
                        icon: "arrow.up.right"
                    )

                    ParameterSlider(
                        label: "Decay",
                        key: "synthDecay",
                        value: $appState.state.synthDecay,
                        range: 0.01...8,
                        unit: "s",
                        icon: "arrow.down.right"
                    )

                    ParameterSlider(
                        label: "Sustain",
                        key: "synthSustain",
                        value: $appState.state.synthSustain,
                        range: 0...1,
                        icon: "arrow.right"
                    )

                    ParameterSlider(
                        label: "Release",
                        key: "synthRelease",
                        value: $appState.state.synthRelease,
                        range: 0.01...30,
                        unit: "s",
                        icon: "arrow.down.right.and.arrow.up.left"
                    )
                }

                // MARK: - Filter Section
                CollapsibleSection(title: "Filter", icon: "line.3.crossed.swirl.circle", expanded: $expandedSections) {
                    // Filter Type Picker
                    HStack {
                        Image(systemName: "waveform.path")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Type")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Type", selection: $appState.state.filterType) {
                            Text("Lowpass").tag("lowpass")
                            Text("Highpass").tag("highpass")
                            Text("Bandpass").tag("bandpass")
                            Text("Notch").tag("notch")
                        }
                        .pickerStyle(.menu)
                        .accentColor(.cyan)
                    }

                    // Filter Response Visualization
                    FilterResponseView(
                        filterType: appState.state.filterType,
                        cutoffMin: appState.state.filterCutoffMin,
                        cutoffMax: appState.state.filterCutoffMax,
                        resonance: appState.state.filterResonance,
                        q: appState.state.filterQ,
                        modSpeed: appState.state.filterModSpeed,
                        isRunning: appState.audioEngine.isRunning
                    )
                    .padding(.vertical, 4)

                    ParameterSlider(
                        label: "Cutoff Min",
                        key: "filterCutoffMin",
                        value: $appState.state.filterCutoffMin,
                        range: 40...8000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )

                    ParameterSlider(
                        label: "Cutoff Max",
                        key: "filterCutoffMax",
                        value: $appState.state.filterCutoffMax,
                        range: 40...8000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )

                    ParameterSlider(
                        label: "Mod Speed",
                        key: "filterModSpeed",
                        value: $appState.state.filterModSpeed,
                        range: 0...16,
                        icon: "waveform.path.ecg"
                    )

                    ParameterSlider(
                        label: "Resonance",
                        key: "filterResonance",
                        value: $appState.state.filterResonance,
                        range: 0...1,
                        icon: "waveform.badge.magnifyingglass"
                    )

                    ParameterSlider(
                        label: "Q",
                        key: "filterQ",
                        value: $appState.state.filterQ,
                        range: 0.1...12,
                        icon: "q.circle"
                    )
                }
                } // End Synth Tab (part 1)

                // MARK: - FX TAB
                if activeTab == .fx {
                // MARK: - Reverb Section
	                CollapsibleSection(title: "Reverb", icon: "waveform.path.ecg.rectangle", expanded: $expandedSections) {
                    // Reverb Enable toggle
                    HStack {
                        Image(systemName: appState.state.reverbEnabled ? "power.circle.fill" : "power.circle")
                            .foregroundColor(appState.state.reverbEnabled ? .green : .gray)
                            .frame(width: 20)
                        Text("Reverb")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Button(action: {
                            appState.state.reverbEnabled.toggle()
                        }) {
                            Text(appState.state.reverbEnabled ? "● Active" : "○ Bypassed (saves CPU)")
                                .font(.caption)
                                .fontWeight(.bold)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(
                                    appState.state.reverbEnabled
                                        ? LinearGradient(colors: [.green, .green.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                        : LinearGradient(colors: [.gray.opacity(0.3), .gray.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                )
                                .foregroundColor(appState.state.reverbEnabled ? .white : .gray)
                                .cornerRadius(6)
                        }
                    }
                    .padding(.bottom, 8)

                    // Reverb type picker
                    HStack {
                        Image(systemName: "waveform")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Type")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Type", selection: $appState.state.reverbType) {
                            Section(header: Text("Cross-Platform")) {
                                Text("Plate").tag("plate")
                                Text("Hall").tag("hall")
                                Text("Cathedral").tag("cathedral")
                                Text("Dark Hall").tag("darkHall")
                            }
                            Section(header: Text("iOS Only")) {
                                Text("Small Room").tag("smallRoom")
                                Text("Medium Room").tag("mediumRoom")
                                Text("Large Room").tag("largeRoom")
                                Text("Medium Hall").tag("mediumHall")
                                Text("Large Hall").tag("largeHall")
                                Text("Medium Chamber").tag("mediumChamber")
                                Text("Large Chamber").tag("largeChamber")
                            }
                        }
                        .pickerStyle(.menu)
                        .accentColor(.cyan)
                    }

                    if !isReverbTypeWebAppCompatible {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text("Native mode - normalize to Cathedral for web-compatible saves")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                        .padding(.vertical, 4)
                    }

                    // Quality mode picker
                    HStack {
                        Image(systemName: "sparkles")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Quality")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Quality", selection: $appState.state.reverbQuality) {
                            Text("Ultra").tag("ultra")
                            Text("Balanced").tag("balanced")
                            Text("Lite").tag("lite")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 180)
                    }

                    Text(reverbQualityDescription)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.5))
                        .frame(maxWidth: .infinity, alignment: .leading)

                    ParameterSlider(
                        label: "Decay",
                        key: "reverbDecay",
                        value: $appState.state.reverbDecay,
                        range: 0...1,
                        icon: "arrow.triangle.branch"
                    )

                    ParameterSlider(
                        label: "Size",
                        key: "reverbSize",
                        value: $appState.state.reverbSize,
                        range: 0.5...3.0,
                        icon: "square.resize"
                    )

                    ParameterSlider(
                        label: "Diffusion",
                        key: "reverbDiffusion",
                        value: $appState.state.reverbDiffusion,
                        range: 0...1,
                        icon: "circle.hexagongrid"
                    )

                    ParameterSlider(
                        label: "Modulation",
                        key: "reverbModulation",
                        value: $appState.state.reverbModulation,
                        range: 0...1,
                        icon: "waveform.circle"
                    )

                    ParameterSlider(
                        label: "Slow Mod Rate",
                        key: "reverbSlowModRate",
                        value: $appState.state.reverbSlowModRate,
                        range: 0.01...0.2,
                        icon: "speedometer"
                    )

                    ParameterSlider(
                        label: "Slow Mod Depth",
                        key: "reverbSlowModDepth",
                        value: $appState.state.reverbSlowModDepth,
                        range: 0...1,
                        icon: "waveform.path"
                    )

                    ParameterSlider(
                        label: "Chorus Rate",
                        key: "reverbChorusRate",
                        value: $appState.state.reverbChorusRate,
                        range: 0.05...2,
                        icon: "dot.radiowaves.left.and.right"
                    )

                    ParameterSlider(
                        label: "Chorus Depth",
                        key: "reverbChorusDepth",
                        value: $appState.state.reverbChorusDepth,
                        range: 0...40,
                        icon: "arrow.left.and.right"
                    )

                    ParameterSlider(
                        label: "Predelay",
                        key: "predelay",
                        value: $appState.state.predelay,
                        range: 0...100,
                        unit: "ms",
                        icon: "clock.arrow.circlepath"
                    )

                    ParameterSlider(
                        label: "Damping",
                        key: "damping",
                        value: $appState.state.damping,
                        range: 0...1,
                        icon: "line.3.horizontal.decrease"
                    )

                    ParameterSlider(
                        label: "Damp Low",
                        key: "reverbDampLow",
                        value: $appState.state.reverbDampLow,
                        range: 0...1,
                        icon: "line.3.horizontal.decrease.circle"
                    )

                    ParameterSlider(
                        label: "Damp High",
                        key: "reverbDampHigh",
                        value: $appState.state.reverbDampHigh,
                        range: 0...1,
                        icon: "line.3.horizontal.decrease"
                    )

                    ParameterSlider(
                        label: "Crossover",
                        key: "reverbCrossoverFreq",
                        value: $appState.state.reverbCrossoverFreq,
                        range: 200...4000,
                        unit: "Hz",
                        icon: "arrow.left.and.right"
                    )

                    ParameterSlider(
                        label: "Input Tone",
                        key: "reverbInputTone",
                        value: $appState.state.reverbInputTone,
                        range: -1...1,
                        icon: "dial.medium"
                    )

                    ParameterSlider(
                        label: "Width",
                        key: "width",
                        value: $appState.state.width,
                        range: 0...1,
                        icon: "arrow.left.and.right"
                    )

                    ParameterSlider(
                        label: "Cross Feed",
                        key: "reverbCrossFeed",
                        value: $appState.state.reverbCrossFeed,
                        range: 0...1,
                        icon: "arrow.left.arrow.right"
                    )

                    ParameterSlider(
                        label: "Shimmer",
                        key: "reverbShimmer",
                        value: $appState.state.reverbShimmer,
                        range: 0...1,
                        icon: "sparkles"
                    )

                    ParameterSlider(
                        label: "Shimmer Pitch",
                        key: "reverbShimmerPitch",
                        value: $appState.state.reverbShimmerPitch,
                        range: -24...24,
                        unit: "st",
                        icon: "arrow.up.arrow.down"
                    )

                    ParameterSlider(
                        label: "Shimmer Feedback",
                        key: "reverbShimmerFeedback",
                        value: $appState.state.reverbShimmerFeedback,
                        range: 0...1,
                        icon: "arrow.triangle.2.circlepath"
                    )

                    ParameterSlider(
                        label: "Warp",
                        key: "reverbWarp",
                        value: $appState.state.reverbWarp,
                        range: 0...1,
                        icon: "scribble.variable"
                    )

                    ParameterSlider(
                        label: "Early Reflections",
                        key: "reverbEarlyReflections",
                        value: $appState.state.reverbEarlyReflections,
                        range: 0...1,
                        icon: "scope"
                    )

                    ParameterSlider(
                        label: "Air Absorption",
                        key: "reverbAirAbsorption",
                        value: $appState.state.reverbAirAbsorption,
                        range: 0...1,
                        icon: "wind"
                    )

                    ParameterSlider(
                        label: "ER LPF",
                        key: "reverbErLpFreq",
                        value: $appState.state.reverbErLpFreq,
                        range: 200...12000,
                        unit: "Hz",
                        icon: "line.3.horizontal.decrease"
                    )

                    ParameterSlider(
                        label: "Reverse",
                        key: "reverbReverse",
                        value: $appState.state.reverbReverse,
                        range: 0...1,
                        icon: "backward"
                    )

                    ParameterSlider(
                        label: "Reverse Length",
                        key: "reverbReverseLength",
                        value: $appState.state.reverbReverseLength,
                        range: 0.1...12,
                        unit: "s",
                        icon: "timer"
                    )

                    HStack {
                        Image(systemName: "waveform.path")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Mod Shape")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Mod Shape", selection: $appState.state.reverbModCharacter) {
                            Text("Sine").tag("sine")
                            Text("Drift").tag("drift")
                            Text("Hybrid").tag("hybrid")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 210)
                    }

                    HStack {
                        Image(systemName: "bolt")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Saturation")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Saturation", selection: $appState.state.reverbSaturationMode) {
                            Text("Clean").tag("clean")
                            Text("Tape").tag("tape")
                            Text("Tube").tag("tube")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 190)
                    }

                    ParameterSlider(
                        label: "Transient Smooth",
                        key: "reverbTransientSmooth",
                        value: $appState.state.reverbTransientSmooth,
                        range: 0...1,
                        icon: "waveform.path.ecg"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Toggle("Spectral Freeze", isOn: $appState.state.spectralFreezeEnabled)
                        .foregroundColor(.white)
                    Toggle("Freeze Active", isOn: $appState.state.spectralFreezeActive)
                        .foregroundColor(.white)
                    Toggle("Slushy", isOn: $appState.state.spectralFreezeSlushy)
                        .foregroundColor(.white)

                    HStack {
                        Image(systemName: "arrow.triangle.branch")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Freeze Routing")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Freeze Routing", selection: $appState.state.spectralFreezeRouting) {
                            Text("Pre").tag("pre")
                            Text("Post").tag("post")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 140)
                    }

                    ParameterSlider(
                        label: "Freeze Speed",
                        key: "spectralFreezeSpeed",
                        value: $appState.state.spectralFreezeSpeed,
                        range: 0...1,
                        icon: "speedometer"
                    )

                    ParameterSlider(
                        label: "Freeze Mix",
                        key: "spectralFreezeMix",
                        value: $appState.state.spectralFreezeMix,
                        range: 0...1,
                        icon: "slider.horizontal.3"
                    )

                    ParameterSlider(
                        label: "Freeze Decay",
                        key: "spectralFreezeDecay",
                        value: $appState.state.spectralFreezeDecay,
                        range: 0...1,
                        icon: "snowflake"
                    )

                    ParameterSlider(
                        label: "Phase Jitter",
                        key: "spectralFreezePhaseJitter",
                        value: $appState.state.spectralFreezePhaseJitter,
                        range: 0...1,
                        icon: "shuffle"
                    )

                    ParameterSlider(
                        label: "Freeze Verb Xfade",
                        key: "spectralFreezeReverbCrossfade",
                        value: $appState.state.spectralFreezeReverbCrossfade,
                        range: 0...1,
                        icon: "circle.lefthalf.filled"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Send Levels")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    ParameterSlider(
                        label: "Synth Send",
                        key: "synthReverbSend",
                        value: $appState.state.synthReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    ParameterSlider(
                        label: "Granular Send",
                        key: "granularReverbSend",
                        value: $appState.state.granularReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    ParameterSlider(
                        label: "Lead Send",
                        key: "leadReverbSend",
                        value: $appState.state.leadReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    ParameterSlider(
                        label: "Lead 2 Send",
                        key: "lead2ReverbSend",
                        value: $appState.state.lead2ReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    ParameterSlider(
                        label: "Piano Send",
                        key: "pianoReverbSend",
                        value: $appState.state.pianoReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    ParameterSlider(
                        label: "Lead Delay Send",
                        key: "leadDelayReverbSend",
                        value: $appState.state.leadDelayReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
	                    )

                    ParameterSlider(
                        label: "Delay A Send",
                        key: "delayAReverbSend",
                        value: $appState.state.delayAReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    ParameterSlider(
                        label: "Nature Send",
                        key: "natureReverbSend",
                        value: $appState.state.natureReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )
	                }

	                // MARK: - Dynamics Character Section
	                CollapsibleSection(title: "Dynamics Character", icon: "dial.high", expanded: $expandedSections) {
	                    Toggle("Dynamics", isOn: $appState.state.dynamicsEnabled)
	                        .foregroundColor(.white)
	                    Toggle("Character", isOn: $appState.state.characterEnabled)
	                        .foregroundColor(.white)

	                    HStack {
	                        Image(systemName: "water.waves")
	                            .foregroundColor(.white.opacity(0.5))
	                            .frame(width: 20)
	                        Text("Mode")
	                            .foregroundColor(.white.opacity(0.8))
	                        Spacer()
	                        Picker("Mode", selection: $appState.state.characterMode) {
	                            Text("Clean").tag("clean")
	                            Text("Shallow").tag("shallowWater")
	                            Text("Abyss").tag("abyssWater")
	                        }
	                        .pickerStyle(.segmented)
	                        .frame(width: 220)
	                    }

	                    ParameterSlider(
	                        label: "Mix",
	                        key: "characterMix",
	                        value: $appState.state.characterMix,
	                        range: 0...1,
	                        icon: "circle.lefthalf.filled"
	                    )

	                    ParameterSlider(
	                        label: "Age",
	                        key: "characterAge",
	                        value: $appState.state.characterAge,
	                        range: 0...1,
	                        icon: "clock.arrow.circlepath"
	                    )

	                    ParameterSlider(
	                        label: "Depth",
	                        key: "characterDepth",
	                        value: $appState.state.characterDepth,
	                        range: 0...1,
	                        icon: "water.waves.and.arrow.down"
	                    )

	                    ParameterSlider(
	                        label: "Rate",
	                        key: "characterRate",
	                        value: $appState.state.characterRate,
	                        range: 0...1,
	                        icon: "speedometer"
	                    )

	                    ParameterSlider(
	                        label: "Damp",
	                        key: "characterDamp",
	                        value: $appState.state.characterDamp,
	                        range: 0...1,
	                        icon: "line.3.horizontal.decrease"
	                    )

	                    ParameterSlider(
	                        label: "Env Follow",
	                        key: "characterEnvFollow",
	                        value: $appState.state.characterEnvFollow,
	                        range: 0...1,
	                        icon: "waveform.path"
	                    )

                        ParameterSlider(
                            label: "HP",
                            key: "degradeHp",
                            value: $appState.state.degradeHp,
                            range: 0...1,
                            icon: "arrow.up.right"
                        )

                        ParameterSlider(
                            label: "LP",
                            key: "degradeLp",
                            value: $appState.state.degradeLp,
                            range: 0...1,
                            icon: "arrow.down.right"
                        )

	                    ParameterSlider(
	                        label: "Stereo",
	                        key: "characterStereo",
	                        value: $appState.state.characterStereo,
	                        range: 0...1,
	                        icon: "speaker.wave.2"
	                    )

	                    ParameterSlider(
	                        label: "Resonance",
	                        key: "characterResonance",
	                        value: $appState.state.characterResonance,
	                        range: 0...1,
	                        icon: "waveform.badge.magnifyingglass"
	                    )
	                }

                    // MARK: - Dynamics Saturation Section
                    CollapsibleSection(title: "Dynamics Saturation", icon: "bolt", expanded: $expandedSections) {
                        Toggle("Saturation FX", isOn: $appState.state.dynamicsSaturationEnabled)
                            .foregroundColor(.white)

                        HStack {
                            Image(systemName: "waveform.path")
                                .foregroundColor(.white.opacity(0.5))
                                .frame(width: 20)
                            Text("Mode")
                                .foregroundColor(.white.opacity(0.8))
                            Spacer()
                            Picker("Mode", selection: $appState.state.dynamicsSaturationMode) {
                                Text("Clean").tag("clean")
                                Text("Tape").tag("tape")
                                Text("Tube").tag("tube")
                                Text("Diode").tag("diode")
                                Text("Fold").tag("fold")
                            }
                            .pickerStyle(.menu)
                            .accentColor(.white)
                        }

                        ParameterSlider(
                            label: "Drive",
                            key: "dynamicsSaturationDrive",
                            value: $appState.state.dynamicsSaturationDrive,
                            range: 0...1,
                            icon: "bolt.fill"
                        )

                        ParameterSlider(
                            label: "Tone",
                            key: "dynamicsSaturationTone",
                            value: $appState.state.dynamicsSaturationTone,
                            range: 0...1,
                            icon: "dial.medium"
                        )

                        ParameterSlider(
                            label: "Bias",
                            key: "dynamicsSaturationBias",
                            value: $appState.state.dynamicsSaturationBias,
                            range: 0...1,
                            icon: "circle.lefthalf.filled"
                        )
                    }

	                // MARK: - Dynamics Degrade Section
	                CollapsibleSection(title: "Dynamics Degrade", icon: "waveform.path.ecg.rectangle", expanded: $expandedSections) {
	                    Toggle("Degrade", isOn: $appState.state.degradeEnabled)
	                        .foregroundColor(.white)

	                    ParameterSlider(
	                        label: "Mix",
	                        key: "degradeMix",
	                        value: $appState.state.degradeMix,
	                        range: 0...1,
	                        icon: "circle.lefthalf.filled"
	                    )

	                    ParameterSlider(
	                        label: "Age",
	                        key: "degradeAge",
	                        value: $appState.state.degradeAge,
	                        range: 0...1,
	                        icon: "clock.arrow.circlepath"
	                    )

	                    ParameterSlider(
	                        label: "Generation",
	                        key: "degradeGeneration",
	                        value: $appState.state.degradeGeneration,
	                        range: 0...1,
	                        icon: "square.stack.3d.down.right"
	                    )

	                    ParameterSlider(
	                        label: "Alias",
	                        key: "degradeAlias",
	                        value: $appState.state.degradeAlias,
	                        range: 0...1,
	                        icon: "waveform.path.badge.minus"
	                    )

	                    ParameterSlider(
	                        label: "Wow",
	                        key: "degradeWow",
	                        value: $appState.state.degradeWow,
	                        range: 0...1,
	                        icon: "waveform.path"
	                    )

	                    ParameterSlider(
	                        label: "Flutter",
	                        key: "degradeFlutter",
	                        value: $appState.state.degradeFlutter,
	                        range: 0...1,
	                        icon: "speedometer"
	                    )

                    ParameterSlider(
                        label: "Drift",
                        key: "degradeDrift",
                        value: $appState.state.degradeDrift,
                        range: 0...1,
                        icon: "arrow.triangle.2.circlepath"
                    )

                    ParameterSlider(
                        label: "Wobble Speed",
                        key: "degradeWobbleSpeed",
                        value: $appState.state.degradeWobbleSpeed,
                        range: 0...1,
                        icon: "metronome"
                    )

                    ParameterSlider(
                        label: "Tone",
	                        key: "degradeTone",
	                        value: $appState.state.degradeTone,
	                        range: 0...1,
	                        icon: "slider.horizontal.3"
	                    )

	                    ParameterSlider(
	                        label: "HP",
	                        key: "degradeHp",
	                        value: $appState.state.degradeHp,
	                        range: 0...1,
	                        icon: "arrow.up.right"
	                    )

	                    ParameterSlider(
	                        label: "LP",
	                        key: "degradeLp",
	                        value: $appState.state.degradeLp,
	                        range: 0...1,
	                        icon: "arrow.down.right"
	                    )

	                    ParameterSlider(
	                        label: "Noise",
	                        key: "degradeNoise",
	                        value: $appState.state.degradeNoise,
	                        range: 0...1,
	                        icon: "sparkles"
	                    )

	                    ParameterSlider(
	                        label: "Clip",
	                        key: "degradeSaturation",
	                        value: $appState.state.degradeSaturation,
	                        range: 0...1,
	                        icon: "waveform"
	                    )

	                    ParameterSlider(
	                        label: "Corrosion",
	                        key: "degradeCorrosion",
	                        value: $appState.state.degradeCorrosion,
	                        range: 0...1,
	                        icon: "bolt.trianglebadge.exclamationmark"
	                    )
	                }

	                // MARK: - Dynamics End Chain Section
	                CollapsibleSection(title: "End Chain Compression", icon: "waveform.path.ecg.rectangle", expanded: $expandedSections) {
	                    Toggle("End Chain", isOn: $appState.state.endCompEnabled)
	                        .foregroundColor(.white)

	                    ParameterSlider(
	                        label: "Threshold",
	                        key: "endCompThreshold",
	                        value: $appState.state.endCompThreshold,
	                        range: -48...0,
	                        unit: "dB",
	                        icon: "gauge"
	                    )

	                    ParameterSlider(
	                        label: "Knee",
	                        key: "endCompKnee",
	                        value: $appState.state.endCompKnee,
	                        range: 0...30,
	                        unit: "dB",
	                        icon: "slider.horizontal.3"
	                    )

	                    ParameterSlider(
	                        label: "Ratio",
	                        key: "endCompRatio",
	                        value: $appState.state.endCompRatio,
	                        range: 1...12,
	                        icon: "divide"
	                    )

	                    ParameterSlider(
	                        label: "Attack",
	                        key: "endCompAttackMs",
	                        value: $appState.state.endCompAttackMs,
	                        range: 0.1...80,
	                        unit: "ms",
	                        icon: "arrow.up.right",
	                        logarithmic: true
	                    )

	                    ParameterSlider(
	                        label: "Release",
	                        key: "endCompReleaseMs",
	                        value: $appState.state.endCompReleaseMs,
	                        range: 20...800,
	                        unit: "ms",
	                        icon: "arrow.down.right",
	                        logarithmic: true
	                    )

	                    ParameterSlider(
	                        label: "Makeup",
	                        key: "endCompMakeup",
	                        value: $appState.state.endCompMakeup,
	                        range: 0.05...4,
	                        icon: "speaker.plus"
	                    )

	                    ParameterSlider(
	                        label: "Mix",
	                        key: "endCompMix",
	                        value: $appState.state.endCompMix,
	                        range: 0...1,
	                        icon: "circle.lefthalf.filled"
	                    )

	                    ParameterSlider(
	                        label: "Detector HP",
	                        key: "endCompDetectorHp",
	                        value: $appState.state.endCompDetectorHp,
	                        range: 0...1,
	                        icon: "line.diagonal"
	                    )

	                    ParameterSlider(
	                        label: "Detector Tilt",
	                        key: "endCompDetectorTilt",
	                        value: $appState.state.endCompDetectorTilt,
	                        range: 0...1,
	                        icon: "line.3.horizontal.decrease"
	                    )

	                    ParameterSlider(
	                        label: "Auto Makeup",
	                        key: "endCompAutoMakeup",
	                        value: $appState.state.endCompAutoMakeup,
	                        range: 0...1,
	                        icon: "wand.and.stars"
	                    )

	                    ParameterSlider(
	                        label: "Program Release",
	                        key: "endCompProgramRelease",
	                        value: $appState.state.endCompProgramRelease,
	                        range: 0...1,
	                        icon: "waveform.path.ecg"
	                    )
	                }

	                // MARK: - Granular Section
                CollapsibleSection(title: "Granular", icon: "sparkles", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.granularEnabled)
                        .foregroundColor(.white)
                    Toggle("Freeze Buffer", isOn: $appState.state.granularFreeze)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Max Grains",
                        key: "maxGrains",
                        value: $appState.state.maxGrains,
                        range: 0...128,
                        icon: "square.grid.3x3.fill"
                    )

                    ParameterSlider(
                        label: "Probability",
                        key: "grainProbability",
                        value: $appState.state.grainProbability,
                        range: 0...1,
                        icon: "percent"
                    )

                    ParameterSlider(
                        label: "Density",
                        key: "density",
                        value: $appState.state.density,
                        range: 5...80,
                        unit: "/s",
                        icon: "square.grid.3x3"
                    )

                    ParameterSlider(
                        label: "Size Min",
                        key: "grainSizeMin",
                        value: $appState.state.grainSizeMin,
                        range: 5...60,
                        unit: "ms",
                        icon: "circle.dotted"
                    )

                    ParameterSlider(
                        label: "Size Max",
                        key: "grainSizeMax",
                        value: $appState.state.grainSizeMax,
                        range: 20...200,
                        unit: "ms",
                        icon: "circle"
                    )

                    ParameterSlider(
                        label: "Spray",
                        key: "spray",
                        value: $appState.state.spray,
                        range: 0...600,
                        unit: "ms",
                        icon: "shower"
                    )

                    ParameterSlider(
                        label: "Jitter",
                        key: "jitter",
                        value: $appState.state.jitter,
                        range: 0...30,
                        unit: "ms",
                        icon: "waveform.path.badge.minus"
                    )

                    // Pitch Mode
                    HStack {
                        Image(systemName: "music.quarternote.3")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Pitch Mode")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Mode", selection: $appState.state.grainPitchMode) {
                            Text("Harmonic").tag("harmonic")
                            Text("Random").tag("random")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 160)
                    }

                    ParameterSlider(
                        label: "Pitch Spread",
                        key: "pitchSpread",
                        value: $appState.state.pitchSpread,
                        range: 0...12,
                        unit: "st",
                        icon: "arrow.up.and.down"
                    )

                    ParameterSlider(
                        label: "Stereo Spread",
                        key: "stereoSpread",
                        value: $appState.state.stereoSpread,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )

                    ParameterSlider(
                        label: "Feedback",
                        key: "feedback",
                        value: $appState.state.feedback,
                        range: 0...0.35,
                        icon: "arrow.triangle.2.circlepath"
                    )

                    ParameterSlider(
                        label: "Feedback LPF",
                        key: "granularFeedbackLPF",
                        value: $appState.state.granularFeedbackLPF,
                        range: 200...20000,
                        unit: "Hz",
                        icon: "line.3.horizontal.decrease"
                    )

                    ParameterSlider(
                        label: "Buffer",
                        key: "granularBufferSeconds",
                        value: $appState.state.granularBufferSeconds,
                        range: 1...16,
                        unit: "s",
                        icon: "externaldrive"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Wet Filters")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    ParameterSlider(
                        label: "HPF",
                        key: "wetHPF",
                        value: $appState.state.wetHPF,
                        range: 200...3000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )

                    ParameterSlider(
                        label: "LPF",
                        key: "wetLPF",
                        value: $appState.state.wetLPF,
                        range: 3000...12000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                }
                } // End FX Tab (part 1)

                // MARK: - SYNTH TAB (continued)
                if activeTab == .synth {
                // MARK: - Lead Synth Section
                CollapsibleSection(title: "Lead Synth", icon: "music.note", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.leadEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Density",
                        key: "leadDensity",
                        value: $appState.state.leadDensity,
                        range: 0.1...12,
                        unit: "/phrase",
                        icon: "square.grid.2x2"
                    )

                    // Octave
                    HStack {
                        Image(systemName: "arrow.up.arrow.down")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Octave")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Octave", selection: $appState.state.leadOctave) {
                            Text("-1").tag(-1)
                            Text("0").tag(0)
                            Text("+1").tag(1)
                            Text("+2").tag(2)
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 160)
                    }

                    ParameterSlider(
                        label: "Octave Range",
                        key: "leadOctaveRange",
                        value: Binding(
                            get: { Double(appState.state.leadOctaveRange) },
                            set: { appState.state.leadOctaveRange = Int($0) }
                        ),
                        range: 1...4,
                        icon: "arrow.up.and.down.circle"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Envelope")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    // ADSHR Visualization (matching webapp's SVG envelope)
                    ADSRVisualization(
                        attack: appState.state.leadAttack,
                        decay: appState.state.leadDecay,
                        sustain: appState.state.leadSustain,
                        hold: appState.state.leadHold,
                        release: appState.state.leadRelease
                    )
                    .frame(height: 60)
                    .padding(.bottom, 4)

                    ParameterSlider(
                        label: "Attack",
                        key: "leadAttack",
                        value: $appState.state.leadAttack,
                        range: 0.001...2,
                        unit: "s",
                        icon: "arrow.up.right"
                    )

                    ParameterSlider(
                        label: "Decay",
                        key: "leadDecay",
                        value: $appState.state.leadDecay,
                        range: 0.01...4,
                        unit: "s",
                        icon: "arrow.down.right"
                    )

                    ParameterSlider(
                        label: "Sustain",
                        key: "leadSustain",
                        value: $appState.state.leadSustain,
                        range: 0...1,
                        icon: "arrow.right"
                    )

                    ParameterSlider(
                        label: "Hold",
                        key: "leadHold",
                        value: $appState.state.leadHold,
                        range: 0...4,
                        unit: "s",
                        icon: "pause.circle"
                    )

                    ParameterSlider(
                        label: "Release",
                        key: "leadRelease",
                        value: $appState.state.leadRelease,
                        range: 0.01...8,
                        unit: "s",
                        icon: "arrow.down.right.and.arrow.up.left"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Timbre")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    // Timbre Range Visualization (Rhodes → Gamelan gradient)
                    TimbreRangeView(
                        timbreMin: appState.state.leadTimbreMin,
                        timbreMax: appState.state.leadTimbreMax
                    )
                    .padding(.vertical, 4)

                    ParameterSlider(
                        label: "Timbre Min",
                        key: "leadTimbreMin",
                        value: $appState.state.leadTimbreMin,
                        range: 0...1,
                        icon: "slider.horizontal.below.rectangle"
                    )

                    ParameterSlider(
                        label: "Timbre Max",
                        key: "leadTimbreMax",
                        value: $appState.state.leadTimbreMax,
                        range: 0...1,
                        icon: "slider.horizontal.below.rectangle"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Expression")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    DualRangeSlider(
                        label: "Vibrato Depth",
                        minValue: $appState.state.leadVibratoDepthMin,
                        maxValue: $appState.state.leadVibratoDepthMax,
                        range: 0...1,
                        icon: "waveform.path",
                        color: .orange
                    )

                    DualRangeSlider(
                        label: "Vibrato Rate",
                        minValue: $appState.state.leadVibratoRateMin,
                        maxValue: $appState.state.leadVibratoRateMax,
                        range: 0...1,
                        icon: "metronome",
                        color: .orange
                    )

                    DualRangeSlider(
                        label: "Glide",
                        minValue: $appState.state.leadGlideMin,
                        maxValue: $appState.state.leadGlideMax,
                        range: 0...1,
                        icon: "point.topleft.down.curvedto.point.bottomright.up",
                        color: .orange
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Delay")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    DualRangeSlider(
                        label: "Time",
                        minValue: $appState.state.leadDelayTimeMin,
                        maxValue: $appState.state.leadDelayTimeMax,
                        range: 0...1000,
                        unit: "ms",
                        icon: "clock",
                        color: .purple
                    )

                    DualRangeSlider(
                        label: "Feedback",
                        minValue: $appState.state.leadDelayFeedbackMin,
                        maxValue: $appState.state.leadDelayFeedbackMax,
                        range: 0...0.8,
                        icon: "arrow.triangle.2.circlepath",
                        color: .purple
                    )

                    DualRangeSlider(
                        label: "Mix",
                        minValue: $appState.state.leadDelayMixMin,
                        maxValue: $appState.state.leadDelayMixMax,
                        range: 0...1,
                        icon: "slider.horizontal.3",
                        color: .purple
                    )
                }

                CollapsibleSection(title: "Lead 2 & Piano", icon: "pianokeys", expanded: $expandedSections) {
                    Toggle("Lead 2 Enabled", isOn: $appState.state.lead2Enabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Lead 2 Morph",
                        key: "lead2Morph",
                        value: $appState.state.lead2Morph,
                        range: 0...1,
                        icon: "arrow.left.and.right"
                    )

                    ParameterSlider(
                        label: "Lead 2 Density",
                        key: "lead2Density",
                        value: $appState.state.lead2Density,
                        range: 0.1...12,
                        unit: "/phrase",
                        icon: "square.grid.2x2"
                    )

                    ParameterSlider(
                        label: "Lead 2 Attack",
                        key: "lead2Attack",
                        value: $appState.state.lead2Attack,
                        range: 0.001...2,
                        unit: "s",
                        icon: "arrow.up.right"
                    )

                    ParameterSlider(
                        label: "Lead 2 Release",
                        key: "lead2Release",
                        value: $appState.state.lead2Release,
                        range: 0.01...8,
                        unit: "s",
                        icon: "arrow.down.right.and.arrow.up.left"
                    )

                    Toggle("Piano Enabled", isOn: $appState.state.pianoEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Piano Attack",
                        key: "pianoAttack",
                        value: $appState.state.pianoAttack,
                        range: 0.001...2,
                        unit: "s",
                        icon: "arrow.up.right"
                    )

                    ParameterSlider(
                        label: "Piano Release",
                        key: "pianoRelease",
                        value: $appState.state.pianoRelease,
                        range: 0.01...8,
                        unit: "s",
                        icon: "arrow.down.right.and.arrow.up.left"
                    )

                    ParameterSlider(
                        label: "Piano LPF",
                        key: "pianoPostLPF",
                        value: $appState.state.pianoPostLPF,
                        range: 40...18000,
                        unit: "Hz",
                        icon: "line.diagonal",
                        logarithmic: true
                    )
                }

                CollapsibleSection(title: "Shared Delay", icon: "arrow.triangle.2.circlepath", expanded: $expandedSections) {
                    Toggle("Delay A", isOn: $appState.state.delayAEnabled)
                        .foregroundColor(.white)

                    Toggle("Delay A Ping-Pong", isOn: $appState.state.delayAPingPong)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Delay A Time",
                        key: "delayATime",
                        value: $appState.state.delayATime,
                        range: 1...2000,
                        unit: "ms",
                        icon: "clock"
                    )

                    ParameterSlider(
                        label: "Delay A Feedback",
                        key: "delayAFeedback",
                        value: $appState.state.delayAFeedback,
                        range: 0...0.95,
                        icon: "arrow.triangle.2.circlepath"
                    )

                    ParameterSlider(
                        label: "Delay A Mix",
                        key: "delayAMix",
                        value: $appState.state.delayAMix,
                        range: 0...1,
                        icon: "slider.horizontal.3"
                    )

                    ParameterSlider(
                        label: "Delay A Spread",
                        key: "delayASpread",
                        value: $appState.state.delayASpread,
                        range: 0...4,
                        icon: "arrow.left.and.right"
                    )

                    ParameterSlider(
                        label: "Delay A Width",
                        key: "delayAWidth",
                        value: $appState.state.delayAWidth,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )

                    ParameterSlider(
                        label: "Delay A Filter",
                        key: "delayAFilter",
                        value: $appState.state.delayAFilter,
                        range: 80...20000,
                        unit: "Hz",
                        icon: "line.diagonal",
                        logarithmic: true
                    )

                    HStack {
                        Image(systemName: "line.3.horizontal.decrease")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Delay A Filter Type")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Delay A Filter Type", selection: $appState.state.delayAFilterType) {
                            Text("Lowpass").tag("lowpass")
                            Text("Highpass").tag("highpass")
                            Text("Bandpass").tag("bandpass")
                        }
                        .pickerStyle(.menu)
                        .accentColor(.cyan)
                    }

                    ParameterSlider(
                        label: "Delay A Send",
                        key: "delayASend",
                        value: $appState.state.delayASend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    ParameterSlider(
                        label: "Delay A to B",
                        key: "delayAToBSend",
                        value: $appState.state.delayAToBSend,
                        range: 0...1,
                        icon: "arrow.turn.down.right"
                    )

                    ParameterSlider(
                        label: "Delay A Mod Rate",
                        key: "delayAModRate",
                        value: $appState.state.delayAModRate,
                        range: 0...10,
                        unit: "Hz",
                        icon: "waveform.path"
                    )

                    ParameterSlider(
                        label: "Delay A Mod Depth",
                        key: "delayAModDepth",
                        value: $appState.state.delayAModDepth,
                        range: 0...1,
                        icon: "waveform.path.ecg"
                    )

                    ParameterSlider(
                        label: "Delay A Duck",
                        key: "delayADuck",
                        value: $appState.state.delayADuck,
                        range: 0...1,
                        icon: "arrow.down.to.line"
                    )

                    ParameterSlider(
                        label: "Delay A Cross Filter",
                        key: "delayACrossFeedFilter",
                        value: $appState.state.delayACrossFeedFilter,
                        range: 0...1,
                        icon: "line.diagonal"
                    )

                    Toggle("Granular Delay B", isOn: $appState.state.granularDelayEnabled)
                        .foregroundColor(.white)

                    HStack {
                        Image(systemName: "point.3.connected.trianglepath.dotted")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Delay B Pattern")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Delay B Pattern", selection: $appState.state.delayBPattern) {
                            Text("Cascade").tag("cascade")
                            Text("Scatter").tag("scatter")
                            Text("Bloom").tag("bloom")
                        }
                        .pickerStyle(.menu)
                        .accentColor(.cyan)
                    }

                    HStack {
                        Image(systemName: "scribble.variable")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Delay B Warp")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Delay B Warp", selection: $appState.state.delayBWarp) {
                            Text("Clean").tag("clean")
                            Text("Tape").tag("tape")
                            Text("Diffuse").tag("diffuse")
                            Text("Pitch").tag("pitch")
                        }
                        .pickerStyle(.menu)
                        .accentColor(.cyan)
                    }

                    ParameterSlider(
                        label: "Delay B Warp",
                        key: "delayBWarpIntensity",
                        value: $appState.state.delayBWarpIntensity,
                        range: 0...1,
                        icon: "scribble.variable"
                    )

                    ParameterSlider(
                        label: "Delay B Spread",
                        key: "delayBSpread",
                        value: $appState.state.delayBSpread,
                        range: 0...1,
                        icon: "arrow.left.and.right"
                    )

                    ParameterSlider(
                        label: "Delay B to A",
                        key: "delayBToASend",
                        value: $appState.state.delayBToASend,
                        range: 0...1,
                        icon: "arrow.turn.up.left"
                    )

                    ParameterSlider(
                        label: "Delay A Granular",
                        key: "delayAGranularSend",
                        value: $appState.state.delayAGranularSend,
                        range: 0...1,
                        icon: "sparkles"
                    )

                    ParameterSlider(
                        label: "Delay B Granular",
                        key: "delayBGranularSend",
                        value: $appState.state.delayBGranularSend,
                        range: 0...1,
                        icon: "sparkles"
                    )

                    ParameterSlider(
                        label: "Granular Delay A",
                        key: "granularDelayASend",
                        value: $appState.state.granularDelayASend,
                        range: 0...1,
                        icon: "repeat"
                    )

                    ParameterSlider(
                        label: "Granular Delay B",
                        key: "granularDelayBSend",
                        value: $appState.state.granularDelayBSend,
                        range: 0...1,
                        icon: "repeat.circle"
                    )

                    ParameterSlider(
                        label: "Delay B Activity",
                        key: "granularDelayActivity",
                        value: $appState.state.granularDelayActivity,
                        range: 0...1,
                        icon: "speedometer"
                    )

                    ParameterSlider(
                        label: "Delay B Repeats",
                        key: "granularDelayRepeats",
                        value: $appState.state.granularDelayRepeats,
                        range: 0...0.95,
                        icon: "repeat"
                    )

                    ParameterSlider(
                        label: "Delay B Filter",
                        key: "granularDelayFilter",
                        value: $appState.state.granularDelayFilter,
                        range: 0...1,
                        icon: "line.diagonal"
                    )

                    ParameterSlider(
                        label: "Delay B Vibrato",
                        key: "granularDelayVibrato",
                        value: $appState.state.granularDelayVibrato,
                        range: 0...1,
                        icon: "waveform.path"
                    )

                    ParameterSlider(
                        label: "Delay B Mix",
                        key: "granularDelayMix",
                        value: $appState.state.granularDelayMix,
                        range: 0...1,
                        icon: "slider.horizontal.3"
                    )

                    ParameterSlider(
                        label: "Delay B Verb Send",
                        key: "granularDelayReverbSend",
                        value: $appState.state.granularDelayReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Source Delay Sends")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    DelaySendPairControl(
                        label: "Pad 1",
                        delayAKey: "pad1DelayASend",
                        delayBKey: "pad1DelayBSend",
                        delayASend: $appState.state.pad1DelayASend,
                        delayBSend: $appState.state.pad1DelayBSend
                    )

                    DelaySendPairControl(
                        label: "Pad 2",
                        delayAKey: "pad2DelayASend",
                        delayBKey: "pad2DelayBSend",
                        delayASend: $appState.state.pad2DelayASend,
                        delayBSend: $appState.state.pad2DelayBSend
                    )

                    DelaySendPairControl(
                        label: "Lead 1",
                        delayAKey: "lead1DelayASend",
                        delayBKey: "lead1DelayBSend",
                        delayASend: $appState.state.lead1DelayASend,
                        delayBSend: $appState.state.lead1DelayBSend
                    )

                    DelaySendPairControl(
                        label: "Lead 2",
                        delayAKey: "lead2DelayASend",
                        delayBKey: "lead2DelayBSend",
                        delayASend: $appState.state.lead2DelayASend,
                        delayBSend: $appState.state.lead2DelayBSend
                    )

                    DelaySendPairControl(
                        label: "Piano",
                        delayAKey: "pianoDelayASend",
                        delayBKey: "pianoDelayBSend",
                        delayASend: $appState.state.pianoDelayASend,
                        delayBSend: $appState.state.pianoDelayBSend
                    )

                    DelaySendPairControl(
                        label: "Drums",
                        delayAKey: "drumDelayASend",
                        delayBKey: "drumDelayBSend",
                        delayASend: $appState.state.drumDelayASend,
                        delayBSend: $appState.state.drumDelayBSend
                    )

                    DelaySendPairControl(
                        label: "Ocean",
                        delayAKey: "oceanDelayASend",
                        delayBKey: "oceanDelayBSend",
                        delayASend: $appState.state.oceanDelayASend,
                        delayBSend: $appState.state.oceanDelayBSend
                    )

                    DelaySendPairControl(
                        label: "Nature",
                        delayAKey: "natureDelayASend",
                        delayBKey: "natureDelayBSend",
                        delayASend: $appState.state.natureDelayASend,
                        delayBSend: $appState.state.natureDelayBSend
                    )

                    DelaySendPairControl(
                        label: "Water",
                        delayAKey: "waterDelayASend",
                        delayBKey: "waterDelayBSend",
                        delayASend: $appState.state.waterDelayASend,
                        delayBSend: $appState.state.waterDelayBSend
                    )

                    DelaySendPairControl(
                        label: "Birds",
                        delayAKey: "birdsDelayASend",
                        delayBKey: "birdsDelayBSend",
                        delayASend: $appState.state.birdsDelayASend,
                        delayBSend: $appState.state.birdsDelayBSend
                    )

                    DelaySendPairControl(
                        label: "Birds 2",
                        delayAKey: "birds2DelayASend",
                        delayBKey: "birds2DelayBSend",
                        delayASend: $appState.state.birds2DelayASend,
                        delayBSend: $appState.state.birds2DelayBSend
                    )

                    DelaySendPairControl(
                        label: "Frogs",
                        delayAKey: "frogsDelayASend",
                        delayBKey: "frogsDelayBSend",
                        delayASend: $appState.state.frogsDelayASend,
                        delayBSend: $appState.state.frogsDelayBSend
                    )

                    DelaySendPairControl(
                        label: "Insects",
                        delayAKey: "insDelayASend",
                        delayBKey: "insDelayBSend",
                        delayASend: $appState.state.insDelayASend,
                        delayBSend: $appState.state.insDelayBSend
                    )
                }

                // MARK: - Euclidean Sequencer Section
                CollapsibleSection(title: "Euclidean Sequencer", icon: "circle.hexagongrid.fill", expanded: $expandedSections) {
                    Toggle("Master Enable", isOn: $appState.state.synthEuclideanMasterEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Tempo",
                        key: "synthEuclideanTempo",
                        value: $appState.state.synthEuclideanTempo,
                        range: 0.25...12,
                        unit: "x",
                        icon: "metronome"
                    )

                    // Lane 1
                    EuclideanLaneView(
                        laneNumber: 1,
                        enabled: $appState.state.synthEuclid1Enabled,
                        preset: $appState.state.synthEuclid1Preset,
                        steps: $appState.state.synthEuclid1Steps,
                        hits: $appState.state.synthEuclid1Hits,
                        rotation: $appState.state.synthEuclid1Rotation,
                        noteMin: $appState.state.synthEuclid1NoteMin,
                        noteMax: $appState.state.synthEuclid1NoteMax,
                        level: $appState.state.synthEuclid1Level,
                        probability: $appState.state.synthEuclid1Probability,
                        source: $appState.state.synthEuclid1Source
                    )

                    // Lane 2
                    EuclideanLaneView(
                        laneNumber: 2,
                        enabled: $appState.state.synthEuclid2Enabled,
                        preset: $appState.state.synthEuclid2Preset,
                        steps: $appState.state.synthEuclid2Steps,
                        hits: $appState.state.synthEuclid2Hits,
                        rotation: $appState.state.synthEuclid2Rotation,
                        noteMin: $appState.state.synthEuclid2NoteMin,
                        noteMax: $appState.state.synthEuclid2NoteMax,
                        level: $appState.state.synthEuclid2Level,
                        probability: $appState.state.synthEuclid2Probability,
                        source: $appState.state.synthEuclid2Source
                    )

                    // Lane 3
                    EuclideanLaneView(
                        laneNumber: 3,
                        enabled: $appState.state.synthEuclid3Enabled,
                        preset: $appState.state.synthEuclid3Preset,
                        steps: $appState.state.synthEuclid3Steps,
                        hits: $appState.state.synthEuclid3Hits,
                        rotation: $appState.state.synthEuclid3Rotation,
                        noteMin: $appState.state.synthEuclid3NoteMin,
                        noteMax: $appState.state.synthEuclid3NoteMax,
                        level: $appState.state.synthEuclid3Level,
                        probability: $appState.state.synthEuclid3Probability,
                        source: $appState.state.synthEuclid3Source
                    )

                    // Lane 4
                    EuclideanLaneView(
                        laneNumber: 4,
                        enabled: $appState.state.synthEuclid4Enabled,
                        preset: $appState.state.synthEuclid4Preset,
                        steps: $appState.state.synthEuclid4Steps,
                        hits: $appState.state.synthEuclid4Hits,
                        rotation: $appState.state.synthEuclid4Rotation,
                        noteMin: $appState.state.synthEuclid4NoteMin,
                        noteMax: $appState.state.synthEuclid4NoteMax,
                        level: $appState.state.synthEuclid4Level,
                        probability: $appState.state.synthEuclid4Probability,
                        source: $appState.state.synthEuclid4Source
                    )
                }
                } // End Synth Tab (part 2)

                // MARK: - FX TAB (continued)
                if activeTab == .fx {
                // MARK: - Ocean Section
                CollapsibleSection(title: "Ocean", icon: "water.waves", expanded: $expandedSections) {
                    Toggle("Sample Enabled", isOn: $appState.state.oceanSampleEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Sample Level",
                        key: "oceanSampleLevel",
                        value: $appState.state.oceanSampleLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )

                    Toggle("Wave Synth Enabled", isOn: $appState.state.oceanWaveSynthEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Synth Level",
                        key: "oceanWaveSynthLevel",
                        value: $appState.state.oceanWaveSynthLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )

                    ParameterSlider(
                        label: "Reverb Send",
                        key: "oceanReverbSend",
                        value: $appState.state.oceanReverbSend,
                        range: 0...1,
                        icon: "dot.radiowaves.left.and.right"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Filter")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    HStack {
                        Image(systemName: "waveform.path")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Type")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Type", selection: $appState.state.oceanFilterType) {
                            Text("Lowpass").tag("lowpass")
                            Text("Highpass").tag("highpass")
                            Text("Bandpass").tag("bandpass")
                            Text("Notch").tag("notch")
                        }
                        .pickerStyle(.menu)
                        .accentColor(.cyan)
                    }

                    ParameterSlider(
                        label: "Cutoff",
                        key: "oceanFilterCutoff",
                        value: $appState.state.oceanFilterCutoff,
                        range: 40...12000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )

                    ParameterSlider(
                        label: "Resonance",
                        key: "oceanFilterResonance",
                        value: $appState.state.oceanFilterResonance,
                        range: 0...1,
                        icon: "waveform.badge.magnifyingglass"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Timing")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    DualRangeSlider(
                        label: "Duration",
                        minValue: $appState.state.oceanDurationMin,
                        maxValue: $appState.state.oceanDurationMax,
                        range: 2...15,
                        unit: "s",
                        icon: "clock",
                        color: .blue
                    )

                    DualRangeSlider(
                        label: "Interval",
                        minValue: $appState.state.oceanIntervalMin,
                        maxValue: $appState.state.oceanIntervalMax,
                        range: 3...20,
                        unit: "s",
                        icon: "timer",
                        color: .blue
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Character")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    DualRangeSlider(
                        label: "Foam",
                        minValue: $appState.state.oceanFoamMin,
                        maxValue: $appState.state.oceanFoamMax,
                        range: 0...1,
                        icon: "bubble.left.and.bubble.right",
                        color: .blue
                    )

                    DualRangeSlider(
                        label: "Depth",
                        minValue: $appState.state.oceanDepthMin,
                        maxValue: $appState.state.oceanDepthMax,
                        range: 0...1,
                        icon: "arrow.down.to.line",
                        color: .blue
                    )
                }

                CollapsibleSection(title: "Earth Textures", icon: "leaf", expanded: $expandedSections) {
                    Toggle("Birds", isOn: $appState.state.birdsEnabled)
                        .foregroundColor(.white)
                    Toggle("Birds 2", isOn: $appState.state.birds2Enabled)
                        .foregroundColor(.white)
                    Toggle("Frogs", isOn: $appState.state.frogsEnabled)
                        .foregroundColor(.white)
                    Toggle("Water", isOn: $appState.state.waterEnabled)
                        .foregroundColor(.white)
                    Toggle("Insects", isOn: $appState.state.insectsEnabled)
                        .foregroundColor(.white)
                    Toggle("Insects 2", isOn: $appState.state.insects2Enabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Nature Level",
                        key: "natureLevel",
                        value: $appState.state.natureLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )

                    ParameterSlider(
                        label: "Earth Bus",
                        key: "earthLevel",
                        value: $appState.state.earthLevel,
                        range: 0...1,
                        icon: "globe"
                    )

                    ParameterSlider(
                        label: "Birds Level",
                        key: "birdsLevel",
                        value: $appState.state.birdsLevel,
                        range: 0...1,
                        icon: "bird"
                    )

                    ParameterSlider(
                        label: "Birds Slice",
                        key: "birdsSliceDuration",
                        value: $appState.state.birdsSliceDuration,
                        range: 2...60,
                        unit: "s",
                        icon: "timer"
                    )

                    ParameterSlider(
                        label: "Birds Density",
                        key: "birdsSliceDensity",
                        value: $appState.state.birdsSliceDensity,
                        range: 0...1,
                        icon: "square.grid.3x3"
                    )

                    ParameterSlider(
                        label: "Birds 2 Level",
                        key: "birds2Level",
                        value: $appState.state.birds2Level,
                        range: 0...1,
                        icon: "bird.fill"
                    )

                    ParameterSlider(
                        label: "Birds 2 Slice",
                        key: "birds2SliceDuration",
                        value: $appState.state.birds2SliceDuration,
                        range: 2...60,
                        unit: "s",
                        icon: "timer"
                    )

                    ParameterSlider(
                        label: "Birds 2 Density",
                        key: "birds2SliceDensity",
                        value: $appState.state.birds2SliceDensity,
                        range: 0...1,
                        icon: "square.grid.3x3"
                    )

                    ParameterSlider(
                        label: "Frogs Level",
                        key: "frogsLevel",
                        value: $appState.state.frogsLevel,
                        range: 0...1,
                        icon: "speaker.wave.1"
                    )

                    ParameterSlider(
                        label: "Frogs Slice",
                        key: "frogsSliceDuration",
                        value: $appState.state.frogsSliceDuration,
                        range: 2...60,
                        unit: "s",
                        icon: "timer"
                    )

                    ParameterSlider(
                        label: "Frogs Density",
                        key: "frogsSliceDensity",
                        value: $appState.state.frogsSliceDensity,
                        range: 0...1,
                        icon: "square.grid.3x3"
                    )

                    ParameterSlider(
                        label: "Water Level",
                        key: "waterLevel",
                        value: $appState.state.waterLevel,
                        range: 0...1,
                        icon: "water.waves"
                    )

                    ParameterSlider(
                        label: "Water Intensity",
                        key: "waterIntensity",
                        value: $appState.state.waterIntensity,
                        range: 0...1,
                        icon: "drop"
                    )

                    ParameterSlider(
                        label: "Hard Drops",
                        key: "waterLayerHardDrops",
                        value: $appState.state.waterLayerHardDrops,
                        range: 0...1,
                        icon: "drop.triangle"
                    )

                    ParameterSlider(
                        label: "Hard Drop Rate",
                        key: "waterHardDropRate",
                        value: $appState.state.waterHardDropRate,
                        range: 0...2,
                        icon: "metronome"
                    )

                    ParameterSlider(
                        label: "Hard Drop LPF",
                        key: "waterHardDropLPF",
                        value: $appState.state.waterHardDropLPF,
                        range: 50...16_000,
                        unit: "Hz",
                        icon: "line.3.horizontal.decrease",
                        logarithmic: true
                    )

                    ParameterSlider(
                        label: "Water Drops",
                        key: "waterLayerWaterDrops",
                        value: $appState.state.waterLayerWaterDrops,
                        range: 0...1,
                        icon: "drop.fill"
                    )

                    ParameterSlider(
                        label: "Water Drop Rate",
                        key: "waterWaterDropRate",
                        value: $appState.state.waterWaterDropRate,
                        range: 0...2,
                        icon: "metronome"
                    )

                    ParameterSlider(
                        label: "Water Drop LPF",
                        key: "waterWaterDropLPF",
                        value: $appState.state.waterWaterDropLPF,
                        range: 50...16_000,
                        unit: "Hz",
                        icon: "line.3.horizontal.decrease",
                        logarithmic: true
                    )

                    ParameterSlider(
                        label: "Turbulence",
                        key: "waterLayerTurbulence",
                        value: $appState.state.waterLayerTurbulence,
                        range: 0...1,
                        icon: "tornado"
                    )

                    ParameterSlider(
                        label: "Bubbles",
                        key: "waterLayerBubbling",
                        value: $appState.state.waterLayerBubbling,
                        range: 0...1,
                        icon: "bubble.left.and.bubble.right"
                    )

                    ParameterSlider(
                        label: "Bubble Rate",
                        key: "waterBubblingRate",
                        value: $appState.state.waterBubblingRate,
                        range: 0...2,
                        icon: "metronome"
                    )

                    ParameterSlider(
                        label: "Bubble LPF",
                        key: "waterBubblingLPF",
                        value: $appState.state.waterBubblingLPF,
                        range: 50...8_000,
                        unit: "Hz",
                        icon: "line.3.horizontal.decrease",
                        logarithmic: true
                    )

                    ParameterSlider(
                        label: "Surf",
                        key: "waterLayerSurf",
                        value: $appState.state.waterLayerSurf,
                        range: 0...1,
                        icon: "water.waves"
                    )

                    ParameterSlider(
                        label: "Surf Foam",
                        key: "waterSurfFoam",
                        value: $appState.state.waterSurfFoam,
                        range: 0...1,
                        icon: "cloud"
                    )

                    ParameterSlider(
                        label: "Foam Bright",
                        key: "waterSurfFoamBright",
                        value: $appState.state.waterSurfFoamBright,
                        range: 0...1,
                        icon: "sparkle"
                    )

                    ParameterSlider(
                        label: "Surf Depth",
                        key: "waterSurfDepth",
                        value: $appState.state.waterSurfDepth,
                        range: 0...1,
                        icon: "arrow.down"
                    )

                    ParameterSlider(
                        label: "Surf Body",
                        key: "waterSurfBody",
                        value: $appState.state.waterSurfBody,
                        range: 150...800,
                        unit: "Hz",
                        icon: "waveform"
                    )

                    ParameterSlider(
                        label: "Surf Spray",
                        key: "waterSurfSpray",
                        value: $appState.state.waterSurfSpray,
                        range: 2_000...8_000,
                        unit: "Hz",
                        icon: "water.waves"
                    )

                    ParameterSlider(
                        label: "Insects Level",
                        key: "insectsSharedLevel",
                        value: $appState.state.insectsSharedLevel,
                        range: 0...1,
                        icon: "waveform"
                    )

                    ParameterSlider(
                        label: "Insects Density",
                        key: "insectsDensity",
                        value: $appState.state.insectsDensity,
                        range: 0...1,
                        icon: "circle.grid.cross"
                    )

                    ParameterSlider(
                        label: "Insects 2 Density",
                        key: "insects2Density",
                        value: $appState.state.insects2Density,
                        range: 0...1,
                        icon: "circle.grid.cross"
                    )
                }
                } // End FX Tab

                // MARK: - DRUMS TAB
                if activeTab == .drums {

                // MARK: - Drum Synth Master Section
                CollapsibleSection(title: "Drum Synth", icon: "metronome", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.drumEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Level",
                        key: "drumLevel",
                        value: $appState.state.drumLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )

                    ParameterSlider(
                        label: "Reverb Send",
                        key: "drumReverbSend",
                        value: $appState.state.drumReverbSend,
                        range: 0...1,
                        icon: "waveform.path"
                    )
                }

                // MARK: - Sub Voice Section
                CollapsibleSection(
                    title: "Sub (Deep Pulse)",
                    icon: "waveform.path.badge.minus",
                    titleColor: .red,
                    expanded: $expandedSections,
                    content: {
                        ParameterSlider(
                            label: "Frequency",
                            key: "drumSubFreq",
                            value: $appState.state.drumSubFreq,
                            range: 30...100,
                            unit: "Hz",
                            icon: "waveform"
                        )

                        ParameterSlider(
                            label: "Decay",
                            key: "drumSubDecay",
                            value: $appState.state.drumSubDecay,
                            range: 20...15000,
                            unit: "ms",
                            icon: "arrow.down.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Level",
                            key: "drumSubLevel",
                            value: $appState.state.drumSubLevel,
                            range: 0...1,
                            icon: "speaker.wave.2"
                        )

                        ParameterSlider(
                            label: "Harmonics",
                            key: "drumSubTone",
                            value: $appState.state.drumSubTone,
                            range: 0...1,
                            icon: "waveform.circle"
                        )

                        // Morph controls
                        DrumVoiceMorphView(voice: .sub, voiceColor: .red)
                            .environmentObject(appState)
                    },
                    headerAction: {
                        Button(action: {
                            appState.audioEngine.triggerDrumVoice(.sub, velocity: 0.8)
                        }) {
                            Text("◉")
                                .font(.system(size: 18))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.red.opacity(0.2))
                                .foregroundColor(.red)
                                .cornerRadius(4)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.red, lineWidth: 1)
                                )
                        }
                    }
                )

                // MARK: - Kick Voice Section
                CollapsibleSection(
                    title: "Kick (Punch)",
                    icon: "circle.fill",
                    titleColor: .orange,
                    expanded: $expandedSections,
                    content: {
                        ParameterSlider(
                            label: "Frequency",
                            key: "drumKickFreq",
                            value: $appState.state.drumKickFreq,
                            range: 40...150,
                            unit: "Hz",
                            icon: "waveform"
                        )

                        ParameterSlider(
                            label: "Pitch Sweep",
                            key: "drumKickPitchEnv",
                            value: $appState.state.drumKickPitchEnv,
                            range: 0...48,
                            unit: "st",
                            icon: "arrow.up.right"
                        )

                        ParameterSlider(
                            label: "Pitch Decay",
                            key: "drumKickPitchDecay",
                            value: $appState.state.drumKickPitchDecay,
                            range: 5...1000,
                            unit: "ms",
                            icon: "arrow.down.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Amp Decay",
                            key: "drumKickDecay",
                            value: $appState.state.drumKickDecay,
                            range: 30...15000,
                            unit: "ms",
                            icon: "arrow.down.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Level",
                            key: "drumKickLevel",
                            value: $appState.state.drumKickLevel,
                            range: 0...1,
                            icon: "speaker.wave.2"
                        )

                        ParameterSlider(
                            label: "Click Transient",
                            key: "drumKickClick",
                            value: $appState.state.drumKickClick,
                            range: 0...1,
                            icon: "hand.tap"
                        )

                        // Morph controls
                        DrumVoiceMorphView(voice: .kick, voiceColor: .orange)
                            .environmentObject(appState)
                    },
                    headerAction: {
                        Button(action: {
                            appState.audioEngine.triggerDrumVoice(.kick, velocity: 0.8)
                        }) {
                            Text("●")
                                .font(.system(size: 18))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.2))
                                .foregroundColor(.orange)
                                .cornerRadius(4)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.orange, lineWidth: 1)
                                )
                        }
                    }
                )

                // MARK: - Click Voice Section
                CollapsibleSection(
                    title: "Click (Data)",
                    icon: "hand.tap",
                    titleColor: .yellow,
                    expanded: $expandedSections,
                    content: {
                        ParameterSlider(
                            label: "Decay",
                            key: "drumClickDecay",
                            value: $appState.state.drumClickDecay,
                            range: 1...15000,
                            unit: "ms",
                            icon: "arrow.down.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "HP Filter",
                            key: "drumClickFilter",
                            value: $appState.state.drumClickFilter,
                            range: 500...15000,
                            unit: "Hz",
                            icon: "line.diagonal"
                        )

                        ParameterSlider(
                            label: "Tone (Impulse/Noise)",
                            key: "drumClickTone",
                            value: $appState.state.drumClickTone,
                            range: 0...1,
                            icon: "waveform.circle"
                        )

                        ParameterSlider(
                            label: "Resonance",
                            key: "drumClickResonance",
                            value: $appState.state.drumClickResonance,
                            range: 0...1,
                            icon: "waveform"
                        )

                        ParameterSlider(
                            label: "Level",
                            key: "drumClickLevel",
                            value: $appState.state.drumClickLevel,
                            range: 0...1,
                            icon: "speaker.wave.2"
                        )

                        // Morph controls
                        DrumVoiceMorphView(voice: .click, voiceColor: .yellow)
                            .environmentObject(appState)
                    },
                    headerAction: {
                        Button(action: {
                            appState.audioEngine.triggerDrumVoice(.click, velocity: 0.8)
                        }) {
                            Text("▪")
                                .font(.system(size: 18))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.yellow.opacity(0.2))
                                .foregroundColor(.yellow)
                                .cornerRadius(4)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.yellow, lineWidth: 1)
                                )
                        }
                    }
                )

                // MARK: - Beep Hi Voice Section
                CollapsibleSection(
                    title: "Beep Hi (Ping)",
                    icon: "bell",
                    titleColor: .green,
                    expanded: $expandedSections,
                    content: {
                        ParameterSlider(
                            label: "Frequency",
                            key: "drumBeepHiFreq",
                            value: $appState.state.drumBeepHiFreq,
                            range: 2000...12000,
                            unit: "Hz",
                            icon: "waveform"
                        )

                        ParameterSlider(
                            label: "Attack",
                            key: "drumBeepHiAttack",
                            value: $appState.state.drumBeepHiAttack,
                            range: 0...5000,
                            unit: "ms",
                            icon: "arrow.up.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Decay",
                            key: "drumBeepHiDecay",
                            value: $appState.state.drumBeepHiDecay,
                            range: 10...15000,
                            unit: "ms",
                            icon: "arrow.down.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "FM Tone",
                            key: "drumBeepHiTone",
                            value: $appState.state.drumBeepHiTone,
                            range: 0...1,
                            icon: "waveform.circle"
                        )

                        ParameterSlider(
                            label: "Level",
                            key: "drumBeepHiLevel",
                            value: $appState.state.drumBeepHiLevel,
                            range: 0...1,
                            icon: "speaker.wave.2"
                        )

                        // Morph controls
                        DrumVoiceMorphView(voice: .beepHi, voiceColor: .green)
                            .environmentObject(appState)
                    },
                    headerAction: {
                        Button(action: {
                            appState.audioEngine.triggerDrumVoice(.beepHi, velocity: 0.8)
                        }) {
                            Text("△")
                                .font(.system(size: 18))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.green.opacity(0.2))
                                .foregroundColor(.green)
                                .cornerRadius(4)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.green, lineWidth: 1)
                                )
                        }
                    }
                )

                // MARK: - Beep Lo Voice Section
                CollapsibleSection(
                    title: "Beep Lo (Blip)",
                    icon: "bell.fill",
                    titleColor: .cyan,
                    expanded: $expandedSections,
                    content: {
                        ParameterSlider(
                            label: "Frequency",
                            key: "drumBeepLoFreq",
                            value: $appState.state.drumBeepLoFreq,
                            range: 150...2000,
                            unit: "Hz",
                            icon: "waveform"
                        )

                        ParameterSlider(
                            label: "Attack",
                            key: "drumBeepLoAttack",
                            value: $appState.state.drumBeepLoAttack,
                            range: 0...5000,
                            unit: "ms",
                            icon: "arrow.up.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Decay",
                            key: "drumBeepLoDecay",
                            value: $appState.state.drumBeepLoDecay,
                            range: 10...15000,
                            unit: "ms",
                            icon: "arrow.down.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Tone (Sine/Square)",
                            key: "drumBeepLoTone",
                            value: $appState.state.drumBeepLoTone,
                            range: 0...1,
                            icon: "waveform.circle"
                        )

                        ParameterSlider(
                            label: "Level",
                            key: "drumBeepLoLevel",
                            value: $appState.state.drumBeepLoLevel,
                            range: 0...1,
                            icon: "speaker.wave.2"
                        )

                        // Morph controls
                        DrumVoiceMorphView(voice: .beepLo, voiceColor: .cyan)
                            .environmentObject(appState)
                    },
                    headerAction: {
                        Button(action: {
                            appState.audioEngine.triggerDrumVoice(.beepLo, velocity: 0.8)
                        }) {
                            Text("▽")
                                .font(.system(size: 18))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.cyan.opacity(0.2))
                                .foregroundColor(.cyan)
                                .cornerRadius(4)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.cyan, lineWidth: 1)
                                )
                        }
                    }
                )

                // MARK: - Noise Voice Section
                CollapsibleSection(
                    title: "Noise (Hi-Hat)",
                    icon: "waveform.circle",
                    titleColor: .purple,
                    expanded: $expandedSections,
                    content: {
                        HStack {
                            Image(systemName: "line.diagonal")
                                .foregroundColor(.white.opacity(0.5))
                                .frame(width: 20)
                            Text("Filter Type")
                                .foregroundColor(.white.opacity(0.8))
                            Spacer()
                            Picker("Filter", selection: $appState.state.drumNoiseFilterType) {
                                Text("LP").tag("lowpass")
                                Text("BP").tag("bandpass")
                                Text("HP").tag("highpass")
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 150)
                        }

                        ParameterSlider(
                            label: "Filter Freq",
                            key: "drumNoiseFilterFreq",
                            value: $appState.state.drumNoiseFilterFreq,
                            range: 500...15000,
                            unit: "Hz",
                            icon: "line.diagonal"
                        )

                        ParameterSlider(
                            label: "Filter Q",
                            key: "drumNoiseFilterQ",
                            value: $appState.state.drumNoiseFilterQ,
                            range: 0.5...15,
                            icon: "waveform"
                        )

                        ParameterSlider(
                            label: "Attack",
                            key: "drumNoiseAttack",
                            value: $appState.state.drumNoiseAttack,
                            range: 0...5000,
                            unit: "ms",
                            icon: "arrow.up.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Decay",
                            key: "drumNoiseDecay",
                            value: $appState.state.drumNoiseDecay,
                            range: 5...15000,
                            unit: "ms",
                            icon: "arrow.down.right",
                            logarithmic: true
                        )

                        ParameterSlider(
                            label: "Level",
                            key: "drumNoiseLevel",
                            value: $appState.state.drumNoiseLevel,
                            range: 0...1,
                            icon: "speaker.wave.2"
                        )

                        // Morph controls
                        DrumVoiceMorphView(voice: .noise, voiceColor: .purple)
                            .environmentObject(appState)
                    },
                    headerAction: {
                        Button(action: {
                            appState.audioEngine.triggerDrumVoice(.noise, velocity: 0.8)
                        }) {
                            Text("≋")
                                .font(.system(size: 18))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.purple.opacity(0.2))
                                .foregroundColor(.purple)
                                .cornerRadius(4)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.purple, lineWidth: 1)
                                )
                        }
                    }
                )

                // MARK: - Sequencer Section (Random + Euclidean Basic Controls)
                CollapsibleSection(title: "Sequencer", icon: "metronome.fill", expanded: $expandedSections) {
                    // Random triggers
                    Toggle("Random Triggers", isOn: $appState.state.drumRandomEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Density",
                        key: "drumRandomDensity",
                        value: $appState.state.drumRandomDensity,
                        range: 0...1,
                        icon: "square.grid.3x3.fill"
                    )

                    DualRangeSlider(
                        label: "Interval",
                        minValue: $appState.state.drumRandomMinInterval,
                        maxValue: $appState.state.drumRandomMaxInterval,
                        range: 30...2000,
                        unit: "ms",
                        icon: "timer",
                        color: .orange
                    )

                    Divider().background(Color.white.opacity(0.2))

                    Text("Voice Probabilities")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))

                    ParameterSlider(
                        label: "Sub",
                        key: "drumRandomSubProb",
                        value: $appState.state.drumRandomSubProb,
                        range: 0...1,
                        icon: "waveform.path.badge.minus"
                    )

                    ParameterSlider(
                        label: "Kick",
                        key: "drumRandomKickProb",
                        value: $appState.state.drumRandomKickProb,
                        range: 0...1,
                        icon: "circle.fill"
                    )

                    ParameterSlider(
                        label: "Click",
                        key: "drumRandomClickProb",
                        value: $appState.state.drumRandomClickProb,
                        range: 0...1,
                        icon: "hand.tap"
                    )

                    ParameterSlider(
                        label: "Beep Hi",
                        key: "drumRandomBeepHiProb",
                        value: $appState.state.drumRandomBeepHiProb,
                        range: 0...1,
                        icon: "bell"
                    )

                    ParameterSlider(
                        label: "Beep Lo",
                        key: "drumRandomBeepLoProb",
                        value: $appState.state.drumRandomBeepLoProb,
                        range: 0...1,
                        icon: "bell.fill"
                    )

                    ParameterSlider(
                        label: "Noise",
                        key: "drumRandomNoiseProb",
                        value: $appState.state.drumRandomNoiseProb,
                        range: 0...1,
                        icon: "waveform.circle"
                    )

                    Divider().background(Color.white.opacity(0.2))

                    // Euclidean Basic Controls
                    Toggle("Euclidean Mode", isOn: $appState.state.drumEuclidMasterEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Base BPM",
                        key: "drumEuclidBaseBPM",
                        value: $appState.state.drumEuclidBaseBPM,
                        range: 40...240,
                        unit: "BPM",
                        icon: "metronome"
                    )

                    ParameterSlider(
                        label: "Tempo",
                        key: "drumEuclidTempo",
                        value: $appState.state.drumEuclidTempo,
                        range: 0.25...4,
                        icon: "speedometer"
                    )

                    ParameterSlider(
                        label: "Swing",
                        key: "drumEuclidSwing",
                        value: $appState.state.drumEuclidSwing,
                        range: 0...100,
                        unit: "%",
                        icon: "arrow.left.and.right"
                    )

                    HStack {
                        Image(systemName: "divide")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Division")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Division", selection: $appState.state.drumEuclidDivision) {
                            Text("1/4").tag(4)
                            Text("1/8").tag(8)
                            Text("1/16").tag(16)
                            Text("1/32").tag(32)
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 200)
                    }
                }

                // MARK: - Euclidean Lane 1 Section
                CollapsibleSection(title: "Euclidean Lane 1", icon: "circle.dotted", titleColor: .red, expanded: $expandedSections) {
                    DrumEuclidLaneView(
                        laneNumber: 1,
                        enabled: $appState.state.drumEuclid1Enabled,
                        preset: $appState.state.drumEuclid1Preset,
                        steps: $appState.state.drumEuclid1Steps,
                        hits: $appState.state.drumEuclid1Hits,
                        rotation: $appState.state.drumEuclid1Rotation,
                        targetSub: $appState.state.drumEuclid1TargetSub,
                        targetKick: $appState.state.drumEuclid1TargetKick,
                        targetClick: $appState.state.drumEuclid1TargetClick,
                        targetBeepHi: $appState.state.drumEuclid1TargetBeepHi,
                        targetBeepLo: $appState.state.drumEuclid1TargetBeepLo,
                        targetNoise: $appState.state.drumEuclid1TargetNoise,
                        probability: $appState.state.drumEuclid1Probability,
                        velocityMin: $appState.state.drumEuclid1VelocityMin,
                        velocityMax: $appState.state.drumEuclid1VelocityMax
                    )
                }

                // MARK: - Euclidean Lane 2 Section
                CollapsibleSection(title: "Euclidean Lane 2", icon: "circle.dotted", titleColor: .orange, expanded: $expandedSections) {
                    DrumEuclidLaneView(
                        laneNumber: 2,
                        enabled: $appState.state.drumEuclid2Enabled,
                        preset: $appState.state.drumEuclid2Preset,
                        steps: $appState.state.drumEuclid2Steps,
                        hits: $appState.state.drumEuclid2Hits,
                        rotation: $appState.state.drumEuclid2Rotation,
                        targetSub: $appState.state.drumEuclid2TargetSub,
                        targetKick: $appState.state.drumEuclid2TargetKick,
                        targetClick: $appState.state.drumEuclid2TargetClick,
                        targetBeepHi: $appState.state.drumEuclid2TargetBeepHi,
                        targetBeepLo: $appState.state.drumEuclid2TargetBeepLo,
                        targetNoise: $appState.state.drumEuclid2TargetNoise,
                        probability: $appState.state.drumEuclid2Probability,
                        velocityMin: $appState.state.drumEuclid2VelocityMin,
                        velocityMax: $appState.state.drumEuclid2VelocityMax
                    )
                }

                // MARK: - Euclidean Lane 3 Section
                CollapsibleSection(title: "Euclidean Lane 3", icon: "circle.dotted", titleColor: .green, expanded: $expandedSections) {
                    DrumEuclidLaneView(
                        laneNumber: 3,
                        enabled: $appState.state.drumEuclid3Enabled,
                        preset: $appState.state.drumEuclid3Preset,
                        steps: $appState.state.drumEuclid3Steps,
                        hits: $appState.state.drumEuclid3Hits,
                        rotation: $appState.state.drumEuclid3Rotation,
                        targetSub: $appState.state.drumEuclid3TargetSub,
                        targetKick: $appState.state.drumEuclid3TargetKick,
                        targetClick: $appState.state.drumEuclid3TargetClick,
                        targetBeepHi: $appState.state.drumEuclid3TargetBeepHi,
                        targetBeepLo: $appState.state.drumEuclid3TargetBeepLo,
                        targetNoise: $appState.state.drumEuclid3TargetNoise,
                        probability: $appState.state.drumEuclid3Probability,
                        velocityMin: $appState.state.drumEuclid3VelocityMin,
                        velocityMax: $appState.state.drumEuclid3VelocityMax
                    )
                }

                // MARK: - Euclidean Lane 4 Section
                CollapsibleSection(title: "Euclidean Lane 4", icon: "circle.dotted", titleColor: .purple, expanded: $expandedSections) {
                    DrumEuclidLaneView(
                        laneNumber: 4,
                        enabled: $appState.state.drumEuclid4Enabled,
                        preset: $appState.state.drumEuclid4Preset,
                        steps: $appState.state.drumEuclid4Steps,
                        hits: $appState.state.drumEuclid4Hits,
                        rotation: $appState.state.drumEuclid4Rotation,
                        targetSub: $appState.state.drumEuclid4TargetSub,
                        targetKick: $appState.state.drumEuclid4TargetKick,
                        targetClick: $appState.state.drumEuclid4TargetClick,
                        targetBeepHi: $appState.state.drumEuclid4TargetBeepHi,
                        targetBeepLo: $appState.state.drumEuclid4TargetBeepLo,
                        targetNoise: $appState.state.drumEuclid4TargetNoise,
                        probability: $appState.state.drumEuclid4Probability,
                        velocityMin: $appState.state.drumEuclid4VelocityMin,
                        velocityMax: $appState.state.drumEuclid4VelocityMax
                    )
                }

                } // End Drums Tab

                // MARK: - GLOBAL TAB (continued)
                if activeTab == .global {
                // MARK: - Seed & Timing Section
                CollapsibleSection(title: "Seed & Timing", icon: "clock", expanded: $expandedSections) {
                    HStack {
                        Image(systemName: "calendar")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Seed Window")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Window", selection: $appState.state.seedWindow) {
                            Text("Hour").tag("hour")
                            Text("Day").tag("day")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 140)
                    }

                    ParameterSlider(
                        label: "Random Walk Speed",
                        key: "randomWalkSpeed",
                        value: $appState.state.randomWalkSpeed,
                        range: 0.1...5,
                        icon: "figure.walk"
                    )
                }

                // MARK: - Circle of Fifths Drift Section
                CollapsibleSection(title: "CoF Drift", icon: "circle.circle", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.cofDriftEnabled)
                        .foregroundColor(.white)

                    ParameterSlider(
                        label: "Rate",
                        key: "cofDriftRate",
                        value: Binding(
                            get: { Double(appState.state.cofDriftRate) },
                            set: { appState.state.cofDriftRate = Int($0) }
                        ),
                        range: 1...8,
                        unit: " phrases",
                        icon: "speedometer"
                    )

                    HStack {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 20)
                        Text("Direction")
                            .foregroundColor(.white.opacity(0.8))
                        Spacer()
                        Picker("Direction", selection: $appState.state.cofDriftDirection) {
                            Text("CW").tag("cw")
                            Text("CCW").tag("ccw")
                            Text("Random").tag("random")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 160)
                    }

                    ParameterSlider(
                        label: "Range",
                        key: "cofDriftRange",
                        value: Binding(
                            get: { Double(appState.state.cofDriftRange) },
                            set: { appState.state.cofDriftRange = Int($0) }
                        ),
                        range: 1...6,
                        unit: " steps",
                        icon: "ruler"
                    )
                }
                } // End Global Tab (continued)

                // MARK: - Debug Info Section (visible on all tabs)
                CollapsibleSection(title: "Debug Info", icon: "ladybug", expanded: $expandedSections) {
                    DebugInfoView()
                }
            }
            .padding()
            }
        }
    }
}

// MARK: - Collapsible Section
struct CollapsibleSection<Content: View, HeaderAction: View>: View {
    let title: String
    let icon: String
    var titleColor: Color = .white
    @Binding var expanded: Set<String>
    @ViewBuilder let content: Content
    var headerAction: (() -> HeaderAction)?

    init(title: String, icon: String, titleColor: Color = .white, expanded: Binding<Set<String>>, @ViewBuilder content: () -> Content, headerAction: (() -> HeaderAction)? = nil) {
        self.title = title
        self.icon = icon
        self.titleColor = titleColor
        self._expanded = expanded
        self.content = content()
        self.headerAction = headerAction
    }

    var isExpanded: Bool {
        expanded.contains(title)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Button(action: {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isExpanded {
                            expanded.remove(title)
                        } else {
                            expanded.insert(title)
                        }
                    }
                }) {
                    HStack {
                        Image(systemName: icon)
                            .foregroundColor(titleColor == .white ? .cyan : titleColor)
                            .frame(width: 24)

                        Text(title)
                            .font(.headline)
                            .foregroundColor(titleColor)

                        Spacer()
                    }
                }

                if let action = headerAction {
                    action()
                }

                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .foregroundColor(.white.opacity(0.5))
                    .padding(.trailing, 4)
            }
            .padding()
            .background(Color.white.opacity(0.08))
            .cornerRadius(isExpanded ? 12 : 12, corners: isExpanded ? [.topLeft, .topRight] : .allCorners)

            // Content
            if isExpanded {
                VStack(spacing: 16) {
                    content
                }
                .padding()
                .background(Color.white.opacity(0.05))
                .cornerRadius(12, corners: [.bottomLeft, .bottomRight])
            }
        }
    }
}

// Convenience init for sections without header action
extension CollapsibleSection where HeaderAction == EmptyView {
    init(title: String, icon: String, titleColor: Color = .white, expanded: Binding<Set<String>>, @ViewBuilder content: () -> Content) {
        self.init(title: title, icon: icon, titleColor: titleColor, expanded: expanded, content: content, headerAction: nil)
    }
}

// MARK: - Corner Radius Extension
#if os(iOS)
typealias PlatformRectCorner = UIRectCorner
#else
struct PlatformRectCorner: OptionSet {
    let rawValue: Int

    static let topLeft = PlatformRectCorner(rawValue: 1 << 0)
    static let topRight = PlatformRectCorner(rawValue: 1 << 1)
    static let bottomLeft = PlatformRectCorner(rawValue: 1 << 2)
    static let bottomRight = PlatformRectCorner(rawValue: 1 << 3)
    static let allCorners: PlatformRectCorner = [.topLeft, .topRight, .bottomLeft, .bottomRight]
}
#endif

extension View {
    func cornerRadius(_ radius: CGFloat, corners: PlatformRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: PlatformRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        #if os(iOS)
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
        #else
        return Path(roundedRect: rect, cornerRadius: radius)
        #endif
    }
}

// MARK: - ADSR Visualization
struct ADSRVisualization: View {
    let attack: Double
    let decay: Double
    let sustain: Double
    var hold: Double = 0.5  // Default for main synth (doesn't have configurable hold)
    let release: Double

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height

            // Normalize times for display
            let totalTime = attack + decay + hold + release
            let aX = CGFloat(attack / totalTime) * width
            let dX = CGFloat(decay / totalTime) * width
            let sX: CGFloat = hold / CGFloat(totalTime) * width
            let rX = CGFloat(release / totalTime) * width

            let sustainY = height * CGFloat(1 - sustain)

            Path { path in
                // Attack
                path.move(to: CGPoint(x: 0, y: height))
                path.addLine(to: CGPoint(x: aX, y: 0))

                // Decay
                path.addLine(to: CGPoint(x: aX + dX, y: sustainY))

                // Sustain
                path.addLine(to: CGPoint(x: aX + dX + sX, y: sustainY))

                // Release
                path.addLine(to: CGPoint(x: aX + dX + sX + rX, y: height))
            }
            .stroke(
                LinearGradient(
                    colors: [.cyan, .blue, .purple],
                    startPoint: .leading,
                    endPoint: .trailing
                ),
                lineWidth: 2
            )

            // Fill
            Path { path in
                path.move(to: CGPoint(x: 0, y: height))
                path.addLine(to: CGPoint(x: aX, y: 0))
                path.addLine(to: CGPoint(x: aX + dX, y: sustainY))
                path.addLine(to: CGPoint(x: aX + dX + sX, y: sustainY))
                path.addLine(to: CGPoint(x: aX + dX + sX + rX, y: height))
                path.closeSubpath()
            }
            .fill(
                LinearGradient(
                    colors: [.cyan.opacity(0.3), .blue.opacity(0.1)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .background(Color.white.opacity(0.03))
        .cornerRadius(8)
    }
}

// MARK: - Voice Mask Control
struct VoiceMaskControl: View {
    @Binding var voiceMask: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "person.3")
                    .foregroundColor(.white.opacity(0.5))
                    .frame(width: 20)
                Text("Voices")
                    .foregroundColor(.white.opacity(0.8))
                Spacer()
            }

            HStack(spacing: 8) {
                ForEach(0..<6, id: \.self) { i in
                    let isEnabled = (voiceMask & (1 << i)) != 0
                    Button(action: {
                        voiceMask ^= (1 << i)
                        // Ensure at least one voice is enabled
                        if voiceMask == 0 { voiceMask = 1 }
                    }) {
                        Text("\(i + 1)")
                            .font(.system(.caption, design: .monospaced))
                            .frame(width: 36, height: 36)
                            .background(isEnabled ? Color.cyan : Color.white.opacity(0.1))
                            .foregroundColor(isEnabled ? .black : .white.opacity(0.5))
                            .cornerRadius(8)
                    }
                }
            }
        }
    }
}

// MARK: - Euclidean Lane View
struct EuclideanLaneView: View {
    let laneNumber: Int
    @Binding var enabled: Bool
    @Binding var preset: String
    @Binding var steps: Int
    @Binding var hits: Int
    @Binding var rotation: Int
    @Binding var noteMin: Int
    @Binding var noteMax: Int
    @Binding var level: Double
    @Binding var probability: Double
    @Binding var source: String

    @State private var isExpanded = false

    // Lane colors matching webapp (orange, green, blue, pink)
    private var laneColor: Color {
        switch laneNumber {
        case 1: return Color(red: 245/255, green: 158/255, blue: 11/255)  // #f59e0b orange
        case 2: return Color(red: 16/255, green: 185/255, blue: 129/255)  // #10b981 green
        case 3: return Color(red: 59/255, green: 130/255, blue: 246/255)  // #3b82f6 blue
        case 4: return Color(red: 236/255, green: 72/255, blue: 153/255)  // #ec4899 pink
        default: return .cyan
        }
    }

    // Full preset list matching webapp with all categories
    private let presets: [(category: String, items: [(value: String, label: String)])] = [
        ("Polyrhythmic / Complex", [
            ("sparse", "Sparse (16/1)"),
            ("dense", "Dense (8/7)"),
            ("longSparse", "Long Sparse (32/3)"),
            ("poly3v4", "3 vs 4 (12/3)"),
            ("poly4v3", "4 vs 3 (12/4)"),
            ("poly5v3", "5 vs 3 (15/5)"),
            ("poly5v4", "5 vs 4 (20/5)"),
            ("poly7v4", "7 vs 4 (28/7)"),
            ("poly5v7", "5 vs 7 (35/5)"),
            ("prime17", "Prime 17 (17/7)"),
            ("prime19", "Prime 19 (19/7)"),
            ("prime23", "Prime 23 (23/9)")
        ]),
        ("Indonesian Gamelan", [
            ("lancaran", "Lancaran (16/4)"),
            ("ketawang", "Ketawang (16/2)"),
            ("ladrang", "Ladrang (32/8)"),
            ("gangsaran", "Gangsaran (8/4)"),
            ("kotekan", "Kotekan A (8/3)"),
            ("kotekan2", "Kotekan B (8/3 r:4)"),
            ("srepegan", "Srepegan (16/6)"),
            ("sampak", "Sampak (8/5)"),
            ("ayak", "Ayak (16/3)"),
            ("bonang", "Bonang (12/5)")
        ]),
        ("World Rhythms", [
            ("tresillo", "Tresillo (8/3)"),
            ("cinquillo", "Cinquillo (8/5)"),
            ("rumba", "Rumba (16/5)"),
            ("bossa", "Bossa Nova (16/5)"),
            ("son", "Son Clave (16/7)"),
            ("shiko", "Shiko (16/5)"),
            ("soukous", "Soukous (12/7)"),
            ("gahu", "Gahu (16/7)"),
            ("bembe", "Bembé (12/7)"),
            ("aksak9", "Aksak 9 (9/5)"),
            ("aksak7", "Aksak 7 (7/3)"),
            ("clave23", "Clave 2+3 (8/2)"),
            ("clave32", "Clave 3+2 (8/3)")
        ]),
        ("Steve Reich / Experimental", [
            ("clapping", "Clapping Music (12/8)"),
            ("clappingB", "Clapping B (12/8 r:5)"),
            ("additive7", "Additive 7 (7/4)"),
            ("additive11", "Additive 11 (11/5)"),
            ("additive13", "Additive 13 (13/5)"),
            ("reich18", "Reich 18 (12/7)"),
            ("drumming", "Drumming (8/6)")
        ]),
        ("Custom", [
            ("custom", "Custom")
        ])
    ]

    private let sources = [
        ("lead", "Lead"),
        ("lead2", "Lead 2"),
        ("piano", "Piano"),
        ("synth1", "Synth 1"),
        ("synth2", "Synth 2"),
        ("synth3", "Synth 3"),
        ("synth4", "Synth 4"),
        ("synth5", "Synth 5"),
        ("synth6", "Synth 6")
    ]

    // Convert MIDI note to name
    private func midiToNoteName(_ midi: Int) -> String {
        let noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        let octave = (midi / 12) - 1
        let note = midi % 12
        return "\(noteNames[note])\(octave)"
    }

    var body: some View {
        VStack(spacing: 8) {
            // Lane header with colored toggle button
            HStack {
                Button(action: { enabled.toggle() }) {
                    ZStack {
                        Circle()
                            .fill(enabled ? laneColor : Color.white.opacity(0.15))
                            .frame(width: 28, height: 28)
                        Text("\(laneNumber)")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(enabled ? .white : Color.white.opacity(0.5))
                    }
                }

                Text("Lane \(laneNumber)")
                    .font(.subheadline)
                    .fontWeight(enabled ? .bold : .regular)
                    .foregroundColor(enabled ? laneColor : Color.white.opacity(0.5))

                Spacer()

                // Note range display
                if enabled {
                    Text("\(midiToNoteName(noteMin))–\(midiToNoteName(noteMax))")
                        .font(.caption)
                        .foregroundColor(Color.white.opacity(0.6))
                }

                Button(action: { isExpanded.toggle() }) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.white.opacity(0.5))
                }
            }

            if isExpanded && enabled {
                // Pattern visualization with lane color
                EuclideanPatternView(steps: steps, hits: hits, rotation: rotation, color: laneColor)
                    .frame(height: 30)

                // Preset picker with sections
                Menu {
                    ForEach(presets, id: \.category) { category in
                        Section(header: Text(category.category)) {
                            ForEach(category.items, id: \.value) { item in
                                Button(action: { preset = item.value }) {
                                    HStack {
                                        Text(item.label)
                                        if preset == item.value {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        }
                    }
                } label: {
                    HStack {
                        Text("Preset: \(preset)")
                            .font(.caption)
                            .foregroundColor(laneColor)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.caption)
                            .foregroundColor(laneColor)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(laneColor.opacity(0.15))
                    .cornerRadius(6)
                }

                // Note Range sliders
                VStack(alignment: .leading, spacing: 4) {
                    Text("Note Range")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.6))

                    // Visual range bar
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            // Background
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.white.opacity(0.1))

                            // Active range
                            let minPct = CGFloat(noteMin - 36) / 60.0
                            let maxPct = CGFloat(noteMax - 36) / 60.0
                            RoundedRectangle(cornerRadius: 4)
                                .fill(LinearGradient(
                                    colors: [laneColor.opacity(0.5), laneColor],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ))
                                .frame(width: max(3, (maxPct - minPct) * geo.size.width))
                                .offset(x: minPct * geo.size.width)
                        }
                    }
                    .frame(height: 16)

                    HStack(spacing: 12) {
                        VStack(alignment: .leading) {
                            Text("Low: \(midiToNoteName(noteMin))")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.5))
                            Slider(value: Binding(
                                get: { Double(noteMin) },
                                set: { noteMin = min(Int($0), noteMax) }
                            ), in: 36...96, step: 1)
                            .tint(laneColor)
                        }
                        VStack(alignment: .leading) {
                            Text("High: \(midiToNoteName(noteMax))")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.5))
                            Slider(value: Binding(
                                get: { Double(noteMax) },
                                set: { noteMax = max(Int($0), noteMin) }
                            ), in: 36...96, step: 1)
                            .tint(laneColor)
                        }
                    }
                }

                // Custom Steps/Hits (only when custom preset)
                if preset == "custom" {
                    HStack(spacing: 16) {
                        VStack {
                            Text("Steps")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.5))
                            Stepper("\(steps)", value: $steps, in: 2...32)
                                .labelsHidden()
                        }

                        VStack {
                            Text("Hits")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.5))
                            Stepper("\(hits)", value: $hits, in: 1...steps)
                                .labelsHidden()
                        }
                    }
                }

                // Level and Rotation row
                HStack(spacing: 12) {
                    // Level slider
                    VStack(alignment: .leading) {
                        Text("Level \(Int(level * 100))%")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.5))
                        Slider(value: $level, in: 0...1)
                            .tint(laneColor)
                    }

                    // Rotation with arrow buttons
                    VStack {
                        Text("Rotate: \(rotation)")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.5))
                        HStack(spacing: 4) {
                            Button(action: {
                                rotation = (rotation + 1) % max(1, steps)
                            }) {
                                Text("←")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(laneColor)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(laneColor.opacity(0.2))
                                    .cornerRadius(4)
                            }
                            Button(action: {
                                rotation = (rotation - 1 + max(1, steps)) % max(1, steps)
                            }) {
                                Text("→")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(laneColor)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(laneColor.opacity(0.2))
                                    .cornerRadius(4)
                            }
                        }
                    }
                }

                // Probability and Source row
                HStack(spacing: 12) {
                    VStack(alignment: .leading) {
                        Text("Probability \(Int(probability * 100))%")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.5))
                        Slider(value: $probability, in: 0...1)
                            .tint(laneColor)
                    }

                    // Source picker
                    VStack(alignment: .leading) {
                        Text("Source")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.5))
                        Picker("Source", selection: $source) {
                            ForEach(sources, id: \.0) { value, label in
                                Text(label).tag(value)
                            }
                        }
                        .pickerStyle(.menu)
                        .accentColor(source == "lead" ? Color(red: 212/255, green: 165/255, blue: 32/255) : Color(red: 196/255, green: 114/255, blue: 78/255))
                    }
                }
            }
        }
        .padding(10)
        .background(enabled ? laneColor.opacity(0.08) : Color.white.opacity(0.02))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(enabled ? laneColor : Color.white.opacity(0.1), lineWidth: 1)
        )
        .cornerRadius(8)
        .opacity(enabled ? 1.0 : 0.6)
    }
}

// MARK: - Euclidean Pattern Visualization
struct EuclideanPatternView: View {
    let steps: Int
    let hits: Int
    let rotation: Int
    var color: Color = .cyan

    var pattern: [Bool] {
        Self.generatePattern(steps: steps, hits: hits, rotation: rotation)
    }

    var body: some View {
        GeometryReader { geometry in
            let availableWidth = geometry.size.width - CGFloat(steps - 1) * 2
            let stepSize = min(availableWidth / CGFloat(steps), steps > 16 ? 8 : 12)

            HStack(spacing: 2) {
                Spacer()
                ForEach(0..<steps, id: \.self) { i in
                    Circle()
                        .fill(pattern[i] ? color : Color.white.opacity(0.15))
                        .frame(width: stepSize, height: stepSize)
                        .shadow(color: pattern[i] ? color.opacity(0.6) : .clear, radius: 3)
                }
                Spacer()
            }
        }
    }

    static func generatePattern(steps: Int, hits: Int, rotation: Int) -> [Bool] {
        guard hits > 0 && hits <= steps else {
            return Array(repeating: false, count: steps)
        }

        var pattern = [Bool]()
        let remainder = [Int](repeating: 1, count: hits)
        var counts = [Int](repeating: 0, count: steps - hits)

        var divisor = steps - hits
        var remainderCount = hits

        while remainderCount > 1 {
            let temp = min(divisor, remainderCount)
            for i in 0..<temp {
                if i < remainder.count && i < counts.count {
                    counts[i] += 1
                }
            }
            divisor = remainderCount - temp
            remainderCount = temp
        }

        // Build pattern
        for i in 0..<steps {
            if i < hits {
                pattern.append(true)
                if i < counts.count {
                    for _ in 0..<counts[i] {
                        pattern.append(false)
                    }
                }
            }
        }

        // Pad if needed
        while pattern.count < steps {
            pattern.append(false)
        }
        pattern = Array(pattern.prefix(steps))

        // Apply rotation
        if rotation > 0 && rotation < steps {
            let rot = rotation % steps
            pattern = Array(pattern[rot...]) + Array(pattern[..<rot])
        }

        return pattern
    }
}

// MARK: - Debug Info View
struct DebugInfoView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            DebugRow(label: "Seed Window", value: appState.state.seedWindow)
            DebugRow(label: "Root Note", value: noteNameFromMidi(appState.state.rootNote))
            DebugRow(label: "Scale Mode", value: appState.state.scaleMode)
            if appState.state.scaleMode == "manual" {
                DebugRow(label: "Manual Scale", value: appState.state.manualScale)
            }
            DebugRow(label: "Tension", value: String(format: "%.2f", appState.state.tension))
            DebugRow(label: "CoF Drift", value: appState.state.cofDriftEnabled ? "On (\(appState.state.cofDriftDirection))" : "Off")
            DebugRow(label: "Reverb Quality", value: appState.state.reverbQuality)
            DebugRow(label: "Reverb Type", value: appState.state.reverbType)
        }
        .font(.system(.caption, design: .monospaced))
    }

    func noteNameFromMidi(_ note: Int) -> String {
        let names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        return names[note % 12]
    }
}

struct DebugRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .foregroundColor(.white.opacity(0.5))
            Spacer()
            Text(value)
                .foregroundColor(.cyan)
        }
    }
}

// MARK: - Dual Range Slider (for expression/delay per-note randomization)
/// A slider that can toggle between single value and min/max range modes via double-tap
/// Used for parameters that randomize per note (expression, delay)
/// In dual mode: each note picks a random value within min/max range
/// In single mode: all notes use the same value
struct DualRangeSlider: View {
    let label: String
    @Binding var minValue: Double
    @Binding var maxValue: Double
    let range: ClosedRange<Double>
    var unit: String = ""
    var icon: String = "slider.horizontal.3"
    var color: Color = .green

    /// Track if we're in dual (range) mode or single mode
    /// Single mode = min and max are the same value
    private var isDualMode: Bool {
        abs(maxValue - minValue) > 0.001
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color.opacity(0.6))
                    .frame(width: 20)

                Text(label)
                    .foregroundColor(.white.opacity(0.8))

                if isDualMode {
                    Text("RANGE")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(color)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(color.opacity(0.2))
                        .cornerRadius(4)
                }

                Spacer()

                Text(formattedValue)
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.white.opacity(0.6))
            }

            if isDualMode {
                // Dual mode: show min/max sliders
                HStack {
                    Text("Min")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.5))
                        .frame(width: 28)
                    Slider(
                        value: Binding(
                            get: { minValue },
                            set: { newMin in
                                minValue = Swift.min(newMin, maxValue)
                            }
                        ),
                        in: range
                    )
                    .tint(color.opacity(0.7))
                    Text(formatSingleValue(minValue))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(color.opacity(0.8))
                        .frame(width: 44)
                }

                HStack {
                    Text("Max")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.5))
                        .frame(width: 28)
                    Slider(
                        value: Binding(
                            get: { maxValue },
                            set: { newMax in
                                maxValue = Swift.max(newMax, minValue)
                            }
                        ),
                        in: range
                    )
                    .tint(color)
                    Text(formatSingleValue(maxValue))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(color)
                        .frame(width: 44)
                }

                // Range visualization
                GeometryReader { geo in
                    let rangeSpan = range.upperBound - range.lowerBound
                    let minPos = (minValue - range.lowerBound) / rangeSpan
                    let maxPos = (maxValue - range.lowerBound) / rangeSpan

                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.white.opacity(0.1))

                        RoundedRectangle(cornerRadius: 2)
                            .fill(LinearGradient(
                                colors: [color.opacity(0.4), color.opacity(0.7)],
                                startPoint: .leading,
                                endPoint: .trailing
                            ))
                            .frame(width: geo.size.width * (maxPos - minPos))
                            .offset(x: geo.size.width * minPos)
                    }
                    .frame(height: 6)
                }
                .frame(height: 6)
                .padding(.top, 2)

                // Hint text
                Text("Double-tap for single value")
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.3))
            } else {
                // Single mode: one slider controlling both min and max
                Slider(
                    value: Binding(
                        get: { minValue },
                        set: { newVal in
                            minValue = newVal
                            maxValue = newVal
                        }
                    ),
                    in: range
                )
                .tint(color)

                // Hint text
                Text("Double-tap for range mode")
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.3))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            withAnimation(.easeInOut(duration: 0.2)) {
                toggleMode()
            }
        }
    }

    private func toggleMode() {
        if isDualMode {
            // Switch to single mode: set both to midpoint
            let mid = (minValue + maxValue) / 2
            minValue = mid
            maxValue = mid
        } else {
            // Switch to dual mode: spread 20% around current value
            let rangeSpan = range.upperBound - range.lowerBound
            let spread = rangeSpan * 0.1  // 10% each direction
            minValue = Swift.max(range.lowerBound, minValue - spread)
            maxValue = Swift.min(range.upperBound, maxValue + spread)
        }
    }

    private var formattedValue: String {
        if isDualMode {
            if range.upperBound >= 100 {
                return String(format: "%.0f~%.0f%@", minValue, maxValue, unit)
            } else {
                return String(format: "%.2f~%.2f%@", minValue, maxValue, unit)
            }
        } else {
            if range.upperBound >= 100 {
                return String(format: "%.0f%@", minValue, unit)
            } else {
                return String(format: "%.2f%@", minValue, unit)
            }
        }
    }

    private func formatSingleValue(_ val: Double) -> String {
        if range.upperBound >= 100 {
            return String(format: "%.0f", val)
        } else {
            return String(format: "%.2f", val)
        }
    }
}

// MARK: - Drum Euclidean Lane View
struct DrumEuclidLaneView: View {
    let laneNumber: Int
    @Binding var enabled: Bool
    @Binding var preset: String
    @Binding var steps: Int
    @Binding var hits: Int
    @Binding var rotation: Int
    @Binding var targetSub: Bool
    @Binding var targetKick: Bool
    @Binding var targetClick: Bool
    @Binding var targetBeepHi: Bool
    @Binding var targetBeepLo: Bool
    @Binding var targetNoise: Bool
    @Binding var probability: Double
    @Binding var velocityMin: Double
    @Binding var velocityMax: Double

    // Lane colors matching webapp: red, orange, green, purple
    private var laneColor: Color {
        let colors: [Color] = [
            Color(red: 0.937, green: 0.267, blue: 0.267), // #ef4444 red
            Color(red: 0.976, green: 0.451, blue: 0.086), // #f97316 orange
            Color(red: 0.133, green: 0.773, blue: 0.369), // #22c55e green
            Color(red: 0.545, green: 0.361, blue: 0.965)  // #8b5cf6 purple
        ]
        return colors[(laneNumber - 1) % colors.count]
    }

    // Voice icons matching webapp
    private let voiceData: [(id: String, icon: String, name: String)] = [
        ("sub", "◉", "Sub (Deep Pulse)"),
        ("kick", "●", "Kick (Punch)"),
        ("click", "▪", "Click (Data)"),
        ("beepHi", "△", "Beep Hi (Ping)"),
        ("beepLo", "▽", "Beep Lo (Blip)"),
        ("noise", "≋", "Noise (Hi-Hat)")
    ]

    // Full preset list with category groupings matching webapp
    private let presetGroups: [(name: String, presets: [(id: String, label: String, steps: Int, hits: Int, rotation: Int)])] = [
        ("Polyrhythmic / Complex", [
            ("sparse", "Sparse (16/1)", 16, 1, 0),
            ("dense", "Dense (8/7)", 8, 7, 0),
            ("longSparse", "Long Sparse (32/3)", 32, 3, 0),
            ("poly3v4", "3 vs 4 (12/3)", 12, 3, 0),
            ("poly4v3", "4 vs 3 (12/4)", 12, 4, 0),
            ("poly5v4", "5 vs 4 (20/5)", 20, 5, 0)
        ]),
        ("Indonesian Gamelan", [
            ("lancaran", "Lancaran (16/4)", 16, 4, 0),
            ("ketawang", "Ketawang (16/2)", 16, 2, 0),
            ("ladrang", "Ladrang (32/8)", 32, 8, 0),
            ("gangsaran", "Gangsaran (8/4)", 8, 4, 0),
            ("kotekan", "Kotekan A (8/3)", 8, 3, 1),
            ("kotekan2", "Kotekan B (8/3 r:4)", 8, 3, 4),
            ("srepegan", "Srepegan (16/6)", 16, 6, 2),
            ("sampak", "Sampak (8/5)", 8, 5, 0),
            ("ayak", "Ayak (16/3)", 16, 3, 4),
            ("bonang", "Bonang (12/5)", 12, 5, 2)
        ]),
        ("World Rhythms", [
            ("tresillo", "Tresillo (8/3)", 8, 3, 0),
            ("cinquillo", "Cinquillo (8/5)", 8, 5, 0),
            ("rumba", "Rumba (16/5)", 16, 5, 0),
            ("bossa", "Bossa Nova (16/5)", 16, 5, 3),
            ("son", "Son Clave (16/7)", 16, 7, 0),
            ("shiko", "Shiko (16/5)", 16, 5, 0),
            ("soukous", "Soukous (12/7)", 12, 7, 0),
            ("gahu", "Gahu (16/7)", 16, 7, 0),
            ("bembe", "Bembé (12/7)", 12, 7, 0)
        ]),
        ("Steve Reich / Experimental", [
            ("clapping", "Clapping Music (12/8)", 12, 8, 0),
            ("clappingB", "Clapping B (12/8 r:5)", 12, 8, 5),
            ("additive7", "Additive 7 (7/4)", 7, 4, 0),
            ("additive11", "Additive 11 (11/5)", 11, 5, 0),
            ("additive13", "Additive 13 (13/5)", 13, 5, 0),
            ("reich18", "Reich 18 (12/7)", 12, 7, 3),
            ("drumming", "Drumming (8/6)", 8, 6, 1)
        ])
    ]

    // Get preset data by id
    private func getPresetData(_ id: String) -> (steps: Int, hits: Int, rotation: Int)? {
        for group in presetGroups {
            if let p = group.presets.first(where: { $0.id == id }) {
                return (p.steps, p.hits, p.rotation)
            }
        }
        return nil
    }

    // Calculate pattern values
    private var patternSteps: Int {
        preset == "custom" ? steps : (getPresetData(preset)?.steps ?? 16)
    }
    private var patternHits: Int {
        preset == "custom" ? hits : (getPresetData(preset)?.hits ?? 4)
    }
    private var patternRotation: Int {
        let baseRot = preset == "custom" ? 0 : (getPresetData(preset)?.rotation ?? 0)
        return (baseRot + rotation) % max(1, patternSteps)
    }

    // Generate Euclidean pattern
    private var pattern: [Bool] {
        EuclideanPatternView.generatePattern(steps: patternSteps, hits: patternHits, rotation: patternRotation)
    }

    // Active voice string for header
    private var activeVoicesString: String {
        var result = ""
        if targetSub { result += "◉" }
        if targetKick { result += "●" }
        if targetClick { result += "▪" }
        if targetBeepHi { result += "△" }
        if targetBeepLo { result += "▽" }
        if targetNoise { result += "≋" }
        return result
    }

    // Check if velocity is in dual range mode
    private var isVelocityDual: Bool { velocityMin != velocityMax }

    private var selectedPresetLabel: String {
        if preset == "custom" {
            return "Custom"
        }
        return presetGroups
            .flatMap(\.presets)
            .first(where: { $0.id == preset })?
            .label ?? preset
    }

    @ViewBuilder
    private var laneHeader: some View {
        HStack(spacing: 8) {
            Button(action: { enabled.toggle() }) {
                Text("\(laneNumber)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(enabled ? .white : Color.white.opacity(0.5))
                    .frame(width: 24, height: 24)
                    .background(enabled ? laneColor : Color.white.opacity(0.15))
                    .clipShape(Circle())
            }

            Text("Lane \(laneNumber)")
                .font(.subheadline)
                .fontWeight(enabled ? .bold : .regular)
                .foregroundColor(enabled ? laneColor : Color.white.opacity(0.5))

            if !enabled {
                Text("(off)")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.4))
            }

            Spacer()

            if enabled {
                Text("\(activeVoicesString) • \(patternHits)/\(patternSteps)")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
            }
        }
    }

    @ViewBuilder
    private var enabledContent: some View {
        EuclideanPatternView(steps: patternSteps, hits: patternHits, rotation: patternRotation, color: laneColor)
            .frame(height: 28)

        Menu {
            ForEach(presetGroups, id: \.name) { group in
                Section(group.name) {
                    ForEach(group.presets, id: \.id) { presetOption in
                        Button(presetOption.label) { preset = presetOption.id }
                    }
                }
            }
            Divider()
            Button("Custom") { preset = "custom" }
        } label: {
            HStack {
                Text(selectedPresetLabel)
                    .font(.caption)
                    .foregroundColor(.white)
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .foregroundColor(laneColor)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.black.opacity(0.4))
            .cornerRadius(6)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(laneColor.opacity(0.4), lineWidth: 1)
            )
        }

        HStack(spacing: 4) {
            ForEach(voiceData, id: \.id) { voice in
                let isOn = voiceBinding(for: voice.id)
                Button(action: { isOn.wrappedValue.toggle() }) {
                    Text(voice.icon)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(isOn.wrappedValue ? laneColor : Color.white.opacity(0.4))
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .background(isOn.wrappedValue ? laneColor.opacity(0.25) : Color.black.opacity(0.3))
                        .cornerRadius(4)
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(isOn.wrappedValue ? laneColor : Color.white.opacity(0.2), lineWidth: isOn.wrappedValue ? 2 : 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }

        if preset == "custom" {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Steps: \(steps)")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                    Slider(value: Binding(
                        get: { Double(steps) },
                        set: { steps = Int($0) }
                    ), in: 2...32, step: 1)
                    .tint(laneColor)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Hits: \(hits)")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                    Slider(value: Binding(
                        get: { Double(hits) },
                        set: { hits = min(Int($0), steps) }
                    ), in: 1...Double(steps), step: 1)
                    .tint(laneColor)
                }
            }
        }

        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Probability \(Int(probability * 100))%")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
                Slider(value: $probability, in: 0...1)
                    .tint(.orange)
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 2) {
                Text("Rotate: \(rotation)")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
                HStack(spacing: 4) {
                    Button("←") {
                        rotation = (rotation + 1) % max(1, patternSteps)
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(laneColor)
                    .frame(width: 32, height: 24)
                    .background(laneColor.opacity(0.2))
                    .cornerRadius(4)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(laneColor.opacity(0.5), lineWidth: 1))

                    Button("→") {
                        rotation = (rotation - 1 + patternSteps) % max(1, patternSteps)
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(laneColor)
                    .frame(width: 32, height: 24)
                    .background(laneColor.opacity(0.2))
                    .cornerRadius(4)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(laneColor.opacity(0.5), lineWidth: 1))
                }
            }
            .frame(width: 80)
        }

        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Level")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
                if isVelocityDual {
                    Text("\(Int(velocityMin * 100))–\(Int(velocityMax * 100))%")
                        .font(.caption2)
                        .foregroundColor(laneColor)
                    Text("⟷ range")
                        .font(.system(size: 9))
                        .foregroundColor(laneColor)
                } else {
                    Text("\(Int(velocityMin * 100))%")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                }
                Spacer()
                Text("tap for range")
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.3))
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.1))
                        .frame(height: 6)

                    RoundedRectangle(cornerRadius: 3)
                        .fill(LinearGradient(
                            colors: [laneColor.opacity(0.6), laneColor],
                            startPoint: .leading,
                            endPoint: .trailing
                        ))
                        .frame(width: CGFloat(velocityMax - velocityMin) * geo.size.width, height: 6)
                        .offset(x: CGFloat(velocityMin) * geo.size.width)
                }
            }
            .frame(height: 6)
            .onTapGesture {
                if isVelocityDual {
                    let mid = (velocityMin + velocityMax) / 2
                    velocityMin = mid
                    velocityMax = mid
                } else {
                    velocityMin = max(0, velocityMin - 0.2)
                    velocityMax = min(1, velocityMax + 0.2)
                }
            }

            HStack(spacing: 8) {
                VStack {
                    Text("Min")
                        .font(.system(size: 9))
                        .foregroundColor(.white.opacity(0.4))
                    Slider(value: $velocityMin, in: 0...1)
                        .tint(laneColor.opacity(0.6))
                        .onChange(of: velocityMin) { _, newVal in
                            if newVal > velocityMax { velocityMax = newVal }
                        }
                }

                VStack {
                    Text("Max")
                        .font(.system(size: 9))
                        .foregroundColor(.white.opacity(0.4))
                    Slider(value: $velocityMax, in: 0...1)
                        .tint(laneColor)
                        .onChange(of: velocityMax) { _, newVal in
                            if newVal < velocityMin { velocityMin = newVal }
                        }
                }
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            laneHeader
            if enabled {
                enabledContent
            }
        }
        .padding(10)
        .background(enabled ? laneColor.opacity(0.08) : Color.white.opacity(0.02))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(enabled ? laneColor : Color.white.opacity(0.15), lineWidth: 1)
        )
        .opacity(enabled ? 1 : 0.6)
    }

    // Helper to get binding for voice toggles
    private func voiceBinding(for id: String) -> Binding<Bool> {
        switch id {
        case "sub": return $targetSub
        case "kick": return $targetKick
        case "click": return $targetClick
        case "beepHi": return $targetBeepHi
        case "beepLo": return $targetBeepLo
        case "noise": return $targetNoise
        default: return .constant(false)
        }
    }
}

// MARK: - Voice Toggle Button
struct VoiceToggle: View {
    let label: String
    @Binding var isOn: Bool

    var body: some View {
        Button(action: { isOn.toggle() }) {
            Text(label)
                .font(.caption)
                .fontWeight(isOn ? .bold : .regular)
                .foregroundColor(isOn ? .black : .white.opacity(0.6))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(isOn ? Color.cyan : Color.white.opacity(0.1))
                .cornerRadius(4)
        }
    }
}

// MARK: - Delay Send Pair
struct DelaySendPairControl: View {
    let label: String
    let delayAKey: String
    let delayBKey: String
    @Binding var delayASend: Double
    @Binding var delayBSend: Double

    var body: some View {
        VStack(spacing: 8) {
            Text(label)
                .font(.caption)
                .foregroundColor(.white.opacity(0.55))
                .frame(maxWidth: .infinity, alignment: .leading)

            ParameterSlider(
                label: "\(label) A",
                key: delayAKey,
                value: $delayASend,
                range: 0...1,
                icon: "a.circle"
            )

            ParameterSlider(
                label: "\(label) B",
                key: delayBKey,
                value: $delayBSend,
                range: 0...1,
                icon: "b.circle"
            )
        }
    }
}

// MARK: - Reusable Parameter Slider
struct ParameterSlider: View {
    let label: String
    let paramKey: String  // Key for dual range storage
    @Binding var value: Double
    let range: ClosedRange<Double>
    var unit: String = ""
    var icon: String = "slider.horizontal.3"
    var logarithmic: Bool = false  // Use exponential curve for fine control at low end

    @EnvironmentObject var appState: AppState

    // Logarithmic curve constant (matches web LOG_CURVE = 2.5)
    private let logCurve: Double = 2.5

    /// Convert actual value to slider position (0-1) with logarithmic scaling
    private func valueToSlider(_ val: Double) -> Double {
        if !logarithmic { return val }
        let minVal = max(range.lowerBound, 0.001) // Avoid log(0)
        let normalized = (val - minVal) / (range.upperBound - minVal)
        return pow(max(0, normalized), 1.0 / logCurve)
    }

    /// Convert slider position (0-1) to actual value with logarithmic scaling
    private func sliderToValue(_ pos: Double) -> Double {
        if !logarithmic { return pos }
        let minVal = max(range.lowerBound, 0.001)
        let curved = pow(pos, logCurve)
        return minVal + curved * (range.upperBound - minVal)
    }

    /// Check if this slider is in dual mode
    private var isDualMode: Bool {
        appState.dualRanges[paramKey] != nil
    }

    /// Get current dual range (if active)
    private var dualRange: DualRange? {
        appState.dualRanges[paramKey]
    }

    /// Get current animated walk value
    private var walkValue: Double {
        appState.randomWalkValues[paramKey] ?? value
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(.white.opacity(0.5))
                    .frame(width: 20)

                Text(label)
                    .foregroundColor(.white.opacity(0.8))

                if isDualMode {
                    Text("RANGE")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.orange)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.2))
                        .cornerRadius(4)
                }

                Spacer()

                Text(formattedValue)
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.white.opacity(0.6))
            }

            if isDualMode, let dualRange = dualRange {
                // Dual slider mode - shows min/max range with animated walk indicator
                VStack(spacing: 4) {
                    HStack {
                        Text("Min")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 28)
                        Slider(
                            value: Binding(
                                get: { dualRange.min },
                                set: { newMin in
                                    appState.updateDualRange(
                                        for: paramKey,
                                        min: min(newMin, dualRange.max),
                                        max: dualRange.max
                                    )
                                }
                            ),
                            in: range
                        )
                        .tint(.blue)
                        Text(String(format: "%.2f", dualRange.min))
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.blue)
                            .frame(width: 40)
                    }
                    HStack {
                        Text("Max")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.5))
                            .frame(width: 28)
                        Slider(
                            value: Binding(
                                get: { dualRange.max },
                                set: { newMax in
                                    appState.updateDualRange(
                                        for: paramKey,
                                        min: dualRange.min,
                                        max: max(newMax, dualRange.min)
                                    )
                                }
                            ),
                            in: range
                        )
                        .tint(.orange)
                        Text(String(format: "%.2f", dualRange.max))
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(.orange)
                            .frame(width: 40)
                    }

                    // Visual indicator of current walk position within range
                    GeometryReader { geo in
                        let rangeWidth = dualRange.max - dualRange.min
                        let normalizedPos = rangeWidth > 0.001 ? (walkValue - dualRange.min) / rangeWidth : 0.5
                        let clampedPos = Swift.max(0, Swift.min(1, normalizedPos))

                        ZStack(alignment: .leading) {
                            // Background track
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Color.white.opacity(0.1))

                            // Gradient showing range
                            RoundedRectangle(cornerRadius: 2)
                                .fill(LinearGradient(
                                    colors: [.blue.opacity(0.5), .orange.opacity(0.5)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ))

                            // Walk position indicator
                            Circle()
                                .fill(Color.white)
                                .frame(width: 8, height: 8)
                                .offset(x: (geo.size.width - 8) * clampedPos)
                                .animation(.easeInOut(duration: 0.1), value: walkValue)
                        }
                        .frame(height: 8)
                    }
                    .frame(height: 8)
                    .padding(.top, 4)

                    // Walk speed indicator
                    HStack {
                        Text("Walk: \(String(format: "%.1fx", appState.state.randomWalkSpeed))")
                            .font(.system(size: 9))
                            .foregroundColor(.white.opacity(0.4))
                        Spacer()
                        Text("Value: \(String(format: "%.2f", walkValue))")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundColor(.cyan.opacity(0.6))
                    }
                }
            } else {
                // Use logarithmic binding if enabled
                if logarithmic {
                    Slider(
                        value: Binding(
                            get: { valueToSlider(value) },
                            set: { value = sliderToValue($0) }
                        ),
                        in: 0...1
                    )
                    .tint(.cyan)
                    .onChange(of: value) { _, newValue in
                        appState.handleSliderChange(key: paramKey, value: newValue)
                    }
                } else {
                    Slider(value: $value, in: range)
                        .tint(.cyan)
                        .onChange(of: value) { _, newValue in
                            appState.handleSliderChange(key: paramKey, value: newValue)
                        }
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            // Double-tap toggles dual mode (matching web app)
            withAnimation(.easeInOut(duration: 0.2)) {
                appState.toggleDualMode(
                    for: paramKey,
                    currentValue: value,
                    rangeMin: range.lowerBound,
                    rangeMax: range.upperBound
                )
            }
        }
    }

    private var formattedValue: String {
        if isDualMode, let dualRange = dualRange {
            return String(format: "%.2f~%.2f%@", dualRange.min, dualRange.max, unit)
        } else if range.upperBound >= 1000 {
            return String(format: "%.0f%@", value, unit)
        } else if range.upperBound > 100 {
            return String(format: "%.0f%@", value, unit)
        } else if range.upperBound > 10 {
            return String(format: "%.1f%@", value, unit)
        } else {
            return String(format: "%.2f%@", value, unit)
        }
    }
}

// MARK: - Convenience init without paramKey (uses label as key)
extension ParameterSlider {
    init(label: String, key: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", icon: String = "slider.horizontal.3", logarithmic: Bool = false) {
        self.label = label
        self.paramKey = key
        self._value = value
        self.range = range
        self.unit = unit
        self.icon = icon
        self.logarithmic = logarithmic
    }

    init(label: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", icon: String = "slider.horizontal.3") {
        self.label = label
        self.paramKey = label.lowercased().replacingOccurrences(of: " ", with: "")
        self._value = value
        self.range = range
        self.unit = unit
        self.icon = icon
        self.logarithmic = false
    }

    init(label: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", icon: String = "slider.horizontal.3", logarithmic: Bool) {
        self.label = label
        self.paramKey = label.lowercased().replacingOccurrences(of: " ", with: "")
        self._value = value
        self.range = range
        self.unit = unit
        self.icon = icon
        self.logarithmic = logarithmic
    }
}

// MARK: - Integer binding for sliders
extension ParameterSlider {
    init(label: String, key: String, value: Binding<Int>, range: ClosedRange<Int>, unit: String = "", icon: String = "slider.horizontal.3") {
        self.label = label
        self.paramKey = key
        self._value = Binding(
            get: { Double(value.wrappedValue) },
            set: { value.wrappedValue = Int($0) }
        )
        self.range = Double(range.lowerBound)...Double(range.upperBound)
        self.unit = unit
        self.icon = icon
        self.logarithmic = false
    }

    init(label: String, value: Binding<Int>, range: ClosedRange<Int>, unit: String = "", icon: String = "slider.horizontal.3") {
        self.label = label
        self.paramKey = label.lowercased().replacingOccurrences(of: " ", with: "")
        self._value = Binding(
            get: { Double(value.wrappedValue) },
            set: { value.wrappedValue = Int($0) }
        )
        self.range = Double(range.lowerBound)...Double(range.upperBound)
        self.unit = unit
        self.icon = icon
        self.logarithmic = false
    }
}

// MARK: - Filter Response Visualization
/// Shows filter response curve with min/max cutoff range and live frequency indicator
struct FilterResponseView: View {
    let filterType: String
    let cutoffMin: Double
    let cutoffMax: Double
    let resonance: Double
    let q: Double
    let modSpeed: Double
    var liveFrequency: Double? = nil
    var isRunning: Bool = false

    private let minFreq: Double = 40
    private let maxFreq: Double = 8000

    /// Convert frequency to X position (log scale)
    private func freqToX(_ freq: Double, width: CGFloat) -> CGFloat {
        let logMin = log(minFreq)
        let logMax = log(maxFreq)
        let logFreq = log(max(minFreq, min(maxFreq, freq)))
        return CGFloat((logFreq - logMin) / (logMax - logMin)) * width
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Filter Response (Mod Range)")
                .font(.caption)
                .foregroundColor(.white.opacity(0.6))

            GeometryReader { geo in
                let width = geo.size.width
                let height = geo.size.height
                let minCutoffX = freqToX(cutoffMin, width: width)
                let maxCutoffX = freqToX(cutoffMax, width: width)
                let liveX = liveFrequency.map { freqToX($0, width: width) }

                // Resonance peak height
                let resPeak = min(resonance * 15, 20)
                // Q affects slope sharpness
                let qFactor = min(q, 12)

                let baseY: CGFloat = height * 0.3  // Top of response (0dB)
                let floorY: CGFloat = height * 0.85  // Bottom (attenuated)

                ZStack {
                    // Background
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.black.opacity(0.3))

                    // Grid line
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: height * 0.5))
                        path.addLine(to: CGPoint(x: width, y: height * 0.5))
                    }
                    .stroke(Color.white.opacity(0.1), lineWidth: 0.5)

                    // Mod range indicator (shaded area)
                    Rectangle()
                        .fill(Color.blue.opacity(0.15))
                        .frame(width: max(2, maxCutoffX - minCutoffX))
                        .offset(x: minCutoffX - width/2 + (maxCutoffX - minCutoffX)/2)

                    // Min cutoff line
                    Path { path in
                        path.move(to: CGPoint(x: minCutoffX, y: 0))
                        path.addLine(to: CGPoint(x: minCutoffX, y: height))
                    }
                    .stroke(Color.blue.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))

                    // Max cutoff line
                    Path { path in
                        path.move(to: CGPoint(x: maxCutoffX, y: 0))
                        path.addLine(to: CGPoint(x: maxCutoffX, y: height))
                    }
                    .stroke(Color.orange.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))

                    // Live frequency indicator (green line)
                    if isRunning, let liveX = liveX {
                        Path { path in
                            path.move(to: CGPoint(x: liveX, y: 0))
                            path.addLine(to: CGPoint(x: liveX, y: height))
                        }
                        .stroke(Color.green, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))

                        // Live frequency text
                        Text("\(Int(liveFrequency ?? 0)) Hz")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.green)
                            .shadow(color: .green.opacity(0.5), radius: 4)
                            .position(x: width/2, y: 12)
                    }

                    // Filter curve at min cutoff (faded)
                    filterCurvePath(cutoffX: minCutoffX, width: width, baseY: baseY, floorY: floorY, resPeak: resPeak, qFactor: qFactor)
                        .stroke(Color.blue.opacity(0.5), lineWidth: 1.5)

                    // Filter curve at max cutoff
                    filterCurvePath(cutoffX: maxCutoffX, width: width, baseY: baseY, floorY: floorY, resPeak: resPeak, qFactor: qFactor)
                        .stroke(Color.orange.opacity(0.9), lineWidth: 2)

                    // Fill under max curve
                    filterCurvePath(cutoffX: maxCutoffX, width: width, baseY: baseY, floorY: floorY, resPeak: resPeak, qFactor: qFactor, closed: true)
                        .fill(Color.orange.opacity(0.1))

                    // Frequency labels
                    HStack {
                        Text("40Hz")
                            .font(.system(size: 8))
                            .foregroundColor(.white.opacity(0.3))
                        Spacer()
                        Text("500Hz")
                            .font(.system(size: 8))
                            .foregroundColor(.white.opacity(0.3))
                        Spacer()
                        Text("8kHz")
                            .font(.system(size: 8))
                            .foregroundColor(.white.opacity(0.3))
                    }
                    .padding(.horizontal, 4)
                    .offset(y: height/2 - 8)

                    // Q indicator
                    Text("Q:\(String(format: "%.1f", q))")
                        .font(.system(size: 8))
                        .foregroundColor(.blue.opacity(0.6))
                        .position(x: width - 20, y: 10)

                    // Mod speed indicator
                    Text("~\(String(format: "%.1f", modSpeed)) phrases")
                        .font(.system(size: 8))
                        .foregroundColor(.green.opacity(0.6))
                        .position(x: 40, y: 10)
                }
            }
            .frame(height: 100)
            .cornerRadius(8)
        }
    }

    /// Generate filter curve path based on filter type
    private func filterCurvePath(cutoffX: CGFloat, width: CGFloat, baseY: CGFloat, floorY: CGFloat, resPeak: CGFloat, qFactor: CGFloat, closed: Bool = false) -> Path {
        Path { path in
            let dropWidth = max(15, 35 - qFactor * 1.5)
            let riseWidth = max(15, 35 - qFactor * 1.5)
            let slopeSharpness = min(5 + qFactor * 1.5, 25)

            switch filterType {
            case "lowpass":
                path.move(to: CGPoint(x: 0, y: baseY))
                path.addLine(to: CGPoint(x: max(0, cutoffX - 15), y: baseY))
                path.addQuadCurve(
                    to: CGPoint(x: cutoffX, y: baseY - resPeak),
                    control: CGPoint(x: cutoffX - 5, y: baseY)
                )
                path.addQuadCurve(
                    to: CGPoint(x: min(width, cutoffX + dropWidth), y: floorY - 5),
                    control: CGPoint(x: cutoffX + slopeSharpness * 0.5, y: baseY + 5)
                )
                path.addLine(to: CGPoint(x: width, y: floorY))

            case "highpass":
                path.move(to: CGPoint(x: 0, y: floorY))
                path.addLine(to: CGPoint(x: max(0, cutoffX - riseWidth), y: floorY - 5))
                path.addQuadCurve(
                    to: CGPoint(x: cutoffX, y: baseY - resPeak),
                    control: CGPoint(x: cutoffX - slopeSharpness * 0.5, y: baseY + 5)
                )
                path.addQuadCurve(
                    to: CGPoint(x: min(width, cutoffX + 15), y: baseY),
                    control: CGPoint(x: cutoffX + 5, y: baseY)
                )
                path.addLine(to: CGPoint(x: width, y: baseY))

            case "bandpass":
                let bpWidth = max(20, 50 - qFactor * 3)
                path.move(to: CGPoint(x: 0, y: floorY))
                path.addLine(to: CGPoint(x: max(0, cutoffX - bpWidth), y: floorY - 5))
                path.addQuadCurve(
                    to: CGPoint(x: cutoffX, y: baseY - resPeak),
                    control: CGPoint(x: cutoffX - bpWidth * 0.4, y: baseY + 8)
                )
                path.addQuadCurve(
                    to: CGPoint(x: min(width, cutoffX + bpWidth), y: floorY - 5),
                    control: CGPoint(x: cutoffX + bpWidth * 0.4, y: baseY + 8)
                )
                path.addLine(to: CGPoint(x: width, y: floorY))

            case "notch":
                let notchWidth = max(15, 40 - qFactor * 2)
                path.move(to: CGPoint(x: 0, y: baseY))
                path.addLine(to: CGPoint(x: max(0, cutoffX - notchWidth), y: baseY))
                path.addQuadCurve(
                    to: CGPoint(x: cutoffX, y: floorY),
                    control: CGPoint(x: cutoffX - notchWidth * 0.3, y: baseY)
                )
                path.addQuadCurve(
                    to: CGPoint(x: min(width, cutoffX + notchWidth), y: baseY),
                    control: CGPoint(x: cutoffX + notchWidth * 0.3, y: baseY)
                )
                path.addLine(to: CGPoint(x: width, y: baseY))

            default:
                path.move(to: CGPoint(x: 0, y: baseY))
                path.addLine(to: CGPoint(x: width, y: baseY))
            }

            if closed {
                path.addLine(to: CGPoint(x: width, y: floorY + 10))
                path.addLine(to: CGPoint(x: 0, y: floorY + 10))
                path.closeSubpath()
            }
        }
    }
}

// MARK: - Lead Timbre Range Visualization
/// Shows a gradient bar representing timbre range from Rhodes (warm) to Gamelan (bright)
struct TimbreRangeView: View {
    let timbreMin: Double
    let timbreMax: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Timbre Range")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
                Text("\(Int(timbreMin * 100))% – \(Int(timbreMax * 100))%")
                    .font(.caption)
                    .foregroundColor(.cyan.opacity(0.8))
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Background gradient showing full range
                    RoundedRectangle(cornerRadius: 4)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.4, green: 0.3, blue: 0.2),  // Rhodes (warm brown)
                                    Color(red: 0.6, green: 0.5, blue: 0.3),  // Middle
                                    Color(red: 0.8, green: 0.7, blue: 0.3),  // Gamelan (metallic gold)
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .opacity(0.3)

                    // Active range highlight
                    RoundedRectangle(cornerRadius: 4)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.4, green: 0.3, blue: 0.2),  // Rhodes
                                    Color(red: 0.8, green: 0.7, blue: 0.3),  // Gamelan
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * CGFloat(timbreMax - timbreMin))
                        .offset(x: geo.size.width * CGFloat(timbreMin))

                    // Min/Max markers
                    Rectangle()
                        .fill(Color.white.opacity(0.8))
                        .frame(width: 2, height: 16)
                        .offset(x: geo.size.width * CGFloat(timbreMin) - 1)

                    Rectangle()
                        .fill(Color.white.opacity(0.8))
                        .frame(width: 2, height: 16)
                        .offset(x: geo.size.width * CGFloat(timbreMax) - 1)
                }
            }
            .frame(height: 16)

            // Labels
            HStack {
                Text("Rhodes")
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.4))
                Spacer()
                Text("Gamelan")
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.4))
            }
        }
    }
}

// MARK: - Drum Voice Morph View

/// Reusable view for drum voice morph controls (Preset A/B selection + morph slider)
struct DrumVoiceMorphView: View {
    @EnvironmentObject var appState: AppState
    let voice: DrumVoiceType
    let voiceColor: Color

    // Get preset names for this voice
    private var presetNames: [String] {
        getPresetNames(voice: voice)
    }

    // Get bindings based on voice type
    private var presetABinding: Binding<String> {
        switch voice {
        case .sub: return $appState.state.drumSubPresetA
        case .kick: return $appState.state.drumKickPresetA
        case .click: return $appState.state.drumClickPresetA
        case .beepHi: return $appState.state.drumBeepHiPresetA
        case .beepLo: return $appState.state.drumBeepLoPresetA
        case .noise: return $appState.state.drumNoisePresetA
        }
    }

    private var presetBBinding: Binding<String> {
        switch voice {
        case .sub: return $appState.state.drumSubPresetB
        case .kick: return $appState.state.drumKickPresetB
        case .click: return $appState.state.drumClickPresetB
        case .beepHi: return $appState.state.drumBeepHiPresetB
        case .beepLo: return $appState.state.drumBeepLoPresetB
        case .noise: return $appState.state.drumNoisePresetB
        }
    }

    private var morphBinding: Binding<Double> {
        switch voice {
        case .sub: return $appState.state.drumSubMorph
        case .kick: return $appState.state.drumKickMorph
        case .click: return $appState.state.drumClickMorph
        case .beepHi: return $appState.state.drumBeepHiMorph
        case .beepLo: return $appState.state.drumBeepLoMorph
        case .noise: return $appState.state.drumNoiseMorph
        }
    }

    private var presetAKey: String {
        switch voice {
        case .sub: return "drumSubPresetA"
        case .kick: return "drumKickPresetA"
        case .click: return "drumClickPresetA"
        case .beepHi: return "drumBeepHiPresetA"
        case .beepLo: return "drumBeepLoPresetA"
        case .noise: return "drumNoisePresetA"
        }
    }

    private var presetBKey: String {
        switch voice {
        case .sub: return "drumSubPresetB"
        case .kick: return "drumKickPresetB"
        case .click: return "drumClickPresetB"
        case .beepHi: return "drumBeepHiPresetB"
        case .beepLo: return "drumBeepLoPresetB"
        case .noise: return "drumNoisePresetB"
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            // Preset A/B selectors in a row
            HStack(spacing: 8) {
                // Preset A
                VStack(alignment: .leading, spacing: 2) {
                    Text("Preset A")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.5))

                    Picker("A", selection: Binding(
                        get: { presetABinding.wrappedValue },
                        set: { newValue in
                            presetABinding.wrappedValue = newValue
                            appState.handleDrumPresetChange(key: presetAKey)
                        }
                    )) {
                        ForEach(presetNames, id: \.self) { name in
                            Text(name).tag(name)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(voiceColor)
                    .frame(maxWidth: .infinity)
                    .background(voiceColor.opacity(0.1))
                    .cornerRadius(6)
                }

                // Preset B
                VStack(alignment: .leading, spacing: 2) {
                    Text("Preset B")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.5))

                    Picker("B", selection: Binding(
                        get: { presetBBinding.wrappedValue },
                        set: { newValue in
                            presetBBinding.wrappedValue = newValue
                            appState.handleDrumPresetChange(key: presetBKey)
                        }
                    )) {
                        ForEach(presetNames, id: \.self) { name in
                            Text(name).tag(name)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(voiceColor)
                    .frame(maxWidth: .infinity)
                    .background(voiceColor.opacity(0.1))
                    .cornerRadius(6)
                }
            }

            // Morph slider
            HStack {
                Text("A")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.5))

                Slider(value: Binding(
                    get: { morphBinding.wrappedValue },
                    set: { newValue in
                        morphBinding.wrappedValue = newValue
                        appState.handleDrumMorphChange(voice: voice, morphValue: newValue)
                    }
                ), in: 0...1)
                .tint(voiceColor)

                Text("B")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.5))
            }

            // Morph percentage
            Text("\(Int(morphBinding.wrappedValue * 100))%")
                .font(.caption2)
                .foregroundColor(.white.opacity(0.4))
        }
        .padding(8)
        .background(voiceColor.opacity(0.05))
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(voiceColor.opacity(0.2), lineWidth: 1)
        )
    }
}

#Preview {
    SliderControlsView()
        .background(Color.black)
        .environmentObject(AppState())
}
