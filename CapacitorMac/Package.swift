// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoCapacitorMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(
            name: "KesshoCapacitorMac",
            targets: ["KesshoCapacitorMac"]
        )
    ],
    targets: [
        .executableTarget(
            name: "KesshoCapacitorMac",
            path: "Sources/KesshoCapacitorMac"
        )
    ]
)
