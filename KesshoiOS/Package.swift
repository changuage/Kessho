// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoNativeCore",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(
            name: "KesshoNativeCore",
            targets: ["KesshoNativeCore"]
        )
    ],
    targets: [
        .target(
            name: "KesshoNativeCore",
            path: "Kessho",
            exclude: [
                "Assets.xcassets",
                "ContentView.swift",
                "Info.plist",
                "KesshoApp.swift",
                "MIDI",
                "Presets",
                "Views",
            ],
            sources: [
                "Audio",
                "Harmony",
                "Services",
                "State/SliderState.swift",
            ]
        )
    ]
)
