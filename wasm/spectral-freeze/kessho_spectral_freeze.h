/**
 * Kessho Spectral Freeze — C API Header
 *
 * Shared ABI for the standalone WASM worklet and the KesshoCore module facade.
 */

#ifndef KESSHO_SPECTRAL_FREEZE_H
#define KESSHO_SPECTRAL_FREEZE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct KesshoSpectralFreezeInstance KesshoSpectralFreezeInstance;

#define KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE 128
#define KESSHO_SPECTRAL_FREEZE_MODE_SOLID 0
#define KESSHO_SPECTRAL_FREEZE_MODE_SLUSHY 1
#define KESSHO_SPECTRAL_FREEZE_MODE_STRETCH 2
#define KESSHO_SPECTRAL_FREEZE_MODE_LIVING_STRETCH 3
#define KESSHO_SPECTRAL_FREEZE_DIRECTION_FORWARD 0
#define KESSHO_SPECTRAL_FREEZE_DIRECTION_REVERSE 1
#define KESSHO_SPECTRAL_FREEZE_DIRECTION_PING_PONG 2

int spectral_freeze_init(float sample_rate);
void spectral_freeze_reset(void);
void spectral_freeze_destroy(void);

float* spectral_freeze_get_input_ptr(void);
float* spectral_freeze_get_output_ptr(void);

void spectral_freeze_process_block(int block_size);
void spectral_freeze_set_freeze(int active);
void spectral_freeze_set_slushy(int slushy);
void spectral_freeze_set_speed(float speed);
void spectral_freeze_set_mix(float mix);
void spectral_freeze_set_decay(float decay);
void spectral_freeze_set_phase_jitter(float jitter);
void spectral_freeze_set_mode(int mode);
void spectral_freeze_request_capture(uint32_t capture_serial);
void spectral_freeze_set_stretch_speed(float normalized_speed);
void spectral_freeze_set_direction(int direction);
void spectral_freeze_set_position(float position);
void spectral_freeze_set_refresh(float refresh);
void spectral_freeze_set_input_sensitivity(float sensitivity);
void spectral_freeze_set_diffusion(float diffusion);
void spectral_freeze_set_tone(float tone);
void spectral_freeze_set_width(float width);
void spectral_freeze_set_sustain(float sustain);

KesshoSpectralFreezeInstance* spectral_freeze_instance_create(float sample_rate);
void spectral_freeze_instance_destroy(KesshoSpectralFreezeInstance* instance);
int spectral_freeze_instance_reset(KesshoSpectralFreezeInstance* instance, float sample_rate);

float* spectral_freeze_instance_get_input_ptr(KesshoSpectralFreezeInstance* instance);
float* spectral_freeze_instance_get_output_ptr(KesshoSpectralFreezeInstance* instance);

void spectral_freeze_instance_process_block(KesshoSpectralFreezeInstance* instance, int block_size);
void spectral_freeze_instance_process_planar(
    KesshoSpectralFreezeInstance* instance,
    const float* input_l,
    const float* input_r,
    float* output_l,
    float* output_r,
    int frames);
void spectral_freeze_instance_set_params(
    KesshoSpectralFreezeInstance* instance,
    int active,
    int mode,
    uint32_t capture_serial,
    float stretch_speed,
    int direction,
    float position,
    float refresh,
    float input_sensitivity,
    float diffusion,
    float tone,
    float width,
    float sustain,
    float mix,
    float transition_seconds);
void spectral_freeze_instance_set_freeze(KesshoSpectralFreezeInstance* instance, int active);
void spectral_freeze_instance_set_slushy(KesshoSpectralFreezeInstance* instance, int slushy);
void spectral_freeze_instance_set_speed(KesshoSpectralFreezeInstance* instance, float speed);
void spectral_freeze_instance_set_mix(KesshoSpectralFreezeInstance* instance, float mix);
void spectral_freeze_instance_set_decay(KesshoSpectralFreezeInstance* instance, float decay);
void spectral_freeze_instance_set_phase_jitter(KesshoSpectralFreezeInstance* instance, float jitter);
void spectral_freeze_instance_set_mode(KesshoSpectralFreezeInstance* instance, int mode);
void spectral_freeze_instance_request_capture(KesshoSpectralFreezeInstance* instance, uint32_t capture_serial);
void spectral_freeze_instance_set_stretch_speed(KesshoSpectralFreezeInstance* instance, float normalized_speed);
void spectral_freeze_instance_set_direction(KesshoSpectralFreezeInstance* instance, int direction);
void spectral_freeze_instance_set_position(KesshoSpectralFreezeInstance* instance, float position);
void spectral_freeze_instance_set_refresh(KesshoSpectralFreezeInstance* instance, float refresh);
void spectral_freeze_instance_set_input_sensitivity(KesshoSpectralFreezeInstance* instance, float sensitivity);
void spectral_freeze_instance_set_diffusion(KesshoSpectralFreezeInstance* instance, float diffusion);
void spectral_freeze_instance_set_tone(KesshoSpectralFreezeInstance* instance, float tone);
void spectral_freeze_instance_set_width(KesshoSpectralFreezeInstance* instance, float width);
void spectral_freeze_instance_set_sustain(KesshoSpectralFreezeInstance* instance, float sustain);
void spectral_freeze_instance_set_transition_seconds(KesshoSpectralFreezeInstance* instance, float seconds);

#ifdef __cplusplus
}
#endif

#endif // KESSHO_SPECTRAL_FREEZE_H
