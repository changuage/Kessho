import AVFoundation
import Foundation

#if canImport(KesshoProductSchema)
import KesshoProductSchema
#endif

public enum KesshoProductAssetFlags {
    public static let loop: UInt32 = 1 << 0
    public static let piano: UInt32 = 1 << 1
    public static let soundscape: UInt32 = 1 << 2
}

public enum KesshoProductAssetIDs {
    public static let pianoBase: UInt32 = 7_200
    public static let pianoBaseMidi: Int = 21
    public static let pianoSampleCount: Int = 64
    public static let defaultPianoMidi: Int = 60
    public static let defaultPiano: UInt32 = pianoAssetId(forMidi: defaultPianoMidi)
    public static let defaultSoundscape: UInt32 = 7_101
    public static let birdsSoundscape: UInt32 = 7_102
    public static let frogsSoundscape: UInt32 = 7_103
    public static let waterSoundscape: UInt32 = 7_104
    public static let birds2Soundscape: UInt32 = 7_105
    public static let insectsSoundscape: UInt32 = 7_106

    public static func pianoAssetId(forMidi midiNote: Int) -> UInt32 {
        let clamped = max(pianoBaseMidi, min(pianoBaseMidi + pianoSampleCount - 1, midiNote))
        return pianoBase + UInt32(clamped - pianoBaseMidi + 1)
    }
}

public struct KesshoProductCoreAssetDescriptor: Equatable {
    public let id: UInt32
    public let relativePath: String
    public let flags: UInt32

    public init(id: UInt32, relativePath: String, flags: UInt32) {
        self.id = id
        self.relativePath = relativePath
        self.flags = flags
    }
}

public struct KesshoProductCoreAssetPreloadFailure: Equatable {
    public let asset: KesshoProductCoreAssetDescriptor
    public let reason: String
}

public struct KesshoProductCoreAssetPreloadReport: Equatable {
    public var attemptedAssetIds: [UInt32] = []
    public var registeredAssetIds: [UInt32] = []
    public var failures: [KesshoProductCoreAssetPreloadFailure] = []

    public var hasFailures: Bool {
        !failures.isEmpty
    }
}

public enum KesshoProductCoreAssetManifest {
    public static let assetRootEnvironmentKey = "KESSHO_PRODUCT_ASSET_ROOT"
    public static let downloadRootEnvironmentKey = "KESSHO_PRODUCT_ASSET_DOWNLOAD_ROOT"
    public static let pianoPreloadMidiNotes = [
        36,
        40,
        43,
        48,
        52,
        55,
        60,
        64,
        67,
        72,
        76,
        79,
        84,
    ]

    public static func pianoDescriptor(forMidi midiNote: Int = KesshoProductAssetIDs.defaultPianoMidi) -> KesshoProductCoreAssetDescriptor {
        let clamped = max(
            KesshoProductAssetIDs.pianoBaseMidi,
            min(KesshoProductAssetIDs.pianoBaseMidi + KesshoProductAssetIDs.pianoSampleCount - 1, midiNote)
        )
        let index = clamped - KesshoProductAssetIDs.pianoBaseMidi + 1
        let indexText = String(format: "%02d", index)
        return KesshoProductCoreAssetDescriptor(
            id: KesshoProductAssetIDs.pianoAssetId(forMidi: clamped),
            relativePath: "Piano/piano_\(indexText).ogg",
            flags: KesshoProductAssetFlags.piano
        )
    }

    public static var pianoPreloadDescriptors: [KesshoProductCoreAssetDescriptor] {
        var seen = Set<UInt32>()
        return pianoPreloadMidiNotes.compactMap { midiNote in
            let descriptor = pianoDescriptor(forMidi: midiNote)
            guard seen.insert(descriptor.id).inserted else {
                return nil
            }
            return descriptor
        }
    }

    public static let oceanSoundscape = KesshoProductCoreAssetDescriptor(
        id: KesshoProductAssetIDs.defaultSoundscape,
        relativePath: "Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg",
        flags: KesshoProductAssetFlags.loop | KesshoProductAssetFlags.soundscape
    )

    public static let waterSoundscape = KesshoProductCoreAssetDescriptor(
        id: KesshoProductAssetIDs.waterSoundscape,
        relativePath: "Ghetary-Waves-Rocks_cl-normalized.ogg",
        flags: KesshoProductAssetFlags.loop | KesshoProductAssetFlags.soundscape
    )

    public static let birdsSoundscape = KesshoProductCoreAssetDescriptor(
        id: KesshoProductAssetIDs.birdsSoundscape,
        relativePath: "Alps Birds_441_m_normalized.ogg",
        flags: KesshoProductAssetFlags.loop | KesshoProductAssetFlags.soundscape
    )

    public static let birds2Soundscape = KesshoProductCoreAssetDescriptor(
        id: KesshoProductAssetIDs.birds2Soundscape,
        relativePath: "Fujian Birds 2_441_m_normalized.ogg",
        flags: KesshoProductAssetFlags.loop | KesshoProductAssetFlags.soundscape
    )

    public static let frogsSoundscape = KesshoProductCoreAssetDescriptor(
        id: KesshoProductAssetIDs.frogsSoundscape,
        relativePath: "Fujian_Frogs_m_441_normalized.ogg",
        flags: KesshoProductAssetFlags.loop | KesshoProductAssetFlags.soundscape
    )

    public static let insectsSoundscape = KesshoProductCoreAssetDescriptor(
        id: KesshoProductAssetIDs.insectsSoundscape,
        relativePath: "Alps Birds 2_noiseremoval_441_m.ogg",
        flags: KesshoProductAssetFlags.loop | KesshoProductAssetFlags.soundscape
    )

    public static var soundscapeAssets: [KesshoProductCoreAssetDescriptor] {
        [
            oceanSoundscape,
            waterSoundscape,
            birdsSoundscape,
            birds2Soundscape,
            frogsSoundscape,
            insectsSoundscape,
        ]
    }

    public static var startupAssets: [KesshoProductCoreAssetDescriptor] {
        pianoPreloadDescriptors + soundscapeAssets
    }
}

public struct KesshoDecodedProductAsset {
    public let id: UInt32
    public let pcm: [Float]
    public let frameCount: UInt32
    public let channelCount: UInt32
    public let sampleRate: Double
    public let flags: UInt32

    public init(
        id: UInt32,
        pcm: [Float],
        frameCount: UInt32,
        channelCount: UInt32,
        sampleRate: Double,
        flags: UInt32
    ) {
        self.id = id
        self.pcm = pcm
        self.frameCount = frameCount
        self.channelCount = channelCount
        self.sampleRate = sampleRate
        self.flags = flags
    }
}

public enum KesshoProductAssetDecodeError: Error {
    case assetNotFound(String)
    case unsupportedFormat
    case emptyBuffer
    case conversionFailed
}

public enum KesshoProductCoreAssetProvider {
    private final class BundleToken {}

    public static func assetURL(relativePath: String) -> URL? {
        let normalizedPath = relativePath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let fileManager = FileManager.default

        let bundles: [Bundle] = [
            Bundle.main,
            Bundle(for: BundleToken.self),
        ]

        for bundle in bundles {
            if let resourceURL = bundle.resourceURL {
                for baseName in ["samples", "Samples", ""] {
                    let baseURL = baseName.isEmpty ? resourceURL : resourceURL.appendingPathComponent(baseName)
                    if let url = existingFile(appendingRelativePath(normalizedPath, to: baseURL), fileManager: fileManager) {
                        return url
                    }
                }
            }

            let pathURL = URL(fileURLWithPath: normalizedPath)
            let fileName = pathURL.deletingPathExtension().lastPathComponent
            let fileExtension = pathURL.pathExtension.isEmpty ? nil : pathURL.pathExtension
            let subdirectory = pathURL.deletingLastPathComponent().relativePath
            let subdirectories = [
                subdirectory,
                "samples/\(subdirectory)",
                "Samples/\(subdirectory)",
            ].filter { !$0.isEmpty && $0 != "." }
            for subdirectory in subdirectories {
                if let url = bundle.url(forResource: fileName, withExtension: fileExtension, subdirectory: subdirectory),
                   existingFile(url, fileManager: fileManager) != nil {
                    return url
                }
            }
            if let url = bundle.url(forResource: fileName, withExtension: fileExtension),
               existingFile(url, fileManager: fileManager) != nil {
                return url
            }
        }

        if let configuredRoot = ProcessInfo.processInfo.environment[KesshoProductCoreAssetManifest.assetRootEnvironmentKey],
           !configuredRoot.isEmpty {
            let rootURL = URL(fileURLWithPath: configuredRoot)
            if let url = existingFile(appendingRelativePath(normalizedPath, to: rootURL), fileManager: fileManager) {
                return url
            }
        }

        if let downloadRoot = ProcessInfo.processInfo.environment[KesshoProductCoreAssetManifest.downloadRootEnvironmentKey],
           !downloadRoot.isEmpty {
            let rootURL = URL(fileURLWithPath: downloadRoot)
            if let url = existingFile(appendingRelativePath(normalizedPath, to: rootURL), fileManager: fileManager) {
                return url
            }
        }

        for rootURL in downloadedAssetSearchRoots(fileManager: fileManager) {
            if let url = existingFile(appendingRelativePath(normalizedPath, to: rootURL), fileManager: fileManager) {
                return url
            }
        }

        for rootURL in developmentSearchRoots(fileManager: fileManager) {
            if let url = existingFile(appendingRelativePath("public/samples/\(normalizedPath)", to: rootURL), fileManager: fileManager) {
                return url
            }
        }

        return nil
    }

    public static func decodedAsset(
        id: UInt32,
        from buffer: AVAudioPCMBuffer,
        flags: UInt32
    ) throws -> KesshoDecodedProductAsset {
        guard buffer.frameLength > 0 else {
            throw KesshoProductAssetDecodeError.emptyBuffer
        }
        guard let floatChannels = buffer.floatChannelData else {
            throw KesshoProductAssetDecodeError.unsupportedFormat
        }

        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(min(buffer.format.channelCount, 2))
        guard channelCount > 0 else {
            throw KesshoProductAssetDecodeError.unsupportedFormat
        }

        var interleaved = Array(repeating: Float(0), count: frameCount * channelCount)
        for frame in 0..<frameCount {
            for channel in 0..<channelCount {
                interleaved[frame * channelCount + channel] = floatChannels[channel][frame]
            }
        }

        return KesshoDecodedProductAsset(
            id: id,
            pcm: interleaved,
            frameCount: UInt32(frameCount),
            channelCount: UInt32(channelCount),
            sampleRate: buffer.format.sampleRate,
            flags: flags
        )
    }

    public static func decodedAsset(
        id: UInt32,
        from url: URL,
        flags: UInt32
    ) throws -> KesshoDecodedProductAsset {
        let file = try AVAudioFile(forReading: url)
        let frameCapacity = AVAudioFrameCount(min(file.length, AVAudioFramePosition(UInt32.max)))
        guard frameCapacity > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frameCapacity) else {
            throw KesshoProductAssetDecodeError.emptyBuffer
        }
        try file.read(into: buffer)
        return try decodedAsset(id: id, from: buffer, flags: flags)
    }

    public static func decodedAsset(
        descriptor: KesshoProductCoreAssetDescriptor
    ) throws -> KesshoDecodedProductAsset {
        guard let url = assetURL(relativePath: descriptor.relativePath) else {
            throw KesshoProductAssetDecodeError.assetNotFound(descriptor.relativePath)
        }
        return try decodedAsset(id: descriptor.id, from: url, flags: descriptor.flags)
    }

    private static func existingFile(_ url: URL, fileManager: FileManager) -> URL? {
        fileManager.fileExists(atPath: url.path) ? url : nil
    }

    private static func appendingRelativePath(_ relativePath: String, to baseURL: URL) -> URL {
        relativePath.split(separator: "/").reduce(baseURL) { url, component in
            url.appendingPathComponent(String(component))
        }
    }

    private static func downloadedAssetSearchRoots(fileManager: FileManager) -> [URL] {
        let directoryNames = [
            "Kessho/ProductAssets",
            "Kessho/ProductCoreAssets",
        ]
        let baseDirectories = [
            FileManager.SearchPathDirectory.applicationSupportDirectory,
            FileManager.SearchPathDirectory.cachesDirectory,
        ]
        var roots: [URL] = []
        for directory in baseDirectories {
            for baseURL in fileManager.urls(for: directory, in: .userDomainMask) {
                for directoryName in directoryNames {
                    roots.append(appendingRelativePath(directoryName, to: baseURL))
                }
            }
        }
        return roots
    }

    private static func developmentSearchRoots(fileManager: FileManager) -> [URL] {
        let currentDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath)
        let sourceDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()

        var roots: [URL] = []
        for seed in [currentDirectory, sourceDirectory] {
            var cursor = seed
            for _ in 0..<8 {
                roots.append(cursor)
                let parent = cursor.deletingLastPathComponent()
                if parent.path == cursor.path {
                    break
                }
                cursor = parent
            }
        }
        return roots
    }
}

public extension KesshoProductCore {
    @discardableResult
    func registerDecodedAsset(_ asset: KesshoDecodedProductAsset) throws -> Int32 {
        try registerInterleavedAsset(
            id: asset.id,
            pcm: asset.pcm,
            frameCount: asset.frameCount,
            channelCount: asset.channelCount,
            sampleRate: asset.sampleRate,
            flags: asset.flags
        )
    }

    @discardableResult
    func registerDecodedAsset(
        descriptor: KesshoProductCoreAssetDescriptor
    ) throws -> Int32 {
        let asset = try KesshoProductCoreAssetProvider.decodedAsset(descriptor: descriptor)
        return try registerDecodedAsset(asset)
    }

    @discardableResult
    func registerDecodedAsset(
        id assetId: UInt32,
        buffer: AVAudioPCMBuffer,
        flags: UInt32
    ) throws -> Int32 {
        let asset = try KesshoProductCoreAssetProvider.decodedAsset(
            id: assetId,
            from: buffer,
            flags: flags
        )
        return try registerDecodedAsset(asset)
    }

    @discardableResult
    func registerDecodedAsset(
        id assetId: UInt32,
        url: URL,
        flags: UInt32
    ) throws -> Int32 {
        let asset = try KesshoProductCoreAssetProvider.decodedAsset(
            id: assetId,
            from: url,
            flags: flags
        )
        return try registerDecodedAsset(asset)
    }
}

public extension KesshoProductCoreAudioEngine {
    @discardableResult
    func registerDecodedAsset(_ asset: KesshoDecodedProductAsset) throws -> Int32 {
        let result = try productCore.registerDecodedAsset(asset)
        if result == 1 {
            markAssetRegistered(asset.id)
        }
        return result
    }

    @discardableResult
    func registerDecodedAsset(
        id assetId: UInt32,
        buffer: AVAudioPCMBuffer,
        flags: UInt32
    ) throws -> Int32 {
        let result = try productCore.registerDecodedAsset(id: assetId, buffer: buffer, flags: flags)
        if result == 1 {
            markAssetRegistered(assetId)
        }
        return result
    }

    @discardableResult
    func registerDecodedAsset(
        id assetId: UInt32,
        url: URL,
        flags: UInt32
    ) throws -> Int32 {
        let result = try productCore.registerDecodedAsset(id: assetId, url: url, flags: flags)
        if result == 1 {
            markAssetRegistered(assetId)
        }
        return result
    }

    @discardableResult
    func registerDecodedAsset(
        descriptor: KesshoProductCoreAssetDescriptor
    ) throws -> Int32 {
        if isAssetRegistered(descriptor.id) {
            return 1
        }
        let result = try productCore.registerDecodedAsset(descriptor: descriptor)
        if result == 1 {
            markAssetRegistered(descriptor.id)
        }
        return result
    }

    @discardableResult
    func preloadStartupAssets() -> KesshoProductCoreAssetPreloadReport {
        preloadAssets(KesshoProductCoreAssetManifest.startupAssets)
    }

    @discardableResult
    func preloadAssets(
        _ descriptors: [KesshoProductCoreAssetDescriptor]
    ) -> KesshoProductCoreAssetPreloadReport {
        var report = KesshoProductCoreAssetPreloadReport()
        for descriptor in descriptors {
            report.attemptedAssetIds.append(descriptor.id)
            if isAssetRegistered(descriptor.id) {
                report.registeredAssetIds.append(descriptor.id)
                continue
            }

            do {
                let result = try registerDecodedAsset(descriptor: descriptor)
                if result == 1 {
                    report.registeredAssetIds.append(descriptor.id)
                } else {
                    report.failures.append(
                        KesshoProductCoreAssetPreloadFailure(
                            asset: descriptor,
                            reason: "C++ registration failed with result \(result)"
                        )
                    )
                }
            } catch {
                report.failures.append(
                    KesshoProductCoreAssetPreloadFailure(
                        asset: descriptor,
                        reason: String(describing: error)
                    )
                )
            }
        }
        return report
    }
}
