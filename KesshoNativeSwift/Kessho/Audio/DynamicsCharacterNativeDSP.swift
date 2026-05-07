import Foundation

#if canImport(KesshoDSP)
import KesshoDSP
#endif

/// Thin Swift wrapper for the shared C++ Dynamics Character DSP.
///
/// The live AVAudioEngine graph uses this to run the same C++ core that powers
/// the web WASM worklet.
final class DynamicsCharacterNativeDSP {
    private var initialized = false

    var isAvailable: Bool {
        true
    }

    func initialize(sampleRate: Float) -> Bool {
        destroy()
        initialized = dynamics_character_init(sampleRate) == 0
        return initialized
    }

    func inputPointer() -> UnsafeMutablePointer<Float>? {
        guard initialized else { return nil }
        return dynamics_character_get_input_ptr()
    }

    func outputPointer() -> UnsafeMutablePointer<Float>? {
        guard initialized else { return nil }
        return dynamics_character_get_output_ptr()
    }

    func paramsPointer() -> UnsafeMutablePointer<Float>? {
        guard initialized else { return nil }
        return dynamics_character_get_params_ptr()
    }

    func commitParams() {
        guard initialized else { return }
        dynamics_character_commit_params()
    }

    func process(blockSize: Int32) {
        guard initialized else { return }
        dynamics_character_process_block(blockSize)
    }

    func destroy() {
        if initialized {
            dynamics_character_destroy()
            initialized = false
        }
    }

    deinit {
        destroy()
    }
}
