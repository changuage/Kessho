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

const managerSource = fs.readFileSync(source('src/presets/PresetManagerController.tsx'), 'utf8');
for (const token of [
  'const [mutationBusy, setMutationBusy] = useState(false)',
  'const [mutationError, setMutationError] = useState',
  'const mutationBusyRef = useRef(false)',
  'const runMutation = useCallback(async',
  'setMutationError(getPresetCommandErrorMessage(error))',
  'finally {',
  'disabled={controller.mutationBusy}',
  'role="alert"',
]) {
  if (!managerSource.includes(token)) {
    throw new Error(`PresetManagerController is missing mutation feedback guard: ${token}`);
  }
}
const guardedMutationCalls = [...managerSource.matchAll(/await runMutation\(async \(\) =>/g)].length;
if (guardedMutationCalls < 4) {
  throw new Error(`PresetManagerController must guard save, Save As, rename, and confirmed delete; found ${guardedMutationCalls} guarded mutations`);
}

const dropdownSource = fs.readFileSync(source('src/presets/PresetDropdown.tsx'), 'utf8');
for (const token of [
  'getPresetCommandService(store).importEntry(entry)',
  'setSaveError(message)',
  'setSaveBusy(true)',
  'finally {',
  'disabled={saveBusy}',
]) {
  if (!dropdownSource.includes(token)) {
    throw new Error(`PresetDropdown import must use safe queued persistence with surfaced failure: ${token}`);
  }
}

for (const token of [
  'if (!savedEntry) {',
  'setSaveError(`Preset "${trimmedName}" was not saved.`)',
  'setSaveError(`Preset "${selectedName}" was not renamed.`)',
  'surfacePresetMutationFailure(`Preset "${selectedName}" could not be deleted.`)',
  'const updated = await updateMetadata(selectedName, { visibility })',
  'if (previousRating === undefined) delete next[name]',
]) {
  if (!dropdownSource.includes(token)) {
    throw new Error(`PresetDropdown must keep failed mutations visible and roll back optimistic state: ${token}`);
  }
}

const familyTreeSource = fs.readFileSync(source('src/presets/PresetFamilyTree.tsx'), 'utf8');
for (const token of [
  'setSaveError(`Preset "${saveDialog.originalName}" was not saved.`)',
  'setSaveError(`Preset "${saveDialog.originalName}" was not renamed.`)',
  'setSaveDialog(dialog)',
  'setSaveError(`Preset "${targetName}" was not saved.`)',
  'setSaveError(`Preset "${childName}" was not saved.`)',
  'surfacePresetMutationFailure(`Preset "${name}" could not be deleted.`)',
  'if (previousRating === undefined) delete next[name]',
]) {
  if (!familyTreeSource.includes(token)) {
    throw new Error(`PresetFamilyTree must keep failed mutations visible and roll back optimistic state: ${token}`);
  }
}

const repositorySource = fs.readFileSync(source('src/presets/usePresets.ts'), 'utf8');
for (const token of [
  'updateMetadata: (name: string, meta: PresetMetadataPatch) => Promise<boolean>',
  'if (!targetName) return null',
  'return false',
  'throw error',
]) {
  if (!repositorySource.includes(token)) {
    throw new Error(`usePresets must enforce duplicate cancellation and propagate metadata outcomes: ${token}`);
  }
}

console.log('preset manager query ownership passed');
