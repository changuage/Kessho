#ifndef KESSHO_DYNAMICS_DRIFT_H
#define KESSHO_DYNAMICS_DRIFT_H

#ifdef __cplusplus
extern "C" {
#endif

#define KESSHO_DYNAMICS_DRIFT_MAX_BLOCK_SIZE 128
#define KESSHO_DYNAMICS_DRIFT_PARAM_COUNT 99
#define KESSHO_DYNAMICS_DRIFT_TELEMETRY_COUNT 22

typedef struct KesshoDynamicsDriftInstance KesshoDynamicsDriftInstance;

int dynamics_drift_init(float sample_rate);
int dynamics_drift_reset(float sample_rate);
void dynamics_drift_destroy(void);

float* dynamics_drift_get_input_ptr(void);
float* dynamics_drift_get_output_ptr(void);
float* dynamics_drift_get_params_ptr(void);
float* dynamics_drift_get_telemetry_ptr(void);

void dynamics_drift_commit_params(void);
void dynamics_drift_process_block(int block_size);

KesshoDynamicsDriftInstance* dynamics_drift_instance_create(float sample_rate);
void dynamics_drift_instance_destroy(KesshoDynamicsDriftInstance* instance);
int dynamics_drift_instance_reset(KesshoDynamicsDriftInstance* instance, float sample_rate);

float* dynamics_drift_instance_get_input_ptr(KesshoDynamicsDriftInstance* instance);
float* dynamics_drift_instance_get_output_ptr(KesshoDynamicsDriftInstance* instance);
float* dynamics_drift_instance_get_params_ptr(KesshoDynamicsDriftInstance* instance);
float* dynamics_drift_instance_get_telemetry_ptr(KesshoDynamicsDriftInstance* instance);

void dynamics_drift_instance_commit_params(KesshoDynamicsDriftInstance* instance);
void dynamics_drift_instance_process_block(KesshoDynamicsDriftInstance* instance, int block_size);

#ifdef __cplusplus
}
#endif

#endif
