import SwiftUI

/// Preset list view for loading and managing presets
struct PresetListView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var appState: AppState
    @State private var showingSaveDialog = false
    @State private var showingCompatibilityWarning = false
    @State private var newPresetName = ""
    
    /// Check if current reverb type is compatible with web app
    private var isReverbTypeWebAppCompatible: Bool {
        let webAppCompatibleTypes = ["plate", "hall", "cathedral", "darkHall"]
        return webAppCompatibleTypes.contains(appState.state.reverbType)
    }
    
    var body: some View {
        NavigationView {
            List {
                // Bundled presets section
                Section("Factory Presets") {
                    ForEach(bundledPresets, id: \.name) { preset in
                        PresetRow(preset: preset) {
                            appState.loadPreset(preset)
                            dismiss()
                        }
                    }
                }
                
                // User presets section
                if !userPresets.isEmpty {
                    Section("My Presets") {
                        ForEach(userPresets, id: \.name) { preset in
                            PresetRow(preset: preset) {
                                appState.loadPreset(preset)
                                dismiss()
                            }
                        }
                        .onDelete(perform: deleteUserPreset)
                    }
                }
                
                // Morph section
                if appState.morphPresetA != nil {
                    Section("Morph") {
                        MorphControl()
                    }
                }
            }
            .navigationTitle("Presets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        // Check compatibility before showing save dialog
                        if isReverbTypeWebAppCompatible {
                            showingSaveDialog = true
                        } else {
                            showingCompatibilityWarning = true
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .alert("Save Preset", isPresented: $showingSaveDialog) {
                TextField("Preset Name", text: $newPresetName)
                Button("Cancel", role: .cancel) { }
                Button("Save") {
                    if !newPresetName.isEmpty {
                        appState.saveCurrentAsPreset(name: newPresetName)
                        newPresetName = ""
                    }
                }
            } message: {
                Text("Enter a name for your preset")
            }
            .alert("Compatibility Warning", isPresented: $showingCompatibilityWarning) {
                Button("Cancel", role: .cancel) { }
                Button("Save Anyway") {
                    showingSaveDialog = true
                }
                Button("Fix & Save") {
                    // Change to a compatible reverb type
                    appState.state.reverbType = "cathedral"
                    showingSaveDialog = true
                }
            } message: {
                Text("This preset uses an iOS-only reverb type (\(appState.state.reverbType)) that won't work on the web app.\n\n• Save Anyway: Keep iOS-only settings\n• Fix & Save: Switch to Cathedral reverb")
            }
        }
    }
    
    private var bundledPresets: [SavedPreset] {
        appState.savedPresets.filter { preset in
            // Factory presets don't have user-generated names
            ["Bright_Bells", "Dark_Textures", "Ethereal_Ambient", 
             "Gamelantest", "StringWaves", "ZoneOut1",
             "WaveformFlow", "CosmicStrings", "CrystalCaves"].contains(preset.name.replacingOccurrences(of: " ", with: "_"))
        }
    }
    
    private var userPresets: [SavedPreset] {
        appState.presetManager.loadUserPresets()
    }
    
    private func deleteUserPreset(at offsets: IndexSet) {
        for index in offsets {
            let preset = userPresets[index]
            appState.presetManager.deletePreset(named: preset.name)
        }
    }
}

/// Row for displaying a single preset
struct PresetRow: View {
    let preset: SavedPreset
    let onTap: () -> Void
    
    @EnvironmentObject var appState: AppState
    @State private var isTargetB = false
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(preset.name.replacingOccurrences(of: "_", with: " "))
                    .font(.headline)
                
                HStack(spacing: 12) {
                    Label("\(Int(preset.state.tension * 100))%", systemImage: "waveform")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Label(preset.state.scaleMode == "manual" ? preset.state.manualScale : "Auto",
                          systemImage: "music.note")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            // Morph target button
            Button {
                isTargetB.toggle()
                if isTargetB {
                    appState.morphPresetB = preset
                } else {
                    appState.morphPresetB = nil
                }
            } label: {
                Image(systemName: isTargetB ? "b.circle.fill" : "b.circle")
                    .foregroundColor(isTargetB ? .blue : .gray)
            }
            .buttonStyle(.plain)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            onTap()
        }
    }
}

/// Morph slider control
struct MorphControl: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text(appState.morphPresetA?.name.replacingOccurrences(of: "_", with: " ") ?? "A")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Text(appState.morphPresetB?.name.replacingOccurrences(of: "_", with: " ") ?? "B")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Slider(value: Binding(
                get: { appState.morphPosition },
                set: { appState.setMorphPosition($0) }
            ), in: 0...100)
            .disabled(appState.morphPresetB == nil)
            
            Text("\(Int(appState.morphPosition))%")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 8)
    }
}

#Preview {
    PresetListView()
        .environmentObject(AppState())
}
