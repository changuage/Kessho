/**
 * Adds new DSP params to all existing drum presets with default values.
 * Run: node scripts/update-presets.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'audio', 'drumPresets.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add new params to BEEP_HI presets (after drumBeepHiBrightness line)
content = content.replace(
  /drumBeepHiBrightness: ([\d.]+),?\s*\n(\s*)\}/g,
  (match, val, indent) => 
    `drumBeepHiBrightness: ${val},\n${indent}  drumBeepHiFeedback: 0,\n${indent}  drumBeepHiModEnvDecay: 0,\n${indent}  drumBeepHiNoiseInMod: 0,\n${indent}}`
);

// Add new params to BEEP_LO presets (after drumBeepLoPluckDamp line)
content = content.replace(
  /drumBeepLoPluckDamp: ([\d.]+),?\s*\n(\s*)\}/g,
  (match, val, indent) =>
    `drumBeepLoPluckDamp: ${val},\n${indent}  drumBeepLoModal: 0,\n${indent}  drumBeepLoModalQ: 10,\n${indent}  drumBeepLoModalInharmonic: 0,\n${indent}}`
);

// Add new params to CLICK presets (after drumClickStereoWidth line)
content = content.replace(
  /drumClickStereoWidth: ([\d.]+),?\s*\n(\s*)\}/g,
  (match, val, indent) =>
    `drumClickStereoWidth: ${val},\n${indent}  drumClickExciterColor: 0,\n${indent}}`
);

// Add new params to NOISE presets (after drumNoiseColorLFO line)
content = content.replace(
  /drumNoiseColorLFO: ([\d.]+),?\s*\n(\s*)\}/g,
  (match, val, indent) =>
    `drumNoiseColorLFO: ${val},\n${indent}  drumNoiseParticleSize: 5,\n${indent}}`
);

fs.writeFileSync(filePath, content, 'utf8');

// Verify counts
const beepHi = (content.match(/drumBeepHiFeedback/g) || []).length;
const beepLo = (content.match(/drumBeepLoModal:/g) || []).length;
const click = (content.match(/drumClickExciterColor/g) || []).length;
const noise = (content.match(/drumNoiseParticleSize/g) || []).length;
console.log(`BeepHi (feedback): ${beepHi} / expected 18`);
console.log(`BeepLo (modal): ${beepLo} / expected 18`);
console.log(`Click (exciterColor): ${click} / expected 20`);
console.log(`Noise (particleSize): ${noise} / expected 21`);

// Verify values preserved
const brightnessLines = content.split('\n').filter(l => l.includes('drumBeepHiBrightness'));
const allHaveValues = brightnessLines.every(l => /drumBeepHiBrightness: [\d.]+/.test(l));
console.log(`Brightness values preserved: ${allHaveValues} (${brightnessLines.length} lines)`);
