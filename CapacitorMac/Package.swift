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
    dependencies: [
        .package(name: "KesshoProductCore", path: "..")
    ],
    targets: [
        .executableTarget(
            name: "KesshoCapacitorMac",
            dependencies: [
                .product(name: "KesshoProductCore", package: "KesshoProductCore")
            ],
            path: "Sources/KesshoCapacitorMac"
        )
    ]
)
