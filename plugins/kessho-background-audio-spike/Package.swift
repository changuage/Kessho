// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoCapacitorBackgroundAudioSpike",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "KesshoCapacitorBackgroundAudioSpike",
            targets: ["KesshoCapacitorBackgroundAudioSpike"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.0"),
        .package(name: "KesshoNativeCore", path: "../../KesshoiOS")
    ],
    targets: [
        .target(
            name: "KesshoCapacitorBackgroundAudioSpike",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "KesshoNativeCore", package: "KesshoNativeCore")
            ],
            path: "ios/Sources/KesshoBackgroundAudio"
        )
    ]
)
