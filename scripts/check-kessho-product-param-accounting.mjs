import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const reportPath = 'docs/reports/kessho-product-param-accounting-latest.json';

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function write(path, contents) {
  const absolutePath = resolve(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceFile(path) {
  return ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

const isSatisfiesExpression =
  typeof ts.isSatisfiesExpression === 'function' ? ts.isSatisfiesExpression : () => false;

function unwrapExpression(expression) {
  let current = expression;
  while (ts.isAsExpression(current) || isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function propertyNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;
}

function numericLiteralValue(expression) {
  const current = unwrapExpression(expression);
  if (ts.isNumericLiteral(current)) {
    return Number(current.text);
  }
  if (ts.isPrefixUnaryExpression(current) && ts.isNumericLiteral(current.operand)) {
    const value = Number(current.operand.text);
    return current.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  return null;
}

function objectLiteralConst(path, declarationName) {
  const file = sourceFile(path);
  let objectLiteral = null;
  function visit(node) {
    if (
      objectLiteral === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === declarationName &&
      node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        objectLiteral = initializer;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return objectLiteral;
}

function collectSliderStateKeys() {
  const keys = new Set();
  const state = sourceFile('src/ui/state.ts');
  function visit(node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'SliderState') {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
          keys.add(member.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(state);
  return keys;
}

function objectKeysInConst(path, declarationName) {
  const keys = new Set();
  const objectLiteral = objectLiteralConst(path, declarationName);
  if (objectLiteral) {
    for (const property of objectLiteral.properties) {
      if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property)) {
        const name = propertyNameText(property.name);
        if (name) {
          keys.add(name);
        }
      }
    }
  }
  return keys;
}

function collectDefaultNumericValues() {
  const values = new Map();
  const defaults = objectLiteralConst('src/ui/state.ts', 'DEFAULT_STATE');
  if (!defaults) {
    return values;
  }
  for (const property of defaults.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = propertyNameText(property.name);
    const value = numericLiteralValue(property.initializer);
    if (name && value !== null) {
      values.set(name, value);
    }
  }
  return values;
}

function collectQuantizationRanges() {
  const ranges = new Map();
  const quantization = objectLiteralConst('src/ui/state.ts', 'QUANTIZATION');
  if (!quantization) {
    return ranges;
  }
  for (const property of quantization.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const key = propertyNameText(property.name);
    const initializer = unwrapExpression(property.initializer);
    if (!key || !ts.isObjectLiteralExpression(initializer)) {
      continue;
    }
    let min = null;
    let max = null;
    for (const rangeProperty of initializer.properties) {
      if (!ts.isPropertyAssignment(rangeProperty)) {
        continue;
      }
      const name = propertyNameText(rangeProperty.name);
      const value = numericLiteralValue(rangeProperty.initializer);
      if (name === 'min') {
        min = value;
      }
      if (name === 'max') {
        max = value;
      }
    }
    if (min !== null && max !== null) {
      ranges.set(key, { min, max });
    }
  }
  return ranges;
}

function collectPostLpfBoundedNumberRangeMismatches() {
  const mismatches = [];
  const postLpfKeys = [
    'padPostLPF',
    'pad2PostLPF',
    'lead1PostLPF',
    'lead2PostLPF',
    'pianoPostLPF',
  ];
  for (const path of [
    'src/audio/coreSnapshot.ts',
    'src/audio/coreEngineHost.ts',
  ]) {
    const file = sourceFile(path);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const name = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : '';
        if (name === 'boundedNumber' && node.arguments.length >= 4) {
          const valueExpression = node.arguments[0].getText(file);
          const key = postLpfKeys.find((candidate) => valueExpression.includes(candidate));
          if (key) {
            const min = numericLiteralValue(node.arguments[2]);
            const max = numericLiteralValue(node.arguments[3]);
            if (min !== 20 || max !== 20000) {
              mismatches.push({ path, key, min, max });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return mismatches;
}

function addDynamicSequencerKeys(keys) {
  for (let lane = 1; lane <= 4; lane += 1) {
    for (const suffix of [
      'Source',
      'ManualStepMaskLow',
      'ManualStepMaskHigh',
      'NoteMin',
      'NoteMax',
      'Enabled',
      'Steps',
      'Hits',
      'Rotation',
      'ClockDivision',
      'Swing',
      'Probability',
      'Level',
    ]) {
      keys.add(`synthEuclid${lane}${suffix}`);
    }
    for (const suffix of [
      'ManualStepMaskLow',
      'ManualStepMaskHigh',
      'Enabled',
      'Steps',
      'Hits',
      'Rotation',
      'ClockDivision',
      'Swing',
      'Probability',
      'Level',
      'TargetSub',
      'TargetKick',
      'TargetClick',
      'TargetBeepHi',
      'TargetBeepLo',
      'TargetNoise',
      'TargetMembrane',
    ]) {
      keys.add(`drumEuclid${lane}${suffix}`);
    }
  }
}

function addDynamicGranularVoiceKeys(keys) {
  for (let voice = 1; voice <= 4; voice += 1) {
    for (const suffix of [
      'Enabled',
      'Mode',
      'Slice',
      'Speed',
      'ScanRate',
      'Reverse',
      'Pitch',
      'WriteFollow',
      'Density',
      'GrainSize',
      'Spray',
      'GrainOct',
      'Attack',
      'Decay',
      'Gain',
      'Pan',
      'Blur',
      'StereoSpread',
      'PosLFORate',
      'PosLFODepth',
      'PanLFORate',
      'ReverseLFORate',
      'RecordLFORate',
      'TempoSync',
    ]) {
      keys.add(`granularV${voice}${suffix}`);
    }
  }
}

function collectProductWiredKeys(sliderKeys) {
  const keys = new Set();
  const stateGetterNames = new Set([
    'numberFromState',
    'booleanFromState',
    'stringFromState',
    'clockDivisionFromState',
    'delayDivisionMs',
    'midiCenterFromState',
    'synthSourceIdFromState',
  ]);

  function collectFromProductFile(path) {
    const file = sourceFile(path);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const name = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : '';
        if (stateGetterNames.has(name)) {
          for (const argument of node.arguments) {
            if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
              keys.add(argument.text);
            }
          }
        }
      }
      if (ts.isPropertyAccessExpression(node) && sliderKeys.has(node.name.text)) {
        keys.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }

  for (const path of [
    'src/audio/coreProductSnapshot.ts',
    'src/audio/coreProductSoundscapesSnapshot.ts',
    'src/audio/CoreProductLegacyPresetCompat.ts',
    'src/audio/coreProductAssets.ts',
    'src/audio/coreProductArrangementScheduler.ts',
    'src/audio/granularMacroCore.ts',
    'src/audio/transport.ts',
  ]) {
    collectFromProductFile(path);
  }

  const schema = read('src/audio/generated/kesshoProductSchema.ts');
  for (const match of schema.matchAll(/"(?:key|pad2Key|presetAKey|presetBKey|morphKey)":\s*"([A-Za-z][A-Za-z0-9_]*)"/g)) {
    if (sliderKeys.has(match[1])) {
      keys.add(match[1]);
    }
  }

  for (const prefix of ['lead1', 'lead2']) {
    for (const suffix of ['UseCustomAdsr', 'Attack', 'Decay', 'Sustain', 'Hold', 'Release', 'AlgorithmMode']) {
      keys.add(`${prefix}${suffix}`);
    }
  }

  addDynamicSequencerKeys(keys);
  addDynamicGranularVoiceKeys(keys);
  for (const key of objectKeysInConst('src/audio/coreProductEvents.ts', 'RANGE_KEY_TARGETS')) {
    keys.add(key);
  }

  return keys;
}

const productDeferredClassifications = [
  {
    id: 'soundscape-layer-policy',
    owner: 'C++ Product Core soundscape source and asset layer policy',
    reason:
      'Product Core owns decoded sample assets, per-asset levels, common soundscape sends, and layer playback policy; web-only synth texture, slice, filter, and per-layer send controls still need bounded Product Core fields.',
    patterns: [
      /^(ocean|birds|birds2|frogs)(SliceDuration|SliceDensity|ReverbSend|DelayASend|DelayBSend)$/,
      /^oceanFilter(Type|Cutoff|Resonance)$/,
      /^water(Intensity|Distance|BaseFreq|HardDropBaseFreq|WaterDropBaseFreq|DropSize|Hardness|GlassThickness|LayerHardDrops|LayerWaterDrops|LayerTurbulence|LayerBubbling|LayerSurf|LayerChannels|HardDropRate|HardDropLPF|HardDropTone|WaterDropRate|WaterDropLPF|BubblingRate|BubblingLPF|SurfDuration|SurfInterval|SurfFoam|SurfFoamBright|SurfProximity|SurfDepth|SurfBody|SurfSpray|DensityHardSend|DensityWaterSend|DensityBubbleSend|DensityFeedback|DensityTone|DensityRing|DensityWet|ChannelsMorph|ChannelsSpeed)$/,
      /^insects2?(Engine|Density|Temperature|Distance|Proximity|Antiphony|ClickRate|Motion)$/,
    ],
  },
  {
    id: 'arrangement-and-clock-policy',
    owner: 'C++ Product Core arrangement scheduler and transport sync policy',
    reason:
      'Product host arrangement scheduling feeds Product Core manual/source events today; these policy and UI-state controls need native Product scheduler ownership before they become generated Product params.',
    patterns: [
      /^(cofCurrentStep|harmonySyncPolicy|synthEuclidClockSource|synthEuclidJoinPolicy|drumEuclidClockSource|drumEuclidJoinPolicy)$/,
      /^(chordProgressionHits|chordProgressionRotation)$/,
      /^(lead|drum|pad|reverb|granular|synthEuclid)Tension(Mode|Value)$/,
      /^drumTension(Mode|Value)$/,
    ],
  },
  {
    id: 'runtime-walk-global-policy',
    owner: 'Product Core modulation range scheduler',
    reason:
      'Product Core carries random-walk speed/mode as modulation-range scheduler metadata rather than generated scalar Product params.',
    patterns: [/^randomWalk(Speed|Mode)$/],
  },
  {
    id: 'source-scheduler-ui-policy',
    owner: 'C++ Product Core source scheduler, source preset, and automation owners',
    reason:
      'The canonical Product path uses generated source IDs, exact patch bridges, source macro params, and sequencer lane snapshots; these source-selection, auto-morph, and scheduler helper controls remain host/UI policy.',
    patterns: [
      /^(pad|pad2)Morph(Auto|Speed)$/,
      /^lead[12]Morph(Auto|Speed|Mode)$/,
      /^drum(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)Morph(Auto|Speed|Mode)$/,
      /^(drumMorphSliderAnimate|synthVoiceMask|waveSpread|synthOctave|pad2VoiceAssign|pad2Octave)$/,
      /^lead[12](Density|Octave|OctaveRange)$/,
      /^(leadVibratoDepth|leadVibratoRate|leadGlide)$/,
    ],
  },
  {
    id: 'source-extra-deferred',
    owner: 'C++ Product Core piano/sample envelope and source-diffusion owners',
    reason:
      'Product Core currently exposes source hold, post-LPF, width, level, sends, and decoded piano asset playback; piano ADSR and diffuse-send fields need explicit generated Product source params.',
    patterns: [/^piano(Attack|Decay|Sustain|Hold|Release|DiffuseSend)$/, /^(pad|pad2|lead1|lead2)DiffuseSend$/],
  },
  {
    id: 'legacy-delay-and-granular-aliases',
    owner: 'Legacy web-ts compatibility cleanup',
    reason:
      'These keys are legacy aliases or deprecated web controls; Product Core uses the canonical Delay A/B, granular voice, and source send keys that are separately wired.',
    patterns: [
      /^(drumDelayEnabled|drumDelayFeedback|drumDelayMix|drumDelayFilter)$/,
      /^drum(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)DelaySend$/,
      /^(delayATime|delayASpread)$/,
      /^(maxGrains|grainProbability|grainSize|density|spray|jitter|grainPitchMode|pitchSpread|stereoSpread|feedback|wetHPF|wetLPF)$/,
    ],
  },
  {
    id: 'fx-macro-deferred',
    owner: 'C++ Product Core FX macro and routing owners',
    reason:
      'Product Core wires the generated scalar FX params; these macro, routing-policy, shortcut, and legacy alias controls need explicit generated params or should retire.',
    patterns: [
      /^(reverbEngine|reverbScaleShimmer|reverbChordWash|reverbResolutionBloom)$/,
      /^spectralFreeze(Routing|ReverbCrossfade)$/,
      /^granular(MacroActivity|MacroTexture|MacroComplexity|MacroDarkness|ReverbLPF|OutputLPF|Preset|PresetBehavior)$/,
      /^character(Wow|Flutter|Drift|Noise|Hp|Lp|Tone|Saturation|Corrosion|WetHp)$/,
      /^delayBGranularLinked$/,
      /^granularV[1-4]TempoDiv$/,
    ],
  },
  {
    id: 'sequencer-preset-policy',
    owner: 'C++ Product Core sequencer preset/template owner',
    reason:
      'Product Core receives concrete lane steps, fills, rotations, divisions, swings, probability, level, source, and masks; web preset names and legacy velocity min/max helpers are template state.',
    patterns: [
      /^synthEuclideanTempo$/,
      /^synthEuclid[1-4]Preset$/,
      /^drumEuclidTempo$/,
      /^drumEuclid[1-4]Preset$/,
      /^drumEuclid[1-4]Velocity(Min|Max)$/,
    ],
  },
  {
    id: 'drum-module-extra-deferred',
    owner: 'C++ Product Core drum module parity owner',
    reason:
      'The Product Drum bridge carries every generated shared drum-module param; these newer web drum-synth extras are not present in the current C++ drum module ABI.',
    patterns: [
      /^drumBeepHiModPhase$/,
      /^drumNoise(ParticleSize|ParticleRandom|ParticleRandomRate|RatchetCount|RatchetTime)$/,
      /^drumMembrane(Exciter|ExcBright|ExcDur|Nonlin|WireDensity|WireTone|WireDecay|Body|Ring|Overtones|PitchEnv|PitchDecay|ScaleBlend)$/,
    ],
  },
  {
    id: 'legacy-timbre-alias',
    owner: 'Legacy preset compatibility cleanup',
    reason: '`leadTimbre` is documented as a legacy ignored key; Product Core uses generated Lead preset IDs and exact Lead patch fields.',
    patterns: [/^leadTimbre$/],
  },
];

function classifyDeferredKey(key) {
  return productDeferredClassifications.find((classification) =>
    classification.patterns.some((pattern) => pattern.test(key)),
  );
}

const sliderKeys = collectSliderStateKeys();
const registryKeys = objectKeysInConst('src/presets/ParamRegistry.ts', 'PARAM_REGISTRY');
const productWiredKeys = collectProductWiredKeys(sliderKeys);
const productWiredSliderKeys = [...sliderKeys].filter((key) => productWiredKeys.has(key)).sort();
const defaultNumericValues = collectDefaultNumericValues();
const quantizationRanges = collectQuantizationRanges();
const defaultsOutsideQuantization = [];
const postLpfBoundedNumberRangeMismatches = collectPostLpfBoundedNumberRangeMismatches();
const deferred = [];
const unaccounted = [];

for (const [key, value] of defaultNumericValues.entries()) {
  const range = quantizationRanges.get(key);
  if (!range) {
    continue;
  }
  if (value < range.min || value > range.max) {
    defaultsOutsideQuantization.push({
      key,
      value,
      min: range.min,
      max: range.max,
    });
  }
}

for (const key of [...sliderKeys].sort()) {
  if (productWiredKeys.has(key)) {
    continue;
  }
  const classification = classifyDeferredKey(key);
  if (classification) {
    deferred.push({
      key,
      classification: classification.id,
      owner: classification.owner,
      reason: classification.reason,
      inParamRegistry: registryKeys.has(key),
    });
    continue;
  }
  unaccounted.push({
    key,
    inParamRegistry: registryKeys.has(key),
  });
}

const deferredCounts = Object.fromEntries(productDeferredClassifications.map((classification) => [
  classification.id,
  deferred.filter((entry) => entry.classification === classification.id).length,
]));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: unaccounted.length === 0 && defaultsOutsideQuantization.length === 0 && postLpfBoundedNumberRangeMismatches.length === 0
    ? 'pass'
    : 'fail',
  counts: {
    sliderStateKeys: sliderKeys.size,
    paramRegistryKeys: registryKeys.size,
    productWiredSliderKeys: productWiredSliderKeys.length,
    explicitlyDeferredOrLegacyKeys: deferred.length,
    unaccountedKeys: unaccounted.length,
    defaultNumericValues: defaultNumericValues.size,
    quantizationRanges: quantizationRanges.size,
    defaultsOutsideQuantization: defaultsOutsideQuantization.length,
    postLpfBoundedNumberRangeMismatches: postLpfBoundedNumberRangeMismatches.length,
  },
  deferredCounts,
  deferred,
  unaccounted,
  defaultsOutsideQuantization,
  postLpfBoundedNumberRangeMismatches,
};

write(reportPath, `${JSON.stringify(report, null, 2)}\n`);

assert(
  read('docs/kessho-product-control-classification.md').includes('## Parameter Accounting'),
  'docs/kessho-product-control-classification.md must include Parameter Accounting policy',
);
assert(
  read('src/audio/CoreProductLegacyPresetCompat.ts').includes('UseCustomAdsr'),
  'Lead custom ADSR controls must stay wired through the labeled exact Lead bridge until structured Lead overrides replace it',
);
assert(
  unaccounted.length === 0,
  `Unaccounted Product Core parameter keys: ${unaccounted.map((entry) => entry.key).join(', ')}`,
);
assert(
  defaultsOutsideQuantization.length === 0,
  `Default slider values outside quantization ranges: ${defaultsOutsideQuantization
    .map((entry) => `${entry.key}=${entry.value} outside ${entry.min}..${entry.max}`)
    .join(', ')}`,
);
assert(
  postLpfBoundedNumberRangeMismatches.length === 0,
  `Source post LPF boundedNumber ranges must stay 20..20000: ${postLpfBoundedNumberRangeMismatches
    .map((entry) => `${entry.path}:${entry.key}=${entry.min}..${entry.max}`)
    .join(', ')}`,
);

console.log('Kessho Product parameter accounting checks passed');
