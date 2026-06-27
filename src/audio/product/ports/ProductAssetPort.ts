import type {
  ProductAssetHandle,
  ProductAssetRegistration,
} from '../ProductEngineTypes';

export type ProductEngineAssetPort = {
  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle>;
  unregisterAsset(assetId: number): void;
};
