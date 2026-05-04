import SwiftUI

struct KesshoMacPageHost: View {
    let page: KesshoMacPage

    var body: some View {
        switch page {
        case .global:
            KesshoMacGlobalPage()
        case .synth:
            KesshoMacSynthPage()
        case .drums:
            KesshoMacDrumsPage()
        case .earth:
            KesshoMacEarthPage()
        case .granular:
            KesshoMacGranularPage()
        case .delay:
            KesshoMacDelayPage()
        case .reverb:
            KesshoMacReverbPage()
        case .dynamics:
            KesshoMacDynamicsPage()
        case .routing:
            KesshoMacRoutingPage()
        }
    }
}

struct KesshoMacGlobalPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .global)

    var body: some View {
        KesshoMacPageFrame(page: .global) {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 10) {
                    pageIdentity
                    masterMixer
                    presetCard
                }
                .frame(width: KesshoMacDesign.sidePanelWidth)

                VStack(spacing: 10) {
                    morphCard
                    harmonyCard
                    transportCard
                    midiCard
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var pageIdentity: some View {
        HStack(spacing: 10) {
            Text("◎ Global")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(accent)
            Spacer()
            KesshoMacStatusPill(title: "State", value: appState.isPlaying ? "PLAYING" : "READY", accent: appState.isPlaying ? KesshoMacDesign.green : accent)
        }
    }

    private var masterMixer: some View {
        KesshoMacCard(title: "Master Mixer", symbol: "slider.horizontal.3", accent: accent) {
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                alignment: .leading,
                spacing: 10
            ) {
                mixerGroup("Pad", [
                    .init("Pad", key: "synthLevel", icon: "waveform", value: \.synthLevel),
                    .init("Reverb", key: "synthReverbSend", icon: "diamond", value: \.synthReverbSend),
                    .init("Delay A", key: "pad1DelayASend", icon: "repeat", value: \.pad1DelayASend),
                    .init("Delay B", key: "pad1DelayBSend", icon: "repeat.circle", value: \.pad1DelayBSend),
                ])

                mixerGroup("Lead", [
                    .init("Lead 1", key: "leadLevel", icon: "music.note", value: \.leadLevel),
                    .init("Lead 2", key: "lead2Level", icon: "music.quarternote.3", value: \.lead2Level),
                    .init("Reverb 1", key: "leadReverbSend", icon: "diamond", value: \.leadReverbSend),
                    .init("Reverb 2", key: "lead2ReverbSend", icon: "diamond", value: \.lead2ReverbSend),
                ])

                mixerGroup("Drum", [
                    .init("Level", key: "drumLevel", icon: "circle.grid.cross", value: \.drumLevel),
                    .init("Reverb", key: "drumReverbSend", icon: "diamond", value: \.drumReverbSend),
                    .init("Delay A", key: "drumDelayASend", icon: "repeat", value: \.drumDelayASend),
                    .init("Delay B", key: "drumDelayBSend", icon: "repeat.circle", value: \.drumDelayBSend),
                ])

                mixerGroup("Granular", [
                    .init("Level", key: "granularLevel", icon: "sparkles", value: \.granularLevel),
                    .init("Reverb", key: "granularReverbSend", icon: "diamond", value: \.granularReverbSend),
                    .init("Delay Mix", key: "granularDelayMix", icon: "repeat", value: \.granularDelayMix),
                    .init("Delay Rev", key: "granularDelayReverbSend", icon: "diamond", value: \.granularDelayReverbSend),
                ])

                mixerGroup("Earth", [
                    .init("Waves", key: "oceanSampleLevel", icon: "water.waves", value: \.oceanSampleLevel),
                    .init("Water", key: "waterLevel", icon: "drop", value: \.waterLevel),
                    .init("Insects", key: "insectsSharedLevel", icon: "antenna.radiowaves.left.and.right", value: \.insectsSharedLevel),
                    .init("Nature", key: "natureLevel", icon: "leaf", value: \.natureLevel),
                ])

                mixerGroup("Output", [
                    .init("Master", key: "masterVolume", icon: "speaker.wave.2", value: \.masterVolume),
                    .init("Reverb", key: "reverbLevel", icon: "diamond", value: \.reverbLevel),
                    .init("Earth Bus", key: "earthLevel", icon: "globe", value: \.earthLevel),
                ])
            }
        }
    }

    private var presetCard: some View {
        KesshoMacCard(title: "Presets", symbol: "tray.full", accent: accent) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Button("Save Snapshot") {
                        let formatter = DateFormatter()
                        formatter.dateFormat = "yyyy-MM-dd HH.mm"
                        appState.saveCurrentAsPreset(name: "Mac Snapshot \(formatter.string(from: Date()))")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    Spacer()

                    Text("\(appState.savedPresets.count) loaded")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.secondaryText)
                }

                VStack(spacing: 6) {
                    ForEach(appState.savedPresets.prefix(6)) { preset in
                        Button {
                            appState.loadPreset(preset)
                        } label: {
                            HStack {
                                Text(preset.name)
                                    .lineLimit(1)
                                    .font(.system(size: 11, weight: .semibold))
                                Spacer()
                                Image(systemName: "arrow.down.circle")
                                    .font(.system(size: 11, weight: .bold))
                            }
                            .foregroundStyle(KesshoMacDesign.text)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(KesshoMacDesign.control)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var morphCard: some View {
        KesshoMacCard(title: "Preset Morph", symbol: "arrow.triangle.2.circlepath", accent: accent) {
            VStack(spacing: 10) {
                HStack {
                    KesshoMacStatusPill(title: "A", value: appState.morphPresetA?.name ?? "EMPTY", accent: accent)
                    KesshoMacStatusPill(title: "B", value: appState.morphPresetB?.name ?? "EMPTY", accent: accent)
                    Spacer()
                    KesshoMacToggleRow(
                        title: "Auto",
                        symbol: "clock.arrow.circlepath",
                        accent: accent,
                        isOn: Binding(
                            get: { appState.autoMorphEnabled },
                            set: { newValue in
                                if appState.autoMorphEnabled != newValue {
                                    appState.toggleAutoMorph()
                                }
                            }
                        )
                    )
                    .frame(width: 120)
                }

                KesshoMacSliderRow(
                    spec: .init("Morph", key: "morphPosition", icon: "circle.lefthalf.filled", value: \.randomness, range: 0...100, style: .percent),
                    accent: accent
                )
                .opacity(0.001)
                .frame(height: 0)

                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text("Morph")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(KesshoMacDesign.text)
                        Spacer()
                        Text("\(Int(appState.morphPosition.rounded()))%")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundStyle(KesshoMacDesign.secondaryText)
                    }
                    Slider(
                        value: Binding(
                            get: { appState.morphPosition },
                            set: { appState.setMorphPosition($0) }
                        ),
                        in: 0...100
                    )
                    .tint(accent)
                }
            }
        }
    }

    private var harmonyCard: some View {
        KesshoMacCard(title: "Scale + Tension", symbol: "circle.hexagongrid", accent: accent) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    KesshoMacStatusPill(title: "Scale", value: appState.currentScaleName.isEmpty ? appState.state.manualScale : appState.currentScaleName, accent: accent)
                    KesshoMacStatusPill(title: "Root", value: "\(appState.state.rootNote)", accent: accent)
                    Spacer()
                }

                KesshoMacSliderGrid(specs: [
                    .init("Tension", key: "tension", icon: "gauge.with.dots.needle.33percent", value: \.tension),
                    .init("Randomness", key: "randomness", icon: "shuffle", value: \.randomness),
                    .init("Voicing", key: "voicingSpread", icon: "pianokeys", value: \.voicingSpread),
                    .init("Chord Rate", key: "chordRate", icon: "metronome", value: \.chordRateDouble, range: 4...64, style: .integer),
                ], accent: accent, columns: 2)
            }
        }
    }

    private var transportCard: some View {
        KesshoMacCard(title: "Transport Sync", symbol: "metronome", accent: accent) {
            KesshoMacSliderGrid(specs: [
                .init("Walk Speed", key: "randomWalkSpeed", icon: "waveform.path", value: \.randomWalkSpeed, range: 0.1...5),
                .init("Filter Min", key: "filterCutoffMin", icon: "line.3.horizontal.decrease", value: \.filterCutoffMin, range: 80...3_000, style: .hertz),
                .init("Filter Max", key: "filterCutoffMax", icon: "line.3.horizontal.decrease.circle", value: \.filterCutoffMax, range: 400...14_000, style: .hertz),
                .init("Resonance", key: "filterResonance", icon: "dot.radiowaves.left.and.right", value: \.filterResonance),
            ], accent: accent, columns: 2)
        }
    }

    private var midiCard: some View {
        KesshoMacCard(title: "MIDI", symbol: "cable.connector", accent: accent) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(appState.latestMIDISummary)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(KesshoMacDesign.secondaryText)
                        .lineLimit(1)
                    Spacer()
                    Button("Refresh") {
                        appState.refreshMIDIInputs()
                    }
                    .controlSize(.small)
                }

                ForEach(appState.midiManager.availableInputs) { input in
                    KesshoMacToggleRow(
                        title: input.name,
                        symbol: "pianokeys",
                        accent: accent,
                        isOn: Binding(
                            get: { appState.midiManager.connectedInputIDs.contains(input.uniqueID) },
                            set: { appState.setMIDIInputConnected(input.uniqueID, isConnected: $0) }
                        )
                    )
                }
            }
        }
    }

    private func mixerGroup(_ title: String, _ specs: [KesshoMacSliderSpec]) -> some View {
        KesshoMacSection(title: title) {
            KesshoMacSliderGrid(specs: specs, accent: accent)
        }
    }
}

private struct KesshoMacSynthPage: View {
    private let accent = KesshoMacDesign.accent(for: .synth)

    var body: some View {
        KesshoMacPageFrame(page: .synth) {
            KesshoMacTwoColumn(
                leading: {
                    KesshoMacCard(title: "Pad + Lead Sources", symbol: "waveform", accent: accent) {
                        KesshoMacSliderGrid(specs: [
                            .init("Pad Level", key: "synthLevel", icon: "waveform", value: \.synthLevel),
                            .init("Pad Reverb", key: "synthReverbSend", icon: "diamond", value: \.synthReverbSend),
                            .init("Lead 1", key: "leadLevel", icon: "music.note", value: \.leadLevel),
                            .init("Lead 2", key: "lead2Level", icon: "music.quarternote.3", value: \.lead2Level),
                            .init("Piano", key: "pianoLevel", icon: "pianokeys", value: \.pianoLevel),
                            .init("Piano Reverb", key: "pianoReverbSend", icon: "diamond", value: \.pianoReverbSend),
                        ], accent: accent)
                    }
                },
                trailing: {
                    KesshoMacCard(title: "Filter + Tone", symbol: "line.3.horizontal.decrease", accent: accent) {
                        KesshoMacSliderGrid(specs: [
                            .init("Hardness", key: "hardness", icon: "hammer", value: \.hardness),
                            .init("Warmth", key: "warmth", icon: "thermometer.medium", value: \.warmth),
                            .init("Presence", key: "presence", icon: "sparkle.magnifyingglass", value: \.presence),
                            .init("Air", key: "airNoise", icon: "wind", value: \.airNoise),
                            .init("Cutoff Min", key: "filterCutoffMin", icon: "line.3.horizontal.decrease", value: \.filterCutoffMin, range: 80...3_000, style: .hertz),
                            .init("Cutoff Max", key: "filterCutoffMax", icon: "line.3.horizontal.decrease.circle", value: \.filterCutoffMax, range: 400...14_000, style: .hertz),
                        ], accent: accent, columns: 2)
                    }
                }
            )
        }
    }
}

private struct KesshoMacDrumsPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .drums)

    var body: some View {
        KesshoMacPageFrame(page: .drums) {
            KesshoMacTwoColumn {
                KesshoMacCard(title: "Drum Bus", symbol: "circle.grid.cross", accent: accent) {
                    KesshoMacToggleRow(title: "Drum Engine", symbol: "power", accent: accent, isOn: $appState.state.drumEnabled)
                    KesshoMacSliderGrid(specs: [
                        .init("Level", key: "drumLevel", icon: "speaker.wave.2", value: \.drumLevel),
                        .init("Reverb", key: "drumReverbSend", icon: "diamond", value: \.drumReverbSend),
                        .init("Delay Feedback", key: "drumDelayFeedback", icon: "repeat", value: \.drumDelayFeedback),
                        .init("Delay Mix", key: "drumDelayMix", icon: "slider.horizontal.3", value: \.drumDelayMix),
                    ], accent: accent)
                }
            } trailing: {
                KesshoMacCard(title: "Random Rhythm", symbol: "dice", accent: accent) {
                    KesshoMacToggleRow(title: "Random Drum Generator", symbol: "shuffle", accent: accent, isOn: $appState.state.drumRandomEnabled)
                    KesshoMacSliderGrid(specs: [
                        .init("Density", key: "drumRandomDensity", icon: "circle.grid.3x3", value: \.drumRandomDensity),
                        .init("Sub", key: "drumRandomSubProb", icon: "circle.fill", value: \.drumRandomSubProb),
                        .init("Kick", key: "drumRandomKickProb", icon: "circle", value: \.drumRandomKickProb),
                        .init("Click", key: "drumRandomClickProb", icon: "smallcircle.filled.circle", value: \.drumRandomClickProb),
                        .init("Beep Hi", key: "drumRandomBeepHiProb", icon: "dot.circle", value: \.drumRandomBeepHiProb),
                        .init("Noise", key: "drumRandomNoiseProb", icon: "waveform.path", value: \.drumRandomNoiseProb),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }
}

private struct KesshoMacEarthPage: View {
    private let accent = KesshoMacDesign.accent(for: .earth)

    var body: some View {
        KesshoMacPageFrame(page: .earth) {
            KesshoMacTwoColumn {
                KesshoMacCard(title: "Water + Ocean", symbol: "water.waves", accent: accent) {
                    KesshoMacSliderGrid(specs: [
                        .init("Ocean Level", key: "oceanSampleLevel", icon: "water.waves", value: \.oceanSampleLevel),
                        .init("Ocean Reverb", key: "oceanReverbSend", icon: "diamond", value: \.oceanReverbSend),
                        .init("Slice Density", key: "oceanSliceDensity", icon: "square.grid.3x3", value: \.oceanSliceDensity),
                        .init("Water Level", key: "waterLevel", icon: "drop", value: \.waterLevel),
                        .init("Water Intensity", key: "waterIntensity", icon: "drop.degreesign", value: \.waterIntensity),
                        .init("Water Reverb", key: "waterReverbSend", icon: "diamond", value: \.waterReverbSend),
                    ], accent: accent)
                }
            } trailing: {
                KesshoMacCard(title: "Nature + Insects", symbol: "leaf", accent: accent) {
                    KesshoMacSliderGrid(specs: [
                        .init("Nature", key: "natureLevel", icon: "leaf", value: \.natureLevel),
                        .init("Birds", key: "birdsLevel", icon: "bird", value: \.birdsLevel),
                        .init("Frogs", key: "frogsLevel", icon: "speaker.wave.1", value: \.frogsLevel),
                        .init("Insects", key: "insectsSharedLevel", icon: "antenna.radiowaves.left.and.right", value: \.insectsSharedLevel),
                        .init("Density", key: "insectsDensity", icon: "circle.grid.3x3", value: \.insectsDensity),
                        .init("Temperature", key: "insectsTemperature", icon: "thermometer.medium", value: \.insectsTemperature),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }
}

private struct KesshoMacGranularPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .granular)

    var body: some View {
        KesshoMacPageFrame(page: .granular) {
            KesshoMacTwoColumn {
                KesshoMacCard(title: "Granular Voice", symbol: "sparkles", accent: accent) {
                    KesshoMacToggleRow(title: "Granular Engine", symbol: "power", accent: accent, isOn: $appState.state.granularEnabled)
                    KesshoMacSliderGrid(specs: [
                        .init("Level", key: "granularLevel", icon: "speaker.wave.2", value: \.granularLevel),
                        .init("Probability", key: "grainProbability", icon: "dice", value: \.grainProbability),
                        .init("Density", key: "density", icon: "circle.grid.3x3", value: \.density, range: 1...80, style: .integer),
                        .init("Spray", key: "spray", icon: "wind", value: \.spray, range: 0...500, style: .milliseconds),
                        .init("Size Min", key: "grainSizeMin", icon: "arrow.down.left.and.arrow.up.right", value: \.grainSizeMin, range: 5...200, style: .milliseconds),
                        .init("Size Max", key: "grainSizeMax", icon: "arrow.up.left.and.arrow.down.right", value: \.grainSizeMax, range: 10...400, style: .milliseconds),
                    ], accent: accent, columns: 2)
                }
            } trailing: {
                KesshoMacCard(title: "Granular Delay", symbol: "repeat", accent: accent) {
                    KesshoMacToggleRow(title: "Granular Delay", symbol: "power", accent: accent, isOn: $appState.state.granularDelayEnabled)
                    KesshoMacSliderGrid(specs: [
                        .init("Activity", key: "granularDelayActivity", icon: "waveform.path", value: \.granularDelayActivity),
                        .init("Repeats", key: "granularDelayRepeats", icon: "repeat", value: \.granularDelayRepeats),
                        .init("Filter", key: "granularDelayFilter", icon: "line.3.horizontal.decrease", value: \.granularDelayFilter),
                        .init("Vibrato", key: "granularDelayVibrato", icon: "waveform", value: \.granularDelayVibrato),
                        .init("Mix", key: "granularDelayMix", icon: "slider.horizontal.3", value: \.granularDelayMix),
                        .init("Reverb", key: "granularDelayReverbSend", icon: "diamond", value: \.granularDelayReverbSend),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }
}

private struct KesshoMacDelayPage: View {
    private let accent = KesshoMacDesign.accent(for: .delay)

    var body: some View {
        KesshoMacPageFrame(page: .delay) {
            KesshoMacTwoColumn {
                KesshoMacCard(title: "Delay A", symbol: "repeat", accent: accent) {
                    KesshoMacSliderGrid(specs: [
                        .init("Time", key: "delayATime", icon: "clock", value: \.delayATime, range: 40...1_500, style: .milliseconds),
                        .init("Feedback", key: "delayAFeedback", icon: "arrow.triangle.2.circlepath", value: \.delayAFeedback),
                        .init("Mix", key: "delayAMix", icon: "slider.horizontal.3", value: \.delayAMix),
                        .init("Spread", key: "delayASpread", icon: "arrow.left.and.right", value: \.delayASpread, range: 0...2),
                        .init("Filter", key: "delayAFilter", icon: "line.3.horizontal.decrease", value: \.delayAFilter, range: 100...12_000, style: .hertz),
                        .init("Reverb", key: "delayAReverbSend", icon: "diamond", value: \.delayAReverbSend),
                    ], accent: accent, columns: 2)
                }
            } trailing: {
                KesshoMacCard(title: "Delay B + Cross Sends", symbol: "repeat.circle", accent: accent) {
                    KesshoMacSliderGrid(specs: [
                        .init("Warp", key: "delayBWarpIntensity", icon: "waveform", value: \.delayBWarpIntensity),
                        .init("Spread", key: "delayBSpread", icon: "arrow.left.and.right", value: \.delayBSpread),
                        .init("B to A", key: "delayBToASend", icon: "arrowshape.turn.up.left", value: \.delayBToASend),
                        .init("A to Granular", key: "delayAGranularSend", icon: "sparkles", value: \.delayAGranularSend),
                        .init("B to Granular", key: "delayBGranularSend", icon: "sparkles", value: \.delayBGranularSend),
                        .init("Cross Filter", key: "delayACrossFeedFilter", icon: "line.3.horizontal.decrease.circle", value: \.delayACrossFeedFilter),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }
}

private struct KesshoMacReverbPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .reverb)

    var body: some View {
        KesshoMacPageFrame(page: .reverb) {
            KesshoMacTwoColumn {
                KesshoMacCard(title: "Algorithmic Reverb", symbol: "diamond", accent: accent) {
                    KesshoMacToggleRow(title: "Reverb Engine", symbol: "power", accent: accent, isOn: $appState.state.reverbEnabled)
                    KesshoMacSliderGrid(specs: [
                        .init("Return Level", key: "reverbLevel", icon: "speaker.wave.2", value: \.reverbLevel),
                        .init("Decay", key: "reverbDecay", icon: "timer", value: \.reverbDecay),
                        .init("Size", key: "reverbSize", icon: "arrow.up.left.and.arrow.down.right", value: \.reverbSize, range: 0.5...3),
                        .init("Diffusion", key: "reverbDiffusion", icon: "circle.hexagongrid", value: \.reverbDiffusion),
                        .init("Modulation", key: "reverbModulation", icon: "waveform", value: \.reverbModulation),
                        .init("Predelay", key: "predelay", icon: "clock", value: \.predelay, range: 0...300, style: .milliseconds),
                    ], accent: accent, columns: 2)
                }
            } trailing: {
                KesshoMacCard(title: "Tone + Space", symbol: "sparkle", accent: accent) {
                    KesshoMacSliderGrid(specs: [
                        .init("Damping", key: "damping", icon: "line.3.horizontal.decrease", value: \.damping),
                        .init("Width", key: "width", icon: "arrow.left.and.right", value: \.width),
                        .init("Shimmer", key: "reverbShimmer", icon: "sparkles", value: \.reverbShimmer),
                        .init("Pitch", key: "reverbShimmerPitch", icon: "music.note", value: \.reverbShimmerPitch, range: -24...24, style: .integer),
                        .init("Warp", key: "reverbWarp", icon: "waveform", value: \.reverbWarp),
                        .init("Cross Feed", key: "reverbCrossFeed", icon: "arrow.left.arrow.right", value: \.reverbCrossFeed),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }
}

private struct KesshoMacDynamicsPage: View {
    @EnvironmentObject private var appState: AppState
    private let accent = KesshoMacDesign.accent(for: .dynamics)

    var body: some View {
        KesshoMacPageFrame(page: .dynamics) {
            KesshoMacTwoColumn {
                KesshoMacCard(title: "Character", symbol: "waveform.path.ecg", accent: accent) {
                    KesshoMacToggleRow(title: "Character Engine", symbol: "power", accent: accent, isOn: $appState.state.characterEnabled)
                    KesshoMacSliderGrid(specs: [
                        .init("Mix", key: "characterMix", icon: "slider.horizontal.3", value: \.characterMix),
                        .init("Age", key: "characterAge", icon: "clock.arrow.circlepath", value: \.characterAge),
                        .init("Depth", key: "characterDepth", icon: "water.waves", value: \.characterDepth),
                        .init("Rate", key: "characterRate", icon: "speedometer", value: \.characterRate),
                        .init("Damp", key: "characterDamp", icon: "line.3.horizontal.decrease", value: \.characterDamp),
                        .init("Stereo", key: "characterStereo", icon: "arrow.left.and.right", value: \.characterStereo),
                    ], accent: accent, columns: 2)
                }
            } trailing: {
                KesshoMacCard(title: "Degrade", symbol: "scribble.variable", accent: accent) {
                    KesshoMacToggleRow(title: "Degrade Engine", symbol: "power", accent: accent, isOn: $appState.state.degradeEnabled)
                    KesshoMacSliderGrid(specs: [
                        .init("Mix", key: "degradeMix", icon: "slider.horizontal.3", value: \.degradeMix),
                        .init("Age", key: "degradeAge", icon: "clock", value: \.degradeAge),
                        .init("Generation", key: "degradeGeneration", icon: "square.stack.3d.up", value: \.degradeGeneration),
                        .init("Alias", key: "degradeAlias", icon: "waveform.badge.magnifyingglass", value: \.degradeAlias),
                        .init("Wow", key: "degradeWow", icon: "waveform", value: \.degradeWow),
                        .init("Flutter", key: "degradeFlutter", icon: "wind", value: \.degradeFlutter),
                    ], accent: accent, columns: 2)
                }
            }
        }
    }
}

private struct KesshoMacRoutingPage: View {
    private let accent = KesshoMacDesign.accent(for: .routing)

    var body: some View {
        KesshoMacPageFrame(page: .routing) {
            KesshoMacCard(title: "Routing Matrix", symbol: "square.grid.3x3", accent: accent) {
                LazyVGrid(
                    columns: [GridItem(.fixed(120)), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())],
                    spacing: 8
                ) {
                    matrixHeader("")
                    matrixHeader("Delay A")
                    matrixHeader("Delay B")
                    matrixHeader("Reverb")

                    routingRow("Pad", [
                        .init("A", key: "pad1DelayASend", value: \.pad1DelayASend),
                        .init("B", key: "pad1DelayBSend", value: \.pad1DelayBSend),
                        .init("Rev", key: "synthReverbSend", value: \.synthReverbSend),
                    ])
                    routingRow("Lead 1", [
                        .init("A", key: "lead1DelayASend", value: \.lead1DelayASend),
                        .init("B", key: "lead1DelayBSend", value: \.lead1DelayBSend),
                        .init("Rev", key: "leadReverbSend", value: \.leadReverbSend),
                    ])
                    routingRow("Lead 2", [
                        .init("A", key: "lead2DelayASend", value: \.lead2DelayASend),
                        .init("B", key: "lead2DelayBSend", value: \.lead2DelayBSend),
                        .init("Rev", key: "lead2ReverbSend", value: \.lead2ReverbSend),
                    ])
                    routingRow("Drum", [
                        .init("A", key: "drumDelayASend", value: \.drumDelayASend),
                        .init("B", key: "drumDelayBSend", value: \.drumDelayBSend),
                        .init("Rev", key: "drumReverbSend", value: \.drumReverbSend),
                    ])
                    routingRow("Earth", [
                        .init("A", key: "oceanDelayASend", value: \.oceanDelayASend),
                        .init("B", key: "oceanDelayBSend", value: \.oceanDelayBSend),
                        .init("Rev", key: "oceanReverbSend", value: \.oceanReverbSend),
                    ])
                }
            }
        }
    }

    private func matrixHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(KesshoMacDesign.secondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func routingRow(_ title: String, _ specs: [KesshoMacSliderSpec]) -> some View {
        Group {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(KesshoMacDesign.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            ForEach(specs) { spec in
                KesshoMacSliderRow(spec: spec, accent: accent)
            }
        }
    }
}

private struct KesshoMacPageFrame<Content: View>: View {
    let page: KesshoMacPage
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            content
        }
        .frame(maxWidth: KesshoMacDesign.pageMaxWidth, alignment: .top)
        .padding(.horizontal, 18)
        .padding(.bottom, 28)
    }
}

private struct KesshoMacTwoColumn<Leading: View, Trailing: View>: View {
    @ViewBuilder let leading: Leading
    @ViewBuilder let trailing: Trailing

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            leading
                .frame(width: KesshoMacDesign.sidePanelWidth)
            trailing
                .frame(maxWidth: .infinity)
        }
    }
}

private extension SliderState {
    var chordRateDouble: Double {
        Double(chordRate)
    }
}
