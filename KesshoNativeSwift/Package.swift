// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KesshoNativeCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .executable(
            name: "KesshoMac",
            targets: ["KesshoMac"]
        ),
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
                "kessho_reverb_unified.cpp",
            ],
            publicHeadersPath: "include"
        ),
        .target(
            name: "KesshoNativeCore",
            dependencies: ["KesshoDSP"],
            path: "Kessho",
            exclude: [
                "Assets.xcassets",
                "Info.plist",
                "Kessho-Bridging-Header.h",
                "KesshoApp.swift",
            ],
            sources: [
                "Audio",
                "ContentView.swift",
                "Harmony",
                "MIDI",
                "Platform",
                "Services",
                "State",
                "Views",
            ],
            resources: [
                .copy("Presets"),
            ]
        ),
        .executableTarget(
            name: "KesshoMac",
            dependencies: ["KesshoNativeCore"],
            path: "KesshoMac"
        )
    ],
    cxxLanguageStandard: .cxx17
)
