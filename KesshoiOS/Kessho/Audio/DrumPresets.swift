import Foundation

/// Drum Voice Presets
/// 64+ presets for the 6 drum voices, spanning:
/// - Ikeda-style minimalist data sounds
/// - ASMR ear candy textures
/// - Ambient/textural percussion
///
/// Each preset defines all parameters for a single voice.
/// The morph system interpolates between any two presets.

struct DrumVoicePreset {
    let name: String
    let voice: DrumVoiceType
    let params: [String: Any]
    let tags: [String]
}

// MARK: - SUB PRESETS (10)

let SUB_PRESETS: [DrumVoicePreset] = [
    DrumVoicePreset(
        name: "Classic Sub",
        voice: .sub,
        params: [
            "drumSubFreq": 50.0,
            "drumSubDecay": 150.0,
            "drumSubLevel": 0.8,
            "drumSubTone": 0.1,
            "drumSubShape": 0.0,
            "drumSubPitchEnv": 0.0,
            "drumSubPitchDecay": 50.0,
            "drumSubDrive": 0.0,
            "drumSubSub": 0.0
        ],
        tags: ["ikeda", "minimal", "default"]
    ),
    DrumVoicePreset(
        name: "Deep Thump",
        voice: .sub,
        params: [
            "drumSubFreq": 35.0,
            "drumSubDecay": 800.0,
            "drumSubLevel": 0.9,
            "drumSubTone": 0.3,
            "drumSubShape": 0.2,
            "drumSubPitchEnv": 12.0,
            "drumSubPitchDecay": 80.0,
            "drumSubDrive": 0.4,
            "drumSubSub": 0.3
        ],
        tags: ["ambient", "deep", "room"]
    ),
    DrumVoicePreset(
        name: "Bubble Up",
        voice: .sub,
        params: [
            "drumSubFreq": 60.0,
            "drumSubDecay": 300.0,
            "drumSubLevel": 0.7,
            "drumSubTone": 0.05,
            "drumSubShape": 0.0,
            "drumSubPitchEnv": -24.0,
            "drumSubPitchDecay": 150.0,
            "drumSubDrive": 0.0,
            "drumSubSub": 0.0
        ],
        tags: ["asmr", "water", "texture"]
    ),
    DrumVoicePreset(
        name: "Warm Pulse",
        voice: .sub,
        params: [
            "drumSubFreq": 45.0,
            "drumSubDecay": 400.0,
            "drumSubLevel": 0.75,
            "drumSubTone": 0.4,
            "drumSubShape": 0.5,
            "drumSubPitchEnv": 6.0,
            "drumSubPitchDecay": 100.0,
            "drumSubDrive": 0.3,
            "drumSubSub": 0.5
        ],
        tags: ["analog", "warm", "ambient"]
    ),
    DrumVoicePreset(
        name: "Data Pulse",
        voice: .sub,
        params: [
            "drumSubFreq": 55.0,
            "drumSubDecay": 80.0,
            "drumSubLevel": 0.85,
            "drumSubTone": 0.0,
            "drumSubShape": 0.0,
            "drumSubPitchEnv": 0.0,
            "drumSubPitchDecay": 20.0,
            "drumSubDrive": 0.0,
            "drumSubSub": 0.0
        ],
        tags: ["ikeda", "digital", "minimal"]
    ),
    DrumVoicePreset(
        name: "Subterranean",
        voice: .sub,
        params: [
            "drumSubFreq": 30.0,
            "drumSubDecay": 2000.0,
            "drumSubLevel": 0.9,
            "drumSubTone": 0.2,
            "drumSubShape": 0.1,
            "drumSubPitchEnv": 4.0,
            "drumSubPitchDecay": 200.0,
            "drumSubDrive": 0.2,
            "drumSubSub": 0.6
        ],
        tags: ["deep", "ambient", "drone"]
    ),
    DrumVoicePreset(
        name: "Soft Touch",
        voice: .sub,
        params: [
            "drumSubFreq": 65.0,
            "drumSubDecay": 60.0,
            "drumSubLevel": 0.4,
            "drumSubTone": 0.05,
            "drumSubShape": 0.0,
            "drumSubPitchEnv": 2.0,
            "drumSubPitchDecay": 30.0,
            "drumSubDrive": 0.0,
            "drumSubSub": 0.0
        ],
        tags: ["asmr", "gentle", "texture"]
    ),
    DrumVoicePreset(
        name: "Pressure Wave",
        voice: .sub,
        params: [
            "drumSubFreq": 40.0,
            "drumSubDecay": 500.0,
            "drumSubLevel": 0.95,
            "drumSubTone": 0.15,
            "drumSubShape": 0.3,
            "drumSubPitchEnv": 36.0,
            "drumSubPitchDecay": 60.0,
            "drumSubDrive": 0.5,
            "drumSubSub": 0.4
        ],
        tags: ["physical", "impact", "ambient"]
    ),
    DrumVoicePreset(
        name: "Sine Ping",
        voice: .sub,
        params: [
            "drumSubFreq": 80.0,
            "drumSubDecay": 200.0,
            "drumSubLevel": 0.6,
            "drumSubTone": 0.0,
            "drumSubShape": 0.0,
            "drumSubPitchEnv": 0.0,
            "drumSubPitchDecay": 50.0,
            "drumSubDrive": 0.0,
            "drumSubSub": 0.0
        ],
        tags: ["clean", "minimal", "pure"]
    ),
    DrumVoicePreset(
        name: "Rumble",
        voice: .sub,
        params: [
            "drumSubFreq": 38.0,
            "drumSubDecay": 600.0,
            "drumSubLevel": 0.85,
            "drumSubTone": 0.6,
            "drumSubShape": 0.9,
            "drumSubPitchEnv": 8.0,
            "drumSubPitchDecay": 120.0,
            "drumSubDrive": 0.7,
            "drumSubSub": 0.3
        ],
        tags: ["texture", "distorted", "ambient"]
    )
]

// MARK: - KICK PRESETS (10)

let KICK_PRESETS: [DrumVoicePreset] = [
    DrumVoicePreset(
        name: "Ikeda Kick",
        voice: .kick,
        params: [
            "drumKickFreq": 55.0,
            "drumKickPitchEnv": 24.0,
            "drumKickPitchDecay": 30.0,
            "drumKickDecay": 200.0,
            "drumKickLevel": 0.7,
            "drumKickClick": 0.3,
            "drumKickBody": 0.3,
            "drumKickPunch": 0.8,
            "drumKickTail": 0.0,
            "drumKickTone": 0.0
        ],
        tags: ["ikeda", "digital", "sharp"]
    ),
    DrumVoicePreset(
        name: "Ambient Boom",
        voice: .kick,
        params: [
            "drumKickFreq": 45.0,
            "drumKickPitchEnv": 18.0,
            "drumKickPitchDecay": 80.0,
            "drumKickDecay": 1500.0,
            "drumKickLevel": 0.75,
            "drumKickClick": 0.1,
            "drumKickBody": 1.0,
            "drumKickPunch": 0.2,
            "drumKickTail": 0.7,
            "drumKickTone": 0.2
        ],
        tags: ["ambient", "spacious", "deep"]
    ),
    DrumVoicePreset(
        name: "Soft Tap",
        voice: .kick,
        params: [
            "drumKickFreq": 80.0,
            "drumKickPitchEnv": 6.0,
            "drumKickPitchDecay": 20.0,
            "drumKickDecay": 80.0,
            "drumKickLevel": 0.35,
            "drumKickClick": 0.0,
            "drumKickBody": 0.6,
            "drumKickPunch": 0.1,
            "drumKickTail": 0.0,
            "drumKickTone": 0.0
        ],
        tags: ["asmr", "gentle", "finger"]
    ),
    DrumVoicePreset(
        name: "Tight Punch",
        voice: .kick,
        params: [
            "drumKickFreq": 60.0,
            "drumKickPitchEnv": 36.0,
            "drumKickPitchDecay": 15.0,
            "drumKickDecay": 120.0,
            "drumKickLevel": 0.85,
            "drumKickClick": 0.5,
            "drumKickBody": 0.2,
            "drumKickPunch": 1.0,
            "drumKickTail": 0.0,
            "drumKickTone": 0.1
        ],
        tags: ["punchy", "tight", "electronic"]
    ),
    DrumVoicePreset(
        name: "808 Deep",
        voice: .kick,
        params: [
            "drumKickFreq": 40.0,
            "drumKickPitchEnv": 12.0,
            "drumKickPitchDecay": 50.0,
            "drumKickDecay": 800.0,
            "drumKickLevel": 0.9,
            "drumKickClick": 0.2,
            "drumKickBody": 0.8,
            "drumKickPunch": 0.5,
            "drumKickTail": 0.3,
            "drumKickTone": 0.1
        ],
        tags: ["808", "deep", "classic"]
    ),
    DrumVoicePreset(
        name: "Paper Thud",
        voice: .kick,
        params: [
            "drumKickFreq": 70.0,
            "drumKickPitchEnv": 8.0,
            "drumKickPitchDecay": 25.0,
            "drumKickDecay": 60.0,
            "drumKickLevel": 0.5,
            "drumKickClick": 0.0,
            "drumKickBody": 0.4,
            "drumKickPunch": 0.2,
            "drumKickTail": 0.0,
            "drumKickTone": 0.0
        ],
        tags: ["asmr", "muted", "soft"]
    ),
    DrumVoicePreset(
        name: "Room Kick",
        voice: .kick,
        params: [
            "drumKickFreq": 55.0,
            "drumKickPitchEnv": 20.0,
            "drumKickPitchDecay": 40.0,
            "drumKickDecay": 400.0,
            "drumKickLevel": 0.7,
            "drumKickClick": 0.25,
            "drumKickBody": 0.7,
            "drumKickPunch": 0.5,
            "drumKickTail": 0.5,
            "drumKickTone": 0.15
        ],
        tags: ["natural", "room", "ambient"]
    ),
    DrumVoicePreset(
        name: "Click Kick",
        voice: .kick,
        params: [
            "drumKickFreq": 65.0,
            "drumKickPitchEnv": 30.0,
            "drumKickPitchDecay": 10.0,
            "drumKickDecay": 150.0,
            "drumKickLevel": 0.7,
            "drumKickClick": 0.9,
            "drumKickBody": 0.3,
            "drumKickPunch": 0.9,
            "drumKickTail": 0.0,
            "drumKickTone": 0.2
        ],
        tags: ["clicky", "attack", "electronic"]
    ),
    DrumVoicePreset(
        name: "Pillow",
        voice: .kick,
        params: [
            "drumKickFreq": 50.0,
            "drumKickPitchEnv": 4.0,
            "drumKickPitchDecay": 60.0,
            "drumKickDecay": 300.0,
            "drumKickLevel": 0.4,
            "drumKickClick": 0.0,
            "drumKickBody": 0.9,
            "drumKickPunch": 0.0,
            "drumKickTail": 0.2,
            "drumKickTone": 0.0
        ],
        tags: ["asmr", "soft", "gentle"]
    ),
    DrumVoicePreset(
        name: "Heartbeat",
        voice: .kick,
        params: [
            "drumKickFreq": 48.0,
            "drumKickPitchEnv": 10.0,
            "drumKickPitchDecay": 100.0,
            "drumKickDecay": 500.0,
            "drumKickLevel": 0.65,
            "drumKickClick": 0.1,
            "drumKickBody": 0.85,
            "drumKickPunch": 0.3,
            "drumKickTail": 0.4,
            "drumKickTone": 0.05
        ],
        tags: ["organic", "pulse", "ambient"]
    )
]

// MARK: - CLICK PRESETS (12)

let CLICK_PRESETS: [DrumVoicePreset] = [
    DrumVoicePreset(
        name: "Data Point",
        voice: .click,
        params: [
            "drumClickDecay": 5.0,
            "drumClickFilter": 4000.0,
            "drumClickTone": 0.3,
            "drumClickLevel": 0.6,
            "drumClickResonance": 0.4,
            "drumClickPitch": 2000.0,
            "drumClickPitchEnv": 0.0,
            "drumClickMode": "impulse",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.0
        ],
        tags: ["ikeda", "digital", "sharp"]
    ),
    DrumVoicePreset(
        name: "Tick",
        voice: .click,
        params: [
            "drumClickDecay": 2.0,
            "drumClickFilter": 6000.0,
            "drumClickTone": 0.1,
            "drumClickLevel": 0.5,
            "drumClickResonance": 0.2,
            "drumClickPitch": 3000.0,
            "drumClickPitchEnv": 0.0,
            "drumClickMode": "impulse",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.0
        ],
        tags: ["clock", "minimal", "sharp"]
    ),
    DrumVoicePreset(
        name: "Blip",
        voice: .click,
        params: [
            "drumClickDecay": 15.0,
            "drumClickFilter": 2000.0,
            "drumClickTone": 0.5,
            "drumClickLevel": 0.55,
            "drumClickResonance": 0.5,
            "drumClickPitch": 1500.0,
            "drumClickPitchEnv": -6.0,
            "drumClickMode": "tonal",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.0
        ],
        tags: ["soft", "digital", "tonal"]
    ),
    DrumVoicePreset(
        name: "Crinkle",
        voice: .click,
        params: [
            "drumClickDecay": 40.0,
            "drumClickFilter": 3000.0,
            "drumClickTone": 0.8,
            "drumClickLevel": 0.45,
            "drumClickResonance": 0.3,
            "drumClickPitch": 2500.0,
            "drumClickPitchEnv": 0.0,
            "drumClickMode": "granular",
            "drumClickGrainCount": 5,
            "drumClickGrainSpread": 20.0,
            "drumClickStereoWidth": 0.6
        ],
        tags: ["asmr", "texture", "paper"]
    ),
    DrumVoicePreset(
        name: "Dust",
        voice: .click,
        params: [
            "drumClickDecay": 3.0,
            "drumClickFilter": 5000.0,
            "drumClickTone": 0.4,
            "drumClickLevel": 0.3,
            "drumClickResonance": 0.1,
            "drumClickPitch": 4000.0,
            "drumClickPitchEnv": 0.0,
            "drumClickMode": "granular",
            "drumClickGrainCount": 2,
            "drumClickGrainSpread": 8.0,
            "drumClickStereoWidth": 0.8
        ],
        tags: ["vinyl", "texture", "sparse"]
    ),
    DrumVoicePreset(
        name: "Glitch",
        voice: .click,
        params: [
            "drumClickDecay": 8.0,
            "drumClickFilter": 3500.0,
            "drumClickTone": 0.6,
            "drumClickLevel": 0.65,
            "drumClickResonance": 0.7,
            "drumClickPitch": 2800.0,
            "drumClickPitchEnv": 24.0,
            "drumClickMode": "tonal",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.3
        ],
        tags: ["digital", "error", "electronic"]
    ),
    DrumVoicePreset(
        name: "Tap",
        voice: .click,
        params: [
            "drumClickDecay": 12.0,
            "drumClickFilter": 1500.0,
            "drumClickTone": 0.4,
            "drumClickLevel": 0.4,
            "drumClickResonance": 0.3,
            "drumClickPitch": 800.0,
            "drumClickPitchEnv": -4.0,
            "drumClickMode": "impulse",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.0
        ],
        tags: ["asmr", "finger", "gentle"]
    ),
    DrumVoicePreset(
        name: "Spark",
        voice: .click,
        params: [
            "drumClickDecay": 6.0,
            "drumClickFilter": 8000.0,
            "drumClickTone": 0.2,
            "drumClickLevel": 0.55,
            "drumClickResonance": 0.8,
            "drumClickPitch": 5000.0,
            "drumClickPitchEnv": 12.0,
            "drumClickMode": "impulse",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.2
        ],
        tags: ["electric", "bright", "sharp"]
    ),
    DrumVoicePreset(
        name: "Pop",
        voice: .click,
        params: [
            "drumClickDecay": 20.0,
            "drumClickFilter": 2000.0,
            "drumClickTone": 0.7,
            "drumClickLevel": 0.5,
            "drumClickResonance": 0.6,
            "drumClickPitch": 1200.0,
            "drumClickPitchEnv": -12.0,
            "drumClickMode": "noise",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.0
        ],
        tags: ["bubble", "soft", "asmr"]
    ),
    DrumVoicePreset(
        name: "Static",
        voice: .click,
        params: [
            "drumClickDecay": 50.0,
            "drumClickFilter": 4500.0,
            "drumClickTone": 0.9,
            "drumClickLevel": 0.35,
            "drumClickResonance": 0.2,
            "drumClickPitch": 3000.0,
            "drumClickPitchEnv": 0.0,
            "drumClickMode": "noise",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.4
        ],
        tags: ["radio", "texture", "noise"]
    ),
    DrumVoicePreset(
        name: "Scratch",
        voice: .click,
        params: [
            "drumClickDecay": 25.0,
            "drumClickFilter": 3000.0,
            "drumClickTone": 0.6,
            "drumClickLevel": 0.5,
            "drumClickResonance": 0.4,
            "drumClickPitch": 2000.0,
            "drumClickPitchEnv": -18.0,
            "drumClickMode": "granular",
            "drumClickGrainCount": 4,
            "drumClickGrainSpread": 15.0,
            "drumClickStereoWidth": 0.5
        ],
        tags: ["vinyl", "texture", "dj"]
    ),
    DrumVoicePreset(
        name: "Micro Hit",
        voice: .click,
        params: [
            "drumClickDecay": 1.0,
            "drumClickFilter": 5000.0,
            "drumClickTone": 0.2,
            "drumClickLevel": 0.45,
            "drumClickResonance": 0.3,
            "drumClickPitch": 2500.0,
            "drumClickPitchEnv": 6.0,
            "drumClickMode": "tonal",
            "drumClickGrainCount": 1,
            "drumClickGrainSpread": 0.0,
            "drumClickStereoWidth": 0.0
        ],
        tags: ["tiny", "minimal", "impact"]
    )
]

// MARK: - BEEP HI PRESETS (10)

let BEEP_HI_PRESETS: [DrumVoicePreset] = [
    DrumVoicePreset(
        name: "Data Ping",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 4000.0,
            "drumBeepHiAttack": 1.0,
            "drumBeepHiDecay": 80.0,
            "drumBeepHiLevel": 0.5,
            "drumBeepHiTone": 0.2,
            "drumBeepHiInharmonic": 0.0,
            "drumBeepHiPartials": 1,
            "drumBeepHiShimmer": 0.0,
            "drumBeepHiShimmerRate": 4.0,
            "drumBeepHiBrightness": 0.5
        ],
        tags: ["ikeda", "digital", "pure"]
    ),
    DrumVoicePreset(
        name: "Glass",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 3200.0,
            "drumBeepHiAttack": 2.0,
            "drumBeepHiDecay": 800.0,
            "drumBeepHiLevel": 0.45,
            "drumBeepHiTone": 0.4,
            "drumBeepHiInharmonic": 0.3,
            "drumBeepHiPartials": 4,
            "drumBeepHiShimmer": 0.1,
            "drumBeepHiShimmerRate": 3.0,
            "drumBeepHiBrightness": 0.7
        ],
        tags: ["bell", "resonant", "ambient"]
    ),
    DrumVoicePreset(
        name: "Bell",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 2800.0,
            "drumBeepHiAttack": 1.0,
            "drumBeepHiDecay": 1200.0,
            "drumBeepHiLevel": 0.5,
            "drumBeepHiTone": 0.5,
            "drumBeepHiInharmonic": 0.5,
            "drumBeepHiPartials": 5,
            "drumBeepHiShimmer": 0.2,
            "drumBeepHiShimmerRate": 2.0,
            "drumBeepHiBrightness": 0.6
        ],
        tags: ["bell", "metallic", "ambient"]
    ),
    DrumVoicePreset(
        name: "Crystal",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 6000.0,
            "drumBeepHiAttack": 0.0,
            "drumBeepHiDecay": 400.0,
            "drumBeepHiLevel": 0.4,
            "drumBeepHiTone": 0.1,
            "drumBeepHiInharmonic": 0.1,
            "drumBeepHiPartials": 3,
            "drumBeepHiShimmer": 0.05,
            "drumBeepHiShimmerRate": 5.0,
            "drumBeepHiBrightness": 0.9
        ],
        tags: ["bright", "pure", "asmr"]
    ),
    DrumVoicePreset(
        name: "Shimmer",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 3500.0,
            "drumBeepHiAttack": 5.0,
            "drumBeepHiDecay": 600.0,
            "drumBeepHiLevel": 0.45,
            "drumBeepHiTone": 0.3,
            "drumBeepHiInharmonic": 0.2,
            "drumBeepHiPartials": 3,
            "drumBeepHiShimmer": 0.7,
            "drumBeepHiShimmerRate": 6.0,
            "drumBeepHiBrightness": 0.6
        ],
        tags: ["evolving", "ambient", "texture"]
    ),
    DrumVoicePreset(
        name: "Chime",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 4500.0,
            "drumBeepHiAttack": 1.0,
            "drumBeepHiDecay": 1500.0,
            "drumBeepHiLevel": 0.4,
            "drumBeepHiTone": 0.35,
            "drumBeepHiInharmonic": 0.4,
            "drumBeepHiPartials": 6,
            "drumBeepHiShimmer": 0.3,
            "drumBeepHiShimmerRate": 4.0,
            "drumBeepHiBrightness": 0.65
        ],
        tags: ["wind", "bell", "ambient"]
    ),
    DrumVoicePreset(
        name: "Metallic",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 5000.0,
            "drumBeepHiAttack": 0.0,
            "drumBeepHiDecay": 200.0,
            "drumBeepHiLevel": 0.55,
            "drumBeepHiTone": 0.8,
            "drumBeepHiInharmonic": 0.6,
            "drumBeepHiPartials": 4,
            "drumBeepHiShimmer": 0.0,
            "drumBeepHiShimmerRate": 4.0,
            "drumBeepHiBrightness": 0.8
        ],
        tags: ["industrial", "harsh", "electronic"]
    ),
    DrumVoicePreset(
        name: "Whistle",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 8000.0,
            "drumBeepHiAttack": 20.0,
            "drumBeepHiDecay": 300.0,
            "drumBeepHiLevel": 0.35,
            "drumBeepHiTone": 0.0,
            "drumBeepHiInharmonic": 0.0,
            "drumBeepHiPartials": 1,
            "drumBeepHiShimmer": 0.1,
            "drumBeepHiShimmerRate": 5.0,
            "drumBeepHiBrightness": 0.4
        ],
        tags: ["pure", "high", "asmr"]
    ),
    DrumVoicePreset(
        name: "Sparkle",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 5500.0,
            "drumBeepHiAttack": 0.0,
            "drumBeepHiDecay": 500.0,
            "drumBeepHiLevel": 0.4,
            "drumBeepHiTone": 0.25,
            "drumBeepHiInharmonic": 0.25,
            "drumBeepHiPartials": 4,
            "drumBeepHiShimmer": 0.5,
            "drumBeepHiShimmerRate": 8.0,
            "drumBeepHiBrightness": 0.85
        ],
        tags: ["magical", "bright", "texture"]
    ),
    DrumVoicePreset(
        name: "Tink",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 7000.0,
            "drumBeepHiAttack": 0.0,
            "drumBeepHiDecay": 50.0,
            "drumBeepHiLevel": 0.45,
            "drumBeepHiTone": 0.15,
            "drumBeepHiInharmonic": 0.15,
            "drumBeepHiPartials": 2,
            "drumBeepHiShimmer": 0.0,
            "drumBeepHiShimmerRate": 4.0,
            "drumBeepHiBrightness": 0.75
        ],
        tags: ["tiny", "metal", "minimal"]
    )
]

// MARK: - BEEP LO PRESETS (10)

let BEEP_LO_PRESETS: [DrumVoicePreset] = [
    DrumVoicePreset(
        name: "Blip",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 400.0,
            "drumBeepLoAttack": 2.0,
            "drumBeepLoDecay": 100.0,
            "drumBeepLoLevel": 0.5,
            "drumBeepLoTone": 0.1,
            "drumBeepLoPitchEnv": 0.0,
            "drumBeepLoPitchDecay": 50.0,
            "drumBeepLoBody": 0.3,
            "drumBeepLoPluck": 0.0,
            "drumBeepLoPluckDamp": 0.5
        ],
        tags: ["digital", "minimal", "default"]
    ),
    DrumVoicePreset(
        name: "Droplet",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 600.0,
            "drumBeepLoAttack": 0.0,
            "drumBeepLoDecay": 200.0,
            "drumBeepLoLevel": 0.5,
            "drumBeepLoTone": 0.0,
            "drumBeepLoPitchEnv": -18.0,
            "drumBeepLoPitchDecay": 80.0,
            "drumBeepLoBody": 0.4,
            "drumBeepLoPluck": 0.0,
            "drumBeepLoPluckDamp": 0.5
        ],
        tags: ["water", "asmr", "natural"]
    ),
    DrumVoicePreset(
        name: "Bubble",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 350.0,
            "drumBeepLoAttack": 5.0,
            "drumBeepLoDecay": 300.0,
            "drumBeepLoLevel": 0.45,
            "drumBeepLoTone": 0.05,
            "drumBeepLoPitchEnv": -24.0,
            "drumBeepLoPitchDecay": 150.0,
            "drumBeepLoBody": 0.6,
            "drumBeepLoPluck": 0.0,
            "drumBeepLoPluckDamp": 0.5
        ],
        tags: ["underwater", "asmr", "soft"]
    ),
    DrumVoicePreset(
        name: "Pluck",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 500.0,
            "drumBeepLoAttack": 0.0,
            "drumBeepLoDecay": 400.0,
            "drumBeepLoLevel": 0.55,
            "drumBeepLoTone": 0.2,
            "drumBeepLoPitchEnv": 2.0,
            "drumBeepLoPitchDecay": 30.0,
            "drumBeepLoBody": 0.5,
            "drumBeepLoPluck": 0.8,
            "drumBeepLoPluckDamp": 0.4
        ],
        tags: ["string", "acoustic", "ambient"]
    ),
    DrumVoicePreset(
        name: "Muted Tap",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 300.0,
            "drumBeepLoAttack": 1.0,
            "drumBeepLoDecay": 80.0,
            "drumBeepLoLevel": 0.4,
            "drumBeepLoTone": 0.0,
            "drumBeepLoPitchEnv": 4.0,
            "drumBeepLoPitchDecay": 20.0,
            "drumBeepLoBody": 0.3,
            "drumBeepLoPluck": 0.5,
            "drumBeepLoPluckDamp": 0.9
        ],
        tags: ["soft", "asmr", "gentle"]
    ),
    DrumVoicePreset(
        name: "Bloop",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 450.0,
            "drumBeepLoAttack": 0.0,
            "drumBeepLoDecay": 150.0,
            "drumBeepLoLevel": 0.5,
            "drumBeepLoTone": 0.15,
            "drumBeepLoPitchEnv": 36.0,
            "drumBeepLoPitchDecay": 40.0,
            "drumBeepLoBody": 0.4,
            "drumBeepLoPluck": 0.0,
            "drumBeepLoPluckDamp": 0.5
        ],
        tags: ["cartoon", "fun", "digital"]
    ),
    DrumVoicePreset(
        name: "Ping",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 800.0,
            "drumBeepLoAttack": 0.0,
            "drumBeepLoDecay": 500.0,
            "drumBeepLoLevel": 0.45,
            "drumBeepLoTone": 0.0,
            "drumBeepLoPitchEnv": 0.0,
            "drumBeepLoPitchDecay": 50.0,
            "drumBeepLoBody": 0.2,
            "drumBeepLoPluck": 0.0,
            "drumBeepLoPluckDamp": 0.5
        ],
        tags: ["sonar", "pure", "minimal"]
    ),
    DrumVoicePreset(
        name: "Woody",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 550.0,
            "drumBeepLoAttack": 0.0,
            "drumBeepLoDecay": 120.0,
            "drumBeepLoLevel": 0.55,
            "drumBeepLoTone": 0.3,
            "drumBeepLoPitchEnv": 8.0,
            "drumBeepLoPitchDecay": 15.0,
            "drumBeepLoBody": 0.6,
            "drumBeepLoPluck": 0.7,
            "drumBeepLoPluckDamp": 0.3
        ],
        tags: ["wood", "percussion", "acoustic"]
    ),
    DrumVoicePreset(
        name: "Soft Ping",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 600.0,
            "drumBeepLoAttack": 10.0,
            "drumBeepLoDecay": 400.0,
            "drumBeepLoLevel": 0.35,
            "drumBeepLoTone": 0.0,
            "drumBeepLoPitchEnv": 0.0,
            "drumBeepLoPitchDecay": 50.0,
            "drumBeepLoBody": 0.4,
            "drumBeepLoPluck": 0.0,
            "drumBeepLoPluckDamp": 0.5
        ],
        tags: ["gentle", "asmr", "ambient"]
    ),
    DrumVoicePreset(
        name: "Chirp",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 700.0,
            "drumBeepLoAttack": 0.0,
            "drumBeepLoDecay": 60.0,
            "drumBeepLoLevel": 0.45,
            "drumBeepLoTone": 0.1,
            "drumBeepLoPitchEnv": -30.0,
            "drumBeepLoPitchDecay": 25.0,
            "drumBeepLoBody": 0.3,
            "drumBeepLoPluck": 0.2,
            "drumBeepLoPluckDamp": 0.4
        ],
        tags: ["bird", "nature", "texture"]
    )
]

// MARK: - NOISE PRESETS (12)

let NOISE_PRESETS: [DrumVoicePreset] = [
    DrumVoicePreset(
        name: "Hi-Hat",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 8000.0,
            "drumNoiseFilterQ": 1.0,
            "drumNoiseFilterType": "highpass",
            "drumNoiseDecay": 30.0,
            "drumNoiseLevel": 0.4,
            "drumNoiseAttack": 0.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.0,
            "drumNoiseFilterEnv": 0.0,
            "drumNoiseFilterEnvDecay": 100.0,
            "drumNoiseDensity": 1.0,
            "drumNoiseColorLFO": 0.0
        ],
        tags: ["classic", "percussion", "default"]
    ),
    DrumVoicePreset(
        name: "Breath",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 2000.0,
            "drumNoiseFilterQ": 2.0,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 300.0,
            "drumNoiseLevel": 0.35,
            "drumNoiseAttack": 50.0,
            "drumNoiseFormant": 0.2,
            "drumNoiseBreath": 0.7,
            "drumNoiseFilterEnv": 0.3,
            "drumNoiseFilterEnvDecay": 200.0,
            "drumNoiseDensity": 0.8,
            "drumNoiseColorLFO": 0.5
        ],
        tags: ["asmr", "soft", "air"]
    ),
    DrumVoicePreset(
        name: "Whisper",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 1500.0,
            "drumNoiseFilterQ": 4.0,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 200.0,
            "drumNoiseLevel": 0.3,
            "drumNoiseAttack": 20.0,
            "drumNoiseFormant": 0.6,
            "drumNoiseBreath": 0.5,
            "drumNoiseFilterEnv": 0.2,
            "drumNoiseFilterEnvDecay": 150.0,
            "drumNoiseDensity": 0.7,
            "drumNoiseColorLFO": 1.0
        ],
        tags: ["asmr", "voice", "texture"]
    ),
    DrumVoicePreset(
        name: "Dust",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 5000.0,
            "drumNoiseFilterQ": 0.8,
            "drumNoiseFilterType": "highpass",
            "drumNoiseDecay": 10.0,
            "drumNoiseLevel": 0.25,
            "drumNoiseAttack": 0.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.0,
            "drumNoiseFilterEnv": 0.0,
            "drumNoiseFilterEnvDecay": 50.0,
            "drumNoiseDensity": 0.2,
            "drumNoiseColorLFO": 0.0
        ],
        tags: ["vinyl", "sparse", "texture"]
    ),
    DrumVoicePreset(
        name: "Texture",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 3000.0,
            "drumNoiseFilterQ": 2.0,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 800.0,
            "drumNoiseLevel": 0.3,
            "drumNoiseAttack": 100.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.3,
            "drumNoiseFilterEnv": 0.0,
            "drumNoiseFilterEnvDecay": 400.0,
            "drumNoiseDensity": 0.6,
            "drumNoiseColorLFO": 0.3
        ],
        tags: ["ambient", "drone", "background"]
    ),
    DrumVoicePreset(
        name: "Scrape",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 4000.0,
            "drumNoiseFilterQ": 3.0,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 150.0,
            "drumNoiseLevel": 0.4,
            "drumNoiseAttack": 5.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.0,
            "drumNoiseFilterEnv": -0.6,
            "drumNoiseFilterEnvDecay": 100.0,
            "drumNoiseDensity": 0.9,
            "drumNoiseColorLFO": 2.0
        ],
        tags: ["friction", "texture", "industrial"]
    ),
    DrumVoicePreset(
        name: "Hiss",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 10000.0,
            "drumNoiseFilterQ": 0.5,
            "drumNoiseFilterType": "highpass",
            "drumNoiseDecay": 100.0,
            "drumNoiseLevel": 0.35,
            "drumNoiseAttack": 0.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.0,
            "drumNoiseFilterEnv": 0.0,
            "drumNoiseFilterEnvDecay": 100.0,
            "drumNoiseDensity": 1.0,
            "drumNoiseColorLFO": 0.0
        ],
        tags: ["white", "bright", "electronic"]
    ),
    DrumVoicePreset(
        name: "Shaker",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 6000.0,
            "drumNoiseFilterQ": 1.5,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 80.0,
            "drumNoiseLevel": 0.4,
            "drumNoiseAttack": 2.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.0,
            "drumNoiseFilterEnv": 0.2,
            "drumNoiseFilterEnvDecay": 50.0,
            "drumNoiseDensity": 0.85,
            "drumNoiseColorLFO": 0.0
        ],
        tags: ["percussion", "latin", "rhythm"]
    ),
    DrumVoicePreset(
        name: "Ocean Spray",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 2500.0,
            "drumNoiseFilterQ": 1.0,
            "drumNoiseFilterType": "lowpass",
            "drumNoiseDecay": 1500.0,
            "drumNoiseLevel": 0.3,
            "drumNoiseAttack": 200.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.4,
            "drumNoiseFilterEnv": 0.4,
            "drumNoiseFilterEnvDecay": 600.0,
            "drumNoiseDensity": 0.7,
            "drumNoiseColorLFO": 0.2
        ],
        tags: ["water", "ambient", "nature"]
    ),
    DrumVoicePreset(
        name: "Steam",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 3500.0,
            "drumNoiseFilterQ": 2.0,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 400.0,
            "drumNoiseLevel": 0.4,
            "drumNoiseAttack": 10.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.2,
            "drumNoiseFilterEnv": 0.7,
            "drumNoiseFilterEnvDecay": 200.0,
            "drumNoiseDensity": 0.9,
            "drumNoiseColorLFO": 1.5
        ],
        tags: ["pressure", "industrial", "texture"]
    ),
    DrumVoicePreset(
        name: "Rustle",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 4000.0,
            "drumNoiseFilterQ": 1.5,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 200.0,
            "drumNoiseLevel": 0.3,
            "drumNoiseAttack": 30.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.1,
            "drumNoiseFilterEnv": 0.1,
            "drumNoiseFilterEnvDecay": 150.0,
            "drumNoiseDensity": 0.4,
            "drumNoiseColorLFO": 0.8
        ],
        tags: ["leaves", "nature", "asmr"]
    ),
    DrumVoicePreset(
        name: "Static",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 5000.0,
            "drumNoiseFilterQ": 2.0,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 150.0,
            "drumNoiseLevel": 0.35,
            "drumNoiseAttack": 0.0,
            "drumNoiseFormant": 0.0,
            "drumNoiseBreath": 0.0,
            "drumNoiseFilterEnv": 0.0,
            "drumNoiseFilterEnvDecay": 100.0,
            "drumNoiseDensity": 1.0,
            "drumNoiseColorLFO": 4.0
        ],
        tags: ["electronic", "radio", "texture"]
    )
]

// MARK: - Combined Preset Access

let DRUM_VOICE_PRESETS: [DrumVoiceType: [DrumVoicePreset]] = [
    .sub: SUB_PRESETS,
    .kick: KICK_PRESETS,
    .click: CLICK_PRESETS,
    .beepHi: BEEP_HI_PRESETS,
    .beepLo: BEEP_LO_PRESETS,
    .noise: NOISE_PRESETS
]

/// Get a preset by name and voice type
func getPreset(voice: DrumVoiceType, name: String) -> DrumVoicePreset? {
    return DRUM_VOICE_PRESETS[voice]?.first { $0.name == name }
}

/// Get all preset names for a voice type
func getPresetNames(voice: DrumVoiceType) -> [String] {
    return DRUM_VOICE_PRESETS[voice]?.map { $0.name } ?? []
}

/// Get presets by tag
func getPresetsByTag(voice: DrumVoiceType, tag: String) -> [DrumVoicePreset] {
    return DRUM_VOICE_PRESETS[voice]?.filter { $0.tags.contains(tag) } ?? []
}
