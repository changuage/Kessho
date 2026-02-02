import SwiftUI

/// Main view with snowflake visualization and controls
struct MainView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingPresets = false
    @State private var showingSettings = false
    @State private var selectedTab = 0
    
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
                TabView(selection: $selectedTab) {
                    // Snowflake visualization
                    SnowflakeView()
                        .tag(0)
                    
                    // Circle of Fifths
                    CircleOfFifthsView()
                        .tag(1)
                    
                    // Sliders
                    SliderControlsView()
                        .tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                
                // Transport controls
                TransportBar()
                    .padding()
            }
        }
        .sheet(isPresented: $showingPresets) {
            PresetListView()
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
    }
}

/// Transport bar with play/stop and info
struct TransportBar: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        HStack(spacing: 20) {
            // Play/Stop button
            Button {
                appState.togglePlayback()
            } label: {
                ZStack {
                    Circle()
                        .fill(appState.isPlaying ? Color.red.opacity(0.3) : Color.green.opacity(0.3))
                        .frame(width: 60, height: 60)
                    
                    Image(systemName: appState.isPlaying ? "stop.fill" : "play.fill")
                        .font(.title)
                        .foregroundColor(.white)
                }
            }
            
            // Auto-Morph toggle button
            Button {
                appState.toggleAutoMorph()
            } label: {
                ZStack {
                    Circle()
                        .fill(appState.autoMorphEnabled ? Color.purple.opacity(0.3) : Color.gray.opacity(0.2))
                        .frame(width: 44, height: 44)
                    
                    Image(systemName: appState.autoMorphEnabled ? "arrow.triangle.2.circlepath.circle.fill" : "arrow.triangle.2.circlepath.circle")
                        .font(.title2)
                        .foregroundColor(appState.autoMorphEnabled ? .purple : .white.opacity(0.6))
                }
            }
            .help("Auto-Morph: Automatically cycle through presets")
            
            VStack(alignment: .leading, spacing: 4) {
                // Current scale/chord info
                Text(appState.currentScaleName.isEmpty ? "Ready" : appState.currentScaleName)
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.9))
                
                // Seed info or morph status
                if appState.autoMorphEnabled {
                    Text("Auto-Morph: \(Int(appState.morphPosition))%")
                        .font(.caption)
                        .foregroundColor(.purple.opacity(0.8))
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
                
                Slider(value: $appState.state.masterVolume, in: 0...1)
                    .frame(width: 80)
                    .tint(.white.opacity(0.6))
            }
        }
        .padding()
        .background(Color.black.opacity(0.3))
        .cornerRadius(16)
    }
}

/// Settings view
struct SettingsView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    
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
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
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
