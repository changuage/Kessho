import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function drumEuclidTargetStructuralKeys() {
  const keys = [];
  for (let lane = 1; lane <= 4; lane += 1) {
    for (const target of ['Sub', 'Kick', 'Click', 'BeepHi', 'BeepLo', 'Noise', 'Membrane']) {
      keys.push(`drumEuclid${lane}Target${target}`);
    }
  }
  return keys;
}

function drumExactPatchPresetKeys() {
  const keys = [];
  for (const voice of ['Sub', 'Kick', 'Click', 'BeepHi', 'BeepLo', 'Noise', 'Membrane']) {
    keys.push(`drum${voice}PresetA`, `drum${voice}PresetB`);
  }
  return keys;
}

export const EXPECTED_APP_VISIBLE_STRUCTURAL_POLICY_BY_PATH = {
  'soundscape-structured-full-snapshot': {
    owner: 'Product Core soundscape source owner',
    reason: 'Soundscape module/layer controls are applied through dedicated Product snapshot fields and currently require a structured Soundscape snapshot reload.',
    keys: [
      'birds2Enabled',
      'birdsEnabled',
      'frogsEnabled',
      'insects2Enabled',
      'insects2Engine',
      'insects2Level',
      'insectsEnabled',
      'insectsEngine',
      'insectsLevel',
      'oceanSampleEnabled',
      'waterEnabled',
      'waterLayerBubbling',
      'waterLayerChannels',
      'waterLayerHardDrops',
      'waterLayerSurf',
      'waterLayerTurbulence',
      'waterLayerWaterDrops',
      'waterMorphA',
      'waterMorphB',
      'waterPreset',
    ],
  },
  'sequencer-structure-full-snapshot': {
    owner: 'Product Core sequencer owner',
    reason: 'Drum target toggles can change Product drum lane topology, so they remain structural until lane-target diffs are shape-stable.',
    keys: drumEuclidTargetStructuralKeys(),
  },
  'rng-seed-snapshot-policy': {
    owner: 'Product Core RNG/evolution owner',
    reason: 'Randomness feeds Product seed material and must remain an explicit snapshot policy while live RNG-state reconciliation is owned by telemetry/generated state.',
    keys: ['randomness'],
  },
};

export function collectAppVisibleStructuralPolicyInventory(appVisibleLiveUpdatePaths) {
  const expectedPolicies = new Map(
    Object.entries(EXPECTED_APP_VISIBLE_STRUCTURAL_POLICY_BY_PATH)
      .map(([path, policy]) => [path, {
        ...policy,
        expectedKeys: [...policy.keys].sort(),
        expectedKeySet: new Set(policy.keys),
      }]),
  );
  const structuralEntries = appVisibleLiveUpdatePaths
    .filter((entry) => typeof entry.path === 'string' && (entry.path.includes('full-snapshot') || entry.path.includes('snapshot-policy')))
    .map((entry) => {
      const policy = expectedPolicies.get(entry.path);
      return {
        key: entry.key,
        domain: entry.domain,
        path: entry.path,
        owner: policy?.owner ?? null,
        reason: policy?.reason ?? entry.reason ?? null,
        refs: entry.refs,
      };
    });
  const actualByPath = new Map();
  for (const entry of structuralEntries) {
    const current = actualByPath.get(entry.path) ?? new Set();
    current.add(entry.key);
    actualByPath.set(entry.path, current);
  }

  const unexpected = structuralEntries
    .filter((entry) => {
      const policy = expectedPolicies.get(entry.path);
      return !policy || !policy.expectedKeySet.has(entry.key);
    })
    .map((entry) => ({
      key: entry.key,
      domain: entry.domain,
      path: entry.path,
      owner: entry.owner,
      reason: entry.reason,
      refs: entry.refs,
    }));

  const missing = [];
  for (const [path, policy] of expectedPolicies) {
    const actualKeys = actualByPath.get(path) ?? new Set();
    for (const key of policy.expectedKeys) {
      if (!actualKeys.has(key)) {
        missing.push({
          key,
          domain: controlDomain(key),
          path,
          owner: policy.owner,
          reason: policy.reason,
        });
      }
    }
  }

  const countsByPath = {};
  for (const [path, keys] of actualByPath) {
    countsByPath[path] = keys.size;
  }

  const policyInventory = Object.fromEntries(
    [...expectedPolicies.entries()].map(([path, policy]) => [path, {
      owner: policy.owner,
      reason: policy.reason,
      expectedKeys: policy.expectedKeys,
    }]),
  );

  return {
    controls: structuralEntries.sort((left, right) => left.path.localeCompare(right.path) || left.key.localeCompare(right.key)),
    countsByPath,
    policyInventory,
    unexpected,
    missing: missing.sort((left, right) => left.path.localeCompare(right.path) || left.key.localeCompare(right.key)),
  };
}

export function controlDomain(key) {
  if (/^piano/.test(key)) return 'source.piano';
  if (/^(synthAttack|synthDecay|synthSustain|synthHold|synthRelease|synthLevel|synthVoiceMask)$/.test(key)) return 'source.pad';
  if (/^(pad|pad2|filter|lfo|env|warmth|hardness|presence|motion|shimmer|bloom|noise|drive|sub|dist|velocity|retrigger|stereo|chorus)/.test(key)) return 'source.pad';
  if (/^lead[12]?/.test(key)) return 'source.lead';
  if (/^drumSequencerChain$/.test(key)) return 'music.sequencer';
  if (/^drum/.test(key)) return 'source.drum';
  if (/^(ocean|birds|birds2|frogs|nature|water|insects|insDelay[AB]Send)/.test(key)) return 'source.soundscape';
  if (/^granular/.test(key) || /^(grainProbability|maxGrains|grainSize|density|spray|jitter|pitchSpread|wetHPF|wetLPF|feedback)$/.test(key)) return 'fx.granular';
  if (/^delay/.test(key)) return 'fx.delay';
  if (/^reverb/.test(key) || /^spectralFreeze/.test(key) || /^(damping|predelay|width)$/.test(key)) return 'fx.reverb';
  if (/^(drift|degrade|erosion|dynamics|endComp|sidechain|masterLimiter)/.test(key)) return 'fx.dynamics';
  if (/^(synthEuclid|synthSequencer(?:Faces|Chain)|drumEuclid|sequencer|transport|chordProgression|cof|harmony|randomWalk|rootNote|scaleMode|manualScale|tension|phraseLength|chordRate|voicingSpread|waveSpread|detune|seedWindow|synthChordSequencer|synthOctave|randomness)/.test(key)) return 'music.sequencer';
  if (/^master/.test(key)) return 'master';
  return 'misc';
}

export const behaviorEvidenceByDomain = {
  'source.piano': ['core:product:assets', 'ProductAssetTests.cpp#renderPianoAttackProbe'],
  'source.pad': ['core:product:sources', 'core:product:source-parity', 'ProductSourceWrapperTests.cpp', 'ProductPadExactPatchTests.cpp'],
  'source.lead': ['core:product:sources', 'core:product:source-parity', 'ProductSourceWrapperTests.cpp', 'ProductLeadExactPatchTests.cpp'],
  'source.drum': ['core:product:sources', 'core:product:assets', 'ProductSourceWrapperTests.cpp'],
  'source.soundscape': ['core:product:asset-manifest', 'core:product:assets', 'core:product:source-parity'],
  'fx.granular': ['core:product:fx', 'core:product:fx-depth', 'ProductFxRoutingTests.cpp'],
  'fx.delay': ['core:product:fx', 'core:product:graph', 'ProductFxRoutingTests.cpp'],
  'fx.reverb': ['core:product:fx', 'core:product:fx-depth', 'ProductFxRoutingTests.cpp'],
  'fx.dynamics': ['core:product:fx-depth', 'ProductFxRoutingTests.cpp'],
  'music.sequencer': ['core:product:sequencer', 'core:product:harmony', 'ProductSequencerTests.cpp'],
  master: ['core:product:fx-depth', 'core:product:graph'],
  misc: ['core:product:param-accounting'],
};

export const behaviorEvidenceByAppVisibleGroup = {
  'fx.delay|fx-param-diff': {
    owner: 'Product Core Delay owner',
    reason: 'Discrete Delay A/B controls must apply through generated Product params and alter rendered FX traces.',
    evidence: ['core:product:fx', 'ProductFxRoutingTests.cpp#requireDelayParamSnapshotEventParity', 'ProductFxRoutingTests.cpp#requireDelayParamChangesTrace'],
  },
  'fx.delay|range-event': {
    owner: 'Product Core Delay owner',
    reason: 'Live Delay A/B range controls must match snapshot/event rendering and produce changed traces.',
    evidence: ['core:product:fx', 'ProductFxRoutingTests.cpp#requireDelayParamSnapshotEventParity', 'ProductFxRoutingTests.cpp#requireDelayParamChangesTrace'],
  },
  'fx.dynamics|fx-param-diff': {
    owner: 'Product Core Dynamics owner',
    reason: 'Dynamics/sidechain/master-saturation controls must map to C++ params and produce changed render traces.',
    evidence: ['core:product:fx-depth', 'ProductFxRoutingTests.cpp#requireDynamicsParamSnapshotEventParity', 'ProductFxRoutingTests.cpp#requireDynamicsParamChangesTrace', 'ProductFxRoutingTests.cpp#requireSidechainDucksTerminalBusOnly'],
  },
  'fx.dynamics|range-event': {
    owner: 'Product Core Dynamics owner',
    reason: 'Live Dynamics and modulation-matrix range controls must reach Product Core and alter rendered output.',
    evidence: ['core:product:fx-depth', 'ProductFxRoutingTests.cpp#requireDynamicsParamSnapshotEventParity', 'ProductFxRoutingTests.cpp#requireDynamicsParamChangesTrace', 'ProductFxRoutingTests.cpp#direct.applyDynamicsModParamEvent(event)'],
  },
  'fx.granular|fx-param-diff': {
    owner: 'Product Core Granular owner',
    reason: 'Granular global/voice discrete controls must apply through generated params and alter Product render traces.',
    evidence: ['core:product:fx', 'ProductFxRoutingTests.cpp#requireGranularParamSnapshotEventParity', 'ProductFxRoutingTests.cpp#requireGranularParamChangesTrace'],
  },
  'fx.granular|granular-voice-diff': {
    owner: 'Product Core Granular owner',
    reason: 'Granular voice structural toggles must apply through generated voice diffs and low-rate runtime probes.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#requireLowRateGranularRuntimeWalkMovementAcrossEngineParams', 'ProductFxRoutingTests.cpp#requireGranularParamSnapshotEventParity'],
  },
  'fx.granular|range-event': {
    owner: 'Product Core Granular owner',
    reason: 'Live granular range controls must reach Product Core module fields and telemetry-backed runtime range probes.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#requireLowRateGranularRuntimeWalkMovementAcrossEngineParams', 'ProductSequencerTests.cpp#requireGranularModuleRuntimeFieldValue'],
  },
  'fx.reverb|fx-param-diff': {
    owner: 'Product Core Reverb/Spectral Freeze owner',
    reason: 'Reverb and Spectral Freeze discrete controls must apply through generated params and alter render traces.',
    evidence: ['core:product:fx', 'ProductFxRoutingTests.cpp#requireReverbParamSnapshotEventParity', 'ProductFxRoutingTests.cpp#requireSpectralFreezeParamSnapshotEventParity'],
  },
  'fx.reverb|range-event': {
    owner: 'Product Core Reverb/Spectral Freeze owner',
    reason: 'Live Reverb range controls must reach Product Core module fields and alter rendered output.',
    evidence: ['core:product:fx', 'ProductFxRoutingTests.cpp#requireReverbParamChangesTrace', 'ProductSequencerTests.cpp#requireReverbModuleRuntimeFieldValue'],
  },
  'master|range-event': {
    owner: 'Product Core master-chain owner',
    reason: 'Master range controls must apply before limiter/saturation and report master telemetry.',
    evidence: ['core:product:fx-depth', 'ProductFxRoutingTests.cpp#requireProductParamSampleHoldRangeChangesMaster'],
  },
  'music.sequencer|arrangement-scheduler-event': {
    owner: 'Product Core arrangement owner',
    reason: 'Arrangement and scheduler controls must materialize as Product Core generated musical events.',
    evidence: ['core:product:harmony', 'ProductHarmonyTests.cpp#renderEvents', 'ProductHarmonyTests.cpp#journey state event should alter generated sequencer event values'],
  },
  'music.sequencer|harmony-param-diff': {
    owner: 'Product Core harmony owner',
    reason: 'Harmony controls must change Product Core chord telemetry and generated event pitch selection.',
    evidence: ['core:product:harmony', 'ProductHarmonyTests.cpp#requireDirectMusicCoverage', 'ProductHarmonyTests.cpp#telemetry root mismatch'],
  },
  'music.sequencer|rng-seed-snapshot-policy': {
    owner: 'Product Core RNG/evolution owner',
    reason: 'Randomness/seed policy must preserve deterministic call-order and seed-sensitive event output.',
    evidence: ['core:product:determinism', 'ProductDeterminismTests.cpp#requireRngCallOrderIsolation', 'ProductHarmonyTests.cpp#same seed harmony event mismatch'],
  },
  'music.sequencer|range-event': {
    owner: 'Product Core sequencer owner',
    reason: 'Live sequencer macro range controls must reach Product Core lane or harmony params and alter generated event output.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#requireDirectSequencerCoverage', 'ProductHarmonyTests.cpp#requireDirectMusicCoverage', 'src/audio/coreProductEvents.ts#chordRate'],
  },
  'music.sequencer|sequencer-lane-diff': {
    owner: 'Product Core sequencer owner',
    reason: 'Synth lane controls must apply through generated lane params and alter generated event output.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#requireDirectSequencerCoverage', 'ProductSequencerTests.cpp#SetParam sequencer lane probability should update the C++ lane'],
  },
  'music.sequencer|sequencer-face-diff': {
    owner: 'Product Core sequencer owner',
    reason: 'Structured synth sequencer face controls must apply through generated indexed lane params and alter Product Core generated event output.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#requireProductSequencerModeEventTests', 'ProductSequencerTests.cpp#requireProductSequencerModeRuntimePreservationTests', 'src/audio/CoreProductRuntimeAdapter.ts#appendSequencerModeConfigDiffs'],
  },
  'music.sequencer|sequencer-chain-host-events': {
    owner: 'Product Core sequencer owner',
    reason: 'Structured sequencer chain controls must gate active lanes through generated lane-enabled events without expanding the Product snapshot schema.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#requireDirectSequencerCoverage', 'src/audio/CoreProductHostSequencerChain.ts'],
  },
  'music.sequencer|sequencer-clock-rejoin-policy': {
    owner: 'Product Core sequencer owner',
    reason: 'Synth sequencer clock source and join controls must rejoin Product clocks on the same boundaries as the Web scheduler.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#bar-join sequencer should wait for the next bar before step zero', 'ProductSequencerTests.cpp#initial start delay should override native bar alignment for global-clock joins'],
  },
  'music.sequencer|transport-param-diff': {
    owner: 'Product Core transport owner',
    reason: 'Transport controls must affect Product Core clocked event generation and telemetry.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#TransportRunning SetParam should stop C++ sequencer event generation', 'ProductSequencerTests.cpp#transport should keep running through a 64-step sequencer render'],
  },
  'source.drum|arrangement-scheduler-event': {
    owner: 'Product Core drum sequencer owner',
    reason: 'Drum sequencer enable policy must drive Product Core event generation and manual drum render coverage.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#manual drum trigger should render non-silence', 'ProductSequencerTests.cpp#kessho_product_debug_render_events'],
  },
  'source.drum|drum-generated-preset-endpoint-diff': {
    owner: 'Product Core Drum source owner',
    reason: 'Drum preset endpoint swaps must rebuild through full snapshots until source-rebuild exists; morph-only changes remain covered by generated Drum preset render probes and dirty-diff endpoint events.',
    evidence: ['core:product:sources', 'core:product:source-parity', 'ProductSourceWrapperTests.cpp#requireGeneratedDrumPresetRenders', 'ProductSourceWrapperTests.cpp#requireDrumOverridesStayStructured'],
  },
  'source.drum|fx-param-diff': {
    owner: 'Product Core Drum/FX owner',
    reason: 'Drum FX enable controls must reach Product Core FX routing and Drum source render probes.',
    evidence: ['core:product:fx', 'ProductFxRoutingTests.cpp#requireDirectFxCoverage', 'ProductSourceWrapperTests.cpp#requireDrumSourceParamsDriveModule'],
  },
  'source.drum|range-event': {
    owner: 'Product Core Drum source owner',
    reason: 'Drum source ranges must reach generated source/drum params and alter rendered source or FX output.',
    evidence: ['core:product:sources', 'ProductSourceWrapperTests.cpp#requireDrumSourceParamsDriveModule', 'ProductSequencerTests.cpp#requireDrumExactRuntimeRangesApplyToSourceAndModule'],
  },
  'source.drum|sequencer-lane-diff': {
    owner: 'Product Core drum sequencer owner',
    reason: 'Drum lane scalar controls must apply through generated lane params and alter C++ sequencer state.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#requireDirectSequencerCoverage', 'ProductSequencerTests.cpp#SetParam sequencer lane probability should update the C++ lane'],
  },
  'source.drum|sequencer-clock-rejoin-policy': {
    owner: 'Product Core drum sequencer owner',
    reason: 'Drum sequencer clock source and join controls must rejoin Product clocks on the same boundaries as the Web scheduler.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#bar-join sequencer should wait for the next bar before step zero', 'ProductSequencerTests.cpp#initial start delay should override native bar alignment for global-clock joins'],
  },
  'source.drum|sequencer-structure-full-snapshot': {
    owner: 'Product Core drum sequencer owner',
    reason: 'Drum lane target topology is structural debt and must remain paired with sequencer state replay coverage.',
    evidence: ['core:product:host-reconciliation', 'ProductSequencerTests.cpp#sequencer UI replay enqueue failed', 'ProductSequencerTests.cpp#requireLaneMutationStateEqual'],
  },
  'source.drum|source-param-diff': {
    owner: 'Product Core Drum source owner',
    reason: 'Drum source enable/level params must drive rendered Drum output.',
    evidence: ['core:product:sources', 'ProductSourceWrapperTests.cpp#requireDrumSourceParamsDriveModule'],
  },
  'source.drum|transport-param-diff': {
    owner: 'Product Core drum transport owner',
    reason: 'Drum BPM/transport changes must affect Product Core sequencer timing.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#expected sequencer offset was not generated', 'ProductSequencerTests.cpp#transport should keep running through a 64-step sequencer render'],
  },
  'source.lead|arrangement-scheduler-event': {
    owner: 'Product Core Lead arrangement owner',
    reason: 'Lead random scheduler controls must produce Product Core generated note events.',
    evidence: ['core:product:harmony', 'ProductHarmonyTests.cpp#journey state event should alter generated sequencer event values', 'ProductSourceWrapperTests.cpp#requireBroadLeadPresetFamiliesRender'],
  },
  'source.lead|range-event': {
    owner: 'Product Core Lead source owner',
    reason: 'Lead range controls must alter Product Core source output, post-chain, or FX send behavior.',
    evidence: ['core:product:sources', 'ProductSourceWrapperTests.cpp#renderRmsWithLeadPostLpf', 'ProductGraphTests.cpp#lead1 Delay A send graph tap stayed silent'],
  },
  'source.lead|source-param-diff': {
    owner: 'Product Core Lead source owner',
    reason: 'Lead enable, hold, and structured envelope/algorithm override controls must drive Product Core source render behavior.',
    evidence: ['core:product:sources', 'ProductSourceWrapperTests.cpp#requireSourceParamEventsAffectRender', 'ProductSourceWrapperTests.cpp#requireBroadLeadPresetFamiliesRender'],
  },
  'source.pad|arrangement-scheduler-event': {
    owner: 'Product Core Pad arrangement owner',
    reason: 'Pad gate-fit controls must change generated manual note durations before events are sent to Product Core.',
    evidence: ['core:product:sequencer-ui', 'src/audio/coreProductSequencerHold.ts#coreProductPadEnvelopeGateSecondsFromState', 'src/audio/coreProductEvents.ts#createCoreProductManualNoteEvent'],
  },
  'source.pad|pad-voice-routing-snapshot': {
    owner: 'Product Core Pad sequencer owner',
    reason: 'Shared Pad 1/Pad 2 voice assignment controls must update encoded lane seeds and generated manual-note routing.',
    evidence: ['core:product:sequencer', 'core:product:web-host', 'src/audio/coreProductSnapshotPadVoiceRouting.ts#encodedPadVoiceLaneSeed'],
  },
  'source.pad|range-event': {
    owner: 'Product Core Pad source owner',
    reason: 'Pad range controls must alter Product Core source output, post-chain, or FX send behavior.',
    evidence: ['core:product:sources', 'ProductSourceWrapperTests.cpp#renderDeltaRmsWithPadPostLpf', 'ProductSourceWrapperTests.cpp#requirePadFxSendsFollowPostLpfForBothPads'],
  },
  'source.pad|sequencer-lane-diff': {
    owner: 'Product Core Pad sequencer owner',
    reason: 'Pad hold controls must update Product synth sequencer lane hold seconds for Pad 1 and Pad 2 lanes.',
    evidence: ['core:product:sequencer', 'ProductSequencerTests.cpp#KESSHO_PRODUCT_PARAM_SEQUENCER_LANE_HOLD_SECONDS_ID', 'src/audio/coreProductSequencerHold.ts#coreProductPadEnvelopeGateSecondsFromState'],
  },
  'source.pad|source-param-diff': {
    owner: 'Product Core Pad source owner',
    reason: 'Pad enable/level params must drive rendered Pad output.',
    evidence: ['core:product:sources', 'ProductSourceWrapperTests.cpp#requireSourceParamEventsAffectRender', 'ProductSourceWrapperTests.cpp#requireSourceRenders'],
  },
  'source.piano|range-event': {
    owner: 'Product Core Piano asset/source owner',
    reason: 'Piano range controls must alter registered-asset rendering and source post-chain sends.',
    evidence: ['core:product:assets', 'ProductAssetTests.cpp#renderPianoAttackProbe', 'ProductSourceWrapperTests.cpp#requirePianoFxSendsFollowPostLpf'],
  },
  'source.piano|source-param-diff': {
    owner: 'Product Core Piano asset/source owner',
    reason: 'Piano enable/source params must preserve registered-asset render behavior.',
    evidence: ['core:product:assets', 'ProductAssetTests.cpp#registered asset did not render', 'ProductSequencerTests.cpp#registered piano asset should render through Product Core'],
  },
  'source.soundscape|range-event': {
    owner: 'Product Core soundscape source owner',
    reason: 'Soundscape range controls must alter asset-backed source renders and graph-send coverage.',
    evidence: ['core:product:assets', 'ProductAssetTests.cpp#registered soundscape loop did not render', 'ProductGraphTests.cpp#requireSoundscapeLayerRouteGraphCoverage'],
  },
  'source.soundscape|soundscape-structured-full-snapshot': {
    owner: 'Product Core soundscape source owner',
    reason: 'Soundscape structured snapshot controls must remain paired with asset render and layer policy probes.',
    evidence: ['core:product:assets', 'ProductAssetTests.cpp#layered soundscape assets did not mix', 'ProductAssetTests.cpp#birds soundscape policy should render wider C++-owned stereo spread than water'],
  },
};

function validateBehaviorEvidenceTokens(scope, evidence, packageJson, ciRunner) {
  const gaps = [];
  for (const token of evidence) {
    if (token.startsWith('core:product:')) {
      if (!packageJson.scripts?.[token]) {
        gaps.push({ ...scope, evidence: token, reason: 'missing package script' });
        continue;
      }
      if (!ciRunner.includes(`'${token}'`)) {
        gaps.push({ ...scope, evidence: token, reason: 'missing Product Core CI step' });
      }
      continue;
    }

    const [fileName, probeToken] = token.split('#');
    const path = fileName.includes('/')
      ? fileName
      : fileName.endsWith('.cpp')
        ? `cpp/KesshoCore/tests/${fileName}`
        : fileName;
    let contents = '';
    try {
      contents = read(path);
    } catch {
      gaps.push({ ...scope, evidence: token, reason: `missing ${path}` });
      continue;
    }
    if (probeToken && !contents.includes(probeToken)) {
      gaps.push({ ...scope, evidence: token, reason: `missing probe token ${probeToken}` });
    }
  }
  return gaps;
}

export function collectBehaviorEvidenceGaps(domains) {
  const gaps = [];
  const packageJson = JSON.parse(read('package.json'));
  const ciRunner = read('scripts/run-kessho-product-ci.mjs');
  for (const [domain, counts] of Object.entries(domains)) {
    if (!counts || counts.productWired <= 0) {
      continue;
    }
    const evidence = behaviorEvidenceByDomain[domain] ?? behaviorEvidenceByDomain.misc;
    gaps.push(...validateBehaviorEvidenceTokens({ domain }, evidence, packageJson, ciRunner));
  }
  return gaps;
}

export function collectAppVisibleBehaviorEvidenceGaps(appVisibleLiveUpdatePaths) {
  const packageJson = JSON.parse(read('package.json'));
  const ciRunner = read('scripts/run-kessho-product-ci.mjs');
  const groups = new Map();
  for (const entry of appVisibleLiveUpdatePaths) {
    if (!entry.path) {
      continue;
    }
    const group = `${entry.domain}|${entry.path}`;
    const current = groups.get(group) ?? {
      group,
      domain: entry.domain,
      path: entry.path,
      keys: [],
    };
    current.keys.push(entry.key);
    groups.set(group, current);
  }

  const missingInventory = [];
  const staleInventory = [];
  const evidenceGaps = [];
  const inventory = {};

  for (const [group, actual] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    actual.keys.sort();
    const expected = behaviorEvidenceByAppVisibleGroup[group];
    if (!expected) {
      missingInventory.push({
        ...actual,
        sampleKeys: actual.keys.slice(0, 10),
      });
      continue;
    }
    inventory[group] = {
      domain: actual.domain,
      path: actual.path,
      owner: expected.owner,
      reason: expected.reason,
      evidence: expected.evidence,
      keyCount: actual.keys.length,
      sampleKeys: actual.keys.slice(0, 10),
    };
    evidenceGaps.push(...validateBehaviorEvidenceTokens({
      group,
      domain: actual.domain,
      path: actual.path,
    }, expected.evidence, packageJson, ciRunner));
  }

  for (const group of Object.keys(behaviorEvidenceByAppVisibleGroup).sort()) {
    if (!groups.has(group)) {
      const [domain, path] = group.split('|');
      staleInventory.push({
        group,
        domain,
        path,
        owner: behaviorEvidenceByAppVisibleGroup[group].owner,
        reason: behaviorEvidenceByAppVisibleGroup[group].reason,
      });
    }
  }

  return {
    inventory,
    missingInventory,
    staleInventory,
    evidenceGaps,
  };
}

export const productDeferredClassifications = [
  {
    id: 'soundscape-layer-policy',
    owner: 'C++ Product Core soundscape source and asset layer policy',
    allowWiredReferences: true,
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
    id: 'harmony-generation-policy',
    owner: 'Product Core harmony owner',
    allowWiredReferences: true,
    reason:
      'Structured harmony slots, sequence steps, and manual control resolve into Product Core harmony frames; harmonyGenerationSeed is UI generation salt for deterministic material creation, not a live Product param.',
    patterns: [/^harmonyGenerationSeed$/],
  },
  {
    id: 'arrangement-and-clock-policy',
    owner: 'C++ Product Core arrangement scheduler and transport sync policy',
    allowWiredReferences: true,
    reason:
      'Product host arrangement scheduling feeds Product Core manual/source events today; these policy and UI-state controls need native Product scheduler ownership before they become generated Product params.',
    patterns: [
      /^(cofCurrentStep|harmonySyncPolicy)$/,
      /^(chordProgressionHits|chordProgressionRotation)$/,
      /^(lead|drum|pad|reverb|granular|synthEuclid)Tension(Mode|Value)$/,
      /^drumTension(Mode|Value)$/,
    ],
  },
  {
    id: 'runtime-walk-global-policy',
    owner: 'Product Core modulation range scheduler',
    allowWiredReferences: true,
    reason:
      'Product Core carries random-walk speed/mode as modulation-range scheduler metadata rather than generated scalar Product params.',
    patterns: [/^randomWalk(Speed|Mode)$/],
  },
  {
    id: 'source-scheduler-ui-policy',
    owner: 'C++ Product Core source scheduler, source preset, and automation owners',
    allowWiredReferences: true,
    reason:
      'The canonical Product path uses generated source IDs, exact patch bridges, source macro params, and sequencer lane snapshots; these source-selection, auto-morph, and scheduler helper controls remain host/UI policy.',
    patterns: [
      /^(pad|pad2)Morph(Auto|Speed)$/,
      /^lead[12]Morph(Auto|Speed|Mode)$/,
      /^drum(Sub|Kick|Click|BeepHi|BeepLo|Noise|Membrane)Morph(Auto|Speed|Mode)$/,
      /^(drumMorphSliderAnimate|synthVoiceMask|waveSpread|synthOctave|pad2VoiceAssign|pad2Octave)$/,
      /^lead[12](Density|Octave|OctaveRange)$/,
    ],
  },
  {
    id: 'legacy-delay-and-granular-aliases',
    owner: 'Legacy web-ts compatibility cleanup',
    allowWiredReferences: true,
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
    allowWiredReferences: true,
    reason:
      'Product Core wires the generated scalar FX params; these macro, routing-policy, shortcut, and legacy alias controls need explicit generated params or should retire.',
    patterns: [
      /^(reverbEngine|reverbScaleShimmer)$/,
      /^granular(Preset|PresetBehavior)$/,
      /^granularVisualDetail$/,
      /^driftWetHp$/,
      /^dynamicsBusEnabled$/,
      /^character(Wow|Flutter|Drift|Noise|Hp|Lp|Tone|Saturation|Corrosion|WetHp)$/,
      /^delayBGranularLinked$/,
      /^granularV[1-4]TempoDiv$/,
    ],
  },
  {
    id: 'sequencer-preset-policy',
    owner: 'C++ Product Core sequencer preset/template owner',
    allowWiredReferences: true,
    reason:
      'Product Core receives concrete lane steps, fills, rotations, divisions, swings, probability, level, source, and masks; web preset names and legacy velocity min/max helpers are template state.',
    patterns: [
      /^synthEuclid[1-4]Preset$/,
      /^drumEuclidDivision$/,
      /^drumEuclid[1-4]Preset$/,
      /^drumEuclid[1-4]Velocity(Min|Max)$/,
    ],
  },
  {
    id: 'drum-module-extra-deferred',
    owner: 'C++ Product Core drum module parity owner',
    allowWiredReferences: true,
    reason:
      'The Product Drum bridge carries generated shared drum-module params; remaining web drum-synth extras need explicit generated params or should retire.',
    patterns: [
      /^drumMembraneScaleBlend$/,
    ],
  },
  {
    id: 'legacy-timbre-alias',
    owner: 'Legacy preset compatibility cleanup',
    reason: '`leadTimbre` is documented as a legacy ignored key; Product Core uses generated Lead preset IDs plus bounded sparse Lead override fields for reconstructable sources.',
    patterns: [/^leadTimbre$/],
  },
];

export const EXPECTED_DEFERRED_KEYS_BY_CLASSIFICATION = {
  'soundscape-layer-policy': [
    'birds2DelayASend',
    'birds2DelayBSend',
    'birds2ReverbSend',
    'birdsDelayASend',
    'birdsDelayBSend',
    'birdsReverbSend',
    'frogsDelayASend',
    'frogsDelayBSend',
    'frogsReverbSend',
    'insects2Antiphony',
    'insects2ClickRate',
    'insects2Density',
    'insects2Distance',
    'insects2Motion',
    'insects2Proximity',
    'insects2Temperature',
    'insectsAntiphony',
    'insectsClickRate',
    'insectsDensity',
    'insectsDistance',
    'insectsMotion',
    'insectsProximity',
    'insectsTemperature',
    'oceanFilterCutoff',
    'oceanFilterResonance',
    'oceanFilterType',
  ],
  'arrangement-and-clock-policy': [
    'chordProgressionHits',
    'chordProgressionRotation',
    'cofCurrentStep',
    'drumTensionMode',
    'drumTensionValue',
    'harmonySyncPolicy',
    'padTensionMode',
    'padTensionValue',
    'synthEuclidTensionMode',
    'synthEuclidTensionValue',
  ],
  'runtime-walk-global-policy': [
    'randomWalkMode',
    'randomWalkSpeed',
  ],
  'harmony-generation-policy': [
    'harmonyGenerationSeed',
  ],
  'source-scheduler-ui-policy': [
    'drumBeepHiMorphAuto',
    'drumBeepHiMorphMode',
    'drumBeepHiMorphSpeed',
    'drumBeepLoMorphAuto',
    'drumBeepLoMorphMode',
    'drumBeepLoMorphSpeed',
    'drumClickMorphAuto',
    'drumClickMorphMode',
    'drumClickMorphSpeed',
    'drumKickMorphAuto',
    'drumKickMorphMode',
    'drumKickMorphSpeed',
    'drumMembraneMorphAuto',
    'drumMembraneMorphMode',
    'drumMembraneMorphSpeed',
    'drumMorphSliderAnimate',
    'drumNoiseMorphAuto',
    'drumNoiseMorphMode',
    'drumNoiseMorphSpeed',
    'drumSubMorphAuto',
    'drumSubMorphMode',
    'drumSubMorphSpeed',
    'lead1MorphAuto',
    'lead1MorphMode',
    'lead1MorphSpeed',
    'lead2MorphAuto',
    'lead2MorphMode',
    'lead2MorphSpeed',
    'pad2MorphAuto',
    'pad2MorphSpeed',
    'pad2Octave',
    'padMorphAuto',
    'padMorphSpeed',
  ],
  'legacy-delay-and-granular-aliases': [
    'delayASpread',
    'delayATime',
    'feedback',
    'grainPitchMode',
    'grainProbability',
    'jitter',
    'maxGrains',
    'pitchSpread',
    'wetHPF',
    'wetLPF',
  ],
  'fx-macro-deferred': [
    'delayBGranularLinked',
    'driftWetHp',
    'dynamicsBusEnabled',
    'granularPreset',
    'granularVisualDetail',
    'granularV1TempoDiv',
    'granularV2TempoDiv',
    'granularV3TempoDiv',
    'granularV4TempoDiv',
    'reverbEngine',
  ],
  'sequencer-preset-policy': [
    'drumEuclid1Preset',
    'drumEuclid1VelocityMax',
    'drumEuclid1VelocityMin',
    'drumEuclid2Preset',
    'drumEuclid2VelocityMax',
    'drumEuclid2VelocityMin',
    'drumEuclid3Preset',
    'drumEuclid3VelocityMax',
    'drumEuclid3VelocityMin',
    'drumEuclid4Preset',
    'drumEuclid4VelocityMax',
    'drumEuclid4VelocityMin',
    'drumEuclidDivision',
    'synthEuclid1Preset',
    'synthEuclid2Preset',
    'synthEuclid3Preset',
    'synthEuclid4Preset',
  ],
  'drum-module-extra-deferred': [
    'drumMembraneScaleBlend',
  ],
  'legacy-timbre-alias': [
    'leadTimbre',
  ],
};

export const EXPECTED_PARAM_REGISTRY_OMISSIONS = [
  {
    key: 'chordProgressionHits',
    reason: 'Derived chord progression Euclidean template helper; Product Core receives explicit enabled steps/pattern state.',
  },
  {
    key: 'chordProgressionRotation',
    reason: 'Derived chord progression Euclidean template helper; Product Core receives explicit enabled steps/pattern state.',
  },
  {
    key: 'harmonyChordSequence',
    reason: 'Structured harmony sequence state resolves into Product Core harmony sequence events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyChordSequenceA',
    reason: 'Structured harmony bank-A sequence state resolves into Product Core harmony sequence events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyChordSequenceB',
    reason: 'Structured harmony bank-B sequence state resolves into Product Core harmony sequence events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyChordSequenceEnabled',
    reason: 'Structured harmony sequence enable state resolves into Product Core harmony sequence events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyChordSequenceStepIndex',
    reason: 'Structured harmony sequence step selection resolves into Product Core harmony sequence events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyChordSlots',
    reason: 'Structured harmony slot state resolves into Product Core harmony slot events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyChordSlotsA',
    reason: 'Structured harmony bank-A slot state resolves into Product Core harmony slot events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyChordSlotsB',
    reason: 'Structured harmony bank-B slot state resolves into Product Core harmony slot events instead of ParamRegistry scalar params.',
  },
  {
    key: 'harmonyGenerationSeed',
    reason: 'UI generation salt for deterministic harmony material creation; generated slots and sequence carry the Product Core state.',
  },
  {
    key: 'harmonyMorphPercent',
    reason: 'Structured harmony morph state resolves into Product Core harmony frames instead of ParamRegistry scalar params.',
  },
  {
    key: 'manualHarmonyControl',
    reason: 'Structured manual harmony control resolves into Product Core harmony manual-intent events instead of ParamRegistry scalar params.',
  },
  {
    key: 'synthSequencerFaces',
    reason: 'Structured synth sequencer face state resolves into Product Core sequencer snapshots and generated sequencer lane param events instead of ParamRegistry scalar params.',
  },
  {
    key: 'synthSequencerChain',
    reason: 'Structured synth sequencer chain state is enforced by the host through generated sequencer lane-enabled events instead of ParamRegistry scalar params.',
  },
  {
    key: 'drumSequencerChain',
    reason: 'Structured drum sequencer chain state is enforced by the host through generated sequencer lane-enabled events instead of ParamRegistry scalar params.',
  },
  {
    key: 'sidechainDelayATarget',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainDelayBTarget',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainGranularTarget',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainLead1Target',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainLead2Target',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainPad1Target',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainPad2Target',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainPianoTarget',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'sidechainReverbTarget',
    reason: 'Legacy per-target sidechain bridge field; current presets target sidechain via the Routing page Dynamics bus.',
  },
  {
    key: 'drumMembraneScaleBlend',
    reason: 'Drum membrane module extra not present in the current Product Drum ABI.',
  },
  {
    key: 'dynamicsEnabled',
    reason: 'Legacy Texture page runtime gate; presets are owned by separate L3 Degrade, Dynamics Bus, and Master FX scopes.',
  },
  {
    key: 'granularVisualDetail',
    reason: 'Visualizer CPU/detail preference; not part of the audible granular preset state.',
  },
  {
    key: 'granularPreset',
    reason: 'UI shortcut preset id; granular preset application writes canonical granular controls including granularPresetBehavior.',
  },
  {
    key: 'leadTimbre',
    reason: 'Legacy ignored Lead key; Product Core uses generated Lead preset IDs plus bounded sparse Lead override fields for reconstructable sources.',
  },
];

export const FACTORY_PRESET_PAYLOAD_SCOPE_CHECKS = [
  { path: 'src/audio/padPresets.ts', declarationName: 'PAD_PRESETS', level: 1, scope: 'pad1' },
  { path: 'src/audio/drumPresets.ts', declarationName: 'SUB_PRESETS', level: 1, scope: 'drumSub' },
  { path: 'src/audio/drumPresets.ts', declarationName: 'KICK_PRESETS', level: 1, scope: 'drumKick' },
  { path: 'src/audio/drumPresets.ts', declarationName: 'CLICK_PRESETS', level: 1, scope: 'drumClick' },
  { path: 'src/audio/drumPresets.ts', declarationName: 'BEEP_HI_PRESETS', level: 1, scope: 'drumBeepHi' },
  { path: 'src/audio/drumPresets.ts', declarationName: 'BEEP_LO_PRESETS', level: 1, scope: 'drumBeepLo' },
  { path: 'src/audio/drumPresets.ts', declarationName: 'NOISE_PRESETS', level: 1, scope: 'drumNoise' },
  { path: 'src/audio/drumPresets.ts', declarationName: 'MEMBRANE_PRESETS', level: 1, scope: 'drumMembrane' },
  { path: 'src/ui/delay/delayPresets.ts', declarationName: 'ECHO_LINE_PRESETS', level: 1, scope: 'echoLine' },
  { path: 'src/ui/delay/delayPresets.ts', declarationName: 'CLOCKED_SPACE_PRESETS', level: 1, scope: 'clockedSpace' },
  { path: 'src/ui/delay/delayPresets.ts', declarationName: 'DELAY_KIT_PRESETS', level: 2, scope: 'delayKit' },
  { path: 'src/ui/delay/delayPresets.ts', declarationName: 'DELAY_SOURCE_PRESETS', level: 3, scope: 'delay' },
  { path: 'src/ui/drums/drumSourcePresets.ts', declarationName: 'DRUMS_SOURCE_PRESETS', level: 3, scope: 'drums' },
  { path: 'src/ui/drums/drumSourcePresets.ts', declarationName: 'DRUM_KIT_PRESETS', level: 2, scope: 'drumKit' },
  { path: 'src/ui/dynamics/dynamicsPresets.ts', declarationName: 'DYNAMICS_SIDECHAIN_PRESETS', level: 1, scope: 'dynamicsSidechain' },
  { path: 'src/ui/dynamics/dynamicsPresets.ts', declarationName: 'DYNAMICS_DRIFT_PRESETS', level: 2, scope: 'degradeDrift' },
  { path: 'src/ui/dynamics/dynamicsPresets.ts', declarationName: 'DYNAMICS_EROSION_PRESETS', level: 2, scope: 'degradeErosion' },
  { path: 'src/ui/dynamics/dynamicsPresets.ts', declarationName: 'DYNAMICS_SATURATION_PRESETS', level: 1, scope: 'dynamicsSaturation' },
  { path: 'src/ui/dynamics/dynamicsPresets.ts', declarationName: 'DYNAMICS_END_CHAIN_PRESETS', level: 1, scope: 'dynamicsEndChain' },
  { path: 'src/ui/dynamics/dynamicsPresets.ts', declarationName: 'DYNAMICS_MASTER_FX_PRESETS', level: 3, scope: 'masterFx' },
  { path: 'src/ui/dynamics/dynamicsPresets.ts', declarationName: 'DYNAMICS_DEGRADE_PRESETS', level: 3, scope: 'degrade' },
  { path: 'src/ui/earth/earthPresets.ts', declarationName: 'EARTH_KIT_PRESETS', level: 2, scope: 'earthKit' },
  { path: 'src/ui/reverb/ReverbPage.tsx', declarationName: 'REVERB_CHARACTER_PRESETS', level: 3, scope: 'reverb' },
  { path: 'src/ui/synth/synthSourcePresets.ts', declarationName: 'SYNTH_SOURCE_PRESETS', level: 3, scope: 'synth' },
];

export function classifyDeferredKey(key) {
  return productDeferredClassifications.find((classification) =>
    classification.patterns.some((pattern) => pattern.test(key)),
  );
}
