#ifndef KESSHO_DYNAMICS_CHARACTER_H
#define KESSHO_DYNAMICS_CHARACTER_H

#ifdef __cplusplus
extern "C" {
#endif

#define KESSHO_DYNAMICS_CHARACTER_MAX_BLOCK_SIZE 128
#define KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT 82
#define KESSHO_DYNAMICS_CHARACTER_TELEMETRY_COUNT 10

typedef struct KesshoDynamicsCharacterInstance KesshoDynamicsCharacterInstance;

int dynamics_character_init(float sample_rate);
void dynamics_character_destroy(void);

float* dynamics_character_get_input_ptr(void);
float* dynamics_character_get_output_ptr(void);
float* dynamics_character_get_params_ptr(void);
float* dynamics_character_get_telemetry_ptr(void);

void dynamics_character_commit_params(void);
void dynamics_character_process_block(int block_size);

KesshoDynamicsCharacterInstance* dynamics_character_instance_create(float sample_rate);
void dynamics_character_instance_destroy(KesshoDynamicsCharacterInstance* instance);
int dynamics_character_instance_reset(KesshoDynamicsCharacterInstance* instance, float sample_rate);

float* dynamics_character_instance_get_input_ptr(KesshoDynamicsCharacterInstance* instance);
float* dynamics_character_instance_get_output_ptr(KesshoDynamicsCharacterInstance* instance);
float* dynamics_character_instance_get_params_ptr(KesshoDynamicsCharacterInstance* instance);
float* dynamics_character_instance_get_telemetry_ptr(KesshoDynamicsCharacterInstance* instance);

void dynamics_character_instance_commit_params(KesshoDynamicsCharacterInstance* instance);
void dynamics_character_instance_process_block(KesshoDynamicsCharacterInstance* instance, int block_size);

#ifdef __cplusplus
}
#endif

#endif
