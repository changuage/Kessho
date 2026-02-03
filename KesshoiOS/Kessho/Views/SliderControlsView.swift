import SwiftUI

/// Slider controls view with all parameters organized by section
struct SliderControlsView: View {
    @EnvironmentObject var appState: AppState
    @State private var expandedSections: Set<String> = ["Levels", "Character"]
    
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
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // MARK: - Levels Section
                CollapsibleSection(title: "Levels", icon: "speaker.wave.3", expanded: $expandedSections) {
                    ParameterSlider(
                        label: "Master",
                        value: $appState.state.masterVolume,
                        range: 0...1,
                        icon: "speaker.wave.3"
                    )
                    
                    ParameterSlider(
                        label: "Synth",
                        value: $appState.state.synthLevel,
                        range: 0...1,
                        icon: "waveform"
                    )
                    
                    ParameterSlider(
                        label: "Granular",
                        value: $appState.state.granularLevel,
                        range: 0...2,
                        icon: "sparkles"
                    )
                    
                    ParameterSlider(
                        label: "Lead",
                        value: $appState.state.leadLevel,
                        range: 0...1,
                        icon: "music.note"
                    )
                    
                    ParameterSlider(
                        label: "Ocean",
                        value: $appState.state.oceanSampleLevel,
                        range: 0...1,
                        icon: "water.waves"
                    )
                    
                    ParameterSlider(
                        label: "Drums",
                        value: $appState.state.drumLevel,
                        range: 0...1,
                        icon: "circle.hexagonpath"
                    )
                    
                    ParameterSlider(
                        label: "Reverb",
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
                
                // MARK: - Character Section
                CollapsibleSection(title: "Character", icon: "paintpalette", expanded: $expandedSections) {
                    ParameterSlider(
                        label: "Tension",
                        value: $appState.state.tension,
                        range: 0...1,
                        icon: "gauge.medium"
                    )
                    
                    ParameterSlider(
                        label: "Randomness",
                        value: $appState.state.randomness,
                        range: 0...1,
                        icon: "dice"
                    )
                    
                    ParameterSlider(
                        label: "Walk Speed",
                        value: $appState.state.randomWalkSpeed,
                        range: 0.1...5,
                        icon: "figure.walk"
                    )
                    
                    ParameterSlider(
                        label: "Chord Rate",
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
                
                // MARK: - Synth Oscillator Section
                CollapsibleSection(title: "Synth Oscillator", icon: "waveform", expanded: $expandedSections) {
                    // Oscillator Brightness (0-3)
                    ParameterSlider(
                        label: "Brightness",
                        value: $appState.state.oscBrightness,
                        range: 0...3,
                        icon: "sun.max"
                    )
                    
                    ParameterSlider(
                        label: "Wave Spread",
                        value: $appState.state.waveSpread,
                        range: 0...30,
                        icon: "water.waves"
                    )
                    
                    ParameterSlider(
                        label: "Detune",
                        value: $appState.state.detune,
                        range: 0...25,
                        unit: "¢",
                        icon: "tuningfork"
                    )
                    
                    ParameterSlider(
                        label: "Hardness",
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
                CollapsibleSection(title: "Synth Timbre", icon: "slider.horizontal.3", expanded: $expandedSections) {
                    ParameterSlider(
                        label: "Warmth",
                        value: $appState.state.warmth,
                        range: 0...1,
                        icon: "flame"
                    )
                    
                    ParameterSlider(
                        label: "Presence",
                        value: $appState.state.presence,
                        range: 0...1,
                        icon: "waveform.badge.plus"
                    )
                    
                    ParameterSlider(
                        label: "Air/Noise",
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
                        value: $appState.state.synthAttack,
                        range: 0.01...16,
                        unit: "s",
                        icon: "arrow.up.right"
                    )
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.synthDecay,
                        range: 0.01...8,
                        unit: "s",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Sustain",
                        value: $appState.state.synthSustain,
                        range: 0...1,
                        icon: "arrow.right"
                    )
                    
                    ParameterSlider(
                        label: "Release",
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
                        value: $appState.state.filterCutoffMin,
                        range: 40...8000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                    
                    ParameterSlider(
                        label: "Cutoff Max",
                        value: $appState.state.filterCutoffMax,
                        range: 40...8000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                    
                    ParameterSlider(
                        label: "Mod Speed",
                        value: $appState.state.filterModSpeed,
                        range: 0...16,
                        icon: "waveform.path.ecg"
                    )
                    
                    ParameterSlider(
                        label: "Resonance",
                        value: $appState.state.filterResonance,
                        range: 0...1,
                        icon: "waveform.badge.magnifyingglass"
                    )
                    
                    ParameterSlider(
                        label: "Q",
                        value: $appState.state.filterQ,
                        range: 0.1...12,
                        icon: "q.circle"
                    )
                }
                
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
                            Text("iOS only - won't transfer to web app")
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
                        value: $appState.state.reverbDecay,
                        range: 0...1,
                        icon: "arrow.triangle.branch"
                    )
                    
                    ParameterSlider(
                        label: "Size",
                        value: $appState.state.reverbSize,
                        range: 0.5...3.0,
                        icon: "square.resize"
                    )
                    
                    ParameterSlider(
                        label: "Diffusion",
                        value: $appState.state.reverbDiffusion,
                        range: 0...1,
                        icon: "circle.hexagongrid"
                    )
                    
                    ParameterSlider(
                        label: "Modulation",
                        value: $appState.state.reverbModulation,
                        range: 0...1,
                        icon: "waveform.circle"
                    )
                    
                    ParameterSlider(
                        label: "Predelay",
                        value: $appState.state.predelay,
                        range: 0...100,
                        unit: "ms",
                        icon: "clock.arrow.circlepath"
                    )
                    
                    ParameterSlider(
                        label: "Damping",
                        value: $appState.state.damping,
                        range: 0...1,
                        icon: "line.3.horizontal.decrease"
                    )
                    
                    ParameterSlider(
                        label: "Width",
                        value: $appState.state.width,
                        range: 0...1,
                        icon: "arrow.left.and.right"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    Text("Send Levels")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))
                    
                    ParameterSlider(
                        label: "Synth Send",
                        value: $appState.state.synthReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )
                    
                    ParameterSlider(
                        label: "Granular Send",
                        value: $appState.state.granularReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )
                    
                    ParameterSlider(
                        label: "Lead Send",
                        value: $appState.state.leadReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )
                    
                    ParameterSlider(
                        label: "Lead Delay Send",
                        value: $appState.state.leadDelayReverbSend,
                        range: 0...1,
                        icon: "arrow.right.to.line"
                    )
                }
                
                // MARK: - Granular Section
                CollapsibleSection(title: "Granular", icon: "sparkles", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.granularEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Max Grains",
                        value: $appState.state.maxGrains,
                        range: 0...128,
                        icon: "square.grid.3x3.fill"
                    )
                    
                    ParameterSlider(
                        label: "Probability",
                        value: $appState.state.grainProbability,
                        range: 0...1,
                        icon: "percent"
                    )
                    
                    ParameterSlider(
                        label: "Density",
                        value: $appState.state.density,
                        range: 5...80,
                        unit: "/s",
                        icon: "square.grid.3x3"
                    )
                    
                    ParameterSlider(
                        label: "Size Min",
                        value: $appState.state.grainSizeMin,
                        range: 5...60,
                        unit: "ms",
                        icon: "circle.dotted"
                    )
                    
                    ParameterSlider(
                        label: "Size Max",
                        value: $appState.state.grainSizeMax,
                        range: 20...200,
                        unit: "ms",
                        icon: "circle"
                    )
                    
                    ParameterSlider(
                        label: "Spray",
                        value: $appState.state.spray,
                        range: 0...600,
                        unit: "ms",
                        icon: "shower"
                    )
                    
                    ParameterSlider(
                        label: "Jitter",
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
                        value: $appState.state.pitchSpread,
                        range: 0...12,
                        unit: "st",
                        icon: "arrow.up.and.down"
                    )
                    
                    ParameterSlider(
                        label: "Stereo Spread",
                        value: $appState.state.stereoSpread,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    ParameterSlider(
                        label: "Feedback",
                        value: $appState.state.feedback,
                        range: 0...0.35,
                        icon: "arrow.triangle.2.circlepath"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    Text("Wet Filters")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))
                    
                    ParameterSlider(
                        label: "HPF",
                        value: $appState.state.wetHPF,
                        range: 200...3000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                    
                    ParameterSlider(
                        label: "LPF",
                        value: $appState.state.wetLPF,
                        range: 3000...12000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                }
                
                // MARK: - Lead Synth Section
                CollapsibleSection(title: "Lead Synth", icon: "music.note", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.leadEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Density",
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
                        value: $appState.state.leadAttack,
                        range: 0.001...2,
                        unit: "s",
                        icon: "arrow.up.right"
                    )
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.leadDecay,
                        range: 0.01...4,
                        unit: "s",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Sustain",
                        value: $appState.state.leadSustain,
                        range: 0...1,
                        icon: "arrow.right"
                    )
                    
                    ParameterSlider(
                        label: "Hold",
                        value: $appState.state.leadHold,
                        range: 0...4,
                        unit: "s",
                        icon: "pause.circle"
                    )
                    
                    ParameterSlider(
                        label: "Release",
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
                        value: $appState.state.leadTimbreMin,
                        range: 0...1,
                        icon: "slider.horizontal.below.rectangle"
                    )
                    
                    ParameterSlider(
                        label: "Timbre Max",
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
                
                // MARK: - Euclidean Sequencer Section
                CollapsibleSection(title: "Euclidean Sequencer", icon: "circle.hexagongrid.fill", expanded: $expandedSections) {
                    Toggle("Master Enable", isOn: $appState.state.leadEuclideanMasterEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Tempo",
                        value: $appState.state.leadEuclideanTempo,
                        range: 0.25...12,
                        unit: "x",
                        icon: "metronome"
                    )
                    
                    // Lane 1
                    EuclideanLaneView(
                        laneNumber: 1,
                        enabled: $appState.state.leadEuclid1Enabled,
                        preset: $appState.state.leadEuclid1Preset,
                        steps: $appState.state.leadEuclid1Steps,
                        hits: $appState.state.leadEuclid1Hits,
                        rotation: $appState.state.leadEuclid1Rotation,
                        noteMin: $appState.state.leadEuclid1NoteMin,
                        noteMax: $appState.state.leadEuclid1NoteMax,
                        level: $appState.state.leadEuclid1Level,
                        probability: $appState.state.leadEuclid1Probability,
                        source: $appState.state.leadEuclid1Source
                    )
                    
                    // Lane 2
                    EuclideanLaneView(
                        laneNumber: 2,
                        enabled: $appState.state.leadEuclid2Enabled,
                        preset: $appState.state.leadEuclid2Preset,
                        steps: $appState.state.leadEuclid2Steps,
                        hits: $appState.state.leadEuclid2Hits,
                        rotation: $appState.state.leadEuclid2Rotation,
                        noteMin: $appState.state.leadEuclid2NoteMin,
                        noteMax: $appState.state.leadEuclid2NoteMax,
                        level: $appState.state.leadEuclid2Level,
                        probability: $appState.state.leadEuclid2Probability,
                        source: $appState.state.leadEuclid2Source
                    )
                    
                    // Lane 3
                    EuclideanLaneView(
                        laneNumber: 3,
                        enabled: $appState.state.leadEuclid3Enabled,
                        preset: $appState.state.leadEuclid3Preset,
                        steps: $appState.state.leadEuclid3Steps,
                        hits: $appState.state.leadEuclid3Hits,
                        rotation: $appState.state.leadEuclid3Rotation,
                        noteMin: $appState.state.leadEuclid3NoteMin,
                        noteMax: $appState.state.leadEuclid3NoteMax,
                        level: $appState.state.leadEuclid3Level,
                        probability: $appState.state.leadEuclid3Probability,
                        source: $appState.state.leadEuclid3Source
                    )
                    
                    // Lane 4
                    EuclideanLaneView(
                        laneNumber: 4,
                        enabled: $appState.state.leadEuclid4Enabled,
                        preset: $appState.state.leadEuclid4Preset,
                        steps: $appState.state.leadEuclid4Steps,
                        hits: $appState.state.leadEuclid4Hits,
                        rotation: $appState.state.leadEuclid4Rotation,
                        noteMin: $appState.state.leadEuclid4NoteMin,
                        noteMax: $appState.state.leadEuclid4NoteMax,
                        level: $appState.state.leadEuclid4Level,
                        probability: $appState.state.leadEuclid4Probability,
                        source: $appState.state.leadEuclid4Source
                    )
                }
                
                // MARK: - Ocean Section
                CollapsibleSection(title: "Ocean", icon: "water.waves", expanded: $expandedSections) {
                    Toggle("Sample Enabled", isOn: $appState.state.oceanSampleEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Sample Level",
                        value: $appState.state.oceanSampleLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    Toggle("Wave Synth Enabled", isOn: $appState.state.oceanWaveSynthEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Synth Level",
                        value: $appState.state.oceanWaveSynthLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
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
                        value: $appState.state.oceanFilterCutoff,
                        range: 40...12000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                    
                    ParameterSlider(
                        label: "Resonance",
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
                
                // MARK: - Drum Synth Section
                CollapsibleSection(title: "Drum Synth", icon: "metronome", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.drumEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Level",
                        value: $appState.state.drumLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    ParameterSlider(
                        label: "Reverb Send",
                        value: $appState.state.drumReverbSend,
                        range: 0...1,
                        icon: "waveform.path"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Sub Voice
                    Text("Sub (Deep Pulse)")
                        .font(.subheadline)
                        .foregroundColor(.cyan.opacity(0.8))
                    
                    ParameterSlider(
                        label: "Frequency",
                        value: $appState.state.drumSubFreq,
                        range: 30...100,
                        unit: "Hz",
                        icon: "waveform"
                    )
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.drumSubDecay,
                        range: 20...500,
                        unit: "ms",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Level",
                        value: $appState.state.drumSubLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Kick Voice
                    Text("Kick")
                        .font(.subheadline)
                        .foregroundColor(.cyan.opacity(0.8))
                    
                    ParameterSlider(
                        label: "Frequency",
                        value: $appState.state.drumKickFreq,
                        range: 40...150,
                        unit: "Hz",
                        icon: "waveform"
                    )
                    
                    ParameterSlider(
                        label: "Pitch Sweep",
                        value: $appState.state.drumKickPitchEnv,
                        range: 0...48,
                        unit: "st",
                        icon: "arrow.up.right"
                    )
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.drumKickDecay,
                        range: 30...500,
                        unit: "ms",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Level",
                        value: $appState.state.drumKickLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Click Voice
                    Text("Click (Data Sound)")
                        .font(.subheadline)
                        .foregroundColor(.cyan.opacity(0.8))
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.drumClickDecay,
                        range: 1...80,
                        unit: "ms",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Filter",
                        value: $appState.state.drumClickFilter,
                        range: 500...15000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                    
                    ParameterSlider(
                        label: "Level",
                        value: $appState.state.drumClickLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Beep Hi Voice
                    Text("Beep Hi")
                        .font(.subheadline)
                        .foregroundColor(.cyan.opacity(0.8))
                    
                    ParameterSlider(
                        label: "Frequency",
                        value: $appState.state.drumBeepHiFreq,
                        range: 2000...12000,
                        unit: "Hz",
                        icon: "waveform"
                    )
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.drumBeepHiDecay,
                        range: 10...500,
                        unit: "ms",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Level",
                        value: $appState.state.drumBeepHiLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Beep Lo Voice
                    Text("Beep Lo")
                        .font(.subheadline)
                        .foregroundColor(.cyan.opacity(0.8))
                    
                    ParameterSlider(
                        label: "Frequency",
                        value: $appState.state.drumBeepLoFreq,
                        range: 150...2000,
                        unit: "Hz",
                        icon: "waveform"
                    )
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.drumBeepLoDecay,
                        range: 10...500,
                        unit: "ms",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Level",
                        value: $appState.state.drumBeepLoLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Noise Voice
                    Text("Noise (Hi-Hat)")
                        .font(.subheadline)
                        .foregroundColor(.cyan.opacity(0.8))
                    
                    ParameterSlider(
                        label: "Filter Freq",
                        value: $appState.state.drumNoiseFilterFreq,
                        range: 500...15000,
                        unit: "Hz",
                        icon: "line.diagonal"
                    )
                    
                    ParameterSlider(
                        label: "Decay",
                        value: $appState.state.drumNoiseDecay,
                        range: 5...300,
                        unit: "ms",
                        icon: "arrow.down.right"
                    )
                    
                    ParameterSlider(
                        label: "Level",
                        value: $appState.state.drumNoiseLevel,
                        range: 0...1,
                        icon: "speaker.wave.2"
                    )
                }
                
                // MARK: - Drum Random Mode Section
                CollapsibleSection(title: "Drum Random", icon: "dice", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.drumRandomEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Density",
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
                        value: $appState.state.drumRandomSubProb,
                        range: 0...1,
                        icon: "waveform.path.badge.minus"
                    )
                    
                    ParameterSlider(
                        label: "Kick",
                        value: $appState.state.drumRandomKickProb,
                        range: 0...1,
                        icon: "circle.fill"
                    )
                    
                    ParameterSlider(
                        label: "Click",
                        value: $appState.state.drumRandomClickProb,
                        range: 0...1,
                        icon: "hand.tap"
                    )
                    
                    ParameterSlider(
                        label: "Beep Hi",
                        value: $appState.state.drumRandomBeepHiProb,
                        range: 0...1,
                        icon: "bell"
                    )
                    
                    ParameterSlider(
                        label: "Beep Lo",
                        value: $appState.state.drumRandomBeepLoProb,
                        range: 0...1,
                        icon: "bell.fill"
                    )
                    
                    ParameterSlider(
                        label: "Noise",
                        value: $appState.state.drumRandomNoiseProb,
                        range: 0...1,
                        icon: "waveform.circle"
                    )
                }
                
                // MARK: - Drum Euclidean Section
                CollapsibleSection(title: "Drum Euclidean", icon: "circle.dotted", expanded: $expandedSections) {
                    Toggle("Enabled", isOn: $appState.state.drumEuclidMasterEnabled)
                        .foregroundColor(.white)
                    
                    ParameterSlider(
                        label: "Base BPM",
                        value: $appState.state.drumEuclidBaseBPM,
                        range: 40...240,
                        unit: "BPM",
                        icon: "metronome"
                    )
                    
                    ParameterSlider(
                        label: "Tempo",
                        value: $appState.state.drumEuclidTempo,
                        range: 0.25...4,
                        icon: "speedometer"
                    )
                    
                    ParameterSlider(
                        label: "Swing",
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
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Lane 1
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
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Lane 2
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
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Lane 3
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
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    // Lane 4
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
                        value: Binding(
                            get: { Double(appState.state.cofDriftRange) },
                            set: { appState.state.cofDriftRange = Int($0) }
                        ),
                        range: 1...6,
                        unit: " steps",
                        icon: "ruler"
                    )
                }
                
                // MARK: - Debug Info Section
                CollapsibleSection(title: "Debug Info", icon: "ladybug", expanded: $expandedSections) {
                    DebugInfoView()
                }
            }
            .padding()
        }
    }
}

// MARK: - Collapsible Section
struct CollapsibleSection<Content: View>: View {
    let title: String
    let icon: String
    @Binding var expanded: Set<String>
    @ViewBuilder let content: Content
    
    var isExpanded: Bool {
        expanded.contains(title)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
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
                        .foregroundColor(.cyan)
                        .frame(width: 24)
                    
                    Text(title)
                        .font(.headline)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.white.opacity(0.5))
                }
                .padding()
                .background(Color.white.opacity(0.08))
                .cornerRadius(isExpanded ? 12 : 12, corners: isExpanded ? [.topLeft, .topRight] : .allCorners)
            }
            
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

// MARK: - Corner Radius Extension
extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners
    
    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
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
        generateEuclideanPattern(steps: steps, hits: hits, rotation: rotation)
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
    
    func generateEuclideanPattern(steps: Int, hits: Int, rotation: Int) -> [Bool] {
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
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Lane header with colored toggle button
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
            
            if enabled {
                // Pattern visualization with lane color
                EuclideanPatternView(pattern: pattern, color: laneColor)
                    .frame(height: 28)
                
                // Preset picker with grouped options
                Menu {
                    ForEach(presetGroups, id: \.name) { group in
                        Section(group.name) {
                            ForEach(group.presets, id: \.id) { p in
                                Button(p.label) { preset = p.id }
                            }
                        }
                    }
                    Divider()
                    Button("Custom") { preset = "custom" }
                } label: {
                    HStack {
                        Text(preset == "custom" ? "Custom" : 
                             presetGroups.flatMap { $0.presets }.first { $0.id == preset }?.label ?? preset)
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
                
                // Voice toggle buttons with icons
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
                
                // Custom mode: Steps & Hits
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
                
                // Probability and Rotation row
                HStack(spacing: 12) {
                    // Probability slider
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Probability \(Int(probability * 100))%")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.6))
                        Slider(value: $probability, in: 0...1)
                            .tint(.orange)
                    }
                    .frame(maxWidth: .infinity)
                    
                    // Rotation with arrow buttons
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
                
                // Velocity range (dual slider like webapp)
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
                    
                    // Visual range bar
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            // Background track
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.white.opacity(0.1))
                                .frame(height: 6)
                            
                            // Active range
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
                        // Toggle between single and dual mode
                        if isVelocityDual {
                            let mid = (velocityMin + velocityMax) / 2
                            velocityMin = mid
                            velocityMax = mid
                        } else {
                            velocityMin = max(0, velocityMin - 0.2)
                            velocityMax = min(1, velocityMax + 0.2)
                        }
                    }
                    
                    // Dual sliders for min/max
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

// MARK: - Reusable Parameter Slider
struct ParameterSlider: View {
    let label: String
    let paramKey: String  // Key for dual range storage
    @Binding var value: Double
    let range: ClosedRange<Double>
    var unit: String = ""
    var icon: String = "slider.horizontal.3"
    
    @EnvironmentObject var appState: AppState
    
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
                Slider(value: $value, in: range)
                    .tint(.cyan)
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
    init(label: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String = "", icon: String = "slider.horizontal.3") {
        self.label = label
        self.paramKey = label.lowercased().replacingOccurrences(of: " ", with: "")
        self._value = value
        self.range = range
        self.unit = unit
        self.icon = icon
    }
}

// MARK: - Integer binding for sliders
extension ParameterSlider {
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

#Preview {
    SliderControlsView()
        .background(Color.black)
        .environmentObject(AppState())
}