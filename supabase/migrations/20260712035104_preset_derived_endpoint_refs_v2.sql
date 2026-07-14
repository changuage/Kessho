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
    OR (ref_slot ~ '^dynamics\.eq\.[1-2]\.content$' AND content_type = 'dynamicsEq')
    OR (ref_slot ~ '^insects\.voice\.[1-2]\.content$' AND content_type = 'insectsVoice')
    OR (ref_slot ~ '^harmony\.program\.chord-bank-[ab]$' AND content_type = 'harmonyChordBank')
    OR (ref_slot ~ '^harmony\.program\.sequence-bank-[ab]$' AND content_type = 'harmonySequenceBank')
    OR (ref_slot = 'harmony.program.context' AND content_type = 'harmonyContext')
    OR (ref_slot = 'sequencer.arrangement.content' AND content_type = 'sequencerArrangement')
    OR (ref_slot = 'mix.routing.content' AND content_type = 'mixRouting')
  );

COMMIT;
