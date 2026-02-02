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
                        label: "Reverb",
                        value: $appState.state.reverbLevel,
                        range: 0...2,
                        icon: "waveform.path"
                    )
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
                        level: $appState.state.leadEuclid1Level
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
                        level: $appState.state.leadEuclid2Level
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
                        level: $appState.state.leadEuclid3Level
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
                        level: $appState.state.leadEuclid4Level
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
                    
                    ParameterSlider(
                        label: "Duration Min",
                        value: $appState.state.oceanDurationMin,
                        range: 2...15,
                        unit: "s",
                        icon: "clock"
                    )
                    
                    ParameterSlider(
                        label: "Duration Max",
                        value: $appState.state.oceanDurationMax,
                        range: 2...15,
                        unit: "s",
                        icon: "clock"
                    )
                    
                    ParameterSlider(
                        label: "Interval Min",
                        value: $appState.state.oceanIntervalMin,
                        range: 3...20,
                        unit: "s",
                        icon: "timer"
                    )
                    
                    ParameterSlider(
                        label: "Interval Max",
                        value: $appState.state.oceanIntervalMax,
                        range: 3...20,
                        unit: "s",
                        icon: "timer"
                    )
                    
                    Divider().background(Color.white.opacity(0.2))
                    
                    Text("Character")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.6))
                    
                    ParameterSlider(
                        label: "Foam Min",
                        value: $appState.state.oceanFoamMin,
                        range: 0...1,
                        icon: "bubble.left.and.bubble.right"
                    )
                    
                    ParameterSlider(
                        label: "Foam Max",
                        value: $appState.state.oceanFoamMax,
                        range: 0...1,
                        icon: "bubble.left.and.bubble.right"
                    )
                    
                    ParameterSlider(
                        label: "Depth Min",
                        value: $appState.state.oceanDepthMin,
                        range: 0...1,
                        icon: "arrow.down.to.line"
                    )
                    
                    ParameterSlider(
                        label: "Depth Max",
                        value: $appState.state.oceanDepthMax,
                        range: 0...1,
                        icon: "arrow.down.to.line"
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
    let release: Double
    
    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            
            // Normalize times for display
            let totalTime = attack + decay + 0.3 + release  // 0.3 for sustain hold
            let aX = CGFloat(attack / totalTime) * width
            let dX = CGFloat(decay / totalTime) * width
            let sX: CGFloat = 0.3 / CGFloat(totalTime) * width
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
    
    @State private var isExpanded = false
    
    private let presets = [
        "lancaran", "ketawang", "ladrang", "gangsaran", "kotekan", "kotekan2",
        "srepegan", "sampak", "ayak", "bonang", "clapping", "clappingB",
        "poly3v4", "poly4v3", "poly5v4", "additive7", "additive11", "additive13",
        "reich18", "drumming", "sparse", "dense", "longSparse", "custom"
    ]
    
    var body: some View {
        VStack(spacing: 8) {
            // Lane header
            HStack {
                Toggle("Lane \(laneNumber)", isOn: $enabled)
                    .foregroundColor(.white)
                
                Spacer()
                
                Button(action: { isExpanded.toggle() }) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.white.opacity(0.5))
                }
            }
            
            if isExpanded && enabled {
                // Preset picker
                HStack {
                    Text("Preset")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.6))
                    Spacer()
                    Picker("Preset", selection: $preset) {
                        ForEach(presets, id: \.self) { p in
                            Text(p).tag(p)
                        }
                    }
                    .pickerStyle(.menu)
                    .accentColor(.cyan)
                }
                
                // Pattern visualization
                EuclideanPatternView(steps: steps, hits: hits, rotation: rotation)
                    .frame(height: 30)
                
                // Steps/Hits/Rotation
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
                    
                    VStack {
                        Text("Rot")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.5))
                        Stepper("\(rotation)", value: $rotation, in: 0...(steps - 1))
                            .labelsHidden()
                    }
                }
                
                // Note range
                HStack {
                    Text("Notes: \(noteMin)-\(noteMax)")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.6))
                    Spacer()
                }
                
                // Level
                ParameterSlider(
                    label: "Level",
                    value: $level,
                    range: 0...1,
                    icon: "speaker.wave.2"
                )
            }
        }
        .padding()
        .background(Color.white.opacity(0.03))
        .cornerRadius(8)
    }
}

// MARK: - Euclidean Pattern Visualization
struct EuclideanPatternView: View {
    let steps: Int
    let hits: Int
    let rotation: Int
    
    var pattern: [Bool] {
        generateEuclideanPattern(steps: steps, hits: hits, rotation: rotation)
    }
    
    var body: some View {
        GeometryReader { geometry in
            let stepWidth = geometry.size.width / CGFloat(steps)
            
            HStack(spacing: 1) {
                ForEach(0..<steps, id: \.self) { i in
                    Rectangle()
                        .fill(pattern[i] ? Color.cyan : Color.white.opacity(0.1))
                        .frame(width: max(stepWidth - 2, 4))
                }
            }
        }
    }
    
    func generateEuclideanPattern(steps: Int, hits: Int, rotation: Int) -> [Bool] {
        guard hits > 0 && hits <= steps else {
            return Array(repeating: false, count: steps)
        }
        
        var pattern = [Bool]()
        var remainder = [Int](repeating: 1, count: hits)
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

#Preview {
    SliderControlsView()
        .background(Color.black)
        .environmentObject(AppState())
}