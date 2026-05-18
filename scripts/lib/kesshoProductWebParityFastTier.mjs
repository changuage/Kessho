import { smokeCases } from './kesshoProductWebGraphSmokeCases.mjs';

const fastSmokeCases = smokeCases.filter((caseDef) => caseDef.metadata?.tier === 'fast');

export const fastSmokeCaseIds = Object.freeze(fastSmokeCases.map((caseDef) => caseDef.id));
export const fastRetryCaseIds = Object.freeze(
  fastSmokeCases.filter((caseDef) => caseDef.metadata?.retryInFast === true).map((caseDef) => caseDef.id),
);
