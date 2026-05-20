import { smokeCases } from './kesshoProductWebGraphSmokeCases.mjs';

const fastSmokeCases = smokeCases.filter((caseDef) => caseDef.metadata?.tier === 'fast');

export const fastSmokeCaseIds = Object.freeze(fastSmokeCases.map((caseDef) => caseDef.id));
