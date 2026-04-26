import type { ReactNode } from 'react';

export interface SliderFamilyNoteProps {
  className?: string;
  children?: ReactNode;
}

export function SliderFamilyNote({ className, children }: SliderFamilyNoteProps) {
  const classes = ['slider-family-note', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {children ? <div className="slider-family-note-copy">{children}</div> : null}
      <div className="slider-family-note-gesture">
        Drag to adjust. In <code>walk</code> and <code>S&amp;H</code>, drag the band edges to resize or the band body to move the whole range. Double-click on desktop or long-press on touch to cycle modes.
      </div>
    </div>
  );
}
