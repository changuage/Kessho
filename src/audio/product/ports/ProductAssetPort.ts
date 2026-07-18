import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductStateRecord,
} from '../ProductEngineTypes';

export type ProductEngineAssetPort = {
  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle>;
  unregisterAsset(assetId: number): void;
  prepareSceneAssets(states: readonly ProductStateRecord[]): Promise<void>;
  clearSceneAssets(): void;
};
