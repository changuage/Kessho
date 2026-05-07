// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoCapacitorMidiRouting",
    platforms: [.iOS(.v17)],
    products: [
        .library(
            name: "KesshoCapacitorMidiRouting",
            targets: ["KesshoCapacitorMidiRouting"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.0")
    ],
    targets: [
        .target(
            name: "KesshoCapacitorMidiRouting",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/KesshoMIDIRouting"
        )
    ]
)
