/**
 * Cloud Presets UI Component
 * 
 * Browse, search, and share presets from the cloud.
 */

import React, { useState, useEffect } from 'react';
import {
  isCloudEnabled,
  fetchCloudPresets,
  fetchFeaturedPresets,
  searchCloudPresets,
  saveCloudPreset,
  incrementPresetPlays,
  CloudPreset,
} from '../cloud/supabase';
import { SliderState } from './state';

// Unicode symbols with text variation selector (U+FE0E) to prevent emoji rendering on mobile
const TEXT_SYMBOLS = {
  play: '▶\uFE0E',
} as const;

interface CloudPresetsProps {
  currentState: SliderState;
  onLoadPreset: (state: SliderState, name: string) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  tab: {
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: '4px',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '13px',
  },
  tabActive: {
    background: 'rgba(100, 200, 255, 0.3)',
    color: '#fff',
  },
  searchBox: {
    width: '100%',
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '14px',
    marginBottom: '12px',
  },
  presetList: {
    maxHeight: '300px',
    overflowY: 'auto' as const,
  },
  presetCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    margin: 0,
  },
  presetMeta: {
    fontSize: '12px',
    color: '#888',
    marginTop: '2px',
  },
  presetPlays: {
    fontSize: '12px',
    color: '#666',
    marginLeft: '12px',
  },
  loadButton: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #4a9eff 0%, #6366f1 100%)',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  },
  shareButton: {
    padding: '6px 14px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
  },
  uploadSection: {
    marginTop: '16px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
  },
  inputGroup: {
    marginBottom: '10px',
  },
  inputLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#aaa',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '14px',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '14px',
    minHeight: '60px',
    resize: 'vertical' as const,
  },
  disabled: {
    textAlign: 'center' as const,
    color: '#888',
    padding: '20px',
  },
  message: {
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '12px',
    fontSize: '13px',
  },
  success: {
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#10b981',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
  },
  featured: {
    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%)',
    borderLeft: '3px solid #f59e0b',
  },
};

type Tab = 'browse' | 'featured' | 'share';

export const CloudPresets: React.FC<CloudPresetsProps> = ({ currentState, onLoadPreset }) => {
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [presets, setPresets] = useState<CloudPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Share form state
  const [shareName, setShareName] = useState('');
  const [shareAuthor, setShareAuthor] = useState('');
  const [shareDescription, setShareDescription] = useState('');
  const [sharing, setSharing] = useState(false);

  const cloudEnabled = isCloudEnabled();

  useEffect(() => {
    if (!cloudEnabled) return;
    loadPresets();
  }, [activeTab, cloudEnabled]);

  useEffect(() => {
    if (!cloudEnabled || activeTab !== 'browse') return;
    
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchPresets();
      } else {
        loadPresets();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadPresets = async () => {
    setLoading(true);
    try {
      const data = activeTab === 'featured' 
        ? await fetchFeaturedPresets()
        : await fetchCloudPresets();
      setPresets(data);
    } finally {
      setLoading(false);
    }
  };

  const searchPresets = async () => {
    setLoading(true);
    try {
      const data = await searchCloudPresets(searchQuery);
      setPresets(data);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPreset = async (preset: CloudPreset) => {
    onLoadPreset(preset.data, preset.name);
    await incrementPresetPlays(preset.id);
    
    // Copy share link to clipboard
    const url = `${window.location.origin}${window.location.pathname}?cloud=${preset.id}`;
    await navigator.clipboard.writeText(url);
    setMessage({ type: 'success', text: `Loaded "${preset.name}" - Share link copied!` });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleShare = async () => {
    if (!shareName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a preset name' });
      return;
    }

    setSharing(true);
    try {
      const saved = await saveCloudPreset({
        name: shareName,
        author: shareAuthor || 'Anonymous',
        description: shareDescription,
        data: currentState,
      });

      if (saved) {
        const url = `${window.location.origin}${window.location.pathname}?cloud=${saved.id}`;
        await navigator.clipboard.writeText(url);
        setMessage({ type: 'success', text: 'Preset shared! Link copied to clipboard.' });
        setShareName('');
        setShareDescription('');
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Error: ${(e as Error).message}` });
    } finally {
      setSharing(false);
    }
  };

  if (!cloudEnabled) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>☁️ Cloud Presets</h3>
        <div style={styles.disabled}>
          <p>Cloud presets not configured.</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>
            See SUPABASE_SETUP.md to enable preset sharing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>☁️ Cloud Presets</h3>
      </div>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'browse' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('browse')}
        >
          Browse
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'featured' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('featured')}
        >
          ⭐ Featured
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'share' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('share')}
        >
          Share Preset
        </button>
      </div>

      {message && (
        <div style={{ ...styles.message, ...(message.type === 'success' ? styles.success : styles.error) }}>
          {message.text}
        </div>
      )}

      {activeTab === 'share' ? (
        <div style={styles.uploadSection}>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Preset Name *</label>
            <input
              type="text"
              style={styles.input}
              value={shareName}
              onChange={(e) => setShareName(e.target.value)}
              placeholder="My Ambient Preset"
              maxLength={50}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Your Name (optional)</label>
            <input
              type="text"
              style={styles.input}
              value={shareAuthor}
              onChange={(e) => setShareAuthor(e.target.value)}
              placeholder="Anonymous"
              maxLength={30}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Description (optional)</label>
            <textarea
              style={styles.textarea}
              value={shareDescription}
              onChange={(e) => setShareDescription(e.target.value)}
              placeholder="Describe the mood, best use case, etc."
              maxLength={200}
            />
          </div>
          <button
            style={{ ...styles.shareButton, opacity: sharing ? 0.6 : 1 }}
            onClick={handleShare}
            disabled={sharing}
          >
            {sharing ? 'Sharing...' : '🔗 Share Current Settings'}
          </button>
        </div>
      ) : (
        <>
          {activeTab === 'browse' && (
            <input
              type="text"
              style={styles.searchBox}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search presets..."
            />
          )}

          <div style={styles.presetList}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                Loading...
              </div>
            ) : presets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                {searchQuery ? 'No presets found' : 'No presets yet. Be the first to share!'}
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  style={{ ...styles.presetCard, ...(preset.is_featured ? styles.featured : {}) }}
                  onClick={() => handleLoadPreset(preset)}
                >
                  <div style={styles.presetInfo}>
                    <p style={styles.presetName}>
                      {preset.is_featured && '⭐ '}
                      {preset.name}
                    </p>
                    <p style={styles.presetMeta}>
                      by {preset.author}
                      {preset.description && ` • ${preset.description.slice(0, 40)}${preset.description.length > 40 ? '...' : ''}`}
                    </p>
                  </div>
                  <span style={styles.presetPlays}>{TEXT_SYMBOLS.play} {preset.plays}</span>
                  <button style={styles.loadButton}>Load</button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CloudPresets;
