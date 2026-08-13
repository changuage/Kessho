BEGIN;

ALTER TABLE public.preset_version_content_refs_v2
  DROP CONSTRAINT preset_version_content_refs_v2_type_check,
  DROP CONSTRAINT preset_version_content_refs_v2_slot_type_check;

ALTER TABLE public.preset_version_content_refs_v2
  ADD CONSTRAINT preset_version_content_refs_v2_type_check CHECK (content_type IN (
    'sequencerTrigger', 'sequencerSubLane', 'sequencerLaneControl',
    'granularVoice', 'granularSelection', 'padVoice', 'lead4opfmPatch', 'sampleVoice', 'dynamicsEq', 'saturator',
    'drumSubVoice', 'drumKickVoice', 'drumClickVoice', 'drumBeepHiVoice',
    'drumBeepLoVoice', 'drumNoiseVoice', 'drumMembraneVoice', 'waterEndpoint',
    'insectsVoice', 'harmonyChordBank', 'harmonySequenceBank', 'harmonyContext',
    'sequencerArrangement', 'mixRouting', 'parameterBehaviorMap', 'scatterConfig'
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
  );

DO $$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.kessho_save_preset_v2(jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) INTO function_definition;

  IF function_definition NOT LIKE '%''saturator''%' THEN
    function_definition := replace(
      function_definition,
      E'''lead4opfmPatch''\n    )',
      E'''lead4opfmPatch'',\n      ''saturator''\n    )'
    );
    IF function_definition NOT LIKE '%''saturator''%' THEN
      RAISE EXCEPTION 'Could not extend kessho_save_preset_v2 Saturator content allowlist';
    END IF;
    EXECUTE function_definition;
  END IF;
END;
$$;

COMMIT;
