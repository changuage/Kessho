-- Kessho Hierarchical Preset Schema
-- Replaces the old flat `presets` table with a typed, versioned structure.
-- Run this in Supabase SQL Editor. If the old table exists, back up and drop it first.
--
-- SETUP CHECKLIST:
-- 1. Create a Supabase project at https://supabase.com
-- 2. Go to Authentication > Settings and enable "Allow anonymous sign-ins"
-- 3. Run this entire file in the SQL Editor
-- 4. Copy your project URL + anon key to .env

-- Drop old table if migrating
-- DROP TABLE IF EXISTS presets;

CREATE TABLE IF NOT EXISTS presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('engine', 'kit', 'source', 'state', 'journey')),
  scope TEXT,                            -- 'drumKick', 'granularKit', 'global', etc.
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'user',   -- 'factory' | 'user' | 'cloud'
  library TEXT NOT NULL DEFAULT 'cloud', -- 'stock' | 'user' | 'cloud'
  creator TEXT DEFAULT 'Anonymous',
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'featured')),
  family_name TEXT,
  variant_name TEXT,
  variant_rank INT,
  forked_from UUID REFERENCES presets(id),
  plays INT DEFAULT 0,
  versions JSONB NOT NULL DEFAULT '[]',  -- Array of { v, note, timestamp, data, ... }
  current_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique index: one preset per user+type+scope+name.
-- Uses COALESCE to handle NULL scope (PostgreSQL UNIQUE treats NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_unique_user_type_scope_name
  ON presets (user_id, type, COALESCE(scope, ''), name);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_presets_type_scope ON presets(type, scope);
CREATE INDEX IF NOT EXISTS idx_presets_user ON presets(user_id, type, scope);
CREATE INDEX IF NOT EXISTS idx_presets_visibility ON presets(visibility) WHERE visibility IN ('public', 'featured');
CREATE INDEX IF NOT EXISTS idx_presets_name_search ON presets USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_presets_created ON presets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presets_family ON presets(user_id, family_name) WHERE family_name IS NOT NULL;

-- Enable RLS
ALTER TABLE presets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own presets (includes anonymous users with auth.uid())
CREATE POLICY "Users read own presets" ON presets
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can read public/featured presets from anyone
CREATE POLICY "Public read access" ON presets
  FOR SELECT USING (visibility IN ('public', 'featured'));

-- Policy: Authenticated users (including anon-auth) can insert their own presets
CREATE POLICY "Users insert own presets" ON presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own presets
CREATE POLICY "Users update own presets" ON presets
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own presets
CREATE POLICY "Users delete own presets" ON presets
  FOR DELETE USING (auth.uid() = user_id);

-- Function to increment play count
CREATE OR REPLACE FUNCTION increment_preset_plays(preset_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE presets SET plays = plays + 1 WHERE id = preset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at on modification
CREATE OR REPLACE FUNCTION update_preset_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER presets_updated_at
  BEFORE UPDATE ON presets
  FOR EACH ROW
  EXECUTE FUNCTION update_preset_timestamp();
