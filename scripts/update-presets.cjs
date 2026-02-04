/**
 * Update preset files with missing drum synth parameters
 * Run with: node scripts/update-presets.js
 */

const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.join(__dirname, '..', 'public', 'presets');

// New parameters to add with their default values
const NEW_PARAMS = {
  // Enhanced Sub parameters
  drumSubShape: 0,
  drumSubPitchEnv: 0,
  drumSubPitchDecay: 50,
  drumSubDrive: 0,
  drumSubSub: 0,
  
  // Enhanced Kick parameters
  drumKickBody: 0.3,
  drumKickPunch: 0.8,
  drumKickTail: 0,
  drumKickTone: 0,
  
  // Enhanced Click parameters
  drumClickPitch: 2000,
  drumClickPitchEnv: 0,
  drumClickMode: 'impulse',
  drumClickGrainCount: 1,
  drumClickGrainSpread: 0,
  drumClickStereoWidth: 0,
  
  // Enhanced BeepHi parameters
  drumBeepHiInharmonic: 0,
  drumBeepHiPartials: 1,
  drumBeepHiShimmer: 0,
  drumBeepHiShimmerRate: 4,
  drumBeepHiBrightness: 0.5,
  
  // Enhanced BeepLo parameters  
  drumBeepLoPitchEnv: 0,
  drumBeepLoPitchDecay: 50,
  drumBeepLoBody: 0.3,
  drumBeepLoPluck: 0,
  drumBeepLoPluckDamp: 0.5,
  
  // Enhanced Noise parameters
  drumNoiseFormant: 0,
  drumNoiseBreath: 0,
  drumNoiseFilterEnv: 0,
  drumNoiseFilterEnvDecay: 100,
  drumNoiseDensity: 1,
  drumNoiseColorLFO: 0,
  drumRandomMorphUpdate: false,
  
  // Morph system for all voices
  drumSubPresetA: 'Classic Sub',
  drumSubPresetB: 'Classic Sub',
  drumSubMorph: 0,
  drumSubMorphAuto: false,
  drumSubMorphSpeed: 4,
  drumSubMorphMode: 'pingpong',
  
  drumKickPresetA: 'Ikeda Kick',
  drumKickPresetB: 'Ikeda Kick',
  drumKickMorph: 0,
  drumKickMorphAuto: false,
  drumKickMorphSpeed: 4,
  drumKickMorphMode: 'pingpong',
  
  drumClickPresetA: 'Data Point',
  drumClickPresetB: 'Data Point',
  drumClickMorph: 0,
  drumClickMorphAuto: false,
  drumClickMorphSpeed: 4,
  drumClickMorphMode: 'pingpong',
  
  drumBeepHiPresetA: 'Data Ping',
  drumBeepHiPresetB: 'Data Ping',
  drumBeepHiMorph: 0,
  drumBeepHiMorphAuto: false,
  drumBeepHiMorphSpeed: 4,
  drumBeepHiMorphMode: 'pingpong',
  
  drumBeepLoPresetA: 'Blip',
  drumBeepLoPresetB: 'Blip',
  drumBeepLoMorph: 0,
  drumBeepLoMorphAuto: false,
  drumBeepLoMorphSpeed: 4,
  drumBeepLoMorphMode: 'pingpong',
  
  drumNoisePresetA: 'Hi-Hat',
  drumNoisePresetB: 'Hi-Hat',
  drumNoiseMorph: 0,
  drumNoiseMorphAuto: false,
  drumNoiseMorphSpeed: 4,
  drumNoiseMorphMode: 'pingpong',
  
  // Stereo ping-pong delay
  drumDelayEnabled: false,
  drumDelayNoteL: '1/8d',
  drumDelayNoteR: '1/4',
  drumDelayFeedback: 0.4,
  drumDelayMix: 0.3,
  drumDelayFilter: 0.5,
  drumSubDelaySend: 0.0,
  drumKickDelaySend: 0.2,
  drumClickDelaySend: 0.5,
  drumBeepHiDelaySend: 0.6,
  drumBeepLoDelaySend: 0.4,
  drumNoiseDelaySend: 0.7,
  
  // Euclidean base BPM (if missing)
  drumEuclidBaseBPM: 120,
  
  // Multi-target Euclidean (new format)
  drumEuclid1TargetSub: false,
  drumEuclid1TargetKick: false,
  drumEuclid1TargetClick: true,
  drumEuclid1TargetBeepHi: false,
  drumEuclid1TargetBeepLo: false,
  drumEuclid1TargetNoise: false,
  
  drumEuclid2TargetSub: true,
  drumEuclid2TargetKick: false,
  drumEuclid2TargetClick: false,
  drumEuclid2TargetBeepHi: false,
  drumEuclid2TargetBeepLo: false,
  drumEuclid2TargetNoise: false,
  
  drumEuclid3TargetSub: false,
  drumEuclid3TargetKick: false,
  drumEuclid3TargetClick: false,
  drumEuclid3TargetBeepHi: true,
  drumEuclid3TargetBeepLo: false,
  drumEuclid3TargetNoise: false,
  
  drumEuclid4TargetSub: false,
  drumEuclid4TargetKick: false,
  drumEuclid4TargetClick: false,
  drumEuclid4TargetBeepHi: false,
  drumEuclid4TargetBeepLo: false,
  drumEuclid4TargetNoise: true,
};

// Get all JSON files except manifest.json
const presetFiles = fs.readdirSync(PRESETS_DIR)
  .filter(f => f.endsWith('.json') && f !== 'manifest.json');

console.log(`Found ${presetFiles.length} preset files to update`);

let totalAdded = 0;

for (const file of presetFiles) {
  const filePath = path.join(PRESETS_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  const preset = JSON.parse(content);
  
  let addedCount = 0;
  
  for (const [key, defaultValue] of Object.entries(NEW_PARAMS)) {
    if (!(key in preset.state)) {
      preset.state[key] = defaultValue;
      addedCount++;
    }
  }
  
  // Remove old single-target format if present
  const oldTargetKeys = [
    'drumEuclid1Target', 'drumEuclid2Target', 
    'drumEuclid3Target', 'drumEuclid4Target'
  ];
  for (const oldKey of oldTargetKeys) {
    if (oldKey in preset.state) {
      delete preset.state[oldKey];
      console.log(`  Removed deprecated ${oldKey} from ${file}`);
    }
  }
  
  if (addedCount > 0) {
    fs.writeFileSync(filePath, JSON.stringify(preset, null, 4));
    console.log(`Updated ${file}: added ${addedCount} new parameters`);
    totalAdded += addedCount;
  } else {
    console.log(`${file}: already up to date`);
  }
}

console.log(`\nDone! Added ${totalAdded} total parameters across all presets.`);
