# iOS Porting Guide: Overview

## Project Summary

This document describes how to port the **Generative Ambient Music** web application to a native iOS app. The primary goal is enabling **screen-off (background) audio playback** on iOS, which is impossible with the current Web Audio API approach.

## Current Web App Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React App (App.tsx)                       │
│  - State management (SliderState with 120+ parameters)          │
│  - UI components (SnowflakeUI, CircleOfFifths)                  │
│  - Preset load/save (JSON files)                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Audio Engine (engine.ts)                      │
│  - AudioContext management                                       │
│  - Audio graph routing                                           │
│  - Parameter smoothing                                           │
│  - Phrase-aligned scheduling                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┬──────────────┐
          ▼              ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Poly Synth │  │  Granular   │  │   Reverb    │  │ Lead Synth  │
│  (6 voices) │  │  (Worklet)  │  │  (Worklet)  │  │  (FM/Bell)  │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │  Ocean Waves    │
                │  (Worklet +     │
                │   Sample)       │
                └─────────────────┘
```

## Key Files to Port

| Web File | Purpose | iOS Equivalent |
|----------|---------|----------------|
| `src/audio/engine.ts` | Main audio engine | `AudioEngine.swift` |
| `src/audio/harmony.ts` | Chord/scale generation | `HarmonyGenerator.swift` |
| `src/audio/scales.ts` | Scale definitions | `Scales.swift` |
| `src/audio/rng.ts` | Deterministic RNG | `SeededRNG.swift` |
| `src/ui/state.ts` | Parameter state | `SliderState.swift` (Codable struct) |
| `public/worklets/granulator.worklet.js` | Granular synthesis | Custom AUAudioUnit |
| `public/worklets/reverb.worklet.js` | FDN reverb | Custom AUAudioUnit or AudioKit |
| `public/worklets/ocean.worklet.js` | Ocean wave synthesis | OceanGenerator.swift |
| `src/ui/SnowflakeUI.tsx` | Visual interface | `SnowflakeView.swift` (SwiftUI) |
| `src/ui/CircleOfFifths.tsx` | Key visualization | `CircleOfFifthsView.swift` |

## iOS Background Audio Requirements

### Info.plist Configuration

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

### AVAudioSession Configuration

```swift
import AVFoundation

func configureAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
        .playback,
        mode: .default,
        options: [.mixWithOthers]
    )
    try session.setActive(true)
}
```

### Now Playing Info (Lock Screen)

```swift
import MediaPlayer

func updateNowPlayingInfo() {
    var info = [String: Any]()
    info[MPMediaItemPropertyTitle] = "Generative Ambient"
    info[MPMediaItemPropertyArtist] = "Kessho"
    info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0
    // No duration since generative music is infinite
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
}
```

### Remote Command Center (Lock Screen Controls)

```swift
import MediaPlayer

func setupRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    
    center.playCommand.addTarget { [weak self] _ in
        self?.audioEngine.start()
        return .success
    }
    
    center.pauseCommand.addTarget { [weak self] _ in
        self?.audioEngine.stop()
        return .success
    }
    
    // Disable skip commands (not applicable for generative music)
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
}
```

## Preset Compatibility

**CRITICAL**: The preset JSON format should remain **100% identical** between web and iOS apps.

### Current Preset Format

```json
{
  "name": "Preset Name",
  "timestamp": "2026-01-28T10:00:00.000Z",
  "state": {
    "masterVolume": 0.75,
    "synthLevel": 0.4,
    "granularLevel": 0.3,
    // ... 120+ parameters
  }
}
```

### iOS Codable Struct

```swift
struct Preset: Codable {
    let name: String
    let timestamp: String
    let state: SliderState
}
```

The iOS app should:
1. Bundle all web presets as resources
2. Support importing/exporting via Files app
3. Optionally sync via iCloud Documents
4. Validate presets against the schema before loading

## Recommended iOS Framework Stack

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| **UI Framework** | SwiftUI | Modern, declarative, matches React patterns |
| **Audio Framework** | AVAudioEngine + custom AUAudioUnit | Full control, low latency |
| **Granular DSP** | Port worklet to C++ AUAudioUnit | Exact algorithm match |
| **Reverb DSP** | Port FDN worklet or use AudioKit | Quality control |
| **State Management** | Combine + @Published | Reactive like React hooks |
| **Persistence** | FileManager + JSON Codable | Simple, cross-platform |
| **Testing** | XCTest + AudioUnit host tests | Verify DSP accuracy |

## Development Phases

### Phase 1: Core Audio Engine (2 weeks)
- Port `engine.ts` to Swift AVAudioEngine
- Implement poly synth with AVAudioUnitGenerator
- Port harmony and scale logic

### Phase 2: DSP Worklets (2-3 weeks)
- Port granulator to C++ AUAudioUnit
- Port FDN reverb to AUAudioUnit
- Port ocean wave generator

### Phase 3: Preset System (1 week)
- Define Codable structs matching TypeScript interfaces
- Implement JSON parsing with validation
- Bundle existing presets

### Phase 4: SwiftUI Interface (2 weeks)
- Port SnowflakeUI to SwiftUI Canvas
- Implement parameter controls
- Add Now Playing and lock screen support

### Phase 5: Polish (1 week)
- Audio interruption handling
- Memory optimization
- App Store preparation

## Quick Reference: Key Concepts

1. **Phrase Length**: 16 seconds (global timing unit)
2. **Voice Count**: 6 polyphonic synth voices
3. **Deterministic RNG**: xmur3 hash + mulberry32 PRNG
4. **Seed Window**: 'hour' or 'day' for time-based variation
5. **Circle of Fifths**: Automatic key drift feature
6. **Euclidean Rhythms**: Lead synth pattern generation (4 lanes)

See individual documentation files for detailed implementation guides.
