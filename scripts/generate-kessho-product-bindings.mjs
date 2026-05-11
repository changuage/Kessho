import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { transform } from 'esbuild';

const root = process.cwd();
const schemaDir = resolve(root, 'cpp/KesshoCore/schema');
const schemaPath = resolve(schemaDir, 'kessho_product.schema.json');
const paramsPath = resolve(schemaDir, 'kessho_product_params.schema.json');
const eventsPath = resolve(schemaDir, 'kessho_product_events.schema.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function writeGenerated(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function upperSnake(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function cppStringArray(name, values) {
  return `inline constexpr const char* ${name}[] = {\n${values.map((value) => `  "${value}"`).join(',\n')}\n};`;
}

function tsConstObject(name, rows, key = 'name') {
  return `export const ${name} = Object.freeze({\n${rows.map((row) => `  ${row[key]}: ${row.id}`).join(',\n')}\n} as const);\n`;
}

function numberLiteral(value, fallback) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Number.isInteger(numeric) ? `${numeric}.0` : String(numeric);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

const padParamCount = 53;
const leadParamCount = 80;
const drumParamCount = 126;
const padOutputTrim = 0.5;
const leadOutputTrim = 0.59;
const reverbOutputTrim = 2.0;
const padWaveValues = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };
const padFilterValues = { lowpass: 0, bandpass: 1, highpass: 2, notch: 3 };
const padLfoWaveValues = {
  sine: 0,
  triangle: 1,
  sawtooth: 2,
  square: 3,
  sampleHold: 4,
  randomSmooth: 5,
  randomWalk: 6,
};
const padDestValues = {
  none: 0,
  filterCutoff: 1,
  filterB: 2,
  filterBCutoff: 2,
  amplitude: 3,
  pitch: 4,
  oscBLevel: 5,
  foldAmount: 6,
};
const padRouteValues = { series: 0, aOnly: 1, bOnly: 2 };
const padNoiseValues = { white: 0, pink: 1 };
const padParamSpecs = [
  ['padOscAWave', 0, padWaveValues, 2],
  ['padOscAOctave', 1, null, 0],
  ['padOscADetune', 2, null, 0],
  ['padOscALevel', 3, null, 0.6],
  ['padOscBWave', 4, padWaveValues, 1],
  ['padOscBOctave', 5, null, 0],
  ['padOscBDetune', 6, null, 8],
  ['padOscBLevel', 7, null, 0.4],
  ['padOscMix', 8, null, 0.5],
  ['padSubEnabled', 9, null, 0],
  ['padSubOctave', 10, null, -1],
  ['padSubWave', 11, padWaveValues, 0],
  ['padSubLevel', 12, null, 0.3],
  ['padNoiseType', 13, padNoiseValues, 0],
  ['padNoiseLevel', 14, null, 0.16],
  ['hardness', 15, null, 0.45],
  ['warmth', 16, null, 0.4],
  ['presence', 17, null, 0.4],
  ['padFoldAmount', 18, null, 0],
  ['padFoldMode', 19, null, 0],
  ['filterType', 20, padFilterValues, 0],
  ['filterCutoffMin', 21, null, 80],
  ['filterCutoffMax', 22, null, 1800],
  ['filterResonance', 23, null, 0.2],
  ['filterQ', 24, null, 1],
  ['filterSlope', 25, null, 12],
  ['filterKeyTracking', 26, null, 0],
  ['padFilterBEnabled', 27, null, 0],
  ['padFilterBType', 28, padFilterValues, 2],
  ['padFilterBCutoff', 29, null, 200],
  ['padFilterBResonance', 30, null, 0.2],
  ['padFilterBQ', 31, null, 1],
  ['padFilterRouting', 32, padRouteValues, 0],
  ['synthAttack', 33, null, 4],
  ['synthDecay', 34, null, 1],
  ['synthSustain', 35, null, 0.8],
  ['synthRelease', 36, null, 10],
  ['padLfo1Rate', 37, null, 0.09],
  ['padLfo1Depth', 38, null, 0.6],
  ['padLfo1Wave', 39, padLfoWaveValues, 6],
  ['padLfo1Dest', 40, padDestValues, 1],
  ['padLfo2Rate', 41, null, 0.5],
  ['padLfo2Depth', 42, null, 0],
  ['padLfo2Wave', 43, padLfoWaveValues, 0],
  ['padLfo2Dest', 44, padDestValues, 0],
  ['padModEnvEnabled', 45, null, 0],
  ['padModEnvAttack', 46, null, 0.5],
  ['padModEnvDecay', 47, null, 2],
  ['padModEnvSustain', 48, null, 0],
  ['padModEnvRelease', 49, null, 4],
  ['padModEnvDepth', 50, null, 0.5],
  ['padModEnvDest', 51, padDestValues, 1],
];
const leadAlgorithmValues = { parallel: 0, stack: 1, split: 2, cross: 3, dx17: 4 };
const leadFilterValues = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3, peaking: 4 };
const leadTransientValues = { white: 0, pink: 1, brown: 2, filtered: 3 };
const leadLfoTargetValues = {
  all: 0,
  mod1: 1,
  mod2: 2,
  mod3: 3,
  mod4: 4,
  filter: 5,
  pitch: 6,
  detune: 7,
  none: 8,
};
const leadParamSpecs = [
  ['algorithm', 0, leadAlgorithmValues, 0],
  ['beatDetune', 1, null, 0],
  ['carrier2Mix', 2, null, 0],
  ['mod1Ratio', 3, null, 1],
  ['mod1Index', 4, null, 0],
  ['mod1Decay', 5, null, 0.8],
  ['mod1Sustain', 6, null, 0.1],
  ['mod1Level', 7, null, 1],
  ['mod1Feedback', 8, null, 0],
  ['mod1Detune', 9, null, 0],
  ['mod1EnvRate', 10, null, 1],
  ['mod1ModAttack', 11, null, 0],
  ['mod1ModDelay', 12, null, 0],
  ['mod2Ratio', 13, null, 1],
  ['mod2Index', 14, null, 0],
  ['mod2Decay', 15, null, 0.8],
  ['mod2Sustain', 16, null, 0.1],
  ['mod2Level', 17, null, 1],
  ['mod2Feedback', 18, null, 0],
  ['mod2Detune', 19, null, 0],
  ['mod2EnvRate', 20, null, 1],
  ['mod2ModAttack', 21, null, 0],
  ['mod2ModDelay', 22, null, 0],
  ['mod3Ratio', 23, null, 1],
  ['mod3Index', 24, null, 0],
  ['mod3Decay', 25, null, 0.8],
  ['mod3Sustain', 26, null, 0.1],
  ['mod3Level', 27, null, 1],
  ['mod3Feedback', 28, null, 0],
  ['mod3Detune', 29, null, 0],
  ['mod3EnvRate', 30, null, 1],
  ['mod3ModAttack', 31, null, 0],
  ['mod3ModDelay', 32, null, 0],
  ['mod4Ratio', 33, null, 1],
  ['mod4Index', 34, null, 0],
  ['mod4Decay', 35, null, 0.8],
  ['mod4Sustain', 36, null, 0.1],
  ['mod4Level', 37, null, 1],
  ['mod4Feedback', 38, null, 0],
  ['mod4Detune', 39, null, 0],
  ['mod4EnvRate', 40, null, 1],
  ['mod4ModAttack', 41, null, 0],
  ['mod4ModDelay', 42, null, 0],
  ['attack', 43, null, 0.01],
  ['decay', 44, null, 0.8],
  ['sustain', 45, null, 0.3],
  ['release', 46, null, 2],
  ['filterFreq', 47, null, 4000],
  ['filterQ', 48, null, 0.7],
  ['filterType', 49, leadFilterValues, 0],
  ['filterEnvAttack', 50, null, 0],
  ['filterEnvDecay', 51, null, 0],
  ['filterEnvSustain', 52, null, 1],
  ['filterEnvRelease', 53, null, 0],
  ['filterEnvDepth', 54, null, 0],
  ['drive', 55, null, 0],
  ['transientClick', 56, null, 0],
  ['transientNoise', 57, null, 0],
  ['transientDuration', 58, null, 20],
  ['transientDecay', 59, null, 50],
  ['transientFilter', 60, null, 4000],
  ['transientType', 61, leadTransientValues, 0],
  ['gain', 62, null, 0.34],
  ['xLevel', 63, null, 1],
  ['xPan', 64, null, -0.2],
  ['yLevel', 65, null, 0.9],
  ['yPan', 66, null, 0.2],
  ['lfoRate', 67, null, 0],
  ['lfoDepth', 68, null, 0],
  ['lfoTarget', 69, leadLfoTargetValues, 0],
  ['unisonVoices', 70, null, 1],
  ['unisonDetune', 71, null, 0],
  ['delayEnabled', 72, null, 0],
  ['delayTimeL', 73, null, 0],
  ['delayTimeR', 74, null, 0],
  ['delayFeedback', 75, null, 0.4],
  ['delayFilter', 76, null, 4000],
  ['delayMix', 77, null, 0.3],
  ['delaySend', 78, null, 0.3],
  ['outputSelect', 79, null, 0],
];

const drumClickModeValues = { impulse: 0, noise: 1, tonal: 2, granular: 3, continuous: 4 };
const drumNoiseFilterValues = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3 };
const drumMembraneMaterialValues = { skin: 0, metal: 1, wood: 2, glass: 3, plastic: 4 };
const drumParamIndex = {
  sub: 0,
  kick: 12,
  click: 25,
  beepHi: 40,
  beepLo: 59,
  noise: 78,
  membrane: 92,
  delay: 104,
  delaySends: 110,
  trigger: 117,
  masterLevel: 122,
  reverbSend: 123,
  seed: 124,
  outputSelect: 125,
};
const drumDefaultParams = Array.from({ length: drumParamCount }, () => 0);
for (const [index, value] of [
  [drumParamIndex.sub + 0, 60],
  [drumParamIndex.sub + 1, 200],
  [drumParamIndex.sub + 2, 0.8],
  [drumParamIndex.sub + 3, 0],
  [drumParamIndex.sub + 4, 0],
  [drumParamIndex.sub + 5, 0],
  [drumParamIndex.sub + 6, 50],
  [drumParamIndex.sub + 7, 0],
  [drumParamIndex.sub + 8, 0],
  [drumParamIndex.sub + 9, 0],
  [drumParamIndex.sub + 10, 0],
  [drumParamIndex.sub + 11, 0.5],
  [drumParamIndex.kick + 0, 55],
  [drumParamIndex.kick + 1, 24],
  [drumParamIndex.kick + 2, 60],
  [drumParamIndex.kick + 3, 300],
  [drumParamIndex.kick + 4, 0.8],
  [drumParamIndex.kick + 5, 0.3],
  [drumParamIndex.kick + 6, 0.5],
  [drumParamIndex.kick + 7, 0.5],
  [drumParamIndex.kick + 8, 0],
  [drumParamIndex.kick + 9, 0],
  [drumParamIndex.kick + 10, 0],
  [drumParamIndex.kick + 11, 0],
  [drumParamIndex.kick + 12, 0.5],
  [drumParamIndex.click + 0, 30],
  [drumParamIndex.click + 1, 4000],
  [drumParamIndex.click + 2, 0.5],
  [drumParamIndex.click + 3, 0.7],
  [drumParamIndex.click + 4, 0.5],
  [drumParamIndex.click + 5, 2000],
  [drumParamIndex.click + 6, 0],
  [drumParamIndex.click + 7, 0],
  [drumParamIndex.click + 8, 1],
  [drumParamIndex.click + 9, 0],
  [drumParamIndex.click + 10, 0],
  [drumParamIndex.click + 11, 0],
  [drumParamIndex.click + 12, 0],
  [drumParamIndex.click + 13, 0],
  [drumParamIndex.click + 14, 0.5],
  [drumParamIndex.beepHi + 0, 4000],
  [drumParamIndex.beepHi + 1, 1],
  [drumParamIndex.beepHi + 2, 100],
  [drumParamIndex.beepHi + 3, 0.6],
  [drumParamIndex.beepHi + 4, 0.3],
  [drumParamIndex.beepHi + 5, 0],
  [drumParamIndex.beepHi + 6, 1],
  [drumParamIndex.beepHi + 7, 0],
  [drumParamIndex.beepHi + 8, 4],
  [drumParamIndex.beepHi + 9, 0.5],
  [drumParamIndex.beepHi + 10, 0],
  [drumParamIndex.beepHi + 11, 0],
  [drumParamIndex.beepHi + 12, 0],
  [drumParamIndex.beepHi + 13, 2],
  [drumParamIndex.beepHi + 14, 0.01],
  [drumParamIndex.beepHi + 15, 0.2],
  [drumParamIndex.beepHi + 16, 0],
  [drumParamIndex.beepHi + 17, 0],
  [drumParamIndex.beepHi + 18, 0.5],
  [drumParamIndex.beepLo + 0, 200],
  [drumParamIndex.beepLo + 1, 1],
  [drumParamIndex.beepLo + 2, 200],
  [drumParamIndex.beepLo + 3, 0.7],
  [drumParamIndex.beepLo + 4, 0],
  [drumParamIndex.beepLo + 5, 0],
  [drumParamIndex.beepLo + 6, 50],
  [drumParamIndex.beepLo + 7, 0.3],
  [drumParamIndex.beepLo + 8, 0],
  [drumParamIndex.beepLo + 9, 0.5],
  [drumParamIndex.beepLo + 10, 0],
  [drumParamIndex.beepLo + 11, 10],
  [drumParamIndex.beepLo + 12, 0],
  [drumParamIndex.beepLo + 13, 0],
  [drumParamIndex.beepLo + 14, 0],
  [drumParamIndex.beepLo + 15, 1],
  [drumParamIndex.beepLo + 16, 1],
  [drumParamIndex.beepLo + 17, 0],
  [drumParamIndex.beepLo + 18, 0.5],
  [drumParamIndex.noise + 0, 2000],
  [drumParamIndex.noise + 1, 100],
  [drumParamIndex.noise + 2, 0.6],
  [drumParamIndex.noise + 3, 1],
  [drumParamIndex.noise + 4, 0],
  [drumParamIndex.noise + 5, 1],
  [drumParamIndex.noise + 6, 0],
  [drumParamIndex.noise + 7, 0],
  [drumParamIndex.noise + 8, 0],
  [drumParamIndex.noise + 9, 100],
  [drumParamIndex.noise + 10, 1],
  [drumParamIndex.noise + 11, 0],
  [drumParamIndex.noise + 12, 0],
  [drumParamIndex.noise + 13, 0.5],
  [drumParamIndex.membrane + 0, 150],
  [drumParamIndex.membrane + 1, 500],
  [drumParamIndex.membrane + 2, 0.7],
  [drumParamIndex.membrane + 3, 0.5],
  [drumParamIndex.membrane + 4, 0],
  [drumParamIndex.membrane + 5, 150],
  [drumParamIndex.membrane + 6, 0.3],
  [drumParamIndex.membrane + 7, 0.5],
  [drumParamIndex.membrane + 8, 0],
  [drumParamIndex.membrane + 9, 1],
  [drumParamIndex.membrane + 10, 0],
  [drumParamIndex.membrane + 11, 0.5],
  [drumParamIndex.delay + 0, 0],
  [drumParamIndex.delay + 1, 0],
  [drumParamIndex.delay + 2, 0],
  [drumParamIndex.delay + 3, 0.4],
  [drumParamIndex.delay + 4, 4000],
  [drumParamIndex.delay + 5, 0.3],
  [drumParamIndex.trigger + 0, -1],
  [drumParamIndex.trigger + 1, -1],
  [drumParamIndex.trigger + 2, 0],
  [drumParamIndex.trigger + 3, 1e10],
  [drumParamIndex.trigger + 4, 1e10],
  [drumParamIndex.masterLevel, 0.8],
  [drumParamIndex.reverbSend, 0.1],
  [drumParamIndex.seed, 42],
  [drumParamIndex.outputSelect, 0],
]) {
  drumDefaultParams[index] = value;
}
const drumParamSpecs = [
  ['drumSubFreq', drumParamIndex.sub + 0, null, 60],
  ['drumSubDecay', drumParamIndex.sub + 1, null, 200],
  ['drumSubLevel', drumParamIndex.sub + 2, null, 0.8],
  ['drumSubTone', drumParamIndex.sub + 3, null, 0],
  ['drumSubShape', drumParamIndex.sub + 4, null, 0],
  ['drumSubPitchEnv', drumParamIndex.sub + 5, null, 0],
  ['drumSubPitchDecay', drumParamIndex.sub + 6, null, 50],
  ['drumSubDrive', drumParamIndex.sub + 7, null, 0],
  ['drumSubSub', drumParamIndex.sub + 8, null, 0],
  ['drumSubAttack', drumParamIndex.sub + 9, null, 0],
  ['drumSubVariation', drumParamIndex.sub + 10, null, 0],
  ['drumSubDistance', drumParamIndex.sub + 11, null, 0.5],
  ['drumKickFreq', drumParamIndex.kick + 0, null, 55],
  ['drumKickPitchEnv', drumParamIndex.kick + 1, null, 24],
  ['drumKickPitchDecay', drumParamIndex.kick + 2, null, 60],
  ['drumKickDecay', drumParamIndex.kick + 3, null, 300],
  ['drumKickLevel', drumParamIndex.kick + 4, null, 0.8],
  ['drumKickClick', drumParamIndex.kick + 5, null, 0.3],
  ['drumKickBody', drumParamIndex.kick + 6, null, 0.5],
  ['drumKickPunch', drumParamIndex.kick + 7, null, 0.5],
  ['drumKickTail', drumParamIndex.kick + 8, null, 0],
  ['drumKickTone', drumParamIndex.kick + 9, null, 0],
  ['drumKickAttack', drumParamIndex.kick + 10, null, 0],
  ['drumKickVariation', drumParamIndex.kick + 11, null, 0],
  ['drumKickDistance', drumParamIndex.kick + 12, null, 0.5],
  ['drumClickDecay', drumParamIndex.click + 0, null, 30],
  ['drumClickFilter', drumParamIndex.click + 1, null, 4000],
  ['drumClickTone', drumParamIndex.click + 2, null, 0.5],
  ['drumClickLevel', drumParamIndex.click + 3, null, 0.7],
  ['drumClickResonance', drumParamIndex.click + 4, null, 0.5],
  ['drumClickPitch', drumParamIndex.click + 5, null, 2000],
  ['drumClickPitchEnv', drumParamIndex.click + 6, null, 0],
  ['drumClickMode', drumParamIndex.click + 7, drumClickModeValues, 0],
  ['drumClickGrainCount', drumParamIndex.click + 8, null, 1],
  ['drumClickGrainSpread', drumParamIndex.click + 9, null, 0],
  ['drumClickStereoWidth', drumParamIndex.click + 10, null, 0],
  ['drumClickExciterColor', drumParamIndex.click + 11, null, 0],
  ['drumClickAttack', drumParamIndex.click + 12, null, 0],
  ['drumClickVariation', drumParamIndex.click + 13, null, 0],
  ['drumClickDistance', drumParamIndex.click + 14, null, 0.5],
  ['drumBeepHiFreq', drumParamIndex.beepHi + 0, null, 4000],
  ['drumBeepHiAttack', drumParamIndex.beepHi + 1, null, 1],
  ['drumBeepHiDecay', drumParamIndex.beepHi + 2, null, 100],
  ['drumBeepHiLevel', drumParamIndex.beepHi + 3, null, 0.6],
  ['drumBeepHiTone', drumParamIndex.beepHi + 4, null, 0.3],
  ['drumBeepHiInharmonic', drumParamIndex.beepHi + 5, null, 0],
  ['drumBeepHiPartials', drumParamIndex.beepHi + 6, null, 1],
  ['drumBeepHiShimmer', drumParamIndex.beepHi + 7, null, 0],
  ['drumBeepHiShimmerRate', drumParamIndex.beepHi + 8, null, 4],
  ['drumBeepHiBrightness', drumParamIndex.beepHi + 9, null, 0.5],
  ['drumBeepHiFeedback', drumParamIndex.beepHi + 10, null, 0],
  ['drumBeepHiModEnvDecay', drumParamIndex.beepHi + 11, null, 0],
  ['drumBeepHiNoiseInMod', drumParamIndex.beepHi + 12, null, 0],
  ['drumBeepHiModRatio', drumParamIndex.beepHi + 13, null, 2],
  ['drumBeepHiModRatioFine', drumParamIndex.beepHi + 14, null, 0.01],
  ['drumBeepHiModEnvEnd', drumParamIndex.beepHi + 15, null, 0.2],
  ['drumBeepHiNoiseDecay', drumParamIndex.beepHi + 16, null, 0],
  ['drumBeepHiVariation', drumParamIndex.beepHi + 17, null, 0],
  ['drumBeepHiDistance', drumParamIndex.beepHi + 18, null, 0.5],
  ['drumBeepLoFreq', drumParamIndex.beepLo + 0, null, 200],
  ['drumBeepLoAttack', drumParamIndex.beepLo + 1, null, 1],
  ['drumBeepLoDecay', drumParamIndex.beepLo + 2, null, 200],
  ['drumBeepLoLevel', drumParamIndex.beepLo + 3, null, 0.7],
  ['drumBeepLoTone', drumParamIndex.beepLo + 4, null, 0],
  ['drumBeepLoPitchEnv', drumParamIndex.beepLo + 5, null, 0],
  ['drumBeepLoPitchDecay', drumParamIndex.beepLo + 6, null, 50],
  ['drumBeepLoBody', drumParamIndex.beepLo + 7, null, 0.3],
  ['drumBeepLoPluck', drumParamIndex.beepLo + 8, null, 0],
  ['drumBeepLoPluckDamp', drumParamIndex.beepLo + 9, null, 0.5],
  ['drumBeepLoModal', drumParamIndex.beepLo + 10, null, 0],
  ['drumBeepLoModalQ', drumParamIndex.beepLo + 11, null, 10],
  ['drumBeepLoModalInharmonic', drumParamIndex.beepLo + 12, null, 0],
  ['drumBeepLoModalSpread', drumParamIndex.beepLo + 13, null, 0],
  ['drumBeepLoModalCut', drumParamIndex.beepLo + 14, null, 0],
  ['drumBeepLoOscGain', drumParamIndex.beepLo + 15, null, 1],
  ['drumBeepLoModalGain', drumParamIndex.beepLo + 16, null, 1],
  ['drumBeepLoVariation', drumParamIndex.beepLo + 17, null, 0],
  ['drumBeepLoDistance', drumParamIndex.beepLo + 18, null, 0.5],
  ['drumNoiseFilterFreq', drumParamIndex.noise + 0, null, 2000],
  ['drumNoiseDecay', drumParamIndex.noise + 1, null, 100],
  ['drumNoiseLevel', drumParamIndex.noise + 2, null, 0.6],
  ['drumNoiseFilterQ', drumParamIndex.noise + 3, null, 1],
  ['drumNoiseFilterType', drumParamIndex.noise + 4, drumNoiseFilterValues, 0],
  ['drumNoiseAttack', drumParamIndex.noise + 5, null, 1],
  ['drumNoiseFormant', drumParamIndex.noise + 6, null, 0],
  ['drumNoiseBreath', drumParamIndex.noise + 7, null, 0],
  ['drumNoiseFilterEnv', drumParamIndex.noise + 8, null, 0],
  ['drumNoiseFilterEnvDecay', drumParamIndex.noise + 9, null, 100],
  ['drumNoiseDensity', drumParamIndex.noise + 10, null, 1],
  ['drumNoiseColorLFO', drumParamIndex.noise + 11, null, 0],
  ['drumNoiseVariation', drumParamIndex.noise + 12, null, 0],
  ['drumNoiseDistance', drumParamIndex.noise + 13, null, 0.5],
  ['drumMembraneSize', drumParamIndex.membrane + 0, null, 150],
  ['drumMembraneDecay', drumParamIndex.membrane + 1, null, 500],
  ['drumMembraneLevel', drumParamIndex.membrane + 2, null, 0.7],
  ['drumMembraneStiffness', drumParamIndex.membrane + 3, null, 0.5],
  ['drumMembraneMaterial', drumParamIndex.membrane + 4, drumMembraneMaterialValues, 0],
  ['drumMembraneSize', drumParamIndex.membrane + 5, null, 150],
  ['drumMembraneDamping', drumParamIndex.membrane + 6, null, 0.3],
  ['drumMembraneExcPos', drumParamIndex.membrane + 7, null, 0.5],
  ['drumMembraneWireMix', drumParamIndex.membrane + 8, null, 0],
  ['drumMembraneAttack', drumParamIndex.membrane + 9, null, 1],
  ['drumMembraneVariation', drumParamIndex.membrane + 10, null, 0],
  ['drumMembraneDistance', drumParamIndex.membrane + 11, null, 0.5],
];
const drumVoiceParamRanges = {
  sub: [drumParamIndex.sub, 12],
  kick: [drumParamIndex.kick, 13],
  click: [drumParamIndex.click, 15],
  beepHi: [drumParamIndex.beepHi, 19],
  beepLo: [drumParamIndex.beepLo, 19],
  noise: [drumParamIndex.noise, 14],
  membrane: [drumParamIndex.membrane, 12],
};
const drumVoicePresetExportNames = {
  sub: 'SUB_PRESETS',
  kick: 'KICK_PRESETS',
  click: 'CLICK_PRESETS',
  beepHi: 'BEEP_HI_PRESETS',
  beepLo: 'BEEP_LO_PRESETS',
  noise: 'NOISE_PRESETS',
  membrane: 'MEMBRANE_PRESETS',
};

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function padParamValue(value, map, fallback) {
  if (typeof value === 'string' && map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return finiteNumber(value, fallback);
}

const defaultLeadPresets = {
  soft_rhodes: {
    algorithm: 'parallel',
    xy: { xLevel: 1, xPan: -0.2, yLevel: 0.9, yPan: 0.2 },
    params: {
      beatDetune: 0,
      carrier2Mix: 0,
      mod1: { ratio: 1, index: 0.25, decay: 0.8, sustain: 0.23 },
      mod2: { ratio: 2, index: 0.08, decay: 0.72 },
      mod3: { ratio: 3, index: 0, decay: 0.3 },
      mod4: { ratio: 0.5, index: 0, decay: 0.3 },
      envelope: { attack: 0.01, decay: 0.8, sustain: 0.3, release: 2 },
      filter: { freq: 4000, q: 0.7 },
      transient: { click: 0.08, noise: 0.02, duration: 12, decay: 130, filter: 4200, type: 'filtered' },
      gain: 0.34,
    },
  },
  gamelan: {
    algorithm: 'cross',
    xy: { xLevel: 0.95, xPan: -0.35, yLevel: 1.05, yPan: 0.35 },
    params: {
      beatDetune: 25,
      carrier2Mix: 0.65,
      mod1: { ratio: 2.4, index: 2, decay: 0.45, sustain: 0.08 },
      mod2: { ratio: 4, index: 0.8, decay: 0.35 },
      mod3: { ratio: 5.5, index: 0.5, decay: 0.2 },
      mod4: { ratio: 0.65, index: 0.3, decay: 0.6 },
      envelope: { attack: 0.002, decay: 0.35, sustain: 0.3, release: 6 },
      filter: { freq: 7000, q: 1 },
      transient: { click: 0.5, noise: 0.15, duration: 25, decay: 80, filter: 5000, type: 'filtered' },
      gain: 0.7,
    },
  },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function morphedLeadParams(presetA, presetB, t, algorithmMode = 'snap') {
  const a = presetA.params;
  const b = presetB.params;
  const op = (key, fallback) => lerp(a[key]?.[fallback.key] ?? fallback.value, b[key]?.[fallback.key] ?? fallback.value, t);
  const algorithm = algorithmMode === 'presetA' ? presetA.algorithm : t < 0.5 ? presetA.algorithm : presetB.algorithm;
  const transientType = t < 0.5 ? (a.transient?.type ?? 'white') : (b.transient?.type ?? 'white');
  const lfoTarget = t < 0.5 ? (a.lfo?.target ?? 'all') : (b.lfo?.target ?? 'all');
  const params = {
    algorithm,
    beatDetune: lerp(a.beatDetune, b.beatDetune, t),
    carrier2Mix: lerp(a.carrier2Mix, b.carrier2Mix, t),
    attack: lerp(a.envelope.attack, b.envelope.attack, t),
    decay: lerp(a.envelope.decay, b.envelope.decay, t),
    sustain: lerp(a.envelope.sustain, b.envelope.sustain, t),
    release: lerp(a.envelope.release, b.envelope.release, t),
    filterFreq: lerp(a.filter.freq, b.filter.freq, t),
    filterQ: lerp(a.filter.q, b.filter.q, t),
    filterType: t < 0.5 ? (a.filter.type ?? 'lowpass') : (b.filter.type ?? 'lowpass'),
    filterEnvAttack: lerp(a.filter.envAttack ?? 0, b.filter.envAttack ?? 0, t),
    filterEnvDecay: lerp(a.filter.envDecay ?? 0, b.filter.envDecay ?? 0, t),
    filterEnvSustain: lerp(a.filter.envSustain ?? 1, b.filter.envSustain ?? 1, t),
    filterEnvRelease: lerp(a.filter.envRelease ?? 0, b.filter.envRelease ?? 0, t),
    filterEnvDepth: lerp(a.filter.envDepth ?? 0, b.filter.envDepth ?? 0, t),
    drive: lerp(a.drive ?? 0, b.drive ?? 0, t),
    transientClick: lerp(a.transient?.click ?? 0, b.transient?.click ?? 0, t),
    transientNoise: lerp(a.transient?.noise ?? 0, b.transient?.noise ?? 0, t),
    transientDuration: lerp(a.transient?.duration ?? 20, b.transient?.duration ?? 20, t),
    transientDecay: lerp(a.transient?.decay ?? 50, b.transient?.decay ?? 50, t),
    transientFilter: lerp(a.transient?.filter ?? 4000, b.transient?.filter ?? 4000, t),
    transientType,
    gain: lerp(a.gain, b.gain, t),
    xLevel: lerp(presetA.xy.xLevel, presetB.xy.xLevel, t),
    xPan: lerp(presetA.xy.xPan, presetB.xy.xPan, t),
    yLevel: lerp(presetA.xy.yLevel, presetB.xy.yLevel, t),
    yPan: lerp(presetA.xy.yPan, presetB.xy.yPan, t),
    lfoRate: lerp(a.lfo?.rate ?? 0, b.lfo?.rate ?? 0, t),
    lfoDepth: lerp(a.lfo?.depth ?? 0, b.lfo?.depth ?? 0, t),
    lfoTarget,
    unisonVoices: Math.round(lerp(a.unisonVoices ?? 1, b.unisonVoices ?? 1, t)),
    unisonDetune: lerp(a.unisonDetune ?? 0, b.unisonDetune ?? 0, t),
    delayEnabled: 0,
    delayTimeL: 0,
    delayTimeR: 0,
    delayFeedback: 0.4,
    delayFilter: 4000,
    delayMix: 0.3,
    delaySend: 0.3,
    outputSelect: 0,
  };
  for (const [name, fallback] of [
    ['mod1', { key: 'sustain', value: 0.1 }],
    ['mod2', { key: 'sustain', value: 0.05 }],
    ['mod3', { key: 'sustain', value: 0.02 }],
    ['mod4', { key: 'sustain', value: 0.1 }],
  ]) {
    const prefix = name;
    params[`${prefix}Ratio`] = op(name, { key: 'ratio', value: 1 });
    params[`${prefix}Index`] = op(name, { key: 'index', value: 0 });
    params[`${prefix}Decay`] = op(name, { key: 'decay', value: 0.8 });
    params[`${prefix}Sustain`] = op(name, fallback);
    params[`${prefix}Level`] = op(name, { key: 'level', value: 1 });
    params[`${prefix}Feedback`] = op(name, { key: 'feedback', value: 0 });
    params[`${prefix}Detune`] = op(name, { key: 'detune', value: 0 });
    params[`${prefix}EnvRate`] = op(name, { key: 'envRate', value: 1 });
    params[`${prefix}ModAttack`] = op(name, { key: 'modAttack', value: 0 });
    params[`${prefix}ModDelay`] = op(name, { key: 'modDelay', value: 0 });
  }
  return params;
}

function leadParamValue(value, map, fallback) {
  if (typeof value === 'string' && map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return finiteNumber(value, fallback);
}

async function loadPadPresetModule() {
  const source = readFileSync(resolve(root, 'src/audio/padPresets.ts'), 'utf8');
  const output = await transform(source, {
    loader: 'ts',
    format: 'esm',
    platform: 'node',
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`);
}

async function loadDrumPresetModule() {
  const source = readFileSync(resolve(root, 'src/audio/drumPresets.ts'), 'utf8');
  const output = await transform(source, {
    loader: 'ts',
    format: 'esm',
    platform: 'node',
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`);
}

function exactPadParamsForPreset(preset, padPresetModule) {
  const exactPadParams = Array.from({ length: padParamCount }, () => 0);
  if (preset.source !== 'pad') {
    return { exactPadParamCount: 0, exactPadParams };
  }

  const padPreset = padPresetModule.getPadPreset(preset.key);
  if (!padPreset) {
    throw new Error(`Missing factory pad preset for product preset ${preset.name} (${preset.key})`);
  }

  for (const [key, index, map, fallback] of padParamSpecs) {
    exactPadParams[index] = padParamValue(padPreset.params[key], map, fallback);
  }
  exactPadParams[52] = padOutputTrim;
  return { exactPadParamCount: padParamCount, exactPadParams };
}

function exactLeadParamsForPreset(preset) {
  const exactLeadParams = Array.from({ length: leadParamCount }, () => 0);
  if (preset.source !== 'lead') {
    return { exactLeadParamCount: 0, exactLeadParams };
  }

  const leadPreset = defaultLeadPresets[preset.key] ?? defaultLeadPresets.soft_rhodes;
  const morphed = morphedLeadParams(leadPreset, leadPreset, 0);
  for (const [key, index, map, fallback] of leadParamSpecs) {
    exactLeadParams[index] = leadParamValue(morphed[key], map, fallback);
  }
  return { exactLeadParamCount: leadParamCount, exactLeadParams };
}

function exactDrumParamsForPreset(preset) {
  if (preset.source !== 'drum') {
    const exactDrumParams = Array.from({ length: drumParamCount }, () => 0);
    return { exactDrumParamCount: 0, exactDrumParams };
  }

  const exactDrumParams = [...drumDefaultParams];
  for (const [key, index, map, fallback] of drumParamSpecs) {
    exactDrumParams[index] = padParamValue(preset.params?.[key], map, fallback);
  }
  return { exactDrumParamCount: drumParamCount, exactDrumParams };
}

function drumVoicePresetParams(preset) {
  const exactDrumParams = [...drumDefaultParams];
  for (const [key, index, map, fallback] of drumParamSpecs) {
    if (Object.prototype.hasOwnProperty.call(preset.params ?? {}, key)) {
      exactDrumParams[index] = padParamValue(preset.params[key], map, fallback);
    }
  }
  return exactDrumParams;
}

function makeDrumVoicePresetRows(drumVoiceIds, drumPresetModule) {
  const rows = [];
  for (const voice of drumVoiceIds) {
    const exportName = drumVoicePresetExportNames[voice.name];
    const presets = drumPresetModule[exportName];
    if (!Array.isArray(presets) || presets.length === 0) {
      throw new Error(`Missing factory drum presets for ${voice.name}`);
    }
    const [paramStart, paramCount] = drumVoiceParamRanges[voice.name] ?? [0, 0];
    presets.forEach((preset, index) => {
      rows.push({
        id: 3100 + (voice.id - 1) * 100 + index + 1,
        name: preset.name,
        voice: voice.name,
        voiceIndex: voice.id - 1,
        defaultForVoice: preset.name === voice.defaultPreset,
        paramStart,
        paramCount,
        params: drumVoicePresetParams(preset),
      });
    });
  }
  return rows;
}

function sourcePresetProfile(preset) {
  const morph = Number.isFinite(preset.macroMorph) ? preset.macroMorph : 0;
  const distance = Number.isFinite(preset.macroDistance) ? preset.macroDistance : 0;
  const expression = Number.isFinite(preset.macroExpression) ? preset.macroExpression : 1;
  const brightBias = preset.source === 'lead' ? 0.08 : preset.source === 'pad' ? 0 : -0.04;
  const transientBias = preset.source === 'lead' ? 0.18 : preset.source === 'drum' ? 0.3 : 0.04;
  return {
    tone: clamp01(0.5 + morph * 1.35 + (expression - 1) * 0.25),
    brightness: clamp01(0.48 + morph * 1.1 + (expression - 1) * 0.7 - distance * 0.18 + brightBias),
    texture: clamp01(0.28 + Math.abs(morph) * 1.4 + distance * 0.8),
    motion: clamp01(0.16 + distance * 1.5 + Math.abs(morph) * 0.45),
    attack: clamp01(0.52 - morph * 1.15 + distance * 0.25),
    release: clamp01(0.48 + distance * 1.2 - Math.max(0, morph) * 0.35),
    body: clamp01(0.52 - morph * 0.85 + (expression - 1) * 0.45 - distance * 0.22),
    transient: clamp01(transientBias + Math.max(0, morph) * 1.15 + (expression - 1) * 0.55),
  };
}

const schema = readJson(schemaPath);
const params = readJson(paramsPath).params;
const events = readJson(eventsPath).events;
const sourceIds = schema.sourceIds;
const sourcePresetIds = schema.sourcePresetIds ?? [];
const drumVoiceIds = schema.drumVoiceIds ?? [];
const padPresetModule = await loadPadPresetModule();
const drumPresetModule = await loadDrumPresetModule();
const padParamSpecRows = padParamSpecs.map(([key, index, enumMap, fallback]) => ({
  key,
  pad2Key: padPresetModule.PAD1_TO_PAD2_KEY?.[key] ?? key,
  index,
  fallback,
  enumMap,
}));
const leadParamSpecRows = leadParamSpecs.map(([key, index, enumMap, fallback]) => ({
  key,
  index,
  fallback,
  enumMap,
}));
const drumParamSpecRows = drumParamSpecs.map(([key, index, enumMap, fallback]) => ({
  key,
  index,
  fallback,
  enumMap,
}));
const drumVoiceRows = drumVoiceIds.map((voice) => ({
  ...voice,
  index: voice.id - 1,
  paramStart: drumVoiceParamRanges[voice.name]?.[0] ?? 0,
  paramCount: drumVoiceParamRanges[voice.name]?.[1] ?? 0,
}));
const drumVoicePresetRows = makeDrumVoicePresetRows(drumVoiceRows, drumPresetModule);
const sourcePresetRows = sourcePresetIds.map((preset) => ({
  ...preset,
  profile: sourcePresetProfile(preset),
  ...exactPadParamsForPreset(preset, padPresetModule),
  ...exactLeadParamsForPreset(preset),
  ...exactDrumParamsForPreset(preset),
}));
const groups = schema.groups;
const limits = schema.limits;
const canonical = stableStringify({
  schema,
  params,
  events,
  sourcePresetRows,
  drumVoiceRows,
  drumVoicePresetRows,
  padParamSpecRows,
  leadParamSpecRows,
  drumParamSpecRows,
  drumDefaultParams,
  padOutputTrim,
  leadOutputTrim,
  reverbOutputTrim,
});
const hashHex = createHash('sha256').update(canonical).digest('hex');
const schemaHash = Number.parseInt(hashHex.slice(0, 8), 16) >>> 0;
const schemaHashLiteral = `0x${schemaHash.toString(16).padStart(8, '0')}u`;

const cppPreamble = `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.\n#pragma once\n\n#include <stdint.h>\n\nnamespace kessho::product::generated {\n`;
const cppPostamble = `\n} // namespace kessho::product::generated\n`;

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductSchemaHash.h'), `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.
#pragma once

#include <stdint.h>

#define KESSHO_PRODUCT_GENERATED_SCHEMA_VERSION ${schema.version}u
#define KESSHO_PRODUCT_GENERATED_SCHEMA_HASH ${schemaHashLiteral}

namespace kessho::product::generated {

inline constexpr uint32_t KESSHO_PRODUCT_SCHEMA_VERSION = ${schema.version}u;
inline constexpr uint32_t KESSHO_PRODUCT_SCHEMA_HASH = ${schemaHashLiteral};
inline constexpr const char* KESSHO_PRODUCT_SCHEMA_HASH_HEX = "${hashHex}";
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductSchema.h'), `${cppPreamble}
inline constexpr uint32_t KESSHO_PRODUCT_GROUP_COUNT = ${groups.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOURCE_COUNT = ${sourceIds.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_SOURCE_PRESET_COUNT = ${sourcePresetIds.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_DRUM_VOICE_COUNT = ${drumVoiceRows.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_DRUM_VOICE_PRESET_COUNT = ${drumVoicePresetRows.length}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT = ${padParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT = ${leadParamCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT = ${drumParamCount}u;
inline constexpr float KESSHO_PRODUCT_GENERATED_PAD_OUTPUT_TRIM = ${numberLiteral(padOutputTrim, 0.5)}f;
inline constexpr float KESSHO_PRODUCT_GENERATED_LEAD_OUTPUT_TRIM = ${numberLiteral(leadOutputTrim, 0.5)}f;
inline constexpr float KESSHO_PRODUCT_GENERATED_REVERB_OUTPUT_TRIM = ${numberLiteral(reverbOutputTrim, 2)}f;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_BLOCK_SIZE = ${limits.maxBlockSize}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_CONTROL_EVENTS = ${limits.maxControlEvents}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_SEQUENCER_EVENTS = ${limits.maxSequencerEvents}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_AUTOMATION_EVENTS = ${limits.maxAutomationEvents}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_SYNTH_LANES = ${limits.maxSynthLanes}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_DRUM_LANES = ${limits.maxDrumLanes}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_VOICES = ${limits.maxVoices}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_ASSETS = ${limits.maxAssets}u;
inline constexpr uint32_t KESSHO_PRODUCT_MAX_STEM_FRAMES = ${limits.maxStemFrames}u;

${cppStringArray('KESSHO_PRODUCT_GROUPS', groups)}

enum KesshoProductGeneratedSourceId : uint32_t {
${sourceIds.map((source) => `  KESSHO_PRODUCT_SOURCE_${upperSnake(source.name)} = ${source.id}u`).join(',\n')}
};

enum KesshoProductGeneratedSourcePresetId : uint32_t {
${sourcePresetIds.map((preset) => `  KESSHO_PRODUCT_SOURCE_PRESET_${upperSnake(preset.name)} = ${preset.id}u`).join(',\n')}
};

enum KesshoProductGeneratedDrumVoiceId : uint32_t {
${drumVoiceRows.map((voice) => `  KESSHO_PRODUCT_DRUM_VOICE_${upperSnake(voice.name)} = ${voice.id}u`).join(',\n')}
};

struct KesshoProductGeneratedDrumVoice {
  const char* name;
  uint32_t id;
  uint32_t index;
  uint32_t param_start;
  uint32_t param_count;
};

inline constexpr KesshoProductGeneratedDrumVoice KESSHO_PRODUCT_DRUM_VOICES[] = {
${drumVoiceRows.map((voice) => `  {"${voice.name}", ${voice.id}u, ${voice.index}u, ${voice.paramStart}u, ${voice.paramCount}u}`).join(',\n')}
};

struct KesshoProductGeneratedDrumVoicePreset {
  const char* name;
  const char* voice;
  uint32_t voice_index;
  uint32_t id;
  uint32_t default_for_voice;
  uint32_t param_start;
  uint32_t param_count;
  float params[KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT];
};

inline constexpr KesshoProductGeneratedDrumVoicePreset KESSHO_PRODUCT_DRUM_VOICE_PRESETS[] = {
${drumVoicePresetRows.map((preset) => {
  const params = preset.params.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  return `  {"${preset.name}", "${preset.voice}", ${preset.voiceIndex}u, ${preset.id}u, ${preset.defaultForVoice ? 1 : 0}u, ${preset.paramStart}u, ${preset.paramCount}u, {${params}}}`;
}).join(',\n')}
};

struct KesshoProductGeneratedSourcePreset {
  const char* name;
  const char* source;
  const char* key;
  uint32_t id;
  float macro_morph;
  float macro_distance;
  float macro_expression;
  float profile_tone;
  float profile_brightness;
  float profile_texture;
  float profile_motion;
  float profile_attack;
  float profile_release;
  float profile_body;
  float profile_transient;
  uint32_t exact_pad_param_count;
  float exact_pad_params[KESSHO_PRODUCT_GENERATED_PAD_PARAM_COUNT];
  uint32_t exact_lead_param_count;
  float exact_lead_params[KESSHO_PRODUCT_GENERATED_LEAD_PARAM_COUNT];
  uint32_t exact_drum_param_count;
  float exact_drum_params[KESSHO_PRODUCT_GENERATED_DRUM_PARAM_COUNT];
};

inline constexpr KesshoProductGeneratedSourcePreset KESSHO_PRODUCT_SOURCE_PRESETS[] = {
${sourcePresetRows.map((preset) => {
  const profile = preset.profile;
  const exactPadParams = preset.exactPadParams.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  const exactLeadParams = preset.exactLeadParams.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  const exactDrumParams = preset.exactDrumParams.map((value) => `${numberLiteral(value, 0)}f`).join(', ');
  return `  {"${preset.name}", "${preset.source}", "${preset.key}", ${preset.id}u, ${numberLiteral(preset.macroMorph, 0)}f, ${numberLiteral(preset.macroDistance, 0)}f, ${numberLiteral(preset.macroExpression, 1)}f, ${numberLiteral(profile.tone, 0.5)}f, ${numberLiteral(profile.brightness, 0.5)}f, ${numberLiteral(profile.texture, 0.5)}f, ${numberLiteral(profile.motion, 0)}f, ${numberLiteral(profile.attack, 0.5)}f, ${numberLiteral(profile.release, 0.5)}f, ${numberLiteral(profile.body, 0.5)}f, ${numberLiteral(profile.transient, 0)}f, ${preset.exactPadParamCount}u, {${exactPadParams}}, ${preset.exactLeadParamCount}u, {${exactLeadParams}}, ${preset.exactDrumParamCount}u, {${exactDrumParams}}}`;
}).join(',\n')}
};
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductDefaults.h'), `${cppPreamble}
inline constexpr float KESSHO_PRODUCT_DEFAULT_BPM = ${schema.defaults.transport.bpm}.0f;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_BEATS_PER_BAR = ${schema.defaults.transport.beatsPerBar}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_BARS_PER_PHRASE = ${schema.defaults.transport.barsPerPhrase}u;
inline constexpr float KESSHO_PRODUCT_DEFAULT_TRANSPORT_SWING = ${schema.defaults.transport.swing}.0f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_MASTER_GAIN = ${schema.defaults.master.gain}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_MASTER_LIMITER_CEILING_DB = ${schema.defaults.master.limiterCeilingDb}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_LEVEL = ${schema.defaults.source.level}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_EXPRESSION = ${schema.defaults.source.expression}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ = ${numberLiteral(schema.defaults.source.postLpfHz, 18000)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH = ${numberLiteral(schema.defaults.source.stereoWidth, 1)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING = ${numberLiteral(schema.defaults.source.postLpfKeyTracking, 0)}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS = ${schema.defaults.source.holdSeconds}f;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_RNG_SEED = ${schema.defaults.rng.seed}u;
inline constexpr float KESSHO_PRODUCT_DEFAULT_EVOLUTION_AMOUNT = ${schema.defaults.evolution.amount}.0f;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_EVOLUTION_STATE = ${schema.defaults.evolution.state}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_SEQUENCER_STEPS = ${schema.defaults.sequencerLane.stepCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_SEQUENCER_FILLS = ${schema.defaults.sequencerLane.fillCount}u;
inline constexpr uint32_t KESSHO_PRODUCT_DEFAULT_SEQUENCER_CLOCK_DIVISION = ${schema.defaults.sequencerLane.clockDivision}u;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SEQUENCER_PROBABILITY = ${schema.defaults.sequencerLane.probability}.0f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SEQUENCER_VELOCITY = ${schema.defaults.sequencerLane.velocity}f;
inline constexpr float KESSHO_PRODUCT_DEFAULT_SEQUENCER_HOLD_SECONDS = ${schema.defaults.sequencerLane.holdSeconds}f;
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductParamIds.h'), `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.
#pragma once

#include <stdint.h>

${params.map((param) => `#define KESSHO_PRODUCT_PARAM_${upperSnake(param.name)}_ID ${param.id}u`).join('\n')}

namespace kessho::product::generated {

enum KesshoProductGeneratedParamId : uint32_t {
${params.map((param) => `  KESSHO_PRODUCT_PARAM_${upperSnake(param.name)} = ${param.id}u`).join(',\n')}
};

inline constexpr uint32_t KESSHO_PRODUCT_PARAM_COUNT = ${params.length}u;
${cppPostamble}`);

writeGenerated(resolve(root, 'cpp/KesshoCore/generated/KesshoProductEventIds.h'), `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.
#pragma once

#include <stdint.h>

${events.map((event) => `#define KESSHO_PRODUCT_EVENT_${upperSnake(event.name)}_ID ${event.id}u`).join('\n')}

namespace kessho::product::generated {

enum KesshoProductGeneratedEventId : uint32_t {
${events.map((event) => `  KESSHO_PRODUCT_EVENT_${upperSnake(event.name)} = ${event.id}u`).join(',\n')}
};

inline constexpr uint32_t KESSHO_PRODUCT_EVENT_ID_COUNT = ${events.length}u;
${cppPostamble}`);

const tsPreamble = `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.\n`;

writeGenerated(resolve(root, 'src/audio/generated/kesshoProductSchema.ts'), `${tsPreamble}
export const KESSHO_PRODUCT_SCHEMA_VERSION = ${schema.version} as const;
export const KESSHO_PRODUCT_SCHEMA_HASH = ${schemaHash} as const;
export const KESSHO_PRODUCT_SCHEMA_HASH_HEX = '${hashHex}' as const;
export const KESSHO_PRODUCT_GROUPS = Object.freeze(${JSON.stringify(groups, null, 2)}) as readonly string[];
export const KESSHO_PRODUCT_PAD_PARAM_COUNT = ${padParamCount} as const;
export const KESSHO_PRODUCT_LEAD_PARAM_COUNT = ${leadParamCount} as const;
export const KESSHO_PRODUCT_DRUM_PARAM_COUNT = ${drumParamCount} as const;
export const KESSHO_PRODUCT_DRUM_VOICE_COUNT = ${drumVoiceRows.length} as const;
export const KESSHO_PRODUCT_PAD_OUTPUT_TRIM = ${numberLiteral(padOutputTrim, 0.5)} as const;
export const KESSHO_PRODUCT_LEAD_OUTPUT_TRIM = ${numberLiteral(leadOutputTrim, 0.5)} as const;
export const KESSHO_PRODUCT_REVERB_OUTPUT_TRIM = ${numberLiteral(reverbOutputTrim, 2)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ = ${numberLiteral(schema.defaults.source.postLpfHz, 18000)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH = ${numberLiteral(schema.defaults.source.stereoWidth, 1)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING = ${numberLiteral(schema.defaults.source.postLpfKeyTracking, 0)} as const;
export const KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS = ${numberLiteral(schema.defaults.source.holdSeconds, 0.5)} as const;
export const KESSHO_PRODUCT_PAD_PARAM_SPECS = Object.freeze(${JSON.stringify(padParamSpecRows, null, 2)} as const);
export const KESSHO_PRODUCT_LEAD_PARAM_SPECS = Object.freeze(${JSON.stringify(leadParamSpecRows, null, 2)} as const);
export const KESSHO_PRODUCT_DRUM_DEFAULT_PARAMS = Object.freeze(${JSON.stringify(drumDefaultParams, null, 2)} as const);
export const KESSHO_PRODUCT_DRUM_PARAM_SPECS = Object.freeze(${JSON.stringify(drumParamSpecRows, null, 2)} as const);
export const KESSHO_PRODUCT_DRUM_VOICES = Object.freeze(${JSON.stringify(drumVoiceRows, null, 2)} as const);
export const KESSHO_PRODUCT_DRUM_VOICE_PRESETS = Object.freeze(${JSON.stringify(drumVoicePresetRows.map((preset) => ({
  id: preset.id,
  name: preset.name,
  voice: preset.voice,
  voiceIndex: preset.voiceIndex,
  defaultForVoice: preset.defaultForVoice,
  paramStart: preset.paramStart,
  paramCount: preset.paramCount,
})), null, 2)} as const);
export const KESSHO_PRODUCT_SOURCE_IDS = Object.freeze({
${sourceIds.map((source) => `  ${source.name}: ${source.id}`).join(',\n')}
} as const);
export const KESSHO_PRODUCT_SOURCE_PRESET_IDS = Object.freeze({
${sourcePresetIds.map((preset) => `  ${preset.name}: ${preset.id}`).join(',\n')}
} as const);
export const KESSHO_PRODUCT_SOURCE_PRESETS = Object.freeze(${JSON.stringify(sourcePresetRows, null, 2)} as const);
export const KESSHO_PRODUCT_LIMITS = Object.freeze(${JSON.stringify(limits, null, 2)} as const);
`);

writeGenerated(resolve(root, 'src/audio/generated/kesshoProductParams.ts'), `${tsPreamble}
${tsConstObject('KESSHO_PRODUCT_PARAM_IDS', params)}
export const KESSHO_PRODUCT_PARAMS = Object.freeze(${JSON.stringify(params, null, 2)} as const);
export type KesshoProductParamName = keyof typeof KESSHO_PRODUCT_PARAM_IDS;
`);

writeGenerated(resolve(root, 'src/audio/generated/kesshoProductEvents.ts'), `${tsPreamble}
${tsConstObject('KESSHO_PRODUCT_EVENT_IDS', events)}
export const KESSHO_PRODUCT_EVENTS = Object.freeze(${JSON.stringify(events, null, 2)} as const);
export type KesshoProductEventName = keyof typeof KESSHO_PRODUCT_EVENT_IDS;
`);

const swiftPreamble = `// Generated by scripts/generate-kessho-product-bindings.mjs. Do not edit by hand.\nimport Foundation\n\n`;

writeGenerated(resolve(root, 'KesshoNativeSwift/Generated/KesshoProductSchema.swift'), `${swiftPreamble}
public enum KesshoProductSchema {
    public static let version: UInt32 = ${schema.version}
    public static let hash: UInt32 = ${schemaHash}
    public static let hashHex = "${hashHex}"
    public static let padParamCount: UInt32 = ${padParamCount}
    public static let leadParamCount: UInt32 = ${leadParamCount}
    public static let drumParamCount: UInt32 = ${drumParamCount}
    public static let drumVoiceCount: UInt32 = ${drumVoiceRows.length}
    public static let padOutputTrim: Float = ${numberLiteral(padOutputTrim, 0.5)}
    public static let leadOutputTrim: Float = ${numberLiteral(leadOutputTrim, 0.5)}
    public static let reverbOutputTrim: Float = ${numberLiteral(reverbOutputTrim, 2)}
    public static let sourcePostLpfHz: Float = ${numberLiteral(schema.defaults.source.postLpfHz, 18000)}
    public static let sourceStereoWidth: Float = ${numberLiteral(schema.defaults.source.stereoWidth, 1)}
    public static let sourcePostLpfKeyTracking: Float = ${numberLiteral(schema.defaults.source.postLpfKeyTracking, 0)}
    public static let sourceHoldSeconds: Float = ${numberLiteral(schema.defaults.source.holdSeconds, 0.5)}
    public static let groups: [String] = ${JSON.stringify(groups)}
}

public enum KesshoProductSourceId: UInt32 {
${sourceIds.map((source) => `    case ${source.name.slice(0, 1).toLowerCase()}${source.name.slice(1)} = ${source.id}`).join('\n')}
}

public enum KesshoProductSourcePresetId: UInt32 {
${sourcePresetIds.map((preset) => `    case ${preset.name.slice(0, 1).toLowerCase()}${preset.name.slice(1)} = ${preset.id}`).join('\n')}
}

public struct KesshoProductSourcePreset: Sendable {
    public let name: String
    public let source: String
    public let key: String
    public let id: UInt32
    public let macroMorph: Float
    public let macroDistance: Float
    public let macroExpression: Float
    public let profileTone: Float
    public let profileBrightness: Float
    public let profileTexture: Float
    public let profileMotion: Float
    public let profileAttack: Float
    public let profileRelease: Float
    public let profileBody: Float
    public let profileTransient: Float
    public let exactPadParamCount: UInt32
    public let exactPadParams: [Float]
    public let exactLeadParamCount: UInt32
    public let exactLeadParams: [Float]
    public let exactDrumParamCount: UInt32
    public let exactDrumParams: [Float]
}

public struct KesshoProductDrumVoice: Sendable {
    public let name: String
    public let id: UInt32
    public let index: UInt32
    public let presetAKey: String
    public let presetBKey: String
    public let morphKey: String
    public let defaultPreset: String
    public let paramStart: UInt32
    public let paramCount: UInt32
}

public struct KesshoProductDrumVoicePreset: Sendable {
    public let name: String
    public let voice: String
    public let voiceIndex: UInt32
    public let id: UInt32
    public let defaultForVoice: Bool
    public let paramStart: UInt32
    public let paramCount: UInt32
}

public extension KesshoProductSchema {
    static let drumVoices: [KesshoProductDrumVoice] = [
${drumVoiceRows.map((voice) => `        KesshoProductDrumVoice(name: "${voice.name}", id: ${voice.id}, index: ${voice.index}, presetAKey: "${voice.presetAKey}", presetBKey: "${voice.presetBKey}", morphKey: "${voice.morphKey}", defaultPreset: "${voice.defaultPreset}", paramStart: ${voice.paramStart}, paramCount: ${voice.paramCount})`).join(',\n')}
    ]

    static let drumVoicePresets: [KesshoProductDrumVoicePreset] = [
${drumVoicePresetRows.map((preset) => `        KesshoProductDrumVoicePreset(name: "${preset.name}", voice: "${preset.voice}", voiceIndex: ${preset.voiceIndex}, id: ${preset.id}, defaultForVoice: ${preset.defaultForVoice ? 'true' : 'false'}, paramStart: ${preset.paramStart}, paramCount: ${preset.paramCount})`).join(',\n')}
    ]

    static let sourcePresets: [KesshoProductSourcePreset] = [
${sourcePresetRows.map((preset) => {
  const profile = preset.profile;
  const exactPadParams = preset.exactPadParams.map((value) => numberLiteral(value, 0)).join(', ');
  const exactLeadParams = preset.exactLeadParams.map((value) => numberLiteral(value, 0)).join(', ');
  const exactDrumParams = preset.exactDrumParams.map((value) => numberLiteral(value, 0)).join(', ');
  return `        KesshoProductSourcePreset(name: "${preset.name}", source: "${preset.source}", key: "${preset.key}", id: ${preset.id}, macroMorph: ${numberLiteral(preset.macroMorph, 0)}, macroDistance: ${numberLiteral(preset.macroDistance, 0)}, macroExpression: ${numberLiteral(preset.macroExpression, 1)}, profileTone: ${numberLiteral(profile.tone, 0.5)}, profileBrightness: ${numberLiteral(profile.brightness, 0.5)}, profileTexture: ${numberLiteral(profile.texture, 0.5)}, profileMotion: ${numberLiteral(profile.motion, 0)}, profileAttack: ${numberLiteral(profile.attack, 0.5)}, profileRelease: ${numberLiteral(profile.release, 0.5)}, profileBody: ${numberLiteral(profile.body, 0.5)}, profileTransient: ${numberLiteral(profile.transient, 0)}, exactPadParamCount: ${preset.exactPadParamCount}, exactPadParams: [${exactPadParams}], exactLeadParamCount: ${preset.exactLeadParamCount}, exactLeadParams: [${exactLeadParams}], exactDrumParamCount: ${preset.exactDrumParamCount}, exactDrumParams: [${exactDrumParams}])`;
}).join(',\n')}
    ]
}
`);

writeGenerated(resolve(root, 'KesshoNativeSwift/Generated/KesshoProductParams.swift'), `${swiftPreamble}
public enum KesshoProductParamId: UInt32 {
${params.map((param) => `    case ${param.name.slice(0, 1).toLowerCase()}${param.name.slice(1)} = ${param.id}`).join('\n')}
}
`);

writeGenerated(resolve(root, 'KesshoNativeSwift/Generated/KesshoProductEvents.swift'), `${swiftPreamble}
public enum KesshoProductEventId: UInt32 {
${events.map((event) => `    case ${event.name.slice(0, 1).toLowerCase()}${event.name.slice(1)} = ${event.id}`).join('\n')}
}
`);

console.log(`Generated Kessho product bindings (${hashHex}).`);
