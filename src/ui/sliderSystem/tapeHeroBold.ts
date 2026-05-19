function colorToRgb(color: string): [number, number, number] {
  const cleaned = color.trim();
  const rgbMatch = cleaned.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgbMatch) {
    return [
      Math.round(Number(rgbMatch[1])),
      Math.round(Number(rgbMatch[2])),
      Math.round(Number(rgbMatch[3])),
    ];
  }

  const hex = cleaned.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return hex.split('').map((part) => parseInt(`${part}${part}`, 16)) as [number, number, number];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  return [207, 217, 232];
}

function rgba(color: string, alpha: number): string {
  const [r, g, b] = colorToRgb(color);
  return `rgba(${r},${g},${b},${Number(alpha.toFixed(3))})`;
}

function mixWhite(color: string, percent: number): string {
  const [r, g, b] = colorToRgb(color);
  const weight = percent / 100;
  return `rgb(${Math.round(r + (255 - r) * weight)},${Math.round(g + (255 - g) * weight)},${Math.round(b + (255 - b) * weight)})`;
}

function mixHex(color1: string, percent: number, color2: string): string {
  const [r1, g1, b1] = colorToRgb(color1);
  const [r2, g2, b2] = colorToRgb(color2);
  const weight = percent / 100;
  return `rgb(${Math.round(r1 * weight + r2 * (1 - weight))},${Math.round(g1 * weight + g2 * (1 - weight))},${Math.round(b1 * weight + b2 * (1 - weight))})`;
}

export function tapeHeroBoldVars(hero: string): Record<string, string> {
  return {
    '--thb-mode': mixWhite(hero, 30),
    '--thb-value': mixHex(hero, 60, '#ebf2f8'),
    '--thb-track': rgba(hero, 0.14),
    '--thb-band': rgba(hero, 0.40),
    '--thb-walk-g1': 'rgba(77, 154, 186, 0.30)',
    '--thb-walk-g2': 'rgba(77, 154, 186, 0.50)',
    '--thb-walk-g3': 'rgba(77, 154, 186, 0.40)',
    '--thb-walk-g4': 'rgba(77, 154, 186, 0.56)',
    '--thb-sh-on': rgba(hero, 0.34),
    '--thb-edge-sh': rgba(hero, 0.30),
  };
}
