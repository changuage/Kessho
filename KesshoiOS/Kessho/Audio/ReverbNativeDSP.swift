import Foundation

#if canImport(KesshoDSP)
import KesshoDSP
#endif

/// Process-wide Swift wrapper for the shared C++ reverb DSP.
///
/// The C++ engine currently owns one global reverb state, matching the native
/// graph's single shared reverb bus. This wrapper is intentionally a singleton
/// until the C++ API grows explicit instance handles.
final class ReverbNativeDSP {
    static let shared = ReverbNativeDSP()
    static let maxBlockSize = 128

    private var initialized = false
    private var initializedSampleRate: Float?

    private init() {}

    var isAvailable: Bool {
        true
    }

    func initialize(sampleRate: Float) -> Bool {
        if initialized {
            guard initializedSampleRate == sampleRate else {
                return false
            }
            return true
        }

        initialized = reverb_init(sampleRate) == 0
        initializedSampleRate = initialized ? sampleRate : nil
        return initialized
    }

    func reset(sampleRate: Float) -> Bool {
        destroy()
        return initialize(sampleRate: sampleRate)
    }

    func inputPointer() -> UnsafeMutablePointer<Float>? {
        guard initialized else { return nil }
        return reverb_get_input_ptr()
    }

    func outputPointer() -> UnsafeMutablePointer<Float>? {
        guard initialized else { return nil }
        return reverb_get_output_ptr()
    }

    func process(blockSize: Int32) {
        guard initialized else { return }
        reverb_process_block(blockSize)
    }

    func setType(_ type: ReverbNativeType) {
        guard initialized else { return }
        reverb_set_type(type.rawValue)
    }

    func setQuality(_ quality: ReverbNativeQuality) {
        guard initialized else { return }
        reverb_set_quality(quality.rawValue)
    }

    func setParameters(
        decay: Float,
        size: Float,
        damping: Float,
        diffusion: Float,
        modulation: Float,
        predelaySeconds: Float,
        width: Float
    ) {
        guard initialized else { return }
        reverb_set_params(
            clamp(decay, 0, 1),
            clamp(size, 0.5, 3),
            clamp(damping, 0, 1),
            clamp(diffusion, 0, 1),
            clamp(modulation, 0, 1),
            clamp(predelaySeconds * 1000, 0, 300),
            clamp(width, 0, 1)
        )

        let dampLow = clamp(damping * 0.35, 0, 1)
        let dampHigh = clamp(damping, 0, 1)
        reverb_set_multiband_damp(dampLow, dampHigh, 800)
    }

    func setExtendedParameters(
        shimmer: Float,
        shimmerPitch: Float,
        shimmerFeedback: Float,
        warp: Float,
        crossFeed: Float,
        transientSmooth: Float
    ) {
        guard initialized else { return }
        reverb_set_shimmer(clamp(shimmer, 0, 1), clamp(shimmerPitch, -24, 24))
        reverb_set_shimmer_feedback(clamp(shimmerFeedback, 0, 1))
        reverb_set_warp(clamp(warp, 0, 1))
        reverb_set_cross_feed(clamp(crossFeed, 0, 1))
        reverb_set_transient_smooth(clamp(transientSmooth, 0, 1))
    }

    private func destroy() {
        if initialized {
            reverb_destroy()
            initialized = false
            initializedSampleRate = nil
        }
    }

    private func clamp(_ value: Float, _ lower: Float, _ upper: Float) -> Float {
        min(max(value, lower), upper)
    }
}

enum ReverbNativeType: Int32 {
    case plate = 0
    case hall = 1
    case cathedral = 2
    case darkHall = 3
    case dattorroPlate = 4
    case dattorroShimmer = 5
}

enum ReverbNativeQuality: Int32 {
    case ultra = 0
    case balanced = 1
    case lite = 2
}
