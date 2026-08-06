import assert from 'node:assert/strict';
import test from 'node:test';
import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_STATE, type SliderState } from '../state';
import SpectralFreezeCard, { nextSpectralFreezeCaptureSerial } from './SpectralFreezeCard';

const Slider = ({ label }: { label: string }) => <span>{label}</span>;
const Select = ({ label }: { label: string }) => <span>{label}</span>;

function makeCard(
  state: SliderState,
  onParamChange: (key: keyof SliderState, value: number) => void = () => {},
  onSelectChange: <K extends keyof SliderState>(key: K, value: SliderState[K]) => void = () => {},
): ReactElement {
  return SpectralFreezeCard({
    state,
    onParamChange,
    onSelectChange,
    sliderProps: () => ({}) as never,
    SliderComponent: Slider as never,
    SelectComponent: Select as never,
  });
}

function visibleTextForMode(mode: SliderState['spectralFreezeMode']): string {
  return renderToStaticMarkup(makeCard({
    ...DEFAULT_STATE,
    spectralFreezeEnabled: true,
    spectralFreezeMode: mode,
  }));
}

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | null {
  if (!React.isValidElement(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  if (element.type === 'button') {
    const text = React.Children.toArray(element.props.children).join('');
    if (text === label && element.props.onClick) {
      return element as ReactElement<{ onClick: () => void }>;
    }
  }
  for (const child of React.Children.toArray(element.props.children)) {
    const match = findButton(child, label);
    if (match) return match;
  }
  return null;
}

test('spectral freeze card exposes controls only for their owning modes', () => {
  const solid = visibleTextForMode('solid');
  assert.match(solid, />Mix</);
  assert.match(solid, />Sustain</);
  assert.doesNotMatch(solid, />Position</);
  assert.doesNotMatch(solid, />Refresh</);

  const slushy = visibleTextForMode('slushy');
  assert.match(slushy, />Refresh</);
  assert.match(slushy, />Input Sensitivity</);
  assert.doesNotMatch(slushy, />Direction</);

  const stretch = visibleTextForMode('stretch');
  assert.match(stretch, />Speed</);
  assert.match(stretch, />Direction</);
  assert.match(stretch, />Position</);
  assert.doesNotMatch(stretch, />Refresh</);

  const living = visibleTextForMode('livingStretch');
  assert.match(living, />Speed</);
  assert.match(living, />Position</);
  assert.match(living, />Refresh</);
  assert.match(living, />Input Sensitivity</);
});

test('capture increments the serial, enables the engine, and activates freeze', () => {
  const changes: Array<[keyof SliderState, unknown]> = [];
  const card = makeCard(
    { ...DEFAULT_STATE, spectralFreezeEnabled: false, spectralFreezeCaptureSerial: 41 },
    (key, value) => changes.push([key, value]),
    (key, value) => changes.push([key, value]),
  );
  const capture = findButton(card, 'Capture & Freeze');
  assert.ok(capture);
  capture.props.onClick();
  assert.deepStrictEqual(changes, [
    ['spectralFreezeEnabled', true],
    ['spectralFreezeCaptureSerial', 42],
    ['spectralFreezeActive', true],
  ]);
  assert.equal(nextSpectralFreezeCaptureSerial(0xffffffff), 1);
});

test('release deactivates freeze without changing the capture serial', () => {
  const changes: Array<[keyof SliderState, unknown]> = [];
  const card = makeCard(
    { ...DEFAULT_STATE, spectralFreezeEnabled: true, spectralFreezeActive: true },
    (key, value) => changes.push([key, value]),
    (key, value) => changes.push([key, value]),
  );
  const release = findButton(card, 'Release');
  assert.ok(release);
  release.props.onClick();
  assert.deepStrictEqual(changes, [['spectralFreezeActive', false]]);
});

test('turning the engine off releases the freeze before bypassing it', () => {
  const changes: Array<[keyof SliderState, unknown]> = [];
  const card = makeCard(
    { ...DEFAULT_STATE, spectralFreezeEnabled: true, spectralFreezeActive: true },
    (key, value) => changes.push([key, value]),
    (key, value) => changes.push([key, value]),
  );
  const engine = findButton(card, 'Engine On');
  assert.ok(engine);
  engine.props.onClick();
  assert.deepStrictEqual(changes, [
    ['spectralFreezeActive', false],
    ['spectralFreezeEnabled', false],
  ]);
});
