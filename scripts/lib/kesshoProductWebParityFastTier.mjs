import { smokeCases } from './kesshoProductWebGraphSmokeCases.mjs';

const fastSmokeCaseOrder = [
  'manual-pad-granular-reverb-send-clean',
  'manual-pad-reverb-return-live-wash-bloom-decay',
];

const fastSmokeCaseIdsFromMetadata = smokeCases
  .filter((caseDef) => caseDef.metadata?.tier === 'fast')
  .map((caseDef) => caseDef.id);
const missingOrderedCaseIds = fastSmokeCaseOrder.filter((caseId) => !fastSmokeCaseIdsFromMetadata.includes(caseId));
const unorderedCaseIds = fastSmokeCaseIdsFromMetadata.filter((caseId) => !fastSmokeCaseOrder.includes(caseId));

if (missingOrderedCaseIds.length > 0 || unorderedCaseIds.length > 0) {
  throw new Error([
    missingOrderedCaseIds.length > 0 ? `Fast smoke order references non-fast case(s): ${missingOrderedCaseIds.join(', ')}` : '',
    unorderedCaseIds.length > 0 ? `Fast smoke metadata has unordered case(s): ${unorderedCaseIds.join(', ')}` : '',
  ].filter(Boolean).join('; '));
}

export const fastSmokeCaseIds = Object.freeze([...fastSmokeCaseOrder]);
