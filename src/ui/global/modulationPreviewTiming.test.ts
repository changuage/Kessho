import assert from 'node:assert/strict';
import test from 'node:test';
import type { ModulationSourceConfig } from '../sliderSystem/dualConfigReducer';
import { getModulationPreviewDurationSec } from './modulationPreviewTiming';

const clock = { barDurationSec: 2, phraseDurationSec: 16 };

test('modulation preview derives free and linked shape speed from the effective phrase', () => {
  const free: ModulationSourceConfig = {
    type: 'shape',
    shape: { shape: 'sine', timing: { mode: 'free', speed: 2 } },
  };
  const link: ModulationSourceConfig = {
    type: 'shape',
    shape: { shape: 'triangle', timing: { mode: 'link', speed: 0.5 } },
  };

  assert.equal(getModulationPreviewDurationSec(free, clock), 8);
  assert.equal(getModulationPreviewDurationSec(link, clock), 32);
});

test('modulation preview derives sync duration from the selected project clock', () => {
  const bar: ModulationSourceConfig = {
    type: 'shape',
    shape: { shape: 'sine', timing: { mode: 'sync', reference: 'bar', division: '2x' } },
  };
  const phrase: ModulationSourceConfig = {
    type: 'shape',
    shape: { shape: 'square', timing: { mode: 'sync', reference: 'phrase', division: '1/4' } },
  };

  assert.equal(getModulationPreviewDurationSec(bar, clock), 4);
  assert.equal(getModulationPreviewDurationSec(phrase, clock), 4);
});

test('modulation preview keeps walk relative and sample-and-hold trigger-driven', () => {
  const walk: ModulationSourceConfig = {
    type: 'walk',
    walk: { relationship: 'free', speed: 2 },
  };
  const sampleHold: ModulationSourceConfig = { type: 'sampleHold' };

  assert.equal(getModulationPreviewDurationSec(walk, clock), 2);
  assert.equal(getModulationPreviewDurationSec(sampleHold, clock), 4);
});
