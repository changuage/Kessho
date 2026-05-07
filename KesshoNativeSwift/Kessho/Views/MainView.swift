import SwiftUI

/// Main view with snowflake visualization and controls
struct MainView: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @EnvironmentObject var appState: AppState
    @State private var showingPresets = false
    @State private var showingSettings = false
    @State private var showingRecording = false
    @State private var selectedTab = 0
    @State private var selectedVisualization = 0

    private var usesWideLayout: Bool {
        horizontalSizeClass == .regular
    }

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.05, blue: 0.15),
                    Color(red: 0.1, green: 0.05, blue: 0.2)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Kessho")
                        .font(.title2)
                        .fontWeight(.light)
                        .foregroundColor(.white)

                    Spacer()

                    Button {
                        showingRecording = true
                    } label: {
                        RecordingHeaderButton()
                    }
                    .padding(.horizontal, 8)

                    Button {
                        showingPresets = true
                    } label: {
                        Image(systemName: "folder")
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .padding(.horizontal, 8)

                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .foregroundColor(.white.opacity(0.8))
                    }
                }
                .padding()

                // Main content area
                if usesWideLayout {
                    wideContent
                } else {
                    compactContent
                }

                // Transport controls
                TransportBar()
                    .frame(maxWidth: usesWideLayout ? 900 : .infinity)
                    .padding(.horizontal, usesWideLayout ? 24 : 16)
                    .padding(.vertical, 16)
            }
        }
        .sheet(isPresented: $showingPresets) {
            PresetListView()
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .sheet(isPresented: $showingRecording) {
            RecordingView()
        }
    }

    private var compactContent: some View {
        TabView(selection: $selectedTab) {
            SnowflakeView()
                .tag(0)

            CircleOfFifthsView()
                .tag(1)

            NativePageDeckView()
                .tag(2)

            SliderControlsView()
                .tag(3)
        }
        .kesshoCompactPagerStyle()
    }

    private var wideContent: some View {
        HStack(spacing: 0) {
            VStack(spacing: 12) {
                Picker("Visualization", selection: $selectedVisualization) {
                    Image(systemName: "snowflake").tag(0)
                    Image(systemName: "circle.hexagongrid.circle").tag(1)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 260)
                .padding(.top, 8)

                ZStack {
                    if selectedVisualization == 0 {
                        SnowflakeView()
                    } else {
                        CircleOfFifthsView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(minWidth: 360, maxWidth: .infinity, maxHeight: .infinity)
            .layoutPriority(1)

            Divider()
                .background(Color.white.opacity(0.12))
                .padding(.vertical, 12)

            NativePageDeckView()
                .frame(minWidth: 390, idealWidth: 460, maxWidth: 540, maxHeight: .infinity)
        }
        .padding(.horizontal, 16)
    }
}

/// Compact host for the same top-level pages as the web and Mac surfaces.
struct NativePageDeckView: View {
    @State private var activePage: KesshoMacPage = .global

    var body: some View {
        VStack(spacing: 8) {
            KesshoMacTabBar(activePage: $activePage)
                .padding(.horizontal, 10)
                .padding(.top, 8)

            ScrollView {
                KesshoMacPageHost(page: activePage)
                    .padding(.top, 4)
            }
            .scrollIndicators(.hidden)
        }
        .background(Color.black.opacity(0.08))
    }
}

/// Recording button for header - shows state visually
struct RecordingHeaderButton: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            // Background circle
            Circle()
                .fill(backgroundColor)
                .frame(width: 28, height: 28)

            // Recording indicator
            if appState.recordingState == .recording {
                Circle()
                    .fill(Color.red)
                    .frame(width: 10, height: 10)
            } else {
                Image(systemName: "record.circle")
                    .font(.system(size: 16))
                    .foregroundColor(iconColor)
            }
        }
        .overlay(
            // Pulsing border when recording
            Circle()
                .stroke(appState.recordingState == .recording ? Color.red : Color.clear, lineWidth: 2)
                .frame(width: 28, height: 28)
                .opacity(appState.recordingState == .recording ? 0.8 : 0)
        )
    }

    private var backgroundColor: Color {
        switch appState.recordingState {
        case .recording: return Color.red.opacity(0.3)
        case .armed: return Color.orange.opacity(0.3)
        case .idle: return Color.clear
        }
    }

    private var iconColor: Color {
        switch appState.recordingState {
        case .recording: return .red
        case .armed: return .orange
        case .idle: return .white.opacity(0.8)
        }
    }
}

/// Transport bar with play/stop and info
struct TransportBar: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 16) {
            // Play/Stop button
            Button {
                appState.togglePlayback()
            } label: {
                ZStack {
                    Circle()
                        .fill(appState.isPlaying ? Color.red.opacity(0.3) : Color.green.opacity(0.3))
                        .frame(width: 56, height: 56)

                    Image(systemName: appState.isPlaying ? "stop.fill" : "play.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                }
            }

            // Recording button
            RecordingButton()

            // Auto-Morph toggle button
            Button {
                appState.toggleAutoMorph()
            } label: {
                ZStack {
                    Circle()
                        .fill(appState.autoMorphEnabled ? Color.purple.opacity(0.3) : Color.gray.opacity(0.2))
                        .frame(width: 40, height: 40)

                    Image(systemName: appState.autoMorphEnabled ? "arrow.triangle.2.circlepath.circle.fill" : "arrow.triangle.2.circlepath.circle")
                        .font(.body)
                        .foregroundColor(appState.autoMorphEnabled ? .purple : .white.opacity(0.6))
                }
            }
            .help("Auto-Morph: Automatically cycle through presets")

            PlaybackTimerButton()

            VStack(alignment: .leading, spacing: 4) {
                // Current scale/chord info or recording duration
                if appState.recordingState == .recording {
                    Text("⏺ \(appState.formattedRecordingDuration)")
                        .font(.subheadline)
                        .foregroundColor(.red)
                } else {
                    Text(appState.currentScaleName.isEmpty ? "Ready" : appState.currentScaleName)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.9))
                }

                // Seed info or morph status
                if appState.autoMorphEnabled {
                    Text("Auto-Morph: \(Int(appState.morphPosition))%")
                        .font(.caption)
                        .foregroundColor(.purple.opacity(0.8))
                } else if appState.playbackTimerEnabled {
                    Text("Timer: \(appState.formattedPlaybackTimerRemaining)")
                        .font(.caption)
                        .foregroundColor(.orange.opacity(0.85))
                } else if appState.recordingState == .armed {
                    Text("Recording Armed")
                        .font(.caption)
                        .foregroundColor(.orange.opacity(0.8))
                } else {
                    Text("Seed: \(appState.currentBucket)")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.5))
                }
            }

            Spacer()

            // Master volume
            VStack {
                Image(systemName: "speaker.wave.2")
                    .foregroundColor(.white.opacity(0.6))
                    .font(.caption)

                Slider(value: $appState.state.masterVolume, in: 0...1)
                    .frame(width: 70)
                    .tint(.white.opacity(0.6))
            }
        }
        .padding()
        .background(Color.black.opacity(0.3))
        .cornerRadius(16)
    }
}

struct PlaybackTimerButton: View {
    @EnvironmentObject private var appState: AppState
    @State private var showTimerPanel = false
    private let durationOptions = [5, 15, 30, 60, 90, 120]

    var body: some View {
        Button {
            if appState.playbackTimerEnabled {
                showTimerPanel = true
            } else {
                appState.setPlaybackTimerEnabled(true)
            }
        } label: {
            ZStack {
                Circle()
                    .fill(appState.playbackTimerEnabled ? Color.orange.opacity(0.3) : Color.gray.opacity(0.2))
                    .frame(width: 40, height: 40)

                Image(systemName: appState.playbackTimerEnabled ? "timer.circle.fill" : "timer")
                    .font(.body)
                    .foregroundColor(appState.playbackTimerEnabled ? .orange : .white.opacity(0.6))
            }
        }
        .help(appState.playbackTimerEnabled ? "Playback timer settings" : "Enable playback timer")
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.35)
                .onEnded { _ in showTimerPanel = true }
        )
        .sheet(isPresented: $showTimerPanel) {
            timerPanel
        }
    }

    private var timerPanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Playback Timer")
                    .font(.headline)
                Spacer()
                Button {
                    showTimerPanel = false
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.plain)
            }

            Toggle(isOn: Binding(
                get: { appState.playbackTimerEnabled },
                set: { appState.setPlaybackTimerEnabled($0) }
            )) {
                Text(appState.playbackTimerEnabled ? appState.formattedPlaybackTimerRemaining : "\(appState.playbackTimerMinutes)m")
                    .font(.system(.body, design: .monospaced))
            }
            .tint(.orange)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(durationOptions, id: \.self) { minutes in
                    Button {
                        appState.setPlaybackTimerMinutes(minutes)
                    } label: {
                        Text("\(minutes)m")
                            .font(.system(size: 13, weight: .bold, design: .monospaced))
                            .frame(maxWidth: .infinity, minHeight: 34)
                    }
                    .buttonStyle(.bordered)
                    .tint(appState.playbackTimerMinutes == minutes ? .orange : .gray)
                }
            }

            Stepper(value: Binding(
                get: { appState.playbackTimerMinutes },
                set: { appState.setPlaybackTimerMinutes($0) }
            ), in: 1...480) {
                Text("Custom \(appState.playbackTimerMinutes)m")
                    .font(.subheadline)
            }

            HStack {
                Button {
                    appState.resetPlaybackTimer()
                } label: {
                    Label("Reset", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(!appState.playbackTimerEnabled)

                Spacer()

                Button {
                    appState.setPlaybackTimerEnabled(false)
                } label: {
                    Label("Off", systemImage: "power")
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }
        }
        .padding(18)
        .frame(minWidth: 280)
    }
}

extension View {
    @ViewBuilder
    func kesshoCompactPagerStyle() -> some View {
        #if os(macOS)
        self
        #else
        self.tabViewStyle(.page(indexDisplayMode: .always))
        #endif
    }

    @ViewBuilder
    func kesshoInlineNavigationTitle() -> some View {
        #if os(macOS)
        self
        #else
        self.navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

/// Recording button with tap/long-press gestures
struct RecordingButton: View {
    @EnvironmentObject var appState: AppState
    @State private var showRecordingPanel = false

    var body: some View {
        Button {
            // Tap to toggle recording
            appState.toggleRecording()
        } label: {
            ZStack {
                Circle()
                    .fill(recordingColor)
                    .frame(width: 40, height: 40)

                if appState.recordingState == .recording {
                    // Pulsing red circle for recording
                    Circle()
                        .fill(Color.red)
                        .frame(width: 16, height: 16)
                } else {
                    // Record circle icon
                    Circle()
                        .stroke(Color.white, lineWidth: 2)
                        .frame(width: 16, height: 16)
                    Circle()
                        .fill(appState.recordingState == .armed ? Color.orange : Color.white.opacity(0.3))
                        .frame(width: 12, height: 12)
                }
            }
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5)
                .onEnded { _ in
                    showRecordingPanel = true
                }
        )
        .sheet(isPresented: $showRecordingPanel) {
            RecordingView()
        }
    }

    private var recordingColor: Color {
        switch appState.recordingState {
        case .idle:
            return Color.gray.opacity(0.2)
        case .armed:
            return Color.orange.opacity(0.3)
        case .recording:
            return Color.red.opacity(0.4)
        }
    }
}

/// Settings view
struct SettingsView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState

    private func midiConnectionBinding(for input: MIDIEndpointInfo) -> Binding<Bool> {
        Binding(
            get: {
                appState.midiManager.connectedInputIDs.contains(input.uniqueID)
            },
            set: { isConnected in
                appState.setMIDIInputConnected(input.uniqueID, isConnected: isConnected)
            }
        )
    }

    var body: some View {
        NavigationView {
            Form {
                Section("Seed") {
                    Picker("Seed Window", selection: $appState.state.seedWindow) {
                        Text("Minute").tag("minute")
                        Text("Hour").tag("hour")
                        Text("Day").tag("day")
                    }
                }

                Section("Scale") {
                    Picker("Scale Mode", selection: $appState.state.scaleMode) {
                        Text("Auto").tag("auto")
                        Text("Manual").tag("manual")
                    }

                    if appState.state.scaleMode == "manual" {
                        Picker("Scale", selection: $appState.state.manualScale) {
                            ForEach(SCALE_FAMILIES, id: \.name) { scale in
                                Text(scale.name).tag(scale.name)
                            }
                        }
                    }
                }

                Section("Circle of Fifths") {
                    Toggle("Enable Drift", isOn: $appState.state.cofDriftEnabled)

                    if appState.state.cofDriftEnabled {
                        Stepper("Drift Rate: \(appState.state.cofDriftRate) phrases",
                               value: $appState.state.cofDriftRate, in: 1...8)

                        Picker("Direction", selection: $appState.state.cofDriftDirection) {
                            Text("Clockwise").tag("cw")
                            Text("Counter-Clockwise").tag("ccw")
                            Text("Random").tag("random")
                        }

                        Stepper("Range: \(appState.state.cofDriftRange) steps",
                               value: $appState.state.cofDriftRange, in: 1...6)
                    }
                }

                Section("MIDI") {
                    Button("Refresh MIDI Inputs") {
                        appState.refreshMIDIInputs()
                    }

                    if appState.midiManager.availableInputs.isEmpty {
                        Text("No MIDI inputs detected")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(appState.midiManager.availableInputs) { input in
                            Toggle(isOn: midiConnectionBinding(for: input)) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(input.name)
                                    if let manufacturer = input.manufacturer, !manufacturer.isEmpty {
                                        Text(manufacturer)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    Text(appState.latestMIDISummary)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if let midiErrorMessage = appState.midiErrorMessage, !midiErrorMessage.isEmpty {
                        Text(midiErrorMessage)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            }
            .onAppear {
                appState.refreshMIDIInputs()
            }
            .navigationTitle("Settings")
            .kesshoInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    MainView()
        .environmentObject(AppState())
}
