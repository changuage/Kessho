import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSequencer } from '../../audio/drumSequencer';
import { registerHooks } from 'node:module';
import { SeqStepDetailPanel } from './SeqStepDetailPanel';

test('every trigger step has a numbered inspection button that never toggles notes', async () => {
  const hooks = registerHooks({
    load(url, context, nextLoad) {
      return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context);
    },
  });
  const { default: SeqLane } = await import('../drums/SeqLane');
  hooks.deregister();
  const sequencer = createSequencer(0);
  const inspected: number[] = [];
  let toggles = 0;
  let tree: React.ReactNode;
  function Probe() {
    tree = SeqLane({
      sequencer, lane: 'trigger', color: '#fff', playhead: -1,
      onSelectStep: (step) => inspected.push(step),
      onToggleTriggerStep: () => { toggles += 1; },
    });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  function inspect(node: React.ReactNode): void {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      if (String(child.props['aria-label'] ?? '').startsWith('Inspect step ') && !child.props.disabled) {
        child.props.onClick({ preventDefault() {}, stopPropagation() {} });
      }
      inspect(child.props.children);
    });
  }
  inspect(tree);
  assert.deepEqual(inspected, Array.from({ length: sequencer.trigger.steps }, (_, index) => index));
  assert.equal(toggles, 0);
});

test('the shared length editor remains visible in every step mode', () => {
  for (const mode of ['note', 'chord', 'arp'] as const) {
    const html = renderToStaticMarkup(<SeqStepDetailPanel
      selectedStep={0} stepCount={8} mode={mode} onModeChange={() => {}}
      sharedControls={<label>Length<input type="number" defaultValue={2} /></label>}
      note={<span>Note values</span>} chord={<span>Chord values</span>} arp={<span>Arp span</span>}
    />);
    assert.match(html, /Length/);
    assert.match(html, /value="2"/);
  }
});

test('printed nudge follows its own step or sounded-hit phase and hides inactive variation cursors', async () => {
  const { default: SeqLane } = await import('../drums/SeqLane');
  const sequencer = createSequencer(0);
  for (const [playheadMode, playhead, expected] of [
    ['step', 23, 10], ['hit', 23, 6], ['hit', -1, null],
  ] as const) {
    let tree: React.ReactNode;
    function Probe() {
      tree = SeqLane({ sequencer, lane: 'nudge', color: '#fff', playhead,
        hitCount: 7, playheadMode, stepCountOverride: 13,
        valueOverride: Array(13).fill(0),
      });
      return null;
    }
    renderToStaticMarkup(<Probe />);
    const playing: number[] = [];
    function visit(node: React.ReactNode, cell: number | null = null): void {
      React.Children.forEach(node, (child) => {
        if (!React.isValidElement(child)) return;
        const nextCell = child.props.className === 'seq-step' ? Number(child.key) : cell;
        if (String(child.props.className ?? '').split(' ').includes('playing') && nextCell !== null) playing.push(nextCell);
        visit(child.props.children, nextCell);
      });
    }
    visit(tree);
    assert.deepEqual(playing, expected === null ? [] : [expected]);
  }
});

test('a 24-step sparkline shows the runtime cursor at step 24 without wrapping at 16', async () => {
  const { default: SeqSparkline } = await import('../drums/SeqSparkline');
  const html = renderToStaticMarkup(<SeqSparkline label="Nudge" color="#fff" steps={24}
    values={Array(24).fill(0.5)} playhead={23} playheadMode="step" />);
  assert.match(html, /class="spark-playhead" x="192"/);
});
