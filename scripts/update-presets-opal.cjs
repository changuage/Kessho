/**
 * Bulk-update drum presets with 11 new Opal-inspired param defaults.
 * 
 * BeepHi (after drumBeepHiNoiseInMod):
 *   drumBeepHiModRatio: 2, drumBeepHiModRatioFine: 0.01, drumBeepHiModPhase: 0,
 *   drumBeepHiModEnvEnd: 0.2, drumBeepHiNoiseDecay: 0
 * 
 * BeepLo (after drumBeepLoModalInharmonic):
 *   drumBeepLoModalSpread: 0, drumBeepLoModalCut: 0
 * 
 * Noise (after drumNoiseParticleSize):
 *   drumNoiseParticleRandom: 0, drumNoiseParticleRandomRate: 0.5,
 *   drumNoiseRatchetCount: 0, drumNoiseRatchetTime: 30
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'audio', 'drumPresets.ts');
let content = fs.readFileSync(filePath, 'utf8');
let count = 0;

// BeepHi: insert 5 new params after drumBeepHiNoiseInMod
content = content.replace(
  /(\s+drumBeepHiNoiseInMod:\s*[\d.]+,\r?\n)/g,
  function(match, captured) {
    count++;
    return captured +
      '      drumBeepHiModRatio: 2,\n' +
      '      drumBeepHiModRatioFine: 0.01,\n' +
      '      drumBeepHiModPhase: 0,\n' +
      '      drumBeepHiModEnvEnd: 0.2,\n' +
      '      drumBeepHiNoiseDecay: 0,\n';
  }
);

console.log(`BeepHi: updated ${count} presets`);
const beepHiCount = count;
count = 0;

// BeepLo: insert 2 new params after drumBeepLoModalInharmonic
content = content.replace(
  /(\s+drumBeepLoModalInharmonic:\s*[\d.]+,\r?\n)/g,
  function(match, captured) {
    count++;
    return captured +
      '      drumBeepLoModalSpread: 0,\n' +
      '      drumBeepLoModalCut: 0,\n';
  }
);

console.log(`BeepLo: updated ${count} presets`);
const beepLoCount = count;
count = 0;

// Noise: insert 4 new params after drumNoiseParticleSize
content = content.replace(
  /(\s+drumNoiseParticleSize:\s*[\d.]+,\r?\n)/g,
  function(match, captured) {
    count++;
    return captured +
      '      drumNoiseParticleRandom: 0,\n' +
      '      drumNoiseParticleRandomRate: 0.5,\n' +
      '      drumNoiseRatchetCount: 0,\n' +
      '      drumNoiseRatchetTime: 30,\n';
  }
);

console.log(`Noise: updated ${count} presets`);
console.log(`Total: ${beepHiCount + beepLoCount + count} preset entries updated`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done!');
