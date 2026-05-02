#ifndef KESSHO_DYNAMICS_DEGRADE_H
#define KESSHO_DYNAMICS_DEGRADE_H

#ifdef __cplusplus
extern "C" {
#endif

#define KESSHO_DYNAMICS_DEGRADE_MAX_BLOCK_SIZE 128

int dynamics_degrade_init(float sample_rate);
void dynamics_degrade_destroy(void);

float* dynamics_degrade_get_input_ptr(void);
float* dynamics_degrade_get_output_ptr(void);

void dynamics_degrade_set_params(
    int enabled,
    float mix,
    float alias,
    float generation,
    float corrosion,
    float wear
);

void dynamics_degrade_process_block(int block_size);

#ifdef __cplusplus
}
#endif

#endif
