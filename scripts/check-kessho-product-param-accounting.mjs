import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import {
  EXPECTED_APP_VISIBLE_STRUCTURAL_POLICY_BY_PATH,
  EXPECTED_DEFERRED_KEYS_BY_CLASSIFICATION,
  EXPECTED_PARAM_REGISTRY_OMISSIONS,
  FACTORY_PRESET_PAYLOAD_SCOPE_CHECKS,
  behaviorEvidenceByAppVisibleGroup,
  behaviorEvidenceByDomain,
  classifyDeferredKey,
  collectAppVisibleBehaviorEvidenceGaps,
  collectAppVisibleStructuralPolicyInventory,
  collectBehaviorEvidenceGaps,
  controlDomain,
  productDeferredClassifications,
} from './param-accounting/policies.mjs';
import {
  collectParamRegistryEntries,
  collectPresetPayloadKeys,
  collectPresetPayloadScopeGaps,
  collectSliderStateKeys,
  numericLiteralValue,
  objectKeysInConst,
  objectLiteralConst,
  propertyNameText,
  sourceFile,
  sourcePosition,
  unwrapExpression,
  walkSourceFiles,
} from './param-accounting/ts-scanners.mjs';

const root = process.cwd();
const reportPath = 'docs/reports/kessho-product-param-accounting-latest.json';
const productControlCoverageReportPath = 'docs/reports/kessho-product-control-coverage-latest.json';

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

const UI_CONTROL_CALL_NAMES = new Set([
  'onParamChange',
  'onSelectChange',
  'handleSliderChange',
  'handleSliderChangeWithOptions',
  'handleRoutingParamChange',
  'handleRoutingColumnChange',
  'sliderProps',
  'onDualRangeChange',
  'getParamInfo',
  'getSliderNumericValue',
  'getStateValueFromSliderNumber',
  'getPreviewValue',
  'getDistanceGhostValue',
]);

const UI_SLIDER_CALL_NAMES = new Set([
  'onParamChange',
  'handleSliderChange',
  'handleSliderChangeWithOptions',
  'handleRoutingParamChange',
  'handleRoutingColumnChange',
  'sliderProps',
  'onDualRangeChange',
]);

const UI_CONTROL_OBJECT_PROPERTY_NAMES = new Set([
  'key',
  'paramKey',
  'enabledKey',
  'levelKey',
  'fadeKey',
  'minKey',
  'maxKey',
  'routeKey',
  'sourceKey',
  'morphKey',
]);

function addAppVisibleReference(references, key, path, file, node, kind, sliderControl = false, interactiveControl = false) {
  const position = sourcePosition(file, node);
  const entry = references.get(key) ?? {
    key,
    refs: [],
    sliderRefs: [],
    controlRefs: [],
  };
  const ref = {
    path,
    line: position.line,
    column: position.column,
    kind,
  };
  entry.refs.push(ref);
  if (sliderControl) {
    entry.sliderRefs.push(ref);
  }
  if (interactiveControl) {
    entry.controlRefs.push(ref);
  }
  references.set(key, entry);
}

function addSyntheticAppVisibleReference(
  references,
  sliderKeys,
  key,
  kind,
  sliderControl = false,
  path = '<generated-ui-pattern>',
) {
  if (!sliderKeys.has(key)) {
    return;
  }
  const entry = references.get(key) ?? {
    key,
    refs: [],
    sliderRefs: [],
    controlRefs: [],
  };
  const ref = {
    path,
    line: 0,
    column: 0,
    kind,
  };
  entry.refs.push(ref);
  if (sliderControl) {
    entry.sliderRefs.push(ref);
  }
  entry.controlRefs.push(ref);
  references.set(key, entry);
}

function addDynamicAppVisibleReferences(references, sliderKeys) {
  const generated = new Set();
  addDynamicSequencerKeys(generated);
  addDynamicGranularVoiceKeys(generated);
  for (const key of generated) {
    addSyntheticAppVisibleReference(
      references,
      sliderKeys,
      key,
      'generated sequencer/granular control key',
      true,
    );
  }

  for (const key of [
    'lead1Attack',
    'lead1Decay',
    'lead1Sustain',
    'lead1Release',
    'lead2Attack',
    'lead2Decay',
    'lead2Sustain',
    'lead2Release',
  ]) {
    addSyntheticAppVisibleReference(
      references,
      sliderKeys,
      key,
      'dynamic lead envelope override slider',
      true,
      'src/ui/synth/SynthPage.tsx',
    );
  }

  for (const key of ['lead1UseCustomAdsr', 'lead2UseCustomAdsr']) {
    addSyntheticAppVisibleReference(
      references,
      sliderKeys,
      key,
      'dynamic lead envelope override mode control',
      false,
      'src/ui/synth/SynthPage.tsx',
    );
  }

  for (const key of [
    'drumSubPresetA',
    'drumSubPresetB',
    'drumKickPresetA',
    'drumKickPresetB',
    'drumClickPresetA',
    'drumClickPresetB',
    'drumBeepHiPresetA',
    'drumBeepHiPresetB',
    'drumBeepLoPresetA',
    'drumBeepLoPresetB',
    'drumNoisePresetA',
    'drumNoisePresetB',
    'drumMembranePresetA',
    'drumMembranePresetB',
  ]) {
    addSyntheticAppVisibleReference(
      references,
      sliderKeys,
      key,
      'dynamic drum exact-patch preset selector',
      false,
      'src/ui/drums/MorphSlider.tsx',
    );
  }

  for (const key of [
    'drumSubMorph',
    'drumKickMorph',
    'drumClickMorph',
    'drumBeepHiMorph',
    'drumBeepLoMorph',
    'drumNoiseMorph',
    'drumMembraneMorph',
  ]) {
    addSyntheticAppVisibleReference(
      references,
      sliderKeys,
      key,
      'dynamic drum morph slider',
      true,
      'src/ui/drums/MorphSlider.tsx',
    );
  }
}

function addFactoryPresetAppVisibleReferences(references, sliderKeys) {
  for (const check of FACTORY_PRESET_PAYLOAD_SCOPE_CHECKS) {
    for (const [key, entry] of collectPresetPayloadKeys(check.path, check.declarationName)) {
      if (!sliderKeys.has(key)) {
        continue;
      }
      const current = references.get(key) ?? {
        key,
        refs: [],
        sliderRefs: [],
        controlRefs: [],
      };
      const ref = {
        path: check.path,
        line: entry.line,
        column: 0,
        kind: `factory preset payload:${check.declarationName}`,
      };
      current.refs.push(ref);
      current.controlRefs.push(ref);
      references.set(key, current);
    }
  }
}

function collectAppVisibleControlReferences(sliderKeys) {
  const references = new Map();
  const invalid = [];
  const paths = [
    'src/App.tsx',
    ...walkSourceFiles('src/ui').filter((path) => path !== 'src/ui/state.ts'),
  ];

  function recordInvalid(path, file, node, key, kind) {
    const position = sourcePosition(file, node);
    invalid.push({
      key,
      path,
      line: position.line,
      column: position.column,
      kind,
    });
  }

  for (const path of paths) {
    const file = sourceFile(path);
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = ts.isIdentifier(node.tagName) ? node.tagName.text : null;
        const sliderElement = tagName === 'Slider' || tagName === 'SliderPrimitive' || tagName === 'DualSlider';
        if (sliderElement) {
          for (const attribute of node.attributes.properties) {
            if (!ts.isJsxAttribute(attribute) || attribute.name.text !== 'paramKey' || !attribute.initializer) {
              continue;
            }
            let expression = null;
            if (ts.isStringLiteral(attribute.initializer)) {
              expression = attribute.initializer;
            } else if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
              expression = unwrapExpression(attribute.initializer.expression);
            }
            if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
              if (sliderKeys.has(expression.text)) {
                addAppVisibleReference(references, expression.text, path, file, expression, 'jsx:paramKey', true, true);
              } else {
                recordInvalid(path, file, expression, expression.text, 'jsx:paramKey');
              }
            }
          }
        }
      }

      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const name = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : '';
        if (UI_CONTROL_CALL_NAMES.has(name) && node.arguments[0]) {
          const argument = unwrapExpression(node.arguments[0]);
          if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
            if (sliderKeys.has(argument.text)) {
              addAppVisibleReference(
                references,
                argument.text,
                path,
                file,
                argument,
                `call:${name}`,
                UI_SLIDER_CALL_NAMES.has(name),
                true,
              );
            } else {
              recordInvalid(path, file, argument, argument.text, `call:${name}`);
            }
          }
        }
      }

      if (ts.isPropertyAssignment(node)) {
        const propertyName = propertyNameText(node.name);
        const initializer = unwrapExpression(node.initializer);
        if (
          propertyName &&
          UI_CONTROL_OBJECT_PROPERTY_NAMES.has(propertyName) &&
          (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) &&
          sliderKeys.has(initializer.text)
        ) {
          addAppVisibleReference(
            references,
            initializer.text,
            path,
            file,
            initializer,
            `object-property:${propertyName}`,
            propertyName === 'paramKey',
            true,
          );
        }
      }

      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (sliderKeys.has(node.text)) {
          addAppVisibleReference(references, node.text, path, file, node, 'ui-string-literal');
        }
      }

      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'state' &&
        sliderKeys.has(node.name.text)
      ) {
        addAppVisibleReference(references, node.name.text, path, file, node.name, 'state-property-access');
      }

      ts.forEachChild(node, visit);
    }
    visit(file);
  }

  addDynamicAppVisibleReferences(references, sliderKeys);
  addFactoryPresetAppVisibleReferences(references, sliderKeys);

  return {
    references,
    invalid,
  };
}

function appVisibleLiveUpdatePathForKey(key, rangeTargetKeys, snapshotReferencedKeys) {
  if (rangeTargetKeys.has(key)) {
    return {
      path: 'range-event',
      evidence: ['src/audio/coreProductEvents.ts#RANGE_KEY_TARGETS', 'cpp/KesshoCore/src/product/KesshoProductEvents.cpp'],
    };
  }

  if (/^synthEuclid[1-4](Enabled|Source|VoiceMask|Steps|Hits|Rotation|ClockDivision|Swing|Probability|Level|NoteMin|NoteMax)$/.test(key)) {
    return {
      path: 'sequencer-lane-diff',
      evidence: ['src/audio/CoreProductRuntimeAdapter.ts#appendSequencerLaneDiffs', 'cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp'],
    };
  }

  if (key === 'synthSequencerFaces') {
    return {
      path: 'sequencer-face-diff',
      evidence: ['src/audio/coreProductSnapshot.ts#synthSequencerFaceSlotsFromState', 'src/audio/CoreProductRuntimeAdapter.ts#appendSequencerModeConfigDiffs', 'cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp'],
      reason: 'Structured synth sequencer face configs resolve into Product Core mode snapshots and generated indexed sequencer lane param events.',
    };
  }

  if (key === 'synthSequencerChain' || key === 'drumSequencerChain') {
    return {
      path: 'sequencer-chain-host-events',
      evidence: ['src/audio/CoreProductHostSequencerChain.ts', 'src/audio/coreProductEvents.ts#createCoreProductSequencerLaneParamEvent', 'cpp/KesshoCore/src/product/KesshoProductEvents.cpp'],
      reason: 'Structured sequencer chain state is projected by the Product host into generated lane-enabled sequencer events.',
    };
  }

  if (key === 'synthVoiceMask' || key === 'pad2VoiceAssign') {
    return {
      path: 'pad-voice-routing-snapshot',
      evidence: ['src/audio/coreProductSnapshotPadVoiceRouting.ts', 'src/audio/CoreProductRuntimeAdapter.ts#appendSequencerLaneDiffs', 'src/audio/coreProductArrangementPadChord.ts'],
    };
  }

  if (/^drumEuclid[1-4](Enabled|Steps|Hits|Rotation|ClockDivision|Swing|Probability|Level)$/.test(key)) {
    return {
      path: 'sequencer-lane-diff',
      evidence: ['src/audio/CoreProductRuntimeAdapter.ts#appendSequencerLaneDiffs', 'cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp'],
    };
  }

  if (key === 'synthEuclideanTempo' || key === 'drumEuclidTempo') {
    return {
      path: 'sequencer-lane-diff',
      evidence: ['src/audio/coreProductSnapshot.ts#synthLaneFromState', 'src/audio/CoreProductRuntimeAdapter.ts#appendSequencerLaneDiffs', 'cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp'],
    };
  }

  if (['synthEuclidClockSource', 'synthEuclidJoinPolicy', 'drumEuclidClockSource', 'drumEuclidJoinPolicy'].includes(key)) {
    return {
      path: 'sequencer-clock-rejoin-policy',
      evidence: ['src/audio/CoreProductHostSequencerClock.ts#shouldRejoinCoreProductSequencerClocks', 'src/audio/coreProductSnapshot.ts#initialStartDelaySecondsFromState', 'src/audio/CoreProductRuntimeAdapter.ts#SequencerLaneInitialStartDelaySeconds'],
    };
  }

  if (key === 'drumEuclidDivision') {
    return {
      path: 'legacy-inert-state-key',
      evidence: ['src/ui/state.ts#drumEuclidDivision', 'src/ui/sequencer/useEuclideanSequencer.ts#clockDivs'],
      reason: 'Legacy global drum division is preserved for old preset/state compatibility; active Web and Product sequencers use per-lane drumEuclidNClockDivision values.',
    };
  }

  if (/^drumEuclid[1-4]Target(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)$/.test(key)) {
    return {
      path: 'sequencer-structure-full-snapshot',
      evidence: ['src/audio/CoreProductRuntimeAdapter.ts#canApplyLaneDiffs', 'docs/kessho-product-control-classification.md#Structural Full Snapshot Reloads'],
      reason: 'Drum target toggles can change the number of Product drum lanes, so lane-count mismatch is explicitly structural.',
    };
  }

  const granularVoiceMatch = key.match(/^granularV[1-4](Mode|Reverse|TempoSync|PitchMode|CloudStyle|AnchorPattern)$/);
  if (granularVoiceMatch) {
    return {
      path: 'granular-voice-diff',
      evidence: ['src/audio/CoreProductRuntimeAdapter.ts#appendGranularVoiceDiffs', 'cpp/KesshoCore/src/product/KesshoProductEvents.cpp'],
      reason: granularVoiceMatch[1] === 'TempoSync' ? 'TempoSync maps to the generated granular voice EuclidGated Product param.' : undefined,
    };
  }

  if (key === 'lead1Hold' || key === 'lead2Hold') {
    return {
      path: 'source-param-diff',
      evidence: ['src/audio/CoreProductRuntimeAdapter.ts#appendSourceParamDiffs', 'cpp/KesshoCore/src/product/sources/ProductSources.cpp'],
    };
  }

  if (/^(pad|pad2|lead|lead2|drum|piano)Enabled$/.test(key)) {
    return {
      path: 'source-param-diff',
      evidence: ['src/audio/CoreProductRuntimeAdapter.ts#appendSourceParamDiffs', 'cpp/KesshoCore/src/product/sources/ProductSources.cpp'],
    };
  }

  if (/^pad2?Preset[AB]$/.test(key)) {
    return {
      path: 'pad-generated-preset-endpoint-diff',
      evidence: ['src/audio/CoreProductPadPatch.ts#exactPadPatchFromState', 'src/audio/CoreProductRuntimeAdapterSourcePresets.ts#appendCoreProductSourcePresetEndpointDiffs'],
      reason: 'Generated Pad preset endpoint IDs, morphs, source distance, and sparse Pad overrides drive reconstructable patches; exact Pad params remain only for non-reconstructable Pad sources.',
    };
  }

  if (/^(lead1Preset[AB]|lead2Preset[CD])$/.test(key)) {
    return {
      path: 'lead-generated-preset-endpoint-diff',
      evidence: ['src/audio/CoreProductLeadPatch.ts#exactLeadPatchFromState', 'src/audio/CoreProductRuntimeAdapterSourcePresets.ts#appendCoreProductSourcePresetEndpointDiffs'],
      reason: 'Generated Lead preset endpoint IDs, morphs, source distance, structured Lead fields, and sparse Lead overrides drive reconstructable patches; exact Lead params remain only for non-reconstructable Lead sources.',
    };
  }

  if (/^lead[12](AlgorithmMode|UseCustomAdsr|Attack|Decay|Sustain|Release)$/.test(key)) {
    return {
      path: 'source-param-diff',
      evidence: [
        'src/audio/CoreProductLeadPatch.ts#leadAlgorithmPresetAEnabledFromState',
        'src/audio/CoreProductLeadPatch.ts#leadEnvelopeOverrideFromState',
        'src/audio/CoreProductRuntimeAdapter.ts#appendSourceParamDiffs',
        'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
      ],
      reason: 'Custom Lead ADSR and algorithm mode use structured Product Core source override fields for generated endpoint snapshots.',
    };
  }

  if (/^drum(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)Preset[AB]$/.test(key)) {
    return {
      path: 'drum-generated-preset-endpoint-diff',
      evidence: ['src/audio/CoreProductDrumPatch.ts#exactDrumPatchFromState', 'src/audio/CoreProductRuntimeAdapterSourcePresets.ts#appendCoreProductSourcePresetEndpointDiffs'],
      reason: 'Generated Drum preset endpoint IDs, morphs, source level, source reverb send, and sparse Drum overrides drive reconstructable patches; exact Drum params remain only for legacy exact-param compatibility.',
    };
  }

  if ([
    'sequencerMasterBPM',
    'synthEuclidBaseBPM',
    'drumEuclidBaseBPM',
    'phraseLength',
    'transportBeatsPerBar',
    'transportBarsPerPhrase',
    'transportPrimaryClock',
  ].includes(key)) {
    return {
      path: 'transport-param-diff',
      evidence: ['src/audio/coreProductSnapshot.ts#transportFromState', 'src/audio/CoreProductRuntimeAdapter.ts#appendTransportDiffs'],
    };
  }

  if (key === 'tension' || key === 'rootNote' || key === 'scaleMode' || key === 'manualScale') {
    return {
      path: 'harmony-param-diff',
      evidence: ['src/audio/coreProductSnapshot.ts#createCoreProductSnapshot', 'src/audio/CoreProductRuntimeAdapter.ts#appendHarmonyDiffs'],
    };
  }

  if (
    /^harmonyChord(Slots|SlotsA|SlotsB|Sequence|SequenceA|SequenceB)$/.test(key) ||
    key === 'manualHarmonyControl' ||
    key === 'harmonyMorphPercent' ||
    key === 'harmonyChordSequenceEnabled' ||
    key === 'harmonyChordSequenceStepIndex'
  ) {
    return {
      path: 'harmony-param-diff',
      evidence: [
        'src/audio/CoreProductHarmonyControl.ts#resolveProductHarmonyState',
        'src/audio/coreProductSnapshot.ts#createCoreProductSnapshot',
        'src/audio/CoreProductRuntimeAdapter.ts#appendHarmonyDiffs',
      ],
      reason: 'Structured harmony state resolves to Product harmony frame fields and generated harmony control/slot/sequence events.',
    };
  }

  if (key === 'synthHold' || key === 'pad2Hold') {
    return {
      path: 'sequencer-lane-diff',
      evidence: [
        'src/audio/coreProductSequencerHold.ts#coreProductPadEnvelopeGateSecondsFromState',
        'src/audio/CoreProductRuntimeAdapter.ts#SequencerLaneHoldSeconds',
        'cpp/KesshoCore/tests/ProductSequencerTests.cpp#KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID',
      ],
      reason: 'Pad hold controls are encoded as Product synth sequencer lane hold seconds, not Pad module ADSR params.',
    };
  }

  if (key === 'padFitEnvelopeToChord' || key === 'pad2FitEnvelopeToChord') {
    return {
      path: 'arrangement-scheduler-event',
      evidence: [
        'src/audio/coreProductSequencerHold.ts#coreProductPadEnvelopeGateSecondsFromState',
        'src/audio/coreProductEvents.ts#createCoreProductManualNoteEvent',
      ],
      reason: 'Pad fit-to-chord flags clamp generated manual-note gate lengths in host arrangement scheduling.',
    };
  }

  if ([
    'chordProgressionSteps',
    'chordProgressionClockSource',
    'chordProgressionEnabled',
    'chordProgressionPattern',
    'chordProgressionPhraseMultiplier',
    'chordProgressionStepEnabled',
    'chordRate',
    'cofDriftDirection',
    'cofDriftEnabled',
    'cofDriftRange',
    'cofDriftRate',
    'detune',
    'drumEuclidMasterEnabled',
    'harmonyClockSource',
    'lead1Density',
    'lead1Octave',
    'lead1OctaveRange',
    'leadRandomClockSource',
    'leadRandomEnabled',
    'leadRandomSource',
    'leadRandomSyncPolicy',
    'seedWindow',
    'synthChordGeneratorEnabled',
    'synthChordGeneratorSource',
    'synthChordGeneratorVoiceCount',
    'synthChordSequencer',
    'synthChordSequencerClockDivision',
    'synthChordSequencerEnabled',
    'synthChordSequencerSource',
    'synthChordSequencerVoiceCount',
    'synthEuclideanMasterEnabled',
    'synthOctave',
    'voicingSpread',
    'waveSpread',
  ].includes(key)) {
    return {
      path: 'arrangement-scheduler-event',
      evidence: ['src/audio/coreProductArrangementScheduler.ts', 'src/audio/coreProductArrangementPadChord.ts', 'src/audio/coreProductArrangementSchedulerUtils.ts', 'src/audio/coreProductEvents.ts#createCoreProductManualNoteEvent'],
      reason: 'Host arrangement scheduling turns this control into Product Core manual-note events and scheduler restarts rather than scalar Product params.',
    };
  }

  if (
    /^(oceanSample|water|birds|birds2|frogs|insects|insects2)(Enabled|Level|MorphA|MorphB|Preset|LayerHardDrops|LayerWaterDrops|LayerTurbulence|LayerBubbling|LayerSurf|LayerChannels)$/.test(key) ||
    key === 'insectsEngine' ||
    key === 'insects2Engine'
  ) {
    return {
      path: 'soundscape-structured-full-snapshot',
      evidence: ['src/audio/coreProductSoundscapesSnapshot.ts#soundscapeSnapshotPayloadFromState', 'src/audio/CoreProductRuntimeAdapter.ts#soundscapeSnapshotChanged'],
      reason: 'Soundscape texture/module controls are carried in dedicated Soundscape snapshot fields; structured Soundscape param changes are explicitly structural today.',
    };
  }

  if (key === 'randomness') {
    return {
      path: 'rng-seed-snapshot-policy',
      evidence: ['src/audio/coreProductSnapshot.ts#rngSeedFromState', 'src/audio/CoreProductRuntimeAdapter.ts#shouldForwardCoreProductRngDiffs'],
      reason: 'Randomness contributes to Product RNG seed material; ongoing RNG state is reconciled from Product telemetry unless a seed/state diff is explicitly forwarded.',
    };
  }

  if (
    /^(granular|delay|reverb|spectralFreeze|dynamics|drift|degrade|erosion|sidechain|endComp)/.test(key) ||
    ['density', 'grainSize', 'spray', 'drumDelayEnabled'].includes(key)
  ) {
    return {
      path: 'fx-param-diff',
      evidence: ['src/audio/coreProductSnapshot.ts#createCoreProductSnapshot', 'src/audio/CoreProductRuntimeAdapter.ts#appendFxRoutingMasterDiffs'],
    };
  }

  if (snapshotReferencedKeys.has(key)) {
    return {
      path: 'snapshot-referenced-unclassified',
      evidence: ['src/audio/coreProductSnapshot.ts', 'src/audio/CoreProductRuntimeAdapter.ts'],
      reason: 'This key is referenced by Product snapshot code but does not have a known app-visible live update classification yet.',
    };
  }

  return null;
}

function collectGeneratedSpecKeys(constName, keyFields) {
  const keys = new Set();
  const source = read('src/audio/generated/kesshoProductSchema.ts');
  const start = source.indexOf(`export const ${constName}`);
  if (start < 0) {
    return keys;
  }
  const end = source.indexOf(']) as', start);
  const body = end >= 0 ? source.slice(start, end) : source.slice(start);
  const fieldPattern = new RegExp(`"(?:${keyFields.join('|')})":\\s*"([A-Za-z][A-Za-z0-9_]*)"`, 'g');
  for (const match of body.matchAll(fieldPattern)) {
    keys.add(match[1]);
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
      'Source',
      'VoiceMask',
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
      'PositionSpray',
      'TimingSpray',
      'Lookback',
      'WriteGuard',
      'PitchMode',
      'PitchSpread',
      'PitchJitter',
      'PitchQuantize',
      'ReverseChance',
      'Bloom',
      'Glide',
      'CloudStyle',
      'AnchorPattern',
      'LoopCrossfade',
    ]) {
      keys.add(`granularV${voice}${suffix}`);
    }
  }
}

const GRANULAR_VOICE_RANGE_PARAM_SUFFIXES = [
  ['Speed', 'Speed'],
  ['ScanRate', 'ScanRate'],
  ['Pitch', 'Pitch'],
  ['WriteFollow', 'WriteFollow'],
  ['Density', 'Density'],
  ['GrainSize', 'GrainSizeMs'],
  ['Spray', 'Spray'],
  ['PositionSpray', 'PositionSpray'],
  ['TimingSpray', 'TimingSpray'],
  ['Lookback', 'Lookback'],
  ['WriteGuard', 'WriteGuard'],
  ['PitchSpread', 'PitchSpread'],
  ['PitchJitter', 'PitchJitterCents'],
  ['PitchQuantize', 'PitchQuantize'],
  ['ReverseChance', 'ReverseChance'],
  ['Bloom', 'Bloom'],
  ['Glide', 'Glide'],
  ['LoopCrossfade', 'LoopCrossfadeMs'],
  ['GrainOct', 'GrainOctaveProbability'],
  ['Attack', 'AttackSeconds'],
  ['Decay', 'DecaySeconds'],
  ['Gain', 'Gain'],
  ['Pan', 'Pan'],
  ['Blur', 'Blur'],
  ['StereoSpread', 'StereoSpread'],
  ['PosLFORate', 'PositionLfoRate'],
  ['PosLFODepth', 'PositionLfoDepth'],
  ['PanLFORate', 'PanLfoRate'],
  ['ReverseLFORate', 'ReverseLfoRate'],
  ['RecordLFORate', 'RecordLfoRate'],
];

function addDynamicGranularVoiceRangeKeys(keys) {
  for (let voice = 1; voice <= 4; voice += 1) {
    for (const [stateSuffix] of GRANULAR_VOICE_RANGE_PARAM_SUFFIXES) {
      keys.add(`granularV${voice}${stateSuffix}`);
    }
  }
}

function addDynamicDrumRangeKeys(keys, sliderKeys) {
  for (const key of sliderKeys) {
    if (!/^drum(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)/.test(key)) {
      continue;
    }
    if (/Morph$/.test(key) || /Expression/i.test(key) || /DelaySend/i.test(key) || /Distance/i.test(key)) {
      keys.add(key);
    }
  }
}

const PRODUCT_STATE_GETTER_NAMES = new Set([
  'numberFromState',
  'booleanFromState',
  'stringFromState',
  'clockDivisionFromState',
  'delayDivisionMs',
  'midiCenterFromState',
  'synthSourceIdFromState',
  'distanceAdjustedNumberFromState',
  'distanceAdjustedLeadHoldSecondsFromState',
]);

const PRODUCT_SNAPSHOT_KEY_PATHS = [
  'src/audio/coreProductSnapshot.ts',
  'src/audio/CoreProductHarmonyControl.ts',
  'src/audio/coreProductSoundscapesSnapshot.ts',
  'src/audio/CoreProductLeadPatch.ts',
  'src/audio/CoreProductPadPatch.ts',
  'src/audio/CoreProductDrumPatch.ts',
  'src/audio/coreProductDelaySnapshot.ts',
  'src/audio/coreProductReverbSnapshot.ts',
  'src/audio/coreProductSequencerFaceSnapshot.ts',
  'src/audio/coreProductSequencerHold.ts',
  'src/audio/coreProductAssets.ts',
  'src/audio/coreProductArrangementPadChord.ts',
  'src/audio/coreProductArrangementScheduler.ts',
  'src/audio/coreProductArrangementSchedulerUtils.ts',
  'src/audio/coreProductChordSequencerClock.ts',
  'src/audio/granularMacroCore.ts',
  'src/audio/transport.ts',
];

function collectStateReferencedKeysInProductFiles(sliderKeys, paths) {
  const keys = new Set();
  for (const path of paths) {
    const file = sourceFile(path);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const name = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression)
            ? expression.name.text
            : '';
        if (PRODUCT_STATE_GETTER_NAMES.has(name)) {
          for (const argument of node.arguments) {
            if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
              keys.add(argument.text);
            }
          }
        }
      }
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && sliderKeys.has(node.text)) {
        keys.add(node.text);
      }
      if (ts.isPropertyAccessExpression(node) && sliderKeys.has(node.name.text)) {
        keys.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return keys;
}

function addGeneratedProductSnapshotKeys(keys) {
  for (const key of collectGeneratedSpecKeys('KESSHO_PRODUCT_PAD_PARAM_SPECS', ['key', 'pad2Key'])) {
    keys.add(key);
  }
  for (const key of collectGeneratedSpecKeys('KESSHO_PRODUCT_LEAD_PARAM_SPECS', ['presetAKey', 'presetBKey', 'morphKey'])) {
    keys.add(key);
  }
  for (const key of collectGeneratedSpecKeys('KESSHO_PRODUCT_DRUM_PARAM_SPECS', ['key'])) {
    keys.add(key);
  }
  for (const prefix of ['lead1', 'lead2']) {
    for (const suffix of ['UseCustomAdsr', 'Attack', 'Decay', 'Sustain', 'Hold', 'Release', 'AlgorithmMode']) {
      keys.add(`${prefix}${suffix}`);
    }
  }
}

function collectProductSnapshotReferencedKeys(sliderKeys) {
  const keys = collectStateReferencedKeysInProductFiles(sliderKeys, PRODUCT_SNAPSHOT_KEY_PATHS);
  addGeneratedProductSnapshotKeys(keys);
  addDynamicSequencerKeys(keys);
  addDynamicGranularVoiceKeys(keys);
  return keys;
}

function collectRangeTargetKeys(sliderKeys) {
  const keys = objectKeysInConst('src/audio/coreProductEvents.ts', 'RANGE_KEY_TARGETS');
  for (const key of collectGeneratedSpecKeys('KESSHO_PRODUCT_PAD_PARAM_SPECS', ['key', 'pad2Key'])) {
    keys.add(key);
  }
  for (const key of collectGeneratedSpecKeys('KESSHO_PRODUCT_DRUM_PARAM_SPECS', ['key'])) {
    keys.add(key);
  }
  addDynamicGranularVoiceRangeKeys(keys);
  addDynamicDrumRangeKeys(keys, sliderKeys);
  return keys;
}

function collectGeneratedParamMacros() {
  const macros = new Map();
  const header = read('cpp/KesshoCore/generated/KesshoProductParamIds.h');
  const generatedParams = JSON.parse(read('cpp/KesshoCore/schema/kessho_product_params.schema.json')).params;
  const macrosById = new Map();
  for (const match of header.matchAll(/#define\s+(KESSHO_PRODUCT_PARAM_[A-Z0-9_]+_ID)\s+([0-9]+)u/g)) {
    macrosById.set(Number(match[2]), match[1]);
  }
  for (const param of generatedParams) {
    const macro = macrosById.get(param.id);
    if (macro) {
      macros.set(param.name, macro);
    }
  }
  return macros;
}

function collectTsParamIdReferences(path) {
  const names = new Set();
  const source = read(path);
  for (const match of source.matchAll(/KESSHO_PRODUCT_PARAM_IDS\.([A-Za-z0-9_]+)/g)) {
    names.add(match[1]);
  }
  return names;
}

function collectProductParamCoverage() {
  const nativeSources = [
    'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
    'cpp/KesshoCore/src/product/sources/ProductSources.cpp',
    'cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp',
    'cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp',
  ].map(read).join('\n');
  const macros = collectGeneratedParamMacros();
  const referencedParamNames = new Set([
    ...collectTsParamIdReferences('src/audio/coreProductEvents.ts'),
    ...collectTsParamIdReferences('src/audio/CoreProductRuntimeAdapter.ts'),
    ...collectTsParamIdReferences('src/audio/CoreProductRuntimeAdapterSequencerFaces.ts'),
  ]);
  for (const [, paramSuffix] of GRANULAR_VOICE_RANGE_PARAM_SUFFIXES) {
    for (let voice = 1; voice <= 4; voice += 1) {
      referencedParamNames.add(`FxGranularV${voice}${paramSuffix}`);
    }
  }
  const missingNative = [];
  const coveredNative = [];
  for (const name of [...referencedParamNames].sort()) {
    const macro = macros.get(name);
    const coveredByRangeHandler =
      /^FxGranularV[1-4]/.test(name) ||
      /^FxDynamicsMod/.test(name);
    const covered = coveredByRangeHandler || (macro ? nativeSources.includes(macro) : false);
    if (covered) {
      coveredNative.push({ name, macro: macro ?? null, coveredByRangeHandler });
    } else {
      missingNative.push({ name, macro: macro ?? null });
    }
  }
  return {
    referencedParamNames,
    missingNative,
    coveredNative,
  };
}

function collectProductWiredKeys(sliderKeys) {
  const keys = collectProductSnapshotReferencedKeys(sliderKeys);
  for (const key of objectKeysInConst('src/audio/coreProductEvents.ts', 'RANGE_KEY_TARGETS')) {
    keys.add(key);
  }
  for (const key of ['synthSequencerChain', 'drumSequencerChain']) {
    if (sliderKeys.has(key)) keys.add(key);
  }

  return keys;
}

const sliderKeys = collectSliderStateKeys();
const paramRegistryEntries = collectParamRegistryEntries();
const registryKeys = new Set(paramRegistryEntries.keys());
const productWiredKeys = collectProductWiredKeys(sliderKeys);
const productWiredSliderKeys = [...sliderKeys].filter((key) => productWiredKeys.has(key)).sort();
const snapshotReferencedKeys = collectProductSnapshotReferencedKeys(sliderKeys);
const rangeTargetKeys = collectRangeTargetKeys(sliderKeys);
const paramCoverage = collectProductParamCoverage();
const defaultNumericValues = collectDefaultNumericValues();
const quantizationRanges = collectQuantizationRanges();
const defaultsOutsideQuantization = [];
const postLpfBoundedNumberRangeMismatches = collectPostLpfBoundedNumberRangeMismatches();
const staleDeferredCoverage = [];
const liveRangeWithoutSnapshotCoverage = [];
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
    const staleClassification = classifyDeferredKey(key);
    if (staleClassification && staleClassification.allowWiredReferences !== true) {
      staleDeferredCoverage.push({
        key,
        classification: staleClassification.id,
        owner: staleClassification.owner,
      });
    }
    if (rangeTargetKeys.has(key) && !snapshotReferencedKeys.has(key)) {
      liveRangeWithoutSnapshotCoverage.push({
        key,
        domain: controlDomain(key),
      });
    }
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

const missingDeferredInventoryEntries = [];
const unexpectedDeferredInventoryEntries = [];
const deferredWaiverInventory = productDeferredClassifications.map((classification) => {
  const expectedKeys = EXPECTED_DEFERRED_KEYS_BY_CLASSIFICATION[classification.id] ?? [];
  const actualKeys = deferred
    .filter((entry) => entry.classification === classification.id)
    .map((entry) => entry.key)
    .sort();
  const expectedSet = new Set(expectedKeys);
  const actualSet = new Set(actualKeys);
  for (const key of expectedKeys) {
    if (!actualSet.has(key)) {
      missingDeferredInventoryEntries.push({
        key,
        classification: classification.id,
        owner: classification.owner,
        reason: 'expected waiver no longer matches an unwired control',
      });
    }
  }
  for (const key of actualKeys) {
    if (!expectedSet.has(key)) {
      unexpectedDeferredInventoryEntries.push({
        key,
        classification: classification.id,
        owner: classification.owner,
        reason: 'new unwired control matched a broad waiver pattern but is not explicitly inventoried',
      });
    }
  }
  return {
    classification: classification.id,
    owner: classification.owner,
    reason: classification.reason,
    expectedKeys: [...expectedKeys].sort(),
    actualKeys,
    missingExpectedKeys: expectedKeys.filter((key) => !actualSet.has(key)).sort(),
    unexpectedActualKeys: actualKeys.filter((key) => !expectedSet.has(key)).sort(),
  };
});

const appVisibleControlReferences = collectAppVisibleControlReferences(sliderKeys);
const appVisibleControlKeys = [...appVisibleControlReferences.references.keys()].sort();
const appVisibleInteractiveControlKeys = appVisibleControlKeys
  .filter((key) => (appVisibleControlReferences.references.get(key)?.controlRefs.length ?? 0) > 0)
  .sort();
const appVisibleSliderControlKeys = appVisibleControlKeys
  .filter((key) => (appVisibleControlReferences.references.get(key)?.sliderRefs.length ?? 0) > 0)
  .sort();
const appVisibleUnaccountedControls = appVisibleInteractiveControlKeys
  .filter((key) => !productWiredKeys.has(key) && !deferred.some((entry) => entry.key === key))
  .map((key) => ({
    key,
    domain: controlDomain(key),
    refs: appVisibleControlReferences.references.get(key)?.controlRefs.slice(0, 5) ?? [],
  }));
const appVisibleDeferredControls = appVisibleInteractiveControlKeys
  .map((key) => {
    const deferredEntry = deferred.find((entry) => entry.key === key);
    if (!deferredEntry) return null;
    return {
      key,
      domain: controlDomain(key),
      classification: deferredEntry.classification,
      owner: deferredEntry.owner,
      refs: appVisibleControlReferences.references.get(key)?.controlRefs.slice(0, 5) ?? [],
    };
  })
  .filter(Boolean);
const appVisibleProductWiredControlsWithoutDirectRangeEvent = appVisibleSliderControlKeys
  .filter((key) => productWiredKeys.has(key) && !rangeTargetKeys.has(key))
  .map((key) => ({
    key,
    domain: controlDomain(key),
    refs: appVisibleControlReferences.references.get(key)?.sliderRefs.slice(0, 5) ?? [],
  }));
const appVisibleLiveUpdatePaths = appVisibleInteractiveControlKeys
  .filter((key) => productWiredKeys.has(key))
  .map((key) => ({
    key,
    domain: controlDomain(key),
    ...(appVisibleLiveUpdatePathForKey(key, rangeTargetKeys, snapshotReferencedKeys) ?? {
      path: null,
      evidence: [],
      reason: 'No Product live update path classification matched this app-visible Product-wired control.',
    }),
    refs: appVisibleControlReferences.references.get(key)?.controlRefs.slice(0, 5) ?? [],
  }));
const appVisibleProductWiredControlsWithoutLiveUpdatePath = appVisibleLiveUpdatePaths
  .filter((entry) => entry.path === null || entry.path === 'snapshot-referenced-unclassified')
  .map((entry) => ({
    key: entry.key,
    domain: entry.domain,
    path: entry.path,
    reason: entry.reason,
    refs: entry.refs,
  }));
const appVisibleLiveUpdatePathCounts = appVisibleLiveUpdatePaths.reduce((counts, entry) => {
  const path = entry.path ?? 'unclassified';
  counts[path] = (counts[path] ?? 0) + 1;
  return counts;
}, {});
const appVisibleStructuralPolicyInventory = collectAppVisibleStructuralPolicyInventory(appVisibleLiveUpdatePaths);
const appVisibleBehaviorEvidenceInventory = collectAppVisibleBehaviorEvidenceGaps(appVisibleLiveUpdatePaths);

const controlCoverageMatrix = [...sliderKeys].sort().map((key) => {
  const deferredEntry = deferred.find((entry) => entry.key === key) ?? null;
  const domain = controlDomain(key);
  const appVisibleEntry = appVisibleControlReferences.references.get(key) ?? null;
  const liveUpdatePath = appVisibleLiveUpdatePaths.find((entry) => entry.key === key) ?? null;
  const behaviorEvidenceGroup = liveUpdatePath?.path ? `${domain}|${liveUpdatePath.path}` : null;
  const appVisibleBehaviorEvidence = behaviorEvidenceGroup
    ? behaviorEvidenceByAppVisibleGroup[behaviorEvidenceGroup] ?? null
    : null;
  const structuralPolicy = liveUpdatePath?.path
    ? EXPECTED_APP_VISIBLE_STRUCTURAL_POLICY_BY_PATH[liveUpdatePath.path] ?? null
    : null;
  return {
    key,
    domain,
    appVisible: appVisibleEntry !== null,
    appVisibleInteractiveControl: (appVisibleEntry?.controlRefs.length ?? 0) > 0,
    appVisibleSliderControl: (appVisibleEntry?.sliderRefs.length ?? 0) > 0,
    inParamRegistry: registryKeys.has(key),
    productWired: productWiredKeys.has(key),
    snapshotReferenced: snapshotReferencedKeys.has(key),
    liveRangeTarget: rangeTargetKeys.has(key),
    liveUpdatePath: liveUpdatePath?.path ?? null,
    structuralPolicy: structuralPolicy === null ? null : {
      owner: structuralPolicy.owner,
      reason: structuralPolicy.reason,
    },
    behaviorEvidence: behaviorEvidenceByDomain[domain] ?? behaviorEvidenceByDomain.misc,
    appVisibleBehaviorEvidence: appVisibleBehaviorEvidence === null ? null : {
      group: behaviorEvidenceGroup,
      owner: appVisibleBehaviorEvidence.owner,
      reason: appVisibleBehaviorEvidence.reason,
      evidence: appVisibleBehaviorEvidence.evidence,
    },
    deferred: deferredEntry === null ? null : {
      classification: deferredEntry.classification,
      owner: deferredEntry.owner,
      reason: deferredEntry.reason,
    },
  };
});

const controlCoverageCountsByDomain = {};
for (const entry of controlCoverageMatrix) {
  controlCoverageCountsByDomain[entry.domain] ??= {
    sliderKeys: 0,
    productWired: 0,
    snapshotReferenced: 0,
    liveRangeTargets: 0,
    deferred: 0,
  };
  controlCoverageCountsByDomain[entry.domain].sliderKeys += 1;
  if (entry.productWired) controlCoverageCountsByDomain[entry.domain].productWired += 1;
  if (entry.snapshotReferenced) controlCoverageCountsByDomain[entry.domain].snapshotReferenced += 1;
  if (entry.liveRangeTarget) controlCoverageCountsByDomain[entry.domain].liveRangeTargets += 1;
  if (entry.deferred) controlCoverageCountsByDomain[entry.domain].deferred += 1;
}
const behaviorEvidenceGaps = collectBehaviorEvidenceGaps(controlCoverageCountsByDomain);
const paramRegistryOmissionMap = new Map(EXPECTED_PARAM_REGISTRY_OMISSIONS.map((entry) => [entry.key, entry]));
const paramRegistryOmissions = [...sliderKeys]
  .filter((key) => !registryKeys.has(key))
  .sort()
  .map((key) => ({
    key,
    domain: controlDomain(key),
    productWired: productWiredKeys.has(key),
    deferred: deferred.find((entry) => entry.key === key)?.classification ?? null,
    reason: paramRegistryOmissionMap.get(key)?.reason ?? null,
  }));
const unexpectedParamRegistryOmissions = paramRegistryOmissions.filter((entry) => !paramRegistryOmissionMap.has(entry.key));
const missingParamRegistryOmissions = EXPECTED_PARAM_REGISTRY_OMISSIONS
  .filter((entry) => registryKeys.has(entry.key) || !sliderKeys.has(entry.key))
  .map((entry) => ({
    ...entry,
    presentInRegistry: registryKeys.has(entry.key),
    presentInSliderState: sliderKeys.has(entry.key),
  }));
const presetPayloadCoverage = collectPresetPayloadScopeGaps(
  FACTORY_PRESET_PAYLOAD_SCOPE_CHECKS,
  paramRegistryEntries,
  EXPECTED_PARAM_REGISTRY_OMISSIONS,
);

const controlCoverageReport = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status:
    unaccounted.length === 0 &&
    staleDeferredCoverage.length === 0 &&
    liveRangeWithoutSnapshotCoverage.length === 0 &&
    paramCoverage.missingNative.length === 0 &&
    behaviorEvidenceGaps.length === 0 &&
    missingDeferredInventoryEntries.length === 0 &&
    unexpectedDeferredInventoryEntries.length === 0 &&
    unexpectedParamRegistryOmissions.length === 0 &&
    missingParamRegistryOmissions.length === 0 &&
    presetPayloadCoverage.failures.length === 0 &&
    appVisibleControlReferences.invalid.length === 0 &&
    appVisibleUnaccountedControls.length === 0 &&
    appVisibleProductWiredControlsWithoutLiveUpdatePath.length === 0 &&
    appVisibleStructuralPolicyInventory.unexpected.length === 0 &&
    appVisibleStructuralPolicyInventory.missing.length === 0 &&
    appVisibleBehaviorEvidenceInventory.missingInventory.length === 0 &&
    appVisibleBehaviorEvidenceInventory.staleInventory.length === 0 &&
    appVisibleBehaviorEvidenceInventory.evidenceGaps.length === 0
      ? 'pass'
      : 'fail',
  counts: {
    sliderStateKeys: sliderKeys.size,
    productWiredSliderKeys: productWiredSliderKeys.length,
    snapshotReferencedSliderKeys: [...snapshotReferencedKeys].filter((key) => sliderKeys.has(key)).length,
    liveRangeTargetSliderKeys: [...rangeTargetKeys].filter((key) => sliderKeys.has(key)).length,
    explicitlyDeferredOrLegacyKeys: deferred.length,
    staleDeferredCoverage: staleDeferredCoverage.length,
    liveRangeWithoutSnapshotCoverage: liveRangeWithoutSnapshotCoverage.length,
    referencedProductParamIds: paramCoverage.referencedParamNames.size,
    missingNativeProductParamHandlers: paramCoverage.missingNative.length,
    behaviorEvidenceGaps: behaviorEvidenceGaps.length,
    missingDeferredInventoryEntries: missingDeferredInventoryEntries.length,
    unexpectedDeferredInventoryEntries: unexpectedDeferredInventoryEntries.length,
    paramRegistryOmissions: paramRegistryOmissions.length,
    unexpectedParamRegistryOmissions: unexpectedParamRegistryOmissions.length,
    missingParamRegistryOmissions: missingParamRegistryOmissions.length,
    presetPayloadScopeGaps: presetPayloadCoverage.failures.length,
    presetPayloadExplicitOmissions: presetPayloadCoverage.explicitOmissions.length,
    appVisibleControlKeys: appVisibleControlKeys.length,
    appVisibleInteractiveControlKeys: appVisibleInteractiveControlKeys.length,
    appVisibleSliderControlKeys: appVisibleSliderControlKeys.length,
    invalidUiControlReferences: appVisibleControlReferences.invalid.length,
    appVisibleUnaccountedControls: appVisibleUnaccountedControls.length,
    appVisibleDeferredControls: appVisibleDeferredControls.length,
    appVisibleProductWiredControlsWithoutDirectRangeEvent: appVisibleProductWiredControlsWithoutDirectRangeEvent.length,
    appVisibleProductWiredControlsWithoutLiveUpdatePath: appVisibleProductWiredControlsWithoutLiveUpdatePath.length,
    appVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.controls.length,
    unexpectedAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.unexpected.length,
    missingAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.missing.length,
    appVisibleBehaviorEvidenceGroups: Object.keys(appVisibleBehaviorEvidenceInventory.inventory).length,
    missingAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.missingInventory.length,
    staleAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.staleInventory.length,
    appVisibleBehaviorEvidenceGaps: appVisibleBehaviorEvidenceInventory.evidenceGaps.length,
  },
  domains: controlCoverageCountsByDomain,
  appVisibleLiveUpdatePathCounts,
  appVisibleStructuralPolicyCounts: appVisibleStructuralPolicyInventory.countsByPath,
  appVisibleStructuralPolicyInventory: appVisibleStructuralPolicyInventory.policyInventory,
  appVisibleBehaviorEvidenceInventory: appVisibleBehaviorEvidenceInventory.inventory,
  staleDeferredCoverage,
  liveRangeWithoutSnapshotCoverage,
  missingNativeProductParamHandlers: paramCoverage.missingNative,
  behaviorEvidenceGaps,
  deferredWaiverInventory,
  missingDeferredInventoryEntries,
  unexpectedDeferredInventoryEntries,
  paramRegistryOmissions,
  unexpectedParamRegistryOmissions,
  missingParamRegistryOmissions,
  presetPayloadScopeGaps: presetPayloadCoverage.failures,
  presetPayloadExplicitOmissions: presetPayloadCoverage.explicitOmissions,
  invalidUiControlReferences: appVisibleControlReferences.invalid,
  appVisibleUnaccountedControls,
  appVisibleDeferredControls,
  appVisibleProductWiredControlsWithoutDirectRangeEvent,
  appVisibleLiveUpdatePaths,
  appVisibleProductWiredControlsWithoutLiveUpdatePath,
  appVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.controls,
  unexpectedAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.unexpected,
  missingAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.missing,
  missingAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.missingInventory,
  staleAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.staleInventory,
  appVisibleBehaviorEvidenceGaps: appVisibleBehaviorEvidenceInventory.evidenceGaps,
  deferred,
  matrix: controlCoverageMatrix,
};

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status:
    unaccounted.length === 0 &&
    defaultsOutsideQuantization.length === 0 &&
    postLpfBoundedNumberRangeMismatches.length === 0 &&
    staleDeferredCoverage.length === 0 &&
    liveRangeWithoutSnapshotCoverage.length === 0 &&
    paramCoverage.missingNative.length === 0 &&
    behaviorEvidenceGaps.length === 0 &&
    missingDeferredInventoryEntries.length === 0 &&
    unexpectedDeferredInventoryEntries.length === 0 &&
    unexpectedParamRegistryOmissions.length === 0 &&
    missingParamRegistryOmissions.length === 0 &&
    presetPayloadCoverage.failures.length === 0 &&
    appVisibleControlReferences.invalid.length === 0 &&
    appVisibleUnaccountedControls.length === 0 &&
    appVisibleProductWiredControlsWithoutLiveUpdatePath.length === 0 &&
    appVisibleStructuralPolicyInventory.unexpected.length === 0 &&
    appVisibleStructuralPolicyInventory.missing.length === 0 &&
    appVisibleBehaviorEvidenceInventory.missingInventory.length === 0 &&
    appVisibleBehaviorEvidenceInventory.staleInventory.length === 0 &&
    appVisibleBehaviorEvidenceInventory.evidenceGaps.length === 0
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
    staleDeferredCoverage: staleDeferredCoverage.length,
    liveRangeWithoutSnapshotCoverage: liveRangeWithoutSnapshotCoverage.length,
    referencedProductParamIds: paramCoverage.referencedParamNames.size,
    missingNativeProductParamHandlers: paramCoverage.missingNative.length,
    behaviorEvidenceGaps: behaviorEvidenceGaps.length,
    missingDeferredInventoryEntries: missingDeferredInventoryEntries.length,
    unexpectedDeferredInventoryEntries: unexpectedDeferredInventoryEntries.length,
    paramRegistryOmissions: paramRegistryOmissions.length,
    unexpectedParamRegistryOmissions: unexpectedParamRegistryOmissions.length,
    missingParamRegistryOmissions: missingParamRegistryOmissions.length,
    presetPayloadScopeGaps: presetPayloadCoverage.failures.length,
    presetPayloadExplicitOmissions: presetPayloadCoverage.explicitOmissions.length,
    appVisibleControlKeys: appVisibleControlKeys.length,
    appVisibleInteractiveControlKeys: appVisibleInteractiveControlKeys.length,
    appVisibleSliderControlKeys: appVisibleSliderControlKeys.length,
    invalidUiControlReferences: appVisibleControlReferences.invalid.length,
    appVisibleUnaccountedControls: appVisibleUnaccountedControls.length,
    appVisibleDeferredControls: appVisibleDeferredControls.length,
    appVisibleProductWiredControlsWithoutDirectRangeEvent: appVisibleProductWiredControlsWithoutDirectRangeEvent.length,
    appVisibleProductWiredControlsWithoutLiveUpdatePath: appVisibleProductWiredControlsWithoutLiveUpdatePath.length,
    appVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.controls.length,
    unexpectedAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.unexpected.length,
    missingAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.missing.length,
    appVisibleBehaviorEvidenceGroups: Object.keys(appVisibleBehaviorEvidenceInventory.inventory).length,
    missingAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.missingInventory.length,
    staleAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.staleInventory.length,
    appVisibleBehaviorEvidenceGaps: appVisibleBehaviorEvidenceInventory.evidenceGaps.length,
  },
  deferredCounts,
  appVisibleLiveUpdatePathCounts,
  appVisibleStructuralPolicyCounts: appVisibleStructuralPolicyInventory.countsByPath,
  appVisibleStructuralPolicyInventory: appVisibleStructuralPolicyInventory.policyInventory,
  appVisibleBehaviorEvidenceInventory: appVisibleBehaviorEvidenceInventory.inventory,
  deferredWaiverInventory,
  deferred,
  unaccounted,
  staleDeferredCoverage,
  liveRangeWithoutSnapshotCoverage,
  missingNativeProductParamHandlers: paramCoverage.missingNative,
  behaviorEvidenceGaps,
  missingDeferredInventoryEntries,
  unexpectedDeferredInventoryEntries,
  paramRegistryOmissions,
  unexpectedParamRegistryOmissions,
  missingParamRegistryOmissions,
  presetPayloadScopeGaps: presetPayloadCoverage.failures,
  presetPayloadExplicitOmissions: presetPayloadCoverage.explicitOmissions,
  invalidUiControlReferences: appVisibleControlReferences.invalid,
  appVisibleUnaccountedControls,
  appVisibleDeferredControls,
  appVisibleProductWiredControlsWithoutDirectRangeEvent,
  appVisibleLiveUpdatePaths,
  appVisibleProductWiredControlsWithoutLiveUpdatePath,
  appVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.controls,
  unexpectedAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.unexpected,
  missingAppVisibleStructuralPolicyControls: appVisibleStructuralPolicyInventory.missing,
  missingAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.missingInventory,
  staleAppVisibleBehaviorEvidenceGroups: appVisibleBehaviorEvidenceInventory.staleInventory,
  appVisibleBehaviorEvidenceGaps: appVisibleBehaviorEvidenceInventory.evidenceGaps,
  defaultsOutsideQuantization,
  postLpfBoundedNumberRangeMismatches,
};

write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
write(productControlCoverageReportPath, `${JSON.stringify(controlCoverageReport, null, 2)}\n`);

assert(
  read('docs/kessho-product-control-classification.md').includes('## Parameter Accounting'),
  'docs/kessho-product-control-classification.md must include Parameter Accounting policy',
);
assert(
  read('src/audio/CoreProductLeadPatch.ts').includes('leadEnvelopeOverrideFromState') &&
    read('src/audio/CoreProductLeadPatch.ts').includes('leadAlgorithmPresetAEnabledFromState') &&
    read('src/audio/CoreProductRuntimeAdapter.ts').includes('SourceLeadEnvelopeOverrideEnabled') &&
    read('src/audio/CoreProductRuntimeAdapter.ts').includes('SourceLeadAlgorithmPresetAEnabled'),
  'Lead custom ADSR and algorithm controls must stay wired through structured Lead override fields',
);
assert(
  read('src/audio/coreProductEvents.ts').includes('KESSHO_PRODUCT_SOURCE_IDS as GENERATED_PRODUCT_SOURCE_IDS') &&
    read('src/audio/coreProductEvents.ts').includes('pad1: GENERATED_PRODUCT_SOURCE_IDS.Pad1') &&
    read('src/audio/coreProductEvents.ts').includes('soundscape: GENERATED_PRODUCT_SOURCE_IDS.Soundscape'),
  'Product source IDs must be derived from generated schema metadata, not hand-numbered in coreProductEvents.ts',
);
assert(
  !/const\s+PAD_[A-Z0-9_]+_PARAM_INDEX\s*=\s*\d+/.test(read('src/audio/CoreProductPadPatch.ts')) &&
    read('src/audio/CoreProductPadPatch.ts').includes('generatedProductParamIndex(KESSHO_PRODUCT_PAD_PARAM_SPECS'),
  'Pad patch param indexes must be derived from generated Product param specs',
);
assert(
  !/const\s+LEAD_[A-Z0-9_]+_PARAM_INDEX\s*=\s*\d+/.test(read('src/audio/CoreProductLeadPatch.ts')) &&
    read('src/audio/CoreProductLeadPatch.ts').includes('generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS'),
  'Lead patch param indexes must be derived from generated Product param specs',
);
assert(
  !/const\s+DRUM_[A-Z0-9_]+_PARAM(?:_ID)?(?:_INDEX)?\s*=\s*\d+/.test(read('src/audio/CoreProductDrumPatch.ts')) &&
    read('src/audio/CoreProductDrumPatch.ts').includes("generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumLevel')") &&
    read('src/audio/CoreProductDrumPatch.ts').includes("generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumReverbSend')"),
  'Drum patch source-level param indexes must be derived from generated Product drum param specs',
);
assert(
  !/CORE_PRODUCT_DRUM_[A-Z0-9_]+_PARAM_INDEX\s*=\s*\d+/.test(read('src/audio/coreProductEvents.ts')) &&
    read('src/audio/coreProductEvents.ts').includes("generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumLevel')") &&
    read('src/audio/coreProductEvents.ts').includes("generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumReverbSend')"),
  'Drum runtime range target indexes must be derived from generated Product drum param specs',
);
assert(
  read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"soundscapeParamLayout"') &&
    read('src/audio/coreProductSoundscapesSnapshot.ts').includes('KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_PARAM_COUNT') &&
    read('src/audio/coreProductSoundscapesSnapshot.ts').includes('KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT') &&
	    !read('src/audio/coreProductSoundscapesSnapshot.ts').includes('SOUNDSCAPE_ROUTE_PARAM_COUNT = 16') &&
	    !read('src/audio/coreProductSoundscapesSnapshot.ts').includes('SOUNDSCAPES_MODULE_PARAM_COUNT = 96') &&
	    read('cpp/KesshoCore/src/product/ProductConstants.h').includes('KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_PARAM_COUNT') &&
	    read('cpp/KesshoCore/src/product/ProductConstants.h').includes('KESSHO_PRODUCT_GENERATED_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT'),
  'Soundscape Product param layout counts must derive from generated Product schema metadata in TS and C++',
);
assert(
  read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"sourceParamLayout"') &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("requiredSourceParamLayout('pad')") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("requiredSourceParamLayout('lead')") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("requiredSourceParamLayout('drum')") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("requiredIndexArray(padParamLayout, 'presetSnapParamIndices', 'pad')") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("requiredIndexArray(leadParamLayout, 'presetRoundParamIndices', 'lead')") &&
    !/const\s+(padParamCount|leadParamCount|drumParamCount)\s*=\s*\d+/.test(read('scripts/generate-kessho-product-bindings.mjs')) &&
    !/const\s+(padPresetSnapParamIndices|leadPresetSnapParamIndices|leadPresetRoundParamIndices|drumPresetSnapParamIndices)\s*=\s*\[/.test(read('scripts/generate-kessho-product-bindings.mjs')),
  'Pad/Lead/Drum source param counts and preset snap/round index metadata must derive from schema.sourceParamLayout',
);
assert(
  read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"sourceParamSpecs"') &&
    read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"padOscAWave"') &&
    read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"padModEnvDest"') &&
    read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"algorithm"') &&
    read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"lfoTarget"') &&
    read('cpp/KesshoCore/schema/kessho_product_drum_params.schema.json').includes('"drumClickMode"') &&
    read('cpp/KesshoCore/schema/kessho_product_drum_params.schema.json').includes('"defaultParamValues"') &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("const padParamSpecs = requiredSourceParamSpecs('pad', padParamCount)") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("const leadParamSpecs = requiredSourceParamSpecs('lead', leadParamCount)") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("const drumParamSpecs = normalizeSourceParamSpecs('drum', drumParamCount, drumParamManifest.paramSpecs)") &&
    !/const\s+padParamSpecs\s*=\s*\[/.test(read('scripts/generate-kessho-product-bindings.mjs')) &&
    !/const\s+leadParamSpecs\s*=\s*\[/.test(read('scripts/generate-kessho-product-bindings.mjs')) &&
    !/const\s+drumParamSpecs\s*=\s*\[/.test(read('scripts/generate-kessho-product-bindings.mjs')) &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('padWaveValues') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('padDestValues') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('leadAlgorithmValues') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('leadLfoTargetValues') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('drumClickModeValues') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('drumMembraneMaterialValues'),
  'Pad/Lead/Drum param specs, enum maps, indexes, and fallbacks must derive from schema manifests',
);
assert(
  read('cpp/KesshoCore/schema/kessho_product.schema.json').includes('"outputTrims"') &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("const padOutputTrim = requiredProductOutputTrim('pad')") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("const leadOutputTrim = requiredProductOutputTrim('lead')") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes("const reverbOutputTrim = requiredProductOutputTrim('reverb')") &&
    !/const\s+(padOutputTrim|leadOutputTrim|reverbOutputTrim)\s*=\s*\d/.test(read('scripts/generate-kessho-product-bindings.mjs')),
  'Product output trims must derive from schema.outputTrims instead of generator-local constants',
);
assert(
  read('cpp/KesshoCore/schema/kessho_product_drum_params.schema.json').includes('"voiceParamRanges"') &&
    read('cpp/KesshoCore/schema/kessho_product_drum_params.schema.json').includes('"voicePresetExportNames"') &&
    read('scripts/generate-kessho-product-bindings.mjs').includes('requiredDrumVoiceParamRanges(drumParamManifest)') &&
    read('scripts/generate-kessho-product-bindings.mjs').includes('requiredDrumVoicePresetExportNames(drumParamManifest)') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('const drumParamIndex =') &&
    !/const\s+drumVoiceParamRanges\s*=\s*\{/.test(read('scripts/generate-kessho-product-bindings.mjs')) &&
    !/const\s+drumVoicePresetExportNames\s*=\s*\{/.test(read('scripts/generate-kessho-product-bindings.mjs')),
  'Drum voice param ranges and preset export names must derive from the Drum schema manifest',
);
assert(
    read('scripts/generate-kessho-product-bindings.mjs').includes("loadBundledTsModule('src/audio/lead4opfm.ts')") &&
    read('scripts/generate-kessho-product-bindings.mjs').includes('leadPresetModule.DEFAULT_SOFT_RHODES') &&
    read('scripts/generate-kessho-product-bindings.mjs').includes('leadPresetModule.DEFAULT_GAMELAN') &&
    read('scripts/generate-kessho-product-bindings.mjs').includes('leadPresetModule.morphPresets(leadPreset, leadPreset, 0)') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('const defaultLeadPresets =') &&
    !read('scripts/generate-kessho-product-bindings.mjs').includes('function morphedLeadParams'),
  'Lead source preset exact patch material and morph logic must come from the Lead4opFM preset module, not generator-local copies',
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
  staleDeferredCoverage.length === 0,
  `Deferred Product Core classifications matched already-wired controls: ${staleDeferredCoverage
    .map((entry) => `${entry.key}:${entry.classification}`)
    .join(', ')}`,
);
assert(
  liveRangeWithoutSnapshotCoverage.length === 0,
  `Live Product Core range controls must also be represented in snapshot/full-reload coverage: ${liveRangeWithoutSnapshotCoverage
    .map((entry) => entry.key)
    .join(', ')}`,
);
assert(
  paramCoverage.missingNative.length === 0,
  `Live Product Core param IDs must have native event handlers: ${paramCoverage.missingNative
    .map((entry) => `${entry.name}${entry.macro ? ` (${entry.macro})` : ''}`)
    .join(', ')}`,
);
assert(
  behaviorEvidenceGaps.length === 0,
  `Product Core control domains must have real behavior evidence: ${behaviorEvidenceGaps
    .map((entry) => `${entry.domain}:${entry.evidence}:${entry.reason}`)
    .join(', ')}`,
);
assert(
  unexpectedDeferredInventoryEntries.length === 0,
  `Unwired controls matched broad deferred patterns without explicit waiver inventory entries: ${unexpectedDeferredInventoryEntries
    .map((entry) => `${entry.key}:${entry.classification}`)
    .join(', ')}`,
);
assert(
  missingDeferredInventoryEntries.length === 0,
  `Explicit deferred waiver inventory contains keys that are no longer deferred: ${missingDeferredInventoryEntries
    .map((entry) => `${entry.key}:${entry.classification}`)
    .join(', ')}`,
);
assert(
  unexpectedParamRegistryOmissions.length === 0,
  `SliderState keys missing ParamRegistry must be explicitly inventoried: ${unexpectedParamRegistryOmissions
    .map((entry) => entry.key)
    .join(', ')}`,
);
assert(
  missingParamRegistryOmissions.length === 0,
  `ParamRegistry omission inventory contains keys that are now registry-owned or gone: ${missingParamRegistryOmissions
    .map((entry) => `${entry.key}${entry.presentInRegistry ? ':in-registry' : ':not-in-slider-state'}`)
    .join(', ')}`,
);
assert(
  presetPayloadCoverage.failures.length === 0,
  `Factory preset payload keys must be reachable from their declared preset scope: ${presetPayloadCoverage.failures
    .map((entry) => `${entry.declarationName}:${entry.key}->${entry.expectedLevel}:${entry.expectedScope}`)
    .join(', ')}`,
);
assert(
  appVisibleControlReferences.invalid.length === 0,
  `UI control references must point at real SliderState keys: ${appVisibleControlReferences.invalid
    .map((entry) => `${entry.path}:${entry.line}:${entry.key}:${entry.kind}`)
    .join(', ')}`,
);
assert(
  appVisibleUnaccountedControls.length === 0,
  `App-visible controls must be Product-wired or explicitly deferred: ${appVisibleUnaccountedControls
    .map((entry) => entry.key)
    .join(', ')}`,
);
assert(
  appVisibleProductWiredControlsWithoutLiveUpdatePath.length === 0,
  `App-visible Product-wired controls must have a classified live update path or structural policy: ${appVisibleProductWiredControlsWithoutLiveUpdatePath
    .map((entry) => `${entry.key}:${entry.path ?? 'unclassified'}`)
    .join(', ')}`,
);
assert(
  appVisibleStructuralPolicyInventory.unexpected.length === 0,
  `App-visible structural/full-snapshot controls must be explicitly inventoried by live-update path: ${appVisibleStructuralPolicyInventory.unexpected
    .map((entry) => `${entry.key}:${entry.path}`)
    .join(', ')}`,
);
assert(
  appVisibleStructuralPolicyInventory.missing.length === 0,
  `Structural/full-snapshot policy inventory contains keys that are no longer app-visible under that path: ${appVisibleStructuralPolicyInventory.missing
    .map((entry) => `${entry.key}:${entry.path}`)
    .join(', ')}`,
);
assert(
  appVisibleBehaviorEvidenceInventory.missingInventory.length === 0,
  `App-visible Product controls must have behavior evidence inventoried by domain/live path: ${appVisibleBehaviorEvidenceInventory.missingInventory
    .map((entry) => `${entry.group}:${entry.sampleKeys.join('|')}`)
    .join(', ')}`,
);
assert(
  appVisibleBehaviorEvidenceInventory.staleInventory.length === 0,
  `App-visible behavior evidence inventory contains stale domain/live-path groups: ${appVisibleBehaviorEvidenceInventory.staleInventory
    .map((entry) => entry.group)
    .join(', ')}`,
);
assert(
  appVisibleBehaviorEvidenceInventory.evidenceGaps.length === 0,
  `App-visible behavior evidence must reference real probes/CI gates: ${appVisibleBehaviorEvidenceInventory.evidenceGaps
    .map((entry) => `${entry.group}:${entry.evidence}:${entry.reason}`)
    .join(', ')}`,
);
assert(
  postLpfBoundedNumberRangeMismatches.length === 0,
  `Source post LPF boundedNumber ranges must stay 20..20000: ${postLpfBoundedNumberRangeMismatches
    .map((entry) => `${entry.path}:${entry.key}=${entry.min}..${entry.max}`)
    .join(', ')}`,
);

console.log('Kessho Product parameter accounting checks passed');
