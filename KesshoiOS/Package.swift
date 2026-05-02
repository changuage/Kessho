// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoNativeCore",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(
            name: "KesshoNativeCore",
            targets: ["KesshoNativeCore"]
        ),
        .library(
            name: "KesshoDSP",
            targets: ["KesshoDSP"]
        )
    ],
    targets: [
        .target(
            name: "KesshoDSP",
            path: "NativeDSP",
            sources: [
                "kessho_dynamics_character_unified.cpp",
            ],
            publicHeadersPath: "include"
        ),
        .target(
            name: "KesshoNativeCore",
            dependencies: ["KesshoDSP"],
            path: "Kessho",
            exclude: [
                "Assets.xcassets",
                "ContentView.swift",
                "Info.plist",
                "KesshoApp.swift",
                "MIDI",
                "Presets",
                "State/AppState.swift",
                "State/PresetManager.swift",
                "Views",
            ],
            sources: [
                "Audio",
                "Harmony",
                "Services",
                "State/SliderState.swift",
            ]
        )
    ],
    cxxLanguageStandard: .cxx17
)
