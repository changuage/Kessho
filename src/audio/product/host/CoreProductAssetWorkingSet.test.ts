import assert from 'node:assert/strict';

import { CoreProductAssetWorkingSet } from './CoreProductAssetWorkingSet';

const MiB = 1024 * 1024;
const workingSet = new CoreProductAssetWorkingSet(160 * MiB, 192 * MiB);
workingSet.setRequiredAssetIds([1, 2], 1);
workingSet.recordRegistration(1, 100 * MiB);
workingSet.recordRegistration(3, 70 * MiB);
workingSet.setRequiredAssetIds([1, 2], 2);
assert.deepEqual(
  workingSet.planAdmission(2, 4 * MiB),
  { status: 'ready', releaseAssetIds: [3] },
  'admission should release the least-recently-required obsolete asset',
);

const requiredOnly = new CoreProductAssetWorkingSet(160 * MiB, 192 * MiB);
requiredOnly.setRequiredAssetIds([1, 2], 1);
requiredOnly.recordRegistration(1, 190 * MiB);
assert.deepEqual(
  requiredOnly.planAdmission(2, 4 * MiB),
  { status: 'not-ready', reason: 'hard-budget', requiredBytes: 194 * MiB, hardBytes: 192 * MiB },
  'hard-budget admission should fail before decoding when required assets cannot fit',
);

console.log('Core Product asset working-set tests passed');
