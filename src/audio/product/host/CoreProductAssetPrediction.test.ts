import assert from 'node:assert/strict';
import test from 'node:test';

import { AUDIO_ASSET_PCM_METADATA } from '../../generated/audioAssetPcmMetadata';
import { predictedDecodedAssetBytes } from './CoreProductAssetPrediction';

test('predicts decoded PCM bytes from generated Vorbis metadata at the output sample rate', () => {
  const path = 'Piano/piano_01.ogg';
  const metadata = AUDIO_ASSET_PCM_METADATA[path];
  assert.ok(metadata);
  const expected = Math.ceil(metadata.frames * 48_000 / metadata.sampleRate) * metadata.channels * 4;
  assert.equal(predictedDecodedAssetBytes(path, 48_000), expected);
  assert.equal(predictedDecodedAssetBytes(`https://example.test/app/samples/${path}`, 48_000), expected);
  assert.equal(predictedDecodedAssetBytes('missing.ogg', 48_000), null);
});
