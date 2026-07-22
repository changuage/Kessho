import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parseTypeScriptSource } from './lib/sourceArchitectureRules.mjs';

const root = process.cwd();

function callCount(fileName, functionName) {
  const source = parseTypeScriptSource(fileName, fs.readFileSync(fileName, 'utf8'));
  let count = 0;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === functionName
    ) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

function source(relativePath) {
  return path.join(root, relativePath);
}

const sharedFiles = [
  'src/presets/PresetManagerController.tsx',
  'src/ui/synth/SynthPresetManager.tsx',
  'src/ui/drums/DrumPresetManager.tsx',
  'src/ui/drums/MorphSlider.tsx',
];
for (const relativePath of sharedFiles) {
  const count = callCount(source(relativePath), 'usePresets');
  if (count !== 0) throw new Error(`${relativePath} owns ${count} usePresets query hooks; repository ownership must stay at the mounted scope`);
}

const synthCount = callCount(source('src/ui/synth/SynthPage.tsx'), 'usePresets');
if (synthCount !== 3) throw new Error(`SynthPage must own exactly three preset repositories, found ${synthCount}`);

const voiceCardCount = callCount(source('src/ui/drums/VoiceCard.tsx'), 'usePresets');
if (voiceCardCount !== 1) throw new Error(`VoiceCard must own exactly one voice-scoped preset repository, found ${voiceCardCount}`);

const synthSource = fs.readFileSync(source('src/ui/synth/SynthPage.tsx'), 'utf8');
for (const repositoryName of ['pad1PresetRepository', 'pad2PresetRepository']) {
  if (!synthSource.includes(repositoryName)) throw new Error(`SynthPage does not pass ${repositoryName} through its manager adapter`);
}
const voiceSource = fs.readFileSync(source('src/ui/drums/VoiceCard.tsx'), 'utf8');
if (!voiceSource.includes('presetRepository')) throw new Error('VoiceCard does not pass its repository through the Morph and preset manager surfaces');

console.log('preset manager query ownership passed');
