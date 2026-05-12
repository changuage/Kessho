#include "KesshoProductEngineInternal.h"

  void KesshoProductEngine::renderSampleVoices(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  for (uint32_t i = 0; i < frames; ++i) {
    const uint32_t frame = start + i;
    for (Voice& voice : voices) {
      if (!voice.active) {
        continue;
      }
      float value_l = 0.0f;
      float value_r = 0.0f;
      renderVoiceSample(voice, value_l, value_r);
      const SourceState& source = sources[voice.source_id - 1u];
      const float pan_l = voice.pan <= 0.0f ? 1.0f : 1.0f - voice.pan * 0.5f;
      const float pan_r = voice.pan >= 0.0f ? 1.0f : 1.0f + voice.pan * 0.5f;
      const uint32_t sidechain_target = sidechainTargetForSource(voice.source_id);
      const float duck_gain = sidechainGain(sidechain_target, frame);
      float send_left = value_l * source.dry_gain * pan_l;
      float send_right = value_r * source.dry_gain * pan_r;
      processVoicePostChain(voice, send_left, send_right);
      const float left = send_left * duck_gain;
      const float right = send_right * duck_gain;
      out_l[frame] += left;
      out_r[frame] += right;
      if (voice.source_id < kStemCount) {
        stem_l[voice.source_id][frame] += left;
        stem_r[voice.source_id][frame] += right;
      }
      reverb_bus_l[frame] += send_left * source.reverb_send;
      reverb_bus_r[frame] += send_right * source.reverb_send;
      delay_a_bus_l[frame] += send_left * source.delay_a_send;
      delay_a_bus_r[frame] += send_right * source.delay_a_send;
      delay_b_bus_l[frame] += send_left * source.delay_b_send;
      delay_b_bus_r[frame] += send_right * source.delay_b_send;
      granular_bus_l[frame] += send_left * source.granular_send;
      granular_bus_r[frame] += send_right * source.granular_send;
    }
  }
}

  void KesshoProductEngine::renderSegment(float* out_l, float* out_r, uint32_t start, uint32_t frames) {
  renderSidechainGains(start, frames);
  renderProductModules(out_l, out_r, start, frames);
  renderSampleVoices(out_l, out_r, start, frames);
  renderFx(out_l, out_r, start, frames);
}

  void KesshoProductEngine::applyMaster(float* out_l, float* out_r, uint32_t frames) {
  renderSpectralFreeze(out_l, out_r, frames);
  renderDynamics(out_l, out_r, frames);
  const float ceiling = master_limiter_ceiling_gain;
  float master_input_peak = 0.0f;
  float master_output_peak = 0.0f;
  float master_true_peak = 0.0f;
  double master_output_sum_squares = 0.0;
  double master_loudness_energy = 0.0;
  float limiter_gain_reduction_db = 0.0f;
  for (uint32_t i = 0; i < frames; ++i) {
    const float pre_limiter_l = out_l[i] * master_gain;
    const float pre_limiter_r = out_r[i] * master_gain;
    const float input_peak = std::max(std::fabs(pre_limiter_l), std::fabs(pre_limiter_r));
    master_input_peak = std::max(master_input_peak, input_peak);
    if (input_peak > ceiling && ceiling > 0.0f) {
      limiter_gain_reduction_db = std::max(
          limiter_gain_reduction_db,
          20.0f * std::log10(input_peak / ceiling));
    }
    out_l[i] = clampFloat(pre_limiter_l, -ceiling, ceiling);
    out_r[i] = clampFloat(pre_limiter_r, -ceiling, ceiling);
    const float true_peak_l = std::max(
        std::fabs(out_l[i]),
        std::fabs((out_l[i] + master_true_peak_prev_l) * 0.5f));
    const float true_peak_r = std::max(
        std::fabs(out_r[i]),
        std::fabs((out_r[i] + master_true_peak_prev_r) * 0.5f));
    master_true_peak = std::max(master_true_peak, true_peak_l);
    master_true_peak = std::max(master_true_peak, true_peak_r);
    master_true_peak_prev_l = out_l[i];
    master_true_peak_prev_r = out_r[i];
    master_output_peak = std::max(master_output_peak, std::fabs(out_l[i]));
    master_output_peak = std::max(master_output_peak, std::fabs(out_r[i]));
    master_output_sum_squares += static_cast<double>(out_l[i]) * static_cast<double>(out_l[i]);
    master_output_sum_squares += static_cast<double>(out_r[i]) * static_cast<double>(out_r[i]);
    master_loudness_energy += static_cast<double>(out_l[i]) * static_cast<double>(out_l[i]);
    master_loudness_energy += static_cast<double>(out_r[i]) * static_cast<double>(out_r[i]);
    stem_l[KESSHO_PRODUCT_STEM_MASTER][i] = out_l[i];
    stem_r[KESSHO_PRODUCT_STEM_MASTER][i] = out_r[i];
  }
  master_integrated_loudness_energy += master_loudness_energy;
  master_integrated_loudness_frames += frames;
  const double integrated_mean_square = master_integrated_loudness_frames == 0u
      ? 0.0
      : master_integrated_loudness_energy / static_cast<double>(master_integrated_loudness_frames);
  telemetry.master_input_peak = master_input_peak;
  telemetry.master_output_peak = master_output_peak;
  telemetry.master_output_rms = frames == 0u
      ? 0.0f
      : static_cast<float>(std::sqrt(master_output_sum_squares / static_cast<double>(frames * 2u)));
  telemetry.master_limiter_gain_reduction_db = limiter_gain_reduction_db;
  telemetry.master_saturation_drive = master_saturation_drive;
  telemetry.dynamics_saturation_drive = fx.dynamics_saturation_drive;
  telemetry.master_true_peak = master_true_peak;
  telemetry.master_true_peak_dbtp = gainToDb(master_true_peak);
  telemetry.master_integrated_lufs = integrated_mean_square <= 0.000000000001
      ? kProductTelemetrySilenceDb
      : static_cast<float>(-0.691 + 10.0 * std::log10(integrated_mean_square));
}

  void KesshoProductEngine::clearOutput(float* out_l, float* out_r, uint32_t frames) {
  for (uint32_t i = 0; i < frames; ++i) {
    out_l[i] = 0.0f;
    out_r[i] = 0.0f;
  }
  const uint32_t stem_frames = std::min<uint32_t>(frames, kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES);
  for (uint32_t stem = 0; stem < kStemCount; ++stem) {
    for (uint32_t i = 0; i < stem_frames; ++i) {
      stem_l[stem][i] = 0.0f;
      stem_r[stem][i] = 0.0f;
    }
  }
  for (uint32_t i = 0; i < stem_frames; ++i) {
    reverb_bus_l[i] = 0.0f;
    reverb_bus_r[i] = 0.0f;
    delay_a_bus_l[i] = 0.0f;
    delay_a_bus_r[i] = 0.0f;
    delay_b_bus_l[i] = 0.0f;
    delay_b_bus_r[i] = 0.0f;
    granular_bus_l[i] = 0.0f;
    granular_bus_r[i] = 0.0f;
  }
  last_stem_frames = stem_frames;
}

  void KesshoProductEngine::render(float* out_l, float* out_r, uint32_t frames) {
  if (out_l == nullptr || out_r == nullptr || frames == 0u) {
    return;
  }
  if (frames > max_block_size || frames > kessho::product::generated::KESSHO_PRODUCT_MAX_STEM_FRAMES) {
    clearOutput(out_l, out_r, std::min<uint32_t>(frames, max_block_size));
    telemetry.last_error_code = KESSHO_PRODUCT_ERROR_RENDER_BLOCK_TOO_LARGE;
    return;
  }

  clearOutput(out_l, out_r, frames);
  sortControlEvents();

  uint32_t control_index = 0;
  while (control_index < control_event_count && control_events[control_index].event.sample_offset == 0u) {
    applyControlEvent(control_events[control_index].event);
    ++control_index;
  }

  advanceModulationRanges(frames);
  ensureSoundscapeVoice();
  generateSequencerEvents(frames);
  uint32_t sequencer_index = 0;

  uint32_t cursor = 0;
  while (cursor < frames) {
    while (control_index < control_event_count && control_events[control_index].event.sample_offset == cursor) {
      applyControlEvent(control_events[control_index].event);
      ++control_index;
    }
    while (sequencer_index < sequencer_events.count && sequencer_events.events[sequencer_index].sample_offset == cursor) {
      triggerSequencerEvent(sequencer_events.events[sequencer_index]);
      ++sequencer_index;
    }

    uint32_t next_event_offset = frames;
    if (control_index < control_event_count) {
      next_event_offset = std::min(next_event_offset, control_events[control_index].event.sample_offset);
    }
    if (sequencer_index < sequencer_events.count) {
      next_event_offset = std::min(next_event_offset, sequencer_events.events[sequencer_index].sample_offset);
    }
    if (next_event_offset <= cursor) {
      next_event_offset = cursor + 1u;
    }
    const uint32_t segment_frames = next_event_offset - cursor;
    renderSegment(out_l, out_r, cursor, segment_frames);
    if (transport.running) {
      transport.sample_frame += segment_frames;
    }
    cursor = next_event_offset;
  }

  applyMaster(out_l, out_r, frames);
  compactControlEvents(frames, control_index);
  advanceJourney(frames);
  updateTelemetry(frames);
}
