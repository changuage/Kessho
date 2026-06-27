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
        .package(name: "KesshoProductCore", path: "../.."),
        .package(name: "KesshoNativeBridge", path: "../../native/KesshoNativeBridge")
    ],
    targets: [
        .target(
            name: "KesshoCapacitorAudioSession",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "KesshoProductCore", package: "KesshoProductCore"),
                .product(name: "KesshoNativeBridge", package: "KesshoNativeBridge")
            ],
            path: "ios/Sources/KesshoAudioSession"
        )
    ]
)
