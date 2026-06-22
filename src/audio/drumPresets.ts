/**
 * Drum Voice Presets
 *
 * Generated from kessho-drum-engine-presets-expanded-v3.runtime-ready.json.
 * Factory entries only; user presets remain in the public backup/import file.
 */

import type { DrumVoiceType } from './drumSynth';
export type { DrumVoiceType };

export interface DrumVoicePreset {
  name: string;
  voice: DrumVoiceType;
  params: Record<string, number | string>;
  tags: string[];
}

export const SUB_PRESETS: DrumVoicePreset[] = [
  {
    "name": "Bubble Up",
    "voice": "sub",
    "tags": [
      "asmr",
      "water",
      "texture"
    ],
    "params": {
      "drumSubDecay": 300,
      "drumSubDrive": 0,
      "drumSubFreq": 60,
      "drumSubLevel": 0.7,
      "drumSubPitchDecay": 150,
      "drumSubPitchEnv": -24,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0.05,
      "drumSubAttack": 0,
      "drumSubVariation": 0.1,
      "drumSubDistance": 0.18
    }
  },
  {
    "name": "Classic Sub",
    "voice": "sub",
    "tags": [
      "ikeda",
      "minimal",
      "default"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 150,
      "drumSubDrive": 0,
      "drumSubFreq": 50,
      "drumSubLevel": 0.8,
      "drumSubPitchDecay": 50,
      "drumSubPitchEnv": 0,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0.1,
      "drumSubVariation": 0.04,
      "drumSubDistance": 0.08
    }
  },
  {
    "name": "Data Pulse",
    "voice": "sub",
    "tags": [
      "ikeda",
      "digital",
      "minimal"
    ],
    "params": {
      "drumSubDecay": 80,
      "drumSubDrive": 0,
      "drumSubFreq": 55,
      "drumSubLevel": 0.85,
      "drumSubPitchDecay": 20,
      "drumSubPitchEnv": 0,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0,
      "drumSubAttack": 0,
      "drumSubVariation": 0.04,
      "drumSubDistance": 0.08
    }
  },
  {
    "name": "Deep Space",
    "voice": "sub",
    "tags": [
      "ambient",
      "space",
      "drone",
      "atmospheric"
    ],
    "params": {
      "drumSubDecay": 2000,
      "drumSubDrive": 0,
      "drumSubFreq": 32,
      "drumSubLevel": 0.6,
      "drumSubPitchDecay": 300,
      "drumSubPitchEnv": 8,
      "drumSubShape": 0,
      "drumSubSub": 0.4,
      "drumSubTone": 0.1,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Deep Thump",
    "voice": "sub",
    "tags": [
      "ambient",
      "deep",
      "room"
    ],
    "params": {
      "drumSubDecay": 800,
      "drumSubDrive": 0.4,
      "drumSubFreq": 35,
      "drumSubLevel": 0.9,
      "drumSubPitchDecay": 80,
      "drumSubPitchEnv": 12,
      "drumSubShape": 0.2,
      "drumSubSub": 0.3,
      "drumSubTone": 0.3,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Earth Rumble",
    "voice": "sub",
    "tags": [
      "organic",
      "thunder",
      "nature",
      "deep"
    ],
    "params": {
      "drumSubDecay": 1500,
      "drumSubDrive": 0.15,
      "drumSubFreq": 35,
      "drumSubLevel": 0.75,
      "drumSubPitchDecay": 200,
      "drumSubPitchEnv": 12,
      "drumSubShape": 0.1,
      "drumSubSub": 0.5,
      "drumSubTone": 0.1,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Heartbeat Pulse",
    "voice": "sub",
    "tags": [
      "organic",
      "body",
      "pulse",
      "natural"
    ],
    "params": {
      "drumSubDecay": 450,
      "drumSubDrive": 0,
      "drumSubFreq": 42,
      "drumSubLevel": 0.7,
      "drumSubPitchDecay": 80,
      "drumSubPitchEnv": 6,
      "drumSubShape": 0,
      "drumSubSub": 0.3,
      "drumSubTone": 0.05,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Pressure Wave",
    "voice": "sub",
    "tags": [
      "physical",
      "impact",
      "ambient"
    ],
    "params": {
      "drumSubDecay": 500,
      "drumSubDrive": 0.5,
      "drumSubFreq": 40,
      "drumSubLevel": 0.95,
      "drumSubPitchDecay": 60,
      "drumSubPitchEnv": 36,
      "drumSubShape": 0.3,
      "drumSubSub": 0.4,
      "drumSubTone": 0.15,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Rumble",
    "voice": "sub",
    "tags": [
      "texture",
      "distorted",
      "ambient"
    ],
    "params": {
      "drumSubDecay": 600,
      "drumSubDrive": 0.7,
      "drumSubFreq": 38,
      "drumSubLevel": 0.85,
      "drumSubPitchDecay": 120,
      "drumSubPitchEnv": 8,
      "drumSubShape": 0.9,
      "drumSubSub": 0.3,
      "drumSubTone": 0.6,
      "drumSubAttack": 0,
      "drumSubVariation": 0.1,
      "drumSubDistance": 0.12
    }
  },
  {
    "name": "Sine Ping",
    "voice": "sub",
    "tags": [
      "clean",
      "minimal",
      "pure"
    ],
    "params": {
      "drumSubDecay": 200,
      "drumSubDrive": 0,
      "drumSubFreq": 80,
      "drumSubLevel": 0.6,
      "drumSubPitchDecay": 50,
      "drumSubPitchEnv": 0,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0,
      "drumSubAttack": 0,
      "drumSubVariation": 0.04,
      "drumSubDistance": 0.08
    }
  },
  {
    "name": "Soft Touch",
    "voice": "sub",
    "tags": [
      "asmr",
      "gentle",
      "texture"
    ],
    "params": {
      "drumSubDecay": 60,
      "drumSubDrive": 0,
      "drumSubFreq": 65,
      "drumSubLevel": 0.4,
      "drumSubPitchDecay": 30,
      "drumSubPitchEnv": 2,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0.05,
      "drumSubAttack": 0,
      "drumSubVariation": 0.1,
      "drumSubDistance": 0.18
    }
  },
  {
    "name": "Subterranean",
    "voice": "sub",
    "tags": [
      "deep",
      "ambient",
      "drone"
    ],
    "params": {
      "drumSubDecay": 2000,
      "drumSubDrive": 0.2,
      "drumSubFreq": 30,
      "drumSubLevel": 0.9,
      "drumSubPitchDecay": 200,
      "drumSubPitchEnv": 4,
      "drumSubShape": 0.1,
      "drumSubSub": 0.6,
      "drumSubTone": 0.2,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Tidal Pull",
    "voice": "sub",
    "tags": [
      "ambient",
      "ocean",
      "slow",
      "deep"
    ],
    "params": {
      "drumSubDecay": 1200,
      "drumSubDrive": 0.1,
      "drumSubFreq": 38,
      "drumSubLevel": 0.55,
      "drumSubPitchDecay": 250,
      "drumSubPitchEnv": 10,
      "drumSubShape": 0.05,
      "drumSubSub": 0.35,
      "drumSubTone": 0.05,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Velvet Thump",
    "voice": "sub",
    "tags": [
      "ambient",
      "soft",
      "pillowy",
      "gentle"
    ],
    "params": {
      "drumSubDecay": 400,
      "drumSubDrive": 0,
      "drumSubFreq": 50,
      "drumSubLevel": 0.5,
      "drumSubPitchDecay": 60,
      "drumSubPitchEnv": 4,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.22
    }
  },
  {
    "name": "Warm Pulse",
    "voice": "sub",
    "tags": [
      "analog",
      "warm",
      "ambient"
    ],
    "params": {
      "drumSubDecay": 400,
      "drumSubDrive": 0.3,
      "drumSubFreq": 45,
      "drumSubLevel": 0.75,
      "drumSubPitchDecay": 100,
      "drumSubPitchEnv": 6,
      "drumSubShape": 0.5,
      "drumSubSub": 0.5,
      "drumSubTone": 0.4,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "Wooden Resonance",
    "voice": "sub",
    "tags": [
      "organic",
      "wood",
      "hollow",
      "natural"
    ],
    "params": {
      "drumSubDecay": 250,
      "drumSubDrive": 0.1,
      "drumSubFreq": 70,
      "drumSubLevel": 0.65,
      "drumSubPitchDecay": 40,
      "drumSubPitchEnv": 10,
      "drumSubShape": 0.2,
      "drumSubSub": 0,
      "drumSubTone": 0.15,
      "drumSubAttack": 0,
      "drumSubVariation": 0.14,
      "drumSubDistance": 0.32
    }
  },
  {
    "name": "808 Long Boom",
    "voice": "sub",
    "tags": [
      "808",
      "analog",
      "long",
      "bass"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 1400,
      "drumSubDrive": 0.12,
      "drumSubFreq": 42,
      "drumSubLevel": 0.86,
      "drumSubPitchDecay": 120,
      "drumSubPitchEnv": 7,
      "drumSubShape": 0.08,
      "drumSubSub": 0.45,
      "drumSubTone": 0.18,
      "drumSubVariation": 0.02,
      "drumSubDistance": 0.08
    }
  },
  {
    "name": "808 Short Drop",
    "voice": "sub",
    "tags": [
      "808",
      "analog",
      "short",
      "electro"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 420,
      "drumSubDrive": 0.08,
      "drumSubFreq": 48,
      "drumSubLevel": 0.82,
      "drumSubPitchDecay": 70,
      "drumSubPitchEnv": 10,
      "drumSubShape": 0.04,
      "drumSubSub": 0.25,
      "drumSubTone": 0.12,
      "drumSubVariation": 0.02,
      "drumSubDistance": 0.08
    }
  },
  {
    "name": "606 Blip Sub",
    "voice": "sub",
    "tags": [
      "606",
      "analog",
      "blip",
      "minimal"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 95,
      "drumSubDrive": 0,
      "drumSubFreq": 72,
      "drumSubLevel": 0.7,
      "drumSubPitchDecay": 20,
      "drumSubPitchEnv": -2,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0.08,
      "drumSubVariation": 0.02,
      "drumSubDistance": 0.05
    }
  },
  {
    "name": "Electro Clipped Sub",
    "voice": "sub",
    "tags": [
      "electro",
      "distorted",
      "clip",
      "bass"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 300,
      "drumSubDrive": 0.55,
      "drumSubFreq": 50,
      "drumSubLevel": 0.78,
      "drumSubPitchDecay": 55,
      "drumSubPitchEnv": 16,
      "drumSubShape": 0.58,
      "drumSubSub": 0.2,
      "drumSubTone": 0.42,
      "drumSubVariation": 0.05,
      "drumSubDistance": 0.06
    }
  },
  {
    "name": "Warehouse Rumble",
    "voice": "sub",
    "tags": [
      "warehouse",
      "distorted",
      "rumble",
      "club"
    ],
    "params": {
      "drumSubAttack": 2,
      "drumSubDecay": 1800,
      "drumSubDrive": 0.72,
      "drumSubFreq": 34,
      "drumSubLevel": 0.9,
      "drumSubPitchDecay": 220,
      "drumSubPitchEnv": 4,
      "drumSubShape": 0.76,
      "drumSubSub": 0.7,
      "drumSubTone": 0.48,
      "drumSubVariation": 0.08,
      "drumSubDistance": 0.18
    }
  },
  {
    "name": "Data Pulse Narrow",
    "voice": "sub",
    "tags": [
      "ikeda",
      "data",
      "digital",
      "dry"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 48,
      "drumSubDrive": 0,
      "drumSubFreq": 58,
      "drumSubLevel": 0.72,
      "drumSubPitchDecay": 12,
      "drumSubPitchEnv": 0,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0,
      "drumSubVariation": 0,
      "drumSubDistance": 0.02
    }
  },
  {
    "name": "Zero Cross Thud",
    "voice": "sub",
    "tags": [
      "digital",
      "zero",
      "thud",
      "minimal"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 75,
      "drumSubDrive": 0,
      "drumSubFreq": 54,
      "drumSubLevel": 0.78,
      "drumSubPitchDecay": 10,
      "drumSubPitchEnv": 0,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0.02,
      "drumSubVariation": 0,
      "drumSubDistance": 0.02
    }
  },
  {
    "name": "Rubber Sub Drop",
    "voice": "sub",
    "tags": [
      "idm",
      "rubber",
      "drop",
      "bass"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 520,
      "drumSubDrive": 0.18,
      "drumSubFreq": 46,
      "drumSubLevel": 0.82,
      "drumSubPitchDecay": 110,
      "drumSubPitchEnv": 26,
      "drumSubShape": 0.28,
      "drumSubSub": 0.25,
      "drumSubTone": 0.24,
      "drumSubVariation": 0.06,
      "drumSubDistance": 0.08
    }
  },
  {
    "name": "Pure 32Hz Ping",
    "voice": "sub",
    "tags": [
      "pure",
      "sine",
      "sub",
      "minimal"
    ],
    "params": {
      "drumSubAttack": 1,
      "drumSubDecay": 260,
      "drumSubDrive": 0,
      "drumSubFreq": 32,
      "drumSubLevel": 0.64,
      "drumSubPitchDecay": 80,
      "drumSubPitchEnv": 0,
      "drumSubShape": 0,
      "drumSubSub": 0.2,
      "drumSubTone": 0,
      "drumSubVariation": 0,
      "drumSubDistance": 0.04
    }
  },
  {
    "name": "Distorted Pressure",
    "voice": "sub",
    "tags": [
      "pressure",
      "distorted",
      "bass",
      "industrial"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 900,
      "drumSubDrive": 0.85,
      "drumSubFreq": 38,
      "drumSubLevel": 0.88,
      "drumSubPitchDecay": 160,
      "drumSubPitchEnv": 9,
      "drumSubShape": 0.95,
      "drumSubSub": 0.55,
      "drumSubTone": 0.6,
      "drumSubVariation": 0.07,
      "drumSubDistance": 0.1
    }
  },
  {
    "name": "Dub Plate Sub",
    "voice": "sub",
    "tags": [
      "dub",
      "analog",
      "deep",
      "warm"
    ],
    "params": {
      "drumSubAttack": 1,
      "drumSubDecay": 1100,
      "drumSubDrive": 0.2,
      "drumSubFreq": 40,
      "drumSubLevel": 0.78,
      "drumSubPitchDecay": 140,
      "drumSubPitchEnv": 5,
      "drumSubShape": 0.12,
      "drumSubSub": 0.65,
      "drumSubTone": 0.22,
      "drumSubVariation": 0.04,
      "drumSubDistance": 0.12
    }
  },
  {
    "name": "Ikeda DC Blink",
    "voice": "sub",
    "tags": [
      "ikeda",
      "digital",
      "pulse",
      "micro"
    ],
    "params": {
      "drumSubAttack": 0,
      "drumSubDecay": 22,
      "drumSubDrive": 0,
      "drumSubFreq": 64,
      "drumSubLevel": 0.68,
      "drumSubPitchDecay": 6,
      "drumSubPitchEnv": 0,
      "drumSubShape": 0,
      "drumSubSub": 0,
      "drumSubTone": 0,
      "drumSubVariation": 0,
      "drumSubDistance": 0.01
    }
  }
];

export const KICK_PRESETS: DrumVoicePreset[] = [
  {
    "name": "808 Deep",
    "voice": "kick",
    "tags": [
      "808",
      "deep",
      "classic"
    ],
    "params": {
      "drumKickBody": 0.8,
      "drumKickClick": 0.2,
      "drumKickDecay": 800,
      "drumKickFreq": 40,
      "drumKickLevel": 0.9,
      "drumKickPitchDecay": 50,
      "drumKickPitchEnv": 12,
      "drumKickPunch": 0.5,
      "drumKickTail": 0.3,
      "drumKickTone": 0.1,
      "drumKickAttack": 0,
      "drumKickVariation": 0.06,
      "drumKickDistance": 0.16
    }
  },
  {
    "name": "Ambient Boom",
    "voice": "kick",
    "tags": [
      "ambient",
      "spacious",
      "deep"
    ],
    "params": {
      "drumKickBody": 1,
      "drumKickClick": 0.1,
      "drumKickDecay": 1500,
      "drumKickFreq": 45,
      "drumKickLevel": 0.75,
      "drumKickPitchDecay": 80,
      "drumKickPitchEnv": 18,
      "drumKickPunch": 0.2,
      "drumKickTail": 0.7,
      "drumKickTone": 0.2,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Cajon",
    "voice": "kick",
    "tags": [
      "organic",
      "wood",
      "percussion",
      "natural"
    ],
    "params": {
      "drumKickBody": 0.7,
      "drumKickClick": 0.4,
      "drumKickDecay": 180,
      "drumKickFreq": 65,
      "drumKickLevel": 0.7,
      "drumKickPitchDecay": 25,
      "drumKickPitchEnv": 12,
      "drumKickPunch": 0.5,
      "drumKickTail": 0.2,
      "drumKickTone": 0.15,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Click Kick",
    "voice": "kick",
    "tags": [
      "clicky",
      "attack",
      "electronic"
    ],
    "params": {
      "drumKickBody": 0.3,
      "drumKickClick": 0.9,
      "drumKickDecay": 150,
      "drumKickFreq": 65,
      "drumKickLevel": 0.7,
      "drumKickPitchDecay": 10,
      "drumKickPitchEnv": 30,
      "drumKickPunch": 0.9,
      "drumKickTail": 0,
      "drumKickTone": 0.2,
      "drumKickAttack": 0,
      "drumKickVariation": 0.06,
      "drumKickDistance": 0.16
    }
  },
  {
    "name": "Distant Thunder",
    "voice": "kick",
    "tags": [
      "ambient",
      "storm",
      "atmospheric",
      "deep"
    ],
    "params": {
      "drumKickBody": 0.7,
      "drumKickClick": 0,
      "drumKickDecay": 1200,
      "drumKickFreq": 40,
      "drumKickLevel": 0.55,
      "drumKickPitchDecay": 120,
      "drumKickPitchEnv": 10,
      "drumKickPunch": 0.1,
      "drumKickTail": 0.8,
      "drumKickTone": 0.1,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Djembe",
    "voice": "kick",
    "tags": [
      "organic",
      "hand drum",
      "african",
      "natural"
    ],
    "params": {
      "drumKickBody": 0.9,
      "drumKickClick": 0.15,
      "drumKickDecay": 250,
      "drumKickFreq": 70,
      "drumKickLevel": 0.7,
      "drumKickPitchDecay": 35,
      "drumKickPitchEnv": 14,
      "drumKickPunch": 0.4,
      "drumKickTail": 0.35,
      "drumKickTone": 0.1,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Frame Drum",
    "voice": "kick",
    "tags": [
      "organic",
      "hand drum",
      "ethnic",
      "natural"
    ],
    "params": {
      "drumKickBody": 0.95,
      "drumKickClick": 0.05,
      "drumKickDecay": 350,
      "drumKickFreq": 45,
      "drumKickLevel": 0.6,
      "drumKickPitchDecay": 60,
      "drumKickPitchEnv": 8,
      "drumKickPunch": 0.15,
      "drumKickTail": 0.5,
      "drumKickTone": 0.05,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Ghost Pulse",
    "voice": "kick",
    "tags": [
      "ambient",
      "subtle",
      "background",
      "minimal"
    ],
    "params": {
      "drumKickBody": 0.8,
      "drumKickClick": 0,
      "drumKickDecay": 600,
      "drumKickFreq": 45,
      "drumKickLevel": 0.4,
      "drumKickPitchDecay": 80,
      "drumKickPitchEnv": 6,
      "drumKickPunch": 0.05,
      "drumKickTail": 0.5,
      "drumKickTone": 0,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Heartbeat",
    "voice": "kick",
    "tags": [
      "organic",
      "pulse",
      "ambient"
    ],
    "params": {
      "drumKickBody": 0.85,
      "drumKickClick": 0.1,
      "drumKickDecay": 500,
      "drumKickFreq": 48,
      "drumKickLevel": 0.65,
      "drumKickPitchDecay": 100,
      "drumKickPitchEnv": 10,
      "drumKickPunch": 0.3,
      "drumKickTail": 0.4,
      "drumKickTone": 0.05,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Ikeda Kick",
    "voice": "kick",
    "tags": [
      "ikeda",
      "digital",
      "sharp"
    ],
    "params": {
      "drumKickBody": 0.3,
      "drumKickClick": 0.3,
      "drumKickDecay": 200,
      "drumKickFreq": 55,
      "drumKickLevel": 0.7,
      "drumKickPitchDecay": 30,
      "drumKickPitchEnv": 24,
      "drumKickPunch": 0.8,
      "drumKickTail": 0,
      "drumKickTone": 0,
      "drumKickAttack": 0,
      "drumKickVariation": 0.04,
      "drumKickDistance": 0.08
    }
  },
  {
    "name": "Paper Thud",
    "voice": "kick",
    "tags": [
      "asmr",
      "muted",
      "soft"
    ],
    "params": {
      "drumKickBody": 0.4,
      "drumKickClick": 0,
      "drumKickDecay": 60,
      "drumKickFreq": 70,
      "drumKickLevel": 0.5,
      "drumKickPitchDecay": 25,
      "drumKickPitchEnv": 8,
      "drumKickPunch": 0.2,
      "drumKickTail": 0,
      "drumKickTone": 0,
      "drumKickAttack": 0,
      "drumKickVariation": 0.1,
      "drumKickDistance": 0.16
    }
  },
  {
    "name": "Pillow",
    "voice": "kick",
    "tags": [
      "asmr",
      "soft",
      "gentle"
    ],
    "params": {
      "drumKickBody": 0.9,
      "drumKickClick": 0,
      "drumKickDecay": 300,
      "drumKickFreq": 50,
      "drumKickLevel": 0.4,
      "drumKickPitchDecay": 60,
      "drumKickPitchEnv": 4,
      "drumKickPunch": 0,
      "drumKickTail": 0.2,
      "drumKickTone": 0,
      "drumKickAttack": 0,
      "drumKickVariation": 0.1,
      "drumKickDistance": 0.16
    }
  },
  {
    "name": "Room Kick",
    "voice": "kick",
    "tags": [
      "natural",
      "room",
      "ambient"
    ],
    "params": {
      "drumKickBody": 0.7,
      "drumKickClick": 0.25,
      "drumKickDecay": 400,
      "drumKickFreq": 55,
      "drumKickLevel": 0.7,
      "drumKickPitchDecay": 40,
      "drumKickPitchEnv": 20,
      "drumKickPunch": 0.5,
      "drumKickTail": 0.5,
      "drumKickTone": 0.15,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Slow Bloom",
    "voice": "kick",
    "tags": [
      "ambient",
      "swell",
      "gradual",
      "atmospheric"
    ],
    "params": {
      "drumKickBody": 0.9,
      "drumKickClick": 0,
      "drumKickDecay": 900,
      "drumKickFreq": 42,
      "drumKickLevel": 0.5,
      "drumKickPitchDecay": 150,
      "drumKickPitchEnv": 4,
      "drumKickPunch": 0,
      "drumKickTail": 0.7,
      "drumKickTone": 0.05,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Soft Tap",
    "voice": "kick",
    "tags": [
      "asmr",
      "gentle",
      "finger"
    ],
    "params": {
      "drumKickBody": 0.6,
      "drumKickClick": 0,
      "drumKickDecay": 80,
      "drumKickFreq": 80,
      "drumKickLevel": 0.35,
      "drumKickPitchDecay": 20,
      "drumKickPitchEnv": 6,
      "drumKickPunch": 0.1,
      "drumKickTail": 0,
      "drumKickTone": 0,
      "drumKickAttack": 0,
      "drumKickVariation": 0.1,
      "drumKickDistance": 0.16
    }
  },
  {
    "name": "Stomped Earth",
    "voice": "kick",
    "tags": [
      "organic",
      "foot",
      "ground",
      "natural"
    ],
    "params": {
      "drumKickBody": 0.85,
      "drumKickClick": 0.05,
      "drumKickDecay": 300,
      "drumKickFreq": 50,
      "drumKickLevel": 0.6,
      "drumKickPitchDecay": 50,
      "drumKickPitchEnv": 6,
      "drumKickPunch": 0.2,
      "drumKickTail": 0.6,
      "drumKickTone": 0.05,
      "drumKickAttack": 0,
      "drumKickVariation": 0.14,
      "drumKickDistance": 0.32
    }
  },
  {
    "name": "Tight Punch",
    "voice": "kick",
    "tags": [
      "punchy",
      "tight",
      "electronic"
    ],
    "params": {
      "drumKickBody": 0.2,
      "drumKickClick": 0.5,
      "drumKickDecay": 120,
      "drumKickFreq": 60,
      "drumKickLevel": 0.85,
      "drumKickPitchDecay": 15,
      "drumKickPitchEnv": 36,
      "drumKickPunch": 1,
      "drumKickTail": 0,
      "drumKickTone": 0.1,
      "drumKickAttack": 0,
      "drumKickVariation": 0.06,
      "drumKickDistance": 0.16
    }
  },
  {
    "name": "909 Plastic Punch",
    "voice": "kick",
    "tags": [
      "909",
      "analog",
      "punchy",
      "classic"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.62,
      "drumKickClick": 0.36,
      "drumKickDecay": 310,
      "drumKickDistance": 0.06,
      "drumKickFreq": 55,
      "drumKickLevel": 0.84,
      "drumKickPitchDecay": 46,
      "drumKickPitchEnv": 28,
      "drumKickPunch": 0.84,
      "drumKickTail": 0.2,
      "drumKickTone": 0.18,
      "drumKickVariation": 0.03
    }
  },
  {
    "name": "606 Tick Kick",
    "voice": "kick",
    "tags": [
      "606",
      "analog",
      "thin",
      "classic"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.28,
      "drumKickClick": 0.52,
      "drumKickDecay": 120,
      "drumKickDistance": 0.05,
      "drumKickFreq": 72,
      "drumKickLevel": 0.7,
      "drumKickPitchDecay": 22,
      "drumKickPitchEnv": 24,
      "drumKickPunch": 0.66,
      "drumKickTail": 0,
      "drumKickTone": 0.08,
      "drumKickVariation": 0.02
    }
  },
  {
    "name": "CR78 Soft Kick",
    "voice": "kick",
    "tags": [
      "cr78",
      "analog",
      "soft",
      "vintage"
    ],
    "params": {
      "drumKickAttack": 2,
      "drumKickBody": 0.75,
      "drumKickClick": 0.1,
      "drumKickDecay": 230,
      "drumKickDistance": 0.14,
      "drumKickFreq": 60,
      "drumKickLevel": 0.6,
      "drumKickPitchDecay": 75,
      "drumKickPitchEnv": 8,
      "drumKickPunch": 0.18,
      "drumKickTail": 0.22,
      "drumKickTone": 0.03,
      "drumKickVariation": 0.05
    }
  },
  {
    "name": "Gabber Micro Kick",
    "voice": "kick",
    "tags": [
      "distorted",
      "club",
      "hard",
      "micro"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.32,
      "drumKickClick": 0.65,
      "drumKickDecay": 115,
      "drumKickDistance": 0.04,
      "drumKickFreq": 58,
      "drumKickLevel": 0.88,
      "drumKickPitchDecay": 18,
      "drumKickPitchEnv": 34,
      "drumKickPunch": 1,
      "drumKickTail": 0,
      "drumKickTone": 0.58,
      "drumKickVariation": 0.04
    }
  },
  {
    "name": "FM Rubber Kick",
    "voice": "kick",
    "tags": [
      "fm",
      "rubber",
      "idm",
      "elastic"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.55,
      "drumKickClick": 0.18,
      "drumKickDecay": 360,
      "drumKickDistance": 0.08,
      "drumKickFreq": 48,
      "drumKickLevel": 0.78,
      "drumKickPitchDecay": 70,
      "drumKickPitchEnv": 42,
      "drumKickPunch": 0.68,
      "drumKickTail": 0.12,
      "drumKickTone": 0.18,
      "drumKickVariation": 0.06
    }
  },
  {
    "name": "Elastic IDM Kick",
    "voice": "kick",
    "tags": [
      "idm",
      "elastic",
      "experimental",
      "pitch"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.38,
      "drumKickClick": 0.42,
      "drumKickDecay": 260,
      "drumKickDistance": 0.06,
      "drumKickFreq": 51,
      "drumKickLevel": 0.76,
      "drumKickPitchDecay": 42,
      "drumKickPitchEnv": 48,
      "drumKickPunch": 0.78,
      "drumKickTail": 0.05,
      "drumKickTone": 0.24,
      "drumKickVariation": 0.08
    }
  },
  {
    "name": "Electro Knock Kick",
    "voice": "kick",
    "tags": [
      "electro",
      "knock",
      "analog",
      "punchy"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.48,
      "drumKickClick": 0.48,
      "drumKickDecay": 180,
      "drumKickDistance": 0.06,
      "drumKickFreq": 63,
      "drumKickLevel": 0.8,
      "drumKickPitchDecay": 32,
      "drumKickPitchEnv": 22,
      "drumKickPunch": 0.74,
      "drumKickTail": 0,
      "drumKickTone": 0.16,
      "drumKickVariation": 0.04
    }
  },
  {
    "name": "Clickless 808 Bloom",
    "voice": "kick",
    "tags": [
      "808",
      "analog",
      "long",
      "smooth"
    ],
    "params": {
      "drumKickAttack": 3,
      "drumKickBody": 0.92,
      "drumKickClick": 0,
      "drumKickDecay": 920,
      "drumKickDistance": 0.1,
      "drumKickFreq": 43,
      "drumKickLevel": 0.8,
      "drumKickPitchDecay": 135,
      "drumKickPitchEnv": 9,
      "drumKickPunch": 0.08,
      "drumKickTail": 0.55,
      "drumKickTone": 0.08,
      "drumKickVariation": 0.02
    }
  },
  {
    "name": "Needle Kick",
    "voice": "kick",
    "tags": [
      "digital",
      "needle",
      "ikeda",
      "sharp"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.12,
      "drumKickClick": 0.95,
      "drumKickDecay": 72,
      "drumKickDistance": 0.02,
      "drumKickFreq": 59,
      "drumKickLevel": 0.72,
      "drumKickPitchDecay": 12,
      "drumKickPitchEnv": 30,
      "drumKickPunch": 1,
      "drumKickTail": 0,
      "drumKickTone": 0.05,
      "drumKickVariation": 0
    }
  },
  {
    "name": "Broken DAC Kick",
    "voice": "kick",
    "tags": [
      "broken",
      "dac",
      "digital",
      "glitch"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.22,
      "drumKickClick": 0.72,
      "drumKickDecay": 135,
      "drumKickDistance": 0.04,
      "drumKickFreq": 56,
      "drumKickLevel": 0.78,
      "drumKickPitchDecay": 20,
      "drumKickPitchEnv": 32,
      "drumKickPunch": 0.86,
      "drumKickTail": 0,
      "drumKickTone": 0.55,
      "drumKickVariation": 0.07
    }
  },
  {
    "name": "Synare Drop Kick",
    "voice": "kick",
    "tags": [
      "synare",
      "laser",
      "pitch",
      "vintage"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.44,
      "drumKickClick": 0.28,
      "drumKickDecay": 300,
      "drumKickDistance": 0.08,
      "drumKickFreq": 50,
      "drumKickLevel": 0.74,
      "drumKickPitchDecay": 120,
      "drumKickPitchEnv": 60,
      "drumKickPunch": 0.54,
      "drumKickTail": 0.08,
      "drumKickTone": 0.22,
      "drumKickVariation": 0.04
    }
  },
  {
    "name": "Compact Club Kick",
    "voice": "kick",
    "tags": [
      "club",
      "tight",
      "modern",
      "punchy"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.58,
      "drumKickClick": 0.35,
      "drumKickDecay": 220,
      "drumKickDistance": 0.05,
      "drumKickFreq": 52,
      "drumKickLevel": 0.9,
      "drumKickPitchDecay": 36,
      "drumKickPitchEnv": 32,
      "drumKickPunch": 0.92,
      "drumKickTail": 0.08,
      "drumKickTone": 0.2,
      "drumKickVariation": 0.02
    }
  },
  {
    "name": "Airless Lab Kick",
    "voice": "kick",
    "tags": [
      "lab",
      "dry",
      "digital",
      "minimal"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.24,
      "drumKickClick": 0.4,
      "drumKickDecay": 95,
      "drumKickDistance": 0.01,
      "drumKickFreq": 57,
      "drumKickLevel": 0.74,
      "drumKickPitchDecay": 18,
      "drumKickPitchEnv": 22,
      "drumKickPunch": 0.82,
      "drumKickTail": 0,
      "drumKickTone": 0,
      "drumKickVariation": 0
    }
  },
  {
    "name": "Metal Box Kick",
    "voice": "kick",
    "tags": [
      "metal",
      "box",
      "industrial",
      "fm"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.28,
      "drumKickClick": 0.62,
      "drumKickDecay": 190,
      "drumKickDistance": 0.08,
      "drumKickFreq": 66,
      "drumKickLevel": 0.72,
      "drumKickPitchDecay": 30,
      "drumKickPitchEnv": 30,
      "drumKickPunch": 0.72,
      "drumKickTail": 0.03,
      "drumKickTone": 0.42,
      "drumKickVariation": 0.06
    }
  },
  {
    "name": "Tape Saturated Kick",
    "voice": "kick",
    "tags": [
      "tape",
      "saturated",
      "warm",
      "analog"
    ],
    "params": {
      "drumKickAttack": 1,
      "drumKickBody": 0.72,
      "drumKickClick": 0.2,
      "drumKickDecay": 420,
      "drumKickDistance": 0.14,
      "drumKickFreq": 49,
      "drumKickLevel": 0.82,
      "drumKickPitchDecay": 80,
      "drumKickPitchEnv": 16,
      "drumKickPunch": 0.45,
      "drumKickTail": 0.35,
      "drumKickTone": 0.26,
      "drumKickVariation": 0.04
    }
  },
  {
    "name": "Zero Attack Kick",
    "voice": "kick",
    "tags": [
      "digital",
      "zero",
      "precise",
      "sharp"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.08,
      "drumKickClick": 0.85,
      "drumKickDecay": 55,
      "drumKickDistance": 0.01,
      "drumKickFreq": 54,
      "drumKickLevel": 0.75,
      "drumKickPitchDecay": 8,
      "drumKickPitchEnv": 28,
      "drumKickPunch": 1,
      "drumKickTail": 0,
      "drumKickTone": 0,
      "drumKickVariation": 0
    }
  },
  {
    "name": "Detroit Snap Kick",
    "voice": "kick",
    "tags": [
      "detroit",
      "electro",
      "snap",
      "analog"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.42,
      "drumKickClick": 0.55,
      "drumKickDecay": 240,
      "drumKickDistance": 0.06,
      "drumKickFreq": 58,
      "drumKickLevel": 0.82,
      "drumKickPitchDecay": 38,
      "drumKickPitchEnv": 26,
      "drumKickPunch": 0.82,
      "drumKickTail": 0.08,
      "drumKickTone": 0.18,
      "drumKickVariation": 0.03
    }
  },
  {
    "name": "IDM Origami Kick",
    "voice": "kick",
    "tags": [
      "idm",
      "folded",
      "fm",
      "experimental"
    ],
    "params": {
      "drumKickAttack": 0,
      "drumKickBody": 0.34,
      "drumKickClick": 0.52,
      "drumKickDecay": 170,
      "drumKickDistance": 0.05,
      "drumKickFreq": 60,
      "drumKickLevel": 0.76,
      "drumKickPitchDecay": 28,
      "drumKickPitchEnv": 44,
      "drumKickPunch": 0.86,
      "drumKickTail": 0,
      "drumKickTone": 0.34,
      "drumKickVariation": 0.08
    }
  }
];

export const CLICK_PRESETS: DrumVoicePreset[] = [
  {
    "name": "Blip",
    "voice": "click",
    "tags": [
      "soft",
      "digital",
      "tonal"
    ],
    "params": {
      "drumClickDecay": 15,
      "drumClickExciterColor": 0,
      "drumClickFilter": 2000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.55,
      "drumClickMode": "tonal",
      "drumClickPitch": 1500,
      "drumClickPitchEnv": -6,
      "drumClickResonance": 0.5,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.5,
      "drumClickAttack": 0,
      "drumClickVariation": 0.1,
      "drumClickDistance": 0.14
    }
  },
  {
    "name": "Crinkle",
    "voice": "click",
    "tags": [
      "asmr",
      "texture",
      "paper"
    ],
    "params": {
      "drumClickDecay": 40,
      "drumClickExciterColor": 0,
      "drumClickFilter": 3000,
      "drumClickGrainCount": 5,
      "drumClickGrainSpread": 20,
      "drumClickLevel": 0.45,
      "drumClickMode": "granular",
      "drumClickPitch": 2500,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.3,
      "drumClickStereoWidth": 0.6,
      "drumClickTone": 0.8,
      "drumClickAttack": 0,
      "drumClickVariation": 0.1,
      "drumClickDistance": 0.14
    }
  },
  {
    "name": "Data Point",
    "voice": "click",
    "tags": [
      "ikeda",
      "digital",
      "sharp"
    ],
    "params": {
      "drumClickDecay": 5,
      "drumClickExciterColor": 0,
      "drumClickFilter": 4000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.6,
      "drumClickMode": "impulse",
      "drumClickPitch": 2000,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.4,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.3,
      "drumClickAttack": 0,
      "drumClickVariation": 0.04,
      "drumClickDistance": 0.08
    }
  },
  {
    "name": "Dewdrop",
    "voice": "click",
    "tags": [
      "ambient",
      "water",
      "delicate",
      "minimal"
    ],
    "params": {
      "drumClickDecay": 35,
      "drumClickExciterColor": 0,
      "drumClickFilter": 1200,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.3,
      "drumClickMode": "tonal",
      "drumClickPitch": 800,
      "drumClickPitchEnv": -8,
      "drumClickResonance": 0.6,
      "drumClickStereoWidth": 0.2,
      "drumClickTone": 0.5,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.22
    }
  },
  {
    "name": "Distant Ping",
    "voice": "click",
    "tags": [
      "ambient",
      "faraway",
      "subtle",
      "minimal"
    ],
    "params": {
      "drumClickDecay": 40,
      "drumClickExciterColor": 0,
      "drumClickFilter": 2000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.25,
      "drumClickMode": "impulse",
      "drumClickPitch": 1500,
      "drumClickPitchEnv": -4,
      "drumClickResonance": 0.4,
      "drumClickStereoWidth": 0.8,
      "drumClickTone": 0.3,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.32
    }
  },
  {
    "name": "Dust",
    "voice": "click",
    "tags": [
      "vinyl",
      "texture",
      "sparse"
    ],
    "params": {
      "drumClickDecay": 3,
      "drumClickExciterColor": 0,
      "drumClickFilter": 5000,
      "drumClickGrainCount": 2,
      "drumClickGrainSpread": 8,
      "drumClickLevel": 0.3,
      "drumClickMode": "granular",
      "drumClickPitch": 4000,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.1,
      "drumClickStereoWidth": 0.8,
      "drumClickTone": 0.4,
      "drumClickAttack": 0,
      "drumClickVariation": 0.08,
      "drumClickDistance": 0.12
    }
  },
  {
    "name": "Glitch",
    "voice": "click",
    "tags": [
      "digital",
      "error",
      "electronic"
    ],
    "params": {
      "drumClickDecay": 8,
      "drumClickExciterColor": 0,
      "drumClickFilter": 3500,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.65,
      "drumClickMode": "tonal",
      "drumClickPitch": 2800,
      "drumClickPitchEnv": 24,
      "drumClickResonance": 0.7,
      "drumClickStereoWidth": 0.3,
      "drumClickTone": 0.6,
      "drumClickAttack": 0,
      "drumClickVariation": 0.06,
      "drumClickDistance": 0.08
    }
  },
  {
    "name": "Grain Scatter",
    "voice": "click",
    "tags": [
      "ambient",
      "texture",
      "granular",
      "atmospheric"
    ],
    "params": {
      "drumClickDecay": 60,
      "drumClickExciterColor": 0,
      "drumClickFilter": 2500,
      "drumClickGrainCount": 6,
      "drumClickGrainSpread": 30,
      "drumClickLevel": 0.35,
      "drumClickMode": "granular",
      "drumClickPitch": 2000,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.3,
      "drumClickStereoWidth": 0.9,
      "drumClickTone": 0.4,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.32
    }
  },
  {
    "name": "Ice Crystal",
    "voice": "click",
    "tags": [
      "ambient",
      "frozen",
      "bright",
      "delicate"
    ],
    "params": {
      "drumClickDecay": 18,
      "drumClickExciterColor": 0,
      "drumClickFilter": 6000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.4,
      "drumClickMode": "tonal",
      "drumClickPitch": 4000,
      "drumClickPitchEnv": 6,
      "drumClickResonance": 0.7,
      "drumClickStereoWidth": 0.3,
      "drumClickTone": 0.3,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.22
    }
  },
  {
    "name": "Micro Hit",
    "voice": "click",
    "tags": [
      "tiny",
      "minimal",
      "impact"
    ],
    "params": {
      "drumClickDecay": 1,
      "drumClickExciterColor": 0,
      "drumClickFilter": 5000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.45,
      "drumClickMode": "tonal",
      "drumClickPitch": 2500,
      "drumClickPitchEnv": 6,
      "drumClickResonance": 0.3,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.2,
      "drumClickAttack": 0,
      "drumClickVariation": 0.04,
      "drumClickDistance": 0.08
    }
  },
  {
    "name": "Noise Blend",
    "voice": "click",
    "tags": [
      "exciter",
      "noise",
      "texture"
    ],
    "params": {
      "drumClickDecay": 12,
      "drumClickExciterColor": 0.8,
      "drumClickFilter": 6000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.45,
      "drumClickMode": "impulse",
      "drumClickPitch": 3000,
      "drumClickPitchEnv": 2,
      "drumClickResonance": 0.3,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.5,
      "drumClickAttack": 0,
      "drumClickVariation": 0.08,
      "drumClickDistance": 0.12
    }
  },
  {
    "name": "Pop",
    "voice": "click",
    "tags": [
      "bubble",
      "soft",
      "asmr"
    ],
    "params": {
      "drumClickDecay": 20,
      "drumClickExciterColor": 0,
      "drumClickFilter": 2000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.5,
      "drumClickMode": "noise",
      "drumClickPitch": 1200,
      "drumClickPitchEnv": -12,
      "drumClickResonance": 0.6,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.7,
      "drumClickAttack": 0,
      "drumClickVariation": 0.1,
      "drumClickDistance": 0.14
    }
  },
  {
    "name": "Raindrop",
    "voice": "click",
    "tags": [
      "organic",
      "water",
      "nature",
      "asmr"
    ],
    "params": {
      "drumClickDecay": 25,
      "drumClickExciterColor": 0,
      "drumClickFilter": 1500,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.45,
      "drumClickMode": "tonal",
      "drumClickPitch": 600,
      "drumClickPitchEnv": -12,
      "drumClickResonance": 0.5,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.6,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.22
    }
  },
  {
    "name": "Scratch",
    "voice": "click",
    "tags": [
      "vinyl",
      "texture",
      "dj"
    ],
    "params": {
      "drumClickDecay": 25,
      "drumClickExciterColor": 0,
      "drumClickFilter": 3000,
      "drumClickGrainCount": 4,
      "drumClickGrainSpread": 15,
      "drumClickLevel": 0.5,
      "drumClickMode": "granular",
      "drumClickPitch": 2000,
      "drumClickPitchEnv": -18,
      "drumClickResonance": 0.4,
      "drumClickStereoWidth": 0.5,
      "drumClickTone": 0.6,
      "drumClickAttack": 0,
      "drumClickVariation": 0.08,
      "drumClickDistance": 0.12
    }
  },
  {
    "name": "Seed Pod",
    "voice": "click",
    "tags": [
      "organic",
      "rattle",
      "nature",
      "texture"
    ],
    "params": {
      "drumClickDecay": 20,
      "drumClickExciterColor": 0,
      "drumClickFilter": 3000,
      "drumClickGrainCount": 6,
      "drumClickGrainSpread": 8,
      "drumClickLevel": 0.4,
      "drumClickMode": "granular",
      "drumClickPitch": 2500,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.25,
      "drumClickStereoWidth": 0.4,
      "drumClickTone": 0.5,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.32
    }
  },
  {
    "name": "Smooth Transient",
    "voice": "click",
    "tags": [
      "exciter",
      "smooth",
      "hybrid"
    ],
    "params": {
      "drumClickDecay": 8,
      "drumClickExciterColor": 0.3,
      "drumClickFilter": 5000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.55,
      "drumClickMode": "impulse",
      "drumClickPitch": 2500,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.5,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.4,
      "drumClickAttack": 0,
      "drumClickVariation": 0.08,
      "drumClickDistance": 0.12
    }
  },
  {
    "name": "Spark",
    "voice": "click",
    "tags": [
      "electric",
      "bright",
      "sharp"
    ],
    "params": {
      "drumClickDecay": 6,
      "drumClickExciterColor": 0,
      "drumClickFilter": 8000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.55,
      "drumClickMode": "impulse",
      "drumClickPitch": 5000,
      "drumClickPitchEnv": 12,
      "drumClickResonance": 0.8,
      "drumClickStereoWidth": 0.2,
      "drumClickTone": 0.2,
      "drumClickAttack": 0,
      "drumClickVariation": 0.08,
      "drumClickDistance": 0.12
    }
  },
  {
    "name": "Static",
    "voice": "click",
    "tags": [
      "radio",
      "texture",
      "noise"
    ],
    "params": {
      "drumClickDecay": 50,
      "drumClickExciterColor": 0,
      "drumClickFilter": 4500,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.35,
      "drumClickMode": "noise",
      "drumClickPitch": 3000,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.2,
      "drumClickStereoWidth": 0.4,
      "drumClickTone": 0.9,
      "drumClickAttack": 0,
      "drumClickVariation": 0.08,
      "drumClickDistance": 0.12
    }
  },
  {
    "name": "Stone Tap",
    "voice": "click",
    "tags": [
      "organic",
      "rock",
      "percussion",
      "natural"
    ],
    "params": {
      "drumClickDecay": 8,
      "drumClickExciterColor": 0,
      "drumClickFilter": 3500,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.5,
      "drumClickMode": "impulse",
      "drumClickPitch": 3500,
      "drumClickPitchEnv": 4,
      "drumClickResonance": 0.3,
      "drumClickStereoWidth": 0.2,
      "drumClickTone": 0.4,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.32
    }
  },
  {
    "name": "Tap",
    "voice": "click",
    "tags": [
      "asmr",
      "finger",
      "gentle"
    ],
    "params": {
      "drumClickDecay": 12,
      "drumClickExciterColor": 0,
      "drumClickFilter": 1500,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.4,
      "drumClickMode": "impulse",
      "drumClickPitch": 800,
      "drumClickPitchEnv": -4,
      "drumClickResonance": 0.3,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.4,
      "drumClickAttack": 0,
      "drumClickVariation": 0.1,
      "drumClickDistance": 0.14
    }
  },
  {
    "name": "Tick",
    "voice": "click",
    "tags": [
      "clock",
      "minimal",
      "sharp"
    ],
    "params": {
      "drumClickDecay": 2,
      "drumClickExciterColor": 0,
      "drumClickFilter": 6000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.5,
      "drumClickMode": "impulse",
      "drumClickPitch": 3000,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.2,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.1,
      "drumClickAttack": 0,
      "drumClickVariation": 0.04,
      "drumClickDistance": 0.08
    }
  },
  {
    "name": "Tonal Wash",
    "voice": "click",
    "tags": [
      "exciter",
      "tonal",
      "warm"
    ],
    "params": {
      "drumClickDecay": 15,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 3000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.5,
      "drumClickMode": "impulse",
      "drumClickPitch": 1800,
      "drumClickPitchEnv": -6,
      "drumClickResonance": 0.6,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.6,
      "drumClickAttack": 0,
      "drumClickVariation": 0.08,
      "drumClickDistance": 0.12
    }
  },
  {
    "name": "Twig Snap",
    "voice": "click",
    "tags": [
      "organic",
      "wood",
      "forest",
      "natural"
    ],
    "params": {
      "drumClickDecay": 15,
      "drumClickExciterColor": 0,
      "drumClickFilter": 4500,
      "drumClickGrainCount": 4,
      "drumClickGrainSpread": 12,
      "drumClickLevel": 0.5,
      "drumClickMode": "granular",
      "drumClickPitch": 3000,
      "drumClickPitchEnv": 8,
      "drumClickResonance": 0.2,
      "drumClickStereoWidth": 0.5,
      "drumClickTone": 0.7,
      "drumClickAttack": 0,
      "drumClickVariation": 0.14,
      "drumClickDistance": 0.32
    }
  },
  {
    "name": "Continuous Data Tone",
    "voice": "click",
    "tags": [
      "continuous",
      "data",
      "digital",
      "ikeda"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 95,
      "drumClickDistance": 0.02,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 6000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.42,
      "drumClickMode": "continuous",
      "drumClickPitch": 4200,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.5,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.22,
      "drumClickVariation": 0
    }
  },
  {
    "name": "Broken DAC Rim",
    "voice": "click",
    "tags": [
      "broken",
      "dac",
      "rim",
      "glitch"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 18,
      "drumClickDistance": 0.04,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 5200,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.65,
      "drumClickMode": "impulse",
      "drumClickPitch": 2400,
      "drumClickPitchEnv": -10,
      "drumClickResonance": 0.72,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.82,
      "drumClickVariation": 0.06
    }
  },
  {
    "name": "Zipper Tick",
    "voice": "click",
    "tags": [
      "zipper",
      "digital",
      "click",
      "idm"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 24,
      "drumClickDistance": 0.03,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 7200,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.55,
      "drumClickMode": "tonal",
      "drumClickPitch": 3800,
      "drumClickPitchEnv": 24,
      "drumClickResonance": 0.45,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.7,
      "drumClickVariation": 0.08
    }
  },
  {
    "name": "Phase Cancel Pip",
    "voice": "click",
    "tags": [
      "phase",
      "stereo",
      "digital",
      "micro"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 30,
      "drumClickDistance": 0.02,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 6200,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.38,
      "drumClickMode": "tonal",
      "drumClickPitch": 5200,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.85,
      "drumClickStereoWidth": 1,
      "drumClickTone": 0.2,
      "drumClickVariation": 0
    }
  },
  {
    "name": "Clock Divider 3",
    "voice": "click",
    "tags": [
      "clock",
      "ratchet",
      "digital",
      "triplet"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 10,
      "drumClickDistance": 0.02,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 5000,
      "drumClickGrainCount": 3,
      "drumClickGrainSpread": 9,
      "drumClickLevel": 0.52,
      "drumClickMode": "impulse",
      "drumClickPitch": 2600,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.25,
      "drumClickStereoWidth": 0.15,
      "drumClickTone": 0.55,
      "drumClickVariation": 0.02
    }
  },
  {
    "name": "Clock Divider 5",
    "voice": "click",
    "tags": [
      "clock",
      "ratchet",
      "digital",
      "quint"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 18,
      "drumClickDistance": 0.02,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 6500,
      "drumClickGrainCount": 5,
      "drumClickGrainSpread": 13,
      "drumClickLevel": 0.5,
      "drumClickMode": "granular",
      "drumClickPitch": 3300,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.2,
      "drumClickStereoWidth": 0.4,
      "drumClickTone": 0.6,
      "drumClickVariation": 0.03
    }
  },
  {
    "name": "Granular Pinwheel",
    "voice": "click",
    "tags": [
      "granular",
      "stereo",
      "micro",
      "idm"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 45,
      "drumClickDistance": 0.08,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 7200,
      "drumClickGrainCount": 8,
      "drumClickGrainSpread": 24,
      "drumClickLevel": 0.42,
      "drumClickMode": "granular",
      "drumClickPitch": 4200,
      "drumClickPitchEnv": 12,
      "drumClickResonance": 0.18,
      "drumClickStereoWidth": 0.85,
      "drumClickTone": 0.68,
      "drumClickVariation": 0.12
    }
  },
  {
    "name": "Stereo Micro Pair",
    "voice": "click",
    "tags": [
      "stereo",
      "micro",
      "click",
      "ikeda"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 8,
      "drumClickDistance": 0.02,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 8000,
      "drumClickGrainCount": 2,
      "drumClickGrainSpread": 1,
      "drumClickLevel": 0.36,
      "drumClickMode": "impulse",
      "drumClickPitch": 6000,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.1,
      "drumClickStereoWidth": 1,
      "drumClickTone": 0.28,
      "drumClickVariation": 0
    }
  },
  {
    "name": "Aliased Tap",
    "voice": "click",
    "tags": [
      "alias",
      "tap",
      "digital",
      "sharp"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 16,
      "drumClickDistance": 0.02,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 9000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.42,
      "drumClickMode": "tonal",
      "drumClickPitch": 7600,
      "drumClickPitchEnv": 18,
      "drumClickResonance": 0.3,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.9,
      "drumClickVariation": 0.02
    }
  },
  {
    "name": "Needle Rim",
    "voice": "click",
    "tags": [
      "rim",
      "needle",
      "dry",
      "digital"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 12,
      "drumClickDistance": 0.02,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 5600,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.62,
      "drumClickMode": "impulse",
      "drumClickPitch": 3100,
      "drumClickPitchEnv": -4,
      "drumClickResonance": 0.78,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.74,
      "drumClickVariation": 0
    }
  },
  {
    "name": "Rim Clave 808",
    "voice": "click",
    "tags": [
      "808",
      "rim",
      "clave",
      "analog"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 28,
      "drumClickDistance": 0.06,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 3700,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.62,
      "drumClickMode": "tonal",
      "drumClickPitch": 1850,
      "drumClickPitchEnv": -3,
      "drumClickResonance": 0.7,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.48,
      "drumClickVariation": 0.02
    }
  },
  {
    "name": "Wood Dex Tick",
    "voice": "click",
    "tags": [
      "wood",
      "organic",
      "click",
      "dry"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 22,
      "drumClickDistance": 0.16,
      "drumClickExciterColor": 0.15,
      "drumClickFilter": 4400,
      "drumClickGrainCount": 3,
      "drumClickGrainSpread": 8,
      "drumClickLevel": 0.48,
      "drumClickMode": "granular",
      "drumClickPitch": 2800,
      "drumClickPitchEnv": 6,
      "drumClickResonance": 0.24,
      "drumClickStereoWidth": 0.15,
      "drumClickTone": 0.44,
      "drumClickVariation": 0.12
    }
  },
  {
    "name": "Morse Dot",
    "voice": "click",
    "tags": [
      "morse",
      "data",
      "digital",
      "minimal"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 55,
      "drumClickDistance": 0.01,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 5400,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.38,
      "drumClickMode": "continuous",
      "drumClickPitch": 3600,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.4,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.22,
      "drumClickVariation": 0
    }
  },
  {
    "name": "Sample Hold Click",
    "voice": "click",
    "tags": [
      "samplehold",
      "glitch",
      "digital",
      "click"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 18,
      "drumClickDistance": 0.03,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 7000,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.45,
      "drumClickMode": "noise",
      "drumClickPitch": 4800,
      "drumClickPitchEnv": 18,
      "drumClickResonance": 0.12,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.82,
      "drumClickVariation": 0.07
    }
  },
  {
    "name": "Combed Tick",
    "voice": "click",
    "tags": [
      "comb",
      "metallic",
      "tick",
      "experimental"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 36,
      "drumClickDistance": 0.06,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 6400,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.48,
      "drumClickMode": "tonal",
      "drumClickPitch": 2900,
      "drumClickPitchEnv": -12,
      "drumClickResonance": 0.88,
      "drumClickStereoWidth": 0.25,
      "drumClickTone": 0.76,
      "drumClickVariation": 0.04
    }
  },
  {
    "name": "Cyber Clave",
    "voice": "click",
    "tags": [
      "clave",
      "digital",
      "fm",
      "sharp"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 38,
      "drumClickDistance": 0.04,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 4300,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.58,
      "drumClickMode": "tonal",
      "drumClickPitch": 2100,
      "drumClickPitchEnv": 9,
      "drumClickResonance": 0.62,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.64,
      "drumClickVariation": 0.04
    }
  },
  {
    "name": "Sparse Data Grain",
    "voice": "click",
    "tags": [
      "grain",
      "data",
      "sparse",
      "ikeda"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 24,
      "drumClickDistance": 0.03,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 8200,
      "drumClickGrainCount": 3,
      "drumClickGrainSpread": 30,
      "drumClickLevel": 0.34,
      "drumClickMode": "granular",
      "drumClickPitch": 6500,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.12,
      "drumClickStereoWidth": 0.75,
      "drumClickTone": 0.2,
      "drumClickVariation": 0.05
    }
  },
  {
    "name": "Oscilloscope Tick",
    "voice": "click",
    "tags": [
      "oscilloscope",
      "ikeda",
      "digital",
      "precise"
    ],
    "params": {
      "drumClickAttack": 0,
      "drumClickDecay": 6,
      "drumClickDistance": 0.01,
      "drumClickExciterColor": 0.5,
      "drumClickFilter": 7600,
      "drumClickGrainCount": 1,
      "drumClickGrainSpread": 0,
      "drumClickLevel": 0.48,
      "drumClickMode": "impulse",
      "drumClickPitch": 5000,
      "drumClickPitchEnv": 0,
      "drumClickResonance": 0.05,
      "drumClickStereoWidth": 0,
      "drumClickTone": 0.18,
      "drumClickVariation": 0
    }
  }
];

export const BEEP_HI_PRESETS: DrumVoicePreset[] = [
  {
    "name": "ADE Organ Hit",
    "voice": "beepHi",
    "tags": [
      "opal",
      "organ",
      "sustain",
      "ade"
    ],
    "params": {
      "drumBeepHiAttack": 2,
      "drumBeepHiBrightness": 0.5,
      "drumBeepHiDecay": 300,
      "drumBeepHiFeedback": 0.2,
      "drumBeepHiFreq": 800,
      "drumBeepHiInharmonic": 0.05,
      "drumBeepHiLevel": 0.55,
      "drumBeepHiModEnvDecay": 0.4,
      "drumBeepHiModEnvEnd": 0.6,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 1,
      "drumBeepHiModRatioFine": 0,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0.2,
      "drumBeepHiShimmerRate": 5,
      "drumBeepHiTone": 0.5,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Attack Transient",
    "voice": "beepHi",
    "tags": [
      "fm",
      "percussive",
      "transient",
      "modenv"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.6,
      "drumBeepHiDecay": 60,
      "drumBeepHiFeedback": 0.2,
      "drumBeepHiFreq": 4500,
      "drumBeepHiInharmonic": 0.2,
      "drumBeepHiLevel": 0.5,
      "drumBeepHiModEnvDecay": 0.9,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.6,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Bamboo Knock",
    "voice": "beepHi",
    "tags": [
      "organic",
      "wood",
      "percussion",
      "natural"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.55,
      "drumBeepHiDecay": 150,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 2400,
      "drumBeepHiInharmonic": 0.3,
      "drumBeepHiLevel": 0.5,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.25,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Bell",
    "voice": "beepHi",
    "tags": [
      "bell",
      "metallic",
      "ambient"
    ],
    "params": {
      "drumBeepHiAttack": 1,
      "drumBeepHiBrightness": 0.6,
      "drumBeepHiDecay": 1200,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 2800,
      "drumBeepHiInharmonic": 0.5,
      "drumBeepHiLevel": 0.5,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 5,
      "drumBeepHiShimmer": 0.2,
      "drumBeepHiShimmerRate": 2,
      "drumBeepHiTone": 0.5,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Bird Call",
    "voice": "beepHi",
    "tags": [
      "organic",
      "nature",
      "animal",
      "forest"
    ],
    "params": {
      "drumBeepHiAttack": 5,
      "drumBeepHiBrightness": 0.7,
      "drumBeepHiDecay": 150,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 6000,
      "drumBeepHiInharmonic": 0.1,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0.6,
      "drumBeepHiShimmerRate": 10,
      "drumBeepHiTone": 0.1,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Chaos Ring",
    "voice": "beepHi",
    "tags": [
      "fm",
      "feedback",
      "chaos",
      "experimental"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 1,
      "drumBeepHiDecay": 150,
      "drumBeepHiFeedback": 0.9,
      "drumBeepHiFreq": 2000,
      "drumBeepHiInharmonic": 0.8,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0.7,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0.8,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0.3,
      "drumBeepHiShimmerRate": 8,
      "drumBeepHiTone": 1,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Chime",
    "voice": "beepHi",
    "tags": [
      "wind",
      "bell",
      "ambient"
    ],
    "params": {
      "drumBeepHiAttack": 1,
      "drumBeepHiBrightness": 0.65,
      "drumBeepHiDecay": 1500,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 4500,
      "drumBeepHiInharmonic": 0.4,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 6,
      "drumBeepHiShimmer": 0.3,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.35,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Crystal",
    "voice": "beepHi",
    "tags": [
      "bright",
      "pure",
      "asmr"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.9,
      "drumBeepHiDecay": 400,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 6000,
      "drumBeepHiInharmonic": 0.1,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0.05,
      "drumBeepHiShimmerRate": 5,
      "drumBeepHiTone": 0.1,
      "drumBeepHiVariation": 0.1,
      "drumBeepHiDistance": 0.14
    }
  },
  {
    "name": "Data Ping",
    "voice": "beepHi",
    "tags": [
      "ikeda",
      "digital",
      "pure"
    ],
    "params": {
      "drumBeepHiAttack": 1,
      "drumBeepHiBrightness": 0.5,
      "drumBeepHiDecay": 80,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 4000,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.5,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.2,
      "drumBeepHiVariation": 0.04,
      "drumBeepHiDistance": 0.08
    }
  },
  {
    "name": "Detuned Fifth",
    "voice": "beepHi",
    "tags": [
      "opal",
      "ratio",
      "interval",
      "rich"
    ],
    "params": {
      "drumBeepHiAttack": 1,
      "drumBeepHiBrightness": 0.55,
      "drumBeepHiDecay": 250,
      "drumBeepHiFeedback": 0.1,
      "drumBeepHiFreq": 1500,
      "drumBeepHiInharmonic": 0.15,
      "drumBeepHiLevel": 0.5,
      "drumBeepHiModEnvDecay": 0.35,
      "drumBeepHiModEnvEnd": 0.25,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 1.5,
      "drumBeepHiModRatioFine": -0.02,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0.15,
      "drumBeepHiShimmerRate": 2,
      "drumBeepHiTone": 0.4,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "FM Bell",
    "voice": "beepHi",
    "tags": [
      "fm",
      "bell",
      "metallic",
      "feedback"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.7,
      "drumBeepHiDecay": 200,
      "drumBeepHiFeedback": 0.4,
      "drumBeepHiFreq": 3000,
      "drumBeepHiInharmonic": 0.4,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0.3,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.7,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Frozen Bells",
    "voice": "beepHi",
    "tags": [
      "ambient",
      "cold",
      "distant",
      "atmospheric"
    ],
    "params": {
      "drumBeepHiAttack": 3,
      "drumBeepHiBrightness": 0.65,
      "drumBeepHiDecay": 1800,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 4000,
      "drumBeepHiInharmonic": 0.35,
      "drumBeepHiLevel": 0.35,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0.15,
      "drumBeepHiShimmerRate": 3,
      "drumBeepHiTone": 0.2,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Glass",
    "voice": "beepHi",
    "tags": [
      "bell",
      "resonant",
      "ambient"
    ],
    "params": {
      "drumBeepHiAttack": 2,
      "drumBeepHiBrightness": 0.7,
      "drumBeepHiDecay": 800,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 3200,
      "drumBeepHiInharmonic": 0.3,
      "drumBeepHiLevel": 0.45,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0.1,
      "drumBeepHiShimmerRate": 3,
      "drumBeepHiTone": 0.4,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Glass Harmonica",
    "voice": "beepHi",
    "tags": [
      "ambient",
      "ethereal",
      "sustain",
      "delicate"
    ],
    "params": {
      "drumBeepHiAttack": 10,
      "drumBeepHiBrightness": 0.55,
      "drumBeepHiDecay": 2000,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 2800,
      "drumBeepHiInharmonic": 0.25,
      "drumBeepHiLevel": 0.35,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0.4,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.15,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.22
    }
  },
  {
    "name": "Gritty Metal",
    "voice": "beepHi",
    "tags": [
      "fm",
      "harsh",
      "metallic",
      "noise"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.8,
      "drumBeepHiDecay": 120,
      "drumBeepHiFeedback": 0.7,
      "drumBeepHiFreq": 2500,
      "drumBeepHiInharmonic": 0.6,
      "drumBeepHiLevel": 0.45,
      "drumBeepHiModEnvDecay": 0.5,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0.4,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0.1,
      "drumBeepHiShimmerRate": 6,
      "drumBeepHiTone": 0.9,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Insect Wing",
    "voice": "beepHi",
    "tags": [
      "organic",
      "nature",
      "flutter",
      "texture"
    ],
    "params": {
      "drumBeepHiAttack": 2,
      "drumBeepHiBrightness": 0.6,
      "drumBeepHiDecay": 80,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 5000,
      "drumBeepHiInharmonic": 0.2,
      "drumBeepHiLevel": 0.35,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0.8,
      "drumBeepHiShimmerRate": 15,
      "drumBeepHiTone": 0.15,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Metallic",
    "voice": "beepHi",
    "tags": [
      "industrial",
      "harsh",
      "electronic"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.8,
      "drumBeepHiDecay": 200,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 5000,
      "drumBeepHiInharmonic": 0.6,
      "drumBeepHiLevel": 0.55,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.8,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Noisy FM Pluck",
    "voice": "beepHi",
    "tags": [
      "opal",
      "noise",
      "decay",
      "texture"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.8,
      "drumBeepHiDecay": 150,
      "drumBeepHiFeedback": 0.3,
      "drumBeepHiFreq": 2000,
      "drumBeepHiInharmonic": 0.2,
      "drumBeepHiLevel": 0.5,
      "drumBeepHiModEnvDecay": 0.5,
      "drumBeepHiModEnvEnd": 0.05,
      "drumBeepHiModPhase": 0.25,
      "drumBeepHiModRatio": 5,
      "drumBeepHiModRatioFine": 0.12,
      "drumBeepHiNoiseDecay": 0.6,
      "drumBeepHiNoiseInMod": 0.4,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.35,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Noisy Shimmer",
    "voice": "beepHi",
    "tags": [
      "fm",
      "noise",
      "shimmer",
      "ambient"
    ],
    "params": {
      "drumBeepHiAttack": 5,
      "drumBeepHiBrightness": 0.5,
      "drumBeepHiDecay": 300,
      "drumBeepHiFeedback": 0.15,
      "drumBeepHiFreq": 5000,
      "drumBeepHiInharmonic": 0.3,
      "drumBeepHiLevel": 0.35,
      "drumBeepHiModEnvDecay": 0.2,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0.6,
      "drumBeepHiPartials": 5,
      "drumBeepHiShimmer": 0.5,
      "drumBeepHiShimmerRate": 3,
      "drumBeepHiTone": 0.4,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Phase Shift Ping",
    "voice": "beepHi",
    "tags": [
      "opal",
      "phase",
      "digital",
      "stereo"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.6,
      "drumBeepHiDecay": 120,
      "drumBeepHiFeedback": 0.1,
      "drumBeepHiFreq": 3000,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.45,
      "drumBeepHiModEnvDecay": 0.2,
      "drumBeepHiModEnvEnd": 0.1,
      "drumBeepHiModPhase": 0.5,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.3,
      "drumBeepHiVariation": 0.04,
      "drumBeepHiDistance": 0.08
    }
  },
  {
    "name": "Shimmer",
    "voice": "beepHi",
    "tags": [
      "evolving",
      "ambient",
      "texture"
    ],
    "params": {
      "drumBeepHiAttack": 5,
      "drumBeepHiBrightness": 0.6,
      "drumBeepHiDecay": 600,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 3500,
      "drumBeepHiInharmonic": 0.2,
      "drumBeepHiLevel": 0.45,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0.7,
      "drumBeepHiShimmerRate": 6,
      "drumBeepHiTone": 0.3,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Singing Bowl",
    "voice": "beepHi",
    "tags": [
      "ambient",
      "meditation",
      "sustain",
      "resonant"
    ],
    "params": {
      "drumBeepHiAttack": 5,
      "drumBeepHiBrightness": 0.5,
      "drumBeepHiDecay": 2500,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 2400,
      "drumBeepHiInharmonic": 0.4,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 5,
      "drumBeepHiShimmer": 0.25,
      "drumBeepHiShimmerRate": 2,
      "drumBeepHiTone": 0.3,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Sparkle",
    "voice": "beepHi",
    "tags": [
      "magical",
      "bright",
      "texture"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.85,
      "drumBeepHiDecay": 500,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 5500,
      "drumBeepHiInharmonic": 0.25,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0.5,
      "drumBeepHiShimmerRate": 8,
      "drumBeepHiTone": 0.25,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Star Glint",
    "voice": "beepHi",
    "tags": [
      "ambient",
      "sparkle",
      "bright",
      "minimal"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.9,
      "drumBeepHiDecay": 100,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 7000,
      "drumBeepHiInharmonic": 0.1,
      "drumBeepHiLevel": 0.3,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0.2,
      "drumBeepHiShimmerRate": 6,
      "drumBeepHiTone": 0.1,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "Tink",
    "voice": "beepHi",
    "tags": [
      "tiny",
      "metal",
      "minimal"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.75,
      "drumBeepHiDecay": 50,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 7000,
      "drumBeepHiInharmonic": 0.15,
      "drumBeepHiLevel": 0.45,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.15,
      "drumBeepHiVariation": 0.04,
      "drumBeepHiDistance": 0.08
    }
  },
  {
    "name": "Tubular Bell",
    "voice": "beepHi",
    "tags": [
      "opal",
      "bell",
      "ratio",
      "harmonic"
    ],
    "params": {
      "drumBeepHiAttack": 1,
      "drumBeepHiBrightness": 0.7,
      "drumBeepHiDecay": 400,
      "drumBeepHiFeedback": 0.15,
      "drumBeepHiFreq": 1200,
      "drumBeepHiInharmonic": 0.1,
      "drumBeepHiLevel": 0.5,
      "drumBeepHiModEnvDecay": 0.3,
      "drumBeepHiModEnvEnd": 0.15,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 3,
      "drumBeepHiModRatioFine": 0,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0.1,
      "drumBeepHiShimmerRate": 3,
      "drumBeepHiTone": 0.4,
      "drumBeepHiVariation": 0.06,
      "drumBeepHiDistance": 0.12
    }
  },
  {
    "name": "Whistle",
    "voice": "beepHi",
    "tags": [
      "pure",
      "high",
      "asmr"
    ],
    "params": {
      "drumBeepHiAttack": 20,
      "drumBeepHiBrightness": 0.4,
      "drumBeepHiDecay": 300,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 8000,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.35,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0.1,
      "drumBeepHiShimmerRate": 5,
      "drumBeepHiTone": 0,
      "drumBeepHiVariation": 0.1,
      "drumBeepHiDistance": 0.14
    }
  },
  {
    "name": "Wind Chime",
    "voice": "beepHi",
    "tags": [
      "organic",
      "metal",
      "wind",
      "ambient"
    ],
    "params": {
      "drumBeepHiAttack": 2,
      "drumBeepHiBrightness": 0.6,
      "drumBeepHiDecay": 1500,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 3000,
      "drumBeepHiInharmonic": 0.45,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 6,
      "drumBeepHiShimmer": 0.35,
      "drumBeepHiShimmerRate": 3,
      "drumBeepHiTone": 0.4,
      "drumBeepHiVariation": 0.14,
      "drumBeepHiDistance": 0.32
    }
  },
  {
    "name": "8k Lab Pin",
    "voice": "beepHi",
    "tags": [
      "lab",
      "8k",
      "ikeda",
      "pure"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.42,
      "drumBeepHiDecay": 42,
      "drumBeepHiDistance": 0.01,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 8000,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.32,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0,
      "drumBeepHiVariation": 0
    }
  },
  {
    "name": "Folded Data Ping",
    "voice": "beepHi",
    "tags": [
      "data",
      "folded",
      "digital",
      "idm"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.72,
      "drumBeepHiDecay": 72,
      "drumBeepHiDistance": 0.02,
      "drumBeepHiFeedback": 0.12,
      "drumBeepHiFreq": 4200,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.46,
      "drumBeepHiModEnvDecay": 0.28,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 3,
      "drumBeepHiModRatioFine": 0,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.42,
      "drumBeepHiVariation": 0.02
    }
  },
  {
    "name": "Harsh FM Needle",
    "voice": "beepHi",
    "tags": [
      "fm",
      "needle",
      "harsh",
      "experimental"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 1,
      "drumBeepHiDecay": 58,
      "drumBeepHiDistance": 0.02,
      "drumBeepHiFeedback": 0.82,
      "drumBeepHiFreq": 5200,
      "drumBeepHiInharmonic": 0.65,
      "drumBeepHiLevel": 0.42,
      "drumBeepHiModEnvDecay": 0.86,
      "drumBeepHiModEnvEnd": 0.08,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 5,
      "drumBeepHiModRatioFine": 0.17,
      "drumBeepHiNoiseDecay": 0.3,
      "drumBeepHiNoiseInMod": 0.35,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.9,
      "drumBeepHiVariation": 0.03
    }
  },
  {
    "name": "Phase Null Pip",
    "voice": "beepHi",
    "tags": [
      "phase",
      "null",
      "stereo",
      "digital"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.58,
      "drumBeepHiDecay": 95,
      "drumBeepHiDistance": 0.02,
      "drumBeepHiFeedback": 0.05,
      "drumBeepHiFreq": 3400,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.38,
      "drumBeepHiModEnvDecay": 0.18,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0.5,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.2,
      "drumBeepHiVariation": 0
    }
  },
  {
    "name": "Bitcrushed Bell Atom",
    "voice": "beepHi",
    "tags": [
      "bitcrush",
      "bell",
      "atom",
      "digital"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.82,
      "drumBeepHiDecay": 140,
      "drumBeepHiDistance": 0.06,
      "drumBeepHiFeedback": 0.25,
      "drumBeepHiFreq": 6200,
      "drumBeepHiInharmonic": 0.35,
      "drumBeepHiLevel": 0.38,
      "drumBeepHiModEnvDecay": 0.45,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2.5,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0.15,
      "drumBeepHiNoiseInMod": 0.15,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.55,
      "drumBeepHiVariation": 0.04
    }
  },
  {
    "name": "Dry Lab Tone",
    "voice": "beepHi",
    "tags": [
      "lab",
      "dry",
      "sine",
      "minimal"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.5,
      "drumBeepHiDecay": 75,
      "drumBeepHiDistance": 0.01,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 3000,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 1,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.08,
      "drumBeepHiVariation": 0
    }
  },
  {
    "name": "Circuit Ping",
    "voice": "beepHi",
    "tags": [
      "idm",
      "circuit",
      "fm",
      "ping"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.78,
      "drumBeepHiDecay": 110,
      "drumBeepHiDistance": 0.04,
      "drumBeepHiFeedback": 0.35,
      "drumBeepHiFreq": 4800,
      "drumBeepHiInharmonic": 0.25,
      "drumBeepHiLevel": 0.44,
      "drumBeepHiModEnvDecay": 0.55,
      "drumBeepHiModEnvEnd": 0.04,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 3.5,
      "drumBeepHiModRatioFine": -0.08,
      "drumBeepHiNoiseDecay": 0.25,
      "drumBeepHiNoiseInMod": 0.18,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.48,
      "drumBeepHiVariation": 0.05
    }
  },
  {
    "name": "Inharmonic Clang Trio",
    "voice": "beepHi",
    "tags": [
      "clang",
      "inharmonic",
      "metal",
      "fm"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.78,
      "drumBeepHiDecay": 220,
      "drumBeepHiDistance": 0.08,
      "drumBeepHiFeedback": 0.45,
      "drumBeepHiFreq": 2800,
      "drumBeepHiInharmonic": 0.78,
      "drumBeepHiLevel": 0.46,
      "drumBeepHiModEnvDecay": 0.4,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 4,
      "drumBeepHiModRatioFine": 0.07,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.72,
      "drumBeepHiVariation": 0.05
    }
  },
  {
    "name": "Noise Mod Needle",
    "voice": "beepHi",
    "tags": [
      "noise",
      "fm",
      "needle",
      "glitch"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.95,
      "drumBeepHiDecay": 52,
      "drumBeepHiDistance": 0.02,
      "drumBeepHiFeedback": 0.48,
      "drumBeepHiFreq": 7000,
      "drumBeepHiInharmonic": 0.2,
      "drumBeepHiLevel": 0.35,
      "drumBeepHiModEnvDecay": 0.72,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 6,
      "drumBeepHiModRatioFine": 0.11,
      "drumBeepHiNoiseDecay": 0.65,
      "drumBeepHiNoiseInMod": 0.75,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.78,
      "drumBeepHiVariation": 0.04
    }
  },
  {
    "name": "Metallic Chirp",
    "voice": "beepHi",
    "tags": [
      "metallic",
      "chirp",
      "digital",
      "bright"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.9,
      "drumBeepHiDecay": 85,
      "drumBeepHiDistance": 0.04,
      "drumBeepHiFeedback": 0.18,
      "drumBeepHiFreq": 5600,
      "drumBeepHiInharmonic": 0.5,
      "drumBeepHiLevel": 0.4,
      "drumBeepHiModEnvDecay": 0.35,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2.25,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0.08,
      "drumBeepHiShimmerRate": 8,
      "drumBeepHiTone": 0.68,
      "drumBeepHiVariation": 0.04
    }
  },
  {
    "name": "Frozen FM Splinter",
    "voice": "beepHi",
    "tags": [
      "fm",
      "cold",
      "splinter",
      "idm"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.62,
      "drumBeepHiDecay": 260,
      "drumBeepHiDistance": 0.14,
      "drumBeepHiFeedback": 0.38,
      "drumBeepHiFreq": 3900,
      "drumBeepHiInharmonic": 0.42,
      "drumBeepHiLevel": 0.34,
      "drumBeepHiModEnvDecay": 0.55,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 3.75,
      "drumBeepHiModRatioFine": 0.04,
      "drumBeepHiNoiseDecay": 0.12,
      "drumBeepHiNoiseInMod": 0.1,
      "drumBeepHiPartials": 4,
      "drumBeepHiShimmer": 0.12,
      "drumBeepHiShimmerRate": 2,
      "drumBeepHiTone": 0.45,
      "drumBeepHiVariation": 0.06
    }
  },
  {
    "name": "Sine Microscope",
    "voice": "beepHi",
    "tags": [
      "sine",
      "microscope",
      "ikeda",
      "pure"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.45,
      "drumBeepHiDecay": 36,
      "drumBeepHiDistance": 0.01,
      "drumBeepHiFeedback": 0,
      "drumBeepHiFreq": 5120,
      "drumBeepHiInharmonic": 0,
      "drumBeepHiLevel": 0.3,
      "drumBeepHiModEnvDecay": 0,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 1,
      "drumBeepHiModRatioFine": 0,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0,
      "drumBeepHiVariation": 0
    }
  },
  {
    "name": "Raster Bell",
    "voice": "beepHi",
    "tags": [
      "raster",
      "bell",
      "digital",
      "metal"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.76,
      "drumBeepHiDecay": 180,
      "drumBeepHiDistance": 0.06,
      "drumBeepHiFeedback": 0.28,
      "drumBeepHiFreq": 3600,
      "drumBeepHiInharmonic": 0.32,
      "drumBeepHiLevel": 0.42,
      "drumBeepHiModEnvDecay": 0.4,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2.75,
      "drumBeepHiModRatioFine": 0.09,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 3,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.62,
      "drumBeepHiVariation": 0.05
    }
  },
  {
    "name": "Laser Glass",
    "voice": "beepHi",
    "tags": [
      "laser",
      "glass",
      "bright",
      "fm"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.86,
      "drumBeepHiDecay": 130,
      "drumBeepHiDistance": 0.04,
      "drumBeepHiFeedback": 0.2,
      "drumBeepHiFreq": 6500,
      "drumBeepHiInharmonic": 0.18,
      "drumBeepHiLevel": 0.37,
      "drumBeepHiModEnvDecay": 0.5,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 4.5,
      "drumBeepHiModRatioFine": -0.03,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.45,
      "drumBeepHiVariation": 0.03
    }
  },
  {
    "name": "Feedback Tick",
    "voice": "beepHi",
    "tags": [
      "feedback",
      "tick",
      "harsh",
      "digital"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 1,
      "drumBeepHiDecay": 40,
      "drumBeepHiDistance": 0.01,
      "drumBeepHiFeedback": 0.95,
      "drumBeepHiFreq": 4600,
      "drumBeepHiInharmonic": 0.6,
      "drumBeepHiLevel": 0.44,
      "drumBeepHiModEnvDecay": 0.65,
      "drumBeepHiModEnvEnd": 0.02,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0.22,
      "drumBeepHiPartials": 1,
      "drumBeepHiShimmer": 0,
      "drumBeepHiShimmerRate": 4,
      "drumBeepHiTone": 0.95,
      "drumBeepHiVariation": 0.03
    }
  },
  {
    "name": "Voltage Star",
    "voice": "beepHi",
    "tags": [
      "voltage",
      "spark",
      "bright",
      "idm"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.92,
      "drumBeepHiDecay": 95,
      "drumBeepHiDistance": 0.03,
      "drumBeepHiFeedback": 0.12,
      "drumBeepHiFreq": 7200,
      "drumBeepHiInharmonic": 0.22,
      "drumBeepHiLevel": 0.34,
      "drumBeepHiModEnvDecay": 0.32,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 5.5,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0,
      "drumBeepHiNoiseInMod": 0,
      "drumBeepHiPartials": 2,
      "drumBeepHiShimmer": 0.18,
      "drumBeepHiShimmerRate": 9,
      "drumBeepHiTone": 0.35,
      "drumBeepHiVariation": 0.04
    }
  },
  {
    "name": "Needle Cluster",
    "voice": "beepHi",
    "tags": [
      "needle",
      "cluster",
      "granular",
      "digital"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.88,
      "drumBeepHiDecay": 115,
      "drumBeepHiDistance": 0.04,
      "drumBeepHiFeedback": 0.25,
      "drumBeepHiFreq": 6100,
      "drumBeepHiInharmonic": 0.48,
      "drumBeepHiLevel": 0.36,
      "drumBeepHiModEnvDecay": 0.5,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 7,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0.18,
      "drumBeepHiNoiseInMod": 0.16,
      "drumBeepHiPartials": 5,
      "drumBeepHiShimmer": 0.06,
      "drumBeepHiShimmerRate": 12,
      "drumBeepHiTone": 0.5,
      "drumBeepHiVariation": 0.08
    }
  },
  {
    "name": "Micro Bell Spray",
    "voice": "beepHi",
    "tags": [
      "bell",
      "micro",
      "spray",
      "idm"
    ],
    "params": {
      "drumBeepHiAttack": 0,
      "drumBeepHiBrightness": 0.78,
      "drumBeepHiDecay": 180,
      "drumBeepHiDistance": 0.08,
      "drumBeepHiFeedback": 0.12,
      "drumBeepHiFreq": 5300,
      "drumBeepHiInharmonic": 0.25,
      "drumBeepHiLevel": 0.34,
      "drumBeepHiModEnvDecay": 0.35,
      "drumBeepHiModEnvEnd": 0.2,
      "drumBeepHiModPhase": 0,
      "drumBeepHiModRatio": 3.2,
      "drumBeepHiModRatioFine": 0.01,
      "drumBeepHiNoiseDecay": 0.08,
      "drumBeepHiNoiseInMod": 0.08,
      "drumBeepHiPartials": 6,
      "drumBeepHiShimmer": 0.2,
      "drumBeepHiShimmerRate": 14,
      "drumBeepHiTone": 0.42,
      "drumBeepHiVariation": 0.12
    }
  }
];

export const BEEP_LO_PRESETS: DrumVoicePreset[] = [
  {
    "name": "Blip",
    "voice": "beepLo",
    "tags": [
      "digital",
      "minimal",
      "default"
    ],
    "params": {
      "drumBeepLoAttack": 2,
      "drumBeepLoBody": 0.3,
      "drumBeepLoDecay": 100,
      "drumBeepLoFreq": 400,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.1,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.04,
      "drumBeepLoDistance": 0.08
    }
  },
  {
    "name": "Bloop",
    "voice": "beepLo",
    "tags": [
      "cartoon",
      "fun",
      "digital"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.4,
      "drumBeepLoDecay": 150,
      "drumBeepLoFreq": 450,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 40,
      "drumBeepLoPitchEnv": 36,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.15,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.04,
      "drumBeepLoDistance": 0.08
    }
  },
  {
    "name": "Bright Tilt Bell",
    "voice": "beepLo",
    "tags": [
      "opal",
      "cut",
      "bright",
      "bell"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.3,
      "drumBeepLoDecay": 500,
      "drumBeepLoFreq": 400,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0.9,
      "drumBeepLoModalCut": -0.6,
      "drumBeepLoModalInharmonic": 0.15,
      "drumBeepLoModalQ": 30,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.4,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Bubble",
    "voice": "beepLo",
    "tags": [
      "underwater",
      "asmr",
      "soft"
    ],
    "params": {
      "drumBeepLoAttack": 5,
      "drumBeepLoBody": 0.6,
      "drumBeepLoDecay": 300,
      "drumBeepLoFreq": 350,
      "drumBeepLoLevel": 0.45,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 150,
      "drumBeepLoPitchEnv": -24,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.05,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.1,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Cave Drip",
    "voice": "beepLo",
    "tags": [
      "ambient",
      "water",
      "echo",
      "natural"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 450,
      "drumBeepLoFreq": 700,
      "drumBeepLoLevel": 0.4,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 60,
      "drumBeepLoPitchEnv": -15,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.05,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Chirp",
    "voice": "beepLo",
    "tags": [
      "bird",
      "nature",
      "texture"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.3,
      "drumBeepLoDecay": 60,
      "drumBeepLoFreq": 700,
      "drumBeepLoLevel": 0.45,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 25,
      "drumBeepLoPitchEnv": -30,
      "drumBeepLoPluck": 0.2,
      "drumBeepLoPluckDamp": 0.4,
      "drumBeepLoTone": 0.1,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Compressed Gong",
    "voice": "beepLo",
    "tags": [
      "opal",
      "spread",
      "gong",
      "dense"
    ],
    "params": {
      "drumBeepLoAttack": 3,
      "drumBeepLoBody": 0.8,
      "drumBeepLoDecay": 1200,
      "drumBeepLoFreq": 150,
      "drumBeepLoLevel": 0.45,
      "drumBeepLoModal": 1,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0.5,
      "drumBeepLoModalQ": 40,
      "drumBeepLoModalSpread": -0.7,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.1,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Dark Cut Thud",
    "voice": "beepLo",
    "tags": [
      "opal",
      "cut",
      "dark",
      "thud"
    ],
    "params": {
      "drumBeepLoAttack": 1,
      "drumBeepLoBody": 0.9,
      "drumBeepLoDecay": 300,
      "drumBeepLoFreq": 120,
      "drumBeepLoLevel": 0.55,
      "drumBeepLoModal": 0.7,
      "drumBeepLoModalCut": 0.7,
      "drumBeepLoModalInharmonic": 0.4,
      "drumBeepLoModalQ": 20,
      "drumBeepLoModalSpread": 0.3,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.05,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Droplet",
    "voice": "beepLo",
    "tags": [
      "water",
      "asmr",
      "natural"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.4,
      "drumBeepLoDecay": 200,
      "drumBeepLoFreq": 600,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 80,
      "drumBeepLoPitchEnv": -18,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.1,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Frog Croak",
    "voice": "beepLo",
    "tags": [
      "organic",
      "animal",
      "nature",
      "texture"
    ],
    "params": {
      "drumBeepLoAttack": 2,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 100,
      "drumBeepLoFreq": 300,
      "drumBeepLoLevel": 0.45,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 40,
      "drumBeepLoPitchEnv": -20,
      "drumBeepLoPluck": 0.3,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.15,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Gamelan Tone",
    "voice": "beepLo",
    "tags": [
      "modal",
      "gamelan",
      "metallic",
      "inharmonic"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.4,
      "drumBeepLoDecay": 600,
      "drumBeepLoFreq": 350,
      "drumBeepLoLevel": 0.45,
      "drumBeepLoModal": 1,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0.9,
      "drumBeepLoModalQ": 40,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.1,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Hollow Echo",
    "voice": "beepLo",
    "tags": [
      "ambient",
      "resonant",
      "spacious",
      "deep"
    ],
    "params": {
      "drumBeepLoAttack": 3,
      "drumBeepLoBody": 0.7,
      "drumBeepLoDecay": 500,
      "drumBeepLoFreq": 350,
      "drumBeepLoLevel": 0.4,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 80,
      "drumBeepLoPitchEnv": -8,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.1,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Hollow Gourd",
    "voice": "beepLo",
    "tags": [
      "organic",
      "percussion",
      "natural",
      "world"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.7,
      "drumBeepLoDecay": 80,
      "drumBeepLoFreq": 350,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 15,
      "drumBeepLoPitchEnv": 6,
      "drumBeepLoPluck": 0.5,
      "drumBeepLoPluckDamp": 0.6,
      "drumBeepLoTone": 0.2,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Kalimba",
    "voice": "beepLo",
    "tags": [
      "organic",
      "african",
      "thumb piano",
      "natural"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.4,
      "drumBeepLoDecay": 350,
      "drumBeepLoFreq": 500,
      "drumBeepLoLevel": 0.55,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 20,
      "drumBeepLoPitchEnv": 3,
      "drumBeepLoPluck": 0.6,
      "drumBeepLoPluckDamp": 0.4,
      "drumBeepLoTone": 0.15,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Modal Bell",
    "voice": "beepLo",
    "tags": [
      "modal",
      "bell",
      "resonant",
      "metallic"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 400,
      "drumBeepLoFreq": 300,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0.8,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0.5,
      "drumBeepLoModalQ": 25,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.2,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Muted Tap",
    "voice": "beepLo",
    "tags": [
      "soft",
      "asmr",
      "gentle"
    ],
    "params": {
      "drumBeepLoAttack": 1,
      "drumBeepLoBody": 0.3,
      "drumBeepLoDecay": 80,
      "drumBeepLoFreq": 300,
      "drumBeepLoLevel": 0.4,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 20,
      "drumBeepLoPitchEnv": 4,
      "drumBeepLoPluck": 0.5,
      "drumBeepLoPluckDamp": 0.9,
      "drumBeepLoTone": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.1,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Ping",
    "voice": "beepLo",
    "tags": [
      "sonar",
      "pure",
      "minimal"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.2,
      "drumBeepLoDecay": 500,
      "drumBeepLoFreq": 800,
      "drumBeepLoLevel": 0.45,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.04,
      "drumBeepLoDistance": 0.08
    }
  },
  {
    "name": "Pluck",
    "voice": "beepLo",
    "tags": [
      "string",
      "acoustic",
      "ambient"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 400,
      "drumBeepLoFreq": 500,
      "drumBeepLoLevel": 0.55,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 30,
      "drumBeepLoPitchEnv": 2,
      "drumBeepLoPluck": 0.8,
      "drumBeepLoPluckDamp": 0.4,
      "drumBeepLoTone": 0.2,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Singing Metal",
    "voice": "beepLo",
    "tags": [
      "modal",
      "singing",
      "sustain",
      "ambient"
    ],
    "params": {
      "drumBeepLoAttack": 2,
      "drumBeepLoBody": 0.7,
      "drumBeepLoDecay": 800,
      "drumBeepLoFreq": 250,
      "drumBeepLoLevel": 0.4,
      "drumBeepLoModal": 0.9,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0.3,
      "drumBeepLoModalQ": 35,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.15,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Soft Mallet",
    "voice": "beepLo",
    "tags": [
      "ambient",
      "vibraphone",
      "gentle",
      "warm"
    ],
    "params": {
      "drumBeepLoAttack": 8,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 800,
      "drumBeepLoFreq": 600,
      "drumBeepLoLevel": 0.4,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0.2,
      "drumBeepLoPluckDamp": 0.7,
      "drumBeepLoTone": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.22
    }
  },
  {
    "name": "Soft Ping",
    "voice": "beepLo",
    "tags": [
      "gentle",
      "asmr",
      "ambient"
    ],
    "params": {
      "drumBeepLoAttack": 10,
      "drumBeepLoBody": 0.4,
      "drumBeepLoDecay": 400,
      "drumBeepLoFreq": 600,
      "drumBeepLoLevel": 0.35,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.22
    }
  },
  {
    "name": "Spread Marimba",
    "voice": "beepLo",
    "tags": [
      "opal",
      "spread",
      "marimba",
      "warm"
    ],
    "params": {
      "drumBeepLoAttack": 1,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 400,
      "drumBeepLoFreq": 300,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0.8,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0.2,
      "drumBeepLoModalQ": 25,
      "drumBeepLoModalSpread": 0.6,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.2,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Struck Bar",
    "voice": "beepLo",
    "tags": [
      "modal",
      "percussive",
      "bar",
      "marimba"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.6,
      "drumBeepLoDecay": 200,
      "drumBeepLoFreq": 440,
      "drumBeepLoLevel": 0.55,
      "drumBeepLoModal": 0.7,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0.1,
      "drumBeepLoModalQ": 15,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 30,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.3,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "Tongue Drum",
    "voice": "beepLo",
    "tags": [
      "organic",
      "steel",
      "meditation",
      "natural"
    ],
    "params": {
      "drumBeepLoAttack": 3,
      "drumBeepLoBody": 0.55,
      "drumBeepLoDecay": 600,
      "drumBeepLoFreq": 450,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0.4,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.05,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Underwater Ping",
    "voice": "beepLo",
    "tags": [
      "ambient",
      "sonar",
      "muted",
      "deep"
    ],
    "params": {
      "drumBeepLoAttack": 5,
      "drumBeepLoBody": 0.6,
      "drumBeepLoDecay": 700,
      "drumBeepLoFreq": 500,
      "drumBeepLoLevel": 0.4,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 100,
      "drumBeepLoPitchEnv": -6,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.14,
      "drumBeepLoDistance": 0.32
    }
  },
  {
    "name": "Woody",
    "voice": "beepLo",
    "tags": [
      "wood",
      "percussion",
      "acoustic"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.6,
      "drumBeepLoDecay": 120,
      "drumBeepLoFreq": 550,
      "drumBeepLoLevel": 0.55,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoPitchDecay": 15,
      "drumBeepLoPitchEnv": 8,
      "drumBeepLoPluck": 0.7,
      "drumBeepLoPluckDamp": 0.3,
      "drumBeepLoTone": 0.3,
      "drumBeepLoOscGain": 1,
      "drumBeepLoModalGain": 1,
      "drumBeepLoVariation": 0.08,
      "drumBeepLoDistance": 0.16
    }
  },
  {
    "name": "606 Low Tom",
    "voice": "beepLo",
    "tags": [
      "606",
      "analog",
      "tom",
      "classic"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.72,
      "drumBeepLoDecay": 310,
      "drumBeepLoDistance": 0.08,
      "drumBeepLoFreq": 240,
      "drumBeepLoLevel": 0.64,
      "drumBeepLoModal": 0.12,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 12,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 90,
      "drumBeepLoPitchEnv": 28,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.12,
      "drumBeepLoVariation": 0.02
    }
  },
  {
    "name": "Synare Laser Tom",
    "voice": "beepLo",
    "tags": [
      "synare",
      "laser",
      "tom",
      "pitch"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 240,
      "drumBeepLoDistance": 0.06,
      "drumBeepLoFreq": 330,
      "drumBeepLoLevel": 0.62,
      "drumBeepLoModal": 0.18,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 18,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 140,
      "drumBeepLoPitchEnv": 48,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.24,
      "drumBeepLoVariation": 0.04
    }
  },
  {
    "name": "Hollow FM Tom",
    "voice": "beepLo",
    "tags": [
      "fm",
      "hollow",
      "tom",
      "idm"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.68,
      "drumBeepLoDecay": 320,
      "drumBeepLoDistance": 0.08,
      "drumBeepLoFreq": 280,
      "drumBeepLoLevel": 0.6,
      "drumBeepLoModal": 0.35,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.18,
      "drumBeepLoModalQ": 20,
      "drumBeepLoModalSpread": 0.15,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 80,
      "drumBeepLoPitchEnv": 18,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.28,
      "drumBeepLoVariation": 0.07
    }
  },
  {
    "name": "Rubber Mallet",
    "voice": "beepLo",
    "tags": [
      "rubber",
      "mallet",
      "idm",
      "modal"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.62,
      "drumBeepLoDecay": 420,
      "drumBeepLoDistance": 0.12,
      "drumBeepLoFreq": 380,
      "drumBeepLoLevel": 0.54,
      "drumBeepLoModal": 0.4,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.12,
      "drumBeepLoModalQ": 24,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 90,
      "drumBeepLoPitchEnv": 12,
      "drumBeepLoPluck": 0.35,
      "drumBeepLoPluckDamp": 0.6,
      "drumBeepLoTone": 0.1,
      "drumBeepLoVariation": 0.08
    }
  },
  {
    "name": "Gamelan Pair",
    "voice": "beepLo",
    "tags": [
      "gamelan",
      "modal",
      "metal",
      "detuned"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.48,
      "drumBeepLoDecay": 650,
      "drumBeepLoDistance": 0.14,
      "drumBeepLoFreq": 520,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0.85,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.34,
      "drumBeepLoModalQ": 32,
      "drumBeepLoModalSpread": 0.42,
      "drumBeepLoOscGain": 0.5,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.25,
      "drumBeepLoVariation": 0.08
    }
  },
  {
    "name": "Struck Pipe",
    "voice": "beepLo",
    "tags": [
      "pipe",
      "metal",
      "modal",
      "industrial"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.44,
      "drumBeepLoDecay": 520,
      "drumBeepLoDistance": 0.1,
      "drumBeepLoFreq": 430,
      "drumBeepLoLevel": 0.56,
      "drumBeepLoModal": 0.78,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.22,
      "drumBeepLoModalQ": 38,
      "drumBeepLoModalSpread": 0.18,
      "drumBeepLoOscGain": 0.35,
      "drumBeepLoPitchDecay": 60,
      "drumBeepLoPitchEnv": -4,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.32,
      "drumBeepLoVariation": 0.05
    }
  },
  {
    "name": "Tubby Data Tom",
    "voice": "beepLo",
    "tags": [
      "data",
      "tom",
      "digital",
      "low"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.55,
      "drumBeepLoDecay": 130,
      "drumBeepLoDistance": 0.03,
      "drumBeepLoFreq": 260,
      "drumBeepLoLevel": 0.56,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 35,
      "drumBeepLoPitchEnv": 18,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.05,
      "drumBeepLoVariation": 0.02
    }
  },
  {
    "name": "Modal Cowbell",
    "voice": "beepLo",
    "tags": [
      "cowbell",
      "modal",
      "analog",
      "metal"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.35,
      "drumBeepLoDecay": 180,
      "drumBeepLoDistance": 0.05,
      "drumBeepLoFreq": 640,
      "drumBeepLoLevel": 0.58,
      "drumBeepLoModal": 0.7,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.65,
      "drumBeepLoModalQ": 20,
      "drumBeepLoModalSpread": 0.22,
      "drumBeepLoOscGain": 0.45,
      "drumBeepLoPitchDecay": 20,
      "drumBeepLoPitchEnv": 0,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.4,
      "drumBeepLoVariation": 0.03
    }
  },
  {
    "name": "Autechre Gourd",
    "voice": "beepLo",
    "tags": [
      "idm",
      "gourd",
      "rubber",
      "organic"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.72,
      "drumBeepLoDecay": 210,
      "drumBeepLoDistance": 0.1,
      "drumBeepLoFreq": 330,
      "drumBeepLoLevel": 0.52,
      "drumBeepLoModal": 0.22,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 16,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 75,
      "drumBeepLoPitchEnv": -22,
      "drumBeepLoPluck": 0.45,
      "drumBeepLoPluckDamp": 0.45,
      "drumBeepLoTone": 0.18,
      "drumBeepLoVariation": 0.12
    }
  },
  {
    "name": "Kalimba Glitch",
    "voice": "beepLo",
    "tags": [
      "kalimba",
      "glitch",
      "pluck",
      "idm"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.42,
      "drumBeepLoDecay": 220,
      "drumBeepLoDistance": 0.06,
      "drumBeepLoFreq": 590,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0.18,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 18,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 28,
      "drumBeepLoPitchEnv": 7,
      "drumBeepLoPluck": 0.75,
      "drumBeepLoPluckDamp": 0.25,
      "drumBeepLoTone": 0.22,
      "drumBeepLoVariation": 0.1
    }
  },
  {
    "name": "Pipe Knock",
    "voice": "beepLo",
    "tags": [
      "pipe",
      "knock",
      "dry",
      "modal"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.38,
      "drumBeepLoDecay": 120,
      "drumBeepLoDistance": 0.06,
      "drumBeepLoFreq": 410,
      "drumBeepLoLevel": 0.56,
      "drumBeepLoModal": 0.68,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.22,
      "drumBeepLoModalQ": 24,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 18,
      "drumBeepLoPitchEnv": 2,
      "drumBeepLoPluck": 0.15,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.36,
      "drumBeepLoVariation": 0.04
    }
  },
  {
    "name": "Low Carrier Pong",
    "voice": "beepLo",
    "tags": [
      "carrier",
      "pong",
      "digital",
      "fm"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.5,
      "drumBeepLoDecay": 170,
      "drumBeepLoDistance": 0.04,
      "drumBeepLoFreq": 220,
      "drumBeepLoLevel": 0.54,
      "drumBeepLoModal": 0.05,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 45,
      "drumBeepLoPitchEnv": 24,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.12,
      "drumBeepLoVariation": 0.03
    }
  },
  {
    "name": "Tensioned Wire Tom",
    "voice": "beepLo",
    "tags": [
      "wire",
      "tom",
      "modal",
      "metal"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.45,
      "drumBeepLoDecay": 350,
      "drumBeepLoDistance": 0.08,
      "drumBeepLoFreq": 360,
      "drumBeepLoLevel": 0.54,
      "drumBeepLoModal": 0.55,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.4,
      "drumBeepLoModalQ": 28,
      "drumBeepLoModalSpread": 0.24,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 50,
      "drumBeepLoPitchEnv": 8,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.2,
      "drumBeepLoVariation": 0.07
    }
  },
  {
    "name": "Wood FM Tock",
    "voice": "beepLo",
    "tags": [
      "wood",
      "fm",
      "tock",
      "percussion"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.56,
      "drumBeepLoDecay": 95,
      "drumBeepLoDistance": 0.08,
      "drumBeepLoFreq": 470,
      "drumBeepLoLevel": 0.58,
      "drumBeepLoModal": 0.1,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 18,
      "drumBeepLoPitchEnv": 8,
      "drumBeepLoPluck": 0.68,
      "drumBeepLoPluckDamp": 0.32,
      "drumBeepLoTone": 0.2,
      "drumBeepLoVariation": 0.06
    }
  },
  {
    "name": "Toybox Low Bleep",
    "voice": "beepLo",
    "tags": [
      "toy",
      "bleep",
      "digital",
      "low"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.35,
      "drumBeepLoDecay": 150,
      "drumBeepLoDistance": 0.04,
      "drumBeepLoFreq": 520,
      "drumBeepLoLevel": 0.5,
      "drumBeepLoModal": 0,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0,
      "drumBeepLoModalQ": 10,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 32,
      "drumBeepLoPitchEnv": 18,
      "drumBeepLoPluck": 0,
      "drumBeepLoPluckDamp": 0.5,
      "drumBeepLoTone": 0.06,
      "drumBeepLoVariation": 0.04
    }
  },
  {
    "name": "Digital Tabla",
    "voice": "beepLo",
    "tags": [
      "tabla",
      "digital",
      "fm",
      "percussion"
    ],
    "params": {
      "drumBeepLoAttack": 0,
      "drumBeepLoBody": 0.76,
      "drumBeepLoDecay": 260,
      "drumBeepLoDistance": 0.1,
      "drumBeepLoFreq": 300,
      "drumBeepLoLevel": 0.58,
      "drumBeepLoModal": 0.28,
      "drumBeepLoModalCut": 0,
      "drumBeepLoModalGain": 1,
      "drumBeepLoModalInharmonic": 0.12,
      "drumBeepLoModalQ": 22,
      "drumBeepLoModalSpread": 0,
      "drumBeepLoOscGain": 1,
      "drumBeepLoPitchDecay": 65,
      "drumBeepLoPitchEnv": 20,
      "drumBeepLoPluck": 0.22,
      "drumBeepLoPluckDamp": 0.4,
      "drumBeepLoTone": 0.16,
      "drumBeepLoVariation": 0.1
    }
  }
];

export const NOISE_PRESETS: DrumVoicePreset[] = [
  {
    "name": "808 Clap",
    "voice": "noise",
    "tags": [
      "opal",
      "ratchet",
      "clap",
      "classic"
    ],
    "params": {
      "drumNoiseAttack": 1,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 200,
      "drumNoiseDensity": 1,
      "drumNoiseFilterEnv": 0.3,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 3000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0.1,
      "drumNoiseLevel": 0.55,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 3,
      "drumNoiseRatchetTime": 20,
      "drumNoiseVariation": 0.1,
      "drumNoiseDistance": 0.12
    }
  },
  {
    "name": "Bonfire Crackle",
    "voice": "noise",
    "tags": [
      "organic",
      "fire",
      "campfire",
      "nature"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 3,
      "drumNoiseDecay": 40,
      "drumNoiseDensity": 0.2,
      "drumNoiseFilterEnv": 0.5,
      "drumNoiseFilterEnvDecay": 30,
      "drumNoiseFilterFreq": 5500,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Breath",
    "voice": "noise",
    "tags": [
      "asmr",
      "soft",
      "air"
    ],
    "params": {
      "drumNoiseAttack": 50,
      "drumNoiseBreath": 0.7,
      "drumNoiseColorLFO": 0.5,
      "drumNoiseDecay": 300,
      "drumNoiseDensity": 0.8,
      "drumNoiseFilterEnv": 0.3,
      "drumNoiseFilterEnvDecay": 200,
      "drumNoiseFilterFreq": 2000,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0.2,
      "drumNoiseLevel": 0.35,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Chaotic Scatter",
    "voice": "noise",
    "tags": [
      "opal",
      "particle",
      "random",
      "chaos"
    ],
    "params": {
      "drumNoiseAttack": 10,
      "drumNoiseBreath": 0.1,
      "drumNoiseColorLFO": 0.8,
      "drumNoiseDecay": 400,
      "drumNoiseDensity": 0.15,
      "drumNoiseFilterEnv": 0.25,
      "drumNoiseFilterEnvDecay": 200,
      "drumNoiseFilterFreq": 7000,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0.15,
      "drumNoiseLevel": 0.35,
      "drumNoiseParticleRandom": 1,
      "drumNoiseParticleRandomRate": 0.9,
      "drumNoiseParticleSize": 6,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Distant Surf",
    "voice": "noise",
    "tags": [
      "ambient",
      "ocean",
      "waves",
      "nature"
    ],
    "params": {
      "drumNoiseAttack": 400,
      "drumNoiseBreath": 0.5,
      "drumNoiseColorLFO": 0.3,
      "drumNoiseDecay": 2500,
      "drumNoiseDensity": 0.75,
      "drumNoiseFilterEnv": 0.35,
      "drumNoiseFilterEnvDecay": 1000,
      "drumNoiseFilterFreq": 2000,
      "drumNoiseFilterQ": 1,
      "drumNoiseFilterType": "lowpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.25,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Dust",
    "voice": "noise",
    "tags": [
      "vinyl",
      "sparse",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 10,
      "drumNoiseDensity": 0.2,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 50,
      "drumNoiseFilterFreq": 5000,
      "drumNoiseFilterQ": 0.8,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.25,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Dust Particles",
    "voice": "noise",
    "tags": [
      "particle",
      "dust",
      "sparse",
      "minimal"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 200,
      "drumNoiseDensity": 0.15,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 100,
      "drumNoiseFilterFreq": 10000,
      "drumNoiseFilterQ": 1,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 2,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.04,
      "drumNoiseDistance": 0.08
    }
  },
  {
    "name": "Flam Snare",
    "voice": "noise",
    "tags": [
      "opal",
      "ratchet",
      "snare",
      "flam"
    ],
    "params": {
      "drumNoiseAttack": 1,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 150,
      "drumNoiseDensity": 1,
      "drumNoiseFilterEnv": 0.2,
      "drumNoiseFilterEnvDecay": 60,
      "drumNoiseFilterFreq": 5000,
      "drumNoiseFilterQ": 1.2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.5,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 1,
      "drumNoiseRatchetTime": 25,
      "drumNoiseVariation": 0.1,
      "drumNoiseDistance": 0.12
    }
  },
  {
    "name": "Forest Ambience",
    "voice": "noise",
    "tags": [
      "ambient",
      "nature",
      "background",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 200,
      "drumNoiseBreath": 0.3,
      "drumNoiseColorLFO": 0.6,
      "drumNoiseDecay": 1500,
      "drumNoiseDensity": 0.5,
      "drumNoiseFilterEnv": 0.15,
      "drumNoiseFilterEnvDecay": 600,
      "drumNoiseFilterFreq": 3000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.25,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Grain Cloud",
    "voice": "noise",
    "tags": [
      "particle",
      "granular",
      "cloud",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 20,
      "drumNoiseBreath": 0.2,
      "drumNoiseColorLFO": 1.5,
      "drumNoiseDecay": 500,
      "drumNoiseDensity": 0.3,
      "drumNoiseFilterEnv": 0.3,
      "drumNoiseFilterEnvDecay": 200,
      "drumNoiseFilterFreq": 6000,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.35,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 8,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Hi-Hat",
    "voice": "noise",
    "tags": [
      "classic",
      "percussion",
      "default"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 30,
      "drumNoiseDensity": 1,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 100,
      "drumNoiseFilterFreq": 8000,
      "drumNoiseFilterQ": 1,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Hiss",
    "voice": "noise",
    "tags": [
      "white",
      "bright",
      "electronic"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 100,
      "drumNoiseDensity": 1,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 100,
      "drumNoiseFilterFreq": 10000,
      "drumNoiseFilterQ": 0.5,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.35,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Jittery Dust",
    "voice": "noise",
    "tags": [
      "opal",
      "particle",
      "random",
      "dust"
    ],
    "params": {
      "drumNoiseAttack": 5,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 250,
      "drumNoiseDensity": 0.2,
      "drumNoiseFilterEnv": 0.15,
      "drumNoiseFilterEnvDecay": 120,
      "drumNoiseFilterFreq": 10000,
      "drumNoiseFilterQ": 1,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0.7,
      "drumNoiseParticleRandomRate": 0.6,
      "drumNoiseParticleSize": 4,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Leaf Crunch",
    "voice": "noise",
    "tags": [
      "organic",
      "forest",
      "foliage",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0.5,
      "drumNoiseDecay": 50,
      "drumNoiseDensity": 0.4,
      "drumNoiseFilterEnv": 0.3,
      "drumNoiseFilterEnvDecay": 30,
      "drumNoiseFilterFreq": 3500,
      "drumNoiseFilterQ": 2.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Micro Scatter",
    "voice": "noise",
    "tags": [
      "particle",
      "scatter",
      "fast",
      "percussive"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 80,
      "drumNoiseDensity": 0.1,
      "drumNoiseFilterEnv": 0.5,
      "drumNoiseFilterEnvDecay": 50,
      "drumNoiseFilterFreq": 12000,
      "drumNoiseFilterQ": 0.5,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.45,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 1,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.04,
      "drumNoiseDistance": 0.08
    }
  },
  {
    "name": "Ocean Spray",
    "voice": "noise",
    "tags": [
      "water",
      "ambient",
      "nature"
    ],
    "params": {
      "drumNoiseAttack": 200,
      "drumNoiseBreath": 0.4,
      "drumNoiseColorLFO": 0.2,
      "drumNoiseDecay": 1500,
      "drumNoiseDensity": 0.7,
      "drumNoiseFilterEnv": 0.4,
      "drumNoiseFilterEnvDecay": 600,
      "drumNoiseFilterFreq": 2500,
      "drumNoiseFilterQ": 1,
      "drumNoiseFilterType": "lowpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.3,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Rain Patter",
    "voice": "noise",
    "tags": [
      "organic",
      "water",
      "rain",
      "nature"
    ],
    "params": {
      "drumNoiseAttack": 2,
      "drumNoiseBreath": 0.1,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 60,
      "drumNoiseDensity": 0.3,
      "drumNoiseFilterEnv": 0.15,
      "drumNoiseFilterEnvDecay": 40,
      "drumNoiseFilterFreq": 4000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.35,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Ratchet Burst",
    "voice": "noise",
    "tags": [
      "opal",
      "ratchet",
      "burst",
      "percussive"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 100,
      "drumNoiseDensity": 1,
      "drumNoiseFilterEnv": 0.4,
      "drumNoiseFilterEnvDecay": 40,
      "drumNoiseFilterFreq": 8000,
      "drumNoiseFilterQ": 0.8,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.5,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 5,
      "drumNoiseRatchetTime": 15,
      "drumNoiseVariation": 0.1,
      "drumNoiseDistance": 0.12
    }
  },
  {
    "name": "Ratchet Rain",
    "voice": "noise",
    "tags": [
      "opal",
      "ratchet",
      "particle",
      "random",
      "rain"
    ],
    "params": {
      "drumNoiseAttack": 2,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 300,
      "drumNoiseDensity": 0.25,
      "drumNoiseFilterEnv": 0.2,
      "drumNoiseFilterEnvDecay": 100,
      "drumNoiseFilterFreq": 9000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0.1,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0.5,
      "drumNoiseParticleRandomRate": 0.4,
      "drumNoiseParticleSize": 3,
      "drumNoiseRatchetCount": 2,
      "drumNoiseRatchetTime": 18,
      "drumNoiseVariation": 0.1,
      "drumNoiseDistance": 0.12
    }
  },
  {
    "name": "Rustle",
    "voice": "noise",
    "tags": [
      "leaves",
      "nature",
      "asmr"
    ],
    "params": {
      "drumNoiseAttack": 30,
      "drumNoiseBreath": 0.1,
      "drumNoiseColorLFO": 0.8,
      "drumNoiseDecay": 200,
      "drumNoiseDensity": 0.4,
      "drumNoiseFilterEnv": 0.1,
      "drumNoiseFilterEnvDecay": 150,
      "drumNoiseFilterFreq": 4000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.3,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.22
    }
  },
  {
    "name": "Sand Shuffle",
    "voice": "noise",
    "tags": [
      "organic",
      "beach",
      "gravel",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 10,
      "drumNoiseBreath": 0.15,
      "drumNoiseColorLFO": 0.2,
      "drumNoiseDecay": 200,
      "drumNoiseDensity": 0.5,
      "drumNoiseFilterEnv": 0.1,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 3000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.35,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Scrape",
    "voice": "noise",
    "tags": [
      "friction",
      "texture",
      "industrial"
    ],
    "params": {
      "drumNoiseAttack": 5,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 2,
      "drumNoiseDecay": 150,
      "drumNoiseDensity": 0.9,
      "drumNoiseFilterEnv": -0.6,
      "drumNoiseFilterEnvDecay": 100,
      "drumNoiseFilterFreq": 4000,
      "drumNoiseFilterQ": 3,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.1,
      "drumNoiseDistance": 0.12
    }
  },
  {
    "name": "Shaker",
    "voice": "noise",
    "tags": [
      "percussion",
      "latin",
      "rhythm"
    ],
    "params": {
      "drumNoiseAttack": 2,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 80,
      "drumNoiseDensity": 0.85,
      "drumNoiseFilterEnv": 0.2,
      "drumNoiseFilterEnvDecay": 50,
      "drumNoiseFilterFreq": 6000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Static",
    "voice": "noise",
    "tags": [
      "electronic",
      "radio",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 4,
      "drumNoiseDecay": 150,
      "drumNoiseDensity": 1,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 100,
      "drumNoiseFilterFreq": 5000,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.35,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "Steam",
    "voice": "noise",
    "tags": [
      "pressure",
      "industrial",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 10,
      "drumNoiseBreath": 0.2,
      "drumNoiseColorLFO": 1.5,
      "drumNoiseDecay": 400,
      "drumNoiseDensity": 0.9,
      "drumNoiseFilterEnv": 0.7,
      "drumNoiseFilterEnvDecay": 200,
      "drumNoiseFilterFreq": 3500,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.1,
      "drumNoiseDistance": 0.12
    }
  },
  {
    "name": "Stochastic Rain",
    "voice": "noise",
    "tags": [
      "particle",
      "rain",
      "random",
      "ambient"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 300,
      "drumNoiseDensity": 0.2,
      "drumNoiseFilterEnv": 0.2,
      "drumNoiseFilterEnvDecay": 150,
      "drumNoiseFilterFreq": 8000,
      "drumNoiseFilterQ": 1.5,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0.2,
      "drumNoiseLevel": 0.3,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 3,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Tape Hiss",
    "voice": "noise",
    "tags": [
      "ambient",
      "analog",
      "warm",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 50,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 500,
      "drumNoiseDensity": 1,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 100,
      "drumNoiseFilterFreq": 6000,
      "drumNoiseFilterQ": 0.5,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.15,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Texture",
    "voice": "noise",
    "tags": [
      "ambient",
      "drone",
      "background"
    ],
    "params": {
      "drumNoiseAttack": 100,
      "drumNoiseBreath": 0.3,
      "drumNoiseColorLFO": 0.3,
      "drumNoiseDecay": 800,
      "drumNoiseDensity": 0.6,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 400,
      "drumNoiseFilterFreq": 3000,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.3,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "Whisper",
    "voice": "noise",
    "tags": [
      "asmr",
      "voice",
      "texture"
    ],
    "params": {
      "drumNoiseAttack": 20,
      "drumNoiseBreath": 0.5,
      "drumNoiseColorLFO": 1,
      "drumNoiseDecay": 200,
      "drumNoiseDensity": 0.7,
      "drumNoiseFilterEnv": 0.2,
      "drumNoiseFilterEnvDecay": 150,
      "drumNoiseFilterFreq": 1500,
      "drumNoiseFilterQ": 4,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0.6,
      "drumNoiseLevel": 0.3,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.12,
      "drumNoiseDistance": 0.16
    }
  },
  {
    "name": "White Mist",
    "voice": "noise",
    "tags": [
      "ambient",
      "fog",
      "soft",
      "atmospheric"
    ],
    "params": {
      "drumNoiseAttack": 300,
      "drumNoiseBreath": 0.4,
      "drumNoiseColorLFO": 0.2,
      "drumNoiseDecay": 2000,
      "drumNoiseDensity": 0.9,
      "drumNoiseFilterEnv": 0.2,
      "drumNoiseFilterEnvDecay": 800,
      "drumNoiseFilterFreq": 1500,
      "drumNoiseFilterQ": 0.8,
      "drumNoiseFilterType": "lowpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.25,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.22
    }
  },
  {
    "name": "Wind Gust",
    "voice": "noise",
    "tags": [
      "organic",
      "wind",
      "nature",
      "ambient"
    ],
    "params": {
      "drumNoiseAttack": 150,
      "drumNoiseBreath": 0.6,
      "drumNoiseColorLFO": 0.4,
      "drumNoiseDecay": 1000,
      "drumNoiseDensity": 0.8,
      "drumNoiseFilterEnv": 0.3,
      "drumNoiseFilterEnvDecay": 500,
      "drumNoiseFilterFreq": 2000,
      "drumNoiseFilterQ": 1,
      "drumNoiseFilterType": "lowpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.3,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.14,
      "drumNoiseDistance": 0.32
    }
  },
  {
    "name": "808 Closed Hat",
    "voice": "noise",
    "tags": [
      "808",
      "hat",
      "closed",
      "analog"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 42,
      "drumNoiseDensity": 1,
      "drumNoiseDistance": 0.05,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 7800,
      "drumNoiseFilterQ": 0.8,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.46,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.02
    }
  },
  {
    "name": "808 Open Hat",
    "voice": "noise",
    "tags": [
      "808",
      "hat",
      "open",
      "analog"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 420,
      "drumNoiseDensity": 0.95,
      "drumNoiseDistance": 0.08,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 7200,
      "drumNoiseFilterQ": 0.9,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.38,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.03
    }
  },
  {
    "name": "909 Closed Hat",
    "voice": "noise",
    "tags": [
      "909",
      "hat",
      "closed",
      "analog"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 62,
      "drumNoiseDensity": 1,
      "drumNoiseDistance": 0.04,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 9200,
      "drumNoiseFilterQ": 1.2,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.48,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.02
    }
  },
  {
    "name": "909 Open Hat",
    "voice": "noise",
    "tags": [
      "909",
      "hat",
      "open",
      "analog"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 520,
      "drumNoiseDensity": 0.95,
      "drumNoiseDistance": 0.08,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 8600,
      "drumNoiseFilterQ": 1.1,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.03
    }
  },
  {
    "name": "606 Paper Hat",
    "voice": "noise",
    "tags": [
      "606",
      "hat",
      "paper",
      "thin"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 38,
      "drumNoiseDensity": 0.8,
      "drumNoiseDistance": 0.06,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 6500,
      "drumNoiseFilterQ": 0.7,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.38,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.04
    }
  },
  {
    "name": "CR78 Metallic Hat",
    "voice": "noise",
    "tags": [
      "cr78",
      "metallic",
      "hat",
      "vintage"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 85,
      "drumNoiseDensity": 0.7,
      "drumNoiseDistance": 0.08,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 5400,
      "drumNoiseFilterQ": 1.8,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.38,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.04
    }
  },
  {
    "name": "Notch Digital Hat",
    "voice": "noise",
    "tags": [
      "notch",
      "digital",
      "hat",
      "sharp"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 58,
      "drumNoiseDensity": 1,
      "drumNoiseDistance": 0.03,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 6200,
      "drumNoiseFilterQ": 5.5,
      "drumNoiseFilterType": "notch",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.42,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.02
    }
  },
  {
    "name": "Zipper Hat",
    "voice": "noise",
    "tags": [
      "zipper",
      "hat",
      "idm",
      "samplehold"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0.6,
      "drumNoiseDecay": 70,
      "drumNoiseDensity": 0.9,
      "drumNoiseDistance": 0.04,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 9200,
      "drumNoiseFilterQ": 1,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.42,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.08
    }
  },
  {
    "name": "Ratchet Rain II",
    "voice": "noise",
    "tags": [
      "ratchet",
      "rain",
      "particle",
      "idm"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 240,
      "drumNoiseDensity": 0.42,
      "drumNoiseDistance": 0.15,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 4300,
      "drumNoiseFilterQ": 1.6,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.34,
      "drumNoiseParticleRandom": 0.8,
      "drumNoiseParticleRandomRate": 0.9,
      "drumNoiseParticleSize": 3,
      "drumNoiseRatchetCount": 7,
      "drumNoiseRatchetTime": 18,
      "drumNoiseVariation": 0.18
    }
  },
  {
    "name": "Sparse Particle Burst",
    "voice": "noise",
    "tags": [
      "particle",
      "sparse",
      "burst",
      "glitch"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 120,
      "drumNoiseDensity": 0.18,
      "drumNoiseDistance": 0.06,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 5800,
      "drumNoiseFilterQ": 2.4,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.36,
      "drumNoiseParticleRandom": 0.9,
      "drumNoiseParticleRandomRate": 0.7,
      "drumNoiseParticleSize": 2,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.22
    }
  },
  {
    "name": "Comb Noise Tick",
    "voice": "noise",
    "tags": [
      "comb",
      "tick",
      "noise",
      "digital"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 24,
      "drumNoiseDensity": 1,
      "drumNoiseDistance": 0.03,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 7600,
      "drumNoiseFilterQ": 6,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.44,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.04
    }
  },
  {
    "name": "Bitcrushed Cymbal Spray",
    "voice": "noise",
    "tags": [
      "bitcrush",
      "cymbal",
      "spray",
      "digital"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0.25,
      "drumNoiseDecay": 520,
      "drumNoiseDensity": 0.85,
      "drumNoiseDistance": 0.1,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 10000,
      "drumNoiseFilterQ": 0.8,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.34,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.1
    }
  },
  {
    "name": "Lab Clap 808",
    "voice": "noise",
    "tags": [
      "808",
      "clap",
      "lab",
      "analog"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 180,
      "drumNoiseDensity": 0.75,
      "drumNoiseDistance": 0.08,
      "drumNoiseFilterEnv": 0.3,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 2500,
      "drumNoiseFilterQ": 1.2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.48,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 3,
      "drumNoiseRatchetTime": 21,
      "drumNoiseVariation": 0.06
    }
  },
  {
    "name": "909 Clap Snap",
    "voice": "noise",
    "tags": [
      "909",
      "clap",
      "snap",
      "classic"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 160,
      "drumNoiseDensity": 0.85,
      "drumNoiseDistance": 0.06,
      "drumNoiseFilterEnv": 0.25,
      "drumNoiseFilterEnvDecay": 70,
      "drumNoiseFilterFreq": 3200,
      "drumNoiseFilterQ": 1.4,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.52,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 4,
      "drumNoiseRatchetTime": 18,
      "drumNoiseVariation": 0.05
    }
  },
  {
    "name": "Static Rim Wash",
    "voice": "noise",
    "tags": [
      "static",
      "rim",
      "wash",
      "ambient"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0.12,
      "drumNoiseColorLFO": 0.35,
      "drumNoiseDecay": 260,
      "drumNoiseDensity": 0.55,
      "drumNoiseDistance": 0.18,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 4800,
      "drumNoiseFilterQ": 2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.3,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.16
    }
  },
  {
    "name": "Granular Dust Snare",
    "voice": "noise",
    "tags": [
      "granular",
      "dust",
      "snare",
      "idm"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 145,
      "drumNoiseDensity": 0.35,
      "drumNoiseDistance": 0.08,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 3600,
      "drumNoiseFilterQ": 2.2,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.4,
      "drumNoiseParticleRandom": 0.85,
      "drumNoiseParticleRandomRate": 0.8,
      "drumNoiseParticleSize": 2,
      "drumNoiseRatchetCount": 2,
      "drumNoiseRatchetTime": 14,
      "drumNoiseVariation": 0.2
    }
  },
  {
    "name": "Sand Ratchet",
    "voice": "noise",
    "tags": [
      "sand",
      "ratchet",
      "organic",
      "idm"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 180,
      "drumNoiseDensity": 0.42,
      "drumNoiseDistance": 0.16,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 3900,
      "drumNoiseFilterQ": 1.6,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.34,
      "drumNoiseParticleRandom": 0.65,
      "drumNoiseParticleRandomRate": 0.7,
      "drumNoiseParticleSize": 3,
      "drumNoiseRatchetCount": 5,
      "drumNoiseRatchetTime": 22,
      "drumNoiseVariation": 0.22
    }
  },
  {
    "name": "Highpass Needle Hat",
    "voice": "noise",
    "tags": [
      "needle",
      "hat",
      "ikeda",
      "digital"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 18,
      "drumNoiseDensity": 1,
      "drumNoiseDistance": 0.01,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 11200,
      "drumNoiseFilterQ": 0.6,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.34,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0
    }
  },
  {
    "name": "Closed Insect Hat",
    "voice": "noise",
    "tags": [
      "insect",
      "hat",
      "organic",
      "bright"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0.55,
      "drumNoiseDecay": 55,
      "drumNoiseDensity": 0.65,
      "drumNoiseDistance": 0.12,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 9800,
      "drumNoiseFilterQ": 1.4,
      "drumNoiseFilterType": "highpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.34,
      "drumNoiseParticleRandom": 0.4,
      "drumNoiseParticleRandomRate": 0.8,
      "drumNoiseParticleSize": 2,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0.18
    }
  },
  {
    "name": "Cold Noise Dot",
    "voice": "noise",
    "tags": [
      "cold",
      "noise",
      "dot",
      "ikeda"
    ],
    "params": {
      "drumNoiseAttack": 0,
      "drumNoiseBreath": 0,
      "drumNoiseColorLFO": 0,
      "drumNoiseDecay": 16,
      "drumNoiseDensity": 1,
      "drumNoiseDistance": 0.01,
      "drumNoiseFilterEnv": 0,
      "drumNoiseFilterEnvDecay": 80,
      "drumNoiseFilterFreq": 6500,
      "drumNoiseFilterQ": 3.5,
      "drumNoiseFilterType": "bandpass",
      "drumNoiseFormant": 0,
      "drumNoiseLevel": 0.32,
      "drumNoiseParticleRandom": 0,
      "drumNoiseParticleRandomRate": 0.5,
      "drumNoiseParticleSize": 5,
      "drumNoiseRatchetCount": 0,
      "drumNoiseRatchetTime": 30,
      "drumNoiseVariation": 0
    }
  }
];

export const MEMBRANE_PRESETS: DrumVoicePreset[] = [
  {
    "name": "Brush Swirl",
    "voice": "membrane",
    "tags": [
      "brush",
      "jazz",
      "soft"
    ],
    "params": {
      "drumMembraneAttack": 10,
      "drumMembraneBody": 0.4,
      "drumMembraneDamping": 0.4,
      "drumMembraneDecay": 300,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.3,
      "drumMembraneExcDur": 20,
      "drumMembraneExciter": "brush",
      "drumMembraneExcPos": 0.45,
      "drumMembraneLevel": 0.4,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.02,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 1,
      "drumMembraneRing": 0.15,
      "drumMembraneSize": 180,
      "drumMembraneStiffness": 0.5,
      "drumMembraneVariation": 0.15,
      "drumMembraneWireDecay": 0.6,
      "drumMembraneWireDensity": 0.3,
      "drumMembraneWireMix": 0.3,
      "drumMembraneWireTone": 0.3
    }
  },
  {
    "name": "Distant Thunder",
    "voice": "membrane",
    "tags": [
      "ambient",
      "thunder",
      "deep"
    ],
    "params": {
      "drumMembraneAttack": 100,
      "drumMembraneBody": 1,
      "drumMembraneDamping": 0.15,
      "drumMembraneDecay": 3000,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.15,
      "drumMembraneExcDur": 30,
      "drumMembraneExciter": "noise",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.5,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.2,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 200,
      "drumMembranePitchEnv": 8,
      "drumMembraneRing": 0.1,
      "drumMembraneSize": 45,
      "drumMembraneStiffness": 0.2,
      "drumMembraneVariation": 0.25,
      "drumMembraneWireDecay": 0.9,
      "drumMembraneWireDensity": 0.15,
      "drumMembraneWireMix": 0.1,
      "drumMembraneWireTone": 0.15
    }
  },
  {
    "name": "Djembe",
    "voice": "membrane",
    "tags": [
      "djembe",
      "ethnic",
      "crisp"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.65,
      "drumMembraneDamping": 0.25,
      "drumMembraneDecay": 300,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.55,
      "drumMembraneExcDur": 2,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.2,
      "drumMembraneLevel": 0.65,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.08,
      "drumMembraneOvertones": 5,
      "drumMembranePitchDecay": 25,
      "drumMembranePitchEnv": 3,
      "drumMembraneRing": 0.3,
      "drumMembraneSize": 220,
      "drumMembraneStiffness": 0.55,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Ethereal Skin",
    "voice": "membrane",
    "tags": [
      "ambient",
      "ethereal",
      "sustain"
    ],
    "params": {
      "drumMembraneAttack": 50,
      "drumMembraneBody": 0.9,
      "drumMembraneDamping": 0.1,
      "drumMembraneDecay": 2500,
      "drumMembraneDistance": 0.15,
      "drumMembraneExcBright": 0.2,
      "drumMembraneExcDur": 15,
      "drumMembraneExciter": "mallet",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.4,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.05,
      "drumMembraneOvertones": 6,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 0.5,
      "drumMembraneSize": 100,
      "drumMembraneStiffness": 0.3,
      "drumMembraneVariation": 0.1,
      "drumMembraneWireDecay": 0.9,
      "drumMembraneWireDensity": 0.2,
      "drumMembraneWireMix": 0.15,
      "drumMembraneWireTone": 0.2
    }
  },
  {
    "name": "Floor Tom",
    "voice": "membrane",
    "tags": [
      "tom",
      "deep",
      "warm"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.8,
      "drumMembraneDamping": 0.3,
      "drumMembraneDecay": 500,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.3,
      "drumMembraneExcDur": 5,
      "drumMembraneExciter": "mallet",
      "drumMembraneExcPos": 0.3,
      "drumMembraneLevel": 0.7,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 60,
      "drumMembranePitchEnv": 5,
      "drumMembraneRing": 0.3,
      "drumMembraneSize": 80,
      "drumMembraneStiffness": 0.4,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Frame Drum",
    "voice": "membrane",
    "tags": [
      "frame",
      "ethnic",
      "warm"
    ],
    "params": {
      "drumMembraneAttack": 2,
      "drumMembraneBody": 0.7,
      "drumMembraneDamping": 0.2,
      "drumMembraneDecay": 800,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.35,
      "drumMembraneExcDur": 8,
      "drumMembraneExciter": "mallet",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.55,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.05,
      "drumMembraneOvertones": 6,
      "drumMembranePitchDecay": 80,
      "drumMembranePitchEnv": 1,
      "drumMembraneRing": 0.4,
      "drumMembraneSize": 100,
      "drumMembraneStiffness": 0.35,
      "drumMembraneVariation": 0.05,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Ghost Snare",
    "voice": "membrane",
    "tags": [
      "ghost",
      "soft",
      "ambient"
    ],
    "params": {
      "drumMembraneAttack": 5,
      "drumMembraneBody": 0.3,
      "drumMembraneDamping": 0.5,
      "drumMembraneDecay": 150,
      "drumMembraneDistance": 0.3,
      "drumMembraneExcBright": 0.25,
      "drumMembraneExcDur": 8,
      "drumMembraneExciter": "brush",
      "drumMembraneExcPos": 0.4,
      "drumMembraneLevel": 0.25,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 1,
      "drumMembraneRing": 0.1,
      "drumMembraneSize": 200,
      "drumMembraneStiffness": 0.5,
      "drumMembraneVariation": 0.2,
      "drumMembraneWireDecay": 0.3,
      "drumMembraneWireDensity": 0.4,
      "drumMembraneWireMix": 0.4,
      "drumMembraneWireTone": 0.3
    }
  },
  {
    "name": "Glass Bowl",
    "voice": "membrane",
    "tags": [
      "glass",
      "crystal",
      "ringing"
    ],
    "params": {
      "drumMembraneAttack": 5,
      "drumMembraneBody": 0.2,
      "drumMembraneDamping": 0.05,
      "drumMembraneDecay": 3000,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.45,
      "drumMembraneExcDur": 6,
      "drumMembraneExciter": "mallet",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.45,
      "drumMembraneMaterial": "glass",
      "drumMembraneNonlin": 0.3,
      "drumMembraneOvertones": 8,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 1,
      "drumMembraneSize": 450,
      "drumMembraneStiffness": 0.5,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "High Tom",
    "voice": "membrane",
    "tags": [
      "tom",
      "high",
      "tonal"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.6,
      "drumMembraneDamping": 0.35,
      "drumMembraneDecay": 250,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.5,
      "drumMembraneExcDur": 2,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.25,
      "drumMembraneLevel": 0.6,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0,
      "drumMembraneOvertones": 5,
      "drumMembranePitchDecay": 30,
      "drumMembranePitchEnv": 4,
      "drumMembraneRing": 0.35,
      "drumMembraneSize": 280,
      "drumMembraneStiffness": 0.6,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Loose Snare",
    "voice": "membrane",
    "tags": [
      "snare",
      "loose",
      "rattly"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.6,
      "drumMembraneDamping": 0.2,
      "drumMembraneDecay": 400,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.4,
      "drumMembraneExcDur": 4,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.3,
      "drumMembraneLevel": 0.6,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.1,
      "drumMembraneOvertones": 5,
      "drumMembranePitchDecay": 50,
      "drumMembranePitchEnv": 2,
      "drumMembraneRing": 0.25,
      "drumMembraneSize": 160,
      "drumMembraneStiffness": 0.3,
      "drumMembraneVariation": 0.1,
      "drumMembraneWireDecay": 0.7,
      "drumMembraneWireDensity": 0.8,
      "drumMembraneWireMix": 0.8,
      "drumMembraneWireTone": 0.35
    }
  },
  {
    "name": "Marching Snare",
    "voice": "membrane",
    "tags": [
      "snare",
      "marching",
      "loud"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.35,
      "drumMembraneDamping": 0.45,
      "drumMembraneDecay": 150,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.75,
      "drumMembraneExcDur": 1,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.35,
      "drumMembraneLevel": 0.85,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.05,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 15,
      "drumMembranePitchEnv": 6,
      "drumMembraneRing": 0.1,
      "drumMembraneSize": 230,
      "drumMembraneStiffness": 0.85,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.3,
      "drumMembraneWireDensity": 0.9,
      "drumMembraneWireMix": 0.9,
      "drumMembraneWireTone": 0.7
    }
  },
  {
    "name": "Metal Sheet",
    "voice": "membrane",
    "tags": [
      "metal",
      "industrial",
      "bright"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.3,
      "drumMembraneDamping": 0.1,
      "drumMembraneDecay": 1200,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.8,
      "drumMembraneExcDur": 1,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.4,
      "drumMembraneLevel": 0.5,
      "drumMembraneMaterial": "metal",
      "drumMembraneNonlin": 0.2,
      "drumMembraneOvertones": 8,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 0.9,
      "drumMembraneSize": 350,
      "drumMembraneStiffness": 0.7,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Plastic Bucket",
    "voice": "membrane",
    "tags": [
      "plastic",
      "lo-fi",
      "hollow"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.7,
      "drumMembraneDamping": 0.35,
      "drumMembraneDecay": 200,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.5,
      "drumMembraneExcDur": 2,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.35,
      "drumMembraneLevel": 0.55,
      "drumMembraneMaterial": "plastic",
      "drumMembraneNonlin": 0.1,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 35,
      "drumMembranePitchEnv": 4,
      "drumMembraneRing": 0.25,
      "drumMembraneSize": 150,
      "drumMembraneStiffness": 0.45,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Rain on Tin",
    "voice": "membrane",
    "tags": [
      "ambient",
      "rain",
      "metallic"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.15,
      "drumMembraneDamping": 0.15,
      "drumMembraneDecay": 600,
      "drumMembraneDistance": 0.2,
      "drumMembraneExcBright": 0.7,
      "drumMembraneExcDur": 0.5,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.35,
      "drumMembraneMaterial": "metal",
      "drumMembraneNonlin": 0.25,
      "drumMembraneOvertones": 6,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 0.7,
      "drumMembraneSize": 500,
      "drumMembraneStiffness": 0.65,
      "drumMembraneVariation": 0.3,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Rattle Shaker",
    "voice": "membrane",
    "tags": [
      "rattle",
      "shaker",
      "texture"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.15,
      "drumMembraneDamping": 0.5,
      "drumMembraneDecay": 100,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.55,
      "drumMembraneExcDur": 10,
      "drumMembraneExciter": "noise",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.5,
      "drumMembraneMaterial": "plastic",
      "drumMembraneNonlin": 0.15,
      "drumMembraneOvertones": 2,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 0.1,
      "drumMembraneSize": 350,
      "drumMembraneStiffness": 0.5,
      "drumMembraneVariation": 0.2,
      "drumMembraneWireDecay": 0.35,
      "drumMembraneWireDensity": 1,
      "drumMembraneWireMix": 0.7,
      "drumMembraneWireTone": 0.6
    }
  },
  {
    "name": "Singing Bowl",
    "voice": "membrane",
    "tags": [
      "bowl",
      "meditation",
      "sustain"
    ],
    "params": {
      "drumMembraneAttack": 20,
      "drumMembraneBody": 0.25,
      "drumMembraneDamping": 0.02,
      "drumMembraneDecay": 5000,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.3,
      "drumMembraneExcDur": 12,
      "drumMembraneExciter": "mallet",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.4,
      "drumMembraneMaterial": "metal",
      "drumMembraneNonlin": 0.35,
      "drumMembraneOvertones": 8,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 1,
      "drumMembraneSize": 350,
      "drumMembraneStiffness": 0.5,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Snare Classic",
    "voice": "membrane",
    "tags": [
      "snare",
      "classic",
      "default"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.5,
      "drumMembraneDamping": 0.4,
      "drumMembraneDecay": 200,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.6,
      "drumMembraneExcDur": 2,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.35,
      "drumMembraneLevel": 0.65,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 30,
      "drumMembranePitchEnv": 3,
      "drumMembraneRing": 0.15,
      "drumMembraneSize": 200,
      "drumMembraneStiffness": 0.6,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.4,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0.6,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Tabla",
    "voice": "membrane",
    "tags": [
      "tabla",
      "ethnic",
      "tonal"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.4,
      "drumMembraneDamping": 0.15,
      "drumMembraneDecay": 350,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.6,
      "drumMembraneExcDur": 1.5,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.15,
      "drumMembraneLevel": 0.6,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.15,
      "drumMembraneOvertones": 7,
      "drumMembranePitchDecay": 15,
      "drumMembranePitchEnv": 2,
      "drumMembraneRing": 0.8,
      "drumMembraneSize": 300,
      "drumMembraneStiffness": 0.7,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Tight Snare",
    "voice": "membrane",
    "tags": [
      "snare",
      "tight",
      "punchy"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.3,
      "drumMembraneDamping": 0.5,
      "drumMembraneDecay": 120,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.7,
      "drumMembraneExcDur": 1.5,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.4,
      "drumMembraneLevel": 0.75,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.05,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 20,
      "drumMembranePitchEnv": 5,
      "drumMembraneRing": 0.1,
      "drumMembraneSize": 250,
      "drumMembraneStiffness": 0.8,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.25,
      "drumMembraneWireDensity": 0.7,
      "drumMembraneWireMix": 0.7,
      "drumMembraneWireTone": 0.6
    }
  },
  {
    "name": "Wood Block",
    "voice": "membrane",
    "tags": [
      "wood",
      "percussion",
      "clicky"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.4,
      "drumMembraneDamping": 0.7,
      "drumMembraneDecay": 80,
      "drumMembraneDistance": 0.5,
      "drumMembraneExcBright": 0.65,
      "drumMembraneExcDur": 1,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.3,
      "drumMembraneLevel": 0.6,
      "drumMembraneMaterial": "wood",
      "drumMembraneNonlin": 0.1,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 10,
      "drumMembranePitchEnv": 1,
      "drumMembraneRing": 0.3,
      "drumMembraneSize": 400,
      "drumMembraneStiffness": 0.8,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "909 Snare Plastic",
    "voice": "membrane",
    "tags": [
      "909",
      "snare",
      "plastic",
      "classic"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.34,
      "drumMembraneDamping": 0.48,
      "drumMembraneDecay": 170,
      "drumMembraneDistance": 0.06,
      "drumMembraneExcBright": 0.78,
      "drumMembraneExcDur": 1.2,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.36,
      "drumMembraneLevel": 0.78,
      "drumMembraneMaterial": "plastic",
      "drumMembraneNonlin": 0.08,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 18,
      "drumMembranePitchEnv": 5,
      "drumMembraneRing": 0.12,
      "drumMembraneSize": 210,
      "drumMembraneStiffness": 0.74,
      "drumMembraneVariation": 0.03,
      "drumMembraneWireDecay": 0.32,
      "drumMembraneWireDensity": 0.78,
      "drumMembraneWireMix": 0.72,
      "drumMembraneWireTone": 0.72
    }
  },
  {
    "name": "808 Snare Wire",
    "voice": "membrane",
    "tags": [
      "808",
      "snare",
      "wire",
      "analog"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.46,
      "drumMembraneDamping": 0.42,
      "drumMembraneDecay": 210,
      "drumMembraneDistance": 0.08,
      "drumMembraneExcBright": 0.58,
      "drumMembraneExcDur": 2.5,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.42,
      "drumMembraneLevel": 0.7,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.05,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 28,
      "drumMembranePitchEnv": 2,
      "drumMembraneRing": 0.2,
      "drumMembraneSize": 260,
      "drumMembraneStiffness": 0.52,
      "drumMembraneVariation": 0.04,
      "drumMembraneWireDecay": 0.62,
      "drumMembraneWireDensity": 0.62,
      "drumMembraneWireMix": 0.82,
      "drumMembraneWireTone": 0.42
    }
  },
  {
    "name": "606 Snare Paper",
    "voice": "membrane",
    "tags": [
      "606",
      "snare",
      "paper",
      "thin"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.24,
      "drumMembraneDamping": 0.62,
      "drumMembraneDecay": 115,
      "drumMembraneDistance": 0.06,
      "drumMembraneExcBright": 0.72,
      "drumMembraneExcDur": 1.2,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.38,
      "drumMembraneLevel": 0.64,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.03,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 15,
      "drumMembranePitchEnv": 5,
      "drumMembraneRing": 0.08,
      "drumMembraneSize": 310,
      "drumMembraneStiffness": 0.68,
      "drumMembraneVariation": 0.03,
      "drumMembraneWireDecay": 0.25,
      "drumMembraneWireDensity": 0.54,
      "drumMembraneWireMix": 0.62,
      "drumMembraneWireTone": 0.62
    }
  },
  {
    "name": "Tuned Skin Tom High",
    "voice": "membrane",
    "tags": [
      "tom",
      "skin",
      "tuned",
      "high"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.68,
      "drumMembraneDamping": 0.32,
      "drumMembraneDecay": 260,
      "drumMembraneDistance": 0.08,
      "drumMembraneExcBright": 0.5,
      "drumMembraneExcDur": 2.2,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.34,
      "drumMembraneLevel": 0.68,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.04,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 45,
      "drumMembranePitchEnv": 12,
      "drumMembraneRing": 0.22,
      "drumMembraneSize": 185,
      "drumMembraneStiffness": 0.62,
      "drumMembraneVariation": 0.04,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Tuned Skin Tom Mid",
    "voice": "membrane",
    "tags": [
      "tom",
      "skin",
      "tuned",
      "mid"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.72,
      "drumMembraneDamping": 0.28,
      "drumMembraneDecay": 340,
      "drumMembraneDistance": 0.08,
      "drumMembraneExcBright": 0.42,
      "drumMembraneExcDur": 2.8,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.32,
      "drumMembraneLevel": 0.7,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.04,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 60,
      "drumMembranePitchEnv": 10,
      "drumMembraneRing": 0.28,
      "drumMembraneSize": 120,
      "drumMembraneStiffness": 0.48,
      "drumMembraneVariation": 0.05,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Tuned Skin Tom Low",
    "voice": "membrane",
    "tags": [
      "tom",
      "skin",
      "tuned",
      "low"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.82,
      "drumMembraneDamping": 0.24,
      "drumMembraneDecay": 520,
      "drumMembraneDistance": 0.1,
      "drumMembraneExcBright": 0.32,
      "drumMembraneExcDur": 4,
      "drumMembraneExciter": "mallet",
      "drumMembraneExcPos": 0.28,
      "drumMembraneLevel": 0.72,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.06,
      "drumMembraneOvertones": 5,
      "drumMembranePitchDecay": 85,
      "drumMembranePitchEnv": 8,
      "drumMembraneRing": 0.36,
      "drumMembraneSize": 72,
      "drumMembraneStiffness": 0.36,
      "drumMembraneVariation": 0.06,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Simmons Laser Tom",
    "voice": "membrane",
    "tags": [
      "simmons",
      "laser",
      "tom",
      "pitch"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.5,
      "drumMembraneDamping": 0.38,
      "drumMembraneDecay": 320,
      "drumMembraneDistance": 0.05,
      "drumMembraneExcBright": 0.78,
      "drumMembraneExcDur": 1,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.36,
      "drumMembraneLevel": 0.7,
      "drumMembraneMaterial": "plastic",
      "drumMembraneNonlin": 0.12,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 140,
      "drumMembranePitchEnv": 52,
      "drumMembraneRing": 0.16,
      "drumMembraneSize": 95,
      "drumMembraneStiffness": 0.8,
      "drumMembraneVariation": 0.04,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Wire Buzz Ghost",
    "voice": "membrane",
    "tags": [
      "wire",
      "ghost",
      "snare",
      "ambient"
    ],
    "params": {
      "drumMembraneAttack": 5,
      "drumMembraneBody": 0.26,
      "drumMembraneDamping": 0.52,
      "drumMembraneDecay": 260,
      "drumMembraneDistance": 0.22,
      "drumMembraneExcBright": 0.38,
      "drumMembraneExcDur": 12,
      "drumMembraneExciter": "brush",
      "drumMembraneExcPos": 0.48,
      "drumMembraneLevel": 0.48,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.03,
      "drumMembraneOvertones": 5,
      "drumMembranePitchDecay": 40,
      "drumMembranePitchEnv": 1,
      "drumMembraneRing": 0.24,
      "drumMembraneSize": 210,
      "drumMembraneStiffness": 0.42,
      "drumMembraneVariation": 0.18,
      "drumMembraneWireDecay": 0.82,
      "drumMembraneWireDensity": 0.36,
      "drumMembraneWireMix": 0.58,
      "drumMembraneWireTone": 0.28
    }
  },
  {
    "name": "Metal Insect Snare",
    "voice": "membrane",
    "tags": [
      "metal",
      "insect",
      "snare",
      "experimental"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.18,
      "drumMembraneDamping": 0.18,
      "drumMembraneDecay": 180,
      "drumMembraneDistance": 0.06,
      "drumMembraneExcBright": 0.88,
      "drumMembraneExcDur": 0.8,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.4,
      "drumMembraneLevel": 0.48,
      "drumMembraneMaterial": "metal",
      "drumMembraneNonlin": 0.24,
      "drumMembraneOvertones": 8,
      "drumMembranePitchDecay": 22,
      "drumMembranePitchEnv": 8,
      "drumMembraneRing": 0.72,
      "drumMembraneSize": 320,
      "drumMembraneStiffness": 0.86,
      "drumMembraneVariation": 0.1,
      "drumMembraneWireDecay": 0.22,
      "drumMembraneWireDensity": 0.75,
      "drumMembraneWireMix": 0.28,
      "drumMembraneWireTone": 0.82
    }
  },
  {
    "name": "Glass Plate Hit",
    "voice": "membrane",
    "tags": [
      "glass",
      "plate",
      "modal",
      "bright"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.2,
      "drumMembraneDamping": 0.06,
      "drumMembraneDecay": 950,
      "drumMembraneDistance": 0.12,
      "drumMembraneExcBright": 0.72,
      "drumMembraneExcDur": 1.2,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.46,
      "drumMembraneLevel": 0.42,
      "drumMembraneMaterial": "glass",
      "drumMembraneNonlin": 0.12,
      "drumMembraneOvertones": 8,
      "drumMembranePitchDecay": 50,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 0.92,
      "drumMembraneSize": 360,
      "drumMembraneStiffness": 0.72,
      "drumMembraneVariation": 0.05,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Modal IDM Snare",
    "voice": "membrane",
    "tags": [
      "idm",
      "modal",
      "snare",
      "fm"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.36,
      "drumMembraneDamping": 0.34,
      "drumMembraneDecay": 210,
      "drumMembraneDistance": 0.06,
      "drumMembraneExcBright": 0.7,
      "drumMembraneExcDur": 1.4,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.28,
      "drumMembraneLevel": 0.64,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.12,
      "drumMembraneOvertones": 6,
      "drumMembranePitchDecay": 28,
      "drumMembranePitchEnv": 11,
      "drumMembraneRing": 0.38,
      "drumMembraneSize": 230,
      "drumMembraneStiffness": 0.58,
      "drumMembraneVariation": 0.08,
      "drumMembraneWireDecay": 0.42,
      "drumMembraneWireDensity": 0.62,
      "drumMembraneWireMix": 0.5,
      "drumMembraneWireTone": 0.62
    }
  },
  {
    "name": "Brush Data Snare",
    "voice": "membrane",
    "tags": [
      "brush",
      "data",
      "snare",
      "texture"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.25,
      "drumMembraneDamping": 0.56,
      "drumMembraneDecay": 180,
      "drumMembraneDistance": 0.16,
      "drumMembraneExcBright": 0.5,
      "drumMembraneExcDur": 18,
      "drumMembraneExciter": "brush",
      "drumMembraneExcPos": 0.44,
      "drumMembraneLevel": 0.46,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.04,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 18,
      "drumMembranePitchEnv": 2,
      "drumMembraneRing": 0.18,
      "drumMembraneSize": 240,
      "drumMembraneStiffness": 0.5,
      "drumMembraneVariation": 0.2,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.28,
      "drumMembraneWireMix": 0.72,
      "drumMembraneWireTone": 0.45
    }
  },
  {
    "name": "Tight Marching 2",
    "voice": "membrane",
    "tags": [
      "snare",
      "marching",
      "tight",
      "punchy"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.34,
      "drumMembraneDamping": 0.54,
      "drumMembraneDecay": 130,
      "drumMembraneDistance": 0.04,
      "drumMembraneExcBright": 0.82,
      "drumMembraneExcDur": 0.8,
      "drumMembraneExciter": "stick",
      "drumMembraneExcPos": 0.35,
      "drumMembraneLevel": 0.82,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.08,
      "drumMembraneOvertones": 3,
      "drumMembranePitchDecay": 14,
      "drumMembranePitchEnv": 4,
      "drumMembraneRing": 0.08,
      "drumMembraneSize": 190,
      "drumMembraneStiffness": 0.86,
      "drumMembraneVariation": 0.02,
      "drumMembraneWireDecay": 0.2,
      "drumMembraneWireDensity": 0.82,
      "drumMembraneWireMix": 0.88,
      "drumMembraneWireTone": 0.7
    }
  },
  {
    "name": "Skin Dot",
    "voice": "membrane",
    "tags": [
      "skin",
      "dot",
      "ikeda",
      "dry"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.16,
      "drumMembraneDamping": 0.72,
      "drumMembraneDecay": 42,
      "drumMembraneDistance": 0.01,
      "drumMembraneExcBright": 0.65,
      "drumMembraneExcDur": 0.4,
      "drumMembraneExciter": "impulse",
      "drumMembraneExcPos": 0.36,
      "drumMembraneLevel": 0.52,
      "drumMembraneMaterial": "skin",
      "drumMembraneNonlin": 0.02,
      "drumMembraneOvertones": 2,
      "drumMembranePitchDecay": 8,
      "drumMembranePitchEnv": 1,
      "drumMembraneRing": 0.05,
      "drumMembraneSize": 360,
      "drumMembraneStiffness": 0.75,
      "drumMembraneVariation": 0,
      "drumMembraneWireDecay": 0.5,
      "drumMembraneWireDensity": 0.5,
      "drumMembraneWireMix": 0,
      "drumMembraneWireTone": 0.5
    }
  },
  {
    "name": "Plastic Pail Clap",
    "voice": "membrane",
    "tags": [
      "plastic",
      "pail",
      "clap",
      "lofi"
    ],
    "params": {
      "drumMembraneAttack": 0,
      "drumMembraneBody": 0.42,
      "drumMembraneDamping": 0.44,
      "drumMembraneDecay": 180,
      "drumMembraneDistance": 0.08,
      "drumMembraneExcBright": 0.68,
      "drumMembraneExcDur": 10,
      "drumMembraneExciter": "noise",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.58,
      "drumMembraneMaterial": "plastic",
      "drumMembraneNonlin": 0.18,
      "drumMembraneOvertones": 4,
      "drumMembranePitchDecay": 28,
      "drumMembranePitchEnv": 3,
      "drumMembraneRing": 0.16,
      "drumMembraneSize": 260,
      "drumMembraneStiffness": 0.52,
      "drumMembraneVariation": 0.12,
      "drumMembraneWireDecay": 0.35,
      "drumMembraneWireDensity": 0.7,
      "drumMembraneWireMix": 0.28,
      "drumMembraneWireTone": 0.52
    }
  },
  {
    "name": "Singing Wire Bowl",
    "voice": "membrane",
    "tags": [
      "wire",
      "bowl",
      "singing",
      "metal"
    ],
    "params": {
      "drumMembraneAttack": 8,
      "drumMembraneBody": 0.28,
      "drumMembraneDamping": 0.03,
      "drumMembraneDecay": 2200,
      "drumMembraneDistance": 0.18,
      "drumMembraneExcBright": 0.34,
      "drumMembraneExcDur": 10,
      "drumMembraneExciter": "mallet",
      "drumMembraneExcPos": 0.5,
      "drumMembraneLevel": 0.38,
      "drumMembraneMaterial": "metal",
      "drumMembraneNonlin": 0.2,
      "drumMembraneOvertones": 8,
      "drumMembranePitchDecay": 50,
      "drumMembranePitchEnv": 0,
      "drumMembraneRing": 1,
      "drumMembraneSize": 420,
      "drumMembraneStiffness": 0.52,
      "drumMembraneVariation": 0.06,
      "drumMembraneWireDecay": 1,
      "drumMembraneWireDensity": 0.18,
      "drumMembraneWireMix": 0.16,
      "drumMembraneWireTone": 0.34
    }
  }
];

export const DRUM_VOICE_PRESETS: Record<DrumVoiceType, DrumVoicePreset[]> = {
  sub: SUB_PRESETS,
  kick: KICK_PRESETS,
  click: CLICK_PRESETS,
  beepHi: BEEP_HI_PRESETS,
  beepLo: BEEP_LO_PRESETS,
  noise: NOISE_PRESETS,
  membrane: MEMBRANE_PRESETS,
};

const USER_DRUM_VOICE_PRESETS: Record<DrumVoiceType, Map<string, DrumVoicePreset>> = {
  sub: new Map(),
  kick: new Map(),
  click: new Map(),
  beepHi: new Map(),
  beepLo: new Map(),
  noise: new Map(),
  membrane: new Map(),
};

export function getFactoryPresetNames(voice: DrumVoiceType): string[] {
  return DRUM_VOICE_PRESETS[voice].map(preset => preset.name);
}

export function setUserPresets(voice: DrumVoiceType, presets: DrumVoicePreset[]): void {
  const next = new Map<string, DrumVoicePreset>();
  for (const preset of presets) {
    next.set(preset.name, preset);
  }
  USER_DRUM_VOICE_PRESETS[voice] = next;
}

export function upsertUserPreset(voice: DrumVoiceType, preset: DrumVoicePreset): void {
  USER_DRUM_VOICE_PRESETS[voice].set(preset.name, preset);
}

export function renameUserPreset(voice: DrumVoiceType, previousName: string, preset: DrumVoicePreset): void {
  USER_DRUM_VOICE_PRESETS[voice].delete(previousName);
  USER_DRUM_VOICE_PRESETS[voice].set(preset.name, preset);
}

export function getPreset(voice: DrumVoiceType, name: string): DrumVoicePreset | undefined {
  const userPreset = USER_DRUM_VOICE_PRESETS[voice].get(name);
  if (userPreset) return userPreset;
  return DRUM_VOICE_PRESETS[voice].find(preset => preset.name === name);
}

export function getPresetNames(voice: DrumVoiceType): string[] {
  const names = new Set(getFactoryPresetNames(voice));
  for (const name of USER_DRUM_VOICE_PRESETS[voice].keys()) {
    names.add(name);
  }
  return [...names];
}

export function getPresetsByTag(voice: DrumVoiceType, tag: string): DrumVoicePreset[] {
  return DRUM_VOICE_PRESETS[voice].filter(preset => preset.tags.includes(tag));
}
