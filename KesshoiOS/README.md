# Kessho iOS

A native iOS prototype for Kessho that is being rebuilt as the platform backbone for background playback, lock-screen controls, and MIDI input.

## Features

- **Generative Harmony**: Deterministic chord and scale generation based on tension parameter
- **Circle of Fifths Drift**: Automatic key changes following the circle of fifths
- **Polyphonic Synthesizer**: 6-voice synthesizer with filter and envelope
- **Granular Processor**: Grain-based texture generation
- **Lead Melody**: Optional melodic lead voice
- **Snowflake Visualization**: Real-time parameter visualization
- **Preset Backbone**: JSON preset loading for the current iOS prototype
- **Background Audio**: Continues playing when app is in background
- **MIDI Backbone**: CoreMIDI input discovery and mapping scaffolding

## Requirements

- iOS 17.0+
- Xcode 15.0+
- Swift 5.9+

## Project Structure

```
KesshoiOS/
├── Kessho.xcodeproj/          # Xcode project file
├── Kessho/
│   ├── KesshoApp.swift        # App entry point
│   ├── ContentView.swift      # Root view
│   ├── Info.plist             # App configuration
│   ├── Assets.xcassets/       # App icons and colors
│   ├── Audio/                 # Audio engine components
│   │   ├── AudioEngine.swift
│   │   ├── SynthVoice.swift
│   │   ├── GranularProcessor.swift
│   │   ├── ReverbProcessor.swift
│   │   ├── LeadSynth.swift
│   │   └── OceanSynth.swift
│   ├── Harmony/               # Music theory
│   │   ├── Scales.swift
│   │   ├── Harmony.swift
│   │   ├── CircleOfFifths.swift
│   │   └── RNG.swift
│   ├── State/                 # App state management
│   │   ├── AppState.swift
│   │   ├── SliderState.swift
│   │   └── PresetManager.swift
│   ├── Services/              # iOS platform services
│   │   ├── AudioSessionManager.swift
│   │   ├── NowPlayingManager.swift
│   │   └── AudioServiceNotifications.swift
│   ├── MIDI/                  # MIDI discovery and mapping scaffolding
│   │   ├── MIDIManager.swift
│   │   ├── MIDIModels.swift
│   │   └── MidiMapStore.swift
│   ├── Views/                 # SwiftUI views
│   │   ├── MainView.swift
│   │   ├── CircleOfFifthsView.swift
│   │   ├── SnowflakeView.swift
│   │   ├── PresetListView.swift
│   │   ├── RecordingView.swift
│   │   └── SliderControlsView.swift
│   └── Presets/               # Bundled preset files
│       ├── Bright_Bells.json
│       ├── Dark_Textures.json
│       └── ...
```

## Building

1. Open `Kessho.xcodeproj` in Xcode
2. Select your development team in Signing & Capabilities
3. Build and run on simulator or device

## Presets

Presets still use JSON, but the native app should currently be treated as its own evolving target rather than a drop-in parity port of the web app.

```json
{
  "name": "Preset Name",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "state": {
    "masterVolume": 0.75,
    "synthLevel": 0.4,
    "tension": 0.3,
    ...
  }
}
```

Preset migration and parity work still need a dedicated shared layer.

## Background Audio

The app is configured for background audio playback:
- Audio session category set to `.playback`
- `UIBackgroundModes` includes `audio` in Info.plist

## Architecture

- **SwiftUI**: All UI built with SwiftUI
- **AVAudioEngine**: Core audio processing
- **AVAudioSourceNode**: Custom DSP for synthesis
- **Combine**: Reactive state management
- **@MainActor**: Thread-safe UI updates

## License

MIT License - See main project for details
