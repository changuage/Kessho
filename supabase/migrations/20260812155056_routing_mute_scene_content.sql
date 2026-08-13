BEGIN;

-- Allow typed routing mute-scene nodes in the existing direct content-ref
-- graph. Keep the slot namespace bounded to the eight UI scene slots.
ALTER TABLE public.preset_version_content_refs_v2
  DROP CONSTRAINT preset_version_content_refs_v2_slot_check,
  DROP CONSTRAINT preset_version_content_refs_v2_type_check,
  DROP CONSTRAINT preset_version_content_refs_v2_slot_type_check;

ALTER TABLE public.preset_version_content_refs_v2
  ADD CONSTRAINT preset_version_content_refs_v2_slot_check CHECK (
    ref_slot ~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$'
    OR ref_slot ~ '^routing\.mute-group\.slot-[0-7]\.content$'
  ),
  ADD CONSTRAINT preset_version_content_refs_v2_type_check CHECK (content_type IN (
    'sequencerTrigger', 'sequencerSubLane', 'sequencerLaneControl',
    'granularVoice', 'granularSelection', 'padVoice', 'lead4opfmPatch', 'sampleVoice', 'dynamicsEq', 'saturator',
    'drumSubVoice', 'drumKickVoice', 'drumClickVoice', 'drumBeepHiVoice',
    'drumBeepLoVoice', 'drumNoiseVoice', 'drumMembraneVoice', 'waterEndpoint',
    'insectsVoice', 'harmonyChordBank', 'harmonySequenceBank', 'harmonyContext',
    'sequencerArrangement', 'mixRouting', 'parameterBehaviorMap', 'scatterConfig',
    'routingMuteScene'
  )),
  ADD CONSTRAINT preset_version_content_refs_v2_slot_type_check CHECK (
    (ref_slot ~ '^sequencer\.(synth|drum)\.[1-9][0-9]*\.trigger$' AND content_type = 'sequencerTrigger')
    OR (ref_slot ~ '^sequencer\.(synth|drum)\.[1-9][0-9]*\.(pitch|expression|morph|distance|nudge|slice|reverse)$' AND content_type = 'sequencerSubLane')
    OR (ref_slot ~ '^sequencer\.(synth|drum)\.[1-9][0-9]*\.control$' AND content_type = 'sequencerLaneControl')
    OR (ref_slot ~ '^granular\.voice\.[1-4]\.content$' AND content_type = 'granularVoice')
    OR (ref_slot ~ '^sample\.voice\.[1-2]\.content$' AND content_type = 'sampleVoice')
    OR (ref_slot ~ '^pad\.voice\.[1-2]\.content$' AND content_type = 'padVoice')
    OR (ref_slot ~ '^derived\.pad\.[1-2]\.endpoint-[ab]$' AND content_type = 'padVoice')
    OR (ref_slot ~ '^derived\.lead\.1\.endpoint-[ab]$' AND content_type = 'lead4opfmPatch')
    OR (ref_slot ~ '^derived\.lead\.2\.endpoint-[cd]$' AND content_type = 'lead4opfmPatch')
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
    OR (ref_slot = 'equalizer.content' AND content_type = 'dynamicsEq')
    OR (ref_slot ~ '^(dynamics|master)\.saturator\.content$' AND content_type = 'saturator')
    OR (ref_slot = 'saturator.content' AND content_type = 'saturator')
    OR (ref_slot ~ '^insects\.voice\.[1-2]\.content$' AND content_type = 'insectsVoice')
    OR (ref_slot ~ '^harmony\.program\.chord-bank-(active|[ab])$' AND content_type = 'harmonyChordBank')
    OR (ref_slot ~ '^harmony\.program\.sequence-bank-(active|[ab])$' AND content_type = 'harmonySequenceBank')
    OR (ref_slot = 'harmony.program.context' AND content_type = 'harmonyContext')
    OR (ref_slot = 'sequencer.arrangement.content' AND content_type = 'sequencerArrangement')
    OR (ref_slot = 'mix.routing.content' AND content_type = 'mixRouting')
    OR (ref_slot ~ '^behavior\.scope\.[a-z0-9]+(-[a-z0-9]+)*\.content$' AND content_type = 'parameterBehaviorMap')
    OR (ref_slot = 'scatter.config' AND content_type = 'scatterConfig')
    OR (ref_slot ~ '^routing\.mute-group\.slot-[0-7]\.content$' AND content_type = 'routingMuteScene')
  );

-- The RPC is SECURITY DEFINER and validates the type before inserting refs;
-- extend only its existing literal allowlist and preserve all other checks.
DO $$
DECLARE
  function_definition TEXT;
  replaced_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.kessho_save_preset_v2(jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) INTO function_definition;

  replaced_definition := function_definition;

  IF replaced_definition NOT LIKE '%''routingMuteScene''%' THEN
    replaced_definition := replace(
      replaced_definition,
      E'''saturator''\n    ) THEN',
      E'''saturator'',\n      ''routingMuteScene''\n    ) THEN'
    );
    IF replaced_definition = function_definition THEN
      replaced_definition := replace(
        replaced_definition,
        E'''scatterConfig''\n    ) THEN',
        E'''scatterConfig'',\n      ''routingMuteScene''\n    ) THEN'
      );
    END IF;
    IF replaced_definition = function_definition THEN
      replaced_definition := replace(
        replaced_definition,
        E'''lead4opfmPatch''\n    ) THEN',
        E'''lead4opfmPatch'',\n      ''routingMuteScene''\n    ) THEN'
      );
    END IF;
    IF replaced_definition = function_definition THEN
      RAISE EXCEPTION 'Could not extend kessho_save_preset_v2 routing mute-scene content allowlist';
    END IF;
  END IF;

  IF replaced_definition NOT LIKE '%slot-[0-7]%' THEN
    replaced_definition := replace(
      replaced_definition,
      E'IF content_ref_row->>''ref_slot'' !~ ''^[a-z][a-z0-9]*(\\.[a-z0-9]+)*\\.[a-z][a-z0-9]*(-[a-z0-9]+)*$'' THEN',
      E'IF content_ref_row->>''ref_slot'' !~ ''^[a-z][a-z0-9]*(\\.[a-z0-9]+)*\\.[a-z][a-z0-9]*(-[a-z0-9]+)*$''\n       AND content_ref_row->>''ref_slot'' !~ ''^routing\\.mute-group\\.slot-[0-7]\\.content$'' THEN'
    );
    IF replaced_definition = function_definition THEN
      RAISE EXCEPTION 'Could not extend kessho_save_preset_v2 routing mute-scene slot validation';
    END IF;
  END IF;

  IF replaced_definition <> function_definition THEN EXECUTE replaced_definition; END IF;
END;
$$;

COMMIT;
