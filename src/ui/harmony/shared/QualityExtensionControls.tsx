import React from 'react';
import type { HarmonyChordExtension, HarmonyChordQuality } from '../../../audio/harmony/harmonyTypes';

const QUALITIES: readonly HarmonyChordQuality[] = ['dim', 'min', 'maj', 'sus', 'maj7', 'min7', 'dom7', 'add9', 'six', 'sixNine', 'nine'];
const EXTENSIONS: readonly HarmonyChordExtension[] = ['six', 'min7', 'maj7', 'dom7', 'add9', 'nine', 'sixNine', '11', '13'];

export interface QualityExtensionControlsProps {
  quality: HarmonyChordQuality | null;
  extensions: readonly HarmonyChordExtension[];
  disabled?: boolean;
  onQualityChange: (quality: HarmonyChordQuality) => void;
  onExtensionsChange: (extensions: HarmonyChordExtension[]) => void;
}

export const QualityExtensionControls: React.FC<QualityExtensionControlsProps> = ({ quality, extensions, disabled = false, onQualityChange, onExtensionsChange }) => <div className="harmony-quality-extension-controls">
  <div className="harmony-quality-row" aria-label="Quality">{QUALITIES.map((value) => <button key={value} type="button" disabled={disabled} className={quality === value ? 'active' : ''} onClick={() => onQualityChange(value)}>{value}</button>)}</div>
  <div className="harmony-extension-row" aria-label="Extensions">{EXTENSIONS.map((value) => { const active = extensions.includes(value); return <button key={value} type="button" disabled={disabled} className={active ? 'active' : ''} onClick={() => onExtensionsChange(active ? extensions.filter((entry) => entry !== value) : [...extensions, value])}>{value}</button>; })}</div>
</div>;

export default QualityExtensionControls;
