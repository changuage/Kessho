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
        .package(name: "KesshoProductCore", path: ".."),
        .package(name: "KesshoNativeBridge", path: "../native/KesshoNativeBridge"),
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.2")
    ],
    targets: [
        .executableTarget(
            name: "KesshoCapacitorMac",
            dependencies: [
                .product(name: "KesshoProductCore", package: "KesshoProductCore"),
                .product(name: "KesshoNativeBridge", package: "KesshoNativeBridge"),
                .product(name: "Sparkle", package: "Sparkle")
            ],
            path: "Sources/KesshoCapacitorMac",
            swiftSettings: [
                .interoperabilityMode(.Cxx)
            ]
        )
    ]
)
