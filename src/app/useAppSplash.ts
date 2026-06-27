import { useEffect, useState } from 'react';

interface SplashGradient {
  inner: string;
  mid: string;
  outer: string;
}

interface WindowSize {
  width: number;
  height: number;
}

function createSplashGradient(): SplashGradient {
  const palettes = [
    { baseHue: 25 },
    { baseHue: 95 },
    { baseHue: 45 },
    { baseHue: 265 },
    { baseHue: 200 },
    { baseHue: 190 },
  ];

  const palette = palettes[Math.floor(Math.random() * palettes.length)] ?? palettes[0]!;
  const hueVariation = (Math.random() - 0.5) * 20;

  return {
    inner: `hsl(${palette.baseHue + hueVariation}, ${30 + Math.random() * 15}%, ${40 + Math.random() * 12}%)`,
    mid: `hsl(${palette.baseHue}, ${35 + Math.random() * 12}%, ${30 + Math.random() * 8}%)`,
    outer: `hsl(${palette.baseHue - 10}, ${25 + Math.random() * 10}%, ${15 + Math.random() * 6}%)`,
  };
}

function readWindowSize(): WindowSize {
  return {
    width: typeof window !== 'undefined' ? window.innerWidth : 800,
    height: typeof window !== 'undefined' ? window.innerHeight : 600,
  };
}

export function useAppSplash() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashOpacity, setSplashOpacity] = useState(0);
  const [splashGradient] = useState(createSplashGradient);
  const [windowSize, setWindowSize] = useState(readWindowSize);

  useEffect(() => {
    const handleResize = () => setWindowSize(readWindowSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fadeInTimer = setTimeout(() => setSplashOpacity(1), 100);
    const holdTimer = setTimeout(() => setSplashOpacity(0), 3750);
    const hideTimer = setTimeout(() => setShowSplash(false), 5250);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(holdTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return {
    showSplash,
    splashOpacity,
    splashGradient,
    windowSize,
  };
}
