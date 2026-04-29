-- Next-gen Supabase preset storage for Kessho
-- Target: Supabase remains the source of truth, while storage stops duplicating
-- large JSON snapshots across levels and versions.
--
-- This is a future-cutover schema, not a drop-in replacement for the current
-- inline-json `presets` table. The intended migration path is:
-- 1. Back up current `presets` to `presets_legacy`
-- 2. Create these V2 tables alongside the old schema
-- 3. Migrate the latest canonical presets into V2
-- 4. Switch the app to read/write V2
-- 5. Retire the legacy table

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preset_level_v2') THEN
    CREATE TYPE preset_level_v2 AS ENUM ('engine', 'kit', 'source', 'state', 'journey');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preset_library_v2') THEN
    CREATE TYPE preset_library_v2 AS ENUM ('stock', 'user', 'cloud');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preset_visibility_v2') THEN
    CREATE TYPE preset_visibility_v2 AS ENUM ('private', 'public', 'featured');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preset_storage_mode_v2') THEN
    CREATE TYPE preset_storage_mode_v2 AS ENUM ('snapshot', 'patch', 'checkpoint');
  END IF;
END $$;

-- Content-addressed blobs. Reused payloads are stored once by hash.
-- Typical payloads:
-- - override-only JSON
-- - metadata-only JSON
-- - resolved snapshot JSON
-- - patch JSON
CREATE TABLE IF NOT EXISTS preset_payloads_v2 (
  hash TEXT PRIMARY KEY,
  payload_kind TEXT NOT NULL CHECK (
    payload_kind IN ('override', 'metadata', 'resolved', 'patch', 'refs_override')
  ),
  payload JSONB NOT NULL,
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preset_payloads_v2_kind
  ON preset_payloads_v2(payload_kind);

-- One logical preset identity. This row is small and stable.
-- `owner_key` is deliberately string-based so testing can route everything into
-- one shared namespace (`public`) while later private mode can use `user:<uuid>`.
-- During the current testing phase, all presets, including stock/factory ones,
-- should use `owner_key = 'public'` so any authenticated tester can edit them.
CREATE TABLE IF NOT EXISTS presets_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key TEXT NOT NULL DEFAULT 'public',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type preset_level_v2 NOT NULL,
  scope TEXT,
  name TEXT NOT NULL,
  name_key TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  author TEXT NOT NULL DEFAULT 'user' CHECK (author IN ('factory', 'user', 'cloud')),
  library preset_library_v2 NOT NULL DEFAULT 'cloud',
  -- `author` and `library` are classification fields, not permission fields.
  -- In the current testing phase, a row may still be editable even if
  -- `author = 'factory'` or `library = 'stock'`.
  creator TEXT DEFAULT 'Anonymous',
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility preset_visibility_v2 NOT NULL DEFAULT 'public',
  family_name TEXT,
  variant_name TEXT,
  variant_rank INTEGER,
  forked_from UUID REFERENCES presets_v2(id) ON DELETE SET NULL,
  latest_version_no INTEGER NOT NULL DEFAULT 0,
  latest_version_id UUID,
  latest_resolved_hash TEXT REFERENCES preset_payloads_v2(hash) ON DELETE SET NULL,
  latest_metadata_hash TEXT REFERENCES preset_payloads_v2(hash) ON DELETE SET NULL,
  play_count BIGINT NOT NULL DEFAULT 0,
  rating SMALLINT CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_v2_owner_type_scope_name
  ON presets_v2(owner_key, type, COALESCE(scope, ''), name_key);

CREATE INDEX IF NOT EXISTS idx_presets_v2_type_scope
  ON presets_v2(type, scope);

CREATE INDEX IF NOT EXISTS idx_presets_v2_type_scope_hash
  ON presets_v2(type, scope, latest_resolved_hash)
  WHERE latest_resolved_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presets_v2_tags_gin
  ON presets_v2 USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_presets_v2_visibility
  ON presets_v2(visibility)
  WHERE visibility IN ('public', 'featured');

CREATE INDEX IF NOT EXISTS idx_presets_v2_family
  ON presets_v2(owner_key, family_name)
  WHERE family_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presets_v2_updated_at
  ON presets_v2(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_presets_v2_name_search
  ON presets_v2 USING gin(to_tsvector('english', name));

-- One row per version. This is where the real history lives.
-- Storage strategy:
-- - `override_hash` stores ref-relative or default-relative overrides
-- - `patch_from_prev_hash` stores the delta from the previous version
-- - `resolved_hash` caches the fully materialized result for fast loads
CREATE TABLE IF NOT EXISTS preset_versions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id UUID NOT NULL REFERENCES presets_v2(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_version_id UUID REFERENCES preset_versions_v2(id) ON DELETE SET NULL,
  storage_mode preset_storage_mode_v2 NOT NULL DEFAULT 'patch',
  note TEXT NOT NULL DEFAULT '',
  override_hash TEXT REFERENCES preset_payloads_v2(hash) ON DELETE RESTRICT,
  metadata_hash TEXT REFERENCES preset_payloads_v2(hash) ON DELETE RESTRICT,
  patch_from_prev_hash TEXT REFERENCES preset_payloads_v2(hash) ON DELETE RESTRICT,
  resolved_hash TEXT REFERENCES preset_payloads_v2(hash) ON DELETE RESTRICT,
  is_checkpoint BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (preset_id, version_no),
  CHECK (
    storage_mode <> 'patch'
    OR patch_from_prev_hash IS NOT NULL
    OR version_no = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_preset_versions_v2_preset_created
  ON preset_versions_v2(preset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_preset_versions_v2_parent
  ON preset_versions_v2(parent_version_id);

-- Explicit child refs per version. This is the graph edge table.
-- Example slots:
-- - state preset: synth, drums, granular, reverb, delay, dynamics, earth
-- - synth source preset: pad1Kit, pad2Kit, lead1Kit, lead2Kit, euclideanPattern
-- - drums source preset: drumKit, euclideanPattern
-- - dynamics source preset: L1 sidechain, character, degrade, endChain engines
-- - granular kit preset: voice1, voice2, voice3, voice4, legacy
CREATE TABLE IF NOT EXISTS preset_version_refs_v2 (
  version_id UUID NOT NULL REFERENCES preset_versions_v2(id) ON DELETE CASCADE,
  ref_slot TEXT NOT NULL,
  target_preset_id UUID NOT NULL REFERENCES presets_v2(id) ON DELETE RESTRICT,
  target_version_no INTEGER,
  follow_latest BOOLEAN NOT NULL DEFAULT FALSE,
  override_hash TEXT REFERENCES preset_payloads_v2(hash) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, ref_slot),
  CHECK (
    (follow_latest = TRUE AND target_version_no IS NULL)
    OR (follow_latest = FALSE AND target_version_no IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_preset_version_refs_v2_target
  ON preset_version_refs_v2(target_preset_id, target_version_no);

ALTER TABLE presets_v2
  ADD CONSTRAINT presets_v2_latest_version_fk
  FOREIGN KEY (latest_version_id)
  REFERENCES preset_versions_v2(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION set_preset_payload_bytes_v2()
RETURNS TRIGGER AS $$
BEGIN
  NEW.payload_bytes = pg_column_size(NEW.payload);
  NEW.last_seen_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS preset_payloads_v2_set_bytes ON preset_payloads_v2;
CREATE TRIGGER preset_payloads_v2_set_bytes
  BEFORE INSERT OR UPDATE ON preset_payloads_v2
  FOR EACH ROW
  EXECUTE FUNCTION set_preset_payload_bytes_v2();

CREATE OR REPLACE FUNCTION touch_preset_updated_at_v2()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS presets_v2_touch_updated_at ON presets_v2;
CREATE TRIGGER presets_v2_touch_updated_at
  BEFORE UPDATE ON presets_v2
  FOR EACH ROW
  EXECUTE FUNCTION touch_preset_updated_at_v2();

CREATE OR REPLACE FUNCTION rollup_latest_version_v2()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE presets_v2
     SET latest_version_no = NEW.version_no,
         latest_version_id = NEW.id,
         latest_resolved_hash = COALESCE(NEW.resolved_hash, latest_resolved_hash),
         latest_metadata_hash = COALESCE(NEW.metadata_hash, latest_metadata_hash),
         updated_at = now()
   WHERE id = NEW.preset_id
     AND latest_version_no <= NEW.version_no;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS preset_versions_v2_rollup_latest ON preset_versions_v2;
CREATE TRIGGER preset_versions_v2_rollup_latest
  AFTER INSERT ON preset_versions_v2
  FOR EACH ROW
  EXECUTE FUNCTION rollup_latest_version_v2();

CREATE OR REPLACE FUNCTION increment_preset_plays_v2(target_preset_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE presets_v2
     SET play_count = play_count + 1
   WHERE id = target_preset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hash helper for deduped JSON blobs.
-- JSONB text output is canonical enough for this use because Postgres stores
-- object keys in normalized order.
CREATE OR REPLACE FUNCTION kessho_put_payload_v2(kind TEXT, body JSONB)
RETURNS TEXT AS $$
DECLARE
  normalized JSONB := COALESCE(body, '{}'::jsonb);
  payload_hash TEXT := encode(digest(normalized::TEXT, 'sha256'), 'hex');
BEGIN
  INSERT INTO preset_payloads_v2(hash, payload_kind, payload)
  VALUES (payload_hash, kind, normalized)
  ON CONFLICT (hash) DO UPDATE
    SET last_seen_at = now();

  RETURN payload_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE presets_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE preset_versions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE preset_version_refs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE preset_payloads_v2 ENABLE ROW LEVEL SECURITY;

-- Testing-phase policies: authenticated users can read and write the shared
-- namespace. This intentionally includes shared stock/factory presets too.
-- Tighten these before reintroducing private user-owned presets.
CREATE POLICY "presets_v2_read_shared_or_own" ON presets_v2
  FOR SELECT USING (
    visibility IN ('public', 'featured')
    OR auth.uid() = owner_user_id
    OR (
      auth.uid() IS NOT NULL
      AND 'internal-derived' = ANY(tags)
    )
  );

CREATE POLICY "presets_v2_insert_shared_or_own" ON presets_v2
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      owner_key = 'public'
      OR auth.uid() = owner_user_id
    )
  );

CREATE POLICY "presets_v2_update_shared_or_own" ON presets_v2
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND (
      owner_key = 'public'
      OR auth.uid() = owner_user_id
    )
  )
  WITH CHECK (
    owner_key = 'public'
    OR auth.uid() = owner_user_id
  );

CREATE POLICY "preset_versions_v2_read" ON preset_versions_v2
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM presets_v2 p
       WHERE p.id = preset_versions_v2.preset_id
         AND (p.visibility IN ('public', 'featured') OR p.owner_user_id = auth.uid())
    )
  );

CREATE POLICY "preset_versions_v2_write" ON preset_versions_v2
  FOR ALL USING (
    EXISTS (
      SELECT 1
        FROM presets_v2 p
       WHERE p.id = preset_versions_v2.preset_id
         AND auth.uid() IS NOT NULL
         AND (p.owner_key = 'public' OR p.owner_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM presets_v2 p
       WHERE p.id = preset_versions_v2.preset_id
         AND auth.uid() IS NOT NULL
         AND (p.owner_key = 'public' OR p.owner_user_id = auth.uid())
    )
  );

CREATE POLICY "preset_version_refs_v2_read" ON preset_version_refs_v2
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM preset_versions_v2 v
        JOIN presets_v2 p ON p.id = v.preset_id
       WHERE v.id = preset_version_refs_v2.version_id
         AND (p.visibility IN ('public', 'featured') OR p.owner_user_id = auth.uid())
    )
  );

CREATE POLICY "preset_version_refs_v2_write" ON preset_version_refs_v2
  FOR ALL USING (
    EXISTS (
      SELECT 1
        FROM preset_versions_v2 v
        JOIN presets_v2 p ON p.id = v.preset_id
       WHERE v.id = preset_version_refs_v2.version_id
         AND auth.uid() IS NOT NULL
         AND (p.owner_key = 'public' OR p.owner_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM preset_versions_v2 v
        JOIN presets_v2 p ON p.id = v.preset_id
       WHERE v.id = preset_version_refs_v2.version_id
         AND auth.uid() IS NOT NULL
         AND (p.owner_key = 'public' OR p.owner_user_id = auth.uid())
    )
  );

CREATE POLICY "preset_payloads_v2_read_testing" ON preset_payloads_v2
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "preset_payloads_v2_insert_testing" ON preset_payloads_v2
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION kessho_prune_preset_versions_v2(keep_count INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  IF keep_count < 1 THEN
    RAISE EXCEPTION 'keep_count must be >= 1';
  END IF;

  WITH ranked AS (
    SELECT
      id,
      row_number() OVER (PARTITION BY preset_id ORDER BY version_no DESC) AS version_rank
    FROM preset_versions_v2
  )
  DELETE FROM preset_versions_v2 v
  USING ranked r
  WHERE v.id = r.id
    AND r.version_rank > keep_count;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION kessho_prune_internal_derived_v2()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  total_deleted INTEGER := 0;
BEGIN
  LOOP
    DELETE FROM presets_v2 p
    WHERE 'internal-derived' = ANY(p.tags)
      AND NOT EXISTS (
        SELECT 1
        FROM preset_version_refs_v2 r
        WHERE r.target_preset_id = p.id
      );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    EXIT WHEN deleted_count = 0;
  END LOOP;

  RETURN total_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
