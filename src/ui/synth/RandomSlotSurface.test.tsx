import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_STATE, type SliderState } from '../state';
import { RandomSlotSurface } from './RandomSlotSurface';
import {
  disableRandomNotesWithoutSource,
  enableRandomNotesSourceForEdit,
  randomNotesLanesWithoutSource,
} from '../sequencer/randomSlotSources';
import { normalizeSynthSequencerFaceState } from '../sequencer/sequencerModeTypes';

const noop = () => undefined;

function render(state: SliderState, laneNumber: number, isPadSource = true): string {
  const Slider = ((props: { paramKey: string; label: string }) => (
    <span data-slider={props.paramKey}>{props.label}</span>
  )) as never;
  const Select = ((props: { label: string }) => <span data-select={props.label} />) as never;
  return renderToStaticMarkup(
    <RandomSlotSurface
      laneNumber={laneNumber}
      state={state}
      isPadSource={isPadSource}
      onParamChange={noop}
      onSelectChange={noop}
      sliderProps={(() => ({})) as never}
      SliderComponent={Slider}
      SelectComponent={Select}
    />,
  );
}

function withRandomSlot(state: SliderState, lane: number): SliderState {
  const faces = normalizeSynthSequencerFaceState(state.synthSequencerFaces);
  faces.slots[lane - 1] = { ...faces.slots[lane - 1]!, mode: 'random' };
  return { ...state, synthSequencerFaces: faces };
}

test('a Random Chords slot shows its own shared sliders and the voice assignment', () => {
  const html = render({ ...DEFAULT_STATE, synthEuclid5RandomMode: 'chords' }, 5);
  assert.match(html, /data-slider="synthEuclid5RandomWaveSpread"/);
  assert.match(html, /data-slider="synthEuclid5RandomOctave"/);
  assert.doesNotMatch(html, /synthEuclid5RandomDensity/);
  assert.equal((html.match(/voice-mask-btn/g) ?? []).length, 8, 'eight pad voices');
  assert.match(html, /Split pads/);
  assert.match(html, /Fit chord/);
});

test('a Random Notes slot shows density, register, clock and tension, bound to its own keys', () => {
  const html = render({ ...DEFAULT_STATE, synthEuclid6RandomMode: 'notes' }, 6);
  for (const param of ['Density', 'NotesOctave', 'OctaveRange', 'TensionValue']) {
    assert.match(html, new RegExp(`data-slider="synthEuclid6Random${param}"`));
  }
  assert.match(html, /data-select="Clock"/);
  assert.doesNotMatch(html, /voice-mask-btn/);
});

test('chords on a non-pad source hide the pad-only controls', () => {
  const html = render({ ...DEFAULT_STATE, synthEuclid5RandomMode: 'chords' }, 5, false);
  assert.doesNotMatch(html, /voice-mask-btn/);
  assert.doesNotMatch(html, /Split pads/);
});

test('a Random Notes slot brings its source up and stops when the source goes away', () => {
  const base = withRandomSlot({
    ...DEFAULT_STATE,
    synthEuclid5RandomMode: 'notes',
    synthEuclid5Source: 'lead2',
    synthEuclid5Enabled: true,
    lead2Enabled: false,
  }, 5);
  assert.deepEqual(randomNotesLanesWithoutSource(base), [5], 'enabled against a muted source');
  assert.equal(disableRandomNotesWithoutSource(base).synthEuclid5Enabled, false);

  const next = { ...base };
  enableRandomNotesSourceForEdit(next, 'synthEuclid5Source');
  assert.equal(next.lead2Enabled, true, 'choosing the source switches it on');
  assert.deepEqual(randomNotesLanesWithoutSource(next), []);

  const chords = { ...base, synthEuclid5RandomMode: 'chords' as const };
  assert.deepEqual(randomNotesLanesWithoutSource(chords), [], 'Random Chords does not follow the source toggle');
});
