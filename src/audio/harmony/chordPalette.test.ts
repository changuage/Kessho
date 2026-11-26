import assert from 'node:assert/strict';
import test from 'node:test';
import { HARMONY_PALETTE_CAPACITY } from '../CoreProductHarmonyControl';
import { createFixedChord, createFollowChord } from './chord';
import { chordPaletteSaveBlock, chordsEqual, placeChordFromPalette, removeChordFromPalette, saveChordToPalette } from './chordPalette';

test('saving appends a copy and ignores a chord that is already there', () => {
  const chord = createFollowChord(4);
  const first = saveChordToPalette([], chord);
  assert.equal(first.status, 'saved');
  assert.deepEqual(first.palette, [chord]);
  assert.notEqual(first.palette[0], chord, 'the Palette holds its own copy');
  const again = saveChordToPalette(first.palette, createFollowChord(4));
  assert.equal(again.status, 'duplicate');
  assert.equal(again.palette.length, 1);
  assert.equal(chordPaletteSaveBlock(first.palette, chord), 'Already in the Palette');
  assert.equal(saveChordToPalette(first.palette, createFollowChord(5)).palette.length, 2);
  assert.equal(chordsEqual(createFixedChord([{ midi: 60 }]), createFixedChord([{ midi: 60 }])), true);
  assert.equal(chordsEqual(createFixedChord([{ midi: 60 }]), createFixedChord([{ midi: 61 }])), false);
});

test('the Palette caps at 16 and Save explains why it is blocked', () => {
  let palette = [] as ReturnType<typeof createFollowChord>[];
  for (let degree = 0; degree < HARMONY_PALETTE_CAPACITY; degree += 1) palette = saveChordToPalette(palette, createFollowChord(degree)).palette;
  assert.equal(palette.length, 16);
  const full = saveChordToPalette(palette, createFollowChord(40));
  assert.equal(full.status, 'full');
  assert.equal(full.palette.length, 16);
  assert.match(chordPaletteSaveBlock(palette, createFollowChord(40)) ?? '', /holds 16/);
  assert.equal(saveChordToPalette(removeChordFromPalette(palette, 3), createFollowChord(40)).status, 'saved');
});

test('remove drops one chip; place returns an independent copy', () => {
  const palette = [createFollowChord(1), createFixedChord([{ midi: 60 }, { midi: 64 }])];
  assert.deepEqual(removeChordFromPalette(palette, 0), [palette[1]]);
  assert.equal(palette.length, 2, 'remove does not mutate');
  const placed = placeChordFromPalette(palette, 1)!;
  assert.deepEqual(placed, palette[1]);
  placed.notes[0]!.midi = 72;
  placed.notes.push({ midi: 67 });
  assert.equal(palette[1]!.notes[0]!.midi, 60);
  assert.equal(palette[1]!.notes.length, 2);
  assert.notEqual(placeChordFromPalette(palette, 1), placeChordFromPalette(palette, 1));
  assert.equal(placeChordFromPalette(palette, 5), null);
});
