#ifndef KESSHO_DYNAMICS_CHARACTER_H
#define KESSHO_DYNAMICS_CHARACTER_H

#ifdef __cplusplus
extern "C" {
#endif

#define KESSHO_DYNAMICS_CHARACTER_MAX_BLOCK_SIZE 128
#define KESSHO_DYNAMICS_CHARACTER_PARAM_COUNT 82

int dynamics_character_init(float sample_rate);
void dynamics_character_destroy(void);

float* dynamics_character_get_input_ptr(void);
float* dynamics_character_get_output_ptr(void);
float* dynamics_character_get_params_ptr(void);

void dynamics_character_commit_params(void);
void dynamics_character_process_block(int block_size);

#ifdef __cplusplus
}
#endif

#endif
