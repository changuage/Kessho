// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoCapacitorAudioSession",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(
            name: "KesshoCapacitorAudioSession",
            targets: ["KesshoCapacitorAudioSession"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.0"),
        .package(name: "KesshoProductCore", path: "../..")
    ],
    targets: [
        .target(
            name: "KesshoCapacitorAudioSession",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "KesshoProductCore", package: "KesshoProductCore")
            ],
            path: "ios/Sources/KesshoAudioSession"
        )
    ]
)
