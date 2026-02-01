# iOS Project Setup Guide

## Xcode Project Creation

### Step 1: Create New Project

1. Open Xcode → File → New → Project
2. Select **iOS** → **App**
3. Configure:
   - Product Name: `GenerativeAmbient`
   - Organization Identifier: `com.yourcompany`
   - Interface: **SwiftUI**
   - Language: **Swift**
   - ☑️ Include Tests

### Step 2: Set Deployment Target

- Minimum iOS: **15.0** (for AVAudioEngine improvements)
- Recommended: **16.0** (for SwiftUI Canvas enhancements)

## Background Audio Setup

### Info.plist Configuration

Add these entries to Info.plist:

```xml
<!-- Background Audio Mode -->
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>

<!-- Audio Session Category -->
<key>AVAudioSessionCategory</key>
<string>playback</string>

<!-- App Description -->
<key>NSMicrophoneUsageDescription</key>
<string>This app does not require microphone access but may request it for future features.</string>
```

### Capabilities

In Xcode → Target → Signing & Capabilities:

1. Click **+ Capability**
2. Add **Background Modes**
3. Check **Audio, AirPlay, and Picture in Picture**

## Audio Session Configuration

### AudioSessionManager.swift

```swift
import AVFoundation

class AudioSessionManager {
    static let shared = AudioSessionManager()
    
    private init() {}
    
    func configureForBackground() throws {
        let session = AVAudioSession.sharedInstance()
        
        do {
            // Set category for background playback
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers, .duckOthers]
            )
            
            // Set preferred sample rate (44.1kHz standard)
            try session.setPreferredSampleRate(44100)
            
            // Set buffer size (lower = less latency, higher = less CPU)
            try session.setPreferredIOBufferDuration(0.01) // 10ms
            
            // Activate session
            try session.setActive(true)
            
            print("Audio session configured: \(session.sampleRate)Hz, \(session.ioBufferDuration)s buffer")
            
        } catch {
            print("Failed to configure audio session: \(error)")
            throw error
        }
        
        // Handle interruptions
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: session
        )
        
        // Handle route changes (headphones plugged/unplugged)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: session
        )
    }
    
    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }
        
        switch type {
        case .began:
            // Pause audio (phone call, Siri, etc.)
            NotificationCenter.default.post(name: .audioInterruptionBegan, object: nil)
            
        case .ended:
            guard let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else {
                return
            }
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            
            if options.contains(.shouldResume) {
                // Resume audio
                NotificationCenter.default.post(name: .audioInterruptionEnded, object: nil)
            }
            
        @unknown default:
            break
        }
    }
    
    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }
        
        switch reason {
        case .oldDeviceUnavailable:
            // Headphones unplugged - pause by convention
            NotificationCenter.default.post(name: .audioRouteChanged, object: nil)
        default:
            break
        }
    }
}

extension Notification.Name {
    static let audioInterruptionBegan = Notification.Name("audioInterruptionBegan")
    static let audioInterruptionEnded = Notification.Name("audioInterruptionEnded")
    static let audioRouteChanged = Notification.Name("audioRouteChanged")
}
```

## Now Playing & Remote Commands

### NowPlayingManager.swift

```swift
import MediaPlayer
import Combine

class NowPlayingManager: ObservableObject {
    @Published var isPlaying: Bool = false
    
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupRemoteCommandCenter()
    }
    
    func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        // Play command
        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.isPlaying = true
            NotificationCenter.default.post(name: .remotePlay, object: nil)
            return .success
        }
        
        // Pause command
        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.isPlaying = false
            NotificationCenter.default.post(name: .remotePause, object: nil)
            return .success
        }
        
        // Toggle play/pause
        commandCenter.togglePlayPauseCommand.isEnabled = true
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.isPlaying.toggle()
            NotificationCenter.default.post(
                name: self?.isPlaying == true ? .remotePlay : .remotePause,
                object: nil
            )
            return .success
        }
        
        // Disable skip commands (generative music doesn't have tracks)
        commandCenter.nextTrackCommand.isEnabled = false
        commandCenter.previousTrackCommand.isEnabled = false
        commandCenter.skipForwardCommand.isEnabled = false
        commandCenter.skipBackwardCommand.isEnabled = false
    }
    
    func updateNowPlayingInfo(presetName: String, isPlaying: Bool) {
        var info = [String: Any]()
        
        info[MPMediaItemPropertyTitle] = presetName
        info[MPMediaItemPropertyArtist] = "Generative Ambient"
        info[MPMediaItemPropertyAlbumTitle] = "Generative Music"
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        
        // Optional: Add artwork
        if let image = UIImage(named: "NowPlayingArtwork") {
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            info[MPMediaItemPropertyArtwork] = artwork
        }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
    
    func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}

extension Notification.Name {
    static let remotePlay = Notification.Name("remotePlay")
    static let remotePause = Notification.Name("remotePause")
}
```

## Project Structure

### Recommended Folder Layout

```
GenerativeAmbient/
├── GenerativeAmbientApp.swift          # App entry point
├── Info.plist                          # Configuration
├── Assets.xcassets/                    # Images, colors
│   ├── AppIcon.appiconset/
│   └── NowPlayingArtwork.imageset/
├── Resources/
│   └── Presets/                        # Bundled JSON presets
│       ├── Bright_Bells.json
│       ├── Dark_Textures.json
│       └── ...
├── Models/
│   ├── SliderState.swift               # State model
│   └── SavedPreset.swift               # Preset model
├── Audio/
│   ├── AudioEngine.swift               # Main audio graph
│   ├── AudioSessionManager.swift       # AVAudioSession
│   ├── NowPlayingManager.swift         # Lock screen
│   ├── Synth/
│   │   ├── PolySynth.swift             # 6-voice poly synth
│   │   ├── SynthVoice.swift            # Individual voice
│   │   └── WaveformGenerator.swift     # Oscillators
│   ├── Lead/
│   │   ├── LeadSynth.swift             # FM lead synth
│   │   ├── EuclideanSequencer.swift    # Rhythm patterns
│   │   └── PingPongDelay.swift         # Delay effect
│   ├── Effects/
│   │   ├── GranulatorNode.swift        # AUAudioUnit wrapper
│   │   ├── Granulator.swift            # Core DSP
│   │   ├── ReverbNode.swift            # AUAudioUnit wrapper
│   │   ├── FDNReverb.swift             # Core DSP
│   │   ├── OceanNode.swift             # AUAudioUnit wrapper
│   │   └── OceanSynth.swift            # Core DSP
│   └── Harmony/
│       ├── HarmonyManager.swift        # Chord generation
│       └── Scales.swift                # Scale definitions
├── ViewModels/
│   ├── AudioViewModel.swift            # Main state management
│   └── PresetManager.swift             # Preset loading/saving
├── Views/
│   ├── ContentView.swift               # Root view
│   ├── Snowflake/
│   │   ├── SnowflakeView.swift         # Main visual interface
│   │   ├── SnowflakeDrawing.swift      # Canvas rendering
│   │   └── PlayButton.swift            # Center button
│   ├── Advanced/
│   │   ├── AdvancedControlsView.swift  # Full controls
│   │   ├── ParameterSlider.swift       # Reusable slider
│   │   └── Sections/
│   │       ├── MixerSection.swift
│   │       ├── HarmonySection.swift
│   │       ├── TimbreSection.swift
│   │       └── ...
│   ├── Presets/
│   │   ├── PresetPickerView.swift      # Preset list
│   │   └── PresetRow.swift             # List row
│   └── Components/
│       ├── CircleOfFifthsView.swift    # Key visualization
│       └── SettingsButton.swift
└── Utilities/
    ├── RNG.swift                       # Seeded random
    └── Extensions.swift                # Helper extensions
```

## Build Phases

### Copy Bundle Resources

Ensure preset JSON files are copied:

1. In Xcode, select Target → Build Phases → Copy Bundle Resources
2. Add all files from `Resources/Presets/*.json`

Or create a folder reference:
1. Drag `Presets` folder into Xcode
2. Select "Create folder references" (blue folder icon)

## App Lifecycle

### GenerativeAmbientApp.swift

```swift
import SwiftUI
import AVFoundation

@main
struct GenerativeAmbientApp: App {
    @StateObject private var viewModel = AudioViewModel()
    @StateObject private var presetManager = PresetManager()
    @StateObject private var nowPlayingManager = NowPlayingManager()
    
    init() {
        // Configure audio session early
        do {
            try AudioSessionManager.shared.configureForBackground()
        } catch {
            print("Audio session setup failed: \(error)")
        }
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .environmentObject(presetManager)
                .environmentObject(nowPlayingManager)
                .onReceive(NotificationCenter.default.publisher(for: .remotePlay)) { _ in
                    if !viewModel.isPlaying {
                        viewModel.togglePlay()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .remotePause)) { _ in
                    if viewModel.isPlaying {
                        viewModel.togglePlay()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .audioInterruptionBegan)) { _ in
                    if viewModel.isPlaying {
                        viewModel.togglePlay()
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .audioRouteChanged)) { _ in
                    // Pause when headphones unplugged (convention)
                    if viewModel.isPlaying {
                        viewModel.togglePlay()
                    }
                }
                .onChange(of: viewModel.isPlaying) { isPlaying in
                    nowPlayingManager.updateNowPlayingInfo(
                        presetName: presetManager.selectedPreset?.name ?? "Generative Ambient",
                        isPlaying: isPlaying
                    )
                }
        }
    }
}
```

## Testing Background Audio

### Simulator Limitations

The iOS Simulator does not properly test background audio. Use a physical device.

### Testing Checklist

1. **Lock Screen Playback**
   - Start audio
   - Press lock button
   - Verify audio continues
   - Check lock screen shows Now Playing

2. **Control Center**
   - Open Control Center while playing
   - Verify play/pause controls work
   - Verify app artwork/title displays

3. **Headphone Disconnect**
   - Play audio through headphones
   - Unplug headphones
   - Verify audio pauses (convention)

4. **Phone Call**
   - Play audio
   - Receive phone call
   - Verify audio pauses
   - End call
   - Verify audio can resume

5. **Siri Interruption**
   - Play audio
   - Activate Siri
   - Verify audio ducks or pauses
   - Dismiss Siri
   - Verify audio resumes

## Dependencies

### No External Dependencies Required

This project can be built with Apple frameworks only:

- `AVFoundation` - Audio engine
- `Accelerate` - DSP operations (vDSP)
- `MediaPlayer` - Now Playing & Remote Commands
- `SwiftUI` - User interface
- `Combine` - Reactive bindings
- `Foundation` - Standard library

### Optional Dependencies

If desired, these could simplify certain aspects:

| Package | Purpose | Recommendation |
|---------|---------|----------------|
| AudioKit | Audio framework | Not needed; AVAudioEngine is sufficient |
| TCA | Architecture | Optional; simple @Published works |
| Realm | Persistence | Not needed; JSON files are simpler |

## Performance Considerations

### Audio Thread Safety

```swift
// NEVER do UI updates on audio thread
// NEVER do allocations on audio thread

// Good: Use pre-allocated buffers
class AudioProcessor {
    private var scratchBuffer: [Float]
    
    init(maxFrameCount: Int) {
        scratchBuffer = [Float](repeating: 0, count: maxFrameCount)
    }
}

// Good: Use lock-free communication
import Atomics

class ParameterBridge {
    private var atomicVolume = ManagedAtomic<Float>(0.5)
    
    // Called from main thread
    func setVolume(_ value: Float) {
        atomicVolume.store(value, ordering: .relaxed)
    }
    
    // Called from audio thread
    func getVolume() -> Float {
        atomicVolume.load(ordering: .relaxed)
    }
}
```

### Battery Optimization

```swift
// Use efficient sample rates
try session.setPreferredSampleRate(44100)  // Not 96000

// Use reasonable buffer sizes
try session.setPreferredIOBufferDuration(0.01)  // 10ms, not 2ms

// Avoid unnecessary processing when app is backgrounded
if UIApplication.shared.applicationState == .background {
    // Skip visual processing
}
```

## Debugging Audio

### Enable Audio Logs

```swift
#if DEBUG
func logAudioGraph() {
    print("Audio Engine Status:")
    print("  Running: \(engine.isRunning)")
    print("  Sample Rate: \(engine.outputNode.outputFormat(forBus: 0).sampleRate)")
    print("  Channel Count: \(engine.outputNode.outputFormat(forBus: 0).channelCount)")
    
    // Log node connections
    for node in [mainMixer, synthBus, granulator, reverb] {
        print("  \(type(of: node)): connected")
    }
}
#endif
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No background audio | Missing UIBackgroundModes | Add `audio` to Info.plist |
| Audio stops on lock | Session not configured | Call `configureForBackground()` |
| Crackling/glitches | Buffer too small | Increase IOBufferDuration |
| No lock screen controls | MPRemoteCommandCenter not set | Call `setupRemoteCommandCenter()` |
| Audio stops on call | No interruption handler | Add interruption observer |
