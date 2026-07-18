import assert from 'node:assert/strict';
import test from 'node:test';

import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import type { BackgroundJourneyPlan } from './compileBackgroundJourneyPlan';
import { createCoreProductJourneyScheduleEnabledEvent, createCoreProductJourneyScheduleEvents } from './createBackgroundJourneyEvents';

test('encodes uint64 Journey frame deadlines losslessly into four chunks', () => {
  const holdFrames = 0xfedcba9876543210n;
  const morphFrames = 0x0123456789abcdefn;
  const plan: BackgroundJourneyPlan = {
    entries: [{ fromNodeIndex: 1, toNodeIndex: 2, transitionProgramIndex: 0xffff, holdFrames, morphFrames, flags: 3 }],
    transitionPrograms: [], loopStartIndex: 0, totalFrames: holdFrames + morphFrames,
    rngStateAfterPlan: 0xf1234567, referencedNodeMask: 3, revision: 0xe1234567,
  };
  const events = createCoreProductJourneyScheduleEvents(plan);
  assert.deepEqual(events[1], {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyScheduleEntryHold,
    targetId: 0x0201, index: 0, paramId: 0xffff,
    value: 0x3210, value2: 0x7654, value3: 0xba98, value4: 0xfedc, flags: 3,
  });
  assert.deepEqual(events[2], {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyScheduleEntryMorph,
    index: 0, value: 0xcdef, value2: 0x89ab, value3: 0x4567, value4: 0x0123,
  });
  assert.equal(events[events.length - 1]?.eventKind, KESSHO_PRODUCT_EVENT_IDS.CommitJourneySchedule);
  assert.deepEqual(createCoreProductJourneyScheduleEnabledEvent(true), {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyScheduleEnabled, value: 1,
  });
});
