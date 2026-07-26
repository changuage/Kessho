import assert from 'node:assert/strict';
import test from 'node:test';
import { generateHarmonySuggestionBank, HARMONY_SUGGESTION_POSITION_CATEGORIES, freezeSuggestionBank, createHarmonySuggestionEngine, createSuggestionBankLatch, sharedHarmonyPitchAxis } from './chordSuggestionEngine';
import { analyzeVoiceLeading } from './voiceLeadingScore';

test('suggestion bank uses fixed physical positions and allows empty color pads', () => {
  const bank = generateHarmonySuggestionBank({ rootMidi: 60, scaleId: 1, tension: 0.05 });
  assert.equal(bank.length, 8);
  assert.deepEqual(bank.map((item) => item?.category ?? null).slice(0, 4), ['safe', 'safe', 'movement', 'movement']);
  assert.equal(bank[4], null);
  assert.equal(bank[5], null);
  assert.equal(bank[6], null);
  assert.equal(bank[7]?.category, 'wildcard');
  assert.deepEqual(bank.map((item) => item?.triggerKey ?? null), ['Z', 'X', 'C', 'V', null, null, null, ',']);
});

test('default ranking favors common tones and small movement', () => {
  const bank = generateHarmonySuggestionBank({ rootMidi: 60, scaleId: 1, tension: 0.2, currentDraft: { exactMidiNotes: [60, 64, 67] } });
  const first = bank[0]!;
  assert.ok(first.commonToneCount >= 1);
  assert.ok(first.semitoneMotion <= 0.5);
  assert.ok(first.voiceLeading > 0.35);
});

test('higher tension exposes color candidates and color distance rises', () => {
  const low = generateHarmonySuggestionBank({ rootMidi: 60, scaleId: 1, tension: 0.1 });
  const high = generateHarmonySuggestionBank({ rootMidi: 60, scaleId: 1, tension: 0.8 });
  assert.equal(low[4], null);
  assert.equal(high[4]?.category, 'color');
  assert.ok((high[4]?.color ?? 0) > (high[0]?.color ?? 0));
});

test('voice-leading metrics reward common tones and penalize dissonance', () => {
  const common = analyzeVoiceLeading([60, 64, 67], [60, 65, 69]);
  const jump = analyzeVoiceLeading([60, 64, 67], [72, 76, 79]);
  assert.ok(common.commonToneCount >= 1);
  assert.ok(common.score > jump.score);
  assert.ok(analyzeVoiceLeading([60, 61, 66], [60, 61, 66]).dissonance > 0);
});

test('freezing preserves fixed mapping and memoized engine is deterministic', () => {
  const bank = generateHarmonySuggestionBank({ tension: 0.5 });
  const frozen = freezeSuggestionBank(bank);
  const reordered = freezeSuggestionBank([...bank].reverse());
  assert.equal(frozen[0]?.triggerKey, 'Z');
  assert.notDeepEqual(frozen[0]?.exactMidiNotes, reordered[0]?.exactMidiNotes);
  const engine = createHarmonySuggestionEngine();
  assert.deepEqual(engine.suggest({ tension: 0.5 }), engine.suggest({ tension: 0.5 }));
});

test('position category contract remains explicit', () => {
  assert.deepEqual(HARMONY_SUGGESTION_POSITION_CATEGORIES, ['safe', 'safe', 'movement', 'movement', 'color', 'color', 'color', 'wildcard']);
});

test('held keys defer bank updates until every key releases', () => {
  const first = generateHarmonySuggestionBank({ tension: 0.3 });
  const second = generateHarmonySuggestionBank({ tension: 0.9 });
  const latch = createSuggestionBankLatch(first);
  const z = latch.press('Z');
  latch.press('X');
  latch.update(second);
  assert.deepEqual(latch.current()[0]?.exactMidiNotes, z?.exactMidiNotes);
  latch.release('Z');
  assert.deepEqual(latch.current()[0]?.exactMidiNotes, z?.exactMidiNotes);
  latch.release('X');
  assert.deepEqual(latch.current()[0]?.exactMidiNotes, second[0]?.exactMidiNotes);
});

test('shared pitch axis covers suggestions and nearby progression notes', () => {
  const bank = generateHarmonySuggestionBank({ tension: 0.5 });
  const axis = sharedHarmonyPitchAxis([bank], [[36, 48, 84]]);
  assert.ok(axis.min <= 36);
  assert.ok(axis.max >= 84);
  assert.equal((axis.min % 12 + 12) % 12, 0);
  assert.equal((axis.max % 12 + 12) % 12, 0);
});

test('phrase endings favor a tension release after a high-color event', () => {
  const bank = generateHarmonySuggestionBank({ tension: 0.8, phrasePosition: 'ending', recentTensions: [0.9] });
  assert.ok((bank[0]?.color ?? 1) <= (bank[4]?.color ?? 0));
});
