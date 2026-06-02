import { createCoreProductParamEvent, type CoreProductEvent } from './coreProductEvents';
import { productHarmonyScaleIdFromName } from './coreProductHarmonyScaleIds';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';

export function createCoreProductHarmonyParamEvents(harmonyState: {
  effectiveRoot: number;
  scaleFamily: { name: string };
}): CoreProductEvent[] {
  return [
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.HarmonyRootMidi, 60 + harmonyState.effectiveRoot),
    createCoreProductParamEvent(KESSHO_PRODUCT_PARAM_IDS.HarmonyScaleId, productHarmonyScaleIdFromName(harmonyState.scaleFamily.name)),
  ];
}
