import SwiftUI

/// Recording panel view - matches web app's Recording CollapsiblePanel
struct RecordingView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    // Output Format Section
                    FormatSection()
                    
                    // Stem Recording Section
                    StemRecordingSection()
                    
                    // Recording Status
                    if appState.recordingState == .recording {
                        RecordingStatusSection()
                    }
                    
                    // Recording Controls
                    RecordingControlsSection()
                    
                    // Saved Recordings
                    SavedRecordingsSection()
                }
                .padding()
            }
            .background(Color(red: 0.08, green: 0.08, blue: 0.12))
            .navigationTitle("Recording")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

/// Output format selection - iOS only supports WAV (no WebM)
struct FormatSection: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Output Format")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            Text("Recording to WAV format")
                .font(.caption)
                .foregroundColor(Color(white: 0.4))
            
            HStack {
                // WAV format (always selected on iOS)
                VStack(spacing: 4) {
                    HStack {
                        Image(systemName: "circle.fill")
                            .foregroundColor(.green)
                            .font(.caption)
                        Text("WAV")
                            .fontWeight(.bold)
                    }
                    Text("24-bit 48kHz")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(
                    LinearGradient(
                        colors: [Color(red: 0.086, green: 0.396, blue: 0.204), Color(red: 0.078, green: 0.325, blue: 0.176)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.green.opacity(0.5), lineWidth: 1)
                )
            }
        }
        .padding()
        .background(Color(white: 0.1))
        .cornerRadius(12)
    }
}

/// Stem recording toggle buttons - matches web app's grid
struct StemRecordingSection: View {
    @EnvironmentObject var appState: AppState
    
    private let stems: [(RecordingStem, String)] = [
        (.synth, "Synth"),
        (.lead, "Lead"),
        (.drums, "Drums"),
        (.waves, "Waves"),
        (.granular, "Granular"),
        (.reverb, "Reverb"),
    ]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Stem Recording (Post-Mixer)")
                .font(.subheadline)
                .foregroundColor(.gray)
            
            Text("Record individual engine outputs")
                .font(.caption)
                .foregroundColor(Color(white: 0.4))
            
            // 3x2 grid of stem toggles
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 8) {
                ForEach(stems, id: \.0) { stem, label in
                    StemToggleButton(
                        stem: stem,
                        label: label,
                        isEnabled: appState.recordingEnabledStems.contains(stem),
                        isDisabled: appState.recordingState == .recording
                    ) {
                        appState.toggleStemRecording(stem)
                    }
                }
            }
            
            // Main mix toggle
            Toggle(isOn: $appState.recordMain) {
                HStack {
                    Image(systemName: appState.recordMain ? "circle.fill" : "circle")
                        .foregroundColor(appState.recordMain ? .green : .gray)
                        .font(.caption)
                    Text("Record Main Mix")
                        .font(.subheadline)
                }
            }
            .disabled(appState.recordingState == .recording)
            .padding(.top, 8)
        }
        .padding()
        .background(Color(white: 0.1))
        .cornerRadius(12)
    }
}

/// Individual stem toggle button
struct StemToggleButton: View {
    let stem: RecordingStem
    let label: String
    let isEnabled: Bool
    let isDisabled: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: isEnabled ? "circle.fill" : "circle")
                    .font(.caption2)
                Text(label)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                isEnabled
                    ? LinearGradient(
                        colors: [Color(red: 0.118, green: 0.251, blue: 0.686), Color(red: 0.118, green: 0.227, blue: 0.541)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    : LinearGradient(
                        colors: [Color(white: 0.12), Color(white: 0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
            )
            .foregroundColor(isEnabled ? Color(red: 0.576, green: 0.773, blue: 0.988) : .gray)
            .fontWeight(isEnabled ? .bold : .regular)
            .cornerRadius(6)
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(isEnabled ? Color.blue.opacity(0.5) : Color(white: 0.25), lineWidth: 1)
            )
        }
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.5 : 1)
    }
}

/// Recording status display with timer
struct RecordingStatusSection: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Circle()
                    .fill(Color.red)
                    .frame(width: 12, height: 12)
                    .opacity(animatingOpacity)
                
                Text(appState.formattedRecordingDuration)
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(Color(red: 0.988, green: 0.647, blue: 0.647))
                    .monospacedDigit()
            }
            
            Text("Recording in progress...")
                .font(.caption)
                .foregroundColor(Color(red: 0.973, green: 0.443, blue: 0.443))
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.937, green: 0.267, blue: 0.267).opacity(0.2),
                    Color(red: 0.725, green: 0.110, blue: 0.110).opacity(0.2)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.red.opacity(0.4), lineWidth: 1)
        )
    }
    
    @State private var animatingOpacity: Double = 1.0
    
    init() {
        // Pulse animation for recording indicator
    }
}

/// Recording control buttons
struct RecordingControlsSection: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 12) {
            // Main record button
            Button(action: {
                appState.toggleRecording()
            }) {
                HStack {
                    Image(systemName: recordButtonIcon)
                        .font(.title2)
                    Text(recordButtonText)
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(recordButtonBackground)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            
            // Arm recording button (when not playing)
            if !appState.isPlaying && appState.recordingState != .recording {
                Button(action: {
                    if appState.recordingState == .armed {
                        appState.disarmRecording()
                    } else {
                        appState.armRecording()
                    }
                }) {
                    HStack {
                        Image(systemName: appState.recordingState == .armed ? "circle.fill" : "circle")
                            .foregroundColor(appState.recordingState == .armed ? .orange : .gray)
                        Text(appState.recordingState == .armed ? "Recording Armed" : "Arm Recording")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(
                        appState.recordingState == .armed
                            ? Color.orange.opacity(0.2)
                            : Color(white: 0.15)
                    )
                    .foregroundColor(appState.recordingState == .armed ? .orange : .gray)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(appState.recordingState == .armed ? Color.orange.opacity(0.5) : Color.clear, lineWidth: 1)
                    )
                }
            }
            
            // Status text
            Text(statusText)
                .font(.caption)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
        }
        .padding()
        .background(Color(white: 0.1))
        .cornerRadius(12)
    }
    
    private var recordButtonIcon: String {
        switch appState.recordingState {
        case .recording: return "stop.fill"
        case .armed: return "record.circle"
        case .idle: return appState.isPlaying ? "record.circle" : "record.circle"
        }
    }
    
    private var recordButtonText: String {
        switch appState.recordingState {
        case .recording: return "Stop Recording"
        case .armed: return "Start Recording"
        case .idle: return appState.isPlaying ? "Start Recording" : "Arm Recording"
        }
    }
    
    private var recordButtonBackground: LinearGradient {
        switch appState.recordingState {
        case .recording:
            return LinearGradient(
                colors: [Color.red, Color.red.opacity(0.8)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .armed:
            return LinearGradient(
                colors: [Color.orange, Color.orange.opacity(0.8)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .idle:
            return LinearGradient(
                colors: [Color(white: 0.3), Color(white: 0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
    
    private var statusText: String {
        let stemCount = appState.recordingEnabledStems.count
        switch appState.recordingState {
        case .recording:
            if stemCount > 0 {
                return "Recording main mix + \(stemCount) stem\(stemCount == 1 ? "" : "s")"
            }
            return "Recording main mix"
        case .armed:
            return "Will start recording when playback begins"
        case .idle:
            if stemCount > 0 {
                return "Will record main mix + \(stemCount) stem\(stemCount == 1 ? "" : "s")"
            }
            return "Ready to record"
        }
    }
}

/// List of saved recordings with share/delete options
struct SavedRecordingsSection: View {
    @EnvironmentObject var appState: AppState
    @State private var recordings: [URL] = []
    @State private var showingShareSheet = false
    @State private var shareURL: URL?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Saved Recordings")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                
                Spacer()
                
                Button(action: refreshRecordings) {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption)
                        .foregroundColor(.blue)
                }
            }
            
            if recordings.isEmpty {
                Text("No recordings yet")
                    .font(.caption)
                    .foregroundColor(Color(white: 0.4))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else {
                ForEach(recordings, id: \.absoluteString) { url in
                    RecordingRow(url: url) {
                        shareURL = url
                        showingShareSheet = true
                    } onDelete: {
                        deleteRecording(url)
                    }
                }
            }
        }
        .padding()
        .background(Color(white: 0.1))
        .cornerRadius(12)
        .onAppear(perform: refreshRecordings)
        .sheet(isPresented: $showingShareSheet) {
            if let url = shareURL {
                ShareSheet(activityItems: [url])
            }
        }
    }
    
    private func refreshRecordings() {
        recordings = appState.savedRecordings
    }
    
    private func deleteRecording(_ url: URL) {
        try? FileManager.default.removeItem(at: url)
        refreshRecordings()
    }
}

/// Individual recording row
struct RecordingRow: View {
    let url: URL
    let onShare: () -> Void
    let onDelete: () -> Void
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(url.lastPathComponent)
                    .font(.caption)
                    .foregroundColor(.white)
                    .lineLimit(1)
                
                if let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
                   let size = attributes[.size] as? Int64 {
                    Text(formatFileSize(size))
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
            
            Spacer()
            
            Button(action: onShare) {
                Image(systemName: "square.and.arrow.up")
                    .foregroundColor(.blue)
            }
            .padding(.horizontal, 8)
            
            Button(action: onDelete) {
                Image(systemName: "trash")
                    .foregroundColor(.red)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(Color(white: 0.15))
        .cornerRadius(8)
    }
    
    private func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useMB, .useKB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}

/// Share sheet for iOS
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    RecordingView()
        .environmentObject(AppState())
}
