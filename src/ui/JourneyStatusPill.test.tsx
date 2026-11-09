import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSimpleJourney, type JourneyState } from '../audio/journeyTypes';
import { DEFAULT_STATE } from './state';
import { JourneyStatusPill } from './JourneyStatusPill';

test('Journey badge shows the same absolute blend as the slider in either direction', () => {
  const config = createSimpleJourney(
    { name: 'A', timestamp: '', state: DEFAULT_STATE }, { name: 'B', timestamp: '', state: DEFAULT_STATE },
  );
  const state: JourneyState = {
    phase: 'morphing', currentNodeId: config.nodes[0]!.id, nextNodeId: config.nodes[1]!.id,
    plannedNextNodeId: null, phraseProgress: 0, morphProgress: 0.09, elapsedTime: 0,
    phraseStartTime: 0, morphStartTime: 0, resolvedPhraseDuration: 1, resolvedMorphDuration: 1,
  };
  for (const position of [1.6, 98.4]) {
    const markup = renderToStaticMarkup(createElement(JourneyStatusPill, { state, config, morphPosition: position }));
    assert.match(markup, new RegExp(`>${Math.round(position)}%</span>`));
    assert.ok(markup.includes(`width:${position}%`));
  }
});
