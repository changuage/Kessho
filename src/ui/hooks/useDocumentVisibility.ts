import { useEffect, useState } from 'react';

export function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(isDocumentVisible);

  useEffect(() => {
    if (typeof document === 'undefined') {
      setVisible(true);
      return;
    }

    const update = () => setVisible(isDocumentVisible());
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return visible;
}
