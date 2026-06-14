import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const runtimePath = resolve(root, 'public/presets/drum-engine-presets.json');
const futurePath = resolve(root, 'public/presets/drum-engine-presets-future-dsp.json');
const schemaPath = resolve(root, 'cpp/KesshoCore/schema/kessho_product_drum_params.schema.json');

const runtime = JSON.parse(readFileSync(runtimePath, 'utf8'));
const future = JSON.parse(readFileSync(futurePath, 'utf8'));
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const schemaKeys = new Set(schema.paramSpecs.map((spec) => spec.key));

const requiredMacrosByScope = {
  drumSub: ['drumSubAttack', 'drumSubVariation', 'drumSubDistance'],
  drumKick: ['drumKickAttack', 'drumKickVariation', 'drumKickDistance'],
  drumClick: ['drumClickAttack', 'drumClickVariation', 'drumClickDistance'],
  drumBeepHi: ['drumBeepHiVariation', 'drumBeepHiDistance'],
  drumBeepLo: ['drumBeepLoOscGain', 'drumBeepLoModalGain', 'drumBeepLoVariation', 'drumBeepLoDistance'],
  drumNoise: ['drumNoiseVariation', 'drumNoiseDistance'],
  drumMembrane: ['drumMembraneVariation', 'drumMembraneDistance'],
};

const richMembraneKeys = [
  'drumMembraneExciter',
  'drumMembraneExcDur',
  'drumMembraneExcBright',
  'drumMembraneExcPos',
  'drumMembraneBody',
  'drumMembraneRing',
  'drumMembraneNonlin',
  'drumMembraneOvertones',
  'drumMembranePitchDecay',
  'drumMembraneWireDensity',
  'drumMembraneWireDecay',
  'drumMembraneWireTone',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function latestData(entry) {
  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  const latest = versions[versions.length - 1];
  return latest && latest.data && typeof latest.data === 'object' ? latest.data : {};
}

function validateBackupShape(backup, expectedCount, label) {
  assert(backup.kesshoBackup === true, `${label} must use kesshoBackup format`);
  assert(backup.exportKind === 'drum-engine-presets', `${label} exportKind mismatch`);
  assert(Array.isArray(backup.entries), `${label} entries missing`);
  assert(backup.entries.length === expectedCount, `${label} expected ${expectedCount} entries, got ${backup.entries.length}`);
  assert(backup.count === expectedCount, `${label} top-level count mismatch`);
}

function validateKeys(backup, label) {
  const unknown = [];
  for (const entry of backup.entries) {
    const versions = Array.isArray(entry.versions) ? entry.versions : [];
    for (const version of versions) {
      for (const key of Object.keys(version.data ?? {})) {
        if (!schemaKeys.has(key)) {
          unknown.push(`${entry.scope}/${entry.name}/v${version.v}:${key}`);
        }
      }
    }
  }
  assert(unknown.length === 0, `${label} contains keys outside drum schema:\n${unknown.slice(0, 20).join('\n')}`);
}

function validateRuntimeCoverage() {
  let continuousClickCount = 0;
  let notchNoiseCount = 0;
  let richMembraneCount = 0;
  let userPresetPreserved = false;

  for (const entry of runtime.entries) {
    const data = latestData(entry);
    if (entry.author === 'user') {
      userPresetPreserved ||= entry.name === 'TESt' && entry.scope === 'drumSub';
      continue;
    }
    const required = requiredMacrosByScope[entry.scope] ?? [];
    for (const key of required) {
      assert(Object.prototype.hasOwnProperty.call(data, key), `${entry.scope}/${entry.name} missing required macro ${key}`);
    }
    if (entry.scope === 'drumClick' && data.drumClickMode === 'continuous') {
      continuousClickCount += 1;
    }
    if (entry.scope === 'drumNoise' && data.drumNoiseFilterType === 'notch') {
      notchNoiseCount += 1;
    }
    if (entry.scope === 'drumMembrane' && richMembraneKeys.every((key) => Object.prototype.hasOwnProperty.call(data, key))) {
      richMembraneCount += 1;
    }
  }

  assert(userPresetPreserved, 'runtime backup did not preserve the existing user drum preset');
  assert(continuousClickCount > 0, 'expected at least one drumClickMode=continuous factory preset');
  assert(notchNoiseCount > 0, 'expected at least one drumNoiseFilterType=notch factory preset');
  assert(richMembraneCount > 0, 'expected membrane presets with full rich membrane key coverage');
}

validateBackupShape(runtime, 280, 'runtime-ready drum preset bank');
validateBackupShape(future, 280, 'future-DSP drum preset bank');
validateKeys(runtime, 'runtime-ready drum preset bank');
validateKeys(future, 'future-DSP drum preset bank');
validateRuntimeCoverage();

console.log('Kessho drum preset expansion coverage passed');
