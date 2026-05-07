/**
 * Kessho Spectral Freeze — C API Header
 *
 * Shared ABI for the standalone WASM worklet and the KesshoCore module facade.
 */

#ifndef KESSHO_SPECTRAL_FREEZE_H
#define KESSHO_SPECTRAL_FREEZE_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct KesshoSpectralFreezeInstance KesshoSpectralFreezeInstance;

#define KESSHO_SPECTRAL_FREEZE_MAX_BLOCK_SIZE 128

int spectral_freeze_init(float sample_rate);
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

KesshoSpectralFreezeInstance* spectral_freeze_instance_create(float sample_rate);
void spectral_freeze_instance_destroy(KesshoSpectralFreezeInstance* instance);
int spectral_freeze_instance_reset(KesshoSpectralFreezeInstance* instance, float sample_rate);

float* spectral_freeze_instance_get_input_ptr(KesshoSpectralFreezeInstance* instance);
float* spectral_freeze_instance_get_output_ptr(KesshoSpectralFreezeInstance* instance);

void spectral_freeze_instance_process_block(KesshoSpectralFreezeInstance* instance, int block_size);
void spectral_freeze_instance_set_freeze(KesshoSpectralFreezeInstance* instance, int active);
void spectral_freeze_instance_set_slushy(KesshoSpectralFreezeInstance* instance, int slushy);
void spectral_freeze_instance_set_speed(KesshoSpectralFreezeInstance* instance, float speed);
void spectral_freeze_instance_set_mix(KesshoSpectralFreezeInstance* instance, float mix);
void spectral_freeze_instance_set_decay(KesshoSpectralFreezeInstance* instance, float decay);
void spectral_freeze_instance_set_phase_jitter(KesshoSpectralFreezeInstance* instance, float jitter);

#ifdef __cplusplus
}
#endif

#endif // KESSHO_SPECTRAL_FREEZE_H
