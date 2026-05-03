import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const webState = read('src/ui/state.ts');
const dynamicsModel = read('src/audio/dynamicsModel.ts');
const dynamicsPage = read('src/ui/dynamics/DynamicsPage.tsx');
const dynamicsPresets = read('src/ui/dynamics/dynamicsPresets.ts');
const sliderHelp = read('src/ui/sliderHelpCatalog.ts');
const paramRegistry = read('src/presets/ParamRegistry.ts');

for (const [label, source] of [
  ['web SliderState/default/quantization', webState],
  ['web dynamics model', dynamicsModel],
  ['web dynamics page', dynamicsPage],
  ['web dynamics presets', dynamicsPresets],
  ['web slider help', sliderHelp],
  ['web param registry', paramRegistry],
]) {
  assert(source.includes('degradeWobbleSpeed'), `${label} must include degradeWobbleSpeed`);
}

const iosState = read('KesshoiOS/Kessho/State/SliderState.swift');
const iosAppState = read('KesshoiOS/Kessho/State/AppState.swift');
const iosControls = read('KesshoiOS/Kessho/Views/SliderControlsView.swift');
const iosDynamics = read('KesshoiOS/Kessho/Audio/DynamicsCharacterProcessor.swift');

for (const [label, source] of [
  ['iOS SliderState', iosState],
  ['iOS AppState morph interpolation', iosAppState],
  ['iOS controls', iosControls],
  ['iOS dynamics model', iosDynamics],
]) {
  assert(source.includes('degradeWobbleSpeed'), `${label} must include degradeWobbleSpeed`);
}

assert(
  iosControls.includes('label: "Wobble Speed"') && iosControls.includes('$appState.state.degradeWobbleSpeed'),
  'iOS controls must expose the Degrade Wobble Speed slider'
);

const worklet = read('public/worklets/dynamics-character.worklet.js');
const workletOrderMatch = worklet.match(/const PARAM_ORDER = \[([\s\S]*?)\];/);
assert(workletOrderMatch, 'Could not find dynamics worklet PARAM_ORDER');
const workletParamCount = [...workletOrderMatch[1].matchAll(/'([^']+)'/g)].length;

const header = read('wasm/dynamics-character/kessho_dynamics_character.h');
const headerCountMatch = header.match(/KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT\s+(\d+)/);
assert(headerCountMatch, 'Could not find dynamics C++ param count');
const headerParamCount = Number(headerCountMatch[1]);

const swiftCountMatch = iosDynamics.match(/private static let paramCount = (\d+)/);
assert(swiftCountMatch, 'Could not find iOS dynamics param count');
const swiftParamCount = Number(swiftCountMatch[1]);

assert(
  workletParamCount === headerParamCount && headerParamCount === swiftParamCount,
  `Dynamics param counts must match across worklet/header/iOS (${workletParamCount}/${headerParamCount}/${swiftParamCount})`
);

const cpp = read('wasm/dynamics-character/kessho_dynamics_character.cpp');
assert(
  cpp.includes('wow_wander') &&
    cpp.includes('wow_wander_slow') &&
    cpp.includes('tape_wow_blend'),
  'Shared dynamics C++ core must keep the tape-wander path'
);

const iosNativeBridge = read('KesshoiOS/NativeDSP/kessho_dynamics_character_unified.cpp');
assert(
  iosNativeBridge.includes('../../wasm/dynamics-character/kessho_dynamics_character.cpp'),
  'iOS native dynamics bridge must include the shared web/WASM C++ core'
);

console.log('Dynamics web/iOS parity checks passed');
