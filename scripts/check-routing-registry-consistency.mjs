#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const EXPECTED_ROUTING_ROW_IDS = [
  'pad1',
  'pad2',
  'lead1',
  'lead2',
  'piano',
  'drums',
  'granular',
  'waves',
  'water',
  'insects',
  'nature',
  'delayAOut',
  'delayBOut',
  'degrade',
  'reverb',
];
const EXPECTED_DAW_SOURCE_IDS = EXPECTED_ROUTING_ROW_IDS.filter((id) => id !== 'degrade').concat('dynamics');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function idsFromBlock(text, startToken, endToken) {
  const start = text.indexOf(startToken);
  const end = start >= 0 ? text.indexOf(endToken, start) : -1;
  if (start < 0 || end < 0) return [];
  return [...text.slice(start, end).matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]);
}

function sourceIdsFromBlock(text, startToken, endToken) {
  const start = text.indexOf(startToken);
  const end = start >= 0 ? text.indexOf(endToken, start) : -1;
  if (start < 0 || end < 0) return [];
  return [...text.slice(start, end).matchAll(/sourceId:\s*'([^']+)'/g)].map((match) => match[1]);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

const registry = read('src/ui/routing/routingSourceRegistry.ts');
const routingMatrix = read('src/ui/global/RoutingMatrix.tsx');
const engineGroups = read('src/ui/snowflakeV2/engineGroups.ts');
const snowflakeUi = read('src/ui/SnowflakeUI.tsx');
const app = read('src/App.tsx');
const dawOutputRouting = read('src/audio/dawOutputRouting.ts');
const dawOutputPanel = read('src/ui/routing/DawOutputPanel.tsx');
const helpCatalog = read('src/ui/sliderHelpCatalog.ts');

const registryIds = idsFromBlock(registry, 'export const ROUTING_SOURCE_REGISTRY = [', '] as const satisfies readonly RoutingSourceDef[]');
const matrixIds = idsFromBlock(routingMatrix, 'const ROWS: MatrixRow[] = [', 'function scaleRangeTowardZero');
const dawSourceIds = sourceIdsFromBlock(dawOutputRouting, 'export const DAW_OUTPUT_SOURCE_DEFS = [', '] as const');

assert(sameArray(registryIds, EXPECTED_ROUTING_ROW_IDS), `Routing registry row ids drifted: ${registryIds.join(',')}`);
assert(sameArray(matrixIds, registryIds), `Routing matrix rows must match registry order. Matrix=${matrixIds.join(',')} Registry=${registryIds.join(',')}`);
assert(sameArray(dawSourceIds, EXPECTED_DAW_SOURCE_IDS), `DAW output sources must match routing registry production taps. DAW=${dawSourceIds.join(',')}`);

assert(registry.includes("enabledKeys: ['insectsEnabled', 'insects2Enabled']"), 'Insects routing predicate must include insects2Enabled.');
assert(registry.includes("enabledKeys: ['birdsEnabled', 'birds2Enabled', 'frogsEnabled']"), 'Nature routing predicate must include birds2Enabled and frogsEnabled.');
assert(registry.includes("enabledKeys: ['degradeEnabled', 'driftEnabled', 'erosionEnabled', 'dynamicsSaturationEnabled']"), 'Degrade predicate must include all Degrade/Texture activators.');
assert(registry.includes("sends: { reverb: 'degradeReverbSend' }"), 'Degrade return row must expose Degrade to Reverb send.');
assert(registry.includes("sends: { degrade: 'reverbDegradeSend' }"), 'Reverb return row must expose Reverb to Degrade send.');

assert(
  routingMatrix.includes('ROUTING_SOURCE_REGISTRY') &&
    routingMatrix.includes('DYNAMICS_ROUTE_BY_ROW') &&
    routingMatrix.includes("label: `${row.label} → Texture Bus`") &&
    routingMatrix.includes('getRoutingSourceDef(row.id)'),
  'RoutingMatrix must use the central routing registry for labels, Texture bus keys, and enablement.',
);
assert(
  app.includes('getActiveDawOutputSourceIds(state)') &&
    app.includes('getRoutingSourceDef(sourceId)') &&
    app.includes('getRoutingSourceToggleKeys(sourceId)') &&
    !app.includes('ROUTING_SOURCE_SIMPLE_TOGGLES') &&
    !app.includes('ROUTING_SOURCE_DISABLE_ONLY_FAMILIES'),
  'App routing toggles and active DAW sources must use the routing registry.',
);
assert(
  dawOutputPanel.includes('dawOutputSourceIsActive') &&
    dawOutputPanel.includes('dawOutputSourceIsActive(source.sourceId, state)'),
  'DAW output source filtering must use routing registry predicates.',
);
assert(
  engineGroups.includes('ROUTING_SOURCE_REGISTRY') &&
    engineGroups.includes('row.snowflakeArmEligible') &&
    engineGroups.includes('degrade?: keyof SliderState | null') &&
    engineGroups.includes('direction: \'delayA\' | \'delayB\' | \'granular\' | \'degrade\' | \'reverb\'') &&
    engineGroups.includes('SNOWFLAKE_RETURN_ROW_POLICY'),
  'Snowflake V2 engine groups must be projected from the registry and include Degrade send support.',
);
assert(
  snowflakeUi.includes('engine.sends.degrade') &&
    snowflakeUi.includes("key: 'degrade'") &&
    snowflakeUi.includes('FX_COLORS.degrade'),
  'Snowflake UI must include Degrade send runtime dependencies and star control.',
);
assert(
  helpCatalog.includes('Columns are Level, Delay A, Delay B, Granular, Degrade, Reverb, and Texture') &&
    helpCatalog.includes('routingMatrixTextureColumn'),
  'Routing help text must describe the registry columns with Texture terminology.',
);

if (failures.length > 0) {
  console.error('Routing registry audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Routing registry audit passed.');
