-- Supabase storage and egress optimization follow-up.
--
-- Adds latest-only detail reads, payload-by-hash fetches, narrow rename RPCs,
-- stale-only duplicate payload touches, payload kind consistency, retention
-- purge, and play-count write reduction support.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.kessho_assert_payload_hash_kind_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.preset_payloads_v2 existing
     WHERE existing.hash = NEW.hash
       AND existing.payload_kind::TEXT <> NEW.payload_kind::TEXT
  ) THEN
    RAISE EXCEPTION 'payload hash % already exists with a different payload_kind', NEW.hash;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preset_payloads_v2_hash_kind_consistency ON public.preset_payloads_v2;
CREATE TRIGGER preset_payloads_v2_hash_kind_consistency
  BEFORE INSERT OR UPDATE OF hash, payload_kind ON public.preset_payloads_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.kessho_assert_payload_hash_kind_consistency();

CREATE OR REPLACE FUNCTION public.kessho_canonical_jsonb_text(input_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  value_type TEXT := jsonb_typeof(input_value);
  normalized_number NUMERIC;
  number_text TEXT;
  result_text TEXT;
BEGIN
  IF value_type = 'null' THEN
    RETURN 'null';
  END IF;

  IF value_type IN ('string', 'boolean') THEN
    RETURN input_value::TEXT;
  END IF;

  IF value_type = 'number' THEN
    normalized_number := floor(((input_value #>> '{}')::NUMERIC * 1000000) + 0.5) / 1000000;
    IF normalized_number = 0 THEN
      RETURN '0';
    END IF;
    number_text := normalized_number::TEXT;
    IF position('.' IN number_text) > 0 THEN
      number_text := regexp_replace(number_text, '0+$', '');
      number_text := regexp_replace(number_text, '\.$', '');
    END IF;
    RETURN number_text;
  END IF;

  IF value_type = 'array' THEN
    SELECT '[' || COALESCE(string_agg(public.kessho_canonical_jsonb_text(element_value), ',' ORDER BY element_index), '') || ']'
      INTO result_text
      FROM jsonb_array_elements(input_value) WITH ORDINALITY AS element(element_value, element_index);
    RETURN result_text;
  END IF;

  IF value_type = 'object' THEN
    SELECT '{' || COALESCE(string_agg(to_jsonb(entry_key)::TEXT || ':' || public.kessho_canonical_jsonb_text(entry_value), ',' ORDER BY entry_key COLLATE "C"), '') || '}'
      INTO result_text
      FROM jsonb_each(input_value) AS entry(entry_key, entry_value);
    RETURN result_text;
  END IF;

  RAISE EXCEPTION 'Unsupported preset payload JSONB type: %', value_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_assert_payload_hash_matches(
  supplied_hash TEXT,
  body JSONB
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized_body JSONB := COALESCE(body, '{}'::jsonb);
  computed_hash TEXT;
BEGIN
  IF supplied_hash IS NULL OR supplied_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid preset payload hash';
  END IF;

  computed_hash := encode(extensions.digest(public.kessho_canonical_jsonb_text(normalized_body), 'sha256'), 'hex');
  IF computed_hash <> supplied_hash THEN
    RAISE EXCEPTION 'Preset payload hash mismatch: expected %, computed %', supplied_hash, computed_hash;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_assert_preset_payload_hashes_exist(target_hashes TEXT[])
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  invalid_hash TEXT;
  missing_hashes TEXT[];
BEGIN
  SELECT candidate_hash
    INTO invalid_hash
    FROM unnest(COALESCE(target_hashes, ARRAY[]::TEXT[])) AS candidate(candidate_hash)
   WHERE candidate_hash IS NOT NULL
     AND candidate_hash <> ''
     AND candidate_hash !~ '^[0-9a-f]{64}$'
   LIMIT 1;

  IF invalid_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid preset payload hash';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT candidate_hash
      FROM unnest(COALESCE(target_hashes, ARRAY[]::TEXT[])) AS candidate(candidate_hash)
     WHERE candidate_hash IS NOT NULL
       AND candidate_hash <> ''
       AND NOT EXISTS (
         SELECT 1
           FROM public.preset_payloads_v2 payload
          WHERE payload.hash = candidate_hash
       )
     ORDER BY candidate_hash
  )
    INTO missing_hashes;

  IF array_length(missing_hashes, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Preset payload hash references missing payload rows: %', array_to_string(missing_hashes, ',');
  END IF;
END;
$$;

DO $$
BEGIN
  IF public.kessho_canonical_jsonb_text('{"b":2,"a":1}'::jsonb) <> '{"a":1,"b":2}' THEN
    RAISE EXCEPTION 'preset JSON canonicalizer object-order self-test failed';
  END IF;

  IF public.kessho_canonical_jsonb_text('{"value":0.1234564}'::jsonb) <> '{"value":0.123456}' THEN
    RAISE EXCEPTION 'preset JSON canonicalizer rounding self-test failed';
  END IF;

  IF public.kessho_canonical_jsonb_text('{"value":-0.1234565}'::jsonb) <> '{"value":-0.123456}' THEN
    RAISE EXCEPTION 'preset JSON canonicalizer negative rounding self-test failed';
  END IF;

  IF public.kessho_canonical_jsonb_text('{"value":0}'::jsonb) <> '{"value":0}' THEN
    RAISE EXCEPTION 'preset JSON canonicalizer zero self-test failed';
  END IF;

  IF public.kessho_canonical_jsonb_text('{"z":[1,true,null,{"b":"x","a":false}]}'::jsonb) <> '{"z":[1,true,null,{"a":false,"b":"x"}]}' THEN
    RAISE EXCEPTION 'preset JSON canonicalizer nested-array self-test failed';
  END IF;

  PERFORM public.kessho_assert_payload_hash_matches(
    '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    '{"b":2,"a":1}'::jsonb
  );
  PERFORM public.kessho_assert_payload_hash_matches(
    '02c5e03d63426345c67ff0541f6d4a68f212797909119ccd81a94f8f85654811',
    '{"value":0.1234564}'::jsonb
  );
  PERFORM public.kessho_assert_payload_hash_matches(
    '23d7b286bd429460b92a2a1c21b6afc34110446c5034c17363fda363aa0a7c5d',
    '{"value":0}'::jsonb
  );
  PERFORM public.kessho_assert_payload_hash_matches(
    '4508c786ddc6d8aa1619da1a2b6235eb2c548ca7e47b3b41e51c5f575e7b5b6b',
    '{"value":-0.1234565}'::jsonb
  );
  PERFORM public.kessho_assert_payload_hash_matches(
    'b1a6e1e32adafdfb61c1070c157a15bbe76f1b77af69968c57944f31f22c7251',
    '{"z":[1,true,null,{"b":"x","a":false}]}'::jsonb
  );

  BEGIN
    PERFORM public.kessho_assert_payload_hash_matches(
      repeat('0', 64),
      '{"this_body_should_not_hash_to_zeroes":true}'::jsonb
    );
    RAISE EXCEPTION 'preset payload hash mismatch self-test unexpectedly passed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM = 'preset payload hash mismatch self-test unexpectedly passed' THEN
        RAISE;
      END IF;
      IF SQLERRM NOT LIKE 'Preset payload hash mismatch:%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.kessho_assert_preset_payload_hashes_exist(ARRAY[repeat('f', 64)]);
    RAISE EXCEPTION 'preset payload missing-hash self-test unexpectedly passed';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM = 'preset payload missing-hash self-test unexpectedly passed' THEN
        RAISE;
      END IF;
      IF SQLERRM NOT LIKE 'Preset payload hash references missing payload rows:%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

DO $$
DECLARE
  repair_count INTEGER := 0;
  deleted_count INTEGER := 0;
BEGIN
  DROP TABLE IF EXISTS preset_payload_hash_repairs;

  CREATE TEMP TABLE preset_payload_hash_repairs ON COMMIT DROP AS
  SELECT
    payload.hash AS old_hash,
    encode(extensions.digest(public.kessho_canonical_jsonb_text(payload.payload), 'sha256'), 'hex') AS new_hash,
    payload.payload_kind,
    payload.payload,
    payload.created_at,
    payload.last_seen_at
  FROM public.preset_payloads_v2 payload
  WHERE payload.hash <> encode(extensions.digest(public.kessho_canonical_jsonb_text(payload.payload), 'sha256'), 'hex');

  SELECT count(*) INTO repair_count FROM preset_payload_hash_repairs;

  IF repair_count > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM preset_payload_hash_repairs repair
      JOIN public.preset_payloads_v2 existing ON existing.hash = repair.new_hash
      WHERE existing.payload <> repair.payload
    ) THEN
      RAISE EXCEPTION 'Cannot repair preset payload hashes because a canonical hash already points at different payload bytes';
    END IF;

    INSERT INTO public.preset_payloads_v2(hash, payload_kind, payload, created_at, last_seen_at)
    SELECT repair.new_hash, repair.payload_kind, repair.payload, repair.created_at, repair.last_seen_at
    FROM preset_payload_hash_repairs repair
    ON CONFLICT (hash) DO NOTHING;

    UPDATE public.preset_versions_v2 version
       SET override_hash = COALESCE((SELECT repair.new_hash FROM preset_payload_hash_repairs repair WHERE repair.old_hash = version.override_hash), version.override_hash),
           metadata_hash = COALESCE((SELECT repair.new_hash FROM preset_payload_hash_repairs repair WHERE repair.old_hash = version.metadata_hash), version.metadata_hash),
           patch_from_prev_hash = COALESCE((SELECT repair.new_hash FROM preset_payload_hash_repairs repair WHERE repair.old_hash = version.patch_from_prev_hash), version.patch_from_prev_hash),
           resolved_hash = COALESCE((SELECT repair.new_hash FROM preset_payload_hash_repairs repair WHERE repair.old_hash = version.resolved_hash), version.resolved_hash)
     WHERE version.override_hash IN (SELECT old_hash FROM preset_payload_hash_repairs)
        OR version.metadata_hash IN (SELECT old_hash FROM preset_payload_hash_repairs)
        OR version.patch_from_prev_hash IN (SELECT old_hash FROM preset_payload_hash_repairs)
        OR version.resolved_hash IN (SELECT old_hash FROM preset_payload_hash_repairs);

    UPDATE public.preset_version_refs_v2 ref
       SET override_hash = repair.new_hash
      FROM preset_payload_hash_repairs repair
     WHERE ref.override_hash = repair.old_hash;

    UPDATE public.presets_v2 preset
       SET latest_resolved_hash = COALESCE((SELECT repair.new_hash FROM preset_payload_hash_repairs repair WHERE repair.old_hash = preset.latest_resolved_hash), preset.latest_resolved_hash),
           latest_metadata_hash = COALESCE((SELECT repair.new_hash FROM preset_payload_hash_repairs repair WHERE repair.old_hash = preset.latest_metadata_hash), preset.latest_metadata_hash)
     WHERE preset.latest_resolved_hash IN (SELECT old_hash FROM preset_payload_hash_repairs)
        OR preset.latest_metadata_hash IN (SELECT old_hash FROM preset_payload_hash_repairs);

    DELETE FROM public.preset_payloads_v2 payload
    USING preset_payload_hash_repairs repair
    WHERE payload.hash = repair.old_hash
      AND NOT EXISTS (
        SELECT 1 FROM public.preset_versions_v2 version
        WHERE version.override_hash = repair.old_hash
           OR version.metadata_hash = repair.old_hash
           OR version.patch_from_prev_hash = repair.old_hash
           OR version.resolved_hash = repair.old_hash
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.preset_version_refs_v2 ref
        WHERE ref.override_hash = repair.old_hash
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.presets_v2 preset
        WHERE preset.latest_resolved_hash = repair.old_hash
           OR preset.latest_metadata_hash = repair.old_hash
      );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Repaired % preset payload hashes and deleted % old payload rows', repair_count, deleted_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_put_payload_v2(
  kind TEXT,
  supplied_hash TEXT,
  body JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized JSONB := COALESCE(body, '{}'::jsonb);
BEGIN
  IF supplied_hash IS NULL OR supplied_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid preset payload hash';
  END IF;

  IF kind NOT IN ('override', 'metadata', 'resolved', 'patch', 'refs_override') THEN
    RAISE EXCEPTION 'Invalid preset payload kind: %', kind;
  END IF;

  PERFORM public.kessho_assert_payload_hash_matches(supplied_hash, normalized);

  INSERT INTO public.preset_payloads_v2(hash, payload_kind, payload)
  VALUES (supplied_hash, kind, normalized)
  ON CONFLICT (hash) DO UPDATE
    SET last_seen_at = now()
    WHERE public.preset_payloads_v2.last_seen_at < now() - INTERVAL '7 days';

  RETURN supplied_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_save_preset_v2(
  identity_payload JSONB,
  version_payload JSONB,
  payloads_payload JSONB DEFAULT '[]'::jsonb,
  refs_payload JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_preset_id UUID := NULLIF(identity_payload->>'id', '')::UUID;
  target_scope TEXT := NULLIF(identity_payload->>'scope', '');
  target_owner_key TEXT := 'public';
  target_type public.preset_level_v2 := NULLIF(identity_payload->>'type', '')::public.preset_level_v2;
  target_name TEXT := NULLIF(identity_payload->>'name', '');
  target_tags TEXT[] := ARRAY[]::TEXT[];
  target_visibility public.preset_visibility_v2 := 'public'::public.preset_visibility_v2;
  target_is_internal_derived BOOLEAN := FALSE;
  target_version_no INTEGER := NULLIF(version_payload->>'version_no', '')::INTEGER;
  version_created_at TIMESTAMPTZ := COALESCE(NULLIF(version_payload->>'created_at', '')::TIMESTAMPTZ, now());
  preset_row public.presets_v2%ROWTYPE;
  version_row public.preset_versions_v2%ROWTYPE;
  payload_row JSONB;
  ref_row JSONB;
  ref_target_id UUID;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to save presets';
  END IF;

  IF target_type IS NULL THEN
    RAISE EXCEPTION 'Preset type is required';
  END IF;

  IF target_name IS NULL THEN
    RAISE EXCEPTION 'Preset name is required';
  END IF;

  IF target_version_no IS NULL OR target_version_no < 1 THEN
    RAISE EXCEPTION 'Preset version_no must be >= 1';
  END IF;

  IF identity_payload ? 'tags' AND jsonb_typeof(identity_payload->'tags') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Preset tags must be an array';
  END IF;

  target_tags := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(identity_payload->'tags', '[]'::jsonb))),
    ARRAY[]::TEXT[]
  );
  target_is_internal_derived := target_name LIKE '__derived__/%' OR 'internal-derived' = ANY(target_tags);
  target_visibility := COALESCE(
    NULLIF(identity_payload->>'visibility', '')::public.preset_visibility_v2,
    'public'::public.preset_visibility_v2
  );

  IF target_visibility = 'private'::public.preset_visibility_v2 AND NOT target_is_internal_derived THEN
    target_visibility := 'public'::public.preset_visibility_v2;
  END IF;

  IF jsonb_typeof(payloads_payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'payloads_payload must be an array';
  END IF;

  IF jsonb_typeof(refs_payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'refs_payload must be an array';
  END IF;

  FOR payload_row IN SELECT value FROM jsonb_array_elements(payloads_payload)
  LOOP
    IF payload_row->>'hash' IS NULL OR payload_row->>'hash' !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Invalid preset payload hash';
    END IF;

    IF payload_row->>'payload_kind' NOT IN ('override', 'metadata', 'resolved', 'patch', 'refs_override') THEN
      RAISE EXCEPTION 'Invalid preset payload kind: %', payload_row->>'payload_kind';
    END IF;

    PERFORM public.kessho_assert_payload_hash_matches(
      payload_row->>'hash',
      COALESCE(payload_row->'payload', '{}'::jsonb)
    );

    INSERT INTO public.preset_payloads_v2(hash, payload_kind, payload)
    VALUES (
      payload_row->>'hash',
      payload_row->>'payload_kind',
      COALESCE(payload_row->'payload', '{}'::jsonb)
    )
    ON CONFLICT (hash) DO UPDATE
      SET last_seen_at = now()
      WHERE public.preset_payloads_v2.last_seen_at < now() - INTERVAL '7 days';
  END LOOP;

  IF target_preset_id IS NOT NULL THEN
    SELECT *
      INTO preset_row
      FROM public.presets_v2
     WHERE id = target_preset_id
       AND deleted_at IS NULL
       AND owner_key = target_owner_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Preset % does not exist, is recycled, or is not in the shared namespace', target_preset_id;
    END IF;
  ELSE
    SELECT *
      INTO preset_row
      FROM public.presets_v2
     WHERE deleted_at IS NULL
       AND owner_key = target_owner_key
       AND type = target_type
       AND COALESCE(scope, '') = COALESCE(target_scope, '')
       AND name_key = lower(btrim(target_name))
     ORDER BY updated_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF FOUND THEN
    UPDATE public.presets_v2
       SET owner_key = target_owner_key,
           owner_user_id = NULL,
           type = target_type,
           scope = target_scope,
           name = target_name,
           author = COALESCE(NULLIF(identity_payload->>'author', ''), author),
           library = COALESCE(NULLIF(identity_payload->>'library', '')::public.preset_library_v2, library),
           creator = identity_payload->>'creator',
           description = identity_payload->>'description',
           tags = target_tags,
           visibility = target_visibility,
           family_name = identity_payload->>'family_name',
           variant_name = identity_payload->>'variant_name',
           variant_rank = NULLIF(identity_payload->>'variant_rank', '')::INTEGER,
           forked_from = NULLIF(identity_payload->>'forked_from', '')::UUID,
           rating = NULLIF(identity_payload->>'rating', '')::SMALLINT
     WHERE id = preset_row.id
     RETURNING * INTO preset_row;
  ELSE
    INSERT INTO public.presets_v2(
      owner_key,
      owner_user_id,
      type,
      scope,
      name,
      author,
      library,
      creator,
      description,
      tags,
      visibility,
      family_name,
      variant_name,
      variant_rank,
      forked_from,
      rating
    )
    VALUES (
      target_owner_key,
      NULL,
      target_type,
      target_scope,
      target_name,
      COALESCE(NULLIF(identity_payload->>'author', ''), 'user'),
      COALESCE(NULLIF(identity_payload->>'library', '')::public.preset_library_v2, 'cloud'::public.preset_library_v2),
      identity_payload->>'creator',
      identity_payload->>'description',
      target_tags,
      target_visibility,
      identity_payload->>'family_name',
      identity_payload->>'variant_name',
      NULLIF(identity_payload->>'variant_rank', '')::INTEGER,
      NULLIF(identity_payload->>'forked_from', '')::UUID,
      NULLIF(identity_payload->>'rating', '')::SMALLINT
    )
    RETURNING * INTO preset_row;
  END IF;

  PERFORM public.kessho_assert_preset_payload_hashes_exist(ARRAY[
    NULLIF(version_payload->>'override_hash', ''),
    NULLIF(version_payload->>'metadata_hash', ''),
    NULLIF(version_payload->>'patch_from_prev_hash', ''),
    NULLIF(version_payload->>'resolved_hash', '')
  ]);

  INSERT INTO public.preset_versions_v2(
    preset_id,
    version_no,
    created_by,
    parent_version_id,
    storage_mode,
    note,
    override_hash,
    metadata_hash,
    patch_from_prev_hash,
    resolved_hash,
    is_checkpoint,
    created_at
  )
  VALUES (
    preset_row.id,
    target_version_no,
    caller_id,
    NULLIF(version_payload->>'parent_version_id', '')::UUID,
    COALESCE(NULLIF(version_payload->>'storage_mode', '')::public.preset_storage_mode_v2, 'patch'::public.preset_storage_mode_v2),
    COALESCE(version_payload->>'note', ''),
    NULLIF(version_payload->>'override_hash', ''),
    NULLIF(version_payload->>'metadata_hash', ''),
    NULLIF(version_payload->>'patch_from_prev_hash', ''),
    NULLIF(version_payload->>'resolved_hash', ''),
    COALESCE((version_payload->>'is_checkpoint')::BOOLEAN, FALSE),
    version_created_at
  )
  RETURNING * INTO version_row;

  FOR ref_row IN SELECT value FROM jsonb_array_elements(refs_payload)
  LOOP
    ref_target_id := NULLIF(ref_row->>'target_preset_id', '')::UUID;

    IF NULLIF(ref_row->>'ref_slot', '') IS NULL THEN
      RAISE EXCEPTION 'Preset ref_slot is required';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.presets_v2 target
       WHERE target.id = ref_target_id
         AND target.deleted_at IS NULL
         AND target.owner_key = target_owner_key
    ) THEN
      RAISE EXCEPTION 'Preset ref target % does not exist, is recycled, or is not shared', ref_row->>'target_preset_id';
    END IF;

    PERFORM public.kessho_assert_preset_payload_hashes_exist(ARRAY[
      NULLIF(ref_row->>'override_hash', '')
    ]);

    INSERT INTO public.preset_version_refs_v2(
      version_id,
      ref_slot,
      target_preset_id,
      target_version_no,
      follow_latest,
      override_hash,
      created_at
    )
    VALUES (
      version_row.id,
      ref_row->>'ref_slot',
      ref_target_id,
      NULL,
      TRUE,
      NULLIF(ref_row->>'override_hash', ''),
      COALESCE(NULLIF(ref_row->>'created_at', '')::TIMESTAMPTZ, version_created_at)
    );
  END LOOP;

  WITH ranked_versions AS (
    SELECT
      id,
      row_number() OVER (PARTITION BY preset_id ORDER BY version_no DESC, created_at DESC) AS version_rank
    FROM public.preset_versions_v2
    WHERE preset_id = preset_row.id
  ),
  stale_versions AS (
    SELECT id
    FROM ranked_versions
    WHERE version_rank > 5
  )
  DELETE FROM public.preset_versions_v2 version
  USING stale_versions
  WHERE version.id = stale_versions.id;

  RETURN jsonb_build_object(
    'preset', to_jsonb(preset_row),
    'version', to_jsonb(version_row)
  );
END;
$$;

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
      SELECT p.id, p.latest_resolved_hash, p.latest_metadata_hash
        FROM public.presets_v2 p
       WHERE p.deleted_at IS NULL
         AND (
           p.visibility IN ('public', 'featured')
           OR p.owner_key = 'public'
           OR p.owner_user_id = caller_id
         )
    ),
    visible_versions AS (
      SELECT v.*
        FROM public.preset_versions_v2 v
        JOIN visible_presets p ON p.id = v.preset_id
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
      SELECT r.override_hash
        FROM public.preset_version_refs_v2 r
        JOIN visible_versions v ON v.id = r.version_id
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
    FROM public.presets_v2 p
   WHERE p.id = target_preset_id
     AND p.deleted_at IS NULL
     AND (
       p.visibility IN ('public', 'featured')
       OR p.owner_key = 'public'
       OR p.owner_user_id = caller_id
     );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
    INTO version_row
    FROM public.preset_versions_v2 v
   WHERE v.id = preset_row.latest_version_id
      OR (preset_row.latest_version_id IS NULL AND v.preset_id = preset_row.id)
   ORDER BY v.version_no DESC, v.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'preset', to_jsonb(preset_row),
    'latest_version', to_jsonb(version_row),
    'refs', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ref_slot)
        FROM public.preset_version_refs_v2 r
       WHERE r.version_id = version_row.id
    ), '[]'::jsonb),
    'target_presets', COALESCE((
      SELECT jsonb_agg(to_jsonb(target) ORDER BY target.name)
        FROM public.preset_version_refs_v2 r
        JOIN public.presets_v2 target ON target.id = r.target_preset_id
       WHERE r.version_id = version_row.id
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
        SELECT r.override_hash
          FROM public.preset_version_refs_v2 r
         WHERE r.version_id = version_row.id
        UNION
        SELECT target.latest_resolved_hash
          FROM public.preset_version_refs_v2 r
          JOIN public.presets_v2 target ON target.id = r.target_preset_id
         WHERE r.version_id = version_row.id
        UNION
        SELECT target.latest_metadata_hash
          FROM public.preset_version_refs_v2 r
          JOIN public.presets_v2 target ON target.id = r.target_preset_id
         WHERE r.version_id = version_row.id
      ) hashes(hash)
      WHERE hash IS NOT NULL
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_lookup_preset_id_v2(
  target_type TEXT,
  target_name TEXT,
  target_scope TEXT DEFAULT NULL,
  target_resolved_hash TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  found_id UUID;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to look up preset ids';
  END IF;

  IF NULLIF(target_type, '') IS NULL
     AND NULLIF(target_name, '') IS NULL
     AND NULLIF(target_resolved_hash, '') IS NULL THEN
    RAISE EXCEPTION 'A constrained preset id lookup filter is required';
  END IF;

  SELECT p.id
    INTO found_id
    FROM public.presets_v2 p
   WHERE p.deleted_at IS NULL
     AND (
       p.visibility IN ('public', 'featured')
       OR p.owner_key = 'public'
       OR p.owner_user_id = caller_id
     )
     AND (NULLIF(target_type, '') IS NULL OR p.type::TEXT = target_type)
     AND (NULLIF(target_name, '') IS NULL OR p.name_key = lower(btrim(target_name)))
     AND (
       (target_scope IS NULL AND p.scope IS NULL)
       OR (target_scope IS NOT NULL AND p.scope = target_scope)
     )
     AND (
       NULLIF(target_resolved_hash, '') IS NULL
       OR p.latest_resolved_hash = target_resolved_hash
       OR EXISTS (
         SELECT 1
           FROM public.preset_versions_v2 v
          WHERE v.preset_id = p.id
            AND v.resolved_hash = target_resolved_hash
       )
     )
   ORDER BY
     CASE WHEN p.owner_user_id = caller_id THEN 0 WHEN p.owner_key = 'public' THEN 1 ELSE 2 END,
     p.latest_version_no DESC,
     p.updated_at DESC,
     p.id DESC
   LIMIT 1;

  RETURN found_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_card_v2(target_preset_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  preset_row public.presets_v2%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to load preset cards';
  END IF;

  SELECT *
    INTO preset_row
    FROM public.presets_v2 p
   WHERE p.id = target_preset_id
     AND p.deleted_at IS NULL
     AND (
       p.visibility IN ('public', 'featured')
       OR p.owner_key = 'public'
       OR p.owner_user_id = caller_id
     );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', preset_row.id,
    'type', preset_row.type,
    'scope', preset_row.scope,
    'name', preset_row.name,
    'author', preset_row.author,
    'library', preset_row.library,
    'creator', preset_row.creator,
    'description', preset_row.description,
    'visibility', preset_row.visibility,
    'latest_version_no', preset_row.latest_version_no,
    'latest_resolved_hash', preset_row.latest_resolved_hash,
    'latest_metadata_hash', preset_row.latest_metadata_hash,
    'play_count', preset_row.play_count,
    'created_at', preset_row.created_at,
    'updated_at', preset_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_exists_preset_logical_key_v2(
  target_type TEXT,
  target_name TEXT,
  target_scope TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to check preset existence';
  END IF;

  IF NULLIF(target_type, '') IS NULL OR NULLIF(target_name, '') IS NULL THEN
    RAISE EXCEPTION 'Preset type and name are required';
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.presets_v2 p
     WHERE p.deleted_at IS NULL
       AND p.type::TEXT = target_type
       AND p.name_key = lower(btrim(target_name))
       AND (
         (target_scope IS NULL AND p.scope IS NULL)
         OR (target_scope IS NOT NULL AND p.scope = target_scope)
       )
       AND (
         p.visibility IN ('public', 'featured')
         OR p.owner_key = 'public'
         OR p.owner_user_id = caller_id
       )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_rename_legacy_preset(
  target_preset_id UUID,
  rename_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_row public.presets%ROWTYPE;
  new_name TEXT := NULLIF(rename_payload->>'name', '');
  target_tags TEXT[] := NULL;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to rename legacy presets';
  END IF;

  IF new_name IS NULL THEN
    RAISE EXCEPTION 'Preset name is required';
  END IF;

  SELECT *
    INTO target_row
    FROM public.presets
   WHERE id = target_preset_id
     AND deleted_at IS NULL
     AND (user_id = caller_id OR user_id IS NULL)
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.presets conflict
     WHERE conflict.id <> target_row.id
       AND conflict.deleted_at IS NULL
       AND conflict.type = target_row.type
       AND COALESCE(conflict.scope, '') = COALESCE(target_row.scope, '')
       AND lower(btrim(conflict.name)) = lower(btrim(new_name))
       AND (conflict.user_id = caller_id OR conflict.user_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'A preset named "%" already exists', new_name;
  END IF;

  IF rename_payload ? 'tags' THEN
    target_tags := ARRAY(SELECT jsonb_array_elements_text(COALESCE(rename_payload->'tags', '[]'::jsonb)));
  END IF;

  UPDATE public.presets
     SET name = new_name,
         creator = COALESCE(rename_payload->>'creator', creator),
         description = COALESCE(rename_payload->>'description', description),
         visibility = COALESCE(NULLIF(rename_payload->>'visibility', ''), visibility),
         family_name = COALESCE(rename_payload->>'family_name', family_name),
         variant_name = COALESCE(rename_payload->>'variant_name', variant_name),
         variant_rank = COALESCE(NULLIF(rename_payload->>'variant_rank', '')::INTEGER, variant_rank),
         rating = COALESCE(NULLIF(rename_payload->>'rating', '')::SMALLINT, rating),
         tags = COALESCE(target_tags, tags),
         updated_at = now()
   WHERE id = target_row.id
   RETURNING * INTO target_row;

  RETURN to_jsonb(target_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_rename_preset_v2(
  target_preset_id UUID,
  rename_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_row public.presets_v2%ROWTYPE;
  new_name TEXT := NULLIF(rename_payload->>'name', '');
  target_tags TEXT[] := NULL;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to rename presets';
  END IF;

  IF new_name IS NULL THEN
    RAISE EXCEPTION 'Preset name is required';
  END IF;

  SELECT *
    INTO target_row
    FROM public.presets_v2
   WHERE id = target_preset_id
     AND deleted_at IS NULL
     AND (owner_key = 'public' OR owner_user_id = caller_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.presets_v2 conflict
     WHERE conflict.id <> target_row.id
       AND conflict.deleted_at IS NULL
       AND conflict.owner_key = target_row.owner_key
       AND conflict.type = target_row.type
       AND COALESCE(conflict.scope, '') = COALESCE(target_row.scope, '')
       AND conflict.name_key = lower(btrim(new_name))
  ) THEN
    RAISE EXCEPTION 'A preset named "%" already exists', new_name;
  END IF;

  IF rename_payload ? 'tags' THEN
    target_tags := ARRAY(SELECT jsonb_array_elements_text(COALESCE(rename_payload->'tags', '[]'::jsonb)));
  END IF;

  UPDATE public.presets_v2
     SET name = new_name,
         creator = COALESCE(rename_payload->>'creator', creator),
         description = COALESCE(rename_payload->>'description', description),
         visibility = COALESCE(NULLIF(rename_payload->>'visibility', '')::public.preset_visibility_v2, visibility),
         family_name = COALESCE(rename_payload->>'family_name', family_name),
         variant_name = COALESCE(rename_payload->>'variant_name', variant_name),
         variant_rank = COALESCE(NULLIF(rename_payload->>'variant_rank', '')::INTEGER, variant_rank),
         rating = COALESCE(NULLIF(rename_payload->>'rating', '')::SMALLINT, rating),
         tags = COALESCE(target_tags, tags)
   WHERE id = target_row.id
   RETURNING * INTO target_row;

  RETURN to_jsonb(target_row);
END;
$$;

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
  orphan_payload_count INTEGER := 0;
  orphan_payload_bytes BIGINT := 0;
  deleted_preset_count INTEGER := 0;
  deleted_version_count INTEGER := 0;
  deleted_ref_count INTEGER := 0;
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
      'orphan_payload_rows', 0,
      'orphan_payload_bytes', 0
    );
  END IF;

  DROP TABLE IF EXISTS purge_candidate_presets;

  CREATE TEMP TABLE purge_candidate_presets ON COMMIT DROP AS
  SELECT p.id
    FROM public.presets_v2 p
   WHERE p.deleted_at IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.preset_version_refs_v2 active_ref
        WHERE active_ref.target_preset_id = p.id
     )
     AND (
       (
         p.visibility = 'private'
         AND p.deleted_at <= now() - private_retention
         AND NOT ('system' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[])))
         AND NOT ('factory' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[])))
       )
       OR (
         p.visibility IN ('public', 'featured')
         AND p.visibility <> 'featured'
         AND p.deleted_at <= now() - public_retention
         AND NOT ('system' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[])))
         AND NOT ('factory' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[])))
       )
     )
   ORDER BY p.deleted_at ASC
   LIMIT safe_limit;

  SELECT count(*) INTO candidate_preset_count FROM purge_candidate_presets;

  SELECT count(*)
    INTO candidate_version_count
    FROM public.preset_versions_v2 v
    JOIN purge_candidate_presets p ON p.id = v.preset_id;

  SELECT count(*)
    INTO candidate_ref_count
    FROM public.preset_version_refs_v2 r
    JOIN public.preset_versions_v2 v ON v.id = r.version_id
    JOIN purge_candidate_presets p ON p.id = v.preset_id;

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
      'orphan_payload_rows', orphan_payload_count,
      'orphan_payload_bytes', orphan_payload_bytes,
      'deleted_presets', 0,
      'deleted_versions', 0,
      'deleted_refs', 0,
      'deleted_payload_rows', 0,
      'deleted_payload_bytes', 0
    );
  END IF;

  WITH deleted AS (
    DELETE FROM public.preset_version_refs_v2 r
    USING public.preset_versions_v2 v, purge_candidate_presets p
    WHERE r.version_id = v.id
      AND v.preset_id = p.id
    RETURNING r.version_id
  )
  SELECT count(*) INTO deleted_ref_count FROM deleted;

  WITH deleted AS (
    DELETE FROM public.preset_versions_v2 v
    USING purge_candidate_presets p
    WHERE v.preset_id = p.id
    RETURNING v.id
  )
  SELECT count(*) INTO deleted_version_count FROM deleted;

  WITH deleted AS (
    DELETE FROM public.presets_v2 p
    USING purge_candidate_presets c
    WHERE p.id = c.id
    RETURNING p.id
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
    'orphan_payload_rows', orphan_payload_count,
    'orphan_payload_bytes', orphan_payload_bytes,
    'deleted_presets', deleted_preset_count,
    'deleted_versions', deleted_version_count,
    'deleted_refs', deleted_ref_count,
    'deleted_payload_rows', deleted_payload_count,
    'deleted_payload_bytes', deleted_payload_bytes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_plays(preset_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to increment preset plays';
  END IF;

  UPDATE public.presets
     SET plays = COALESCE(plays, 0) + 1
   WHERE id = preset_id;

  UPDATE public.presets_v2
     SET play_count = COALESCE(play_count, 0) + 1
   WHERE id = preset_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_assert_payload_hash_kind_consistency() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_canonical_jsonb_text(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_assert_payload_hash_matches(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_assert_preset_payload_hashes_exist(TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_put_payload_v2(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_get_missing_preset_payloads_v2(TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_latest_manifest_v2(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_card_v2(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_rename_legacy_preset(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_rename_preset_v2(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kessho_purge_deleted_presets_v2(BOOLEAN, INTERVAL, INTERVAL, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_plays(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_missing_preset_payloads_v2(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_latest_manifest_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_card_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_rename_legacy_preset(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_rename_preset_v2(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_purge_deleted_presets_v2(BOOLEAN, INTERVAL, INTERVAL, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_plays(UUID) TO authenticated;

COMMENT ON FUNCTION public.kessho_get_preset_latest_manifest_v2(UUID) IS
  'Authenticated latest-only preset manifest API for play/open paths. Payload bodies are fetched separately by missing hash.';

COMMENT ON FUNCTION public.kessho_get_missing_preset_payloads_v2(TEXT[]) IS
  'Authenticated narrow payload API. Accepts at most 100 hash-like keys and returns only visible requested payload bodies.';

COMMENT ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) IS
  'Authenticated narrow preset lookup API returning only the matching preset id for constrained hot paths.';

COMMENT ON FUNCTION public.kessho_get_preset_card_v2(UUID) IS
  'Authenticated narrow preset card API returning summary fields without version/ref/payload bodies.';

COMMENT ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) IS
  'Authenticated narrow existence API for logical-key conflict checks.';

COMMENT ON FUNCTION public.kessho_purge_deleted_presets_v2(BOOLEAN, INTERVAL, INTERVAL, INTEGER) IS
  'Retention-based hard purge for recycled V2 presets plus bounded orphan payload cleanup.';

NOTIFY pgrst, 'reload schema';

COMMIT;
