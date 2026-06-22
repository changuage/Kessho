#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_BASENAME = 'preset-cluster-analysis-2026-06-21';
const OUTPUT_JSON = path.join(ROOT, 'docs', `${OUTPUT_BASENAME}.json`);
const OUTPUT_MARKDOWN = path.join(ROOT, 'docs', `${OUTPUT_BASENAME}.md`);

const ENGINE_SCOPES = [
  { family: 'synth', scope: 'pad1', title: 'Synth / Pad' },
  { family: 'lead', scope: 'lead4opfm', title: 'Lead4opFM' },
  { family: 'drum', scope: 'drumSub', title: 'Drum Sub' },
  { family: 'drum', scope: 'drumKick', title: 'Drum Kick' },
  { family: 'drum', scope: 'drumClick', title: 'Drum Click' },
  { family: 'drum', scope: 'drumBeepHi', title: 'Drum Beep Hi' },
  { family: 'drum', scope: 'drumBeepLo', title: 'Drum Beep Lo' },
  { family: 'drum', scope: 'drumNoise', title: 'Drum Noise' },
  { family: 'drum', scope: 'drumMembrane', title: 'Drum Membrane' },
];

const EXCLUDED_PAYLOAD_KEYS = new Set([
  'id',
  'name',
  'description',
  '_notes',
  '_notes_v2',
  '_engineSchemaVersion',
  'source',
  'engine',
  'method',
  'operators',
]);

const STOP_TAGS = new Set([
  'lead4opfm',
  'fm',
  'v2',
  'showcase',
  'default',
  'init',
  'stock',
  'factory',
  'clean',
  'engine',
  'retune',
]);

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const pairs = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    pairs[key] = value;
  }
  return pairs;
}

function readEnv() {
  return {
    ...readEnvFile(path.join(ROOT, '.env')),
    ...readEnvFile(path.join(ROOT, '.env.local')),
    ...process.env,
  };
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function flattenPayload(value, prefix = '', target = {}) {
  if (value === undefined || value === null) return target;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenPayload(item, `${prefix}[${index}]`, target));
    return target;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!prefix && EXCLUDED_PAYLOAD_KEYS.has(key)) continue;
      flattenPayload(child, prefix ? `${prefix}.${key}` : key, target);
    }
    return target;
  }
  if (!prefix) return target;
  target[prefix] = typeof value === 'number' ? normalizeNumber(value) : value;
  return target;
}

function numericTransformKey(key) {
  return /(freq|cutoff|decay|attack|release|duration|rate|hold|time|filter|pitchdecay|modrelease)/i.test(key);
}

function addTagFeatures(presets, featureRows, weight) {
  const tagCounts = new Map();
  for (const preset of presets) {
    for (const tag of preset.tags ?? []) {
      const normalized = String(tag).trim().toLowerCase();
      if (!normalized || STOP_TAGS.has(normalized)) continue;
      tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
    }
  }
  for (let index = 0; index < presets.length; index += 1) {
    for (const tag of presets[index].tags ?? []) {
      const normalized = String(tag).trim().toLowerCase();
      if (!normalized || STOP_TAGS.has(normalized)) continue;
      if ((tagCounts.get(normalized) ?? 0) < 2) continue;
      featureRows[index][`tag:${normalized}`] = weight;
    }
  }
}

function buildFeatureMatrix(presets, options = {}) {
  const flattened = presets.map((preset) => flattenPayload(preset.payload));
  if (options.includeTags) addTagFeatures(presets, flattened, options.tagWeight ?? 0.3);

  const numericKeys = [];
  const categoricalValues = new Map();

  for (const row of flattened) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number' || typeof value === 'boolean') {
        if (!numericKeys.includes(key)) numericKeys.push(key);
      } else {
        if (!categoricalValues.has(key)) categoricalValues.set(key, new Set());
        categoricalValues.get(key).add(String(value));
      }
    }
  }

  numericKeys.sort();
  const numericStats = new Map();
  for (const key of numericKeys) {
    const rawValues = flattened.map((row) => {
      const value = row[key];
      if (typeof value === 'boolean') return value ? 1 : 0;
      return typeof value === 'number' ? value : 0;
    });
    const shouldLog = numericTransformKey(key) && rawValues.every((value) => value >= 0);
    const values = rawValues.map((value) => (shouldLog ? Math.log1p(value) : value));
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1);
    const std = Math.sqrt(variance);
    if (std > 1e-9) numericStats.set(key, { mean, std, shouldLog });
  }

  const categoricalFeatures = [];
  for (const [key, values] of categoricalValues.entries()) {
    if (values.size <= 1) continue;
    for (const value of [...values].sort()) {
      categoricalFeatures.push([key, value]);
    }
  }

  const featureNames = [
    ...[...numericStats.keys()].map((key) => `num:${key}`),
    ...categoricalFeatures.map(([key, value]) => `cat:${key}=${value}`),
  ];

  const vectors = flattened.map((row) => {
    const vector = [];
    for (const [key, stats] of numericStats.entries()) {
      const rawValue = row[key];
      const numericValue = typeof rawValue === 'boolean'
        ? rawValue ? 1 : 0
        : typeof rawValue === 'number'
          ? rawValue
          : 0;
      const value = stats.shouldLog ? Math.log1p(numericValue) : numericValue;
      vector.push((value - stats.mean) / stats.std);
    }
    for (const [key, value] of categoricalFeatures) {
      vector.push(String(row[key] ?? '') === value ? 0.65 : 0);
    }
    return vector;
  });

  return { vectors, featureNames, flattened };
}

function distance(left, right) {
  if (!left.length && !right.length) return 0;
  let sum = 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum / Math.max(length, 1));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function pairDistances(presets, vectors) {
  const pairs = [];
  for (let left = 0; left < presets.length; left += 1) {
    for (let right = left + 1; right < presets.length; right += 1) {
      pairs.push({
        left: presets[left].name,
        right: presets[right].name,
        leftId: presets[left].id,
        rightId: presets[right].id,
        distance: distance(vectors[left], vectors[right]),
      });
    }
  }
  return pairs.sort((left, right) => left.distance - right.distance);
}

function completeLinkDistance(clusterA, clusterB, distanceByPairKey) {
  let maxDistance = 0;
  for (const left of clusterA) {
    for (const right of clusterB) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      maxDistance = Math.max(maxDistance, distanceByPairKey.get(key) ?? 0);
    }
  }
  return maxDistance;
}

function completeLinkClusters(presets, pairs, threshold) {
  const indexById = new Map(presets.map((preset, index) => [preset.id, index]));
  const distanceByPairKey = new Map();
  for (const pair of pairs) {
    const left = indexById.get(pair.leftId);
    const right = indexById.get(pair.rightId);
    const key = left < right ? `${left}:${right}` : `${right}:${left}`;
    distanceByPairKey.set(key, pair.distance);
  }

  const clusters = presets.map((_, index) => [index]);
  for (;;) {
    let bestLeft = -1;
    let bestRight = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let left = 0; left < clusters.length; left += 1) {
      for (let right = left + 1; right < clusters.length; right += 1) {
        const candidate = completeLinkDistance(clusters[left], clusters[right], distanceByPairKey);
        if (candidate < bestDistance) {
          bestDistance = candidate;
          bestLeft = left;
          bestRight = right;
        }
      }
    }
    if (bestLeft < 0 || bestDistance > threshold) break;
    clusters[bestLeft] = [...clusters[bestLeft], ...clusters[bestRight]];
    clusters.splice(bestRight, 1);
  }

  return clusters
    .map((group) => group.map((index) => presets[index]))
    .filter((group) => group.length > 1)
    .map((group) => {
      const groupIds = new Set(group.map((preset) => preset.id));
      const internalPairs = pairs.filter((pair) => groupIds.has(pair.leftId) && groupIds.has(pair.rightId));
      return {
        size: group.length,
        members: group.map((preset) => preset.name).sort(),
        maxDistance: internalPairs.length
          ? Math.max(...internalPairs.map((pair) => pair.distance))
          : 0,
        averageDistance: internalPairs.length
          ? internalPairs.reduce((sum, pair) => sum + pair.distance, 0) / internalPairs.length
          : 0,
        closestPair: internalPairs[0] ?? null,
      };
    })
    .sort((left, right) => left.averageDistance - right.averageDistance || right.size - left.size);
}

function targetMetaClusterCount(count, scope) {
  if (scope === 'pad1') return Math.min(6, Math.max(4, Math.round(Math.sqrt(count))));
  if (scope === 'lead4opfm') return 6;
  return Math.min(8, Math.max(5, Math.round(Math.sqrt(count)) + 1));
}

function meanVector(memberIndexes, vectors) {
  const length = vectors[0]?.length ?? 0;
  const centroid = Array.from({ length }, () => 0);
  if (!memberIndexes.length) return centroid;
  for (const index of memberIndexes) {
    for (let featureIndex = 0; featureIndex < length; featureIndex += 1) {
      centroid[featureIndex] += vectors[index][featureIndex] ?? 0;
    }
  }
  return centroid.map((value) => value / memberIndexes.length);
}

function nearestCentroidIndex(vector, centroids) {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centroids.length; index += 1) {
    const candidate = distance(vector, centroids[index]);
    if (candidate < nearestDistance) {
      nearestDistance = candidate;
      nearest = index;
    }
  }
  return nearest;
}

function farthestPointIndex(vectors, selectedIndexes) {
  let farthest = 0;
  let farthestDistance = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vectors.length; index += 1) {
    if (selectedIndexes.includes(index)) continue;
    const minDistance = selectedIndexes.length
      ? Math.min(...selectedIndexes.map((selected) => distance(vectors[index], vectors[selected])))
      : 0;
    if (minDistance > farthestDistance) {
      farthestDistance = minDistance;
      farthest = index;
    }
  }
  return farthest;
}

function deterministicKMeansClusters(presets, vectors, targetCount) {
  if (presets.length <= targetCount) return presets.map((preset) => [preset]);
  const globalMean = meanVector(vectors.map((_, index) => index), vectors);
  let first = 0;
  let firstDistance = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vectors.length; index += 1) {
    const candidate = distance(vectors[index], globalMean);
    if (candidate > firstDistance) {
      firstDistance = candidate;
      first = index;
    }
  }

  const selected = [first];
  while (selected.length < targetCount) {
    selected.push(farthestPointIndex(vectors, selected));
  }

  let centroids = selected.map((index) => [...vectors[index]]);
  let assignments = Array.from({ length: vectors.length }, () => -1);
  for (let iteration = 0; iteration < 50; iteration += 1) {
    let changed = false;
    const nextAssignments = vectors.map((vector) => nearestCentroidIndex(vector, centroids));
    for (let index = 0; index < nextAssignments.length; index += 1) {
      if (nextAssignments[index] !== assignments[index]) changed = true;
    }
    assignments = nextAssignments;

    const buckets = Array.from({ length: targetCount }, () => []);
    assignments.forEach((clusterIndex, pointIndex) => buckets[clusterIndex].push(pointIndex));

    for (let clusterIndex = 0; clusterIndex < buckets.length; clusterIndex += 1) {
      if (buckets[clusterIndex].length) continue;
      const largestClusterIndex = buckets
        .map((bucket, index) => ({ index, size: bucket.length }))
        .sort((left, right) => right.size - left.size)[0]?.index;
      if (largestClusterIndex === undefined || buckets[largestClusterIndex].length <= 1) continue;
      const largestCentroid = meanVector(buckets[largestClusterIndex], vectors);
      let farthestInLargest = buckets[largestClusterIndex][0];
      let farthestInLargestDistance = Number.NEGATIVE_INFINITY;
      for (const pointIndex of buckets[largestClusterIndex]) {
        const candidate = distance(vectors[pointIndex], largestCentroid);
        if (candidate > farthestInLargestDistance) {
          farthestInLargestDistance = candidate;
          farthestInLargest = pointIndex;
        }
      }
      buckets[largestClusterIndex] = buckets[largestClusterIndex].filter((pointIndex) => pointIndex !== farthestInLargest);
      buckets[clusterIndex].push(farthestInLargest);
      assignments[farthestInLargest] = clusterIndex;
    }

    centroids = buckets.map((bucket) => meanVector(bucket, vectors));
    if (!changed) break;
  }

  const finalBuckets = Array.from({ length: targetCount }, () => []);
  assignments.forEach((clusterIndex, pointIndex) => finalBuckets[clusterIndex].push(pointIndex));
  return finalBuckets
    .filter((bucket) => bucket.length)
    .map((bucket) => bucket.map((index) => presets[index]));
}

function topTags(presets, limit = 5) {
  const counts = new Map();
  for (const preset of presets) {
    for (const rawTag of preset.tags ?? []) {
      const tag = String(rawTag).trim().toLowerCase();
      if (!tag || STOP_TAGS.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

function averageNumeric(flattenedRows, keyPattern) {
  const values = [];
  for (const row of flattenedRows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number' && keyPattern.test(key)) values.push(value);
    }
  }
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function inferTraits(presets, flattenedById) {
  const rows = presets.map((preset) => flattenedById.get(preset.id)).filter(Boolean);
  const traits = new Set(topTags(presets, 4));
  const attack = averageNumeric(rows, /(attack)$/i);
  const release = averageNumeric(rows, /(release)$/i);
  const decay = averageNumeric(rows, /(decay)$/i);
  const freq = averageNumeric(rows, /(freq|cutoff|max)$/i);
  const noise = averageNumeric(rows, /(noise|shimmer)/i);
  const drive = averageNumeric(rows, /(drive|fold|feedback|distort)/i);
  const sustain = averageNumeric(rows, /(sustain)$/i);

  if (attack !== null) {
    if (attack < 0.1) traits.add('fast-attack');
    else if (attack > 1.5) traits.add('slow-attack');
  }
  if (decay !== null) {
    if (decay < 0.25) traits.add('short-decay');
    else if (decay > 3 || decay > 650) traits.add('long-decay');
  }
  if (release !== null) {
    if (release < 0.5) traits.add('short-release');
    else if (release > 4) traits.add('long-release');
  }
  if (freq !== null) {
    if (freq < 180) traits.add('low');
    else if (freq > 2500) traits.add('bright');
  }
  if (noise !== null && noise > 0.25) traits.add('noisy');
  if (drive !== null && drive > 0.35) traits.add('driven');
  if (sustain !== null && sustain > 0.6) traits.add('sustained');
  if (sustain !== null && sustain < 0.2) traits.add('percussive');

  return [...traits].slice(0, 7);
}

function summarizeMetaClusters(clusters, flattenedById) {
  return clusters
    .map((members) => ({
      size: members.length,
      suggestedTags: inferTraits(members, flattenedById),
      members: members.map((preset) => preset.name).sort(),
    }))
    .sort((left, right) => right.size - left.size || left.members[0].localeCompare(right.members[0]));
}

function markdownList(items) {
  if (!items.length) return '- None';
  return items.map((item) => `- ${item}`).join('\n');
}

function formatDistance(value) {
  return value.toFixed(3);
}

function renderReport(report) {
  const lines = [];
  lines.push('# Preset Cluster Analysis');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Source');
  lines.push('');
  lines.push('- Live Supabase V2 reads via `preset_summaries_v2`, `kessho_lookup_preset_rows_v2`, and `kessho_get_preset_payloads_v2`.');
  lines.push('- Direct base-table reads were not used; the current project denies anonymous reads on `presets_v2`.');
  lines.push('- Legacy preset rows were inspected for fallback coverage but excluded from clustering because V2 has current target-engine coverage.');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('- Similarity analysis is scoped per engine because parameter meanings differ between engines.');
  lines.push('- Numeric payload fields are standardized within each engine. Time/frequency-like fields use log scaling before standardization.');
  lines.push('- Discrete synthesis fields such as waveforms, algorithms, filter types, and routing modes are included as one-hot features.');
  lines.push('- Existing human tags are excluded from deletion similarity, then lightly included for meta-group clustering and label inference.');
  lines.push('- Meta groups use deterministic k-means with recurring tags weighted alongside sonic parameters.');
  lines.push('- Distances are normalized Euclidean distances over the resulting feature vector; lower means more similar.');
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Engine | Count | Latest update |');
  lines.push('| --- | ---: | --- |');
  for (const scope of report.scopes) {
    lines.push(`| ${scope.title} (${scope.scope}) | ${scope.count} | ${scope.latestUpdatedAt ?? ''} |`);
  }
  lines.push('');
  lines.push('## Deletion Similarity Clusters');
  lines.push('');
  for (const scope of report.scopes) {
    lines.push(`### ${scope.title} (${scope.scope})`);
    lines.push('');
    lines.push(`Threshold: ${formatDistance(scope.similarityThreshold)}. Pair distance p05/p10/median: ${formatDistance(scope.distanceStats.p05)} / ${formatDistance(scope.distanceStats.p10)} / ${formatDistance(scope.distanceStats.median)}.`);
    lines.push('');
    lines.push('Closest pairs:');
    lines.push(markdownList(scope.closestPairs.slice(0, 8).map((pair) => `${pair.left} <-> ${pair.right} (${formatDistance(pair.distance)})`)));
    lines.push('');
    lines.push('Candidate deletion clusters:');
    if (!scope.similarClusters.length) {
      lines.push('- None under threshold.');
    } else {
      for (const cluster of scope.similarClusters.slice(0, 10)) {
        const closest = cluster.closestPair
          ? ` Closest: ${cluster.closestPair.left} <-> ${cluster.closestPair.right} (${formatDistance(cluster.closestPair.distance)}).`
          : '';
        lines.push(`- ${cluster.members.join(', ')}. Avg/max distance ${formatDistance(cluster.averageDistance)} / ${formatDistance(cluster.maxDistance)}.${closest}`);
      }
    }
    lines.push('');
  }
  lines.push('## Meta Tagging Groups');
  lines.push('');
  for (const scope of report.scopes) {
    lines.push(`### ${scope.title} (${scope.scope})`);
    lines.push('');
    for (const [index, group] of scope.metaGroups.entries()) {
      lines.push(`- Group ${index + 1}: ${group.suggestedTags.join(', ') || 'untagged'} (${group.size})`);
      lines.push(`  Members: ${group.members.join(', ')}`);
    }
    lines.push('');
  }
  lines.push('## Notes');
  lines.push('');
  lines.push('- The deletion clusters are candidates, not automatic delete recommendations. Audition each cluster because small parameter distance can still matter musically.');
  lines.push('- The JSON companion file contains latest resolved payload hashes, closest pairs, candidate clusters, and meta groups.');
  lines.push('');
  return lines.join('\n');
}

async function fetchRows(client, scope) {
  const { data, error } = await client.rpc('kessho_lookup_preset_rows_v2', {
    target_preset_id: null,
    target_type: 'engine',
    target_name: null,
    target_scopes: [scope],
    target_scope_is_null: false,
    target_resolved_hash: null,
    exclude_preset_id: null,
    include_deleted: false,
    deleted_only: false,
    include_internal_derived: false,
    internal_derived_only: false,
    max_rows: 1000,
    page_offset: 0,
  });
  if (error) throw new Error(`${scope} row lookup failed: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

async function fetchLatestPayload(client, row) {
  if (!row.latest_resolved_hash) {
    throw new Error(`${row.scope}:${row.name} has no latest_resolved_hash`);
  }
  const { data, error } = await client.rpc('kessho_get_preset_payloads_v2', {
    target_hashes: [row.latest_resolved_hash],
  });
  if (error) throw new Error(`${row.scope}:${row.name} payload fetch failed: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') {
    throw new Error(`${row.scope}:${row.name} expected one latest payload, got ${Array.isArray(data) ? data.length : typeof data}`);
  }
  return data[0];
}

function analyzeScope(scopeConfig, presets) {
  const similarityFeatures = buildFeatureMatrix(presets, { includeTags: false });
  const metaFeatures = buildFeatureMatrix(presets, { includeTags: true, tagWeight: 1.0 });
  const pairs = pairDistances(presets, similarityFeatures.vectors);
  const pairValues = pairs.map((pair) => pair.distance);
  const p05 = percentile(pairValues, 0.05);
  const p10 = percentile(pairValues, 0.10);
  const median = percentile(pairValues, 0.50);
  const similarityThreshold = Math.max(0.18, Math.min(0.42, p05 * 1.2 || p10 || 0.18));
  const similarClusters = completeLinkClusters(presets, pairs, similarityThreshold);
  const targetCount = targetMetaClusterCount(presets.length, scopeConfig.scope);
  const metaClusters = deterministicKMeansClusters(presets, metaFeatures.vectors, targetCount);
  const flattenedById = new Map(presets.map((preset, index) => [preset.id, similarityFeatures.flattened[index]]));
  const latestUpdatedAt = presets
    .map((preset) => preset.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    family: scopeConfig.family,
    scope: scopeConfig.scope,
    title: scopeConfig.title,
    count: presets.length,
    latestUpdatedAt,
    featureCount: similarityFeatures.featureNames.length,
    distanceStats: { p05, p10, median },
    similarityThreshold,
    closestPairs: pairs.slice(0, 30),
    similarClusters,
    metaGroups: summarizeMetaClusters(metaClusters, flattenedById),
  };
}

async function main() {
  const env = readEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env/.env.local/process env');
  }

  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authError } = await client.auth.signInAnonymously();
  if (authError) throw new Error(`Anonymous Supabase auth failed: ${authError.message}`);

  const allPresets = [];
  const scopes = [];
  for (const scopeConfig of ENGINE_SCOPES) {
    const rows = await fetchRows(client, scopeConfig.scope);
    const presets = [];
    for (const row of rows) {
      const payload = await fetchLatestPayload(client, row);
      presets.push({
        id: row.id,
        family: scopeConfig.family,
        scope: scopeConfig.scope,
        name: row.name,
        tags: Array.isArray(row.tags) ? row.tags : [],
        author: row.author,
        library: row.library,
        visibility: row.visibility,
        latestVersionNo: row.latest_version_no,
        latestResolvedHash: row.latest_resolved_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        payload,
      });
    }
    presets.sort((left, right) => left.name.localeCompare(right.name));
    allPresets.push(...presets);
    scopes.push(analyzeScope(scopeConfig, presets));
    console.log(`${scopeConfig.scope}: ${presets.length}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      kind: 'supabase-v2-public-read-rpcs',
      summaryView: 'preset_summaries_v2',
      rowRpc: 'kessho_lookup_preset_rows_v2',
      payloadRpc: 'kessho_get_preset_payloads_v2',
    },
    counts: {
      total: allPresets.length,
      byFamily: allPresets.reduce((acc, preset) => {
        acc[preset.family] = (acc[preset.family] ?? 0) + 1;
        return acc;
      }, {}),
      byScope: allPresets.reduce((acc, preset) => {
        acc[preset.scope] = (acc[preset.scope] ?? 0) + 1;
        return acc;
      }, {}),
    },
    scopes,
    presets: allPresets.map(({ payload, ...preset }) => ({
      ...preset,
      payloadKeyCount: Object.keys(flattenPayload(payload)).length,
    })),
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_MARKDOWN, renderReport(report));
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_MARKDOWN)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
