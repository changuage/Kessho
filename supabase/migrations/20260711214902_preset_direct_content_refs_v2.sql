BEGIN;

ALTER TABLE public.preset_payloads_v2
  DROP CONSTRAINT IF EXISTS preset_payloads_v2_payload_kind_check;

ALTER TABLE public.preset_payloads_v2
  ADD CONSTRAINT preset_payloads_v2_payload_kind_check
  CHECK (payload_kind IN ('override', 'metadata', 'resolved', 'patch', 'refs_override', 'content'));

CREATE TABLE public.preset_version_content_refs_v2 (
  version_id UUID NOT NULL REFERENCES public.preset_versions_v2(id) ON DELETE CASCADE,
  ref_slot TEXT NOT NULL,
  content_hash TEXT NOT NULL REFERENCES public.preset_payloads_v2(hash) ON DELETE RESTRICT,
  content_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, ref_slot),
  CONSTRAINT preset_version_content_refs_v2_slot_check CHECK (
    ref_slot ~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$'
  ),
  CONSTRAINT preset_version_content_refs_v2_hash_check CHECK (
    content_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT preset_version_content_refs_v2_type_check CHECK (
    content_type IN (
      'sequencerTrigger',
      'sequencerSubLane',
      'sequencerLaneControl',
      'granularVoice',
      'granularSelection',
      'padVoice',
      'sampleVoice',
      'dynamicsEq',
      'drumSubVoice',
      'drumKickVoice',
      'drumClickVoice',
      'drumBeepHiVoice',
      'drumBeepLoVoice',
      'drumNoiseVoice',
      'drumMembraneVoice',
      'insectsVoice',
      'harmonyChordBank',
      'harmonySequenceBank',
      'harmonyContext',
      'waterEndpoint',
      'sequencerArrangement',
      'mixRouting'
      ,'parameterBehaviorMap'
    )
  ),
  CONSTRAINT preset_version_content_refs_v2_slot_type_check CHECK (
    (ref_slot ~ '^sequencer\.(synth|drum)\.[1-9][0-9]*\.trigger$' AND content_type = 'sequencerTrigger')
    OR (ref_slot ~ '^sequencer\.(synth|drum)\.[1-9][0-9]*\.(pitch|expression|morph|distance|nudge|slice|reverse)$' AND content_type = 'sequencerSubLane')
    OR (ref_slot ~ '^sequencer\.(synth|drum)\.[1-9][0-9]*\.control$' AND content_type = 'sequencerLaneControl')
    OR (ref_slot ~ '^granular\.voice\.[1-4]\.content$' AND content_type = 'granularVoice')
    OR (ref_slot ~ '^sample\.voice\.[1-2]\.content$' AND content_type = 'sampleVoice')
    OR (ref_slot ~ '^pad\.voice\.[1-2]\.content$' AND content_type = 'padVoice')
    OR (ref_slot ~ '^derived\.pad\.[1-2]\.endpoint-[ab]$' AND content_type = 'padVoice')
    OR (ref_slot ~ '^derived\.drum\.sub\.endpoint-[ab]$' AND content_type = 'drumSubVoice')
    OR (ref_slot ~ '^derived\.drum\.kick\.endpoint-[ab]$' AND content_type = 'drumKickVoice')
    OR (ref_slot ~ '^derived\.drum\.click\.endpoint-[ab]$' AND content_type = 'drumClickVoice')
    OR (ref_slot ~ '^derived\.drum\.beephi\.endpoint-[ab]$' AND content_type = 'drumBeepHiVoice')
    OR (ref_slot ~ '^derived\.drum\.beeplo\.endpoint-[ab]$' AND content_type = 'drumBeepLoVoice')
    OR (ref_slot ~ '^derived\.drum\.noise\.endpoint-[ab]$' AND content_type = 'drumNoiseVoice')
    OR (ref_slot ~ '^derived\.drum\.membrane\.endpoint-[ab]$' AND content_type = 'drumMembraneVoice')
    OR (ref_slot = 'derived.granular.selection' AND content_type = 'granularSelection')
    OR (ref_slot ~ '^derived\.water\.endpoint-[ab]$' AND content_type = 'waterEndpoint')
    OR (ref_slot ~ '^dynamics\.eq\.[1-2]\.content$' AND content_type = 'dynamicsEq')
    OR (ref_slot ~ '^insects\.voice\.[1-2]\.content$' AND content_type = 'insectsVoice')
    OR (ref_slot ~ '^harmony\.program\.chord-bank-[ab]$' AND content_type = 'harmonyChordBank')
    OR (ref_slot ~ '^harmony\.program\.sequence-bank-[ab]$' AND content_type = 'harmonySequenceBank')
    OR (ref_slot = 'harmony.program.context' AND content_type = 'harmonyContext')
    OR (ref_slot = 'sequencer.arrangement.content' AND content_type = 'sequencerArrangement')
    OR (ref_slot = 'mix.routing.content' AND content_type = 'mixRouting')
    OR (ref_slot ~ '^behavior\.scope\.[a-z0-9]+(-[a-z0-9]+)*\.content$' AND content_type = 'parameterBehaviorMap')
  )
);

CREATE INDEX idx_preset_version_content_refs_v2_hash
  ON public.preset_version_content_refs_v2(content_hash);

ALTER TABLE public.preset_version_content_refs_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY preset_version_content_refs_v2_read
  ON public.preset_version_content_refs_v2
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.preset_versions_v2 version
        JOIN public.presets_v2 preset ON preset.id = version.preset_id
       WHERE version.id = preset_version_content_refs_v2.version_id
         AND preset.deleted_at IS NULL
         AND (
           preset.visibility IN ('public', 'featured')
           OR preset.owner_key = 'public'
           OR preset.owner_user_id = (SELECT auth.uid())
         )
    )
  );

REVOKE ALL ON TABLE public.preset_version_content_refs_v2 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kessho_save_preset_v2(
  identity_payload JSONB,
  version_payload JSONB,
  payloads_payload JSONB,
  refs_payload JSONB,
  content_refs_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  legacy_payloads JSONB := '[]'::jsonb;
  content_payloads JSONB := '[]'::jsonb;
  result JSONB;
  saved_version_id UUID;
  payload_row JSONB;
  content_ref_row JSONB;
  content_hash TEXT;
  content_type TEXT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to save presets';
  END IF;

  IF jsonb_typeof(payloads_payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'payloads_payload must be an array';
  END IF;

  IF jsonb_typeof(refs_payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'refs_payload must be an array';
  END IF;

  IF jsonb_typeof(content_refs_payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'content_refs_payload must be an array';
  END IF;

  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
    INTO legacy_payloads
    FROM jsonb_array_elements(payloads_payload)
   WHERE value->>'payload_kind' IS DISTINCT FROM 'content';

  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
    INTO content_payloads
    FROM jsonb_array_elements(payloads_payload)
   WHERE value->>'payload_kind' = 'content';

  FOR payload_row IN SELECT value FROM jsonb_array_elements(content_payloads)
  LOOP
    content_hash := NULLIF(payload_row->>'hash', '');
    IF content_hash IS NULL OR content_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Invalid preset content payload hash';
    END IF;

    IF jsonb_typeof(payload_row->'payload') IS DISTINCT FROM 'object'
       OR NULLIF(payload_row->'payload'->>'contentType', '') IS NULL
       OR COALESCE((payload_row->'payload'->>'schemaVersion')::INTEGER, 0) <> 1
       OR jsonb_typeof(payload_row->'payload'->'content') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid preset content payload envelope for hash %', content_hash;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements(content_refs_payload) content_ref
       WHERE content_ref->>'content_hash' = content_hash
         AND content_ref->>'content_type' = payload_row->'payload'->>'contentType'
    ) THEN
      RAISE EXCEPTION 'Unreferenced preset content payload % is not allowed', content_hash;
    END IF;

    PERFORM public.kessho_assert_payload_hash_matches(content_hash, payload_row->'payload');

    INSERT INTO public.preset_payloads_v2(hash, payload_kind, payload)
    VALUES (content_hash, 'content', payload_row->'payload')
    ON CONFLICT (hash) DO UPDATE
      SET last_seen_at = now()
      WHERE public.preset_payloads_v2.last_seen_at < now() - INTERVAL '7 days';
  END LOOP;

  FOR content_ref_row IN SELECT value FROM jsonb_array_elements(content_refs_payload)
  LOOP
    content_hash := NULLIF(content_ref_row->>'content_hash', '');
    content_type := NULLIF(content_ref_row->>'content_type', '');

    IF NULLIF(content_ref_row->>'ref_slot', '') IS NULL THEN
      RAISE EXCEPTION 'Preset content ref_slot is required';
    END IF;

    IF content_ref_row->>'ref_slot' !~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'Invalid preset content ref_slot: %', content_ref_row->>'ref_slot';
    END IF;

    IF content_hash IS NULL OR content_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Invalid preset content ref hash';
    END IF;

    IF content_type NOT IN (
      'sequencerTrigger',
      'sequencerSubLane',
      'sequencerLaneControl',
      'granularVoice',
      'padVoice',
      'sampleVoice',
      'dynamicsEq',
      'granularSelection',
      'drumSubVoice',
      'drumKickVoice',
      'drumClickVoice',
      'drumBeepHiVoice',
      'drumBeepLoVoice',
      'drumNoiseVoice',
      'drumMembraneVoice',
      'waterEndpoint',
      'insectsVoice',
      'harmonyChordBank',
      'harmonySequenceBank',
      'harmonyContext',
      'sequencerArrangement',
      'mixRouting'
    ) THEN
      RAISE EXCEPTION 'Invalid preset content type: %', content_type;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements(content_payloads) content_payload
       WHERE content_payload->>'hash' = content_hash
         AND content_payload->'payload'->>'contentType' = content_type
    ) THEN
      RAISE EXCEPTION 'Preset content ref % must include its canonical payload in the same request', content_ref_row->>'ref_slot';
    END IF;
  END LOOP;

  result := public.kessho_save_preset_v2(
    identity_payload,
    version_payload,
    legacy_payloads,
    refs_payload
  );
  saved_version_id := NULLIF(result->'version'->>'id', '')::UUID;

  IF saved_version_id IS NULL THEN
    RAISE EXCEPTION 'Atomic preset save returned no version id';
  END IF;

  FOR content_ref_row IN SELECT value FROM jsonb_array_elements(content_refs_payload)
  LOOP
    INSERT INTO public.preset_version_content_refs_v2(
      version_id,
      ref_slot,
      content_hash,
      content_type,
      created_at
    )
    VALUES (
      saved_version_id,
      content_ref_row->>'ref_slot',
      content_ref_row->>'content_hash',
      content_ref_row->>'content_type',
      COALESCE(NULLIF(content_ref_row->>'created_at', '')::TIMESTAMPTZ, now())
    );
  END LOOP;

  RETURN result || jsonb_build_object(
    'content_refs', COALESCE((
      SELECT jsonb_agg(to_jsonb(content_ref) ORDER BY content_ref.ref_slot)
        FROM public.preset_version_content_refs_v2 content_ref
       WHERE content_ref.version_id = saved_version_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB, JSONB) IS
  'Atomic V2 preset save with opaque content-addressed component refs. Every content ref must include its canonical payload in the same request.';

CREATE OR REPLACE FUNCTION public.kessho_get_missing_preset_payloads_v2(target_hashes TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  safe_hashes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read preset payloads';
  END IF;

  IF target_hashes IS NULL OR array_length(target_hashes, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT hash
      FROM unnest(target_hashes) AS hash
     WHERE hash ~ '^[0-9a-f]{64}$'
     LIMIT 100
  ) INTO safe_hashes;

  IF array_length(safe_hashes, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    WITH visible_presets AS (
      SELECT preset.id, preset.latest_resolved_hash, preset.latest_metadata_hash
        FROM public.presets_v2 preset
       WHERE preset.deleted_at IS NULL
         AND (
           preset.visibility IN ('public', 'featured')
           OR preset.owner_key = 'public'
           OR preset.owner_user_id = caller_id
         )
    ),
    visible_versions AS (
      SELECT version.*
        FROM public.preset_versions_v2 version
        JOIN visible_presets preset ON preset.id = version.preset_id
    ),
    allowed_hashes AS (
      SELECT latest_resolved_hash AS hash FROM visible_presets
      UNION
      SELECT latest_metadata_hash FROM visible_presets
      UNION
      SELECT override_hash FROM visible_versions
      UNION
      SELECT metadata_hash FROM visible_versions
      UNION
      SELECT patch_from_prev_hash FROM visible_versions
      UNION
      SELECT resolved_hash FROM visible_versions
      UNION
      SELECT ref.override_hash
        FROM public.preset_version_refs_v2 ref
        JOIN visible_versions version ON version.id = ref.version_id
      UNION
      SELECT content_ref.content_hash
        FROM public.preset_version_content_refs_v2 content_ref
        JOIN visible_versions version ON version.id = content_ref.version_id
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'hash', payload.hash,
        'payload_kind', payload.payload_kind,
        'payload', payload.payload
      )
      ORDER BY payload.hash
    )
      FROM public.preset_payloads_v2 payload
     WHERE payload.hash = ANY(safe_hashes)
       AND payload.hash IN (SELECT hash FROM allowed_hashes WHERE hash IS NOT NULL)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_latest_manifest_v2(target_preset_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  preset_row public.presets_v2%ROWTYPE;
  version_row public.preset_versions_v2%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to load preset manifests';
  END IF;

  SELECT *
    INTO preset_row
    FROM public.presets_v2 preset
   WHERE preset.id = target_preset_id
     AND preset.deleted_at IS NULL
     AND (
       preset.visibility IN ('public', 'featured')
       OR preset.owner_key = 'public'
       OR preset.owner_user_id = caller_id
     );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO version_row
    FROM public.preset_versions_v2 version
   WHERE version.id = preset_row.latest_version_id
      OR (preset_row.latest_version_id IS NULL AND version.preset_id = preset_row.id)
   ORDER BY version.version_no DESC, version.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'preset', to_jsonb(preset_row),
    'latest_version', to_jsonb(version_row),
    'refs', COALESCE((
      SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.ref_slot)
        FROM public.preset_version_refs_v2 ref
       WHERE ref.version_id = version_row.id
    ), '[]'::jsonb),
    'content_refs', COALESCE((
      SELECT jsonb_agg(to_jsonb(content_ref) ORDER BY content_ref.ref_slot)
        FROM public.preset_version_content_refs_v2 content_ref
       WHERE content_ref.version_id = version_row.id
    ), '[]'::jsonb),
    'target_presets', COALESCE((
      SELECT jsonb_agg(to_jsonb(target) ORDER BY target.name)
        FROM public.preset_version_refs_v2 ref
        JOIN public.presets_v2 target ON target.id = ref.target_preset_id
       WHERE ref.version_id = version_row.id
         AND target.deleted_at IS NULL
         AND (
           target.visibility IN ('public', 'featured')
           OR target.owner_key = 'public'
           OR target.owner_user_id = caller_id
         )
    ), '[]'::jsonb),
    'required_hashes', (
      SELECT COALESCE(jsonb_agg(DISTINCT hash), '[]'::jsonb)
        FROM (
          VALUES
            (version_row.override_hash),
            (version_row.metadata_hash),
            (version_row.patch_from_prev_hash),
            (version_row.resolved_hash),
            (preset_row.latest_resolved_hash),
            (preset_row.latest_metadata_hash)
          UNION
          SELECT ref.override_hash
            FROM public.preset_version_refs_v2 ref
           WHERE ref.version_id = version_row.id
          UNION
          SELECT content_ref.content_hash
            FROM public.preset_version_content_refs_v2 content_ref
           WHERE content_ref.version_id = version_row.id
          UNION
          SELECT target.latest_resolved_hash
            FROM public.preset_version_refs_v2 ref
            JOIN public.presets_v2 target ON target.id = ref.target_preset_id
           WHERE ref.version_id = version_row.id
          UNION
          SELECT target.latest_metadata_hash
            FROM public.preset_version_refs_v2 ref
            JOIN public.presets_v2 target ON target.id = ref.target_preset_id
           WHERE ref.version_id = version_row.id
        ) hashes(hash)
       WHERE hash IS NOT NULL
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_detail_v2(
  target_preset_id UUID DEFAULT NULL,
  target_type TEXT DEFAULT NULL,
  target_name TEXT DEFAULT NULL,
  target_scopes TEXT[] DEFAULT NULL,
  target_version_no INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  selected_preset_id UUID;
  preset_json JSONB;
  version_ids UUID[] := ARRAY[]::UUID[];
  target_ids UUID[] := ARRAY[]::UUID[];
  payload_hashes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to load preset details';
  END IF;

  IF target_preset_id IS NULL AND (target_type IS NULL OR NULLIF(target_name, '') IS NULL) THEN
    RAISE EXCEPTION 'target_preset_id or target_type/target_name is required';
  END IF;

  WITH candidate AS (
    SELECT preset.*
      FROM public.presets_v2 preset
     WHERE preset.deleted_at IS NULL
       AND (
         (target_preset_id IS NOT NULL AND preset.id = target_preset_id)
         OR (
           target_preset_id IS NULL
           AND preset.type::TEXT = target_type
           AND preset.name_key = lower(btrim(target_name))
           AND (
             (target_scopes IS NULL AND preset.scope IS NULL)
             OR (target_scopes IS NOT NULL AND preset.scope = ANY(target_scopes))
           )
         )
       )
       AND (
         preset.visibility IN ('public', 'featured')
         OR preset.owner_key = 'public'
         OR preset.owner_user_id = caller_id
       )
     ORDER BY
       CASE WHEN preset.owner_user_id = caller_id THEN 0 ELSE 1 END,
       CASE WHEN preset.visibility = 'featured' THEN 0 ELSE 1 END,
       preset.updated_at DESC,
       preset.latest_version_no DESC,
       preset.created_at DESC
     LIMIT 1
  )
  SELECT
    candidate.id,
    jsonb_build_object(
      'id', candidate.id,
      'owner_key', candidate.owner_key,
      'owner_user_id', candidate.owner_user_id,
      'type', candidate.type,
      'scope', candidate.scope,
      'name', candidate.name,
      'author', candidate.author,
      'library', candidate.library,
      'creator', candidate.creator,
      'description', candidate.description,
      'tags', candidate.tags,
      'visibility', candidate.visibility,
      'family_name', candidate.family_name,
      'variant_name', candidate.variant_name,
      'variant_rank', candidate.variant_rank,
      'forked_from', candidate.forked_from,
      'latest_version_no', candidate.latest_version_no,
      'latest_version_id', candidate.latest_version_id,
      'latest_resolved_hash', candidate.latest_resolved_hash,
      'latest_metadata_hash', candidate.latest_metadata_hash,
      'play_count', candidate.play_count,
      'rating', candidate.rating,
      'archived', candidate.archived,
      'deleted_at', candidate.deleted_at,
      'deleted_by', candidate.deleted_by,
      'created_at', candidate.created_at,
      'updated_at', candidate.updated_at
    )
    INTO selected_preset_id, preset_json
    FROM candidate;

  IF selected_preset_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(version.id ORDER BY version.version_no ASC), ARRAY[]::UUID[])
    INTO version_ids
    FROM public.preset_versions_v2 version
   WHERE version.preset_id = selected_preset_id
     AND (target_version_no IS NULL OR version.version_no <= target_version_no);

  SELECT COALESCE(array_agg(DISTINCT ref.target_preset_id), ARRAY[]::UUID[])
    INTO target_ids
    FROM public.preset_version_refs_v2 ref
   WHERE ref.version_id = ANY(version_ids);

  WITH hashes AS (
    SELECT version.override_hash AS hash
      FROM public.preset_versions_v2 version
     WHERE version.id = ANY(version_ids)
    UNION
    SELECT version.metadata_hash
      FROM public.preset_versions_v2 version
     WHERE version.id = ANY(version_ids)
    UNION
    SELECT version.patch_from_prev_hash
      FROM public.preset_versions_v2 version
     WHERE version.id = ANY(version_ids)
    UNION
    SELECT version.resolved_hash
      FROM public.preset_versions_v2 version
     WHERE version.id = ANY(version_ids)
    UNION
    SELECT ref.override_hash
      FROM public.preset_version_refs_v2 ref
     WHERE ref.version_id = ANY(version_ids)
    UNION
    SELECT content_ref.content_hash
      FROM public.preset_version_content_refs_v2 content_ref
     WHERE content_ref.version_id = ANY(version_ids)
    UNION
    SELECT target.latest_resolved_hash
      FROM public.presets_v2 target
     WHERE target.id = ANY(target_ids)
       AND target.deleted_at IS NULL
       AND (
         target.visibility IN ('public', 'featured')
         OR target.owner_key = 'public'
         OR target.owner_user_id = caller_id
       )
  )
  SELECT COALESCE(array_agg(DISTINCT hash) FILTER (WHERE hash IS NOT NULL), ARRAY[]::TEXT[])
    INTO payload_hashes
    FROM hashes;

  RETURN jsonb_build_object(
    'preset', preset_json,
    'versions', COALESCE((
      SELECT jsonb_agg(to_jsonb(version) ORDER BY version.version_no ASC)
        FROM public.preset_versions_v2 version
       WHERE version.id = ANY(version_ids)
    ), '[]'::jsonb),
    'refs', COALESCE((
      SELECT jsonb_agg(to_jsonb(ref) ORDER BY ref.version_id, ref.ref_slot)
        FROM public.preset_version_refs_v2 ref
       WHERE ref.version_id = ANY(version_ids)
    ), '[]'::jsonb),
    'contentRefs', COALESCE((
      SELECT jsonb_agg(to_jsonb(content_ref) ORDER BY content_ref.version_id, content_ref.ref_slot)
        FROM public.preset_version_content_refs_v2 content_ref
       WHERE content_ref.version_id = ANY(version_ids)
    ), '[]'::jsonb),
    'targetPresets', COALESCE((
      SELECT jsonb_agg(to_jsonb(target) ORDER BY target.id)
        FROM public.presets_v2 target
       WHERE target.id = ANY(target_ids)
         AND target.deleted_at IS NULL
         AND (
           target.visibility IN ('public', 'featured')
           OR target.owner_key = 'public'
           OR target.owner_user_id = caller_id
         )
    ), '[]'::jsonb),
    'payloads', COALESCE((
      SELECT jsonb_agg(to_jsonb(payload) ORDER BY payload.hash)
        FROM public.preset_payloads_v2 payload
       WHERE payload.hash = ANY(payload_hashes)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.kessho_get_missing_preset_payloads_v2(TEXT[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_get_missing_preset_payloads_v2(TEXT[])
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_latest_manifest_v2(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_latest_manifest_v2(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.kessho_purge_deleted_presets_v2(
  dry_run_mode BOOLEAN DEFAULT TRUE,
  private_retention INTERVAL DEFAULT INTERVAL '30 days',
  public_retention INTERVAL DEFAULT INTERVAL '180 days',
  batch_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(batch_limit, 500), 1), 5000);
  candidate_preset_count INTEGER := 0;
  candidate_version_count INTEGER := 0;
  candidate_ref_count INTEGER := 0;
  candidate_content_ref_count INTEGER := 0;
  orphan_payload_count INTEGER := 0;
  orphan_payload_bytes BIGINT := 0;
  deleted_preset_count INTEGER := 0;
  deleted_version_count INTEGER := 0;
  deleted_ref_count INTEGER := 0;
  deleted_content_ref_count INTEGER := 0;
  deleted_payload_count INTEGER := 0;
  deleted_payload_bytes BIGINT := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('kessho_purge_deleted_presets_v2')) THEN
    RETURN jsonb_build_object(
      'dry_run', dry_run_mode,
      'lock_acquired', false,
      'deleted_presets', 0,
      'deleted_versions', 0,
      'deleted_refs', 0,
      'deleted_content_refs', 0,
      'orphan_payload_rows', 0,
      'orphan_payload_bytes', 0
    );
  END IF;

  DROP TABLE IF EXISTS purge_candidate_presets;

  CREATE TEMP TABLE purge_candidate_presets ON COMMIT DROP AS
  SELECT preset.id
    FROM public.presets_v2 preset
   WHERE preset.deleted_at IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.preset_version_refs_v2 active_ref
        WHERE active_ref.target_preset_id = preset.id
     )
     AND (
       (
         preset.visibility = 'private'
         AND preset.deleted_at <= now() - private_retention
         AND NOT ('system' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[])))
         AND NOT ('factory' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[])))
       )
       OR (
         preset.visibility IN ('public', 'featured')
         AND preset.visibility <> 'featured'
         AND preset.deleted_at <= now() - public_retention
         AND NOT ('system' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[])))
         AND NOT ('factory' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[])))
       )
     )
   ORDER BY preset.deleted_at ASC
   LIMIT safe_limit;

  SELECT count(*) INTO candidate_preset_count FROM purge_candidate_presets;

  SELECT count(*)
    INTO candidate_version_count
    FROM public.preset_versions_v2 version
    JOIN purge_candidate_presets preset ON preset.id = version.preset_id;

  SELECT count(*)
    INTO candidate_ref_count
    FROM public.preset_version_refs_v2 ref
    JOIN public.preset_versions_v2 version ON version.id = ref.version_id
    JOIN purge_candidate_presets preset ON preset.id = version.preset_id;

  SELECT count(*)
    INTO candidate_content_ref_count
    FROM public.preset_version_content_refs_v2 content_ref
    JOIN public.preset_versions_v2 version ON version.id = content_ref.version_id
    JOIN purge_candidate_presets preset ON preset.id = version.preset_id;

  WITH referenced_hashes AS (
    SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
    UNION
    SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
    UNION
    SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
    UNION
    SELECT resolved_hash FROM public.preset_versions_v2 WHERE resolved_hash IS NOT NULL
    UNION
    SELECT override_hash FROM public.preset_version_refs_v2 WHERE override_hash IS NOT NULL
    UNION
    SELECT content_hash FROM public.preset_version_content_refs_v2
    UNION
    SELECT latest_resolved_hash FROM public.presets_v2 WHERE latest_resolved_hash IS NOT NULL
    UNION
    SELECT latest_metadata_hash FROM public.presets_v2 WHERE latest_metadata_hash IS NOT NULL
  )
  SELECT count(*), COALESCE(sum(payload.payload_bytes), 0)
    INTO orphan_payload_count, orphan_payload_bytes
    FROM public.preset_payloads_v2 payload
    LEFT JOIN referenced_hashes refs USING (hash)
   WHERE refs.hash IS NULL;

  IF dry_run_mode THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'lock_acquired', true,
      'candidate_presets', candidate_preset_count,
      'candidate_versions', candidate_version_count,
      'candidate_refs', candidate_ref_count,
      'candidate_content_refs', candidate_content_ref_count,
      'orphan_payload_rows', orphan_payload_count,
      'orphan_payload_bytes', orphan_payload_bytes,
      'deleted_presets', 0,
      'deleted_versions', 0,
      'deleted_refs', 0,
      'deleted_content_refs', 0,
      'deleted_payload_rows', 0,
      'deleted_payload_bytes', 0
    );
  END IF;

  WITH deleted AS (
    DELETE FROM public.preset_version_refs_v2 ref
    USING public.preset_versions_v2 version, purge_candidate_presets preset
    WHERE ref.version_id = version.id
      AND version.preset_id = preset.id
    RETURNING ref.version_id
  )
  SELECT count(*) INTO deleted_ref_count FROM deleted;

  WITH deleted AS (
    DELETE FROM public.preset_version_content_refs_v2 content_ref
    USING public.preset_versions_v2 version, purge_candidate_presets preset
    WHERE content_ref.version_id = version.id
      AND version.preset_id = preset.id
    RETURNING content_ref.version_id
  )
  SELECT count(*) INTO deleted_content_ref_count FROM deleted;

  WITH deleted AS (
    DELETE FROM public.preset_versions_v2 version
    USING purge_candidate_presets preset
    WHERE version.preset_id = preset.id
    RETURNING version.id
  )
  SELECT count(*) INTO deleted_version_count FROM deleted;

  WITH deleted AS (
    DELETE FROM public.presets_v2 preset
    USING purge_candidate_presets candidate
    WHERE preset.id = candidate.id
    RETURNING preset.id
  )
  SELECT count(*) INTO deleted_preset_count FROM deleted;

  WITH referenced_hashes AS (
    SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
    UNION
    SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
    UNION
    SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
    UNION
    SELECT resolved_hash FROM public.preset_versions_v2 WHERE resolved_hash IS NOT NULL
    UNION
    SELECT override_hash FROM public.preset_version_refs_v2 WHERE override_hash IS NOT NULL
    UNION
    SELECT content_hash FROM public.preset_version_content_refs_v2
    UNION
    SELECT latest_resolved_hash FROM public.presets_v2 WHERE latest_resolved_hash IS NOT NULL
    UNION
    SELECT latest_metadata_hash FROM public.presets_v2 WHERE latest_metadata_hash IS NOT NULL
  ),
  candidates AS (
    SELECT payload.hash, payload.payload_bytes
      FROM public.preset_payloads_v2 payload
      LEFT JOIN referenced_hashes refs USING (hash)
     WHERE refs.hash IS NULL
     ORDER BY payload.last_seen_at ASC, payload.created_at ASC
     LIMIT safe_limit
  ),
  deleted AS (
    DELETE FROM public.preset_payloads_v2 payload
    USING candidates
    WHERE payload.hash = candidates.hash
    RETURNING candidates.payload_bytes
  )
  SELECT count(*), COALESCE(sum(payload_bytes), 0)
    INTO deleted_payload_count, deleted_payload_bytes
    FROM deleted;

  RETURN jsonb_build_object(
    'dry_run', false,
    'lock_acquired', true,
    'candidate_presets', candidate_preset_count,
    'candidate_versions', candidate_version_count,
    'candidate_refs', candidate_ref_count,
    'candidate_content_refs', candidate_content_ref_count,
    'orphan_payload_rows', orphan_payload_count,
    'orphan_payload_bytes', orphan_payload_bytes,
    'deleted_presets', deleted_preset_count,
    'deleted_versions', deleted_version_count,
    'deleted_refs', deleted_ref_count,
    'deleted_content_refs', deleted_content_ref_count,
    'deleted_payload_rows', deleted_payload_count,
    'deleted_payload_bytes', deleted_payload_bytes
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_purge_deleted_presets_v2(BOOLEAN, INTERVAL, INTERVAL, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_purge_deleted_presets_v2(BOOLEAN, INTERVAL, INTERVAL, INTEGER)
  TO service_role;

COMMIT;
