BEGIN;

ALTER TABLE public.preset_version_content_refs_v2
  DROP CONSTRAINT preset_version_content_refs_v2_slot_type_check;

ALTER TABLE public.preset_version_content_refs_v2
  ADD CONSTRAINT preset_version_content_refs_v2_slot_type_check CHECK (
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
    OR (ref_slot ~ '^harmony\.program\.sequence-bank-(active|[ab])$' AND content_type = 'harmonySequenceBank')
    OR (ref_slot = 'harmony.program.context' AND content_type = 'harmonyContext')
    OR (ref_slot = 'sequencer.arrangement.content' AND content_type = 'sequencerArrangement')
    OR (ref_slot = 'mix.routing.content' AND content_type = 'mixRouting')
    OR (ref_slot ~ '^behavior\.scope\.[a-z0-9]+(-[a-z0-9]+)*\.content$' AND content_type = 'parameterBehaviorMap')
  );

COMMIT;
