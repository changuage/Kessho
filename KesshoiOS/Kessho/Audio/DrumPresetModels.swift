import Foundation

/// Shared drum preset model used by the native morph and drum engines.
struct DrumVoicePreset {
    let name: String
    let voice: DrumVoiceType
    let params: [String: Any]
    let tags: [String]
}

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
        tags: ["core", "sub"]
    ),
    DrumVoicePreset(
        name: "Deep Thump",
        voice: .sub,
        params: [
            "drumSubFreq": 38.0,
            "drumSubDecay": 700.0,
            "drumSubLevel": 0.9,
            "drumSubTone": 0.25,
            "drumSubShape": 0.15,
            "drumSubPitchEnv": 10.0,
            "drumSubPitchDecay": 85.0,
            "drumSubDrive": 0.25,
            "drumSubSub": 0.35
        ],
        tags: ["ambient", "sub"]
    )
]

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
        tags: ["core", "kick"]
    ),
    DrumVoicePreset(
        name: "Ambient Boom",
        voice: .kick,
        params: [
            "drumKickFreq": 42.0,
            "drumKickPitchEnv": 18.0,
            "drumKickPitchDecay": 55.0,
            "drumKickDecay": 520.0,
            "drumKickLevel": 0.8,
            "drumKickClick": 0.15,
            "drumKickBody": 0.65,
            "drumKickPunch": 0.5,
            "drumKickTail": 0.4,
            "drumKickTone": 0.2
        ],
        tags: ["ambient", "kick"]
    )
]

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
        tags: ["core", "click"]
    ),
    DrumVoicePreset(
        name: "Crinkle",
        voice: .click,
        params: [
            "drumClickDecay": 18.0,
            "drumClickFilter": 5200.0,
            "drumClickTone": 0.45,
            "drumClickLevel": 0.45,
            "drumClickResonance": 0.55,
            "drumClickPitch": 3200.0,
            "drumClickPitchEnv": 4.0,
            "drumClickMode": "granular",
            "drumClickGrainCount": 4,
            "drumClickGrainSpread": 12.0,
            "drumClickStereoWidth": 0.35
        ],
        tags: ["texture", "click"]
    )
]

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
        tags: ["core", "beep"]
    ),
    DrumVoicePreset(
        name: "Glass",
        voice: .beepHi,
        params: [
            "drumBeepHiFreq": 5200.0,
            "drumBeepHiAttack": 2.0,
            "drumBeepHiDecay": 180.0,
            "drumBeepHiLevel": 0.42,
            "drumBeepHiTone": 0.35,
            "drumBeepHiInharmonic": 0.25,
            "drumBeepHiPartials": 3,
            "drumBeepHiShimmer": 0.3,
            "drumBeepHiShimmerRate": 6.5,
            "drumBeepHiBrightness": 0.75
        ],
        tags: ["ambient", "beep"]
    )
]

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
        tags: ["core", "beep"]
    ),
    DrumVoicePreset(
        name: "Droplet",
        voice: .beepLo,
        params: [
            "drumBeepLoFreq": 260.0,
            "drumBeepLoAttack": 4.0,
            "drumBeepLoDecay": 170.0,
            "drumBeepLoLevel": 0.4,
            "drumBeepLoTone": 0.2,
            "drumBeepLoPitchEnv": -16.0,
            "drumBeepLoPitchDecay": 120.0,
            "drumBeepLoBody": 0.45,
            "drumBeepLoPluck": 0.2,
            "drumBeepLoPluckDamp": 0.65
        ],
        tags: ["ambient", "water"]
    )
]

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
        tags: ["core", "noise"]
    ),
    DrumVoicePreset(
        name: "Breath",
        voice: .noise,
        params: [
            "drumNoiseFilterFreq": 4200.0,
            "drumNoiseFilterQ": 0.8,
            "drumNoiseFilterType": "bandpass",
            "drumNoiseDecay": 180.0,
            "drumNoiseLevel": 0.35,
            "drumNoiseAttack": 6.0,
            "drumNoiseFormant": 0.25,
            "drumNoiseBreath": 0.55,
            "drumNoiseFilterEnv": -0.2,
            "drumNoiseFilterEnvDecay": 220.0,
            "drumNoiseDensity": 0.55,
            "drumNoiseColorLFO": 0.8
        ],
        tags: ["ambient", "noise"]
    )
]
