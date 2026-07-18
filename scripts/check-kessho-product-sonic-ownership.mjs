import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const expectIncomplete = process.argv.includes('--expect-incomplete');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readOptional(path) {
  return existsSync(resolve(root, path)) ? read(path) : '';
}

const autonomyTestPath = 'cpp/KesshoCore/tests/ProductSonicAutonomyTests.cpp';
const sonicStatePath = 'cpp/KesshoCore/src/product/ProductSonicRuntimeState.h';
const engineSources = [
  sonicStatePath,
  'cpp/KesshoCore/src/product/KesshoProductRender.cpp',
  'cpp/KesshoCore/src/product/KesshoProductEvents.cpp',
  'cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp',
  'cpp/KesshoCore/src/product/ProductSequencerRuntimeState.h',
  'cpp/KesshoCore/src/product/ProductScatterRuntimeState.h',
  'cpp/KesshoCore/src/product/ProductSceneProgramRuntimeState.h',
  'cpp/KesshoCore/src/product/ProductAutoCycleRuntimeState.h',
  'cpp/KesshoCore/src/product/ProductRoutingMuteGroupRuntimeState.h',
  'cpp/KesshoCore/src/product/ProductJourneyScheduleRuntimeState.h',
  'cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp',
  ...[
    'SourceMorphAutomation.cpp',
    'ProductArpRuntime.cpp',
    'ProductScatterRuntime.cpp',
    'ProductSceneProgramRuntime.cpp',
    'ProductRoutingMuteGroupRuntime.cpp',
    'ProductRoutingMuteGroups.cpp',
    'ProductAutoCycleRuntime.cpp',
    'ProductJourneyScheduleRuntime.cpp',
  ].flatMap((name) => [
    `cpp/KesshoCore/src/product/music/${name}`,
    `cpp/KesshoCore/src/product/sequencer/${name}`,
  ]),
].map(readOptional).join('\n');
const autonomyTest = `${read(autonomyTestPath)}\n${readOptional('cpp/KesshoCore/tests/ProductJourneyScheduleTests.cpp')}`;

const audits = [
  {
    id: 'source-auto-morph-and-auto-stop',
    phase: '8F',
    hostAuthorityGroups: [
      [['src/ui/useProductRuntimeGlobalSurface.ts', 'useVisibleInterval(updatePlaybackTimerCountdown']],
    ],
    ownerTokens: ['SourceMorphAutomationState', 'ProductAutoStopState', 'scheduleSourceMorphAutomation'],
    fixtureTokens: ['requireSourceMorphSuspendedHostFixture', 'requireAutoStopSuspendedHostFixture'],
  },
  {
    id: 'arp-flow-and-harmony-resolution',
    phase: '8G',
    hostAuthorityGroups: [],
    ownerTokens: ['ProductArpRuntimeState', 'resolveProductArpTraversalIndex', 'resolveProductArpMidi'],
    fixtureTokens: ['requireArpHarmonySuspendedHostFixture'],
  },
  {
    id: 'scatter',
    phase: '8H',
    hostAuthorityGroups: [
      [['src/ui/drums/scatter/useScatterPhrasePlayer.ts', 'window.setTimeout(() => {']],
      [['src/ui/drums/scatter/useScatterSequencerRuntime.ts', 'window.setTimeout(tick']],
    ],
    hostOwnershipGuardTokens: [
      ['src/app/useDrumScatterRuntimeState.ts', 'active: drumSeqScatterState.active && !productRuntimeActive'],
      ['src/app/useDrumScatterRuntimeState.ts', 'createCoreProductScatterConfigEvents'],
    ],
    ownerTokens: ['ProductScatterRuntimeState', 'scheduleScatterEvents'],
    fixtureTokens: ['requireScatterSuspendedHostFixture'],
  },
  {
    id: 'scene-program',
    phase: '8I',
    hostAuthorityGroups: [],
    ownerTokens: ['ProductSceneProgramRuntimeState', 'commitSceneProgram', 'scheduleSceneRuntimeEvents'],
    fixtureTokens: ['requireSceneProgramSuspendedHostFixture'],
  },
  {
    id: 'routing-mute-groups',
    phase: '8J',
    hostAuthorityGroups: [
      [['src/app/useRoutingMuteGroupSystem.ts', 'randomSwitchTimerRef.current = setTimeout']],
      [['src/app/useRoutingMuteGroupSystem.ts', 'randomPhaseTimerRef.current = setTimeout']],
    ],
    hostOwnershipGuardTokens: [
      ['src/App.tsx', "productRuntimeActive: productRuntimeMode === 'core-product'"],
      ['src/app/useRoutingMuteGroupSystem.ts', 'if (productRuntimeActive)'],
      ['src/app/useRoutingMuteGroupSystem.ts', 'createCoreProductRoutingMuteGroupEvents'],
    ],
    ownerTokens: ['ProductRoutingMuteGroupRuntimeState', 'scheduleRoutingMuteGroups'],
    fixtureTokens: ['requireRoutingMuteGroupSuspendedHostFixture'],
  },
  {
    id: 'global-auto-cycle',
    phase: '8K',
    hostAuthorityGroups: [
      [
        ['src/ui/useMorphPositionRuntimeSurface.ts', 'morphPlayTimeoutRef.current = window.setTimeout'],
        ['src/ui/useMorphPositionRuntimeSurface.ts', "reason: 'morph-control-change'"],
      ],
    ],
    hostOwnershipGuardTokens: [
      ['src/App.tsx', "productRuntimeActive: productRuntimeMode === 'core-product'"],
      ['src/ui/useMorphPositionRuntimeSurface.ts', 'if (productRuntimeActive)'],
      ['src/ui/useMorphPositionRuntimeSurface.ts', 'productAutoCycleRuntime.start({'],
      ['src/ui/useProductRuntimeAutoCycleSurface.ts', 'createCoreProductAutoCycleEvent'],
      ['src/ui/useProductRuntimeAutoCycleSurface.ts', 'productEngine.prepareSceneAssets'],
    ],
    ownerTokens: ['ProductAutoCycleRuntimeState', 'scheduleGlobalAutoCycle'],
    fixtureTokens: ['requireGlobalAutoCycleSuspendedHostFixture'],
  },
  {
    id: 'journey-graph-and-scene-morph',
    phase: '8L',
    hostAuthorityGroups: [
      [
        ['src/ui/useJourneyMorphRuntimeSurface.ts', "reason: 'journey-morph-change'"],
        ['src/audio/product/host/CoreProductJourneyMorphClock.ts', 'this.options.invoke(now)'],
      ],
    ],
    hostOwnershipGuardTokens: [
      ['src/ui/useBackgroundJourneyRuntimeSurface.ts', 'productEngine.startBackgroundJourney'],
      ['src/ui/useBackgroundJourneyRuntimeSurface.ts', 'productEngine.prepareBackgroundJourney'],
      ['src/App.tsx', 'play: handleJourneyPlay'],
    ],
    ownerTokens: ['ProductJourneyScheduleRuntimeState', 'scheduleJourneyRuntime'],
    fixtureTokens: ['requireJourneyScheduleSuspendedHostFixture'],
  },
];

const failures = [];
for (const audit of audits) {
  const hostOwnershipGuarded = audit.hostOwnershipGuardTokens?.every(
    ([path, token]) => readOptional(path).includes(token),
  ) === true;
  for (const authorityGroup of audit.hostAuthorityGroups) {
    if (!hostOwnershipGuarded && authorityGroup.every(([path, token]) => readOptional(path).includes(token))) {
      const evidence = authorityGroup.map(([path, token]) => `${path}: ${token}`).join(' + ');
      failures.push(`${audit.phase} ${audit.id}: host sound authority remains: ${evidence}`);
    }
  }
  for (const token of audit.ownerTokens) {
    if (!engineSources.includes(token)) {
      failures.push(`${audit.phase} ${audit.id}: Product Core owner token is missing: ${token}`);
    }
  }
  for (const token of audit.fixtureTokens) {
    if (!autonomyTest.includes(token)) {
      failures.push(`${audit.phase} ${audit.id}: suspended-host fixture is missing: ${token}`);
    }
  }
}

for (const token of [
  'BoundedSonicTrace',
  'kFiveMinuteFrames',
  'requireBaselineSequencerAutonomyFixture',
  'requireFiveMinuteBoundedClockRun',
]) {
  if (!autonomyTest.includes(token)) {
    failures.push(`8E harness token is missing: ${token}`);
  }
}

if (expectIncomplete) {
  for (const requiredId of ['journey-graph-and-scene-morph']) {
    if (!failures.some((failure) => failure.includes(requiredId))) {
      throw new Error(`Expected the in-progress ownership gate to fail for ${requiredId}`);
    }
  }
  for (const completedId of ['source-auto-morph-and-auto-stop', 'arp-flow-and-harmony-resolution', 'scatter', 'scene-program', 'routing-mute-groups', 'global-auto-cycle']) {
    if (failures.some((failure) => failure.includes(completedId))) {
      throw new Error(`Completed ownership phase regressed for ${completedId}`);
    }
  }
  console.log(`Kessho Product sonic ownership gate correctly found ${failures.length} in-progress failures`);
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error('Kessho Product sonic ownership gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Kessho Product sonic ownership checks passed');
