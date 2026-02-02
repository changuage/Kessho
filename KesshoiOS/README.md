# Kessho iOS

A generative ambient music synthesizer for iOS, ported from the web app.

## Features

- **Generative Harmony**: Deterministic chord and scale generation based on tension parameter
- **Circle of Fifths Drift**: Automatic key changes following the circle of fifths
- **Polyphonic Synthesizer**: 6-voice synthesizer with filter and envelope
- **Granular Processor**: Grain-based texture generation
- **Lead Melody**: Optional melodic lead voice
- **Snowflake Visualization**: Real-time parameter visualization
- **Cross-Platform Presets**: JSON presets compatible with web version
- **Background Audio**: Continues playing when app is in background

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
│   ├── Views/                 # SwiftUI views
│   │   ├── MainView.swift
│   │   ├── CircleOfFifthsView.swift
│   │   ├── SnowflakeView.swift
│   │   ├── PresetListView.swift
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

## Cross-Platform Presets

Presets use the same JSON format as the web version:

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

Presets can be shared between iOS and web versions.

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
