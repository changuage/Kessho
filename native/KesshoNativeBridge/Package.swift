// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoNativeBridge",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "KesshoNativeBridge",
            targets: ["KesshoNativeBridge"]
        )
    ],
    targets: [
        .target(
            name: "KesshoNativeBridge",
            path: "Sources/KesshoNativeBridge"
        ),
        .testTarget(
            name: "KesshoNativeBridgeTests",
            dependencies: ["KesshoNativeBridge"],
            path: "Tests/KesshoNativeBridgeTests"
        )
    ]
)
