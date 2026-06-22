import React, { useMemo, useState } from 'react';
import { normalizePresetTag, normalizePresetTags } from './presetPool';

interface PresetTagEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  accentColor?: string;
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'grid',
    gap: 7,
    marginTop: 8,
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4,
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(244,237,228,0.78)',
    fontSize: '0.66rem',
    padding: '3px 6px',
  },
  removeButton: {
    border: 0,
    background: 'transparent',
    color: 'rgba(244,237,228,0.52)',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    fontSize: '0.7rem',
  },
  input: {
    width: '100%',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 4,
    background: 'rgba(0,0,0,0.3)',
    color: '#f4ede4',
    padding: '7px 8px',
    fontSize: '0.78rem',
    boxSizing: 'border-box',
  },
  suggestion: {
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    background: 'rgba(255,255,255,0.035)',
    color: 'rgba(244,237,228,0.62)',
    cursor: 'pointer',
    fontSize: '0.62rem',
    padding: '3px 6px',
  },
};

export function PresetTagEditor({
  value,
  onChange,
  suggestions = [],
  accentColor = '#B8E0FF',
}: PresetTagEditorProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const tags = useMemo(() => normalizePresetTags(value), [value]);
  const suggestionTags = useMemo(() => (
    normalizePresetTags(suggestions).filter(tag => !tags.includes(tag)).slice(0, 12)
  ), [suggestions, tags]);

  const addTag = (rawTag: string) => {
    const tag = normalizePresetTag(rawTag);
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setDraft('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(existing => existing !== tag));
  };

  return (
    <div style={styles.root}>
      {tags.length > 0 && (
        <div style={styles.chipRow}>
          {tags.map(tag => (
            <span key={tag} style={styles.chip}>
              {tag}
              <button
                type="button"
                style={styles.removeButton}
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag}`}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            addTag(draft);
          } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
            removeTag(tags[tags.length - 1]!);
          }
        }}
        onBlur={() => {
          if (draft.trim()) addTag(draft);
        }}
        placeholder="Tags (enter to add)"
        style={{ ...styles.input, borderColor: `${accentColor}33` }}
      />
      {suggestionTags.length > 0 && (
        <div style={styles.chipRow}>
          {suggestionTags.map(tag => (
            <button
              key={tag}
              type="button"
              style={styles.suggestion}
              onClick={() => addTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
